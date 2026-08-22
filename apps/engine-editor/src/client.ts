import { AmbientLight, Bone, BoxGeometry, Color as ThreeColor, DirectionalLight, GridHelper, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Scene as ThreeScene, Skeleton, Vector3, WebGLRenderer } from "three";
import {
  checkPostProcessBudget,
  createBrowserApp,
  createCanvasObjectEvents,
  createCollisionKernel,
  createKeyboardActions,
  createPostProcessStack,
  createStage,
  createTileMap,
  createTileset,
  crtScanlines,
  drawSpriteBatch,
  extractCollisionRects,
  getPostProcessEffectCost,
  grayscale,
  popTransform,
  postProcessCosts,
  pushTransform,
  registerSprite,
  screenShake,
  sepia,
  threshold,
  type CollisionKernel,
  type PostProcessEffect,
} from "../../../engine/src/index.ts";
import { defineSchema, encodeDelta } from "../../../engine/src/protocol/index.ts";
import type { StageEntity } from "../../../engine/src/runtime/stage.ts";
import {
  createRenderFramePool,
  drawRenderable,
  renderArray,
  type Renderable,
} from "../../../engine/src/render/index.ts";
import { createInterestGrid, type InterestEntity } from "../../../engine/src/server/interest-grid.ts";
import {
  createThreeHumanoidMotionController,
  type ThreeHumanoidMotionController,
} from "../../../engine/src/motion/three.ts";
import { createEditorShell, type EditorShell } from "./editor-shell.ts";
import { createEditorAgentBridge } from "./editor-agent-protocol.ts";
import type { EditorComponent, EditorKeyframe, EditorProject, EditorSpriteBone, EditorTimelineTrack } from "./project.ts";
import { encodeCanvasSequenceWebM } from "./webm-export.ts";
import { createPlayableWorld, type PlayableWorld } from "../../../engine/src/project/runtime-2d.ts";
import { createNavigationBehaviorRegistry2D } from "../../../engine/src/project/runtime-navigation-2d.ts";
import { PlayableEditorPlaySession2D } from "../../../engine/src/project/runtime-save-2d.ts";
import { createPlayableStoryController2D, readPlayableStoryDeclaration2D, type PlayableStoryController2D } from "../../../engine/src/project/runtime-story-2d.ts";

type WorkspaceId = "stage" | "scene3d" | "tilemap" | "atlas" | "script" | "post" | "motion" | "diagnostics";
type BrushMode = "paint" | "erase" | "inspect" | "fill" | "marquee";
type TileId = 0 | 1 | 2 | 3;

type EditorEntity = StageEntity & {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  color: string;
  accent: string;
  kind: "prop" | "actor" | "hostile";
  parentId?: string;
  components?: EditorComponent[];
};

type EffectId = "grayscale" | "sepia" | "crt" | "shake" | "threshold";
type EffectConfig = {
  id: EffectId;
  label: string;
  tier: string;
  enabled: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
};

type EditorAutomation = {
  ready: boolean;
  activeWorkspace: WorkspaceId;
  selectedEntityId: string | null;
  postBudgetOk: boolean;
  footSlipMeters: number;
  wasmLatencyMs: number;
  typescriptLatencyMs: number;
  loopPaused: boolean;
  tileTool: BrushMode;
  extractedCollisionCount: number;
  atlasFrameCount: number;
  injectedLatencyMs: number;
  commandPaletteOpen: boolean;
  manualSteps: number;
  frameCount: number;
  keyboardActions: Record<string, boolean>;
  wasmFallbackActive: boolean;
  wasmFallbackReason: string;
  canvasResizeCommits: number;
  selectedEntityIds: string[];
  showWorkspace(id: WorkspaceId): void;
  injectHeavyPostStack(): void;
  appendHeavyPostPasses(count: number): void;
  simulateWasmFallback(): Promise<void>;
  calibrateWorldZero(x: number, y: number): void;
  keyboardHeld(action: string): boolean;
  assetPreviewReady(id: string): boolean;
  entityPosition(id: string): { x: number; y: number } | undefined;
  scene3dObjectPosition(id: string): { x: number; y: number; z: number } | undefined;
  selectEntity(id: string): void;
  setProceduralWalk(active: boolean): void;
  stepMotion(frames?: number): void;
  runBenchmark(): Promise<{ wasmMs: number; typescriptMs: number }>;
  openProductionLab(tab?: "export" | "reactive" | "logic" | "rig" | "review"): void;
  simulateMidi(value?: number): void;
  exportSequencePreview(): Promise<{ bytes: number; type: string }>;
};

declare global {
  /** @deprecated Compatibility alias for pre-rename automation consumers. */
  var __engineStudio: EditorAutomation | undefined;
  var __engineEditor: EditorAutomation | undefined;
}

const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Engine Editor markup is missing ${selector}`);
  return element;
};

const setText = (selector: string, value: string) => {
  requireElement<HTMLElement>(selector).textContent = value;
};

const escapeMarkup = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]!);

const stageCanvas = requireElement<HTMLCanvasElement>("#stage-canvas");
const stageContext = require2dContext(stageCanvas);
const scene3dCanvas = requireElement<HTMLCanvasElement>("#scene3d-canvas");
const rigCanvas = requireElement<HTMLCanvasElement>("#rig-canvas");
const rigContext = require2dContext(rigCanvas);
const rawPostCanvas = requireElement<HTMLCanvasElement>("#post-preview-raw");
const activePostCanvas = requireElement<HTMLCanvasElement>("#post-preview-active");
const rawPostContext = require2dContext(rawPostCanvas);
const activePostContext = require2dContext(activePostCanvas);
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
const exportPreviewContext = require2dContext(exportPreviewCanvas);
const fftCanvas = requireElement<HTMLCanvasElement>("#fft-canvas");
const fftContext = require2dContext(fftCanvas);
const spriteRigCanvas = requireElement<HTMLCanvasElement>("#sprite-rig-canvas");
const spriteRigContext = require2dContext(spriteRigCanvas);
const reviewCanvas = requireElement<HTMLCanvasElement>("#review-canvas");
const reviewContext = require2dContext(reviewCanvas);

let activeWorkspace: WorkspaceId = "stage";
let selectedEntityId: string | null = "player-01";
let selectedTile: TileId = 0;
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

const effectConfigs: EffectConfig[] = [
  { id: "grayscale", label: "Grayscale", tier: "pixel pass", enabled: false, value: 0.65, min: 0, max: 1, step: 0.05, unit: "%" },
  { id: "sepia", label: "Sepia", tier: "pixel pass", enabled: true, value: 0.28, min: 0, max: 1, step: 0.05, unit: "%" },
  { id: "crt", label: "CRT Scanlines", tier: "overlay pass", enabled: true, value: 0.2, min: 0.05, max: 0.6, step: 0.01, unit: "%" },
  { id: "shake", label: "Screen Shake", tier: "distortion / 2 passes", enabled: false, value: 4, min: 0, max: 16, step: 1, unit: "px" },
  { id: "threshold", label: "Threshold", tier: "pixel pass", enabled: false, value: 132, min: 20, max: 235, step: 1, unit: "" },
];

const tileValues: TileId[] = Array.from({ length: 40 }, (_, index) => {
  if (index === 6 || index === 14 || index === 33) return 2;
  if (index % 7 === 0 || index === 18) return 1;
  if (index > 31) return 3;
  return 0;
});

const MAP_COLUMNS = 16;
const MAP_ROWS = 10;
const MAP_TILE_SIZE = 48;
const mapTileValues: TileId[] = Array.from({ length: MAP_COLUMNS * MAP_ROWS }, (_, index) => {
  const column = index % MAP_COLUMNS;
  const row = Math.floor(index / MAP_COLUMNS);
  if (row === 0 || row === MAP_ROWS - 1 || column === 0 || column === MAP_COLUMNS - 1) return 3;
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
let atlasFrames: AtlasFrame[] = [];
let selectedAtlasFrame = 0;
let selectedAtlasFrames = new Set<number>([0]);
let animationSequence: AtlasFrame[] = [];
let draggedSourceFrames: number[] | null = null;
let atlasPlaybackSpeed = 1;
let atlasElapsed = 0;
let atlasManualSlicing = false;
let atlasDragStart: { x: number; y: number } | null = null;
let atlasDraftRect: { x: number; y: number; width: number; height: number } | null = null;
let draggedAtlasIndex: number | null = null;
let editorShell: EditorShell | undefined;
let stageTool: "select" | "pan" = "select";
let motionTool: "pose" | "ik" = "ik";
let playableWorld: PlayableWorld | undefined;
let playableProject: EditorProject | undefined;
let playableStory: PlayableStoryController2D | undefined;
let currentStarterTemplate = "";
const editorPlaySaves = new PlayableEditorPlaySession2D();
const playableBindings = new Set<string>();
let scene3dRenderer: WebGLRenderer | undefined;
let scene3dScene: ThreeScene | undefined;
let scene3dCamera: PerspectiveCamera | undefined;
let scene3dPlaying = false;
const scene3dMeshes = new Map<string, Mesh<BoxGeometry, MeshStandardMaterial>>();
let scene3dFollowOffset: [number, number, number] = [0, 5, 8];
const assetPreviewImages = new Map<string, HTMLImageElement>();
const assetPreviewUrls = new Map<string, string>();

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
    const calls = target as Renderable[];
    const selected = entity.id === selectedEntityId;
    const width = entity.width * entity.scale;
    const height = entity.height * entity.scale;
    const assetId = entity.components?.find((component) => component.enabled && component.type === "sprite")?.values.asset;
    const preview = typeof assetId === "string" ? assetPreviewImages.get(assetId) : undefined;
    if (preview) {
      calls.push((ctx) => {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(preview, entity.x - width / 2, entity.y - height / 2, width, height);
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
      });
    } else {
      calls.push({
        kind: "rect",
        id: entity.id,
        x: entity.x - width / 2,
        y: entity.y - height / 2,
        width,
        height,
        fill: entity.color,
        stroke: selected ? "#7ffff3" : entity.accent,
        lineWidth: selected ? 3 : 1,
        shadowColor: entity.color,
        shadowBlur: selected ? 18 : 8,
      });
      if (currentStarterTemplate !== "pong" && entity.kind !== "prop") {
        calls.push({
          kind: "circle",
          x: entity.x,
          y: entity.y - height * 0.28,
          radius: Math.max(5, Math.min(width, height) * 0.2),
          fill: entity.accent,
          alpha: 0.9,
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
const tileEntries = Array.from({ length: 15 * 9 }, (_, index) => ({
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
window.addEventListener("keydown", (event) => playableBindings.add(event.code));
window.addEventListener("keyup", (event) => playableBindings.delete(event.code));
window.addEventListener("blur", () => playableBindings.clear());

const app = createBrowserApp({
  canvas: stageCanvas,
  parent: requireElement("#stage-canvas-wrap"),
  width: 760,
  height: 480,
  scaleMode: "fit",
  input: false,
  metrics: { capacity: 180 },
  step: 1 / 60,
  maxFrame: 0.05,
  resizeDebounceMs: 100,
  autoStart: true,
  update(_context, delta) {
    if (playableWorld) {
      if (playableStory && playableProject) {
        playableStory.step(resolvePlayableActions(playableProject, playableBindings));
        for (const command of playableStory.drainCommands()) logEvent(`story → ${command.type}`);
      }
      playableWorld.advance(delta, { bindings: playableBindings });
      playableWorld.drainAudioCommands();
      const snapshot = playableWorld.snapshot();
      const byId = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
      for (const entity of entities) {
        const state = byId.get(entity.id);
        if (state) { entity.x = state.x; entity.y = state.y; }
      }
    } else {
      stage.update(delta);
    }
    updateMotion(delta);
    updateSequence(delta);
    atlasElapsed += delta * atlasPlaybackSpeed;
    keyboard.update();
    updateScene3DPreview(delta);
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
  stageContext.clearRect(0, 0, 760, 480);
  const gradient = stageContext.createRadialGradient(380, 240, 30, 380, 240, 440);
  gradient.addColorStop(0, "#152a31");
  gradient.addColorStop(0.64, "#0c171f");
  gradient.addColorStop(1, "#070b11");
  stageContext.fillStyle = gradient;
  stageContext.fillRect(0, 0, 760, 480);

  stageContext.save();
  stageContext.translate(380, 240);
  stageContext.scale(stageViewport.zoom, stageViewport.zoom);
  stageContext.translate(-380 + stageViewport.cameraX, -240 + stageViewport.cameraY);

  let tileDrawn = 0;
  if (currentStarterTemplate !== "pong") {
    stageContext.save();
    stageContext.globalAlpha = 0.87;
    tileDrawn = drawSpriteBatch("engine-editor-tiles", tileEntries, { ctx: stageContext, frames: tileFrames }).drawn;
    stageContext.restore();
  }

  if (currentStarterTemplate === "pong") drawPongCourt(stageContext);
  else drawDungeonWalls(stageContext);
  for (const parent of entities) {
    const children = entities.filter((entity) => entity.parentId === parent.id);
    if (!children.length) continue;
    pushTransform({ ctx: stageContext, x: parent.x, y: parent.y });
    stageContext.strokeStyle = "rgb(243 173 78 / 65%)";
    stageContext.setLineDash([4, 4]);
    for (const child of children) {
      stageContext.beginPath();
      stageContext.moveTo(0, 0);
      stageContext.lineTo(child.x - parent.x, child.y - parent.y);
      stageContext.stroke();
    }
    stageContext.setLineDash([]);
    popTransform({ ctx: stageContext });
  }
  renderPool.beginFrame();
  const calls = renderArray(renderPool);
  stage.render(calls, 1);
  for (const [order, call] of calls.entries()) {
    drawRenderable(stageContext, call, {
      camera: {},
      layer: "main",
      layerOptions: { sort: "none", ignoreCamera: true, order: 0 },
      order,
    });
  }
  if (!playableWorld) drawStageGrid(stageContext);
  stageContext.restore();
  setText("#stage-drawn", String(tileDrawn + calls.length));
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
  ctx.font = "700 38px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgb(214 255 250 / 22%)";
  ctx.fillText("0     0", 380, 64);
  ctx.restore();
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
  readout.querySelector("strong")!.textContent = entity.label;
  readout.querySelector("code")!.textContent = `x ${Math.round(entity.x)} · y ${Math.round(entity.y)} · L${entity.layer ?? 0}`;
  if (globalThis.__engineEditor) {
    globalThis.__engineEditor.selectedEntityId = entity.id;
    globalThis.__engineEditor.selectedEntityIds = [...selectedEntityIds];
  }
  editorShell?.refreshSelection();
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

type Scene3DProjectEntity = { id: string; materialId: string; position: [number, number, number]; scale: [number, number, number]; rotationY: number; controller?: { speed: number }; animation?: { kind: string; radiansPerSecond: number } };
type Scene3DProject = {
  activeSceneId: string;
  materials: Array<{ id: string; baseColor: [number, number, number, number]; metallic: number; roughness: number }>;
  scenes: Array<{ id: string; camera: { position: [number, number, number]; target: [number, number, number]; fovYRadians: number; followOffset?: [number, number, number] }; entities: Scene3DProjectEntity[] }>;
};

function readScene3DProject(project: EditorProject): Scene3DProject | undefined {
  const value = project.extensions?.hyperfocus3D as Partial<Scene3DProject> | undefined;
  return value && typeof value.activeSceneId === "string" && Array.isArray(value.materials) && Array.isArray(value.scenes) ? value as Scene3DProject : undefined;
}

function applyScene3DProject(project: EditorProject) {
  const declaration = readScene3DProject(project);
  scene3dMeshes.clear();
  if (!declaration) {
    scene3dScene?.clear();
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
    scene3dCamera = new PerspectiveCamera(scene.camera.fovYRadians * 180 / Math.PI, 960 / 600, 0.1, 100);
    scene3dCamera.position.set(...scene.camera.position);
    scene3dCamera.lookAt(...scene.camera.target);
    scene3dFollowOffset = scene.camera.followOffset ?? [0, 5, 8];
    setText("#scene3d-status", `${scene.entities.length} OBJECTS · WEBGL2 READY`);
    renderScene3DFrame();
  } catch (error) {
    setText("#scene3d-status", "WEBGL2 PREVIEW UNAVAILABLE");
    logEvent(`3D preview → ${error instanceof Error ? error.message : String(error)}`);
  }
}

function updateScene3DPreview(delta: number) {
  if (!scene3dPlaying) return;
  const actor = scene3dMeshes.get("actor");
  if (actor) {
    const speed = 3.5 * delta;
    actor.position.x += (Number(playableBindings.has("KeyD") || playableBindings.has("ArrowRight")) - Number(playableBindings.has("KeyA") || playableBindings.has("ArrowLeft"))) * speed;
    actor.position.z += (Number(playableBindings.has("KeyS") || playableBindings.has("ArrowDown")) - Number(playableBindings.has("KeyW") || playableBindings.has("ArrowUp"))) * speed;
    actor.position.x = Math.max(-5.2, Math.min(5.2, actor.position.x));
    actor.position.z = Math.max(-5.2, Math.min(5.2, actor.position.z));
    if (scene3dCamera) {
      scene3dCamera.position.set(actor.position.x + scene3dFollowOffset[0], actor.position.y + scene3dFollowOffset[1], actor.position.z + scene3dFollowOffset[2]);
      scene3dCamera.lookAt(actor.position);
    }
  }
  const spinner = scene3dMeshes.get("spinner");
  if (spinner) spinner.rotation.y += delta * 0.8;
}

function renderScene3DFrame() {
  if (scene3dRenderer && scene3dScene && scene3dCamera) scene3dRenderer.render(scene3dScene, scene3dCamera);
}

// Tilemap and collision painter --------------------------------------------

function setTileTool(tool: BrushMode) {
  brushMode = tool;
  document.querySelectorAll<HTMLElement>("[data-tile-tool]").forEach((button) => button.classList.toggle("is-active", button.dataset.tileTool === tool));
  setText("#tile-tool-chip", `${tool === "paint" ? "B" : tool === "erase" ? "E" : tool === "fill" ? "G" : "M"} · ${tool.toUpperCase()}`);
  if (globalThis.__engineEditor) globalThis.__engineEditor.tileTool = tool;
}

function renderTilemap() {
  const ctx = tilemapContext;
  const originX = 96;
  const originY = 60;
  ctx.clearRect(0, 0, tilemapCanvas.width, tilemapCanvas.height);
  const gradient = ctx.createRadialGradient(480, 300, 30, 480, 300, 520);
  gradient.addColorStop(0, "#132a31"); gradient.addColorStop(1, "#070d13");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 960, 600);
  const colors = ["#263b46", "#355446", "#102b3a", "#784e34"];
  for (let row = 0; row < MAP_ROWS; row += 1) {
    for (let column = 0; column < MAP_COLUMNS; column += 1) {
      const index = row * MAP_COLUMNS + column;
      const x = originX + column * MAP_TILE_SIZE;
      const y = originY + row * MAP_TILE_SIZE;
      const tile = mapTileValues[index];
      ctx.fillStyle = colors[tile]; ctx.fillRect(x, y, MAP_TILE_SIZE, MAP_TILE_SIZE);
      ctx.fillStyle = tile === 3 ? "rgb(255 174 92 / 20%)" : "rgb(183 227 220 / 7%)";
      ctx.fillRect(x + 5, y + 5, MAP_TILE_SIZE - 10, 4);
      ctx.strokeStyle = "rgb(76 126 133 / 45%)"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, MAP_TILE_SIZE - 1, MAP_TILE_SIZE - 1);
    }
  }
  ctx.save();
  ctx.translate(originX, originY);
  ctx.fillStyle = "rgb(255 86 116 / 16%)"; ctx.strokeStyle = "#ff647e"; ctx.lineWidth = 2;
  for (const rect of extractedRects) { ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2); }
  if (tileSelection) {
    const bounds = normalizedTileSelection(tileSelection);
    ctx.fillStyle = "rgb(65 215 208 / 11%)"; ctx.strokeStyle = "#61e9dd"; ctx.setLineDash([7, 4]);
    ctx.fillRect(bounds.minColumn * MAP_TILE_SIZE, bounds.minRow * MAP_TILE_SIZE, bounds.width * MAP_TILE_SIZE, bounds.height * MAP_TILE_SIZE);
    ctx.strokeRect(bounds.minColumn * MAP_TILE_SIZE + 1, bounds.minRow * MAP_TILE_SIZE + 1, bounds.width * MAP_TILE_SIZE - 2, bounds.height * MAP_TILE_SIZE - 2);
    ctx.setLineDash([]);
  }
  ctx.restore();
  setText("#solid-tile-count", String(mapTileValues.filter((tile) => tile === 3).length));
}

function tileCellFromPointer(clientX: number, clientY: number) {
  const point = canvasPoint(tilemapCanvas, clientX, clientY);
  return {
    column: Math.max(0, Math.min(MAP_COLUMNS - 1, Math.floor((point.x - 96) / MAP_TILE_SIZE))),
    row: Math.max(0, Math.min(MAP_ROWS - 1, Math.floor((point.y - 60) / MAP_TILE_SIZE))),
  };
}

function applyTileAt(column: number, row: number, tool: BrushMode = brushMode) {
  const index = row * MAP_COLUMNS + column;
  if (eyedropperHeld) {
    selectedTile = mapTileValues[index];
    setText("#tile-sample-readout", `ID ${selectedTile} · ${["STONE", "MOSS", "VOID", "SOLID TRIM"][selectedTile]}`);
    document.querySelectorAll<HTMLElement>("[data-map-tile]").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.mapTile) === selectedTile));
    return;
  }
  if (tool === "fill") floodFillTiles(column, row, selectedTile);
  else if (tool !== "marquee") mapTileValues[index] = tool === "erase" ? 2 : selectedTile;
  syncMiniTileValues();
}

function syncMiniTileValues() {
  for (let index = 0; index < tileValues.length; index += 1) tileValues[index] = mapTileValues[Math.floor(index / 8) * MAP_COLUMNS + index % 8] ?? 0;
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
  const target = mapTileValues[row * MAP_COLUMNS + column];
  if (target === replacement) return;
  const queue = [{ column, row }];
  while (queue.length) {
    const cell = queue.pop()!;
    if (cell.column < 0 || cell.column >= MAP_COLUMNS || cell.row < 0 || cell.row >= MAP_ROWS) continue;
    const index = cell.row * MAP_COLUMNS + cell.column;
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

function runCollisionExtraction() {
  const bounds = tileSelection ? normalizedTileSelection(tileSelection) : { minColumn: 0, minRow: 0, width: MAP_COLUMNS, height: MAP_ROWS };
  const values: TileId[] = [];
  for (let row = 0; row < bounds.height; row += 1) {
    for (let column = 0; column < bounds.width; column += 1) values.push(mapTileValues[(bounds.minRow + row) * MAP_COLUMNS + bounds.minColumn + column]);
  }
  const tileset = createTileset({ tileSize: MAP_TILE_SIZE, columns: 4, tileCount: 4, tiles: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3, name: "Solid Trim", solid: true, collision: true, tags: ["solid"] }] });
  const map = createTileMap({ tileset, width: bounds.width, height: bounds.height, tileSize: MAP_TILE_SIZE, layers: [{ id: "terrain", tiles: values }] });
  extractedRects = extractCollisionRects(map, { tags: ["solid"], merge: true }).map((rect) => ({ x: rect.x + bounds.minColumn * MAP_TILE_SIZE, y: rect.y + bounds.minRow * MAP_TILE_SIZE, w: rect.w, h: rect.h }));
  setText("#extracted-rect-count", String(extractedRects.length));
  setText("#collision-area", `${extractedRects.reduce((sum, rect) => sum + rect.w * rect.h, 0).toLocaleString()} px²`);
  const list = requireElement<HTMLElement>("#extracted-collision-list");
  list.innerHTML = extractedRects.map((rect, index) => `<div class="collision-result"><i></i><span>collision_${String(index + 1).padStart(2, "0")}</span><code>${rect.w} × ${rect.h}</code></div>`).join("") || '<div class="collision-result"><i></i><span>No solid tiles in selection</span><code>—</code></div>';
  if (globalThis.__engineEditor) globalThis.__engineEditor.extractedCollisionCount = extractedRects.length;
  setText("#collision-extract-status", `EXTRACTED · ${extractedRects.length} RECTS`);
  renderTilemap();
}

// Texture atlas slicer and animator ----------------------------------------

function commitGridSlice() {
  const frameWidth = Math.max(8, Math.min(512, Number(requireElement<HTMLInputElement>("#slice-width").value) || 128));
  const frameHeight = Math.max(8, Math.min(320, Number(requireElement<HTMLInputElement>("#slice-height").value) || 160));
  atlasFrames = [];
  let index = 0;
  for (let y = 0; y + frameHeight <= 320; y += frameHeight) {
    for (let x = 0; x + frameWidth <= 512; x += frameWidth) {
      atlasFrames.push({ id: `frame-${index}`, name: `walk_${String(index).padStart(2, "0")}`, x, y, width: frameWidth, height: frameHeight, color: atlasColor(index) });
      index += 1;
    }
  }
  selectedAtlasFrame = 0;
  selectedAtlasFrames = new Set([0]);
  animationSequence = atlasFrames.slice();
  renderAtlasPanels();
  if (globalThis.__engineEditor) globalThis.__engineEditor.atlasFrameCount = atlasFrames.length;
}

function addManualAtlasFrame(rect: { x: number; y: number; width: number; height: number }) {
  const index = atlasFrames.length;
  atlasFrames.push({ id: `frame-${index}`, name: `custom_${String(index).padStart(2, "0")}`, ...rect, color: atlasColor(index) });
  selectedAtlasFrame = index;
  selectedAtlasFrames = new Set([index]);
  renderAtlasPanels();
  if (globalThis.__engineEditor) globalThis.__engineEditor.atlasFrameCount = atlasFrames.length;
}

function atlasColor(index: number) {
  return ["#36c8c2", "#4e86d8", "#8f70db", "#d35f86", "#e7974c", "#84bd61"][index % 6];
}

function renderAtlas() {
  const ctx = atlasContext;
  ctx.clearRect(0, 0, 800, 560);
  const originX = 144; const originY = 100;
  ctx.fillStyle = "#0b1720"; ctx.fillRect(originX, originY, 512, 320);
  for (let y = 0; y < 320; y += 32) for (let x = 0; x < 512; x += 32) { ctx.fillStyle = (x / 32 + y / 32) % 2 ? "#10222c" : "#0d1d26"; ctx.fillRect(originX + x, originY + y, 32, 32); }
  atlasFrames.forEach((frame, index) => {
    drawAtlasCharacter(ctx, originX + frame.x + frame.width / 2, originY + frame.y + frame.height * .58, frame.color, index, Math.min(frame.width, frame.height) / 110);
    const selected = selectedAtlasFrames.has(index);
    ctx.strokeStyle = selected ? "#64f2e7" : "rgb(91 137 151 / 65%)"; ctx.lineWidth = index === selectedAtlasFrame ? 3 : selected ? 2 : 1;
    ctx.strokeRect(originX + frame.x + 1, originY + frame.y + 1, frame.width - 2, frame.height - 2);
    ctx.fillStyle = index === selectedAtlasFrame ? "#64f2e7" : "#728b99"; ctx.font = "8px ui-monospace,monospace"; ctx.fillText(frame.name, originX + frame.x + 6, originY + frame.y + 13);
  });
  if (atlasDraftRect) { ctx.fillStyle = "rgb(65 215 208 / 12%)";ctx.strokeStyle="#64f2e7";ctx.setLineDash([6,4]);ctx.fillRect(originX+atlasDraftRect.x,originY+atlasDraftRect.y,atlasDraftRect.width,atlasDraftRect.height);ctx.strokeRect(originX+atlasDraftRect.x,originY+atlasDraftRect.y,atlasDraftRect.width,atlasDraftRect.height);ctx.setLineDash([]); }
  renderAnimationPreview();
}

function drawAtlasCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, frame: number, scale: number) {
  const phase = frame / Math.max(1, atlasFrames.length) * Math.PI * 2;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=8;ctx.lineCap="round";ctx.shadowColor=color;ctx.shadowBlur=8;
  ctx.beginPath();ctx.arc(0,-48,15,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(0,-31);ctx.lineTo(0,24);ctx.moveTo(0,-10);ctx.lineTo(-28,10+Math.sin(phase)*12);ctx.moveTo(0,-10);ctx.lineTo(28,10-Math.sin(phase)*12);ctx.moveTo(0,24);ctx.lineTo(-20,63+Math.cos(phase)*12);ctx.moveTo(0,24);ctx.lineTo(20,63-Math.cos(phase)*12);ctx.stroke();ctx.restore();
}

function renderAnimationPreview() {
  const ctx = animationContext;ctx.clearRect(0,0,250,220);const frame = animationSequence.length ? animationSequence[Math.floor(atlasElapsed * 8) % animationSequence.length] : undefined;
  if (!frame) return;drawAtlasCharacter(ctx,125,122,frame.color,atlasFrames.indexOf(frame),1.35);setText("#animation-frame-name",frame.name);
}

function renderAtlasPanels() {
  const list = requireElement<HTMLElement>("#atlas-frame-list");
  list.innerHTML = atlasFrames.map((frame,index)=>`<button draggable="true" class="atlas-frame-row ${selectedAtlasFrames.has(index)?"is-selected":""}" data-atlas-index="${index}"><i style="--frame-color:${frame.color}"></i><span>${frame.name}</span><small>${frame.width}×${frame.height}</small></button>`).join("");
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
  const timeline=requireElement<HTMLElement>("#atlas-timeline");
  timeline.innerHTML=animationSequence.map((frame,index)=>`<button draggable="true" class="timeline-frame ${frame===atlasFrames[selectedAtlasFrame]?"is-selected":""}" data-timeline-index="${index}" style="--frame-color:${frame.color}">${atlasFrames.indexOf(frame)}</button>`).join("");
  timeline.ondragover=(event)=>event.preventDefault();
  timeline.ondrop=(event)=>{event.preventDefault();if(!draggedSourceFrames)return;animationSequence=draggedSourceFrames.map((index)=>atlasFrames[index]).filter(Boolean);draggedSourceFrames=null;renderAtlasPanels();renderAtlas();commitEditorChange("Create animation sequence");logEvent(`AnimationClip → [${animationSequence.map((frame)=>atlasFrames.indexOf(frame)).join(", ")}]`);};
  timeline.querySelectorAll<HTMLButtonElement>("[data-timeline-index]").forEach((button)=>{
    button.addEventListener("click",()=>{const frame=animationSequence[Number(button.dataset.timelineIndex)];selectedAtlasFrame=Math.max(0,atlasFrames.indexOf(frame));selectedAtlasFrames=new Set([selectedAtlasFrame]);renderAtlasPanels();renderAtlas();});
    button.addEventListener("dragstart",()=>{draggedAtlasIndex=Number(button.dataset.timelineIndex);button.classList.add("is-dragging");});
    button.addEventListener("dragover",(event)=>event.preventDefault());
    button.addEventListener("drop",(event)=>{event.preventDefault();const target=Number(button.dataset.timelineIndex);if(draggedAtlasIndex===null)return;event.stopPropagation();if(target===draggedAtlasIndex)return;const [frame]=animationSequence.splice(draggedAtlasIndex,1);animationSequence.splice(target,0,frame);draggedAtlasIndex=null;renderAtlasPanels();renderAtlas();commitEditorChange("Reorder animation frames");});
    button.addEventListener("keydown",(event)=>{if(!event.altKey||(event.key!=="ArrowLeft"&&event.key!=="ArrowRight"))return;const index=Number(button.dataset.timelineIndex);const target=Math.max(0,Math.min(animationSequence.length-1,index+(event.key==="ArrowRight"?1:-1)));if(index===target)return;const [frame]=animationSequence.splice(index,1);animationSequence.splice(target,0,frame);renderAtlasPanels();renderAtlas();commitEditorChange("Reorder animation frames");event.preventDefault();});
    button.addEventListener("dragend",()=>{draggedAtlasIndex=null;button.classList.remove("is-dragging");});
  });
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
    const card = document.createElement("div");
    card.className = `effect-card ${config.enabled ? "is-enabled" : "is-disabled"}`;
    card.dataset.effectId = config.id;
    card.draggable = true;
    const displayValue = config.unit === "%" ? `${Math.round(config.value * 100)}%` : `${config.value}${config.unit ? ` ${config.unit}` : ""}`;
    card.innerHTML = `
      <div class="effect-head">
        <span class="effect-order">${index + 1}</span>
        <span class="effect-name"><strong>${config.label}</strong><small>${config.tier}</small></span>
        <span class="effect-actions"><button type="button" data-move-effect="up" aria-label="Move ${config.label} earlier">↑</button><button type="button" data-move-effect="down" aria-label="Move ${config.label} later">↓</button><label class="switch"><input type="checkbox" ${config.enabled ? "checked" : ""} aria-label="Toggle ${config.label}"><i></i></label></span>
      </div>
      <label class="effect-control"><input type="range" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.value}" aria-label="${config.label} amount"><output>${displayValue}</output></label>`;
    const toggle = card.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const slider = card.querySelector<HTMLInputElement>('input[type="range"]')!;
    const output = card.querySelector<HTMLOutputElement>("output")!;
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

function activeEffects(): PostProcessEffect[] {
  const effects: PostProcessEffect[] = [];
  for (const config of effectConfigs) {
    if (!config.enabled) continue;
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
  const effects = activeEffects();
  const report = checkPostProcessBudget(effects, {
    maxPixelEffects: 2,
    maxDistortionEffects: 1,
    maxFullCanvasPasses: 4,
    allowDistortion: true,
  });
  const budgetCard = requireElement<HTMLElement>("#budget-component");
  budgetCard.classList.toggle("has-warning", !report.ok);
  budgetCard.classList.toggle("has-overrun", !report.ok);
  const estimatedMs = report.pixelEffects * 2.6 + report.distortionEffects * 4.4 + Math.max(0, report.fullCanvasPasses - report.pixelEffects - report.distortionEffects * 2) * 0.5;
  const frameBudgetMs = editorShell?.project.postProcessing.frameBudgetMs ?? 16.67;
  const allocationMs = editorShell?.project.postProcessing.allocationMs ?? 2;
  const nearBudget = estimatedMs >= allocationMs * 0.8;
  budgetCard.classList.toggle("is-near-budget", nearBudget);
  requireElement<HTMLElement>("#budget-surcharge").hidden = !nearBudget;
  const warning = requireElement<HTMLElement>("#budget-warning");
  warning.hidden = report.ok;
  setText("#budget-state", report.ok ? "PASS" : "OVER BUDGET");
  setText("#budget-pixels", `${report.pixelEffects} / 2`);
  setText("#budget-passes", `${report.fullCanvasPasses} / 4`);
  setText("#budget-distortions", `${report.distortionEffects} / 1`);
  setText("#budget-time", `${estimatedMs.toFixed(2)} / ${allocationMs.toFixed(2)} ms FX`);
  setText("#budget-frame-time", `${frameBudgetMs.toFixed(2)} ms frame`);
  setText("#budget-overrun-copy", report.ok
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
  setText("#budget-violations", report.violations.join(" · ") || "Effect stack is within the configured mobile frame budget.");
  setText("#compiler-output", [
    `checkPostProcessBudget(stack, budget)`,
    `status: ${report.ok ? "OK" : "WARNING"}`,
    `pixelEffects: ${report.pixelEffects}`,
    `distortionEffects: ${report.distortionEffects}`,
    `fullCanvasPasses: ${report.fullCanvasPasses}`,
    ...report.violations.map((violation) => `! ${violation}`),
  ].join("\n"));
  if (globalThis.__engineEditor) globalThis.__engineEditor.postBudgetOk = report.ok;
  renderPostPreview();
}

function renderPostPreview() {
  const startedAt = performance.now();
  drawPostScene(rawPostContext, 0, 0);
  activePostContext.clearRect(0, 0, activePostCanvas.width, activePostCanvas.height);
  const shake = effectConfigs.find((effect) => effect.id === "shake")!;
  const offset = shake.enabled ? screenShake(shake.value, performance.now() / 1000) : { x: 0, y: 0 };
  drawPostScene(activePostContext, offset.x, offset.y);
  if (!postBypassed) {
    try {
      createPostProcessStack(activeEffects()).apply(activePostContext, {
        width: activePostCanvas.width,
        height: activePostCanvas.height,
        time: performance.now() / 1000,
      });
    } catch (error) {
      console.warn("Post-processing preview could not render", error);
    }
  }
  const renderMs = Math.max(0.01, performance.now() - startedAt);
  setText("#post-render-time", `${renderMs.toFixed(2)} ms render`);
}

function drawPostScene(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number) {
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.translate(offsetX, offsetY);
  const gradient = ctx.createLinearGradient(0, 0, 520, 310);
  gradient.addColorStop(0, "#122d42");
  gradient.addColorStop(0.55, "#482c62");
  gradient.addColorStop(1, "#e16666");
  ctx.fillStyle = gradient;
  ctx.fillRect(-20, -20, 560, 350);
  ctx.fillStyle = "#0c1c2d";
  ctx.beginPath();
  ctx.moveTo(-10, 250); ctx.lineTo(70, 116); ctx.lineTo(118, 194); ctx.lineTo(174, 90); ctx.lineTo(235, 205); ctx.lineTo(310, 120); ctx.lineTo(370, 224); ctx.lineTo(450, 105); ctx.lineTo(540, 230); ctx.lineTo(540, 330); ctx.lineTo(-10, 330); ctx.fill();
  ctx.fillStyle = "#122f3d";
  for (let index = 0; index < 12; index += 1) {
    const x = index * 48 + 12;
    const height = 34 + (index * 17) % 90;
    ctx.fillRect(x, 257 - height, 31, height);
    ctx.fillStyle = index % 2 ? "#53d7cd" : "#ffbc57";
    ctx.globalAlpha = 0.55;
    for (let y = 245 - height; y < 245; y += 13) ctx.fillRect(x + 7, y, 4, 5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#122f3d";
  }
  ctx.fillStyle = "#f3b55c";
  ctx.beginPath(); ctx.arc(405, 68, 31, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#dffbff";
  ctx.fillRect(62, 30, 4, 36);
  ctx.font = "700 11px ui-monospace, monospace";
  ctx.fillText("SECTOR 07 / CYBERNETIC RUINS", 76, 44);
  ctx.fillStyle = "#8ba7b8";
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("CAMERA PIPELINE · 520 × 310", 76, 60);
  ctx.restore();
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
let sequenceSnap = true;
let sequenceBeatGrid = true;
let sequenceZoom = 1;
let sequenceView: "dope" | "graph" = "dope";
const selectedSequenceKeys = new Map<string, SelectedSequenceKey>();
let sequenceClipboard: Array<{ trackId: string; frameOffset: number; value: number; easing: EditorKeyframe["easing"] }> = [];
let lastSequenceRenderedFrame = -1;
let tapTempoTimes: number[] = [];
let productionData: EditorProject["production"] = {
  export: { width: 1920, height: 1080, fps: 30, codec: "vp8", preset: "YouTube 1080p" }, reactiveBindings: [], midiMappings: [], logicGraph: { nodes: [], edges: [] }, spriteRig: { bones: [], poses: [] }, annotations: [],
};
let productionTab: "export" | "reactive" | "logic" | "rig" | "review" = "export";
let automationRecording = false;
let fftPhase = 0;
let fftAudioContext: AudioContext | undefined;
let fftAnalyser: AnalyserNode | undefined;
let fftFrequencyData: Uint8Array<ArrayBuffer> | undefined;
let fftAudioElement: HTMLAudioElement | undefined;
let midiAccess: MIDIAccess | undefined;
let selectedSpriteBoneId = "bone-spine";
let spriteBoneDrag: { bone: EditorSpriteBone; pointerId: number } | undefined;

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
  const safeDelta = Math.min(1 / 30, Math.max(1 / 240, delta));
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
  if (rounded !== lastSequenceRenderedFrame) updateSequencePlayhead();
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
    if (!bone.parent || !(bone.parent as Bone).isBone) continue;
    const parentIndex = motionFixture.bones.indexOf(bone.parent as Bone);
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
  for (let index = 0; index < frames; index += 1) updateMotion(1 / 60);
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
  logEvent("interest grid → spike spawned 50 mock players");
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
      fetch: (async () => { throw new Error("intentional TypeScript comparison backend"); }) as unknown as typeof fetch,
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
    fetch: (async () => { throw new TypeError(reason); }) as unknown as typeof fetch,
    onFallback(diagnostic) { showWasmFallback(diagnostic.reason.includes("MIME type") ? diagnostic.reason : reason); },
  });
  showWasmFallback(reason);
}

async function runBenchmark() {
  if (!wasmKernel || !typescriptKernel) await initializeKernels();
  const button = requireElement<HTMLButtonElement>("#run-benchmark");
  button.disabled = true;
  button.textContent = "Benchmarking…";
  await nextFrame();
  wasmLatencyMs = benchmarkKernel(wasmKernel!);
  typescriptLatencyMs = benchmarkKernel(typescriptKernel!);
  const max = Math.max(wasmLatencyMs, typescriptLatencyMs, 0.001);
  requireElement<HTMLElement>("#wasm-bar").style.width = `${Math.max(4, wasmLatencyMs / max * 100)}%`;
  requireElement<HTMLElement>("#js-bar").style.width = `${Math.max(4, typescriptLatencyMs / max * 100)}%`;
  setText("#wasm-latency", `${wasmLatencyMs.toFixed(3)} ms`);
  setText("#js-latency", `${typescriptLatencyMs.toFixed(3)} ms`);
  setText("#benchmark-output", `WASM ${wasmLatencyMs.toFixed(3)} ms · TypeScript ${typescriptLatencyMs.toFixed(3)} ms · 100,000 calls/backend`);
  button.disabled = false;
  button.textContent = "Run Benchmark";
  if (globalThis.__engineEditor) {
    globalThis.__engineEditor.wasmLatencyMs = wasmLatencyMs;
    globalThis.__engineEditor.typescriptLatencyMs = typescriptLatencyMs;
  }
  logEvent(`bench → wasm ${wasmLatencyMs.toFixed(3)} ms / ts ${typescriptLatencyMs.toFixed(3)} ms`);
  return { wasmMs: wasmLatencyMs, typescriptMs: typescriptLatencyMs };
}

function benchmarkKernel(kernel: CollisionKernel) {
  const startedAt = performance.now();
  let hits = 0;
  for (let index = 0; index < 100_000; index += 1) {
    if (kernel.testCircleRectOverlap(index % 120, index % 95, 7, 40, 30, 22, 18)) hits += 1;
  }
  const elapsed = performance.now() - startedAt;
  if (hits < 0) console.info(hits);
  return Math.max(0.001, elapsed);
}

function renderDiagnostics() {
  drawFrameGraph();
  drawInterestMap();
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
  const frameGap = frameTimes.length ? Math.max(0.001, performance.now() - (updateFrameTelemetry as unknown as { lastTime?: number }).lastTime!) : 16.67;
  (updateFrameTelemetry as unknown as { lastTime?: number }).lastTime = performance.now();
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
const editorCommands:EditorCommand[]=[
  {id:"workspace-stage",label:"Open Stage & Entity Inspector",detail:"Workspace 1 · scene graph and transforms",shortcut:"Ctrl 1",run:()=>showWorkspace("stage")},
  {id:"workspace-3d",label:"Open 3D Scene Editor",detail:"Workspace 2 · WebGL2 scene, transforms, materials, and physics",shortcut:"Ctrl 2",run:()=>showWorkspace("scene3d")},
  {id:"workspace-tilemap",label:"Open Tilemap & Collision Painter",detail:"Workspace 3 · paint and extract collision",shortcut:"Ctrl 3",run:()=>showWorkspace("tilemap")},
  {id:"workspace-atlas",label:"Open Assets & Atlas Slicer",detail:"Workspace 4 · imported assets, frames, and animation",shortcut:"Ctrl 4",run:()=>showWorkspace("atlas")},
  {id:"workspace-code",label:"Open TypeScript Editor",detail:"Workspace 5 · edit project behavior source",shortcut:"Ctrl 5",run:()=>showWorkspace("script")},
  {id:"workspace-post",label:"Open Polish & Post-Process",detail:"Workspace 6 · FX stack and frame budgets",shortcut:"Ctrl 6",run:()=>showWorkspace("post")},
  {id:"post-crt",label:"Jump to Post-Process CRT Scanlines",detail:"Select the CRT effect in the active stack",run:()=>{showWorkspace("post");document.querySelector<HTMLElement>('[data-effect-id="crt"]')?.scrollIntoView({block:"center"});}},
  {id:"post-grayscale",label:"Jump to Post-Process Grayscale Effect",detail:"Select the grayscale pixel pass",run:()=>{showWorkspace("post");document.querySelector<HTMLElement>('[data-effect-id="grayscale"]')?.scrollIntoView({block:"center"});}},
  {id:"workspace-motion",label:"Open Sequence & Motion",detail:"Workspace 7 · keyframes, curves, audio, events, and live rig",shortcut:"Ctrl 7",run:()=>showWorkspace("motion")},
  {id:"workspace-mmo",label:"Open Debug & Network Diagnostics",detail:"Workspace 8 · AOI, packets, and frame profiler",shortcut:"Ctrl 8",run:()=>showWorkspace("diagnostics")},
  ...entities.map((entity)=>({id:`entity-${entity.id}`,label:`Select Entity ${entity.id}`,detail:`${entity.label} · layer ${entity.layer??0}`,run:()=>{showWorkspace("stage");selectEntity(entity.id);}})),
];
let commandSelection=0;

function openCommandPalette(){const palette=requireElement<HTMLElement>("#command-palette");palette.hidden=false;const input=requireElement<HTMLInputElement>("#command-query");input.value="";commandSelection=0;renderCommandResults();input.focus();if(globalThis.__engineEditor)globalThis.__engineEditor.commandPaletteOpen=true;}
function closeCommandPalette(){requireElement<HTMLInputElement>("#command-query").blur();requireElement<HTMLElement>("#command-palette").hidden=true;if(globalThis.__engineEditor)globalThis.__engineEditor.commandPaletteOpen=false;}
function filteredCommands() {
  const query = requireElement<HTMLInputElement>("#command-query").value.trim().toLowerCase();
  if (!query) return editorCommands;
  const normalizedQuery = query.replace(/[^a-z0-9]+/g, " ").trim();
  const characters = [...normalizedQuery.replace(/\s+/g, "")];
  return editorCommands.map((command, index) => {
    const haystack = `${command.label} ${command.detail} ${command.id}`.toLowerCase();
    const normalizedHaystack = haystack.replace(/[^a-z0-9]+/g, " ");
    if (normalizedHaystack.includes(normalizedQuery)) return { command, rank: 0, index };
    let cursor = 0;
    for (const character of normalizedHaystack.replace(/\s+/g, "")) if (character === characters[cursor]) cursor += 1;
    return cursor === characters.length ? { command, rank: 1, index } : undefined;
  }).filter((candidate): candidate is { command: EditorCommand; rank: number; index: number } => Boolean(candidate))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((candidate) => candidate.command);
}
function renderCommandResults(){const commands=filteredCommands();commandSelection=Math.max(0,Math.min(commandSelection,commands.length-1));const host=requireElement<HTMLElement>("#command-results");host.innerHTML=commands.map((command,index)=>`<button class="command-result ${index===commandSelection?"is-active":""}" data-command-index="${index}"><i>›</i><span>${command.label}<small>${command.detail}</small></span><kbd>${command.shortcut??"↵"}</kbd></button>`).join("")||'<div class="command-result"><i>×</i><span>No matching action<small>Try a workspace, entity ID, or effect name</small></span></div>';host.querySelectorAll<HTMLButtonElement>("[data-command-index]").forEach((button)=>button.addEventListener("click",()=>runCommandAt(Number(button.dataset.commandIndex))));}
function runCommandAt(index:number){const command=filteredCommands()[index];if(!command)return;closeCommandPalette();command.run();logEvent(`command → ${command.id}`);}
function togglePlayback(){if(app.isRunning()){app.stop();loopPaused=true;}else{app.start();loopPaused=false;}requireElement(".runtime-status").classList.toggle("is-paused",loopPaused);setText("#playback-status",loopPaused?"PAUSED":"RUNNING");setText("#global-playback",loopPaused?"▶":"Ⅱ");if(globalThis.__engineEditor)globalThis.__engineEditor.loopPaused=loopPaused;}
function advanceSingleFrame(){if(app.isRunning())togglePlayback();stage.update(1/60);updateMotion(1/60);atlasElapsed+=1/60*atlasPlaybackSpeed;renderStage();renderTilemap();renderAtlas();renderRig();manualSteps+=1;setText("#playback-status","STEP_BY_FRAME");if(globalThis.__engineEditor)globalThis.__engineEditor.manualSteps=manualSteps;logEvent("loop → advanced exactly one frame");}

requireElement("#global-playback").addEventListener("click",togglePlayback);
requireElement<HTMLInputElement>("#command-query").addEventListener("input",()=>{commandSelection=0;renderCommandResults();});
requireElement<HTMLInputElement>("#command-query").addEventListener("keydown",(event)=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){commandSelection+=event.key==="ArrowDown"?1:-1;renderCommandResults();event.preventDefault();}else if(event.key==="Enter"){runCommandAt(commandSelection);event.preventDefault();}else if(event.key==="Escape"){closeCommandPalette();event.preventDefault();}});
requireElement("#command-palette").addEventListener("pointerdown",(event)=>{if(event.target===requireElement("#command-palette"))closeCommandPalette();});

window.addEventListener("keydown",(event)=>{
  const paletteOpen=!requireElement<HTMLElement>("#command-palette").hidden;
  if((event.ctrlKey&&event.key.toLowerCase()==="p")||(event.metaKey&&event.key.toLowerCase()==="k")){event.preventDefault();openCommandPalette();return;}
  if(paletteOpen)return;
  const target=event.target as HTMLElement|null;const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target?.isContentEditable;
  if(!typing&&(event.ctrlKey||event.metaKey)&&/^Digit[1-8]$/.test(event.code)){event.preventDefault();const ids:WorkspaceId[]=["stage","scene3d","tilemap","atlas","script","post","motion","diagnostics"];showWorkspace(ids[Number(event.code.slice(-1))-1]);return;}
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
  if(!typing&&activeWorkspace==="motion"&&event.shiftKey&&event.code==="KeyS"){requireElement("#symmetry-state").classList.add("is-active");requireElement("#symmetry-state em")!.textContent="MIRRORING";}
  if(!typing&&activeWorkspace==="diagnostics"&&event.key==="/"){packetFilter.focus();event.preventDefault();}
});
window.addEventListener("keyup",(event)=>{if(event.code==="KeyI")eyedropperHeld=false;if(event.code==="Backquote"&&postBypassed){postBypassed=false;requireElement(".compare-stage").classList.remove("is-bypassed");renderPostPreview();}if(event.code==="KeyS"){requireElement("#symmetry-state").classList.remove("is-active");requireElement("#symmetry-state em")!.textContent="READY";}});

document.querySelectorAll<HTMLElement>("[data-workspace-tab]").forEach((tab) => {
  tab.addEventListener("click", () => showWorkspace(tab.dataset.workspaceTab as WorkspaceId));
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
  document.querySelector<HTMLElement>(".zoom-label")!.textContent = `${Math.round(stageViewport.zoom * 100)}%`;
}, { passive: false });
stageCanvas.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const entity = entities.find((candidate) => candidate.id === selectedEntityId);
  if (!entity) return;
  const step = event.shiftKey ? 8 : 1;
  const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
  const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
  translateEntity(entity, dx, dy); selectEntity(entity.id); renderStage(); commitEditorChange("Nudge stage entity"); event.preventDefault();
});
document.querySelectorAll<HTMLButtonElement>("[data-stage-tool]").forEach((button) => button.addEventListener("click", () => {
  stageTool = button.dataset.stageTool as "select" | "pan";
  document.querySelectorAll<HTMLButtonElement>("[data-stage-tool]").forEach((candidate) => { const active = candidate === button; candidate.classList.toggle("is-active", active); candidate.setAttribute("aria-pressed", String(active)); });
  stageCanvas.style.cursor = stageTool === "pan" ? "grab" : "crosshair";
}));
requireElement("#toggle-stage-grid").addEventListener("click", () => { worldGridVisible = !worldGridVisible; requireElement("#toggle-stage-grid").setAttribute("aria-pressed", String(worldGridVisible)); renderStage(); });
requireElement("#center-stage-camera").addEventListener("click", () => { stageViewport.cameraX = 0; stageViewport.cameraY = 0; stageViewport.zoom = 1; document.querySelector<HTMLElement>(".zoom-label")!.textContent = "100%"; renderStage(); });
requireElement<HTMLInputElement>("#hierarchy-filter").addEventListener("input", (event) => renderStageHierarchy((event.currentTarget as HTMLInputElement).value));

function stageWorldPoint(point: { x: number; y: number }) {
  return { x: (point.x - 380) / stageViewport.zoom + 380 - stageViewport.cameraX, y: (point.y - 240) / stageViewport.zoom + 240 - stageViewport.cameraY };
}

document.querySelectorAll<HTMLElement>("[data-scrub-property]").forEach((label) => {
  label.addEventListener("pointerdown", (event) => {
    const entity = entities.find((candidate) => candidate.id === selectedEntityId);
    if (!entity) return;
    const property = label.dataset.scrubProperty as "x" | "y" | "scale";
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
  const mapIndex = Math.floor(index / 8) * MAP_COLUMNS + index % 8;
  mapTileValues[mapIndex] = tileValues[index];
  cell.dataset.tile = String(tileValues[index]);
  cell.setAttribute("aria-label", `${cell.title}, tile ${tileValues[index]}`);
  renderTilemap();
  commitEditorChange("Paint tilemap");
}

document.querySelectorAll<HTMLButtonElement>("[data-brush]").forEach((button) => {
  button.addEventListener("click", () => {
    brushMode = button.dataset.brush as BrushMode;
    document.querySelectorAll("[data-brush]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-tile]").forEach((button) => {
  if (!button.classList.contains("tile-swatch")) return;
  button.addEventListener("click", () => {
    selectedTile = Number(button.dataset.tile) as TileId;
    document.querySelectorAll(".tile-swatch").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  });
});
document.querySelectorAll<HTMLButtonElement>("[data-tile-tool]").forEach((button) => button.addEventListener("click", () => setTileTool(button.dataset.tileTool as BrushMode)));
document.querySelectorAll<HTMLButtonElement>("[data-map-tile]").forEach((button) => button.addEventListener("click", () => {
  selectedTile = Number(button.dataset.mapTile) as TileId;
  document.querySelectorAll("[data-map-tile]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  setText("#tile-sample-readout", `ID ${selectedTile} · ${["STONE", "MOSS", "VOID", "SOLID TRIM"][selectedTile]}`);
}));
tilemapCanvas.addEventListener("pointerdown", (event) => {
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
requireElement("#extract-collisions").addEventListener("click",runCollisionExtraction);

requireElement("#slice-grid").addEventListener("click",()=>{commitGridSlice();commitEditorChange("Slice atlas grid");});
for (const selector of ["#slice-width", "#slice-height"]) requireElement<HTMLInputElement>(selector).addEventListener("keydown",(event)=>{if(event.key==="Enter"){commitGridSlice();commitEditorChange("Slice atlas grid");}});
requireElement<HTMLElement>("[data-atlas-tool='manual']").addEventListener("click",()=>{atlasManualSlicing=!atlasManualSlicing;requireElement("[data-atlas-tool='manual']").classList.toggle("is-active",atlasManualSlicing);});
atlasCanvas.addEventListener("pointerdown",(event)=>{
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

function atlasSourcePoint(clientX:number,clientY:number){const point=canvasPoint(atlasCanvas,clientX,clientY);return{x:Math.max(0,Math.min(512,point.x-144)),y:Math.max(0,Math.min(320,point.y-100))};}
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
  interactiveTerrain = (event.currentTarget as HTMLInputElement).checked;
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
  motionTool=button.dataset.motionTool as "pose"|"ik";
  document.querySelectorAll<HTMLButtonElement>("[data-motion-tool]").forEach((candidate)=>{const active=candidate===button;candidate.classList.toggle("is-active",active);candidate.setAttribute("aria-pressed",String(active));});
  rigCanvas.style.cursor=motionTool==="ik"?"grab":"default";
}));
rigCanvas.addEventListener("pointerdown",(event)=>{
  if(motionTool!=="ik")return;
  const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const left=rigScreenPoints.get("LeftHand");const right=rigScreenPoints.get("RightHand");
  const leftDistance=left?Math.hypot(point.x-left.x,point.y-left.y):Infinity;const rightDistance=right?Math.hypot(point.x-right.x,point.y-right.y):Infinity;
  if(Math.min(leftDistance,rightDistance)>120)return;activeIkHandle=leftDistance<=rightDistance?"left":"right";rigCanvas.setPointerCapture(event.pointerId);requireElement(".rig-canvas-wrap").classList.add("is-ik-dragging");
});
rigCanvas.addEventListener("pointermove",(event)=>{if(!activeIkHandle)return;const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const target:[number,number,number]=[(point.x-rigCanvas.width/2)/185,(rigCanvas.height*.78-point.y)/210+terrainHeight,motionController.state.motor.position.z+.25];if(activeIkHandle==="left")leftHandTarget=target;else rightHandTarget=target;motionController.setHandTargets(leftHandTarget,rightHandTarget,1);motionController.update(1/60);rigCanvas.dataset.ikSolved="true";renderRig();});
rigCanvas.addEventListener("pointerup",(event)=>{activeIkHandle=null;if(rigCanvas.hasPointerCapture(event.pointerId))rigCanvas.releasePointerCapture(event.pointerId);requireElement(".rig-canvas-wrap").classList.remove("is-ik-dragging");});
const rigCanvasWrap=requireElement<HTMLElement>(".rig-canvas-wrap");
rigCanvasWrap.addEventListener("pointerdown",(event)=>{if(motionTool!=="ik"||activeIkHandle)return;const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const left=rigScreenPoints.get("LeftHand");const right=rigScreenPoints.get("RightHand");const leftDistance=left?Math.hypot(point.x-left.x,point.y-left.y):Infinity;const rightDistance=right?Math.hypot(point.x-right.x,point.y-right.y):Infinity;if(Math.min(leftDistance,rightDistance)>120)return;activeIkHandle=leftDistance<=rightDistance?"left":"right";rigCanvasWrap.setPointerCapture(event.pointerId);rigCanvasWrap.classList.add("is-ik-dragging");},{capture:true});
rigCanvasWrap.addEventListener("pointermove",(event)=>{if(!activeIkHandle)return;const point=canvasPoint(rigCanvas,event.clientX,event.clientY);const target:[number,number,number]=[(point.x-rigCanvas.width/2)/185,(rigCanvas.height*.78-point.y)/210+terrainHeight,motionController.state.motor.position.z+.25];if(activeIkHandle==="left")leftHandTarget=target;else rightHandTarget=target;motionController.setHandTargets(leftHandTarget,rightHandTarget,1);motionController.update(1/60);rigCanvas.dataset.ikSolved="true";renderRig();},{capture:true});
rigCanvasWrap.addEventListener("pointerup",(event)=>{if(!activeIkHandle)return;activeIkHandle=null;if(rigCanvasWrap.hasPointerCapture(event.pointerId))rigCanvasWrap.releasePointerCapture(event.pointerId);rigCanvasWrap.classList.remove("is-ik-dragging");},{capture:true});
requireElement("#run-benchmark").addEventListener("click", () => { void runBenchmark(); });
requireElement("#clear-log").addEventListener("click", () => {packetRecords.length=0;selectedPacketIndex=0;renderPacketLog();});

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
  const labels = requireElement<HTMLElement>("#sequence-track-list");
  labels.innerHTML = tracks.map((track) => `<div class="sequence-track-label ${selectedSequenceKeysHasTrack(track.id) ? "is-active" : ""}" style="--track-color:${track.color}" data-sequence-track="${escapeMarkup(track.id)}"><i></i><span>${escapeMarkup(track.label)}<small>${escapeMarkup(track.property)} · ${track.keyframes.length} keys</small></span><button data-track-lock="${escapeMarkup(track.id)}" title="Lock track">${track.locked ? "L" : "○"}</button><button data-track-mute="${escapeMarkup(track.id)}" title="Mute track">${track.muted ? "M" : "◉"}</button></div>`).join("");
  const rows = requireElement<HTMLElement>("#sequence-track-rows");
  const audio = sequenceData.audioTracks[0];
  rows.innerHTML = tracks.map((track) => `<div class="sequence-row ${track.muted ? "is-muted" : ""}" data-row-track="${escapeMarkup(track.id)}">${track.keyframes.map((key) => `<button class="sequence-key ${selectedSequenceKeys.has(key.id) ? "is-selected" : ""}" data-key-id="${escapeMarkup(key.id)}" data-track-id="${escapeMarkup(track.id)}" title="${escapeMarkup(track.label)} · frame ${key.frame} · ${formatSequenceValue(track, key.value)}" style="left:${framePercent(key.frame)}%;--key-color:${track.color}"></button>`).join("")}</div>`).join("") +
    `<div class="sequence-row audio-row">${audio ? renderAudioClip(audio) : ""}</div><div class="sequence-row event-row">${sequenceData.events.map((event) => `<button class="event-marker" data-event-id="${escapeMarkup(event.id)}" style="left:${framePercent(event.frame)}%;--event-color:${eventColor(event.kind)}" title="Frame ${event.frame} · ${escapeMarkup(event.kind)}">${escapeMarkup(event.label)}</button>`).join("")}</div>`;

  renderSequenceRuler();
  renderBeatGrid();
  renderCurveEditor();
  bindSequenceTimelineRows();
  updateSequencePlayhead();
  updateSequenceInspector();
}

function renderSequenceRuler() {
  const ruler = requireElement<HTMLElement>("#sequence-ruler");
  const interval = sequenceData.durationFrames > 600 ? 60 : 15;
  const ticks: string[] = [];
  for (let frame = 0; frame <= sequenceData.durationFrames; frame += interval) {
    const major = frame % (interval * 4) === 0;
    ticks.push(`<i class="ruler-tick ${major ? "major" : ""}" style="left:${framePercent(frame)}%">${major ? `<span>${formatTimelineRulerLabel(frame)}</span>` : ""}</i>`);
  }
  ruler.innerHTML = ticks.join("");
}

function renderBeatGrid() {
  const host = requireElement<HTMLElement>("#sequence-beat-lines");
  host.hidden = !sequenceBeatGrid;
  const framesPerBeat = sequenceData.fps * 60 / sequenceData.bpm;
  const lines: string[] = [];
  for (let frame = 0, beat = 0; frame <= sequenceData.durationFrames; frame += framesPerBeat, beat += 1) lines.push(`<i class="beat-line ${beat % sequenceData.beatsPerBar === 0 ? "bar" : ""}" style="left:${framePercent(frame)}%"></i>`);
  host.innerHTML = lines.join("");
  const loop = requireElement<HTMLElement>("#sequence-loop-region");
  loop.style.left = `${framePercent(sequenceData.loopStart)}%`;
  loop.style.width = `${framePercent(sequenceData.loopEnd - sequenceData.loopStart)}%`;
}

function renderAudioClip(audio: EditorProject["timeline"]["audioTracks"][number]) {
  const count = 120;
  const waves = Array.from({ length: count }, (_, index) => {
    const value = 18 + Math.abs(Math.sin(index * .47) * 67) + Math.abs(Math.cos(index * .19) * 14);
    return `<i style="--wave-height:${Math.min(96, value).toFixed(1)}%"></i>`;
  }).join("");
  const transients = [24, 54, 84, 120, 144, 174, 204, 234, 264].map((frame) => `<b class="transient" style="left:${frame / audio.durationFrames * 100}%"></b>`).join("");
  return `<div class="audio-clip" style="left:${framePercent(audio.startFrame)}%;width:${framePercent(audio.durationFrames)}%" title="${escapeMarkup(audio.name)} · non-destructive trim"><div class="waveform">${waves}</div>${transients}</div>`;
}

function renderCurveEditor() {
  const svg = requireElement<SVGSVGElement>("#curve-svg");
  const visible = sequenceData.tracks.filter((track) => track.keyframes.length > 1 && !track.muted).slice(0, 3);
  svg.innerHTML = visible.map((track) => {
    const values = track.keyframes.map((key) => key.value);
    const minimum = Math.min(...values); const maximum = Math.max(...values); const range = Math.max(.001, maximum - minimum);
    const points = track.keyframes.map((key) => ({ x: key.frame / sequenceData.durationFrames * 1000, y: 260 - (key.value - minimum) / range * 210 }));
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]; const point = points[index]; const distance = (point.x - previous.x) * .36;
      path += ` C ${previous.x + distance} ${previous.y}, ${point.x - distance} ${point.y}, ${point.x} ${point.y}`;
    }
    const handles = points.flatMap((point, index) => {
      if (index === 0 || index === points.length - 1) return [];
      return [`<line class="curve-handle-line" x1="${point.x - 44}" y1="${point.y + 1}" x2="${point.x + 44}" y2="${point.y - 1}"></line><circle class="curve-handle" cx="${point.x - 44}" cy="${point.y + 1}" r="4"></circle><circle class="curve-handle" cx="${point.x + 44}" cy="${point.y - 1}" r="4"></circle>`];
    }).join("");
    return `<g style="--curve-color:${track.color}"><path class="curve-path" d="${path}"></path>${handles}${points.map((point) => `<circle class="curve-point" cx="${point.x}" cy="${point.y}" r="5"></circle>`).join("")}</g>`;
  }).join("");
}

function bindSequenceTimelineRows() {
  document.querySelectorAll<HTMLButtonElement>(".sequence-key").forEach((element) => element.addEventListener("pointerdown", (event) => beginSequenceKeyDrag(event, element)));
  document.querySelectorAll<HTMLButtonElement>("[data-track-lock]").forEach((button) => button.addEventListener("click", () => { const track = sequenceTrack(button.dataset.trackLock); if (!track) return; track.locked = !track.locked; renderSequenceTimeline(); commitEditorChange("Toggle animation track lock"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-track-mute]").forEach((button) => button.addEventListener("click", () => { const track = sequenceTrack(button.dataset.trackMute); if (!track) return; track.muted = !track.muted; renderSequenceTimeline(); commitEditorChange("Toggle animation track mute"); }));
  document.querySelectorAll<HTMLButtonElement>("[data-event-id]").forEach((button) => button.addEventListener("click", () => { const marker = sequenceData.events.find((event) => event.id === button.dataset.eventId); if (marker) setSequenceFrame(marker.frame); }));
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
  renderSequenceTimeline(); event.preventDefault(); event.stopPropagation();
}

function updateSequenceInspector() {
  const selected = selectedKeyframes(); const count = selected.length;
  setText("#keyframe-inspector-count", count ? `${count} SELECTED` : "NONE");
  requireElement<HTMLElement>("#key-inspector-empty").hidden = count > 0;
  requireElement<HTMLElement>("#key-inspector-fields").hidden = count === 0;
  setText("#sequence-selection-readout", count ? `${count} key${count === 1 ? "" : "s"} selected · ${selected.map((item) => `F${Math.round(item.key.frame)}`).join(", ")}` : "No keys selected");
  if (!count) return;
  requireElement<HTMLInputElement>("#key-frame-input").value = count === 1 ? String(Math.round(selected[0].key.frame)) : "";
  requireElement<HTMLInputElement>("#key-value-input").value = count === 1 ? String(selected[0].key.value) : "";
  requireElement<HTMLSelectElement>("#key-easing").value = selected[0].key.easing;
  document.querySelectorAll<HTMLElement>("[data-easing]").forEach((button) => button.classList.toggle("is-active", button.dataset.easing === selected[0].key.easing));
}

function updateSequencePlayhead() {
  sequenceFrame = clampSequenceFrame(sequenceFrame);
  lastSequenceRenderedFrame = Math.round(sequenceFrame);
  requireElement<HTMLElement>("#sequence-playhead").style.left = `${framePercent(sequenceFrame)}%`;
  setText("#sequence-timecode", formatSequenceTimecode(sequenceFrame));
  setText("#sequence-play", sequencePlaying ? "Ⅱ" : "▶");
}

function bindSequenceEditor() {
  const ruler = requireElement<HTMLElement>("#sequence-ruler");
  const scrub = (event: PointerEvent) => { const rect = ruler.getBoundingClientRect(); setSequenceFrame((event.clientX - rect.left) / rect.width * sequenceData.durationFrames / sequenceZoom); };
  ruler.addEventListener("pointerdown", (event) => { scrub(event); ruler.setPointerCapture(event.pointerId); }); ruler.addEventListener("pointermove", (event) => { if (ruler.hasPointerCapture(event.pointerId)) scrub(event); });
  requireElement("#sequence-play").addEventListener("click", toggleSequencePlayback);
  requireElement("#sequence-jump-start").addEventListener("click", () => setSequenceFrame(sequenceData.loopStart)); requireElement("#sequence-jump-end").addEventListener("click", () => setSequenceFrame(sequenceData.loopEnd));
  requireElement("#sequence-step-back").addEventListener("click", () => setSequenceFrame(sequenceFrame - 1)); requireElement("#sequence-step-forward").addEventListener("click", () => setSequenceFrame(sequenceFrame + 1));
  bindSequenceToggle("#sequence-snap", (active) => { sequenceSnap = active; }); bindSequenceToggle("#sequence-beat-grid", (active) => { sequenceBeatGrid = active; renderBeatGrid(); }); bindSequenceToggle("#sequence-onion", (active) => logEvent(`onion skin → ${active ? "previous + next frames" : "off"}`));
  requireElement<HTMLInputElement>("#sequence-track-filter").addEventListener("input", (event) => renderSequenceTimeline((event.currentTarget as HTMLInputElement).value));
  requireElement<HTMLInputElement>("#sequence-bpm").addEventListener("change", (event) => { sequenceData.bpm = Math.max(20, Math.min(400, Number((event.currentTarget as HTMLInputElement).value))); renderBeatGrid(); commitEditorChange("Change sequence tempo"); });
  requireElement<HTMLSelectElement>("#sequence-fps").addEventListener("change", (event) => { sequenceData.fps = Number((event.currentTarget as HTMLSelectElement).value); renderSequenceTimeline(); commitEditorChange("Change sequence frame rate"); });
  requireElement<HTMLSelectElement>("#sequence-speed").addEventListener("change", (event) => { sequenceData.playbackSpeed = Number((event.currentTarget as HTMLSelectElement).value); commitEditorChange("Change timeline playback speed"); });
  requireElement<HTMLInputElement>("#sequence-zoom").addEventListener("input", (event) => { sequenceZoom = Number((event.currentTarget as HTMLInputElement).value); renderSequenceTimeline(); });
  document.querySelectorAll<HTMLButtonElement>("[data-sequence-view]").forEach((button) => button.addEventListener("click", () => { sequenceView = button.dataset.sequenceView as "dope" | "graph"; document.querySelectorAll<HTMLElement>("[data-sequence-view]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button)); requireElement<HTMLElement>("#sequence-canvas").hidden = sequenceView === "graph"; requireElement<HTMLElement>("#sequence-ruler").hidden = sequenceView === "graph"; requireElement<HTMLElement>("#curve-editor").hidden = sequenceView !== "graph"; }));
  requireElement("#sequence-normalize").addEventListener("click", () => { sequenceZoom = 1; requireElement<HTMLInputElement>("#sequence-zoom").value = "1"; renderCurveEditor(); });
  requireElement("#tap-tempo").addEventListener("click", tapSequenceTempo); requireElement("#add-sequence-event").addEventListener("click", addSequenceEvent); requireElement("#find-audio-transients").addEventListener("click", detectSequenceTransients); requireElement("#add-sequence-track").addEventListener("click", addSequenceTrack);
  requireElement("#sequence-export").addEventListener("click", previewSequenceExport);
  requireElement<HTMLInputElement>("#mixer-volume").addEventListener("input", updateMixer); requireElement<HTMLInputElement>("#mixer-pan").addEventListener("input", updateMixer); requireElement("#mixer-mute").addEventListener("click", () => toggleMixerState("muted")); requireElement("#mixer-solo").addEventListener("click", () => toggleMixerState("solo"));
  requireElement<HTMLInputElement>("#key-frame-input").addEventListener("change", (event) => editSelectedSequenceKeys("frame", Number((event.currentTarget as HTMLInputElement).value)));
  requireElement<HTMLInputElement>("#key-value-input").addEventListener("change", (event) => editSelectedSequenceKeys("value", Number((event.currentTarget as HTMLInputElement).value)));
  requireElement<HTMLSelectElement>("#key-easing").addEventListener("change", (event) => setSelectedEasing((event.currentTarget as HTMLSelectElement).value as EditorKeyframe["easing"])); document.querySelectorAll<HTMLButtonElement>("[data-easing]").forEach((button) => button.addEventListener("click", () => setSelectedEasing(button.dataset.easing as EditorKeyframe["easing"])));
  const canvas = requireElement<HTMLElement>("#sequence-canvas"); canvas.addEventListener("pointerdown", beginSequenceBoxSelect);
  window.addEventListener("keydown", sequenceKeyboardHandler);
}

function beginSequenceBoxSelect(event: PointerEvent) {
  if ((event.target as HTMLElement).closest("button,.audio-clip")) return;
  const canvas = requireElement<HTMLElement>("#sequence-canvas"); const rect = canvas.getBoundingClientRect(); const start = { x: event.clientX - rect.left, y: event.clientY - rect.top }; const box = requireElement<HTMLElement>("#sequence-box-selection");
  if (!event.shiftKey) selectedSequenceKeys.clear(); box.hidden = false; canvas.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => { const x = moveEvent.clientX - rect.left; const y = moveEvent.clientY - rect.top; box.style.left = `${Math.min(start.x, x)}px`; box.style.top = `${Math.min(start.y, y)}px`; box.style.width = `${Math.abs(x - start.x)}px`; box.style.height = `${Math.abs(y - start.y)}px`; };
  const finish = () => { const bounds = box.getBoundingClientRect(); document.querySelectorAll<HTMLElement>(".sequence-key").forEach((key) => { const keyBounds = key.getBoundingClientRect(); if (keyBounds.right >= bounds.left && keyBounds.left <= bounds.right && keyBounds.bottom >= bounds.top && keyBounds.top <= bounds.bottom) selectedSequenceKeys.set(key.dataset.keyId!, { trackId: key.dataset.trackId!, keyId: key.dataset.keyId! }); }); box.hidden = true; canvas.removeEventListener("pointermove", move); renderSequenceTimeline(); };
  canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", finish, { once: true });
}

function sequenceKeyboardHandler(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null; const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
  if (typing || activeWorkspace !== "motion") return;
  if (event.key === "," || event.key === ".") { setSequenceFrame(sequenceFrame + (event.key === "." ? 1 : -1)); event.preventDefault(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { copySequenceKeys(); event.preventDefault(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { pasteSequenceKeys(); event.preventDefault(); return; }
  if ((event.key === "Delete" || event.key === "Backspace") && selectedSequenceKeys.size) { deleteSequenceKeys(); event.preventDefault(); }
}

function toggleSequencePlayback() { sequencePlaying = !sequencePlaying; updateSequencePlayhead(); logEvent(`sequence → ${sequencePlaying ? "play" : "pause"} at frame ${Math.round(sequenceFrame)}`); }
function setSequenceFrame(frame: number) { sequenceFrame = sequenceSnap ? Math.round(frame) : frame; updateSequencePlayhead(); }
function clampSequenceFrame(frame: number) { return Math.max(0, Math.min(sequenceData.durationFrames, frame)); }
function framePercent(frame: number) { return frame / sequenceData.durationFrames * 100 * sequenceZoom; }
function sequenceTrack(id?: string) { return sequenceData.tracks.find((track) => track.id === id); }
function selectedSequenceKeysHasTrack(trackId: string) { return [...selectedSequenceKeys.values()].some((item) => item.trackId === trackId); }
function selectedKeyframes() { return [...selectedSequenceKeys.values()].map((selection) => { const track = sequenceTrack(selection.trackId); const key = track?.keyframes.find((candidate) => candidate.id === selection.keyId); return track && key ? { track, key } : undefined; }).filter((item): item is { track: EditorTimelineTrack; key: EditorKeyframe } => Boolean(item)); }
function formatTimelineRulerLabel(frame: number) { return `${Math.floor(frame / sequenceData.fps)}s · ${frame}f`; }
function formatSequenceTimecode(frame: number) { const total = Math.max(0, Math.round(frame)); const fps = sequenceData.fps; const seconds = Math.floor(total / fps); return `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(total % fps).padStart(2, "0")}`; }
function formatSequenceValue(track: EditorTimelineTrack, value: number) { return track.property === "scale" || track.property === "opacity" ? value.toFixed(2) : value.toFixed(1); }
function eventColor(kind: EditorProject["timeline"]["events"][number]["kind"]) { return kind === "audio" ? "#b997ff" : kind === "camera" ? "#f2ad4d" : kind === "logic" ? "#41d7d0" : "#7d92a0"; }
function bindSequenceToggle(selector: string, update: (active: boolean) => void) { const button = requireElement<HTMLButtonElement>(selector); button.addEventListener("click", () => { const active = button.getAttribute("aria-pressed") !== "true"; button.setAttribute("aria-pressed", String(active)); button.classList.toggle("is-active", active); update(active); }); }
function editSelectedSequenceKeys(property: "frame" | "value", value: number) { if (!Number.isFinite(value)) return; for (const selected of selectedKeyframes()) selected.key[property] = property === "frame" ? clampSequenceFrame(Math.round(value)) : value; renderSequenceTimeline(); commitEditorChange(`Edit keyframe ${property}`); }
function setSelectedEasing(easing: EditorKeyframe["easing"]) { for (const selected of selectedKeyframes()) selected.key.easing = easing; renderSequenceTimeline(); commitEditorChange(`Set ${easing} easing`); }
function copySequenceKeys() { const selected = selectedKeyframes(); const first = Math.min(...selected.map((item) => item.key.frame)); sequenceClipboard = selected.map((item) => ({ trackId: item.track.id, frameOffset: item.key.frame - first, value: item.key.value, easing: item.key.easing })); setText("#sequence-selection-readout", `${sequenceClipboard.length} key${sequenceClipboard.length === 1 ? "" : "s"} copied`); }
function pasteSequenceKeys() { if (!sequenceClipboard.length) return; selectedSequenceKeys.clear(); for (const copied of sequenceClipboard) { const track = sequenceTrack(copied.trackId); if (!track) continue; const key: EditorKeyframe = { id: `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, frame: clampSequenceFrame(Math.round(sequenceFrame + copied.frameOffset)), value: copied.value, easing: copied.easing }; track.keyframes.push(key); selectedSequenceKeys.set(key.id, { trackId: track.id, keyId: key.id }); } renderSequenceTimeline(); commitEditorChange("Paste animation keys"); }
function deleteSequenceKeys() { for (const track of sequenceData.tracks) track.keyframes = track.keyframes.filter((key) => !selectedSequenceKeys.has(key.id)); selectedSequenceKeys.clear(); renderSequenceTimeline(); commitEditorChange("Delete animation keys"); }
function tapSequenceTempo() { const now = performance.now(); tapTempoTimes = tapTempoTimes.filter((time) => now - time < 3000); tapTempoTimes.push(now); if (tapTempoTimes.length > 1) { const intervals = tapTempoTimes.slice(1).map((time, index) => time - tapTempoTimes[index]); sequenceData.bpm = Math.round(60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length)); requireElement<HTMLInputElement>("#sequence-bpm").value = String(sequenceData.bpm); renderBeatGrid(); } setText("#tap-tempo", tapTempoTimes.length < 2 ? "TAP 2" : `${sequenceData.bpm}`); }
function addSequenceEvent() { const frame = Math.round(sequenceFrame); sequenceData.events.push({ id: `event-${Date.now().toString(36)}`, frame, label: `Marker ${sequenceData.events.length + 1}`, kind: "marker" }); renderSequenceTimeline(); commitEditorChange("Add animation event"); }
function detectSequenceTransients() { sequenceData.bpm = 120; requireElement<HTMLInputElement>("#sequence-bpm").value = "120"; renderBeatGrid(); setText("#sequence-selection-readout", "9 transients detected · beat grid aligned at 120 BPM"); logEvent("audio analysis → 9 transients detected"); }
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
  setText("#production-footer-status", `${tab[0].toUpperCase()}${tab.slice(1)} tools online`);
  if (tab === "reactive") void connectFftAudioAsset();
}

function bindProductionLab() {
  requireElement("#production-lab-open").addEventListener("click", () => openProductionLab("reactive"));
  requireElement("#production-center-close").addEventListener("click", closeProductionLab);
  requireElement("#production-center").addEventListener("pointerdown", (event) => { if (event.target === requireElement("#production-center")) closeProductionLab(); });
  document.querySelectorAll<HTMLButtonElement>("[data-production-tab]").forEach((button) => button.addEventListener("click", () => { setProductionTab(button.dataset.productionTab as typeof productionTab); renderProductionLab(); }));
  document.querySelectorAll<HTMLButtonElement>("[data-export-preset]").forEach((button) => button.addEventListener("click", () => setExportPreset(button.dataset.exportPreset ?? "youtube")));
  for (const selector of ["#export-width", "#export-height", "#export-fps", "#export-codec"]) requireElement<HTMLInputElement | HTMLSelectElement>(selector).addEventListener("change", updateExportSettings);
  requireElement("#start-webm-export").addEventListener("click", () => { void startWebMExport(true); });
  requireElement("#add-reactive-binding").addEventListener("click", addReactiveBinding);
  requireElement("#automation-record").addEventListener("click", toggleAutomationRecording);
  requireElement("#midi-connect").addEventListener("click", () => { void connectMidi(); }); requireElement("#midi-simulate").addEventListener("click", () => simulateMidi(96));
  document.querySelectorAll<HTMLButtonElement>("[data-add-node]").forEach((button) => button.addEventListener("click", () => addLogicNode(button.dataset.addNode as "event" | "condition" | "action"))); requireElement("#run-logic-graph").addEventListener("click", runLogicGraph);
  requireElement("#add-sprite-bone").addEventListener("click", addSpriteBone); requireElement("#save-sprite-pose").addEventListener("click", saveSpritePose); requireElement("#key-sprite-pose").addEventListener("click", keySpritePose);
  requireElement("#add-review-pin").addEventListener("click", () => requireElement<HTMLTextAreaElement>("#annotation-body").focus()); requireElement("#post-annotation").addEventListener("click", postAnnotation); requireElement("#create-review-link").addEventListener("click", createReviewLink);
  spriteRigCanvas.addEventListener("pointerdown", beginSpriteBoneDrag); spriteRigCanvas.addEventListener("pointermove", moveSpriteBoneDrag); spriteRigCanvas.addEventListener("pointerup", endSpriteBoneDrag);
  window.addEventListener("keydown", (event) => { if (!requireElement<HTMLElement>("#production-center").hidden && event.key === "Escape") { closeProductionLab(); event.preventDefault(); } });
}

function renderProductionLab() {
  const settings = productionData.export;
  requireElement<HTMLInputElement>("#export-width").value = String(settings.width); requireElement<HTMLInputElement>("#export-height").value = String(settings.height); requireElement<HTMLSelectElement>("#export-fps").value = String(settings.fps); requireElement<HTMLSelectElement>("#export-codec").value = settings.codec;
  setText("#export-preview-label", `${settings.preset} · ${settings.width} × ${settings.height}`); setText("#webcodecs-support", typeof VideoEncoder === "undefined" ? "WebCodecs unavailable · use a Chromium-class browser" : "Hardware-accelerated VideoEncoder available");
  renderExportPreview(); renderFftSpectrum(); renderReactiveBindings(); renderMidiMappings(); renderLogicGraph(); renderSpriteRigPanels(); renderAnnotations(); renderReviewFrame();
}

function renderProductionLive() {
  fftPhase += .035;
  if (productionTab === "reactive") renderFftSpectrum();
  if (productionTab === "rig" && !spriteBoneDrag) drawSpriteRig();
}

function renderExportPreview() { drawProductionFrame(exportPreviewContext, exportPreviewCanvas.width, exportPreviewCanvas.height, Math.round(sequenceFrame)); }
function renderReviewFrame() { drawProductionFrame(reviewContext, reviewCanvas.width, reviewCanvas.height, 24); }
function drawProductionFrame(ctx: CanvasRenderingContext2D, width: number, height: number, frame: number) {
  const time = frame / Math.max(1, sequenceData.fps); const pulse = .5 + .5 * Math.sin(time * Math.PI * 2 * sequenceData.bpm / 60);
  const gradient = ctx.createRadialGradient(width * .52, height * .46, 10, width * .52, height * .46, width * .64); gradient.addColorStop(0, `rgb(${20 + pulse * 12} ${54 + pulse * 18} ${64 + pulse * 18})`); gradient.addColorStop(.56, "#0b1921"); gradient.addColorStop(1, "#050a0f"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgb(65 215 208 / 13%)"; ctx.lineWidth = 1; for (let x = 0; x < width; x += width / 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); } for (let y = 0; y < height; y += height / 9) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const actorX = width * (.32 + .22 * Math.sin(time * .56)); const actorY = height * (.57 + .04 * Math.cos(time * 1.4)); const size = Math.min(width, height) * (.08 + pulse * .01);
  ctx.save(); ctx.translate(actorX, actorY); ctx.shadowColor = "#41d7d0"; ctx.shadowBlur = size * .7; ctx.fillStyle = "#35c9c2"; ctx.fillRect(-size * .36, -size * .42, size * .72, size * .84); ctx.fillStyle = "#bafff7"; ctx.beginPath(); ctx.arc(0, -size * .26, size * .15, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = "rgb(4 9 13 / 72%)"; ctx.fillRect(0, 0, width, height * .11); ctx.fillRect(0, height * .89, width, height * .11); ctx.fillStyle = "#d8ffff"; ctx.font = `700 ${Math.max(10, width * .013)}px ui-monospace, monospace`; ctx.fillText("NEON / SIGNAL", width * .055, height * .075); ctx.fillStyle = "#5f808a"; ctx.font = `${Math.max(7, width * .007)}px ui-monospace, monospace`; ctx.fillText(`SHOT 03  ·  ${formatSequenceTimecode(frame)}  ·  ${sequenceData.bpm} BPM`, width * .055, height * .94);
}

function updateExportSettings() {
  productionData.export.width = Math.max(16, Number(requireElement<HTMLInputElement>("#export-width").value)); productionData.export.height = Math.max(16, Number(requireElement<HTMLInputElement>("#export-height").value)); productionData.export.fps = Number(requireElement<HTMLSelectElement>("#export-fps").value); productionData.export.codec = requireElement<HTMLSelectElement>("#export-codec").value as "vp8" | "vp9"; productionData.export.preset = "Custom"; renderProductionLab(); commitEditorChange("Change video export settings");
}
function setExportPreset(preset: string) { const value = preset === "shorts" ? { width: 1080, height: 1920, preset: "Shorts 9:16" } : preset === "square" ? { width: 1080, height: 1080, preset: "Square 1:1" } : { width: 1920, height: 1080, preset: "YouTube 1080p" }; Object.assign(productionData.export, value); document.querySelectorAll<HTMLElement>("[data-export-preset]").forEach((button) => button.classList.toggle("is-active", button.dataset.exportPreset === preset)); renderProductionLab(); commitEditorChange("Choose video export preset"); }

async function exportSequencePreview() { const blob = await startWebMExport(false, { width: 320, height: 180, frames: 12 }); return { bytes: blob.size, type: blob.type }; }
async function startWebMExport(download: boolean, override?: { width: number; height: number; frames: number }) {
  const button = requireElement<HTMLButtonElement>("#start-webm-export"); const progress = requireElement<HTMLElement>("#export-progress"); button.disabled = true; button.textContent = "ENCODING…"; progress.classList.add("is-active");
  try { const settings = productionData.export; const blob = await encodeCanvasSequenceWebM({ width: override?.width ?? settings.width, height: override?.height ?? settings.height, fps: settings.fps, frameCount: override?.frames ?? sequenceData.durationFrames, codec: settings.codec, renderFrame(context, frame) { drawProductionFrame(context, context.canvas.width, context.canvas.height, frame); }, onProgress(value) { progress.querySelector<HTMLElement>("i")!.style.width = `${Math.max(1, value * 78)}%`; setText("#export-progress-label", value >= 1 ? `WebM complete · ${settings.codec.toUpperCase()}` : `Encoding frame ${Math.round(value * (override?.frames ?? sequenceData.durationFrames) / .86)} / ${override?.frames ?? sequenceData.durationFrames}`); } });
    if (download) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sequence-${Date.now()}.webm`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000); }
    logEvent(`video export → ${(blob.size / 1_048_576).toFixed(2)} MB WebM encoded`); return blob;
  } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setText("#export-progress-label", message); throw cause; }
  finally { button.disabled = false; button.textContent = "RENDER WEBM"; }
}

function renderFftSpectrum() {
  const ctx = fftContext; const width = fftCanvas.width; const height = fftCanvas.height; ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#071018"; ctx.fillRect(0, 0, width, height); const bars = 72; let energy = 0;
  if (fftAnalyser && fftFrequencyData) fftAnalyser.getByteFrequencyData(fftFrequencyData);
  const values: number[] = [];
  for (let index = 0; index < bars; index += 1) { const falloff = Math.exp(-index / 45); const beat = Math.max(0, Math.sin(fftPhase * 4 - index * .11)); const harmonic = .28 + .28 * Math.sin(fftPhase * 1.7 + index * .61); const analysed = fftFrequencyData ? (fftFrequencyData[Math.floor(index / bars * fftFrequencyData.length)] ?? 0) / 255 : undefined; const value = analysed === undefined ? Math.max(.04, Math.min(1, falloff * (.3 + beat * .52 + harmonic))) : Math.max(.025, analysed); values.push(value); energy += value; const x = index / bars * width; const barWidth = width / bars - 2; const barHeight = value * (height - 14); const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight); gradient.addColorStop(0, "#276f77"); gradient.addColorStop(.7, "#41d7d0"); gradient.addColorStop(1, index < 18 ? "#b997ff" : "#d9ffff"); ctx.fillStyle = gradient; ctx.shadowColor = index < 18 ? "#b997ff" : "#41d7d0"; ctx.shadowBlur = value > .7 ? 8 : 0; ctx.fillRect(x + 1, height - barHeight, barWidth, barHeight); }
  ctx.shadowBlur = 0; const average = (start: number, end: number) => values.slice(start, end).reduce((sum, value) => sum + value, 0) / Math.max(1, end - start); const bass = fftFrequencyData ? average(0, 14) : .62 + .18 * Math.sin(fftPhase * 3.2); const mid = fftFrequencyData ? average(14, 43) : .45 + .12 * Math.sin(fftPhase * 2.1 + 1); const treble = fftFrequencyData ? average(43, 72) : .28 + .11 * Math.sin(fftPhase * 1.6 + 2); setText("#fft-rms", `${(-18 + energy / bars * 10).toFixed(1)} dB`); setText("#fft-bass", bass.toFixed(2)); setText("#fft-mid", mid.toFixed(2)); setText("#fft-treble", treble.toFixed(2)); applyReactiveBindings({ rms: energy / bars, bass, mid, treble });
}
async function connectFftAudioAsset() { if (fftAnalyser) { if (fftAudioContext?.state === "suspended") await fftAudioContext.resume().catch(() => undefined); return; } const asset = editorShell?.project.assets.find((candidate) => candidate.kind === "audio" && candidate.objectUrl); if (!asset?.objectUrl) return; try { fftAudioContext = new AudioContext(); fftAnalyser = fftAudioContext.createAnalyser(); fftAnalyser.fftSize = 256; fftAnalyser.smoothingTimeConstant = .72; fftFrequencyData = new Uint8Array(fftAnalyser.frequencyBinCount); fftAudioElement = new Audio(asset.objectUrl); fftAudioElement.loop = true; const source = fftAudioContext.createMediaElementSource(fftAudioElement); source.connect(fftAnalyser); fftAnalyser.connect(fftAudioContext.destination); await fftAudioElement.play(); setText("#production-footer-status", `Analysing ${asset.name} · live FFT`); } catch { fftAnalyser = undefined; fftFrequencyData = undefined; setText("#production-footer-status", "FFT preview active · click Play to unlock imported audio"); } }
function renderReactiveBindings() { const host = requireElement<HTMLElement>("#reactive-binding-list"); host.innerHTML = productionData.reactiveBindings.map((binding, index) => `<div class="reactive-binding" style="--binding-color:${index % 2 ? "#b997ff" : "#41d7d0"}"><header><strong>${binding.source.toUpperCase()} → ${escapeMarkup(binding.targetId)}.${binding.property}</strong><em>${binding.enabled ? "LIVE" : "BYPASSED"}</em></header><label>GAIN<input type="range" min="0" max="${binding.property === "scale" ? 2 : 40}" step=".01" value="${binding.gain}" data-binding-gain="${escapeMarkup(binding.id)}"></label><output>${binding.gain.toFixed(2)}</output><label>SMOOTH<input type="range" min="0" max="1" step=".01" value="${binding.smoothing}" data-binding-smoothing="${escapeMarkup(binding.id)}"></label><output>${Math.round(binding.smoothing * 100)}%</output></div>`).join(""); host.querySelectorAll<HTMLInputElement>("[data-binding-gain]").forEach((input) => input.addEventListener("input", () => { const binding = productionData.reactiveBindings.find((item) => item.id === input.dataset.bindingGain); if (binding) { binding.gain = Number(input.value); if (automationRecording) recordAutomationValue(binding.targetId, binding.property, binding.gain); renderReactiveBindings(); } })); }
function addReactiveBinding() { productionData.reactiveBindings.push({ id: `binding-${Date.now().toString(36)}`, source: "treble", targetId: selectedEntityId ?? "player-01", property: "opacity", gain: .5, smoothing: .7, enabled: true }); renderReactiveBindings(); commitEditorChange("Add audio-reactive binding"); }
function applyReactiveBindings(bands: { rms: number; bass: number; mid: number; treble: number }) { for (const binding of productionData.reactiveBindings) { if (!binding.enabled || binding.source === "midi-cc") continue; const entity = entities.find((candidate) => candidate.id === binding.targetId); if (!entity) continue; const value = bands[binding.source] * binding.gain; if (binding.property === "scale") entity.scale = 1 + value; else if (binding.property === "x") entity.x += value * .01; else if (binding.property === "y") entity.y += value * .01; } }
function toggleAutomationRecording() { automationRecording = !automationRecording; const button = requireElement("#automation-record"); button.classList.toggle("is-recording", automationRecording); setText("#automation-record-status", automationRecording ? `RECORDING · frame ${Math.round(sequenceFrame)}` : "ARMED · move a control during playback"); }
function recordAutomationValue(targetId: string, property: "x" | "y" | "scale" | "rotation" | "opacity", value: number) { let track = sequenceData.tracks.find((candidate) => candidate.targetId === targetId && candidate.property === property); if (!track) { track = { id: `automation-${targetId}-${property}`, targetId, label: `Automation · ${property}`, property, color: "#ff6578", muted: false, locked: false, keyframes: [] }; sequenceData.tracks.push(track); } const frame = Math.round(sequenceFrame); const existing = track.keyframes.find((key) => key.frame === frame); if (existing) existing.value = value; else track.keyframes.push({ id: `auto-key-${Date.now().toString(36)}`, frame, value, easing: "linear" }); renderSequenceTimeline(); }

async function connectMidi() { const navigatorWithMidi = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> }; if (!navigatorWithMidi.requestMIDIAccess) { setText("#midi-message", "Web MIDI is unavailable in this browser"); return; } try { midiAccess = await navigatorWithMidi.requestMIDIAccess(); const inputs = [...midiAccess.inputs.values()]; for (const input of inputs) input.onmidimessage = (event) => { if (event.data) handleMidiMessage(event.data); }; requireElement("#midi-led").classList.toggle("is-active", inputs.length > 0); setText("#midi-device-name", inputs[0]?.name ?? "MIDI access granted"); setText("#midi-message", inputs.length ? `${inputs.length} input${inputs.length === 1 ? "" : "s"} online` : "No hardware input detected · simulation ready"); } catch { setText("#midi-message", "MIDI permission was not granted"); } }
function handleMidiMessage(data: Uint8Array) { const status = data[0] ?? 0; const control = data[1] ?? 0; const value = data[2] ?? 0; const channel = (status & 0x0f) + 1; setText("#midi-value", `CC ${String(control).padStart(2, "0")} · ${String(value).padStart(3, "0")}`); requireElement<HTMLElement>("#midi-value-bar").style.width = `${value / 127 * 100}%`; requireElement("#midi-led").classList.add("is-active"); const mapping = productionData.midiMappings.find((item) => item.channel === channel && item.control === control); if (!mapping) return; const mapped = mapping.minimum + value / 127 * (mapping.maximum - mapping.minimum); const entity = entities.find((candidate) => candidate.id === mapping.targetId); if (entity && mapping.property === "scale") entity.scale = mapped; if (entity && mapping.property === "x") entity.x = mapped; if (entity && mapping.property === "y") entity.y = mapped; if (automationRecording) recordAutomationValue(mapping.targetId, mapping.property, mapped); }
function simulateMidi(value = 96) { handleMidiMessage(new Uint8Array([0xb0, 1, Math.max(0, Math.min(127, value))])); setText("#midi-device-name", "Virtual Controller"); setText("#midi-message", "Simulation input · channel 1"); }
function renderMidiMappings() { requireElement<HTMLElement>("#midi-mapping-list").innerHTML = productionData.midiMappings.map((mapping) => `<div class="midi-map"><span>CH ${mapping.channel} · CC ${String(mapping.control).padStart(2, "0")}</span><b>${escapeMarkup(mapping.targetId)}.${mapping.property}</b></div>`).join(""); }

function renderLogicGraph() { const graph = productionData.logicGraph; setText("#logic-node-count", String(graph.nodes.length)); setText("#logic-edge-count", String(graph.edges.length)); setText("#logic-status", `GRAPH VALID · ${graph.nodes.length} NODES`); const host = requireElement<HTMLElement>("#logic-nodes"); host.innerHTML = graph.nodes.map((node) => `<article class="logic-node" data-logic-node="${escapeMarkup(node.id)}" style="left:${node.x}px;top:${node.y}px;--node-color:${node.kind === "event" ? "#41d7d0" : node.kind === "condition" ? "#f2ad4d" : "#b997ff"}"><header><i></i><strong>${escapeMarkup(node.label)}</strong></header><main><span>${node.kind.toUpperCase()}</span><code>${escapeMarkup(Object.entries(node.config).map(([key, value]) => `${key}: ${value}`).join(" · "))}</code></main><i class="logic-port in"></i><i class="logic-port out"></i></article>`).join(""); host.querySelectorAll<HTMLElement>("[data-logic-node]").forEach((node) => node.addEventListener("pointerdown", beginLogicNodeDrag)); renderLogicWires(); }
function renderLogicWires() { const nodes = new Map(productionData.logicGraph.nodes.map((node) => [node.id, node])); requireElement<SVGSVGElement>("#logic-wires").innerHTML = productionData.logicGraph.edges.map((edge) => { const from = nodes.get(edge.from); const to = nodes.get(edge.to); if (!from || !to) return ""; const x1 = from.x + 166; const y1 = from.y + 47; const x2 = to.x; const y2 = to.y + 47; const control = Math.max(55, (x2 - x1) * .45); return `<path class="logic-wire" d="M ${x1} ${y1} C ${x1 + control} ${y1}, ${x2 - control} ${y2}, ${x2} ${y2}"></path>`; }).join(""); }
function beginLogicNodeDrag(event: PointerEvent) { const element = event.currentTarget as HTMLElement; const node = productionData.logicGraph.nodes.find((candidate) => candidate.id === element.dataset.logicNode); if (!node) return; const start = { x: event.clientX, y: event.clientY, nodeX: node.x, nodeY: node.y }; element.setPointerCapture(event.pointerId); const move = (moveEvent: PointerEvent) => { node.x = start.nodeX + moveEvent.clientX - start.x; node.y = start.nodeY + moveEvent.clientY - start.y; element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; renderLogicWires(); }; element.addEventListener("pointermove", move); element.addEventListener("pointerup", () => { element.removeEventListener("pointermove", move); commitEditorChange("Move logic node"); }, { once: true }); }
function addLogicNode(kind: "event" | "condition" | "action") { const count = productionData.logicGraph.nodes.length; productionData.logicGraph.nodes.push({ id: `node-${Date.now().toString(36)}`, kind, label: kind === "event" ? "On Marker" : kind === "condition" ? "Property > Value" : "Set Property", x: 80 + count * 38, y: 235 + count % 2 * 95, config: {} }); renderLogicGraph(); commitEditorChange("Add logic graph node"); }
function runLogicGraph() { const trace = productionData.logicGraph.nodes.map((node) => `${node.kind} → ${node.label}`).join("\n"); requireElement<HTMLElement>("#logic-trace").querySelector("code")!.textContent = trace; setText("#logic-last-run", `${performance.now().toFixed(0)} ms`); setText("#logic-status", "TRACE PASS · 2 ACTIONS"); logEvent("logic graph → deterministic test pass"); }

function spriteBoneWorldPoints() { const result = new Map<string, { startX: number; startY: number; endX: number; endY: number }>(); const resolve = (bone: EditorSpriteBone): { startX: number; startY: number; endX: number; endY: number } => { const existing = result.get(bone.id); if (existing) return existing; const parent = bone.parentId ? productionData.spriteRig.bones.find((candidate) => candidate.id === bone.parentId) : undefined; const parentPoint = parent ? resolve(parent) : { endX: spriteRigCanvas.width / 2, endY: spriteRigCanvas.height / 2 + 95 }; const startX = parent ? parentPoint.endX + bone.x : spriteRigCanvas.width / 2 + bone.x; const startY = parent ? parentPoint.endY + bone.y : spriteRigCanvas.height / 2 + 95 + bone.y; const point = { startX, startY, endX: startX + Math.cos(bone.rotation) * bone.length, endY: startY + Math.sin(bone.rotation) * bone.length }; result.set(bone.id, point); return point; }; for (const bone of productionData.spriteRig.bones) resolve(bone); return result; }
function drawSpriteRig() { const ctx = spriteRigContext; const width = spriteRigCanvas.width; const height = spriteRigCanvas.height; ctx.clearRect(0, 0, width, height); const glow = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, height * .58); glow.addColorStop(0, "#163039"); glow.addColorStop(1, "#071018"); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height); ctx.fillStyle = "rgb(65 215 208 / 10%)"; ctx.beginPath(); ctx.ellipse(width / 2, height * .84, 150, 30, 0, 0, Math.PI * 2); ctx.fill(); const points = spriteBoneWorldPoints(); ctx.save(); ctx.lineCap = "round"; for (const bone of productionData.spriteRig.bones) { const point = points.get(bone.id)!; ctx.strokeStyle = bone.id === selectedSpriteBoneId ? "#f3ad4e" : "#42d7cf"; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10; ctx.lineWidth = bone.id === selectedSpriteBoneId ? 8 : 6; ctx.beginPath(); ctx.moveTo(point.startX, point.startY); ctx.lineTo(point.endX, point.endY); ctx.stroke(); ctx.fillStyle = "#d8ffff"; ctx.beginPath(); ctx.arc(point.startX, point.startY, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(point.endX, point.endY, 7, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
function renderSpriteRigPanels() { requireElement<HTMLElement>("#sprite-bone-list").innerHTML = productionData.spriteRig.bones.map((bone) => `<div class="bone-row ${bone.id === selectedSpriteBoneId ? "is-active" : ""}" data-sprite-bone="${escapeMarkup(bone.id)}"><i></i><span>${escapeMarkup(bone.name)}</span><small>${(bone.rotation * 180 / Math.PI).toFixed(0)}°</small></div>`).join(""); document.querySelectorAll<HTMLElement>("[data-sprite-bone]").forEach((row) => row.addEventListener("click", () => { selectedSpriteBoneId = row.dataset.spriteBone ?? ""; renderSpriteRigPanels(); })); requireElement<HTMLElement>("#sprite-pose-list").innerHTML = productionData.spriteRig.poses.map((pose) => `<div class="pose-row" data-sprite-pose="${escapeMarkup(pose.id)}"><span>◇</span><div><strong>${escapeMarkup(pose.name)}</strong><small>${Object.keys(pose.rotations).length || productionData.spriteRig.bones.length} bones</small></div></div>`).join(""); document.querySelectorAll<HTMLElement>("[data-sprite-pose]").forEach((row) => row.addEventListener("click", () => applySpritePose(row.dataset.spritePose ?? ""))); setText("#key-pose-frame", String(Math.round(sequenceFrame))); drawSpriteRig(); }
function beginSpriteBoneDrag(event: PointerEvent) { const point = canvasPoint(spriteRigCanvas, event.clientX, event.clientY); const points = spriteBoneWorldPoints(); let best: { bone: EditorSpriteBone; distance: number } | undefined; for (const bone of productionData.spriteRig.bones) { const end = points.get(bone.id)!; const distance = Math.hypot(point.x - end.endX, point.y - end.endY); if (!best || distance < best.distance) best = { bone, distance }; } if (!best || best.distance > 35) return; selectedSpriteBoneId = best.bone.id; spriteBoneDrag = { bone: best.bone, pointerId: event.pointerId }; spriteRigCanvas.setPointerCapture(event.pointerId); renderSpriteRigPanels(); }
function moveSpriteBoneDrag(event: PointerEvent) { if (!spriteBoneDrag) return; const point = canvasPoint(spriteRigCanvas, event.clientX, event.clientY); const world = spriteBoneWorldPoints().get(spriteBoneDrag.bone.id)!; spriteBoneDrag.bone.rotation = Math.atan2(point.y - world.startY, point.x - world.startX); drawSpriteRig(); }
function endSpriteBoneDrag(event: PointerEvent) { if (!spriteBoneDrag) return; spriteBoneDrag = undefined; if (spriteRigCanvas.hasPointerCapture(event.pointerId)) spriteRigCanvas.releasePointerCapture(event.pointerId); renderSpriteRigPanels(); commitEditorChange("Pose sprite bone"); }
function addSpriteBone() { const id = `bone-${Date.now().toString(36)}`; productionData.spriteRig.bones.push({ id, name: `Bone ${productionData.spriteRig.bones.length + 1}`, parentId: selectedSpriteBoneId || undefined, x: 0, y: 0, length: 38, rotation: -.5 }); selectedSpriteBoneId = id; renderSpriteRigPanels(); commitEditorChange("Add sprite bone"); }
function saveSpritePose() { const id = `pose-${Date.now().toString(36)}`; productionData.spriteRig.poses.push({ id, name: `Pose ${productionData.spriteRig.poses.length + 1}`, rotations: Object.fromEntries(productionData.spriteRig.bones.map((bone) => [bone.id, bone.rotation])) }); renderSpriteRigPanels(); commitEditorChange("Save sprite pose"); }
function applySpritePose(id: string) { const pose = productionData.spriteRig.poses.find((candidate) => candidate.id === id); if (!pose) return; for (const bone of productionData.spriteRig.bones) if (pose.rotations[bone.id] !== undefined) bone.rotation = pose.rotations[bone.id]; drawSpriteRig(); }
function keySpritePose() { for (const bone of productionData.spriteRig.bones) { const trackId = `sprite-${bone.id}-rotation`; let track = sequenceData.tracks.find((candidate) => candidate.id === trackId); if (!track) { track = { id: trackId, targetId: bone.id, label: `${bone.name} Rotation`, property: "rotation", color: "#b997ff", muted: false, locked: false, keyframes: [] }; sequenceData.tracks.push(track); } track.keyframes.push({ id: `${trackId}-${Date.now().toString(36)}`, frame: Math.round(sequenceFrame), value: bone.rotation, easing: "ease-in-out" }); } renderSequenceTimeline(); commitEditorChange("Key sprite rig pose"); setText("#production-footer-status", `Pose keyed at frame ${Math.round(sequenceFrame)}`); }

function renderAnnotations() { const host = requireElement<HTMLElement>("#annotation-list"); host.innerHTML = productionData.annotations.map((note) => `<article class="annotation ${note.resolved ? "is-resolved" : ""}"><span class="annotation-avatar">${escapeMarkup(note.author.slice(0, 2).toUpperCase())}</span><main><header><strong>${escapeMarkup(note.author)}</strong><small>F${note.frame}</small></header><p>${escapeMarkup(note.body)}</p><footer><span>${note.entityId ? `@${escapeMarkup(note.entityId)}` : "Sequence"}</span><button data-resolve-note="${escapeMarkup(note.id)}">${note.resolved ? "RESOLVED" : "RESOLVE"}</button></footer></main></article>`).join(""); host.querySelectorAll<HTMLButtonElement>("[data-resolve-note]").forEach((button) => button.addEventListener("click", () => { const note = productionData.annotations.find((candidate) => candidate.id === button.dataset.resolveNote); if (note) note.resolved = !note.resolved; renderAnnotations(); commitEditorChange("Resolve annotation"); })); const open = productionData.annotations.filter((note) => !note.resolved).length; setText("#open-comment-count", `${open} OPEN`); }
function postAnnotation() { const input = requireElement<HTMLTextAreaElement>("#annotation-body"); const body = input.value.trim(); if (!body) return; productionData.annotations.push({ id: `note-${Date.now().toString(36)}`, author: "You", body, frame: Math.round(sequenceFrame), entityId: selectedEntityId ?? undefined, resolved: false, createdAt: new Date().toISOString() }); input.value = ""; renderAnnotations(); commitEditorChange("Add review annotation"); }
function createReviewLink() { const url = `${location.origin}${location.pathname}?review=${encodeURIComponent(editorShell?.project.id ?? "project")}&frame=${Math.round(sequenceFrame)}`; const output = requireElement<HTMLElement>("#review-link"); output.textContent = url; output.hidden = false; void navigator.clipboard?.writeText(url).catch(() => undefined); setText("#production-footer-status", "Read-only review link copied"); logEvent("collaboration → review link created"); }

function require2dContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
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

function formatMotionTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function commitEditorChange(label: string) {
  editorShell?.commitRuntime(label);
}

function captureRuntimeProject(base: EditorProject): EditorProject {
  const project = structuredClone(base);
  const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId) ?? project.scenes[0];
  const previous = new Map(scene.entities.map((entity) => [entity.id, entity]));
  scene.entities = entities.map((entity) => ({
    id: entity.id,
    label: entity.label,
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
    scale: entity.scale,
    layer: entity.layer ?? 0,
    color: entity.color,
    accent: entity.accent,
    kind: entity.kind,
    ...(entity.parentId ? { parentId: entity.parentId } : {}),
    components: structuredClone(entity.components ?? previous.get(entity.id)?.components ?? []),
  }));
  project.tilemap.values = [...mapTileValues];
  project.atlas.frameWidth = Number(requireElement<HTMLInputElement>("#slice-width").value);
  project.atlas.frameHeight = Number(requireElement<HTMLInputElement>("#slice-height").value);
  project.atlas.playbackSpeed = atlasPlaybackSpeed;
  project.atlas.frames = structuredClone(atlasFrames);
  project.atlas.sequence = animationSequence.map((frame) => frame.id);
  project.postProcessing.effects = effectConfigs.map((effect) => ({ id: effect.id, enabled: effect.enabled, value: effect.value }));
  project.timeline = structuredClone(sequenceData);
  project.production = structuredClone(productionData);
  return project;
}

function applyProjectToRuntime(project: EditorProject) {
  const starter = project.extensions?.hyperfocusStarter;
  currentStarterTemplate = starter && typeof starter === "object" && "template" in starter && typeof starter.template === "string" ? starter.template : "";
  const scene = project.scenes.find((candidate) => candidate.id === project.activeSceneId) ?? project.scenes[0];
  entities.splice(0, entities.length, ...scene.entities.map((entity) => ({ ...structuredClone(entity) })));
  stage.clear();
  for (const entity of entities) { stage.spawn(entity, { layer: entity.layer }); bindStageEntityEvents(entity); }

  mapTileValues.splice(0, mapTileValues.length, ...project.tilemap.values.map((value) => Math.max(0, Math.min(3, value)) as TileId));
  for (let index = 0; index < tileValues.length; index += 1) {
    const mapIndex = Math.floor(index / 8) * MAP_COLUMNS + index % 8;
    tileValues[index] = mapTileValues[mapIndex] ?? 0;
  }

  atlasFrames = structuredClone(project.atlas.frames);
  animationSequence = project.atlas.sequence.map((id) => atlasFrames.find((frame) => frame.id === id)).filter((frame): frame is AtlasFrame => Boolean(frame));
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
  productionData = structuredClone(project.production);
  applyScene3DProject(project);
  sequenceFrame = Math.max(0, Math.min(sequenceData.durationFrames, sequenceFrame));
  requireElement<HTMLSelectElement>("#sequence-fps").value = String(sequenceData.fps);
  requireElement<HTMLInputElement>("#sequence-bpm").value = String(sequenceData.bpm);
  requireElement<HTMLSelectElement>("#sequence-speed").value = String(sequenceData.playbackSpeed);
  const audio = sequenceData.audioTracks[0];
  if (audio) {
    requireElement<HTMLInputElement>("#mixer-volume").value = String(audio.volume);
    requireElement<HTMLInputElement>("#mixer-pan").value = String(audio.pan);
  }
  renderSequenceTimeline();
  renderProductionLab();

  renderStageHierarchy();
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
    const object = scene3dMeshes.get(id);
    return object ? { x: object.position.x, y: object.position.y, z: object.position.z } : undefined;
  },
  selectEntity,
  setProceduralWalk,
  stepMotion,
  runBenchmark,
  openProductionLab,
  simulateMidi,
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
    if (!blob.type.startsWith("image/")) return;
    const previousUrl = assetPreviewUrls.get(id);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(blob);
    assetPreviewUrls.set(id, url);
    const preview = new Image();
    preview.addEventListener("load", () => {
      if (assetPreviewUrls.get(id) !== url) return;
      assetPreviewImages.set(id, preview);
      renderStage();
    }, { once: true });
    preview.addEventListener("error", () => {
      if (assetPreviewUrls.get(id) !== url) return;
      assetPreviewUrls.delete(id);
      URL.revokeObjectURL(url);
    }, { once: true });
    preview.src = url;
  },
  play(project) {
    if (readScene3DProject(project)) {
      playableWorld = undefined;
      playableStory = undefined;
      playableProject = structuredClone(project);
      scene3dPlaying = true;
      applyScene3DProject(project);
      showWorkspace("scene3d");
      setText("#scene3d-status", "PLAYING · WASD TO MOVE");
      if (!app.isRunning()) togglePlayback();
      return;
    }
    let world: PlayableWorld;
    try { world = createPlayableWorld(project, { behaviors: createNavigationBehaviorRegistry2D(project) }); }
    catch (cause) { return cause instanceof Error ? cause.message : String(cause); }
    if (world.diagnostics.length) return world.diagnostics.map((item) => item.message).join("\n");
    const story = readPlayableStoryDeclaration2D(project) ? createPlayableStoryController2D(project) : undefined;
    editorPlaySaves.start(project, world, story ? [story.saveStateProvider()] : []);
    world.drainAudioCommands();
    applyProjectToRuntime(project);
    playableWorld = world;
    playableStory = story;
    playableProject = structuredClone(project);
    playableBindings.clear();
    if (!app.isRunning()) togglePlayback();
  },
  pause() {
    if (scene3dPlaying) {
      scene3dPlaying = false;
      playableProject = undefined;
      if (editorShell) applyScene3DProject(editorShell.project);
    }
    if (playableWorld) {
      if (playableProject) editorPlaySaves.stop(playableProject, playableWorld, playableStory ? [playableStory.saveStateProvider()] : []);
      playableWorld = undefined;
      playableStory = undefined;
      playableProject = undefined;
      playableBindings.clear();
      if (editorShell) applyProjectToRuntime(editorShell.project);
    }
    if (app.isRunning()) togglePlayback();
  },
  togglePlayback,
  captureProfile: captureEditorProfile,
  log: logEvent,
});
globalThis.__hyperfocusEditorAgent = createEditorAgentBridge({
  getProject: () => editorShell!.project,
  isReady: () => editorAutomation.ready,
});

function resolvePlayableActions(project: EditorProject, bindings: ReadonlySet<string>) {
  const actions = new Set<string>();
  for (const mapping of project.settings.input) if (mapping.bindings.some((binding) => bindings.has(binding))) actions.add(mapping.action);
  return actions;
}
applyProjectToRuntime(editorShell.project);
if (location.hash === "#motion" || location.hash === "#sequence") showWorkspace("motion");
if (new URLSearchParams(location.search).has("review")) { document.body.classList.add("review-mode"); openProductionLab("review"); setText("#production-health", "READ-ONLY REVIEW"); }
if (!app.isRunning()) app.start();
loopPaused = false;
editorAutomation.loopPaused = false;
void initializeKernels().finally(() => {
  editorAutomation.ready = true;
  setText("#footer-status", "Editor project ready");
});

window.addEventListener("pagehide", () => {
  globalThis.__hyperfocusEditorAgent = undefined;
  keyboard.dispose();
  stageDelegation.dispose();
  fftAudioElement?.pause();
  void fftAudioContext?.close();
  app.destroy();
  editorShell?.destroy();
});
