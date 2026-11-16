import { tuple3, tuple4 } from "../math/tuples.ts";
import { createPhysicalContactBindManager3D, type PhysicalContactBindCheckpoint3D } from "./performance/contact-bind-3d.ts";
import { normalizedRotation, resolveEffectorOrientation, restoreEffectorOrientation } from "./performance/effector-orientation-3d.ts";
import { type PhysicalEffectorPath3D } from "./performance/effector-path-3d.ts";
import { configureRagdollActivation3D, createPhysicalDriveController3D, finite, normalized, requireBody, requireBodyState, resolveHandle, vector3, writePhysicalBodyState, type ActivePhysicalEffectorDrive3D } from "./performance/physical-drives-3d.ts";
import { createPhysicalActionLifecycle3D, createPhysicalPerformanceQualityMonitor3D, validatePhysicalPerformanceQualityGates3D, type PhysicalActionCueSpec3D, type PhysicalActionLifecycleCheckpoint3D, type PhysicalActionState3D, type PhysicalPerformanceQualityCheckpoint3D, type PhysicalPerformanceQualityGates3D, type PhysicalQualityBody3D, type PhysicalQualityLimit3D } from "./performance/physical-performance-3d-control.ts";
import { frameIndex, nonnegative, nonnegativeInteger, positive, positiveInteger, preflightCues, resolveRecoveryTarget, text } from "./performance/physical-preflight-3d.ts";
import { createRagdollSystem3D, type RagdollActuationMode3D, type RagdollAuthorityState3D, type RagdollDefinition3D, type RagdollLandingStatus3D, type RagdollLocomotionState3D, type RagdollMode3D, type RagdollPose3D, type RagdollPosture3D, type RagdollRecoveryEnvironment3D, type RagdollRecoveryTarget3D, type RagdollSystemCheckpoint3D } from "./ragdoll-3d.ts";
import { createRigidWorld3D, type RigidBodyDefinition3D, type RigidBodyState3D, type RigidContact3D, type RigidMaterialPresetId3D, type RigidShape3D, type RigidWorldCheckpoint3D, type RigidWorldOptions3D } from "./rigid-3d.ts";
import { rigidMaterialPreset3D } from "./rigid/materials.ts";
export { requiredPhysicalEffectorPeakSpeed3D,type PhysicalEffectorPath3D } from "./performance/effector-path-3d.ts";
export { auditPhysicalActionAcceptance3D,auditPhysicalContactPoseAgreement3D,comparePhysicalActionMechanics3D,samplePhysicalBodyMotion3D,type PhysicalActionAcceptanceFinding3D,type PhysicalActionAcceptanceReport3D,type PhysicalActionMechanicsComparison3D,type PhysicalBodyMotionSample3D,type PhysicalBodyMotionSummary3D,type PhysicalContactPoseAgreement3D,type PhysicalContactPoseEvidence3D,type PhysicalPoseAgreementFinding3D } from "./performance/physical-action-acceptance-3d.ts";
export { planPhysicalEffectorTrajectory3D,type PhysicalEffectorTrajectoryPlan3D } from "./performance/physical-effector-trajectory-3d.ts";
export type { PhysicalActionPhase3D,PhysicalActionState3D,PhysicalPerformanceQualityGates3D } from "./performance/physical-performance-3d-control.ts";
export { planPhysicalActionIntent3D,planPhysicalActionStylePath3D,type PhysicalActionIntentPlan3D,type PhysicalActionResponse3D,type PhysicalActionStyle3D } from "./planning/physical-action-intent-3d.ts";
export const PHYSICAL_BODY_STATE_STRIDE_3D = 13;
export type PhysicalBodyReference3D =
  | { bodyId: string }
  | { ragdollId: string; boneId: string };
export type PhysicalContactAnchor3D = { cueId: string; offsetFrames: number };
export type PhysicalEffectorOrientation3D =
  | { mode?: "turn"; axisWorld: readonly [number, number, number]; angularDistanceDegrees: number; peakAngularSpeedDegreesPerSecond: number; trackingGainPerSecond?: number; maxTorqueImpulse?: number }
  | { mode: "align-direction"; localAxis: readonly [number, number, number]; peakAngularSpeedDegreesPerSecond: number; trackingGainPerSecond?: number; maxTorqueImpulse?: number }
  | { mode: "aim-at-body"; localAxis: readonly [number, number, number]; target: PhysicalBodyReference3D; peakAngularSpeedDegreesPerSecond: number; trackingGainPerSecond?: number; maxTorqueImpulse?: number };
export const RAGDOLL_POSTURES_3D = ["upright", "face-up", "face-down", "left-side", "right-side"] as const;
export const RAGDOLL_RECOVERY_ENVIRONMENTS_3D = ["crouched", "wall-supported", "ledge-supported"] as const;
export type PhysicalGetUpEnvironmentSelection3D = { clips: Partial<Record<Exclude<RagdollRecoveryEnvironment3D, "open">, string>>; proximityMeters?: number; standingHeadroomMeters?: number; ledgeProbeDistance?: number; ledgeHeightTolerance?: number };
export type PhysicalGetUpSelection3D = { postureBoneId: string; clips: Record<RagdollPosture3D, string>; environment?: PhysicalGetUpEnvironmentSelection3D; sourceStartSeconds?: number; speed?: number; loop?: boolean };
export type PhysicalPerformanceCue3D =
  | { id: string; kind: "pose"; frame: number; ragdollId: string; pose: RagdollPose3D }
  | { id: string; kind: "mode"; frame: number; ragdollId: string; mode: Exclude<RagdollMode3D, "settled" | "recovering">; afterContact?: PhysicalContactAnchor3D; durationSeconds?: number; /** Explicit expert escape hatch; normal mode changes always respect the ragdoll's minimum transition. */ discontinuous?: boolean }
  | { id: string; kind: "recovery"; frame: number; ragdollId: string; afterContact?: PhysicalContactAnchor3D; startCondition?: "at-frame" | "after-settled"; maximumWaitFrames?: number; getUp?: PhysicalGetUpSelection3D; target: Omit<RagdollRecoveryTarget3D, "pose" | "rootPosition"> & { pose?: RagdollPose3D; positionMode?: "authored" | "settled"; rootPosition?: readonly [number, number, number] } }
  | { id: string; kind: "support"; frame: number; durationFrames: number; ragdollId: string; boneId: string; groundLayerMask?: number; probeDistance?: number; minimumNormalY?: number; maximumPlantSpeed?: number; stiffness?: number; damping?: number; maxImpulse?: number; breakImpulse?: number; balanceRadiusMeters?: number; balanceStiffness?: number; balanceDamping?: number; maxBalanceImpulse?: number; predictionSeconds?: number; forceDistribution?: "whole-body" | "root" }
  | { id: string; kind: "step"; frame: number; durationFrames: number; holdFrames: number; ragdollId: string; boneId: string; direction: readonly [number, number, number]; speedMetersPerSecond: number; predictionSeconds?: number; maximumDistance?: number; liftHeight?: number; groundLayerMask?: number; probeHeight?: number; probeDistance?: number; minimumNormalY?: number; stiffness?: number; damping?: number; maximumDriveImpulse?: number; landingTolerance?: number; maximumLandingSpeed?: number; /** Explicit running-flight permission. Grounded capture steps reject loss of the final support by default. */ allowFlight?: boolean }
  | { id: string; kind: "locomotion"; frame: number; durationFrames: number; ragdollId: string; direction: readonly [number, number, number]; distanceMeters: number; peakSpeedMetersPerSecond: number; maxImpulse?: number; /** Optional shared humanoid gait recipe. Physics still owns accepted root travel. */ pace?: "walk" | "jog" | "run" | "sprint"; /** Shared body-height intent for obstacle clearance. */ posture?: "upright" | "crouch"; /** Distance-normalized cadence override from the shared humanoid intent planner. */ cycleDistanceScale?: number }
  | { id: string; kind: "jump"; frame: number; ragdollId: string; supportBoneIds: readonly string[]; direction: readonly [number, number, number]; horizontalSpeedMetersPerSecond: number; verticalSpeedMetersPerSecond: number; groundLayerMask?: number; probeDistance?: number; minimumNormalY?: number; maximumGroundedVerticalSpeedMetersPerSecond?: number }
  | { id: string; kind: "joint-drive"; frame: number; durationFrames: number; ragdollId: string; jointId: string; axisParentLocal: readonly [number, number, number]; angularDistanceDegrees: number; peakAngularSpeedDegreesPerSecond: number; maxTorqueImpulse?: number; phase?: "anticipation" | "contact" | "follow-through" | "recovery"; /** Groups related drives with one causal launch lifecycle. */ actionId?: string; /** Expert opt-in for deliberate actuation while downed or recovering. */ allowAuthorityOverride?: boolean }
  | { id: string; kind: "effector-drive"; frame: number; durationFrames: number; ragdollId: string; effectorBoneId: string; jointIds: readonly string[]; direction: readonly [number, number, number]; distanceMeters: number; peakSpeedMetersPerSecond: number; trackingGainPerSecond?: number; velocityGain?: number; maxTorqueImpulse?: number; /** Re-aims the translation path toward this live physical body while preserving bounded distance and speed. */ translationTarget?: PhysicalBodyReference3D; /** Auto captures a live planted-body-to-effector joint path at activation; free preserves the authored limb chain. */ supportMode?: "auto" | "free"; path?: PhysicalEffectorPath3D; orientation?: PhysicalEffectorOrientation3D; phase?: "anticipation" | "contact" | "follow-through" | "recovery"; /** Groups related drives with one causal launch lifecycle. */ actionId?: string; /** Starts from the simulated pose at an actual launch contact rather than its planned timeline frame. */ afterContact?: PhysicalContactAnchor3D; /** Ends this drive on the exact fixed-step contact so follow-through cannot keep pushing through the target. */ stopAtContact?: { cueId: string }; /** Expert opt-in for deliberate actuation while downed or recovering. */ allowAuthorityOverride?: boolean }
  | { id: string; kind: "bind"; frame: number; durationFrames: number; a: PhysicalBodyReference3D; b: PhysicalBodyReference3D; anchorMode: "contact" | "authored"; afterContact?: PhysicalContactAnchor3D; localAnchorA?: readonly [number, number, number]; localAnchorB?: readonly [number, number, number]; rotationMode?: "pivot" | "preserve"; stiffness?: number; damping?: number; maxImpulse?: number; breakImpulse?: number; rotationStiffness?: number; rotationDamping?: number; maxTorqueImpulse?: number }
  | { id: string; kind: "launch"; frame: number; attacker: { ragdollId: string; boneId: string }; target?: PhysicalBodyReference3D; /** Authored preserves a deliberate vector; target-at-launch derives it from the simulated bodies. */ targeting?: "authored" | "target-at-launch"; direction?: readonly [number, number, number]; speedMetersPerSecond: number; distanceMeters?: number; targetTravelPaddingMeters?: number; angularVelocityDegreesPerSecond?: readonly [number, number, number]; localPoint?: readonly [number, number, number]; /** Whole-body conserves the articulated system's momentum; external models a net force. */ actuation?: RagdollActuationMode3D; /** Expert opt-in for external propulsion while tracked airborne. */ allowAirborneExternalActuation?: boolean; /** Expert opt-in for deliberate actuation while downed or recovering. */ allowAuthorityOverride?: boolean; expectedContactFrame?: number; contactToleranceFrames?: number; attackerMode?: "active" | "passive"; /** Auto derives stagger or knockdown from measured contact speed and the target's portable policy. */ targetModeOnContact?: "auto" | "active" | "passive"; /** Owns related drive cues until measured consequence and recovery complete. */ actionId?: string; consequenceFrames?: number; recoveryFrames?: number };
export type PhysicalConstraint3D =
  | { id: string; breakGroupId?: string; kind: "point"; a: PhysicalBodyReference3D; b: PhysicalBodyReference3D; localAnchorA?: readonly [number, number, number]; localAnchorB?: readonly [number, number, number]; stiffness?: number; breakImpulse?: number }
  | { id: string; breakGroupId?: string; kind: "distance"; a: PhysicalBodyReference3D; b: PhysicalBodyReference3D; distance?: number; stiffness?: number; breakImpulse?: number };
export type PhysicalPerformance3D = {
  frameRate: number;
  simulationHz?: number;
  durationFrames: number;
  world?: RigidWorldOptions3D;
  quality?: PhysicalPerformanceQualityGates3D;
  bodies?: readonly RigidBodyDefinition3D[];
  ragdolls: readonly RagdollDefinition3D[];
  constraints?: readonly PhysicalConstraint3D[];
  cues: readonly PhysicalPerformanceCue3D[];
  outputs?: readonly PhysicalBodyReference3D[];
};
export type BreakableChunk3D = { id: string; position: readonly [number, number, number]; rotationY?: number; scale: readonly [number, number, number] };
export type BreakableAssemblyTopology3D = "anchored" | "clustered";
export type BreakableAssemblyBuild3D = { id: string; topology: BreakableAssemblyTopology3D; anchorBodyId: string; chunkBodyIds: string[]; supportConstraintIds: string[]; linkConstraintIds: string[]; bodies: RigidBodyDefinition3D[]; constraints: PhysicalConstraint3D[] };
const BREAKABLE_IMPACT_PRESETS_3D: Readonly<Record<RigidMaterialPresetId3D, readonly [joulesPerKilogram: number, retainedEnergyRatio: number]>> = {
  character: [60, .75], soil: [18, .55], wood: [35, .8], stone: [80, .85], metal: [180, .9], ice: [24, .75], rubber: [120, .25],
};
/** Expands a material and chunk mass into portable failure energy and residual through-motion. */
export function breakableImpactPreset3D(material: RigidMaterialPresetId3D, massKilograms: number) {
  const preset = BREAKABLE_IMPACT_PRESETS_3D[material]; if (!preset) throw new Error(`Unsupported breakable impact material ${String(material)}.`);
  return { fractureEnergyJoules: positive(massKilograms, "massKilograms") * preset[0], retainedEnergyRatio: preset[1] };
}

export type PhysicalContactEvent3D = {
  cueId: string;
  frame: number;
  simulationTick: number;
  subframe: number;
  attacker: { ragdollId: string; boneId: string };
  target: PhysicalBodyReference3D;
  point: [number, number, number];
  normal: [number, number, number];
  closingSpeedMetersPerSecond: number;
  effectiveMassKg: number;
  impactEnergyJoules: number;
  normalImpulseNewtonSeconds: number;
  breakthrough: boolean;
  failedBodyId?: string;
};

export type PhysicalPerformanceDiagnostic3D = {
  severity: "warning";
  code: "launch-missed" | "airborne-external-actuation" | "root-motion-action-conflict" | "action-authority-conflict" | "action-chain-conflict" | "action-chain-canceled" | "action-chain-completed" | "action-chain-interrupted" | "contact-timing-mismatch" | "contact-anchor-out-of-range" | "bind-broke" | "support-missed" | "support-broke" | "step-missed" | "step-broke" | "jump-unsupported" | "recovery-not-settled" | "recovery-obstructed" | "recovery-unsupported" | "recovery-incomplete" | "severe-penetration" | "unforced-acceleration" | "joint-limit-saturation";
  cueId: string;
  frame: number;
  message: string;
  pointer?: string;
  /** Exact solver-space evidence captured at the finding frame when available. */
  position?: [number, number, number];
  secondaryPosition?: [number, number, number];
};

export type PhysicalCharacterState3D = { locomotion: RagdollLocomotionState3D; authority: RagdollAuthorityState3D | "acting"; landing?: RagdollLandingStatus3D; action?: PhysicalActionState3D };
export type PhysicalCharacterStateEvent3D = PhysicalCharacterState3D & { ragdollId: string; frame: number; simulationTick: number; subframe: number };
export type PhysicalBreakEvent3D = {
  constraintId: string;
  groupId?: string; // Stable assembly identity shared by every generated seam.
  frame: number;
  simulationTick: number;
  subframe: number;
  a: PhysicalBodyReference3D;
  b: PhysicalBodyReference3D;
  point: [number, number, number];
  cause?: "stress" | "impact";
  impactEnergyJoules?: number;
  closingSpeedMetersPerSecond?: number;
  normalImpulseNewtonSeconds?: number;
};
export type PhysicalBindEvent3D = { cueId: string; state: "bound" | "released" | "broken"; frame: number; simulationTick: number; subframe: number; a: PhysicalBodyReference3D; b: PhysicalBodyReference3D; point: [number, number, number] };

type ActiveLaunch = {
  cue: Extract<PhysicalPerformanceCue3D, { kind: "launch" }>;
  attackerHandle: number;
  targetHandle?: number;
  startX: number;
  startY: number;
  startZ: number;
  maximumTicks: number;
  elapsedTicks: number;
  travelLimitMeters: number;
};

export type PhysicalPerformanceCheckpoint3D = {
  version: 1; frame: number; simulationTick: number;
  world: RigidWorldCheckpoint3D; ragdolls: RagdollSystemCheckpoint3D; quality: PhysicalPerformanceQualityCheckpoint3D;
  poses: Array<[string, Float64Array]>; breakables: Array<{ constraintId: string; broken: boolean }>;
  activeLaunches: Array<{ cueId: string; attackerHandle: number; targetHandle?: number; startX: number; startY: number; startZ: number; maximumTicks: number; elapsedTicks: number; /** Added compatibly to v1 checkpoints; absent legacy launches were always authored. */ travelLimitMeters?: number }>;
  activeSupports: Array<{ cueId: string; endFrame: number }>; activeEffectorDrives?: Array<{ cueId: string; start: [number, number, number]; /** Added compatibly to v1 checkpoints; absent legacy drives began at their authored frame. */ startTick?: number; /** Added compatibly; legacy drives had no orientation goal. */ startRotation?: [number, number, number, number]; /** Captured at activation so target-aware intent resumes without re-aiming from a later body position. */ orientationGoal?: { axisWorld: [number, number, number]; angularDistanceRadians: number }; /** Captured planted-body path prevents resume from choosing another stance. */ support?: { boneId: string; jointIds: string[] } }>; activeBinds?: PhysicalContactBindCheckpoint3D[]; pendingRecoveries: Array<{ cueId: string; deadlineFrame: number }>; activeRecoveries: Array<{ cueId: string; completionFrame: number; deadlineFrame: number; activationFrame?: number; selectedPosture?: RagdollPosture3D; selectedEnvironment?: RagdollRecoveryEnvironment3D; selectedClipId?: string }>;
  forcedHandles: number[]; contacts: PhysicalContactEvent3D[]; breaks: PhysicalBreakEvent3D[]; binds?: PhysicalBindEvent3D[]; diagnostics: PhysicalPerformanceDiagnostic3D[];
  characterStates?: Array<[string, PhysicalCharacterState3D]>; characterStateEvents?: PhysicalCharacterStateEvent3D[]; blockedActionCueIds?: string[]; actions?: PhysicalActionLifecycleCheckpoint3D;
};

export type PhysicalPerformanceRuntime3D = ReturnType<typeof createPhysicalPerformanceRuntime3D>;
export type CompiledPhysicalPerformance3D = ReturnType<typeof compilePhysicalPerformance3D>;
export type PhysicalPoseProvider3D = (sample: { frame: number; ragdollId: string; performance?: { clipId: string; timeSeconds: number; loop: boolean } }) => RagdollPose3D | undefined;
export type PhysicalRootMotionProvider3D = (sample: { frame: number; ragdollId: string }) => { delta: readonly [number, number, number]; maxImpulse?: number; sourceId?: string; pointer?: string } | undefined;
export type PhysicalPerformanceResumePoint3D = { checkpoint: Readonly<PhysicalPerformanceCheckpoint3D>; frameStride: number; states: Float32Array };
export type PhysicalPerformanceCompileProgress3D = {
  compiledThroughFrame: number;
  targetFrame: number;
  completedFrames: number;
  totalFrames: number;
  progress: number;
  done: boolean;
};
export type PhysicalLaunchTargetBody3D = {
  shape: RigidShape3D;
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number, number];
};
/** Resolves compressed target intent into a deterministic launch vector and bounded collider-surface travel window. */
export function resolvePhysicalLaunchTarget3D(options: { attacker: PhysicalLaunchTargetBody3D; target: PhysicalLaunchTargetBody3D; travelPaddingMeters?: number }) {
  const attackerPosition = vector3(options?.attacker?.position, "attacker position"), targetPosition = vector3(options?.target?.position, "target position");
  const delta: [number, number, number] = [targetPosition[0] - attackerPosition[0], targetPosition[1] - attackerPosition[1], targetPosition[2] - attackerPosition[2]];
  const centerDistance = Math.hypot(...delta);
  if (centerDistance <= 1e-6) throw new RangeError("Target-at-launch cannot resolve coincident body centers; choose authored direction or separate the bodies before launch.");
  const direction: [number, number, number] = [delta[0] / centerDistance, delta[1] / centerDistance, delta[2] / centerDistance];
  const attackerExtent = projectedShapeExtent(options.attacker, direction), targetExtent = projectedShapeExtent(options.target, direction);
  const surfaceGapMeters = Math.max(0, centerDistance - attackerExtent - targetExtent), travelPaddingMeters = nonnegative(options.travelPaddingMeters ?? .25, "target travel padding meters");
  return { direction, centerDistanceMeters: centerDistance, surfaceGapMeters, travelLimitMeters: Math.max(.01, surfaceGapMeters + travelPaddingMeters) };
}

/** Expands canonical chunks into shared-world bodies and a deterministic support graph. */
export function createBreakableAssembly3D(options: { id: string; chunks: readonly BreakableChunk3D[]; strength?: number; massPerChunkKg?: number; shape?: "box" | "sphere"; colliderScale?: number; materialPreset?: RigidMaterialPresetId3D; fractureEnergyJoules?: number; retainedEnergyRatio?: number; topology?: BreakableAssemblyTopology3D; neighborRadiusMeters?: number; supportBandMeters?: number }): BreakableAssemblyBuild3D {
  const id = text(options?.id, "breakable assembly id");
  if (!Array.isArray(options?.chunks) || !options.chunks.length || options.chunks.length > 64) throw new RangeError("Breakable assembly needs 1 through 64 canonical chunks.");
  const strength = positive(options.strength ?? 36, "break strength"), mass = positive(options.massPerChunkKg ?? 24, "massPerChunkKg"), colliderScale = positive(options.colliderScale ?? .9, "colliderScale");
  if (colliderScale < .05 || colliderScale > 4) throw new RangeError("colliderScale must be from 0.05 through 4.");
  const shape = options.shape ?? "box", topology = options.topology ?? "anchored", neighborRadiusMeters = nonnegative(options.neighborRadiusMeters ?? .2, "neighborRadiusMeters"), supportBandMeters = nonnegative(options.supportBandMeters ?? .1, "supportBandMeters"), materialPreset = options.materialPreset ?? "stone", material = rigidMaterialPreset3D(materialPreset), impact = breakableImpactPreset3D(materialPreset, mass), fractureEnergyJoules = positive(options.fractureEnergyJoules ?? impact.fractureEnergyJoules, "fractureEnergyJoules"), retainedEnergyRatio = unit(options.retainedEnergyRatio ?? impact.retainedEnergyRatio, "retainedEnergyRatio");
  if (shape !== "box" && shape !== "sphere") throw new TypeError(`Breakable collider shape ${String(shape)} is unsupported; choose box or sphere.`);
  if (topology !== "anchored" && topology !== "clustered") throw new TypeError(`Breakable topology ${String(topology)} is unsupported; choose anchored or clustered.`);
  const chunkIds = new Set<string>(), anchorBodyId = `${id}__breakable_anchor`, bodies: RigidBodyDefinition3D[] = [{ id: anchorBodyId, type: "static", shape: { kind: "sphere", radius: .01 }, collisionLayer: 1, collisionMask: 0, trigger: true }], constraints: PhysicalConstraint3D[] = [], chunkBodyIds: string[] = [];
  const chunks: Array<{ id: string; bodyId: string; position: [number, number, number]; half: [number, number, number]; yaw: number }> = [];
  for (const chunk of options.chunks) {
    const chunkId = text(chunk.id, "breakable chunk id"); if (chunkIds.has(chunkId)) throw new Error(`Breakable assembly ${id} repeats chunk ${chunkId}.`); chunkIds.add(chunkId);
    const position = vector3(chunk.position, `${chunkId} position`), scale = vector3(chunk.scale, `${chunkId} scale`); if (scale.some((value) => value <= 0)) throw new RangeError(`${chunkId} scale components must be positive.`);
    const half: [number, number, number] = [Math.max(.05, Math.abs(scale[0]) * colliderScale * .5), Math.max(.05, Math.abs(scale[1]) * colliderScale * .5), Math.max(.05, Math.abs(scale[2]) * colliderScale * .5)], bodyId = `${id}__breakable_chunk__${chunkId}`, yaw = finite(chunk.rotationY ?? 0, `${chunkId} rotationY`), halfYaw = yaw * .5;
    const radius = Math.max(...half), bodyShape = shape === "sphere" ? { kind: "sphere" as const, radius } : { kind: "box" as const, halfX: half[0], halfY: half[1], halfZ: half[2] }, topologyHalf: [number, number, number] = shape === "sphere" ? [radius, radius, radius] : half;
    bodies.push({ id: bodyId, type: "dynamic", shape: bodyShape, x: position[0], y: position[1], z: position[2], rotation: [0, Math.sin(halfYaw), 0, Math.cos(halfYaw)], mass, ...material, gravityScale: 1, continuous: true, impactResponse: { fractureEnergyJoules, retainedEnergyRatio } });
    chunks.push({ id: chunkId, bodyId, position, half: topologyHalf, yaw }); chunkBodyIds.push(bodyId);
  }
  const supportConstraintIds: string[] = [], linkConstraintIds: string[] = [], minimumBottom = Math.min(...chunks.map((chunk) => chunk.position[1] - chunk.half[1]));
  const supported = new Set(topology === "anchored" ? chunks.map((chunk) => chunk.id) : chunks.filter((chunk) => chunk.position[1] - chunk.half[1] <= minimumBottom + supportBandMeters + 1e-9).map((chunk) => chunk.id));
  for (const chunk of chunks) if (supported.has(chunk.id)) {
    const seamId = `${id}__breakable_seam__${chunk.id}`; supportConstraintIds.push(seamId);
    constraints.push({ id: seamId, breakGroupId: id, kind: "point", a: { bodyId: anchorBodyId }, b: { bodyId: chunk.bodyId }, localAnchorA: chunk.position, localAnchorB: [0, 0, 0], stiffness: 1, breakImpulse: strength });
  }
  if (topology === "clustered") {
    const adjacency = new Map(chunks.map((chunk) => [chunk.id, new Set<string>()] as const));
    for (let aIndex = 0; aIndex < chunks.length; aIndex += 1) for (let bIndex = aIndex + 1; bIndex < chunks.length; bIndex += 1) {
      const a = chunks[aIndex]!, b = chunks[bIndex]!; if (chunkSurfaceGap3D(a, b) > neighborRadiusMeters + 1e-9) continue;
      adjacency.get(a.id)!.add(b.id); adjacency.get(b.id)!.add(a.id);
      const seamId = `${id}__breakable_link__${aIndex}_${bIndex}`, point: [number, number, number] = [(a.position[0] + b.position[0]) * .5, (a.position[1] + b.position[1]) * .5, (a.position[2] + b.position[2]) * .5];
      linkConstraintIds.push(seamId); constraints.push({ id: seamId, breakGroupId: id, kind: "point", a: { bodyId: a.bodyId }, b: { bodyId: b.bodyId }, localAnchorA: localPointFromYaw3D(a, point), localAnchorB: localPointFromYaw3D(b, point), stiffness: 1, breakImpulse: strength });
    }
    const reached = new Set(supported), pending = [...supported];
    while (pending.length) for (const neighbor of adjacency.get(pending.shift()!) ?? []) if (!reached.has(neighbor)) { reached.add(neighbor); pending.push(neighbor); }
    const disconnected = chunks.find((chunk) => !reached.has(chunk.id));
    if (disconnected) throw new Error(`Breakable assembly ${id} chunk ${disconnected.id} is outside the ${neighborRadiusMeters}m neighbor radius and has no path to a supported chunk. Move the chunks together, increase neighborRadiusMeters, or choose anchored topology.`);
  }
  return { id, topology, anchorBodyId, chunkBodyIds, supportConstraintIds, linkConstraintIds, bodies, constraints };
}

function chunkSurfaceGap3D(a: { position: [number, number, number]; half: [number, number, number]; yaw: number }, b: { position: [number, number, number]; half: [number, number, number]; yaw: number }) {
  const aWorld = worldHalfExtentsFromYaw3D(a.half, a.yaw), bWorld = worldHalfExtentsFromYaw3D(b.half, b.yaw);
  return Math.hypot(Math.max(0, Math.abs(a.position[0] - b.position[0]) - aWorld[0] - bWorld[0]), Math.max(0, Math.abs(a.position[1] - b.position[1]) - aWorld[1] - bWorld[1]), Math.max(0, Math.abs(a.position[2] - b.position[2]) - aWorld[2] - bWorld[2]));
}

function worldHalfExtentsFromYaw3D(half: readonly [number, number, number], yaw: number): [number, number, number] { const cosine = Math.abs(Math.cos(yaw)), sine = Math.abs(Math.sin(yaw)); return [cosine * half[0] + sine * half[2], half[1], sine * half[0] + cosine * half[2]]; }
function localPointFromYaw3D(chunk: { position: [number, number, number]; yaw: number }, point: readonly [number, number, number]): [number, number, number] { const x = point[0] - chunk.position[0], y = point[1] - chunk.position[1], z = point[2] - chunk.position[2], cosine = Math.cos(chunk.yaw), sine = Math.sin(chunk.yaw); return [cosine * x - sine * z, y, sine * x + cosine * z]; }

/** Validates and resolves every portable body, joint, constraint, cue, and output reference without stepping time. */
export function preflightPhysicalPerformance3D(options: { performance: PhysicalPerformance3D }): { bodyReferences: readonly PhysicalBodyReference3D[] } {
  const runtime = createPhysicalPerformanceRuntime3D(options);
  return { bodyReferences: runtime.bodyReferences };
}

export function createPhysicalPerformanceRuntime3D(options: { performance: PhysicalPerformance3D; poseProvider?: PhysicalPoseProvider3D; rootMotionProvider?: PhysicalRootMotionProvider3D }) {
  const performance = validatePerformance(options?.performance);
  const simulationHz = performance.simulationHz ?? performance.frameRate * 4;
  if (simulationHz % performance.frameRate !== 0) throw new RangeError("simulationHz must be an integer multiple of frameRate.");
  const stepsPerFrame = simulationHz / performance.frameRate;
  const bodyCount = (performance.bodies?.length ?? 0) + performance.ragdolls.reduce((count, ragdoll) => count + ragdoll.bodies.length, 0);
  const world = createRigidWorld3D({ capacity: bodyCount, maxConstraints: physicalConstraintCapacity(performance), ...performance.world });
  for (const body of performance.bodies ?? []) world.addBody(body);
  const ragdolls = createRagdollSystem3D({ world, gravityY: performance.world?.gravityY });
  const launchEffectors = new Set(performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "launch" }> => cue.kind === "launch").map((cue) => `${cue.attacker.ragdollId}/${cue.attacker.boneId}`));
  for (const definition of performance.ragdolls) ragdolls.add({
    ...definition,
    bodies: definition.bodies.map((item) => launchEffectors.has(`${definition.id}/${item.boneId}`) && item.body.continuous !== true
      ? { ...item, body: { ...item.body, continuous: true } }
      : item),
  });
  const activationBodies = new Map(performance.ragdolls.map((definition) => [definition.id, definition.bodies.map((item) => {
    const body = requireBodyState(ragdolls.body(definition.id, item.boneId), `${definition.id}/${item.boneId}`);
    return { handle: body.handle, mass: body.mass, collisionLayer: body.collisionLayer, collisionMask: body.collisionMask, continuous: body.continuous };
  })] as const));
  const inactiveRagdolls = new Set<string>();
  const poses = new Map(performance.ragdolls.map((definition) => [definition.id, definition.initialPose] as const));
  const breakables = (performance.constraints ?? []).map((constraint) => ({ constraint, handle: addConstraint(constraint, world, ragdolls), aHandle: resolveHandle(constraint.a, world, ragdolls), bHandle: resolveHandle(constraint.b, world, ragdolls), broken: false }));
  const qualityBodies = createQualityBodies(performance, world, ragdolls, breakables.map((item) => item.handle));
  const qualityLimits = createQualityLimits(performance, world);
  const quality = createPhysicalPerformanceQualityMonitor3D({ world, gates: performance.quality, frameRate: performance.frameRate, simulationHz, gravity: [performance.world?.gravityX ?? 0, performance.world?.gravityY ?? -9.81, performance.world?.gravityZ ?? 0], bodies: qualityBodies, limits: qualityLimits });
  const references = createOutputReferences(performance);
  const handles = references.map((reference) => resolveHandle(reference, world, ragdolls));
  const cuesByFrame = groupCues(performance.cues, performance.durationFrames);
  const cueIndexById = new Map(performance.cues.map((cue, index) => [cue.id, index] as const));
  const actions = createPhysicalActionLifecycle3D({ stepsPerFrame, cues: performance.cues.flatMap<PhysicalActionCueSpec3D>((cue, index) => cue.kind === "joint-drive" || cue.kind === "effector-drive" ? [{ cueId: cue.id, kind: "drive", ragdollId: cue.ragdollId, frame: cue.frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${index}`, actionId: cue.actionId, phase: cue.phase, ...(cue.kind === "effector-drive" && (cue.afterContact || cue.stopAtContact) ? { contactCueId: cue.afterContact?.cueId ?? cue.stopAtContact?.cueId } : {}) }] : cue.kind === "launch" ? [{ cueId: cue.id, kind: "launch", ragdollId: cue.attacker.ragdollId, frame: cue.frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${index}`, actionId: cue.actionId, consequenceFrames: cue.consequenceFrames, recoveryFrames: cue.recoveryFrames }] : []) });
  const contactAnchoredCues = groupContactAnchoredCues(performance.cues);
  preflightCues(performance.cues, performance.durationFrames, performance.frameRate, world, ragdolls, poses, performance.ragdolls);
  const activeLaunches: ActiveLaunch[] = [];
  const contacts: PhysicalContactEvent3D[] = [];
  const breaks: PhysicalBreakEvent3D[] = [], binds: PhysicalBindEvent3D[] = [];
  const impactBreaks = new Map<string, { impactEnergyJoules: number; closingSpeedMetersPerSecond: number; normalImpulseNewtonSeconds: number; point: [number, number, number] }>();
  const diagnostics: PhysicalPerformanceDiagnostic3D[] = [], blockedActionCueIds = new Set<string>();
  const bindManager = createPhysicalContactBindManager3D({ world, stepsPerFrame, cues: performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "bind" }> => cue.kind === "bind"), resolveBody: (reference) => resolveHandle(reference, world, ragdolls), contactSource: (cueId) => lastContact(contacts, cueId), cueIndex: (cueId) => cueIndexById.get(cueId), events: binds, diagnostics });
  const activeSupports = new Map<string, { cue: Extract<PhysicalPerformanceCue3D, { kind: "support" | "step" }>; endFrame: number }>();
  const pendingRecoveries = new Map<string, { cue: Extract<PhysicalPerformanceCue3D, { kind: "recovery" }>; deadlineFrame: number }>();
  const activeRecoveries = new Map<string, { cue: Extract<PhysicalPerformanceCue3D, { kind: "recovery" }>; completionFrame: number; deadlineFrame: number; activationFrame?: number; selectedPosture?: RagdollPosture3D; selectedEnvironment?: RagdollRecoveryEnvironment3D; selectedClipId?: string }>();
  const jointDrives = performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "joint-drive" }> => cue.kind === "joint-drive");
  const locomotionCues = performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "locomotion" }> => cue.kind === "locomotion").sort((left, right) => left.frame - right.frame || left.id.localeCompare(right.id));
  const locomotionProfiles = createPhysicalLocomotionProfiles3D(locomotionCues, performance.frameRate);
  const effectorDrives = new Map<string, ActivePhysicalEffectorDrive3D>();
  const supportEnds = groupSupportEnds(performance.cues, performance.durationFrames);
  const contact = emptyContact();
  const forcedHandles = new Set<number>();
  const characterStates = new Map<string, PhysicalCharacterState3D>(), characterStateEvents: PhysicalCharacterStateEvent3D[] = [];
  const rootMotionIntents = new Map<string, NonNullable<ReturnType<PhysicalRootMotionProvider3D>>>();
  function setRagdollActivated(ragdollId: string, active: boolean) { configureRagdollActivation3D(world, activationBodies, inactiveRagdolls, ragdollId, active); }
  for (const definition of performance.ragdolls) if ((definition.activationFrame ?? 0) > 0) setRagdollActivated(definition.id, false);
  const quiescentUntilFrame = physicalPerformanceQuiescentUntilFrame(performance);
  let frame = -1;
  let simulationTick = 0;
  const { directionToBody, applyPhysicalDrives, applyPhysicalLocomotion } = createPhysicalDriveController3D({
    world, ragdolls, jointDrives, effectorDrives, forcedHandles, cueIndexById, locomotionProfiles,
    simulationHz, stepsPerFrame, frameRate: performance.frameRate, allowActionCue, characterState,
    get simulationTick() { return simulationTick; },
  });
  function skipQuiescentPrefix(targetFrame: number): number {
    if (!Number.isSafeInteger(targetFrame) || targetFrame < frame || targetFrame >= quiescentUntilFrame) throw new RangeError(`Physical performance can only skip its inactive prefix before frame ${quiescentUntilFrame}.`);
    frame = targetFrame; simulationTick = (targetFrame + 1) * stepsPerFrame;
    return frame;
  }
  function stepFrame(): number {
    if (frame + 1 >= performance.durationFrames) throw new RangeError("Physical performance is already at its final frame.");
    frame += 1;
    for (const definition of performance.ragdolls) if ((definition.activationFrame ?? 0) === frame && inactiveRagdolls.has(definition.id)) setRagdollActivated(definition.id, true);
    forcedHandles.clear(); rootMotionIntents.clear();
    if (options.rootMotionProvider) for (const definition of performance.ragdolls) { if (inactiveRagdolls.has(definition.id)) continue; const intent = options.rootMotionProvider({ frame, ragdollId: definition.id }); if (intent) rootMotionIntents.set(definition.id, intent); }
    for (const cue of supportEnds[frame]!) { if (cue.kind === "step") ragdolls.clearStep(cue.ragdollId, cue.id); else ragdolls.clearSupport(cue.ragdollId, cue.id); activeSupports.delete(cue.id); }
    if (options.poseProvider) for (const definition of performance.ragdolls) {
      if (inactiveRagdolls.has(definition.id)) continue;
      const getUp = activeGetUp(definition.id), pose = options.poseProvider({ frame, ragdollId: definition.id, ...(getUp ? { performance: getUp } : {}) });
      if (pose) { poses.set(definition.id, pose); ragdolls.setPose(definition.id, pose); }
    }
    const frameCues = cuesByFrame[frame]!;
    for (const cue of frameCues) if (cue.kind === "support") applyCue(cue);
    for (const cue of frameCues) if (cue.kind !== "support") applyCue(cue);
    for (let substep = 0; substep < stepsPerFrame; substep += 1) {
      bindManager.releaseDue(simulationTick);
      applyContactAnchoredCuesForTick();
      for (const interrupted of actions.advance(simulationTick, (ragdollId) => ragdolls.status(ragdollId).authorityState)) { const launchCueId = actions.definitions.get(interrupted.actionId)?.launchCueId ?? interrupted.actionId, launchIndex = cueIndexById.get(launchCueId); diagnostics.push({ severity: "warning", code: "action-chain-interrupted", cueId: launchCueId, frame, ...(launchIndex === undefined ? {} : { pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${launchIndex}/actionId` }), message: `Physical action ${interrupted.actionId} was canceled because ${interrupted.ragdollId} entered ${interrupted.authority} authority. Its later phases cannot restart after recovery.` }); }
      applyContactAnchoredEffectorDrivesForTick();
      applyPhysicalDrives(); const physicallyTraveling = applyPhysicalLocomotion(); for (const [ragdollId, intent] of rootMotionIntents) { const state = characterState(ragdollId), cueId = intent.sourceId ?? `root-motion:${ragdollId}`; if (state.authority === "acting" || physicallyTraveling.has(ragdollId)) { if (!diagnostics.some((item) => item.code === "root-motion-action-conflict" && item.cueId === cueId)) diagnostics.push({ severity: "warning", code: "root-motion-action-conflict", cueId, frame, ...(intent.pointer ? { pointer: intent.pointer } : {}), message: `${cueId} clip locomotion yields while ${ragdollId} is ${state.authority === "acting" ? `performing ${state.action?.id ?? "an authored physical action"}` : "following an authored physical locomotion cue"}; split or retime the locomotion sources if this overlap is unintended.` }); continue; } for (const handle of ragdolls.driveRootMotion(ragdollId, { ...intent, durationSeconds: 1 / performance.frameRate })) forcedHandles.add(handle); }
      ragdolls.step(1 / simulationHz, forcedHandles, inactiveRagdolls);
      resolveImpactBreakthroughs();
      for (const finding of quality.inspectStep(frame, forcedHandles)) diagnostics.push({ severity: "warning", code: finding.code, cueId: finding.scopeId, frame: finding.frame, pointer: finding.pointer, message: finding.message, position: [...finding.position], ...(finding.secondaryPosition ? { secondaryPosition: [...finding.secondaryPosition] } : {}) });
      forcedHandles.clear();
      verifyActiveSupports();
      beginSettledRecoveries();
      verifyActiveRecoveries();
      resolveLaunchContacts(substep);
      resolveConstraintBreaks(substep);
      bindManager.verify(simulationTick);
      updateCharacterStates(substep);
      simulationTick += 1;
    }
    return frame;
  }
  function applyCue(cue: PhysicalPerformanceCue3D, activationFrame = frame, activationTick = simulationTick) {
    if (cue.kind === "pose") { poses.set(cue.ragdollId, cue.pose); ragdolls.setPose(cue.ragdollId, cue.pose); }
    else if (cue.kind === "support") {
      const planted = ragdolls.plantSupport(cue.ragdollId, cue);
      if (planted.planted) activeSupports.set(cue.id, { cue, endFrame: cue.frame + cue.durationFrames });
      else diagnostics.push({ severity: "warning", code: "support-missed", cueId: cue.id, frame, message: `${cue.id} could not plant ${cue.boneId}: no supported surface was reachable at an acceptable slope and speed.` });
    }
    else if (cue.kind === "step") {
      const status = ragdolls.beginPredictiveStep(cue.ragdollId, { ...cue, durationSeconds: cue.durationFrames / performance.frameRate });
      if (status.state === "moving" || status.state === "planted") activeSupports.set(cue.id, { cue, endFrame: cue.frame + cue.durationFrames + cue.holdFrames });
      else if (status.state === "missed") diagnostics.push({ severity: "warning", code: "step-missed", cueId: cue.id, frame, message: `${cue.id} could not plan ${cue.boneId}: ${status.reason ?? "no stable capture step was available"}.` });
    }
    else if (cue.kind === "jump") {
      const horizontal = Math.hypot(cue.direction[0], cue.direction[2]), velocity = [horizontal > 1e-12 ? cue.direction[0] / horizontal * cue.horizontalSpeedMetersPerSecond : 0, cue.verticalSpeedMetersPerSecond, horizontal > 1e-12 ? cue.direction[2] / horizontal * cue.horizontalSpeedMetersPerSecond : 0] as const;
      const result = ragdolls.takeoff(cue.ragdollId, { supportBoneIds: cue.supportBoneIds, velocity, groundLayerMask: cue.groundLayerMask, probeDistance: cue.probeDistance, minimumNormalY: cue.minimumNormalY, maximumGroundedVerticalSpeedMetersPerSecond: cue.maximumGroundedVerticalSpeedMetersPerSecond });
      if (!result.launched) diagnostics.push({ severity: "warning", code: "jump-unsupported", cueId: cue.id, frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/supportBoneIds`, message: `${cue.id} cannot take off because ${result.reason ?? "no stable grounded support is available"}. Land and settle, restore collidable ground, or increase the bounded ground probe.` });
      else { for (const handle of result.forcedHandles) forcedHandles.add(handle); for (const [id, active] of activeSupports) if (active.cue.ragdollId === cue.ragdollId) activeSupports.delete(id); }
    }
    else if (cue.kind === "mode") { if (cue.mode === "passive") releaseActiveSupportsForRagdoll(cue.ragdollId); ragdolls.setMode(cue.ragdollId, { mode: cue.mode, durationSeconds: cue.durationSeconds, discontinuous: cue.discontinuous }); }
    else if (cue.kind === "recovery") {
      if (cue.startCondition === "after-settled" && ragdolls.status(cue.ragdollId).mode !== "settled") pendingRecoveries.set(cue.id, { cue, deadlineFrame: activationFrame + (cue.maximumWaitFrames ?? Math.max(1, performance.durationFrames - 1 - activationFrame)) });
      else startRecovery(cue);
    }
    else if (cue.kind === "joint-drive") { allowActionCue(cue, false); }
    else if (cue.kind === "effector-drive") {
      if (!allowActionCue(cue, false)) return;
      const body = requireBodyState(ragdolls.body(cue.ragdollId, cue.effectorBoneId), `${cue.ragdollId}/${cue.effectorBoneId}`), startRotation: [number, number, number, number] = [body.rotationX, body.rotationY, body.rotationZ, body.rotationW];
      const orientationDirection = cue.orientation?.mode === "aim-at-body" ? directionToBody(cue, body) : cue.direction;
      const support = ragdolls.resolveEffectorDriveSupport(cue.ragdollId, cue.effectorBoneId, cue.supportMode ?? "free");
      effectorDrives.set(cue.id, { cue, start: [body.x, body.y, body.z], startRotation, ...(cue.orientation ? { orientationGoal: resolveEffectorOrientation(cue.orientation, startRotation, orientationDirection) } : {}), ...(support ? { support: { boneId: support.boneId, jointIds: support.jointIds } } : {}), startTick: activationTick });
    }
    else if (cue.kind === "bind") bindManager.begin(cue, activationTick);
    else if (cue.kind === "launch") { if (allowActionCue(cue, false)) beginLaunch(cue); }
  }
  function allowActionCue(cue: Extract<PhysicalPerformanceCue3D, { kind: "joint-drive" | "effector-drive" | "launch" }>, interrupted: boolean) { if (blockedActionCueIds.has(cue.id)) return false; const ragdollId = cue.kind === "launch" ? cue.attacker.ragdollId : cue.ragdollId, authority = ragdolls.status(ragdollId).authorityState, decision = actions.begin(cue.id, authority, cue.allowAuthorityOverride === true); if (decision.allowed) return true; blockedActionCueIds.add(cue.id); if (cue.kind === "effector-drive") effectorDrives.delete(cue.id); const chained = decision.reason === "conflict" || decision.reason === "canceled" || decision.reason === "completed", pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/${chained ? "actionId" : "allowAuthorityOverride"}`, code = decision.reason === "conflict" ? "action-chain-conflict" : decision.reason === "canceled" ? "action-chain-canceled" : decision.reason === "completed" ? "action-chain-completed" : "action-authority-conflict"; diagnostics.push({ severity: "warning", code, cueId: cue.id, frame, pointer, message: decision.reason === "conflict" ? `${cue.id} cannot start while action ${decision.activeActionId} still owns ${ragdollId}; wait for its measured consequence and return-to-ready or place this cue in that same action chain.` : decision.reason === "canceled" ? `${cue.id} belongs to canceled action ${decision.actionId} and cannot restart after interruption.` : decision.reason === "completed" ? `${cue.id} belongs to completed action ${decision.actionId}; extend its recovery window or author a new action ID instead of restarting an old phase.` : `${cue.id} ${interrupted ? "was interrupted" : "cannot start"} while ${ragdollId} is ${authority}. Finish consequence/recovery first, move the cue, or explicitly enable authority override at ${pointer} for deliberate supernatural actuation.` }); return false; }
  function applyContactAnchoredCuesForTick() {
    for (const contactEvent of contacts) for (const cue of contactAnchoredCues.get(contactEvent.cueId) ?? []) {
      if (cue.kind === "effector-drive" || cue.afterContact.offsetFrames === 0) continue;
      const startTick = contactEvent.simulationTick + 1 + cue.afterContact.offsetFrames * stepsPerFrame;
      if (simulationTick === startTick) applyCue(cue, frame, startTick);
    }
  }
  function applyContactAnchoredEffectorDrivesForTick() {
    for (const contactEvent of contacts) for (const cue of contactAnchoredCues.get(contactEvent.cueId) ?? []) {
      if (cue.kind !== "effector-drive" || cue.afterContact.offsetFrames === 0) continue;
      const startTick = contactEvent.simulationTick + 1 + cue.afterContact.offsetFrames * stepsPerFrame;
      if (simulationTick === startTick) applyCue(cue, frame, startTick);
    }
  }

  function resolveContactAnchors(cueId: string) {
    for (const cue of contactAnchoredCues.get(cueId) ?? []) {
      const dueFrame = frame + cue.afterContact!.offsetFrames, endFrame = dueFrame + (cue.kind === "effector-drive" || cue.kind === "bind" ? cue.durationFrames : 1);
      if (endFrame > performance.durationFrames) diagnostics.push({ severity: "warning", code: "contact-anchor-out-of-range", cueId: cue.id, frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/afterContact/offsetFrames`, message: `${cue.id} resolves through frame ${endFrame - 1} after ${cueId} contact, outside the performance. Shorten its contact offset or duration, or extend the sequence.` });
      else if (cue.afterContact!.offsetFrames === 0) applyCue(cue, frame, simulationTick + 1);
    }
  }

  function releaseActiveSupportsForRagdoll(ragdollId: string) { for (const [id, active] of activeSupports) if (active.cue.ragdollId === ragdollId) { if (active.cue.kind === "step") ragdolls.clearStep(ragdollId, id); else ragdolls.clearSupport(ragdollId, id); activeSupports.delete(id); } }

  function verifyActiveSupports() {
    for (const [id, active] of activeSupports) {
      if (active.cue.kind === "step") {
        const status = ragdolls.stepStatus(active.cue.ragdollId, id);
        if (status?.state === "moving") continue;
        if (status?.state === "missed") { diagnostics.push({ severity: "warning", code: "step-missed", cueId: id, frame, message: `${id} missed its planned ${active.cue.boneId} landing: ${status.reason ?? "the foot did not stabilize"}.` }); activeSupports.delete(id); continue; }
      }
      if (!ragdolls.support(active.cue.ragdollId, id)) { diagnostics.push({ severity: "warning", code: active.cue.kind === "step" ? "step-broke" : "support-broke", cueId: id, frame, message: `${id} lost its planted ${active.cue.boneId} support before frame ${active.endFrame}.` }); activeSupports.delete(id); }
    }
  }

  function beginSettledRecoveries() {
    for (const [id, pending] of pendingRecoveries) {
      if (ragdolls.status(pending.cue.ragdollId).mode === "settled") { pendingRecoveries.delete(id); startRecovery(pending.cue); continue; }
      if (frame < pending.deadlineFrame) continue;
      diagnostics.push({ severity: "warning", code: "recovery-not-settled", cueId: id, frame, message: `${id} reached its bounded recovery wait without the passive body settling. Lengthen the consequence or maximum wait instead of forcing animation authority over active motion.` });
      pendingRecoveries.delete(id);
    }
  }

  function startRecovery(cue: Extract<PhysicalPerformanceCue3D, { kind: "recovery" }>) {
    const resolution = resolveRecoveryTarget(cue, performance.ragdolls, ragdolls, poses);
    if (!resolution.target) { diagnostics.push({ severity: "warning", code: "recovery-unsupported", cueId: cue.id, frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/target/groundLayerMask`, message: resolution.message }); return; }
    let target = resolution.target;
    const getUp = cue.getUp ? selectGetUp(cue, target) : undefined;
    if (getUp) {
      if (!options.poseProvider) throw new Error(`${cue.id} get-up selection requires the canonical pose provider.`);
      const pose = options.poseProvider({ frame, ragdollId: cue.ragdollId, performance: getUp.performance }); if (!pose) throw new Error(`${cue.id} get-up clip ${getUp.performance.clipId} did not produce a pose.`);
      poses.set(cue.ragdollId, pose); ragdolls.setPose(cue.ragdollId, pose); target = { ...target, pose, rootPosition: getUp.rootPosition };
    }
    const inspection = ragdolls.inspectRecovery(cue.ragdollId, target);
    if (!inspection.ready) { const pointer = `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/target/clearancePadding`, phase = inspection.obstructionPhase === "path" ? "transition path crosses" : "target volume intersects"; diagnostics.push({ severity: "warning", code: "recovery-obstructed", cueId: cue.id, frame, pointer, message: `${cue.id} cannot start: ${inspection.obstructedBoneId ?? "body"} ${phase} ${inspection.obstructingBodyId ?? "another body"}. Move the recovery root, select a terrain-compatible get-up, clear the obstacle, or reduce conservative clearance padding at ${pointer}.` }); return; }
    ragdolls.beginRecovery(cue.ragdollId, target);
    const durationFrames = Math.max(1, Math.ceil((target.durationSeconds ?? .6) * performance.frameRate));
    activeRecoveries.set(cue.id, { cue, completionFrame: frame + durationFrames, deadlineFrame: frame + durationFrames + Math.max(Math.ceil(performance.frameRate * .5), durationFrames), ...(getUp ? { activationFrame: frame, selectedPosture: getUp.posture, selectedEnvironment: getUp.environment, selectedClipId: getUp.performance.clipId } : {}) });
  }

  function selectGetUp(cue: Extract<PhysicalPerformanceCue3D, { kind: "recovery" }>, target: RagdollRecoveryTarget3D) {
    const getUp = cue.getUp!, posture = ragdolls.posture(cue.ragdollId, getUp.postureBoneId);
    const inspected = getUp.environment ? ragdolls.recoveryEnvironment(cue.ragdollId, target, getUp.environment) : { environment: "open" as const, rootPosition: tuple3(...target.rootPosition) };
    const environmentClip = inspected.environment === "open" ? undefined : getUp.environment?.clips[inspected.environment], clipId = environmentClip ?? getUp.clips[posture];
    return { posture, environment: inspected.environment, rootPosition: environmentClip ? inspected.rootPosition : tuple3(...target.rootPosition), performance: { clipId, timeSeconds: getUp.sourceStartSeconds ?? 0, loop: getUp.loop ?? false } };
  }

  function activeGetUp(ragdollId: string) {
    for (const active of activeRecoveries.values()) if (active.cue.ragdollId === ragdollId && active.selectedClipId !== undefined && active.activationFrame !== undefined) {
      const getUp = active.cue.getUp!; return { clipId: active.selectedClipId, timeSeconds: (getUp.sourceStartSeconds ?? 0) + (frame - active.activationFrame) / performance.frameRate * (getUp.speed ?? 1), loop: getUp.loop ?? false };
    }
    return undefined;
  }

  function verifyActiveRecoveries() {
    for (const [id, active] of activeRecoveries) {
      const status = ragdolls.status(active.cue.ragdollId);
      if (status.mode === "animated") { activeRecoveries.delete(id); continue; }
      if (frame < active.completionFrame) continue;
      if (status.recoveryBlocker === "obstructed" || status.recoveryBlocker === "unsupported") {
        const code = status.recoveryBlocker === "obstructed" ? "recovery-obstructed" : "recovery-unsupported";
        const message = status.recoveryBlocker === "obstructed"
          ? `${id} cannot return to animation because its requested stand-up volume became occupied.`
          : `${id} cannot return to animation because its authored support bones do not reach stable upward-facing ground.`;
        diagnostics.push({ severity: "warning", code, cueId: id, frame, message }); activeRecoveries.delete(id);
      } else if (frame >= active.deadlineFrame) {
        diagnostics.push({ severity: "warning", code: "recovery-incomplete", cueId: id, frame, message: `${id} did not physically converge on its recovery root and angular-speed tolerances before the bounded deadline. Lengthen the recovery or increase physical authority.` }); activeRecoveries.delete(id);
      }
    }
  }

  function beginLaunch(cue: Extract<PhysicalPerformanceCue3D, { kind: "launch" }>) {
    const initialState = ragdolls.status(cue.attacker.ragdollId);
    if ((cue.actuation ?? "external") === "external" && initialState.locomotionState === "airborne" && cue.allowAirborneExternalActuation !== true) {
      diagnostics.push({ severity: "warning", code: "airborne-external-actuation", cueId: cue.id, frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/allowAirborneExternalActuation`, message: `${cue.id} cannot add external propulsion while ${cue.attacker.ragdollId} is airborne. Use grounded takeoff, let a solved contact apply force, choose momentum-conserving whole-body actuation, or explicitly enable airborne external actuation for a deliberate supernatural force.` });
      return;
    }
    const attacker = requireBody(world, resolveHandle(cue.attacker, world, ragdolls), cue.id);
    const targetHandle = cue.target ? resolveHandle(cue.target, world, ragdolls) : undefined;
    const target = targetHandle === undefined ? undefined : requireBody(world, targetHandle, cue.id);
    let resolved: { direction: [number, number, number]; travelLimitMeters: number };
    try {
      resolved = cue.targeting === "target-at-launch"
        ? resolvePhysicalLaunchTarget3D({ attacker: targetingBody(attacker), target: targetingBody(target!), travelPaddingMeters: cue.targetTravelPaddingMeters })
        : { direction: normalized(cue.direction!, `${cue.id} direction`), travelLimitMeters: positive(cue.distanceMeters!, `${cue.id} distanceMeters`) };
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(cue.id)}/targeting.`);
    }
    const direction = resolved.direction;
    const speed = positive(cue.speedMetersPerSecond, `${cue.id} speedMetersPerSecond`);
    const current = attacker.velocityX * direction[0] + attacker.velocityY * direction[1] + attacker.velocityZ * direction[2];
    const impulse = (speed - current) * attacker.mass;
    const point = cue.localPoint ? worldPoint(attacker, cue.localPoint) : undefined;
    ragdolls.setMode(cue.attacker.ragdollId, { mode: cue.attackerMode ?? "active" });
    for (const handle of ragdolls.applyActuatedImpulse(cue.attacker.ragdollId, { boneId: cue.attacker.boneId, impulse: [direction[0] * impulse, direction[1] * impulse, direction[2] * impulse], ...(point ? { point } : {}), actuation: cue.actuation ?? "external" })) forcedHandles.add(handle);
    if (cue.angularVelocityDegreesPerSecond) {
      const spin = vector3(cue.angularVelocityDegreesPerSecond, `${cue.id} angularVelocityDegreesPerSecond`);
      for (const handle of ragdolls.applyActuatedAngularVelocity(cue.attacker.ragdollId, { boneId: cue.attacker.boneId, angularVelocity: [spin[0] * Math.PI / 180, spin[1] * Math.PI / 180, spin[2] * Math.PI / 180], actuation: cue.actuation ?? "external" })) forcedHandles.add(handle);
    }
    activeLaunches.push({
      cue,
      attackerHandle: attacker.handle,
      ...(targetHandle === undefined ? {} : { targetHandle }),
      startX: attacker.x,
      startY: attacker.y,
      startZ: attacker.z,
      maximumTicks: Math.max(1, Math.ceil(resolved.travelLimitMeters / speed * simulationHz * 2)),
      elapsedTicks: 0,
      travelLimitMeters: resolved.travelLimitMeters,
    });
  }

  function resolveLaunchContacts(substep: number) {
    for (let launchIndex = activeLaunches.length - 1; launchIndex >= 0; launchIndex -= 1) {
      const launch = activeLaunches[launchIndex]!;
      let resolved = false;
      for (let contactIndex = 0; contactIndex < world.contactCount(); contactIndex += 1) {
        world.contact(contactIndex, contact);
        const other = contact.a === launch.attackerHandle ? contact.b : contact.b === launch.attackerHandle ? contact.a : -1;
        if (other < 0 || (launch.targetHandle !== undefined && other !== launch.targetHandle)) continue;
        const target = launch.cue.target ? copyReference(launch.cue.target) : referenceForHandle(other, references, handles, world);
        contacts.push({
          cueId: launch.cue.id,
          frame,
          simulationTick,
          subframe: (substep + 1) / stepsPerFrame,
          attacker: launch.cue.attacker,
          target,
          point: [contact.pointX, contact.pointY, contact.pointZ],
          normal: contact.a === launch.attackerHandle ? [contact.normalX, contact.normalY, contact.normalZ] : [-contact.normalX, -contact.normalY, -contact.normalZ],
          closingSpeedMetersPerSecond: contact.closingSpeedMetersPerSecond,
          effectiveMassKg: contact.effectiveMassKg,
          impactEnergyJoules: contact.impactEnergyJoules,
          normalImpulseNewtonSeconds: contact.normalImpulseNewtonSeconds,
          breakthrough: contact.breakthrough,
          ...(contact.failedBodyId === undefined ? {} : { failedBodyId: contact.failedBodyId }),
        });
        if (launch.cue.expectedContactFrame !== undefined && Math.abs(frame - launch.cue.expectedContactFrame) > (launch.cue.contactToleranceFrames ?? 1)) {
          diagnostics.push({ severity: "warning", code: "contact-timing-mismatch", cueId: launch.cue.id, frame, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/${cueIndexById.get(launch.cue.id)}/expectedContactFrame`, message: `${launch.cue.id} contacted at frame ${frame} + ${((substep + 1) / stepsPerFrame).toFixed(2)} subframe, outside planned frame ${launch.cue.expectedContactFrame} ± ${launch.cue.contactToleranceFrames ?? 1}. Adjust staging, speed, travel, or the explicit timing tolerance; contact-linked sound, particles, and camera reactions remain bound to the simulated event.` });
        }
        if ("ragdollId" in target) applyLaunchTargetResponse(ragdolls, target.ragdollId, launch.cue.targetModeOnContact ?? "passive", contact, releaseActiveSupportsForRagdoll);
        actions.contact(launch.cue.id, simulationTick);
        for (const [driveId, drive] of effectorDrives) if (drive.cue.stopAtContact?.cueId === launch.cue.id) effectorDrives.delete(driveId);
        resolveContactAnchors(launch.cue.id);
        resolved = true;
        break;
      }
      launch.elapsedTicks += 1;
      const body = requireBody(world, launch.attackerHandle, launch.cue.id);
      const distance = Math.hypot(body.x - launch.startX, body.y - launch.startY, body.z - launch.startZ);
      if (!resolved && distance < launch.travelLimitMeters && launch.elapsedTicks < launch.maximumTicks) continue;
      if (!resolved) { actions.miss(launch.cue.id, simulationTick); diagnostics.push({ severity: "warning", code: "launch-missed", cueId: launch.cue.id, frame, message: launch.cue.targeting === "target-at-launch" ? `${launch.cue.id} failed to contact its aimed body inside the resolved ${launch.travelLimitMeters.toFixed(3)}m collider-gap window.` : `${launch.cue.id} traveled its authored ${launch.travelLimitMeters}m window without the requested contact.` }); }
      activeLaunches.splice(launchIndex, 1);
    }
  }

  function resolveImpactBreakthroughs() {
    for (let contactIndex = 0; contactIndex < world.contactCount(); contactIndex += 1) {
      world.contact(contactIndex, contact); if (!contact.breakthrough || contact.failedBody === undefined) continue;
      for (const item of breakables) {
        if (item.broken || item.aHandle !== contact.failedBody && item.bHandle !== contact.failedBody || !world.constraint(item.handle)) continue;
        world.removeConstraint(item.handle);
        impactBreaks.set(item.constraint.id, { impactEnergyJoules: contact.impactEnergyJoules, closingSpeedMetersPerSecond: contact.closingSpeedMetersPerSecond, normalImpulseNewtonSeconds: contact.normalImpulseNewtonSeconds, point: [contact.pointX, contact.pointY, contact.pointZ] });
      }
    }
  }

  function resolveConstraintBreaks(substep: number) {
    for (const item of breakables) {
      if (item.broken || world.constraint(item.handle)) continue;
      item.broken = true;
      const a = requireBody(world, resolveHandle(item.constraint.a, world, ragdolls), item.constraint.id), b = requireBody(world, resolveHandle(item.constraint.b, world, ragdolls), item.constraint.id);
      const impact = impactBreaks.get(item.constraint.id);
      breaks.push({ constraintId: item.constraint.id, ...(item.constraint.breakGroupId ? { groupId: item.constraint.breakGroupId } : {}), frame, simulationTick, subframe: (substep + 1) / stepsPerFrame, a: copyReference(item.constraint.a), b: copyReference(item.constraint.b), point: impact?.point ?? [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], cause: impact !== undefined ? "impact" : "stress", ...(impact ?? {}) });
      impactBreaks.delete(item.constraint.id);
    }
  }

  function characterState(ragdollId: string): PhysicalCharacterState3D {
    const status = ragdolls.status(ragdollId), landing = status.landing ? { ...status.landing, point: tuple3(...status.landing.point) } : undefined, action = actions.state(ragdollId);
    if (status.authorityState !== "ready") return { locomotion: status.locomotionState, authority: status.authorityState, ...(landing ? { landing } : {}) };
    const activeJointDrive = jointDrives.some((cue) => !blockedActionCueIds.has(cue.id) && cue.ragdollId === ragdollId && simulationTick >= cue.frame * stepsPerFrame && simulationTick < (cue.frame + cue.durationFrames) * stepsPerFrame);
    const acting = !!action || activeJointDrive || activeLaunches.some((item) => item.cue.attacker.ragdollId === ragdollId) || [...effectorDrives.values()].some((item) => item.cue.ragdollId === ragdollId);
    return { locomotion: status.locomotionState, authority: acting ? "acting" : "ready", ...(landing ? { landing } : {}), ...(action ? { action } : {}) };
  }

  function updateCharacterStates(substep: number) {
    for (const definition of performance.ragdolls) {
      if (inactiveRagdolls.has(definition.id)) continue;
      const next = characterState(definition.id), prior = characterStates.get(definition.id);
      if (prior?.locomotion === next.locomotion && prior.authority === next.authority && prior.action?.id === next.action?.id && prior.action?.phase === next.action?.phase) continue;
      characterStates.set(definition.id, copyCharacterState(next)); characterStateEvents.push({ ragdollId: definition.id, frame, simulationTick, subframe: (substep + 1) / stepsPerFrame, ...copyCharacterState(next) });
    }
  }

  function writeState(output: Float32Array, offset = 0): number { return writePhysicalBodyState(world, handles, output, offset); }

  function checkpoint(): PhysicalPerformanceCheckpoint3D {
    return {
      version: 1, frame, simulationTick, world: world.checkpoint(), ragdolls: ragdolls.checkpoint(), quality: quality.checkpoint(),
      poses: [...poses].map(([id, pose]) => [id, copyCheckpointPose(pose)]), breakables: breakables.map((item) => ({ constraintId: item.constraint.id, broken: item.broken })),
      activeLaunches: activeLaunches.map((item) => ({ cueId: item.cue.id, attackerHandle: item.attackerHandle, ...(item.targetHandle === undefined ? {} : { targetHandle: item.targetHandle }), startX: item.startX, startY: item.startY, startZ: item.startZ, maximumTicks: item.maximumTicks, elapsedTicks: item.elapsedTicks, travelLimitMeters: item.travelLimitMeters })),
      activeSupports: [...activeSupports].map(([cueId, item]) => ({ cueId, endFrame: item.endFrame })), activeEffectorDrives: [...effectorDrives].map(([cueId, item]) => ({ cueId, start: tuple3(...item.start), startRotation: tuple4(...item.startRotation), startTick: item.startTick, ...(item.orientationGoal ? { orientationGoal: { axisWorld: tuple3(...item.orientationGoal.axisWorld), angularDistanceRadians: item.orientationGoal.angularDistanceRadians } } : {}), ...(item.support ? { support: { boneId: item.support.boneId, jointIds: [...item.support.jointIds] } } : {}) })), activeBinds: bindManager.checkpoint(), pendingRecoveries: [...pendingRecoveries].map(([cueId, item]) => ({ cueId, deadlineFrame: item.deadlineFrame })), activeRecoveries: [...activeRecoveries].map(([cueId, item]) => ({ cueId, completionFrame: item.completionFrame, deadlineFrame: item.deadlineFrame, ...(item.activationFrame === undefined ? {} : { activationFrame: item.activationFrame }), ...(item.selectedPosture === undefined ? {} : { selectedPosture: item.selectedPosture }), ...(item.selectedEnvironment === undefined ? {} : { selectedEnvironment: item.selectedEnvironment }), ...(item.selectedClipId === undefined ? {} : { selectedClipId: item.selectedClipId }) })),
      forcedHandles: [...forcedHandles], contacts: contacts.map(copyContactEvent), breaks: breaks.map(copyBreakEvent), binds: binds.map(copyBindEvent), diagnostics: diagnostics.map(copyDiagnosticEvent), characterStates: [...characterStates].map(([id, value]) => [id, copyCharacterState(value)]), characterStateEvents: characterStateEvents.map((item) => ({ ...item, ...copyCharacterState(item) })), blockedActionCueIds: [...blockedActionCueIds], actions: actions.checkpoint(),
    };
  }

  function restoreCheckpoint(value: Readonly<PhysicalPerformanceCheckpoint3D>) {
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.frame) || value.frame < -1 || value.frame >= performance.durationFrames || value.simulationTick !== (value.frame + 1) * stepsPerFrame) throw new Error("Physical performance checkpoint has an incompatible frame clock.");
    for (const definition of performance.ragdolls) setRagdollActivated(definition.id, value.frame >= (definition.activationFrame ?? 0));
    world.restoreCheckpoint(value.world); ragdolls.restoreCheckpoint(value.ragdolls);
    const poseIds = new Set(performance.ragdolls.map((item) => item.id));
    if (value.poses.length !== poseIds.size) throw new Error("Physical performance checkpoint pose topology is incompatible.");
    poses.clear(); for (const [id, pose] of value.poses) { if (!poseIds.delete(id)) throw new Error(`Physical performance checkpoint pose ${id} is incompatible.`); poses.set(id, { rotations: copyCheckpointPose({ rotations: pose }) }); }
    if (value.breakables.length !== breakables.length) throw new Error("Physical performance checkpoint breakable topology is incompatible.");
    const brokenById = new Map(value.breakables.map((item) => [item.constraintId, item.broken] as const));
    for (const item of breakables) { const broken = brokenById.get(item.constraint.id); if (broken === undefined) throw new Error(`Physical performance checkpoint breakable ${item.constraint.id} is incompatible.`); item.broken = broken; }
    const launches = new Map(performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "launch" }> => cue.kind === "launch").map((cue) => [cue.id, cue] as const));
    activeLaunches.length = 0; for (const saved of value.activeLaunches) { const cue = launches.get(saved.cueId); if (cue === undefined) throw new Error(`Physical performance checkpoint launch ${saved.cueId} is incompatible.`); activeLaunches.push({ cue, attackerHandle: saved.attackerHandle, ...(saved.targetHandle === undefined ? {} : { targetHandle: saved.targetHandle }), startX: finite(saved.startX, "checkpoint launch startX"), startY: finite(saved.startY, "checkpoint launch startY"), startZ: finite(saved.startZ, "checkpoint launch startZ"), maximumTicks: positiveInteger(saved.maximumTicks, "checkpoint maximumTicks"), elapsedTicks: nonnegativeInteger(saved.elapsedTicks, "checkpoint elapsedTicks"), travelLimitMeters: positive(saved.travelLimitMeters ?? cue.distanceMeters!, "checkpoint travelLimitMeters") }); }
    const supports = new Map(performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "support" | "step" }> => cue.kind === "support" || cue.kind === "step").map((cue) => [cue.id, cue] as const));
    activeSupports.clear(); for (const saved of value.activeSupports) { const cue = supports.get(saved.cueId); if (cue === undefined) throw new Error(`Physical performance checkpoint support ${saved.cueId} is incompatible.`); activeSupports.set(saved.cueId, { cue, endFrame: frameIndex(saved.endFrame, performance.durationFrames + 1) }); }
    const driveCues = new Map(performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "effector-drive" }> => cue.kind === "effector-drive").map((cue) => [cue.id, cue] as const));
    effectorDrives.clear(); for (const saved of value.activeEffectorDrives ?? []) { const cue = driveCues.get(saved.cueId); if (cue === undefined) throw new Error(`Physical performance checkpoint effector drive ${saved.cueId} is incompatible.`); const body = requireBodyState(ragdolls.body(cue.ragdollId, cue.effectorBoneId), `${cue.ragdollId}/${cue.effectorBoneId}`), startRotation = saved.startRotation === undefined ? tuple4(body.rotationX, body.rotationY, body.rotationZ, body.rotationW) : normalizedRotation(saved.startRotation, "checkpoint effector drive startRotation"); const orientationGoal = cue.orientation ? saved.orientationGoal ? restoreEffectorOrientation(cue.orientation, startRotation, saved.orientationGoal) : cue.orientation.mode === "aim-at-body" ? (() => { throw new Error(`Physical performance checkpoint effector drive ${saved.cueId} is missing its captured aim target.`); })() : resolveEffectorOrientation(cue.orientation, startRotation, cue.direction) : undefined, support = saved.support ? { boneId: text(saved.support.boneId, "checkpoint effector support boneId"), jointIds: saved.support.jointIds.map((id) => text(id, "checkpoint effector support jointId")) } : undefined; if (support) ragdolls.validateEffectorDrive(cue.ragdollId, { effectorBoneId: cue.effectorBoneId, baseBoneId: support.boneId, jointIds: support.jointIds, targetVelocity: [0, 0, 0], maxTorqueImpulse: cue.maxTorqueImpulse ?? .25 }); effectorDrives.set(saved.cueId, { cue, start: vector3(saved.start, "checkpoint effector drive start"), startRotation, ...(orientationGoal ? { orientationGoal } : {}), ...(support ? { support } : {}), startTick: saved.startTick === undefined ? Math.round(cue.frame / performance.frameRate * simulationHz) : nonnegativeInteger(saved.startTick, "checkpoint effector drive startTick") }); }
    const recoveries = new Map(performance.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "recovery" }> => cue.kind === "recovery").map((cue) => [cue.id, cue] as const));
    pendingRecoveries.clear(); for (const saved of value.pendingRecoveries) { const cue = recoveries.get(saved.cueId); if (cue === undefined) throw new Error(`Physical performance checkpoint pending recovery ${saved.cueId} is incompatible.`); pendingRecoveries.set(saved.cueId, { cue, deadlineFrame: nonnegativeInteger(saved.deadlineFrame, "checkpoint pending recovery deadlineFrame") }); }
    activeRecoveries.clear(); for (const saved of value.activeRecoveries) { const cue = recoveries.get(saved.cueId); if (cue === undefined) throw new Error(`Physical performance checkpoint recovery ${saved.cueId} is incompatible.`); if (saved.selectedPosture !== undefined && !RAGDOLL_POSTURES_3D.includes(saved.selectedPosture)) throw new Error(`Physical performance checkpoint recovery ${saved.cueId} posture is incompatible.`); if (saved.selectedEnvironment !== undefined && !["open", ...RAGDOLL_RECOVERY_ENVIRONMENTS_3D].includes(saved.selectedEnvironment)) throw new Error(`Physical performance checkpoint recovery ${saved.cueId} environment is incompatible.`); const selected = saved.activationFrame !== undefined || saved.selectedPosture !== undefined || saved.selectedEnvironment !== undefined || saved.selectedClipId !== undefined, expectedClip = saved.selectedPosture === undefined ? undefined : saved.selectedEnvironment && saved.selectedEnvironment !== "open" ? cue.getUp?.environment?.clips[saved.selectedEnvironment] ?? cue.getUp?.clips[saved.selectedPosture] : cue.getUp?.clips[saved.selectedPosture]; if (selected && (saved.activationFrame === undefined || saved.selectedPosture === undefined || saved.selectedClipId === undefined || expectedClip !== saved.selectedClipId)) throw new Error(`Physical performance checkpoint recovery ${saved.cueId} get-up selection is incompatible.`); activeRecoveries.set(saved.cueId, { cue, completionFrame: nonnegativeInteger(saved.completionFrame, "checkpoint completionFrame"), deadlineFrame: nonnegativeInteger(saved.deadlineFrame, "checkpoint deadlineFrame"), ...(saved.activationFrame === undefined ? {} : { activationFrame: nonnegativeInteger(saved.activationFrame, "checkpoint recovery activationFrame") }), ...(saved.selectedPosture === undefined ? {} : { selectedPosture: saved.selectedPosture }), ...(saved.selectedEnvironment === undefined ? {} : { selectedEnvironment: saved.selectedEnvironment }), ...(saved.selectedClipId === undefined ? {} : { selectedClipId: text(saved.selectedClipId, "checkpoint recovery selectedClipId") }) }); }
    forcedHandles.clear(); for (const handle of value.forcedHandles) { if (!world.body(handle)) throw new Error(`Physical performance checkpoint forced body ${handle} is incompatible.`); forcedHandles.add(handle); }
    bindManager.restore(value.activeBinds); contacts.splice(0, contacts.length, ...value.contacts.map(copyContactEvent)); breaks.splice(0, breaks.length, ...value.breaks.map(copyBreakEvent)); binds.splice(0, binds.length, ...(value.binds ?? []).map(copyBindEvent)); diagnostics.splice(0, diagnostics.length, ...value.diagnostics.map(copyDiagnosticEvent));
    characterStates.clear(); for (const [id, state] of value.characterStates ?? []) { if (!performance.ragdolls.some((item) => item.id === id) || !["grounded", "airborne", "landing", "untracked"].includes(state.locomotion) || !["ready", "acting", "staggered", "downed", "recovering"].includes(state.authority)) throw new Error(`Physical performance checkpoint character state ${id} is incompatible.`); characterStates.set(id, copyCharacterState(state)); }
    characterStateEvents.splice(0, characterStateEvents.length, ...(value.characterStateEvents ?? []).map((item) => ({ ...item, ...copyCharacterState(item) }))); blockedActionCueIds.clear(); for (const id of value.blockedActionCueIds ?? []) { const cue = performance.cues.find((item) => item.id === id); if (!cue || cue.kind !== "joint-drive" && cue.kind !== "effector-drive" && cue.kind !== "launch") throw new Error(`Physical performance checkpoint blocked action ${id} is incompatible.`); blockedActionCueIds.add(id); } if (value.actions) actions.restoreCheckpoint(value.actions); else if (actions.definitions.size) throw new Error("Physical performance checkpoint is missing causal action state."); else actions.restoreCheckpoint({ version: 1, active: [], canceledActionIds: [], completedActionIds: [] });
    quality.restoreCheckpoint(value.quality); frame = value.frame; simulationTick = value.simulationTick;
  }

  return { performance, simulationHz, stepsPerFrame, quiescentUntilFrame, qualityGates: quality.gates, bodyReferences: references, world, ragdolls, stepFrame, skipQuiescentPrefix, writeState, checkpoint, restoreCheckpoint, characterState, characterStateEvents, contacts, breaks, binds, diagnostics, get frame() { return frame; } };
}

/**
 * Creates a deterministic prefix compiler over the same runtime used by Play.
 * Sampling a frame advances only through that frame; later frames remain lazy until
 * sampled or `ensureComplete` is called for export/preflight.
 */
export function createPhysicalPerformanceCompiler3D(options: { performance: PhysicalPerformance3D; poseProvider?: PhysicalPoseProvider3D; rootMotionProvider?: PhysicalRootMotionProvider3D; checkpointIntervalFrames?: number; resumeFrom?: Readonly<PhysicalPerformanceResumePoint3D> }) {
  const runtime = createPhysicalPerformanceRuntime3D(options);
  const frameStride = runtime.bodyReferences.length * PHYSICAL_BODY_STATE_STRIDE_3D;
  const states = new Float32Array(options.performance.durationFrames * frameStride);
  const checkpointIntervalFrames = options.checkpointIntervalFrames ?? 0;
  if (!Number.isSafeInteger(checkpointIntervalFrames) || checkpointIntervalFrames < 0 || checkpointIntervalFrames > options.performance.durationFrames) throw new RangeError("checkpointIntervalFrames must be zero or a bounded safe integer within the performance duration.");
  const checkpoints: PhysicalPerformanceCheckpoint3D[] = [runtime.checkpoint()];
  const resumedFromFrame = options.resumeFrom?.checkpoint.frame ?? -1;
  if (options.resumeFrom) {
    const expected = (resumedFromFrame + 1) * frameStride;
    if (options.resumeFrom.frameStride !== frameStride || !(options.resumeFrom.states instanceof Float32Array) || options.resumeFrom.states.length !== expected) throw new Error("Physical performance resume point has incompatible compiled state.");
    runtime.restoreCheckpoint(options.resumeFrom.checkpoint); states.set(options.resumeFrom.states);
    if (resumedFromFrame >= 0) checkpoints.push(runtime.checkpoint());
  }
  function fastForwardQuiescentPrefix(throughFrame: number) {
    const finalFrame = Math.min(throughFrame, runtime.quiescentUntilFrame - 1);
    if (runtime.frame >= finalFrame) return;
    const firstFrame = runtime.frame + 1, initialState = new Float32Array(frameStride);
    runtime.writeState(initialState, 0);
    for (let frame = firstFrame; frame <= finalFrame; frame += 1) states.set(initialState, frame * frameStride);
    runtime.skipQuiescentPrefix(finalFrame);
    if (checkpointIntervalFrames > 0) {
      const finalCheckpoint = runtime.checkpoint();
      let checkpointFrame = firstFrame + (checkpointIntervalFrames - (firstFrame % checkpointIntervalFrames)) - 1;
      for (; checkpointFrame <= finalFrame; checkpointFrame += checkpointIntervalFrames) checkpoints.push({ ...finalCheckpoint, frame: checkpointFrame, simulationTick: (checkpointFrame + 1) * runtime.stepsPerFrame });
    }
  }
  function ensureFrame(frame: number): number {
    frame = frameIndex(frame, options.performance.durationFrames);
    fastForwardQuiescentPrefix(frame);
    while (runtime.frame < frame) {
      const compiledFrame = runtime.stepFrame();
      runtime.writeState(states, compiledFrame * frameStride);
      if (checkpointIntervalFrames > 0 && (compiledFrame + 1) % checkpointIntervalFrames === 0) checkpoints.push(runtime.checkpoint());
    }
    return frame;
  }
  function ensureComplete(): number { return ensureFrame(options.performance.durationFrames - 1); }
  function advance({ throughFrame = options.performance.durationFrames - 1, maximumFrames = 1 }: { throughFrame?: number; maximumFrames?: number } = {}): PhysicalPerformanceCompileProgress3D {
    throughFrame = frameIndex(throughFrame, options.performance.durationFrames);
    if (!Number.isSafeInteger(maximumFrames) || maximumFrames < 1 || maximumFrames > options.performance.durationFrames) throw new RangeError("maximumFrames must be a positive bounded safe integer within the performance duration.");
    if (runtime.frame < throughFrame) {
      fastForwardQuiescentPrefix(throughFrame);
      if (runtime.frame < throughFrame) ensureFrame(Math.min(throughFrame, runtime.frame + maximumFrames));
    }
    const completedFrames = Math.min(throughFrame, runtime.frame) + 1, totalFrames = throughFrame + 1;
    return { compiledThroughFrame: runtime.frame, targetFrame: throughFrame, completedFrames, totalFrames, progress: completedFrames / totalFrames, done: runtime.frame >= throughFrame };
  }
  function writeFrame(frame: number, output: Float32Array, offset = 0): number {
    frame = ensureFrame(frame);
    if (!(output instanceof Float32Array) || offset < 0 || !Number.isSafeInteger(offset) || output.length - offset < frameStride) throw new RangeError(`Physical frame output needs ${frameStride} floats after offset.`);
    output.set(states.subarray(frame * frameStride, (frame + 1) * frameStride), offset);
    return frameStride;
  }
  function resumePointBefore(beforeFrame: number): PhysicalPerformanceResumePoint3D {
    if (!Number.isSafeInteger(beforeFrame) || beforeFrame < 0 || beforeFrame > options.performance.durationFrames) throw new RangeError(`beforeFrame must be from 0 through ${options.performance.durationFrames}.`);
    let selected = checkpoints[0]!; for (const item of checkpoints) if (item.frame < beforeFrame && item.frame > selected.frame) selected = item;
    return { checkpoint: selected, frameStride, states: states.slice(0, (selected.frame + 1) * frameStride) };
  }
  return { frameRate: options.performance.frameRate, durationFrames: options.performance.durationFrames, frameStride, checkpointIntervalFrames, resumedFromFrame, bodyReferences: runtime.bodyReferences, states, characterStateEvents: runtime.characterStateEvents, contacts: runtime.contacts, breaks: runtime.breaks, binds: runtime.binds, diagnostics: runtime.diagnostics, advance, ensureFrame, ensureComplete, resumePointBefore, writeFrame, get compiledThroughFrame() { return runtime.frame; } };
}

function physicalPerformanceQuiescentUntilFrame(performance: PhysicalPerformance3D): number {
  if ((performance.bodies ?? []).some((body) => body.type !== "static")) return 0;
  let firstActiveFrame = performance.durationFrames;
  for (const ragdoll of performance.ragdolls) firstActiveFrame = Math.min(firstActiveFrame, ragdoll.activationFrame ?? 0);
  for (const cue of performance.cues) firstActiveFrame = Math.min(firstActiveFrame, cue.frame);
  return firstActiveFrame;
}

export type PhysicalLocomotionCue3D = Extract<PhysicalPerformanceCue3D, { kind: "locomotion" }>;
export type PhysicalLocomotionProfile3D = Readonly<{ cue: PhysicalLocomotionCue3D; averageSpeed: number; startSpeed: number; endSpeed: number }>;

/**
 * Adjacent same-direction locomotion intent is one continuous journey. Boundary
 * speed is limited to both segments' average speed, keeping the existing peak
 * cap conservative while removing the artificial stop between pace changes.
 */
export function createPhysicalLocomotionProfiles3D(cues: readonly PhysicalLocomotionCue3D[], frameRate: number): PhysicalLocomotionProfile3D[] {
  const average = cues.map((cue) => cue.distanceMeters / (cue.durationFrames / frameRate));
  const boundary = (leftIndex: number, rightIndex: number) => {
    const left = cues[leftIndex]!, right = cues[rightIndex]!;
    if (left.ragdollId !== right.ragdollId || left.frame + left.durationFrames !== right.frame) return 0;
    const leftLength = Math.hypot(left.direction[0], left.direction[2]), rightLength = Math.hypot(right.direction[0], right.direction[2]);
    const alignment = (left.direction[0] * right.direction[0] + left.direction[2] * right.direction[2]) / (leftLength * rightLength);
    if (alignment < .995) return 0;
    return Math.min(average[leftIndex]!, average[rightIndex]!, left.peakSpeedMetersPerSecond, right.peakSpeedMetersPerSecond);
  };
  return cues.map((cue, index) => ({ cue, averageSpeed: average[index]!, startSpeed: index > 0 ? boundary(index - 1, index) : 0, endSpeed: index + 1 < cues.length ? boundary(index, index + 1) : 0 }));
}

export function samplePhysicalLocomotionSpeed3D(profile: PhysicalLocomotionProfile3D, progress: number) {
  const phase = Math.max(0, Math.min(1, progress));
  const baselineWeight = phase * phase * (3 - 2 * phase);
  const baseline = profile.startSpeed + (profile.endSpeed - profile.startSpeed) * baselineWeight;
  const bump = profile.averageSpeed - (profile.startSpeed + profile.endSpeed) * .5;
  return baseline + bump * smoothLocomotionPulse(phase);
}

/**
 * Unit-area C1 pulse with a bounded 1.5 peak. Unlike the old parabola, its
 * slope is zero at both cue boundaries, so adjacent gait intents preserve
 * velocity and acceleration instead of introducing a hidden jerk.
 */
function smoothLocomotionPulse(progress: number) {
  const ramp = 0.3333333333333333;
  if (progress < ramp) return 1.5 * smoothstep(progress / ramp);
  if (progress > 1 - ramp) return 1.5 * smoothstep((1 - progress) / ramp);
  return 1.5;
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

/** End-of-frame character authority used by canonical presentation sampling. */
export function samplePhysicalCharacterState3D(source: Readonly<Pick<CompiledPhysicalPerformance3D, "characterStateEvents">>, ragdollId: string, frame: number): Readonly<PhysicalCharacterState3D> | undefined {
  for (let index = source.characterStateEvents.length - 1; index >= 0; index -= 1) {
    const event = source.characterStateEvents[index]!;
    if (event.frame <= frame && event.ragdollId === ragdollId) return event;
  }
  return undefined;
}

/** Fully compiles a physical performance for delivery and compatibility with existing callers. */
export function compilePhysicalPerformance3D(options: { performance: PhysicalPerformance3D; poseProvider?: PhysicalPoseProvider3D; rootMotionProvider?: PhysicalRootMotionProvider3D }) {
  const compiled = createPhysicalPerformanceCompiler3D(options);
  compiled.ensureComplete();
  return compiled;
}

function physicalConstraintCapacity(performance: PhysicalPerformance3D): number {
  let count = performance.constraints?.length ?? 0;
  for (const ragdoll of performance.ragdolls) for (const joint of ragdoll.joints) count += 2 + (joint.swingTwistLimit || joint.angularLimitRadians !== undefined ? 1 : 0);
  for (const cue of performance.cues) count += cue.kind === "support" || cue.kind === "step" ? 1 : cue.kind === "bind" ? cue.rotationMode === "pivot" ? 1 : 2 : 0;
  return count;
}

function lastContact(contacts: readonly PhysicalContactEvent3D[], cueId: string): PhysicalContactEvent3D | undefined { for (let index = contacts.length - 1; index >= 0; index -= 1) if (contacts[index]!.cueId === cueId) return contacts[index]; return undefined; }

function validatePerformance(performance: PhysicalPerformance3D) {
  if (!performance || typeof performance !== "object") throw new TypeError("Physical performance is required.");
  frameRate(performance.frameRate); frameIndex(performance.durationFrames - 1, performance.durationFrames);
  if (performance.simulationHz !== undefined) positiveInteger(performance.simulationHz, "simulationHz");
  validatePhysicalPerformanceQualityGates3D(performance.quality);
  if (!Array.isArray(performance.ragdolls)) throw new TypeError("Physical performance ragdolls must be an array.");
  for (let index = 0; index < performance.ragdolls.length; index += 1) {
    const ragdoll = performance.ragdolls[index]!, activationFrame = ragdoll.activationFrame;
    if (activationFrame !== undefined) frameIndex(activationFrame, performance.durationFrames);
    if (ragdoll.motorPoseSource !== undefined && ragdoll.motorPoseSource !== "performance" && ragdoll.motorPoseSource !== "initial") throw new TypeError(`Physical ragdoll ${ragdoll.id} motorPoseSource is unsupported; choose performance or initial.`);
  }
  if (!Array.isArray(performance.cues)) throw new TypeError("Physical performance cues must be an array.");
  if ((performance.bodies?.length ?? 0) + performance.ragdolls.reduce((count, ragdoll) => count + ragdoll.bodies.length, 0) === 0) throw new RangeError("Physical performance needs at least one body.");
  return performance;
}

function applyLaunchTargetResponse(ragdolls: ReturnType<typeof createRagdollSystem3D>, ragdollId: string, mode: "auto" | "active" | "passive", contact: RigidContact3D, releaseSupports: (ragdollId: string) => void) { if (mode === "auto") { const response = ragdolls.reactToImpact(ragdollId, { impactSpeedMetersPerSecond: contact.closingSpeedMetersPerSecond, impactEnergyJoules: contact.impactEnergyJoules, normalImpulseNewtonSeconds: contact.normalImpulseNewtonSeconds }); if (response.response === "knocked-down") releaseSupports(ragdollId); return; } if (mode === "passive") releaseSupports(ragdollId); ragdolls.setMode(ragdollId, { mode, durationSeconds: .05 }); }

function targetingBody(body: RigidBodyState3D): PhysicalLaunchTargetBody3D { return { shape: body.shape, position: [body.x, body.y, body.z], rotation: [body.rotationX, body.rotationY, body.rotationZ, body.rotationW] }; }

function projectedShapeExtent(body: PhysicalLaunchTargetBody3D, direction: readonly [number, number, number]): number {
  if (body.shape.kind === "sphere") return positive(body.shape.radius, "targeting sphere radius");
  let x = body.rotation?.[0] ?? 0, y = body.rotation?.[1] ?? 0, z = body.rotation?.[2] ?? 0, w = body.rotation?.[3] ?? 1;
  const length = Math.hypot(x, y, z, w); if (length <= 1e-12) throw new RangeError("Targeting body rotation must be a non-zero quaternion."); x /= length; y /= length; z /= length; w /= length;
  const axisX: [number, number, number] = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const axisY: [number, number, number] = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  const axisZ: [number, number, number] = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  const projection = (axis: readonly [number, number, number]) => Math.abs(axis[0] * direction[0] + axis[1] * direction[1] + axis[2] * direction[2]);
  return projection(axisX) * positive(body.shape.halfX, "targeting box halfX") + projection(axisY) * positive(body.shape.halfY, "targeting box halfY") + projection(axisZ) * positive(body.shape.halfZ, "targeting box halfZ");
}

function groupSupportEnds(cues: readonly PhysicalPerformanceCue3D[], durationFrames: number) { const grouped = Array.from({ length: durationFrames }, (): Array<Extract<PhysicalPerformanceCue3D, { kind: "support" | "step" }>> => []); for (const cue of cues) if (cue.kind === "support" || cue.kind === "step") { const end = cue.frame + cue.durationFrames + (cue.kind === "step" ? cue.holdFrames : 0); if (end < durationFrames) grouped[end]!.push(cue); } return grouped; }

function groupCues(cues: readonly PhysicalPerformanceCue3D[], durationFrames: number) {
  const grouped = Array.from({ length: durationFrames }, (): PhysicalPerformanceCue3D[] => []);
  for (const cue of cues) { const frame = frameIndex(cue.frame, durationFrames); if (!hasContactAnchor(cue)) grouped[frame]!.push(cue); }
  return grouped;
}

type ContactAnchoredPhysicalCue3D =
  | (Extract<PhysicalPerformanceCue3D, { kind: "mode" }> & { afterContact: PhysicalContactAnchor3D })
  | (Extract<PhysicalPerformanceCue3D, { kind: "recovery" }> & { afterContact: PhysicalContactAnchor3D })
  | (Extract<PhysicalPerformanceCue3D, { kind: "effector-drive" }> & { afterContact: PhysicalContactAnchor3D })
  | (Extract<PhysicalPerformanceCue3D, { kind: "bind" }> & { afterContact: PhysicalContactAnchor3D });

function hasContactAnchor(cue: PhysicalPerformanceCue3D): cue is ContactAnchoredPhysicalCue3D { return (cue.kind === "mode" || cue.kind === "recovery" || cue.kind === "effector-drive" || cue.kind === "bind") && cue.afterContact !== undefined; }
function groupContactAnchoredCues(cues: readonly PhysicalPerformanceCue3D[]) { const grouped = new Map<string, ContactAnchoredPhysicalCue3D[]>(); for (const cue of cues) if (hasContactAnchor(cue)) { const list = grouped.get(cue.afterContact.cueId) ?? []; list.push(cue); grouped.set(cue.afterContact.cueId, list); } return grouped; }

function createOutputReferences(performance: PhysicalPerformance3D): PhysicalBodyReference3D[] {
  if (performance.outputs) return performance.outputs.map(copyReference);
  const references: PhysicalBodyReference3D[] = [];
  for (const body of performance.bodies ?? []) references.push({ bodyId: body.id });
  for (const ragdoll of performance.ragdolls) for (const body of ragdoll.bodies) references.push({ ragdollId: ragdoll.id, boneId: body.boneId });
  return references;
}

function createQualityBodies(performance: PhysicalPerformance3D, world: ReturnType<typeof createRigidWorld3D>, ragdolls: ReturnType<typeof createRagdollSystem3D>, constraintHandles: readonly number[]): PhysicalQualityBody3D[] {
  const constrained = new Set<number>();
  for (const handle of constraintHandles) { const item = world.constraint(handle); if (item) { constrained.add(item.a); constrained.add(item.b); } }
  const bodies: PhysicalQualityBody3D[] = [];
  for (let index = 0; index < (performance.bodies?.length ?? 0); index += 1) { const definition = performance.bodies![index]!, body = requireBody(world, definition.id, definition.id); bodies.push({ handle: body.handle, id: body.id, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/bodies/${index}`, gravityScale: definition.gravityScale ?? 1, constrained: constrained.has(body.handle) }); }
  for (let ragdollIndex = 0; ragdollIndex < performance.ragdolls.length; ragdollIndex += 1) { const definition = performance.ragdolls[ragdollIndex]!; for (let bodyIndex = 0; bodyIndex < definition.bodies.length; bodyIndex += 1) { const item = definition.bodies[bodyIndex]!, body = requireBodyState(ragdolls.body(definition.id, item.boneId), `${definition.id}/${item.boneId}`); bodies.push({ handle: body.handle, id: body.id, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/${ragdollIndex}/bodies/${bodyIndex}`, gravityScale: item.body.gravityScale ?? 1, constrained: true }); } }
  return bodies;
}

function createQualityLimits(performance: PhysicalPerformance3D, world: ReturnType<typeof createRigidWorld3D>): PhysicalQualityLimit3D[] { const limits: PhysicalQualityLimit3D[] = []; for (let ragdollIndex = 0; ragdollIndex < performance.ragdolls.length; ragdollIndex += 1) { const ragdoll = performance.ragdolls[ragdollIndex]!; for (let jointIndex = 0; jointIndex < ragdoll.joints.length; jointIndex += 1) { const joint = ragdoll.joints[jointIndex]; if (!joint || !joint.swingTwistLimit && joint.angularLimitRadians === undefined) continue; const state = world.constraint(`${ragdoll.id}:${joint.id}:limit`); if (!state) throw new Error(`Physical quality limit ${ragdoll.id}/${joint.id} does not exist.`); limits.push({ handle: state.handle, id: `${ragdoll.id}/${joint.id}`, pointer: `/extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/${ragdollIndex}/joints/${jointIndex}/${joint.swingTwistLimit ? "swingTwistLimit" : "angularLimitRadians"}`, aHandle: state.a, bHandle: state.b }); } } return limits; }

function addConstraint(constraint: PhysicalConstraint3D, world: ReturnType<typeof createRigidWorld3D>, ragdolls: ReturnType<typeof createRagdollSystem3D>) {
  const id = text(constraint.id, "constraint id"), a = resolveHandle(constraint.a, world, ragdolls), b = resolveHandle(constraint.b, world, ragdolls);
  if (constraint.breakGroupId !== undefined) text(constraint.breakGroupId, `${id} breakGroupId`);
  if (constraint.kind === "point") return world.addPointConstraint({ id, a, b, localAnchorA: constraint.localAnchorA, localAnchorB: constraint.localAnchorB, stiffness: constraint.stiffness, breakImpulse: constraint.breakImpulse });
  return world.addDistanceConstraint({ id, a, b, distance: constraint.distance, stiffness: constraint.stiffness, breakImpulse: constraint.breakImpulse });
}

function referenceForHandle(handle: number, references: readonly PhysicalBodyReference3D[], handles: readonly number[], world: ReturnType<typeof createRigidWorld3D>): PhysicalBodyReference3D {
  const index = handles.indexOf(handle);
  if (index >= 0) return copyReference(references[index]!);
  return { bodyId: requireBody(world, handle, "contact").id };
}

function copyReference(reference: PhysicalBodyReference3D): PhysicalBodyReference3D { return "bodyId" in reference ? { bodyId: text(reference.bodyId, "bodyId") } : { ragdollId: text(reference.ragdollId, "ragdollId"), boneId: text(reference.boneId, "boneId") }; }
function copyCheckpointPose(pose: RagdollPose3D): Float64Array { if (!pose?.rotations) throw new Error("Checkpoint pose rotations are required."); const copy = new Float64Array(pose.rotations.length); for (let index = 0; index < copy.length; index += 1) copy[index] = finite(pose.rotations[index]!, `checkpoint pose rotation ${index}`); return copy; }
function copyContactEvent(event: Readonly<PhysicalContactEvent3D>): PhysicalContactEvent3D { return { ...event, attacker: { ...event.attacker }, target: copyReference(event.target), point: [...event.point], normal: [...event.normal] }; }
function copyBreakEvent(event: Readonly<PhysicalBreakEvent3D>): PhysicalBreakEvent3D { return { ...event, a: copyReference(event.a), b: copyReference(event.b), point: [...event.point] }; }
function copyBindEvent(event: Readonly<PhysicalBindEvent3D>): PhysicalBindEvent3D { return { ...event, a: copyReference(event.a), b: copyReference(event.b), point: [...event.point] }; }
function copyDiagnosticEvent(event: Readonly<PhysicalPerformanceDiagnostic3D>): PhysicalPerformanceDiagnostic3D { return { ...event, ...(event.position ? { position: [...event.position] } : {}), ...(event.secondaryPosition ? { secondaryPosition: [...event.secondaryPosition] } : {}) }; }
function copyCharacterState(state: Readonly<PhysicalCharacterState3D>): PhysicalCharacterState3D { return { locomotion: state.locomotion, authority: state.authority, ...(state.landing ? { landing: { ...state.landing, point: tuple3(...state.landing.point) } } : {}), ...(state.action ? { action: { ...state.action } } : {}) }; }
function emptyContact(): RigidContact3D { return { a: 0, b: 0, aId: "", bId: "", normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false }; }
function worldPoint(body: ReturnType<ReturnType<typeof createRigidWorld3D>["body"]> extends infer T ? NonNullable<T> : never, local: readonly [number, number, number]) { const [x, y, z] = vector3(local, "localPoint"), qx = body.rotationX, qy = body.rotationY, qz = body.rotationZ, qw = body.rotationW, tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x); return tuple3(body.x + x + qw * tx + qy * tz - qz * ty, body.y + y + qw * ty + qz * tx - qx * tz, body.z + z + qw * tz + qx * ty - qy * tx); }
function unit(value: number, label: string) { value = finite(value, label); if (value < 0 || value > 1) throw new RangeError(`${label} must be from 0 through 1.`); return value; }
function frameRate(value: number) { return positiveInteger(value, "frameRate"); }
