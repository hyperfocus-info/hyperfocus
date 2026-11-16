import { assertFinite, assertInteger, assertText, clone, isObject, isOneOf, validateProjectScenes, validateProjectSettings } from "./editor-history.ts";
import { readProjectDeliveryPolicy } from './delivery/policy.ts';
import { validateEditorAtlas, validateEditorTimeline } from "./editor-timeline-validation.ts";
import { validatePlayableSaveProject2D } from "./runtime-save-2d.ts";
import { validatePlayableStoryProject2D } from "./runtime-story-2d.ts";
import { parseDeclaration, type Hyperfocus3DDiagnostic } from "./3d/declaration.ts";
import { assertReferenceProject3D } from './3d/reference.ts';
import { sortJsonKeys } from "./sectioned-serializer.ts";
import { validateAudioAssetMetadata, type EditorAsset } from './metadata/assets.ts';
export type { EditorAsset, AudioAssetMetadata } from './metadata/assets.ts';
export { createProjectHistory,type HistoryEntry,type ProjectDeltaMutation,type ProjectHistory,type ProjectHistoryOptions,type ProjectSectionTransaction } from "./editor-history.ts";

export const EDITOR_PROJECT_VERSION = 3;
const PROJECT_FORMAT = "catalog-engine-editor-project" as const;
const LEGACY_PROJECT_FORMAT = "catalog-engine-project";
const MAX_TILE_CELLS = 1_048_576;
const ASSET_KINDS = ["image", "audio", "data", "font", "unknown"] as const;
const ASSET_SOURCES = ["imported", "generated"] as const;
const EXPORT_CODECS = ["avc", "vp8", "vp9"] as const;
const EXPORT_FRAME_FITS = ["contain", "cover", "stretch"] as const;

export type EditorComponent = {
  id: string;
  type: "transform" | "sprite" | "collider" | "input" | "behavior" | "camera" | "audio" | "ui";
  enabled: boolean;
  values: Record<string, string | number | boolean>;
};

export type EditorEntityData = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  /** Optional authored clockwise rotation in radians. */
  rotation?: number;
  /** Optional authored render alpha. */
  opacity?: number;
  layer: number;
  color: string;
  accent: string;
  kind: "prop" | "actor" | "hostile";
  parentId?: string;
  components: EditorComponent[];
};

export type EditorEffect = {
  id: string;
  enabled: boolean;
  value: number;
};

export type EditorKeyframe = {
  id: string;
  frame: number;
  value: number;
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bounce" | "hold";
};

export type EditorTimelineTrack = {
  id: string;
  targetId: string;
  label: string;
  property: "x" | "y" | "scale" | "rotation" | "opacity" | "camera";
  color: string;
  muted: boolean;
  locked: boolean;
  keyframes: EditorKeyframe[];
};

export type EditorClipKeyframe = {
  id: string;
  frame: number;
  clipId: string;
};

/** A stepped sprite animation state track. Clip cues never interpolate or masquerade as numeric motion. */
export type EditorClipTrack = {
  id: string;
  targetId: string;
  label: string;
  muted: boolean;
  locked: boolean;
  keyframes: EditorClipKeyframe[];
};

export type EditorAudioTrack = {
  id: string;
  name: string;
  assetId?: string;
  startFrame: number;
  durationFrames: number;
  trimStart: number;
  trimEnd: number;
  /** Optional precise source-media in point. Unlike legacy trim frames, this is not bounded by timeline length. */
  sourceInSeconds?: number;
  /** Optional precise source-media out point. Omit to use the decoded asset duration. */
  sourceOutSeconds?: number;
  fadeIn: number;
  fadeOut: number;
  loopStart: number;
  loopEnd: number;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
};

export type EditorAnimationEvent = {
  id: string;
  frame: number;
  label: string;
  kind: "audio" | "logic" | "camera" | "marker";
};

/** Portable music analysis used by every timeline surface. Analysis is advisory; the authored BPM and downbeat remain editable. */
export type EditorRhythmMap = {
  sourceAssetId?: string;
  bpmConfidence: number;
  downbeatFrame: number;
  transientFrames: number[];
  waveform: number[];
  sections: Array<{ id: string; label: string; frame: number; kind: "intro" | "verse" | "chorus" | "bridge" | "drop" | "outro" | "custom" }>;
};

/** A short, deterministic visual accent evaluated by editor preview and standalone builds. */
export type EditorTimelineEffect = {
  id: string;
  frame: number;
  durationFrames: number;
  label: string;
  kind: "camera-shake" | "particle-burst" | "hit-flash" | "screen-transition";
  targetId?: string;
  intensity: number;
  color?: string;
  particleCount?: number;
  preset?: string;
  layer?: "foreground" | "background";
  space?: "screen" | "target";
  region?: { fromX: number; fromY: number; toX: number; toY: number };
};

export type EditorReactiveBinding = {
  id: string;
  source: "rms" | "bass" | "mid" | "treble" | "midi-cc";
  targetId: string;
  property: "x" | "y" | "scale" | "rotation" | "opacity";
  gain: number;
  smoothing: number;
  enabled: boolean;
};

export type EditorMidiMapping = {
  id: string;
  channel: number;
  control: number;
  targetId: string;
  property: "x" | "y" | "scale" | "rotation" | "opacity";
  minimum: number;
  maximum: number;
};

export type EditorLogicNode = {
  id: string;
  kind: "event" | "condition" | "action";
  label: string;
  x: number;
  y: number;
  config: Record<string, string | number | boolean>;
};

export type EditorSpriteBone = {
  id: string;
  name: string;
  parentId?: string;
  x: number;
  y: number;
  length: number;
  rotation: number;
};

export type EditorAnnotation = {
  id: string;
  author: string;
  body: string;
  frame: number;
  entityId?: string;
  resolved: boolean;
  createdAt: string;
};

export type EditorSocialTextOverlay = {
  text: string;
  position: "top" | "center" | "bottom";
  startFrame: number;
  endFrame: number;
};

export type EditorProject = {
  format: typeof PROJECT_FORMAT;
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeSceneId: string;
  scenes: Array<{
    id: string;
    name: string;
    entities: EditorEntityData[];
  }>;
  assets: EditorAsset[];
  tilemap: {
    id: string;
    name: string;
    /** Optional image used to present authored tile values. Kept separate from the animation atlas. */
    sourceAssetId?: string;
    columns: number;
    rows: number;
    tileSize: number;
    values: number[];
    /** Tile values that participate in standalone/runtime collision. */
    solidValues: number[];
  };
  atlas: {
    id: string;
    name: string;
    sourceAssetId?: string;
    frameWidth: number;
    frameHeight: number;
    playbackSpeed: number;
    frames: Array<{ id: string; name: string; x: number; y: number; width: number; height: number; color: string }>;
    sequence: string[];
    /** Named, switchable animation states. `sequence` remains the compatibility/default clip. */
    clips?: Array<{ id: string; name: string; sequence: string[]; fps: number; loop: boolean }>;
    defaultClipId?: string;
  };
  postProcessing: {
    effects: EditorEffect[];
    frameBudgetMs: number;
    allocationMs: number;
  };
  timeline: {
    fps: number;
    durationFrames: number;
    bpm: number;
    beatsPerBar: number;
    /** Optional for compatibility with projects saved before portable beat analysis. */
    rhythm?: EditorRhythmMap;
    loopStart: number;
    loopEnd: number;
    playbackSpeed: number;
    tracks: EditorTimelineTrack[];
    /** Optional for version-3 compatibility; a cue takes effect at its frame and remains active until the next cue. */
    clipTracks?: EditorClipTrack[];
    audioTracks: EditorAudioTrack[];
    events: EditorAnimationEvent[];
    /** Optional for version-3 compatibility; new authoring initializes this collection on demand. */
    effects?: EditorTimelineEffect[];
  };
  production: {
    export: { width: number; height: number; fps: number; codec: "avc" | "vp8" | "vp9"; preset: string; fit?: "contain" | "cover" | "stretch"; rangeStartFrame?: number; rangeEndFrame?: number; textOverlay?: EditorSocialTextOverlay };
    reactiveBindings: EditorReactiveBinding[];
    midiMappings: EditorMidiMapping[];
    logicGraph: { nodes: EditorLogicNode[]; edges: Array<{ id: string; from: string; to: string }> };
    spriteRig: { bones: EditorSpriteBone[]; poses: Array<{ id: string; name: string; rotations: Record<string, number> }> };
    annotations: EditorAnnotation[];
  };
  settings: {
    targetProfile: "desktop" | "mobile" | "low-power";
    locale: string;
    /** Portable gameplay accessibility preference; app/editor motion is user-scoped UI state. */
    reducedMotion: boolean;
    masterVolume: number;
    input: Array<{ action: string; bindings: string[] }>;
  };
  /** Optional portable feature declarations; user save payloads never live here. */
  extensions?: Record<string, unknown>;
};

const defaultEntities: EditorEntityData[] = [
  entity("torch-west", "Torch West", 168, 122, 28, 58, 1, "#ff8e38", "#ffd46c", "prop"),
  entity("torch-east", "Torch East", 560, 122, 28, 58, 1, "#ff8e38", "#ffd46c", "prop"),
  entity("player-01", "Player_01", 320, 242, 38, 48, 2, "#42cfc5", "#b9fff5", "actor", [
    component("input-player", "input", { mapping: "player", speed: 220 }),
    component("behavior-player", "behavior", { module: "builtin:player", export: "update" }),
    component("collider-player", "collider", { shape: "box", solid: true }),
  ]),
  entity("sentinel-a", "Sentinel_A", 475, 226, 36, 40, 2, "#e7596e", "#ffafbb", "hostile", [component("behavior-sentinel-a", "behavior", { module: "builtin:patrol", export: "update", axis: "x", speed: 54, distance: 72 })]),
  entity("sentinel-b", "Sentinel_B", 590, 312, 36, 40, 2, "#cf4b69", "#ff9daf", "hostile", [component("behavior-sentinel-b", "behavior", { module: "builtin:patrol", export: "update", axis: "y", speed: 42, distance: 56 })]),
  entity("crate-01", "Relic Crate", 214, 326, 42, 35, 1, "#9a683f", "#e9ad62", "prop"),
  entity("altar-01", "Signal Altar", 650, 148, 52, 42, 1, "#65539c", "#c4aaff", "prop"),
];

export function createDefaultProject(name = "Dungeon Run"): EditorProject {
  const now = new Date().toISOString();
  const atlasColors = ["#39d0cd", "#568de0", "#8b73df", "#d65b87", "#ee9e4d", "#7cbc68", "#39c8c5", "#568de0"];
  const atlasFrames = Array.from({ length: 8 }, (_, index) => ({
    id: `frame-${index}`,
    name: `walk_${String(index).padStart(2, "0")}`,
    x: (index % 4) * 128,
    y: Math.floor(index / 4) * 160,
    width: 128,
    height: 160,
    color: atlasColors[index],
  }));
  const values = Array.from({ length: 160 }, (_, index) => {
    const column = index % 16;
    const row = Math.floor(index / 16);
    if (row === 0 || row === 9 || column === 0 || column === 15) return 3;
    if ((column + row * 3) % 13 === 0) return 1;
    if ((column === 7 || column === 8) && row >= 3 && row <= 5) return 2;
    return 0;
  });
  return {
    format: PROJECT_FORMAT,
    version: EDITOR_PROJECT_VERSION,
    id: uniqueId("project"),
    name,
    createdAt: now,
    updatedAt: now,
    activeSceneId: "scene-main",
    scenes: [{ id: "scene-main", name: "Dungeon_Run_04", entities: clone(defaultEntities) }],
    assets: [
      { id: "asset-terrain", name: "terrain.atlas", kind: "image", mimeType: "image/generated", size: 0, lastModified: Date.now(), source: "generated" },
      { id: "asset-hero", name: "hero_actions.png", kind: "image", mimeType: "image/generated", size: 0, lastModified: Date.now(), source: "generated" },
    ],
    tilemap: { id: "tilemap-main", name: "Dungeon Terrain", sourceAssetId: "asset-terrain", columns: 16, rows: 10, tileSize: 48, values, solidValues: [3] },
    atlas: {
      id: "atlas-hero", name: "Hero Actions", sourceAssetId: "asset-hero", frameWidth: 128, frameHeight: 160, playbackSpeed: 1,
      frames: atlasFrames,
      sequence: atlasFrames.slice(0, 4).map((frame) => frame.id),
      clips: [
        { id: "idle", name: "Idle", sequence: atlasFrames.slice(0, 2).map((frame) => frame.id), fps: 6, loop: true },
        { id: "walk", name: "Walk", sequence: atlasFrames.slice(0, 4).map((frame) => frame.id), fps: 10, loop: true },
        { id: "attack", name: "Attack", sequence: atlasFrames.slice(4, 8).map((frame) => frame.id), fps: 12, loop: false },
      ],
      defaultClipId: "walk",
    },
    postProcessing: {
      frameBudgetMs: 16.67,
      allocationMs: 2,
      effects: [
        { id: "grayscale", enabled: false, value: 0.65 },
        { id: "sepia", enabled: true, value: 0.28 },
        { id: "crt", enabled: true, value: 0.2 },
        { id: "shake", enabled: false, value: 4 },
        { id: "threshold", enabled: false, value: 132 },
      ],
    },
    timeline: {
      fps: 30,
      durationFrames: 300,
      bpm: 120,
      beatsPerBar: 4,
      loopStart: 24,
      loopEnd: 264,
      playbackSpeed: 1,
      tracks: [
        timelineTrack("track-player-x", "player-01", "Position X", "x", "#41d7d0", [[0, 320], [72, 405], [144, 350], [240, 520]]),
        timelineTrack("track-player-y", "player-01", "Position Y", "y", "#6ba9ff", [[0, 242], [54, 188], [144, 268], [240, 214]]),
        timelineTrack("track-player-scale", "player-01", "Scale", "scale", "#b997ff", [[0, 1], [96, 1.18], [168, .92], [240, 1]]),
        timelineTrack("track-camera", "camera-01", "Camera blend", "camera", "#f2ad4d", [[0, 0], [120, 0], [144, 1], [240, 1]]),
      ],
      audioTracks: [{ id: "audio-score", name: "neon_pulse_demo.wav", startFrame: 0, durationFrames: 300, trimStart: 0, trimEnd: 300, fadeIn: 12, fadeOut: 18, loopStart: 24, loopEnd: 264, volume: .82, pan: 0, muted: false, solo: false }],
      events: [
        { id: "event-intro", frame: 24, label: "Intro hit", kind: "audio" },
        { id: "event-cut-a", frame: 120, label: "CAM A → B", kind: "camera" },
        { id: "event-flash", frame: 192, label: "Pulse flash", kind: "logic" },
        { id: "event-outro", frame: 264, label: "Loop out", kind: "marker" },
      ],
      effects: [],
    },
    production: {
      export: { width: 1920, height: 1080, fps: 30, codec: "avc", preset: "1080p", fit: "contain" },
      reactiveBindings: [
        { id: "binding-bass-scale", source: "bass", targetId: "player-01", property: "scale", gain: .32, smoothing: .72, enabled: true },
        { id: "binding-mid-y", source: "mid", targetId: "player-01", property: "y", gain: 18, smoothing: .64, enabled: false },
      ],
      midiMappings: [{ id: "midi-cc1-scale", channel: 1, control: 1, targetId: "player-01", property: "scale", minimum: .75, maximum: 1.35 }],
      logicGraph: {
        nodes: [
          { id: "node-beat", kind: "event", label: "On Beat", x: 42, y: 72, config: { division: "1/4" } },
          { id: "node-energy", kind: "condition", label: "Bass > 0.62", x: 288, y: 72, config: { source: "bass", threshold: .62 } },
          { id: "node-flash", kind: "action", label: "Pulse Glow", x: 548, y: 30, config: { target: "player-01", amount: 1.4 } },
          { id: "node-shake", kind: "action", label: "Camera Shake", x: 548, y: 132, config: { amount: 4 } },
        ],
        edges: [{ id: "edge-beat-energy", from: "node-beat", to: "node-energy" }, { id: "edge-energy-flash", from: "node-energy", to: "node-flash" }, { id: "edge-energy-shake", from: "node-energy", to: "node-shake" }],
      },
      spriteRig: {
        bones: [
          { id: "bone-root", name: "Root", x: 0, y: 54, length: 42, rotation: -Math.PI / 2 },
          { id: "bone-spine", name: "Spine", parentId: "bone-root", x: 0, y: 0, length: 55, rotation: -Math.PI / 2 },
          { id: "bone-arm-l", name: "Arm L", parentId: "bone-spine", x: 0, y: 0, length: 46, rotation: -2.75 },
          { id: "bone-arm-r", name: "Arm R", parentId: "bone-spine", x: 0, y: 0, length: 46, rotation: -.39 },
          { id: "bone-leg-l", name: "Leg L", parentId: "bone-root", x: -8, y: 0, length: 54, rotation: 1.78 },
          { id: "bone-leg-r", name: "Leg R", parentId: "bone-root", x: 8, y: 0, length: 54, rotation: 1.36 },
        ],
        poses: [{ id: "pose-idle", name: "Idle", rotations: {} }],
      },
      annotations: [{ id: "note-intro", author: "Mara", body: "Hold the first silhouette two beats longer before the cut.", frame: 24, entityId: "player-01", resolved: false, createdAt: now }],
    },
    settings: {
      targetProfile: "desktop",
      locale: "en-US",
      reducedMotion: false,
      masterVolume: 0.8,
      input: [
        { action: "move-left", bindings: ["KeyA", "ArrowLeft"] },
        { action: "move-right", bindings: ["KeyD", "ArrowRight"] },
        { action: "move-up", bindings: ["KeyW", "ArrowUp"] },
        { action: "move-down", bindings: ["KeyS", "ArrowDown"] },
        { action: "interact", bindings: ["KeyE", "Gamepad0.Button0"] },
      ],
    },
    extensions: {
      hyperfocusSave: {
        schema: "portable-world-snapshot-v1",
        dataVersion: 0,
        slotPolicy: "single",
        slots: ["auto"],
        defaultSlot: "auto",
        restoreOnBoot: true,
        editorPlay: "reset",
        maxBytes: 262_144,
      },
    },
  };
}

export function migrateProject(value: unknown): EditorProject {
  if (!isObject(value)) throw new Error("Project file must contain a JSON object.");
  if (value.format !== PROJECT_FORMAT && value.format !== LEGACY_PROJECT_FORMAT) throw new Error("This is not a Catalog Engine Editor project file.");
  if (typeof value.version !== "number" || value.version > EDITOR_PROJECT_VERSION) {
    throw new Error(`Project version ${String(value.version)} is not supported by Editor ${EDITOR_PROJECT_VERSION}.`);
  }
  const migrated = value.format !== PROJECT_FORMAT || value.version !== EDITOR_PROJECT_VERSION;
  const fallback = createDefaultProject(typeof value.name === "string" ? value.name : "Imported Project");
  const fallbackSettings = fallback.settings;
  const fallbackTilemap = fallback.tilemap;
  const project = Object.assign(fallback, clone(value));
  project.format = PROJECT_FORMAT;
  project.version = EDITOR_PROJECT_VERSION;
  if (migrated || typeof project.updatedAt !== "string") project.updatedAt = new Date().toISOString();
  const settings = Object.assign(fallbackSettings, isObject(value.settings) ? value.settings : {});
  delete settings.uiScale;
  project.settings = settings;
  delete project.layout;
  const sourceTilemap = isObject(value.tilemap) ? value.tilemap : {};
  project.tilemap = Object.assign(fallbackTilemap, sourceTilemap);
  if (!Object.prototype.hasOwnProperty.call(sourceTilemap, "sourceAssetId")) delete project.tilemap.sourceAssetId;
  if (!Object.prototype.hasOwnProperty.call(value, "extensions")) delete project.extensions;
  validateProject(project);
  return project;
}

export function validateProject(project: EditorProject) {
  if (!isObject(project) || project.format !== PROJECT_FORMAT) throw new Error("Project format is invalid.");
  if (project.version !== EDITOR_PROJECT_VERSION) throw new Error("Project version is invalid.");
  assertText(project.id, "Project id", 128);
  assertText(project.name, "Project name", 256);
  if (!Array.isArray(project.assets) || project.assets.length > 5_000) throw new Error("Project asset catalog is invalid or too large.");
  if (!isObject(project.tilemap) || !isObject(project.atlas) || !isObject(project.postProcessing) || !isObject(project.timeline) || !isObject(project.production) || !isObject(project.settings)) throw new Error("Project sections are incomplete.");

  validateProjectScenes(project);

  for (const asset of project.assets) {
    if (!isObject(asset)) throw new Error("Asset metadata is invalid.");
    assertText(asset.id, "Asset id", 128);
    assertText(asset.name, "Asset name", 512);
    assertText(asset.mimeType, "Asset MIME type", 256);
    if (!isOneOf(asset.kind, ASSET_KINDS)) throw new Error(`Asset ${asset.id} has an invalid kind.`);
    if (!isOneOf(asset.source, ASSET_SOURCES)) throw new Error(`Asset ${asset.id} has an invalid source.`);
    if (asset.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error(`Asset ${asset.id} has an invalid SHA-256 content address.`);
    assertFinite(asset.size, `Asset ${asset.id} size`, 0, 10_000_000_000);
    assertFinite(asset.lastModified, `Asset ${asset.id} timestamp`, 0, 10_000_000_000_000);
    if (asset.audioMetadata !== undefined) {
      if (asset.kind !== 'audio') throw new Error(`Asset ${asset.id} tempo metadata requires an audio asset.`);
      validateAudioAssetMetadata(asset.audioMetadata);
    }
  }

  assertInteger(project.tilemap.columns, "Tilemap columns", 1, 1_024);
  assertInteger(project.tilemap.rows, "Tilemap rows", 1, 1_024);
  assertInteger(project.tilemap.tileSize, "Tile size", 1, 4_096);
  const tileCells = project.tilemap.columns * project.tilemap.rows;
  if (tileCells > MAX_TILE_CELLS || !Array.isArray(project.tilemap.values) || project.tilemap.values.length !== tileCells) throw new Error("Tilemap dimensions do not match bounded tile data.");
  for (const tile of project.tilemap.values) assertInteger(tile, "Tile value", 0, 65_535);
  if (!Array.isArray(project.tilemap.solidValues) || project.tilemap.solidValues.length > 256) throw new Error("Tilemap solid values are invalid or too large.");
  const solidValues = new Set<number>();
  for (const tile of project.tilemap.solidValues) {
    assertInteger(tile, "Solid tile value", 0, 65_535);
    if (solidValues.has(tile)) throw new Error(`Duplicate solid tile value: ${tile}`);
    solidValues.add(tile);
  }
  if (project.tilemap.sourceAssetId !== undefined) {
    assertText(project.tilemap.sourceAssetId, "Tilemap source asset id", 128);
    const source = project.assets.find((asset) => asset.id === project.tilemap.sourceAssetId);
    if (!source || source.kind !== "image") throw new Error("Tilemap source must reference an image asset.");
  }

  validateEditorAtlas(project);

  if (!Array.isArray(project.postProcessing.effects) || project.postProcessing.effects.length > 64) throw new Error("Post-processing stack is invalid or too large.");
  assertFinite(project.postProcessing.frameBudgetMs, "Frame budget", 1, 1_000);
  assertFinite(project.postProcessing.allocationMs, "FX allocation", 0, project.postProcessing.frameBudgetMs);
  for (const effect of project.postProcessing.effects) {
    if (!isObject(effect)) throw new Error("Post-processing effect is invalid.");
    assertText(effect.id, "Effect id", 128);
    if (typeof effect.enabled !== "boolean") throw new Error(`Effect ${effect.id} enabled state is invalid.`);
    assertFinite(effect.value, `Effect ${effect.id} value`, -1_000_000, 1_000_000);
  }

  validateEditorTimeline(project);

  if (!isObject(project.production.export) || !Array.isArray(project.production.reactiveBindings) || !Array.isArray(project.production.midiMappings) || !isObject(project.production.logicGraph) || !isObject(project.production.spriteRig) || !Array.isArray(project.production.annotations)) throw new Error("Production authoring data is incomplete.");
  assertInteger(project.production.export.width, "Export width", 16, 8192); assertInteger(project.production.export.height, "Export height", 16, 8192); assertFinite(project.production.export.fps, "Export frame rate", 1, 240);
  if (!isOneOf(project.production.export.codec, EXPORT_CODECS)) throw new Error("Export codec is invalid."); assertText(project.production.export.preset, "Export preset", 128);
  if (project.production.export.fit !== undefined && !isOneOf(project.production.export.fit, EXPORT_FRAME_FITS)) throw new Error("Export frame fit is invalid.");
  const textOverlay = project.production.export.textOverlay;
  if (textOverlay !== undefined) {
    if (!isObject(textOverlay)) throw new Error("Export text overlay is invalid.");
    assertText(textOverlay.text, "Export text overlay", 280);
    if (!isOneOf(textOverlay.position, ["top", "center", "bottom"] as const)) throw new Error("Export text overlay position is invalid.");
    assertInteger(textOverlay.startFrame, "Export text overlay start", 0, project.timeline.durationFrames - 1);
    assertInteger(textOverlay.endFrame, "Export text overlay end", 1, project.timeline.durationFrames);
    if (textOverlay.endFrame <= textOverlay.startFrame) throw new Error("Export text overlay end must be after its start.");
  }
  const rangeStart = project.production.export.rangeStartFrame;
  const rangeEnd = project.production.export.rangeEndFrame;
  if ((rangeStart === undefined) !== (rangeEnd === undefined)) throw new Error("Export range must define both start and end frames.");
  if (rangeStart !== undefined && rangeEnd !== undefined) {
    assertInteger(rangeStart, "Export range start", 0, project.timeline.durationFrames - 1);
    assertInteger(rangeEnd, "Export range end", 1, project.timeline.durationFrames);
    if (rangeEnd <= rangeStart) throw new Error("Export range end must be after its start.");
  }
  if (project.production.reactiveBindings.length > 512 || project.production.midiMappings.length > 512) throw new Error("Automation mappings are too large.");
  for (const binding of project.production.reactiveBindings) { if (!isObject(binding)) throw new Error("Reactive binding data is invalid."); assertText(binding.id, "Reactive binding id", 128); assertText(binding.targetId, "Reactive binding target", 128); assertFinite(binding.gain, "Reactive binding gain", -10000, 10000); assertFinite(binding.smoothing, "Reactive binding smoothing", 0, 1); if (typeof binding.enabled !== "boolean") throw new Error(`Reactive binding ${binding.id} enabled state is invalid.`); }
  for (const mapping of project.production.midiMappings) { if (!isObject(mapping)) throw new Error("MIDI mapping data is invalid."); assertText(mapping.id, "MIDI mapping id", 128); assertInteger(mapping.channel, "MIDI channel", 1, 16); assertInteger(mapping.control, "MIDI control", 0, 127); assertText(mapping.targetId, "MIDI mapping target", 128); assertFinite(mapping.minimum, "MIDI mapping minimum", -1000000, 1000000); assertFinite(mapping.maximum, "MIDI mapping maximum", -1000000, 1000000); }
  if (!Array.isArray(project.production.logicGraph.nodes) || !Array.isArray(project.production.logicGraph.edges) || project.production.logicGraph.nodes.length > 2048 || project.production.logicGraph.edges.length > 8192) throw new Error("Logic graph is invalid or too large.");
  for (const node of project.production.logicGraph.nodes) { if (!isObject(node) || !isObject(node.config)) throw new Error("Logic node data is invalid."); assertText(node.id, "Logic node id", 128); assertText(node.label, "Logic node label", 256); assertFinite(node.x, "Logic node x", -100000, 100000); assertFinite(node.y, "Logic node y", -100000, 100000); }
  if (!Array.isArray(project.production.spriteRig.bones) || !Array.isArray(project.production.spriteRig.poses) || project.production.spriteRig.bones.length > 512) throw new Error("Sprite rig data is invalid or too large.");
  for (const bone of project.production.spriteRig.bones) { if (!isObject(bone)) throw new Error("Sprite bone data is invalid."); assertText(bone.id, "Sprite bone id", 128); assertText(bone.name, "Sprite bone name", 128); if (bone.parentId !== undefined) assertText(bone.parentId, "Sprite bone parent", 128); for (const key of ["x", "y", "length", "rotation"] as const) assertFinite(bone[key], `Sprite bone ${key}`, -100000, 100000); }
  if (project.production.annotations.length > 100000) throw new Error("Project annotations are too large.");
  for (const note of project.production.annotations) { if (!isObject(note)) throw new Error("Annotation data is invalid."); assertText(note.id, "Annotation id", 128); assertText(note.author, "Annotation author", 128); assertText(note.body, "Annotation body", 4096); assertInteger(note.frame, "Annotation frame", 0, project.timeline.durationFrames); if (typeof note.resolved !== "boolean") throw new Error(`Annotation ${note.id} resolution state is invalid.`); }

  validateProjectSettings(project);
  if (project.extensions !== undefined && !isObject(project.extensions)) throw new Error("Project extensions must be an object.");
  readProjectDeliveryPolicy(project);
  assertReferenceProject3D(project);
  if (project.extensions && Object.hasOwn(project.extensions, "hyperfocus3D")) {
    const diagnostics: Hyperfocus3DDiagnostic[] = [];
    parseDeclaration(project, undefined, diagnostics);
    if (diagnostics.length) throw new Error(`Invalid 3D declaration: ${diagnostics.map(({ pointer, message }) => `${pointer}: ${message}`).join("; ")}`);
  }
  validatePlayableSaveProject2D(project);
  validatePlayableStoryProject2D(project);
}

export function stableProjectJson(project: EditorProject) {
  return `${JSON.stringify(sortJsonKeys(project), null, 2)}\n`;
}

export function uniqueId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function entity(id: string, label: string, x: number, y: number, width: number, height: number, layer: number, color: string, accent: string, kind: EditorEntityData["kind"], extra: EditorComponent[] = []): EditorEntityData {
  return { id, label, x, y, width, height, scale: 1, layer, color, accent, kind, components: [component(`${id}-transform`, "transform", { x, y, scale: 1 }), component(`${id}-sprite`, "sprite", { asset: "generated", tint: color }), ...extra] };
}

function component(id: string, type: EditorComponent["type"], values: EditorComponent["values"]): EditorComponent {
  return { id, type, enabled: true, values };
}

function timelineTrack(id: string, targetId: string, label: string, property: EditorTimelineTrack["property"], color: string, values: Array<[number, number]>): EditorTimelineTrack {
  return { id, targetId, label, property, color, muted: false, locked: false, keyframes: values.map(([frame, value], index) => ({ id: `${id}-key-${index}`, frame, value, easing: "ease-in-out" })) };
}
