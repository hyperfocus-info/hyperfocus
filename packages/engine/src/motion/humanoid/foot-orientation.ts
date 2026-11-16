import {
  multiplyQuaternions,
  quaternionFromAxisAngle,
  quaternionFromUnitVectors,
  rotateVector3ByQuaternion,
} from "../math.ts";
import type { PoseBuffer } from "../pose-buffer.ts";
import type { CompiledSemanticRig } from "../rig.ts";
import type { FootPlantResult } from "../solvers/foot-plant.ts";
import {
  applyWorldRotationDelta,
  evaluateWorldPose,
  type WorldPose,
} from "../solvers/world-pose.ts";

const UP = new Float32Array([0, 1, 0]);

/**
 * Signed swing-foot pitch. Negative is the toe-down push-off quarter and
 * positive is the toe-up step-in quarter. Both contact boundaries have zero
 * angle and angular velocity, so entering or leaving a plant cannot snap.
 */
export function sampleSwingFootPitchRadians(phase: number, stanceRatio: number) {
  const normalizedPhase = ((phase % 1) + 1) % 1;
  const rawProgress = (normalizedPhase - stanceRatio) / Math.max(1e-6, 1 - stanceRatio);
  const progress = Math.max(0, Math.min(1, rawProgress));
  const swingEnvelope = Math.sin(Math.PI * progress) ** 2;
  return -Math.sin(Math.PI * 2 * progress) * swingEnvelope * .2;
}

/**
 * Metatarsal flex layered under the ankle arc. The toes roll through push-off,
 * relax during clearance, then lightly prepare for the next heel-led contact.
 */
export function sampleSwingToePitchRadians(phase: number, stanceRatio: number, planted = false) {
  if (planted) return 0;
  const normalizedPhase = ((phase % 1) + 1) % 1;
  const progress = Math.max(0, Math.min(1, (normalizedPhase - stanceRatio) / Math.max(1e-6, 1 - stanceRatio)));
  if (progress <= .48) {
    const push = Math.sin(Math.PI * progress / .48) ** 2;
    return push * .3;
  }
  if (progress < .58) return 0;
  const prepare = Math.sin(Math.PI * (progress - .58) / .42) ** 2;
  return prepare * .075;
}

/**
 * Flexes a semantic toe around the evaluated heel-to-toe hinge. Positive pitch
 * raises the toe. Deriving the hinge in world space keeps this portable across
 * rigs whose imported toe bone does not use local X as its bend axis.
 */
export function applyToePitch(
  rig: CompiledSemanticRig,
  footIndex: number,
  toesIndex: number,
  soleNormalLocal: ArrayLike<number>,
  soleForwardLocal: ArrayLike<number>,
  pitch: number,
  pose: PoseBuffer,
  world: WorldPose,
  quaternion: Float32Array,
  normal: Float32Array,
  forward: Float32Array,
  hinge: Float32Array,
) {
  if (footIndex < 0 || toesIndex < 0 || Math.abs(pitch) <= 1e-8) return;
  evaluateWorldPose(rig, pose, world);
  const rotationOffset = footIndex * 4;
  quaternion[0] = world.rotations[rotationOffset];
  quaternion[1] = world.rotations[rotationOffset + 1];
  quaternion[2] = world.rotations[rotationOffset + 2];
  quaternion[3] = world.rotations[rotationOffset + 3];
  rotateVector3ByQuaternion(soleNormalLocal, quaternion, normal);
  rotateVector3ByQuaternion(soleForwardLocal, quaternion, forward);
  // forward x normal points along the hinge in the direction for which a
  // positive angle raises the front of a conventional +Z-facing foot.
  hinge[0] = forward[1] * normal[2] - forward[2] * normal[1];
  hinge[1] = forward[2] * normal[0] - forward[0] * normal[2];
  hinge[2] = forward[0] * normal[1] - forward[1] * normal[0];
  const length = Math.hypot(hinge[0], hinge[1], hinge[2]);
  if (length <= 1e-8) return;
  hinge[0] /= length;
  hinge[1] /= length;
  hinge[2] /= length;
  quaternionFromAxisAngle(hinge, pitch, quaternion);
  applyWorldRotationDelta(rig, pose, world, toesIndex, quaternion);
}

export function alignFootToContact(
  rig: CompiledSemanticRig,
  footIndex: number,
  soleNormalLocal: ArrayLike<number>,
  soleForwardLocal: ArrayLike<number>,
  result: FootPlantResult | null,
  phase: number,
  stanceRatio: number,
  localTravelDirection: ArrayLike<number>,
  facing: { x: number; y: number; z: number },
  swingPitchOverride: number | undefined,
  pose: PoseBuffer,
  world: WorldPose,
  quaternion: Float32Array,
  twistQuaternion: Float32Array,
  currentUp: Float32Array,
  desiredUp: Float32Array,
  currentForward: Float32Array,
  alignedForward: Float32Array,
  desiredForward: Float32Array,
  smoothedUp: Float32Array,
  smoothedUpVelocity: Float32Array,
  smoothedForward: Float32Array,
  smoothedForwardVelocity: Float32Array,
  response: number,
  deltaSeconds: number,
) {
  if (footIndex < 0 || !result) return;
  evaluateWorldPose(rig, pose, world);
  const offset = footIndex * 4;
  quaternion[0] = world.rotations[offset];
  quaternion[1] = world.rotations[offset + 1];
  quaternion[2] = world.rotations[offset + 2];
  quaternion[3] = world.rotations[offset + 3];
  rotateVector3ByQuaternion(soleNormalLocal, quaternion, currentUp);
  rotateVector3ByQuaternion(soleForwardLocal, quaternion, currentForward);
  desiredUp.set(result.hit ? result.groundNormal : UP);
  if (!result.planted) {
    // Toe-off and heel-strike meet the planted orientation with zero angular
    // velocity. A jump layer may shape an airborne foot, but a planted sole is
    // always owned by its detected terrain normal.
    const pitch = swingPitchOverride ?? sampleSwingFootPitchRadians(phase, stanceRatio);
    const forwardX = facing.z * localTravelDirection[0] + facing.x * localTravelDirection[2];
    const forwardZ = -facing.x * localTravelDirection[0] + facing.z * localTravelDirection[2];
    const cosine = Math.cos(pitch);
    const sine = Math.sin(pitch);
    desiredUp[0] = desiredUp[0] * cosine - forwardX * sine;
    desiredUp[1] *= cosine;
    desiredUp[2] = desiredUp[2] * cosine - forwardZ * sine;
  }
  const length = Math.hypot(desiredUp[0], desiredUp[1], desiredUp[2]);
  if (length <= 1e-8) return;
  desiredUp[0] /= length;
  desiredUp[1] /= length;
  desiredUp[2] /= length;
  dampUnitVector3(smoothedUp, smoothedUpVelocity, desiredUp, response, deltaSeconds);
  quaternionFromUnitVectors(currentUp, smoothedUp, quaternion);
  rotateVector3ByQuaternion(currentForward, quaternion, alignedForward);
  // Foot heading follows the body, not a one-frame collision recoil. An
  // intentional direction change turns `facing`; a tiny backward velocity at
  // the end of a stop must not spin both planted feet by 180 degrees.
  desiredForward[0] = facing.x;
  desiredForward[1] = 0;
  desiredForward[2] = facing.z;
  projectUnitTangent(desiredForward, smoothedUp, alignedForward);
  dampUnitVector3(smoothedForward, smoothedForwardVelocity, desiredForward, response, deltaSeconds);
  projectUnitTangent(smoothedForward, smoothedUp, desiredForward);
  projectUnitTangent(alignedForward, smoothedUp, desiredForward);
  quaternionFromUnitVectors(alignedForward, smoothedForward, twistQuaternion);
  multiplyQuaternions(twistQuaternion, quaternion, quaternion);
  applyWorldRotationDelta(rig, pose, world, footIndex, quaternion);
}

export function readReferenceSoleNormalLocal(
  world: WorldPose,
  footIndex: number,
  toesIndex: number,
  out: Float32Array,
  inverseRotation: Float32Array,
) {
  if (footIndex < 0) {
    out.set(UP);
    return out;
  }
  const footOffset = footIndex * 3;
  const toeOffset = toesIndex * 3;
  let forwardX = toesIndex >= 0 ? world.translations[toeOffset] - world.translations[footOffset] : 0;
  let forwardY = toesIndex >= 0 ? world.translations[toeOffset + 1] - world.translations[footOffset + 1] : 0;
  let forwardZ = toesIndex >= 0 ? world.translations[toeOffset + 2] - world.translations[footOffset + 2] : 0;
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ);
  if (forwardLength > 1e-8) {
    forwardX /= forwardLength;
    forwardY /= forwardLength;
    forwardZ /= forwardLength;
  }
  // Imported foot-local +Y is not necessarily the sole normal. Build a
  // reference normal perpendicular to heel-to-toe, then store it foot-local.
  const upProjection = forwardY;
  out[0] = -forwardX * upProjection;
  out[1] = 1 - forwardY * upProjection;
  out[2] = -forwardZ * upProjection;
  const normalLength = Math.hypot(out[0], out[1], out[2]);
  if (normalLength <= 1e-8) out.set(UP);
  else {
    out[0] /= normalLength;
    out[1] /= normalLength;
    out[2] /= normalLength;
  }
  const offset = footIndex * 4;
  inverseRotation[0] = -world.rotations[offset];
  inverseRotation[1] = -world.rotations[offset + 1];
  inverseRotation[2] = -world.rotations[offset + 2];
  inverseRotation[3] = world.rotations[offset + 3];
  rotateVector3ByQuaternion(out, inverseRotation, out);
  return out;
}

export function readReferenceSoleForwardLocal(
  world: WorldPose,
  footIndex: number,
  toesIndex: number,
  soleNormalLocal: ArrayLike<number>,
  out: Float32Array,
  inverseRotation: Float32Array,
) {
  if (footIndex < 0) {
    out.set([0, 0, 1]);
    return out;
  }
  const footOffset = footIndex * 3, toeOffset = toesIndex * 3;
  if (toesIndex >= 0) {
    out[0] = world.translations[toeOffset] - world.translations[footOffset];
    out[1] = world.translations[toeOffset + 1] - world.translations[footOffset + 1];
    out[2] = world.translations[toeOffset + 2] - world.translations[footOffset + 2];
    const rotationOffset = footIndex * 4;
    inverseRotation[0] = -world.rotations[rotationOffset];
    inverseRotation[1] = -world.rotations[rotationOffset + 1];
    inverseRotation[2] = -world.rotations[rotationOffset + 2];
    inverseRotation[3] = world.rotations[rotationOffset + 3];
    rotateVector3ByQuaternion(out, inverseRotation, out);
  } else out.set([0, 0, 1]);
  projectUnitTangent(out, soleNormalLocal, Math.abs(soleNormalLocal[2]!) < .9 ? [0, 0, 1] : [1, 0, 0]);
  return out;
}

function dampUnitVector3(
  value: Float32Array,
  velocity: Float32Array,
  target: ArrayLike<number>,
  response: number,
  deltaSeconds: number,
) {
  if (deltaSeconds <= 0) {
    value.set(target);
    velocity.fill(0);
    return;
  }
  const decay = Math.exp(-response * deltaSeconds);
  for (let axis = 0; axis < 3; axis += 1) {
    const error = value[axis] - target[axis];
    const impulse = (velocity[axis] + response * error) * deltaSeconds;
    value[axis] = target[axis] + (error + impulse) * decay;
    velocity[axis] = (velocity[axis] - response * impulse) * decay;
  }
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) value.set(UP);
  else {
    value[0] /= length;
    value[1] /= length;
    value[2] /= length;
  }
}

function projectUnitTangent(value: Float32Array, normal: ArrayLike<number>, fallback: ArrayLike<number>) {
  let projection = value[0]! * normal[0]! + value[1]! * normal[1]! + value[2]! * normal[2]!;
  value[0] -= normal[0]! * projection;
  value[1] -= normal[1]! * projection;
  value[2] -= normal[2]! * projection;
  let length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) {
    projection = fallback[0]! * normal[0]! + fallback[1]! * normal[1]! + fallback[2]! * normal[2]!;
    value[0] = fallback[0]! - normal[0]! * projection;
    value[1] = fallback[1]! - normal[1]! * projection;
    value[2] = fallback[2]! - normal[2]! * projection;
    length = Math.hypot(value[0], value[1], value[2]);
  }
  const inverse = 1 / Math.max(1e-8, length);
  value[0] *= inverse;
  value[1] *= inverse;
  value[2] *= inverse;
  return value;
}
