export type PhysicalEffectorTrajectoryPlan3D = {
  targetFrom: [number, number, number];
  contactTarget: [number, number, number];
  targetTo: [number, number, number];
  pole: [number, number, number];
  contactVelocity: [number, number, number];
  strikeStartOffsetFrames: number;
  strikeFrames: number;
  followThroughFrames: number;
  chainLength: number;
  maximumReach: number;
};

/** Converts compact contact displacement and velocity into a reachable two-bone motor path. */
export function planPhysicalEffectorTrajectory3D(options: {
  root: readonly [number, number, number];
  middle: readonly [number, number, number];
  end: readonly [number, number, number];
  contactDisplacement: readonly [number, number, number];
  contactVelocity: readonly [number, number, number];
  fps: number;
  anticipationFrames: number;
  requestedFollowThroughFrames: number;
  maxStretch?: number;
}): PhysicalEffectorTrajectoryPlan3D {
  const root = vector(options?.root, "trajectory root"), middle = vector(options?.middle, "trajectory middle"), end = vector(options?.end, "trajectory end");
  const displacement = vector(options?.contactDisplacement, "contact displacement"), velocity = vector(options?.contactVelocity, "contact velocity");
  const fps = positive(options?.fps, "trajectory fps"), anticipationFrames = frameCount(options?.anticipationFrames, "anticipationFrames"), requestedFollowThroughFrames = frameCount(options?.requestedFollowThroughFrames, "requestedFollowThroughFrames"), maxStretch = interval(options?.maxStretch ?? 1.05, 1, 4, "maxStretch");
  const upperLength = distance(root, middle), lowerLength = distance(middle, end); if (upperLength <= 1e-6 || lowerLength <= 1e-6) throw new RangeError("Physical effector trajectory needs two non-zero chain segments.");
  const chainLength = upperLength + lowerLength, maximumReach = chainLength * maxStretch, contact = add(end, displacement), rootToContact = subtract(contact, root), contactDistance = length(rootToContact);
  if (contactDistance > maximumReach + 1e-9) throw new RangeError(`Physical effector contact is outside the ${maximumReach.toFixed(3)} m chain reach. Move the character root at least ${(contactDistance - maximumReach).toFixed(2)} m closer, shorten the contact distance, or add authored root motion.`);
  const speed = length(velocity); if (speed <= 1e-6) throw new RangeError("Physical effector contact velocity must be non-zero."); const axis = scale(velocity, 1 / speed);
  const along = dot(rootToContact, axis), radialSquared = Math.max(0, dot(rootToContact, rootToContact) - along * along), span = Math.sqrt(Math.max(0, maximumReach * maximumReach - radialSquared));
  const availableWindup = Math.max(0, along + span), availableFollowThrough = Math.max(0, -along + span);
  const possibleStrikeFrames = Math.floor(2 * availableWindup / speed * fps + 1e-9), strikeFrames = Math.min(anticipationFrames, possibleStrikeFrames);
  if (strikeFrames < 1) throw new RangeError(`Physical effector cannot reach ${speed.toFixed(2)} m/s smoothly inside one ${fps} fps frame and its available ${availableWindup.toFixed(3)} m windup. Lower speed, increase chain reach, or add root motion.`);
  const possibleFollowThroughFrames = Math.floor(2 * availableFollowThrough / speed * fps + 1e-9), followThroughFrames = Math.min(requestedFollowThroughFrames, Math.max(0, possibleFollowThroughFrames));
  const windupDistance = .5 * speed * strikeFrames / fps, followThroughDistance = .5 * speed * followThroughFrames / fps;
  return {
    targetFrom: cleanVector(add(contact, scale(axis, -windupDistance))),
    contactTarget: cleanVector(contact),
    targetTo: cleanVector(add(contact, scale(axis, followThroughDistance))),
    pole: cleanVector(derivePole(root, middle, contact, maximumReach)),
    contactVelocity: cleanVector(velocity),
    strikeStartOffsetFrames: anticipationFrames - strikeFrames,
    strikeFrames,
    followThroughFrames,
    chainLength: clean(chainLength),
    maximumReach: clean(maximumReach),
  };
}

function derivePole(root: readonly number[], middle: readonly number[], contact: readonly number[], reach: number): [number, number, number] {
  const chainAxis = normalize(subtract(contact, root)), rootToMiddle = subtract(middle, root), projected = scale(chainAxis, dot(rootToMiddle, chainAxis)); let bend = subtract(rootToMiddle, projected);
  if (length(bend) <= 1e-6) { bend = cross(chainAxis, [0, 1, 0]); if (length(bend) <= 1e-6) bend = cross(chainAxis, [0, 0, 1]); }
  return add(root, scale(normalize(bend), reach));
}
function vector(value: readonly number[] | undefined, label: string): [number, number, number] { if (!value || value.length !== 3 || !value.every(Number.isFinite)) throw new TypeError(`${label} must have three finite components.`); return [value[0]!, value[1]!, value[2]!]; }
function frameCount(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new RangeError(`${label} must be a positive safe integer.`); return value; }
function positive(value: number, label: string) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`); return value; }
function interval(value: number, minimum: number, maximum: number, label: string) { if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be from ${minimum} through ${maximum}.`); return value; }
function add(a: readonly number[], b: readonly number[]): [number, number, number] { return [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!]; }
function subtract(a: readonly number[], b: readonly number[]): [number, number, number] { return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]; }
function scale(value: readonly number[], amount: number): [number, number, number] { return [value[0]! * amount, value[1]! * amount, value[2]! * amount]; }
function dot(a: readonly number[], b: readonly number[]) { return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!; }
function length(value: readonly number[]) { return Math.hypot(value[0]!, value[1]!, value[2]!); }
function distance(a: readonly number[], b: readonly number[]) { return length(subtract(a, b)); }
function normalize(value: readonly number[]): [number, number, number] { const magnitude = length(value); if (magnitude <= 1e-12) throw new RangeError("Physical effector trajectory direction is degenerate."); return scale(value, 1 / magnitude); }
function cross(a: readonly number[], b: readonly number[]): [number, number, number] { return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]; }
function clean(value: number) { const rounded = Math.round(value * 1e12) / 1e12; return Object.is(rounded, -0) ? 0 : rounded; }
function cleanVector(value: readonly number[]): [number, number, number] { return [clean(value[0]!), clean(value[1]!), clean(value[2]!)]; }
