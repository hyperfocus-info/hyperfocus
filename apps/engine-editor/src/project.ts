import { validatePlayableSaveProject2D } from "../../../engine/src/project/runtime-save-2d.ts";
import { validatePlayableStoryProject2D } from "../../../engine/src/project/runtime-story-2d.ts";

export const EDITOR_PROJECT_VERSION = 2;
const PROJECT_FORMAT = "catalog-engine-editor-project" as const;
const LEGACY_PROJECT_FORMAT = "catalog-engine-project";
const MAX_SCENES = 128;
const MAX_ENTITIES = 10_000;
const MAX_TILE_CELLS = 1_048_576;

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
  layer: number;
  color: string;
  accent: string;
  kind: "prop" | "actor" | "hostile";
  parentId?: string;
  components: EditorComponent[];
};

export type EditorAsset = {
  id: string;
  name: string;
  kind: "image" | "audio" | "data" | "font" | "unknown";
  mimeType: string;
  size: number;
  lastModified: number;
  source: "imported" | "generated";
  /** Content address in `.hyperfocus/assets.hfp`; populated for portable imported assets. */
  sha256?: string;
  objectUrl?: string;
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
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bounce";
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

export type EditorAudioTrack = {
  id: string;
  name: string;
  assetId?: string;
  startFrame: number;
  durationFrames: number;
  trimStart: number;
  trimEnd: number;
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
    loopStart: number;
    loopEnd: number;
    playbackSpeed: number;
    tracks: EditorTimelineTrack[];
    audioTracks: EditorAudioTrack[];
    events: EditorAnimationEvent[];
  };
  production: {
    export: { width: number; height: number; fps: number; codec: "vp8" | "vp9"; preset: string };
    reactiveBindings: EditorReactiveBinding[];
    midiMappings: EditorMidiMapping[];
    logicGraph: { nodes: EditorLogicNode[]; edges: Array<{ id: string; from: string; to: string }> };
    spriteRig: { bones: EditorSpriteBone[]; poses: Array<{ id: string; name: string; rotations: Record<string, number> }> };
    annotations: EditorAnnotation[];
  };
  settings: {
    targetProfile: "desktop" | "mobile" | "low-power";
    locale: string;
    uiScale: number;
    reducedMotion: boolean;
    masterVolume: number;
    input: Array<{ action: string; bindings: string[] }>;
  };
  layout: {
    sidebarWidth: number;
    sidebarCollapsed: boolean;
  };
  /** Optional portable feature declarations; user save payloads never live here. */
  extensions?: Record<string, unknown>;
};

export type HistoryEntry = {
  label: string;
  at: string;
};

type StoredSnapshot = HistoryEntry & { project: EditorProject };

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
  const values = Array.from({ length: 16 * 10 }, (_, index) => {
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
    tilemap: { id: "tilemap-main", name: "Dungeon Terrain", columns: 16, rows: 10, tileSize: 48, values, solidValues: [3] },
    atlas: { id: "atlas-hero", name: "Hero Actions", sourceAssetId: "asset-hero", frameWidth: 128, frameHeight: 160, playbackSpeed: 1, frames: atlasFrames, sequence: atlasFrames.slice(0, 4).map((frame) => frame.id) },
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
    },
    production: {
      export: { width: 1920, height: 1080, fps: 30, codec: "vp8", preset: "YouTube 1080p" },
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
      uiScale: 1,
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
    layout: { sidebarWidth: 244, sidebarCollapsed: false },
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
  const fallback = createDefaultProject(typeof value.name === "string" ? value.name : "Imported Project");
  const project = { ...fallback, ...(clone(value) as Partial<EditorProject>) } as EditorProject;
  project.format = PROJECT_FORMAT;
  project.version = EDITOR_PROJECT_VERSION;
  project.updatedAt = new Date().toISOString();
  project.settings = { ...fallback.settings, ...(isObject(value.settings) ? value.settings : {}) } as EditorProject["settings"];
  project.layout = { ...fallback.layout, ...(isObject(value.layout) ? value.layout : {}) } as EditorProject["layout"];
  project.tilemap = { ...fallback.tilemap, ...(isObject(value.tilemap) ? value.tilemap : {}) } as EditorProject["tilemap"];
  if (!Object.prototype.hasOwnProperty.call(value, "extensions")) delete project.extensions;
  validateProject(project);
  return project;
}

export function validateProject(project: EditorProject) {
  if (!isObject(project) || project.format !== PROJECT_FORMAT) throw new Error("Project format is invalid.");
  if (project.version !== EDITOR_PROJECT_VERSION) throw new Error("Project version is invalid.");
  assertText(project.id, "Project id", 128);
  assertText(project.name, "Project name", 256);
  assertText(project.activeSceneId, "Active scene id", 128);
  if (!Array.isArray(project.scenes) || project.scenes.length === 0 || project.scenes.length > MAX_SCENES) throw new Error(`A project must contain 1–${MAX_SCENES} scenes.`);
  if (!Array.isArray(project.assets) || project.assets.length > 5_000) throw new Error("Project asset catalog is invalid or too large.");
  if (!isObject(project.tilemap) || !isObject(project.atlas) || !isObject(project.postProcessing) || !isObject(project.timeline) || !isObject(project.production) || !isObject(project.settings) || !isObject(project.layout)) throw new Error("Project sections are incomplete.");

  const sceneIds = new Set<string>();
  const entityIds = new Set<string>();
  let entityCount = 0;
  for (const scene of project.scenes) {
    if (!isObject(scene)) throw new Error("Scene data is invalid.");
    assertText(scene.id, "Scene id", 128);
    assertText(scene.name, "Scene name", 256);
    if (sceneIds.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}`);
    sceneIds.add(scene.id);
    if (!Array.isArray(scene.entities)) throw new Error(`Scene ${scene.id} has invalid entities.`);
    entityCount += scene.entities.length;
    if (entityCount > MAX_ENTITIES) throw new Error(`Projects may contain at most ${MAX_ENTITIES} entities.`);
    const localIds = new Set<string>();
    for (const candidate of scene.entities) {
      validateEntity(candidate);
      if (entityIds.has(candidate.id)) throw new Error(`Duplicate entity id: ${candidate.id}`);
      entityIds.add(candidate.id);
      localIds.add(candidate.id);
    }
    const parents = new Map(scene.entities.map((entity) => [entity.id, entity.parentId]));
    for (const candidate of scene.entities) {
      if (candidate.parentId && !localIds.has(candidate.parentId)) throw new Error(`Entity ${candidate.id} references a missing parent.`);
      const ancestry = new Set([candidate.id]);
      let parentId = candidate.parentId;
      while (parentId) {
        if (ancestry.has(parentId)) throw new Error(`Entity parenting cycle includes ${candidate.id}.`);
        ancestry.add(parentId);
        parentId = parents.get(parentId);
      }
    }
  }
  if (!sceneIds.has(project.activeSceneId)) throw new Error("The active scene does not exist.");

  for (const asset of project.assets) {
    if (!isObject(asset)) throw new Error("Asset metadata is invalid.");
    assertText(asset.id, "Asset id", 128);
    assertText(asset.name, "Asset name", 512);
    assertText(asset.mimeType, "Asset MIME type", 256);
    if (!(["image", "audio", "data", "font", "unknown"] as unknown[]).includes(asset.kind)) throw new Error(`Asset ${asset.id} has an invalid kind.`);
    if (!(["imported", "generated"] as unknown[]).includes(asset.source)) throw new Error(`Asset ${asset.id} has an invalid source.`);
    if (asset.sha256 !== undefined && !/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error(`Asset ${asset.id} has an invalid SHA-256 content address.`);
    assertFinite(asset.size, `Asset ${asset.id} size`, 0, 10_000_000_000);
    assertFinite(asset.lastModified, `Asset ${asset.id} timestamp`, 0, 10_000_000_000_000);
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

  assertFinite(project.atlas.frameWidth, "Atlas frame width", 1, 16_384);
  assertFinite(project.atlas.frameHeight, "Atlas frame height", 1, 16_384);
  assertFinite(project.atlas.playbackSpeed, "Atlas playback speed", 0.01, 100);
  if (!Array.isArray(project.atlas.frames) || project.atlas.frames.length > 10_000 || !Array.isArray(project.atlas.sequence)) throw new Error("Atlas frame data is invalid or too large.");
  const frameIds = new Set<string>();
  for (const frame of project.atlas.frames) {
    if (!isObject(frame)) throw new Error("Atlas frame data is invalid.");
    assertText(frame.id, "Atlas frame id", 128);
    assertText(frame.name, "Atlas frame name", 256);
    for (const key of ["x", "y", "width", "height"] as const) assertFinite(frame[key], `Atlas frame ${key}`, key === "width" || key === "height" ? 1 : 0, 1_000_000);
    assertColor(frame.color, `Atlas frame ${frame.id} color`);
    if (frameIds.has(frame.id)) throw new Error(`Duplicate atlas frame id: ${frame.id}`);
    frameIds.add(frame.id);
  }
  if (project.atlas.sequence.length > 100_000 || project.atlas.sequence.some((id) => !frameIds.has(id))) throw new Error("Atlas sequence references an unknown frame or is too large.");

  if (!Array.isArray(project.postProcessing.effects) || project.postProcessing.effects.length > 64) throw new Error("Post-processing stack is invalid or too large.");
  assertFinite(project.postProcessing.frameBudgetMs, "Frame budget", 1, 1_000);
  assertFinite(project.postProcessing.allocationMs, "FX allocation", 0, project.postProcessing.frameBudgetMs);
  for (const effect of project.postProcessing.effects) {
    if (!isObject(effect)) throw new Error("Post-processing effect is invalid.");
    assertText(effect.id, "Effect id", 128);
    if (typeof effect.enabled !== "boolean") throw new Error(`Effect ${effect.id} enabled state is invalid.`);
    assertFinite(effect.value, `Effect ${effect.id} value`, -1_000_000, 1_000_000);
  }

  assertFinite(project.timeline.fps, "Timeline frame rate", 1, 240);
  assertInteger(project.timeline.durationFrames, "Timeline duration", 1, 1_000_000);
  assertFinite(project.timeline.bpm, "Timeline BPM", 20, 400);
  assertInteger(project.timeline.beatsPerBar, "Timeline beats per bar", 1, 32);
  assertInteger(project.timeline.loopStart, "Timeline loop start", 0, project.timeline.durationFrames);
  assertInteger(project.timeline.loopEnd, "Timeline loop end", project.timeline.loopStart, project.timeline.durationFrames);
  assertFinite(project.timeline.playbackSpeed, "Timeline playback speed", .05, 8);
  if (!Array.isArray(project.timeline.tracks) || project.timeline.tracks.length > 2_048) throw new Error("Timeline tracks are invalid or too large.");
  if (!Array.isArray(project.timeline.audioTracks) || project.timeline.audioTracks.length > 256) throw new Error("Timeline audio tracks are invalid or too large.");
  if (!Array.isArray(project.timeline.events) || project.timeline.events.length > 100_000) throw new Error("Timeline events are invalid or too large.");
  const timelineIds = new Set<string>();
  for (const track of project.timeline.tracks) {
    if (!isObject(track) || !Array.isArray(track.keyframes)) throw new Error("Timeline track data is invalid.");
    assertText(track.id, "Timeline track id", 128); assertText(track.targetId, "Timeline target", 128); assertText(track.label, "Timeline track label", 256); assertColor(track.color, `Timeline track ${track.id} color`);
    if (timelineIds.has(track.id)) throw new Error(`Duplicate timeline track id: ${track.id}`); timelineIds.add(track.id);
    if (!( ["x", "y", "scale", "rotation", "opacity", "camera"] as unknown[]).includes(track.property) || typeof track.muted !== "boolean" || typeof track.locked !== "boolean") throw new Error(`Timeline track ${track.id} is invalid.`);
    for (const key of track.keyframes) {
      if (!isObject(key)) throw new Error(`Timeline track ${track.id} contains an invalid key.`);
      assertText(key.id, "Keyframe id", 128); assertInteger(key.frame, "Keyframe frame", 0, project.timeline.durationFrames); assertFinite(key.value, "Keyframe value", -1_000_000_000, 1_000_000_000);
      if (!( ["linear", "ease-in", "ease-out", "ease-in-out", "bounce"] as unknown[]).includes(key.easing)) throw new Error(`Keyframe ${key.id} has an invalid easing.`);
    }
  }
  for (const audio of project.timeline.audioTracks) {
    if (!isObject(audio)) throw new Error("Timeline audio track data is invalid.");
    assertText(audio.id, "Audio track id", 128); assertText(audio.name, "Audio track name", 512);
    for (const key of ["startFrame", "durationFrames", "trimStart", "trimEnd", "fadeIn", "fadeOut", "loopStart", "loopEnd"] as const) assertFinite(audio[key], `Audio track ${audio.id} ${key}`, 0, project.timeline.durationFrames);
    assertFinite(audio.volume, `Audio track ${audio.id} volume`, 0, 2); assertFinite(audio.pan, `Audio track ${audio.id} pan`, -1, 1);
    if (typeof audio.muted !== "boolean" || typeof audio.solo !== "boolean") throw new Error(`Audio track ${audio.id} mixer state is invalid.`);
  }
  for (const event of project.timeline.events) {
    if (!isObject(event)) throw new Error("Timeline event data is invalid.");
    assertText(event.id, "Timeline event id", 128); assertText(event.label, "Timeline event label", 256); assertInteger(event.frame, "Timeline event frame", 0, project.timeline.durationFrames);
    if (!( ["audio", "logic", "camera", "marker"] as unknown[]).includes(event.kind)) throw new Error(`Timeline event ${event.id} has an invalid kind.`);
  }

  if (!isObject(project.production.export) || !Array.isArray(project.production.reactiveBindings) || !Array.isArray(project.production.midiMappings) || !isObject(project.production.logicGraph) || !isObject(project.production.spriteRig) || !Array.isArray(project.production.annotations)) throw new Error("Production authoring data is incomplete.");
  assertInteger(project.production.export.width, "Export width", 16, 8192); assertInteger(project.production.export.height, "Export height", 16, 8192); assertFinite(project.production.export.fps, "Export frame rate", 1, 240);
  if (!( ["vp8", "vp9"] as unknown[]).includes(project.production.export.codec)) throw new Error("Export codec is invalid."); assertText(project.production.export.preset, "Export preset", 128);
  if (project.production.reactiveBindings.length > 512 || project.production.midiMappings.length > 512) throw new Error("Automation mappings are too large.");
  for (const binding of project.production.reactiveBindings) { if (!isObject(binding)) throw new Error("Reactive binding data is invalid."); assertText(binding.id, "Reactive binding id", 128); assertText(binding.targetId, "Reactive binding target", 128); assertFinite(binding.gain, "Reactive binding gain", -10000, 10000); assertFinite(binding.smoothing, "Reactive binding smoothing", 0, 1); if (typeof binding.enabled !== "boolean") throw new Error(`Reactive binding ${binding.id} enabled state is invalid.`); }
  for (const mapping of project.production.midiMappings) { if (!isObject(mapping)) throw new Error("MIDI mapping data is invalid."); assertText(mapping.id, "MIDI mapping id", 128); assertInteger(mapping.channel, "MIDI channel", 1, 16); assertInteger(mapping.control, "MIDI control", 0, 127); assertText(mapping.targetId, "MIDI mapping target", 128); assertFinite(mapping.minimum, "MIDI mapping minimum", -1000000, 1000000); assertFinite(mapping.maximum, "MIDI mapping maximum", -1000000, 1000000); }
  if (!Array.isArray(project.production.logicGraph.nodes) || !Array.isArray(project.production.logicGraph.edges) || project.production.logicGraph.nodes.length > 2048 || project.production.logicGraph.edges.length > 8192) throw new Error("Logic graph is invalid or too large.");
  for (const node of project.production.logicGraph.nodes) { if (!isObject(node) || !isObject(node.config)) throw new Error("Logic node data is invalid."); assertText(node.id, "Logic node id", 128); assertText(node.label, "Logic node label", 256); assertFinite(node.x, "Logic node x", -100000, 100000); assertFinite(node.y, "Logic node y", -100000, 100000); }
  if (!Array.isArray(project.production.spriteRig.bones) || !Array.isArray(project.production.spriteRig.poses) || project.production.spriteRig.bones.length > 512) throw new Error("Sprite rig data is invalid or too large.");
  for (const bone of project.production.spriteRig.bones) { if (!isObject(bone)) throw new Error("Sprite bone data is invalid."); assertText(bone.id, "Sprite bone id", 128); assertText(bone.name, "Sprite bone name", 128); if (bone.parentId !== undefined) assertText(bone.parentId, "Sprite bone parent", 128); for (const key of ["x", "y", "length", "rotation"] as const) assertFinite(bone[key], `Sprite bone ${key}`, -100000, 100000); }
  if (project.production.annotations.length > 100000) throw new Error("Project annotations are too large.");
  for (const note of project.production.annotations) { if (!isObject(note)) throw new Error("Annotation data is invalid."); assertText(note.id, "Annotation id", 128); assertText(note.author, "Annotation author", 128); assertText(note.body, "Annotation body", 4096); assertInteger(note.frame, "Annotation frame", 0, project.timeline.durationFrames); if (typeof note.resolved !== "boolean") throw new Error(`Annotation ${note.id} resolution state is invalid.`); }

  if (!(["desktop", "mobile", "low-power"] as unknown[]).includes(project.settings.targetProfile)) throw new Error("Target profile is invalid.");
  assertText(project.settings.locale, "Locale", 64);
  assertFinite(project.settings.uiScale, "Editor UI scale", 0.75, 2);
  assertFinite(project.settings.masterVolume, "Master volume", 0, 1);
  if (typeof project.settings.reducedMotion !== "boolean" || !Array.isArray(project.settings.input) || project.settings.input.length > 256) throw new Error("Editor settings are invalid.");
  for (const mapping of project.settings.input) {
    if (!isObject(mapping) || !Array.isArray(mapping.bindings) || mapping.bindings.length > 32) throw new Error("Input mapping is invalid.");
    assertText(mapping.action, "Input action", 128);
    for (const binding of mapping.bindings) assertText(binding, `Binding for ${mapping.action}`, 128);
  }
  assertFinite(project.layout.sidebarWidth, "Sidebar width", 180, 600);
  if (typeof project.layout.sidebarCollapsed !== "boolean") throw new Error("Sidebar collapsed state is invalid.");
  if (project.extensions !== undefined && !isObject(project.extensions)) throw new Error("Project extensions must be an object.");
  validatePlayableSaveProject2D(project);
  validatePlayableStoryProject2D(project);
}

export function stableProjectJson(project: EditorProject) {
  return `${JSON.stringify(sortKeys(project), null, 2)}\n`;
}

export class ProjectHistory {
  private current: EditorProject;
  private undoStack: StoredSnapshot[] = [];
  private redoStack: StoredSnapshot[] = [];
  private listeners = new Set<() => void>();
  private savedJson: string;
  readonly changes: HistoryEntry[] = [];

  constructor(project: EditorProject, private readonly limit = 80) {
    this.current = clone(project);
    this.savedJson = stableProjectJson(this.current);
  }

  get project() { return this.current; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get dirty() { return stableProjectJson(this.current) !== this.savedJson; }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  transact(label: string, update: (draft: EditorProject) => void) {
    const before = clone(this.current);
    const next = clone(this.current);
    update(next);
    next.updatedAt = new Date().toISOString();
    validateProject(next);
    if (stableProjectJson(before) === stableProjectJson(next)) return;
    this.undoStack.push({ label, at: next.updatedAt, project: before });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.current = next;
    this.changes.unshift({ label, at: next.updatedAt });
    if (this.changes.length > this.limit) this.changes.pop();
    this.emit();
  }

  replace(project: EditorProject, label = "Open project") {
    const migrated = migrateProject(project);
    this.undoStack.push({ label, at: new Date().toISOString(), project: clone(this.current) });
    this.redoStack = [];
    this.current = migrated;
    this.changes.unshift({ label, at: migrated.updatedAt });
    this.emit();
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, at: new Date().toISOString(), project: clone(this.current) });
    this.current = entry.project;
    this.changes.unshift({ label: `Undo: ${entry.label}`, at: new Date().toISOString() });
    this.emit();
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, at: new Date().toISOString(), project: clone(this.current) });
    this.current = entry.project;
    this.changes.unshift({ label: `Redo: ${entry.label}`, at: new Date().toISOString() });
    this.emit();
    return true;
  }

  markSaved() {
    this.savedJson = stableProjectJson(this.current);
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
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

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateEntity(candidate: EditorEntityData) {
  if (!isObject(candidate)) throw new Error("Entity data is invalid.");
  assertText(candidate.id, "Entity id", 128);
  assertText(candidate.label, `Entity ${candidate.id} label`, 256);
  if (candidate.parentId !== undefined) assertText(candidate.parentId, `Entity ${candidate.id} parent`, 128);
  if (!(["prop", "actor", "hostile"] as unknown[]).includes(candidate.kind)) throw new Error(`Entity ${candidate.id} has an invalid kind.`);
  for (const key of ["x", "y"] as const) assertFinite(candidate[key], `Entity ${candidate.id} ${key}`, -10_000_000, 10_000_000);
  for (const key of ["width", "height", "scale"] as const) assertFinite(candidate[key], `Entity ${candidate.id} ${key}`, 0.001, 1_000_000);
  assertInteger(candidate.layer, `Entity ${candidate.id} layer`, -10_000, 10_000);
  assertColor(candidate.color, `Entity ${candidate.id} color`);
  assertColor(candidate.accent, `Entity ${candidate.id} accent`);
  if (!Array.isArray(candidate.components) || candidate.components.length > 64) throw new Error(`Entity ${candidate.id} has invalid components.`);
  const componentIds = new Set<string>();
  for (const item of candidate.components) {
    if (!isObject(item) || !isObject(item.values)) throw new Error(`Entity ${candidate.id} has an invalid component.`);
    assertText(item.id, "Component id", 128);
    if (componentIds.has(item.id)) throw new Error(`Duplicate component id on ${candidate.id}: ${item.id}`);
    componentIds.add(item.id);
    if (!(["transform", "sprite", "collider", "input", "behavior", "camera", "audio", "ui"] as unknown[]).includes(item.type)) throw new Error(`Component ${item.id} has an invalid type.`);
    if (typeof item.enabled !== "boolean" || Object.keys(item.values).length > 128) throw new Error(`Component ${item.id} is invalid or too large.`);
    for (const [key, value] of Object.entries(item.values)) {
      assertText(key, `Component ${item.id} value name`, 128);
      if (typeof value === "number") assertFinite(value, `Component ${item.id}.${key}`, -1_000_000_000, 1_000_000_000);
      else if (typeof value !== "string" && typeof value !== "boolean") throw new Error(`Component ${item.id}.${key} must be a primitive value.`);
      else if (typeof value === "string" && value.length > 4_096) throw new Error(`Component ${item.id}.${key} is too long.`);
    }
  }
}

function assertText(value: unknown, label: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label} must be a non-empty string no longer than ${maxLength} characters.`);
}

function assertFinite(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
}

function assertInteger(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  assertFinite(value, label, minimum, maximum);
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
}

function assertColor(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${label} must be a six-digit hexadecimal color.`);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}
