import { segmentBoxDistance } from '../../physics/collision3d/segment-box.ts';
import { segmentDistance } from '../../physics/collision3d/geometry.ts';
import { invertQuaternion, multiplyQuaternions, normalizeQuaternion } from '../math.ts';

export type PoseSafetyVector = readonly [number, number, number];
export type PoseSafetyRotation = readonly [number, number, number, number];
/** Axis and reference are joint-local calibration, never inferred from a world axis. */
export type SignedJointEnvelope = {
  axis: PoseSafetyVector;
  reference: PoseSafetyRotation;
  minRadians: number;
  maxRadians: number;
  maxOffAxisRadians: number;
};
export type PoseSafetyFinding = { code: 'joint-direction' | 'joint-plane' | 'limb-length' | 'limb-collision'; subject: string; actual: number; limit: number; message: string };

export function measureJointRotation(rotation: ArrayLike<number>, reference: ArrayLike<number>, axis: ArrayLike<number>) {
  const inverse = new Float32Array(4), delta = new Float32Array(4);
  invertQuaternion(reference, inverse); multiplyQuaternions(inverse, rotation, delta); normalizeQuaternion(delta, delta);
  if (delta[3]! < 0) for (let i = 0; i < 4; i++) delta[i] = -delta[i]!;
  const projection = delta[0]! * axis[0]! + delta[1]! * axis[1]! + delta[2]! * axis[2]!;
  const norm = Math.hypot(projection, delta[3]!);
  return { angle: norm < 1e-8 ? 0 : 2 * Math.atan2(projection / norm, delta[3]! / norm), offAxis: 2 * Math.acos(Math.min(1, norm)) };
}

/** Inspect without clamping: a repaired angle may invalidate a locked hand or foot. */
export function inspectSignedJoint(subject: string, rotation: ArrayLike<number>, envelope: SignedJointEnvelope): PoseSafetyFinding[] {
  const axis = envelope.axis, length = Math.hypot(...axis);
  if (![...axis, ...envelope.reference, envelope.minRadians, envelope.maxRadians, envelope.maxOffAxisRadians].every(Number.isFinite)
    || Math.abs(length - 1) > 1e-4 || envelope.minRadians > envelope.maxRadians || envelope.minRadians < -Math.PI
    || envelope.maxRadians > Math.PI || envelope.maxOffAxisRadians < 0 || envelope.maxOffAxisRadians > Math.PI
    || Math.abs(Math.hypot(...envelope.reference) - 1) > 1e-4) throw Error(`${subject}: invalid joint calibration`);
  if (rotation.length !== 4 || Array.from(rotation).some(v => !Number.isFinite(v)) || Math.abs(Math.hypot(...Array.from(rotation)) - 1) > 1e-3) throw Error(`${subject}: invalid joint rotation`);
  const { angle, offAxis } = measureJointRotation(rotation, envelope.reference, axis);
  const findings: PoseSafetyFinding[] = [];
  const tolerance = 1e-4;
  if (angle < envelope.minRadians - tolerance || angle > envelope.maxRadians + tolerance) {
    const limit = angle < envelope.minRadians ? envelope.minRadians : envelope.maxRadians;
    findings.push({ code: 'joint-direction', subject, actual: angle, limit, message: `${subject}: signed bend ${(angle * 180 / Math.PI).toFixed(1)}° leaves calibrated range ${(envelope.minRadians * 180 / Math.PI).toFixed(1)}°–${(envelope.maxRadians * 180 / Math.PI).toFixed(1)}°. Re-solve the action with its hand/foot contacts preserved.` });
  }
  if (offAxis > envelope.maxOffAxisRadians + tolerance) findings.push({ code: 'joint-plane', subject, actual: offAxis, limit: envelope.maxOffAxisRadians, message: `${subject}: rotation leaves its calibrated hinge plane. Repair the bend reference or restage the target.` });
  return findings;
}

export type LimbExclusionBox = { id: string; center: PoseSafetyVector; halfSize: PoseSafetyVector; rotationY?: number };
/** All positions, lengths and volumes must be in the same calibrated coordinate frame. */
export function inspectLimbGeometry(options: {
  subject: string; root: PoseSafetyVector; middle: PoseSafetyVector; end: PoseSafetyVector;
  upperLength: number; lowerLength: number; radius: number; exclusions: readonly LimbExclusionBox[]; tolerance?: number;
  bodyCapsules?: readonly { id: string; a: PoseSafetyVector; b: PoseSafetyVector; radius: number }[];
}): PoseSafetyFinding[] {
  const { subject, root, middle, end, upperLength, lowerLength, radius } = options;
  const tolerance = options.tolerance ?? .002;
  if (![...root, ...middle, ...end, upperLength, lowerLength, radius, tolerance].every(Number.isFinite)
    || upperLength <= 0 || lowerLength <= 0 || radius < 0 || tolerance < 0) throw Error(`${subject}: invalid limb calibration`);
  const findings: PoseSafetyFinding[] = [];
  const upperError = Math.abs(Math.hypot(...middle.map((v, i) => v - root[i]!)) - upperLength);
  const lowerError = Math.abs(Math.hypot(...end.map((v, i) => v - middle[i]!)) - lowerLength);
  if (Math.max(upperError, lowerError) > tolerance) findings.push({ code: 'limb-length', subject, actual: Math.max(upperError, lowerError), limit: tolerance, message: `${subject}: evaluated limb length changed; repair segment binding or scale before animation.` });
  for (const box of options.exclusions) {
    if (![...box.center, ...box.halfSize, box.rotationY ?? 0].every(Number.isFinite) || box.halfSize.some(v => v <= 0)) throw Error(`${subject}: invalid exclusion box`);
    // Authoring inspection needs no deterministic simulation trigonometry table.
    const cosine = Math.cos(box.rotationY ?? 0), sine = Math.sin(box.rotationY ?? 0);
    const local = (p: PoseSafetyVector): PoseSafetyVector => { const x = p[0] - box.center[0], z = p[2] - box.center[2]; return [cosine * x + sine * z, p[1] - box.center[1], -sine * x + cosine * z]; };
    if ([root, middle].some((a, i) => segmentBoxDistance(local(a), local(i === 0 ? middle : end), box.halfSize) <= radius ** 2)) {
      findings.push({ code: 'limb-collision', subject, actual: 1, limit: 0, message: `${subject}: evaluated limb intersects ${box.id}. Change the bend plane or actor/target placement while preserving required contacts.` });
    }
  }
  for (const body of options.bodyCapsules ?? []) {
    if (![...body.a, ...body.b, body.radius].every(Number.isFinite) || body.radius <= 0) throw Error(`${subject}: invalid body capsule`);
    if ([root, middle].some((a, i) => segmentDistance(a, i === 0 ? middle : end, body.a, body.b) < (radius + body.radius) ** 2)) {
      findings.push({ code: 'limb-collision', subject, actual: 1, limit: 0, message: `${subject}: evaluated limb intersects ${body.id}. Change the bend plane or restage the target while preserving required contacts.` });
    }
  }
  return findings;
}
