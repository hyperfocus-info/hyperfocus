import {
  createCharacterMotor3D,
  createHeightFieldRaycast3D,
  type CharacterMotor3D,
  type CharacterMotor3DOptions,
  type HeightField3D,
  type Physics3DRaycastProvider,
  type Vec3Input,
} from "../../physics/3d.ts";
import {
  multiplyQuaternions,
  normalizeQuaternion,
  quaternionFromAxisAngle,
  quaternionFromUnitVectors,
  rotateVector3ByQuaternion,
} from "../math.ts";
import {
  createPoseBuffer,
  createPoseBufferLayout,
  resetPoseBuffer,
  type PoseBuffer,
} from "../pose-buffer.ts";
import {
  getRigSemanticIndex,
  type CompiledSemanticRig,
  type HumanoidLimbName,
  type HumanoidSemantic,
  type T3RigJointLimitOverride,
} from "../rig.ts";
import {
  compileMotionSignalLayout,
  createMotionSignalBuffer,
  type MotionSignalBuffer,
} from "../signals.ts";
import { createDistributedAimSolver, type DistributedAimResult, type DistributedAimSolver } from "../solvers/aim.ts";
import { createFootPlantSolver, type FootPlantResult, type FootPlantSolver } from "../solvers/foot-plant.ts";
import { createPoseTwoBoneIKSolver, type PoseTwoBoneIKSolver } from "../solvers/pose-ik.ts";
import { createRecoilSolver, type RecoilSolver } from "../solvers/recoil.ts";
import { createHumanoidJointLimitSolver, type JointLimitSolver } from "../solvers/joint-limits.ts";
import {
  applyWorldRotationDelta,
  createWorldPose,
  evaluateWorldPose,
  type WorldPose,
} from "../solvers/world-pose.ts";
import {
  createProceduralLocomotion,
  type ProceduralLocomotion,
  type ProceduralLocomotionFrame,
  type ProceduralLocomotionOptions,
} from "./locomotion.ts";

const UP = new Float32Array([0, 1, 0]);
const X_AXIS = new Float32Array([1, 0, 0]);
const Y_AXIS = new Float32Array([0, 1, 0]);
const Z_AXIS = new Float32Array([0, 0, 1]);
const flatGround: HeightField3D = Object.freeze({ heightAt: () => 0 });

export type HumanoidMotionControllerOptions = {
  rig: CompiledSemanticRig;
  pose?: PoseBuffer;
  /** Optional ArrayBuffer, SharedArrayBuffer, or WebAssembly.Memory.buffer backing. */
  memory?: ArrayBufferLike;
  byteOffset?: number;
  motor?: CharacterMotor3D;
  motorOptions?: CharacterMotor3DOptions;
  heightField?: HeightField3D;
  ground?: Physics3DRaycastProvider;
  locomotion?: ProceduralLocomotionOptions;
  footPlantStanceRatio?: number;
  /** False when an authored base pose supplies locomotion underneath semantic layers. */
  proceduralBase?: boolean;
  maxStretch?: Partial<Record<HumanoidLimbName, number>>;
  jointLimits?: Readonly<Record<string, T3RigJointLimitOverride>> | false;
};

export type HumanoidMotionMetrics = {
  poseTimeMs: number;
  maxPoseTimeMs: number;
  footSlipDistance: number;
  plantedVerticalError: number;
  poseFinite: boolean;
  jointLimitsClamped: number;
};

export type HumanoidMotionState = {
  readonly pose: PoseBuffer;
  readonly signals: MotionSignalBuffer;
  readonly motor: CharacterMotor3D["state"];
  readonly locomotion: ProceduralLocomotionFrame;
  readonly metrics: HumanoidMotionMetrics;
  readonly capabilities: CompiledSemanticRig["capabilities"];
  readonly diagnostics: CompiledSemanticRig["diagnostics"];
  readonly leftFoot: FootPlantResult | null;
  readonly rightFoot: FootPlantResult | null;
  readonly aim: DistributedAimResult | null;
};

export type HumanoidMotionController = {
  readonly rig: CompiledSemanticRig;
  readonly motor: CharacterMotor3D;
  readonly state: HumanoidMotionState;
  /** Desired velocity in world-space meters per second. */
  move(velocity: Vec3Input): HumanoidMotionState;
  update(deltaSeconds: number): HumanoidMotionState;
  teleport(position: Vec3Input): HumanoidMotionState;
  setFacing(facing: Vec3Input): HumanoidMotionState;
  setAimTarget(target: Vec3Input | null, weight?: number): HumanoidMotionState;
  /** Constrains one or both hands to world-space grips, for two-handed props. */
  setHandTargets(left: Vec3Input | null, right: Vec3Input | null, weight?: number): HumanoidMotionState;
  setBasePose(basePose: PoseBuffer | null): HumanoidMotionState;
  setAction(actionId: string | null, actionPhase?: number): HumanoidMotionState;
  setActionPhase(actionPhase: number): HumanoidMotionState;
  requestRootMotion(delta: Vec3Input): HumanoidMotionState;
  recoil(amount?: number): HumanoidMotionState;
  reset(): HumanoidMotionState;
};

type LimbRuntime = {
  upper: number;
  middle: number;
  end: number;
  solver: PoseTwoBoneIKSolver | null;
  length: number;
};

export function createHumanoidMotionController(
  options: HumanoidMotionControllerOptions,
): HumanoidMotionController {
  const rig = options.rig;
  if (!rig) throw new Error("humanoid motion controller requires a compiled semantic rig");
  const heightField = options.heightField ?? (options.motor ? undefined : flatGround);
  const ground = options.ground ?? createHeightFieldRaycast3D(heightField ?? flatGround);
  const motor = options.motor ?? createCharacterMotor3D({
    ...options.motorOptions,
    ...(heightField ? { heightField } : {}),
  });
  const pose = options.pose ?? createPoseBuffer(
    createPoseBufferLayout(rig.deformCount, rig.totalCount, { includeScales: true }),
    { buffer: options.memory, byteOffset: options.byteOffset },
  );
  if (pose.deformCount !== rig.deformCount || pose.totalCount !== rig.totalCount) {
    throw new RangeError("controller PoseBuffer counts must match the compiled semantic rig");
  }
  const signals = createMotionSignalBuffer(compileMotionSignalLayout());
  const locomotion: ProceduralLocomotion = createProceduralLocomotion({
    maxTurnRate: motor.preset.maxTurnRate,
    ...options.locomotion,
  });
  const proceduralBase = options.proceduralBase !== false;
  let basePose: PoseBuffer | null = null;
  const world = createWorldPose(rig);
  writeReferencePose(rig, pose);
  evaluateWorldPose(rig, pose, world);

  const leftLeg = createLimbRuntime(rig, world, "leftUpperLeg", "leftLowerLeg", "leftFoot", options.maxStretch?.leftLeg);
  const rightLeg = createLimbRuntime(rig, world, "rightUpperLeg", "rightLowerLeg", "rightFoot", options.maxStretch?.rightLeg);
  const leftArm = createLimbRuntime(rig, world, "leftUpperArm", "leftLowerArm", "leftHand", options.maxStretch?.leftArm);
  const rightArm = createLimbRuntime(rig, world, "rightUpperArm", "rightLowerArm", "rightHand", options.maxStretch?.rightArm);
  measureLimb(leftLeg, world);
  measureLimb(rightLeg, world);
  measureLimb(leftArm, world);
  measureLimb(rightArm, world);
  const legLength = averagePositive(leftLeg.length, rightLeg.length, 1);
  const hipWidth = measureHipWidth(world, leftLeg.upper, rightLeg.upper, legLength * 0.22);

  const referenceLeftFoot = readPosition(world, leftLeg.end, new Float32Array(3));
  const referenceRightFoot = readPosition(world, rightLeg.end, new Float32Array(3));
  const leftToesIndex = getRigSemanticIndex(rig, "leftToes");
  const rightToesIndex = getRigSemanticIndex(rig, "rightToes");
  const leftSoleNormalLocal = readReferenceSoleNormalLocal(world, leftLeg.end, leftToesIndex, new Float32Array(3), new Float32Array(4));
  const rightSoleNormalLocal = readReferenceSoleNormalLocal(world, rightLeg.end, rightToesIndex, new Float32Array(3), new Float32Array(4));
  const footPlantStanceRatio = options.footPlantStanceRatio ?? 0.55;
  const leftFootPlant = rig.capabilities.leftFootPlant
    ? createFootPlantSolver({ ground, stanceRatio: footPlantStanceRatio, soleOffset: Math.max(0.015, referenceLeftFoot[1]) })
    : null;
  const rightFootPlant = rig.capabilities.rightFootPlant
    ? createFootPlantSolver({ ground, stanceRatio: footPlantStanceRatio, soleOffset: Math.max(0.015, referenceRightFoot[1]) })
    : null;
  const aimJoints = collectMapped(rig, ["spine", "chest", "upperChest", "neck", "head"]);
  const torsoJoints = collectMapped(rig, ["spine", "chest", "upperChest"]);
  const aimSolver: DistributedAimSolver | null = aimJoints.length > 0
    ? createDistributedAimSolver({ jointIndices: aimJoints, maxYaw: Math.PI * 0.55, maxPitch: Math.PI * 0.42 })
    : null;
  const recoilSolver: RecoilSolver | null = aimJoints.length > 0
    ? createRecoilSolver({ jointIndices: aimJoints })
    : null;
  const jointLimitSolver: JointLimitSolver | null = options.jointLimits === false
    ? null
    : createHumanoidJointLimitSolver({ rig, overrides: options.jointLimits });
  const hipsIndex = getRigSemanticIndex(rig, "hips");
  const headIndex = getRigSemanticIndex(rig, "head");

  const proposedLeftFoot = new Float32Array(3);
  const proposedRightFoot = new Float32Array(3);
  const leftArmTarget = new Float32Array(3);
  const rightArmTarget = new Float32Array(3);
  const leftPole = new Float32Array(3);
  const rightPole = new Float32Array(3);
  const leftFootPole = new Float32Array(3);
  const rightFootPole = new Float32Array(3);
  const aimTarget = new Float32Array(3);
  const leftHandGripTarget = new Float32Array(3);
  const rightHandGripTarget = new Float32Array(3);
  const signalVector = new Float32Array(3);
  const quaternion0 = new Float32Array(4);
  const quaternion1 = new Float32Array(4);
  const vector0 = new Float32Array(3);
  const vector1 = new Float32Array(3);
  const vector2 = new Float32Array(3);
  const vector3 = new Float32Array(3);
  let aimWeight = 0;
  let handTargetWeight = 0;
  let hasLeftHandTarget = false;
  let hasRightHandTarget = false;
  let actionId: string | null = null;
  let actionPhase = 0;
  let aimResult: DistributedAimResult | null = null;
  const metrics: HumanoidMotionMetrics = {
    poseTimeMs: 0,
    maxPoseTimeMs: 0,
    footSlipDistance: 0,
    plantedVerticalError: 0,
    poseFinite: true,
    jointLimitsClamped: 0,
  };
  const state = {
    pose,
    signals,
    motor: motor.state,
    locomotion: locomotion.frame,
    metrics,
    capabilities: rig.capabilities,
    diagnostics: rig.diagnostics,
    leftFoot: leftFootPlant?.result ?? null,
    rightFoot: rightFootPlant?.result ?? null,
    get aim() {
      return aimResult;
    },
  } as HumanoidMotionState;

  function update(deltaSeconds: number) {
    const dt = finiteNonNegative(deltaSeconds, "humanoid motion deltaSeconds");
    motor.step(dt);
    const startedAt = now();
    writeReferencePose(rig, pose);
    if (basePose) writeDeformBasePose(pose, basePose, rig.deformCount);
    writeMotionRoot(rig, pose, motor.state.position, motor.state.facing, quaternion0);
    const frame = locomotion.update({
      deltaSeconds: dt,
      resolvedRootDelta: vecToArray(motor.state.resolvedDelta, vector0),
      velocity: vecToArray(motor.state.velocity, vector1),
      facing: vecToArray(motor.state.facing, vector2),
      groundNormal: vecToArray(motor.state.groundNormal, vector3),
      turnRate: motor.state.turnRate,
      isGrounded: motor.state.grounded,
      legLength,
      hipWidth,
    });

    if (proceduralBase) {
      applyBaseBodyPose(
        pose,
        frame,
        legLength,
        hipsIndex,
        torsoJoints,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        quaternion0,
        quaternion1,
      );
    }
    applyAirborneAndLandingPose(pose, frame, legLength, hipsIndex, torsoJoints, leftLeg, rightLeg, quaternion0, quaternion1);
    evaluateWorldPose(rig, pose, world);
    aimResult = applyAim(pose, world, aimSolver, headIndex, motor.state.facing, aimTarget, aimWeight);
    recoilSolver?.update(dt, pose);
    // Clamp the authored/base layers before contact and prop constraints. IK
    // must remain authoritative or feet and two-handed grips visibly drift.
    metrics.jointLimitsClamped = jointLimitSolver?.apply(pose).clampedJointCount ?? 0;

    evaluateWorldPose(rig, pose, world);
    const leftFootResult = proceduralBase ? prepareFootTarget(leftLeg, leftFootPlant, frame.gaitPhase, frame.left.footLift, frame.leftFootTarget, referenceLeftFoot, frame.locomotionWeight, frame.targetLocomotionWeight, motor, proposedLeftFoot, leftFootPole, 1) : null;
    const rightFootResult = proceduralBase ? prepareFootTarget(rightLeg, rightFootPlant, frame.gaitPhase + 0.5, frame.right.footLift, frame.rightFootTarget, referenceRightFoot, frame.locomotionWeight, frame.targetLocomotionWeight, motor, proposedRightFoot, rightFootPole, -1) : null;
    if (applyContactPelvisDrop(pose, world, hipsIndex, leftLeg, leftFootResult, rightLeg, rightFootResult)) {
      evaluateWorldPose(rig, pose, world);
    }
    solveArm(leftArm, 1, pose, world, frame.left.armSwing, frame.locomotionWeight, frame.localTravelDirection, motor.state.facing, hasLeftHandTarget ? leftHandGripTarget : null, handTargetWeight, leftArmTarget, leftPole);
    solveArm(rightArm, -1, pose, world, frame.right.armSwing, frame.locomotionWeight, frame.localTravelDirection, motor.state.facing, hasRightHandTarget ? rightHandGripTarget : null, handTargetWeight, rightArmTarget, rightPole);
    if (proceduralBase) {
      solvePreparedFoot(leftLeg, leftFootResult, pose, leftFootPole);
      solvePreparedFoot(rightLeg, rightFootResult, pose, rightFootPole);
    }

    if (proceduralBase) {
      alignFootToContact(rig, leftLeg.end, leftSoleNormalLocal, leftFootPlant?.result ?? null, frame.gaitPhase, footPlantStanceRatio, frame.localTravelDirection, motor.state.facing, pose, world, quaternion0, vector0, vector1);
      alignFootToContact(rig, rightLeg.end, rightSoleNormalLocal, rightFootPlant?.result ?? null, frame.gaitPhase + 0.5, footPlantStanceRatio, frame.localTravelDirection, motor.state.facing, pose, world, quaternion0, vector0, vector1);
    }
    evaluateWorldPose(rig, pose, world);
    updateMetrics(metrics, world, leftLeg.end, rightLeg.end, leftFootPlant?.result ?? null, rightFootPlant?.result ?? null);
    metrics.poseFinite = isFinitePose(pose);
    metrics.poseTimeMs = now() - startedAt;
    metrics.maxPoseTimeMs = Math.max(metrics.maxPoseTimeMs, metrics.poseTimeMs);
    writeStandardSignals(signals, motor, frame, aimTarget, aimWeight, actionId, actionPhase, signalVector);
    return state;
  }

  function reset() {
    motor.reset();
    locomotion.reset();
    leftFootPlant?.reset();
    rightFootPlant?.reset();
    recoilSolver?.reset();
    actionId = null;
    actionPhase = 0;
    aimWeight = 0;
    handTargetWeight = 0;
    hasLeftHandTarget = false;
    hasRightHandTarget = false;
    metrics.poseTimeMs = 0;
    metrics.maxPoseTimeMs = 0;
    metrics.footSlipDistance = 0;
    metrics.plantedVerticalError = 0;
    metrics.poseFinite = true;
    metrics.jointLimitsClamped = 0;
    writeReferencePose(rig, pose);
    writeMotionRoot(rig, pose, motor.state.position, motor.state.facing, quaternion0);
    signals.reset();
    return state;
  }

  const controller: HumanoidMotionController = {
    rig,
    motor,
    state,
    move(velocity) {
      motor.move(velocity);
      return state;
    },
    update,
    teleport(position) {
      motor.teleport(position);
      leftFootPlant?.reset();
      rightFootPlant?.reset();
      return state;
    },
    setFacing(facing) {
      motor.setFacing(facing);
      return state;
    },
    setAimTarget(target, weight = target ? 1 : 0) {
      if (target) copyVec3Input(target, aimTarget);
      aimWeight = clampFinite(weight, 0, 1, "aim weight");
      return state;
    },
    setHandTargets(left, right, weight = left || right ? 1 : 0) {
      if (left) copyVec3Input(left, leftHandGripTarget);
      if (right) copyVec3Input(right, rightHandGripTarget);
      hasLeftHandTarget = left !== null;
      hasRightHandTarget = right !== null;
      handTargetWeight = clampFinite(weight, 0, 1, "hand target weight");
      return state;
    },
    setBasePose(nextBasePose) {
      if (nextBasePose && (nextBasePose.deformCount !== rig.deformCount || nextBasePose.totalCount !== rig.totalCount)) {
        throw new RangeError("base PoseBuffer counts must match the compiled semantic rig");
      }
      basePose = nextBasePose;
      return state;
    },
    setAction(nextActionId, nextActionPhase = 0) {
      if (nextActionId !== null && typeof nextActionId !== "string") throw new TypeError("actionId must be a string or null");
      actionId = nextActionId;
      actionPhase = finiteNonNegative(nextActionPhase, "actionPhase");
      return state;
    },
    setActionPhase(nextActionPhase) {
      actionPhase = finiteNonNegative(nextActionPhase, "actionPhase");
      return state;
    },
    requestRootMotion(delta) {
      motor.requestRootMotion(delta);
      return state;
    },
    recoil(amount = 1) {
      recoilSolver?.impulse(amount);
      return state;
    },
    reset,
  };
  return controller;
}

function writeDeformBasePose(target: PoseBuffer, base: PoseBuffer, deformCount: number) {
  target.rotations.set(base.rotations.subarray(0, deformCount * 4), 0);
  target.translations.set(base.translations.subarray(0, deformCount * 3), 0);
  if (target.scales && base.scales) target.scales.set(base.scales.subarray(0, deformCount * 3), 0);
  return target;
}

function createLimbRuntime(
  rig: CompiledSemanticRig,
  world: WorldPose,
  upperSemantic: HumanoidSemantic,
  middleSemantic: HumanoidSemantic,
  endSemantic: HumanoidSemantic,
  maxStretch = 1,
): LimbRuntime {
  const upper = getRigSemanticIndex(rig, upperSemantic);
  const middle = getRigSemanticIndex(rig, middleSemantic);
  const end = getRigSemanticIndex(rig, endSemantic);
  const complete = upper >= 0 && middle >= 0 && end >= 0 && new Set([upper, middle, end]).size === 3;
  return {
    upper,
    middle,
    end,
    solver: complete ? createPoseTwoBoneIKSolver({ rig, world, rootIndex: upper, middleIndex: middle, endIndex: end, maxStretch }) : null,
    length: 0,
  };
}

function measureLimb(limb: LimbRuntime, world: WorldPose) {
  if (!limb.solver) return;
  const upperOffset = limb.upper * 3;
  const middleOffset = limb.middle * 3;
  const endOffset = limb.end * 3;
  limb.length = Math.hypot(
    world.translations[middleOffset] - world.translations[upperOffset],
    world.translations[middleOffset + 1] - world.translations[upperOffset + 1],
    world.translations[middleOffset + 2] - world.translations[upperOffset + 2],
  ) + Math.hypot(
    world.translations[endOffset] - world.translations[middleOffset],
    world.translations[endOffset + 1] - world.translations[middleOffset + 1],
    world.translations[endOffset + 2] - world.translations[middleOffset + 2],
  );
}

function writeReferencePose(rig: CompiledSemanticRig, pose: PoseBuffer) {
  resetPoseBuffer(pose);
  pose.rotations.set(rig.referenceRotations);
  pose.translations.set(rig.referenceTranslations);
  pose.scales?.set(rig.referenceScales);
  return pose;
}

function writeMotionRoot(
  rig: CompiledSemanticRig,
  pose: PoseBuffer,
  position: { x: number; y: number; z: number },
  facing: { x: number; y: number; z: number },
  scratch: Float32Array,
) {
  const translationOffset = rig.motionRootIndex * 3;
  pose.translations[translationOffset] = position.x;
  pose.translations[translationOffset + 1] = position.y;
  pose.translations[translationOffset + 2] = position.z;
  quaternionFromAxisAngle(UP, Math.atan2(facing.x, facing.z), scratch);
  pose.rotations.set(scratch, rig.motionRootIndex * 4);
}

function applyBaseBodyPose(
  pose: PoseBuffer,
  frame: ProceduralLocomotionFrame,
  legLength: number,
  hipsIndex: number,
  torso: readonly number[],
  leftLeg: LimbRuntime,
  rightLeg: LimbRuntime,
  leftArm: LimbRuntime,
  rightArm: LimbRuntime,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  const weight = frame.locomotionWeight;
  if (hipsIndex >= 0) {
    const offset = hipsIndex * 3;
    pose.translations[offset] += frame.pelvisOffset[0] * weight;
    pose.translations[offset + 1] += (frame.pelvisOffset[1] - legLength * 0.08) * weight
      + frame.breath * 0.006 * (1 - weight);
    applyLocalAxisRotation(pose, hipsIndex, X_AXIS, frame.left.torsoPitch * weight * 0.36, scratch0, scratch1);
    applyLocalAxisRotation(pose, hipsIndex, X_AXIS, frame.slope[0] * 0.18, scratch0, scratch1);
    applyLocalAxisRotation(pose, hipsIndex, Z_AXIS, frame.slope[1] * 0.18 + frame.turnLean + frame.torsoRoll * 0.35, scratch0, scratch1);
  }
  for (const [index, joint] of torso.entries()) {
    const distribution = (index + 1) / Math.max(1, torso.length * (torso.length + 1) * 0.5);
    applyLocalAxisRotation(pose, joint, X_AXIS, frame.left.torsoPitch * weight * distribution, scratch0, scratch1);
    applyLocalAxisRotation(pose, joint, Y_AXIS, frame.torsoYaw * distribution, scratch0, scratch1);
    applyLocalAxisRotation(pose, joint, Z_AXIS, -frame.torsoRoll * distribution, scratch0, scratch1);
  }
  applyLegRecipe(pose, leftLeg, frame.left.footForward, frame.left.kneeDrive, weight, scratch0, scratch1);
  applyLegRecipe(pose, rightLeg, frame.right.footForward, frame.right.kneeDrive, weight, scratch0, scratch1);
  applyArmRecipe(pose, leftArm, 1, frame.left.armSwing, weight, scratch0, scratch1);
  applyArmRecipe(pose, rightArm, -1, frame.right.armSwing, weight, scratch0, scratch1);
}

function applyAirborneAndLandingPose(
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
  if (frame.motionPhase === "jump" || frame.motionPhase === "fall") {
    const weight = Math.max(0, Math.min(1, frame.airborneSeconds * 9));
    const rising = frame.motionPhase === "jump";
    if (hipsIndex >= 0) pose.translations[hipsIndex * 3 + 1] -= legLength * (rising ? 0.025 : 0.045) * weight;
    for (const [index, joint] of torso.entries()) {
      const distribution = (index + 1) / Math.max(1, torso.length);
      applyLocalAxisRotation(pose, joint, X_AXIS, (rising ? -0.07 : 0.055) * weight * distribution, scratch0, scratch1);
    }
    applyAirLegPose(pose, leftLeg, rising ? -0.2 : -0.08, rising ? 0.5 : 0.36, weight, scratch0, scratch1);
    applyAirLegPose(pose, rightLeg, rising ? 0.08 : 0.1, rising ? 0.38 : 0.34, weight, scratch0, scratch1);
    return;
  }
  if (frame.motionPhase !== "land" || frame.landingWeight <= 0) return;
  const weight = frame.landingWeight;
  if (hipsIndex >= 0) pose.translations[hipsIndex * 3 + 1] -= legLength * 0.14 * weight;
  for (const [index, joint] of torso.entries()) {
    const distribution = (index + 1) / Math.max(1, torso.length);
    applyLocalAxisRotation(pose, joint, X_AXIS, 0.11 * weight * distribution, scratch0, scratch1);
  }
  applyAirLegPose(pose, leftLeg, -0.1, 0.5, weight, scratch0, scratch1);
  applyAirLegPose(pose, rightLeg, -0.1, 0.5, weight, scratch0, scratch1);
}

function applyAirLegPose(
  pose: PoseBuffer,
  limb: LimbRuntime,
  hipAngle: number,
  kneeAngle: number,
  weight: number,
  scratch0: Float32Array,
  scratch1: Float32Array,
) {
  if (limb.upper >= 0) applyLocalAxisRotation(pose, limb.upper, X_AXIS, hipAngle * weight, scratch0, scratch1);
  if (limb.middle >= 0) applyLocalAxisRotation(pose, limb.middle, X_AXIS, kneeAngle * weight, scratch0, scratch1);
}

function applyLegRecipe(
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

function applyArmRecipe(
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

function applyLocalAxisRotation(
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

function applyAim(
  pose: PoseBuffer,
  world: WorldPose,
  solver: DistributedAimSolver | null,
  headIndex: number,
  facing: { x: number; y: number; z: number },
  target: Float32Array,
  weight: number,
) {
  if (!solver || headIndex < 0 || weight <= 0) return null;
  const offset = headIndex * 3;
  const dx = target[0] - world.translations[offset];
  const dy = target[1] - world.translations[offset + 1];
  const dz = target[2] - world.translations[offset + 2];
  const horizontal = Math.hypot(dx, dz);
  if (horizontal + Math.abs(dy) <= 1e-8) return null;
  const targetYaw = Math.atan2(dx, dz);
  const facingYaw = Math.atan2(facing.x, facing.z);
  const yaw = wrapAngle(targetYaw - facingYaw);
  const pitch = -Math.atan2(dy, horizontal);
  return solver.apply(pose, yaw, pitch, weight);
}

function solveArm(
  limb: LimbRuntime,
  side: -1 | 1,
  pose: PoseBuffer,
  world: WorldPose,
  armSwing: number,
  locomotionWeight: number,
  localTravelDirection: ArrayLike<number>,
  facing: { x: number; y: number; z: number },
  gripTarget: ArrayLike<number> | null,
  gripWeight: number,
  target: Float32Array,
  pole: Float32Array,
) {
  if (!limb.solver) return;
  const shoulderOffset = limb.upper * 3;
  const rightX = facing.z;
  const rightZ = -facing.x;
  const travelX = rightX * localTravelDirection[0] + facing.x * localTravelDirection[2];
  const travelZ = rightZ * localTravelDirection[0] + facing.z * localTravelDirection[2];
  const swingDistance = armSwing * locomotionWeight * limb.length * 0.5;
  target[0] = world.translations[shoulderOffset] + rightX * side * limb.length * 0.13
    - travelX * swingDistance;
  // Keep a visible running bend at the elbow instead of solving the arm to
  // almost its full length directly beside the hips.
  target[1] = world.translations[shoulderOffset + 1] - limb.length * 0.8;
  target[2] = world.translations[shoulderOffset + 2] + rightZ * side * limb.length * 0.13
    - travelZ * swingDistance;
  if (gripTarget && gripWeight > 0) {
    target[0] = lerp(target[0], gripTarget[0], gripWeight);
    target[1] = lerp(target[1], gripTarget[1], gripWeight);
    target[2] = lerp(target[2], gripTarget[2], gripWeight);
  }
  pole[0] = travelX + rightX * side * 0.24;
  pole[1] = 0;
  pole[2] = travelZ + rightZ * side * 0.24;
  limb.solver.apply(pose, target, pole, { worldIsCurrent: true });
}

function prepareFootTarget(
  limb: LimbRuntime,
  plant: FootPlantSolver | null,
  phase: number,
  footLift: number,
  gaitTarget: ArrayLike<number>,
  referenceTarget: ArrayLike<number>,
  locomotionWeight: number,
  targetLocomotionWeight: number,
  motor: CharacterMotor3D,
  proposed: Float32Array,
  pole: Float32Array,
  side: -1 | 1,
) {
  if (!limb.solver || !plant) return null;
  if (!motor.state.grounded) {
    plant.reset();
    return null;
  }
  const localX = lerp(referenceTarget[0], gaitTarget[0], locomotionWeight);
  const localY = lerp(referenceTarget[1], 0, locomotionWeight);
  const localZ = lerp(referenceTarget[2], gaitTarget[2], locomotionWeight);
  const facing = motor.state.facing;
  const rightX = facing.z;
  const rightZ = -facing.x;
  proposed[0] = motor.state.position.x + rightX * localX + facing.x * localZ;
  proposed[1] = motor.state.position.y + localY;
  proposed[2] = motor.state.position.z + rightZ * localX + facing.z * localZ;
  const allowPlant = targetLocomotionWeight <= 1e-6
    || locomotionWeight >= targetLocomotionWeight * 0.8;
  const result = plant.update({
    phase,
    proposedWorld: proposed,
    swingLift: footLift * limb.length * locomotionWeight,
    grounded: true,
    allowPlant,
  });
  pole[0] = facing.x + rightX * side * 0.06;
  pole[1] = 0;
  pole[2] = facing.z + rightZ * side * 0.06;
  return result;
}

function applyContactPelvisDrop(
  pose: PoseBuffer,
  world: WorldPose,
  hipsIndex: number,
  leftLeg: LimbRuntime,
  left: FootPlantResult | null,
  rightLeg: LimbRuntime,
  right: FootPlantResult | null,
) {
  if (hipsIndex < 0) return false;
  const drop = Math.max(
    requiredContactPelvisDrop(world, leftLeg, left),
    requiredContactPelvisDrop(world, rightLeg, right),
  );
  if (drop <= 1e-7) return false;
  pose.translations[hipsIndex * 3 + 1] -= drop;
  return true;
}

function requiredContactPelvisDrop(
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
  const reachableLength = Math.max(1e-4, limb.length - Math.max(0.001, limb.length * 0.001));
  const reachableSquared = reachableLength * reachableLength;
  if (horizontalSquared >= reachableSquared) return 0;
  const verticalDistance = world.translations[upperOffset + 1] - result.anchorWorld[1];
  if (verticalDistance <= 0) return 0;
  const reachableVertical = Math.sqrt(reachableSquared - horizontalSquared);
  return Math.max(0, verticalDistance - reachableVertical);
}

function solvePreparedFoot(
  limb: LimbRuntime,
  result: FootPlantResult | null,
  pose: PoseBuffer,
  pole: Float32Array,
) {
  if (!limb.solver || !result) return;
  limb.solver.apply(pose, result.targetWorld, pole, { worldIsCurrent: true });
}

function alignFootToContact(
  rig: CompiledSemanticRig,
  footIndex: number,
  soleNormalLocal: ArrayLike<number>,
  result: FootPlantResult | null,
  phase: number,
  stanceRatio: number,
  localTravelDirection: ArrayLike<number>,
  facing: { x: number; y: number; z: number },
  pose: PoseBuffer,
  world: WorldPose,
  quaternion: Float32Array,
  currentUp: Float32Array,
  desiredUp: Float32Array,
) {
  if (footIndex < 0 || !result?.hit) return;
  evaluateWorldPose(rig, pose, world);
  const offset = footIndex * 4;
  quaternion[0] = world.rotations[offset];
  quaternion[1] = world.rotations[offset + 1];
  quaternion[2] = world.rotations[offset + 2];
  quaternion[3] = world.rotations[offset + 3];
  rotateVector3ByQuaternion(soleNormalLocal, quaternion, currentUp);
  desiredUp.set(result.groundNormal);
  if (!result.planted) {
    const normalizedPhase = ((phase % 1) + 1) % 1;
    const rawProgress = (normalizedPhase - stanceRatio) / Math.max(1e-6, 1 - stanceRatio);
    const progress = Math.max(0, Math.min(1, rawProgress));
    const eased = progress * progress * (3 - 2 * progress);
    const pitch = -0.12 + eased * 0.28;
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
  quaternionFromUnitVectors(currentUp, desiredUp, quaternion);
  applyWorldRotationDelta(rig, pose, world, footIndex, quaternion);
}

function readReferenceSoleNormalLocal(
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
  // The imported foot's local +Y is not necessarily its sole normal. Build a
  // reference normal perpendicular to the heel-to-toe axis, then store it in
  // foot-local space so ground alignment preserves a level sole on any rig.
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

function updateMetrics(
  metrics: HumanoidMotionMetrics,
  world: WorldPose,
  leftFootIndex: number,
  rightFootIndex: number,
  left: FootPlantResult | null,
  right: FootPlantResult | null,
) {
  metrics.footSlipDistance = 0;
  metrics.plantedVerticalError = 0;
  measureFootError(metrics, world, leftFootIndex, left);
  measureFootError(metrics, world, rightFootIndex, right);
}

function measureFootError(metrics: HumanoidMotionMetrics, world: WorldPose, index: number, result: FootPlantResult | null) {
  if (index < 0 || !result?.planted) return;
  const offset = index * 3;
  metrics.footSlipDistance = Math.max(metrics.footSlipDistance, Math.hypot(
    world.translations[offset] - result.anchorWorld[0],
    world.translations[offset + 2] - result.anchorWorld[2],
  ));
  metrics.plantedVerticalError = Math.max(
    metrics.plantedVerticalError,
    Math.max(0, result.anchorWorld[1] - world.translations[offset + 1]),
  );
}

function writeStandardSignals(
  signals: MotionSignalBuffer,
  motor: CharacterMotor3D,
  frame: ProceduralLocomotionFrame,
  aimTarget: Float32Array,
  aimWeight: number,
  actionId: string | null,
  actionPhase: number,
  scratch: Float32Array,
) {
  signals.set("acceleration", vecToArray(motor.state.acceleration, scratch));
  signals.set("actionId", actionId);
  signals.set("actionPhase", actionPhase);
  signals.set("aimTarget", aimTarget);
  signals.set("aimWeight", aimWeight);
  signals.set("desiredVelocity", vecToArray(motor.state.desiredVelocity, scratch));
  signals.set("facing", vecToArray(motor.state.facing, scratch));
  signals.set("gaitCycle", frame.gaitCycle);
  signals.set("gaitPhase", frame.gaitPhase);
  signals.set("groundNormal", vecToArray(motor.state.groundNormal, scratch));
  signals.set("isGrounded", motor.state.grounded);
  signals.set("resolvedRootDelta", vecToArray(motor.state.resolvedDelta, scratch));
  signals.set("rootPosition", vecToArray(motor.state.position, scratch));
  signals.set("turnRate", motor.state.turnRate);
  signals.set("velocity", vecToArray(motor.state.velocity, scratch));
}

function collectMapped(rig: CompiledSemanticRig, semantics: readonly HumanoidSemantic[]) {
  const result: number[] = [];
  for (const semantic of semantics) {
    const index = getRigSemanticIndex(rig, semantic);
    if (index >= 0 && !result.includes(index)) result.push(index);
  }
  return result;
}

function readPosition(world: WorldPose, index: number, out: Float32Array) {
  if (index < 0) return out;
  out[0] = world.translations[index * 3];
  out[1] = world.translations[index * 3 + 1];
  out[2] = world.translations[index * 3 + 2];
  return out;
}

function measureHipWidth(world: WorldPose, left: number, right: number, fallback: number) {
  if (left < 0 || right < 0) return fallback;
  return Math.max(0.05, Math.hypot(
    world.translations[left * 3] - world.translations[right * 3],
    world.translations[left * 3 + 2] - world.translations[right * 3 + 2],
  ));
}

function averagePositive(a: number, b: number, fallback: number) {
  if (a > 0 && b > 0) return (a + b) * 0.5;
  if (a > 0) return a;
  if (b > 0) return b;
  return fallback;
}

function vecToArray(value: { x: number; y: number; z: number }, out: Float32Array) {
  out[0] = value.x;
  out[1] = value.y;
  out[2] = value.z;
  return out;
}

function copyVec3Input(value: Vec3Input, out: Float32Array) {
  if ("length" in value) {
    out[0] = Number(value[0]);
    out[1] = Number(value[1]);
    out[2] = Number(value[2]);
  } else {
    out[0] = value.x;
    out[1] = value.y;
    out[2] = value.z;
  }
  if (!out.every(Number.isFinite)) throw new TypeError("vec3 input must contain finite values");
  return out;
}

function isFinitePose(pose: PoseBuffer) {
  for (const value of pose.rotations) if (!Number.isFinite(value)) return false;
  for (const value of pose.translations) if (!Number.isFinite(value)) return false;
  if (pose.scales) for (const value of pose.scales) if (!Number.isFinite(value)) return false;
  return true;
}

function wrapAngle(value: number) {
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function finiteNonNegative(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be finite and non-negative`);
  return number;
}

function clampFinite(value: unknown, minimum: number, maximum: number, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return Math.max(minimum, Math.min(maximum, number));
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}
