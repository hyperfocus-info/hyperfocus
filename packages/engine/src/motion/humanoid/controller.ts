import { smoothstep01 as smooth01 } from "@hyperfocus/utilities/math";
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
quaternionFromAxisAngle
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
import { createFootPlantSolver, type FootPlantResult } from "../solvers/foot-plant.ts";
import { createHumanoidJointLimitSolver, type JointLimitSolver } from "../solvers/joint-limits.ts";
import { createPoseTwoBoneIKSolver } from "../solvers/pose-ik.ts";
import { createRecoilSolver, type RecoilSolver } from "../solvers/recoil.ts";
import {
createWorldPose,
evaluateWorldPose,
type WorldPose
} from "../solvers/world-pose.ts";
import { type HumanoidActionPoseIntent } from "./action-pose.ts";
import { createHumanoidArmSmoothingState, resetHumanoidArmSmoothingState, solveArm } from "./arm-swing.ts";
import {
createHumanoidControllerCommands,
createHumanoidControlState,
resetHumanoidControlState,
} from "./controller-commands.ts";
import { applyActionPose, applyAirborneAndLandingPose, applyBaseBodyPose, applyContactPelvisOffset, applyCrouchPose, lerp, prepareFootTarget, requiredContactPelvisDrop, requiredContactPelvisRaise, resolvedSwingFootLift, solvePreparedFoot, Z_AXIS, type LimbRuntime } from "./controller-pose.ts";
import { alignFootToContact, applyToePitch, readReferenceSoleForwardLocal, readReferenceSoleNormalLocal, sampleSwingToePitchRadians } from "./foot-orientation.ts";
import { createHumanoidJumpPoseSample, sampleHumanoidJumpPose } from "./jump-pose.ts";
import type { HumanoidLocomotionIntent } from "./locomotion-intent.ts";
import {
createProceduralLocomotion,
type ProceduralLocomotion,
type ProceduralLocomotionFrame,
type ProceduralLocomotionOptions,
} from "./locomotion.ts";
import type { HumanoidPunchIntent } from "./punch-intent.ts";
import { createHumanoidTorsoPosture } from "./torso-posture.ts";

const UP = new Float32Array([0, 1, 0]);
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
  /** Critically damped terrain-alignment response for each foot. */
  footOrientationResponse?: number;
  /** Critically damped response for swing-foot targets crossing uneven terrain. */
  footSwingTargetResponse?: number;
  /** Critically damped return from contact-driven crouch after toe-off. */
  pelvisContactResponse?: number;
  /** Critically damped visual root response to discrete grounded step heights. */
  rootHeightResponse?: number;
  /** Critically damped response for procedural hand paths during locomotion. */
  armTargetResponse?: number;
  /** Critically damped response for the elbow bend plane during locomotion. */
  armPoleResponse?: number;
  /** Maximum fraction of leg length sacrificed to retain one trailing contact. */
  maximumPelvisContactDropRatio?: number;
  /** Maximum swing-foot height above sampled ground, as a fraction of leg length. */
  maximumSwingFootLiftRatio?: number;
  /** Minimum hip-to-foot reach retained to prevent the knee folding through itself. */
  minimumLegReachRatio?: number;
  /** False when an authored base pose supplies locomotion underneath semantic layers. */
  proceduralBase?: boolean;
  maxStretch?: Partial<Record<HumanoidLimbName, number>>;
  jointLimits?: Readonly<Record<string, T3RigJointLimitOverride>> | false;
};

export type HumanoidPhysicsMotionSample = {
  deltaSeconds: number;
  /** Collision-resolved character origin in the controller's world space. */
  position: Vec3Input;
  velocity: Vec3Input;
  /** Accepted displacement since the preceding sample. */
  resolvedRootDelta: Vec3Input;
  grounded: boolean;
  /** True only for an authored running flight phase; feet remain unconstrained. */
  plannedLocomotionFlight?: boolean;
  /** Smooth pre-impulse compression supplied by a known gameplay/video jump intent. */
  jumpAnticipation?: number;
  groundNormal?: Vec3Input;
  facing?: Vec3Input;
  turnRate?: number;
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
  readonly action: { readonly id: string | null; readonly phase: number; readonly active: boolean; readonly contactPhase: number | null };
};

export type HumanoidMotionController = {
  readonly rig: CompiledSemanticRig;
  readonly motor: CharacterMotor3D;
  readonly state: HumanoidMotionState;
  /** Desired velocity in world-space meters per second. */
  move(velocity: Vec3Input): HumanoidMotionState;
  /** Beginner path: direction plus walk/jog/run/sprint intent. */
  setLocomotionIntent(intent: HumanoidLocomotionIntent): HumanoidMotionState;
  update(deltaSeconds: number): HumanoidMotionState;
  /** Pose an authoritative physics sample without running a second character simulation. */
  updateFromPhysics(sample: HumanoidPhysicsMotionSample): HumanoidMotionState;
  teleport(position: Vec3Input): HumanoidMotionState;
  setFacing(facing: Vec3Input): HumanoidMotionState;
  setAimTarget(target: Vec3Input | null, weight?: number): HumanoidMotionState;
  /** Constrains one or both hands to world-space grips, for two-handed props. */
  setHandTargets(left: Vec3Input | null, right: Vec3Input | null, weight?: number): HumanoidMotionState;
  setBasePose(basePose: PoseBuffer | null): HumanoidMotionState;
  setAction(actionId: string | null, actionPhase?: number): HumanoidMotionState;
  /** Enables one shared procedural full-body recipe; phase is advanced with setActionPhase. */
  setActionPose(intent: HumanoidActionPoseIntent | null): HumanoidMotionState;
  /** Beginner path: target-aware full-body punch with planned wind-up and recovery. */
  punch(intent: HumanoidPunchIntent): HumanoidMotionState;
  setActionPhase(actionPhase: number): HumanoidMotionState;
  requestRootMotion(delta: Vec3Input): HumanoidMotionState;
  recoil(amount?: number): HumanoidMotionState;
  reset(): HumanoidMotionState;
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
  const controls = createHumanoidControlState();
  const world = createWorldPose(rig);
  writeReferencePose(rig, pose);
  evaluateWorldPose(rig, pose, world);

  const leftLeg = createLimbRuntime(rig, world, "leftUpperLeg", "leftLowerLeg", "leftFoot", options.maxStretch?.leftLeg, .04);
  const rightLeg = createLimbRuntime(rig, world, "rightUpperLeg", "rightLowerLeg", "rightFoot", options.maxStretch?.rightLeg, .04);
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
  const leftSoleForwardLocal = readReferenceSoleForwardLocal(world, leftLeg.end, leftToesIndex, leftSoleNormalLocal, new Float32Array(3), new Float32Array(4));
  const rightSoleForwardLocal = readReferenceSoleForwardLocal(world, rightLeg.end, rightToesIndex, rightSoleNormalLocal, new Float32Array(3), new Float32Array(4));
  // A rig without mapped toe joints still needs an anticipatory sole probe;
  // otherwise the ankle discovers a stair only after crossing its edge.
  const minimumSoleLength = legLength * .22;
  const leftFootForwardLength = Math.max(minimumSoleLength, measureJointDistance(world, leftLeg.end, leftToesIndex));
  const rightFootForwardLength = Math.max(minimumSoleLength, measureJointDistance(world, rightLeg.end, rightToesIndex));
  const footPlantStanceRatio = options.footPlantStanceRatio;
  const footOrientationResponse = positiveOr(options.footOrientationResponse, 22);
  const pelvisContactResponse = positiveOr(options.pelvisContactResponse, 18);
  const rootHeightResponse = positiveOr(options.rootHeightResponse, 16);
  const armTargetResponse = positiveOr(options.armTargetResponse, 28);
  const armPoleResponse = positiveOr(options.armPoleResponse, 12);
  const maximumPelvisContactDrop = legLength * finiteRangeOr(options.maximumPelvisContactDropRatio, .18, 0, .4);
  const maximumSwingFootLiftRatio = finiteRangeOr(options.maximumSwingFootLiftRatio, .22, .05, .8);
  const minimumLegReachRatio = finiteRangeOr(options.minimumLegReachRatio, .52, .2, .9);
  const leftFootPlant = rig.capabilities.leftFootPlant
    ? createFootPlantSolver({ ground, stanceRatio: footPlantStanceRatio ?? .55, soleOffset: Math.max(0.015, referenceLeftFoot[1]), maxAnchorDistance: legLength * .72, swingTargetResponse: options.footSwingTargetResponse })
    : null;
  const rightFootPlant = rig.capabilities.rightFootPlant
    ? createFootPlantSolver({ ground, stanceRatio: footPlantStanceRatio ?? .55, soleOffset: Math.max(0.015, referenceRightFoot[1]), maxAnchorDistance: legLength * .72, swingTargetResponse: options.footSwingTargetResponse })
    : null;
  const aimJoints = collectMapped(rig, ["spine", "chest", "upperChest", "neck", "head"]);
  const torsoJoints = collectMapped(rig, ["spine", "chest", "upperChest"]);
  const torsoPosture = createHumanoidTorsoPosture({ rig, legLength, hipsIndex: getRigSemanticIndex(rig, "hips"), jointIndices: torsoJoints });
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
  const solvedLeftFootTarget = new Float32Array(3);
  const solvedRightFootTarget = new Float32Array(3);
  const jumpPose = createHumanoidJumpPoseSample();
  const leftArmTarget = new Float32Array(3);
  const rightArmTarget = new Float32Array(3);
  const leftArmSmoothing = createHumanoidArmSmoothingState();
  const rightArmSmoothing = createHumanoidArmSmoothingState();
  const leftPole = new Float32Array(3);
  const rightPole = new Float32Array(3);
  const leftFootPole = new Float32Array(3);
  const rightFootPole = new Float32Array(3);
  const signalVector = new Float32Array(3);
  const quaternion0 = new Float32Array(4);
  const quaternion1 = new Float32Array(4);
  const vector0 = new Float32Array(3);
  const vector1 = new Float32Array(3);
  const vector2 = new Float32Array(3);
  const vector3 = new Float32Array(3);
  const vector4 = new Float32Array(3);
  const leftFootUp = new Float32Array([0, 1, 0]);
  const rightFootUp = new Float32Array([0, 1, 0]);
  const leftFootUpVelocity = new Float32Array(3);
  const rightFootUpVelocity = new Float32Array(3);
  const leftFootForward = new Float32Array([0, 0, 1]);
  const rightFootForward = new Float32Array([0, 0, 1]);
  const leftFootForwardVelocity = new Float32Array(3);
  const rightFootForwardVelocity = new Float32Array(3);
  let aimResult: DistributedAimResult | null = null;
  let poseRootY = motor.state.position.y;
  let poseRootYVelocity = 0;
  let contactPelvisDrop = 0;
  let contactPelvisDropVelocity = 0;
  let contactPelvisRaise = 0;
  let contactPelvisRaiseVelocity = 0;
  const actionState: { id: string | null; phase: number; active: boolean; contactPhase: number | null } = { id: null, phase: 0, active: false, contactPhase: null };
  const metrics = createHumanoidMotionMetrics();
  const state: HumanoidMotionState = {
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
    action: actionState,
  };

  function update(deltaSeconds: number) {
    const dt = finiteNonNegative(deltaSeconds, "humanoid motion deltaSeconds");
    return updatePose(dt, false, false, 0);
  }

  function updateFromPhysics(sample: HumanoidPhysicsMotionSample) {
    if (!sample || typeof sample !== "object") throw new TypeError("humanoid physics motion sample is required");
    const dt = finiteNonNegative(sample.deltaSeconds, "humanoid physics motion deltaSeconds");
    synchronizeMotorFromPhysics(motor, sample, dt);
    return updatePose(dt, true, sample.plannedLocomotionFlight === true, finiteRangeOr(sample.jumpAnticipation, 0, 0, 1));
  }

  function updatePose(dt: number, motorAlreadySampled: boolean, plannedLocomotionFlight: boolean, jumpAnticipation: number) {
    advancePunchControls(controls, dt, actionState);
    if (!motorAlreadySampled) motor.step(dt);
    if (!motor.state.grounded || dt <= 0) {
      poseRootY = motor.state.position.y;
      poseRootYVelocity = 0;
    } else {
      const heightError = poseRootY - motor.state.position.y;
      const heightDecay = Math.exp(-rootHeightResponse * dt);
      const heightImpulse = (poseRootYVelocity + rootHeightResponse * heightError) * dt;
      poseRootY = motor.state.position.y + (heightError + heightImpulse) * heightDecay;
      poseRootYVelocity = (poseRootYVelocity - rootHeightResponse * heightImpulse) * heightDecay;
    }
    const startedAt = now();
    writeReferencePose(rig, pose);
    if (controls.basePose) writeDeformBasePose(pose, controls.basePose, rig.deformCount);
    writeMotionRoot(rig, pose, motor.state.position, motor.state.facing, quaternion0, poseRootY);
    const frame = locomotion.update({
      deltaSeconds: dt,
      resolvedRootDelta: vecToArray(motor.state.resolvedDelta, vector0),
      velocity: vecToArray(motor.state.velocity, vector1),
      facing: vecToArray(motor.state.facing, vector2),
      groundNormal: vecToArray(motor.state.groundNormal, vector3),
      turnRate: motor.state.turnRate,
      isGrounded: motor.state.grounded,
      plannedLocomotionFlight,
      jumpAnticipation,
      legLength,
      hipWidth,
      pace: controls.locomotionPace ?? undefined,
      posture: controls.locomotionPosture,
      cycleDistanceScale: controls.locomotionCycleDistanceScale ?? undefined,
    });
    sampleHumanoidJumpPose({
      motionPhase: frame.motionPhase,
      jumpAnticipation: frame.jumpAnticipation,
      airborneSeconds: frame.airborneSeconds,
      verticalSpeed: frame.verticalSpeed,
      landingWeight: frame.landingWeight,
    }, jumpPose);

    if (proceduralBase) {
      applyBaseBodyPose(
        pose,
        frame,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        quaternion0,
        quaternion1,
      );
      applyCrouchPose(pose, frame, legLength, hipsIndex, torsoJoints, leftLeg, rightLeg, quaternion0, quaternion1);
    }
    applyAirborneAndLandingPose(pose, jumpPose, legLength, hipsIndex, torsoJoints, quaternion0, quaternion1);
    applyActionPose(pose, rig, controls.actionPose, controls.actionPhase, quaternion0, quaternion1);
    evaluateWorldPose(rig, pose, world);
    if (proceduralBase) {
      torsoPosture.apply(pose, world, frame, motor.state.facing, quaternion0);
      evaluateWorldPose(rig, pose, world);
    }
    aimResult = applyAim(pose, world, aimSolver, headIndex, motor.state.facing, controls.aimTarget, controls.aimWeight);
    preparePunchHandTarget(controls, world, leftArm, rightArm, motor.state.facing, vector4);
    recoilSolver?.update(dt, pose);
    // Clamp the authored/base layers before contact and prop constraints. IK
    // must remain authoritative or feet and two-handed grips visibly drift.
    metrics.jointLimitsClamped = jointLimitSolver?.apply(pose).clampedJointCount ?? 0;

    evaluateWorldPose(rig, pose, world);
    const stanceRatio = footPlantStanceRatio ?? frame.stanceRatio;
    // Gait targets continue through takeoff and flight. The root follows the
    // authoritative physics parabola while existing foot/arm springs preserve
    // incoming phase and velocity, then blend back into the outgoing stride.
    const leftFootResult = proceduralBase ? prepareFootTarget(leftLeg, leftFootPlant, frame.gaitPhase, stanceRatio, frame.left.footLift, frame.leftFootTarget, referenceLeftFoot, frame.locomotionWeight, frame.targetLocomotionWeight, motor, world, poseRootY, proposedLeftFoot, leftFootPole, 1, leftFootForwardLength, plannedLocomotionFlight, dt, maximumPelvisContactDrop, maximumSwingFootLiftRatio) : null;
    const rightFootResult = proceduralBase ? prepareFootTarget(rightLeg, rightFootPlant, frame.gaitPhase + 0.5, stanceRatio, frame.right.footLift, frame.rightFootTarget, referenceRightFoot, frame.locomotionWeight, frame.targetLocomotionWeight, motor, world, poseRootY, proposedRightFoot, rightFootPole, -1, rightFootForwardLength, plannedLocomotionFlight, dt, maximumPelvisContactDrop, maximumSwingFootLiftRatio) : null;
    const requiredPelvisRaise = Math.max(
      requiredContactPelvisRaise(world, leftLeg, leftFootResult, minimumLegReachRatio, resolvedSwingFootLift(frame.gaitPhase, stanceRatio, frame.left.footLift, leftLeg.length, frame.locomotionWeight, maximumSwingFootLiftRatio)),
      requiredContactPelvisRaise(world, rightLeg, rightFootResult, minimumLegReachRatio, resolvedSwingFootLift(frame.gaitPhase + .5, stanceRatio, frame.right.footLift, rightLeg.length, frame.locomotionWeight, maximumSwingFootLiftRatio)),
    );
    if (requiredPelvisRaise >= contactPelvisRaise) {
      // Rising support is a collision constraint. The forward sole probe makes
      // it anticipatory; delaying the remaining pelvis clearance would still
      // fold the knee or drive the foot through the new surface.
      contactPelvisRaise = requiredPelvisRaise;
      contactPelvisRaiseVelocity = 0;
    } else if (dt > 0) {
      const error = contactPelvisRaise - requiredPelvisRaise;
      const decay = Math.exp(-pelvisContactResponse * dt);
      const impulse = (contactPelvisRaiseVelocity + pelvisContactResponse * error) * dt;
      contactPelvisRaise = requiredPelvisRaise + (error + impulse) * decay;
      contactPelvisRaiseVelocity = (contactPelvisRaiseVelocity - pelvisContactResponse * impulse) * decay;
    } else {
      contactPelvisRaise = requiredPelvisRaise;
      contactPelvisRaiseVelocity = 0;
    }
    if (applyContactPelvisOffset(pose, hipsIndex, contactPelvisRaise)) evaluateWorldPose(rig, pose, world);
    const requiredPelvisDrop = Math.max(
      requiredContactPelvisDrop(world, leftLeg, leftFootResult),
      requiredContactPelvisDrop(world, rightLeg, rightFootResult),
    );
    if (requiredPelvisDrop >= contactPelvisDrop) {
      contactPelvisDrop = requiredPelvisDrop;
      contactPelvisDropVelocity = 0;
    } else if (dt > 0) {
      const error = contactPelvisDrop - requiredPelvisDrop;
      const decay = Math.exp(-pelvisContactResponse * dt);
      const impulse = (contactPelvisDropVelocity + pelvisContactResponse * error) * dt;
      contactPelvisDrop = requiredPelvisDrop + (error + impulse) * decay;
      contactPelvisDropVelocity = (contactPelvisDropVelocity - pelvisContactResponse * impulse) * decay;
    } else {
      contactPelvisDrop = requiredPelvisDrop;
      contactPelvisDropVelocity = 0;
    }
    if (applyContactPelvisOffset(pose, hipsIndex, -contactPelvisDrop)) {
      evaluateWorldPose(rig, pose, world);
    }
    // World-space semantic hand goals are portable across imported rigs. A
    // local-axis shoulder rotation can look correct on the synthetic test rig
    // while doing nothing—or folding inward—on a differently oriented glTF.
    solveArm(leftArm, 1, pose, world, frame.left.armSwing, frame.locomotionWeight, frame.paceIntensity, frame.paceBlend, frame.gaitPhase, frame.localTravelDirection, motor.state.facing, jumpPose.airborneArmWeight, jumpPose.airborneArmPhase, controls.hasLeftHandTarget ? controls.leftHandGripTarget : null, controls.hasLeftHandTarget ? controls.handTargetWeight : 0, leftArmTarget, leftPole, leftArmSmoothing, dt, armTargetResponse, armPoleResponse);
    solveArm(rightArm, -1, pose, world, frame.right.armSwing, frame.locomotionWeight, frame.paceIntensity, frame.paceBlend, frame.gaitPhase + .5, frame.localTravelDirection, motor.state.facing, jumpPose.airborneArmWeight, jumpPose.airborneArmPhase, controls.hasRightHandTarget ? controls.rightHandGripTarget : null, controls.hasRightHandTarget ? controls.handTargetWeight : 0, rightArmTarget, rightPole, rightArmSmoothing, dt, armTargetResponse, armPoleResponse);
    if (proceduralBase) {
      solvePreparedFoot(leftLeg, leftFootResult, pose, leftFootPole, minimumLegReachRatio, solvedLeftFootTarget);
      solvePreparedFoot(rightLeg, rightFootResult, pose, rightFootPole, minimumLegReachRatio, solvedRightFootTarget);
    }

    if (proceduralBase) {
      alignFootToContact(rig, leftLeg.end, leftSoleNormalLocal, leftSoleForwardLocal, leftFootPlant?.result ?? null, frame.gaitPhase, stanceRatio, frame.localTravelDirection, motor.state.facing, undefined, pose, world, quaternion0, quaternion1, vector0, vector1, vector2, vector3, vector4, leftFootUp, leftFootUpVelocity, leftFootForward, leftFootForwardVelocity, footOrientationResponse, dt);
      alignFootToContact(rig, rightLeg.end, rightSoleNormalLocal, rightSoleForwardLocal, rightFootPlant?.result ?? null, frame.gaitPhase + 0.5, stanceRatio, frame.localTravelDirection, motor.state.facing, undefined, pose, world, quaternion0, quaternion1, vector0, vector1, vector2, vector3, vector4, rightFootUp, rightFootUpVelocity, rightFootForward, rightFootForwardVelocity, footOrientationResponse, dt);
      const leftToePitch = sampleSwingToePitchRadians(frame.gaitPhase, stanceRatio, leftFootPlant?.result.planted === true);
      const rightToePitch = sampleSwingToePitchRadians(frame.gaitPhase + .5, stanceRatio, rightFootPlant?.result.planted === true);
      applyToePitch(rig, leftLeg.end, leftToesIndex, leftSoleNormalLocal, leftSoleForwardLocal, leftToePitch, pose, world, quaternion0, vector0, vector1, vector2);
      applyToePitch(rig, rightLeg.end, rightToesIndex, rightSoleNormalLocal, rightSoleForwardLocal, rightToePitch, pose, world, quaternion0, vector0, vector1, vector2);
    }
    evaluateWorldPose(rig, pose, world);
    updateMetrics(metrics, world, leftLeg.end, rightLeg.end, leftFootPlant?.result ?? null, rightFootPlant?.result ?? null);
    metrics.poseFinite = isFinitePose(pose);
    metrics.poseTimeMs = now() - startedAt;
    metrics.maxPoseTimeMs = Math.max(metrics.maxPoseTimeMs, metrics.poseTimeMs);
    writeStandardSignals(signals, motor, frame, controls.aimTarget, controls.aimWeight, controls.actionId, controls.actionPhase, signalVector);
    return state;
  }

  function reset() {
    motor.reset();
    locomotion.reset();
    leftFootPlant?.reset();
    rightFootPlant?.reset();
    recoilSolver?.reset();
    resetHumanoidControlState(controls);
    metrics.poseTimeMs = 0;
    metrics.maxPoseTimeMs = 0;
    metrics.footSlipDistance = 0;
    metrics.plantedVerticalError = 0;
    metrics.poseFinite = true;
    metrics.jointLimitsClamped = 0;
    actionState.id = null;
    actionState.phase = 0;
    actionState.active = false;
    actionState.contactPhase = null;
    leftFootUp.set(UP);
    rightFootUp.set(UP);
    leftFootUpVelocity.fill(0);
    rightFootUpVelocity.fill(0);
    leftFootForward.set(Z_AXIS);
    rightFootForward.set(Z_AXIS);
    leftFootForwardVelocity.fill(0);
    rightFootForwardVelocity.fill(0);
    resetHumanoidArmSmoothingState(leftArmSmoothing);
    resetHumanoidArmSmoothingState(rightArmSmoothing);
    contactPelvisDrop = 0;
    contactPelvisDropVelocity = 0;
    contactPelvisRaise = 0;
    contactPelvisRaiseVelocity = 0;
    poseRootY = motor.state.position.y;
    poseRootYVelocity = 0;
    writeReferencePose(rig, pose);
    writeMotionRoot(rig, pose, motor.state.position, motor.state.facing, quaternion0);
    signals.reset();
    // A reset is a stable ready pose, not a raw rig followed by a one-frame
    // ground-contact correction on the next update.
    return proceduralBase ? solveReadyPose() : state;
  }

  function solveReadyPose() {
    // The first pass lets a newly created/reset motor sample ground before any
    // presentation constraint treats its default airborne flag as authoritative.
    // The remaining passes establish foot anchors, then evaluate the dependent
    // pelvis and upper-body posture. This bounded warm start prevents those
    // dependencies from appearing as visible one-frame corrections.
    updatePose(0, false, false, 0);
    updatePose(0, true, false, 0);
    return updatePose(0, true, false, 0);
  }

  // The object is immediately renderable. Establish default ground contacts
  // before returning so the first movement sample blends from the same solved
  // ready pose users saw while idle.
  if (proceduralBase) solveReadyPose();
  return createHumanoidControllerCommands({
    rig,
    motor,
    state,
    controls,
    leftFootPlant,
    rightFootPlant,
    recoilSolver,
    update,
    updateFromPhysics,
    reset,
  });
}

function synchronizeMotorFromPhysics(
  motor: CharacterMotor3D,
  sample: HumanoidPhysicsMotionSample,
  deltaSeconds: number,
) {
  requireVec3(sample.position, "humanoid physics position");
  requireVec3(sample.velocity, "humanoid physics velocity");
  requireVec3(sample.resolvedRootDelta, "humanoid physics resolvedRootDelta");
  if (typeof sample.grounded !== "boolean") throw new TypeError("humanoid physics grounded must be boolean");
  if (sample.plannedLocomotionFlight !== undefined && typeof sample.plannedLocomotionFlight !== "boolean") throw new TypeError("humanoid physics plannedLocomotionFlight must be boolean");
  if (sample.jumpAnticipation !== undefined && (!Number.isFinite(sample.jumpAnticipation) || sample.jumpAnticipation < 0 || sample.jumpAnticipation > 1)) throw new RangeError("humanoid physics jumpAnticipation must be between 0 and 1");
  if (sample.groundNormal !== undefined) requireVec3(sample.groundNormal, "humanoid physics groundNormal");
  if (sample.facing !== undefined) requireVec3(sample.facing, "humanoid physics facing");
  const state = motor.state;
  const priorX = state.velocity.x, priorY = state.velocity.y, priorZ = state.velocity.z;
  writeVec3(state.position, sample.position);
  writeVec3(state.velocity, sample.velocity);
  writeVec3(state.desiredVelocity, sample.velocity);
  writeVec3(state.resolvedDelta, sample.resolvedRootDelta);
  if (deltaSeconds > 0) {
    state.acceleration.x = (state.velocity.x - priorX) / deltaSeconds;
    state.acceleration.y = (state.velocity.y - priorY) / deltaSeconds;
    state.acceleration.z = (state.velocity.z - priorZ) / deltaSeconds;
  } else state.acceleration.x = state.acceleration.y = state.acceleration.z = 0;
  const normal = sample.groundNormal ?? UP;
  const normalX = vec3Component(normal, 0, "x"), normalY = vec3Component(normal, 1, "y"), normalZ = vec3Component(normal, 2, "z");
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (normalLength <= 1e-8) {
    state.groundNormal.x = 0;
    state.groundNormal.y = 1;
    state.groundNormal.z = 0;
  } else {
    state.groundNormal.x = normalX / normalLength;
    state.groundNormal.y = normalY / normalLength;
    state.groundNormal.z = normalZ / normalLength;
  }
  state.grounded = sample.grounded;
  if (sample.facing !== undefined) motor.setFacing(sample.facing);
  else if (Math.hypot(vec3Component(sample.velocity, 0, "x"), vec3Component(sample.velocity, 2, "z")) > 1e-8) motor.setFacing(sample.velocity);
  const turnRate = sample.turnRate ?? 0;
  if (!Number.isFinite(turnRate)) throw new TypeError("humanoid physics turnRate must be finite");
  state.turnRate = turnRate;
}

function requireVec3(value: Vec3Input, label: string) {
  if (!value || !Number.isFinite(vec3Component(value, 0, "x")) || !Number.isFinite(vec3Component(value, 1, "y")) || !Number.isFinite(vec3Component(value, 2, "z"))) throw new TypeError(`${label} must contain three finite values`);
}

function writeVec3(target: { x: number; y: number; z: number }, source: Vec3Input) {
  target.x = vec3Component(source, 0, "x");
  target.y = vec3Component(source, 1, "y");
  target.z = vec3Component(source, 2, "z");
}

function vec3Component(value: Vec3Input, index: 0 | 1 | 2, key: "x" | "y" | "z") {
  return "x" in value && "y" in value && "z" in value ? Number(value[key]) : Number(value[index]);
}

function advancePunchControls(
  controls: ReturnType<typeof createHumanoidControlState>,
  deltaSeconds: number,
  action: { id: string | null; phase: number; active: boolean; contactPhase: number | null },
) {
  const plan = controls.punchPlan;
  if (!plan) {
    action.id = controls.actionId;
    action.phase = controls.actionPhase;
    action.active = false;
    action.contactPhase = null;
    return;
  }
  controls.punchElapsedSeconds += deltaSeconds;
  const timePhase = Math.min(1, controls.punchElapsedSeconds / (plan.totalFrames / 60));
  const phases = plan.phases;
  controls.actionPhase = timePhase <= phases.anticipation
    ? remap(timePhase, 0, phases.anticipation, 0, .28)
    : timePhase <= phases.contact
      ? remap(timePhase, phases.anticipation, phases.contact, .28, .62)
      : timePhase <= phases.followThrough
        ? remap(timePhase, phases.contact, phases.followThrough, .62, .78)
        : remap(timePhase, phases.followThrough, 1, .78, 1);
  action.id = controls.actionId;
  action.phase = controls.actionPhase;
  action.active = timePhase < 1;
  action.contactPhase = phases.contact;
}

function preparePunchHandTarget(
  controls: ReturnType<typeof createHumanoidControlState>,
  world: WorldPose,
  leftArm: LimbRuntime,
  rightArm: LimbRuntime,
  facing: { x: number; y: number; z: number },
  guard: Float32Array,
) {
  const plan = controls.punchPlan;
  if (!plan) return;
  const limb = plan.intent.hand === "left" ? leftArm : rightArm;
  const guardLimb = plan.intent.hand === "left" ? rightArm : leftArm;
  if (!limb.solver || limb.end < 0 || !guardLimb.solver || guardLimb.end < 0) return;
  const target = plan.intent.hand === "left" ? controls.leftHandGripTarget : controls.rightHandGripTarget;
  const guardTarget = plan.intent.hand === "left" ? controls.rightHandGripTarget : controls.leftHandGripTarget;
  if (!controls.hasPunchStartTarget) {
    readPosition(world, limb.end, controls.punchStartTarget);
    controls.hasPunchStartTarget = true;
  }
  if (!controls.hasPunchGuardStartTarget) {
    readPosition(world, guardLimb.end, controls.punchGuardStartTarget);
    controls.hasPunchGuardStartTarget = true;
  }
  const start = controls.punchStartTarget, contact = plan.intent.target;
  let dx = contact[0] - start[0], dy = contact[1] - start[1], dz = contact[2] - start[2];
  const length = Math.max(1e-6, Math.hypot(dx, dy, dz)); dx /= length; dy /= length; dz /= length;
  const side = plan.intent.hand === "left" ? 1 : -1, rightX = facing.z, rightZ = -facing.x;
  const styleArc = plan.intent.style === "hook" ? .16 : plan.intent.style === "overhand" ? .09 : .035;
  const windupDistance = Math.min(.24, Math.max(.09, plan.intent.distanceMeters * .28));
  const windup: readonly [number, number, number] = [start[0] - dx * windupDistance + rightX * side * styleArc, start[1] - dy * windupDistance + (plan.intent.style === "overhand" ? .13 : -.025), start[2] - dz * windupDistance + rightZ * side * styleArc];
  const followDistance = Math.min(.24, Math.max(.08, plan.intent.distanceMeters * .24));
  const follow: readonly [number, number, number] = [contact[0] + dx * followDistance - rightX * side * styleArc * .35, contact[1] + dy * followDistance - (plan.intent.style === "overhand" ? .08 : 0), contact[2] + dz * followDistance - rightZ * side * styleArc * .35];
  const phase = controls.actionPhase;
  if (phase <= .28) interpolate3(start, windup, smooth01(phase / .28), target);
  else if (phase < .6) interpolate3(windup, contact, smooth01((phase - .28) / .32), target);
  else if (phase <= .65) target.set(contact);
  else if (phase <= .78) interpolate3(contact, follow, smooth01((phase - .65) / .13), target);
  else interpolate3(follow, start, smooth01((phase - .78) / .22), target);
  const guardSide = plan.intent.hand === "left" ? -1 : 1;
  const guardShoulder = guardLimb.upper * 3;
  guard[0] = world.translations[guardShoulder]! - rightX * guardSide * guardLimb.length * .18 + facing.x * guardLimb.length * .42;
  guard[1] = world.translations[guardShoulder + 1]! + guardLimb.length * .09;
  guard[2] = world.translations[guardShoulder + 2]! - rightZ * guardSide * guardLimb.length * .18 + facing.z * guardLimb.length * .42;
  if (phase <= .28) interpolate3(controls.punchGuardStartTarget, guard, smooth01(phase / .28), guardTarget);
  else if (phase <= .78) guardTarget.set(guard);
  else interpolate3(guard, controls.punchGuardStartTarget, smooth01((phase - .78) / .22), guardTarget);
  const recoveryWeight = phase <= .78 ? 1 : 1 - smooth01((phase - .78) / .22);
  controls.handTargetWeight = recoveryWeight;
  controls.hasLeftHandTarget = recoveryWeight > 1e-5;
  controls.hasRightHandTarget = recoveryWeight > 1e-5;
}

function interpolate3(from: ArrayLike<number>, to: ArrayLike<number>, amount: number, out: Float32Array) {
  out[0] = lerp(from[0], to[0], amount);
  out[1] = lerp(from[1], to[1], amount);
  out[2] = lerp(from[2], to[2], amount);
}


function remap(value: number, fromStart: number, fromEnd: number, toStart: number, toEnd: number) { return fromEnd - fromStart <= 1e-9 ? toEnd : lerp(toStart, toEnd, (value - fromStart) / (fromEnd - fromStart)); }

function createHumanoidMotionMetrics(): HumanoidMotionMetrics {
  return {
    poseTimeMs: 0,
    maxPoseTimeMs: 0,
    footSlipDistance: 0,
    plantedVerticalError: 0,
    poseFinite: true,
    jointLimitsClamped: 0,
  };
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
  extensionMarginRatio = 0,
): LimbRuntime {
  const upper = getRigSemanticIndex(rig, upperSemantic);
  const middle = getRigSemanticIndex(rig, middleSemantic);
  const end = getRigSemanticIndex(rig, endSemantic);
  const complete = upper >= 0 && middle >= 0 && end >= 0 && new Set([upper, middle, end]).size === 3;
  return {
    upper,
    middle,
    end,
    solver: complete ? createPoseTwoBoneIKSolver({ rig, world, rootIndex: upper, middleIndex: middle, endIndex: end, maxStretch, extensionMarginRatio }) : null,
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

function measureJointDistance(world: WorldPose, from: number, to: number) {
  if (from < 0 || to < 0) return 0;
  const fromOffset = from * 3, toOffset = to * 3;
  return Math.hypot(
    world.translations[toOffset] - world.translations[fromOffset],
    world.translations[toOffset + 1] - world.translations[fromOffset + 1],
    world.translations[toOffset + 2] - world.translations[fromOffset + 2],
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
  rootY = position.y,
) {
  const translationOffset = rig.motionRootIndex * 3;
  pose.translations[translationOffset] = position.x;
  pose.translations[translationOffset + 1] = rootY;
  pose.translations[translationOffset + 2] = position.z;
  quaternionFromAxisAngle(UP, Math.atan2(facing.x, facing.z), scratch);
  pose.rotations.set(scratch, rig.motionRootIndex * 4);
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

function positiveOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteRangeOr(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}
