export type PhysicalEffectorPath3D = {
  mode: "arc";
  plane: "horizontal" | "vertical";
  heightMeters: number;
  side?: -1 | 1;
};

/** Samples one deterministic smooth path in the drive's live travel frame. */
export function samplePhysicalEffectorPath3D(options: {
  path?: Readonly<PhysicalEffectorPath3D>;
  direction: readonly [number, number, number];
  distanceMeters: number;
  progress: number;
  durationSeconds: number;
}) {
  const direction = normalized(options.direction, "physical effector path direction"), progress = Math.max(0, Math.min(1, options.progress)), duration = positive(options.durationSeconds, "physical effector path duration"), distance = positive(options.distanceMeters, "physical effector path distance");
  const linear = progress * progress * (3 - 2 * progress), linearSpeed = distance / duration * 6 * progress * (1 - progress);
  if (!options.path) return { offset: scale(direction, distance * linear), velocity: scale(direction, linearSpeed) };
  validatePhysicalEffectorPath3D(options.path, "physical effector path");
  const axis = arcAxis(direction, options.path.plane, options.path.side ?? 1), arc = 16 * progress * progress * (1 - progress) * (1 - progress), arcSpeed = 32 * progress * (1 - progress) * (1 - 2 * progress) / duration;
  return { offset: add(scale(direction, distance * linear), scale(axis, options.path.heightMeters * arc)), velocity: add(scale(direction, linearSpeed), scale(axis, options.path.heightMeters * arcSpeed)) };
}

export function validatePhysicalEffectorPath3D(path: Readonly<PhysicalEffectorPath3D>, pointer: string): void {
  if (!path || path.mode !== "arc") throw new TypeError(`Physical effector path mode is unsupported. Project pointer: ${pointer}/mode. Choose arc.`);
  if (path.plane !== "horizontal" && path.plane !== "vertical") throw new TypeError(`Physical effector path plane is unsupported. Project pointer: ${pointer}/plane. Choose horizontal or vertical.`);
  if (!(Number.isFinite(path.heightMeters) && path.heightMeters > 0 && path.heightMeters <= 10)) throw new RangeError(`Physical effector path heightMeters must be from 0.001 through 10. Project pointer: ${pointer}/heightMeters.`);
  if (path.side !== undefined && path.side !== -1 && path.side !== 1) throw new RangeError(`Physical effector path side must be -1 or 1. Project pointer: ${pointer}/side.`);
}

/** Returns the actual peak velocity needed by the combined linear and arc path. */
export function requiredPhysicalEffectorPeakSpeed3D(options: { path?: Readonly<PhysicalEffectorPath3D>; direction: readonly [number, number, number]; distanceMeters: number; durationSeconds: number }) {
  let maximum = 0;
  for (let index = 0; index <= 256; index += 1) maximum = Math.max(maximum, length(samplePhysicalEffectorPath3D({ ...options, progress: index / 256 }).velocity));
  return maximum;
}

function arcAxis(direction: readonly [number, number, number], plane: PhysicalEffectorPath3D["plane"], side: number): [number, number, number] {
  const up: [number, number, number] = [0, 1, 0];
  let axis = plane === "horizontal" ? cross(up, direction) : subtract(up, scale(direction, dot(up, direction)));
  if (length(axis) <= 1e-9) axis = plane === "horizontal" ? cross([0, 0, 1], direction) : cross(direction, [1, 0, 0]);
  return scale(normalized(axis, "physical effector arc axis"), side);
}
function add(left: readonly number[], right: readonly number[]): [number, number, number] { return [left[0]! + right[0]!, left[1]! + right[1]!, left[2]! + right[2]!]; }
function subtract(left: readonly number[], right: readonly number[]): [number, number, number] { return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!]; }
function scale(value: readonly number[], amount: number): [number, number, number] { return [value[0]! * amount, value[1]! * amount, value[2]! * amount]; }
function cross(left: readonly number[], right: readonly number[]): [number, number, number] { return [left[1]! * right[2]! - left[2]! * right[1]!, left[2]! * right[0]! - left[0]! * right[2]!, left[0]! * right[1]! - left[1]! * right[0]!]; }
function dot(left: readonly number[], right: readonly number[]) { return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!; }
function length(value: readonly number[]) { return Math.hypot(value[0]!, value[1]!, value[2]!); }
function normalized(value: readonly [number, number, number], label: string): [number, number, number] { const magnitude = length(value); if (magnitude <= 1e-12) throw new RangeError(`${label} must be non-zero.`); return scale(value, 1 / magnitude); }
function positive(value: number, label: string) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`); return value; }
