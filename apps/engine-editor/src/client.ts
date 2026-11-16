import { atlasColor, formatMotionTime } from "./utils/client-values";
import { editorSelect, initializeEditorSelects, selectEventValue } from "./components/editor-select-controls";
import { authoredEntityKind, resolvePlayableActions } from './app/client-model';
import type { WorkspaceId, BrushMode, TileId, EditorEntity, EffectId, EffectConfig, EditorAutomation } from './app/client-model';
import { requireElement, setText, escapeMarkup, requireRenderableTarget } from './app/client-dom';
import { AmbientLight, Bone, BoxGeometry, Color as ThreeColor, DirectionalLight, GridHelper, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Scene as ThreeScene, Skeleton, Vector3, WebGLRenderer } from "three";
import { checkPostProcessBudget, createBrowserApp, createCanvasObjectEvents, createCollisionKernel, createKeyboardActions, createPostProcessStack, createStage, createTileMap, createTileset, crtScanlines, drawSpriteBatch, extractCollisionRects, getPostProcessEffectCost, grayscale, popTransform, postProcessCosts, pushTransform, registerSprite, screenShake, sepia, threshold, type CollisionKernel, type PostProcessEffect } from "@hyperfocus/engine";
import { defineSchema, encodeDelta } from "@hyperfocus/engine/protocol";
import {
  createRenderFramePool,
  drawRenderable,
  renderArray,
} from "@hyperfocus/engine/render";
import { createInterestGrid, type InterestEntity } from "@hyperfocus/engine/server";
import {
  createThreeHumanoidMotionController,
  type ThreeHumanoidMotionController,
} from "@hyperfocus/engine/motion/three";
import { createEditorShell, type EditorShell } from "./editor-shell.ts";
import { createEditorAgentBridge } from "./editor-agent-protocol.ts";
import type {   EditorKeyframe, EditorProject, EditorSpriteBone, EditorTimelineTrack } from "@hyperfocus/engine/project";
import { encodeCanvasSequenceWebM } from "./webm-export.ts";
import { encodeCanvasSequenceMp4 } from "./export/mp4-export.ts";
import { decodeAndMixTimelineAudio } from "./export/timeline-audio-mix.ts";
import { createPlayableWorld, playableBehaviorDefinition2D, type PlayableBehaviorDefinition2D, type PlayableWorld, type PlayableWorldSnapshot } from "@hyperfocus/engine/project/runtime-2d";
import { createNavigationBehaviorRegistry2D } from "@hyperfocus/engine/project/runtime-navigation-2d";
import { createPlayableEditorPlaySession2D } from "@hyperfocus/engine/project/runtime-save-2d";
import { createPlayableStoryController2D, readPlayableStoryDeclaration2D, type PlayableStoryController2D } from "@hyperfocus/engine/project/runtime-story-2d";
import { applyTimelineOverrides2D, auditPlayableTimeline2D, createPlayableTimeline2D, type PlayableTimeline2D } from "@hyperfocus/engine/project/runtime-timeline-2d";
import { createLiveSourceCompiler } from "./live-source.ts";
import { createStandaloneAudioController, type StandaloneAudioAsset } from "./standalone-audio.ts";
import { duplicateEditorAtlasFrame, duplicateEditorAtlasSequenceEntry, removeEditorAtlasFrame, removeEditorAtlasSequenceEntry, sampleAtlasClipFrame, sliceEditorAtlasGrid, updateEditorAtlasFrame } from "./editor-atlas-model.ts";
import { assignEditorTileset, commitExtractedTileCollision, resizeEditorTilemap, setEditorTileSolid } from "./editor-tilemap-model.ts";
import { createEditor3DPlaySession, type Editor3DPlaySession } from "./editor-3d-play.ts";
import { readHyperfocus3DDeclaration, type PortableAsset3D } from "@hyperfocus/engine/project/runtime-3d";
import { createRejectingFetch, isMidiAccess, isOneOf, requireArrayItem, requireDataset, requireDescendant, requireEventCurrentTarget, requireInitialized, requireMapValue, requireOneOf, toEditorComponents } from "./app/client-runtime-guards.ts";
import { benchmarkCollisionKernels } from "./performance/kernel-benchmark.ts";
import { createTimelineAuthoringPanels } from "./motion/timeline-authoring-panels.ts";
import { drawTimelineEffects2D, timelineCameraShake2D, timelineClipAtFrame2D, withTimelinePreviewFrame2D } from "./motion/timeline-preview.ts";
import { openTimelineLocalMenu } from "./motion/timeline-local-menu.ts";
import { renderTimelineAudioClip, renderTimelineGuides, updateTimelinePlayheadView } from "./motion/timeline-presentation.ts";
import { createTimelineEditActions } from "./motion/timeline-edit-actions.ts";
import { bindTimelineEditor } from "./motion/timeline-editor-bindings.ts";

initializeEditorSelects();
const stageCanvas = requireElement<HTMLCanvasElement>("#stage-canvas");
const stageContext = require2dContext(stageCanvas, true);
const scene3dCanvas = requireElement<HTMLCanvasElement>("#scene3d-canvas");
const rigCanvas = requireElement<HTMLCanvasElement>("#rig-canvas");
const rigContext = require2dContext(rigCanvas);
const rawPostCanvas = requireElement<HTMLCanvasElement>("#post-preview-raw");
const activePostCanvas = requireElement<HTMLCanvasElement>("#post-preview-active");
const rawPostContext = require2dContext(rawPostCanvas);
const activePostContext = require2dContext(activePostCanvas, true);
const frameCanvas = requireElement<HTMLCanvasElement>("#frame-graph");
const frameContext = require2dContext(frameCanvas);
const aoiCanvas = requireElement<HTMLCanvasElement>("#aoi-canvas");
const aoiContext = require2dContext(aoiCanvas);
const tilemapCanvas = requireElement<HTMLCanvasElement>("#tilemap-canvas");
const tilemapContext = require2dContext(tilemapCanvas);
const atlasCanvas = requireElement<HTMLCanvasElement>("#atlas-canvas");
const atlasContext = require2dContext(atlasCanvas);
const animationCanvas = requireElement<HTMLCanvasElement>("#animation-canvas");
const animationContext = require2dContext(animationCanvas);
const exportPreviewCanvas = requireElement<HTMLCanvasElement>("#export-preview-canvas");
const exportPreviewContext = require2dContext(exportPreviewCanvas, true);
const fftCanvas = requireElement<HTMLCanvasElement>("#fft-canvas");
const fftContext = require2dContext(fftCanvas);
const spriteRigCanvas = requireElement<HTMLCanvasElement>("#sprite-rig-canvas");
const spriteRigContext = require2dContext(spriteRigCanvas);
const reviewCanvas = requireElement<HTMLCanvasElement>("#review-canvas");
const reviewContext = require2dContext(reviewCanvas, true);
const activeGameCanvas = document.createElement("canvas");
activeGameCanvas.width = 760;
activeGameCanvas.height = 480;
const activeGameContext = require2dContext(activeGameCanvas);

let activeWorkspace: WorkspaceId = "stage";
let selectedEntityId: string | null = "player-01";
let selectedTile: TileId = 0;
let copiedTile: TileId | undefined;
let brushMode: BrushMode = "paint";
let loopPaused = false;
let postBypassed = false;
let injectedLatencyMs = 0;
let draggedEffectIndex: number | null = null;
let manualSteps = 0;
let heavyPostPasses = 0;
let worldGridVisible = true;
let zeroCalibrationArmed = false;
let canvasResizeCommits = 0;
let wasmFallbackActive = false;
let wasmFallbackReason = "";
const selectedEntityIds = new Set<string>(["player-01"]);
const stageViewport = { zoom: 1, cameraX: 0, cameraY: 0 };
let frameCount = 0;
let lastFpsSampleAt = performance.now();
let lastFpsSampleFrame = 0;
let measuredFps = 60;
let clampEvents = 0;
const frameTimes: number[] = [];
const clampTimes: number[] = [];
let previousFrameTelemetryAt: number | undefined;

const effectConfigs: EffectConfig[] = [
  { id: "grayscale", label: "Grayscale", tier: "pixel pass", enabled: false, value: 0.65, min: 0, max: 1, step: 0.05, unit: "%" },
  { id: "sepia", label: "Sepia", tier: "pixel pass", enabled: true, value: 0.28, min: 0, max: 1, step: 0.05, unit: "%" },
  { id: "crt", label: "CRT Scanlines", tier: "overlay pass", enabled: true, value: 0.2, min: 0.05, max: 0.6, step: 0.01, unit: "%" },
  { id: "shake", label: "Screen Shake", tier: "distortion / 2 passes", enabled: false, value: 4, min: 0, max: 16, step: 1, unit: "px" },
  { id: "threshold", label: "Threshold", tier: "pixel pass", enabled: false, value: 132, min: 20, max: 235, step: 1, unit: "" },
];
const playAndBuildEffectIds = new Set<EffectId>(["grayscale", "sepia", "crt", "shake", "threshold"]);

const tileValues: TileId[] = Array.from({ length: 40 }, (_, index) => {
  if (index === 6 || index === 14 || index === 33) return 2;
  if (index % 7 === 0 || index === 18) return 1;
  if (index > 31) return 3;
  return 0;
});

let mapColumns = 16;
let mapRows = 10;
let mapTileSize = 48;
let tileSolidValues: number[] = [3];
const mapTileValues: TileId[] = Array.from({ length: mapColumns * mapRows }, (_, index) => {
  const column = index % mapColumns;
  const row = Math.floor(index / mapColumns);
  if (row === 0 || row === mapRows - 1 || column === 0 || column === mapColumns - 1) return 3;
  if ((column + row * 3) % 13 === 0) return 1;
  if ((column === 7 || column === 8) && row >= 3 && row <= 5) return 2;
  return 0;
});
type TileSelection = { startColumn: number; startRow: number; endColumn: number; endRow: number };
let tileSelection: TileSelection | null = null;
let tileDragStart: { column: number; row: number } | null = null;
let tilePointerDown = false;
let extractedRects: Array<{ x: number; y: number; w: number; h: number }> = [];
let eyedropperHeld = false;

type AtlasFrame = { id: string; name: string; x: number; y: number; width: number; height: number; color: string };
type AtlasClip = { id: string; name: string; sequence: string[]; fps: number; loop: boolean };
let atlasFrames: AtlasFrame[] = [];
let selectedAtlasFrame = 0;
let selectedAtlasFrames = new Set<number>([0]);
let animationSequence: AtlasFrame[] = [];
let animationClips: AtlasClip[] = [];
let activeAnimationClipId = "default";
let draggedSourceFrames: number[] | null = null;
let atlasPlaybackSpeed = 1;
let atlasElapsed = 0;
let atlasManualSlicing = false;
let atlasDragStart: { x: number; y: number } | null = null;
let atlasDraftRect: { x: number; y: number; width: number; height: number } | null = null;
let draggedAtlasIndex: number | null = null;
let atlasSourceAssetId: string | undefined;
let tilemapSourceAssetId: string | undefined;
let currentProjectAssets: EditorProject["assets"] = [];
let editorShell: EditorShell | undefined;
const liveSourceCompiler = createLiveSourceCompiler();
let editorPlayRequest = 0;
let stageTool: "select" | "pan" = "select";
let motionTool: "pose" | "ik" = "ik";
let playableWorld: PlayableWorld | undefined;
let playableTimeline: PlayableTimeline2D | undefined;
let playableProject: EditorProject | undefined;
let playableStory: PlayableStoryController2D | undefined;
let playableAudio: ReturnType<typeof createStandaloneAudioController> | undefined;
let playableSceneId: string | undefined;
let editor3DPlaySession: Editor3DPlaySession | undefined;
let editor3DPlayAbort: AbortController | undefined;
let currentStarterTemplate = "";
const editorPlaySaves = createPlayableEditorPlaySession2D();
const playableBindings = new Set<string>();
let scene3dRenderer: WebGLRenderer | undefined;
let scene3dScene: ThreeScene | undefined;
let scene3dCamera: PerspectiveCamera | undefined;
const scene3dMeshes = new Map<string, Mesh<BoxGeometry, MeshStandardMaterial>>();
const assetPreviewImages = new Map<string, HTMLImageElement>();
const assetPreviewUrls = new Map<string, string>();
const assetRuntimeBlobs = new Map<string, Blob>();
let renderingGameOutput = false;
let renderingTimelineFrame: number | undefined;

async function createPlayableAudio(project: EditorProject) {
  const assets: StandaloneAudioAsset[] = [];
  for (const asset of project.assets) {
    if (asset.kind !== "audio") continue;
    const objectUrl = assetPreviewUrls.get(asset.id);
    if (!objectUrl) {
      logEvent(`play audio → ${asset.name} has no loaded preview bytes; reimport the asset before Play`);
      continue;
    }
    try {
      const response = await fetch(objectUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      assets.push({ id: asset.id, mimeType: asset.mimeType, bytes: new Uint8Array(await response.arrayBuffer()) });
    } catch (cause) {
      logEvent(`play audio → ${asset.name} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return createStandaloneAudioController(assets, {
    masterVolume: project.settings.masterVolume,
    onError: (error) => logEvent(`play audio → ${error.message}`),
  });
}

function unlockPlayableAudio() {
  void playableAudio?.unlockAndFlush().catch((cause) => logEvent(`play audio unlock → ${cause instanceof Error ? cause.message : String(cause)}`));
}

function disposePlayableAudio() {
  const controller = playableAudio;
  playableAudio = undefined;
  if (controller) void controller.dispose();
}

const entities: EditorEntity[] = [
  { id: "torch-west", label: "Torch West", x: 168, y: 122, width: 28, height: 58, scale: 1, layer: 1, color: "#ff8e38", accent: "#ffd46c", kind: "prop" },
  { id: "torch-east", label: "Torch East", x: 560, y: 122, width: 28, height: 58, scale: 1, layer: 1, color: "#ff8e38", accent: "#ffd46c", kind: "prop" },
  { id: "player-01", label: "Player_01", x: 320, y: 242, width: 38, height: 48, scale: 1, layer: 2, color: "#42cfc5", accent: "#b9fff5", kind: "actor" },
  { id: "sentinel-a", label: "Sentinel_A", x: 475, y: 226, width: 36, height: 40, scale: 1, layer: 2, color: "#e7596e", accent: "#ffafbb", kind: "hostile" },
  { id: "sentinel-b", label: "Sentinel_B", x: 590, y: 312, width: 36, height: 40, scale: 1, layer: 2, color: "#cf4b69", accent: "#ff9daf", kind: "hostile" },
  { id: "crate-01", label: "Relic Crate", x: 214, y: 326, width: 42, height: 35, scale: 1, layer: 1, color: "#9a683f", accent: "#e9ad62", kind: "prop" },
  { id: "altar-01", label: "Signal Altar", x: 650, y: 148, width: 52, height: 42, scale: 1, layer: 1, color: "#65539c", accent: "#c4aaff", kind: "prop" },
];

const stage = createStage<EditorEntity>({
  updateEntity(entity, delta) {
    if (entity.kind !== "hostile") return;
    const seed = entity.id === "sentinel-a" ? 0 : Math.PI;
    entity.y += Math.sin(performance.now() * 0.0017 + seed) * delta * 4;
  },
  renderEntity(entity, target) {
    const calls = requireRenderableTarget(target);
    const selected = !renderingGameOutput && entity.id === selectedEntityId;
    const width = entity.width * entity.scale;
    const height = entity.height * entity.scale;
    const rotation = entity.rotation ?? 0;
    const opacity = Math.max(0, Math.min(1, entity.opacity ?? 1));
    const ui = entity.components?.find((component) => component.enabled && component.type === "ui");
    const sprite = entity.components?.find((component) => component.enabled && component.type === "sprite");
    const assetId = sprite?.values.assetId ?? sprite?.values.asset;
    const preview = typeof assetId === "string" ? assetPreviewImages.get(assetId) : undefined;
    const componentClipId = typeof sprite?.values.animationClip === "string" ? sprite.values.animationClip : undefined;
    const clipId = renderingTimelineFrame === undefined ? componentClipId : timelineClipAtFrame2D(sequenceData, entity.id, renderingTimelineFrame) ?? componentClipId;
    const atlasFrame = preview && assetId === atlasSourceAssetId
      ? currentEditorSpriteFrame(renderingTimelineFrame === undefined ? atlasElapsed : renderingTimelineFrame / sequenceData.fps, clipId)
      : undefined;
    if (ui) {
      calls.push((ctx) => {
        const stateKey = typeof ui.values.stateKey === "string" ? ui.values.stateKey : undefined;
        const stateValue = stateKey ? playableWorld?.snapshot().state?.[stateKey] : undefined;
        const text = stateValue ?? ui.values.text ?? "";
        const align: CanvasTextAlign = isOneOf(ui.values.align, ["left", "right", "center", "start", "end"]) ? ui.values.align : "center";
        const fontSize = typeof ui.values.fontSize === "number" ? Math.max(8, ui.values.fontSize) : Math.max(12, height);
        ctx.save();
        ctx.globalAlpha *= opacity;
        ctx.translate(entity.x, entity.y);
        if (rotation) ctx.rotate(rotation);
        ctx.fillStyle = entity.accent;
        ctx.font = `700 ${fontSize}px ui-monospace, monospace`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillText(String(text), 0, 0);
        ctx.restore();
      });
    } else if (preview) {
      calls.push((ctx) => {
        ctx.save();
        ctx.globalAlpha *= opacity;
        ctx.translate(entity.x, entity.y);
        if (rotation) ctx.rotate(rotation);
        ctx.imageSmoothingEnabled = true;
        if (atlasFrame) ctx.drawImage(preview, atlasFrame.x, atlasFrame.y, atlasFrame.width, atlasFrame.height, -width / 2, -height / 2, width, height);
        else ctx.drawImage(preview, -width / 2, -height / 2, width, height);
        ctx.restore();
      });
    } else if (currentStarterTemplate === "pong" && entity.id === "ball") {
      calls.push({
        kind: "circle",
        id: entity.id,
        x: entity.x,
        y: entity.y,
        radius: Math.max(4, Math.min(width, height) / 2),
        fill: entity.color,
        stroke: selected ? "#7ffff3" : entity.accent,
        lineWidth: selected ? 3 : 1,
        shadowColor: entity.color,
        shadowBlur: selected ? 18 : 8,
        alpha: opacity,
      });
    } else {
      calls.push((ctx) => {
        ctx.save();
        ctx.globalAlpha *= opacity;
        ctx.translate(entity.x, entity.y);
        if (rotation) ctx.rotate(rotation);
        ctx.fillStyle = entity.color;
        ctx.strokeStyle = selected ? "#7ffff3" : entity.accent;
        ctx.lineWidth = selected ? 3 : 1;
        ctx.shadowColor = entity.color;
        ctx.shadowBlur = selected ? 18 : 8;
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.strokeRect(-width / 2, -height / 2, width, height);
        ctx.restore();
      });
      if (currentStarterTemplate !== "pong" && entity.kind !== "prop") {
        const headOffsetX = Math.sin(rotation) * height * .28;
        const headOffsetY = -Math.cos(rotation) * height * .28;
        calls.push({
          kind: "circle",
          x: entity.x + headOffsetX,
          y: entity.y + headOffsetY,
          radius: Math.max(5, Math.min(width, height) * 0.2),
          fill: entity.accent,
          alpha: opacity * 0.9,
        });
      }
    }
    if (selected) {
      calls.push({
        kind: "outline",
        x: entity.x - width / 2 - 7,
        y: entity.y - height / 2 - 7,
        width: width + 14,
        height: height + 14,
        stroke: "#42e8dd",
        lineWidth: 1,
        shape: "rect",
      });
    }
  },
});
for (const entity of entities) stage.spawn(entity, { layer: entity.layer });

function mirrorPlayableSnapshot(snapshot: PlayableWorldSnapshot) {
  const nextById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
  let structureChanged = playableSceneId !== snapshot.sceneId;
  playableSceneId = snapshot.sceneId;
  if (playableProject) playableProject.activeSceneId = snapshot.sceneId;

  for (let index = entities.length - 1; index >= 0; index -= 1) {
    const entity = entities[index];
    if (!entity) continue;
    if (nextById.has(entity.id)) continue;
    stage.remove(entity);
    entities.splice(index, 1);
    structureChanged = true;
  }

  const existingById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const source of snapshot.entities) {
    let entity = existingById.get(source.id);
    if (!entity) {
      entity = {
        id: source.id,
        label: source.label,
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        scale: source.scale,
        ...(source.rotation !== undefined ? { rotation: source.rotation } : {}),
        ...(source.opacity !== undefined ? { opacity: source.opacity } : {}),
        layer: source.layer,
        color: source.color,
        accent: source.accent,
        kind: source.kind,
        ...(source.parentId ? { parentId: source.parentId } : {}),
        components: toEditorComponents(source.components ?? []),
      };
      entities.push(entity);
      stage.spawn(entity, { layer: source.layer });
      bindStageEntityEvents(entity);
      existingById.set(entity.id, entity);
      structureChanged = true;
      continue;
    }
    if (entity.layer !== source.layer) stage.setLayer(entity, source.layer);
    entity.label = source.label;
    entity.x = source.x;
    entity.y = source.y;
    entity.width = source.width;
    entity.height = source.height;
    entity.scale = source.scale;
    if (source.rotation !== undefined) entity.rotation = source.rotation; else delete entity.rotation;
    if (source.opacity !== undefined) entity.opacity = source.opacity; else delete entity.opacity;
    entity.color = source.color;
    entity.accent = source.accent;
    entity.kind = source.kind;
    entity.components = toEditorComponents(source.components ?? []);
    if (source.parentId) entity.parentId = source.parentId;
    else delete entity.parentId;
  }

  if (structureChanged) {
    const ordered = snapshot.entities.map((source) => existingById.get(source.id)).filter((entity): entity is EditorEntity => Boolean(entity));
    entities.splice(0, entities.length, ...ordered);
    stage.clear();
    for (const entity of entities) stage.spawn(entity, { layer: entity.layer });
    renderStageHierarchy();
  }
  if (selectedEntityId && !nextById.has(selectedEntityId)) selectedEntityId = snapshot.entities[0]?.id ?? null;
  const selected = entities.find((entity) => entity.id === selectedEntityId);
  if (selected && structureChanged) selectEntity(selected.id);
  else if (selected) {
    setText("#inspector-x", selected.x.toFixed(1));
    setText("#inspector-y", selected.y.toFixed(1));
    setText("#inspector-scale", `${selected.scale.toFixed(2)}×`);
    setText("#inspector-position", `${Math.round(selected.x)}, ${Math.round(selected.y)}`);
    setText("#inspector-bounds", `${Math.round(selected.width * selected.scale)} × ${Math.round(selected.height * selected.scale)}`);
    const readout = requireElement<HTMLElement>("#selection-readout");
    requireDescendant<HTMLElement>(readout, "code").textContent = `x ${Math.round(selected.x)} · y ${Math.round(selected.y)} · L${selected.layer ?? 0}`;
  }
  setText("#stage-runtime-entity-count", String(snapshot.entities.length));
}

const renderPool = createRenderFramePool();
const tileAtlas = createTileAtlas();
registerSprite("engine-editor-tiles", tileAtlas);
const tileFrames = [0, 1, 2, 3].map((index) => ({
  sourceX: index * 32,
  sourceY: 0,
  sourceWidth: 32,
  sourceHeight: 32,
  width: 32,
  height: 32,
}));
const tileEntries = Array.from({ length: 135 }, (_, index) => ({
  x: 140 + (index % 15) * 32,
  y: 92 + Math.floor(index / 15) * 32,
  frame: ((index + Math.floor(index / 15) * 2) % 11 === 0 ? 1 : index > 119 ? 3 : 0),
}));

const keyboard = createKeyboardActions({
  KeyA: "stage-left",
  KeyD: "stage-right",
  KeyB: "tile-brush",
  KeyE: "tile-erase",
  KeyG: "tile-fill",
  KeyM: "tile-marquee",
  KeyI: "tile-eyedropper",
});
window.addEventListener("keydown", (event) => { playableBindings.add(event.code); unlockPlayableAudio(); });
window.addEventListener("keyup", (event) => playableBindings.delete(event.code));
window.addEventListener("blur", () => playableBindings.clear());
stageCanvas.addEventListener("pointerdown", unlockPlayableAudio);

const app = createBrowserApp({
  canvas: stageCanvas,
  parent: requireElement("#stage-canvas-wrap"),
  width: 760,
  height: 480,
  scaleMode: "fit",
  input: false,
  metrics: { capacity: 180 },
  step: 0.016666666666666666,
  maxFrame: 0.05,
  resizeDebounceMs: 100,
  autoStart: true,
  update(_context, delta) {
    if (editor3DPlaySession) {
      editor3DPlaySession.advance(delta, playableBindings, navigator.getGamepads?.()[0]?.axes);
    } else if (playableWorld) {
      if (playableStory && playableProject) {
        playableStory.step(resolvePlayableActions(playableProject, playableBindings));
        for (const command of playableStory.drainCommands()) logEvent(`story → ${command.type}`);
      }
      playableWorld.advance(delta, { bindings: playableBindings });
      playableAudio?.enqueue(playableWorld.drainAudioCommands());
      const timeline = playableTimeline?.advance(delta);
      if (timeline) {
        sequenceFrame = timeline.frame;
        sequencePreviewEnabled = true;
        if (Math.round(sequenceFrame) !== lastSequenceRenderedFrame) updateSequencePlayhead();
        for (const occurrence of timeline.events) logEvent(`timeline ${occurrence.kind} → ${occurrence.label} · frame ${occurrence.frame}`);
        if (timeline.droppedEventOccurrences) logEvent(`timeline → ${timeline.droppedEventOccurrences} event occurrences dropped`);
      }
      mirrorPlayableSnapshot(timeline ? applyTimelineOverrides2D(playableWorld.snapshot(), timeline.overrides) : playableWorld.snapshot());
    } else {
      stage.update(delta);
    }
    updateMotion(delta);
    if (!isEditorPlayActive()) updateSequence(delta);
    atlasElapsed += delta * atlasPlaybackSpeed;
    keyboard.update();
  },
  render() {
    const startedAt = performance.now();
    if (activeWorkspace === "stage") renderStage();
    if (activeWorkspace === "tilemap") renderTilemap();
    if (activeWorkspace === "atlas") renderAtlas();
    if (activeWorkspace === "scene3d") renderScene3DFrame();
    if (activeWorkspace === "motion") renderRig();
    if (!requireElement<HTMLElement>("#production-center").hidden) renderProductionLive();
    updateFrameTelemetry(Math.max(0.001, performance.now() - startedAt));
  },
});

let resizeObservationTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  if (resizeObservationTimer !== undefined) clearTimeout(resizeObservationTimer);
  resizeObservationTimer = setTimeout(() => {
    resizeObservationTimer = undefined;
    canvasResizeCommits += 1;
    if (globalThis.__engineEditor) globalThis.__engineEditor.canvasResizeCommits = canvasResizeCommits;
    logEvent(`canvas resize → DPR ${window.devicePixelRatio.toFixed(2)} letterbox committed`);
  }, 100);
});

function renderStage() {
  const drawn = drawActiveGameFrame(stageContext, stageCanvas.width, stageCanvas.height, {
    applyPost: true,
    frame: sequencePreviewEnabled ? sequenceFrame : undefined,
  });
  drawStageEditorOverlay(stageContext, sequencePreviewEnabled ? sequenceFrame : undefined);
  setText("#stage-drawn", String(drawn));
}

function drawGameCameraSource(frame?: number) {
  const ctx = activeGameContext;
  ctx.clearRect(0, 0, activeGameCanvas.width, activeGameCanvas.height);
  const gradient = ctx.createRadialGradient(380, 240, 30, 380, 240, 440);
  gradient.addColorStop(0, "#152a31");
  gradient.addColorStop(0.64, "#0c171f");
  gradient.addColorStop(1, "#070b11");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 760, 480);

  ctx.save();
  ctx.translate(380, 240);
  ctx.scale(stageViewport.zoom, stageViewport.zoom);
  ctx.translate(-380 + stageViewport.cameraX, -240 + stageViewport.cameraY);

  let tileDrawn = 0;
  let callCount = 0;
  renderingGameOutput = true;
  try {
    withSequencePreviewFrame(frame, () => {
      if (currentStarterTemplate !== "pong") {
        ctx.save();
        ctx.globalAlpha = 0.87;
        tileDrawn = drawSpriteBatch("engine-editor-tiles", tileEntries, { ctx, frames: tileFrames }).drawn;
        ctx.restore();
      }
      if (currentStarterTemplate === "pong") drawPongCourt(ctx);
      else drawDungeonWalls(ctx);
      renderPool.beginFrame();
      const calls = renderArray(renderPool);
      stage.render(calls, 1);
      callCount = calls.length;
      for (const [order, call] of calls.entries()) {
        drawRenderable(ctx, call, {
          camera: {},
          layer: "main",
          layerOptions: { sort: "none", ignoreCamera: true, order: 0 },
          order,
        });
      }
      if (frame !== undefined) drawTimelineEffects2D({ context: ctx, timeline: sequenceData, entities, frame });
    });
  } finally {
    renderingGameOutput = false;
  }
  ctx.restore();
  return tileDrawn + callCount;
}

function drawActiveGameFrame(target: CanvasRenderingContext2D, width: number, height: number, options: { applyPost: boolean; frame?: number }) {
  const drawn = drawGameCameraSource(options.frame);
  target.save();
  target.clearRect(0, 0, width, height);
  target.fillStyle = "#050a0f";
  target.fillRect(0, 0, width, height);
  const scale = Math.min(width / activeGameCanvas.width, height / activeGameCanvas.height);
  const drawWidth = activeGameCanvas.width * scale;
  const drawHeight = activeGameCanvas.height * scale;
  const shake = effectConfigs.find((effect) => effect.id === "shake");
  if (!shake) throw new Error("The post-processing stack is missing its shake configuration.");
  const postShake = options.applyPost && shake.enabled && !postBypassed
    ? screenShake(shake.value * scale, options.frame === undefined ? performance.now() / 1000 : options.frame / sequenceData.fps)
    : { x: 0, y: 0 };
  const cueShake = options.frame === undefined ? { x: 0, y: 0 } : timelineCameraShake2D(sequenceData, options.frame, scale, editorShell?.project.settings.reducedMotion === true);
  const shakeOffset = { x: postShake.x + cueShake.x, y: postShake.y + cueShake.y };
  target.drawImage(activeGameCanvas, (width - drawWidth) / 2 + shakeOffset.x, (height - drawHeight) / 2 + shakeOffset.y, drawWidth, drawHeight);
  target.restore();
  if (options.applyPost && !postBypassed) applySupportedPostEffects(target, width, height);
  return drawn;
}


function applySupportedPostEffects(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    createPostProcessStack(activeEffects(true)).apply(ctx, { width, height, time: performance.now() / 1000 });
  } catch (error) {
    console.warn("Supported post-processing stack could not render", error);
  }
}

function drawStageEditorOverlay(ctx: CanvasRenderingContext2D, frame?: number) {
  if (isEditorPlayActive()) return;
  ctx.save();
  ctx.translate(380, 240);
  ctx.scale(stageViewport.zoom, stageViewport.zoom);
  ctx.translate(-380 + stageViewport.cameraX, -240 + stageViewport.cameraY);
  withSequencePreviewFrame(frame, () => {
    for (const parent of entities) {
      const children = entities.filter((entity) => entity.parentId === parent.id);
      if (!children.length) continue;
      pushTransform({ ctx, x: parent.x, y: parent.y });
      ctx.strokeStyle = "rgb(243 173 78 / 65%)";
      ctx.setLineDash([4, 4]);
      for (const child of children) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(child.x - parent.x, child.y - parent.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      popTransform({ ctx });
    }
    drawStageGrid(ctx);
    const selected = entities.find((entity) => entity.id === selectedEntityId);
    if (selected) {
      const width = selected.width * selected.scale;
      const height = selected.height * selected.scale;
      ctx.save();
      ctx.translate(selected.x, selected.y);
      if (selected.rotation) ctx.rotate(selected.rotation);
      ctx.strokeStyle = "#42e8dd";
      ctx.lineWidth = 1;
      ctx.strokeRect(-width / 2 - 7, -height / 2 - 7, width + 14, height + 14);
      ctx.restore();
    }
  });
  ctx.restore();
}

function drawPongCourt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = "rgb(83 226 218 / 55%)";
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 13, 734, 454);
  ctx.setLineDash([12, 14]);
  ctx.beginPath();
  ctx.moveTo(380, 30);
  ctx.lineTo(380, 450);
  ctx.stroke();
  ctx.setLineDash([]);
  const hasBoundScoreUi = entities.some((entity) => entity.components?.some((component) => component.enabled && component.type === "ui" && (component.values.stateKey === "score.left" || component.values.stateKey === "score.right")));
  if (!hasBoundScoreUi) {
    ctx.font = "700 38px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgb(214 255 250 / 22%)";
    ctx.fillText(`${readPongScore("left")}     ${readPongScore("right")}`, 380, 64);
  }
  ctx.restore();
}

function readPongScore(side: "left" | "right") {
  const stateKey = `score.${side}`;
  const live = playableWorld?.snapshot().state?.[stateKey];
  if (typeof live === "number" || typeof live === "string") return live;
  const authored = entities
    .flatMap((entity) => entity.components ?? [])
    .find((component) => component.enabled && component.type === "ui" && component.values.stateKey === stateKey)
    ?.values.text;
  return typeof authored === "number" || typeof authored === "string" ? authored : 0;
}

function drawDungeonWalls(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = "#111c25";
  ctx.strokeStyle = "#2e4c58";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(126, 76, 518, 332, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#20303a";
  ctx.fillRect(140, 76, 480, 18);
  ctx.fillRect(126, 94, 14, 298);
  ctx.fillRect(620, 94, 24, 148);
  ctx.fillRect(620, 326, 24, 82);
  ctx.restore();
}

function drawStageGrid(ctx: CanvasRenderingContext2D) {
  if (!worldGridVisible) return;
  ctx.save();
  ctx.strokeStyle = "rgb(108 215 192 / 18%)";
  ctx.lineWidth = 1;
  for (let x = 140; x <= 620; x += 32) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 92); ctx.lineTo(x + 0.5, 380); ctx.stroke();
  }
  for (let y = 92; y <= 380; y += 32) {
    ctx.beginPath(); ctx.moveTo(140, y + 0.5); ctx.lineTo(620, y + 0.5); ctx.stroke();
  }
  ctx.strokeStyle = "rgb(255 101 120 / 78%)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(760, 0.5); ctx.stroke();
  ctx.strokeStyle = "rgb(98 231 165 / 78%)";
  ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.5, 480); ctx.stroke();
  ctx.restore();
}

function createTileAtlas() {
  const atlas = document.createElement("canvas");
  atlas.width = 128;
  atlas.height = 32;
  const ctx = require2dContext(atlas);
  const colors = ["#273a44", "#314c40", "#102a39", "#684732"];
  colors.forEach((color, index) => {
    const x = index * 32;
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, 32, 32);
    ctx.strokeStyle = index === 2 ? "#1e4858" : "#405563";
    ctx.strokeRect(x + 1.5, 1.5, 29, 29);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = index === 3 ? "#d4934f" : "#8aa0a8";
    ctx.fillRect(x + 4, 5, 12, 3);
    ctx.fillRect(x + 19, 17, 9, 3);
    ctx.globalAlpha = 1;
  });
  return atlas;
}

function selectEntity(id: string, additive = false) {
  const entity = entities.find((candidate) => candidate.id === id);
  if (!entity) return;
  if (!additive) selectedEntityIds.clear();
  if (additive && selectedEntityIds.has(id)) selectedEntityIds.delete(id);
  else selectedEntityIds.add(id);
  if (!selectedEntityIds.size) selectedEntityIds.add(id);
  selectedEntityId = entity.id;
  document.querySelectorAll<HTMLElement>(".entity-row").forEach((row) => {
    const rowId = row.dataset.entityId ?? "";
    row.classList.toggle("is-selected", rowId === id);
    row.classList.toggle("is-multi-selected", selectedEntityIds.has(rowId));
    const rowEntity = entities.find((candidate) => candidate.id === rowId);
    const detail = row.querySelector("small");
    if (detail && rowEntity) detail.textContent = `${rowEntity.parentId ? `↳ ${rowEntity.parentId} · ` : ""}${rowEntity.x.toFixed(1)}, ${rowEntity.y.toFixed(1)}`;
  });
  setText("#inspector-name", entity.label);
  setText("#inspector-id", `ID ${entity.id}`);
  setText("#inspector-layer", `${entity.layer ?? 0} · ${entity.layer === 2 ? "Actors" : "Environment"}`);
  setText("#inspector-x", entity.x.toFixed(1));
  setText("#inspector-y", entity.y.toFixed(1));
  setText("#inspector-scale", `${entity.scale.toFixed(2)}×`);
  setText("#inspector-position", `${Math.round(entity.x)}, ${Math.round(entity.y)}`);
  setText("#inspector-bounds", `${Math.round(entity.width * entity.scale)} × ${Math.round(entity.height * entity.scale)}`);
  const readout = requireElement<HTMLElement>("#selection-readout");
  requireDescendant<HTMLElement>(readout, "strong").textContent = entity.label;
  requireDescendant<HTMLElement>(readout, "code").textContent = `x ${Math.round(entity.x)} · y ${Math.round(entity.y)} · L${entity.layer ?? 0}`;
  if (globalThis.__engineEditor) {
    globalThis.__engineEditor.selectedEntityId = entity.id;
    globalThis.__engineEditor.selectedEntityIds = [...selectedEntityIds];
  }
  editorShell?.refreshSelection();
  timelineAuthoringPanels.renderClipCuePanel();
  logEvent(`focus → ${entity.id}`);
}

function translateEntity(entity: EditorEntity, dx: number, dy: number, visited = new Set<string>()) {
  if (visited.has(entity.id)) return;
  visited.add(entity.id);
  entity.x += dx;
  entity.y += dy;
  for (const child of entities.filter((candidate) => candidate.parentId === entity.id)) translateEntity(child, dx, dy, visited);
}

function parentSelectedEntities(parentId: string) {
  if (isEditorPlayActive()) { setText("#footer-status", "Stop Play before changing hierarchy"); return; }
  const parent = entities.find((entity) => entity.id === parentId);
  if (!parent) return;
  const children = [...selectedEntityIds]
    .map((id) => entities.find((entity) => entity.id === id))
    .filter((entity): entity is EditorEntity => Boolean(entity && entity.id !== parentId && entity.parentId !== parentId && !wouldCreateParentCycle(entity.id, parentId)));
  if (!children.length) {
    logEvent("parent → ignored because it would create a cycle or no valid child was selected");
    return;
  }
  for (const child of children) child.parentId = parent.id;
  selectEntity(parent.id);
  commitEditorChange("Parent entities");
  logEvent(`parent → ${children.map((child) => child.id).join(", ")} under ${parent.id}`);
}

function wouldCreateParentCycle(childId: string, parentId: string) {
  const visited = new Set([childId]);
  let cursor: string | undefined = parentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = entities.find((entity) => entity.id === cursor)?.parentId;
  }
  return false;
}

function calibrateWorldZero(x: number, y: number) {
  if (isEditorPlayActive()) { setText("#footer-status", "Stop Play before calibrating world zero"); return; }
  for (const entity of entities) { entity.x -= x; entity.y -= y; }
  stageViewport.cameraX += x;
  stageViewport.cameraY += y;
  zeroCalibrationArmed = false;
  const badge = requireElement<HTMLElement>("#calibration-badge");
  badge.classList.remove("is-armed");
  badge.textContent = `ZERO CALIBRATED · ${x.toFixed(2)}, ${y.toFixed(2)} → 0, 0`;
  if (selectedEntityId) selectEntity(selectedEntityId);
  commitEditorChange("Calibrate world zero");
  logEvent(`world zero → calibrated from ${x.toFixed(2)}, ${y.toFixed(2)}`);
}

function showWorkspace(id: WorkspaceId) {
  activeWorkspace = id;
  document.querySelectorAll<HTMLElement>("[data-workspace]").forEach((workspace) => {
    const active = workspace.dataset.workspace === id;
    workspace.hidden = !active;
    workspace.classList.toggle("is-active", active);
  });
  document.querySelectorAll<HTMLElement>("[data-workspace-tab]").forEach((tab) => {
    const active = tab.dataset.workspaceTab === id;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.setAttribute("tabindex", active ? "0" : "-1");
  });
  if (id === "tilemap") renderTilemap();
  if (id === "atlas") renderAtlas();
  if (id === "stage") {
    // A resize that occurs while another workspace is active observes a hidden
    // parent and deliberately collapses to 1px. Restore the real Stage layout
    // as soon as it becomes visible again.
    app.app.resize();
    renderStage();
  }
  if (id === "scene3d") renderScene3DFrame();
  if (id === "post") renderPostPreview();
  if (id === "motion") { renderSequenceTimeline(); renderRig(); }
  if (id === "diagnostics") renderDiagnostics();
  setText("#footer-status", `${id[0].toUpperCase()}${id.slice(1)} workspace active`);
  if (globalThis.__engineEditor) globalThis.__engineEditor.activeWorkspace = id;
}

function applyScene3DProject(project: EditorProject) {
  if (editor3DPlaySession) return;
  const declaration = readHyperfocus3DDeclaration(project);
  scene3dMeshes.clear();
  if (!declaration) {
    scene3dScene?.clear();
    setScene3DViewportMode("edit");
    setText("#scene3d-status", "NO 3D DECLARATION");
    renderScene3DFrame();
    return;
  }
  try {
    scene3dRenderer ??= new WebGLRenderer({ canvas: scene3dCanvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    scene3dRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene3dRenderer.setSize(960, 600, false);
    scene3dRenderer.shadowMap.enabled = true;
    scene3dScene ??= new ThreeScene();
    scene3dScene.clear();
    scene3dScene.background = new ThreeColor("#071018");
    scene3dScene.add(new AmbientLight("#89a8d0", 1.25));
    const sunlight = new DirectionalLight("#ffe0ad", 2.15);
    sunlight.position.set(6, 10, 7);
    sunlight.castShadow = true;
    scene3dScene.add(sunlight);
    const grid = new GridHelper(16, 32, "#3a8d91", "#16343f");
    grid.position.y = -0.34;
    scene3dScene.add(grid);
    const scene = declaration.scenes.find((candidate) => candidate.id === declaration.activeSceneId) ?? declaration.scenes[0];
    const materials = new Map(declaration.materials.map((material) => [material.id, new MeshStandardMaterial({
      color: new ThreeColor(material.baseColor[0], material.baseColor[1], material.baseColor[2]),
      metalness: material.metallic,
      roughness: material.roughness,
    })]));
    const geometry = new BoxGeometry(2, 2, 2);
    for (const entity of scene.entities) {
      const material = materials.get(entity.materialId) ?? new MeshStandardMaterial({ color: "#47d7cf" });
      const mesh = new Mesh(geometry, material);
      mesh.name = entity.id;
      mesh.position.set(...entity.position);
      mesh.scale.set(...entity.scale);
      mesh.rotation.y = entity.rotationY;
      mesh.castShadow = entity.id !== "floor";
      mesh.receiveShadow = true;
      scene3dScene.add(mesh);
      scene3dMeshes.set(entity.id, mesh);
    }
    scene3dCamera = new PerspectiveCamera(scene.camera.fovYRadians * 180 / Math.PI, 1.6, 0.1, 100);
    scene3dCamera.position.set(...scene.camera.position);
    scene3dCamera.lookAt(...scene.camera.target);
    setText("#scene3d-status", `WEBGL2 READY · ${scene.entities.length} AUTHORING PROXIES · PLAY RUNS REAL SCENE`);
    setScene3DViewportMode("edit");
    renderScene3DFrame();
  } catch (error) {
    setText("#scene3d-status", "WEBGL2 PREVIEW UNAVAILABLE");
    logEvent(`3D preview → ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderScene3DFrame() {
  if (editor3DPlaySession) {
    const stats = editor3DPlaySession.render();
    setText("#scene3d-status", `${stats.instances} INSTANCES · ${stats.drawCalls} DRAWS · REAL RUNTIME`);
    return;
  }
  if (scene3dRenderer && scene3dScene && scene3dCamera) {
    scene3dRenderer.resetState();
    scene3dRenderer.render(scene3dScene, scene3dCamera);
  }
}

async function collectEditor3DAssets(project: EditorProject): Promise<PortableAsset3D[]> {
  const declaration = readHyperfocus3DDeclaration(project);
  const referenced = new Set<string>();
  for (const mesh of declaration?.meshes ?? []) {
    referenced.add(mesh.assetId);
    for (const buffer of mesh.buffers ?? []) referenced.add(buffer.assetId);
  }
  for (const texture of declaration?.textures ?? []) referenced.add(texture.assetId);
  for (const cue of declaration?.audio?.cues ?? []) referenced.add(cue);
  const assets: PortableAsset3D[] = [];
  for (const id of referenced) {
    const asset = project.assets.find((candidate) => candidate.id === id && candidate.source === "imported");
    if (!asset) continue;
    const blob = assetRuntimeBlobs.get(asset.id);
    if (!blob) throw new Error(`Imported 3D asset ${asset.name} is not restored in the local cache. Reopen its assets.hfp pair or reimport the file before Play.`);
    if (blob.size !== asset.size) throw new Error(`Stored data for ${asset.name} does not match its project catalog size. Reimport or replace the asset before Play.`);
    assets.push({
      id: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  return assets;
}

function disposeEditor3DPlay() {
  editor3DPlayAbort?.abort();
  editor3DPlayAbort = undefined;
  editor3DPlaySession?.dispose();
  editor3DPlaySession = undefined;
  setScene3DViewportMode("edit");
}

function setScene3DViewportMode(mode: "edit" | "loading" | "play" | "error") {
  const badge = requireElement<HTMLElement>("#scene3d-mode-badge");
  const title = requireElement<HTMLElement>("#scene3d-viewport-title");
  const workspace = requireElement<HTMLElement>("#workspace-scene3d");
  workspace.dataset.previewMode = mode;
  if (mode === "play") {
    title.textContent = "Runtime camera";
    badge.textContent = "PLAY · glTF + LIGHTS + PHYSICS";
    scene3dCanvas.setAttribute("aria-label", "Running 3D game preview with the authored runtime camera");
    return;
  }
  if (mode === "loading") {
    title.textContent = "Starting runtime…";
    badge.textContent = "PLAY · COOKING IMPORTED ASSETS";
    scene3dCanvas.setAttribute("aria-label", "3D game preview is loading imported assets");
    return;
  }
  if (mode === "error") {
    title.textContent = "Runtime could not start";
    badge.textContent = "PLAY FAILED · EDIT PROXY RESTORED";
    scene3dCanvas.setAttribute("aria-label", "3D authoring proxy after a runtime startup error");
    return;
  }
  title.textContent = "Authoring proxy";
  badge.textContent = "EDIT · LIGHTWEIGHT TRANSFORM PROXIES";
  scene3dCanvas.setAttribute("aria-label", "3D authoring proxy for selecting and editing scene objects");
}

// Tilemap and collision painter --------------------------------------------

function setTileTool(tool: BrushMode) {
  brushMode = tool;
  document.querySelectorAll<HTMLElement>("[data-tile-tool]").forEach((button) => button.classList.toggle("is-active", button.dataset.tileTool === tool));
  setText("#tile-tool-chip", `${tool === "paint" ? "B" : tool === "erase" ? "E" : tool === "fill" ? "G" : "M"} · ${tool.toUpperCase()}`);
  if (globalThis.__engineEditor) globalThis.__engineEditor.tileTool = tool;
}

function selectTileValue(value: TileId) {
  selectedTile = value;
  document.querySelectorAll<HTMLElement>("[data-map-tile]").forEach((candidate) => candidate.classList.toggle("is-active", Number(candidate.dataset.mapTile) === value));
  setText("#tile-sample-readout", `ID ${value} · ${["STONE", "MOSS", "VOID", "SOLID TRIM"][value] ?? "PROJECT TILE"}`);
}

function toggleTileCollision(value: TileId) {
  if (!editorShell) return;
  const draft = captureRuntimeProject(editorShell.project);
  setEditorTileSolid(draft, value, !tileSolidValues.includes(value));
  tileSolidValues = [...draft.tilemap.solidValues];
  renderTilemapMetadata(draft);
  runCollisionExtraction(true);
}

function renderTilemap() {
  const ctx = tilemapContext;
  const viewport = tilemapViewport();
  const originX = viewport.originX;
  const originY = viewport.originY;
  const displayTileSize = viewport.displayTileSize;
  ctx.clearRect(0, 0, tilemapCanvas.width, tilemapCanvas.height);
  const gradient = ctx.createRadialGradient(480, 300, 30, 480, 300, 520);
  gradient.addColorStop(0, "#132a31"); gradient.addColorStop(1, "#070d13");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 600);
  const colors = ["#263b46", "#355446", "#102b3a", "#784e34"];
  for (let row = 0; row < mapRows; row += 1) {
    for (let column = 0; column < mapColumns; column += 1) {
      const index = row * mapColumns + column;
      const x = originX + column * displayTileSize;
      const y = originY + row * displayTileSize;
      const tile = mapTileValues[index];
      ctx.fillStyle = colors[tile] ?? `hsl(${Math.abs(tile * 47) % 360} 24% 28%)`; ctx.fillRect(x, y, displayTileSize, displayTileSize);
      ctx.fillStyle = tile === 3 ? "rgb(255 174 92 / 20%)" : "rgb(183 227 220 / 7%)";
      ctx.fillRect(x + Math.min(5, displayTileSize * .12), y + Math.min(5, displayTileSize * .12), Math.max(1, displayTileSize - Math.min(10, displayTileSize * .24)), Math.max(1, Math.min(4, displayTileSize * .1)));
      ctx.strokeStyle = "rgb(76 126 133 / 45%)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, Math.max(1, displayTileSize - 1), Math.max(1, displayTileSize - 1));
    }
  }
  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(viewport.scale, viewport.scale);
  ctx.fillStyle = "rgb(255 86 116 / 16%)"; ctx.strokeStyle = "#ff647e"; ctx.lineWidth = 2;
  for (const rect of extractedRects) { ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2); }
  if (tileSelection) {
    const bounds = normalizedTileSelection(tileSelection);
    ctx.fillStyle = "rgb(65 215 208 / 11%)"; ctx.strokeStyle = "#61e9dd"; ctx.setLineDash([7, 4]);
    ctx.fillRect(bounds.minColumn * mapTileSize, bounds.minRow * mapTileSize, bounds.width * mapTileSize, bounds.height * mapTileSize);
    ctx.strokeRect(bounds.minColumn * mapTileSize + 1, bounds.minRow * mapTileSize + 1, bounds.width * mapTileSize - 2, bounds.height * mapTileSize - 2);
    ctx.setLineDash([]);
  }
  ctx.restore();
  setText("#solid-tile-count", String(mapTileValues.filter((tile) => tileSolidValues.includes(tile)).length));
}

function tilemapViewport() {
  const availableWidth = tilemapCanvas.width - 96;
  const availableHeight = tilemapCanvas.height - 72;
  const scale = Math.min(1, availableWidth / Math.max(1, mapColumns * mapTileSize), availableHeight / Math.max(1, mapRows * mapTileSize));
  const displayTileSize = mapTileSize * scale;
  return {
    scale,
    displayTileSize,
    originX: (tilemapCanvas.width - mapColumns * displayTileSize) / 2,
    originY: (tilemapCanvas.height - mapRows * displayTileSize) / 2,
  };
}

function renderTilemapMetadata(project: EditorProject | undefined = editorShell?.project) {
  requireElement<HTMLInputElement>("#tilemap-columns").value = String(mapColumns);
  requireElement<HTMLInputElement>("#tilemap-rows").value = String(mapRows);
  requireElement<HTMLInputElement>("#tilemap-tile-size").value = String(mapTileSize);
  setText("#tilemap-size-readout", `${mapColumns} × ${mapRows}`);
  setText("#tilemap-tile-size-readout", `${mapTileSize} PX`);
  setText("#tilemap-grid-size", `GRID ${mapTileSize} PX`);
  document.querySelectorAll<HTMLInputElement>("[data-solid-tile]").forEach((input) => { input.checked = tileSolidValues.includes(Number(input.dataset.solidTile)); });
  const select = editorSelect("#tilemap-tileset-select");
  const imageAssets = project?.assets.filter((asset) => asset.kind === "image") ?? [];
  select.setOptions([{ value: "", label: "Procedural four-color palette" }, ...imageAssets.map(asset => ({ value: asset.id, label: asset.name }))]);
  select.value = tilemapSourceAssetId ?? "";
  const source = imageAssets.find((asset) => asset.id === tilemapSourceAssetId);
  setText("#tilemap-source-status", source ? `${source.name} SELECTED · PALETTE PREVIEW PROCEDURAL`.toUpperCase() : "PROCEDURAL PALETTE · NO IMAGE TILESET");
}

function resizeTilemapFromControls() {
  if (!editorShell) return;
  const columns = Math.round(Number(requireElement<HTMLInputElement>("#tilemap-columns").value));
  const rows = Math.round(Number(requireElement<HTMLInputElement>("#tilemap-rows").value));
  const draft = captureRuntimeProject(editorShell.project);
  try { resizeEditorTilemap(draft, columns, rows); }
  catch (cause) { setText("#tilemap-source-status", cause instanceof Error ? cause.message.toUpperCase() : "TILEMAP RESIZE FAILED"); return; }
  mapColumns = draft.tilemap.columns;
  mapRows = draft.tilemap.rows;
  mapTileValues.splice(0, mapTileValues.length, ...draft.tilemap.values);
  tileSelection = null;
  syncMiniTileValues();
  renderTilemapMetadata(draft);
  runCollisionExtraction();
  renderTilemap();
  commitEditorChange("Resize tilemap");
}

function tileCellFromPointer(clientX: number, clientY: number) {
  const point = canvasPoint(tilemapCanvas, clientX, clientY);
  const viewport = tilemapViewport();
  return {
    column: Math.max(0, Math.min(mapColumns - 1, Math.floor((point.x - viewport.originX) / viewport.displayTileSize))),
    row: Math.max(0, Math.min(mapRows - 1, Math.floor((point.y - viewport.originY) / viewport.displayTileSize))),
  };
}

function applyTileAt(column: number, row: number, tool: BrushMode = brushMode) {
  const index = row * mapColumns + column;
  if (eyedropperHeld) {
    selectedTile = mapTileValues[index];
    setText("#tile-sample-readout", `ID ${selectedTile} · ${["STONE", "MOSS", "VOID", "SOLID TRIM"][selectedTile] ?? "PROJECT TILE"}`);
    document.querySelectorAll<HTMLElement>("[data-map-tile]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.mapTile) === selectedTile));
    return;
  }
  if (tool === "fill") floodFillTiles(column, row, selectedTile);
  else if (tool !== "marquee") mapTileValues[index] = tool === "erase" ? 2 : selectedTile;
  syncMiniTileValues();
}

function syncMiniTileValues() {
  for (let index = 0; index < tileValues.length; index += 1) tileValues[index] = mapTileValues[Math.floor(index / 8) * mapColumns + index % 8] ?? 0;
}

function paintTileLine(start: { column: number; row: number }, end: { column: number; row: number }, erase: boolean) {
  const horizontal = Math.abs(end.column - start.column) >= Math.abs(end.row - start.row);
  if (horizontal) {
    const from = Math.min(start.column, end.column); const to = Math.max(start.column, end.column);
    for (let column = from; column <= to; column += 1) applyTileAt(column, start.row, erase ? "erase" : "paint");
  } else {
    const from = Math.min(start.row, end.row); const to = Math.max(start.row, end.row);
    for (let row = from; row <= to; row += 1) applyTileAt(start.column, row, erase ? "erase" : "paint");
  }
}

function floodFillTiles(column: number, row: number, replacement: TileId) {
  const target = mapTileValues[row * mapColumns + column];
  if (target === replacement) return;
  const queue = [{ column, row }];
  while (queue.length) {
    const cell = queue.pop();
    if (!cell) continue;
    if (cell.column < 0 || cell.column >= mapColumns || cell.row < 0 || cell.row >= mapRows) continue;
    const index = cell.row * mapColumns + cell.column;
    if (mapTileValues[index] !== target) continue;
    mapTileValues[index] = replacement;
    queue.push({ column: cell.column - 1, row: cell.row }, { column: cell.column + 1, row: cell.row }, { column: cell.column, row: cell.row - 1 }, { column: cell.column, row: cell.row + 1 });
  }
}

function normalizedTileSelection(selection: TileSelection) {
  const minColumn = Math.min(selection.startColumn, selection.endColumn);
  const minRow = Math.min(selection.startRow, selection.endRow);
  const maxColumn = Math.max(selection.startColumn, selection.endColumn);
  const maxRow = Math.max(selection.startRow, selection.endRow);
  return { minColumn, minRow, maxColumn, maxRow, width: maxColumn - minColumn + 1, height: maxRow - minRow + 1 };
}

function runCollisionExtraction(commitMetadata = false) {
  const bounds = tileSelection ? normalizedTileSelection(tileSelection) : { minColumn: 0, minRow: 0, width: mapColumns, height: mapRows };
  const values: TileId[] = [];
  for (let row = 0; row < bounds.height; row += 1) {
    for (let column = 0; column < bounds.width; column += 1) values.push(mapTileValues[(bounds.minRow + row) * mapColumns + bounds.minColumn + column]);
  }
  const maxTile = Math.max(3, ...mapTileValues, ...tileSolidValues);
  const tileset = createTileset({ tileSize: mapTileSize, columns: Math.max(1, maxTile + 1), tileCount: maxTile + 1, tiles: Array.from({ length: maxTile + 1 }, (_, id) => ({ id, ...(tileSolidValues.includes(id) ? { name: `Solid ${id}`, solid: true, collision: true, tags: ["solid"] } : {}) })) });
  const map = createTileMap({ tileset, width: bounds.width, height: bounds.height, tileSize: mapTileSize, layers: [{ id: "terrain", tiles: values }] });
  extractedRects = extractCollisionRects(map, { tags: ["solid"], merge: true }).map((rect) => ({ x: rect.x + bounds.minColumn * mapTileSize, y: rect.y + bounds.minRow * mapTileSize, w: rect.w, h: rect.h }));
  setText("#extracted-rect-count", String(extractedRects.length));
  setText("#collision-area", `${extractedRects.reduce((sum, rect) => sum + rect.w * rect.h, 0).toLocaleString()} px²`);
  const list = requireElement<HTMLElement>("#extracted-collision-list");
  list.innerHTML = extractedRects.map((rect, index) => `<div class="collision-result"><i></i><span>collision_${String(index + 1).padStart(2, "0")}</span><code>${rect.w} × ${rect.h}</code></div>`).join("") || '<div class="collision-result"><i></i><span>No solid tiles in selection</span><code>—</code></div>';
  if (globalThis.__engineEditor) globalThis.__engineEditor.extractedCollisionCount = extractedRects.length;
  setText("#collision-extract-status", `SAVED ${tileSolidValues.length} SOLID VALUE${tileSolidValues.length === 1 ? "" : "S"} · ${extractedRects.length} RECTS`);
  renderTilemap();
  if (commitMetadata) commitEditorChange("Save tile collision metadata");
}

// Texture atlas slicer and animator ----------------------------------------

function currentAtlasSourceImage() {
  return atlasSourceAssetId ? assetPreviewImages.get(atlasSourceAssetId) : undefined;
}

function currentAtlasSourceAsset() {
  return currentProjectAssets.find((asset) => asset.id === atlasSourceAssetId);
}

function atlasSourceDimensions() {
  const image = currentAtlasSourceImage();
  return image ? { width: image.naturalWidth, height: image.naturalHeight } : undefined;
}

function atlasViewport() {
  const dimensions = atlasSourceDimensions();
  if (!dimensions) return undefined;
  const scale = Math.min(512 / dimensions.width, 320 / dimensions.height);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  return { x: (atlasCanvas.width - width) / 2, y: (atlasCanvas.height - height) / 2, width, height, scale, sourceWidth: dimensions.width, sourceHeight: dimensions.height };
}

function commitGridSlice() {
  const dimensions = atlasSourceDimensions();
  if (!dimensions) {
    setText("#atlas-source-status", "SOURCE IMAGE DATA REQUIRED");
    renderAtlas();
    return false;
  }
  const frameWidth = Math.max(8, Math.min(dimensions.width, Number(requireElement<HTMLInputElement>("#slice-width").value) || 128));
  const frameHeight = Math.max(8, Math.min(dimensions.height, Number(requireElement<HTMLInputElement>("#slice-height").value) || 160));
  if (!editorShell) return false;
  const draft = captureRuntimeProject(editorShell.project);
  try { sliceEditorAtlasGrid(draft, { imageWidth: dimensions.width, imageHeight: dimensions.height, frameWidth, frameHeight }); }
  catch (cause) {
    setText("#atlas-source-status", cause instanceof Error ? cause.message.toUpperCase() : "ATLAS SLICE FAILED");
    return false;
  }
  atlasFrames = structuredClone(draft.atlas.frames).map((frame, index) => ({ ...frame, color: atlasColor(index) }));
  selectedAtlasFrame = 0;
  selectedAtlasFrames = new Set([0]);
  animationSequence = atlasFrames.slice();
  renderAtlasPanels();
  if (globalThis.__engineEditor) globalThis.__engineEditor.atlasFrameCount = atlasFrames.length;
  return true;
}

function addManualAtlasFrame(rect: { x: number; y: number; width: number; height: number }) {
  const index = atlasFrames.length;
  atlasFrames.push({ id: `frame-${index}`, name: `custom_${String(index).padStart(2, "0")}`, ...rect, color: atlasColor(index) });
  selectedAtlasFrame = index;
  selectedAtlasFrames = new Set([index]);
  renderAtlasPanels();
  if (globalThis.__engineEditor) globalThis.__engineEditor.atlasFrameCount = atlasFrames.length;
}



function renderAtlas() {
  const ctx = atlasContext;
  ctx.clearRect(0, 0, 800, 560);
  const image = currentAtlasSourceImage();
  const viewport = atlasViewport();
  ctx.fillStyle = "#0b1720";
  ctx.fillRect(144, 100, 512, 320);
  for (let y = 100; y < 420; y += 32) for (let x = 144; x < 656; x += 32) { ctx.fillStyle = ((x - 144) / 32 + (y - 100) / 32) % 2 ? "#10222c" : "#0d1d26"; ctx.fillRect(x, y, 32, 32); }
  if (!image || !viewport) {
    ctx.fillStyle = "#d8ffff";
    ctx.font = "700 16px ui-sans-serif, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(atlasSourceAssetId ? "Source image data is unavailable" : "Choose an imported source image", 400, 250);
    ctx.fillStyle = "#7d92a0";
    ctx.font = "12px ui-sans-serif, sans-serif";
    ctx.fillText(atlasSourceAssetId ? "Reimport or choose an image with available preview data." : "Use Source asset in Slicing tools to recover.", 400, 276);
    ctx.textAlign = "start";
    renderAnimationPreview();
    return;
  }
  ctx.drawImage(image, viewport.x, viewport.y, viewport.width, viewport.height);
  atlasFrames.forEach((frame, index) => {
    const selected = selectedAtlasFrames.has(index);
    ctx.strokeStyle = selected ? "#64f2e7" : "rgb(91 137 151 / 65%)"; ctx.lineWidth = index === selectedAtlasFrame ? 3 : selected ? 2 : 1;
    ctx.strokeRect(viewport.x + frame.x * viewport.scale + 1, viewport.y + frame.y * viewport.scale + 1, Math.max(1, frame.width * viewport.scale - 2), Math.max(1, frame.height * viewport.scale - 2));
    ctx.fillStyle = index === selectedAtlasFrame ? "#64f2e7" : "#d8ffff"; ctx.font = "8px ui-monospace,monospace"; ctx.fillText(frame.name, viewport.x + frame.x * viewport.scale + 6, viewport.y + frame.y * viewport.scale + 13);
  });
  if (atlasDraftRect) { ctx.fillStyle = "rgb(65 215 208 / 12%)";ctx.strokeStyle="#64f2e7";ctx.setLineDash([6,4]);ctx.fillRect(viewport.x+atlasDraftRect.x*viewport.scale,viewport.y+atlasDraftRect.y*viewport.scale,atlasDraftRect.width*viewport.scale,atlasDraftRect.height*viewport.scale);ctx.strokeRect(viewport.x+atlasDraftRect.x*viewport.scale,viewport.y+atlasDraftRect.y*viewport.scale,atlasDraftRect.width*viewport.scale,atlasDraftRect.height*viewport.scale);ctx.setLineDash([]); }
  renderAnimationPreview();
}

function renderAnimationPreview() {
  const ctx = animationContext;ctx.clearRect(0,0,250,220);const frame = animationSequence.length ? animationSequence[Math.floor(atlasElapsed * 8) % animationSequence.length] : undefined;
  const image = currentAtlasSourceImage();
  if (!frame || !image) {
    ctx.fillStyle = "#0b1720";ctx.fillRect(0,0,250,220);ctx.fillStyle="#7d92a0";ctx.font="12px ui-sans-serif,sans-serif";ctx.textAlign="center";ctx.fillText(image ? "No frames in sequence" : "Source preview unavailable",125,112);ctx.textAlign="start";
    setText("#animation-frame-name", image ? "No frame" : "No source image");
    return;
  }
  const scale=Math.min(210/frame.width,180/frame.height);const width=frame.width*scale;const height=frame.height*scale;
  ctx.fillStyle="#071018";ctx.fillRect(0,0,250,220);ctx.imageSmoothingEnabled=false;ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height,(250-width)/2,(200-height)/2,width,height);ctx.imageSmoothingEnabled=true;setText("#animation-frame-name",frame.name);
}

function renderAtlasPanels() {
  const list = requireElement<HTMLElement>("#atlas-frame-list");
  const sourceAvailable = Boolean(currentAtlasSourceImage());
  list.innerHTML = sourceAvailable
    ? atlasFrames.map((frame,index)=>`<div class="atlas-frame-resource"><button draggable="true" class="atlas-frame-row ${selectedAtlasFrames.has(index)?"is-selected":""}" data-atlas-index="${index}"><i style="--frame-color:${frame.color}"></i><span>${escapeMarkup(frame.name)}</span><small>${frame.width}×${frame.height}</small></button><details class="resource-overflow"><summary aria-label="${escapeMarkup(frame.name)} frame actions">…</summary><div class="resource-menu" role="menu"><button type="button" role="menuitem" data-atlas-frame-action="rename" data-frame-id="${escapeMarkup(frame.id)}">Rename</button><button type="button" role="menuitem" data-atlas-frame-action="edit" data-frame-id="${escapeMarkup(frame.id)}">Edit rectangle…</button><button type="button" role="menuitem" data-atlas-frame-action="duplicate" data-frame-id="${escapeMarkup(frame.id)}">Duplicate</button><button type="button" role="menuitem" data-atlas-frame-action="remove-sequence" data-frame-id="${escapeMarkup(frame.id)}">Remove from sequence</button><button type="button" role="menuitem" class="is-danger" data-atlas-frame-action="delete" data-frame-id="${escapeMarkup(frame.id)}">Delete frame</button></div></details></div>`).join("") || '<p class="empty-copy">No frames. Slice Grid or use Manual Slice.</p>'
    : `<p class="empty-copy">${atlasFrames.length ? `${atlasFrames.length} saved frame definition${atlasFrames.length === 1 ? "" : "s"} cannot be previewed.` : "No frames."} Choose or reimport an available source image to recover.</p>`;
  setText("#atlas-frame-count", sourceAvailable ? `${atlasFrames.length} frame${atlasFrames.length === 1 ? "" : "s"}` : `${atlasFrames.length} saved · source unavailable`);
  syncActiveAnimationClip();
  const clipSelect = editorSelect("#atlas-clip-select");
  clipSelect.setOptions(animationClips.map(clip => ({ value: clip.id, label: clip.name })));
  clipSelect.value = activeAnimationClipId ?? "";
  const activeClip = animationClips.find((clip) => clip.id === activeAnimationClipId);
  requireElement<HTMLInputElement>("#atlas-clip-fps").value = String(activeClip?.fps ?? 8);
  requireElement<HTMLInputElement>("#atlas-clip-loop").checked = activeClip?.loop ?? true;
  setText("#atlas-clip-count", `${animationClips.length} CLIP${animationClips.length === 1 ? "" : "S"}`);
  const asset = currentAtlasSourceAsset();
  const dimensions = atlasSourceDimensions();
  setText("#atlas-source-name", asset?.name ?? "No source image selected");
  setText("#atlas-source-status", dimensions ? `${asset?.name ?? "SOURCE"} · ${dimensions.width} × ${dimensions.height}`.toUpperCase() : asset ? `${asset.name} · IMAGE DATA UNAVAILABLE`.toUpperCase() : "NO SOURCE IMAGE");
  setText("#atlas-source-zoom", dimensions ? "FIT" : "—");
  requireElement<HTMLButtonElement>("#slice-grid").disabled = !dimensions;
  requireElement<HTMLButtonElement>("[data-atlas-tool='manual']").disabled = !dimensions;
  list.querySelectorAll<HTMLButtonElement>("[data-atlas-index]").forEach((button)=>{
    button.addEventListener("click",(event)=>{
      const index=Number(button.dataset.atlasIndex);
      if(!event.shiftKey)selectedAtlasFrames.clear();
      if(event.shiftKey&&selectedAtlasFrames.has(index))selectedAtlasFrames.delete(index);else selectedAtlasFrames.add(index);
      selectedAtlasFrame=index;renderAtlasPanels();renderAtlas();
    });
    button.addEventListener("dragstart",()=>{const index=Number(button.dataset.atlasIndex);if(!selectedAtlasFrames.has(index)){selectedAtlasFrames=new Set([index]);selectedAtlasFrame=index;}draggedSourceFrames=[...selectedAtlasFrames];});
    button.addEventListener("dragend",()=>{draggedSourceFrames=null;});
  });
  list.querySelectorAll<HTMLButtonElement>("[data-atlas-frame-action]").forEach((button) => button.addEventListener("click", () => editAtlasFrame(button.dataset.atlasFrameAction, button.dataset.frameId)));
  const timeline=requireElement<HTMLElement>("#atlas-timeline");
  timeline.innerHTML=sourceAvailable ? animationSequence.map((frame,index)=>`<button draggable="true" class="timeline-frame ${frame===atlasFrames[selectedAtlasFrame]?"is-selected":""}" data-timeline-index="${index}" style="--frame-color:${frame.color}">${atlasFrames.indexOf(frame)}</button>`).join("") : "";
  timeline.ondragover=(event)=>event.preventDefault();
  timeline.ondrop=(event)=>{event.preventDefault();if(!draggedSourceFrames)return;animationSequence=draggedSourceFrames.map((index)=>atlasFrames[index]).filter(Boolean);draggedSourceFrames=null;renderAtlasPanels();renderAtlas();commitEditorChange("Create animation sequence");logEvent(`AnimationClip → [${animationSequence.map((frame)=>atlasFrames.indexOf(frame)).join(", ")}]`);};
  timeline.querySelectorAll<HTMLButtonElement>("[data-timeline-index]").forEach((button)=>{
    button.addEventListener("click",()=>{const frame=animationSequence[Number(button.dataset.timelineIndex)];selectedAtlasFrame=Math.max(0,atlasFrames.indexOf(frame));selectedAtlasFrames=new Set([selectedAtlasFrame]);renderAtlasPanels();renderAtlas();});
    button.addEventListener("contextmenu",(event)=>openAtlasSequenceMenu(event,Number(button.dataset.timelineIndex)));
    button.addEventListener("dragstart",()=>{draggedAtlasIndex=Number(button.dataset.timelineIndex);button.classList.add("is-dragging");});
    button.addEventListener("dragover",(event)=>event.preventDefault());
    button.addEventListener("drop",(event)=>{event.preventDefault();const target=Number(button.dataset.timelineIndex);if(draggedAtlasIndex===null)return;event.stopPropagation();if(target===draggedAtlasIndex)return;const [frame]=animationSequence.splice(draggedAtlasIndex,1);animationSequence.splice(target,0,frame);draggedAtlasIndex=null;renderAtlasPanels();renderAtlas();commitEditorChange("Reorder animation frames");});
    button.addEventListener("keydown",(event)=>{if(!event.altKey||(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"))return;const index=Number(button.dataset.timelineIndex);const target=Math.max(0,Math.min(animationSequence.length-1,index+(event.key==="ArrowRight"?1:-1)));if(index===target)return;const [frame]=animationSequence.splice(index,1);animationSequence.splice(target,0,frame);renderAtlasPanels();renderAtlas();commitEditorChange("Reorder animation frames");event.preventDefault();});
    button.addEventListener("dragend",()=>{draggedAtlasIndex=null;button.classList.remove("is-dragging");});
  });
}

function applyAtlasDraft(project: EditorProject) {
  atlasFrames = structuredClone(project.atlas.frames);
  animationClips = structuredClone(project.atlas.clips ?? [{ id: "default", name: "Default", sequence: project.atlas.sequence, fps: project.atlas.playbackSpeed * 8, loop: true }]);
  activeAnimationClipId = project.atlas.defaultClipId && animationClips.some((clip) => clip.id === project.atlas.defaultClipId) ? project.atlas.defaultClipId : animationClips[0]?.id ?? "default";
  loadActiveAnimationClip();
  selectedAtlasFrame = Math.min(selectedAtlasFrame, Math.max(0, atlasFrames.length - 1));
  selectedAtlasFrames = atlasFrames.length ? new Set([selectedAtlasFrame]) : new Set();
  renderAtlasPanels(); renderAtlas();
  if (globalThis.__engineEditor) globalThis.__engineEditor.atlasFrameCount = atlasFrames.length;
}

function syncActiveAnimationClip() {
  const clip = animationClips.find((candidate) => candidate.id === activeAnimationClipId);
  if (clip) clip.sequence = animationSequence.map((frame) => frame.id);
}

function loadActiveAnimationClip() {
  const clip = animationClips.find((candidate) => candidate.id === activeAnimationClipId);
  animationSequence = (clip?.sequence ?? []).map((id) => atlasFrames.find((frame) => frame.id === id)).filter((frame): frame is AtlasFrame => Boolean(frame));
}

function mutateAtlas(label: string, operation: (project: EditorProject) => void) {
  if (!editorShell) return;
  const draft = captureRuntimeProject(editorShell.project);
  try { operation(draft); }
  catch (cause) { setText("#atlas-source-status", cause instanceof Error ? cause.message.toUpperCase() : "ATLAS EDIT FAILED"); return; }
  applyAtlasDraft(draft);
  commitEditorChange(label);
}

function editAtlasFrame(action?: string, frameId?: string) {
  const index = atlasFrames.findIndex((frame) => frame.id === frameId);
  const frame = atlasFrames[index];
  if (!frame) return;
  selectedAtlasFrame = index; selectedAtlasFrames = new Set([index]);
  if (action === "rename") { renderAtlasPanels(); beginAtlasRename(); return; }
  if (action === "duplicate") { mutateAtlas("Duplicate atlas frame", (project) => { duplicateEditorAtlasFrame(project, frame.id); }); return; }
  if (action === "remove-sequence") { mutateAtlas("Remove frame from animation sequence", (project) => { project.atlas.sequence = project.atlas.sequence.filter((id) => id !== frame.id); }); return; }
  if (action === "delete" && globalThis.confirm?.(`Delete ${frame.name}? Animation sequence references will also be removed.`) === true) { mutateAtlas("Delete atlas frame", (project) => removeEditorAtlasFrame(project, frame.id)); return; }
  if (action !== "edit") return;
  const values = [globalThis.prompt?.("Frame X", String(frame.x)), globalThis.prompt?.("Frame Y", String(frame.y)), globalThis.prompt?.("Frame width", String(frame.width)), globalThis.prompt?.("Frame height", String(frame.height))];
  if (values.some((value) => value === null || value === undefined)) return;
  const x = Number(values[0]), y = Number(values[1]), width = Number(values[2]), height = Number(values[3]);
  if (![x, y, width, height].every(Number.isFinite)) { setText("#atlas-source-status", "FRAME RECTANGLE WAS NOT CHANGED"); return; }
  mutateAtlas("Edit atlas frame rectangle", (project) => updateEditorAtlasFrame(project, frame.id, { x, y, width, height }));
}

function openAtlasSequenceMenu(event: MouseEvent, index: number) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= animationSequence.length) return;
  event.preventDefault();
  openTimelineLocalMenu(event.clientX, event.clientY, [
    { label: "Duplicate sequence entry", run: () => mutateAtlas("Duplicate animation sequence entry", (project) => duplicateEditorAtlasSequenceEntry(project, index)) },
    { label: "Remove from sequence", danger: true, run: () => mutateAtlas("Remove animation sequence entry", (project) => removeEditorAtlasSequenceEntry(project, index)) },
  ]);
}

function applyAtlasSourceProject(project: EditorProject) {
  currentProjectAssets = structuredClone(project.assets);
  atlasSourceAssetId = project.atlas.sourceAssetId;
  const select = editorSelect("#atlas-source-select");
  const images = project.assets.filter((asset) => asset.kind === "image");
  select.setOptions([{ value: "", label: "Choose an image" }, ...images.map(asset => ({ value: asset.id, label: asset.name + (asset.objectUrl || assetPreviewImages.has(asset.id) ? "" : " · preview unavailable") })), ...(atlasSourceAssetId && !images.some(asset => asset.id === atlasSourceAssetId) ? [{ value: atlasSourceAssetId, label: "Missing asset · " + atlasSourceAssetId }] : [])]);
  select.value = atlasSourceAssetId ?? "";
  select.disabled = images.length === 0;
  const dimensions = atlasSourceDimensions();
  if (dimensions) {
    requireElement<HTMLInputElement>("#slice-width").max = String(dimensions.width);
    requireElement<HTMLInputElement>("#slice-height").max = String(dimensions.height);
  }
}

function beginAtlasRename() {
  const row=requireElement<HTMLElement>(`.atlas-frame-row[data-atlas-index="${selectedAtlasFrame}"]`);const label=row.querySelector<HTMLElement>("span");if(!label)return;
  const input=document.createElement("input");input.value=atlasFrames[selectedAtlasFrame].name;label.replaceWith(input);input.focus();input.select();
  const commit=()=>{const value=input.value.trim();if(value&&value!==atlasFrames[selectedAtlasFrame].name){atlasFrames[selectedAtlasFrame].name=value;commitEditorChange("Rename atlas frame");}renderAtlasPanels();renderAtlas();};
  input.addEventListener("keydown",(event)=>{if(event.key==="Enter")commit();if(event.key==="Escape")renderAtlasPanels();});input.addEventListener("blur",commit,{once:true});
}

// Post-processing Lab -------------------------------------------------------

function renderEffectControls() {
  const list = requireElement<HTMLElement>("#effects-list");
  list.replaceChildren();
  effectConfigs.forEach((config, index) => {
    const supported = playAndBuildEffectIds.has(config.id);
    const card = document.createElement("div");
    card.className = `effect-card ${config.enabled ? "is-enabled" : "is-disabled"}`;
    card.dataset.effectId = config.id;
    card.draggable = supported;
    if (!supported) card.setAttribute("aria-disabled", "true");
    const displayValue = config.unit === "%" ? `${Math.round(config.value * 100)}%` : `${config.value}${config.unit ? ` ${config.unit}` : ""}`;
    card.innerHTML = `
      <div class="effect-head">
        <span class="effect-order">${index + 1}</span>
        <span class="effect-name"><strong>${config.label}</strong><small>${config.tier}${supported ? " · PLAY / BUILD" : " · UNSUPPORTED IN PLAY / BUILD"}</small></span>
        <span class="effect-actions"><button type="button" data-move-effect="up" aria-label="Move ${config.label} earlier" ${supported ? "" : "disabled"}>↑</button><button type="button" data-move-effect="down" aria-label="Move ${config.label} later" ${supported ? "" : "disabled"}>↓</button><label class="switch"><input type="checkbox" ${config.enabled ? "checked" : ""} ${supported ? "" : "disabled"} aria-label="Toggle ${config.label}"><i></i></label></span>
      </div>
      <label class="effect-control"><input type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.value}" ${supported ? "" : "disabled"} aria-label="${config.label} amount"><output>${displayValue}</output></label>`;
    const toggle = requireDescendant<HTMLInputElement>(card, 'input[type="checkbox"]');
    const slider = requireDescendant<HTMLInputElement>(card, 'input[type="range"]');
    const output = requireDescendant<HTMLOutputElement>(card, "output");
    toggle.addEventListener("change", () => {
      config.enabled = toggle.checked;
      card.classList.toggle("is-enabled", config.enabled);
      card.classList.toggle("is-disabled", !config.enabled);
      updatePostProcessing();
      commitEditorChange(`Toggle ${config.label}`);
    });
    slider.addEventListener("input", () => {
      config.value = Number(slider.value);
      output.value = config.unit === "%" ? `${Math.round(config.value * 100)}%` : `${config.value}${config.unit ? ` ${config.unit}` : ""}`;
      updatePostProcessing();
    });
    slider.addEventListener("change", () => commitEditorChange(`Adjust ${config.label}`));
    card.querySelectorAll<HTMLButtonElement>("[data-move-effect]").forEach((button) => button.addEventListener("click", () => {
      const target = Math.max(0, Math.min(effectConfigs.length - 1, index + (button.dataset.moveEffect === "up" ? -1 : 1)));
      if (target === index) return;
      const [moved] = effectConfigs.splice(index, 1);
      effectConfigs.splice(target, 0, moved);
      renderEffectControls(); updatePostProcessing(); commitEditorChange(`Reorder ${config.label}`);
    }));
    card.addEventListener("dragstart", () => { draggedEffectIndex = index; card.classList.add("is-dragging"); });
    card.addEventListener("dragover", (event) => { event.preventDefault(); card.classList.add("is-drop-target"); });
    card.addEventListener("dragleave", () => card.classList.remove("is-drop-target"));
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("is-drop-target");
      if (draggedEffectIndex === null || draggedEffectIndex === index) return;
      const [moved] = effectConfigs.splice(draggedEffectIndex, 1);
      effectConfigs.splice(index, 0, moved);
      draggedEffectIndex = null;
      renderEffectControls();
      updatePostProcessing();
      commitEditorChange("Reorder post-processing effects");
    });
    card.addEventListener("dragend", () => { draggedEffectIndex = null; card.classList.remove("is-dragging"); });
    list.append(card);
  });
}

function activeEffects(supportedOnly = false): PostProcessEffect[] {
  const effects: PostProcessEffect[] = [];
  for (const config of effectConfigs) {
    if (!config.enabled) continue;
    if (supportedOnly && !playAndBuildEffectIds.has(config.id)) continue;
    if (config.id === "grayscale") effects.push(grayscale(config.value));
    if (config.id === "sepia") effects.push(sepia(config.value));
    if (config.id === "crt") effects.push(crtScanlines(3, config.value));
    if (config.id === "threshold") effects.push(threshold(config.value));
    if (config.id === "shake") {
      effects.push({
        name: "screenShake",
        cost: postProcessCosts.distortion,
        draw() { /* The actual offset is applied before the stack executes. */ },
      });
    }
  }
  for (let index = 0; index < heavyPostPasses; index += 1) {
    effects.push({
      name: `heavy-distortion-${index + 1}`,
      cost: postProcessCosts.distortion,
      draw() { /* Diagnostic compiler pass: cost metadata is the engine contract under test. */ },
    });
  }
  return effects;
}

function updatePostProcessing() {
  const effects = activeEffects(true);
  const unsupportedEnabled = effectConfigs.filter((effect) => effect.enabled && !playAndBuildEffectIds.has(effect.id));
  const report = checkPostProcessBudget(effects, {
    maxPixelEffects: 2,
    maxDistortionEffects: 1,
    maxFullCanvasPasses: 4,
    allowDistortion: true,
  });
  const budgetCard = requireElement<HTMLElement>("#budget-component");
  const estimatedMs = report.pixelEffects * 2.6 + report.distortionEffects * 4.4 + Math.max(0, report.fullCanvasPasses - report.pixelEffects - report.distortionEffects * 2) * 0.5;
  const frameBudgetMs = editorShell?.project.postProcessing.frameBudgetMs ?? 16.67;
  const allocationMs = editorShell?.project.postProcessing.allocationMs ?? 2;
  const withinAllocation = estimatedMs <= allocationMs;
  const validForPlayAndBuild = report.ok && unsupportedEnabled.length === 0 && withinAllocation;
  budgetCard.classList.toggle("has-warning", !validForPlayAndBuild);
  budgetCard.classList.toggle("has-overrun", !report.ok || !withinAllocation);
  const nearBudget = estimatedMs >= allocationMs * 0.8;
  budgetCard.classList.toggle("is-near-budget", nearBudget);
  requireElement<HTMLElement>("#budget-surcharge").hidden = !nearBudget;
  const warning = requireElement<HTMLElement>("#budget-warning");
  warning.hidden = validForPlayAndBuild;
  setText("#budget-state", unsupportedEnabled.length ? "UNSUPPORTED FX" : validForPlayAndBuild ? "PASS" : "OVER BUDGET");
  setText("#budget-pixels", `${report.pixelEffects} / 2`);
  setText("#budget-passes", `${report.fullCanvasPasses} / 4`);
  setText("#budget-distortions", `${report.distortionEffects} / 1`);
  setText("#budget-time", `${estimatedMs.toFixed(2)} / ${allocationMs.toFixed(2)} ms FX`);
  setText("#budget-frame-time", `${frameBudgetMs.toFixed(2)} ms frame`);
  setText("#budget-overrun-copy", unsupportedEnabled.length
    ? `${unsupportedEnabled.map((effect) => effect.label).join(", ")} is saved as experimental data but ignored by Play and Build.`
    : validForPlayAndBuild
      ? "Post-processing stack is within target."
    : `Post-processing allocation exceeded by ${Math.max(0, estimatedMs - allocationMs).toFixed(1)} ms. Disable or reorder passes before shipping this target profile.`);
  const percent = Math.round((estimatedMs / allocationMs) * 100);
  setText("#budget-percent", `${percent}%`);
  const gauge = requireElement<HTMLElement>(".budget-gauge > div");
  gauge.style.setProperty("--budget-angle", `${Math.min(360, percent * 3.6)}deg`);
  requireElement<HTMLElement>("#budget-flame").innerHTML = effects.map((effect) => {
    const cost = getPostProcessEffectCost(effect);
    const distortion = cost.tier === "distortion";
    const width = distortion ? 30 : cost.fullCanvasPasses * 10 + 8;
    return `<i class="${distortion ? "distortion" : ""}" title="${effect.name}" style="flex:${width}"></i>`;
  }).join("");
  setText("#budget-violations", [
    ...unsupportedEnabled.map((effect) => `${effect.label} is unsupported in Play and Build`),
    ...(!withinAllocation ? [`Estimated FX cost exceeds allocation by ${(estimatedMs - allocationMs).toFixed(1)} ms`] : []),
    ...report.violations,
  ].join(" · ") || "Supported effect stack is within the configured mobile frame budget.");
  setText("#compiler-output", [
    `checkPostProcessBudget(stack, budget)`,
    `status: ${validForPlayAndBuild ? "OK" : "WARNING"}`,
    `pixelEffects: ${report.pixelEffects}`,
    `distortionEffects: ${report.distortionEffects}`,
    `fullCanvasPasses: ${report.fullCanvasPasses}`,
    ...unsupportedEnabled.map((effect) => `! ${effect.label}: unsupported in Play and Build; pass ignored`),
    ...report.violations.map((violation) => `! ${violation}`),
  ].join("\n"));
  if (globalThis.__engineEditor) globalThis.__engineEditor.postBudgetOk = validForPlayAndBuild;
  if (activeWorkspace === "stage") renderStage();
  renderPostPreview();
}

function renderPostPreview() {
  const startedAt = performance.now();
  const previewFrame = sequencePreviewEnabled ? sequenceFrame : undefined;
  drawActiveGameFrame(rawPostContext, rawPostCanvas.width, rawPostCanvas.height, { applyPost: false, frame: previewFrame });
  drawActiveGameFrame(activePostContext, activePostCanvas.width, activePostCanvas.height, { applyPost: true, frame: previewFrame });
  const scene = editorShell?.project.scenes.find((candidate) => candidate.id === editorShell?.project.activeSceneId);
  setText("#post-preview-source", `${editorShell?.project.name ?? "PROJECT"} · ${scene?.name ?? "ACTIVE GAME CAMERA"}`.toUpperCase());
  const renderMs = Math.max(0.01, performance.now() - startedAt);
  setText("#post-render-time", `${renderMs.toFixed(2)} ms render`);
}

function injectHeavyPostStack() {
  for (const config of effectConfigs) {
    config.enabled = true;
    config.value = config.max;
  }
  renderEffectControls();
  updatePostProcessing();
}

function appendHeavyPostPasses(count: number) {
  heavyPostPasses = Math.max(0, Math.min(12, Math.floor(count)));
  renderEffectControls();
  updatePostProcessing();
  logEvent(`post stack → appended ${heavyPostPasses} heavy distortion passes`);
}

// Motion and rigging --------------------------------------------------------

const motionFixture = createThreeHumanoidFixture();
let terrainHeight = 0;
let interactiveTerrain = false;
let jointLimitPercent = 100;
let strideScale = 1.35;
let locomotionSpeed = 1.6;
let walking = false;
let motionElapsed = 0;
let motionController = buildMotionController();
const rigScreenPoints = new Map<string, { x: number; y: number }>();
let activeIkHandle: "left" | "right" | null = null;
let leftHandTarget: [number, number, number] | null = null;
let rightHandTarget: [number, number, number] | null = null;

type SelectedSequenceKey = { trackId: string; keyId: string };
let sequenceData: EditorProject["timeline"] = {
  fps: 30, durationFrames: 300, bpm: 120, beatsPerBar: 4, loopStart: 24, loopEnd: 264, playbackSpeed: 1,
  tracks: [], audioTracks: [], events: [],
};
let sequenceFrame = 72;
let sequencePlaying = false;
let sequencePreviewEnabled = false;
let sequenceSnap = true;
let sequenceBeatGrid = true;
let sequenceZoom = 1;

const selectedSequenceKeys = new Map<string, SelectedSequenceKey>();
let sequenceClipboard: Array<{ trackId: string; frameOffset: number; value: number; easing: EditorKeyframe["easing"] }> = [];
let lastSequenceRenderedFrame = -1;
let tapTempoTimes: number[] = [];
const timelineAuthoringPanels = createTimelineAuthoringPanels({
  getTimeline: () => sequenceData,
  setTimeline: (timeline) => { sequenceData = timeline; },
  getFrame: () => sequenceFrame,
  getSelectedEntity: () => editorShell?.project.scenes.find((scene) => scene.id === editorShell?.project.activeSceneId)?.entities.find((entity) => entity.id === selectedEntityId),
  getSceneEntities: () => editorShell?.project.scenes.find((scene) => scene.id === editorShell?.project.activeSceneId)?.entities ?? [],
  getAtlasClips: () => animationClips,
  getAtlasSourceAssetId: () => atlasSourceAssetId,
  enablePreview: (frame) => { sequencePreviewEnabled = true; if (frame !== undefined) sequenceFrame = frame; },
  clearKeySelection: () => selectedSequenceKeys.clear(),
  renderTimeline: () => renderSequenceTimeline(),
  renderPreviews: renderSequenceDrivenPreviews,
  commit: commitEditorChange,
  formatTimecode: formatSequenceTimecode,
  log: logEvent,
});
const timelineEditActions = createTimelineEditActions({
  getTimeline: () => sequenceData,
  setTimeline: (timeline) => { sequenceData = timeline; },
  track: sequenceTrack,
  clipTrack: timelineAuthoringPanels.clipTrack,
  clipName: timelineAuthoringPanels.clipName,
  deleteClipKey: timelineAuthoringPanels.deleteClipKey,
  selectedKeys: selectedSequenceKeys,
  setFrame: setSequenceFrame,
  clampFrame: clampSequenceFrame,
  renderTimeline: () => renderSequenceTimeline(),
  renderClipPanel: timelineAuthoringPanels.renderClipCuePanel,
  commit: commitEditorChange,
  copyKeys: copySequenceKeys,
  deleteKeys: deleteSequenceKeys,
  setReadout: (message) => setText("#sequence-selection-readout", message),
});
let productionData: EditorProject["production"] = {
  export: { width: 1920, height: 1080, fps: 30, codec: "avc", preset: "1080p" }, reactiveBindings: [], midiMappings: [], logicGraph: { nodes: [], edges: [] }, spriteRig: { bones: [], poses: [] }, annotations: [],
};
let productionTab: "export" | "reactive" | "logic" | "rig" | "review" = "export";
let automationRecording = false;
let fftAudioContext: AudioContext | undefined;
let fftAnalyser: AnalyserNode | undefined;
let fftFrequencyData: Uint8Array<ArrayBuffer> | undefined;
let fftAudioElement: HTMLAudioElement | undefined;
let fftAudioAssetId: string | undefined;
let midiAccess: MIDIAccess | undefined;
let selectedSpriteBoneId = "bone-spine";
let spriteBoneDrag: { bone: EditorSpriteBone; pointerId: number } | undefined;

function resetFftAudioPreview() {
  const audioElement = fftAudioElement;
  const audioContext = fftAudioContext;
  fftAudioElement = undefined;
  fftAudioContext = undefined;
  fftAnalyser = undefined;
  fftFrequencyData = undefined;
  fftAudioAssetId = undefined;
  if (audioElement) {
    audioElement.pause();
    audioElement.removeAttribute("src");
    audioElement.load();
  }
  if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
}

function pruneAssetPreviews(project: EditorProject) {
  const retainedAssetIds = new Set(project.assets.map((asset) => asset.id));
  if (fftAudioAssetId && !retainedAssetIds.has(fftAudioAssetId)) resetFftAudioPreview();
  for (const id of assetRuntimeBlobs.keys()) if (!retainedAssetIds.has(id)) assetRuntimeBlobs.delete(id);
  for (const [id, url] of assetPreviewUrls) {
    if (retainedAssetIds.has(id)) continue;
    URL.revokeObjectURL(url);
    assetPreviewUrls.delete(id);
    assetPreviewImages.delete(id);
  }
}

function buildMotionController(): ThreeHumanoidMotionController {
  const multiplier = jointLimitPercent / 100;
  const controller = createThreeHumanoidMotionController({
    root: motionFixture.root,
    skeleton: motionFixture.skeleton,
    heightField: { heightAt: (_x, z) => interactiveTerrain && z >= 0.75 ? terrainHeight : 0 },
    locomotion: { cycleDistanceScale: strideScale, fullStrideSpeed: 1.6 },
    jointLimits: {
      leftUpperLeg: { maxSwingRadians: 1.75 * multiplier },
      rightUpperLeg: { maxSwingRadians: 1.75 * multiplier },
      leftLowerLeg: { maxSwingRadians: 2.55 * multiplier },
      rightLowerLeg: { maxSwingRadians: 2.55 * multiplier },
    },
  });
  setText("#rig-capabilities", controller.state.capabilities.leftFootPlant && controller.state.capabilities.rightFootPlant ? "FOOT PLANT READY" : "PARTIAL RIG");
  setText("#rig-joints", `${motionFixture.bones.length} BONES`);
  return controller;
}

function recreateMotionController() {
  motionFixture.root.position.set(0, 0, 0);
  motionController = buildMotionController();
  motionController.move([0, 0, walking ? locomotionSpeed : 0]);
}

function updateMotion(delta: number) {
  const safeDelta = Math.min(0.03333333333333333, Math.max(0.004166666666666667, delta));
  motionController.move([0, 0, walking ? locomotionSpeed : 0]);
  motionController.update(safeDelta);
  motionElapsed += safeDelta;
  const state = motionController.state;
  setText("#motion-time", formatMotionTime(motionElapsed));
  setText("#rig-phase", state.locomotion.motionPhase.toUpperCase());
  setText("#rig-pose-time", `pose ${state.metrics.poseTimeMs.toFixed(3)} ms`);
  setText("#gait-phase", state.locomotion.gaitPhase.toFixed(3));
  setText("#root-position", `${state.motor.position.z.toFixed(3)} m`);
  setText("#plant-error", `${state.metrics.plantedVerticalError.toFixed(4)} m`);
  setText("#limits-clamped", String(state.metrics.jointLimitsClamped));
  setText("#pose-finite", state.metrics.poseFinite ? "FINITE" : "INVALID");
  setText("#foot-slip-value", `${state.metrics.footSlipDistance.toFixed(4)} m`);
  const slipPercent = Math.min(100, state.metrics.footSlipDistance / 0.02 * 100);
  requireElement<HTMLElement>("#foot-slip-bar").style.width = `${slipPercent}%`;
  const footCard = requireElement<HTMLElement>(".foot-slip-card");
  const failing = state.metrics.footSlipDistance >= 0.02;
  footCard.classList.toggle("is-failing", failing);
  setText("#foot-slip-status", failing ? "Outside engine acceptance threshold" : "Within engine acceptance threshold");
  setText("#rig-checksum", `POSE ${poseChecksum(state.pose.rotations)}`);
  if (globalThis.__engineEditor) globalThis.__engineEditor.footSlipMeters = state.metrics.footSlipDistance;
}

function updateSequence(delta: number) {
  if (!sequencePlaying) return;
  sequenceFrame += delta * sequenceData.fps * sequenceData.playbackSpeed;
  if (sequenceFrame >= sequenceData.loopEnd) sequenceFrame = sequenceData.loopStart + (sequenceFrame - sequenceData.loopEnd);
  const rounded = Math.round(sequenceFrame);
  if (rounded !== lastSequenceRenderedFrame) {
    updateSequencePlayhead();
    renderSequenceDrivenPreviews();
  }
}

function withSequencePreviewFrame<T>(frame: number | undefined, operation: () => T): T {
  if (frame === undefined) return operation();
  const previousRenderingFrame = renderingTimelineFrame;
  renderingTimelineFrame = frame;
  try { return withTimelinePreviewFrame2D(sequenceData, entities, frame, operation); }
  finally {
    renderingTimelineFrame = previousRenderingFrame;
  }
}

function currentEditorSpriteFrame(time: number, requestedClipId?: string) {
  return sampleAtlasClipFrame({ frames: atlasFrames, sequence: animationSequence.map((frame) => frame.id), clips: animationClips, defaultClipId: activeAnimationClipId, requestedClipId, playbackSpeed: atlasPlaybackSpeed, timeSeconds: time });
}

function renderSequenceDrivenPreviews() {
  if (activeWorkspace === "stage") renderStage();
  if (activeWorkspace === "post") renderPostPreview();
  if (!requireElement<HTMLElement>("#production-center").hidden && (productionTab === "export" || productionTab === "review")) {
    renderExportPreview();
    renderReviewFrame();
  }
}

function renderRig() {
  const ctx = rigContext;
  const width = rigCanvas.width;
  const height = rigCanvas.height;
  ctx.clearRect(0, 0, width, height);
  const backdrop = ctx.createRadialGradient(width / 2, height * 0.45, 30, width / 2, height * 0.45, height * 0.7);
  backdrop.addColorStop(0, "#102a31");
  backdrop.addColorStop(0.56, "#08161e");
  backdrop.addColorStop(1, "#050a10");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);
  drawRigFloor(ctx, width, height);
  if (interactiveTerrain && terrainHeight > 0) {
    const stepTop = height * 0.78 - terrainHeight * 210;
    ctx.fillStyle = "rgb(243 173 78 / 12%)";
    ctx.strokeStyle = "#f3ad4e";
    ctx.fillRect(width * .58, stepTop, width * .3, height * .78 - stepTop);
    ctx.strokeRect(width * .58, stepTop, width * .3, height * .78 - stepTop);
  }

  motionFixture.root.updateMatrixWorld(true);
  const points = motionFixture.bones.map((bone) => {
    const position = bone.getWorldPosition(new Vector3());
    return { x: width / 2 + position.x * 185 + position.z * 9, y: height * 0.78 - (position.y - terrainHeight) * 210, position };
  });
  rigScreenPoints.clear();
  points.forEach((point,index)=>rigScreenPoints.set(motionFixture.bones[index].name,{x:point.x,y:point.y}));
  const leftHandScreen=rigScreenPoints.get("LeftHand");const rightHandScreen=rigScreenPoints.get("RightHand");
  if(leftHandScreen){rigCanvas.dataset.leftHandX=String(leftHandScreen.x);rigCanvas.dataset.leftHandY=String(leftHandScreen.y);}if(rightHandScreen){rigCanvas.dataset.rightHandX=String(rightHandScreen.x);rigCanvas.dataset.rightHandY=String(rightHandScreen.y);}
  ctx.save();
  ctx.lineCap = "round";
  for (const [index, bone] of motionFixture.bones.entries()) {
    if (!(bone.parent instanceof Bone)) continue;
    const parentIndex = motionFixture.bones.indexOf(bone.parent);
    if (parentIndex < 0) continue;
    const point = points[index];
    const parentPoint = points[parentIndex];
    const limb = /Leg|Foot/.test(bone.name);
    ctx.strokeStyle = limb ? "#61ebc4" : "#3cd0cf";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.lineWidth = limb ? 7 : 5;
    ctx.beginPath(); ctx.moveTo(parentPoint.x, parentPoint.y); ctx.lineTo(point.x, point.y); ctx.stroke();
    ctx.strokeStyle = "rgb(210 255 247 / 55%)";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (const [index, point] of points.entries()) {
    const isFoot = /Foot/.test(motionFixture.bones[index].name);
    ctx.fillStyle = isFoot ? "#ffbb57" : "#5ff5e6";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(point.x, point.y, isFoot ? 6 : 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  const state = motionController.state;
  for (const foot of [state.leftFoot, state.rightFoot]) {
    if (!foot) continue;
    const x = width / 2 + foot.anchorWorld[0] * 185 + foot.anchorWorld[2] * 9;
    const y = height * 0.78 - (foot.anchorWorld[1] - terrainHeight) * 210;
    ctx.strokeStyle = foot.planted ? "#ffb54b" : "#6e8290";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + 4, 17, 6, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const laserY = height * .78 - terrainHeight * 210;
  ctx.strokeStyle = "rgb(255 101 120 / 88%)";
  ctx.shadowColor = "#ff6578";
  ctx.shadowBlur = 9;
  ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(width * .18, laserY); ctx.lineTo(width * .86, laserY); ctx.stroke();
  ctx.setLineDash([]); ctx.shadowBlur = 0;
  ctx.fillStyle = "#ff8190"; ctx.font = "8px ui-monospace,monospace";
  ctx.fillText(`FOOT-SLIP LASER · ${state.metrics.footSlipDistance.toFixed(4)} m`, width * .18, laserY - 8);
}

function drawRigFloor(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.strokeStyle = "rgb(72 158 157 / 15%)";
  ctx.lineWidth = 1;
  const horizon = height * 0.72;
  for (let row = 0; row < 9; row += 1) {
    const y = horizon + row * row * 2.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  for (let column = -8; column <= 8; column += 1) {
    ctx.beginPath(); ctx.moveTo(width / 2 + column * 14, horizon); ctx.lineTo(width / 2 + column * 70, height); ctx.stroke();
  }
  ctx.restore();
}

function setProceduralWalk(active: boolean) {
  walking = active;
  const button = requireElement<HTMLButtonElement>("#walk-toggle");
  button.dataset.walkState = active ? "walking" : "idle";
  button.innerHTML = active ? "<span>Ⅱ</span> Pause procedural walk" : "<span>▶</span> Start procedural walk";
  motionController.move([0, 0, active ? locomotionSpeed : 0]);
  logEvent(`motion → ${active ? "procedural walk" : "idle"}`);
}

function stepMotion(frames = 1) {
  for (let index = 0; index < frames; index += 1) updateMotion(0.016666666666666666);
  renderRig();
}

function createThreeHumanoidFixture() {
  const root = new Object3D();
  const hips = makeBone("Hips", 0, 0.9, 0);
  const spine = makeBone("Spine", 0, 0.2, 0);
  const chest = makeBone("Chest", 0, 0.22, 0);
  const neck = makeBone("Neck", 0, 0.18, 0);
  const head = makeBone("Head", 0, 0.18, 0);
  const leftUpperLeg = makeBone("LeftUpLeg", -0.14, -0.15, 0);
  const leftLowerLeg = makeBone("LeftLeg", 0, -0.38, 0);
  const leftFoot = makeBone("LeftFoot", 0, -0.38, 0.04);
  const rightUpperLeg = makeBone("RightUpLeg", 0.14, -0.15, 0);
  const rightLowerLeg = makeBone("RightLeg", 0, -0.38, 0);
  const rightFoot = makeBone("RightFoot", 0, -0.38, 0.04);
  const leftUpperArm = makeBone("LeftArm", -0.24, 0.08, 0);
  const leftLowerArm = makeBone("LeftForeArm", -0.32, 0, 0);
  const leftHand = makeBone("LeftHand", -0.3, 0, 0);
  const rightUpperArm = makeBone("RightArm", 0.24, 0.08, 0);
  const rightLowerArm = makeBone("RightForeArm", 0.32, 0, 0);
  const rightHand = makeBone("RightHand", 0.3, 0, 0);
  root.add(hips);
  hips.add(spine, leftUpperLeg, rightUpperLeg);
  spine.add(chest);
  chest.add(neck, leftUpperArm, rightUpperArm);
  neck.add(head);
  leftUpperLeg.add(leftLowerLeg); leftLowerLeg.add(leftFoot);
  rightUpperLeg.add(rightLowerLeg); rightLowerLeg.add(rightFoot);
  leftUpperArm.add(leftLowerArm); leftLowerArm.add(leftHand);
  rightUpperArm.add(rightLowerArm); rightLowerArm.add(rightHand);
  const bones = [hips, spine, chest, neck, head, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand];
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  skeleton.calculateInverses();
  return { root, skeleton, bones };
}

function makeBone(name: string, x: number, y: number, z: number) {
  const joint = new Bone();
  joint.name = name;
  joint.position.set(x, y, z);
  return joint;
}

// Diagnostics and MMO profiler --------------------------------------------

const interestGrid = createInterestGrid({ cellSize: 96, maxEntitiesPerClient: 32, hysteresisCells: 1 });
const interestEntities: InterestEntity[] = Array.from({ length: 54 }, (_, index) => ({
  id: `entity-${String(index + 1).padStart(2, "0")}`,
  type: index % 7 === 0 ? "loot" : index % 3 === 0 ? "hostile" : "player",
  x: 45 + (index * 83) % 720,
  y: 38 + (index * 137) % 470,
  radius: index % 4 === 0 ? 16 : 8,
  priority: index % 9,
}));
for (const entity of interestEntities) interestGrid.upsert(entity);
let aoiFocus = { x: 390, y: 265, radius: 145 };
let aoiDragging = false;
let hoveredAoiCell: { column: number; row: number } | null = null;
const interestDeltaSchema = defineSchema<{ tick: number; visible: number; entered: number; left: number }>({ tick: "u32", visible: "u16", entered: "u16", left: "u16" });
let previousInterestSnapshot = { tick: 0, visible: 0, entered: 0, left: 0 };
let wasmKernel: CollisionKernel | null = null;
let typescriptKernel: CollisionKernel | null = null;
let wasmLatencyMs = 0;
let typescriptLatencyMs = 0;
let debugDemoVisible = false;

function spikeSpawn() {
  const base = interestEntities.length;
  for (let index = 0; index < 50; index += 1) {
    const entity: InterestEntity = {
      id: `spike-player-${base + index + 1}`,
      type: "player",
      x: aoiFocus.x - 110 + (index * 37) % 220,
      y: aoiFocus.y - 90 + (index * 53) % 180,
      radius: 7,
      priority: 10 + index % 4,
    };
    interestEntities.push(entity);
    interestGrid.upsert(entity);
  }
  setText("#stage-entity-count", String(entities.length));
  logEvent("interest grid demo → spawned 50 synthetic players");
  drawInterestMap();
}

function ensureSupplementalUi() {
  const stat = requireElement<HTMLElement>(".stat-panel");
  if (!document.querySelector("#wasm-fallback-diagnostic")) {
    const diagnostic = document.createElement("div");
    diagnostic.className = "fallback-diagnostic";
    diagnostic.id = "wasm-fallback-diagnostic";
    diagnostic.hidden = true;
    diagnostic.innerHTML = '<strong>Scalar TS Fallback Active</strong><span id="wasm-fallback-reason"></span>';
    stat.append(diagnostic);
  }
  const toolbar = requireElement<HTMLElement>(".aoi-toolbar");
  const readout = document.createElement("span");
  readout.id = "delta-payload-size";
  readout.textContent = "delta 0 B";
  const spike = document.createElement("button");
  spike.id = "spike-spawn";
  spike.className = "spike-button";
  spike.textContent = "SPIKE +50";
  spike.addEventListener("click", spikeSpawn);
  toolbar.append(readout, spike);
  const entityCount = stat.querySelectorAll("dd")[2];
  if (entityCount) entityCount.id = "stage-entity-count";
}

async function initializeKernels() {
  [wasmKernel, typescriptKernel] = await Promise.all([
    createCollisionKernel({
      url: "/wasm/collision-kernel.wasm",
      onFallback(diagnostic) { showWasmFallback(diagnostic.reason); },
    }),
    createCollisionKernel({
      url: "/force-typescript-fallback.wasm",
      fetch: createRejectingFetch(() => new Error("intentional TypeScript comparison backend")),
    }),
  ]);
  setText("#runtime-backend", `${wasmKernel.backend} collision kernel`);
  setText("#diag-backend", wasmKernel.backend.toUpperCase());
  logEvent(`kernel → ${wasmKernel.backend}`);
}

function showWasmFallback(reason: string) {
  wasmFallbackActive = true;
  wasmFallbackReason = reason;
  setText("#runtime-backend", "Scalar TS Fallback Active");
  setText("#diag-backend", "TYPESCRIPT");
  const diagnostic = requireElement<HTMLElement>("#wasm-fallback-diagnostic");
  diagnostic.hidden = false;
  setText("#wasm-fallback-reason", reason);
  if (globalThis.__engineEditor) {
    globalThis.__engineEditor.wasmFallbackActive = true;
    globalThis.__engineEditor.wasmFallbackReason = reason;
  }
  logEvent(`WASM fallback → ${reason}`);
}

async function simulateWasmFallback() {
  const reason = "Failed to load WASM asset: MIME type 'application/octet-stream' not permitted for streaming compilation in this context";
  wasmKernel = await createCollisionKernel({
    url: "/wasm/collision-kernel.wasm",
    fetch: createRejectingFetch(() => new TypeError(reason)),
    onFallback(diagnostic) { showWasmFallback(diagnostic.reason.includes("MIME type") ? diagnostic.reason : reason); },
  });
  showWasmFallback(reason);
}

async function runBenchmark() {
  if (!wasmKernel || !typescriptKernel) await initializeKernels();
  if (!wasmKernel || !typescriptKernel) throw new Error("Collision kernels did not initialize.");
  const button = requireElement<HTMLButtonElement>("#run-benchmark");
  button.disabled = true;
  button.textContent = "Benchmarking…";
  await nextFrame();
  const result = benchmarkCollisionKernels(wasmKernel, typescriptKernel);
  wasmLatencyMs = result.wasmMs;
  typescriptLatencyMs = result.typescriptMs;
  const max = Math.max(wasmLatencyMs, typescriptLatencyMs, 0.001);
  requireElement<HTMLElement>("#wasm-bar").style.width = `${Math.max(4, wasmLatencyMs / max * 100)}%`;
  requireElement<HTMLElement>("#js-bar").style.width = `${Math.max(4, typescriptLatencyMs / max * 100)}%`;
  setText("#wasm-backend-label", wasmKernel.backend === "wasm" ? "WASM SIMD" : "TS fallback");
  setText("#wasm-latency", `${wasmLatencyMs.toFixed(3)} ms p95`);
  setText("#js-latency", `${typescriptLatencyMs.toFixed(3)} ms p95`);
  const residentSummary = result.residentWasmMs === undefined ? "resident path unavailable" : `resident ${result.residentWasmMs.toFixed(3)} ms p95 / 0 timed host bytes`;
  setText("#benchmark-output", `${result.operationsPerSample.toLocaleString()} overlaps/backend · batch ${result.batchSize} · ${result.samplesPerBackend} balanced samples · ${residentSummary}`);
  button.disabled = false; button.textContent = "Run Benchmark";
  if (globalThis.__engineEditor) {
    globalThis.__engineEditor.wasmLatencyMs = wasmLatencyMs;
    globalThis.__engineEditor.typescriptLatencyMs = typescriptLatencyMs;
  }
  logEvent(`bench → copied wasm ${wasmLatencyMs.toFixed(3)} ms p95 / ${residentSummary} / ts ${typescriptLatencyMs.toFixed(3)} ms p95 / batch ${result.batchSize}`);
  return { wasmMs: wasmLatencyMs, typescriptMs: typescriptLatencyMs };
}

function renderDiagnostics() {
  syncDebugDemoVisibility();
  drawFrameGraph();
  setText("#stage-entity-count", String(entities.length));
  if (debugDemoVisible) drawInterestMap();
}

function syncDebugDemoVisibility() {
  document.querySelectorAll<HTMLElement>("[data-debug-demo]").forEach((element) => {
    element.hidden = !debugDemoVisible;
    element.style.display = debugDemoVisible ? "" : "none";
  });
  const placeholder = requireElement<HTMLElement>("#debug-demo-placeholder");
  placeholder.hidden = debugDemoVisible;
  placeholder.style.display = debugDemoVisible ? "none" : "";
}

function drawFrameGraph() {
  const ctx = frameContext;
  const width = frameCanvas.width;
  const height = frameCanvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#09131b";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgb(66 95 112 / 35%)";
  ctx.lineWidth = 1;
  for (let y = 20; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  drawSeries(ctx, frameTimes, width, height, "#42d8d0", 22);
  drawSeries(ctx, clampTimes, width, height, "#f0a74c", 3);
  const sorted = frameTimes.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)] ?? 0;
  setText("#frame-p95", `p95 ${p95.toFixed(2)} ms`);
}

function drawSeries(ctx: CanvasRenderingContext2D, values: number[], width: number, height: number, color: string, scale: number) {
  if (values.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = index / (values.length - 1) * width;
    const y = height - 10 - Math.min(height - 20, value / scale * (height - 20));
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawInterestMap() {
  const ctx = aoiContext;
  const width = aoiCanvas.width;
  const height = aoiCanvas.height;
  ctx.clearRect(0, 0, width, height);
  const background = ctx.createRadialGradient(aoiFocus.x, aoiFocus.y, 10, aoiFocus.x, aoiFocus.y, 450);
  background.addColorStop(0, "#102731");
  background.addColorStop(1, "#061018");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgb(54 164 142 / 22%)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 96) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 96) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke(); }

  if (hoveredAoiCell) {
    const cellX=hoveredAoiCell.column*96;const cellY=hoveredAoiCell.row*96;
    ctx.fillStyle="rgb(243 173 78 / 8%)";ctx.strokeStyle="#f3ad4e";ctx.lineWidth=2;ctx.fillRect(cellX,cellY,96,96);ctx.strokeRect(cellX+1,cellY+1,94,94);
    ctx.fillStyle="#70bfff";ctx.font="8px ui-monospace,monospace";ctx.fillText(`SUBSCRIBERS · ${3+(hoveredAoiCell.column+hoveredAoiCell.row)%6}`,cellX+7,cellY+14);
  }

  const result = interestGrid.computeVisibility("studio-client", aoiFocus);
  const interestSnapshot = { tick: frameCount, visible: result.visible.length, entered: result.entered.length, left: result.left.length };
  const deltaBytes = encodeDelta(interestDeltaSchema, previousInterestSnapshot, interestSnapshot);
  previousInterestSnapshot = interestSnapshot;
  setText("#delta-payload-size", `delta ${deltaBytes.byteLength} B · +${result.entered.length} / -${result.left.length}`);
  const visible = new Set(result.visible);
  for (const entity of interestEntities) {
    const isVisible = visible.has(entity.id);
    const color = entity.type === "hostile" ? "#ff6578" : entity.type === "loot" ? "#65e6a5" : "#44d9d4";
    ctx.globalAlpha = isVisible ? 1 : 0.25;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = isVisible ? 9 : 0;
    ctx.beginPath(); ctx.arc(entity.x, entity.y, isVisible ? 5.5 : 3, 0, Math.PI * 2); ctx.fill();
    if (isVisible) {
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(entity.x - 11, entity.y - 11, 22, 22);
    }
    if(hoveredAoiCell&&Math.floor(entity.x/96)===hoveredAoiCell.column&&Math.floor(entity.y/96)===hoveredAoiCell.row){ctx.globalAlpha=1;ctx.strokeStyle="#70bfff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(entity.x,entity.y,14,0,Math.PI*2);ctx.stroke();}
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f0ae52";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.arc(aoiFocus.x, aoiFocus.y, aoiFocus.radius + 96, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#62e7a5";
  ctx.beginPath(); ctx.arc(aoiFocus.x, aoiFocus.y, aoiFocus.radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#8bffd9";
  ctx.beginPath(); ctx.arc(aoiFocus.x, aoiFocus.y, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(aoiFocus.x - 15, aoiFocus.y); ctx.lineTo(aoiFocus.x + 15, aoiFocus.y); ctx.moveTo(aoiFocus.x, aoiFocus.y - 15); ctx.lineTo(aoiFocus.x, aoiFocus.y + 15); ctx.stroke();
  setText("#aoi-visible-count", `${result.visible.length} visible entities`);
  setText("#room-visibility", `${result.visible.length} / 32`);
  requireElement<HTMLProgressElement>("#visibility-progress").value = result.visible.length;
}

function updateFrameTelemetry(workMs: number) {
  frameCount += 1;
  if (globalThis.__engineEditor) globalThis.__engineEditor.frameCount = frameCount;
  const sampledAt = performance.now();
  const frameGap = frameTimes.length && previousFrameTelemetryAt !== undefined ? Math.max(0.001, sampledAt - previousFrameTelemetryAt) : 16.67;
  previousFrameTelemetryAt = sampledAt;
  const clamped = Math.max(0, frameGap - 50);
  if (clamped > 0) clampEvents += 1;
  frameTimes.push(Math.min(50, frameGap));
  clampTimes.push(clamped);
  if (frameTimes.length > 100) frameTimes.shift();
  if (clampTimes.length > 100) clampTimes.shift();
  const now = performance.now();
  if (now - lastFpsSampleAt > 500) {
    measuredFps = (frameCount - lastFpsSampleFrame) / ((now - lastFpsSampleAt) / 1000);
    lastFpsSampleAt = now;
    lastFpsSampleFrame = frameCount;
    setText("#stage-fps", measuredFps.toFixed(1));
    setText("#diag-fps", measuredFps.toFixed(1));
    setText("#raf-count", frameCount.toLocaleString());
    setText("#clamp-count", String(clampEvents));
    setText("#stage-frame-ms", `${workMs.toFixed(2)} ms`);
    const sorted = frameTimes.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.max(0, Math.floor(sorted.length * .95) - 1)] ?? 0;
    const budgetBadge = requireElement<HTMLElement>("#global-frame-budget");
    budgetBadge.textContent = `p95 ${p95.toFixed(2)} / 16.67 ms`;
    budgetBadge.classList.toggle("is-amber", p95 > 12 && p95 <= 16.67);
    budgetBadge.classList.toggle("is-red", p95 > 16.67);
    if (activeWorkspace === "diagnostics") renderDiagnostics();
  }
}

type PacketRecord = { time: string; message: string; payload: Record<string, unknown> };
const packetRecords: PacketRecord[] = [];
let selectedPacketIndex = 0;

function logEvent(message: string) {
  const log = document.querySelector<HTMLElement>("#event-log");
  if (!log) return;
  const now = new Date();
  packetRecords.unshift({time:now.toLocaleTimeString([],{hour12:false,minute:"2-digit",second:"2-digit"}),message,payload:{type:message.split(" → ")[0],schema:"engine-editor-v1",delta:{sequence:frameCount,latencyMs:injectedLatencyMs},detail:message}});
  if(packetRecords.length>30)packetRecords.pop();
  selectedPacketIndex=0;
  renderPacketLog();
}

function renderPacketLog(){
  const log=requireElement<HTMLElement>("#event-log");const query=requireElement<HTMLInputElement>("#packet-filter").value.trim().toLowerCase();const filtered=packetRecords.filter((packet)=>!query||packet.message.toLowerCase().includes(query)||JSON.stringify(packet.payload).toLowerCase().includes(query));
  log.innerHTML=filtered.map((packet,index)=>`<div class="log-row ${index===selectedPacketIndex?"is-selected":""}" data-packet-index="${index}"><time>${packet.time}</time><span>${packet.message}</span></div>`).join("");
  log.querySelectorAll<HTMLElement>("[data-packet-index]").forEach((row)=>row.addEventListener("click",()=>{selectedPacketIndex=Number(row.dataset.packetIndex);renderPacketLog();}));
  const selected=filtered[selectedPacketIndex];setText("#packet-payload",selected?JSON.stringify(selected.payload,null,2):"No packet matches the current filter.");
}

// Interaction bindings -----------------------------------------------------

type EditorCommand={id:string;label:string;detail:string;shortcut?:string;run():void};
const workspaceCommands:EditorCommand[]=[
  {id:"workspace-stage",label:"Open Stage & Entity Inspector",detail:"Workspace 1 · scene graph and transforms",shortcut:"Ctrl 1",run:()=>showWorkspace("stage")},
  {id:"workspace-3d",label:"Open Experimental 3D Declaration",detail:"Workspace 2 · lightweight Edit proxy · Play and Build use the first-party 3D runtime",shortcut:"Ctrl 2",run:()=>showWorkspace("scene3d")},
  {id:"workspace-tilemap",label:"Open Tilemap & Collision Painter",detail:"Workspace 3 · paint and extract collision",shortcut:"Ctrl 3",run:()=>showWorkspace("tilemap")},
  {id:"workspace-atlas",label:"Open Assets & Atlas Slicer",detail:"Workspace 4 · imported assets, frames, and animation",shortcut:"Ctrl 4",run:()=>showWorkspace("atlas")},
  {id:"workspace-code",label:"Open TypeScript Editor",detail:"Workspace 5 · edit project behavior source",shortcut:"Ctrl 5",run:()=>showWorkspace("script")},
  {id:"workspace-post",label:"Open Polish & Post-Process",detail:"Workspace 6 · FX stack and frame budgets",shortcut:"Ctrl 6",run:()=>showWorkspace("post")},
  {id:"post-crt",label:"Jump to Post-Process CRT Scanlines",detail:"Select the CRT effect in the active stack",run:()=>{showWorkspace("post");document.querySelector<HTMLElement>('[data-effect-id="crt"]')?.scrollIntoView({block:"center"});}},
  {id:"post-grayscale",label:"Jump to Post-Process Grayscale Effect",detail:"Select the grayscale pixel pass",run:()=>{showWorkspace("post");document.querySelector<HTMLElement>('[data-effect-id="grayscale"]')?.scrollIntoView({block:"center"});}},
  {id:"workspace-motion",label:"Open Sequence & Motion",detail:"Workspace 7 · keyframes, curves, audio, events, and live rig",shortcut:"Ctrl 7",run:()=>showWorkspace("motion")},
  {id:"workspace-diagnostics",label:"Open Runtime Diagnostics",detail:"Workspace 8 · live frame timing and kernel benchmarks; demo network lab is disclosed separately",shortcut:"Ctrl 8",run:()=>showWorkspace("diagnostics")},
];
function clickEditorControl(selector: string) {
  const control = document.querySelector<HTMLElement>(selector);
  if (!control) { setText("#footer-status", "That editor action is not available in the current context"); return; }
  control.click();
}

function editorActionCommand(id: string, label: string, detail: string, action: string, shortcut?: string): EditorCommand {
  return { id, label, detail, shortcut, run: () => clickEditorControl(`[data-editor-action="${action}"]`) };
}

function currentEditorCommands(): EditorCommand[] {
  const project = editorShell?.project;
  const selected = selectedEntityId ? entities.find((entity) => entity.id === selectedEntityId) : undefined;
  const projectCommands: EditorCommand[] = [
    editorActionCommand("project-new", "New Project", "Choose a working starter or blank project", "new"),
    editorActionCommand("project-open", "Open Project", "Open portable project files", "open", "Ctrl O"),
    editorActionCommand("project-save", "Save Project", "Flush source and save portable project files", "save", "Ctrl S"),
    editorActionCommand("project-import-assets", "Import Assets", "Add images, audio, data, fonts, or embedded-buffer glTF", "import-assets"),
    editorActionCommand("project-build", "Build Project", "Open verified offline build preflight", "build"),
    editorActionCommand("project-settings", "Project Settings", "Input, target, locale, audio, and accessibility", "settings"),
    editorActionCommand("project-undo", "Undo", "Undo the latest project command", "undo", "Ctrl Z"),
    editorActionCommand("project-redo", "Redo", "Redo the latest project command", "redo", "Ctrl Y"),
    { id: "mode-play", label: isEditorPlayActive() ? "Restart Play" : "Play Project", detail: "Run the active 2D or 3D game runtime", run: () => clickEditorControl('[data-editor-mode="play"]') },
    { id: "mode-edit", label: "Stop Play and Edit", detail: "Restore the authored project without runtime mutations", run: () => clickEditorControl('[data-editor-mode="edit"]') },
    editorActionCommand("scene-create", "Create Scene", "Add and activate a project scene", "create-scene"),
    editorActionCommand("entity-create", "Create Entity", "Add an entity to the active scene", "create-entity"),
    editorActionCommand("script-create", "Create Behavior Script", "Add project-owned TypeScript with editable public properties", "create-script"),
  ];
  if (selected) projectCommands.push(
    { id: "entity-rename-selected", label: `Rename ${selected.label}`, detail: "Rename the selected entity", run: () => clickEditorControl(`[data-editor-action="rename-entity"][data-entity-id="${CSS.escape(selected.id)}"]`) },
    { id: "entity-duplicate-selected", label: `Duplicate ${selected.label}`, detail: "Duplicate the selected entity and its components", run: () => clickEditorControl(`[data-editor-action="duplicate-entity"][data-entity-id="${CSS.escape(selected.id)}"]`) },
    { id: "entity-delete-selected", label: `Delete ${selected.label}`, detail: "Delete the selected entity after confirmation", run: () => clickEditorControl(`[data-editor-action="delete-entity-by-id"][data-entity-id="${CSS.escape(selected.id)}"]`) },
  );
  const entityCommands: EditorCommand[] = entities.map((entity) => ({ id: `entity-${entity.id}`, label: `Select Entity ${entity.label}`, detail: `${entity.id} · layer ${entity.layer ?? 0}`, run: () => { showWorkspace("stage"); selectEntity(entity.id); } }));
  const assetCommands: EditorCommand[] = (project?.assets ?? []).map((asset) => ({ id: `asset-${asset.id}`, label: `Inspect ${asset.name}`, detail: `${asset.kind} · ${asset.id}`, run: () => {
    showWorkspace(asset.kind === "image" ? "atlas" : "stage");
    clickEditorControl(`[data-editor-action="select-asset"][data-asset-id="${CSS.escape(asset.id)}"]`);
  } }));
  return [...projectCommands, ...workspaceCommands, ...entityCommands, ...assetCommands];
}

function openCommandPalette(){editorShell?.openCommandPalette();}

function togglePlayback(){if(app.isRunning()){app.stop();loopPaused=true;}else{app.start();loopPaused=false;}requireElement(".runtime-status").classList.toggle("is-paused",loopPaused);setText("#playback-status",loopPaused?"PAUSED":"RUNNING");setText("#global-playback",loopPaused?"▶":"Ⅱ");if(globalThis.__engineEditor)globalThis.__engineEditor.loopPaused=loopPaused;}
function advanceSingleFrame(){if(app.isRunning())togglePlayback();stage.update(0.016666666666666666);updateMotion(0.016666666666666666);atlasElapsed+=0.016666666666666666*atlasPlaybackSpeed;renderStage();renderTilemap();renderAtlas();renderRig();manualSteps+=1;setText("#playback-status","STEP_BY_FRAME");if(globalThis.__engineEditor)globalThis.__engineEditor.manualSteps=manualSteps;logEvent("loop → advanced exactly one frame");}

requireElement("#global-playback").addEventListener("click",togglePlayback);
window.addEventListener("keydown",(event)=>{
  const paletteOpen=editorShell?.commandPaletteOpen() ?? false;
  if((event.ctrlKey&&event.key.toLowerCase()==="p")||(event.metaKey&&event.key.toLowerCase()==="k")){event.preventDefault();openCommandPalette();return;}
  if(paletteOpen)return;
  const target=event.target;if(target instanceof HTMLElement && target.closest('[aria-haspopup="listbox"], [role="listbox"]')) return;const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||(target instanceof HTMLElement&&target.isContentEditable);
  if(!typing&&(event.ctrlKey||event.metaKey)&&/^Digit[1-8]$/.test(event.code)){event.preventDefault();const ids:WorkspaceId[]=["stage","scene3d","tilemap","atlas","script","post","motion","diagnostics"];showWorkspace(requireArrayItem(ids,Number(event.code.slice(-1))-1,"workspace shortcut"));return;}
  if(!typing&&event.code==="Space"){event.preventDefault();if(activeWorkspace==="motion")toggleSequencePlayback();else togglePlayback();return;}
  if(!typing&&(event.metaKey||event.ctrlKey)&&event.code==="ArrowRight"){event.preventDefault();advanceSingleFrame();return;}
  if(!typing&&activeWorkspace==="stage"&&event.code==="KeyG"){
    worldGridVisible=!worldGridVisible;
    const badge=requireElement<HTMLElement>("#calibration-badge");
    badge.textContent=`G · GRID ${worldGridVisible?"ON":"OFF"}   ALT + Z · CALIBRATE ZERO`;
    renderStage();
    event.preventDefault();
  }
  if(!typing&&activeWorkspace==="stage"&&event.altKey&&event.code==="KeyZ"){
    zeroCalibrationArmed=true;
    const badge=requireElement<HTMLElement>("#calibration-badge");
    badge.classList.add("is-armed");
    badge.textContent="CALIBRATION ARMED · CLICK WORLD ZERO";
    event.preventDefault();
  }
  if(!typing&&activeWorkspace==="tilemap"){
    if(event.code==="KeyB")setTileTool("paint");if(event.code==="KeyE")setTileTool("erase");if(event.code==="KeyG")setTileTool("fill");if(event.code==="KeyM")setTileTool("marquee");if(event.code==="KeyC")runCollisionExtraction();if(event.code==="KeyI")eyedropperHeld=true;
  }
  if(!typing&&activeWorkspace==="atlas"){
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){selectedAtlasFrame=(selectedAtlasFrame+(event.key==="ArrowDown"?1:-1)+atlasFrames.length)%Math.max(1,atlasFrames.length);renderAtlasPanels();renderAtlas();event.preventDefault();}if(event.key==="F2"){beginAtlasRename();event.preventDefault();}
  }
  if(!typing&&activeWorkspace==="post"&&event.code==="Backquote"&&!event.repeat){postBypassed=true;requireElement(".compare-stage").classList.add("is-bypassed");renderPostPreview();event.preventDefault();}
  if(!typing&&activeWorkspace==="motion"&&event.shiftKey&&event.code==="KeyS"){requireElement("#symmetry-state").classList.add("is-active");requireElement("#symmetry-state em").textContent="MIRRORING";}
  if(!typing&&activeWorkspace==="diagnostics"&&event.key==="/"){packetFilter.focus();event.preventDefault();}
});
window.addEventListener("keyup",(event)=>{if(event.code==="KeyI")eyedropperHeld=false;if(event.code==="Backquote"&&postBypassed){postBypassed=false;requireElement(".compare-stage").classList.remove("is-bypassed");renderPostPreview();}if(event.code==="KeyS"){requireElement("#symmetry-state").classList.remove("is-active");requireElement("#symmetry-state em").textContent="READY";}});

document.querySelectorAll<HTMLElement>("[data-workspace-tab]").forEach((tab) => {
  tab.addEventListener("click", () => showWorkspace(requireOneOf(tab.dataset.workspaceTab, ["stage", "scene3d", "tilemap", "atlas", "script", "post", "motion", "diagnostics"], "workspace tab")));
});
renderStageHierarchy();
const stageDelegation = createCanvasObjectEvents(stageCanvas, () => entities, {
  toWorld: (point) => stageWorldPoint(point),
  hitTest(entity, x, y) {
    const width = entity.width * entity.scale;
    const height = entity.height * entity.scale;
    return x >= entity.x - width / 2 && x <= entity.x + width / 2 && y >= entity.y - height / 2 && y <= entity.y + height / 2;
  },
});
for (const entity of entities) bindStageEntityEvents(entity);

function bindStageEntityEvents(entity: EditorEntity) {
  stageDelegation.on(entity, "click", () => selectEntity(entity.id));
}

type StageDrag = { kind: "entity"; entity: EditorEntity; start: { x: number; y: number }; entityStart: { x: number; y: number } } | { kind: "camera"; start: { x: number; y: number }; cameraStart: { x: number; y: number } };
let stageDrag: StageDrag | null = null;

stageCanvas.addEventListener("pointerdown", (event) => {
  const world = stageWorldPoint(canvasPoint(stageCanvas, event.clientX, event.clientY));
  if (zeroCalibrationArmed) {
    calibrateWorldZero(world.x, world.y);
    event.preventDefault();
    return;
  }
  if (event.button === 1 || stageTool === "pan") {
    stageDrag = { kind: "camera", start: { x: event.clientX, y: event.clientY }, cameraStart: { x: stageViewport.cameraX, y: stageViewport.cameraY } };
    stageCanvas.setPointerCapture(event.pointerId);
    return;
  }
  let entity = stageDelegation.hit(world.x, world.y);
  if (!entity) return;
  selectEntity(entity.id);
  if (isEditorPlayActive()) return;
  if (event.altKey) {
    const clone: EditorEntity = { ...entity, components: structuredClone(entity.components ?? []), id: `${entity.id}-copy-${entities.length + 1}`, label: `${entity.label} Copy`, x: entity.x + 8, y: entity.y + 8 };
    entities.push(clone);
    stage.spawn(clone, { layer: clone.layer });
    bindStageEntityEvents(clone);
    entity = clone;
    selectEntity(clone.id);
    logEvent(`clone → ${clone.id}`);
  }
  stageDrag = { kind: "entity", entity, start: world, entityStart: { x: entity.x, y: entity.y } };
  stageCanvas.setPointerCapture(event.pointerId);
});
stageCanvas.addEventListener("pointermove", (event) => {
  if (!stageDrag) return;
  if (stageDrag.kind === "camera") {
    const rect = stageCanvas.getBoundingClientRect();
    stageViewport.cameraX = stageDrag.cameraStart.x + (event.clientX - stageDrag.start.x) * stageCanvas.width / rect.width / stageViewport.zoom;
    stageViewport.cameraY = stageDrag.cameraStart.y + (event.clientY - stageDrag.start.y) * stageCanvas.height / rect.height / stageViewport.zoom;
    return;
  }
  const world = stageWorldPoint(canvasPoint(stageCanvas, event.clientX, event.clientY));
  let dx = world.x - stageDrag.start.x;
  let dy = world.y - stageDrag.start.y;
  if (event.shiftKey) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
  }
  const precision = event.ctrlKey || event.metaKey;
  const snap = precision ? 0 : 8;
  const nextX = stageDrag.entityStart.x + dx;
  const nextY = stageDrag.entityStart.y + dy;
  const resolvedX = snap ? Math.round(nextX / snap) * snap : nextX;
  const resolvedY = snap ? Math.round(nextY / snap) * snap : nextY;
  translateEntity(stageDrag.entity, resolvedX - stageDrag.entity.x, resolvedY - stageDrag.entity.y);
  selectEntity(stageDrag.entity.id);
});
stageCanvas.addEventListener("pointerup", (event) => { const completed=stageDrag;stageDrag=null;if(completed?.kind==="entity")commitEditorChange("Move stage entity");if(stageCanvas.hasPointerCapture(event.pointerId))stageCanvas.releasePointerCapture(event.pointerId); });
stageCanvas.addEventListener("pointercancel", () => { stageDrag = null; });
stageCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  stageViewport.zoom = Math.max(.5, Math.min(2.5, stageViewport.zoom * (event.deltaY > 0 ? .9 : 1.1)));
  requireElement<HTMLElement>(".zoom-label").textContent = `${Math.round(stageViewport.zoom * 100)}%`;
}, { passive: false });
stageCanvas.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  if (isEditorPlayActive()) return;
  const entity = entities.find((candidate) => candidate.id === selectedEntityId);
  if (!entity) return;
  const step = event.shiftKey ? 8 : 1;
  const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
  const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
  translateEntity(entity, dx, dy); selectEntity(entity.id); renderStage(); commitEditorChange("Nudge stage entity"); event.preventDefault();
});
document.querySelectorAll<HTMLButtonElement>("[data-stage-tool]").forEach((button) => button.addEventListener("click", () => {
  stageTool = requireOneOf(button.dataset.stageTool, ["select", "pan"], "stage tool");
  document.querySelectorAll<HTMLButtonElement>("[data-stage-tool]").forEach((candidate) => { const active = candidate === button; candidate.classList.toggle("is-active", active); candidate.setAttribute("aria-pressed", String(active)); });
  stageCanvas.style.cursor = stageTool === "pan" ? "grab" : "crosshair";
}));
requireElement("#toggle-stage-grid").addEventListener("click", () => { worldGridVisible = !worldGridVisible; requireElement("#toggle-stage-grid").setAttribute("aria-pressed", String(worldGridVisible)); renderStage(); });
requireElement("#center-stage-camera").addEventListener("click", () => { stageViewport.cameraX = 0; stageViewport.cameraY = 0; stageViewport.zoom = 1; requireElement<HTMLElement>(".zoom-label").textContent = "100%"; renderStage(); });
requireElement<HTMLInputElement>("#hierarchy-filter").addEventListener("input", (event) => renderStageHierarchy(requireEventCurrentTarget(event, HTMLInputElement).value));

function stageWorldPoint(point: { x: number; y: number }) {
  return { x: (point.x - 380) / stageViewport.zoom + 380 - stageViewport.cameraX, y: (point.y - 240) / stageViewport.zoom + 240 - stageViewport.cameraY };
}

document.querySelectorAll<HTMLElement>("[data-scrub-property]").forEach((label) => {
  label.addEventListener("pointerdown", (event) => {
    if (isEditorPlayActive()) { setText("#footer-status", "Stop Play before editing transforms"); return; }
    const entity = entities.find((candidate) => candidate.id === selectedEntityId);
    if (!entity) return;
    const property = requireOneOf(label.dataset.scrubProperty, ["x", "y", "scale"], "scrub property");
    const initial = entity[property];
    const startX = event.clientX;
    label.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const speed = moveEvent.shiftKey ? 10 : moveEvent.altKey ? .1 : 1;
      const delta = (moveEvent.clientX - startX) * speed * (property === "scale" ? .01 : 1);
      entity[property] = property === "scale" ? Math.max(.1, initial + delta) : initial + delta;
      selectEntity(entity.id);
    };
    const end = () => { label.removeEventListener("pointermove", move); label.removeEventListener("pointerup", end); commitEditorChange(`Adjust entity ${property}`); };
    label.addEventListener("pointermove", move);
    label.addEventListener("pointerup", end);
  });
});

function buildTileGrid() {
  const grid = requireElement<HTMLElement>("#tile-grid");
  grid.replaceChildren();
  tileValues.forEach((tile, index) => {
    const cell = document.createElement("button");
    cell.dataset.tile = String(tile);
    cell.title = `col ${index % 8}, row ${Math.floor(index / 8)}`;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${cell.title}, tile ${tile}`);
    cell.addEventListener("pointerenter", (event) => {
      if (event.buttons === 1) paintTile(index, cell);
    });
    cell.addEventListener("click", () => paintTile(index, cell));
    grid.append(cell);
  });
}

function paintTile(index: number, cell: HTMLButtonElement) {
  setText("#paint-coordinate", `col ${index % 8} · row ${Math.floor(index / 8)}`);
  if (brushMode === "inspect") return;
  tileValues[index] = brushMode === "erase" ? 2 : selectedTile;
  const mapIndex = Math.floor(index / 8) * mapColumns + index % 8;
  mapTileValues[mapIndex] = tileValues[index];
  cell.dataset.tile = String(tileValues[index]);
  cell.setAttribute("aria-label", `${cell.title}, tile ${tileValues[index]}`);
  renderTilemap();
  commitEditorChange("Paint tilemap");
}

document.querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((button) => {
  button.addEventListener("click", () => {
    brushMode = requireOneOf(button.dataset.brush, ["paint", "erase", "inspect", "fill", "marquee"], "brush mode");
    document.querySelectorAll("[data-brush]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-tile]").forEach((button) => {
  if (!button.classList.contains("tile-swatch")) return;
  button.addEventListener("click", () => {
    selectedTile = Number(button.dataset.tile);
    document.querySelectorAll(".tile-swatch").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-tile-tool]").forEach((button) => button.addEventListener("click", () => setTileTool(requireOneOf(button.dataset.tileTool, ["paint", "erase", "inspect", "fill", "marquee"], "tile tool"))));
document.querySelectorAll<HTMLButtonElement>("[data-map-tile]").forEach((button) => button.addEventListener("click", () => {
  selectTileValue(Number(button.dataset.mapTile));
}));
document.querySelectorAll<HTMLButtonElement>("[data-map-tile]").forEach((button) => button.addEventListener("contextmenu", (event) => {
  const value = Number(button.dataset.mapTile);
  event.preventDefault();
  openTimelineLocalMenu(event.clientX, event.clientY, [
    { label: `Select tile ${value}`, run: () => selectTileValue(value) },
    { label: `Copy tile ${value}`, run: () => { copiedTile = value; setText("#tile-sample-readout", `COPIED TILE ID ${value}`); } },
    { label: tileSolidValues.includes(value) ? "Make non-solid" : "Make solid", run: () => toggleTileCollision(value) },
  ]);
}));
tilemapCanvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  tilePointerDown = true;
  const cell = tileCellFromPointer(event.clientX, event.clientY);
  tileDragStart = cell;
  if (brushMode === "marquee") tileSelection = { startColumn: cell.column, startRow: cell.row, endColumn: cell.column, endRow: cell.row };
  else applyTileAt(cell.column, cell.row, event.altKey ? "erase" : brushMode);
  tilemapCanvas.setPointerCapture(event.pointerId);
  renderTilemap();
});
tilemapCanvas.addEventListener("pointermove", (event) => {
  const cell = tileCellFromPointer(event.clientX, event.clientY);
  setText("#tilemap-coordinate", `COL ${cell.column} · ROW ${cell.row}`);
  if (!tilePointerDown || !tileDragStart) return;
  if (brushMode === "marquee") {
    tileSelection = { startColumn: tileDragStart.column, startRow: tileDragStart.row, endColumn: cell.column, endRow: cell.row };
    const bounds = normalizedTileSelection(tileSelection);
    setText("#marquee-summary", `${bounds.width} × ${bounds.height} selection · ${bounds.width * bounds.height} tiles`);
  } else if (event.shiftKey) paintTileLine(tileDragStart, cell, event.altKey);
  else applyTileAt(cell.column, cell.row, event.altKey ? "erase" : brushMode);
  renderTilemap();
});
tilemapCanvas.addEventListener("pointerup", (event) => { const painted=tilePointerDown;tilePointerDown=false;tileDragStart=null;if(painted)commitEditorChange("Paint tilemap");if(tilemapCanvas.hasPointerCapture(event.pointerId))tilemapCanvas.releasePointerCapture(event.pointerId); });
tilemapCanvas.addEventListener("pointercancel",()=>{tilePointerDown=false;tileDragStart=null;});
tilemapCanvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const cell = tileCellFromPointer(event.clientX, event.clientY);
  const index = cell.row * mapColumns + cell.column;
  const value = mapTileValues[index] ?? 0;
  const pasteTile = copiedTile;
  openTimelineLocalMenu(event.clientX, event.clientY, [
    { label: `Inspect tile ${value}`, run: () => { selectTileValue(value); setText("#tilemap-coordinate", `COL ${cell.column} · ROW ${cell.row} · TILE ${value}`); } },
    { label: `Copy tile ${value}`, run: () => { copiedTile = value; setText("#tile-sample-readout", `COPIED TILE ID ${value}`); } },
    ...(pasteTile === undefined ? [] : [{ label: `Paste tile ${pasteTile}`, run: () => { mapTileValues[index] = pasteTile; syncMiniTileValues(); renderTilemap(); commitEditorChange("Paste tilemap cell"); } }]),
    { label: tileSolidValues.includes(value) ? `Make tile ${value} non-solid` : `Make tile ${value} solid`, run: () => toggleTileCollision(value) },
    { label: "Erase cell", danger: true, run: () => { mapTileValues[index] = 2; syncMiniTileValues(); renderTilemap(); commitEditorChange("Erase tilemap cell"); } },
  ]);
});
requireElement("#extract-collisions").addEventListener("click",()=>runCollisionExtraction(true));
for (const selector of ["#tilemap-columns", "#tilemap-rows"]) requireElement<HTMLInputElement>(selector).addEventListener("change", resizeTilemapFromControls);
requireElement<HTMLInputElement>("#tilemap-tile-size").addEventListener("change", (event) => {
  const next = Math.round(Number(requireEventCurrentTarget(event, HTMLInputElement).value));
  if (!Number.isInteger(next) || next < 1 || next > 1024) { renderTilemapMetadata(); return; }
  mapTileSize = next;
  renderTilemapMetadata();
  runCollisionExtraction();
  renderTilemap();
  commitEditorChange("Change tile size");
});
editorSelect("#tilemap-tileset-select").element.addEventListener("change", (event) => {
  if (!editorShell) return;
  const assetId = selectEventValue(event);
  const draft = captureRuntimeProject(editorShell.project);
  try {
    if (assetId) assignEditorTileset(draft, assetId);
    else draft.tilemap.sourceAssetId = undefined;
  } catch (cause) {
    setText("#tilemap-source-status", cause instanceof Error ? cause.message.toUpperCase() : "TILESET ASSIGNMENT FAILED");
    return;
  }
  tilemapSourceAssetId = draft.tilemap.sourceAssetId;
  renderTilemapMetadata(draft);
  commitEditorChange("Choose tilemap tileset source");
});
document.querySelectorAll<HTMLInputElement>("[data-solid-tile]").forEach((input) => input.addEventListener("change", () => {
  if (!editorShell) return;
  const draft = captureRuntimeProject(editorShell.project);
  setEditorTileSolid(draft, Number(input.dataset.solidTile), input.checked);
  tileSolidValues = [...draft.tilemap.solidValues];
  renderTilemapMetadata(draft);
  runCollisionExtraction(true);
}));

requireElement("#slice-grid").addEventListener("click",()=>{if(commitGridSlice())commitEditorChange("Slice atlas grid");});
for (const selector of ["#slice-width", "#slice-height"]) requireElement<HTMLInputElement>(selector).addEventListener("keydown",(event)=>{if(event.key==="Enter"&&commitGridSlice())commitEditorChange("Slice atlas grid");});
editorSelect("#atlas-source-select").element.addEventListener("change", (event) => {
  atlasSourceAssetId = selectEventValue(event) || undefined;
  atlasFrames = [];
  animationSequence = [];
  animationClips = [{ id: "default", name: "Default", sequence: [], fps: 8, loop: true }];
  activeAnimationClipId = "default";
  selectedAtlasFrame = 0;
  selectedAtlasFrames = new Set();
  renderAtlasPanels();
  renderAtlas();
  commitEditorChange("Choose atlas source asset");
});
editorSelect("#atlas-clip-select").element.addEventListener("change", (event) => {
  syncActiveAnimationClip();
  activeAnimationClipId = selectEventValue(event);
  loadActiveAnimationClip(); renderAtlasPanels(); renderAtlas(); commitEditorChange("Switch animation clip");
});
requireElement<HTMLInputElement>("#atlas-clip-fps").addEventListener("change", (event) => {
  const clip = animationClips.find((candidate) => candidate.id === activeAnimationClipId); if (!clip) return;
  clip.fps = Math.max(1, Math.min(60, Number(requireEventCurrentTarget(event, HTMLInputElement).value) || 8)); commitEditorChange("Adjust animation clip FPS");
});
requireElement<HTMLInputElement>("#atlas-clip-loop").addEventListener("change", (event) => {
  const clip = animationClips.find((candidate) => candidate.id === activeAnimationClipId); if (!clip) return;
  clip.loop = requireEventCurrentTarget(event, HTMLInputElement).checked; commitEditorChange("Toggle animation clip loop");
});
requireElement("#atlas-new-clip").addEventListener("click", () => {
  syncActiveAnimationClip(); const id = `clip-${Date.now().toString(36)}`;
  animationClips.push({ id, name: `Clip ${animationClips.length + 1}`, sequence: [], fps: 8, loop: true }); activeAnimationClipId = id; loadActiveAnimationClip(); renderAtlasPanels(); renderAtlas(); commitEditorChange("Create animation clip");
});
requireElement("#atlas-duplicate-clip").addEventListener("click", () => {
  syncActiveAnimationClip(); const source = animationClips.find((candidate) => candidate.id === activeAnimationClipId); if (!source) return;
  const id = `clip-${Date.now().toString(36)}`; animationClips.push({ ...structuredClone(source), id, name: `${source.name} copy` }); activeAnimationClipId = id; loadActiveAnimationClip(); renderAtlasPanels(); renderAtlas(); commitEditorChange("Duplicate animation clip");
});
requireElement<HTMLElement>("[data-atlas-tool='manual']").addEventListener("click",()=>{atlasManualSlicing=!atlasManualSlicing;requireElement("[data-atlas-tool='manual']").classList.toggle("is-active",atlasManualSlicing);});
atlasCanvas.addEventListener("pointerdown",(event)=>{
  if (!atlasViewport()) return;
  const point=atlasSourcePoint(event.clientX,event.clientY);
  if(!atlasManualSlicing){
    const index=atlasFrames.findIndex((frame)=>point.x>=frame.x&&point.x<=frame.x+frame.width&&point.y>=frame.y&&point.y<=frame.y+frame.height);
    if(index<0)return;if(!event.shiftKey)selectedAtlasFrames.clear();if(event.shiftKey&&selectedAtlasFrames.has(index))selectedAtlasFrames.delete(index);else selectedAtlasFrames.add(index);selectedAtlasFrame=index;renderAtlasPanels();renderAtlas();return;
  }
  atlasDragStart=point;atlasDraftRect={x:point.x,y:point.y,width:1,height:1};atlasCanvas.setPointerCapture(event.pointerId);
});
atlasCanvas.addEventListener("pointermove",(event)=>{if(!atlasDragStart)return;const point=atlasSourcePoint(event.clientX,event.clientY);atlasDraftRect={x:Math.min(atlasDragStart.x,point.x),y:Math.min(atlasDragStart.y,point.y),width:Math.abs(point.x-atlasDragStart.x),height:Math.abs(point.y-atlasDragStart.y)};renderAtlas();});
atlasCanvas.addEventListener("pointerup",(event)=>{let added=false;if(atlasDraftRect&&atlasDraftRect.width>=8&&atlasDraftRect.height>=8){addManualAtlasFrame(atlasDraftRect);added=true;}atlasDraftRect=null;atlasDragStart=null;if(atlasCanvas.hasPointerCapture(event.pointerId))atlasCanvas.releasePointerCapture(event.pointerId);renderAtlas();if(added)commitEditorChange("Add manual atlas frame");});
const atlasSpeed=requireElement<HTMLInputElement>("#atlas-speed");
atlasSpeed.addEventListener("input",()=>{atlasPlaybackSpeed=Number(atlasSpeed.value);setText("#atlas-speed-output",`${atlasPlaybackSpeed.toFixed(1)}×`);setText("#atlas-playback-chip",`PLAYING · ${atlasPlaybackSpeed.toFixed(1)}×`);});
atlasSpeed.addEventListener("change",()=>commitEditorChange("Adjust atlas playback speed"));
atlasSpeed.addEventListener("dblclick",()=>{atlasSpeed.value="1";atlasSpeed.dispatchEvent(new Event("input"));});

function atlasSourcePoint(clientX:number,clientY:number){const point=canvasPoint(atlasCanvas,clientX,clientY);const viewport=atlasViewport();if(!viewport)return{x:0,y:0};return{x:Math.max(0,Math.min(viewport.sourceWidth,(point.x-viewport.x)/viewport.scale)),y:Math.max(0,Math.min(viewport.sourceHeight,(point.y-viewport.y)/viewport.scale))};}
requireElement("#reset-effects").addEventListener("click", () => {
  heavyPostPasses = 0;
  effectConfigs.forEach((effect) => { effect.enabled = effect.id === "sepia" || effect.id === "crt"; });
  renderEffectControls(); updatePostProcessing();
  commitEditorChange("Reset post-processing effects");
});
requireElement("#post-preview-playback").addEventListener("click",togglePlayback);
requireElement("#motion-reset").addEventListener("click", () => { motionElapsed = 0; recreateMotionController(); });
requireElement("#walk-toggle").addEventListener("click", () => setProceduralWalk(!walking));
requireElement("#single-step").addEventListener("click", () => stepMotion(1));
requireElement<HTMLInputElement>("#terrain-heightfield").addEventListener("change", (event) => {
  interactiveTerrain = requireEventCurrentTarget(event, HTMLInputElement).checked;
  setText("#terrain-mode-output", interactiveTerrain ? "ON" : "OFF");
  recreateMotionController();
  renderRig();
  logEvent(`terrain heightfield → ${interactiveTerrain ? "enabled" : "disabled"}`);
});

bindRange("#locomotion-speed", "#speed-output", (value) => {
  locomotionSpeed = value;
  return `${value.toFixed(2)} m/s`;
});
bindRange("#terrain-height", "#terrain-output", (value) => {
  terrainHeight = value;
  return `${value.toFixed(2)} m`;
});
bindRange("#stride-scale", "#stride-output", (value) => {
  strideScale = value;
  recreateMotionController();
  return value.toFixed(2);
});
bindRange("#joint-limit", "#joint-output", (value) => {
  jointLimitPercent = value;
  recreateMotionController();
  return `${Math.round(value)}%`;
});
const jointLimitInput=requireElement<HTMLInputElement>("#joint-limit");
jointLimitInput.addEventListener("dblclick",()=>{jointLimitInput.value="100";jointLimitInput.dispatchEvent(new Event("input"));logEvent("joint limits → baseline pose");});
document.querySelectorAll<HTMLButtonElement>("[data-motion-tool]").forEach((button)=>button.addEventListener("click",()=>{
  motionTool=requireOneOf(button.dataset.motionTool,["pose","ik"],"motion tool");
  document.querySelectorAll<HTMLButtonElement>("[data-motion-tool]").forEach((candidate)=>{const active=candidate===button;candidate.classList.toggle("is-active",active);candidate.setAttribute("aria-pressed",String(active));});
  rigCanvas.style.cursor=motionTool==="ik"?"grab":"default";
}));
rigCanvas.addEventListener("pointerdown",(event)=>{
  if(motionTool!=="ik")return;
  const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const left=rigScreenPoints.get("LeftHand");const right=rigScreenPoints.get("RightHand");
  const leftDistance=left?Math.hypot(point.x-left.x,point.y-left.y):Infinity;const rightDistance=right?Math.hypot(point.x-right.x,point.y-right.y):Infinity;
  if(Math.min(leftDistance,rightDistance)>120)return;activeIkHandle=leftDistance<=rightDistance?"left":"right";rigCanvas.setPointerCapture(event.pointerId);requireElement(".rig-canvas-wrap").classList.add("is-ik-dragging");
});
rigCanvas.addEventListener("pointermove",(event)=>{if(!activeIkHandle)return;const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const target:[number,number,number]=[(point.x-rigCanvas.width/2)/185,(rigCanvas.height*.78-point.y)/210+terrainHeight,motionController.state.motor.position.z+.25];if(activeIkHandle==="left")leftHandTarget=target;else rightHandTarget=target;motionController.setHandTargets(leftHandTarget,rightHandTarget,1);motionController.update(0.016666666666666666);rigCanvas.dataset.ikSolved="true";renderRig();});
rigCanvas.addEventListener("pointerup",(event)=>{activeIkHandle=null;if(rigCanvas.hasPointerCapture(event.pointerId))rigCanvas.releasePointerCapture(event.pointerId);requireElement(".rig-canvas-wrap").classList.remove("is-ik-dragging");});
const rigCanvasWrap=requireElement<HTMLElement>(".rig-canvas-wrap");
rigCanvasWrap.addEventListener("pointerdown",(event)=>{if(motionTool!=="ik"||activeIkHandle)return;const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const left=rigScreenPoints.get("LeftHand");const right=rigScreenPoints.get("RightHand");const leftDistance=left?Math.hypot(point.x-left.x,point.y-left.y):Infinity;const rightDistance=right?Math.hypot(point.x-right.x,point.y-right.y):Infinity;if(Math.min(leftDistance,rightDistance)>120)return;activeIkHandle=leftDistance<=rightDistance?"left":"right";rigCanvasWrap.setPointerCapture(event.pointerId);rigCanvasWrap.classList.add("is-ik-dragging");},{capture:true});
rigCanvasWrap.addEventListener("pointermove",(event)=>{if(!activeIkHandle)return;const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const target:[number,number,number]=[(point.x-rigCanvas.width/2)/185,(rigCanvas.height*.78-point.y)/210+terrainHeight,motionController.state.motor.position.z+.25];if(activeIkHandle==="left")leftHandTarget=target;else rightHandTarget=target;motionController.setHandTargets(leftHandTarget,rightHandTarget,1);motionController.update(0.016666666666666666);rigCanvas.dataset.ikSolved="true";renderRig();},{capture:true});
rigCanvasWrap.addEventListener("pointerup",(event)=>{if(!activeIkHandle)return;activeIkHandle=null;if(rigCanvasWrap.hasPointerCapture(event.pointerId))rigCanvasWrap.releasePointerCapture(event.pointerId);rigCanvasWrap.classList.remove("is-ik-dragging");},{capture:true});
requireElement("#run-benchmark").addEventListener("click", () => { void runBenchmark(); });
requireElement("#clear-log").addEventListener("click", () => {packetRecords.length=0;selectedPacketIndex=0;renderPacketLog();});
requireElement("#toggle-debug-demo").addEventListener("click", () => {
  debugDemoVisible = !debugDemoVisible;
  syncDebugDemoVisibility();
  const button = requireElement<HTMLButtonElement>("#toggle-debug-demo");
  button.setAttribute("aria-expanded", String(debugDemoVisible));
  button.textContent = debugDemoVisible ? "Hide demo network lab" : "Show demo network lab";
  if (debugDemoVisible) drawInterestMap();
});

const latencySlider=requireElement<HTMLInputElement>("#latency-slider");
latencySlider.addEventListener("input",()=>{injectedLatencyMs=Number(latencySlider.value);setText("#latency-output",`${injectedLatencyMs} ms`);if(globalThis.__engineEditor)globalThis.__engineEditor.injectedLatencyMs=injectedLatencyMs;});
latencySlider.addEventListener("dblclick",()=>{latencySlider.value="0";latencySlider.dispatchEvent(new Event("input"));logEvent("latency → reset 0 ms");});
const packetFilter=requireElement<HTMLInputElement>("#packet-filter");
packetFilter.addEventListener("input",()=>{selectedPacketIndex=0;renderPacketLog();});
packetFilter.addEventListener("keydown",(event)=>{if(event.key==="Escape"){packetFilter.blur();event.preventDefault();}if(event.key==="ArrowDown"||event.key==="ArrowUp"){const direction=event.key==="ArrowDown"?1:-1;selectedPacketIndex=Math.max(0,Math.min(packetRecords.length-1,selectedPacketIndex+direction));renderPacketLog();event.preventDefault();}});

aoiCanvas.addEventListener("pointerdown", (event) => { aoiDragging = true; moveAoiFocus(event); aoiCanvas.setPointerCapture(event.pointerId); });
aoiCanvas.addEventListener("pointermove", (event) => { const point=canvasPoint(aoiCanvas,event.clientX,event.clientY);hoveredAoiCell={column:Math.floor(point.x/96),row:Math.floor(point.y/96)};if (aoiDragging) moveAoiFocus(event);else drawInterestMap(); });
aoiCanvas.addEventListener("pointerleave",()=>{hoveredAoiCell=null;if(!aoiDragging)drawInterestMap();});
aoiCanvas.addEventListener("pointerup", (event) => { aoiDragging = false; aoiCanvas.releasePointerCapture(event.pointerId); });

function moveAoiFocus(event: PointerEvent) {
  const point = canvasPoint(aoiCanvas, event.clientX, event.clientY);
  aoiFocus = { ...aoiFocus, x: point.x, y: point.y };
  drawInterestMap();
}

function bindRange(inputSelector: string, outputSelector: string, update: (value: number) => string) {
  const input = requireElement<HTMLInputElement>(inputSelector);
  input.addEventListener("input", () => setText(outputSelector, update(Number(input.value))));
}

function renderPoseTracks() {
  const tracks = requireElement<HTMLElement>("#pose-tracks");
  const names = ["Motion Root", "Hips", "Left Leg", "Right Leg", "Spine", "Head", "Arms"];
  tracks.innerHTML = names.map((name, row) => {
    const positions = [10 + (row * 11) % 28, 42 + (row * 7) % 24, 76 + (row * 13) % 18];
    return `<div class="pose-track"><span>${name}</span><div class="track-line">${positions.map((left) => `<i class="keyframe" style="left:${left}%"></i>`).join("")}</div></div>`;
  }).join("");
}

function renderSequenceTimeline(filter = "") {
  const query = filter.trim().toLowerCase().replace(/^t:/, "");
  const tracks = sequenceData.tracks.filter((track) => !query || `${track.label} ${track.property} ${track.targetId}`.toLowerCase().includes(query));
  const clipTracks = (sequenceData.clipTracks ?? []).filter((track) => !query || `${track.label} animation clip ${track.targetId}`.toLowerCase().includes(query));
  const labels = requireElement<HTMLElement>("#sequence-track-list");
  labels.innerHTML = tracks.map((track) => `<div class="sequence-track-label ${selectedSequenceKeysHasTrack(track.id) ? "is-active" : ""}" role="listitem" style="--track-color:${track.color}" data-sequence-track="${escapeMarkup(track.id)}"><i aria-hidden="true"></i><span>${escapeMarkup(track.label)}<small>${escapeMarkup(track.property)} · ${track.keyframes.length} keys</small></span><button data-track-lock="${escapeMarkup(track.id)}" aria-label="${track.locked ? "Unlock" : "Lock"} ${escapeMarkup(track.label)} track" aria-pressed="${track.locked}">${track.locked ? "L" : "○"}</button><button data-track-mute="${escapeMarkup(track.id)}" aria-label="${track.muted ? "Unmute" : "Mute"} ${escapeMarkup(track.label)} track" aria-pressed="${track.muted}">${track.muted ? "M" : "◉"}</button><details class="resource-overflow sequence-track-menu"><summary aria-label="${escapeMarkup(track.label)} track actions">…</summary><div class="resource-menu" role="menu"><button type="button" role="menuitem" data-timeline-track-action="rename" data-track-id="${escapeMarkup(track.id)}">Rename</button><button type="button" role="menuitem" data-timeline-track-action="duplicate" data-track-id="${escapeMarkup(track.id)}">Duplicate</button><button type="button" role="menuitem" class="is-danger" data-timeline-track-action="delete" data-track-id="${escapeMarkup(track.id)}">Delete</button></div></details></div>`).join("");
  labels.insertAdjacentHTML("beforeend", clipTracks.map((track) => `<div class="sequence-track-label" role="listitem" style="--track-color:#b997ff" data-clip-track="${escapeMarkup(track.id)}"><i aria-hidden="true"></i><span>${escapeMarkup(track.label)}<small>SPRITE CLIP · ${track.keyframes.length} cues</small></span><button data-clip-track-lock="${escapeMarkup(track.id)}" aria-label="${track.locked ? "Unlock" : "Lock"} ${escapeMarkup(track.label)} clip track" aria-pressed="${track.locked}">${track.locked ? "L" : "○"}</button><button data-clip-track-mute="${escapeMarkup(track.id)}" aria-label="${track.muted ? "Unmute" : "Mute"} ${escapeMarkup(track.label)} clip track" aria-pressed="${track.muted}">${track.muted ? "M" : "◉"}</button><button data-delete-clip-track="${escapeMarkup(track.id)}" aria-label="Delete ${escapeMarkup(track.label)} clip track">×</button></div>`).join(""));
  const rows = requireElement<HTMLElement>("#sequence-track-rows");
  const audio = sequenceData.audioTracks[0];
  rows.innerHTML = tracks.map((track) => `<div class="sequence-row ${track.muted ? "is-muted" : ""}" data-row-track="${escapeMarkup(track.id)}">${track.keyframes.map((key) => `<button class="sequence-key ${selectedSequenceKeys.has(key.id) ? "is-selected" : ""}" data-key-id="${escapeMarkup(key.id)}" data-track-id="${escapeMarkup(track.id)}" aria-label="${escapeMarkup(track.label)} at frame ${key.frame}, ${formatSequenceValue(track, key.value)}" style="left:${framePercent(key.frame)}%;--key-color:${track.color}"></button>`).join("")}</div>`).join("") +
    `<div class="sequence-row audio-row">${audio ? renderTimelineAudioClip(audio, { framePercent, escapeMarkup }) : ""}</div><div class="sequence-row event-row">${sequenceData.events.map((event) => `<button class="event-marker" data-event-id="${escapeMarkup(event.id)}" style="left:${framePercent(event.frame)}%;--event-color:${eventColor(event.kind)}" title="Frame ${event.frame} · ${escapeMarkup(event.kind)}">${escapeMarkup(event.label)}</button>`).join("")}</div>`;

  requireDescendant<HTMLElement>(rows, ".audio-row").insertAdjacentHTML("beforebegin", clipTracks.map((track) => `<div class="sequence-row ${track.muted ? "is-muted" : ""}" data-row-clip-track="${escapeMarkup(track.id)}">${track.keyframes.map((key) => `<button class="clip-key" data-clip-key-id="${escapeMarkup(key.id)}" data-clip-track-id="${escapeMarkup(track.id)}" style="left:${framePercent(key.frame)}%" aria-label="${escapeMarkup(timelineAuthoringPanels.clipName(key.clipId))} clip at frame ${key.frame}" title="Frame ${key.frame} · ${escapeMarkup(timelineAuthoringPanels.clipName(key.clipId))} · holds until next cue">${escapeMarkup(timelineAuthoringPanels.clipName(key.clipId))}</button>`).join("")}</div>`).join(""));
  requireDescendant<HTMLElement>(rows, ".event-row").insertAdjacentHTML("beforeend", (sequenceData.effects ?? []).map((effect) => `<button class="event-marker effect-marker" data-effect-id="${escapeMarkup(effect.id)}" style="left:${framePercent(effect.frame)}%;--event-color:${timelineEffectColor(effect.kind)}" title="Frame ${effect.frame} · ${escapeMarkup(effect.kind)} · ${effect.durationFrames}f · intensity ${effect.intensity}">✦ ${escapeMarkup(effect.label)}</button>`).join(""));
  renderTimelineGuides({ timeline: sequenceData, beatGrid: sequenceBeatGrid, framePercent, formatRulerLabel: formatTimelineRulerLabel, escapeMarkup });
  bindSequenceTimelineRows();
  updateSequencePlayhead();
  updateSequenceInspector();
  updateSequencePreviewStatus();
  timelineAuthoringPanels.renderChoreographyPanel();
  timelineAuthoringPanels.renderClipCuePanel();
}

function bindSequenceTimelineRows() {
  document.querySelectorAll<HTMLButtonElement>(".sequence-key").forEach((element) => element.addEventListener("pointerdown", (event) => beginSequenceKeyDrag(event, element)));
  document.querySelectorAll<HTMLButtonElement>("[data-track-lock]").forEach((button) => button.addEventListener("click", () => { const track = sequenceTrack(button.dataset.trackLock); if (!track) return; track.locked = !track.locked; renderSequenceTimeline(); commitEditorChange("Toggle animation track lock"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-track-mute]").forEach((button) => button.addEventListener("click", () => { const track = sequenceTrack(button.dataset.trackMute); if (!track) return; track.muted = !track.muted; renderSequenceTimeline(); commitEditorChange("Toggle animation track mute"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-event-id]").forEach((button) => button.addEventListener("click", () => { const marker = sequenceData.events.find((event) => event.id === button.dataset.eventId); if (marker) setSequenceFrame(marker.frame); }));
  document.querySelectorAll<HTMLButtonElement>("[data-effect-id]").forEach((button) => button.addEventListener("click", () => { const effect = sequenceData.effects?.find((candidate) => candidate.id === button.dataset.effectId); if (effect) setSequenceFrame(effect.frame + Math.min(2, effect.durationFrames / 3)); }));
  document.querySelectorAll<HTMLButtonElement>("[data-clip-key-id]").forEach((button) => button.addEventListener("click", () => { const key = timelineAuthoringPanels.clipTrack(button.dataset.clipTrackId)?.keyframes.find((candidate) => candidate.id === button.dataset.clipKeyId); if (key) { setSequenceFrame(key.frame); editorSelect("#clip-cue-select").value = key.clipId; timelineAuthoringPanels.renderClipCuePanel(); } }));
  document.querySelectorAll<HTMLButtonElement>("[data-clip-track-lock]").forEach((button) => button.addEventListener("click", () => { const track = timelineAuthoringPanels.clipTrack(button.dataset.clipTrackLock); if (!track) return; track.locked = !track.locked; renderSequenceTimeline(); commitEditorChange("Toggle sprite clip track lock"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-clip-track-mute]").forEach((button) => button.addEventListener("click", () => { const track = timelineAuthoringPanels.clipTrack(button.dataset.clipTrackMute); if (!track) return; track.muted = !track.muted; renderSequenceTimeline(); renderSequenceDrivenPreviews(); commitEditorChange("Toggle sprite clip track mute"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-delete-clip-track]").forEach((button) => button.addEventListener("click", () => { const track = timelineAuthoringPanels.clipTrack(button.dataset.deleteClipTrack); if (!track || globalThis.confirm?.(`Delete ${track.label} and its ${track.keyframes.length} cues?`) !== true) return; sequenceData.clipTracks = sequenceData.clipTracks?.filter((candidate) => candidate.id !== track.id); renderSequenceTimeline(); commitEditorChange("Delete sprite clip track"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-timeline-track-action]").forEach((button) => button.addEventListener("click", () => timelineEditActions.editTrack(button.dataset.timelineTrackAction, button.dataset.trackId)));
  document.querySelectorAll<HTMLButtonElement>("[data-event-id]").forEach((button) => button.addEventListener("contextmenu", (event) => timelineEditActions.openEventMenu(event, button.dataset.eventId)));
  document.querySelectorAll<HTMLButtonElement>("[data-effect-id]").forEach((button) => button.addEventListener("contextmenu", (event) => timelineEditActions.openEffectMenu(event, button.dataset.effectId)));
  document.querySelectorAll<HTMLButtonElement>("[data-clip-key-id]").forEach((button) => button.addEventListener("contextmenu", (event) => timelineEditActions.openClipKeyMenu(event, button.dataset.clipTrackId, button.dataset.clipKeyId)));
  document.querySelectorAll<HTMLButtonElement>(".sequence-key").forEach((button) => button.addEventListener("contextmenu", (event) => timelineEditActions.openKeyMenu(event, button.dataset.trackId, button.dataset.keyId)));
}

function beginSequenceKeyDrag(event: PointerEvent, element: HTMLButtonElement) {
  const track = sequenceTrack(element.dataset.trackId); const key = track?.keyframes.find((candidate) => candidate.id === element.dataset.keyId);
  if (!track || !key || track.locked) return;
  if (!event.shiftKey && !selectedSequenceKeys.has(key.id)) selectedSequenceKeys.clear();
  if (event.shiftKey && selectedSequenceKeys.has(key.id)) selectedSequenceKeys.delete(key.id); else selectedSequenceKeys.set(key.id, { trackId: track.id, keyId: key.id });
  const startX = event.clientX;
  const starts = selectedKeyframes().map((selected) => ({ ...selected, frame: selected.key.frame }));
  const canvasWidth = requireElement<HTMLElement>("#sequence-canvas").getBoundingClientRect().width;
  element.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    const delta = (moveEvent.clientX - startX) / canvasWidth * sequenceData.durationFrames / sequenceZoom;
    for (const selected of starts) selected.key.frame = clampSequenceFrame(selected.frame + (sequenceSnap ? Math.round(delta) : delta));
    for (const selected of starts) document.querySelector<HTMLElement>(`[data-key-id="${CSS.escape(selected.key.id)}"]`)?.style.setProperty("left", `${framePercent(selected.key.frame)}%`);
    setText("#sequence-selection-readout", `${starts.length} key${starts.length === 1 ? "" : "s"} · Δ ${Math.round(delta)}f`);
  };
  const finish = () => { element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", finish); renderSequenceTimeline(); commitEditorChange("Retime animation keys"); };
  element.addEventListener("pointermove", move); element.addEventListener("pointerup", finish, { once: true });
  document.querySelectorAll<HTMLElement>(".sequence-key").forEach((candidate) => candidate.classList.toggle("is-selected", selectedSequenceKeys.has(candidate.dataset.keyId ?? "")));
  updateSequenceInspector();
  event.preventDefault(); event.stopPropagation();
}

function updateSequenceInspector() {
  const selected = selectedKeyframes(); const count = selected.length;
  setText("#keyframe-inspector-count", count ? `${count} SELECTED` : "NONE");
  requireElement<HTMLElement>("#key-inspector-empty").hidden = count > 0;
  requireElement<HTMLElement>("#key-inspector-fields").hidden = count === 0;
  requireElement<HTMLButtonElement>("#copy-sequence-keys").disabled = count === 0;
  requireElement<HTMLButtonElement>("#delete-sequence-keys").disabled = count === 0;
  setText("#sequence-selection-readout", count ? `${count} key${count === 1 ? "" : "s"} selected · ${selected.map((item) => `F${Math.round(item.key.frame)}`).join(", ")}` : "No keys selected");
  if (!count) return;
  requireElement<HTMLInputElement>("#key-frame-input").value = count === 1 ? String(Math.round(selected[0].key.frame)) : "";
  requireElement<HTMLInputElement>("#key-value-input").value = count === 1 ? String(selected[0].key.value) : "";
  editorSelect("#key-easing").value = selected[0].key.easing;
  document.querySelectorAll<HTMLElement>("[data-easing]").forEach((button) => button.classList.toggle("is-active", button.dataset.easing === selected[0].key.easing));
}

function updateSequencePlayhead() {
  sequenceFrame = clampSequenceFrame(sequenceFrame);
  lastSequenceRenderedFrame = Math.round(sequenceFrame);
  updateTimelinePlayheadView({ frame: sequenceFrame, framePercent, formatTimecode: formatSequenceTimecode, playing: sequencePlaying, runtimeDriven: Boolean(playableTimeline) });
}

function bindSequenceEditor() {
  bindTimelineEditor({ durationFrames: () => sequenceData.durationFrames, loopStart: () => sequenceData.loopStart, loopEnd: () => sequenceData.loopEnd, frame: () => sequenceFrame, zoom: () => sequenceZoom, setFrame: setSequenceFrame, setSnap: (active) => { sequenceSnap = active; }, setBeatGrid: (active) => { sequenceBeatGrid = active; }, setZoom: (value) => { sequenceZoom = value; }, setView: () => undefined, render: renderSequenceTimeline, togglePlayback: toggleSequencePlayback, logOnion: (active) => logEvent(`onion skin → ${active ? "previous + next frames" : "off"}`), setBpm: (value) => { sequenceData.bpm = value; }, setFps: (value) => { sequenceData.fps = value; }, setSpeed: (value) => { sequenceData.playbackSpeed = value; }, tapTempo: tapSequenceTempo, addEvent: addSequenceEvent, findTransients: detectSequenceTransients, addTrack: addSequenceTrack, applyRecipe: timelineAuthoringPanels.applySelectedChoreographyRecipe, setClipCue: timelineAuthoringPanels.setClipCueAtPlayhead, previewExport: previewSequenceExport, previewStage: () => { sequencePreviewEnabled = true; updateSequencePreviewStatus(); showWorkspace("stage"); }, updateMixer, toggleMixer: toggleMixerState, editKeys: editSelectedSequenceKeys, copyKeys: copySequenceKeys, pasteKeys: pasteSequenceKeys, deleteKeys: deleteSequenceKeys, selectedKeyCount: () => selectedSequenceKeys.size, keyboardActive: () => activeWorkspace === "motion", setEasing: setSelectedEasing, beginBoxSelect: beginSequenceBoxSelect, commit: commitEditorChange });
}

function beginSequenceBoxSelect(event: PointerEvent) {
  if (event.target instanceof HTMLElement && event.target.closest("button,.audio-clip")) return;
  const canvas = requireElement<HTMLElement>("#sequence-canvas"); const rect = canvas.getBoundingClientRect(); const start = { x: event.clientX - rect.left, y: event.clientY - rect.top }; const box = requireElement<HTMLElement>("#sequence-box-selection");
  if (!event.shiftKey) selectedSequenceKeys.clear(); box.hidden = false; canvas.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => { const x = moveEvent.clientX - rect.left; const y = moveEvent.clientY - rect.top; box.style.left = `${Math.min(start.x, x)}px`; box.style.top = `${Math.min(start.y, y)}px`; box.style.width = `${Math.abs(x - start.x)}px`; box.style.height = `${Math.abs(y - start.y)}px`; };
  const finish = () => { const bounds = box.getBoundingClientRect(); document.querySelectorAll<HTMLElement>(".sequence-key").forEach((key) => { const keyBounds = key.getBoundingClientRect(); if (keyBounds.right >= bounds.left && keyBounds.left <= bounds.right && keyBounds.bottom >= bounds.top && keyBounds.top <= bounds.bottom) { const keyId = requireDataset(key, "keyId"); selectedSequenceKeys.set(keyId, { trackId: requireDataset(key, "trackId"), keyId }); } }); box.hidden = true; canvas.removeEventListener("pointermove", move); renderSequenceTimeline(); };
  canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", finish, { once: true });
}

function toggleSequencePlayback() { sequencePlaying = !sequencePlaying; sequencePreviewEnabled = true; updateSequencePlayhead(); updateSequencePreviewStatus(); renderSequenceDrivenPreviews(); logEvent(`sequence → ${sequencePlaying ? "play" : "pause"} at frame ${Math.round(sequenceFrame)}`); }
function setSequenceFrame(frame: number) { sequenceFrame = sequenceSnap ? Math.round(frame) : frame; sequencePreviewEnabled = true; updateSequencePlayhead(); updateSequencePreviewStatus(); renderSequenceDrivenPreviews(); }
function updateSequencePreviewStatus() {
  const diagnostics = auditPlayableTimeline2D({
    timeline: sequenceData,
    scenes: editorShell?.project.scenes ?? [{ id: "active-editor-scene", entities }],
    assets: editorShell?.project.assets ?? [],
    atlas: { clips: animationClips },
  });
  const blockedTrackIds = new Set(diagnostics
    .filter((diagnostic) => diagnostic.code === "timeline-camera-track-unsupported" || diagnostic.code === "timeline-track-target-missing" || diagnostic.code === "timeline-track-empty" || diagnostic.code === "timeline-clip-track-empty" || diagnostic.code === "timeline-clip-track-target-missing" || diagnostic.code === "timeline-clip-track-clip-missing")
    .map((diagnostic) => diagnostic.trackId));
  const activeTracks = [...sequenceData.tracks, ...(sequenceData.clipTracks ?? [])].filter((track) => !track.muted);
  const supported = activeTracks.filter((track) => !blockedTrackIds.has(track.id)).length;
  const unsupported = activeTracks.length - supported;
  setText("#sequence-preview-status", `${sequencePreviewEnabled ? "EDITOR PREVIEW ON" : "EDITOR PREVIEW READY"} · ${supported} SUPPORTED${unsupported ? ` · ${unsupported} EXPERIMENTAL` : ""}`);
  const buildStatus = requireElement<HTMLElement>("#sequence-build-status");
  buildStatus.textContent = diagnostics.length ? `BUILD WARNINGS · ${diagnostics.length}` : "BUILD READY";
  const buildDetail = diagnostics.length ? diagnostics.map((diagnostic) => diagnostic.message).join("\n") : "Timeline tracks are supported by Play and standalone builds.";
  buildStatus.setAttribute("title", buildDetail);
  buildStatus.setAttribute("aria-label", buildDetail);
  buildStatus.classList.toggle("chip-live", diagnostics.length === 0);
}
function clampSequenceFrame(frame: number) { return Math.max(0, Math.min(sequenceData.durationFrames, frame)); }
function framePercent(frame: number) { return frame / sequenceData.durationFrames * 100 * sequenceZoom; }
function sequenceTrack(id?: string) { return sequenceData.tracks.find((track) => track.id === id); }
function selectedSequenceKeysHasTrack(trackId: string) { return [...selectedSequenceKeys.values()].some((item) => item.trackId === trackId); }
function selectedKeyframes() { return [...selectedSequenceKeys.values()].map((selection) => { const track = sequenceTrack(selection.trackId); const key = track?.keyframes.find((candidate) => candidate.id === selection.keyId); return track && key ? { track, key } : undefined; }).filter((item): item is { track: EditorTimelineTrack; key: EditorKeyframe } => Boolean(item)); }
function formatTimelineRulerLabel(frame: number) { return `${Math.floor(frame / sequenceData.fps)}s · ${frame}f`; }
function formatSequenceTimecode(frame: number) { const total = Math.max(0, Math.round(frame)); const fps = sequenceData.fps; const seconds = Math.floor(total / fps); return `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(total % fps).padStart(2, "0")}`; }
function formatSequenceValue(track: EditorTimelineTrack, value: number) { return track.property === "scale" || track.property === "opacity" ? value.toFixed(2) : value.toFixed(1); }
function eventColor(kind: EditorProject["timeline"]["events"][number]["kind"]) { return kind === "audio" ? "#b997ff" : kind === "camera" ? "#f2ad4d" : kind === "logic" ? "#41d7d0" : "#7d92a0"; }
function timelineEffectColor(kind: NonNullable<EditorProject["timeline"]["effects"]>[number]["kind"]) { return kind === "camera-shake" ? "#f2ad4d" : kind === "particle-burst" ? "#ff6578" : "#d8ffff"; }
function editSelectedSequenceKeys(property: "frame" | "value", value: number) { if (!Number.isFinite(value)) return; for (const selected of selectedKeyframes()) selected.key[property] = property === "frame" ? clampSequenceFrame(Math.round(value)) : value; renderSequenceTimeline(); commitEditorChange(`Edit keyframe ${property}`); }
function setSelectedEasing(easing: EditorKeyframe["easing"]) { for (const selected of selectedKeyframes()) selected.key.easing = easing; renderSequenceTimeline(); commitEditorChange(`Set ${easing} easing`); }
function copySequenceKeys() { const selected = selectedKeyframes(); if (!selected.length) return; const first = Math.min(...selected.map((item) => item.key.frame)); sequenceClipboard = selected.map((item) => ({ trackId: item.track.id, frameOffset: item.key.frame - first, value: item.key.value, easing: item.key.easing })); setText("#sequence-selection-readout", `${sequenceClipboard.length} key${sequenceClipboard.length === 1 ? "" : "s"} copied`); }
function pasteSequenceKeys() { if (!sequenceClipboard.length) return; selectedSequenceKeys.clear(); for (const copied of sequenceClipboard) { const track = sequenceTrack(copied.trackId); if (!track) continue; const key: EditorKeyframe = { id: `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, frame: clampSequenceFrame(Math.round(sequenceFrame + copied.frameOffset)), value: copied.value, easing: copied.easing }; track.keyframes.push(key); selectedSequenceKeys.set(key.id, { trackId: track.id, keyId: key.id }); } renderSequenceTimeline(); commitEditorChange("Paste animation keys"); }
function deleteSequenceKeys() { for (const track of sequenceData.tracks) track.keyframes = track.keyframes.filter((key) => !selectedSequenceKeys.has(key.id)); selectedSequenceKeys.clear(); renderSequenceTimeline(); commitEditorChange("Delete animation keys"); }
function tapSequenceTempo() { const now = performance.now(); tapTempoTimes = tapTempoTimes.filter((time) => now - time < 3000); tapTempoTimes.push(now); if (tapTempoTimes.length > 1) { const intervals = tapTempoTimes.slice(1).map((time, index) => time - tapTempoTimes[index]); sequenceData.bpm = Math.round(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length)); requireElement<HTMLInputElement>("#sequence-bpm").value = String(sequenceData.bpm); renderSequenceTimeline(); } setText("#tap-tempo", tapTempoTimes.length < 2 ? "TAP 2" : `${sequenceData.bpm}`); }
function addSequenceEvent() { const frame = Math.round(sequenceFrame); sequenceData.events.push({ id: `event-${Date.now().toString(36)}`, frame, label: `Marker ${sequenceData.events.length + 1}`, kind: "marker" }); renderSequenceTimeline(); commitEditorChange("Add animation event"); }
function detectSequenceTransients() { setText("#sequence-selection-readout", "Transient detection unavailable · no decoded waveform analysis is connected"); logEvent("audio analysis → transient detection unavailable; timeline metadata unchanged"); }
function addSequenceTrack() { const targetId = selectedEntityId ?? "player-01"; const id = `track-${targetId}-opacity-${Date.now().toString(36)}`; sequenceData.tracks.push({ id, targetId, label: "Opacity", property: "opacity", color: "#68e6a8", muted: false, locked: false, keyframes: [{ id: `${id}-key-0`, frame: Math.round(sequenceFrame), value: 1, easing: "ease-in-out" }] }); renderSequenceTimeline(); commitEditorChange("Add animation track"); }
function updateMixer() { const audio = sequenceData.audioTracks[0]; if (!audio) return; audio.volume = Number(requireElement<HTMLInputElement>("#mixer-volume").value); audio.pan = Number(requireElement<HTMLInputElement>("#mixer-pan").value); setText("#mixer-db", audio.volume <= 0 ? "-∞ dB" : `${(20 * Math.log10(audio.volume)).toFixed(1)} dB`); setText("#mixer-pan-output", Math.abs(audio.pan) < .02 ? "C" : `${Math.round(Math.abs(audio.pan) * 100)}${audio.pan < 0 ? "L" : "R"}`); }
function toggleMixerState(property: "muted" | "solo") { const audio = sequenceData.audioTracks[0]; if (!audio) return; audio[property] = !audio[property]; requireElement(`#mixer-${property === "muted" ? "mute" : "solo"}`).classList.toggle("is-active", audio[property]); commitEditorChange(`Toggle audio ${property}`); }
function previewSequenceExport() { openProductionLab("export"); }
function openProductionLab(tab: "export" | "reactive" | "logic" | "rig" | "review" = "export") {
  showWorkspace("motion");
  requireElement<HTMLElement>("#production-center").hidden = false;
  setProductionTab(tab);
  renderProductionLab();
}
function closeProductionLab() { requireElement<HTMLElement>("#production-center").hidden = true; }

function setProductionTab(tab: typeof productionTab) {
  productionTab = tab;
  document.querySelectorAll<HTMLElement>("[data-production-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.productionTab === tab));
  document.querySelectorAll<HTMLElement>("[data-production-view]").forEach((view) => { const active = view.dataset.productionView === tab; view.hidden = !active; view.classList.toggle("is-active", active); });
  setText("#production-footer-status", `${tab[0].toUpperCase()}${tab.slice(1)} prototype · project-local · runtime integration incomplete`);
  if (tab === "reactive") void connectFftAudioAsset();
}

function bindProductionLab() {
  requireElement("#production-lab-open").addEventListener("click", () => openProductionLab("reactive"));
  requireElement("#production-center-close").addEventListener("click", closeProductionLab);
  requireElement("#production-center").addEventListener("pointerdown", (event) => { if (event.target === requireElement("#production-center")) closeProductionLab(); });
  document.querySelectorAll<HTMLButtonElement>("[data-production-tab]").forEach((button) => button.addEventListener("click", () => { setProductionTab(requireOneOf(button.dataset.productionTab, ["export", "reactive", "logic", "rig", "review"], "production tab")); renderProductionLab(); }));
  document.querySelectorAll<HTMLButtonElement>("[data-export-preset]").forEach((button) => button.addEventListener("click", () => setExportPreset(button.dataset.exportPreset ?? "youtube")));
  for (const selector of ["#export-width", "#export-height", "#export-fps", "#export-codec"]) requireElement<HTMLInputElement | HTMLSelectElement>(selector).addEventListener("change", updateExportSettings);
  requireElement("#start-webm-export").addEventListener("click", () => { void startVideoExport(true); });
  requireElement("#add-reactive-binding").addEventListener("click", addReactiveBinding);
  requireElement("#automation-record").addEventListener("click", toggleAutomationRecording);
  requireElement("#midi-connect").addEventListener("click", () => { void connectMidi(); }); requireElement("#midi-simulate").addEventListener("click", () => simulateMidi(96));
  document.querySelectorAll<HTMLButtonElement>("[data-add-node]").forEach((button) => button.addEventListener("click", () => addLogicNode(requireOneOf(button.dataset.addNode, ["event", "condition", "action"], "logic node kind")))); requireElement("#run-logic-graph").addEventListener("click", runLogicGraph);
  requireElement("#add-sprite-bone").addEventListener("click", addSpriteBone); requireElement("#save-sprite-pose").addEventListener("click", saveSpritePose); requireElement("#key-sprite-pose").addEventListener("click", keySpritePose);
  requireElement("#add-review-pin").addEventListener("click", () => requireElement<HTMLTextAreaElement>("#annotation-body").focus()); requireElement("#post-annotation").addEventListener("click", postAnnotation); requireElement("#create-review-link").addEventListener("click", createReviewLink);
  spriteRigCanvas.addEventListener("pointerdown", beginSpriteBoneDrag); spriteRigCanvas.addEventListener("pointermove", moveSpriteBoneDrag); spriteRigCanvas.addEventListener("pointerup", endSpriteBoneDrag);
  window.addEventListener("keydown", (event) => { if (!requireElement<HTMLElement>("#production-center").hidden && event.key === "Escape") { closeProductionLab(); event.preventDefault(); } });
}

function renderProductionLab() {
  const settings = productionData.export;
  requireElement<HTMLInputElement>("#export-width").value = String(settings.width); requireElement<HTMLInputElement>("#export-height").value = String(settings.height); editorSelect("#export-fps").value = String(settings.fps); editorSelect("#export-codec").value = settings.codec;
  setText("#export-preview-label", `${settings.preset} · ${settings.width} × ${settings.height}`); setText("#webcodecs-support", typeof VideoEncoder === "undefined" ? "WebCodecs unavailable · use a Chromium-class browser" : "Hardware-accelerated VideoEncoder available");
  setText("#production-health", productionTab === "export" ? `${settings.codec === "avc" ? "MP4" : "WEBM"} EXPORT READY` : productionTab === "review" ? "LOCAL REVIEW READY" : "AUTHORED PROJECT DATA");
  renderExportPreview(); renderFftSpectrum(); renderReactiveBindings(); renderMidiMappings(); renderLogicGraph(); renderSpriteRigPanels(); renderAnnotations(); renderReviewFrame();
}

function renderProductionLive() {
  if (productionTab === "reactive") renderFftSpectrum();
  if (productionTab === "rig" && !spriteBoneDrag) drawSpriteRig();
}

function renderExportPreview() { drawProductionFrame(exportPreviewContext, exportPreviewCanvas.width, exportPreviewCanvas.height, Math.round(sequenceFrame)); }
function renderReviewFrame() { drawProductionFrame(reviewContext, reviewCanvas.width, reviewCanvas.height, Math.round(sequenceFrame)); }
function drawProductionFrame(ctx: CanvasRenderingContext2D, width: number, height: number, frame: number) {
  drawActiveGameFrame(ctx, width, height, { applyPost: true, frame });
}

function updateExportSettings() {
  productionData.export.width = Math.max(16, Number(requireElement<HTMLInputElement>("#export-width").value)); productionData.export.height = Math.max(16, Number(requireElement<HTMLInputElement>("#export-height").value)); productionData.export.fps = Number(editorSelect("#export-fps").value); productionData.export.codec = requireOneOf(editorSelect("#export-codec").value, ["avc", "vp8", "vp9"], "export codec"); productionData.export.preset = "Custom"; renderProductionLab(); commitEditorChange("Change video export settings");
}
function setExportPreset(preset: string) {
  const value = preset === "720" ? { width: 1280, height: 720, preset: "720p" } : preset === "2160" ? { width: 3840, height: 2160, preset: "4K" } : { width: 1920, height: 1080, preset: "1080p" };
  Object.assign(productionData.export, value);
  document.querySelectorAll<HTMLElement>("[data-export-preset]").forEach((button) => button.classList.toggle("is-active", button.dataset.exportPreset === preset));
  renderProductionLab(); commitEditorChange("Choose video export preset");
}

async function exportSequencePreview() { const blob = await startVideoExport(false, { width: 320, height: 180, frames: 12, omitAudio: true }); return { bytes: blob.size, type: blob.type }; }
async function startVideoExport(download: boolean, override?: { width: number; height: number; frames: number; omitAudio?: boolean }) {
  if (productionData.export.codec === "avc") return startMp4Export(download, override);
  const button = requireElement<HTMLButtonElement>("#start-webm-export"); const progress = requireElement<HTMLElement>("#export-progress"); button.disabled = true; button.textContent = "ENCODING…"; progress.classList.add("is-active");
  try { const settings = productionData.export; const blob = await encodeCanvasSequenceWebM({ width: override?.width ?? settings.width, height: override?.height ?? settings.height, fps: settings.fps, frameCount: override?.frames ?? sequenceData.durationFrames, codec: settings.codec, renderFrame(context, frame) { drawProductionFrame(context, context.canvas.width, context.canvas.height, frame); }, onProgress(value) { requireDescendant<HTMLElement>(progress, "i").style.width = `${Math.max(1, value * 78)}%`; setText("#export-progress-label", value >= 1 ? `WebM complete · ${settings.codec.toUpperCase()}` : `Encoding frame ${Math.round(value * (override?.frames ?? sequenceData.durationFrames) / .86)} / ${override?.frames ?? sequenceData.durationFrames}`); } });
    if (download) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sequence-${Date.now()}.webm`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
    logEvent(`video export → ${(blob.size / 1_048_576).toFixed(2)} MB WebM encoded`); return blob;
  } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setText("#export-progress-label", message); throw cause; }
  finally { button.disabled = false; button.textContent = "RENDER LOCAL WEBM"; }
}

async function startMp4Export(download: boolean, override?: { width: number; height: number; frames: number; omitAudio?: boolean }) {
  const button = requireElement<HTMLButtonElement>("#start-webm-export");
  const progress = requireElement<HTMLElement>("#export-progress");
  const settings = productionData.export;
  const exportFps = settings.fps === 60 ? 60 : 30; const frameCount = override?.frames ?? Math.ceil(sequenceData.durationFrames / sequenceData.fps * exportFps);
  button.disabled = true;
  button.textContent = "ENCODING...";
  progress.classList.add("is-active");
  try {
    const audioAssets = editorShell?.project.assets.filter((asset) => asset.kind === "audio") ?? [];
    const audioMix = override?.omitAudio ? undefined : await decodeAndMixTimelineAudio({ tracks: sequenceData.audioTracks, timelineFps: sequenceData.fps, exportFps, exportFrameCount: frameCount, resolveBlob(track) { const asset = track.assetId ? audioAssets.find((candidate) => candidate.id === track.assetId) : audioAssets.length === 1 ? audioAssets[0] : undefined; return asset ? assetRuntimeBlobs.get(asset.id) : undefined; } });
    if (audioMix?.missingTrackIds.length) logEvent(`MP4 audio skipped ${audioMix.missingTrackIds.length} track${audioMix.missingTrackIds.length === 1 ? "" : "s"} with unavailable assets: ${audioMix.missingTrackIds.join(", ")}`);
    const blob = await encodeCanvasSequenceMp4({
      width: override?.width ?? settings.width,
      height: override?.height ?? settings.height,
      fps: exportFps,
      frameCount,
      audio: audioMix?.audio,
      renderFrame(context, frame) { drawProductionFrame(context, context.canvas.width, context.canvas.height, frame * sequenceData.fps / exportFps); },
      onProgress(value) {
        requireDescendant<HTMLElement>(progress, "i").style.width = `${Math.max(1, value * 100)}%`;
        setText("#export-progress-label", value >= 1 ? `MP4 complete - ${settings.fps} FPS` : `Encoding frame ${Math.min(frameCount, Math.round(value * frameCount / .94))} / ${frameCount}`);
      },
    });
    if (download) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const base = editorShell?.project.name?.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "sequence";
      anchor.download = `${base}-${settings.preset.toLowerCase()}-${settings.fps}fps.mp4`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    logEvent(`video export -> ${(blob.size / 1_048_576).toFixed(2)} MB MP4 encoded${audioMix?.mixedTrackIds.length ? ` with ${audioMix.mixedTrackIds.length} mixed timeline audio track${audioMix.mixedTrackIds.length === 1 ? "" : "s"}` : " without timeline audio"}`);
    return blob;
  } catch (cause) {
    setText("#export-progress-label", cause instanceof Error ? cause.message : String(cause));
    throw cause;
  } finally {
    button.disabled = false;
    button.textContent = "RENDER MP4";
  }
}

function renderFftSpectrum() {
  const ctx = fftContext; const width = fftCanvas.width; const height = fftCanvas.height; ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#071018"; ctx.fillRect(0, 0, width, height); const bars = 72; let energy = 0;
  if (fftAnalyser && fftFrequencyData) fftAnalyser.getByteFrequencyData(fftFrequencyData);
  const values: number[] = [];
  for (let index = 0; index < bars; index += 1) { const value = fftFrequencyData ? (fftFrequencyData[Math.floor(index / bars * fftFrequencyData.length)] ?? 0) / 255 : 0; values.push(value); energy += value; const x = index / bars * width; const barWidth = width / bars - 2; const barHeight = value * (height - 14); const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight); gradient.addColorStop(0, "#276f77"); gradient.addColorStop(.7, "#41d7d0"); gradient.addColorStop(1, index < 18 ? "#b997ff" : "#d9ffff"); ctx.fillStyle = gradient; ctx.shadowColor = index < 18 ? "#b997ff" : "#41d7d0"; ctx.shadowBlur = value > .7 ? 8 : 0; ctx.fillRect(x + 1, height - barHeight, barWidth, barHeight); }
  ctx.shadowBlur = 0; const average = (start: number, end: number) => values.slice(start, end).reduce((sum, value) => sum + value, 0) / Math.max(1, end - start); const bass = average(0, 14); const mid = average(14, 43); const treble = average(43, 72); setText("#fft-rms", fftFrequencyData ? `${(-60 + energy / bars * 60).toFixed(1)} dB` : "−∞ dB"); setText("#fft-bass", bass.toFixed(2)); setText("#fft-mid", mid.toFixed(2)); setText("#fft-treble", treble.toFixed(2)); setText("#fft-live-status", fftFrequencyData ? "● LIVE IMPORTED AUDIO" : "NO AUDIO ANALYSIS"); applyReactiveBindings({ rms: energy / bars, bass, mid, treble });
}
async function connectFftAudioAsset() {
  if (fftAnalyser) {
    if (fftAudioContext?.state === "suspended") await fftAudioContext.resume().catch(() => undefined);
    if (fftAudioElement?.paused) await fftAudioElement.play().catch(() => undefined);
    return;
  }
  const asset = editorShell?.project.assets.find((candidate) => candidate.kind === "audio" && assetPreviewUrls.has(candidate.id));
  const objectUrl = asset ? assetPreviewUrls.get(asset.id) : undefined;
  if (!asset || !objectUrl) {
    setText("#production-footer-status", "No imported audio preview is available · import or reimport an audio asset");
    return;
  }
  try {
    fftAudioContext = new AudioContext();
    fftAnalyser = fftAudioContext.createAnalyser();
    fftAnalyser.fftSize = 256;
    fftAnalyser.smoothingTimeConstant = .72;
    fftFrequencyData = new Uint8Array(fftAnalyser.frequencyBinCount);
    fftAudioElement = new Audio(objectUrl);
    fftAudioAssetId = asset.id;
    fftAudioElement.loop = true;
    const source = fftAudioContext.createMediaElementSource(fftAudioElement);
    source.connect(fftAnalyser);
    fftAnalyser.connect(fftAudioContext.destination);
    await fftAudioElement.play();
    setText("#production-footer-status", `Analysing ${asset.name} · live FFT · editor preview only`);
  } catch {
    resetFftAudioPreview();
    setText("#production-footer-status", "FFT preview is ready · interact with the page to unlock imported audio");
  }
}
function renderReactiveBindings() { const host = requireElement<HTMLElement>("#reactive-binding-list"); host.innerHTML = productionData.reactiveBindings.map((binding, index) => `<div class="reactive-binding" style="--binding-color:${index % 2 ? "#b997ff" : "#41d7d0"}"><header><strong>${binding.source.toUpperCase()} → ${escapeMarkup(binding.targetId)}.${binding.property}</strong><em>${binding.enabled ? "LIVE" : "BYPASSED"}</em></header><label>GAIN<input type="range" min="0" max="${binding.property === "scale" ? 2 : 40}" step=".01" value="${binding.gain}" data-binding-gain="${escapeMarkup(binding.id)}"></label><output>${binding.gain.toFixed(2)}</output><label>SMOOTH<input type="range" min="0" max="1" step=".01" value="${binding.smoothing}" data-binding-smoothing="${escapeMarkup(binding.id)}"></label><output>${Math.round(binding.smoothing * 100)}%</output></div>`).join(""); host.querySelectorAll<HTMLInputElement>("[data-binding-gain]").forEach((input) => input.addEventListener("input", () => { const binding = productionData.reactiveBindings.find((item) => item.id === input.dataset.bindingGain); if (binding) { binding.gain = Number(input.value); if (automationRecording) recordAutomationValue(binding.targetId, binding.property, binding.gain); renderReactiveBindings(); } })); }
function addReactiveBinding() { productionData.reactiveBindings.push({ id: `binding-${Date.now().toString(36)}`, source: "treble", targetId: selectedEntityId ?? "player-01", property: "opacity", gain: .5, smoothing: .7, enabled: true }); renderReactiveBindings(); commitEditorChange("Add audio-reactive binding"); }
function applyReactiveBindings(bands: { rms: number; bass: number; mid: number; treble: number }) { for (const binding of productionData.reactiveBindings) { if (!binding.enabled || binding.source === "midi-cc") continue; const entity = entities.find((candidate) => candidate.id === binding.targetId); if (!entity) continue; const value = bands[binding.source] * binding.gain; if (binding.property === "scale") entity.scale = 1 + value; else if (binding.property === "x") entity.x += value * .01; else if (binding.property === "y") entity.y += value * .01; } }
function toggleAutomationRecording() { automationRecording = !automationRecording; const button = requireElement("#automation-record"); button.classList.toggle("is-recording", automationRecording); setText("#automation-record-status", automationRecording ? `RECORDING · frame ${Math.round(sequenceFrame)}` : "ARMED · move a control during playback"); }
function recordAutomationValue(targetId: string, property: "x" | "y" | "scale" | "rotation" | "opacity", value: number) { let track = sequenceData.tracks.find((candidate) => candidate.targetId === targetId && candidate.property === property); if (!track) { track = { id: `automation-${targetId}-${property}`, targetId, label: `Automation · ${property}`, property, color: "#ff6578", muted: false, locked: false, keyframes: [] }; sequenceData.tracks.push(track); } const frame = Math.round(sequenceFrame); const existing = track.keyframes.find((key) => key.frame === frame); if (existing) existing.value = value; else track.keyframes.push({ id: `auto-key-${Date.now().toString(36)}`, frame, value, easing: "linear" }); renderSequenceTimeline(); }

async function connectMidi() { const requestMidiAccess = Reflect.get(navigator, "requestMIDIAccess"); if (typeof requestMidiAccess !== "function") { setText("#midi-message", "Web MIDI is unavailable in this browser"); return; } try { const access: unknown = await Reflect.apply(requestMidiAccess, navigator, []); if (!isMidiAccess(access)) throw new TypeError("Web MIDI returned an invalid access object."); midiAccess = access; const inputs = [...midiAccess.inputs.values()]; for (const input of inputs) input.onmidimessage = (event) => { if (event.data) handleMidiMessage(event.data); }; requireElement("#midi-led").classList.toggle("is-active", inputs.length > 0); setText("#midi-device-name", inputs[0]?.name ?? "MIDI access granted"); setText("#midi-message", inputs.length ? `${inputs.length} input${inputs.length === 1 ? "" : "s"} online` : "No hardware input detected · simulation ready"); } catch { setText("#midi-message", "MIDI permission was not granted"); } }
function handleMidiMessage(data: Uint8Array) { const status = data[0] ?? 0; const control = data[1] ?? 0; const value = data[2] ?? 0; const channel = (status & 0x0f) + 1; setText("#midi-value", `CC ${String(control).padStart(2, "0")} · ${String(value).padStart(3, "0")}`); requireElement<HTMLElement>("#midi-value-bar").style.width = `${value / 127 * 100}%`; requireElement("#midi-led").classList.add("is-active"); const mapping = productionData.midiMappings.find((item) => item.channel === channel && item.control === control); if (!mapping) return; const mapped = mapping.minimum + value / 127 * (mapping.maximum - mapping.minimum); const entity = entities.find((candidate) => candidate.id === mapping.targetId); if (entity && mapping.property === "scale") entity.scale = mapped; if (entity && mapping.property === "x") entity.x = mapped; if (entity && mapping.property === "y") entity.y = mapped; if (automationRecording) recordAutomationValue(mapping.targetId, mapping.property, mapped); }
function simulateMidi(value = 96) { handleMidiMessage(new Uint8Array([0xb0, 1, Math.max(0, Math.min(127, value))])); setText("#midi-device-name", "Virtual Controller"); setText("#midi-message", "Simulation input · channel 1"); }
function renderMidiMappings() { requireElement<HTMLElement>("#midi-mapping-list").innerHTML = productionData.midiMappings.map((mapping) => `<div class="midi-map"><span>CH ${mapping.channel} · CC ${String(mapping.control).padStart(2, "0")}</span><b>${escapeMarkup(mapping.targetId)}.${mapping.property}</b></div>`).join(""); }

function renderLogicGraph() { const graph = productionData.logicGraph; setText("#logic-node-count", String(graph.nodes.length)); setText("#logic-edge-count", String(graph.edges.length)); setText("#logic-status", `EXPERIMENTAL · ${graph.nodes.length} SAVED NODES · NOT EXECUTED IN GAME`); const host = requireElement<HTMLElement>("#logic-nodes"); host.innerHTML = graph.nodes.map((node) => `<article class="logic-node" data-logic-node="${escapeMarkup(node.id)}" style="left:${node.x}px;top:${node.y}px;--node-color:${node.kind === "event" ? "#41d7d0" : node.kind === "condition" ? "#f2ad4d" : "#b997ff"}"><header><i></i><strong>${escapeMarkup(node.label)}</strong></header><main><span>${node.kind.toUpperCase()}</span><code>${escapeMarkup(Object.entries(node.config).map(([key, value]) => `${key}: ${value}`).join(" · "))}</code></main><i class="logic-port in"></i><i class="logic-port out"></i></article>`).join(""); host.querySelectorAll<HTMLElement>("[data-logic-node]").forEach((node) => node.addEventListener("pointerdown", beginLogicNodeDrag)); renderLogicWires(); }
function renderLogicWires() { const nodes = new Map(productionData.logicGraph.nodes.map((node) => [node.id, node])); requireElement<SVGSVGElement>("#logic-wires").innerHTML = productionData.logicGraph.edges.map((edge) => { const from = nodes.get(edge.from); const to = nodes.get(edge.to); if (!from || !to) return ""; const x1 = from.x + 166; const y1 = from.y + 47; const x2 = to.x; const y2 = to.y + 47; const control = Math.max(55, (x2 - x1) * .45); return `<path class="logic-wire" d="M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}"></path>`; }).join(""); }
function beginLogicNodeDrag(event: PointerEvent) { const element = requireEventCurrentTarget(event, HTMLElement); const node = productionData.logicGraph.nodes.find((candidate) => candidate.id === element.dataset.logicNode); if (!node) return; const start = { x: event.clientX, y: event.clientY, nodeX: node.x, nodeY: node.y }; element.setPointerCapture(event.pointerId); const move = (moveEvent: PointerEvent) => { node.x = start.nodeX + moveEvent.clientX - start.x; node.y = start.nodeY + moveEvent.clientY - start.y; element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; renderLogicWires(); }; element.addEventListener("pointermove", move); element.addEventListener("pointerup", () => { element.removeEventListener("pointermove", move); commitEditorChange("Move logic node"); }, { once: true }); }
function addLogicNode(kind: "event" | "condition" | "action") { const count = productionData.logicGraph.nodes.length; productionData.logicGraph.nodes.push({ id: `node-${Date.now().toString(36)}`, kind, label: kind === "event" ? "On Marker" : kind === "condition" ? "Property > Value" : "Set Property", x: 80 + count * 38, y: 235 + count % 2 * 95, config: {} }); renderLogicGraph(); commitEditorChange("Add logic graph node"); }
function runLogicGraph() { const trace = productionData.logicGraph.nodes.map((node) => `${node.kind} → ${node.label}`).join("\n"); requireDescendant<HTMLElement>(requireElement("#logic-trace"), "code").textContent = trace || "No saved nodes to preview."; setText("#logic-last-run", new Date().toLocaleTimeString()); setText("#logic-status", "DEMO TRACE ONLY · NO GAMEPLAY EXECUTION"); logEvent("logic graph → local node-order preview only; runtime not executed"); }

function spriteBoneWorldPoints() { const result = new Map<string, { startX: number; startY: number; endX: number; endY: number }>(); const resolve = (bone: EditorSpriteBone): { startX: number; startY: number; endX: number; endY: number } => { const existing = result.get(bone.id); if (existing) return existing; const parent = bone.parentId ? productionData.spriteRig.bones.find((candidate) => candidate.id === bone.parentId) : undefined; const parentPoint = parent ? resolve(parent) : { endX: spriteRigCanvas.width / 2, endY: spriteRigCanvas.height / 2 + 95 }; const startX = parent ? parentPoint.endX + bone.x : spriteRigCanvas.width / 2 + bone.x; const startY = parent ? parentPoint.endY + bone.y : spriteRigCanvas.height / 2 + 95 + bone.y; const point = { startX, startY, endX: startX + Math.cos(bone.rotation) * bone.length, endY: startY + Math.sin(bone.rotation) * bone.length }; result.set(bone.id, point); return point; }; for (const bone of productionData.spriteRig.bones) resolve(bone); return result; }
function drawSpriteRig() { const ctx = spriteRigContext; const width = spriteRigCanvas.width; const height = spriteRigCanvas.height; ctx.clearRect(0, 0, width, height); const glow = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, height * .58); glow.addColorStop(0, "#163039"); glow.addColorStop(1, "#071018"); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height); ctx.fillStyle = "rgb(65 215 208 / 10%)"; ctx.beginPath(); ctx.ellipse(width / 2, height * .84, 150, 30, 0, 0, Math.PI * 2); ctx.fill(); const points = spriteBoneWorldPoints(); ctx.save(); ctx.lineCap = "round"; for (const bone of productionData.spriteRig.bones) { const point = requireMapValue(points, bone.id, "sprite rig point"); ctx.strokeStyle = bone.id === selectedSpriteBoneId ? "#f3ad4e" : "#42d7cf"; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10; ctx.lineWidth = bone.id === selectedSpriteBoneId ? 8 : 6; ctx.beginPath(); ctx.moveTo(point.startX, point.startY); ctx.lineTo(point.endX, point.endY); ctx.stroke(); ctx.fillStyle = "#d8ffff"; ctx.beginPath(); ctx.arc(point.startX, point.startY, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(point.endX, point.endY, 7, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
function renderSpriteRigPanels() { requireElement<HTMLElement>("#sprite-bone-list").innerHTML = productionData.spriteRig.bones.map((bone) => `<div class="bone-row ${bone.id === selectedSpriteBoneId ? "is-active" : ""}" data-sprite-bone="${escapeMarkup(bone.id)}"><i></i><span>${escapeMarkup(bone.name)}</span><small>${(bone.rotation * 180 / Math.PI).toFixed(0)}°</small></div>`).join(""); document.querySelectorAll<HTMLElement>("[data-sprite-bone]").forEach((row) => row.addEventListener("click", () => { selectedSpriteBoneId = row.dataset.spriteBone ?? ""; renderSpriteRigPanels(); })); requireElement<HTMLElement>("#sprite-pose-list").innerHTML = productionData.spriteRig.poses.map((pose) => `<div class="pose-row" data-sprite-pose="${escapeMarkup(pose.id)}"><span>◇</span><div><strong>${escapeMarkup(pose.name)}</strong><small>${Object.keys(pose.rotations).length || productionData.spriteRig.bones.length} bones</small></div></div>`).join(""); document.querySelectorAll<HTMLElement>("[data-sprite-pose]").forEach((row) => row.addEventListener("click", () => applySpritePose(row.dataset.spritePose ?? ""))); setText("#key-pose-frame", String(Math.round(sequenceFrame))); drawSpriteRig(); }
function beginSpriteBoneDrag(event: PointerEvent) { const point = canvasPoint(spriteRigCanvas, event.clientX, event.clientY); const points = spriteBoneWorldPoints(); let best: { bone: EditorSpriteBone; distance: number } | undefined; for (const bone of productionData.spriteRig.bones) { const end = requireMapValue(points, bone.id, "sprite rig point"); const distance = Math.hypot(point.x - end.endX, point.y - end.endY); if (!best || distance < best.distance) best = { bone, distance }; } if (!best || best.distance > 35) return; selectedSpriteBoneId = best.bone.id; spriteBoneDrag = { bone: best.bone, pointerId: event.pointerId }; spriteRigCanvas.setPointerCapture(event.pointerId); renderSpriteRigPanels(); }
function moveSpriteBoneDrag(event: PointerEvent) { if (!spriteBoneDrag) return; const point = canvasPoint(spriteRigCanvas, event.clientX, event.clientY); const world = requireMapValue(spriteBoneWorldPoints(), spriteBoneDrag.bone.id, "sprite rig point"); spriteBoneDrag.bone.rotation = Math.atan2(point.y - world.startY, point.x - world.startX); drawSpriteRig(); }
function endSpriteBoneDrag(event: PointerEvent) { if (!spriteBoneDrag) return; spriteBoneDrag = undefined; if (spriteRigCanvas.hasPointerCapture(event.pointerId)) spriteRigCanvas.releasePointerCapture(event.pointerId); renderSpriteRigPanels(); commitEditorChange("Pose sprite bone"); }
function addSpriteBone() { const id = `bone-${Date.now().toString(36)}`; productionData.spriteRig.bones.push({ id, name: `Bone ${productionData.spriteRig.bones.length + 1}`, parentId: selectedSpriteBoneId || undefined, x: 0, y: 0, length: 38, rotation: -.5 }); selectedSpriteBoneId = id; renderSpriteRigPanels(); commitEditorChange("Add sprite bone"); }
function saveSpritePose() { const id = `pose-${Date.now().toString(36)}`; productionData.spriteRig.poses.push({ id, name: `Pose ${productionData.spriteRig.poses.length + 1}`, rotations: Object.fromEntries(productionData.spriteRig.bones.map((bone) => [bone.id, bone.rotation])) }); renderSpriteRigPanels(); commitEditorChange("Save sprite pose"); }
function applySpritePose(id: string) { const pose = productionData.spriteRig.poses.find((candidate) => candidate.id === id); if (!pose) return; for (const bone of productionData.spriteRig.bones) if (pose.rotations[bone.id] !== undefined) bone.rotation = pose.rotations[bone.id]; drawSpriteRig(); }
function keySpritePose() { for (const bone of productionData.spriteRig.bones) { const trackId = `sprite-${bone.id}-rotation`; let track = sequenceData.tracks.find((candidate) => candidate.id === trackId); if (!track) { track = { id: trackId, targetId: bone.id, label: `${bone.name} Rotation`, property: "rotation", color: "#b997ff", muted: false, locked: false, keyframes: [] }; sequenceData.tracks.push(track); } track.keyframes.push({ id: `${trackId}-${Date.now().toString(36)}`, frame: Math.round(sequenceFrame), value: bone.rotation, easing: "ease-in-out" }); } renderSequenceTimeline(); commitEditorChange("Key sprite rig pose"); setText("#production-footer-status", `Pose keyed at frame ${Math.round(sequenceFrame)}`); }

function renderAnnotations() { const host = requireElement<HTMLElement>("#annotation-list"); host.innerHTML = productionData.annotations.map((note) => `<article class="annotation ${note.resolved ? "is-resolved" : ""}"><span class="annotation-avatar">${escapeMarkup(note.author.slice(0, 2).toUpperCase())}</span><main><header><strong>${escapeMarkup(note.author)}</strong><small>F${note.frame}</small></header><p>${escapeMarkup(note.body)}</p><footer><span>${note.entityId ? `@${escapeMarkup(note.entityId)}` : "Sequence"}</span><button data-resolve-note="${escapeMarkup(note.id)}">${note.resolved ? "RESOLVED" : "RESOLVE"}</button></footer></main></article>`).join(""); host.querySelectorAll<HTMLButtonElement>("[data-resolve-note]").forEach((button) => button.addEventListener("click", () => { const note = productionData.annotations.find((candidate) => candidate.id === button.dataset.resolveNote); if (note) note.resolved = !note.resolved; renderAnnotations(); commitEditorChange("Resolve annotation"); })); const open = productionData.annotations.filter((note) => !note.resolved).length; setText("#open-comment-count", `${open} OPEN`); }
function postAnnotation() { const input = requireElement<HTMLTextAreaElement>("#annotation-body"); const body = input.value.trim(); if (!body) return; productionData.annotations.push({ id: `note-${Date.now().toString(36)}`, author: "You", body, frame: Math.round(sequenceFrame), entityId: selectedEntityId ?? undefined, resolved: false, createdAt: new Date().toISOString() }); input.value = ""; renderAnnotations(); commitEditorChange("Add review annotation"); }
function createReviewLink() { const url = `${location.origin}${location.pathname}?review=${encodeURIComponent(editorShell?.project.id ?? "project")}&frame=${Math.round(sequenceFrame)}`; const output = requireElement<HTMLElement>("#review-link"); output.textContent = url; output.hidden = false; void navigator.clipboard?.writeText(url).catch(() => undefined); setText("#production-footer-status", "Local editor URL copied · no project, assets, or access permissions were published"); logEvent("review → local editor URL copied; no publishing performed"); }

function require2dContext(canvas: HTMLCanvasElement, willReadFrequently = false) {
  const context = willReadFrequently
    ? canvas.getContext("2d", { willReadFrequently: true })
    : canvas.getContext("2d");
  if (!context) throw new Error(`Could not acquire 2D context for ${canvas.id || "generated canvas"}`);
  return context;
}

function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  return { x: (clientX - rect.left) * canvas.width / rect.width, y: (clientY - rect.top) * canvas.height / rect.height };
}

function poseChecksum(values: Float32Array) {
  let hash = 2166136261;
  for (let index = 0; index < values.length; index += 1) {
    hash ^= Math.round(values[index] * 10000);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
}



function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function isEditorPlayActive() {
  return Boolean(playableWorld || editor3DPlaySession || editor3DPlayAbort);
}

function commitEditorChange(label: string) {
  if (isEditorPlayActive()) {
    setText("#footer-status", `Stop Play before editing · ignored ${label.toLowerCase()}`);
    return;
  }
  editorShell?.commitRuntime(label);
}


function captureRuntimeProject(base: EditorProject): EditorProject {
  const project = structuredClone(base);
  const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId) ?? project.scenes[0];
  if (!isEditorPlayActive()) {
    const previous = new Map(scene.entities.map((entity) => [entity.id, entity]));
    scene.entities = entities.map((entity) => ({
      id: entity.id,
      label: entity.label,
      x: entity.x,
      y: entity.y,
      width: entity.width,
      height: entity.height,
      scale: entity.scale,
      ...(entity.rotation !== undefined ? { rotation: entity.rotation } : {}),
      ...(entity.opacity !== undefined ? { opacity: entity.opacity } : {}),
      layer: entity.layer ?? 0,
      color: entity.color,
      accent: entity.accent,
      kind: authoredEntityKind(entity.kind),
      ...(entity.parentId ? { parentId: entity.parentId } : {}),
      components: structuredClone(entity.components ?? previous.get(entity.id)?.components ?? []),
    }));
  }
  project.tilemap.columns = mapColumns;
  project.tilemap.rows = mapRows;
  project.tilemap.tileSize = mapTileSize;
  project.tilemap.values = [...mapTileValues];
  project.tilemap.sourceAssetId = tilemapSourceAssetId;
  commitExtractedTileCollision(project, tileSolidValues);
  project.atlas.sourceAssetId = atlasSourceAssetId;
  project.atlas.frameWidth = Number(requireElement<HTMLInputElement>("#slice-width").value);
  project.atlas.frameHeight = Number(requireElement<HTMLInputElement>("#slice-height").value);
  project.atlas.playbackSpeed = atlasPlaybackSpeed;
  project.atlas.frames = structuredClone(atlasFrames);
  syncActiveAnimationClip();
  project.atlas.sequence = animationSequence.map((frame) => frame.id);
  project.atlas.clips = structuredClone(animationClips);
  project.atlas.defaultClipId = activeAnimationClipId;
  project.postProcessing.effects = effectConfigs.map((effect) => ({ id: effect.id, enabled: effect.enabled, value: effect.value }));
  project.timeline = structuredClone(sequenceData);
  project.production = structuredClone(productionData);
  return project;
}

function applyProjectToRuntime(project: EditorProject, options: { preservePlayableAudio?: boolean } = {}) {
  if (!options.preservePlayableAudio) disposePlayableAudio();
  pruneAssetPreviews(project);
  const starter = project.extensions?.hyperfocusStarter;
  currentStarterTemplate = starter && typeof starter === "object" && "template" in starter && typeof starter.template === "string" ? starter.template : "";
  const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId) ?? project.scenes[0];
  entities.splice(0, entities.length, ...scene.entities.map((entity) => ({ ...structuredClone(entity) })));
  stage.clear();
  for (const entity of entities) { stage.spawn(entity, { layer: entity.layer }); bindStageEntityEvents(entity); }

  mapColumns = project.tilemap.columns;
  mapRows = project.tilemap.rows;
  mapTileSize = project.tilemap.tileSize;
  tilemapSourceAssetId = project.tilemap.sourceAssetId;
  tileSolidValues = [...project.tilemap.solidValues];
  mapTileValues.splice(0, mapTileValues.length, ...project.tilemap.values);
  for (let index = 0; index < tileValues.length; index += 1) {
    const mapIndex = Math.floor(index / 8) * mapColumns + index % 8;
    tileValues[index] = mapTileValues[mapIndex] ?? 0;
  }

  applyAtlasSourceProject(project);
  atlasFrames = structuredClone(project.atlas.frames);
  animationClips = structuredClone(project.atlas.clips ?? [{ id: "default", name: "Default", sequence: project.atlas.sequence, fps: project.atlas.playbackSpeed * 8, loop: true }]);
  activeAnimationClipId = project.atlas.defaultClipId && animationClips.some((clip) => clip.id === project.atlas.defaultClipId) ? project.atlas.defaultClipId : animationClips[0]?.id ?? "default";
  loadActiveAnimationClip();
  selectedAtlasFrame = Math.min(selectedAtlasFrame, Math.max(0, atlasFrames.length - 1));
  selectedAtlasFrames = new Set([selectedAtlasFrame]);
  atlasPlaybackSpeed = project.atlas.playbackSpeed;
  requireElement<HTMLInputElement>("#slice-width").value = String(project.atlas.frameWidth);
  requireElement<HTMLInputElement>("#slice-height").value = String(project.atlas.frameHeight);
  requireElement<HTMLInputElement>("#atlas-speed").value = String(project.atlas.playbackSpeed);

  for (const effect of effectConfigs) {
    const persisted = project.postProcessing.effects.find((candidate) => candidate.id === effect.id);
    if (persisted) { effect.enabled = persisted.enabled; effect.value = persisted.value; }
  }
  sequenceData = structuredClone(project.timeline);
  sequencePreviewEnabled = false;
  productionData = structuredClone(project.production);
  applyScene3DProject(project);
  sequenceFrame = Math.max(0, Math.min(sequenceData.durationFrames, sequenceFrame));
  editorSelect("#sequence-fps").value = String(sequenceData.fps);
  requireElement<HTMLInputElement>("#sequence-bpm").value = String(sequenceData.bpm);
  editorSelect("#sequence-speed").value = String(sequenceData.playbackSpeed);
  const audio = sequenceData.audioTracks[0];
  if (audio) {
    requireElement<HTMLInputElement>("#mixer-volume").value = String(audio.volume);
    requireElement<HTMLInputElement>("#mixer-pan").value = String(audio.pan);
  }
  renderSequenceTimeline();
  updateSequencePreviewStatus();
  renderProductionLab();

  renderStageHierarchy();
  renderTilemapMetadata(project);
  renderEffectControls();
  updatePostProcessing();
  buildTileGrid();
  runCollisionExtraction();
  renderAtlasPanels();
  const selectedStillExists = selectedEntityId && entities.some((entity) => entity.id === selectedEntityId);
  selectedEntityId = selectedStillExists ? selectedEntityId : entities[0]?.id ?? null;
  if (selectedEntityId) selectEntity(selectedEntityId);
  renderStage();
  renderTilemap();
  renderAtlas();
  renderRig();
  if (editorShell?.commandPaletteOpen()) editorShell.refreshCommandPalette();
}

function captureEditorProfile() {
  const sorted = frameTimes.slice().sort((a, b) => a - b);
  const percentile = (ratio: number) => sorted[Math.max(0, Math.floor(sorted.length * ratio) - 1)] ?? 0;
  return {
    activeWorkspace,
    frames: frameCount,
    fps: Number(measuredFps.toFixed(2)),
    frameP50Ms: Number(percentile(0.5).toFixed(3)),
    frameP95Ms: Number(percentile(0.95).toFixed(3)),
    frameP99Ms: Number(percentile(0.99).toFixed(3)),
    clampEvents,
    entities: entities.length,
    visibleInterestEntities: interestGrid.computeVisibility("profile-capture", aoiFocus).visible.length,
    kernelBackend: wasmKernel?.backend ?? "initializing",
    wasmLatencyMs,
    typescriptLatencyMs,
  };
}

function renderStageHierarchy(filter = "") {
  const host = requireElement<HTMLElement>("#entity-tree");
  const query = filter.trim().toLowerCase();
  const visible = entities.filter((entity) => !query || `${entity.label} ${entity.id} ${entity.kind}`.toLowerCase().includes(query));
  const environment = visible.filter((entity) => entity.layer !== 2);
  const actors = visible.filter((entity) => entity.layer === 2);
  const rows = (items: EditorEntity[]) => items.map((entity) => {
    const detail = entity.parentId ? `↳ ${entity.parentId}` : `L${entity.layer ?? 0}`;
    return `<button class="tree-row entity-row" draggable="true" data-entity-id="${escapeMarkup(entity.id)}"><span class="node-icon ${entity.kind === "hostile" ? "danger" : entity.kind === "actor" ? "cyan" : "amber"}">${entity.kind === "hostile" ? "◆" : "✦"}</span><span>${escapeMarkup(entity.label)}</span><small>${escapeMarkup(detail)}</small></button>`;
  }).join("");
  const sceneName = editorShell?.project.scenes.find((scene) => scene.id === editorShell?.project.activeSceneId)?.name ?? "Active Scene";
  host.innerHTML = `<div class="tree-row tree-root"><span class="chevron">⌄</span><span class="node-icon">◇</span><strong>${escapeMarkup(sceneName)}</strong></div><div class="tree-branch"><div class="tree-row"><span class="chevron">⌄</span><span class="node-icon cyan">▦</span><span>Environment</span><small>L0–1</small></div><div class="tree-branch">${rows(environment)}</div><div class="tree-row"><span class="chevron">⌄</span><span class="node-icon violet">◈</span><span>Actors</span><small>L2</small></div><div class="tree-branch">${rows(actors)}</div></div>`;
  const colliders = entities.filter((entity) => entity.components?.some((component) => component.enabled && component.type === "collider"));
  setText("#stage-node-count", `${entities.length} node${entities.length === 1 ? "" : "s"}`);
  setText("#stage-runtime-entity-count", String(entities.length));
  setText("#stage-collider-count", String(colliders.length));
  requireElement("#collision-list").innerHTML = colliders.length ? colliders.map((entity) => `<div><i style="--rect-color:${escapeMarkup(entity.color)}"></i><span>${escapeMarkup(entity.label)}</span><code>${Math.round(entity.width * entity.scale)} × ${Math.round(entity.height * entity.scale)}</code></div>`).join("") : '<p class="empty-copy">No entity colliders in this scene.</p>';
  bindStageTreeRows();
}

function bindStageTreeRows() {
  document.querySelectorAll<HTMLElement>(".entity-row").forEach((row) => {
    row.addEventListener("click", (event) => selectEntity(row.dataset.entityId ?? "", event.ctrlKey || event.metaKey));
    row.addEventListener("dragstart", (event) => {
      const id = row.dataset.entityId ?? "";
      if (!selectedEntityIds.has(id)) selectEntity(id);
      event.dataTransfer?.setData("application/x-engine-entities", JSON.stringify([...selectedEntityIds]));
    });
    row.addEventListener("dragover", (event) => { event.preventDefault(); row.classList.add("is-parent-target"); });
    row.addEventListener("dragleave", () => row.classList.remove("is-parent-target"));
    row.addEventListener("drop", (event) => { event.preventDefault(); row.classList.remove("is-parent-target"); parentSelectedEntities(row.dataset.entityId ?? ""); });
  });
}

const editorAutomation: EditorAutomation = {
  ready: false,
  activeWorkspace,
  selectedEntityId,
  postBudgetOk: true,
  footSlipMeters: 0,
  wasmLatencyMs: 0,
  typescriptLatencyMs: 0,
  loopPaused,
  tileTool: brushMode,
  extractedCollisionCount: 0,
  atlasFrameCount: 0,
  injectedLatencyMs,
  commandPaletteOpen: false,
  manualSteps,
  frameCount,
  keyboardActions: {},
  wasmFallbackActive,
  wasmFallbackReason,
  canvasResizeCommits,
  selectedEntityIds: [...selectedEntityIds],
  showWorkspace,
  injectHeavyPostStack,
  appendHeavyPostPasses,
  simulateWasmFallback,
  calibrateWorldZero,
  keyboardHeld: (action) => keyboard.held(action),
  assetPreviewReady: (id) => assetPreviewImages.has(id),
  entityPosition: (id) => {
    const entity = entities.find((candidate) => candidate.id === id);
    return entity ? { x: entity.x, y: entity.y } : undefined;
  },
  scene3dObjectPosition: (id) => {
    const runtimeEntity = editor3DPlaySession?.snapshot().entities.find((entity) => entity.id === id);
    if (runtimeEntity) return { x: runtimeEntity.position[0], y: runtimeEntity.position[1], z: runtimeEntity.position[2] };
    const object = scene3dMeshes.get(id);
    return object ? { x: object.position.x, y: object.position.y, z: object.position.z } : undefined;
  },
  selectEntity,
  setProceduralWalk,
  stepMotion,
  runBenchmark,
  openProductionLab,
  simulateMidi,
  setSequenceFrame(frame) {
    sequenceFrame = Math.max(0, Math.min(sequenceData.durationFrames - 1, Math.round(frame)));
    sequencePreviewEnabled = true;
    updateSequencePlayhead();
    renderSequenceDrivenPreviews();
  },
  exportSequencePreview,
};
globalThis.__engineEditor = editorAutomation;
globalThis.__engineStudio = editorAutomation;

renderEffectControls();
updatePostProcessing();
ensureSupplementalUi();
buildTileGrid();
commitGridSlice();
runCollisionExtraction();
renderPoseTracks();
bindSequenceEditor();
bindProductionLab();
selectEntity("player-01");
renderDiagnostics();
editorShell = createEditorShell({
  captureProject: captureRuntimeProject,
  applyProject: applyProjectToRuntime,
  showWorkspace,
  activeWorkspace: () => activeWorkspace,
  selectedEntityId: () => selectedEntityId,
  selectEntity,
  viewportPoint(clientX, clientY) { return stageWorldPoint(canvasPoint(stageCanvas, clientX, clientY)); },
  previewAsset(id, blob) {
    assetRuntimeBlobs.set(id, blob);
    const projectAsset = editorShell?.project.assets.find((asset) => asset.id === id);
    const isImage = blob.type.startsWith("image/") || projectAsset?.kind === "image";
    const isAudio = blob.type.startsWith("audio/") || projectAsset?.kind === "audio";
    if (!isImage && !isAudio) return;
    const previousUrl = assetPreviewUrls.get(id);
    if (id === fftAudioAssetId) resetFftAudioPreview();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    assetPreviewImages.delete(id);
    const url = URL.createObjectURL(blob);
    assetPreviewUrls.set(id, url);
    if (isAudio) {
      const reactiveLabOpen = productionTab === "reactive" && !requireElement<HTMLElement>("#production-center").hidden;
      if (reactiveLabOpen) void connectFftAudioAsset();
      return;
    }
    const preview = new Image();
    preview.addEventListener("load", () => {
      if (assetPreviewUrls.get(id) !== url) return;
      assetPreviewImages.set(id, preview);
      renderStage();
      if (id === atlasSourceAssetId) { renderAtlasPanels(); renderAtlas(); }
      if (activeWorkspace === "post") renderPostPreview();
    }, { once: true });
    preview.addEventListener("error", () => {
      if (assetPreviewUrls.get(id) !== url) return;
      assetPreviewUrls.delete(id);
      URL.revokeObjectURL(url);
      if (id === atlasSourceAssetId) { renderAtlasPanels(); renderAtlas(); }
    }, { once: true });
    preview.src = url;
  },
  async play(project, options) {
    const playRequest = ++editorPlayRequest;
    if (readHyperfocus3DDeclaration(project)) {
      playableTimeline = undefined;
      disposePlayableAudio();
      disposeEditor3DPlay();
      applyScene3DProject(project);
      showWorkspace("scene3d");
      setScene3DViewportMode("loading");
      setText("#scene3d-status", "LOADING IMPORTED 3D ASSETS…");
      const controller = new AbortController();
      editor3DPlayAbort = controller;
      try {
        const assets = await collectEditor3DAssets(project);
        if (playRequest !== editorPlayRequest || controller.signal.aborted) return;
        const session = await createEditor3DPlaySession({
          project,
          assets,
          canvas: scene3dCanvas,
          signal: controller.signal,
          onDiagnostic: (diagnostic) => logEvent(`3D runtime ${"code" in diagnostic ? diagnostic.code : "diagnostic"} → ${diagnostic.message}`),
        });
        if (playRequest !== editorPlayRequest || controller.signal.aborted) {
          session.dispose();
          return;
        }
        editor3DPlayAbort = undefined;
        editor3DPlaySession = session;
        playableBindings.clear();
        setScene3DViewportMode("play");
        renderScene3DFrame();
        scene3dCanvas.focus({ preventScroll: true });
        if (!app.isRunning()) togglePlayback();
        logEvent(`3D Play → ${assets.length} imported assets · DOM-free runtime + first-party WebGL2`);
        return;
      } catch (cause) {
        if (playRequest !== editorPlayRequest || controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError")) return;
        editor3DPlayAbort = undefined;
        editor3DPlaySession?.dispose();
        editor3DPlaySession = undefined;
        applyScene3DProject(project);
        setScene3DViewportMode("error");
        setText("#scene3d-status", "3D PLAY FAILED · SEE CONSOLE");
        return cause instanceof Error ? cause.message : String(cause);
      }
    }
    let world: PlayableWorld;
    let timeline: PlayableTimeline2D;
    try {
      const sourceBehaviors = options?.sourcePermission ? await liveSourceCompiler.compile(project) : {};
      if (playRequest !== editorPlayRequest) return;
      world = createPlayableWorld(project, { behaviors: { ...sourceBehaviors, ...createNavigationBehaviorRegistry2D(project) } });
      timeline = createPlayableTimeline2D(project);
    }
    catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
    if (world.diagnostics.length) return world.diagnostics.map((item) => item.message).join("\n");
    const story = readPlayableStoryDeclaration2D(project) ? createPlayableStoryController2D(project) : undefined;
    const audio = await createPlayableAudio(project);
    if (playRequest !== editorPlayRequest) { await audio.dispose(); return; }
    disposePlayableAudio();
    playableAudio = audio;
    editorPlaySaves.start(project, world, story ? [story.saveStateProvider()] : []);
    playableAudio.enqueue(world.drainAudioCommands());
    applyProjectToRuntime(project, { preservePlayableAudio: true });
    playableWorld = world;
    playableTimeline = timeline;
    playableStory = story;
    playableProject = structuredClone(project);
    playableSceneId = undefined;
    const timelineSnapshot = timeline.snapshot();
    sequenceFrame = timelineSnapshot.frame;
    sequencePreviewEnabled = true;
    updateSequencePlayhead();
    mirrorPlayableSnapshot(applyTimelineOverrides2D(world.snapshot(), timelineSnapshot.overrides));
    for (const diagnostic of timeline.diagnostics) logEvent(`timeline ${diagnostic.code} → ${diagnostic.message}`);
    playableBindings.clear();
    if (!app.isRunning()) togglePlayback();
  },
  async compileSource(project) {
    try {
      const registry = await liveSourceCompiler.compile(project);
      const definitions: PlayableBehaviorDefinition2D[] = [];
      for (const key of Object.keys(registry)) {
        const separator = key.lastIndexOf("#");
        if (separator <= 0) continue;
        const definition = playableBehaviorDefinition2D({ values: { module: key.slice(0, separator), export: key.slice(separator + 1) } }, registry);
        if (definition) definitions.push(structuredClone(definition));
      }
      return { definitions };
    } catch (cause) { return { blocker: cause instanceof Error ? cause.message : String(cause) }; }
  },
  clearSource() { liveSourceCompiler.clear(); },
  pause() {
    editorPlayRequest += 1;
    disposePlayableAudio();
    playableTimeline = undefined;
    const had3DPlay = Boolean(editor3DPlaySession || editor3DPlayAbort);
    disposeEditor3DPlay();
    if (playableWorld) {
      if (playableProject) editorPlaySaves.stop(playableProject, playableWorld, playableStory ? [playableStory.saveStateProvider()] : []);
      playableWorld = undefined;
      playableStory = undefined;
      playableProject = undefined;
      playableSceneId = undefined;
      playableBindings.clear();
      if (editorShell) applyProjectToRuntime(editorShell.project);
    }
    if (had3DPlay && editorShell) applyProjectToRuntime(editorShell.project);
    playableBindings.clear();
    if (app.isRunning()) togglePlayback();
  },
  togglePlayback,
  captureProfile: captureEditorProfile,
  commandPaletteCommands: currentEditorCommands,
  log: logEvent,
});
globalThis.__hyperfocusEditorAgent = createEditorAgentBridge({
  getProject: () => requireInitialized(editorShell, "Engine Editor shell").project,
  isReady: () => editorAutomation.ready,
});
globalThis.__hyperfocusEditorCommands = editorShell.commands;
applyProjectToRuntime(editorShell.project);
if (location.hash === "#motion" || location.hash === "#sequence") showWorkspace("motion");
if (new URLSearchParams(location.search).has("review")) { document.body.classList.add("review-mode"); openProductionLab("review"); setText("#production-health", "LOCAL REVIEW PREVIEW · NO ACCESS CONTROL"); }
if (!app.isRunning()) app.start();
loopPaused = false;
editorAutomation.loopPaused = false;
void initializeKernels().finally(() => {
  editorAutomation.ready = true;
  setText("#footer-status", "Editor project ready");
});
window.addEventListener("pagehide", () => {
  globalThis.__hyperfocusEditorAgent = undefined;
  globalThis.__hyperfocusEditorCommands = undefined;
  keyboard.dispose();
  stageDelegation.dispose();
  disposePlayableAudio();
  disposeEditor3DPlay();
  resetFftAudioPreview();
  for (const url of assetPreviewUrls.values()) URL.revokeObjectURL(url);
  assetPreviewUrls.clear();
  assetPreviewImages.clear();
  assetRuntimeBlobs.clear();
  app.destroy();
  editorShell?.destroy();
});
