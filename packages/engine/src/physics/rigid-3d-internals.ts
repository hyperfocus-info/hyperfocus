export const RIGID_DEBUG_SEGMENT_STRIDE_3D = 7;
export const RIGID_DEBUG_STATIC_3D = 0;
export const RIGID_DEBUG_DYNAMIC_3D = 1;
export const RIGID_DEBUG_KINEMATIC_3D = 2;
export const RIGID_DEBUG_TRIGGER_3D = 3;
export const RIGID_DEBUG_CONTACT_3D = 4;

export const TYPE_STATIC = 0;
export const TYPE_DYNAMIC = 1;
export const TYPE_KINEMATIC = 2;
export const SHAPE_SPHERE = 0;
export const SHAPE_BOX = 1;
export const FLAG_TRIGGER = 1;
export const FLAG_CONTINUOUS = 2;
export const DEFAULT_LAYER = 1;
export const DEFAULT_MASK = 0xffff_ffff;
export const HANDLE_STRIDE = 65_536;
export const MAX_GENERATION = 0xffff_ffff;
export const POSITION_SLOP = 1e-5;
export const POSITION_PERCENT = 0.8;
export const CCD_EPSILON = 1e-8;
export const MAX_ABSOLUTE_SCALAR = 1e12;
export const MIN_POSITIVE_SCALAR = 1e-12;

export type ContactScratch = {
  normalX: number;
  normalY: number;
  normalZ: number;
  penetration: number;
  pointX: number;
  pointY: number;
  pointZ: number;
};

export type SweepScratch = { time: number; normalX: number; normalY: number; normalZ: number };

export function rayAabbUnit(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
  output: SweepScratch,
): boolean {
  if (ox >= minX && ox <= maxX && oy >= minY && oy <= maxY && oz >= minZ && oz <= maxZ) {
    const length = Math.hypot(dx, dy, dz) || 1;
    output.time = 0; output.normalX = -dx / length; output.normalY = -dy / length; output.normalZ = -dz / length;
    return true;
  }
  let entry = 0; let exit = 1; let nx = 0; let ny = 0; let nz = 0;
  const axis = (origin: number, delta: number, minimum: number, maximum: number, axisX: number, axisY: number, axisZ: number) => {
    if (Math.abs(delta) <= CCD_EPSILON) return origin >= minimum && origin <= maximum;
    let near = (minimum - origin) / delta; let far = (maximum - origin) / delta;
    let sign = -1;
    if (near > far) { const swap = near; near = far; far = swap; sign = 1; }
    if (near > entry) { entry = near; nx = axisX * sign; ny = axisY * sign; nz = axisZ * sign; }
    exit = Math.min(exit, far);
    return entry <= exit;
  };
  if (!axis(ox, dx, minX, maxX, 1, 0, 0) || !axis(oy, dy, minY, maxY, 0, 1, 0) || !axis(oz, dz, minZ, maxZ, 0, 0, 1) || entry < 0 || entry > 1) return false;
  output.time = entry; output.normalX = nx; output.normalY = ny; output.normalZ = nz;
  return true;
}

export function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.length > 256 || new TextEncoder().encode(value).byteLength > 256 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} must be non-empty bounded text without control characters.`);
  return value;
}

export function booleanOption(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean.`);
  return value;
}

export function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

export function finite(value: number, label: string): number {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_ABSOLUTE_SCALAR) throw new RangeError(`${label} must be finite with magnitude no greater than ${MAX_ABSOLUTE_SCALAR}.`);
  return value;
}

export function positive(value: number, label: string): number {
  value = finite(value, label);
  if (value < MIN_POSITIVE_SCALAR) throw new RangeError(`${label} must be at least ${MIN_POSITIVE_SCALAR}.`);
  return value;
}

export function nonnegative(value: number, label: string): number {
  value = finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be non-negative.`);
  return value;
}

export function interval(value: number, minimum: number, maximum: number, label: string): number {
  value = finite(value, label);
  if (value < minimum || value > maximum) throw new RangeError(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

export function uint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be a uint32 integer.`);
  return value >>> 0;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
