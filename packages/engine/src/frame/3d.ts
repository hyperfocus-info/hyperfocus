import { clamp01 as clampUnit } from "@hyperfocus/utilities/math";
import { impactFramePreset3D, type ImpactFramePresetId3D, type ImpactFrameSource3D } from "../effects/impact-frames-3d.ts";
import { tuple3, tuple4 } from "../math/tuples.ts";
import { samplePhysicalPresentationRoot3D } from "../physics/performance/presentation-root-3d.ts";
import { PHYSICAL_BODY_STATE_STRIDE_3D, samplePhysicalCharacterState3D, type CompiledPhysicalPerformance3D, type PhysicalBodyReference3D, type PhysicalPerformance3D, type PhysicalPerformanceCue3D } from "../physics/physical-performance-3d.ts";
import { sampleStaticTerrainHeight3D } from "../physics/terrain/static-raycast.ts";
import type { Hyperfocus3DDeclaration } from "../project/runtime-3d.ts";
import { materialPreset3D, sampleMaterialTransition3D, type MaterialLook3D } from "../render/materials/3d-presets.ts";
import { applyEntityTracks, applyMotionTracks, copy3, eulerQuaternion, interpolate3, mix, recommended3DPoseBlendFrames, resolveContacts, rotationYQuaternion, sampleEntityPosition, smootherstep } from "./3d-capabilities.ts";
import { sample3DPhysicalInspection, type Hyperfocus3DPhysicalInspection, type Hyperfocus3DPhysicalInspectionSettings } from "./3d-physical-inspection.ts";
export { audit3DFrameCapabilities,recommended3DPerformanceBlendFrames,recommended3DPoseBlendFrames } from "./3d-capabilities.ts";

export { sample3DPhysicalInspection } from "./3d-physical-inspection.ts";
export type { Hyperfocus3DPhysicalInspection,Hyperfocus3DPhysicalInspectionSettings } from "./3d-physical-inspection.ts";

export const HYPERFOCUS_3D_FORMATIONS = ["altar", "orbit", "helix", "tunnel", "crown", "scatter", "phalanx", "wave", "singularity"] as const;
export type Hyperfocus3DFormation = (typeof HYPERFOCUS_3D_FORMATIONS)[number];
export type Hyperfocus3DVec3 = [number, number, number];
export type Hyperfocus3DRootMotionPolicy = {
  mode: "off" | "extract-xz" | "extract-xyz";
  /** Transform is the compatibility path; physical routes frame travel through the mapped active ragdoll and its collision world. */
  authority?: "transform" | "physical";
  loopBoundary: "reset" | "accumulate";
  /** Missing legacy values use the ordinary continuous handoff. Reset explicitly rebases; an incoming pose blend eases that rebase. */
  segmentBoundary?: "reset" | "accumulate";
  rootBoneId: string;
};
export type Hyperfocus3DEvaluatedRootMotionSpan = {
  clipId: string;
  sourceStartSeconds: number;
  timeSeconds: number;
  loop: boolean;
  rootMotion: Hyperfocus3DRootMotionPolicy;
};
export type Hyperfocus3DEvaluatedRootMotion = Hyperfocus3DRootMotionPolicy & {
  /** Completed contiguous spans needed to evaluate this absolute frame without playback history. */
  carry?: Hyperfocus3DEvaluatedRootMotionSpan[];
};

export type Hyperfocus3DRenderGraph = {
  tier: "gameplay" | "video-safe" | "cinematic";
  shadows: boolean;
  exposure: number;
  fog?: { color: [number, number, number]; density: number };
  bloom?: { strength: number; radius: number; threshold: number };
  vignette?: number;
  grain?: { amount: number; seed: number };
  transition?: { color: [number, number, number]; alpha: number };
  impactFrame?: Hyperfocus3DEvaluatedImpactFrame;
};

export type Hyperfocus3DImpactFrameCue = {
  id: string;
  preset: ImpactFramePresetId3D;
  startFrame: number;
  durationFrames: number;
  intensity: number;
  seed: number;
  center: [number, number];
  freezeSource: boolean;
  background?: string;
  foreground?: string;
  accent?: string;
  threshold?: number;
  edgeStrength?: number;
  lineDensity?: number;
  textureId?: string;
  /** When set, presentation starts on the collision-derived frame instead of startFrame. */
  contactId?: string;
  /** Non-negative presentation offset from the exact solved contact. */
  contactOffsetFrames?: number;
};

export type Hyperfocus3DMotionSegment = {
  id: string;
  startFrame: number;
  durationFrames: number;
  origin: Hyperfocus3DVec3;
  velocity: Hyperfocus3DVec3;
  acceleration: Hyperfocus3DVec3;
  rotationEuler: Hyperfocus3DVec3;
  angularVelocity: Hyperfocus3DVec3;
  state: "grounded" | "airborne";
  cause?: "jump" | "impact" | "fall";
  groundY: number;
};

export type Hyperfocus3DContactCue = {
  id: string;
  attackerEntityId: string;
  targetEntityId: string;
  searchStartFrame: number;
  searchDurationFrames: number;
  attackerOffset: Hyperfocus3DVec3;
  targetOffset: Hyperfocus3DVec3;
  attackerRadius: number;
  targetRadius: number;
  /** Deterministic camera recoil beginning on the solved collision frame. */
  cameraShake?: number;
  cameraShakeFrames?: number;
};

export type Hyperfocus3DContactResponse = {
  id: string;
  contactId: string;
  offsetFrames: number;
  cameraShake: number;
  cameraShakeFrames: number;
  audioAssetId?: string;
  gain: number;
  pan: number;
};

export type Hyperfocus3DPhysicalBinding = {
  reference: PhysicalBodyReference3D;
  entityId: string;
  /** First frame on which simulation owns this render target. */
  startFrame?: number;
  /** Omit boneId to drive the scene entity transform; provide it to drive one stable rig bone. */
  boneId?: string;
  positionOffset: Hyperfocus3DVec3;
  rotationOffset: [number, number, number, number];
};

/** Canonical static art driven by a simulated body and revealed by the first break in its assembly. */
export type Hyperfocus3DPhysicalFragmentBinding = {
  id: string;
  reference: PhysicalBodyReference3D;
  breakGroupId: string;
  meshId: string;
  materialId: string;
  scale: Hyperfocus3DVec3;
  positionOffset: Hyperfocus3DVec3;
  rotationOffset: [number, number, number, number];
};

export type Hyperfocus3DEvaluatedImpactFrame = {
  id: string;
  preset: ImpactFramePresetId3D;
  source: ImpactFrameSource3D;
  localFrame: number;
  durationFrames: number;
  intensity: number;
  seed: number;
  center: [number, number];
  freezeSource: boolean;
  background: string;
  foreground: string;
  accent: string;
  threshold: number;
  edgeStrength: number;
  lineDensity: number;
  slashAngle: number;
  chromaticOffset: number;
  textureId?: string;
};

export type Hyperfocus3DTimeline = {
  version: 2;
  sceneId: string;
  durationFrames: number;
  fps: number;
  background: string;
  groups: Array<{ id: string; entityIds: string[] }>;
  materialTracks: Array<{ materialId: string; transitions: Array<{ startFrame: number; durationFrames: number; toPreset: string }> }>;
  /** Named skeletal performances. Segments are editable, non-overlapping video-time ranges. */
  performanceTracks?: Array<{
    entityId: string;
    rigId: string;
    segments: Array<{
      id: string;
      startFrame: number;
      durationFrames: number;
      clipId: string;
      sourceStartSeconds: number;
      speed: number;
      loop: boolean;
      blendFrames: number;
      /** Incoming clip edge. Missing remains compatible with older timelines; adjacent missing edges are treated as blends for preflight. */
      transition?: "blend" | "cut";
      rootMotion?: Hyperfocus3DRootMotionPolicy;
    }>;
  }>;
  /** Exact-frame world-space blocking for performers, props, and practical effects. */
  entityTracks?: Array<{
    entityId: string;
    keyframes: Array<{
      id: string;
      frame: number;
      position: Hyperfocus3DVec3;
      rotationEuler: Hyperfocus3DVec3;
      scale: Hyperfocus3DVec3;
      visible: boolean;
      variantId?: string;
      interpolation: "hold" | "linear" | "smooth";
    }>;
  }>;
  /** Deterministic physically parameterized movement. Active segments override blocking keys. */
  motionTracks?: Array<{ entityId: string; segments: Hyperfocus3DMotionSegment[] }>;
  /** Shared rigid/ragdoll simulation intent plus mappings back to canonical scene entities and stable bones. */
  physicalPerformance?: { simulation: PhysicalPerformance3D; bindings: Hyperfocus3DPhysicalBinding[]; fragments?: Hyperfocus3DPhysicalFragmentBinding[] };
  /** Portable editor-review preference. Sampling is deterministic; delivery renderers never draw diagnostics. */
  physicalInspection?: Hyperfocus3DPhysicalInspectionSettings;
  /** Contacts are resolved from the two sampled trajectories, never hand-timed presentation guesses. */
  contacts?: Hyperfocus3DContactCue[];
  /** Exact physical/trajectory-contact consumers for camera recoil and declared audio. */
  contactResponses?: Hyperfocus3DContactResponse[];
  /** Editable bone offsets. Pre layers run before clip channels; post and weighted layers run after blending. */
  poseCorrections?: Array<{ id: string; entityId: string; boneId: string; startFrame: number; durationFrames: number; stage: "pre-animation" | "post-animation" | "weighted-layer"; weight: number; translation: Hyperfocus3DVec3; rotationEuler: Hyperfocus3DVec3; /** Local preserves legacy bone-axis deltas; model uses canonical character axes across different bind orientations. */ rotationSpace?: "local" | "model"; transition?: "blend" | "cut"; blendInFrames?: number; blendOutFrames?: number; interpolation?: "linear" | "smooth" }>;
  /** Portable post-animation two-bone constraints. Targets and poles are entity-local; optional trajectory points are sampled smoothly through contact. */
  ikCorrections?: Array<{ bendMode?: "authored" | "animated"; targetMode?: "absolute" | "animated-offset"; endOrientation?: "follow-chain" | "preserve-animation"; id: string; entityId: string; startFrame: number; durationFrames: number; rootBoneId: string; middleBoneId: string; endBoneId: string; targetFrom?: Hyperfocus3DVec3; target: Hyperfocus3DVec3; targetTo?: Hyperfocus3DVec3; strikeStartFrame?: number; contactFrame?: number; followThroughFrame?: number; contactVelocity?: Hyperfocus3DVec3; poleFrom?: Hyperfocus3DVec3; pole: Hyperfocus3DVec3; poleTo?: Hyperfocus3DVec3; weight: number; maxStretch: number; transition?: "blend" | "cut"; blendInFrames?: number; blendOutFrames?: number; interpolation?: "linear" | "smooth" | "momentum" }>;
  /** Timeline prop attachments to stable bones. The attached entity remains an ordinary scene entity. */
  socketAttachments?: Array<{ id: string; entityId: string; parentEntityId: string; boneId: string; startFrame: number; durationFrames: number; position: Hyperfocus3DVec3; rotationEuler: Hyperfocus3DVec3; scale: Hyperfocus3DVec3 }>;
  /** Exact physical seam-break consumers. Variants reference canonical scene resources; audio references declared portable assets. */
  breakResponses?: Array<{ id: string; breakId?: string; breakGroupId?: string; entityId: string; variantId?: string; visibility: "keep" | "show" | "hide"; audioAssetId?: string; gain: number; pan: number }>;
  /** Deterministic absolute-frame effects rendered as camera-facing quads or canonical scene meshes. */
  effectCues?: Array<{ id: string; kind: "aura" | "trail" | "sparks" | "smoke" | "debris" | "shockwave"; startFrame: number; durationFrames: number; targetEntityId?: string; targetBoneId?: string; contactId?: string; contactOffsetFrames?: number; breakId?: string; breakGroupId?: string; space?: "world" | "local"; presentation?: "billboard" | "model"; meshId?: string; materialId: string; count: number; seed: number; radius: number; speed: number; size: number; emissionMode?: "burst" | "continuous"; emissionDirection?: Hyperfocus3DVec3; emissionSpreadDegrees?: number }>;
  /** Exact presentation overrides for one-to-eight frame graphic accents or custom still art. */
  impactFrames?: Hyperfocus3DImpactFrameCue[];
  shots: Hyperfocus3DShot[];
};

export type Hyperfocus3DShot = {
  id: string;
  startFrame: number;
  durationFrames: number;
  camera: {
    positionFrom: Hyperfocus3DVec3;
    positionTo: Hyperfocus3DVec3;
    targetFrom: Hyperfocus3DVec3;
    targetTo: Hyperfocus3DVec3;
    fovFrom: number;
    fovTo: number;
    rollFrom?: number;
    rollTo?: number;
    shake?: number;
  };
  formations: Array<{
    groupId: string;
    preset: Hyperfocus3DFormation;
    radius: number;
    depth: number;
    spread: number;
    height: number;
    scale: number;
    spinTurns: number;
    travel: number;
    phase?: number;
  }>;
  lighting: {
    ambientLightId: string;
    ambientColor: string;
    ambientIntensity: number;
    keyLightId: string;
    keyColor: string;
    keyIntensity: number;
    keyPosition: Hyperfocus3DVec3;
    rimLightId?: string;
    rimColor: string;
    rimIntensity: number;
    rimPosition: Hyperfocus3DVec3;
  };
  post: {
    exposure: number;
    bloomStrength: number;
    bloomRadius: number;
    bloomThreshold: number;
    fogDensity: number;
    vignette: number;
    grain: number;
  };
  transition?: { kind: "cut" | "flash" | "fade-black" | "whip"; frames: number; color?: string };
  overlay?: { eyebrow?: string; title?: string; align?: "left" | "center" | "right" };
};

export type Hyperfocus3DEvaluatedFrame = {
  sceneId: string;
  frameIndex: number;
  timeSeconds: number;
  tick: number;
  deterministicSeed: number;
  camera: { position: Hyperfocus3DVec3; target: Hyperfocus3DVec3; up: Hyperfocus3DVec3; fovYRadians: number; near: number; far: number };
  entities: Array<{ id: string; position: Hyperfocus3DVec3; rotation: [number, number, number, number]; scale: Hyperfocus3DVec3; visible: boolean; variantId?: string; /** Presentation-only existing material; omitted frames restore the authored/variant material. */ renderMaterialId?: string }>;
  materials: Array<{ id: string; look: MaterialLook3D }>;
  performances: Array<{
    entityId: string;
    rigId: string;
    clipId: string;
    timeSeconds: number;
    sourceStartSeconds: number;
    loop: boolean;
    rootMotion?: Hyperfocus3DEvaluatedRootMotion;
    /** A gameplay motor owns world travel. Strip authored root travel without adding it to the entity. */
    externalRoot?: boolean;
    blend?: { clipId: string; timeSeconds: number; sourceStartSeconds: number; loop: boolean; weight: number; rootMotion?: Hyperfocus3DEvaluatedRootMotion };
  }>;
  poseCorrections: NonNullable<Hyperfocus3DTimeline["poseCorrections"]>;
  ikCorrections: NonNullable<Hyperfocus3DTimeline["ikCorrections"]>;
  socketAttachments: NonNullable<Hyperfocus3DTimeline["socketAttachments"]>;
  contacts: Array<{ id: string; frame: number; point: Hyperfocus3DVec3; distance: number; subframe?: number; normal?: Hyperfocus3DVec3 }>;
  physicalBodies: Array<{ entityId: string; boneId: string; position: Hyperfocus3DVec3; rotation: [number, number, number, number] }>;
  physicalBreaks: Array<{ id: string; groupId?: string; frame: number; point: Hyperfocus3DVec3; subframe: number }>;
  physicalInspection?: Hyperfocus3DPhysicalInspection;
  audioEvents: Array<{ id: string; assetId: string; frame: number; subframe: number; point: Hyperfocus3DVec3; gain: number; pan: number }>;
  effects: Array<{ id: string; kind: NonNullable<Hyperfocus3DTimeline["effectCues"]>[number]["kind"]; presentation: "billboard" | "model"; meshId?: string; materialId: string; particles: Array<{ id: string; position: Hyperfocus3DVec3; rotation: [number, number, number, number]; scale: Hyperfocus3DVec3; color?: [number, number, number, number]; uvRect?: [number, number, number, number]; oriented?: boolean }> }>;
  lights: Array<{ id: string; kind: "ambient" | "directional" | "point" | "spot"; color: Hyperfocus3DVec3; intensity: number; position?: Hyperfocus3DVec3; direction?: Hyperfocus3DVec3; range?: number }>;
  renderGraph: Hyperfocus3DRenderGraph;
  overlay?: Hyperfocus3DShot["overlay"];
  shotId?: string;
  localProgress: number;
};

export type Hyperfocus3DFrameClock =
  | { kind: "simulation"; tick: number; ticksPerSecond: number }
  | { kind: "video"; frameIndex: number; fps: number };

export type Hyperfocus3DFrameDiagnostic = {
  severity: "error";
  code: string;
  pointer: string;
  feature: string;
  boundary: "timeline" | "runtime" | "renderer" | "export";
  message: string;
  alternative?: string;
};

/** Canonical project → scene → timeline frame evaluation used by play, preview and export. */
export function sample3DFrame(options: {
  declaration: Readonly<Hyperfocus3DDeclaration>;
  clock: Hyperfocus3DFrameClock;
  viewport: { width: number; height: number };
  timeline?: Readonly<Hyperfocus3DTimeline>;
  simulation?: Pick<ReadonlyMap<string, { position: Hyperfocus3DVec3; rotationY: number; rotation?: readonly [number, number, number, number] }>, 'get'>;
  physicalPerformance?: Readonly<CompiledPhysicalPerformance3D>;
  /** Internal synchronous sampler sink; observes fresh base records before timeline writers. */
  onEntitySample?: (index: number, entity: Hyperfocus3DEvaluatedFrame['entities'][number]) => void;
}): Hyperfocus3DEvaluatedFrame {
  return sample3DFrameWithEntitySampling(options);
}

/** Internal runtime sampler owner; not re-exported from the public runtime API. */
export function sample3DFrameWithEntitySampling(options: Parameters<typeof sample3DFrame>[0], entitySampling?: import('./entity-sampling-3d.ts').EntitySamplingOwner3D, storage?: ReturnType<typeof import('./owned-storage-3d.ts').createOwnedFrameStorage3D>): Hyperfocus3DEvaluatedFrame {
  const { declaration, clock, timeline } = options;
  if (!(options.viewport.width > 0) || !(options.viewport.height > 0)) throw new RangeError("3D frame viewport must be positive.");
  const timeSeconds = clock.kind === "video" ? clock.frameIndex / clock.fps : clock.tick / clock.ticksPerSecond;
  const frameIndex = timeline ? Math.max(0, Math.min(timeline.durationFrames - 1, clock.kind === "video" ? clock.frameIndex : Math.floor(timeSeconds * timeline.fps))) : Math.max(0, Math.floor(timeSeconds * 60));
  const physicalSource = requirePhysicalSource(timeline, options.physicalPerformance);
  const contacts = [...resolveContacts(declaration, timeline, frameIndex), ...resolvedPhysicalContacts(physicalSource, frameIndex)];
  const impactFrame = sampleImpactFrame(timeline, frameIndex, contacts);
  const sourceFrameIndex = impactFrame && timeline?.impactFrames?.find((cue) => cue.id === impactFrame.id)?.freezeSource ? frameIndex - impactFrame.localFrame : frameIndex;
  const sceneId = timeline?.sceneId ?? declaration.activeSceneId;
  const scene = declaration.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error(`Canonical 3D scene does not exist: ${sceneId}.`);
  if (storage && (timeline || options.physicalPerformance)) { storage.work.fallbackSamples++;storage = undefined; }
  storage?.begin(scene.entities.length, declaration.materials.length);
  const shot = timeline ? shotAt(timeline, sourceFrameIndex) : undefined;
  const localFrame = shot ? sourceFrameIndex - shot.startFrame : 0;
  const progress = shot ? (shot.durationFrames <= 1 ? 1 : localFrame / (shot.durationFrames - 1)) : 0;
  const eased = smootherstep(progress);
  const followed = scene.camera.followEntityId ? options.simulation?.get(scene.camera.followEntityId)?.position ?? scene.entities.find((entity) => entity.id === scene.camera.followEntityId)?.position : undefined;
  const camera = sampleCamera(scene.camera, shot, localFrame, progress, eased, followed, sourceFrameIndex, contacts, timeline?.contacts, timeline?.contactResponses);
  const entities = storage ? storage.entities : sampleSceneEntities({ declaration, sceneId, timeline, frame: sourceFrameIndex, simulation: options.simulation, onEntitySample: options.onEntitySample }, entitySampling);
  if (storage) for (let index = 0; index < scene.entities.length; index++) storage.sampleEntity(scene.entities[index]!, index, options.simulation?.get(scene.entities[index]!.id));
  const physicalBreaks = resolvedPhysicalBreaks(physicalSource, sourceFrameIndex);
  const physical = samplePhysicalBodies(timeline, physicalSource, entities, sourceFrameIndex, physicalBreaks);
  const physicalInspection = sample3DPhysicalInspection(timeline, physicalSource, sourceFrameIndex);
  if (timeline) applyBreakResponses(entities, timeline, physicalBreaks);
  const materials = storage ? storage.materials : declaration.materials.map((material) => ({ id: material.id, look: sampleMaterial(material, timeline, sourceFrameIndex) }));
  if (storage) for (let index = 0; index < declaration.materials.length; index++) { const material = declaration.materials[index]!;storage.sampleMaterial(material, index, () => sampleMaterial(material, undefined, sourceFrameIndex)); }
  const performances = sample3DPerformances(timeline, sourceFrameIndex);
  const poseCorrections = sample3DPoseCorrections(timeline, sourceFrameIndex), ikCorrections = sample3DIkCorrections(timeline, sourceFrameIndex), socketAttachments = activeCues(timeline?.socketAttachments, sourceFrameIndex);
  const effects = [...physical.fragments, ...sampleEffects(declaration, timeline, entities, physical.bones, physicalSource, sourceFrameIndex, contacts, physicalBreaks)];
  const audioEvents = [...sampleContactAudioEvents(timeline, sourceFrameIndex, contacts), ...sampleBreakAudioEvents(timeline, sourceFrameIndex, physicalBreaks)];
  const lights = scene.lights.map((light) => ({ ...light, color: copy3(light.color), ...(light.position ? { position: copy3(light.position) } : {}), ...(light.direction ? { direction: copy3(light.direction) } : {}) }));
  if (shot) applyLighting(lights, shot, camera.target);
  return {
    sceneId, frameIndex, timeSeconds,
    tick: clock.kind === "simulation" ? clock.tick : Math.floor(timeSeconds * 60),
    deterministicSeed: hash(`${sceneId}:${frameIndex}`), camera, entities, materials, performances, poseCorrections, ikCorrections, socketAttachments, contacts, physicalBodies: physical.bones, physicalBreaks, ...(physicalInspection ? { physicalInspection } : {}), audioEvents, effects, lights,
    renderGraph: renderGraph(shot, frameIndex, localFrame, progress, impactFrame),
    ...(shot?.overlay ? { overlay: structuredClone(shot.overlay) } : {}),
    ...(shot ? { shotId: shot.id } : {}), localProgress: progress,
  };
}

/** Canonical pre-physics entity evaluation shared by frame sampling and physical root-motion compilation. */
export function sample3DSceneEntities(options: {
  declaration: Readonly<Hyperfocus3DDeclaration>;
  sceneId: string;
  frame: number;
  timeline?: Readonly<Hyperfocus3DTimeline>;
  simulation?: Pick<ReadonlyMap<string, { position: Hyperfocus3DVec3; rotationY: number; rotation?: readonly [number, number, number, number] }>, 'get'>;
  onEntitySample?: (index: number, entity: Hyperfocus3DEvaluatedFrame['entities'][number]) => void;
}): Hyperfocus3DEvaluatedFrame["entities"] {
  return sampleSceneEntities(options);
}

function sampleSceneEntities(options: Parameters<typeof sample3DSceneEntities>[0], entitySampling?: import('./entity-sampling-3d.ts').EntitySamplingOwner3D): Hyperfocus3DEvaluatedFrame['entities'] {
  const scene = options.declaration.scenes.find((item) => item.id === options.sceneId);
  if (!scene) throw new Error(`Canonical 3D scene does not exist: ${options.sceneId}.`);
  const original = (entity: typeof scene.entities[number]): Hyperfocus3DEvaluatedFrame['entities'][number] => {
    const simulated = options.simulation?.get(entity.id);
    return copySampledEntity(entity, simulated);
  };
  const counted = entitySampling ? (entity: typeof scene.entities[number]) => {
    const simulated = options.simulation?.get(entity.id), work = entitySampling.work;
    work.recordAllocations++;work.vectorAllocations += 3;work.scalarWrites += 10;
    work.scalarCopies += simulated?.rotation ? 10 : 6;
    if (!simulated?.rotation) { work.yawQuaternionComputations++;work.trigCalls += 2; }
    return copySampledEntity(entity, simulated);
  } : original;
  const sample = entitySampling ? (entity: typeof scene.entities[number], index: number) => entitySampling.sample(entity, index, counted) : original;
  const observe = options.onEntitySample;
  const entities = scene.entities.map(observe ? (entity, index) => { const result = sample(entity,index);observe(index, result);return result; } : sample);
  const shot = options.timeline ? shotAt(options.timeline, options.frame) : undefined;
  if (options.timeline && shot) { const local = options.frame - shot.startFrame, progress = shot.durationFrames <= 1 ? 1 : local / (shot.durationFrames - 1); applyFormations(entities, options.timeline, shot, progress); }
  if (options.timeline) { applyEntityTracks(entities, options.timeline, options.frame); applyMotionTracks(entities, options.timeline, options.frame); }
  return entities;
}

function copySampledEntity(entity: import('./entity-sampling-3d.ts').AuthoredSampleEntity3D,
  simulated?: { position: Hyperfocus3DVec3; rotationY: number; rotation?: readonly [number, number, number, number] }): Hyperfocus3DEvaluatedFrame['entities'][number] {
  return { id: entity.id, position: copy3(simulated?.position ?? entity.position), rotation: simulated?.rotation ? [...simulated.rotation] : rotationYQuaternion(simulated?.rotationY ?? entity.rotationY), scale: copy3(entity.scale), visible: true };
}

function requirePhysicalSource(timeline: Readonly<Hyperfocus3DTimeline> | undefined, source: Readonly<CompiledPhysicalPerformance3D> | undefined) {
  if (!timeline?.physicalPerformance) {
    if (source) throw new Error("A compiled physical performance was supplied without timeline physicalPerformance data.");
    return undefined;
  }
  if (!source) throw new Error("Timeline physicalPerformance must be compiled once and supplied to sample3DFrame.");
  if (source.frameRate !== timeline.fps) throw new Error(`Compiled physical performance uses ${source.frameRate} FPS; timeline uses ${timeline.fps} FPS.`);
  if (source.durationFrames !== timeline.durationFrames) throw new Error(`Compiled physical performance has ${source.durationFrames} frames; timeline has ${timeline.durationFrames}.`);
  return source;
}

function resolvedPhysicalContacts(source: Readonly<CompiledPhysicalPerformance3D> | undefined, throughFrame: number): Hyperfocus3DEvaluatedFrame["contacts"] {
  if (!source) return [];
  return source.contacts.filter((event) => event.frame <= throughFrame).map((event) => ({ id: event.cueId, frame: event.frame, subframe: event.subframe, point: copy3(event.point), normal: copy3(event.normal), distance: 0 }));
}

function resolvedPhysicalBreaks(source: Readonly<CompiledPhysicalPerformance3D> | undefined, throughFrame: number): Hyperfocus3DEvaluatedFrame["physicalBreaks"] {
  if (!source) return [];
  return source.breaks.filter((event) => event.frame <= throughFrame).map((event) => ({ id: event.constraintId, ...(event.groupId ? { groupId: event.groupId } : {}), frame: event.frame, subframe: event.subframe, point: copy3(event.point) }));
}

function samplePhysicalBodies(timeline: Readonly<Hyperfocus3DTimeline> | undefined, source: Readonly<CompiledPhysicalPerformance3D> | undefined, entities: Hyperfocus3DEvaluatedFrame["entities"], frame: number, breaks: Hyperfocus3DEvaluatedFrame["physicalBreaks"]) {
  const bones: Hyperfocus3DEvaluatedFrame["physicalBodies"] = [], fragments: Hyperfocus3DEvaluatedFrame["effects"] = [];
  if (!timeline?.physicalPerformance || !source) return { bones, fragments };
  const state = new Float32Array(source.frameStride); source.writeFrame(frame, state);
  const entityById = new Map(entities.map((entity) => [entity.id, entity])), referenceIndices = new Map(source.bodyReferences.map((reference, index) => [referenceKey(reference), index]));
  const proceduralLocomotion = new Set(timeline.physicalPerformance.simulation.cues.filter((cue): cue is Extract<PhysicalPerformanceCue3D, { kind: "locomotion" }> => cue.kind === "locomotion" && !!cue.pace).map((cue) => cue.ragdollId));
  const sampleReference = (reference: PhysicalBodyReference3D, label: string) => {
    const index = referenceIndices.get(referenceKey(reference));
    if (index === undefined) throw new Error(`${label} references a body that is not present in compiled output.`);
    const offset = index * PHYSICAL_BODY_STATE_STRIDE_3D;
    return { position: tuple3(state[offset]!, state[offset + 1]!, state[offset + 2]!), rotation: tuple4(state[offset + 3]!, state[offset + 4]!, state[offset + 5]!, state[offset + 6]!) };
  };
  for (const binding of timeline.physicalPerformance.bindings) {
    if (frame < (binding.startFrame ?? 0)) continue;
    const { position, rotation } = sampleReference(binding.reference, `Physical binding for ${binding.entityId}${binding.boneId ? `/${binding.boneId}` : ""}`);
    const presentationPose = "ragdollId" in binding.reference
      && proceduralLocomotion.has(binding.reference.ragdollId)
      && samplePhysicalCharacterState3D(source, binding.reference.ragdollId, frame)?.authority === "ready";
    // During ready locomotion, physics owns accepted root travel while the
    // smooth semantic pose owns the visible skeleton. Solver bodies remain
    // authoritative for contacts and immediately take over on impact/downing.
    if (presentationPose && binding.boneId) continue;
    if (presentationPose) {
      if (!("ragdollId" in binding.reference)) throw new Error(`Procedural presentation for ${binding.entityId} requires a ragdoll root reference.`);
      const ragdollReference = binding.reference;
      const entity = entityById.get(binding.entityId); if (!entity) throw new Error(`Physical binding references missing evaluated entity ${binding.entityId}.`);
      const stableRootRotation = multiplyQuaternion(entity.rotation, inverseQuaternion(binding.rotationOffset));
      const rawEntityPosition = composePhysicalTarget(position, stableRootRotation, binding.positionOffset, binding.rotationOffset).position;
      const authoredGround = sampleStaticTerrainHeight3D(timeline.physicalPerformance.simulation.bodies ?? [], entity.position[0], entity.position[2]);
      const activeLocomotion = timeline.physicalPerformance.simulation.cues.some((cue) => cue.kind === "locomotion" && cue.ragdollId === ragdollReference.ragdollId && frame >= cue.frame && frame < cue.frame + cue.durationFrames);
      const latestJumpFrame = timeline.physicalPerformance.simulation.cues.reduce((latest, cue) => cue.kind === "jump" && cue.ragdollId === ragdollReference.ragdollId && cue.frame <= frame ? Math.max(latest, cue.frame) : latest, -1);
      const latestGroundedFrame = source.characterStateEvents.reduce((latest, event) => event.ragdollId === ragdollReference.ragdollId && event.locomotion === "grounded" && event.frame <= frame ? Math.max(latest, event.frame) : latest, -1);
      entity.position = samplePhysicalPresentationRoot3D({
        bodies: timeline.physicalPerformance.simulation.bodies ?? [],
        source,
        ragdollId: ragdollReference.ragdollId,
        rootReferenceIndex: referenceIndices.get(referenceKey(ragdollReference))!,
        frame,
        physicalRootPosition: position,
        rawEntityPosition,
        groundOffsetY: authoredGround === undefined ? 0 : entity.position[1] - authoredGround,
        supportAirborne: activeLocomotion && latestJumpFrame <= latestGroundedFrame,
      });
      continue;
    }
    const transformed = composePhysicalTarget(position, rotation, binding.positionOffset, binding.rotationOffset);
    if (binding.boneId) bones.push({ entityId: binding.entityId, boneId: binding.boneId, position: transformed.position, rotation: transformed.rotation });
    else {
      const entity = entityById.get(binding.entityId); if (!entity) throw new Error(`Physical binding references missing evaluated entity ${binding.entityId}.`);
      entity.position = transformed.position; entity.rotation = transformed.rotation;
    }
  }
  const fragmentGroups = new Map<string, Hyperfocus3DEvaluatedFrame["effects"][number]>();
  for (const binding of timeline.physicalPerformance.fragments ?? []) {
    if (!findBreakTrigger(breaks, { breakGroupId: binding.breakGroupId })) continue;
    const { position, rotation } = sampleReference(binding.reference, `Physical fragment ${binding.id}`), transformed = composePhysicalTarget(position, rotation, binding.positionOffset, binding.rotationOffset), key = `${binding.breakGroupId}\0${binding.meshId}\0${binding.materialId}`;
    let group = fragmentGroups.get(key);
    if (!group) { group = { id: `physical-fragments:${binding.breakGroupId}:${binding.meshId}:${binding.materialId}`, kind: "debris", presentation: "model", meshId: binding.meshId, materialId: binding.materialId, particles: [] }; fragmentGroups.set(key, group); fragments.push(group); }
    group.particles.push({ id: binding.id, position: transformed.position, rotation: transformed.rotation, scale: copy3(binding.scale) });
  }
  return { bones, fragments };
}
function referenceKey(reference: PhysicalBodyReference3D) { return "bodyId" in reference ? `body:${reference.bodyId}` : `ragdoll:${reference.ragdollId}:${reference.boneId}`; }
function composePhysicalTarget(position: Hyperfocus3DVec3, rotation: readonly [number, number, number, number], localPosition: Hyperfocus3DVec3, localRotation: readonly [number, number, number, number]) { const translated = rotate3(rotation, localPosition), targetRotation = multiplyQuaternion(rotation, localRotation); return { position: tuple3(position[0] + translated[0], position[1] + translated[1], position[2] + translated[2]), rotation: targetRotation }; }

function activeCues<Cue extends { startFrame: number; durationFrames: number }>(cues: readonly Cue[] | undefined, frame: number): Cue[] { return (cues ?? []).filter((cue) => frame >= cue.startFrame && frame < cue.startFrame + cue.durationFrames).map((cue) => structuredClone(cue)); }

/** Samples a smooth-by-default portable pose layer while honoring explicit edge handles. */
export function sample3DPoseCorrections(timeline: Readonly<Hyperfocus3DTimeline> | undefined, frame: number): Hyperfocus3DEvaluatedFrame["poseCorrections"] {
  if (!timeline) return [];
  return (timeline.poseCorrections ?? []).filter((cue) => frame >= cue.startFrame && frame < cue.startFrame + cue.durationFrames).map((cue) => {
    const endFrame = cue.startFrame + cue.durationFrames - 1, available = Math.max(0, cue.durationFrames - 1), recommendedBlend = recommended3DPoseBlendFrames({ fps: timeline.fps, availableFrames: Math.floor(available / 2) });
    const blendInFrames = cue.transition === "cut" ? 0 : Math.min(available, Math.max(0, cue.blendInFrames ?? recommendedBlend)), blendOutFrames = cue.transition === "cut" ? 0 : Math.min(available, Math.max(0, cue.blendOutFrames ?? recommendedBlend));
    const easing = cue.interpolation === "linear" ? clampUnit : smootherstep;
    const incoming = blendInFrames > 0 ? easing((frame - cue.startFrame) / blendInFrames) : 1;
    const outgoing = blendOutFrames > 0 ? easing((endFrame - frame) / blendOutFrames) : 1;
    return { ...structuredClone(cue), weight: cue.weight * Math.min(incoming, outgoing) };
  });
}

/** Samples one portable windup -> contact -> follow-through path for skinning and physical motor targets. */
export function sample3DIkCorrections(timeline: Readonly<Hyperfocus3DTimeline> | undefined, frame: number): Hyperfocus3DEvaluatedFrame["ikCorrections"] {
  if (!timeline) return [];
  return (timeline.ikCorrections ?? []).filter((cue) => frame >= cue.startFrame && frame < cue.startFrame + cue.durationFrames).map((cue) => {
    const endFrame = cue.startFrame + cue.durationFrames - 1;
    const contactFrame = Math.max(cue.startFrame, Math.min(endFrame, cue.contactFrame ?? cue.startFrame + Math.floor((cue.durationFrames - 1) / 2)));
    const followThroughFrame = Math.max(contactFrame, Math.min(endFrame, cue.followThroughFrame ?? endFrame));
    const strikeStartFrame = Math.max(cue.startFrame, Math.min(contactFrame, cue.strikeStartFrame ?? cue.startFrame)), easing = cue.interpolation === "linear" ? (value: number) => Math.max(0, Math.min(1, value)) : smootherstep;
    const target = cue.interpolation === "momentum" && cue.contactVelocity && frame <= contactFrame
      ? frame <= strikeStartFrame ? tuple3(...(cue.targetFrom ?? cue.target)) : hermiteContactTarget(cue.targetFrom ?? cue.target, cue.target, cue.contactVelocity, (contactFrame - strikeStartFrame) / timeline.fps, (frame - strikeStartFrame) / (contactFrame - strikeStartFrame))
      : frame <= contactFrame
      ? interpolate3(cue.targetFrom ?? cue.target, cue.target, easing(contactFrame === cue.startFrame ? 1 : (frame - cue.startFrame) / (contactFrame - cue.startFrame)))
      : interpolate3(cue.target, cue.targetTo ?? cue.target, easing(followThroughFrame === contactFrame ? 1 : (frame - contactFrame) / (followThroughFrame - contactFrame)));
    const pole = frame <= contactFrame
      ? interpolate3(cue.poleFrom ?? cue.pole, cue.pole, easing(contactFrame === cue.startFrame ? 1 : (frame - cue.startFrame) / (contactFrame - cue.startFrame)))
      : interpolate3(cue.pole, cue.poleTo ?? cue.pole, easing(followThroughFrame === contactFrame ? 1 : (frame - contactFrame) / (followThroughFrame - contactFrame)));
    const availableInFrames = contactFrame - cue.startFrame, availableOutFrames = endFrame - contactFrame;
    const recommendedInFrames = recommended3DPoseBlendFrames({ fps: timeline.fps, availableFrames: availableInFrames }), recommendedOutFrames = recommended3DPoseBlendFrames({ fps: timeline.fps, availableFrames: availableOutFrames });
    const blendInFrames = cue.transition === "cut" ? 0 : Math.min(availableInFrames, Math.max(0, cue.blendInFrames ?? recommendedInFrames));
    const blendOutFrames = cue.transition === "cut" ? 0 : Math.min(availableOutFrames, Math.max(0, cue.blendOutFrames ?? recommendedOutFrames));
    const incoming = blendInFrames > 0 ? smootherstep((frame - cue.startFrame) / blendInFrames) : 1;
    const outgoing = blendOutFrames > 0 ? smootherstep((endFrame - frame) / blendOutFrames) : 1;
    return { ...structuredClone(cue), target, pole, weight: cue.weight * Math.min(incoming, outgoing) };
  });
}

function hermiteContactTarget(from: Hyperfocus3DVec3, contact: Hyperfocus3DVec3, velocity: Hyperfocus3DVec3, seconds: number, progress: number): Hyperfocus3DVec3 {
  const t = Math.max(0, Math.min(1, progress)), t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  return [from[0] * h00 + contact[0] * h01 + velocity[0] * seconds * h11, from[1] * h00 + contact[1] * h01 + velocity[1] * seconds * h11, from[2] * h00 + contact[2] * h01 + velocity[2] * seconds * h11];
}

function applyBreakResponses(entities: Hyperfocus3DEvaluatedFrame["entities"], timeline: Readonly<Hyperfocus3DTimeline>, breaks: Hyperfocus3DEvaluatedFrame["physicalBreaks"]) {
  if (!timeline.breakResponses?.length || !breaks.length) return;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  for (const cue of timeline.breakResponses) {
    if (!findBreakTrigger(breaks, cue)) continue;
    const entity = byId.get(cue.entityId); if (!entity) continue;
    if (cue.variantId) entity.variantId = cue.variantId;
    if (cue.visibility !== "keep") entity.visible = cue.visibility === "show";
  }
}

function sampleContactAudioEvents(timeline: Readonly<Hyperfocus3DTimeline> | undefined, frame: number, contacts: Hyperfocus3DEvaluatedFrame["contacts"]): Hyperfocus3DEvaluatedFrame["audioEvents"] {
  if (!timeline?.contactResponses?.length) return [];
  const byId = new Map(contacts.map((event) => [event.id, event]));
  return timeline.contactResponses.flatMap((cue) => {
    const event = byId.get(cue.contactId), eventFrame = event ? event.frame + cue.offsetFrames : -1;
    return event && cue.audioAssetId && eventFrame === frame ? [{ id: cue.id, assetId: cue.audioAssetId, frame: eventFrame, subframe: cue.offsetFrames === 0 ? event.subframe ?? 0 : 0, point: copy3(event.point), gain: cue.gain, pan: cue.pan }] : [];
  });
}

function sampleBreakAudioEvents(timeline: Readonly<Hyperfocus3DTimeline> | undefined, frame: number, breaks: Hyperfocus3DEvaluatedFrame["physicalBreaks"]): Hyperfocus3DEvaluatedFrame["audioEvents"] {
  if (!timeline?.breakResponses?.length) return [];
  return timeline.breakResponses.flatMap((cue) => {
    const event = findBreakTrigger(breaks, cue);
    if (event?.frame !== frame) return [];
    return event && cue.audioAssetId ? [{ id: cue.id, assetId: cue.audioAssetId, frame: event.frame, subframe: event.subframe, point: copy3(event.point), gain: cue.gain, pan: cue.pan }] : [];
  });
}

function findBreakTrigger(breaks: Hyperfocus3DEvaluatedFrame["physicalBreaks"], cue: { breakId?: string; breakGroupId?: string }) {
  return breaks.find((event) => cue.breakId ? event.id === cue.breakId : cue.breakGroupId ? event.groupId === cue.breakGroupId : false);
}

function sampleEffects(declaration: Readonly<Hyperfocus3DDeclaration>, timeline: Readonly<Hyperfocus3DTimeline> | undefined, entities: Hyperfocus3DEvaluatedFrame["entities"], physicalBodies: Hyperfocus3DEvaluatedFrame["physicalBodies"], physicalSource: Readonly<CompiledPhysicalPerformance3D> | undefined, frame: number, contacts: Hyperfocus3DEvaluatedFrame["contacts"], breaks: Hyperfocus3DEvaluatedFrame["physicalBreaks"]): Hyperfocus3DEvaluatedFrame["effects"] {
  if (!timeline?.effectCues?.length) return [];
  const byId = new Map(entities.map((entity) => [entity.id, entity])), output: Hyperfocus3DEvaluatedFrame["effects"] = [];
  for (const cue of timeline.effectCues) {
    const contact = cue.contactId ? contacts.find((candidate) => candidate.id === cue.contactId) : undefined;
    const broken = findBreakTrigger(breaks, cue);
    if (cue.contactId && !contact || (cue.breakId || cue.breakGroupId) && !broken) continue;
    const startFrame = contact ? contact.frame + (cue.contactOffsetFrames ?? 0) : broken?.frame ?? cue.startFrame;
    const local = frame - startFrame; if (local < 0 || local >= cue.durationFrames) continue;
    const physicalTarget = cue.targetEntityId && cue.targetBoneId ? physicalBodies.find((body) => body.entityId === cue.targetEntityId && body.boneId === cue.targetBoneId)?.position : undefined;
    const target = contact?.point ?? broken?.point ?? physicalTarget ?? (cue.targetEntityId ? byId.get(cue.targetEntityId)?.position ?? [0, 0, 0] : [0, 0, 0]), particles: Hyperfocus3DEvaluatedFrame["effects"][number]["particles"] = [];
    for (let index = 0; index < cue.count; index += 1) {
      const unit = stableUnit(cue.id, cue.seed, index, 0), unit2 = stableUnit(cue.id, cue.seed, index, 1), angle = unit * Math.PI * 2, emission = cue.emissionDirection ? coneDirection(cue.emissionDirection, cue.emissionSpreadDegrees ?? 180, stableUnit(cue.id, cue.seed, index, 2), stableUnit(cue.id, cue.seed, index, 3)) : undefined, spawn = effectEmissionMode(cue) === "burst" ? 0 : Math.floor(index / cue.count * cue.durationFrames), ageFrames = local - spawn; if (ageFrames < 0) continue;
      const spawnFrame = startFrame + spawn;
      const spawnTarget = contact || broken ? target : cue.targetEntityId && cue.targetBoneId && cue.space !== "local" ? samplePhysicalBoundBonePosition(timeline, physicalSource, cue.targetEntityId, cue.targetBoneId, spawnFrame) ?? target : cue.targetEntityId && cue.space !== "local" ? sampleEntityPosition(declaration, timeline, cue.targetEntityId, spawnFrame) ?? target : target;
      const age = ageFrames / timeline.fps, life = Math.max(1 / timeline.fps, (cue.durationFrames - spawn) / timeline.fps), progress = Math.min(1, age / life), fade = Math.max(0.05, 1 - progress), radius = cue.radius;
      let x = 0, y = 0, z = 0, scale = cue.size * fade;
      if (cue.kind === "aura") { const orbit = angle + local / timeline.fps * cue.speed; x = Math.cos(orbit) * radius * (0.5 + unit2 * 0.5); y = (unit2 - 0.2) * radius * 1.5 + Math.sin(orbit * 2) * 0.15; z = Math.sin(orbit) * radius * (0.5 + unit2 * 0.5); scale = cue.size * (0.65 + 0.35 * Math.sin(orbit + index)); }
      else if (cue.kind === "trail") { x = (unit2 - 0.5) * radius; y = (unit - 0.5) * radius; z = 0; scale = cue.size * fade; }
      else if (cue.kind === "sparks") { const velocity = cue.speed * (0.5 + unit2); x = (emission?.[0] ?? Math.cos(angle)) * velocity * age; y = (emission?.[1] ?? Math.abs(Math.sin(angle * 1.7))) * velocity * age - 4.9 * age * age; z = (emission?.[2] ?? Math.sin(angle)) * velocity * age; }
      else if (cue.kind === "smoke") { x = emission ? emission[0] * cue.speed * age + Math.cos(angle) * radius * progress * .25 : Math.cos(angle) * radius * progress; y = emission ? emission[1] * cue.speed * age + unit2 * radius * .25 : age * cue.speed + unit2 * radius; z = emission ? emission[2] * cue.speed * age + Math.sin(angle) * radius * progress * .25 : Math.sin(angle) * radius * progress; scale = cue.size * (0.5 + progress * 1.5); }
      else if (cue.kind === "debris") { const velocity = cue.speed * (0.35 + unit2); x = (emission?.[0] ?? Math.cos(angle)) * velocity * age; y = (emission?.[1] ?? (0.5 + unit)) * velocity * age - 4.9 * age * age; z = (emission?.[2] ?? Math.sin(angle)) * velocity * age; }
      else { const direction = emission ?? sphereDirection(unit, unit2), distance = radius + cue.speed * age; x = direction[0] * distance; y = direction[1] * distance; z = direction[2] * distance; scale = cue.size * fade; }
      particles.push({ id: `${cue.id}:${index}`, position: [spawnTarget[0]! + x, spawnTarget[1]! + y, spawnTarget[2]! + z], rotation: rotationYQuaternion(angle + age * cue.speed), scale: [scale, scale, scale] });
    }
    output.push({ id: cue.id, kind: cue.kind, presentation: cue.presentation ?? "model", ...(cue.meshId ? { meshId: cue.meshId } : {}), materialId: cue.materialId, particles });
  }
  return output;
}

function effectEmissionMode(cue: { kind: "aura" | "trail" | "sparks" | "smoke" | "debris" | "shockwave"; emissionMode?: "burst" | "continuous" }) {
  return cue.emissionMode ?? (cue.kind === "trail" || cue.kind === "smoke" ? "continuous" : "burst");
}

function samplePhysicalBoundBonePosition(timeline: Readonly<Hyperfocus3DTimeline> | undefined, source: Readonly<CompiledPhysicalPerformance3D> | undefined, entityId: string, boneId: string, frame: number): Hyperfocus3DVec3 | undefined {
  const binding = timeline?.physicalPerformance?.bindings.find((candidate) => candidate.entityId === entityId && candidate.boneId === boneId);
  if (!binding || !source) return undefined;
  const index = source.bodyReferences.findIndex((reference) => referenceKey(reference) === referenceKey(binding.reference));
  if (index < 0) return undefined;
  const state = new Float32Array(source.frameStride); source.writeFrame(frame, state); const offset = index * PHYSICAL_BODY_STATE_STRIDE_3D;
  return composePhysicalTarget([state[offset]!, state[offset + 1]!, state[offset + 2]!], [state[offset + 3]!, state[offset + 4]!, state[offset + 5]!, state[offset + 6]!], binding.positionOffset, binding.rotationOffset).position;
}

function stableUnit(id: string, seed: number, index: number, channel: number) { return hash(`${id}:${seed}:${index}:${channel}`); }

function sphereDirection(azimuth: number, height: number): Hyperfocus3DVec3 { const y = height * 2 - 1, ring = Math.sqrt(Math.max(0, 1 - y * y)), angle = azimuth * Math.PI * 2; return [Math.cos(angle) * ring, y, Math.sin(angle) * ring]; }

function coneDirection(axisValue: readonly [number, number, number], spreadDegrees: number, radial: number, azimuth: number): Hyperfocus3DVec3 {
  const axisLength = Math.hypot(...axisValue); if (axisLength <= 1e-12) return [0, 1, 0];
  const axis: Hyperfocus3DVec3 = [axisValue[0] / axisLength, axisValue[1] / axisLength, axisValue[2] / axisLength], reference: Hyperfocus3DVec3 = Math.abs(axis[1]) < .99 ? [0, 1, 0] : [1, 0, 0];
  const tx = reference[1] * axis[2] - reference[2] * axis[1], ty = reference[2] * axis[0] - reference[0] * axis[2], tz = reference[0] * axis[1] - reference[1] * axis[0], tangentLength = Math.hypot(tx, ty, tz), tangent: Hyperfocus3DVec3 = [tx / tangentLength, ty / tangentLength, tz / tangentLength], bitangent: Hyperfocus3DVec3 = [axis[1] * tangent[2] - axis[2] * tangent[1], axis[2] * tangent[0] - axis[0] * tangent[2], axis[0] * tangent[1] - axis[1] * tangent[0]];
  const halfAngle = Math.max(0, Math.min(180, spreadDegrees)) * Math.PI / 180, cosine = 1 - radial * (1 - Math.cos(halfAngle)), sine = Math.sqrt(Math.max(0, 1 - cosine * cosine)), phase = azimuth * Math.PI * 2, tangentWeight = Math.cos(phase) * sine, bitangentWeight = Math.sin(phase) * sine;
  return [axis[0] * cosine + tangent[0] * tangentWeight + bitangent[0] * bitangentWeight, axis[1] * cosine + tangent[1] * tangentWeight + bitangent[1] * bitangentWeight, axis[2] * cosine + tangent[2] * tangentWeight + bitangent[2] * bitangentWeight];
}

export function sample3DPerformances(timeline: Readonly<Hyperfocus3DTimeline> | undefined, frame: number): Hyperfocus3DEvaluatedFrame["performances"] {
  if (!timeline?.performanceTracks?.length) return [];
  const output: Hyperfocus3DEvaluatedFrame["performances"] = [];
  for (const track of timeline.performanceTracks) {
    const index = track.segments.findIndex((segment) => frame >= segment.startFrame && frame < segment.startFrame + segment.durationFrames);
    if (index < 0) continue;
    const segment = track.segments[index]!;
    const localFrames = frame - segment.startFrame;
    const rootMotion = evaluatedRootMotion(track, index, timeline.fps);
    const performance: Hyperfocus3DEvaluatedFrame["performances"][number] = {
      entityId: track.entityId,
      rigId: track.rigId,
      clipId: segment.clipId,
      timeSeconds: segment.sourceStartSeconds + localFrames / timeline.fps * segment.speed,
      sourceStartSeconds: segment.sourceStartSeconds,
      loop: segment.loop,
      ...(rootMotion ? { rootMotion } : {}),
    };
    const previous = track.segments[index - 1];
    if (previous && segment.blendFrames > 0 && localFrames < segment.blendFrames) {
      const previousLocalFrames = Math.max(0, frame - previous.startFrame);
      const blendProgress = segment.blendFrames <= 1 ? 0 : localFrames / (segment.blendFrames - 1);
      const previousRootMotion = evaluatedRootMotion(track, index - 1, timeline.fps);
      performance.blend = {
        clipId: previous.clipId,
        timeSeconds: previous.sourceStartSeconds + previousLocalFrames / timeline.fps * previous.speed,
        sourceStartSeconds: previous.sourceStartSeconds,
        loop: previous.loop,
        weight: smootherstep(blendProgress),
        ...(previousRootMotion ? { rootMotion: previousRootMotion } : {}),
      };
    }
    output.push(performance);
  }
  return output;
}

function evaluatedRootMotion(track: NonNullable<Hyperfocus3DTimeline["performanceTracks"]>[number], index: number, fps: number): Hyperfocus3DEvaluatedRootMotion | undefined {
  const segment = track.segments[index], rootMotion = segment?.rootMotion;
  if (!segment || !rootMotion) return undefined;
  const carry: Hyperfocus3DEvaluatedRootMotionSpan[] = [];
  let currentIndex = index;
  while (currentIndex > 0) {
    const current = track.segments[currentIndex]!, previous = track.segments[currentIndex - 1]!;
    if (current.rootMotion?.mode === "off" || (current.rootMotion?.segmentBoundary ?? "accumulate") === "reset" || previous.startFrame + previous.durationFrames !== current.startFrame || !previous.rootMotion || previous.rootMotion.mode === "off") break;
    carry.unshift({ clipId: previous.clipId, sourceStartSeconds: previous.sourceStartSeconds, timeSeconds: previous.sourceStartSeconds + previous.durationFrames / fps * previous.speed, loop: previous.loop, rootMotion: { ...previous.rootMotion } });
    currentIndex -= 1;
  }
  return { ...rootMotion, ...(carry.length ? { carry } : {}) };
}

function sampleCamera(base: Hyperfocus3DDeclaration["scenes"][number]["camera"], shot: Hyperfocus3DShot | undefined, localFrame: number, progress: number, eased: number, followed?: readonly number[], frame = 0, contacts: Hyperfocus3DEvaluatedFrame["contacts"] = [], contactCues: readonly Hyperfocus3DContactCue[] = [], contactResponses: readonly Hyperfocus3DContactResponse[] = []) {
  if (!shot) { const offset = base.followOffset ?? [0, 0, 0]; return { position: followed ? tuple3(followed[0]! + offset[0], followed[1]! + offset[1], followed[2]! + offset[2]) : copy3(base.position), target: followed ? copy3(followed) : copy3(base.target), up: copy3(base.up), fovYRadians: base.fovYRadians, near: base.near, far: base.far }; }
  const position = interpolate3(shot.camera.positionFrom, shot.camera.positionTo, eased), target = interpolate3(shot.camera.targetFrom, shot.camera.targetTo, eased);
  const roll = mix(shot.camera.rollFrom ?? 0, shot.camera.rollTo ?? 0, eased), shotShake = Math.sin(Math.PI * progress) * (shot.camera.shake ?? 0);
  let contactShake = 0;
  for (const contact of contacts) {
    const cue = contactCues.find((candidate) => candidate.id === contact.id), duration = cue?.cameraShakeFrames ?? 0, elapsed = frame - contact.frame;
    if (cue?.cameraShake && duration > 0 && elapsed >= 0 && elapsed < duration) contactShake = Math.max(contactShake, cue.cameraShake * (1 - elapsed / duration));
  }
  for (const cue of contactResponses) {
    const contact = contacts.find((candidate) => candidate.id === cue.contactId), elapsed = contact ? frame - contact.frame - cue.offsetFrames : -1;
    if (contact && cue.cameraShake > 0 && cue.cameraShakeFrames > 0 && elapsed >= 0 && elapsed < cue.cameraShakeFrames) contactShake = Math.max(contactShake, cue.cameraShake * (1 - elapsed / cue.cameraShakeFrames));
  }
  const shake = shotShake + contactShake;
  if (shake > 0) { position[0] += Math.sin(frame * 2.399) * shake; position[1] += Math.cos(frame * 1.773) * shake * 0.6; }
  return { position, target, up: rolledUp(position, target, roll), fovYRadians: mix(shot.camera.fovFrom, shot.camera.fovTo, eased) * Math.PI / 180, near: base.near, far: base.far };
}

function applyFormations(entities: Hyperfocus3DEvaluatedFrame["entities"], timeline: Hyperfocus3DTimeline, shot: Hyperfocus3DShot, progress: number) {
  const entityById = new Map(entities.map((item) => [item.id, item]));
  for (const formation of shot.formations) {
    const group = timeline.groups.find((item) => item.id === formation.groupId); if (!group) continue;
    for (let index = 0; index < group.entityIds.length; index += 1) {
      const entity = entityById.get(group.entityIds[index]!); if (!entity) continue;
      const sampled = sampleFormation(formation, index, group.entityIds.length, progress, hash(entity.id));
      entity.position = sampled.position; entity.rotation = eulerQuaternion(sampled.rotation); entity.scale = tuple3((entity.scale[0]!) * sampled.scale, (entity.scale[1]!) * sampled.scale, (entity.scale[2]!) * sampled.scale);
    }
  }
}

function sampleMaterial(material: Hyperfocus3DDeclaration["materials"][number], timeline: Hyperfocus3DTimeline | undefined, frame: number): MaterialLook3D {
  let look: MaterialLook3D = { baseColor: [...material.baseColor], emissive: material.emissive ? [...material.emissive] : [0, 0, 0], metallic: material.metallic, roughness: material.roughness, opacity: material.baseColor[3], shading: material.shading, shader: material.shading === "unlit" ? "unlit" : material.shader ?? "pbr", doubleSided: material.doubleSided, uv: material.uv ? { offset: [...material.uv.offset], scale: [...material.uv.scale], rotation: material.uv.rotation } : { offset: [0, 0], scale: [1, 1], rotation: 0 }, textures: { ...(material.textureId ? { baseColor: material.textureId } : {}), ...material.textureIds }, ...(material.toon ? { toon: { bands: material.toon.bands, shadowColor: [...material.toon.shadowColor], rimColor: [...material.toon.rimColor], rimStrength: material.toon.rimStrength, outlineColor: [...material.toon.outlineColor], outlineWidth: material.toon.outlineWidth } } : {}) };
  const track = timeline?.materialTracks.find((item) => item.materialId === material.id);
  for (const transition of track?.transitions ?? []) {
    if (frame < transition.startFrame) break;
    const target = materialPreset3D(transition.toPreset).look;
    if (frame < transition.startFrame + transition.durationFrames) return sampleMaterialTransition3D({ from: look, to: target, progress: (frame - transition.startFrame) / transition.durationFrames });
    look = target;
  }
  return look;
}

function applyLighting(lights: Hyperfocus3DEvaluatedFrame["lights"], shot: Hyperfocus3DShot, target: Hyperfocus3DVec3) {
  const byId = new Map(lights.map((light) => [light.id, light])), lighting = shot.lighting;
  const ambient = byId.get(lighting.ambientLightId); if (ambient) { ambient.color = hexRgb(lighting.ambientColor); ambient.intensity = lighting.ambientIntensity; }
  const key = byId.get(lighting.keyLightId); if (key) { key.color = hexRgb(lighting.keyColor); key.intensity = lighting.keyIntensity; key.direction = subtract(target, lighting.keyPosition); }
  const rim = lighting.rimLightId ? byId.get(lighting.rimLightId) : undefined; if (rim) { rim.color = hexRgb(lighting.rimColor); rim.intensity = lighting.rimIntensity; rim.direction = subtract(target, lighting.rimPosition); }
}

function renderGraph(shot: Hyperfocus3DShot | undefined, frame: number, localFrame: number, progress: number, impactFrame?: Hyperfocus3DEvaluatedImpactFrame): Hyperfocus3DRenderGraph {
  if (!shot) return { tier: "gameplay", shadows: true, exposure: 1, ...(impactFrame ? { impactFrame } : {}) };
  const post = shot.post, transition = sampleTransition(shot, localFrame, progress);
  return { tier: "video-safe", shadows: true, exposure: post.exposure, ...(post.fogDensity > 0 ? { fog: { color: hexRgb(shot.lighting.ambientColor), density: post.fogDensity } } : {}), ...(post.bloomStrength > 0 ? { bloom: { strength: post.bloomStrength, radius: post.bloomRadius, threshold: post.bloomThreshold } } : {}), ...(post.vignette > 0 ? { vignette: post.vignette } : {}), ...(post.grain > 0 ? { grain: { amount: post.grain, seed: hash(String(frame)) } } : {}), ...(impactFrame ? { impactFrame } : {}), ...(transition.alpha > 0 ? { transition } : {}) };
}

function sampleImpactFrame(timeline: Readonly<Hyperfocus3DTimeline> | undefined, frame: number, contacts: Hyperfocus3DEvaluatedFrame["contacts"]): Hyperfocus3DEvaluatedImpactFrame | undefined {
  let cue: Hyperfocus3DImpactFrameCue | undefined;
  let cueStart = 0;
  for (const candidate of timeline?.impactFrames ?? []) {
    const contact = candidate.contactId ? contacts.find((value) => value.id === candidate.contactId) : undefined;
    if (candidate.contactId && !contact) continue;
    const start = contact ? contact.frame + (candidate.contactOffsetFrames ?? 0) : candidate.startFrame;
    if (frame >= start && frame < start + candidate.durationFrames) { cue = candidate; cueStart = start; }
  }
  if (!cue) return undefined;
  const value = impactFramePreset3D(cue.preset);
  return {
    id: cue.id,
    preset: cue.preset,
    source: value.source,
    localFrame: frame - cueStart,
    durationFrames: cue.durationFrames,
    intensity: cue.intensity,
    seed: cue.seed,
    center: [cue.center[0], cue.center[1]],
    freezeSource: cue.freezeSource,
    background: cue.background ?? value.background,
    foreground: cue.foreground ?? value.foreground,
    accent: cue.accent ?? value.accent,
    threshold: cue.threshold ?? value.threshold,
    edgeStrength: cue.edgeStrength ?? value.edgeStrength,
    lineDensity: cue.lineDensity ?? value.lineDensity,
    slashAngle: value.slashAngle,
    chromaticOffset: value.chromaticOffset,
    ...(cue.textureId ? { textureId: cue.textureId } : {}),
  };
}

function sampleFormation(formation: Hyperfocus3DShot["formations"][number], index: number, count: number, progress: number, seed: number) {
  const fraction = count <= 1 ? 0.5 : index / (count - 1), phase = (formation.phase ?? 0) + seed * Math.PI * 2;
  const theta = index / Math.max(1, count) * Math.PI * 2 + phase + progress * formation.spinTurns * Math.PI * 2, pulse = 1 + Math.sin(progress * Math.PI * 4 + phase) * 0.06;
  let x = 0, y = formation.height, z = 0, rx = 0, ry = theta + Math.PI / 2, rz = 0;
  if (formation.preset === "altar") { const arc = mix(-1.08, 1.08, fraction); x = Math.sin(arc) * formation.radius; z = -Math.cos(arc) * formation.radius + formation.travel * progress; y += Math.sin(progress * Math.PI * 2 + phase) * formation.spread * 0.08; ry = -arc; }
  else if (formation.preset === "orbit") { x = Math.cos(theta) * formation.radius; z = Math.sin(theta) * formation.radius; y += Math.sin(theta * 2 + progress * Math.PI * 2) * formation.spread; rx = Math.cos(theta) * 0.35; rz = Math.sin(theta) * 0.35; }
  else if (formation.preset === "helix") { x = Math.cos(theta) * formation.radius; y += (fraction - 0.5) * formation.spread; z = (fraction - 0.5) * formation.depth + formation.travel * (progress - 0.5); rx = theta * 0.25; rz = Math.sin(theta) * 0.5; }
  else if (formation.preset === "tunnel") { const slots = Math.max(4, Math.round(Math.sqrt(count) * 1.6)), ring = Math.floor(index / slots), slot = index % slots, ringCount = Math.max(1, Math.ceil(count / slots)), angle = slot / slots * Math.PI * 2 + progress * formation.spinTurns * Math.PI * 2; x = Math.cos(angle) * formation.radius; y += Math.sin(angle) * formation.radius; z = (ring / Math.max(1, ringCount - 1) - 0.5) * formation.depth + formation.travel * progress; ry = -angle; rz = angle + Math.PI / 2; }
  else if (formation.preset === "crown") { x = Math.cos(theta) * formation.radius; z = Math.sin(theta) * formation.radius; y += formation.spread * (0.25 + 0.75 * Math.abs(Math.sin(theta * 2))) + formation.travel * smootherstep(progress); rx = -0.5; rz = -theta; }
  else if (formation.preset === "scatter") { const direction = randomDirection(seed), distance = formation.radius + formation.spread * smootherstep(progress) + formation.travel * progress; x = direction[0] * distance; y += direction[1] * distance; z = direction[2] * distance; rx = theta * 1.7; ry = theta * 2.1; rz = theta * 1.3; }
  else if (formation.preset === "phalanx") { const columns = Math.ceil(Math.sqrt(count)), row = Math.floor(index / columns), column = index % columns; x = (column - (columns - 1) / 2) * formation.spread; y += (row - (Math.ceil(count / columns) - 1) / 2) * formation.spread; z = Math.sin(column * 0.8 + progress * Math.PI * 2) * formation.depth + formation.travel * progress; ry = Math.sin(progress * Math.PI * 2 + phase) * 0.22; }
  else if (formation.preset === "wave") { x = (fraction - 0.5) * formation.spread; y += Math.sin(fraction * Math.PI * 4 + progress * formation.spinTurns * Math.PI * 2) * formation.radius; z = Math.cos(fraction * Math.PI * 3 + progress * Math.PI * 2) * formation.depth + formation.travel * progress; rz = Math.cos(fraction * Math.PI * 4 + progress * Math.PI * 2) * 0.8; }
  else { const collapse = 0.12 + Math.abs(Math.cos(progress * Math.PI)) * 0.88, direction = randomDirection(seed); x = direction[0] * formation.radius * collapse; y += direction[1] * formation.radius * collapse; z = direction[2] * formation.radius * collapse + formation.travel * progress; rx = theta; ry = -theta * 1.4; rz = theta * 0.7; }
  return { position: tuple3(x, y, z), rotation: tuple3(rx, ry, rz), scale: formation.scale * pulse };
}

function shotAt(timeline: Hyperfocus3DTimeline, frame: number) { return timeline.shots.find((shot) => frame >= shot.startFrame && frame < shot.startFrame + shot.durationFrames) ?? timeline.shots.at(-1); }
function sampleTransition(shot: Hyperfocus3DShot, localFrame: number, progress: number) { const transition = shot.transition; if (!transition || transition.frames === 0 || transition.kind === "cut" || transition.kind === "whip") return { alpha: 0, color: tuple3(1, 1, 1) }; const head = Math.max(0, 1 - localFrame / transition.frames), tail = Math.max(0, 1 - (shot.durationFrames - 1 - localFrame) / transition.frames), edge = Math.max(head, tail), alpha = transition.kind === "flash" ? edge * edge * 0.16 : edge; return { alpha: alpha * (transition.kind === "flash" ? 1 - Math.abs(progress - 0.5) * 0.04 : 1), color: transition.kind === "fade-black" ? tuple3(0, 0, 0) : hexRgb(transition.color ?? "#ffffff") }; }
function rolledUp(eye: Hyperfocus3DVec3, target: Hyperfocus3DVec3, roll: number): Hyperfocus3DVec3 { const forward = normalize(subtract(target, eye)), right = normalize(cross(forward, [0, 1, 0])); const up = normalize(cross(right, forward)); return [up[0] * Math.cos(roll) + right[0] * Math.sin(roll), up[1] * Math.cos(roll) + right[1] * Math.sin(roll), up[2] * Math.cos(roll) + right[2] * Math.sin(roll)]; }
function hexRgb(value: string): Hyperfocus3DVec3 { const parsed = Number.parseInt(value.slice(1), 16); return tuple3((parsed >> 16 & 255) / 255, (parsed >> 8 & 255) / 255, (parsed & 255) / 255); }
function subtract(to: Hyperfocus3DVec3, from: Hyperfocus3DVec3): Hyperfocus3DVec3 { return [to[0] - from[0], to[1] - from[1], to[2] - from[2]]; }
function cross(a: Hyperfocus3DVec3, b: Hyperfocus3DVec3): Hyperfocus3DVec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(value: Hyperfocus3DVec3): Hyperfocus3DVec3 { const length = Math.hypot(...value); return length > 0.000001 ? tuple3((value[0]!) / length, (value[1]!) / length, (value[2]!) / length) : [1, 0, 0]; }

function hash(value: string) { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return (result >>> 0) / 0xffff_ffff; }
function randomDirection(seed: number): Hyperfocus3DVec3 { const z = seed * 2 - 1, angle = ((seed * 1_618_033_988_75) % 1) * Math.PI * 2, radius = Math.sqrt(Math.max(0, 1 - z * z)); return [Math.cos(angle) * radius, z, Math.sin(angle) * radius]; }
import { conjugateQuaternion as inverseQuaternion, multiplyNormalizedQuaternions as multiplyQuaternion, rotateQuaternionVector3 as rotate3 } from "../math/quaternion.ts";
