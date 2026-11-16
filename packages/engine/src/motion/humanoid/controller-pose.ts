import {
type CharacterMotor3D
} from "../../physics/3d.ts";
import {
multiplyQuaternions,
normalizeQuaternion,
quaternionFromAxisAngle,
} from "../math.ts";
import {
type PoseBuffer
} from "../pose-buffer.ts";
import {
getRigSemanticIndex,
type CompiledSemanticRig
} from "../rig.ts";
import { type FootPlantResult, type FootPlantSolver } from "../solvers/foot-plant.ts";
import { type PoseTwoBoneIKSolver } from "../solvers/pose-ik.ts";
import {
type WorldPose
} from "../solvers/world-pose.ts";
import { sampleHumanoidActionPoseLobeWeight, type HumanoidActionPoseRecipe } from "./action-pose.ts";
import { normalizeGaitPhase } from "./gait-recipe.ts";
import { type HumanoidJumpPoseSample } from "./jump-pose.ts";
import {
type ProceduralLocomotionFrame
} from "./locomotion.ts";


export const X_AXIS = new Float32Array([1, 0, 0]);

export const Y_AXIS = new Float32Array([0, 1, 0]);

export const Z_AXIS = new Float32Array([0, 0, 1]);

export type LimbRuntime = {
  upper: number;
  middle: number;
  end: number;
  solver: PoseTwoBoneIKSolver | null;
  length: number;
};

export function applyActionPose(
  pose: PoseBuffer,
  rig: CompiledSemanticRig,
  recipe: HumanoidActionPoseRecipe | null,
  phase: number,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  if (!recipe) return;
  for (const lobe of recipe.lobes) {
    const index = getRigSemanticIndex(rig, lobe.semantic), weight = sampleHumanoidActionPoseLobeWeight(lobe, phase);
    if (index < 0 || weight <= 0) continue;
    const scale = Math.PI / 180 * weight;
    applyLocalAxisRotation(pose, index, X_AXIS, lobe.rotationEulerDegrees[0] * scale, scratch0, scratch1);
    applyLocalAxisRotation(pose, index, Y_AXIS, lobe.rotationEulerDegrees[1] * scale, scratch0, scratch1);
    applyLocalAxisRotation(pose, index, Z_AXIS, lobe.rotationEulerDegrees[2] * scale, scratch0, scratch1);
  }
}

export function applyBaseBodyPose(
  pose: PoseBuffer,
  frame: ProceduralLocomotionFrame,
  leftLeg: LimbRuntime,
  rightLeg: LimbRuntime,
  leftArm: LimbRuntime,
  rightArm: LimbRuntime,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  const weight = frame.locomotionWeight;
  applyLegRecipe(pose, leftLeg, frame.left.footForward, frame.left.kneeDrive, weight, scratch0, scratch1);
  applyLegRecipe(pose, rightLeg, frame.right.footForward, frame.right.kneeDrive, weight, scratch0, scratch1);
  applyArmRecipe(pose, leftArm, 1, frame.left.armSwing, weight, scratch0, scratch1);
  applyArmRecipe(pose, rightArm, -1, frame.right.armSwing, weight, scratch0, scratch1);
}

export function applyCrouchPose(
  pose: PoseBuffer,
  frame: ProceduralLocomotionFrame,
  legLength: number,
  hipsIndex: number,
  torso: readonly number[],
  leftLeg: LimbRuntime,
  rightLeg: LimbRuntime,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  const weight = frame.crouchWeight;
  if (weight <= 1e-6) return;
  // Lower the pelvis before foot IK so both soles remain on their sampled
  // contacts while the knees and hips absorb the height change.
  if (hipsIndex >= 0) pose.translations[hipsIndex * 3 + 1] -= legLength * .34 * weight;
  for (const [index, joint] of torso.entries()) {
    const distribution = (index + 1) / Math.max(1, torso.length);
    applyLocalAxisRotation(pose, joint, X_AXIS, .14 * weight * distribution, scratch0, scratch1);
  }
  for (const leg of [leftLeg, rightLeg]) {
    if (leg.upper >= 0) applyLocalAxisRotation(pose, leg.upper, X_AXIS, -.12 * weight, scratch0, scratch1);
    if (leg.middle >= 0) applyLocalAxisRotation(pose, leg.middle, X_AXIS, .28 * weight, scratch0, scratch1);
  }
}

export function applyAirborneAndLandingPose(
  pose: PoseBuffer,
  jump: HumanoidJumpPoseSample,
  legLength: number,
  hipsIndex: number,
  torso: readonly number[],
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  if (jump.phase === "none" || jump.weight <= 0) return;
  if (hipsIndex >= 0) pose.translations[hipsIndex * 3 + 1] -= legLength * jump.pelvisDropRatio;
  for (const [index, joint] of torso.entries()) {
    const distribution = (index + 1) / Math.max(1, torso.length);
    applyLocalAxisRotation(pose, joint, X_AXIS, jump.torsoPitchRadians * distribution, scratch0, scratch1);
  }
}

export function applyLegRecipe(
  pose: PoseBuffer,
  limb: LimbRuntime,
  footForward: number,
  kneeDrive: number,
  weight: number,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  if (limb.upper >= 0) applyLocalAxisRotation(pose, limb.upper, X_AXIS, -footForward * 0.85 * weight, scratch0, scratch1);
  if (limb.middle >= 0) applyLocalAxisRotation(pose, limb.middle, X_AXIS, kneeDrive * 0.5 * weight, scratch0, scratch1);
}

export function applyArmRecipe(
  pose: PoseBuffer,
  limb: LimbRuntime,
  side: -1 | 1,
  armSwing: number,
  weight: number,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  if (limb.upper < 0) return;
  // The canonical idle lowers a T-pose/A-pose arm; gait swing is layered on top.
  applyLocalAxisRotation(pose, limb.upper, Z_AXIS, -side * 1.12, scratch0, scratch1);
  applyLocalAxisRotation(pose, limb.upper, Y_AXIS, -side * armSwing * weight * 0.42, scratch0, scratch1);
  if (limb.middle >= 0) {
    applyLocalAxisRotation(pose, limb.middle, Z_AXIS, side * 0.16, scratch0, scratch1);
  }
}

export function applyLocalAxisRotation(
  pose: PoseBuffer,
  jointIndex: number,
  axis: ArrayLike<number>,
  angle: number,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  if (Math.abs(angle) <= 1e-8) return;
  const offset = jointIndex * 4;
  scratch0[0] = pose.rotations[offset];
  scratch0[1] = pose.rotations[offset + 1];
  scratch0[2] = pose.rotations[offset + 2];
  scratch0[3] = pose.rotations[offset + 3];
  quaternionFromAxisAngle(axis, angle, scratch1);
  multiplyQuaternions(scratch0, scratch1, scratch0);
  normalizeQuaternion(scratch0, scratch0);
  pose.rotations.set(scratch0, offset);
}

export function prepareFootTarget(
  limb: LimbRuntime,
  plant: FootPlantSolver | null,
  phase: number,
  stanceRatio: number,
  footLift: number,
  gaitTarget: ArrayLike<number>,
  referenceTarget: ArrayLike<number>,
  locomotionWeight: number,
  targetLocomotionWeight: number,
  motor: CharacterMotor3D,
  world: WorldPose,
  rootY: number,
  proposed: Float32Array,
  pole: Float32Array,
  side: -1 | 1,
  soleLength: number,
  plannedLocomotionFlight: boolean,
  deltaSeconds: number,
  maximumPelvisContactDrop: number,
  maximumSwingFootLiftRatio: number,
) {
  if (!limb.solver || !plant) return null;
  const localX = lerp(referenceTarget[0], gaitTarget[0], locomotionWeight);
  const localY = lerp(referenceTarget[1], gaitTarget[1], locomotionWeight);
  const localZ = lerp(referenceTarget[2], gaitTarget[2], locomotionWeight);
  const facing = motor.state.facing;
  const rightX = facing.z;
  const rightZ = -facing.x;
  proposed[0] = motor.state.position.x + rightX * localX + facing.x * localZ;
  proposed[1] = rootY + localY;
  proposed[2] = motor.state.position.z + rightZ * localX + facing.z * localZ;
  const allowPlant = motor.state.grounded && (targetLocomotionWeight <= 1e-6
    || locomotionWeight >= targetLocomotionWeight * 0.8);
  const query = {
    phase,
    stanceRatio,
    proposedWorld: proposed,
    // Catalog foot-height samples include the rig's residual ankle height.
    // Treat stance as exact contact and use that curve only during swing;
    // otherwise a run can remain a few centimetres above its touchdown
    // tolerance for an entire support window and visually skate forever.
    swingLift: resolvedSwingFootLift(phase, stanceRatio, footLift, limb.length, locomotionWeight, maximumSwingFootLiftRatio),
    // A solver-scale support gap keeps the locomotion pose, but still samples
    // terrain for sole clearance. Explicit jumps bypass terrain completely.
    grounded: motor.state.grounded || plannedLocomotionFlight,
    allowPlant,
    deltaSeconds,
    soleForwardX: facing.x,
    soleForwardZ: facing.z,
    soleLength,
  };
  let result = plant.update(query);
  if (result.planted && contactRequiresEarlyRelease(world, limb, result, maximumPelvisContactDrop)) {
    plant.release();
    result = plant.update({ ...query, allowPlant: false });
  }
  pole[0] = facing.x + rightX * side * 0.06;
  pole[1] = 0;
  pole[2] = facing.z + rightZ * side * 0.06;
  return result;
}

export function applyContactPelvisOffset(
  pose: PoseBuffer,
  hipsIndex: number,
  offset: number,
) {
  if (hipsIndex < 0) return false;
  if (Math.abs(offset) <= 1e-7) return false;
  pose.translations[hipsIndex * 3 + 1] += offset;
  return true;
}

export function requiredContactPelvisRaise(
  world: WorldPose,
  limb: LimbRuntime,
  result: FootPlantResult | null,
  minimumReachRatio: number,
  swingLift: number,
) {
  if (!limb.solver || !result?.hit || limb.length <= 0) return 0;
  const upperOffset = limb.upper * 3;
  const dz = world.translations[upperOffset + 2] - (result.planted ? result.anchorWorld[2] : result.targetWorld[2]);
  const targetX = result.planted ? result.anchorWorld[0] : result.targetWorld[0];
  const correctedDx = world.translations[upperOffset] - targetX;
  const minimumReach = limb.length * minimumReachRatio;
  const horizontalSquared = correctedDx * correctedDx + dz * dz;
  if (horizontalSquared >= minimumReach * minimumReach) return 0;
  const targetY = result.planted ? result.anchorWorld[1] : result.targetWorld[1] - swingLift;
  const currentVertical = world.translations[upperOffset + 1] - targetY;
  const requiredVertical = Math.sqrt(minimumReach * minimumReach - horizontalSquared);
  return Math.max(0, requiredVertical - currentVertical);
}

export function resolvedSwingFootLift(
  phase: number,
  stanceRatio: number,
  footLift: number,
  legLength: number,
  locomotionWeight: number,
  maximumSwingFootLiftRatio: number,
) {
  return Math.min(footLift, maximumSwingFootLiftRatio) * legLength * locomotionWeight
    * contactSafeSwingEnvelope(phase, stanceRatio);
}

export function contactRequiresEarlyRelease(
  world: WorldPose,
  limb: LimbRuntime,
  result: FootPlantResult,
  maximumPelvisContactDrop: number,
) {
  if (!result.planted || limb.upper < 0 || limb.length <= 0) return false;
  const upperOffset = limb.upper * 3;
  const dx = world.translations[upperOffset] - result.anchorWorld[0];
  const dz = world.translations[upperOffset + 2] - result.anchorWorld[2];
  const reachableLength = Math.max(1e-4, limb.length * .99);
  if (dx * dx + dz * dz >= reachableLength * reachableLength) return true;
  return requiredContactPelvisDrop(world, limb, result) > maximumPelvisContactDrop;
}

export function requiredContactPelvisDrop(
  world: WorldPose,
  limb: LimbRuntime,
  result: FootPlantResult | null,
) {
  if (!limb.solver || !result?.planted || limb.length <= 0) return 0;
  const upperOffset = limb.upper * 3;
  const dx = world.translations[upperOffset] - result.anchorWorld[0];
  const dz = world.translations[upperOffset + 2] - result.anchorWorld[2];
  const horizontalSquared = dx * dx + dz * dz;
  // Keep a tiny bend margin so the no-stretch solver does not land on its
  // numerically singular fully-extended limit.
  const reachableLength = Math.max(1e-4, limb.length - Math.max(0.001, limb.length * 0.01));
  const reachableSquared = reachableLength * reachableLength;
  if (horizontalSquared >= reachableSquared) return 0;
  const verticalDistance = world.translations[upperOffset + 1] - result.anchorWorld[1];
  if (verticalDistance <= 0) return 0;
  const reachableVertical = Math.sqrt(reachableSquared - horizontalSquared);
  return Math.max(0, verticalDistance - reachableVertical);
}

export function solvePreparedFoot(
  limb: LimbRuntime,
  result: FootPlantResult | null,
  pose: PoseBuffer,
  pole: Float32Array,
  minimumSwingReachRatio: number,
  target: Float32Array,
  contactVerticalOffset = 0,
) {
  if (!limb.solver || !result) return;
  target.set(result.targetWorld);
  target[1] += Math.max(0, contactVerticalOffset);
  if (!result.planted && limb.upper >= 0 && limb.length > 0) {
    const rootOffset = limb.upper * 3;
    const rootX = limb.solver.world.translations[rootOffset]!;
    const rootY = limb.solver.world.translations[rootOffset + 1]!;
    const rootZ = limb.solver.world.translations[rootOffset + 2]!;
    const dx = target[0]! - rootX;
    const dy = target[1]! - rootY;
    const dz = target[2]! - rootZ;
    const distance = Math.hypot(dx, dy, dz);
    const minimumDistance = limb.length * minimumSwingReachRatio;
    // A swing target that rises too near the hip makes an unconstrained
    // two-bone chain choose a mathematically valid but anatomical hairpin.
    // Add only missing downward reach, but never lower the target through its
    // sampled collision surface. The anticipatory pelvis clearance normally
    // resolves elevated targets before this last-resort guard is needed.
    if (distance < minimumDistance && dy < 0) {
      const horizontalSquared = dx * dx + dz * dz;
      if (horizontalSquared < minimumDistance * minimumDistance) {
        target[1] = Math.max(target[1], rootY - Math.sqrt(minimumDistance * minimumDistance - horizontalSquared));
      }
    }
  }
  limb.solver.apply(pose, target, pole, { worldIsCurrent: true });
}

export function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

/**
 * Keeps toe-off and touchdown at zero height and zero vertical velocity while
 * preserving the catalog's full mid-swing shape. This makes a gait safe to
 * sample at ordinary video rates without an ankle teleport at the cycle seam.
 */
export function contactSafeSwingEnvelope(phase: number, stanceRatio: number) {
  const normalized = normalizeGaitPhase(phase);
  if (normalized < stanceRatio) return 0;
  const progress = (normalized - stanceRatio) / Math.max(1e-6, 1 - stanceRatio);
  const toeOff = smootherstep01(progress / .18);
  // Begin the descent early enough that a video-rate sample never has to fold
  // an entire leg through the last two frames of a fast stride.
  const touchdown = smootherstep01((1 - progress) / .4);
  return toeOff * touchdown;
}

export function smootherstep01(value: number) {
  const amount = Math.max(0, Math.min(1, value));
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}
