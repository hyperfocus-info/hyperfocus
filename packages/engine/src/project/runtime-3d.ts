import { createRuntimeStartup3D, type SkeletonBinding } from './3d/runtime/startup.ts';
import { readReference3D } from './3d/reference-schema.ts';
import { createReferenceRuntimeGuard3D } from './3d/reference-runtime.ts';
export { readReference3D, inspectReference3D, assertReferenceProject3D, assertReferenceFindings3D, referenceProjection3D, type Reference3D, type ReferenceFinding3D } from './3d/reference.ts';
import {createEntityTrsValidationJournal3D,type EntityTrsValidationJournal3D,type SampledEntityWriteContract3D} from './3d/runtime/entity-trs-journal.ts';
import { createRuntimeDiagnosticFeatures3D } from './3d/runtime/diagnostic-features.ts';
import { sample3DFrameWithEntitySampling } from '../frame/3d.ts';
import { createOwnedFrameStorage3D } from '../frame/owned-storage-3d.ts';
import type { EntitySamplingStrategy3D, EntitySamplingWork3D } from '../frame/entity-sampling-3d.ts';
export type { EntitySamplingStrategy3D, EntitySamplingWork3D } from '../frame/entity-sampling-3d.ts';
export { createCombatAi3D } from './3d/combat-ai.ts';
export { readCombatAiOutcomeReport3D, type CombatAiOutcomeReport3D } from './3d/combat-ai/report-reader.ts';
export { createCombatAiPolicy, readCombatAiPolicy, type CombatAiPolicy } from './3d/combat-ai/policy/trained.ts';
export { readCombatAiTuning, type CombatAiTuning, type CombatAiProfile } from './3d/combat-ai/policy/instrumentation.ts';
export { readLearning as readCombatAiLearning } from './3d/combat-ai/learning/validation.ts';
export type { CombatAiLearning } from './3d/combat-ai/learning/model.ts';
export { prepareCombatAiLearning, mergeCombatAiLearning, type CombatAiLearningEvidenceTrial } from './3d/combat-ai/learning/training.ts';
export { readCombatAiLearningEvidence } from './3d/combat-ai/learning/evidence-validation.ts';
export { combatAiLearningProbe, type CombatAiLearningProbeReport } from './3d/combat-ai/learning/probe.ts';
export type { CombatAiLearningEvidence, CombatAiLearningProbe } from './3d/combat-ai/learning/evidence.ts';
import { cos, hypot, sin, sqrt } from '../math/simulation.ts';
import { tuple3, tuple4 } from "../math/tuples.ts";
import type { createRuntimeMaterialApplicator3D } from './3d/runtime/materials.ts';
import type { createRuntimeEntityApplicator3D } from './3d/runtime/entities.ts';
import { resetRuntimePresentationTransforms3D } from './3d/runtime/presentation-reset.ts';
import { setRuntimeRotationY3D as setRotationY, type EntityApplicationStrategy3D } from './3d/runtime/entity-transforms.ts';
import type { EntityInputLease3D } from './3d/runtime/entity-input-lease.ts';
import { createRuntimeEndpointProducer3D, type EndpointProducerApplication3D } from './3d/runtime/endpoint-producer.ts';
export { createEntityInputLease3D, type EntityInputLease3D } from './3d/runtime/entity-input-lease.ts';
export { createFrameRecordSelection, createOrderedFrameRecordSelection } from '../frame/record-selection.ts';
export { prepareEulerPointRotation3D, prepareEulerQuaternion3D } from '../math/prepared-euler.ts';
import { runtimeCameraView } from './3d/runtime/camera-view.ts';
import { carryPlatformRiders3D, samplePlatformPosition3D, samplePlatformRotation3D } from './3d/motion/platform-motion.ts';
export { samplePlatformPosition3D, samplePlatformRotation3D } from './3d/motion/platform-motion.ts';
export { combatArenaLayout, type CombatArenaLayouts } from './3d/combat-match/arena-layouts.ts';
export { createCombatProject3D, readCombatProject3D, type CombatProject3D } from './3d/combat-declaration.ts';
export { combatAudioCues3D, combatVoiceCues3D, combatAudioAssetIds3D, readCombatAudio3D, readCombatAudioMix3D, readCombatAudioEffects3D, type CombatAudio3D, type CombatAudioCue3D, type CombatAudioMix3D, type CombatAudioEffects3D, type CombatMusicTrack3D, type CombatMusicTransition3D } from './3d/combat-audio-config.ts';
import { record, type PortableAsset3D, type Hyperfocus3DDiagnostic, type Hyperfocus3DDeclaration } from "./3d/declaration.ts";
import { requireMapValue } from "./3d/runtime-assets.ts";
import { createRuntimeCommandApplicator3D, readRotation3D, type RuntimeCommand3D } from "./3d/runtime-commands.ts";
import { createRuntimeCheckpoint3D, createRuntimeSnapshotRestorer3D, type RuntimeCheckpoint3D } from './3d/runtime/checkpoint.ts';
export { createNetworkCombatSession } from './3d/combat-rollback/session.ts';
export { combatInputActions3D } from './3d/combat-fighter-inputs.ts';
export { createNetworkCombatSpectator } from './3d/combat-rollback/spectator.ts';
export { createCombatReplay3D } from './3d/combat-rollback/replay.ts';
export { readAppearanceCatalog3D, resolveAppearance3D, type AppearanceCatalog3D, type AppearanceOption3D, type AppearanceColor3D, type ResolvedAppearance3D } from './3d/appearance/catalog.ts';
export { readResolvedAppearance3D, readResolvedAppearancePoses3D, readCombatFramePresentation3D, type CombatFramePresentationData3D } from './3d/appearance/resolved-reader.ts';
export { readPortableAsset3D, readPortableAssets3D } from './3d/serialization/portable-assets.ts';
export { applyAppearance3D } from './3d/appearance/presentation.ts';
export { applyAppearanceMotion3D } from './3d/appearance/motion.ts';
export { appearanceStyleChoices, appearanceRarities, type AppearanceRarity3D, type AppearanceStyle3D } from './3d/appearance/catalog.ts';
export { createAppearancePosePresenter3D } from './3d/appearance/pose.ts';
export { presentCombatVisuals3D } from './3d/combat-visuals.ts';
export { presentCombatCamera3D } from './3d/combat-visuals/camera.ts';
export { presentCombatObstructions3D } from './3d/combat-visuals/obstructions.ts';
export { createCombatRoundRecovery3D } from './3d/combat-visuals/round-recovery.ts';
export type { AppearancePose3D, ResolvedAppearancePose3D } from './3d/appearance/catalog.ts';
export { resolveAppearanceTexture3D, applyAppearanceTexture3D, type ResolvedAppearanceTexture3D } from './3d/appearance/texture-targets.ts';
export type { AppearanceTextureSlot3D } from './3d/appearance/catalog.ts';
export type { RuntimeCommand3D } from "./3d/runtime-commands.ts";
export { createGameplay3D, type Gameplay3D, type GameplayProject3D, type GameplaySnapshot3D } from "./3d/gameplay.ts";
export { readGameplayProject3D } from './3d/gameplay/project-reader.ts';
export { readGameplaySnapshot3D } from './3d/gameplay/snapshot-reader.ts';
export { readHyperfocus3DTimeline } from '../frame/timeline3d/reader.ts';
export { createPresentationCaptureWork, type PresentationCaptureWork, type PresentationCaptureStrategy, type PresentationObserverContract } from './3d/presentation-capture.ts';
export type { GameplayBehavior3D, GameplayContext3D, GameplayResult3D, GameplayPresentation3D, GameplayAudio3D, GameplayValue3D } from "./3d/gameplay-contracts.ts";
import {
  applyGltfAnimationClip,
  blendGltfPoses,
  resetGltfPose,
  writeGltfSkinPalette,
  type CookedGltfRig,
  type GltfPoseOutput,
} from "../assets/gltf-skin-animation.ts";
import { applyGltfModelPoseOverrides, applyGltfModelRotationDelta, rebuildGltfPoseMatrices } from "../assets/gltf-pose-overrides.ts";
import { composeMat4FromTrs, lookAtViewMat4, multiplyMat4, perspectiveMat4 } from "../render/3d-core.ts";
import { createPoseTwoBoneIKSolver } from "../motion/solvers/pose-ik.ts";
import { createHumanoidMotionController, type HumanoidMotionController } from "../motion/humanoid/controller.ts";
import { type BoundedScene3D, type RenderCommandBuffer3D } from "../render/3d-scene.ts";
import { createSceneViewCompiler3D } from '../render/three/view-compiler.ts';
import { type RigidBodyDefinition3D, type RigidWorld3D } from "../physics/rigid-3d.ts";
import type { Physics3DRaycastHit, Physics3DRaycastProvider, Vec3Input } from "../physics/3d.ts";
import { samplePhysicalPresentationRoot3D } from "../physics/performance/presentation-root-3d.ts";
import { createStaticTerrainHit3D, raycastStaticTerrainDown3D, sampleStaticTerrainHeight3D } from "../physics/terrain/static-raycast.ts";
import { sample3DFrame, sample3DIkCorrections, sample3DPerformances, sample3DPoseCorrections, sample3DSceneEntities, type Hyperfocus3DEvaluatedFrame, type Hyperfocus3DTimeline } from "../frame/3d.ts";
import { PHYSICAL_BODY_STATE_STRIDE_3D, createPhysicalLocomotionProfiles3D, createPhysicalPerformanceCompiler3D, samplePhysicalCharacterState3D, samplePhysicalLocomotionSpeed3D, type CompiledPhysicalPerformance3D, type PhysicalLocomotionProfile3D, type PhysicalPerformanceCue3D, type PhysicalPerformanceResumePoint3D } from "../physics/physical-performance-3d.ts";
export {
  HYPERFOCUS_3D_FORMATIONS,
  audit3DFrameCapabilities,
  recommended3DPoseBlendFrames,
  recommended3DPerformanceBlendFrames,
  sample3DIkCorrections,
  sample3DPhysicalInspection,
  sample3DPoseCorrections,
  sample3DFrame,
  type Hyperfocus3DEvaluatedImpactFrame,
  type Hyperfocus3DEvaluatedFrame,
  type Hyperfocus3DFormation,
  type Hyperfocus3DFrameClock,
  type Hyperfocus3DFrameDiagnostic,
  type Hyperfocus3DImpactFrameCue,
  type Hyperfocus3DPhysicalInspection,
  type Hyperfocus3DPhysicalInspectionSettings,
  type Hyperfocus3DRenderGraph,
  type Hyperfocus3DRootMotionPolicy,
  type Hyperfocus3DEvaluatedRootMotion,
  type Hyperfocus3DEvaluatedRootMotionSpan,
  type Hyperfocus3DShot,
  type Hyperfocus3DTimeline,
  type Hyperfocus3DVec3,
} from "../frame/3d.ts";

export type { PortableAsset3D, Hyperfocus3DDiagnostic, Hyperfocus3DBudgets, Hyperfocus3DDeclaration } from "./3d/declaration.ts";
export { HARD as HYPERFOCUS_3D_HARD_BUDGETS } from './3d/declaration.ts';

type Hyperfocus3DScene = Hyperfocus3DDeclaration["scenes"][number];
type Hyperfocus3DEntity = Hyperfocus3DScene["entities"][number];
type Vector3 = [number, number, number];
type Vector4 = [number, number, number, number];
type EvaluatedRootMotionSample = { clipId: string; timeSeconds: number; sourceStartSeconds: number; loop: boolean; rootMotion: NonNullable<Hyperfocus3DEvaluatedFrame["performances"][number]["rootMotion"]> };
type MeasuredRootMotion = { node: number; offset: number; displacement: Vector3; inPlace: Vector3 };
type ResolvedRootMotion = { current?: MeasuredRootMotion; previous?: MeasuredRootMotion; worldOffset: Vector3; authority: "transform" | "physical" };

export type Hyperfocus3DSnapshot = { version: 1; sceneId: string; tick: number; motionSeed?: number; entities: Array<{ id: string; position: [number, number, number]; rotationY: number; rotation?: [number, number, number, number] }> };

export function isHyperfocus3DSnapshot(value: unknown): value is Hyperfocus3DSnapshot {
  const snapshot = record(value);
  if (snapshot?.renderOnly === true) return false;
  if (snapshot?.motionSeed !== undefined && (!Number.isSafeInteger(snapshot.motionSeed) || Number(snapshot.motionSeed) < 0 || Number(snapshot.motionSeed) > 0xffffffff)) return false;
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.sceneId !== "string" || !Number.isSafeInteger(snapshot.tick) || Number(snapshot.tick) < 0 || !Array.isArray(snapshot.entities)) return false;
  return snapshot.entities.every((entity) => {
    const item = record(entity);
    if (!item || typeof item.id !== "string" || !Array.isArray(item.position) || item.position.length !== 3 || !Number.isFinite(item.rotationY)) return false;
    try { if (item.rotation !== undefined) readRotation3D(item.rotation); } catch { return false; }
    return item.position.every((part) => Number.isFinite(part));
  });
}
export type Hyperfocus3DRuntime = {
  declaration: Readonly<Hyperfocus3DDeclaration>;
  readonly motionSeed: number;
  readonly tick: number;
  /** Detached simulation pose for one declared entity; avoids a full save allocation. */
  entityState(entityId: string): Hyperfocus3DSnapshot['entities'][number];
  /** Detached final evaluated bone transforms in model space, plus local rotations for calibrated limits. */
  actorPose(entityId: string): Array<{ id: string; position: [number, number, number]; rotation: [number, number, number, number] }>;
  scene: BoundedScene3D;
  commands: RenderCommandBuffer3D;
  physics: RigidWorld3D;
  diagnostics: readonly Hyperfocus3DDiagnostic[];
  readonly diagnosticFeatures: Readonly<ReturnType<typeof createRuntimeDiagnosticFeatures3D>['features']>;
  setDiagnosticFeatures: ReturnType<typeof createRuntimeDiagnosticFeatures3D>['set'];
  step(actions?: Iterable<string>, options?: { suppressedControllerIds?: ReadonlySet<string>; platformPositions?: (tick: number, seed: number) => ReadonlyMap<string, readonly number[]> | undefined }): Hyperfocus3DSnapshot;
  /** Advance one fixed tick without allocating an exported world snapshot. */
  advance(options?: { actions?: Iterable<string>; suppressedControllerIds?: ReadonlySet<string>; platformPositions?: (tick: number, seed: number) => ReadonlyMap<string, readonly number[]> | undefined }): void;
  applyCommands(options: { commands: readonly RuntimeCommand3D[] }): void;
  compile(): RenderCommandBuffer3D;
  /** Camera and light frustum culling; borrowed buffers remain valid until the next compile. */
  compileViews: ReturnType<typeof createSceneViewCompiler3D>;
  cameraPosition(): [number, number, number];
  viewProjection(aspect: number): Float32Array;
  snapshot(): Hyperfocus3DSnapshot;
  /** Detached render frame sampled directly from current poses, without a save snapshot/map copy. */
  sampleFrame(options: Omit<Parameters<typeof sample3DFrame>[0], 'declaration' | 'simulation' | 'clock' | 'onEntitySample'>): Hyperfocus3DEvaluatedFrame;
  /** Borrow reusable entity/material storage synchronously. Do not retain, freeze
   * or asynchronously use any frame/record/vector. Every source scalar is reread;
   * timelines use the detached fallback. applyFrame retains all liveness checks.
   * Use sampleFrame for independently owned outputs or publication. */
  withRenderView<T>(options: { sample: Parameters<Hyperfocus3DRuntime['sampleFrame']>[0]; operation: (frame: Hyperfocus3DEvaluatedFrame) => T }): T;
  readRenderViewWork(): Readonly<ReturnType<typeof createOwnedFrameStorage3D>['work']>;
  readMaterialApplicationWork(): Readonly<ReturnType<typeof createRuntimeMaterialApplicator3D>['work']>;
  /** Synchronous ownership window. The explicit contract restricts TRS writes to
   * acquired writer IDs; ordinary callbacks use checked validation. Authority
   * expires on return/throw, even if the frame is returned. Explicit immutable-trs
   * sampling shares frozen engine-owned nonwriter tuples, which remain immutable
   * after escape. Frame/array/entity shells and writable TRS remain fresh. The
   * default detached option preserves mutable independent outputs. */
  withSampledFrame<T>(options: { sample: Parameters<Hyperfocus3DRuntime['sampleFrame']>[0]; operation: (frame: Hyperfocus3DEvaluatedFrame) => T; contract?: SampledEntityWriteContract3D; entitySampling?: EntitySamplingStrategy3D }): T;
  readEntityTrsJournalWork(): Readonly<EntityTrsValidationJournal3D['work']> | undefined;
  readEntitySamplingWork(): Readonly<EntitySamplingWork3D> | undefined;
  /** Trusted fixed-topology rollback; reapply presentation after restoring. */
  checkpoint(): RuntimeCheckpoint3D;
  restore(snapshot: Hyperfocus3DSnapshot): Hyperfocus3DSnapshot;
  /** Registers shared semantic presentation data and an optional reused physical cache. */
  configurePhysicalPerformance(timeline: Readonly<Hyperfocus3DTimeline>, source?: Readonly<CompiledPhysicalPerformance3D>): void;
  /** Compiles timeline physics once, using the canonical glTF clips as active-ragdoll motor targets. */
  compilePhysicalPerformance(timeline: Readonly<Hyperfocus3DTimeline>, options?: { throughFrame?: number; checkpointIntervalFrames?: number; resumeFrom?: Readonly<PhysicalPerformanceResumePoint3D>; defer?: boolean }): CompiledPhysicalPerformance3D | undefined;
  /** A lease requires entityApplication=leased-input and exclusive immutable input ownership. */
  applyFrame(frame: Readonly<Hyperfocus3DEvaluatedFrame>, entityInputLease?: EntityInputLease3D): void;
  /** Borrowed counters from the last application; input cache storage is runtime-owned. */
  readEntityApplicationWork(): Readonly<ReturnType<ReturnType<typeof createRuntimeEntityApplicator3D>['readWork']>>;
  /** Restore authored entity render TRS and clear comparison/reuse history.
   * Call while display is suspended, then reapply presentation. Simulation,
   * materials, resource identity and graphics ownership remain unchanged. */
  resetPresentationTransforms(): void;
  /** Clear detached material comparison/input history while retaining live
   * resources and their epochs. Call while display is suspended; the next
   * apply performs ordinary validation and repairs current packed storage. */
  resetPresentationMaterialHistory(): void;
  /** Irreversibly makes this runtime a non-renderable endpoint producer. Capture
   * packet/pool capacities before acquisition; use a separate runtime to display.
   * Full resource validation and non-static presentation history remain active.
   */
  acquireEndpointProducer(options?: { materialRevisionNamespace?: string; writableEntityIds?: readonly string[] }): void;
  readEndpointApplicationWork(): Readonly<EndpointProducerApplication3D['work']> | undefined;
  /** Opt-in revisions are a read-only borrow through the next application/reset.
   * The host supplies a namespace unique to this owner lifetime. Full fallback
   * is explicit: use a distinct full issuer or decline revision publication. */
  readEndpointMaterialInputRevisions(): ReturnType<EndpointProducerApplication3D['readMaterialInputRevisions']>;
  readEndpointMaterialRevisionWork(): ReturnType<EndpointProducerApplication3D['readMaterialInputRevisionWork']>;
  /** Presentation-only RGBA8 replacement of an existing declared texture. Copies pixels. */
  replaceTexture(options: { textureId: string; width: number; height: number; pixels: Uint8Array | Uint8ClampedArray }): void;
  resetTexture(options: { textureId: string }): void;
  viewProjectionForFrame(frame: Readonly<Hyperfocus3DEvaluatedFrame>, aspect: number): Float32Array;
};

export { hasHyperfocus3DProject } from './metadata/index.ts';

export { auditHyperfocus3DProject, readHyperfocus3DDeclaration, readMutableHyperfocus3DDeclaration } from './3d/runtime/preflight.ts';

/** Validates, resolves and cooks a portable 3D declaration without filesystem or network access. */
export async function createHyperfocus3DRuntime(project: unknown, assets: readonly PortableAsset3D[], options: { entityApplication?: EntityApplicationStrategy3D; entityApplicationDiagnostics?: boolean } = {}): Promise<Hyperfocus3DRuntime> {
  const diagnostic = createRuntimeDiagnosticFeatures3D();
  const { declaration, diagnostics, active, scene, meshHandles, billboardMesh, textures, textureHandles, materialHandles, lightHandles,
    transforms, instanceHandles, skeletonBindings, effectTransforms, effectInstances, commands, physicsEntities, motionEntities,
    applyEntities, applyMaterials, platformRiders, physics, physicsHandles, positions, rotations } = await createRuntimeStartup3D(project, assets, options);
  const referenceGuard = createReferenceRuntimeGuard3D({ contract: readReference3D(project), declaration, scene, transforms, meshHandles });
  const compileViews = createSceneViewCompiler3D(scene, commands);
  let endpointApplication: EndpointProducerApplication3D | undefined;
  let trsJournal: EntityTrsValidationJournal3D | undefined;
  let tick = 0;
  let motionSeed = 0;
  let presentationRevision = 0;
  let presentationTimeline: Readonly<Hyperfocus3DTimeline> | undefined;
  let presentationLocomotionProfiles: readonly PhysicalLocomotionProfile3D[] = [];
  let presentationPhysicalPerformance: Readonly<CompiledPhysicalPerformance3D> | undefined;
  let presentationPhysicalReferenceIndices = new Map<string, number>();
  let presentationPhysicalState = new Float32Array(0);
  const presentationLocomotion = new Map<string, {
    controller: HumanoidMotionController;
    frame: number;
    jump?: { frame: number; groundedFrames: number; launched: boolean };
  }>();
  const poses = new Map<string, [number, number, number, number]>();
  const snapshot = () => ({ ...createRuntimeSnapshot(active, tick, positions, rotations, poses), ...(motionSeed ? { motionSeed } : {}) });
  const samplePresentationLocomotion = (entityId: string, binding: SkeletonBinding, frameIndex: number) => {
    const timeline = presentationTimeline, physical = timeline?.physicalPerformance;
    if (!timeline || !physical) return undefined;
    const rootBinding = physical.bindings.find((item) => item.entityId === entityId && !item.boneId && "ragdollId" in item.reference);
    if (!rootBinding || !("ragdollId" in rootBinding.reference)) return undefined;
    const ragdollId = rootBinding.reference.ragdollId;
    const profiles = presentationLocomotionProfiles.filter((profile) => profile.cue.ragdollId === ragdollId);
    if (!profiles.length) return undefined;
    const authoredEntity = active.entities.find((entity) => entity.id === entityId); if (!authoredEntity) return undefined;
    let sampler = presentationLocomotion.get(ragdollId);
    if (!sampler) { sampler = { controller: createHumanoidMotionController({ rig: binding.semanticRig, ground: presentationTerrainRaycastProvider(physical.simulation.bodies ?? [], authoredEntity), motorOptions: presentationMotorOptions(profiles) }), frame: -1 }; presentationLocomotion.set(ragdollId, sampler); }
    if (frameIndex < sampler.frame) { sampler.controller.reset(); sampler.frame = -1; delete sampler.jump; }
    while (sampler.frame < frameIndex) {
      const nextFrame = sampler.frame + 1, profile = profiles.find((candidate) => nextFrame >= candidate.cue.frame && nextFrame < candidate.cue.frame + candidate.cue.durationFrames), cue = profile?.cue;
      const physicalBody = samplePresentationPhysicalBody(ragdollId, rootBinding.reference.boneId, nextFrame);
      const actualLocalVelocity = physicalBody ? worldDirectionToEntityLocal(physicalBody.velocity, authoredEntity.rotationY) : undefined;
      const authoredLocalDirection = cue ? worldDirectionToEntityLocal(cue.direction, authoredEntity.rotationY) : undefined;
      const fallbackSpeed = profile ? samplePhysicalLocomotionSpeed3D(profile, (nextFrame + .5 - profile.cue.frame) / profile.cue.durationFrames) : 0;
      const velocity = actualLocalVelocity ?? (cue ? worldDirectionToEntityLocal([cue.direction[0] * fallbackSpeed, 0, cue.direction[2] * fallbackSpeed], authoredEntity.rotationY) : [0, 0, 0]);
      const speed = hypot(velocity[0], velocity[2]);
      if (cue) sampler.controller.setLocomotionIntent({ direction: authoredLocalDirection!, ...(cue.pace === undefined ? {} : { pace: cue.pace }), ...(cue.posture === undefined ? {} : { posture: cue.posture }), ...(cue.cycleDistanceScale === undefined ? {} : { cycleDistanceScale: cue.cycleDistanceScale }), speedMetersPerSecond: speed });
      else sampler.controller.move(velocity);
      if (physicalBody) {
        const physicalCharacter = samplePhysicalCharacterState3D(presentationPhysicalPerformance!, ragdollId, nextFrame);
        const locomotionState = physicalCharacter?.locomotion;
        const rawWorldPosition = presentationEntityWorldPosition(physicalBody.position, rootBinding, authoredEntity);
        const rootReferenceIndex = presentationPhysicalReferenceIndices.get(physicalReferenceKey(rootBinding.reference));
        if (rootReferenceIndex === undefined) throw new Error(`Procedural presentation for ${entityId} cannot find its compiled physical root.`);
        const baseGround = sampleStaticTerrainHeight3D(physical.simulation.bodies ?? [], authoredEntity.position[0], authoredEntity.position[2]);
        const jumpCue = physical.simulation.cues.find((item) => item.kind === "jump" && item.ragdollId === ragdollId && item.frame === nextFrame);
        if (jumpCue) sampler.jump = { frame: nextFrame, groundedFrames: 0, launched: false };
        const explicitJump = sampler.jump !== undefined && nextFrame >= sampler.jump.frame;
        // A ready character traveling under a locomotion cue owns any brief
        // support loss as part of its gait. Only an authored jump, impact, or
        // unsupported fall may switch the visible rig into an airborne pose.
        const plannedLocomotionFlight = locomotionState === "airborne" && cue !== undefined && physicalCharacter?.authority === "ready" && !explicitJump;
        const presentationWorldPosition = samplePhysicalPresentationRoot3D({
          bodies: physical.simulation.bodies ?? [],
          source: presentationPhysicalPerformance!,
          ragdollId,
          rootReferenceIndex,
          frame: nextFrame,
          physicalRootPosition: physicalBody.position,
          rawEntityPosition: rawWorldPosition,
          groundOffsetY: baseGround === undefined ? 0 : authoredEntity.position[1] - baseGround,
          supportAirborne: plannedLocomotionFlight,
        });
        const position = worldPointToEntityLocal(presentationWorldPosition, authoredEntity);
        const previousPosition: [number, number, number] = [sampler.controller.state.motor.position.x, sampler.controller.state.motor.position.y, sampler.controller.state.motor.position.z];
        if (explicitJump) {
          if (locomotionState === "airborne") { sampler.jump!.launched = true; sampler.jump!.groundedFrames = 0; }
          else if (sampler.jump!.launched) sampler.jump!.groundedFrames += 1;
        }
        const jumpAnticipation = explicitJump && !sampler.jump!.launched
          ? 1
          : samplePhysicalJumpAnticipation3D(physical.simulation.cues, ragdollId, nextFrame, timeline.fps);
        sampler.controller.updateFromPhysics({
          deltaSeconds: 1 / timeline.fps,
          position,
          velocity,
          resolvedRootDelta: [position[0] - previousPosition[0], position[1] - previousPosition[1], position[2] - previousPosition[2]],
          grounded: locomotionState !== "airborne",
          plannedLocomotionFlight,
          jumpAnticipation,
          groundNormal: [0, 1, 0],
          // A collision recoil changes velocity, not the body's facing in one
          // frame. Keep the authored heading while its locomotion cue is active;
          // the pose-space travel vector separately damps any true redirection.
          facing: authoredLocalDirection ?? (speed > 1e-8 ? velocity : worldDirectionToEntityLocal([0, 0, 1], authoredEntity.rotationY)),
        });
        if (explicitJump && (sampler.jump!.groundedFrames >= 1 || !sampler.jump!.launched && nextFrame - sampler.jump!.frame > Math.round(timeline.fps * .75))) delete sampler.jump;
      } else sampler.controller.update(1 / timeline.fps);
      sampler.frame = nextFrame;
    }
    const pose = sampler.controller.state.pose, root = binding.semanticRig.motionRootIndex, translationOffset = root * 3, rotationOffset = root * 4;
    pose.translations.set(binding.semanticRig.referenceTranslations.subarray(translationOffset, translationOffset + 3), translationOffset);
    pose.rotations.set(binding.semanticRig.referenceRotations.subarray(rotationOffset, rotationOffset + 4), rotationOffset);
    return pose;
  };
  const apply = createRuntimeSnapshotRestorer3D({ physics, scene, transforms, physicsHandles, positions, rotations, poses,
    setTick(value) { trsJournal?.invalidate();tick = value; }, setMotionSeed(value) { motionSeed = value; }, snapshot });
  const cameraPosition = () => runtimeCameraPosition(active.camera, positions);
  const advance = (actions: Iterable<string> = [], options?: { suppressedControllerIds?: ReadonlySet<string>; platformPositions?: (tick: number, seed: number) => ReadonlyMap<string, readonly number[]> | undefined }) => {
      const actionSet = new Set(actions);
      tick += 1;
      if(trsJournal){for(const entity of motionEntities)trsJournal.sourceChanged(entity.id);for(const entity of physicsEntities)trsJournal.sourceChanged(entity.id);}
      const platformPositions = options?.platformPositions?.(tick, motionSeed);
      for (const entity of motionEntities) {
        if (!diagnostic.features.environmentMotion && entity.animation && !entity.controller) continue;
        const position = requireMapValue(positions, entity.id, `3D position ${entity.id}`);
        if (entity.controller && !options?.suppressedControllerIds?.has(entity.id)) {
          const distance = entity.controller.speed / 60;
          const moveX = (actionSet.has("move-right") ? entity.controller.speed : 0) - (actionSet.has("move-left") ? entity.controller.speed : 0);
          const moveZ = (actionSet.has("move-down") ? entity.controller.speed : 0) - (actionSet.has("move-up") ? entity.controller.speed : 0);
          const physicsHandle = physicsHandles.get(entity.id);
          if (physicsHandle !== undefined) {
            const body = requireRigidBody(physics, physicsHandle, entity.id);
            physics.setVelocity(physicsHandle, moveX, body.velocityY, moveZ);
          } else {
            position[0] += Math.sign(moveX) * distance;
            position[2] += Math.sign(moveZ) * distance;
            scene.transforms.setPosition(requireMapValue(transforms, entity.id, `3D transform ${entity.id}`), ...position);
          }
        }
        if (entity.animation?.kind === 'ping-pong') {
          const held = platformPositions?.get(entity.id);
          const next: [number, number, number] = held ? [held[0]!, held[1]!, held[2]!] : samplePlatformPosition3D(entity, tick, motionSeed);
          const rotation = held ? rotations.get(entity.id)! : samplePlatformRotation3D(entity, tick, motionSeed);
          carryPlatformRiders3D(physics, entity, platformRiders, next, rotation);
          rotations.set(entity.id, rotation);setRotationY(scene, requireMapValue(transforms, entity.id, `3D transform ${entity.id}`), rotation);
          positions.set(entity.id, next); scene.transforms.setPosition(requireMapValue(transforms, entity.id, `3D transform ${entity.id}`), ...next);
        } else if (entity.animation) {
          const rotation = entity.rotationY + tick * entity.animation.radiansPerSecond / 60;
          rotations.set(entity.id, rotation);
          setRotationY(scene, requireMapValue(transforms, entity.id, `3D transform ${entity.id}`), rotation);
        }
      }
      if (diagnostic.features.mainPhysics) physics.step(0.016666666666666666);
      for (const entity of physicsEntities) {
        const physicsHandle = requireMapValue(physicsHandles, entity.id, `3D physics handle ${entity.id}`);
        const body = requireRigidBody(physics, physicsHandle, entity.id);
        const position = requireMapValue(positions, entity.id, `3D position ${entity.id}`);
        position[0] = body.x; position[1] = body.y; position[2] = body.z;
        scene.transforms.setPosition(requireMapValue(transforms, entity.id, `3D transform ${entity.id}`), ...position);
      }
  };
  const sampleFrame = createRuntimeFrameSampler(declaration, positions, rotations, poses, () => tick);
  const renderStorage = createOwnedFrameStorage3D();
  const sampleRenderView = createRuntimeFrameSampler(declaration, positions, rotations, poses, () => tick, undefined, undefined, renderStorage);
  let renderViewActive = false;
  let journalSampler: Hyperfocus3DRuntime['sampleFrame'] | undefined;
  return Object.freeze({
    declaration: Object.freeze(declaration), scene, commands, physics, diagnostics, diagnosticFeatures: diagnostic.features, setDiagnosticFeatures: diagnostic.set, get motionSeed() { return motionSeed; }, get tick() { return tick; },
    entityState(entityId: string) { return { id: entityId, position: copyVector3(requireMapValue(positions, entityId, `3D position ${entityId}`)), rotationY: requireMapValue(rotations, entityId, `3D rotation ${entityId}`), ...(poses.has(entityId) ? { rotation: tuple4(...poses.get(entityId)!) } : {}) }; },
    actorPose(entityId: string) {
      const binding = skeletonBindings.get(entityId);
      if (!binding) throw Error(`Actor ${entityId} has no evaluated skeleton.`);
      rebuildGltfPoseMatrices(binding.rig, binding.poseA);
      return binding.rig.nodeIds.map((id, i) => ({ id, position: tuple3(binding.poseA.worldMatrices[i * 16 + 12]!, binding.poseA.worldMatrices[i * 16 + 13]!, binding.poseA.worldMatrices[i * 16 + 14]!), rotation: tuple4(binding.poseA.rotations[i * 4]!, binding.poseA.rotations[i * 4 + 1]!, binding.poseA.rotations[i * 4 + 2]!, binding.poseA.rotations[i * 4 + 3]!) }));
    },
    applyCommands: createRuntimeCommandApplicator3D({ scene, physics, transforms, positions, rotations, poses, onCommands: commands => {
      if(trsJournal)for(const command of commands)if(command.type==='pose'||command.type==='teleport'||command.type==='rotate')trsJournal.sourceChanged(command.entityId);
    } }),
    advance(options: Parameters<Hyperfocus3DRuntime['advance']>[0] = {}) { advance(options.actions ?? [], options); },
    step(actions: Iterable<string> = [], options?: Parameters<Hyperfocus3DRuntime['step']>[1]) { advance(actions, options);return snapshot(); },
    compile: () => { referenceGuard();return scene.compile(commands); },
    compileViews: (...args: Parameters<typeof compileViews>) => { referenceGuard();return compileViews(...args); },
    cameraPosition,
    viewProjection(aspect: number) {
      if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("3D camera aspect must be positive and finite.");
      const camera = active.camera;
      const targetEntity = camera.followEntityId ? positions.get(camera.followEntityId) : undefined;
      const target: Vector3 = targetEntity ? copyVector3(targetEntity) : copyVector3(camera.target);
      const eye = cameraPosition();
      const projection = perspectiveMat4(new Float32Array(16), { fovYRadians: camera.fovYRadians, aspect, near: camera.near, far: camera.far });
      const view = lookAtViewMat4(new Float32Array(16), eye, target, camera.up);
      return multiplyMat4(new Float32Array(16), projection, view);
    },
    snapshot,
    sampleFrame,
    withSampledFrame<T>({sample:sampleOptions,operation,contract,entitySampling='detached'}: { sample: Parameters<Hyperfocus3DRuntime['sampleFrame']>[0]; operation: (frame: Hyperfocus3DEvaluatedFrame) => T; contract?: SampledEntityWriteContract3D; entitySampling?: EntitySamplingStrategy3D }): T {
      const sample = journalSampler ?? sampleFrame;
      if(entitySampling!=='detached'&&entitySampling!=='immutable-trs')throw Error('Unknown entity sampling strategy.');
      if(entitySampling==='immutable-trs'&&!trsJournal)throw Error('Immutable TRS sampling requires an acquired writer journal.');
      if(!trsJournal)return operation(sample(sampleOptions));
      const unsupported=!!(sampleOptions.timeline||sampleOptions.physicalPerformance);
      return trsJournal.run(()=>sample(sampleOptions),operation,unsupported?undefined:contract,entitySampling,unsupported);
    },
    withRenderView<T>({ sample, operation }: { sample: Parameters<Hyperfocus3DRuntime['sampleFrame']>[0]; operation: (frame: Hyperfocus3DEvaluatedFrame) => T }): T {
      if (renderViewActive) throw Error('Render view cannot be reentered.');
      renderViewActive = true;
      try {
        const result = operation(sampleRenderView(sample));
        if (result && (typeof result === 'object' || typeof result === 'function') && typeof Reflect.get(result, 'then') === 'function') throw Error('Render view requires a synchronous operation.');
        return result;
      } finally { renderViewActive = false; }
    },
    readRenderViewWork: () => renderStorage.work,
    readMaterialApplicationWork: () => applyMaterials.work,
    readEntityTrsJournalWork:()=>trsJournal?.work,
    readEntitySamplingWork:()=>trsJournal?.samplingWork,
    checkpoint() {
      const revision = presentationRevision;
      return createRuntimeCheckpoint3D({ physics, snapshot, restoreTransforms: value => { apply(value, false); },
        assertConfiguration() { endpointApplication?.invalidateMaterialInputRevisions();if (revision !== presentationRevision) throw new Error('Runtime rollback cannot cross physical presentation configuration changes.'); },
        resetPresentation() { presentationLocomotion.clear();presentationPhysicalState.fill(0); } });
    },
    restore(value: Hyperfocus3DSnapshot) {
      endpointApplication?.invalidateMaterialInputRevisions();
      validateSnapshot(value, active);
      return apply(value);
    },
    configurePhysicalPerformance(timeline: Readonly<Hyperfocus3DTimeline>, source?: Readonly<CompiledPhysicalPerformance3D>) {
      presentationRevision += 1;
      presentationTimeline = timeline;
      presentationLocomotionProfiles = physicalLocomotionProfiles(timeline);
      presentationPhysicalPerformance = source;
      presentationPhysicalReferenceIndices = new Map(source?.bodyReferences.map((reference, index) => [physicalReferenceKey(reference), index]) ?? []);
      presentationPhysicalState = new Float32Array(source?.frameStride ?? 0);
      presentationLocomotion.clear();
    },
    compilePhysicalPerformance: (timeline: Readonly<Hyperfocus3DTimeline>, options?: { throughFrame?: number; checkpointIntervalFrames?: number; resumeFrom?: Readonly<PhysicalPerformanceResumePoint3D>; defer?: boolean }) => {
      presentationRevision += 1;
      presentationTimeline = timeline; presentationLocomotionProfiles = physicalLocomotionProfiles(timeline); presentationLocomotion.clear();
      const compiled = compileRuntimePhysicalPerformance3D(timeline, declaration, skeletonBindings, options);
      presentationPhysicalPerformance = compiled;
      presentationPhysicalReferenceIndices = new Map(compiled?.bodyReferences.map((reference, index) => [physicalReferenceKey(reference), index]) ?? []);
      presentationPhysicalState = new Float32Array(compiled?.frameStride ?? 0);
      return compiled;
    },
    replaceTexture: textures.replaceTexture,
    acquireEndpointProducer(endpointOptions?: { materialRevisionNamespace?: string; writableEntityIds?: readonly string[] }) {
      if (endpointApplication) throw Error('Runtime already belongs to an endpoint producer.');
      const journal=endpointOptions?.writableEntityIds?createEntityTrsValidationJournal3D(active.entities.map(entity=>entity.id),endpointOptions.writableEntityIds,[...motionEntities,...physicsEntities].map(entity=>entity.id)):undefined;
      endpointApplication = createRuntimeEndpointProducer3D({ sceneId: active.id, skeletons: skeletonBindings.size,
        entities: { scene, entities: active.entities, transforms, instances: instanceHandles, meshes: meshHandles, materials: materialHandles, transformStrategy: options.entityApplication, diagnostics: true, trsJournal:journal },
        materials: { materials: declaration.materials, handles: materialHandles, textures: textureHandles, revisionNamespace: endpointOptions?.materialRevisionNamespace },
      });
      trsJournal=journal;
      if(journal)journalSampler=createRuntimeFrameSampler(declaration,positions,rotations,poses,()=>tick,undefined,journal);
    },
    readEndpointApplicationWork: () => endpointApplication?.work,
    readEndpointMaterialInputRevisions() {
      if (!endpointApplication) throw Error('Missing endpoint revision owner.');
      return endpointApplication.readMaterialInputRevisions();
    },
    readEndpointMaterialRevisionWork: () => endpointApplication?.readMaterialInputRevisionWork(),
    resetTexture: textures.resetTexture,
    readEntityApplicationWork: applyEntities.readWork,
    resetPresentationTransforms() {
      if (endpointApplication) throw Error('Endpoint producer cannot reset render presentation transforms.');
      resetRuntimePresentationTransforms3D({ scene, entities: active.entities, transforms, resetHistory: applyEntities.resetTransformHistory });
    },
    resetPresentationMaterialHistory() {
      if (endpointApplication) throw Error('Endpoint producer cannot reset render material history.');
      applyMaterials.resetHistory();
    },
    applyFrame(frame: Readonly<Hyperfocus3DEvaluatedFrame>, entityInputLease?: EntityInputLease3D) {
      endpointApplication?.invalidateMaterialInputRevisions();
      try {
      if (frame.sceneId !== active.id) throw new Error(`Runtime scene ${active.id} cannot apply frame for ${frame.sceneId}.`);
      if (endpointApplication && entityInputLease) throw Error('Endpoint producer does not accept display input leases.');
      if (!endpointApplication?.tryApply(frame)) {
        applyEntities(frame.entities, entityInputLease);
        applyMaterials(frame.materials);
      }
      for (const [entityId, binding] of skeletonBindings) {
        const declarationRig = declaration.rigs!.find((item) => item.id === binding.rigId)!;
        const performance = frame.performances.find((item) => item.entityId === entityId);
        if (performance && performance.rigId !== binding.rigId) throw new Error(`Entity ${entityId} is bound to rig ${binding.rigId}, not ${performance.rigId}.`);
        const poseCorrections = frame.poseCorrections.filter((item) => item.entityId === entityId), ikCorrections = frame.ikCorrections.filter((item) => item.entityId === entityId), proceduralPose = samplePresentationLocomotion(entityId, binding, frame.frameIndex);
        if (proceduralPose) {
          resetGltfPose(binding.rig, binding.poseA);
          binding.poseA.translations.set(proceduralPose.translations.subarray(0, binding.rig.nodeCount * 3));
          binding.poseA.rotations.set(proceduralPose.rotations.subarray(0, binding.rig.nodeCount * 4));
          binding.poseA.scales.set(proceduralPose.scales?.subarray(0, binding.rig.nodeCount * 3) ?? binding.rig.nodeScales);
          rebuildGltfPoseMatrices(binding.rig, binding.poseA);
          for (const cue of poseCorrections) applyPortablePoseCorrection(binding.rig, binding.poseA, cue, cue.weight);
          applyPortableIkCorrections(binding, ikCorrections);
        } else evaluatePortablePerformancePose(binding, declarationRig, performance, poseCorrections, ikCorrections);
        if (performance && (performance.rootMotion?.mode !== undefined && performance.rootMotion.mode !== "off" || performance.blend?.rootMotion?.mode !== undefined && performance.blend.rootMotion.mode !== "off")) applyRootMotion(scene, binding, declarationRig, performance, frame.entities.find((item) => item.id === entityId)!, requireMapValue(transforms, entityId, `3D root-motion transform ${entityId}`));
        const physicalBodies = frame.physicalBodies.filter((item) => item.entityId === entityId);
        if (physicalBodies.length) {
          const entityFrame = frame.entities.find((item) => item.id === entityId)!;
          applyGltfModelPoseOverrides(binding.rig, binding.poseA, { overrides: physicalBodies.map((body) => ({ nodeId: body.boneId, ...worldPoseToEntityLocal(entityFrame, body.position, body.rotation) })) });
        }
        writeGltfSkinPalette(binding.rig, { skeleton: binding.skinIndex, meshNode: binding.meshNode }, binding.poseA, binding.palette);
        scene.setSkeletonMatrices(binding.handle, binding.palette);
      }
      for (const socket of frame.socketAttachments) applySocketAttachment(socket, frame, skeletonBindings, transforms, scene);
      const particles = frame.effects.flatMap((effect) => effect.particles.map((particle) => ({ effect, particle }))); if (particles.length > effectInstances.length) throw new RangeError(`Frame requires ${particles.length} effect particles but scene capacity is ${effectInstances.length}.`);
      for (let index = 0; index < effectInstances.length; index += 1) { const instance = effectInstances[index]!, transform = effectTransforms[index]!, item = particles[index]; if (!item) { scene.setInstanceVisible(instance, false); continue; } const material = requireMapValue(materialHandles, item.effect.materialId, `effect material ${item.effect.materialId}`).static; if (material === undefined) throw new Error(`Effect ${item.effect.id} material ${item.effect.materialId} has no static runtime form.`); if (item.effect.presentation === "billboard") scene.setInstanceMesh(instance, billboardMesh!); else { const mesh = declaration.meshes.find((candidate) => candidate.id === item.effect.meshId); if (!mesh || mesh.skin) throw new Error(`Effect ${item.effect.id} requires a static canonical mesh, received ${item.effect.meshId}.`); scene.setInstanceMesh(instance, requireMapValue(meshHandles, mesh.id, `effect mesh ${mesh.id}`)); } scene.setInstanceMaterial(instance, material);scene.setInstanceAppearance(instance, { color: item.particle.color, uvRect: item.particle.uvRect }); scene.transforms.setPosition(transform, ...item.particle.position); scene.transforms.setRotationQuaternion(transform, ...(item.effect.presentation === "billboard" && !item.particle.oriented ? faceCameraQuaternion(item.particle.position, frame.camera.position) : item.particle.rotation)); scene.transforms.setScale(transform, ...item.particle.scale); scene.setInstanceVisible(instance, true); }
      for (const light of frame.lights) scene.updateLight(requireMapValue(lightHandles, light.id, `3D frame light ${light.id}`), light);
      endpointApplication?.finish(frame);
      referenceGuard();
      } catch (error) { trsJournal?.invalidate();endpointApplication?.invalidateMaterialInputRevisions();throw error; }
    },
    viewProjectionForFrame(frame: Readonly<Hyperfocus3DEvaluatedFrame>, aspect: number) {
      if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("3D camera aspect must be positive and finite.");
      const projection = perspectiveMat4(new Float32Array(16), { fovYRadians: frame.camera.fovYRadians, aspect, near: frame.camera.near, far: frame.camera.far });
      const view = runtimeCameraView(new Float32Array(16), frame.camera, active.camera);
      return multiplyMat4(new Float32Array(16), projection, view);
    },
  });

  function samplePresentationPhysicalBody(ragdollId: string, boneId: string, frame: number): { position: [number, number, number]; velocity: [number, number, number] } | undefined {
    const source = presentationPhysicalPerformance, index = presentationPhysicalReferenceIndices.get(`ragdoll:${ragdollId}:${boneId}`);
    if (!source || index === undefined || frame < 0 || frame >= source.durationFrames) return undefined;
    source.writeFrame(frame, presentationPhysicalState);
    const offset = index * PHYSICAL_BODY_STATE_STRIDE_3D;
    return {
      position: [presentationPhysicalState[offset]!, presentationPhysicalState[offset + 1]!, presentationPhysicalState[offset + 2]!],
      velocity: [presentationPhysicalState[offset + 7]!, presentationPhysicalState[offset + 8]!, presentationPhysicalState[offset + 9]!],
    };
  }
}


function presentationEntityWorldPosition(
  physicalRoot: readonly [number, number, number],
  binding: { positionOffset: readonly [number, number, number]; rotationOffset: readonly [number, number, number, number] },
  entity: Hyperfocus3DEntity,
): [number, number, number] {
  const halfYaw = entity.rotationY * .5;
  const entityRotation = [0, sin(halfYaw), 0, cos(halfYaw)] as const;
  const inverseOffset = [-binding.rotationOffset[0], -binding.rotationOffset[1], -binding.rotationOffset[2], binding.rotationOffset[3]] as const;
  const stableBodyRotation = multiplyQuaternions(entityRotation, inverseOffset);
  const offset = rotateByQuaternion(stableBodyRotation, binding.positionOffset);
  return tuple3(physicalRoot[0] + offset[0], physicalRoot[1] + offset[1], physicalRoot[2] + offset[2]);
}

function worldPointToEntityLocal(point: readonly [number, number, number], entity: Hyperfocus3DEntity): [number, number, number] {
  const dx = point[0] - entity.position[0], dy = point[1] - entity.position[1], dz = point[2] - entity.position[2];
  const cosine = cos(entity.rotationY), sine = sin(entity.rotationY);
  return [cosine * dx - sine * dz, dy, sine * dx + cosine * dz];
}

function compileRuntimePhysicalPerformance3D(timeline: Readonly<Hyperfocus3DTimeline>, declaration: Readonly<Hyperfocus3DDeclaration>, skeletonBindings: ReadonlyMap<string, SkeletonBinding>, options?: { throughFrame?: number; checkpointIntervalFrames?: number; resumeFrom?: Readonly<PhysicalPerformanceResumePoint3D>; defer?: boolean }) {
  const physical = timeline.physicalPerformance; if (!physical) return undefined;
  const ragdollEntity = new Map<string, string>();
  for (const binding of physical.bindings) if ("ragdollId" in binding.reference) { const previous = ragdollEntity.get(binding.reference.ragdollId); if (previous && previous !== binding.entityId) throw new Error(`Ragdoll ${binding.reference.ragdollId} cannot drive both ${previous} and ${binding.entityId}.`); ragdollEntity.set(binding.reference.ragdollId, binding.entityId); }
  const rootMotionOffset = (entityId: string, frame: number) => {
    if (frame < 0) return undefined;
    const trackIndex = timeline.performanceTracks?.findIndex((track) => track.entityId === entityId) ?? -1, track = timeline.performanceTracks?.[trackIndex], segmentIndex = track?.segments.findIndex((segment) => frame >= segment.startFrame && frame < segment.startFrame + segment.durationFrames) ?? -1, segment = track?.segments[segmentIndex];
    if (!segment) return undefined;
    const binding = skeletonBindings.get(entityId); if (!binding) throw new Error(`Physical root motion requires rigged entity ${entityId}.`);
    const performance = sample3DPerformances(timeline, frame).find((item) => item.entityId === entityId), authority = performance?.rootMotion?.authority ?? performance?.blend?.rootMotion?.authority ?? "transform";
    if (!performance || authority !== "physical" || performance.rootMotion?.mode === "off") return undefined;
    const entityFrame = sample3DSceneEntities({ declaration, sceneId: timeline.sceneId, timeline, frame }).find((item) => item.id === entityId); if (!entityFrame) throw new Error(`Physical root motion references missing scene entity ${entityId}.`);
    const declarationRig = declaration.rigs!.find((item) => item.id === binding.rigId)!;
    return { offset: resolveRootMotion(binding, declarationRig, performance, entityFrame).worldOffset, sourceId: segment.id, pointer: `/extensions/hyperfocus3DVideo/performanceTracks/${trackIndex}/segments/${segmentIndex}/rootMotion/authority` };
  };
  const locomotionCues = physical.simulation.cues.filter((cue): cue is Extract<typeof cue, { kind: "locomotion" }> => cue.kind === "locomotion");
  const locomotionProfiles = createPhysicalLocomotionProfiles3D(locomotionCues, timeline.fps);
  const locomotionControllers = new Map<string, { controller: HumanoidMotionController; frame: number }>();
  const sampleProceduralLocomotion = (ragdollId: string, binding: SkeletonBinding, frame: number) => {
    const activeCue = locomotionCues.find((cue) => cue.ragdollId === ragdollId && frame >= cue.frame && frame < cue.frame + cue.durationFrames);
    if (!locomotionCues.some((cue) => cue.ragdollId === ragdollId)) return undefined;
    let sampler = locomotionControllers.get(ragdollId);
    if (!sampler) {
      if (!binding.semanticRig.capabilities.baseLocomotion || !binding.semanticRig.capabilities.leftArm || !binding.semanticRig.capabilities.rightArm || !binding.semanticRig.capabilities.leftLeg || !binding.semanticRig.capabilities.rightLeg) throw new Error(`Physical gait ${activeCue?.id ?? ragdollId} cannot procedurally pose rig ${binding.rigId}: map hips, both arms, both hands, both legs, and both feet, or select an analyzed locomotion clip.`);
      const entityId = ragdollEntity.get(ragdollId), authoredEntity = entityId ? declaration.scenes.find((scene) => scene.id === timeline.sceneId)?.entities.find((entity) => entity.id === entityId) : undefined;
      sampler = { controller: createHumanoidMotionController({ rig: binding.semanticRig, ...(authoredEntity ? { ground: presentationTerrainRaycastProvider(physical.simulation.bodies ?? [], authoredEntity) } : {}), motorOptions: presentationMotorOptions(locomotionProfiles.filter((profile) => profile.cue.ragdollId === ragdollId)) }), frame: -1 };
      locomotionControllers.set(ragdollId, sampler);
    }
    if (frame < sampler.frame) { sampler.controller.reset(); sampler.frame = -1; }
    while (sampler.frame < frame) {
      const nextFrame = sampler.frame + 1;
      const profile = locomotionProfiles.find((candidate) => candidate.cue.ragdollId === ragdollId && nextFrame >= candidate.cue.frame && nextFrame < candidate.cue.frame + candidate.cue.durationFrames), cue = profile?.cue;
      if (cue) sampler.controller.setLocomotionIntent({ direction: cue.direction, ...(cue.pace === undefined ? {} : { pace: cue.pace }), ...(cue.posture === undefined ? {} : { posture: cue.posture }), ...(cue.cycleDistanceScale === undefined ? {} : { cycleDistanceScale: cue.cycleDistanceScale }), speedMetersPerSecond: samplePhysicalLocomotionSpeed3D(profile!, (nextFrame + .5 - cue.frame) / cue.durationFrames) });
      else sampler.controller.setLocomotionIntent({ direction: [0, 0, 0], pace: "idle" });
      sampler.controller.update(1 / timeline.fps);
      sampler.frame = nextFrame;
    }
    return sampler.controller.state.pose;
  };
  const compiled = createPhysicalPerformanceCompiler3D({ performance: physical.simulation, checkpointIntervalFrames: options?.checkpointIntervalFrames, resumeFrom: options?.resumeFrom, rootMotionProvider({ frame, ragdollId }) {
    const entityId = ragdollEntity.get(ragdollId); if (!entityId) return undefined;
    const current = rootMotionOffset(entityId, frame); if (!current) return undefined;
    const previous = rootMotionOffset(entityId, frame - 1);
    return { delta: [current.offset[0] - (previous?.offset[0] ?? 0), current.offset[1] - (previous?.offset[1] ?? 0), current.offset[2] - (previous?.offset[2] ?? 0)], sourceId: current.sourceId, pointer: current.pointer };
  }, poseProvider({ frame, ragdollId, performance: requestedPerformance }) {
    const entityId = ragdollEntity.get(ragdollId); if (!entityId) return undefined;
    const ragdoll = physical.simulation.ragdolls.find((item) => item.id === ragdollId)!; if (ragdoll.motorPoseSource === "initial") return undefined;
    const binding = skeletonBindings.get(entityId); if (!binding) throw new Error(`Physical ragdoll ${ragdollId} requires rigged entity ${entityId}.`);
    const declarationRig = declaration.rigs!.find((item) => item.id === binding.rigId)!, performance = requestedPerformance ? { entityId, rigId: binding.rigId, clipId: requestedPerformance.clipId, timeSeconds: requestedPerformance.timeSeconds, sourceStartSeconds: requestedPerformance.timeSeconds, loop: requestedPerformance.loop } : sample3DPerformances(timeline, frame).find((item) => item.entityId === entityId), poseCorrections = sample3DPoseCorrections(timeline, frame).filter((item) => item.entityId === entityId), ikCorrections = sample3DIkCorrections(timeline, frame).filter((item) => item.entityId === entityId), proceduralPose = requestedPerformance ? undefined : sampleProceduralLocomotion(ragdollId, binding, frame);
    if (proceduralPose) {
      resetGltfPose(binding.rig, binding.poseA);
      binding.poseA.translations.set(proceduralPose.translations.subarray(0, binding.rig.nodeCount * 3));
      binding.poseA.rotations.set(proceduralPose.rotations.subarray(0, binding.rig.nodeCount * 4));
      binding.poseA.scales.set(proceduralPose.scales?.subarray(0, binding.rig.nodeCount * 3) ?? binding.rig.nodeScales);
      rebuildGltfPoseMatrices(binding.rig, binding.poseA);
      for (const cue of poseCorrections) applyPortablePoseCorrection(binding.rig, binding.poseA, cue, cue.weight);
      applyPortableIkCorrections(binding, ikCorrections);
    } else evaluatePortablePerformancePose(binding, declarationRig, performance, poseCorrections, ikCorrections);
    const count = ragdoll.joints.reduce((maximum, joint) => Math.max(maximum, joint.poseJointIndex + 1), 0), rotations = new Float64Array(count * 4);
    for (const joint of ragdoll.joints) { const node = binding.rig.nodeIds.indexOf(joint.childBoneId); if (node < 0) throw new Error(`Ragdoll ${ragdollId} joint ${joint.id} references stable bone ${joint.childBoneId}, which is missing from rig ${binding.rigId}.`); rotations.set(binding.poseA.rotations.subarray(node * 4, node * 4 + 4), joint.poseJointIndex * 4); }
    return { rotations };
  } });
  if (!options?.defer) { if (options?.throughFrame === undefined) compiled.ensureComplete(); else compiled.ensureFrame(options.throughFrame); }
  return compiled;
}

function evaluatePortablePerformancePose(binding: SkeletonBinding, declarationRig: NonNullable<Hyperfocus3DDeclaration["rigs"]>[number], performance: Hyperfocus3DEvaluatedFrame["performances"][number] | undefined, poseCorrections: readonly Hyperfocus3DEvaluatedFrame["poseCorrections"][number][], ikCorrections: readonly Hyperfocus3DEvaluatedFrame["ikCorrections"][number][]) {
  const current = performance ? declarationRig.clips.find((item) => item.id === performance.clipId) : declarationRig.clips[0]; if (!current) throw new Error(`Rig ${declarationRig.id} has no clip ${performance?.clipId ?? "for its default performance"}.`);
  resetGltfPose(binding.rig, binding.poseA);
  for (const cue of poseCorrections) if (cue.stage === "pre-animation") applyPortablePoseCorrection(binding.rig, binding.poseA, cue, cue.weight);
  applyGltfAnimationClip(binding.rig, current.animation, performance?.timeSeconds ?? 0, performance?.loop ?? true, binding.poseA);
  if (performance?.blend) {
    const previous = declarationRig.clips.find((item) => item.id === performance.blend!.clipId); if (!previous) throw new Error(`Rig ${binding.rigId} has no clip ${performance.blend.clipId}.`);
    resetGltfPose(binding.rig, binding.poseB); for (const cue of poseCorrections) if (cue.stage === "pre-animation") applyPortablePoseCorrection(binding.rig, binding.poseB, cue, cue.weight); applyGltfAnimationClip(binding.rig, previous.animation, performance.blend.timeSeconds, performance.blend.loop, binding.poseB); blendGltfPoses(binding.rig, binding.poseB, binding.poseA, performance.blend.weight, binding.poseA);
  }
  for (const cue of poseCorrections) if (cue.stage !== "pre-animation") applyPortablePoseCorrection(binding.rig, binding.poseA, cue, cue.weight);
  applyPortableIkCorrections(binding, ikCorrections); return current;
}

function measureRootMotion(binding: SkeletonBinding, declarationRig: NonNullable<Hyperfocus3DDeclaration["rigs"]>[number], sample: EvaluatedRootMotionSample): MeasuredRootMotion {
  const declaredClip = declarationRig.clips.find((clip) => clip.id === sample.clipId); if (!declaredClip) throw new Error(`Rig ${binding.rigId} has no root-motion clip ${sample.clipId}.`);
  const node = binding.rig.nodeIds.indexOf(sample.rootMotion.rootBoneId); if (node < 0) throw new Error(`Rig ${binding.rigId} has no stable root-motion bone ${sample.rootMotion.rootBoneId}.`);
  const clip = binding.rig.clips[declaredClip.animation]; if (!clip) throw new Error(`Rig ${binding.rigId} has no cooked root-motion animation ${declaredClip.animation}.`);
  const offset = node * 3;
  resetGltfPose(binding.rig, binding.rootPose); applyGltfAnimationClip(binding.rig, declaredClip.animation, sample.timeSeconds, sample.loop, binding.rootPose);
  const currentX = binding.rootPose.translations[offset]!, currentY = binding.rootPose.translations[offset + 1]!, currentZ = binding.rootPose.translations[offset + 2]!;
  resetGltfPose(binding.rig, binding.rootPose); applyGltfAnimationClip(binding.rig, declaredClip.animation, sample.sourceStartSeconds, sample.loop, binding.rootPose);
  const startX = binding.rootPose.translations[offset]!, startY = binding.rootPose.translations[offset + 1]!, startZ = binding.rootPose.translations[offset + 2]!;
  let dx = currentX - startX, dy = currentY - startY, dz = currentZ - startZ;
  if (sample.loop && sample.rootMotion.loopBoundary === "accumulate" && clip.duration > 0) {
    resetGltfPose(binding.rig, binding.rootPose); applyGltfAnimationClip(binding.rig, declaredClip.animation, 0, false, binding.rootPose);
    const cycleStartX = binding.rootPose.translations[offset]!, cycleStartY = binding.rootPose.translations[offset + 1]!, cycleStartZ = binding.rootPose.translations[offset + 2]!;
    resetGltfPose(binding.rig, binding.rootPose); applyGltfAnimationClip(binding.rig, declaredClip.animation, clip.duration, false, binding.rootPose);
    const cycles = Math.floor(sample.timeSeconds / clip.duration) - Math.floor(sample.sourceStartSeconds / clip.duration);
    dx += (binding.rootPose.translations[offset]! - cycleStartX) * cycles; dy += (binding.rootPose.translations[offset + 1]! - cycleStartY) * cycles; dz += (binding.rootPose.translations[offset + 2]! - cycleStartZ) * cycles;
  }
  if (sample.rootMotion.mode === "extract-xz") dy = 0;
  return { node, offset, displacement: [dx, dy, dz], inPlace: [startX, sample.rootMotion.mode === "extract-xyz" ? startY : currentY, startZ] };
}

function accumulatedRootMotion(binding: SkeletonBinding, declarationRig: NonNullable<Hyperfocus3DDeclaration["rigs"]>[number], sample: EvaluatedRootMotionSample): MeasuredRootMotion {
  const displacement: Vector3 = [0, 0, 0];
  for (const span of sample.rootMotion.carry ?? []) {
    const measured = measureRootMotion(binding, declarationRig, { ...span, rootMotion: span.rootMotion });
    displacement[0] += measured.displacement[0]; displacement[1] += measured.displacement[1]; displacement[2] += measured.displacement[2];
  }
  const measured = measureRootMotion(binding, declarationRig, sample);
  displacement[0] += measured.displacement[0]; displacement[1] += measured.displacement[1]; displacement[2] += measured.displacement[2];
  return { ...measured, displacement };
}

function resolveRootMotion(binding: SkeletonBinding, declarationRig: NonNullable<Hyperfocus3DDeclaration["rigs"]>[number], performance: Hyperfocus3DEvaluatedFrame["performances"][number], entityFrame: Hyperfocus3DEvaluatedFrame["entities"][number]): ResolvedRootMotion {
  const current = performance.rootMotion && performance.rootMotion.mode !== "off" ? accumulatedRootMotion(binding, declarationRig, { ...performance, rootMotion: performance.rootMotion }) : undefined;
  const previous = performance.blend?.rootMotion && performance.blend.rootMotion.mode !== "off" ? accumulatedRootMotion(binding, declarationRig, { ...performance.blend, rootMotion: performance.blend.rootMotion }) : undefined;
  if (!current && !previous) return { worldOffset: [0, 0, 0], authority: "transform" };
  const weight = performance.blend?.weight ?? 1, from = previous?.displacement ?? [0, 0, 0], to = current?.displacement ?? [0, 0, 0];
  const dx = from[0] + (to[0] - from[0]) * weight, dy = from[1] + (to[1] - from[1]) * weight, dz = from[2] + (to[2] - from[2]) * weight;
  const localX = dx * entityFrame.scale[0], localY = dy * entityFrame.scale[1], localZ = dz * entityFrame.scale[2], [qx, qy, qz, qw] = entityFrame.rotation, tx = 2 * (qy * localZ - qz * localY), ty = 2 * (qz * localX - qx * localZ), tz = 2 * (qx * localY - qy * localX);
  return { current, previous, authority: performance.rootMotion?.authority ?? performance.blend?.rootMotion?.authority ?? "transform", worldOffset: [localX + qw * tx + qy * tz - qz * ty, localY + qw * ty + qz * tx - qx * tz, localZ + qw * tz + qx * ty - qy * tx] };
}

function applyRootMotion(scene: BoundedScene3D, binding: SkeletonBinding, declarationRig: NonNullable<Hyperfocus3DDeclaration["rigs"]>[number], performance: Hyperfocus3DEvaluatedFrame["performances"][number], entityFrame: Hyperfocus3DEvaluatedFrame["entities"][number], transform: number) {
  const resolved = resolveRootMotion(binding, declarationRig, performance, entityFrame), { current, previous } = resolved;
  if (previous && current && previous.node === current.node) {
    const weight = performance.blend?.weight ?? 1;
    binding.poseA.translations[current.offset] = previous.inPlace[0] + (current.inPlace[0] - previous.inPlace[0]) * weight;
    binding.poseA.translations[current.offset + 1] = previous.inPlace[1] + (current.inPlace[1] - previous.inPlace[1]) * weight;
    binding.poseA.translations[current.offset + 2] = previous.inPlace[2] + (current.inPlace[2] - previous.inPlace[2]) * weight;
  } else {
    for (const extracted of [previous, current]) if (extracted) { binding.poseA.translations[extracted.offset] = extracted.inPlace[0]; binding.poseA.translations[extracted.offset + 1] = extracted.inPlace[1]; binding.poseA.translations[extracted.offset + 2] = extracted.inPlace[2]; }
  }
  if (resolved.authority === "physical" || performance.externalRoot) return;
  scene.transforms.setPosition(transform, entityFrame.position[0] + resolved.worldOffset[0], entityFrame.position[1] + resolved.worldOffset[1], entityFrame.position[2] + resolved.worldOffset[2]);
}

function applyPortablePoseCorrection(rig: CookedGltfRig, pose: GltfPoseOutput, cue: Hyperfocus3DEvaluatedFrame["poseCorrections"][number], weight: number) {
  const node = rig.nodeIds.indexOf(cue.boneId); if (node < 0) throw new Error(`Pose correction ${cue.id} references missing stable bone ${cue.boneId}.`);
  const amount = Math.max(0, Math.min(1, weight)), t = node * 3, r = node * 4;
  if (amount <= 1e-12) return;
  pose.translations[t] += cue.translation[0] * amount; pose.translations[t + 1] += cue.translation[1] * amount; pose.translations[t + 2] += cue.translation[2] * amount;
  const delta = quaternionFromEuler(cue.rotationEuler[0] * amount, cue.rotationEuler[1] * amount, cue.rotationEuler[2] * amount), ax = pose.rotations[r]!, ay = pose.rotations[r + 1]!, az = pose.rotations[r + 2]!, aw = pose.rotations[r + 3]!;
  if (cue.rotationSpace === "model") { if (hypot(delta[0], delta[1], delta[2]) > 1e-12) applyGltfModelRotationDelta(rig, pose, { nodeId: cue.boneId, rotation: delta }); return; }
  const x = aw * delta[0] + ax * delta[3] + ay * delta[2] - az * delta[1], y = aw * delta[1] - ax * delta[2] + ay * delta[3] + az * delta[0], z = aw * delta[2] + ax * delta[1] - ay * delta[0] + az * delta[3], w = aw * delta[3] - ax * delta[0] - ay * delta[1] - az * delta[2], inverse = 1 / Math.max(1e-12, hypot(x, y, z, w));
  pose.rotations[r] = x * inverse; pose.rotations[r + 1] = y * inverse; pose.rotations[r + 2] = z * inverse; pose.rotations[r + 3] = w * inverse;
}

function applyPortableIkCorrections(binding: SkeletonBinding, cues: readonly Hyperfocus3DEvaluatedFrame["ikCorrections"][number][]) {
  for (const cue of cues) {
    const rootIndex = binding.rig.nodeIds.indexOf(cue.rootBoneId), middleIndex = binding.rig.nodeIds.indexOf(cue.middleBoneId), endIndex = binding.rig.nodeIds.indexOf(cue.endBoneId);
    if (rootIndex < 0 || middleIndex < 0 || endIndex < 0) throw new Error(`IK ${cue.id} references a missing stable bone on rig ${binding.rigId}.`);
    if (!isAncestor(binding.rig.nodeParents, rootIndex, middleIndex) || !isAncestor(binding.rig.nodeParents, middleIndex, endIndex)) throw new Error(`IK ${cue.id} must use an ordered root Ã¢â€ â€™ middle Ã¢â€ â€™ end hierarchy.`);
    copyPoseTrs(binding.poseA, binding.poseB); const key = `${rootIndex}:${middleIndex}:${endIndex}:${cue.maxStretch}`; let solver = binding.ik.get(key); if (!solver) { solver = createPoseTwoBoneIKSolver({ rig: binding.semanticRig, rootIndex, middleIndex, endIndex, maxStretch: cue.maxStretch }); binding.ik.set(key, solver); }
    const solved = solver.apply(binding.poseView, cue.target, cue.pole, cue); if (cue.bendMode === "animated" && !solved.reached) throw new Error(`IK ${cue.id}: target is outside the animated limb reach. Adjust the target or body placement; contact was not satisfied.`); if (cue.weight < 1) blendGltfPoses(binding.rig, binding.poseB, binding.poseA, cue.weight, binding.poseA);
  }
}

function copyPoseTrs(source: GltfPoseOutput, target: GltfPoseOutput) { target.translations.set(source.translations); target.rotations.set(source.rotations); target.scales.set(source.scales); }
function isAncestor(parents: Int32Array, ancestor: number, child: number) { for (let node = child; node >= 0; node = parents[node]!) if (node === ancestor) return true; return false; }
function quaternionFromEuler(x: number, y: number, z: number): [number, number, number, number] { const cx = cos(x / 2), sx = sin(x / 2), cy = cos(y / 2), sy = sin(y / 2), cz = cos(z / 2), sz = sin(z / 2); return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz]; }

function worldPoseToEntityLocal(entity: Hyperfocus3DEvaluatedFrame["entities"][number], position: readonly [number, number, number], rotation: readonly [number, number, number, number]) {
  const inverse: [number, number, number, number] = [-entity.rotation[0], -entity.rotation[1], -entity.rotation[2], entity.rotation[3]];
  const delta = rotateByQuaternion(inverse, [position[0] - entity.position[0], position[1] - entity.position[1], position[2] - entity.position[2]]);
  const localRotation = multiplyQuaternions(inverse, rotation);
  return { position: tuple3(delta[0] / entity.scale[0], delta[1] / entity.scale[1], delta[2] / entity.scale[2]), rotation: localRotation };
}

function worldDirectionToEntityLocal(direction: readonly [number, number, number], rotationY: number): [number, number, number] {
  const cosine = cos(rotationY), sine = sin(rotationY);
  return [cosine * direction[0] - sine * direction[2], direction[1], sine * direction[0] + cosine * direction[2]];
}

function vectorComponent(value: Vec3Input, index: 0 | 1 | 2, key: "x" | "y" | "z") { return "x" in value && "y" in value && "z" in value ? Number(value[key]) : Number(value[index]); }

function physicalReferenceKey(reference: { bodyId: string } | { ragdollId: string; boneId: string }) { return "bodyId" in reference ? `body:${reference.bodyId}` : `ragdoll:${reference.ragdollId}:${reference.boneId}`; }

function physicalLocomotionProfiles(timeline: Readonly<Hyperfocus3DTimeline>) {
  const cues = timeline.physicalPerformance?.simulation.cues.filter((cue): cue is Extract<typeof cue, { kind: "locomotion" }> => cue.kind === "locomotion") ?? [];
  return createPhysicalLocomotionProfiles3D(cues, timeline.fps);
}

function presentationMotorOptions(profiles: readonly PhysicalLocomotionProfile3D[]) {
  const maximumSpeed = profiles.reduce((maximum, profile) => Math.max(maximum, profile.cue.peakSpeedMetersPerSecond), 0);
  // Physics has already authored the continuous speed envelope. The semantic
  // presentation controller follows that accepted sample exactly instead of
  // applying a second acceleration curve and drifting its stride phase.
  return { maxSpeed: Math.max(6, maximumSpeed), acceleration: 10_000, deceleration: 10_000 };
}

function samplePhysicalJumpAnticipation3D(
  cues: readonly PhysicalPerformanceCue3D[],
  ragdollId: string,
  frame: number,
  fps: number,
) {
  const anticipationFrames = Math.max(3, Math.round(fps * .24));
  const jump = cues.find((cue) => cue.kind === "jump" && cue.ragdollId === ragdollId && cue.frame >= frame && cue.frame - frame <= anticipationFrames);
  if (!jump) return 0;
  const progress = 1 - (jump.frame - frame) / anticipationFrames;
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function presentationTerrainRaycastProvider(bodies: readonly RigidBodyDefinition3D[], entity: Hyperfocus3DEntity): Physics3DRaycastProvider {
  const baseHeight = sampleStaticTerrainHeight3D(bodies, entity.position[0], entity.position[2]) ?? 0, cosine = cos(entity.rotationY), sine = sin(entity.rotationY), terrainHit = createStaticTerrainHit3D();
  const fallback: Physics3DRaycastHit = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 0 };
  return {
    raycast(origin: Vec3Input, direction: Vec3Input, options = {}, out = fallback) {
      const localX = vectorComponent(origin, 0, "x"), localY = vectorComponent(origin, 1, "y"), localZ = vectorComponent(origin, 2, "z");
      const directionX = vectorComponent(direction, 0, "x"), directionY = vectorComponent(direction, 1, "y"), directionZ = vectorComponent(direction, 2, "z"), directionLength = hypot(directionX, directionY, directionZ);
      if (directionLength <= 1e-12) throw new Error("3D ray direction must have non-zero length");
      const normalizedY = directionY / directionLength;
      if (Math.abs(directionX / directionLength) > 1e-6 || Math.abs(directionZ / directionLength) > 1e-6 || normalizedY >= -1e-8) return null;
      const worldX = entity.position[0] + cosine * localX + sine * localZ, worldZ = entity.position[2] - sine * localX + cosine * localZ, worldY = baseHeight + localY, maximumDistance = options.maxDistance === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Number(options.maxDistance));
      const hit = raycastStaticTerrainDown3D(bodies, worldX, worldY, worldZ, maximumDistance * -normalizedY, options.collisionMask, terrainHit);
      if (!hit?.body) return null;
      out.point.x = localX; out.point.y = hit.y - baseHeight; out.point.z = localZ; out.distance = (worldY - hit.y) / -normalizedY;
      out.normal.x = cosine * hit.normalX - sine * hit.normalZ; out.normal.y = hit.normalY; out.normal.z = sine * hit.normalX + cosine * hit.normalZ; out.collider = hit.body;
      return out;
    },
  };
}

function rotateByQuaternion(rotation: readonly [number, number, number, number], vector: readonly [number, number, number]): [number, number, number] { const [qx, qy, qz, qw] = rotation, [x, y, z] = vector, tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x); return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx]; }
function multiplyQuaternions(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): [number, number, number, number] { const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2], length = Math.max(1e-12, hypot(x, y, z, w)); return [x / length, y / length, z / length, w / length]; }

function applySocketAttachment(socket: Hyperfocus3DEvaluatedFrame["socketAttachments"][number], frame: Readonly<Hyperfocus3DEvaluatedFrame>, bindings: ReadonlyMap<string, { rig: CookedGltfRig; poseA: GltfPoseOutput }>, transforms: ReadonlyMap<string, number>, scene: BoundedScene3D) {
  const binding = bindings.get(socket.parentEntityId), parent = frame.entities.find((entity) => entity.id === socket.parentEntityId); if (!binding || !parent) throw new Error(`Socket ${socket.id} requires evaluated rigged parent ${socket.parentEntityId}.`);
  const node = binding.rig.nodeIds.indexOf(socket.boneId); if (node < 0) throw new Error(`Socket ${socket.id} references missing stable bone ${socket.boneId}.`);
  const parentMatrix = composeMat4FromTrs(new Float32Array(16), parent.position, parent.rotation, parent.scale), boneMatrix = binding.poseA.worldMatrices.subarray(node * 16, node * 16 + 16), socketMatrix = composeMat4FromTrs(new Float32Array(16), socket.position, quaternionFromEuler(...socket.rotationEuler), socket.scale), parentBone = multiplyMat4(new Float32Array(16), parentMatrix, boneMatrix), world = multiplyMat4(new Float32Array(16), parentBone, socketMatrix), transform = requireMapValue(transforms, socket.entityId, `3D socket entity ${socket.entityId}`), rotation = quaternionFromMatrix(world);
  scene.transforms.setPosition(transform, world[12]!, world[13]!, world[14]!); scene.transforms.setScale(transform, hypot(world[0]!, world[1]!, world[2]!), hypot(world[4]!, world[5]!, world[6]!), hypot(world[8]!, world[9]!, world[10]!)); scene.transforms.setRotationQuaternion(transform, ...rotation);
}

function quaternionFromMatrix(matrix: Float32Array): [number, number, number, number] { const sx = Math.max(1e-12, hypot(matrix[0]!, matrix[1]!, matrix[2]!)), sy = Math.max(1e-12, hypot(matrix[4]!, matrix[5]!, matrix[6]!)), sz = Math.max(1e-12, hypot(matrix[8]!, matrix[9]!, matrix[10]!)), m00 = matrix[0]! / sx, m01 = matrix[4]! / sy, m02 = matrix[8]! / sz, m10 = matrix[1]! / sx, m11 = matrix[5]! / sy, m12 = matrix[9]! / sz, m20 = matrix[2]! / sx, m21 = matrix[6]! / sy, m22 = matrix[10]! / sz, trace = m00 + m11 + m22; let x: number, y: number, z: number, w: number; if (trace > 0) { const s = sqrt(trace + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; } else if (m00 > m11 && m00 > m22) { const s = sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; } else if (m11 > m22) { const s = sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; } else { const s = sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; } return [x, y, z, w]; }

function validateSnapshot(value: Hyperfocus3DSnapshot, scene: Hyperfocus3DDeclaration["scenes"][number]) {
  if (!isHyperfocus3DSnapshot(value)) throw new Error("3D save snapshot contains invalid entity state.");
  if (!value || value.version !== 1 || value.sceneId !== scene.id || !Number.isSafeInteger(value.tick) || value.tick < 0 || !Array.isArray(value.entities) || value.entities.length !== scene.entities.length) throw new Error("3D save snapshot does not match the active scene.");
  const expected = new Set(scene.entities.map((item) => item.id));
  for (const item of value.entities) if (!expected.delete(item?.id) || !Array.isArray(item.position) || item.position.length !== 3 || item.position.some((part) => !Number.isFinite(part)) || !Number.isFinite(item.rotationY)) throw new Error("3D save snapshot contains invalid entity state.");
}

function copyVector3(value: readonly [number, number, number]): Vector3 {
  return [value[0], value[1], value[2]];
}

function faceCameraQuaternion(position: readonly number[], camera: readonly number[]): Vector4 {
  const x = camera[0]! - position[0]!, y = camera[1]! - position[1]!, z = camera[2]! - position[2]!, length = hypot(x, y, z);
  if (length < 1e-8) return [0, 0, 0, 1];
  const nx = x / length, ny = y / length, nz = z / length;
  if (nz < -0.999999) return [0, 1, 0, 0];
  const qx = -ny, qy = nx, qw = 1 + nz, inverse = 1 / hypot(qx, qy, qw);
  return [qx * inverse, qy * inverse, 0, qw * inverse];
}

function requireRigidBody(world: RigidWorld3D, handle: number, entityId: string) {
  const body = world.body(handle);
  if (!body) throw new Error(`3D rigid body ${entityId} is missing.`);
  return body;
}

function runtimeCameraPosition(camera: Hyperfocus3DScene['camera'], positions: ReadonlyMap<string, Vector3>): Vector3 {
  const targetEntity = camera.followEntityId ? positions.get(camera.followEntityId) : undefined;
  const offset = camera.followOffset ?? [0, 0, 0];
  return targetEntity
    ? [targetEntity[0] + offset[0], targetEntity[1] + offset[1], targetEntity[2] + offset[2]]
    : copyVector3(camera.position);
}

function createRuntimeFrameSampler(declaration: Hyperfocus3DDeclaration, positions: ReadonlyMap<string, Vector3>, rotations: ReadonlyMap<string, number>, poses: ReadonlyMap<string, [number, number, number, number]>, tick: () => number, onEntitySample?: Parameters<typeof sample3DFrame>[0]['onEntitySample'], journal?: EntityTrsValidationJournal3D, storage?: ReturnType<typeof createOwnedFrameStorage3D>): Hyperfocus3DRuntime['sampleFrame'] {
  // Synchronous sampler borrows this one pose until its next get; sample3DFrame copies it.
  const sampledPose: { position: Vector3; rotationY: number; rotation?: [number, number, number, number] } = { position: [0, 0, 0], rotationY: 0 };
  const get = (id: string) => {
    const position = positions.get(id);
    if (!position) return undefined;
    sampledPose.position = position;sampledPose.rotationY = rotations.get(id)!;sampledPose.rotation = poses.get(id);
    return sampledPose;
  };
  if(journal){
    const work=journal.samplingWork;
    const simulation={get(id:string){
      work.sourceLookups++;work.sourceMapGets++;
      const position=positions.get(id);if(!position)return undefined;
      work.sourceMapGets+=2;sampledPose.position=position;sampledPose.rotationY=rotations.get(id)!;sampledPose.rotation=poses.get(id);
      return sampledPose;
    }};
    return options=>sample3DFrameWithEntitySampling({...options,declaration,simulation,onEntitySample:undefined,clock:{kind:'simulation',tick:tick(),ticksPerSecond:60}},journal.entitySampling());
  }
  const simulation={get};
  return options => sample3DFrameWithEntitySampling({ ...options, declaration, simulation, onEntitySample, clock: { kind: 'simulation', tick: tick(), ticksPerSecond: 60 } }, undefined, storage);
}

function createRuntimeSnapshot(
  scene: Hyperfocus3DScene,
  tick: number,
  positions: ReadonlyMap<string, Vector3>,
  rotations: ReadonlyMap<string, number>,
  poses: ReadonlyMap<string, [number, number, number, number]>,
): Hyperfocus3DSnapshot {
  return {
    version: 1,
    sceneId: scene.id,
    tick,
    entities: scene.entities.map((entity) => ({
      id: entity.id,
      position: copyVector3(requireMapValue(positions, entity.id, `3D position ${entity.id}`)),
      rotationY: requireMapValue(rotations, entity.id, `3D rotation ${entity.id}`),
      ...(poses.has(entity.id) ? { rotation: tuple4(...poses.get(entity.id)!) } : {}),
    })),
  };
}

export { synthesizeWeaponAttacks } from './3d/combat-interaction/weapons/attacks.ts';
export { readPlayDefinition3D, validatePlayBindings3D, PLAY_PHASES, PLAY_EVENTS } from './3d/play/contracts.ts';
export type { PlayDefinition3D, PlayPhase, PlayEvent } from './3d/play/contracts.ts';
export { readCombatInteractions, type CombatInteractions } from './3d/combat-interaction/config.ts';
