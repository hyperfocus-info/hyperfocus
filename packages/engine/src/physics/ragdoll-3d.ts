import { requireText } from "@hyperfocus/utilities/text";
import { atan2, cos, hypot, sin } from '../math/simulation.ts';
import { tuple3 } from "../math/tuples.ts";
import { closestExpandedSupportPoint3D, resolveSupportAwareEffectorPath3D } from "./ragdoll-3d-balance.ts";
import { classifyRagdollPosture3D, findRagdollRecoveryBodyObstruction3D, hasStableRagdollRecoverySupport3D, inspectRagdollRecoveryEnvironment3D, type RagdollPosture3D, type RagdollRecoveryBlocker3D, type RagdollRecoveryEnvironmentInspection3D } from "./ragdoll-3d-recovery.ts";
import { bodyRotation, bodyWorldPoint, capturePhysicalPose, clampVector, clearSupports, configureMotors, driveBalance, driveRecoveryRoot, driveSteps, finishSteps, finite, multiplyRotation, projectRecoveryBodyClearance, quaternion, quaternionAt, recoveryEnvironmentBlocker, requireBody, requireBone, rotationError, smootherstep, type BalanceBuffers, type NormalizedRecovery, type NormalizedStep, type RagdollState } from "./ragdoll/step-control.ts";
import { conjugateQuaternion as inverseRotation, rotateQuaternionVector3 as rotate } from "../math/quaternion.ts";
import { type RigidBodyDefinition3D, type RigidBodyState3D, type RigidContact3D, type RigidMaterialPresetId3D, type RigidRaycastHit3D, type RigidWorld3D } from "./rigid-3d.ts";
import { rigidMaterialPreset3D } from "./rigid/materials.ts";

export { classifyRagdollPosture3D,type RagdollPosture3D,type RagdollRecoveryEnvironment3D,type RagdollRecoveryEnvironmentInspection3D } from "./ragdoll-3d-recovery.ts";

export type RagdollMode3D = "animated" | "active" | "passive" | "settled" | "recovering";
export type RagdollLocomotionState3D = "grounded" | "airborne" | "landing" | "untracked";
export type RagdollAuthorityState3D = "ready" | "staggered" | "downed" | "recovering";
export type RagdollPose3D = { rotations: ArrayLike<number> };
export type RagdollActuationMode3D = "whole-body" | "external";
export type RagdollActuatedImpulse3D = { boneId: string; impulse: readonly [number, number, number]; point?: readonly [number, number, number]; actuation?: RagdollActuationMode3D };
export type RagdollActuatedAngularVelocity3D = { boneId: string; angularVelocity: readonly [number, number, number]; actuation?: RagdollActuationMode3D };
export type RagdollJointDrive3D = { jointId: string; axisParentLocal: readonly [number, number, number]; targetAngularVelocity: number; maxTorqueImpulse: number };
export type RagdollEffectorDrive3D = {
  effectorBoneId: string;
  jointIds: readonly string[];
  /** Optional stable base body for a joint path that may traverse authored joints in either direction. */
  baseBoneId?: string;
  targetVelocity: readonly [number, number, number];
  velocityGain?: number;
  maxTorqueImpulse: number;
  /** Optional absolute world angular velocity reached with internal articulated torque. */
  targetAngularVelocity?: readonly [number, number, number];
  /** Total bounded torque impulse shared across the connected chain. */
  maxAngularTorqueImpulse?: number;
};
export type RagdollSwingTwistLimit3D = { twistAxis: ArrayLike<number>; maxSwingRadians: number; minTwistRadians: number; maxTwistRadians: number };
export type RagdollLocomotionPolicy3D = {
  supportBoneIds: readonly string[];
  groundLayerMask?: number;
  probeDistance?: number;
  minimumNormalY?: number;
  maximumGroundedVerticalSpeedMetersPerSecond?: number;
  minimumLandingSpeedMetersPerSecond?: number;
  fullImpactLandingSpeedMetersPerSecond?: number;
  landingDurationSeconds?: number;
  /** Lowest retained motor authority at a full-impact landing. */
  landingMotorYield?: number;
};
export type RagdollLandingStatus3D = { boneId: string; surfaceBodyId: string; point: [number, number, number]; impactSpeedMetersPerSecond: number; impactEnergyJoules: number; normalImpulseNewtonSeconds: number; severity: number; progress: number };
export type RagdollImpactResponsePolicy3D = { minimumStaggerSpeedMetersPerSecond?: number; knockdownSpeedMetersPerSecond?: number; staggerDurationSeconds?: number; /** Lowest retained motor authority immediately after the strongest non-knockdown hit. */ staggerMotorYield?: number };
export type RagdollImpactResponseStatus3D = { impactSpeedMetersPerSecond: number; impactEnergyJoules: number; normalImpulseNewtonSeconds: number; severity: number; progress: number };
export type RagdollImpactResponseResult3D = { response: "ignored" | "staggered" | "knocked-down"; severity: number };
export type RagdollDefinition3D = {
  id: string;
  /** First performance frame where this rig becomes dynamic and collidable. Defaults to zero. */
  activationFrame?: number;
  /** Performance follows the sampled clip pose; initial keeps physics intent authoritative and deterministic without clip motor steering. */
  motorPoseSource?: "performance" | "initial";
  rootBoneId: string;
  bodies: Array<{ boneId: string; body: Omit<RigidBodyDefinition3D, "id" | "type"> }>;
  joints: Array<{
    id: string;
    parentBoneId: string;
    childBoneId: string;
    poseJointIndex: number;
    localAnchorParent?: ArrayLike<number>;
    localAnchorChild?: ArrayLike<number>;
    anchorStiffness?: number;
    breakImpulse?: number;
    motorStiffness?: number;
    motorDamping?: number;
    maxTorqueImpulse?: number;
    /** Symmetric angular cone around the canonical initial relative rotation. */
    angularLimitRadians?: number;
    /** Anatomical envelope around the canonical pose. Takes precedence over the symmetric cone. */
    swingTwistLimit?: RagdollSwingTwistLimit3D;
    angularLimitStiffness?: number;
    angularLimitDamping?: number;
    maxLimitTorqueImpulse?: number;
  }>;
  initialPose: RagdollPose3D;
  activeMotorWeight?: number;
  minimumTransitionSeconds?: number;
  settleLinearSpeed?: number;
  settleAngularSpeed?: number;
  settleDurationSeconds?: number;
  recoveryPositionTolerance?: number;
  recoveryAngularSpeed?: number;
  maxRootImpulse?: number;
  maxRootTorqueImpulse?: number;
  /** Optional semantic ground authority. Omitted legacy rigs remain explicitly untracked. */
  locomotion?: RagdollLocomotionPolicy3D;
  /** Optional measured-contact authority. Omitted legacy rigs retain explicit launch behavior. */
  impactResponse?: RagdollImpactResponsePolicy3D;
};

export type RagdollRecoveryTarget3D = {
  pose: RagdollPose3D;
  rootPosition: readonly [number, number, number];
  rootRotation: readonly [number, number, number, number];
  durationSeconds?: number;
  /** Explicit acknowledgement required before joint motor targets may bypass their protected ease. */
  poseTransition?: "blend" | "cut";
  /** Time used to ease joint motor targets from the settled physical pose into animation. Defaults to durationSeconds and is clamped to the ragdoll minimum unless poseTransition is cut. */
  poseBlendSeconds?: number;
  /** Recovery remains physical until these bodies can reach stable ground. */
  requireStableSupport?: boolean;
  supportBoneIds?: readonly string[];
  groundLayerMask?: number;
  supportProbeDistance?: number;
  minimumSupportNormalY?: number;
  /** Conservative root-collider clearance added around the requested stand pose. */
  clearancePadding?: number;
};

export type RagdollRecoveryInspection3D = { ready: boolean; blocker?: "obstructed"; obstructingBodyId?: string; obstructedBoneId?: string; obstructionPhase?: "path" | "target" };
export type RagdollRecoveryEnvironmentOptions3D = { proximityMeters?: number; standingHeadroomMeters?: number; ledgeProbeDistance?: number; ledgeHeightTolerance?: number };

export type RagdollSupportIntent3D = {
  id: string;
  boneId: string;
  groundLayerMask?: number;
  probeDistance?: number;
  minimumNormalY?: number;
  maximumPlantSpeed?: number;
  stiffness?: number;
  damping?: number;
  maxImpulse?: number;
  breakImpulse?: number;
  /** Circular footprint added around the convex hull of planted contacts. */
  balanceRadiusMeters?: number;
  balanceStiffness?: number;
  balanceDamping?: number;
  /** Per-fixed-step controller impulse. Zero disables center-of-mass balance. */
  maxBalanceImpulse?: number;
  /** Forecast horizon used to brace before momentum carries the center of mass outside support. */
  predictionSeconds?: number;
  /** Whole-body is the ordinary path; root is retained as an expert compatibility option. */
  forceDistribution?: "whole-body" | "root";
};

export type RagdollSupportStatus3D = {
  id: string;
  boneId: string;
  planted: boolean;
  targetBodyId?: string;
  point?: [number, number, number];
};

export type RagdollStepIntent3D = {
  id: string;
  boneId: string;
  direction: readonly [number, number, number];
  speedMetersPerSecond: number;
  predictionSeconds?: number;
  maximumDistance?: number;
  durationSeconds?: number;
  liftHeight?: number;
  groundLayerMask?: number;
  probeHeight?: number;
  probeDistance?: number;
  minimumNormalY?: number;
  stiffness?: number;
  damping?: number;
  maximumDriveImpulse?: number;
  landingTolerance?: number;
  maximumLandingSpeed?: number;
  /** Explicitly permits the swing to release the final planted foot during a planned running flight phase. */
  allowFlight?: boolean;
};
export type RagdollStepStatus3D = { id: string; boneId: string; state: "moving" | "planted" | "contained" | "missed"; target?: [number, number, number]; reason?: string };
export type RagdollRootMotionIntent3D = {
  delta: readonly [number, number, number];
  durationSeconds: number;
  maxImpulse?: number;
  /** Optional horizontal facing held by bounded physical root torque. */
  facing?: readonly [number, number, number];
};

export type RagdollTakeoffIntent3D = {
  supportBoneIds: readonly string[];
  velocity: readonly [number, number, number];
  groundLayerMask?: number;
  probeDistance?: number;
  minimumNormalY?: number;
  maximumGroundedVerticalSpeedMetersPerSecond?: number;
};
export type RagdollTakeoffStatus3D = { launched: boolean; reason?: string };

export type RagdollStatus3D = {
  id: string;
  mode: RagdollMode3D;
  locomotionState: RagdollLocomotionState3D;
  authorityState: RagdollAuthorityState3D;
  landing?: RagdollLandingStatus3D;
  impactResponse?: RagdollImpactResponseStatus3D;
  motorWeight: number;
  settledSeconds: number;
  recoveryProgress: number;
  recoveryBlocker?: RagdollRecoveryBlocker3D;
  root: RigidBodyState3D;
};

export type HumanoidRagdollPreset3D = "agile" | "balanced" | "heavy";
export type HumanoidRagdollBone3D = {
  id: string;
  parentId?: string;
  /** Model-space rest pose captured from the canonical cooked rig. */
  restPosition: readonly [number, number, number];
  /** Model-space normalized xyzw rest rotation captured from the canonical cooked rig. */
  restRotation: readonly [number, number, number, number];
};
export type HumanoidRagdollBuild3D = {
  definition: RagdollDefinition3D;
  physicalRootBoneId: string;
  bodyBoneIds: string[];
  rootBinding: { positionOffset: [number, number, number]; rotationOffset: [number, number, number, number] };
};

/** Expands one inspected humanoid rest pose into ordinary deterministic ragdoll data. */
export function createHumanoidRagdoll3D(options: {
  id: string;
  rootBoneId: string;
  bones: readonly HumanoidRagdollBone3D[];
  entityPosition: readonly [number, number, number];
  entityRotationY?: number;
  entityScale?: readonly [number, number, number];
  preset?: HumanoidRagdollPreset3D;
  materialPreset?: RigidMaterialPresetId3D;
  totalMassKg?: number;
  collisionLayer?: number;
}): HumanoidRagdollBuild3D {
  const id = text(options?.id, "ragdoll id"), declaredRoot = text(options?.rootBoneId, "rootBoneId");
  if (!Array.isArray(options?.bones) || options.bones.length < 6 || options.bones.length > 1_024) throw new RangeError("Automatic humanoid rigging needs 6 through 1024 inspected bones.");
  const byId = new Map<string, HumanoidRagdollBone3D>();
  for (const source of options.bones) {
    const boneId = text(source.id, "bone id");
    if (byId.has(boneId)) throw new Error(`Automatic humanoid rig repeats stable bone ${boneId}.`);
    byId.set(boneId, { id: boneId, ...(source.parentId ? { parentId: text(source.parentId, `${boneId} parentId`) } : {}), restPosition: vector3(source.restPosition, `${boneId} restPosition`), restRotation: quaternion(source.restRotation, `${boneId} restRotation`) });
  }
  if (!byId.has(declaredRoot)) throw new Error(`Automatic humanoid rig cannot find declared root bone ${declaredRoot}.`);
  for (const bone of byId.values()) if (bone.parentId && !byId.has(bone.parentId)) throw new Error(`Automatic humanoid rig bone ${bone.id} has missing parent ${bone.parentId}.`);
  const physicalRoot = [...byId.values()].find((bone) => /(^|[^a-z])(hips?|pelvis)([^a-z]|$)/i.test(bone.id) && descendantOf(bone.id, declaredRoot, byId)) ?? byId.get(declaredRoot)!;
  const selected = [...byId.values()].filter((bone) => bone.id === physicalRoot.id || descendantOf(bone.id, physicalRoot.id, byId) && humanoidRole(bone.id) !== "ignore").slice(0, 32);
  if (selected.length < 6) throw new Error("Automatic humanoid rigging could not identify enough major bones. Reinspect a named humanoid rig or add bodies and joints in expert setup.");
  const entityPosition = vector3(options.entityPosition, "entityPosition"), scale = vector3(options.entityScale ?? [1, 1, 1], "entityScale");
  if (scale.some((value) => value <= 0)) throw new RangeError("entityScale components must be positive.");
  const yaw = finite(options.entityRotationY ?? 0, "entityRotationY"), yawRotation = [0, sin(yaw / 2), 0, cos(yaw / 2)] as const;
  const transforms = new Map(selected.map((bone) => {
    const modelPosition = multiply3(bone.restPosition, scale), position = add3(entityPosition, rotate(yawRotation, modelPosition));
    return [bone.id, { position, rotation: multiplyRotation(yawRotation, bone.restRotation) }] as const;
  }));
  const ys = [...transforms.values()].map((value) => value.position[1]), height = Math.max(...ys) - Math.min(...ys);
  if (!(height >= .2 && height <= 12)) throw new RangeError(`Inspected humanoid height is ${height.toFixed(3)} world units; rescale the character into the supported 0.2m through 12m range before automatic rigging.`);
  // These are per-fixed-step angular impulses, not animation-strength labels.
  // A 120 Hz character receives the budget every solver step; whole-number
  // impulses inject combat-scale angular momentum into ordinary gait poses.
  const preset = options.preset ?? "balanced", tuning = preset === "agile" ? { mass: 64, stiffness: .82, damping: .96, torque: .16 } : preset === "heavy" ? { mass: 108, stiffness: .7, damping: .985, torque: .28 } : { mass: 78, stiffness: .76, damping: .975, torque: .22 }, material = rigidMaterialPreset3D(options.materialPreset ?? "character");
  const totalMass = positive(options.totalMassKg ?? tuning.mass, "totalMassKg"), layer = collisionLayer(options.collisionLayer ?? 2), mask = (~layer) >>> 0;
  const weights = selected.map((bone) => massWeight(humanoidRole(bone.id))), weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const bodies = selected.map((bone, index) => {
    const transform = transforms.get(bone.id)!, role = humanoidRole(bone.id), radius = Math.max(.025, Math.min(height * .16, height * radiusFactor(role)));
    return { boneId: bone.id, body: { shape: { kind: "sphere" as const, radius }, x: transform.position[0], y: transform.position[1], z: transform.position[2], rotation: transform.rotation, mass: totalMass * weights[index]! / weightTotal, ...material, angularDamping: role === "root" ? 12 : role === "torso" ? 4 : material.angularDamping, continuous: role === "hand" || role === "foot", collisionLayer: layer, collisionMask: mask } };
  });
  const selectedIds = new Set(selected.map((bone) => bone.id)), bodyDefinitions = new Map(bodies.map((body) => [body.boneId, body.body] as const)), joints: RagdollDefinition3D["joints"] = [], rotations: number[] = [];
  for (const child of selected) {
    if (child.id === physicalRoot.id) continue;
    let parentId = child.parentId;
    while (parentId && !selectedIds.has(parentId)) parentId = byId.get(parentId)?.parentId;
    if (!parentId) continue;
    const parent = transforms.get(parentId)!, childTransform = transforms.get(child.id)!, relative = subtract3(childTransform.position, parent.position);
    const localAnchorParent = rotate(inverseRotation(parent.rotation), relative), relativeRotation = multiplyRotation(inverseRotation(parent.rotation), childTransform.rotation);
    const poseJointIndex = joints.length, role = humanoidRole(child.id), childAxis = rotate(inverseRotation(relativeRotation), localAnchorParent), axisLength = hypot(...childAxis), twistAxis = axisLength > 1e-8 ? tuple3((childAxis[0]!) / axisLength, (childAxis[1]!) / axisLength, (childAxis[2]!) / axisLength) : tuple3(0, 1, 0);
    const parentBody = bodyDefinitions.get(parentId)!, childBody = bodyDefinitions.get(child.id)!;
    // A fixed torque impulse produces radically different angular velocity on
    // a pelvis and a tiny hand or foot. Bound generated motors by the pair's
    // effective inertia so one solver iteration cannot spin a light extremity
    // through a large fraction of a turn. The authored cap still limits large
    // bodies, while the inertia cap makes default auto-rigs smooth by scale.
    const motorTorqueImpulse = boundedJointTorqueImpulse(parentBody, childBody, tuning.torque, 96);
    const limitTorqueImpulse = boundedJointTorqueImpulse(parentBody, childBody, tuning.torque * 4, 160);
    joints.push({ id: `${parentId}-${child.id}`, parentBoneId: parentId, childBoneId: child.id, poseJointIndex, localAnchorParent, localAnchorChild: [0, 0, 0], anchorStiffness: 1, motorStiffness: tuning.stiffness, motorDamping: tuning.damping, maxTorqueImpulse: motorTorqueImpulse, swingTwistLimit: { twistAxis, ...humanoidSwingTwistLimit(role) }, angularLimitStiffness: .96, angularLimitDamping: .98, maxLimitTorqueImpulse: limitTorqueImpulse });
    rotations.push(...relativeRotation);
  }
  if (joints.length < 5) throw new Error("Automatic humanoid rigging could not connect enough major bones through the inspected hierarchy.");
  const rootRest = byId.get(physicalRoot.id)!, scaledRoot = multiply3(rootRest.restPosition, scale), inverseRoot = inverseRotation(rootRest.restRotation), inferredSupportBoneIds = selected.filter((bone) => humanoidRole(bone.id) === "foot").map((bone) => bone.id), locomotionSupportBoneIds = inferredSupportBoneIds.length ? inferredSupportBoneIds : [physicalRoot.id];
  return {
    definition: { id, rootBoneId: physicalRoot.id, bodies, joints, initialPose: { rotations }, activeMotorWeight: preset === "agile" ? .68 : preset === "heavy" ? .58 : .63, minimumTransitionSeconds: .16, maxRootTorqueImpulse: Math.max(3, totalMass * height * .6), locomotion: { supportBoneIds: locomotionSupportBoneIds, groundLayerMask: 1, probeDistance: Math.max(.08, height * .04), minimumNormalY: .6, maximumGroundedVerticalSpeedMetersPerSecond: 1, minimumLandingSpeedMetersPerSecond: 1.5, fullImpactLandingSpeedMetersPerSecond: 8, landingDurationSeconds: .24, landingMotorYield: .35 }, impactResponse: { minimumStaggerSpeedMetersPerSecond: preset === "heavy" ? 2 : 1.5, knockdownSpeedMetersPerSecond: preset === "agile" ? 8 : preset === "heavy" ? 12 : 10, staggerDurationSeconds: .28, staggerMotorYield: preset === "heavy" ? .35 : .2 } },
    physicalRootBoneId: physicalRoot.id,
    bodyBoneIds: selected.map((bone) => bone.id),
    rootBinding: { positionOffset: rotate(inverseRoot, [-scaledRoot[0], -scaledRoot[1], -scaledRoot[2]]), rotationOffset: inverseRoot },
  };
}

export type RagdollSystemCheckpoint3D = { version: 1; ragdolls: Array<{
  id: string; pose: Float64Array; mode: RagdollMode3D; fromWeight: number; motorWeight: number; toWeight: number; transitionSeconds: number; transitionElapsed: number; settledSeconds: number; locomotionState?: RagdollLocomotionState3D; landing?: Omit<RagdollLandingStatus3D, "progress"> & { elapsedSeconds: number; durationSeconds: number }; impactResponse?: Omit<RagdollImpactResponseStatus3D, "progress"> & { elapsedSeconds: number; durationSeconds: number };
  supportRootHeights?: Array<[string, number]>;
  supports: Array<{ id: string; boneId: string; handle: number; targetBodyId: string; point: [number, number, number]; rootHeightMeters?: number; balanceRadiusMeters?: number; balanceStiffness?: number; balanceDamping?: number; maxBalanceImpulse?: number; predictionSeconds?: number; forceDistribution?: "whole-body" | "root" }>;
  steps?: Array<{ id: string; boneId: string; bodyHandle: number; state: RagdollStepStatus3D["state"]; start: [number, number, number]; target: [number, number, number]; targetBodyId?: string; localTarget?: [number, number, number]; direction: [number, number, number]; speedMetersPerSecond: number; predictionSeconds: number; maximumDistance: number; durationSeconds: number; maximumWaitSeconds: number; elapsedSeconds: number; liftHeight: number; groundLayerMask: number; probeHeight: number; probeDistance: number; minimumNormalY: number; stiffness: number; damping: number; maximumDriveImpulse: number; landingTolerance: number; maximumLandingSpeed: number; allowFlight?: boolean; takeoffVelocityY?: number; takeoffApplied?: boolean; reason?: string }>;
  recovery?: { pose: Float64Array; sourcePose?: Float64Array; position: [number, number, number]; rotation: [number, number, number, number]; durationSeconds: number; poseBlendSeconds?: number; elapsedSeconds: number; requireStableSupport: boolean; supportBoneIds: string[]; groundLayerMask: number; supportProbeDistance: number; minimumSupportNormalY: number; padding: number };
  recoveryBlocker?: RagdollRecoveryBlocker3D;
}> };

export type RagdollSystem3D = ReturnType<typeof createRagdollSystem3D>;

export function createRagdollSystem3D(options: { world: RigidWorld3D; gravityY?: number }) {
  if (!options?.world) throw new TypeError("Ragdoll system requires a rigid world.");
  const world = options.world;
  const gravityY = Number.isFinite(options.gravityY) ? Number(options.gravityY) : -9.81;
  const ragdolls = new Map<string, RagdollState>();
  const recoveryQueryHandles = new Float64Array(world.capacity), recoveryRaycast = emptyRaycast(), locomotionContact = emptyContact();
  const balanceBuffers: BalanceBuffers = { points: new Float64Array(world.capacity * 2), order: new Uint32Array(world.capacity), hull: new Uint32Array(world.capacity * 2), target: new Float64Array(2) };

  const { points: balancePoints, order: balanceOrder, hull: balanceHull, target: balanceTarget } = balanceBuffers;

  function add(definition: RagdollDefinition3D): string {
    if (!definition || typeof definition !== "object") throw new TypeError("Ragdoll definition is required.");
    const id = text(definition.id, "ragdoll id");
    if (ragdolls.has(id)) throw new Error(`Ragdoll ${JSON.stringify(id)} already exists.`);
    if (!Array.isArray(definition.bodies) || definition.bodies.length === 0) throw new TypeError(`Ragdoll ${id} needs at least one body.`);
    if (!Array.isArray(definition.joints)) throw new TypeError(`Ragdoll ${id} joints must be an array.`);
    const rootBoneId = text(definition.rootBoneId, "rootBoneId"), bodyByBone = new Map<string, number>(), bodyHandles: number[] = [], constraintHandles: number[] = [];
    try {
      for (const item of definition.bodies) {
        const boneId = text(item.boneId, "body boneId");
        if (bodyByBone.has(boneId)) throw new Error(`Ragdoll ${id} has duplicate body bone ${boneId}.`);
        const handle = world.addBody({ ...item.body, id: `${id}:${boneId}`, type: "dynamic" });
        bodyByBone.set(boneId, handle); bodyHandles.push(handle);
      }
      if (!bodyByBone.has(rootBoneId)) throw new Error(`Ragdoll ${id} root body ${rootBoneId} does not exist.`);
      const pose = copyPose(definition.initialPose, definition.joints);
      const motors: RagdollState["motorByJoint"] = [];
      for (const joint of definition.joints) {
        const parent = requireBone(bodyByBone, joint.parentBoneId, id), child = requireBone(bodyByBone, joint.childBoneId, id);
        const anchor = world.addPointConstraint({ id: `${id}:${joint.id}:anchor`, a: parent, b: child, localAnchorA: joint.localAnchorParent, localAnchorB: joint.localAnchorChild, stiffness: unit(joint.anchorStiffness ?? 0.9, "anchorStiffness"), ...(joint.breakImpulse === undefined ? {} : { breakImpulse: nonnegative(joint.breakImpulse, "breakImpulse") }) });
        constraintHandles.push(anchor);
        const target = quaternionAt(pose, joint.poseJointIndex);
        if (joint.swingTwistLimit || joint.angularLimitRadians !== undefined) {
          const common = { id: `${id}:${joint.id}:limit`, a: parent, b: child, referenceRelativeRotation: target, stiffness: unit(joint.angularLimitStiffness ?? .8, "angularLimitStiffness"), damping: unit(joint.angularLimitDamping ?? .9, "angularLimitDamping"), maxTorqueImpulse: nonnegative(joint.maxLimitTorqueImpulse ?? 8, "maxLimitTorqueImpulse") };
          const limit = joint.swingTwistLimit
            ? world.addAngularSwingTwistLimitConstraint({ ...common, twistAxis: joint.swingTwistLimit.twistAxis, maxSwingRadians: joint.swingTwistLimit.maxSwingRadians, minTwistRadians: joint.swingTwistLimit.minTwistRadians, maxTwistRadians: joint.swingTwistLimit.maxTwistRadians })
            : world.addAngularLimitConstraint({ ...common, maxAngleRadians: interval(joint.angularLimitRadians!, 0, Math.PI, "angularLimitRadians") });
          constraintHandles.push(limit);
        }
        const stiffness = unit(joint.motorStiffness ?? 0.22, "motorStiffness"), damping = unit(joint.motorDamping ?? 1, "motorDamping"), maxTorqueImpulse = nonnegative(joint.maxTorqueImpulse ?? 4, "maxTorqueImpulse");
        const motor = world.addAngularMotorConstraint({ id: `${id}:${joint.id}:motor`, a: parent, b: child, targetRelativeRotation: target, stiffness, damping, maxTorqueImpulse });
        constraintHandles.push(motor); motors.push({ id: joint.id, handle: motor, parentHandle: parent, childHandle: child, localAnchorParent: vector3(joint.localAnchorParent ?? [0, 0, 0], `${joint.id} localAnchorParent`), localAnchorChild: vector3(joint.localAnchorChild ?? [0, 0, 0], `${joint.id} localAnchorChild`), poseJointIndex: joint.poseJointIndex, stiffness, damping, maxTorqueImpulse });
      }
      const rootBody = requireBody(world, requireBone(bodyByBone, rootBoneId, id), `${id}/${rootBoneId}`);
      const state: RagdollState = {
        id, rootBoneId, bodyByBone, bodyHandles, motorByJoint: motors, constraintHandles, pose, mode: "animated", fromWeight: 1, motorWeight: 1, toWeight: 1, transitionSeconds: 0, transitionElapsed: 0,
        activeMotorWeight: unit(definition.activeMotorWeight ?? 0.45, "activeMotorWeight"), minimumTransitionSeconds: positive(definition.minimumTransitionSeconds ?? 0.12, "minimumTransitionSeconds"),
        settleLinearSpeed: positive(definition.settleLinearSpeed ?? 0.08, "settleLinearSpeed"), settleAngularSpeed: positive(definition.settleAngularSpeed ?? 0.12, "settleAngularSpeed"), settleDurationSeconds: positive(definition.settleDurationSeconds ?? 0.3, "settleDurationSeconds"), settledSeconds: 0,
        recoveryPositionTolerance: positive(definition.recoveryPositionTolerance ?? 0.04, "recoveryPositionTolerance"), recoveryAngularSpeed: positive(definition.recoveryAngularSpeed ?? 0.2, "recoveryAngularSpeed"),
        maxRootImpulse: positive(definition.maxRootImpulse ?? 12, "maxRootImpulse"), maxRootTorqueImpulse: positive(definition.maxRootTorqueImpulse ?? 3, "maxRootTorqueImpulse"), rootReferenceRotation: bodyRotation(rootBody), rootMotionDirectionX: 0, rootMotionDirectionZ: 0, supportRootHeights: new Map(), locomotion: normalizeLocomotionPolicy(definition.locomotion, bodyByBone, id), locomotionState: "untracked", impactPolicy: normalizeImpactResponsePolicy(definition.impactResponse), supports: new Map(), steps: new Map(),
      }; state.locomotionState = sampleLocomotionState(state, world, recoveryRaycast);
      configureMotors(world, state); ragdolls.set(id, state); return id;
    } catch (cause) {
      for (const handle of constraintHandles) world.removeConstraint(handle);
      for (const handle of bodyHandles) world.removeBody(handle);
      throw cause;
    }
  }

  function remove(id: string): boolean {
    const state = ragdolls.get(id); if (state === undefined) return false;
    clearSupports(world, state);
    for (const handle of state.constraintHandles) world.removeConstraint(handle);
    for (const handle of state.bodyByBone.values()) world.removeBody(handle);
    ragdolls.delete(id); return true;
  }

  function setPose(id: string, pose: RagdollPose3D) {
    const state = requireRagdoll(ragdolls, id); state.pose = copyPose(pose, state.motorByJoint); if (state.recovery) state.recovery.pose = state.pose.slice(); configureMotors(world, state);
  }

  function validatePose(id: string, pose: RagdollPose3D) {
    const state = requireRagdoll(ragdolls, id); copyPose(pose, state.motorByJoint);
  }

  function setMode(id: string, update: { mode: Exclude<RagdollMode3D, "settled" | "recovering">; durationSeconds?: number; discontinuous?: boolean }): RagdollStatus3D {
    if (!update || (update.mode !== "animated" && update.mode !== "active" && update.mode !== "passive")) throw new TypeError("Ragdoll mode must be animated, active, or passive.");
    const state = requireRagdoll(ragdolls, id), target = update.mode === "animated" ? 1 : update.mode === "active" ? state.activeMotorWeight : 0;
    if (update.mode === "passive") clearSupports(world, state);
    beginTransition(state, update.mode, target, update.durationSeconds, update.discontinuous === true); delete state.recovery; delete state.recoveryBlocker; delete state.impactResponse; return status(state, world, recoveryRaycast);
  }

  function reactToImpact(id: string, impact: { impactSpeedMetersPerSecond: number; impactEnergyJoules: number; normalImpulseNewtonSeconds: number }): RagdollImpactResponseResult3D {
    const state = requireRagdoll(ragdolls, id), policy = state.impactPolicy, speed = nonnegative(impact.impactSpeedMetersPerSecond, "impactSpeedMetersPerSecond"), energy = nonnegative(impact.impactEnergyJoules, "impactEnergyJoules"), impulse = nonnegative(impact.normalImpulseNewtonSeconds, "normalImpulseNewtonSeconds");
    if (!policy || state.mode === "passive" || state.mode === "settled" || state.mode === "recovering" || speed < policy.minimumStaggerSpeedMetersPerSecond) return { response: "ignored", severity: 0 };
    if (speed >= policy.knockdownSpeedMetersPerSecond) { clearSupports(world, state); delete state.impactResponse; beginTransition(state, "passive", 0, state.minimumTransitionSeconds, false); state.settledSeconds = 0; return { response: "knocked-down", severity: 1 }; }
    const severity = (speed - policy.minimumStaggerSpeedMetersPerSecond) / (policy.knockdownSpeedMetersPerSecond - policy.minimumStaggerSpeedMetersPerSecond), prior = state.impactResponse;
    state.impactResponse = prior && prior.severity > severity ? { ...prior, elapsedSeconds: 0 } : { impactSpeedMetersPerSecond: speed, impactEnergyJoules: energy, normalImpulseNewtonSeconds: impulse, severity, elapsedSeconds: 0, durationSeconds: policy.staggerDurationSeconds };
    return { response: "staggered", severity: state.impactResponse.severity };
  }

  function inspectRecovery(id: string, target: RagdollRecoveryTarget3D): RagdollRecoveryInspection3D {
    const state = requireRagdoll(ragdolls, id), recovery = normalizedRecovery(state, target), obstruction = findRagdollRecoveryBodyObstruction3D({ world, bodies: projectRecoveryBodyClearance(state, recovery, world), selfHandles: state.bodyHandles, clearance: recovery, queryHandles: recoveryQueryHandles });
    return obstruction ? { ready: false, blocker: "obstructed", obstructingBodyId: obstruction.bodyId, obstructedBoneId: obstruction.boneId, obstructionPhase: obstruction.phase } : { ready: true };
  }

  function beginRecovery(id: string, target: RagdollRecoveryTarget3D): RagdollStatus3D {
    const state = requireRagdoll(ragdolls, id), recovery = normalizedRecovery(state, target);
    const inspection = inspectRecovery(id, target);
    if (!inspection.ready) throw new Error(`Ragdoll ${id} recovery ${inspection.obstructionPhase ?? "target"} for ${inspection.obstructedBoneId ?? "body"} is obstructed by ${inspection.obstructingBodyId}.`);
    recovery.sourcePose = capturePhysicalPose(world, state);
    state.pose = recovery.pose;
    state.recovery = recovery; state.recovery.elapsedSeconds = 0; delete state.recoveryBlocker; delete state.impactResponse;
    const durationSeconds = recovery.durationSeconds;
    beginTransition(state, "recovering", 1, durationSeconds, false); configureMotors(world, state); return status(state, world, recoveryRaycast);
  }

  function validateRecovery(id: string, target: RagdollRecoveryTarget3D) {
    normalizedRecovery(requireRagdoll(ragdolls, id), target);
  }

  function applyImpulse(id: string, boneId: string, impulse: readonly [number, number, number], point?: readonly [number, number, number]) {
    const state = requireRagdoll(ragdolls, id), handle = requireBone(state.bodyByBone, boneId, id);
    if (point) world.applyImpulseAtPoint(handle, finite(impulse[0], "impulse[0]"), finite(impulse[1], "impulse[1]"), finite(impulse[2], "impulse[2]"), finite(point[0], "point[0]"), finite(point[1], "point[1]"), finite(point[2], "point[2]"));
    else world.applyImpulse(handle, finite(impulse[0], "impulse[0]"), finite(impulse[1], "impulse[1]"), finite(impulse[2], "impulse[2]"));
    if (state.mode === "settled") beginTransition(state, "passive", 0, 0, true);
    state.settledSeconds = 0; return requireBody(world, handle, `${id}/${boneId}`);
  }
  function driveRootMotion(id: string, intent: RagdollRootMotionIntent3D): number[] { return driveRagdollRootMotion(requireRagdoll(ragdolls, id), world, intent); }

  function applyActuatedImpulse(id: string, intent: RagdollActuatedImpulse3D): number[] {
    const state = requireRagdoll(ragdolls, id), boneId = text(intent?.boneId, "actuation boneId"), handle = requireBone(state.bodyByBone, boneId, id), impulse = vector3(intent?.impulse, "actuation impulse"), mode = intent.actuation ?? "whole-body", point = intent.point ? vector3(intent.point, "actuation point") : undefined;
    if (mode !== "whole-body" && mode !== "external") throw new TypeError(`Ragdoll actuation ${String(mode)} is unsupported; choose whole-body or external.`);
    if (mode === "external") { applyImpulse(id, boneId, impulse, point); return [handle]; }
    let reactionMass = 0;
    for (const bodyHandle of state.bodyHandles) if (bodyHandle !== handle) reactionMass += requireBody(world, bodyHandle, id).mass;
    if (!(reactionMass > 0) || !Number.isFinite(reactionMass)) throw new Error(`Ragdoll ${id} cannot use whole-body actuation from ${boneId}: add at least one other physical body or choose external actuation.`);
    if (point) world.applyImpulseAtPoint(handle, impulse[0], impulse[1], impulse[2], point[0], point[1], point[2]);
    else world.applyImpulse(handle, impulse[0], impulse[1], impulse[2]);
    const forcedHandles = [handle];
    for (const bodyHandle of state.bodyHandles) {
      if (bodyHandle === handle) continue;
      const body = requireBody(world, bodyHandle, id), share = body.mass / reactionMass;
      world.applyImpulse(bodyHandle, -impulse[0] * share, -impulse[1] * share, -impulse[2] * share); forcedHandles.push(bodyHandle);
    }
    if (state.mode === "settled") beginTransition(state, "passive", 0, 0, true);
    state.settledSeconds = 0; return forcedHandles;
  }

  function applyActuatedAngularVelocity(id: string, intent: RagdollActuatedAngularVelocity3D): number[] {
    const state = requireRagdoll(ragdolls, id), boneId = text(intent?.boneId, "angular actuation boneId"), handle = requireBone(state.bodyByBone, boneId, id), body = requireBody(world, handle, `${id}/${boneId}`), target = vector3(intent?.angularVelocity, "angular actuation velocity"), mode = intent.actuation ?? "whole-body";
    if (mode !== "whole-body" && mode !== "external") throw new TypeError(`Ragdoll angular actuation ${String(mode)} is unsupported; choose whole-body or external.`);
    if (mode === "whole-body" && state.bodyHandles.length < 2) throw new Error(`Ragdoll ${id} cannot use whole-body angular actuation from ${boneId}: add at least one other physical body or choose external actuation.`);
    const torque = angularVelocityTorqueImpulse(body, [target[0] - body.angularVelocityX, target[1] - body.angularVelocityY, target[2] - body.angularVelocityZ]);
    world.applyTorqueImpulse(handle, torque[0], torque[1], torque[2]);
    if (mode === "external") { if (state.mode === "settled") beginTransition(state, "passive", 0, 0, true); state.settledSeconds = 0; return [handle]; }
    const torqueLength = hypot(torque[0], torque[1], torque[2]);
    const forcedHandles = [handle];
    if (torqueLength > 1e-12) {
      const axis = [torque[0] / torqueLength, torque[1] / torqueLength, torque[2] / torqueLength] as const, reactions: Array<{ handle: number; weight: number }> = [];
      let totalWeight = 0;
      for (const bodyHandle of state.bodyHandles) {
        if (bodyHandle === handle) continue;
        const reaction = requireBody(world, bodyHandle, id), axisTorque = angularVelocityTorqueImpulse(reaction, axis), weight = Math.max(1e-12, axis[0] * axisTorque[0] + axis[1] * axisTorque[1] + axis[2] * axisTorque[2]);
        reactions.push({ handle: bodyHandle, weight }); totalWeight += weight;
      }
      let appliedX = 0, appliedY = 0, appliedZ = 0;
      for (let index = 0; index < reactions.length; index += 1) {
        const reaction = reactions[index]!, last = index === reactions.length - 1, share = reaction.weight / totalWeight;
        const x = last ? -torque[0] - appliedX : -torque[0] * share, y = last ? -torque[1] - appliedY : -torque[1] * share, z = last ? -torque[2] - appliedZ : -torque[2] * share;
        world.applyTorqueImpulse(reaction.handle, x, y, z); appliedX += x; appliedY += y; appliedZ += z; forcedHandles.push(reaction.handle);
      }
    } else for (const bodyHandle of state.bodyHandles) if (bodyHandle !== handle) forcedHandles.push(bodyHandle);
    if (state.mode === "settled") beginTransition(state, "passive", 0, 0, true);
    state.settledSeconds = 0; return forcedHandles;
  }

  function validateJointDrive(id: string, intent: RagdollJointDrive3D) { normalizeJointDrive(requireRagdoll(ragdolls, id), intent); }

  function applyJointDrive(id: string, intent: RagdollJointDrive3D): number[] {
    const state = requireRagdoll(ragdolls, id), drive = normalizeJointDrive(state, intent), parent = requireBody(world, drive.joint.parentHandle, `${id}/${drive.joint.id}/parent`), child = requireBody(world, drive.joint.childHandle, `${id}/${drive.joint.id}/child`);
    const axis = rotate(bodyRotation(parent), drive.axisParentLocal), relativeVelocity = (child.angularVelocityX - parent.angularVelocityX) * axis[0] + (child.angularVelocityY - parent.angularVelocityY) * axis[1] + (child.angularVelocityZ - parent.angularVelocityZ) * axis[2], inverseEffectiveInertia = inverseInertiaAlongAxis(parent, axis) + inverseInertiaAlongAxis(child, axis);
    if (!(inverseEffectiveInertia > 1e-12)) return [parent.handle, child.handle];
    const magnitude = Math.max(-drive.maxTorqueImpulse, Math.min(drive.maxTorqueImpulse, (drive.targetAngularVelocity - relativeVelocity) / inverseEffectiveInertia));
    world.applyTorqueImpulse(parent.handle, -axis[0] * magnitude, -axis[1] * magnitude, -axis[2] * magnitude);
    world.applyTorqueImpulse(child.handle, axis[0] * magnitude, axis[1] * magnitude, axis[2] * magnitude);
    if (state.mode === "settled") beginTransition(state, "active", state.activeMotorWeight, state.minimumTransitionSeconds, false);
    state.settledSeconds = 0; return [parent.handle, child.handle];
  }

  function validateEffectorDrive(id: string, intent: RagdollEffectorDrive3D) { normalizeEffectorDrive(requireRagdoll(ragdolls, id), intent); }

  function resolveEffectorDriveSupport(id: string, effectorBoneId: string, mode: "auto" | "free") { const state = requireRagdoll(ragdolls, id), effectorHandle = requireBone(state.bodyByBone, text(effectorBoneId, "effector drive boneId"), id); if (mode !== "auto" && mode !== "free") throw new TypeError(`Effector support mode ${String(mode)} is unsupported; choose auto or free.`); if (mode === "free") return undefined; const supports = [...state.supports].filter(([, support]) => world.constraint(support.handle)).map(([supportId, support]) => ({ id: supportId, boneId: support.boneId, bodyHandle: requireBone(state.bodyByBone, support.boneId, id) })); return resolveSupportAwareEffectorPath3D(state.motorByJoint, supports, effectorHandle); }

  function applyEffectorDrive(id: string, intent: RagdollEffectorDrive3D): number[] {
    const state = requireRagdoll(ragdolls, id), drive = normalizeEffectorDrive(state, intent), effector = requireBody(world, drive.effectorHandle, `${id}/${drive.effectorBoneId}`);
    const error = [drive.targetVelocity[0] - effector.velocityX, drive.targetVelocity[1] - effector.velocityY, drive.targetVelocity[2] - effector.velocityZ] as const, impulse = [error[0] * effector.mass * drive.velocityGain, error[1] * effector.mass * drive.velocityGain, error[2] * effector.mass * drive.velocityGain] as const;
    const pivots = drive.joints.map((joint) => { const parent = requireBody(world, joint.parentHandle, `${id}/${joint.id}/base`); return bodyWorldPoint(parent, joint.localAnchorParent); }), leverages = pivots.map((pivot) => hypot(effector.x - pivot[0], effector.y - pivot[1], effector.z - pivot[2])), leverageTotal = Math.max(1e-12, leverages.reduce((sum, value) => sum + value, 0)), forced = new Set<number>();
    for (let index = 0; index < drive.joints.length; index += 1) {
      const joint = drive.joints[index]!, pivot = pivots[index]!, r = [effector.x - pivot[0], effector.y - pivot[1], effector.z - pivot[2]] as const, share = leverages[index]! / leverageTotal;
      const torque = clampVector((r[1] * impulse[2] - r[2] * impulse[1]) * share, (r[2] * impulse[0] - r[0] * impulse[2]) * share, (r[0] * impulse[1] - r[1] * impulse[0]) * share, drive.maxTorqueImpulse);
      world.applyTorqueImpulse(joint.parentHandle, -torque[0], -torque[1], -torque[2]); world.applyTorqueImpulse(joint.childHandle, torque[0], torque[1], torque[2]); forced.add(joint.parentHandle); forced.add(joint.childHandle);
    }
    if (drive.targetAngularVelocity) applyEffectorAngularDrive(world, id, effector, drive.joints, drive.targetAngularVelocity, drive.maxAngularTorqueImpulse!, forced);
    if (state.mode === "settled") beginTransition(state, "active", state.activeMotorWeight, state.minimumTransitionSeconds, false);
    state.settledSeconds = 0; return [...forced];
  }

  function validateSupport(id: string, intent: RagdollSupportIntent3D) { normalizeSupport(requireRagdoll(ragdolls, id), intent); }

  function plantSupport(id: string, intent: RagdollSupportIntent3D): RagdollSupportStatus3D {
    const state = requireRagdoll(ragdolls, id), support = normalizeSupport(state, intent), foot = requireBody(world, support.bodyHandle, `${id}/${support.boneId}`);
    clearSupport(id, support.id);
    if (state.mode === "passive" || state.mode === "settled" || state.mode === "recovering" || hypot(foot.velocityX, foot.velocityY, foot.velocityZ) > support.maximumPlantSpeed) return { id: support.id, boneId: support.boneId, planted: false };
    const sole = bodyDownwardSupportPoint(foot), castDistance = sole.verticalExtent + support.probeDistance, hit = emptyRaycast();
    if (!world.raycast(foot.x, foot.y, foot.z, 0, -1, 0, castDistance, support.groundLayerMask, hit) || hit.handle === foot.handle || hit.normalY < support.minimumNormalY) return { id: support.id, boneId: support.boneId, planted: false };
    const target = requireBody(world, hit.handle, hit.id), point: [number, number, number] = [hit.x, hit.y, hit.z];
    const handle = world.addPointConstraint({ id: `${id}:${support.id}:support`, a: target.handle, b: foot.handle, localAnchorA: bodyLocalPoint(target, point), localAnchorB: sole.localPoint, stiffness: support.stiffness, damping: support.damping, maxImpulse: support.maxImpulse, breakImpulse: support.breakImpulse });
    const root = requireBody(world, requireBone(state.bodyByBone, state.rootBoneId, state.id), `${state.id}/${state.rootBoneId}`);
    const locomotionSupport = state.locomotion?.supportBoneIds.includes(support.boneId) === true;
    const measuredRootHeight = Math.max(0, root.y - point[1]);
    const canonicalRootHeight = locomotionSupport ? state.supportRootHeights.get(support.boneId) ?? measuredRootHeight : measuredRootHeight;
    if (locomotionSupport && !state.supportRootHeights.has(support.boneId)) state.supportRootHeights.set(support.boneId, canonicalRootHeight);
    state.supports.set(support.id, { boneId: support.boneId, handle, targetBodyId: target.id, point, rootHeightMeters: canonicalRootHeight, balanceRadiusMeters: support.balanceRadiusMeters, balanceStiffness: support.balanceStiffness, balanceDamping: support.balanceDamping, maxBalanceImpulse: support.maxBalanceImpulse, predictionSeconds: support.predictionSeconds, forceDistribution: support.forceDistribution });
    return { id: support.id, boneId: support.boneId, planted: true, targetBodyId: target.id, point };
  }

  function clearSupport(id: string, supportId: string): boolean {
    const state = requireRagdoll(ragdolls, id), support = state.supports.get(supportId); if (!support) return false;
    world.removeConstraint(support.handle); state.supports.delete(supportId); return true;
  }

  function support(id: string, supportId: string): RagdollSupportStatus3D | undefined {
    const state = requireRagdoll(ragdolls, id), item = state.supports.get(supportId); if (!item) return undefined;
    if (!world.constraint(item.handle)) { state.supports.delete(supportId); return undefined; }
    return { id: supportId, boneId: item.boneId, planted: true, targetBodyId: item.targetBodyId, point: [...item.point] };
  }

  function validateStep(id: string, intent: RagdollStepIntent3D) { normalizeStep(requireRagdoll(ragdolls, id), intent); }

  function validateTakeoff(id: string, intent: RagdollTakeoffIntent3D) { normalizeTakeoff(requireRagdoll(ragdolls, id), intent); }

  function takeoff(id: string, intent: RagdollTakeoffIntent3D): RagdollTakeoffStatus3D & { forcedHandles: number[] } {
    const state = requireRagdoll(ragdolls, id), takeoff = normalizeTakeoff(state, intent), bodies = takeoff.supportBoneIds.map((boneId) => requireBody(world, requireBone(state.bodyByBone, boneId, id), `${id}/${boneId}`));
    let totalMass = 0, velocityY = 0;
    for (const handle of state.bodyHandles) { const body = requireBody(world, handle, id); totalMass += body.mass; velocityY += body.velocityY * body.mass; }
    velocityY /= totalMass;
    if (Math.abs(velocityY) > takeoff.maximumGroundedVerticalSpeedMetersPerSecond) return { launched: false, reason: "the character already has too much vertical speed to be grounded", forcedHandles: [] };
    if (!hasStableRagdollRecoverySupport3D({ world, bodies, selfHandles: state.bodyHandles, groundLayerMask: takeoff.groundLayerMask, probeDistance: takeoff.probeDistance, minimumNormalY: takeoff.minimumNormalY, hit: recoveryRaycast })) return { launched: false, reason: "the declared support bones do not reach stable upward-facing ground", forcedHandles: [] };
    clearSupports(world, state);
    const forcedHandles: number[] = [];
    // A semantic jump is a coordinated whole-body impulse. Matching only the
    // center-of-mass velocity leaves gait-relative velocities intact, so a
    // descending swing foot can hit the floor on the very next substep and
    // torque the character into a fall. Giving every linked body the requested
    // takeoff velocity preserves the same requested total linear momentum while
    // removing that internal velocity shear. A grounded, non-flip jump also
    // cancels residual gait spin while support can still supply torque; once
    // airborne the solver preserves the resulting zero angular momentum.
    for (const handle of state.bodyHandles) { world.setVelocity(handle, takeoff.velocity[0], takeoff.velocity[1], takeoff.velocity[2]); world.setAngularVelocity(handle, 0, 0, 0); forcedHandles.push(handle); }
    const takeoffMode = state.mode === "animated" ? "animated" : "active";
    beginTransition(state, takeoffMode, takeoffMode === "animated" ? 1 : state.activeMotorWeight, state.minimumTransitionSeconds, false); delete state.recovery; delete state.recoveryBlocker; delete state.landing; delete state.impactResponse; state.locomotionState = "airborne"; state.settledSeconds = 0;
    return { launched: true, forcedHandles };
  }

  function beginPredictiveStep(id: string, intent: RagdollStepIntent3D): RagdollStepStatus3D {
    const state = requireRagdoll(ragdolls, id), step = normalizeStep(state, intent), foot = requireBody(world, step.bodyHandle, `${id}/${step.boneId}`);
    clearStep(id, step.id);
    let totalMass = 0, centerX = 0, centerZ = 0, supportCount = 0, supportRadius = 0;
    for (const handle of state.bodyHandles) { const body = requireBody(world, handle, state.id); totalMass += body.mass; centerX += body.x * body.mass; centerZ += body.z * body.mass; }
    centerX /= totalMass; centerZ /= totalMass;
    for (const support of state.supports.values()) { const constraint = world.constraint(support.handle), target = world.body(support.targetBodyId); if (!constraint || constraint.kind !== "point" || !target) continue; const point = bodyWorldPoint(target, constraint.localAnchorA); balancePoints[supportCount * 2] = point[0]; balancePoints[supportCount * 2 + 1] = point[2]; supportCount += 1; supportRadius = Math.max(supportRadius, support.balanceRadiusMeters); }
    if (!supportCount && !step.allowFlight) { step.state = "missed"; step.reason = "no planted support remains for a physical step"; state.steps.set(step.id, step); return stepStatusValue(step); }
    const projectedX = centerX + step.direction[0] * step.speedMetersPerSecond * step.predictionSeconds, projectedZ = centerZ + step.direction[2] * step.speedMetersPerSecond * step.predictionSeconds;
    const requestedFootAlreadyPlanted = [...state.supports.values()].some((support) => support.boneId === step.boneId && world.constraint(support.handle));
    // A reactive capture step may be skipped only when the requested foot is
    // already part of the stance. During an authored cadence the center of
    // mass can still be safe over the opposite foot; treating that as a
    // completed step leaves no support to receive the following foot and turns
    // an ordinary walk into an accidental flight phase.
    if (supportCount && requestedFootAlreadyPlanted && closestExpandedSupportPoint3D(balancePoints, supportCount, projectedX, projectedZ, supportRadius, balanceOrder, balanceHull, balanceTarget) <= 1e-9) { step.state = "contained"; state.steps.set(step.id, step); return stepStatusValue(step); }
    let remainingSupports = 0; for (const support of state.supports.values()) if (support.boneId !== step.boneId) remainingSupports += 1;
    if (!remainingSupports && !step.allowFlight) { step.state = "missed"; step.reason = "stepping would remove the character's only planted support"; state.steps.set(step.id, step); return stepStatusValue(step); }
    const perpendicularX = -step.direction[2], perpendicularZ = step.direction[0], lateral = (foot.x - centerX) * perpendicularX + (foot.z - centerZ) * perpendicularZ;
    let targetX = projectedX + perpendicularX * lateral, targetZ = projectedZ + perpendicularZ * lateral, dx = targetX - foot.x, dz = targetZ - foot.z, distance = hypot(dx, dz);
    if (distance > step.maximumDistance) { const scale = step.maximumDistance / distance; dx *= scale; dz *= scale; targetX = foot.x + dx; targetZ = foot.z + dz; distance = step.maximumDistance; }
    const cast = emptyRaycast(), castY = foot.y + step.probeHeight;
    if (distance <= 1e-9 || !world.raycast(targetX, castY, targetZ, 0, -1, 0, step.probeHeight + step.probeDistance, step.groundLayerMask, cast) || cast.normalY < step.minimumNormalY) { step.state = "missed"; step.reason = distance <= 1e-9 ? "capture target is already under the swing foot" : "capture target has no reachable supported ground"; state.steps.set(step.id, step); return stepStatusValue(step); }
    const ground = requireBody(world, cast.handle, cast.id), halfHeight = foot.shape.kind === "sphere" ? foot.shape.radius : foot.shape.halfY, target: [number, number, number] = [cast.x + cast.normalX * halfHeight, cast.y + cast.normalY * halfHeight, cast.z + cast.normalZ * halfHeight];
    step.target = target; step.targetBodyId = ground.id; step.localTarget = bodyLocalPoint(ground, target); step.start = [foot.x, foot.y, foot.z];
    if (supportCount > 0 && !remainingSupports && step.allowFlight) {
      let landingSeconds = Infinity;
      for (const other of state.steps.values()) {
        if (other.state !== "moving" || other.boneId === step.boneId) continue;
        landingSeconds = Math.min(landingSeconds, Math.max(0, other.durationSeconds - other.elapsedSeconds));
      }
      // Releasing the final stance during an overlapping running step is a
      // takeoff, not an invitation for the articulated body to collapse under
      // gravity. Match a same-height ballistic arc to the opposite foot's
      // already-authored landing deadline. A step begun after support has
      // already been released may steer toward landing, but it must not reset
      // whole-body vertical momentum. Collisions still own the result.
      if (Number.isFinite(landingSeconds) && landingSeconds > 0) {
        step.takeoffVelocityY = Math.max(0, -gravityY * landingSeconds * .5);
      }
    }
    for (const [supportId, support] of [...state.supports]) if (support.boneId === step.boneId) clearSupport(id, supportId);
    if (!remainingSupports) { state.locomotionState = "airborne"; delete state.landing; }
    state.steps.set(step.id, step); return stepStatusValue(step);
  }

  function stepStatus(id: string, stepId: string): RagdollStepStatus3D | undefined { const step = requireRagdoll(ragdolls, id).steps.get(stepId); return step ? stepStatusValue(step) : undefined; }
  function clearStep(id: string, stepId: string): boolean { const state = requireRagdoll(ragdolls, id), existed = state.steps.delete(stepId); clearSupport(id, stepId); return existed; }

  function step(seconds: number, actuatedHandles?: Set<number>, inactiveRagdollIds?: ReadonlySet<string>): number {
    seconds = positive(seconds, "seconds");
    for (const state of ragdolls.values()) {
      if (inactiveRagdollIds?.has(state.id)) continue;
      advanceTransition(state, seconds); advanceImpactResponse(state, seconds); if (state.recovery) driveRecoveryRoot(world, state, seconds); driveSteps(world, state, seconds, actuatedHandles);
      // A stagger yields pose motors but is not a knockdown. Keep authored foot
      // supports and their center-of-mass controller active so recoil can travel
      // through the body without silently collapsing the stance. Knockdown mode
      // still clears supports in reactToImpact and therefore receives no balance.
      driveBalance(world, balanceBuffers, state, seconds, actuatedHandles); configureMotors(world, state);
    }
    const contacts = world.step(seconds);
    for (const state of ragdolls.values()) { if (inactiveRagdollIds?.has(state.id)) continue; finishSteps(world, recoveryRaycast, plantSupport, state); for (const supportId of [...state.supports.keys()]) support(state.id, supportId); updateRagdollLocomotion(state, world, recoveryRaycast, locomotionContact, seconds); updateSettling(state, seconds); }
    return contacts;
  }

  function statusFor(id: string) { return status(requireRagdoll(ragdolls, id), world, recoveryRaycast); }
  function body(id: string, boneId: string) { const state = requireRagdoll(ragdolls, id); return world.body(requireBone(state.bodyByBone, boneId, id)); }
  function posture(id: string, boneId: string): RagdollPosture3D {
    const state = requireRagdoll(ragdolls, id), body = requireBody(world, requireBone(state.bodyByBone, text(boneId, "posture boneId"), id), `${id}/${boneId}`);
    return classifyRagdollPosture3D(body);
  }

  function recoveryEnvironment(id: string, target: RagdollRecoveryTarget3D, options: RagdollRecoveryEnvironmentOptions3D = {}): RagdollRecoveryEnvironmentInspection3D {
    const state = requireRagdoll(ragdolls, id), recovery = normalizedRecovery(state, target), root = requireBody(world, requireBone(state.bodyByBone, state.rootBoneId, state.id), state.id);
    return inspectRagdollRecoveryEnvironment3D({
      world, root, selfHandles: state.bodyHandles, clearance: recovery, queryHandles: recoveryQueryHandles, raycastHit: recoveryRaycast,
      proximityMeters: nonnegative(options.proximityMeters ?? .35, "recovery environment proximityMeters"),
      standingHeadroomMeters: nonnegative(options.standingHeadroomMeters ?? .45, "recovery environment standingHeadroomMeters"),
      ledgeProbeDistance: positive(options.ledgeProbeDistance ?? .4, "recovery environment ledgeProbeDistance"),
      ledgeHeightTolerance: nonnegative(options.ledgeHeightTolerance ?? .12, "recovery environment ledgeHeightTolerance"),
    });
  }

  function checkpoint(): RagdollSystemCheckpoint3D {
    return { version: 1, ragdolls: [...ragdolls.values()].map((state) => ({ id: state.id, pose: state.pose.slice(), mode: state.mode, fromWeight: state.fromWeight, motorWeight: state.motorWeight, toWeight: state.toWeight, transitionSeconds: state.transitionSeconds, transitionElapsed: state.transitionElapsed, settledSeconds: state.settledSeconds, locomotionState: state.locomotionState, ...(state.landing ? { landing: { ...state.landing, point: [...state.landing.point] } } : {}), ...(state.impactResponse ? { impactResponse: { ...state.impactResponse } } : {}), supportRootHeights: [...state.supportRootHeights], supports: [...state.supports].map(([id, support]) => ({ id, boneId: support.boneId, handle: support.handle, targetBodyId: support.targetBodyId, point: [...support.point], rootHeightMeters: support.rootHeightMeters, balanceRadiusMeters: support.balanceRadiusMeters, balanceStiffness: support.balanceStiffness, balanceDamping: support.balanceDamping, maxBalanceImpulse: support.maxBalanceImpulse, predictionSeconds: support.predictionSeconds, forceDistribution: support.forceDistribution })), steps: [...state.steps.values()].map(cloneStep), ...(state.recovery ? { recovery: cloneRecovery(state.recovery) } : {}), ...(state.recoveryBlocker ? { recoveryBlocker: state.recoveryBlocker } : {}) })) };
  }

  function restoreCheckpoint(value: Readonly<RagdollSystemCheckpoint3D>) {
    if (!value || value.version !== 1 || value.ragdolls.length !== ragdolls.size) throw new Error("Ragdoll checkpoint is incompatible with this system.");
    const ids = new Set<string>();
    for (const saved of value.ragdolls) {
      const state = ragdolls.get(saved.id); if (state === undefined || ids.has(saved.id)) throw new Error(`Ragdoll checkpoint has incompatible id ${saved.id}.`); ids.add(saved.id);
      if (saved.pose.length !== state.pose.length || !["animated", "active", "passive", "settled", "recovering"].includes(saved.mode)) throw new Error(`Ragdoll checkpoint ${saved.id} has incompatible pose or mode.`);
      state.pose = saved.pose.slice(); state.mode = saved.mode; state.fromWeight = unit(saved.fromWeight, "checkpoint fromWeight"); state.motorWeight = unit(saved.motorWeight, "checkpoint motorWeight"); state.toWeight = unit(saved.toWeight, "checkpoint toWeight"); state.transitionSeconds = nonnegative(saved.transitionSeconds, "checkpoint transitionSeconds"); state.transitionElapsed = nonnegative(saved.transitionElapsed, "checkpoint transitionElapsed"); state.settledSeconds = nonnegative(saved.settledSeconds, "checkpoint settledSeconds");
      restoreLocomotionCheckpoint(state, saved, world, recoveryRaycast);
      state.impactResponse = saved.impactResponse ? restoreImpactResponse(saved.impactResponse) : undefined;
      state.supportRootHeights.clear();
      for (const [boneId, rootHeight] of saved.supportRootHeights ?? []) {
        if (state.supportRootHeights.has(boneId) || !state.locomotion?.supportBoneIds.includes(boneId)) throw new Error(`Ragdoll checkpoint ${saved.id} support root height ${boneId} is incompatible.`);
        state.supportRootHeights.set(boneId, nonnegative(rootHeight, "checkpoint support root height"));
      }
      state.supports.clear();
      for (const support of saved.supports) { if (state.supports.has(support.id) || !state.bodyByBone.has(support.boneId) || !world.constraint(support.handle) || !world.hasBody(support.targetBodyId)) throw new Error(`Ragdoll checkpoint ${saved.id} support ${support.id} is incompatible.`); const forceDistribution = support.forceDistribution ?? "whole-body"; if (forceDistribution !== "whole-body" && forceDistribution !== "root") throw new Error(`Ragdoll checkpoint ${saved.id} support ${support.id} force distribution is invalid.`); const point = vector3(support.point, "checkpoint support point"), root = requireBody(world, requireBone(state.bodyByBone, state.rootBoneId, state.id), `${state.id}/${state.rootBoneId}`); state.supports.set(support.id, { boneId: support.boneId, handle: support.handle, targetBodyId: support.targetBodyId, point, rootHeightMeters: nonnegative(support.rootHeightMeters ?? Math.max(0, root.y - point[1]), "checkpoint rootHeightMeters"), balanceRadiusMeters: nonnegative(support.balanceRadiusMeters ?? .12, "checkpoint balanceRadiusMeters"), balanceStiffness: unit(support.balanceStiffness ?? .35, "checkpoint balanceStiffness"), balanceDamping: unit(support.balanceDamping ?? .85, "checkpoint balanceDamping"), maxBalanceImpulse: nonnegative(support.maxBalanceImpulse ?? 4, "checkpoint maxBalanceImpulse"), predictionSeconds: interval(support.predictionSeconds ?? .18, 0, 2, "checkpoint predictionSeconds"), forceDistribution }); }
      state.steps.clear(); for (const step of saved.steps ?? []) { if (state.steps.has(step.id) || requireBone(state.bodyByBone, step.boneId, state.id) !== step.bodyHandle || !["moving", "planted", "contained", "missed"].includes(step.state) || step.targetBodyId && !world.hasBody(step.targetBodyId)) throw new Error(`Ragdoll checkpoint ${saved.id} step ${step.id} is incompatible.`); const restored = restoreStep(step); if ((restored.state === "moving" || restored.state === "planted") && (!restored.targetBodyId || !restored.localTarget) || restored.elapsedSeconds > restored.durationSeconds + restored.maximumWaitSeconds || restored.state === "planted" && !state.supports.has(restored.id)) throw new Error(`Ragdoll checkpoint ${saved.id} step ${step.id} has incompatible controller state.`); state.steps.set(restored.id, restored); }
      state.recovery = saved.recovery ? cloneRecovery(saved.recovery) : undefined;
      if (saved.recoveryBlocker && !["position", "linear-motion", "angular-motion", "obstructed", "unsupported"].includes(saved.recoveryBlocker)) throw new Error(`Ragdoll checkpoint ${saved.id} recovery blocker is invalid.`);
      state.recoveryBlocker = saved.recoveryBlocker; configureMotors(world, state);
    }
  }

  function updateSettling(state: RagdollState, seconds: number) {
    let maximumLinear = 0, maximumAngular = 0;
    for (const handle of state.bodyByBone.values()) { const item = requireBody(world, handle, state.id); maximumLinear = Math.max(maximumLinear, hypot(item.velocityX, item.velocityY, item.velocityZ)); maximumAngular = Math.max(maximumAngular, hypot(item.angularVelocityX, item.angularVelocityY, item.angularVelocityZ)); }
    if (state.mode === "passive") {
      state.settledSeconds = maximumLinear <= state.settleLinearSpeed && maximumAngular <= state.settleAngularSpeed ? state.settledSeconds + seconds : 0;
      if (state.settledSeconds >= state.settleDurationSeconds) { state.mode = "settled"; state.motorWeight = state.fromWeight = state.toWeight = 0; configureMotors(world, state); }
    } else if (state.mode === "settled" && (maximumLinear > state.settleLinearSpeed || maximumAngular > state.settleAngularSpeed)) state.mode = "passive";
    if (state.mode === "recovering" && state.recovery && state.recovery.elapsedSeconds >= state.recovery.durationSeconds) {
      const root = requireBody(world, requireBone(state.bodyByBone, state.rootBoneId, state.id), state.id), distance = hypot(root.x - state.recovery.position[0], root.y - state.recovery.position[1], root.z - state.recovery.position[2]);
      state.recoveryBlocker = distance > state.recoveryPositionTolerance ? "position" : maximumLinear > state.settleLinearSpeed ? "linear-motion" : maximumAngular > state.recoveryAngularSpeed ? "angular-motion" : recoveryEnvironmentBlocker(world, recoveryQueryHandles, recoveryRaycast, state);
      if (!state.recoveryBlocker) {
        // Animation authority must not inherit a small residual recovery drift.
        // Cancel it with an explicit physical impulse only after every body is
        // already below the authored settle speed; position is never snapped.
        world.applyImpulse(root.handle, -root.velocityX * root.mass, -root.velocityY * root.mass, -root.velocityZ * root.mass);
        state.mode = "animated"; state.motorWeight = state.fromWeight = state.toWeight = 1; delete state.recovery; configureMotors(world, state);
      }
    }
  }

  return { world, add, remove, setPose, validatePose, setMode, reactToImpact, inspectRecovery, beginRecovery, validateRecovery, validateSupport, plantSupport, clearSupport, support, validateStep, beginPredictiveStep, stepStatus, clearStep, validateTakeoff, takeoff, applyImpulse, driveRootMotion, applyActuatedImpulse, applyActuatedAngularVelocity, validateJointDrive, applyJointDrive, validateEffectorDrive, resolveEffectorDriveSupport, applyEffectorDrive, step, status: statusFor, body, posture, recoveryEnvironment, checkpoint, restoreCheckpoint };
}

function driveRagdollRootMotion(state: RagdollState, world: RigidWorld3D, intent: RagdollRootMotionIntent3D): number[] {
  if (state.mode === "passive" || state.mode === "settled" || state.mode === "recovering" || state.locomotionState === "airborne") return [];
  const delta = vector3(intent?.delta, "root-motion delta"), durationSeconds = positive(intent?.durationSeconds, "root-motion durationSeconds");
  const horizontalTravel = hypot(delta[0], delta[2]);
  if (horizontalTravel > 1e-12) { state.rootMotionDirectionX = delta[0] / horizontalTravel; state.rootMotionDirectionZ = delta[2] / horizontalTravel; }
  const handle = requireBone(state.bodyByBone, state.rootBoneId, state.id), root = requireBody(world, handle, `${state.id}/${state.rootBoneId}`);
  const limit = positive(intent.maxImpulse ?? state.maxRootImpulse, "root-motion maxImpulse");
  const wholeBody = [...state.supports.values()].some((support) => support.forceDistribution === "whole-body" && world.constraint(support.handle));
  if (wholeBody) {
    let totalMass = 0, velocityX = 0, velocityY = 0, velocityZ = 0, drivenMass = 0;
    const driven: number[] = [];
    for (const bodyHandle of state.bodyHandles) { const body = requireBody(world, bodyHandle, state.id); totalMass += body.mass; velocityX += body.velocityX * body.mass; velocityY += body.velocityY * body.mass; velocityZ += body.velocityZ * body.mass; if (!isSupportedBody(state, world, bodyHandle)) { driven.push(bodyHandle); drivenMass += body.mass; } }
    if (!(totalMass > 0) || !(drivenMass > 0)) return [];
    const impulse = clampVector((delta[0] / durationSeconds - velocityX / totalMass) * totalMass, (delta[1] / durationSeconds - velocityY / totalMass) * totalMass, (delta[2] / durationSeconds - velocityZ / totalMass) * totalMass, limit);
    for (const bodyHandle of driven) { const body = requireBody(world, bodyHandle, state.id), share = body.mass / drivenMass; world.applyImpulse(bodyHandle, impulse[0] * share, impulse[1] * share, impulse[2] * share); }
    driveRagdollFacing(state, root, world, intent.facing, limit, durationSeconds);
    state.settledSeconds = 0; return driven;
  }
  const impulse = clampVector((delta[0] / durationSeconds - root.velocityX) * root.mass, (delta[1] / durationSeconds - root.velocityY) * root.mass, (delta[2] / durationSeconds - root.velocityZ) * root.mass, limit);
  world.applyImpulse(handle, impulse[0], impulse[1], impulse[2]); driveRagdollFacing(state, root, world, intent.facing, limit, durationSeconds); state.settledSeconds = 0; return [handle];
}

function driveRagdollFacing(state: RagdollState, root: RigidBodyState3D, world: RigidWorld3D, facing: readonly [number, number, number] | undefined, linearLimit: number, seconds: number) {
  if (!facing) return;
  const horizontal = hypot(facing[0], facing[2]);
  if (horizontal <= 1e-12) throw new RangeError("root-motion facing needs a horizontal component.");
  const referenceForward = rotate(state.rootReferenceRotation, [0, 0, 1]);
  const referenceYaw = atan2(referenceForward[0], referenceForward[2]);
  const targetYaw = atan2(facing[0] / horizontal, facing[2] / horizontal);
  const halfYaw = (targetYaw - referenceYaw) * .5;
  const target = multiplyRotation([0, sin(halfYaw), 0, cos(halfYaw)], state.rootReferenceRotation);
  const error = rotationError(root, target, Math.PI);
  const targetAngularVelocity = [error[0] * 10, error[1] * 10, error[2] * 10] as const;
  const delta = [targetAngularVelocity[0] - root.angularVelocityX, targetAngularVelocity[1] - root.angularVelocityY, targetAngularVelocity[2] - root.angularVelocityZ] as const;
  const requested: Array<{ handle: number; torque: [number, number, number] }> = [];
  let requestedMagnitude = 0;
  for (const handle of state.bodyHandles) {
    if (isSupportedBody(state, world, handle)) continue;
    const torque = angularVelocityTorqueImpulse(requireBody(world, handle, state.id), delta);
    requested.push({ handle, torque }); requestedMagnitude += hypot(...torque);
  }
  // maxRootTorqueImpulse is an impulse budget per second of authored motion,
  // not per solver substep. Applying the full value at 120 Hz injects up to
  // 120x the intended angular momentum and makes a grounded runner tumble even
  // while the requested facing is constant.
  const maximum = Math.min(state.maxRootTorqueImpulse, Math.max(.1, linearLimit * .25)) * seconds * 12;
  const scale = requestedMagnitude > maximum ? maximum / requestedMagnitude : 1;
  for (const item of requested) world.applyTorqueImpulse(item.handle, item.torque[0] * scale, item.torque[1] * scale, item.torque[2] * scale);
}

function isSupportedBody(state: RagdollState, world: RigidWorld3D, bodyHandle: number) { for (const support of state.supports.values()) { const constraint = world.constraint(support.handle); if (constraint?.kind === "point" && constraint.b === bodyHandle) return true; } return false; }

function beginTransition(state: RagdollState, mode: RagdollMode3D, target: number, duration: number | undefined, discontinuous: boolean) {
  state.mode = mode; state.fromWeight = state.motorWeight; state.toWeight = target; state.transitionElapsed = 0;
  state.transitionSeconds = discontinuous ? 0 : Math.max(state.minimumTransitionSeconds, duration === undefined ? state.minimumTransitionSeconds : nonnegative(duration, "transition durationSeconds"));
  if (state.transitionSeconds === 0) state.motorWeight = target;
}
function advanceTransition(state: RagdollState, seconds: number) { if (state.transitionSeconds <= 0 || state.transitionElapsed >= state.transitionSeconds) return; state.transitionElapsed = Math.min(state.transitionSeconds, state.transitionElapsed + seconds); state.motorWeight = state.fromWeight + (state.toWeight - state.fromWeight) * smootherstep(state.transitionElapsed / state.transitionSeconds); }
function advanceImpactResponse(state: RagdollState, seconds: number) { if (!state.impactResponse) return; state.impactResponse.elapsedSeconds = Math.min(state.impactResponse.durationSeconds, state.impactResponse.elapsedSeconds + seconds); if (state.impactResponse.elapsedSeconds >= state.impactResponse.durationSeconds) delete state.impactResponse; }
function status(state: RagdollState, world: RigidWorld3D, _hit: RigidRaycastHit3D): RagdollStatus3D { return { id: state.id, mode: state.mode, locomotionState: state.locomotionState, authorityState: state.mode === "recovering" ? "recovering" : state.mode === "passive" || state.mode === "settled" ? "downed" : state.impactResponse ? "staggered" : "ready", ...(state.landing ? { landing: { boneId: state.landing.boneId, surfaceBodyId: state.landing.surfaceBodyId, point: [...state.landing.point], impactSpeedMetersPerSecond: state.landing.impactSpeedMetersPerSecond, impactEnergyJoules: state.landing.impactEnergyJoules, normalImpulseNewtonSeconds: state.landing.normalImpulseNewtonSeconds, severity: state.landing.severity, progress: Math.min(1, state.landing.elapsedSeconds / state.landing.durationSeconds) } } : {}), ...(state.impactResponse ? { impactResponse: { impactSpeedMetersPerSecond: state.impactResponse.impactSpeedMetersPerSecond, impactEnergyJoules: state.impactResponse.impactEnergyJoules, normalImpulseNewtonSeconds: state.impactResponse.normalImpulseNewtonSeconds, severity: state.impactResponse.severity, progress: Math.min(1, state.impactResponse.elapsedSeconds / state.impactResponse.durationSeconds) } } : {}), motorWeight: state.motorWeight, settledSeconds: state.settledSeconds, recoveryProgress: state.recovery ? Math.min(1, state.recovery.elapsedSeconds / state.recovery.durationSeconds) : 0, ...(state.recoveryBlocker ? { recoveryBlocker: state.recoveryBlocker } : {}), root: requireBody(world, requireBone(state.bodyByBone, state.rootBoneId, state.id), state.id) }; }
function sampleLocomotionState(state: RagdollState, world: RigidWorld3D, hit: RigidRaycastHit3D): RagdollLocomotionState3D {
  const policy = state.locomotion; if (!policy) return "untracked";
  let totalMass = 0, velocityY = 0;
  for (const handle of state.bodyHandles) { const body = requireBody(world, handle, state.id); totalMass += body.mass; velocityY += body.velocityY * body.mass; }
  if (Math.abs(velocityY / totalMass) > policy.maximumGroundedVerticalSpeedMetersPerSecond) return "airborne";
  for (const support of state.supports.values()) if (world.constraint(support.handle)) return "grounded";
  for (const boneId of policy.supportBoneIds) {
    const body = requireBody(world, requireBone(state.bodyByBone, boneId, state.id), `${state.id}/${boneId}`);
    if (hasStableRagdollRecoverySupport3D({ world, bodies: [body], selfHandles: state.bodyHandles, groundLayerMask: policy.groundLayerMask, probeDistance: policy.probeDistance, minimumNormalY: policy.minimumNormalY, hit })) return "grounded";
  }
  return "airborne";
}
function updateRagdollLocomotion(state: RagdollState, world: RigidWorld3D, hit: RigidRaycastHit3D, contact: RigidContact3D, seconds: number) {
  const raw = sampleLocomotionState(state, world, hit), policy = state.locomotion;
  if (!policy) { state.locomotionState = "untracked"; delete state.landing; return; }
  const impact = strongestLandingContact(state, world, contact);
  if (state.locomotionState === "airborne" && impact && impact.impactSpeedMetersPerSecond >= policy.minimumLandingSpeedMetersPerSecond) {
    const severity = Math.min(1, Math.max(0, (impact.impactSpeedMetersPerSecond - policy.minimumLandingSpeedMetersPerSecond) / (policy.fullImpactLandingSpeedMetersPerSecond - policy.minimumLandingSpeedMetersPerSecond)));
    state.landing = { ...impact, severity, elapsedSeconds: 0, durationSeconds: policy.landingDurationSeconds }; state.locomotionState = "landing"; return;
  }
  if (state.locomotionState === "landing" && state.landing) {
    if (raw === "airborne" && !impact) { delete state.landing; state.locomotionState = "airborne"; return; }
    state.landing.elapsedSeconds = Math.min(state.landing.durationSeconds, state.landing.elapsedSeconds + seconds);
    if (state.landing.elapsedSeconds < state.landing.durationSeconds) { state.locomotionState = "landing"; return; }
    delete state.landing;
  }
  state.locomotionState = raw;
}
function strongestLandingContact(state: RagdollState, world: RigidWorld3D, contact: RigidContact3D) {
  const policy = state.locomotion; if (!policy) return undefined;
  let strongest: Omit<RagdollLandingStatus3D, "progress" | "severity"> | undefined;
  for (let index = 0; index < world.contactCount(); index += 1) {
    world.contact(index, contact); if (contact.trigger || Math.abs(contact.normalY) < policy.minimumNormalY) continue;
    let boneId: string | undefined, ownHandle = -1;
    for (const candidate of policy.supportBoneIds) { const handle = requireBone(state.bodyByBone, candidate, state.id); if (contact.a === handle || contact.b === handle) { boneId = candidate; ownHandle = handle; break; } }
    if (!boneId) continue; const otherHandle = contact.a === ownHandle ? contact.b : contact.a, surface = world.body(otherHandle);
    if (!surface || state.bodyHandles.includes(otherHandle) || surface.trigger || (surface.collisionLayer & policy.groundLayerMask) === 0) continue;
    if (!strongest || contact.closingSpeedMetersPerSecond > strongest.impactSpeedMetersPerSecond) strongest = { boneId, surfaceBodyId: surface.id, point: [contact.pointX, contact.pointY, contact.pointZ], impactSpeedMetersPerSecond: contact.closingSpeedMetersPerSecond, impactEnergyJoules: contact.impactEnergyJoules, normalImpulseNewtonSeconds: contact.normalImpulseNewtonSeconds };
  }
  return strongest;
}
function normalizeImpactResponsePolicy(policy: RagdollImpactResponsePolicy3D | undefined): Required<RagdollImpactResponsePolicy3D> | undefined { if (!policy) return undefined; const minimumStaggerSpeedMetersPerSecond = positive(policy.minimumStaggerSpeedMetersPerSecond ?? 1.5, "impactResponse minimumStaggerSpeedMetersPerSecond"), knockdownSpeedMetersPerSecond = positive(policy.knockdownSpeedMetersPerSecond ?? 10, "impactResponse knockdownSpeedMetersPerSecond"); if (knockdownSpeedMetersPerSecond <= minimumStaggerSpeedMetersPerSecond) throw new RangeError("impactResponse knockdownSpeedMetersPerSecond must exceed minimumStaggerSpeedMetersPerSecond."); return { minimumStaggerSpeedMetersPerSecond, knockdownSpeedMetersPerSecond, staggerDurationSeconds: interval(policy.staggerDurationSeconds ?? .28, .08, 2, "impactResponse staggerDurationSeconds"), staggerMotorYield: unit(policy.staggerMotorYield ?? .2, "impactResponse staggerMotorYield") }; }
function restoreImpactResponse(value: NonNullable<RagdollSystemCheckpoint3D["ragdolls"][number]["impactResponse"]>): NonNullable<RagdollState["impactResponse"]> { const response = { impactSpeedMetersPerSecond: nonnegative(value.impactSpeedMetersPerSecond, "checkpoint impact response speed"), impactEnergyJoules: nonnegative(value.impactEnergyJoules, "checkpoint impact response energy"), normalImpulseNewtonSeconds: nonnegative(value.normalImpulseNewtonSeconds, "checkpoint impact response impulse"), severity: unit(value.severity, "checkpoint impact response severity"), elapsedSeconds: nonnegative(value.elapsedSeconds, "checkpoint impact response elapsedSeconds"), durationSeconds: interval(value.durationSeconds, .08, 2, "checkpoint impact response durationSeconds") }; if (response.elapsedSeconds > response.durationSeconds) throw new Error("Checkpoint impact response elapsed time exceeds its duration."); return response; }
function restoreLanding(value: NonNullable<RagdollSystemCheckpoint3D["ragdolls"][number]["landing"]>): NonNullable<RagdollState["landing"]> { const landing = { boneId: text(value.boneId, "checkpoint landing boneId"), surfaceBodyId: text(value.surfaceBodyId, "checkpoint landing surfaceBodyId"), point: vector3(value.point, "checkpoint landing point"), impactSpeedMetersPerSecond: nonnegative(value.impactSpeedMetersPerSecond, "checkpoint landing impactSpeedMetersPerSecond"), impactEnergyJoules: nonnegative(value.impactEnergyJoules, "checkpoint landing impactEnergyJoules"), normalImpulseNewtonSeconds: nonnegative(value.normalImpulseNewtonSeconds, "checkpoint landing normalImpulseNewtonSeconds"), severity: unit(value.severity, "checkpoint landing severity"), elapsedSeconds: nonnegative(value.elapsedSeconds, "checkpoint landing elapsedSeconds"), durationSeconds: positive(value.durationSeconds, "checkpoint landing durationSeconds") }; if (landing.elapsedSeconds > landing.durationSeconds) throw new Error("Checkpoint landing elapsed time exceeds its duration."); return landing; }
function restoreLocomotionCheckpoint(state: RagdollState, saved: RagdollSystemCheckpoint3D["ragdolls"][number], world: RigidWorld3D, hit: RigidRaycastHit3D) { const locomotionState = saved.locomotionState ?? sampleLocomotionState(state, world, hit); if (!["grounded", "airborne", "landing", "untracked"].includes(locomotionState) || (locomotionState === "landing") !== !!saved.landing) throw new Error(`Ragdoll checkpoint ${saved.id} locomotion state is incompatible.`); const landing = saved.landing ? restoreLanding(saved.landing) : undefined; if (landing && (!state.bodyByBone.has(landing.boneId) || !world.hasBody(landing.surfaceBodyId))) throw new Error(`Ragdoll checkpoint ${saved.id} landing contact is incompatible.`); state.locomotionState = locomotionState; state.landing = landing; }
function cloneRecovery(recovery: Readonly<NormalizedRecovery> | NonNullable<RagdollSystemCheckpoint3D["ragdolls"][number]["recovery"]>): NormalizedRecovery { const pose = recovery.pose.slice(); return { ...recovery, pose, sourcePose: recovery.sourcePose?.slice() ?? pose.slice(), poseBlendSeconds: recovery.poseBlendSeconds ?? 0, position: [...recovery.position], rotation: [...recovery.rotation], supportBoneIds: [...recovery.supportBoneIds] }; }
function normalizedRecovery(state: RagdollState, target: RagdollRecoveryTarget3D): NormalizedRecovery { if (!target || typeof target !== "object") throw new TypeError("Ragdoll recovery target is required."); const requireStableSupport = target.requireStableSupport === true, supportBoneIds = target.supportBoneIds === undefined ? [] : [...target.supportBoneIds].map((boneId) => text(boneId, "recovery supportBoneId")); if (supportBoneIds.length > 8 || new Set(supportBoneIds).size !== supportBoneIds.length) throw new RangeError("Recovery supportBoneIds must contain up to 8 distinct stable bones."); for (const boneId of supportBoneIds) requireBone(state.bodyByBone, boneId, state.id); if (requireStableSupport && supportBoneIds.length === 0) throw new Error("Stable recovery support requires at least one support bone."); if (target.poseTransition !== undefined && target.poseTransition !== "blend" && target.poseTransition !== "cut") throw new TypeError("Recovery poseTransition must be blend or cut."); const durationSeconds = Math.max(state.minimumTransitionSeconds, positive(target.durationSeconds ?? 0.6, "recovery durationSeconds")), requestedPoseBlend = target.poseBlendSeconds === undefined ? durationSeconds : nonnegative(target.poseBlendSeconds, "recovery poseBlendSeconds"), poseBlendSeconds = target.poseTransition === "cut" ? 0 : Math.max(state.minimumTransitionSeconds, requestedPoseBlend); return { pose: copyPose(target.pose, state.motorByJoint), sourcePose: new Float64Array(state.pose.length), position: vector3(target.rootPosition, "rootPosition"), rotation: quaternion(target.rootRotation, "rootRotation"), durationSeconds, poseBlendSeconds, elapsedSeconds: 0, requireStableSupport, supportBoneIds, groundLayerMask: collisionMask(target.groundLayerMask ?? 1), supportProbeDistance: positive(target.supportProbeDistance ?? .3, "recovery supportProbeDistance"), minimumSupportNormalY: interval(target.minimumSupportNormalY ?? .6, 0, 1, "recovery minimumSupportNormalY"), padding: nonnegative(target.clearancePadding ?? .02, "recovery clearancePadding") }; }
function requireRagdoll(map: Map<string, RagdollState>, id: string) { const state = map.get(id); if (!state) throw new Error(`Ragdoll ${JSON.stringify(id)} does not exist.`); return state; }
function normalizeSupport(state: RagdollState, intent: RagdollSupportIntent3D) { if (!intent || typeof intent !== "object") throw new TypeError("Ragdoll support intent is required."); const id = text(intent.id, "support id"), boneId = text(intent.boneId, "support boneId"), bodyHandle = requireBone(state.bodyByBone, boneId, state.id), groundLayerMask = collisionMask(intent.groundLayerMask ?? 1), probeDistance = positive(intent.probeDistance ?? .25, "support probeDistance"), minimumNormalY = interval(intent.minimumNormalY ?? .6, 0, 1, "support minimumNormalY"), maximumPlantSpeed = positive(intent.maximumPlantSpeed ?? 3, "support maximumPlantSpeed"), stiffness = unit(intent.stiffness ?? .92, "support stiffness"), damping = unit(intent.damping ?? .95, "support damping"), maxImpulse = positive(intent.maxImpulse ?? 100, "support maxImpulse"), breakImpulse = positive(intent.breakImpulse ?? 350, "support breakImpulse"), balanceRadiusMeters = nonnegative(intent.balanceRadiusMeters ?? .12, "support balanceRadiusMeters"), balanceStiffness = unit(intent.balanceStiffness ?? .35, "support balanceStiffness"), balanceDamping = unit(intent.balanceDamping ?? .85, "support balanceDamping"), maxBalanceImpulse = nonnegative(intent.maxBalanceImpulse ?? 4, "support maxBalanceImpulse"), predictionSeconds = interval(intent.predictionSeconds ?? .18, 0, 2, "support predictionSeconds"), forceDistribution = intent.forceDistribution ?? "whole-body"; if (forceDistribution !== "whole-body" && forceDistribution !== "root") throw new TypeError(`Support force distribution ${String(forceDistribution)} is unsupported; choose whole-body or root.`); return { id, boneId, bodyHandle, groundLayerMask, probeDistance, minimumNormalY, maximumPlantSpeed, stiffness, damping, maxImpulse, breakImpulse, balanceRadiusMeters, balanceStiffness, balanceDamping, maxBalanceImpulse, predictionSeconds, forceDistribution }; }
function normalizeStep(state: RagdollState, intent: RagdollStepIntent3D): NormalizedStep { if (!intent || typeof intent !== "object") throw new TypeError("Ragdoll step intent is required."); const id = text(intent.id, "step id"), boneId = text(intent.boneId, "step boneId"), direction = vector3(intent.direction, "step direction"), horizontal = hypot(direction[0], direction[2]); if (horizontal <= 1e-12) throw new RangeError("Step direction needs a horizontal component."); if (intent.allowFlight !== undefined && typeof intent.allowFlight !== "boolean") throw new TypeError("step allowFlight must be boolean"); const durationSeconds = interval(intent.durationSeconds ?? .3, .08, 2, "step durationSeconds"); return { id, boneId, bodyHandle: requireBone(state.bodyByBone, boneId, state.id), state: "moving", start: [0, 0, 0], target: [0, 0, 0], direction: [direction[0] / horizontal, 0, direction[2] / horizontal], speedMetersPerSecond: positive(intent.speedMetersPerSecond, "step speedMetersPerSecond"), predictionSeconds: interval(intent.predictionSeconds ?? .25, .01, 2, "step predictionSeconds"), maximumDistance: interval(intent.maximumDistance ?? .8, .05, 5, "step maximumDistance"), durationSeconds, maximumWaitSeconds: Math.max(.2, Math.min(.5, durationSeconds)), elapsedSeconds: 0, liftHeight: interval(intent.liftHeight ?? .16, 0, 1, "step liftHeight"), groundLayerMask: collisionMask(intent.groundLayerMask ?? 1), probeHeight: interval(intent.probeHeight ?? .5, .01, 5, "step probeHeight"), probeDistance: interval(intent.probeDistance ?? 1, .01, 10, "step probeDistance"), minimumNormalY: interval(intent.minimumNormalY ?? .6, 0, 1, "step minimumNormalY"), stiffness: unit(intent.stiffness ?? .9, "step stiffness"), damping: unit(intent.damping ?? .95, "step damping"), maximumDriveImpulse: positive(intent.maximumDriveImpulse ?? 20, "step maximumDriveImpulse"), landingTolerance: interval(intent.landingTolerance ?? .08, .005, .5, "step landingTolerance"), maximumLandingSpeed: positive(intent.maximumLandingSpeed ?? 1.5, "step maximumLandingSpeed"), allowFlight: intent.allowFlight ?? false }; }
function normalizeTakeoff(state: RagdollState, intent: RagdollTakeoffIntent3D) { if (!intent || typeof intent !== "object") throw new TypeError("Ragdoll takeoff intent is required."); const supportBoneIds = [...intent.supportBoneIds].map((boneId) => text(boneId, "takeoff supportBoneId")); if (supportBoneIds.length === 0 || supportBoneIds.length > 8 || new Set(supportBoneIds).size !== supportBoneIds.length) throw new RangeError("Takeoff supportBoneIds must contain 1 through 8 distinct stable bones."); for (const boneId of supportBoneIds) requireBone(state.bodyByBone, boneId, state.id); const velocity = vector3(intent.velocity, "takeoff velocity"); if (!(velocity[1] > 0)) throw new RangeError("Takeoff velocity needs a positive vertical component."); return { supportBoneIds, velocity, groundLayerMask: collisionMask(intent.groundLayerMask ?? 1), probeDistance: positive(intent.probeDistance ?? .2, "takeoff probeDistance"), minimumNormalY: interval(intent.minimumNormalY ?? .6, 0, 1, "takeoff minimumNormalY"), maximumGroundedVerticalSpeedMetersPerSecond: positive(intent.maximumGroundedVerticalSpeedMetersPerSecond ?? 1, "takeoff maximumGroundedVerticalSpeedMetersPerSecond") }; }
function normalizeLocomotionPolicy(policy: RagdollLocomotionPolicy3D | undefined, bodyByBone: ReadonlyMap<string, number>, ragdollId: string): RagdollState["locomotion"] {
  if (policy === undefined) return undefined;
  if (!policy || typeof policy !== "object") throw new TypeError(`Ragdoll ${ragdollId} locomotion policy must be an object.`);
  const supportBoneIds = [...policy.supportBoneIds].map((boneId) => text(boneId, "locomotion supportBoneId"));
  if (supportBoneIds.length === 0 || supportBoneIds.length > 8 || new Set(supportBoneIds).size !== supportBoneIds.length) throw new RangeError("Locomotion supportBoneIds must contain 1 through 8 distinct stable bones.");
  for (const boneId of supportBoneIds) requireBone(bodyByBone, boneId, ragdollId);
  const minimumLandingSpeedMetersPerSecond = positive(policy.minimumLandingSpeedMetersPerSecond ?? 1.5, "locomotion minimumLandingSpeedMetersPerSecond"), fullImpactLandingSpeedMetersPerSecond = positive(policy.fullImpactLandingSpeedMetersPerSecond ?? 8, "locomotion fullImpactLandingSpeedMetersPerSecond");
  if (fullImpactLandingSpeedMetersPerSecond <= minimumLandingSpeedMetersPerSecond) throw new RangeError("Locomotion fullImpactLandingSpeedMetersPerSecond must exceed minimumLandingSpeedMetersPerSecond.");
  return { supportBoneIds, groundLayerMask: collisionMask(policy.groundLayerMask ?? 1), probeDistance: positive(policy.probeDistance ?? .2, "locomotion probeDistance"), minimumNormalY: interval(policy.minimumNormalY ?? .6, 0, 1, "locomotion minimumNormalY"), maximumGroundedVerticalSpeedMetersPerSecond: positive(policy.maximumGroundedVerticalSpeedMetersPerSecond ?? 1, "locomotion maximumGroundedVerticalSpeedMetersPerSecond"), minimumLandingSpeedMetersPerSecond, fullImpactLandingSpeedMetersPerSecond, landingDurationSeconds: interval(policy.landingDurationSeconds ?? .24, .08, 2, "locomotion landingDurationSeconds"), landingMotorYield: unit(policy.landingMotorYield ?? .35, "locomotion landingMotorYield") };
}
function stepStatusValue(step: NormalizedStep): RagdollStepStatus3D { return { id: step.id, boneId: step.boneId, state: step.state, ...(step.state === "moving" || step.state === "planted" ? { target: tuple3(...step.target) } : {}), ...(step.reason ? { reason: step.reason } : {}) }; }
function cloneStep(step: NormalizedStep): NonNullable<RagdollSystemCheckpoint3D["ragdolls"][number]["steps"]>[number] { return { id: step.id, boneId: step.boneId, bodyHandle: step.bodyHandle, state: step.state, start: [...step.start], target: [...step.target], ...(step.targetBodyId ? { targetBodyId: step.targetBodyId } : {}), ...(step.localTarget ? { localTarget: [...step.localTarget] } : {}), direction: [...step.direction], speedMetersPerSecond: step.speedMetersPerSecond, predictionSeconds: step.predictionSeconds, maximumDistance: step.maximumDistance, durationSeconds: step.durationSeconds, maximumWaitSeconds: step.maximumWaitSeconds, elapsedSeconds: step.elapsedSeconds, liftHeight: step.liftHeight, groundLayerMask: step.groundLayerMask, probeHeight: step.probeHeight, probeDistance: step.probeDistance, minimumNormalY: step.minimumNormalY, stiffness: step.stiffness, damping: step.damping, maximumDriveImpulse: step.maximumDriveImpulse, landingTolerance: step.landingTolerance, maximumLandingSpeed: step.maximumLandingSpeed, ...(step.allowFlight ? { allowFlight: true } : {}), ...(step.takeoffVelocityY === undefined ? {} : { takeoffVelocityY: step.takeoffVelocityY }), ...(step.takeoffApplied ? { takeoffApplied: true } : {}), ...(step.reason ? { reason: step.reason } : {}) }; }
function restoreStep(step: NonNullable<RagdollSystemCheckpoint3D["ragdolls"][number]["steps"]>[number]): NormalizedStep {
  const direction = vector3(step.direction, "checkpoint step direction"), horizontal = hypot(direction[0], direction[2]);
  if (Math.abs(horizontal - 1) > 1e-8 || Math.abs(direction[1]) > 1e-12) throw new Error("Checkpoint step direction must be normalized on the horizontal plane.");
  return { id: text(step.id, "checkpoint step id"), boneId: text(step.boneId, "checkpoint step boneId"), bodyHandle: step.bodyHandle, state: step.state, start: vector3(step.start, "checkpoint step start"), target: vector3(step.target, "checkpoint step target"), ...(step.targetBodyId ? { targetBodyId: text(step.targetBodyId, "checkpoint step targetBodyId") } : {}), ...(step.localTarget ? { localTarget: vector3(step.localTarget, "checkpoint step localTarget") } : {}), direction, speedMetersPerSecond: positive(step.speedMetersPerSecond, "checkpoint step speedMetersPerSecond"), predictionSeconds: interval(step.predictionSeconds, .01, 2, "checkpoint step predictionSeconds"), maximumDistance: interval(step.maximumDistance, .05, 5, "checkpoint step maximumDistance"), durationSeconds: interval(step.durationSeconds, .08, 2, "checkpoint step durationSeconds"), maximumWaitSeconds: interval(step.maximumWaitSeconds, 0, 2, "checkpoint step maximumWaitSeconds"), elapsedSeconds: nonnegative(step.elapsedSeconds, "checkpoint step elapsedSeconds"), liftHeight: interval(step.liftHeight, 0, 1, "checkpoint step liftHeight"), groundLayerMask: collisionMask(step.groundLayerMask), probeHeight: interval(step.probeHeight, .01, 5, "checkpoint step probeHeight"), probeDistance: interval(step.probeDistance, .01, 10, "checkpoint step probeDistance"), minimumNormalY: interval(step.minimumNormalY, 0, 1, "checkpoint step minimumNormalY"), stiffness: unit(step.stiffness, "checkpoint step stiffness"), damping: unit(step.damping, "checkpoint step damping"), maximumDriveImpulse: positive(step.maximumDriveImpulse, "checkpoint step maximumDriveImpulse"), landingTolerance: interval(step.landingTolerance, .005, .5, "checkpoint step landingTolerance"), maximumLandingSpeed: positive(step.maximumLandingSpeed, "checkpoint step maximumLandingSpeed"), allowFlight: step.allowFlight ?? false, ...(step.takeoffVelocityY === undefined ? {} : { takeoffVelocityY: nonnegative(step.takeoffVelocityY, "checkpoint step takeoffVelocityY") }), ...(step.takeoffApplied ? { takeoffApplied: true } : {}), ...(step.reason ? { reason: text(step.reason, "checkpoint step reason") } : {}) };
}
function emptyRaycast(): RigidRaycastHit3D { return { handle: 0, id: "", distance: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 }; }
function emptyContact(): RigidContact3D { return { a: 0, b: 0, aId: "", bId: "", normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false }; }
function bodyLocalPoint(body: RigidBodyState3D, point: readonly [number, number, number]): [number, number, number] { return rotate([-body.rotationX, -body.rotationY, -body.rotationZ, body.rotationW], [point[0] - body.x, point[1] - body.y, point[2] - body.z]); }

/** Returns the visible body's lowest point, not a virtual point at the ray hit. */
function bodyDownwardSupportPoint(body: RigidBodyState3D): { localPoint: [number, number, number]; verticalExtent: number } {
  const inverseRotation = [-body.rotationX, -body.rotationY, -body.rotationZ, body.rotationW] as const;
  const localDown = rotate(inverseRotation, [0, -1, 0]);
  const localPoint: [number, number, number] = body.shape.kind === "sphere"
    ? [localDown[0] * body.shape.radius, localDown[1] * body.shape.radius, localDown[2] * body.shape.radius]
    : [supportCoordinate(localDown[0], body.shape.halfX), supportCoordinate(localDown[1], body.shape.halfY), supportCoordinate(localDown[2], body.shape.halfZ)];
  const worldOffset = rotate([body.rotationX, body.rotationY, body.rotationZ, body.rotationW], localPoint);
  return { localPoint, verticalExtent: Math.max(0, -worldOffset[1]) };
}

function supportCoordinate(direction: number, halfExtent: number): number {
  return Math.abs(direction) < 1e-8 ? 0 : Math.sign(direction) * halfExtent;
}
function copyPose(pose: RagdollPose3D, joints: readonly { poseJointIndex: number }[]) { const needed = joints.reduce((maximum, joint) => Math.max(maximum, joint.poseJointIndex + 1), 0) * 4; if (!pose?.rotations || pose.rotations.length < needed) throw new RangeError(`Ragdoll pose needs at least ${needed} rotation values.`); const copy = new Float64Array(needed); for (let index = 0; index < needed; index += 4) copy.set(quaternion([pose.rotations[index]!, pose.rotations[index + 1]!, pose.rotations[index + 2]!, pose.rotations[index + 3]!], `pose rotation ${index / 4}`), index); return copy; }
function angularVelocityTorqueImpulse(body: RigidBodyState3D, delta: readonly [number, number, number]): [number, number, number] { const rotation = bodyRotation(body), local = rotate(inverseRotation(rotation), delta), inertia = body.shape.kind === "sphere" ? [.4 * body.mass * body.shape.radius ** 2, .4 * body.mass * body.shape.radius ** 2, .4 * body.mass * body.shape.radius ** 2] as const : [body.mass * (body.shape.halfY ** 2 + body.shape.halfZ ** 2) / 3, body.mass * (body.shape.halfX ** 2 + body.shape.halfZ ** 2) / 3, body.mass * (body.shape.halfX ** 2 + body.shape.halfY ** 2) / 3] as const; return rotate(rotation, [local[0] * inertia[0], local[1] * inertia[1], local[2] * inertia[2]]); }
function inverseInertiaAlongAxis(body: RigidBodyState3D, axisWorld: readonly [number, number, number]): number { const local = rotate(inverseRotation(bodyRotation(body)), axisWorld), inertia = body.shape.kind === "sphere" ? [.4 * body.mass * body.shape.radius ** 2, .4 * body.mass * body.shape.radius ** 2, .4 * body.mass * body.shape.radius ** 2] as const : [body.mass * (body.shape.halfY ** 2 + body.shape.halfZ ** 2) / 3, body.mass * (body.shape.halfX ** 2 + body.shape.halfZ ** 2) / 3, body.mass * (body.shape.halfX ** 2 + body.shape.halfY ** 2) / 3] as const; return local[0] ** 2 / inertia[0] + local[1] ** 2 / inertia[1] + local[2] ** 2 / inertia[2]; }
function normalizeJointDrive(state: RagdollState, intent: RagdollJointDrive3D) { const jointId = text(intent?.jointId, "joint drive jointId"), joint = state.motorByJoint.find((item) => item.id === jointId); if (!joint) throw new Error(`Ragdoll ${state.id} joint ${jointId} does not exist.`); const axis = vector3(intent.axisParentLocal, "joint drive axisParentLocal"), length = hypot(...axis); if (length <= 1e-12) throw new RangeError("Joint drive axisParentLocal must be non-zero."); return { joint, axisParentLocal: tuple3((axis[0]!) / length, (axis[1]!) / length, (axis[2]!) / length), targetAngularVelocity: finite(intent.targetAngularVelocity, "joint drive targetAngularVelocity"), maxTorqueImpulse: positive(intent.maxTorqueImpulse, "joint drive maxTorqueImpulse") }; }
function normalizeEffectorDrive(state: RagdollState, intent: RagdollEffectorDrive3D) { if (!intent || typeof intent !== "object") throw new TypeError("Ragdoll effector drive intent is required."); const effectorBoneId = text(intent.effectorBoneId, "effector drive boneId"), effectorHandle = requireBone(state.bodyByBone, effectorBoneId, state.id); if (!Array.isArray(intent.jointIds) || intent.jointIds.length < 1 || intent.jointIds.length > 30) throw new RangeError("Effector drive jointIds must contain 1 through 30 connected joints."); const ids = intent.jointIds.map((id) => text(id, "effector drive jointId")); if (new Set(ids).size !== ids.length) throw new Error("Effector drive jointIds must be distinct and ordered from base to effector."); const source = ids.map((id) => { const joint = state.motorByJoint.find((item) => item.id === id); if (!joint) throw new Error(`Ragdoll ${state.id} joint ${id} does not exist.`); return joint; }), baseHandle = intent.baseBoneId === undefined ? source[0]!.parentHandle : requireBone(state.bodyByBone, text(intent.baseBoneId, "effector drive baseBoneId"), state.id), joints = []; let cursor = baseHandle; for (const joint of source) { if (joint.parentHandle === cursor) { joints.push(joint); cursor = joint.childHandle; } else if (intent.baseBoneId !== undefined && joint.childHandle === cursor) { joints.push({ ...joint, parentHandle: joint.childHandle, childHandle: joint.parentHandle, localAnchorParent: joint.localAnchorChild, localAnchorChild: joint.localAnchorParent }); cursor = joint.parentHandle; } else throw new Error(`Ragdoll ${state.id} effector drive joints are not one connected base-to-effector chain at ${joint.id}.`); } if (cursor !== effectorHandle) throw new Error(`Ragdoll ${state.id} effector ${effectorBoneId} must be the child body of final joint ${ids.at(-1)}.`); const targetAngularVelocity = intent.targetAngularVelocity === undefined ? undefined : vector3(intent.targetAngularVelocity, "effector drive targetAngularVelocity"), maxAngularTorqueImpulse = targetAngularVelocity === undefined ? undefined : positive(intent.maxAngularTorqueImpulse ?? Number.NaN, "effector drive maxAngularTorqueImpulse"); return { effectorBoneId, effectorHandle, joints, targetVelocity: vector3(intent.targetVelocity, "effector drive targetVelocity"), velocityGain: interval(intent.velocityGain ?? .08, 0.01, 1, "effector drive velocityGain"), maxTorqueImpulse: positive(intent.maxTorqueImpulse, "effector drive maxTorqueImpulse"), targetAngularVelocity, maxAngularTorqueImpulse }; }

function applyEffectorAngularDrive(world: RigidWorld3D, ragdollId: string, effector: RigidBodyState3D, joints: readonly { id: string; parentHandle: number; childHandle: number }[], target: readonly [number, number, number], maximum: number, forced: Set<number>) {
  const requested = angularVelocityTorqueImpulse(effector, [target[0] - effector.angularVelocityX, target[1] - effector.angularVelocityY, target[2] - effector.angularVelocityZ]), torque = clampVector(requested[0], requested[1], requested[2], maximum), length = hypot(...torque);
  forced.add(effector.handle); if (length <= 1e-12) return;
  world.applyTorqueImpulse(effector.handle, torque[0], torque[1], torque[2]);
  const axis = [torque[0] / length, torque[1] / length, torque[2] / length] as const, handles = [...new Set(joints.map((joint) => joint.parentHandle).filter((handle) => handle !== effector.handle))], reactions: Array<{ handle: number; weight: number }> = []; let totalWeight = 0;
  for (const handle of handles) { const body = requireBody(world, handle, ragdollId), axisTorque = angularVelocityTorqueImpulse(body, axis), weight = Math.max(1e-12, axis[0] * axisTorque[0] + axis[1] * axisTorque[1] + axis[2] * axisTorque[2]); reactions.push({ handle, weight }); totalWeight += weight; }
  let appliedX = 0, appliedY = 0, appliedZ = 0;
  for (let index = 0; index < reactions.length; index += 1) { const reaction = reactions[index]!, last = index === reactions.length - 1, share = reaction.weight / totalWeight, x = last ? -torque[0] - appliedX : -torque[0] * share, y = last ? -torque[1] - appliedY : -torque[1] * share, z = last ? -torque[2] - appliedZ : -torque[2] * share; world.applyTorqueImpulse(reaction.handle, x, y, z); appliedX += x; appliedY += y; appliedZ += z; forced.add(reaction.handle); }
}
function vector3(input: ArrayLike<number>, label: string): [number, number, number] { return [finite(input[0]!, `${label}[0]`), finite(input[1]!, `${label}[1]`), finite(input[2]!, `${label}[2]`)]; }
type HumanoidRole = "root" | "torso" | "head" | "upper-limb" | "lower-limb" | "hand" | "foot" | "ignore";
function humanoidRole(id: string): HumanoidRole { const name = id.toLowerCase().replaceAll(/[^a-z0-9]+/g, ""); if (/(finger|thumb|index|middle|ring|pinky|toe|twist|roll|helper|control|socket|weapon|ik|fk|end)/.test(name)) return "ignore"; if (/(hips|pelvis)/.test(name)) return "root"; if (/(spine|chest|torso|neck|clavicle|shoulder)/.test(name)) return "torso"; if (/head/.test(name)) return "head"; if (/(hand|wrist)/.test(name)) return "hand"; if (/(foot|ankle)/.test(name)) return "foot"; if (/(forearm|lowerarm|lowerleg|calf|shin)/.test(name)) return "lower-limb"; if (/(upperarm|uparm|thigh|upleg|upperleg)/.test(name)) return "upper-limb"; if (/(left|right|(^|[lr]))(arm|leg)/.test(name)) return "upper-limb"; return "ignore"; }
function descendantOf(id: string, ancestor: string, bones: ReadonlyMap<string, HumanoidRagdollBone3D>) { const visited = new Set<string>(); let cursor: string | undefined = id; while (cursor && !visited.has(cursor)) { if (cursor === ancestor) return true; visited.add(cursor); cursor = bones.get(cursor)?.parentId; } return false; }
function massWeight(role: HumanoidRole) { if (role === "root") return 4; if (role === "torso") return 2.4; if (role === "head") return 1.5; if (role === "upper-limb") return 1.3; if (role === "lower-limb") return 1; if (role === "hand" || role === "foot") return .65; return 1; }
function radiusFactor(role: HumanoidRole) { if (role === "root") return .085; if (role === "torso") return .07; if (role === "head") return .065; if (role === "upper-limb") return .045; if (role === "lower-limb") return .038; return .032; }
function humanoidSwingTwistLimit(role: HumanoidRole): Omit<RagdollSwingTwistLimit3D, "twistAxis"> {
  if (role === "torso") return { maxSwingRadians: .7, minTwistRadians: -.45, maxTwistRadians: .45 };
  if (role === "head") return { maxSwingRadians: .75, minTwistRadians: -.95, maxTwistRadians: .95 };
  if (role === "upper-limb") return { maxSwingRadians: 2.1, minTwistRadians: -1.4, maxTwistRadians: 1.4 };
  if (role === "lower-limb") return { maxSwingRadians: 2.45, minTwistRadians: -.35, maxTwistRadians: .35 };
  if (role === "hand") return { maxSwingRadians: .8, minTwistRadians: -.55, maxTwistRadians: .55 };
  if (role === "foot") return { maxSwingRadians: .4, minTwistRadians: -.3, maxTwistRadians: .3 };
  return { maxSwingRadians: 1.1, minTwistRadians: -.5, maxTwistRadians: .5 };
}
function boundedJointTorqueImpulse(parent: Pick<RigidBodyDefinition3D, "mass" | "shape">, child: Pick<RigidBodyDefinition3D, "mass" | "shape">, authoredCap: number, relativeVelocityDelta: number) {
  const parentInertia = minimumBodyInertia(parent), childInertia = minimumBodyInertia(child);
  const effectiveInertia = 1 / (1 / parentInertia + 1 / childInertia);
  return Math.min(authoredCap, effectiveInertia * relativeVelocityDelta);
}
function minimumBodyInertia(body: Pick<RigidBodyDefinition3D, "mass" | "shape">) {
  const mass = body.mass!;
  if (body.shape.kind === "sphere") return .4 * mass * body.shape.radius * body.shape.radius;
  const x = body.shape.halfX * 2, y = body.shape.halfY * 2, z = body.shape.halfZ * 2;
  return mass / 12 * Math.min(y * y + z * z, x * x + z * z, x * x + y * y);
}
function collisionLayer(value: number) { if (!Number.isSafeInteger(value) || value <= 1 || value > 0x4000_0000 || (value & (value - 1)) !== 0) throw new RangeError("collisionLayer must be one non-environment uint32 bit."); return value >>> 0; }
function collisionMask(value: number) { if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError("groundLayerMask must be a uint32 value."); return value >>> 0; }
function multiply3(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] { return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]; }
function add3(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract3(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function text(value: unknown, label: string) { return requireText(value, { min: 1, max: 256, message: `${label} must be non-empty bounded text.` }); }
function nonnegative(value: number, label: string) { value = finite(value, label); if (value < 0) throw new RangeError(`${label} must be non-negative.`); return value; }
function positive(value: number, label: string) { value = finite(value, label); if (value <= 0) throw new RangeError(`${label} must be positive.`); return value; }
function unit(value: number, label: string) { value = finite(value, label); if (value < 0 || value > 1) throw new RangeError(`${label} must be between zero and one.`); return value; }
function interval(value: number, minimum: number, maximum: number, label: string) { value = finite(value, label); if (value < minimum || value > maximum) throw new RangeError(`${label} must be from ${minimum} through ${maximum}.`); return value; }
