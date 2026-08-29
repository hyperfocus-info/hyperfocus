import {
  createCanvasRenderStage,
  createRenderFramePool,
  type RenderLayerOptions,
  type RenderRecordStrategy,
  type Renderable
} from "@hyperfocus/engine/render";
import { hasQuestFlag } from "../shared-loadout.ts";
import { type HazardEntity, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { validZoneId } from "../shared/segmented-replication-values.ts";
import type { ClientImages } from "./assets.ts";
import { cameraForPlayer, hazardNearView, pointNearView, viewportFromCamera } from "./render/camera.ts";
import { createAimReticleRenderCalls, createVisualEffectQueue } from "./render/effects.ts";
import { createHazardRenderCalls, type HazardRenderTiming } from "./render/hazards.ts";
import { createHudRenderCalls, debugStatusText, updateDialogState } from "./render/hud.ts";
import { createImpactFeedbackController } from "./render/impact.ts";
import { chooseInteractable } from "./render/interactions.ts";
import { createLootRenderCalls } from "./render/loot.ts";
import { createNpcRenderCalls } from "./render/npcs.ts";
import { createPlayerRenderCalls, type PlayerPositionCache } from "./render/players.ts";
import { createDailyQuestReticleRenderCalls, createMainQuestGuideRenderCalls } from "./render/quests.ts";
import { createResourceRenderCalls } from "./render/resources.ts";
import { createRenderSignalTracker } from "./render/signals.ts";
import { activeTerrainPerfExperiment, createTerrainRenderCalls, prewarmTerrainRegionChunks, type TerrainPerfExperiment } from "./render/terrain.ts";
import { STATUS_UPDATE_INTERVAL_MS, type AimPoint, type Camera, type DialogState, type InteractableTarget, type ScreenPoint, type Viewport } from "./render/types.ts";
import { createMapOverlay, type MapOverlayView } from "./map-overlay.ts";
import type { SfxPlayer } from "./sfx.ts";

export type Renderer = {
  camera(player: PlayerEntity | undefined): Camera;
  pushFloat(text: string, x: number, y: number, color: string, timeMs: number, size?: number): void;
  drawFrame(state: MmoSkillDemoState, player: PlayerEntity | undefined, debug: Record<string, unknown>, timeMs: number, aim?: AimPoint, hudPointer?: ScreenPoint, aimReticleAlpha?: number, mapView?: MapOverlayView): void;
};

export type RendererOptions = {
  drawDataCaches?: "auto" | "always" | "never";
  renderRecordStrategy?: RenderRecordStrategy;
  terrainExperiment?: TerrainPerfExperiment;
};

type RendererStatus = Pick<HTMLElement, "hidden" | "textContent">;

export type TransientEffectTimingCache = Map<string, { seenMs: number; ageMs: number; lifetimeMs: number }>;
export type ClientRenderTelemetry = {
  timeMs: number;
  tick: number;
  playerId: string;
  rawAbility: string;
  rawSlot: string;
  rawChargeMs: number;
  rawActiveMs: number;
  visualAbility: string;
  visualSlot: string;
  visualChargeMs: number;
  visualActiveMs: number;
  inputAction: string;
  stateEffects: number;
  stateHazards: number;
  activeLocalEffects: number;
  staleVisualCharge: boolean;
  stateEffectSamples: Array<{ id: string; kind: string; effectKind: string; ageMs: number; lifetimeMs: number; x: number; y: number }>;
  localEffectSamples: Array<{ kind: string; ageMs: number; lifetimeMs: number; x: number; y: number; size: number; length?: number; velocityX?: number; velocityY?: number }>;
  calls: Record<string, number>;
  phaseMs: Record<"setup" | "terrain" | "world" | "hazards" | "effects" | "hud" | "stage" | "map", number>;
  drawn: number;
  skipped: number;
  submitted: number;
  culled: number;
};

export const RENDER_LAYER_CONFIG: Record<string, RenderLayerOptions> = {
  terrain: { order: 0 },
  ground: { order: 1 },
  world: { order: 2, sort: "y-axis" },
  hazards: { order: 3 },
  effects: { order: 4 },
  reticle: { order: 5 },
  hud: { order: 6, ignoreCamera: true }
};

const RENDER_TELEMETRY_PHASES = ["setup", "terrain", "world", "hazards", "effects", "hud", "stage", "map"] as const;

function roundTelemetryMs(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function clientTransientEffectTiming(effect: Pick<MmoSkillDemoState["effects"][number], "id" | "ageMs" | "lifetimeMs">, timeMs: number, cache: TransientEffectTimingCache): HazardRenderTiming {
  let timing = cache.get(effect.id);
  if (!timing) {
    timing = { seenMs: timeMs, ageMs: Math.max(0, effect.ageMs), lifetimeMs: Math.max(1, effect.lifetimeMs) };
    cache.set(effect.id, timing);
  }
  return {
    ageMs: Math.min(timing.lifetimeMs, Math.max(0, timing.ageMs + timeMs - timing.seenMs)),
    windupMs: 0,
    lifetimeMs: timing.lifetimeMs
  };
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  status: RendererStatus,
  images: ClientImages,
  tiles: number[],
  getClientPlayerId: () => string | undefined,
  sfx?: SfxPlayer,
  options: RendererOptions = {}
): Renderer {
  const stage = createCanvasRenderStage(canvas, { autoClearCanvas: true });
  for (const [name, options] of Object.entries(RENDER_LAYER_CONFIG)) stage.addLayer(name, options);

  const effects = createVisualEffectQueue();
  const impacts = createImpactFeedbackController();
  const signals = createRenderSignalTracker({ effects, getClientPlayerId, sfx, impact: impacts });
  const mapOverlay = createMapOverlay(canvas, tiles);
  const renderPool = createRenderFramePool({ recordStrategy: options.renderRecordStrategy ?? "fresh" });
  const terrainExperiment = options.terrainExperiment ?? activeTerrainPerfExperiment("chunk-sprites");
  prewarmTerrainRegionChunks(tiles, images, canvas.width, canvas.height, 128, terrainExperiment);
  const lastPositions: PlayerPositionCache = new Map();
  const hazardTimings = new Map<string, { seenMs: number; windupMs: number; lifetimeMs: number }>();
  const effectTimings: TransientEffectTimingCache = new Map();
  const liveEffects = new Set<string>();
  const terrainCalls: Renderable[] = [];
  const worldCalls: Renderable[] = [];
  const hazardCalls: Renderable[] = [];
  const transientHazardCalls: Renderable[] = [];
  const reticleCalls: Renderable[] = [];
  const hudCalls: Renderable[] = [];
  const telemetry = createClientRenderTelemetry();
  let currentInteractable: InteractableTarget | undefined;
  let activeDialog: DialogState | undefined;
  const statusState = { text: "", updatedAt: Number.NEGATIVE_INFINITY };

  function camera(player: PlayerEntity | undefined) {
    return cameraForPlayer(player, canvas.width, canvas.height);
  }

  function cameraForFrame(player: PlayerEntity | undefined, debug: Record<string, unknown>) {
    const cameraX = debugNumber(debug, "cameraX");
    const cameraY = debugNumber(debug, "cameraY");
    if (cameraX > 0 || cameraY > 0) return cameraForPlayer({ x: cameraX, y: cameraY }, canvas.width, canvas.height);
    return camera(player);
  }

  function appendWorldCalls(state: MmoSkillDemoState, player: PlayerEntity | undefined, cam: Camera, timeMs: number, calls: Renderable[]) {
    const fastPadding = player?.activeAbility === "space-rush" || (player?.rushDistance ?? 0) > 0 ? 260 : 96;
    let firstProofTreeId = "";
    if (player && !hasQuestFlag(player, "first-cut")) {
      let bestScore = Number.POSITIVE_INFINITY;
      for (const id of Object.keys(state.resources ?? {})) {
        const node = state.resources[id];
        if (!node || node.depleted || node.kind !== "tree") continue;
        const score = Math.hypot(node.x - player.x, node.y - player.y) + (node.zoneId === player.zoneId ? 0 : 1_000_000);
        if (score < bestScore) {
          bestScore = score;
          firstProofTreeId = node.id;
        }
      }
    }
    for (const id of Object.keys(state.resources ?? {})) {
      const node = state.resources[id];
      if (pointNearView(cam, canvas.width, canvas.height, node.x, node.y, fastPadding)) createResourceRenderCalls(node, images, currentInteractable, calls, renderPool, node.id === firstProofTreeId);
    }
    for (const id of Object.keys(state.loots ?? {})) {
      const loot = state.loots[id];
      if (pointNearView(cam, canvas.width, canvas.height, loot.x, loot.y, Math.max(80, fastPadding))) createLootRenderCalls(loot, images, timeMs, currentInteractable, calls, renderPool);
    }
    for (const id of Object.keys(state.npcs ?? {})) {
      const npc = state.npcs[id];
      if (pointNearView(cam, canvas.width, canvas.height, npc.x, npc.y, npc.role === "boss" ? Math.max(180, fastPadding) : fastPadding)) createNpcRenderCalls(npc, images, player, timeMs, currentInteractable, calls, renderPool, impacts.actorVisual(npc.id, timeMs));
    }
    for (const id of Object.keys(state.players ?? {})) {
      const actor = state.players[id];
      if (pointNearView(cam, canvas.width, canvas.height, actor.x, actor.y, fastPadding)) {
        createPlayerRenderCalls(actor, images, timeMs, player, getClientPlayerId(), lastPositions, calls, renderPool, impacts.actorVisual(actor.id, timeMs));
      }
    }
  }

  function hazardTiming(hazardId: string, windupMs: number, lifetimeMs: number, timeMs: number): HazardRenderTiming {
    let timing = hazardTimings.get(hazardId);
    if (!timing) {
      timing = { seenMs: timeMs, windupMs: Math.max(0, windupMs), lifetimeMs: Math.max(1, lifetimeMs) };
      hazardTimings.set(hazardId, timing);
    }
    return {
      ageMs: timeMs - timing.seenMs,
      windupMs: timing.windupMs,
      lifetimeMs: timing.lifetimeMs
    };
  }

  function terrainCallsFor(viewport: Viewport) {
    terrainCalls.length = 0;
    return createTerrainRenderCalls(tiles, images, viewport, terrainCalls, renderPool, terrainExperiment);
  }

  function drawFrame(state: MmoSkillDemoState, player: PlayerEntity | undefined, debug: Record<string, unknown>, timeMs: number, aim?: AimPoint, hudPointer?: ScreenPoint, aimReticleAlpha?: number, mapView: MapOverlayView = { minimapOpen: true, worldMapOpen: false }) {
    const collectPhaseTelemetry = debug.telemetry === true
      || Reflect.get(globalThis, "__mmoSkillDemoCollectPhaseTelemetry") === true;
    let phaseStart = collectPhaseTelemetry ? performance.now() : 0;
    for (const phase of RENDER_TELEMETRY_PHASES) telemetry.phaseMs[phase] = 0;
    const recordPhase = (phase: (typeof RENDER_TELEMETRY_PHASES)[number]) => {
      if (!collectPhaseTelemetry) return;
      const now = performance.now();
      telemetry.phaseMs[phase] = roundTelemetryMs(now - phaseStart);
      phaseStart = now;
    };

    renderPool.beginFrame();
    const cam = impacts.camera(cameraForFrame(player, debug), timeMs, canvas.width, canvas.height);
    const fastView = player?.activeAbility === "space-rush" || (player?.rushDistance ?? 0) > 0;
    const viewport = viewportFromCamera(cam, canvas.width, canvas.height, fastView ? 288 : 128);
    for (const id of [...hazardTimings.keys()]) if (!state.hazards?.[id]) hazardTimings.delete(id);
    liveEffects.clear();
    for (const effect of state.effects ?? []) liveEffects.add(effect.id);
    for (const id of [...effectTimings.keys()]) if (!liveEffects.has(id)) effectTimings.delete(id);
    currentInteractable = chooseInteractable(state, player, currentInteractable);
    activeDialog = updateDialogState(state, player, timeMs, currentInteractable, activeDialog);
    signals.sync(state, timeMs);
    recordPhase("setup");

    stage.clear({ canvas: true });
    stage.setCamera(cam);
    const drawCacheMode = options.drawDataCaches ?? "never";
    stage.setDrawDataCaches(drawCacheMode === "always" || (drawCacheMode === "auto" && mapView.worldMapOpen));
    const terrainCalls = terrainCallsFor(viewport);
    recordPhase("terrain");
    worldCalls.length = 0;
    appendWorldCalls(state, player, cam, timeMs, worldCalls);
    recordPhase("world");
    hazardCalls.length = 0;
    for (const id of Object.keys(state.hazards ?? {})) {
      const hazard = state.hazards[id];
      if (hazardNearView(cam, canvas.width, canvas.height, hazard)) createHazardRenderCalls(hazard, hazardTiming(hazard.id, hazard.windupMs, hazard.lifetimeMs, timeMs), hazardCalls, renderPool);
    }
    transientHazardCalls.length = 0;
    for (const effect of state.effects ?? []) {
      const hazard = effectAsHazard(effect);
      if (hazardNearView(cam, canvas.width, canvas.height, hazard)) createHazardRenderCalls(hazard, clientTransientEffectTiming(effect, timeMs, effectTimings), transientHazardCalls, renderPool);
    }
    recordPhase("hazards");
    const effectCalls = effects.toRenderCalls(timeMs, undefined, renderPool);
    createMainQuestGuideRenderCalls(state, player, timeMs, effectCalls, renderPool);
    reticleCalls.length = 0;
    createDailyQuestReticleRenderCalls(player, timeMs, reticleCalls, renderPool);
    createAimReticleRenderCalls(player, aim, reticleCalls, renderPool, { alpha: aimReticleAlpha });
    recordPhase("effects");
    hudCalls.length = 0;
    createHudRenderCalls(state, player, debug, canvas.width, canvas.height, timeMs, activeDialog, currentInteractable, hudPointer, hudCalls, renderPool);
    recordPhase("hud");
    const callCounts = {
      terrain: stage.pushMany("terrain", terrainCalls),
      world: stage.pushMany("world", worldCalls),
      hazards: stage.pushMany("hazards", hazardCalls),
      transientHazards: stage.pushMany("hazards", transientHazardCalls),
      effects: stage.pushMany("effects", effectCalls),
      reticle: stage.pushMany("reticle", reticleCalls),
      hud: stage.pushMany("hud", hudCalls)
    };
    const frameResult = stage.flush();
    recordPhase("stage");
    mapOverlay.draw(state, player, mapView);
    recordPhase("map");
    stage.clear({ canvas: false });
    terrainCalls.length = 0;
    worldCalls.length = 0;
    hazardCalls.length = 0;
    transientHazardCalls.length = 0;
    reticleCalls.length = 0;
    hudCalls.length = 0;
    updateClientRenderTelemetry({
      telemetry,
      state,
      debug,
      timeMs,
      activeLocalEffects: effects.active(),
      callCounts,
      frameResult,
      status,
      statusState,
    });
  }

  return {
    camera,
    pushFloat: effects.pushFloat,
    drawFrame
  };
}

function createClientRenderTelemetry(): ClientRenderTelemetry {
  return {
    timeMs: 0,
    tick: 0,
    playerId: "",
    rawAbility: "",
    rawSlot: "",
    rawChargeMs: 0,
    rawActiveMs: 0,
    visualAbility: "",
    visualSlot: "",
    visualChargeMs: 0,
    visualActiveMs: 0,
    inputAction: "",
    stateEffects: 0,
    stateHazards: 0,
    activeLocalEffects: 0,
    staleVisualCharge: false,
    stateEffectSamples: [],
    localEffectSamples: [],
    calls: { terrain: 0, world: 0, hazards: 0, transientHazards: 0, effects: 0, reticle: 0, hud: 0 },
    phaseMs: { setup: 0, terrain: 0, world: 0, hazards: 0, effects: 0, hud: 0, stage: 0, map: 0 },
    drawn: 0,
    skipped: 0,
    submitted: 0,
    culled: 0
  };
}

function debugNumber(debug: Record<string, unknown>, key: string) {
  const value = debug[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function debugString(debug: Record<string, unknown>, key: string) {
  const value = debug[key];
  return typeof value === "string" ? value : "";
}

function effectAsHazard(effect: MmoSkillDemoState["effects"][number]): HazardEntity {
  return {
    id: effect.id,
    entityType: "hazard",
    kind: effect.kind,
    zoneId: validZoneId(effect.zoneId) ?? "ashwood",
    ownerId: "",
    x: effect.x,
    y: effect.y,
    toX: effect.toX,
    toY: effect.toY,
    radius: effect.radius,
    windupMs: 0,
    lifetimeMs: effect.lifetimeMs,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: effect.effectKind,
    text: effect.text,
    pulse: effect.pulse
  };
}

function updateClientRenderTelemetry(input: {
  telemetry: ClientRenderTelemetry;
  state: MmoSkillDemoState;
  debug: Record<string, unknown>;
  timeMs: number;
  activeLocalEffects: ReturnType<ReturnType<typeof createVisualEffectQueue>["active"]>;
  callCounts: ClientRenderTelemetry["calls"];
  frameResult: Pick<ClientRenderTelemetry, "drawn" | "skipped" | "submitted" | "culled">;
  status: RendererStatus;
  statusState: { text: string; updatedAt: number };
}) {
  const { telemetry, debug } = input;
  telemetry.timeMs = Math.round(input.timeMs);
  telemetry.tick = input.state.tick ?? 0;
  telemetry.playerId = debugString(debug, "playerId");
  telemetry.rawAbility = debugString(debug, "rawAbility");
  telemetry.rawSlot = debugString(debug, "rawSlot");
  telemetry.rawChargeMs = debugNumber(debug, "rawChargeMs");
  telemetry.rawActiveMs = debugNumber(debug, "rawActiveMs");
  telemetry.visualAbility = debugString(debug, "visualAbility");
  telemetry.visualSlot = debugString(debug, "visualSlot");
  telemetry.visualChargeMs = debugNumber(debug, "visualChargeMs");
  telemetry.visualActiveMs = debugNumber(debug, "visualActiveMs");
  telemetry.inputAction = debugString(debug, "inputAction");
  telemetry.stateEffects = debugNumber(debug, "stateEffects");
  telemetry.stateHazards = debugNumber(debug, "stateHazards");
  telemetry.activeLocalEffects = input.activeLocalEffects.length;
  telemetry.staleVisualCharge = telemetry.visualChargeMs > 0 && telemetry.visualAbility === "";
  telemetry.calls = input.callCounts;
  telemetry.drawn = input.frameResult.drawn;
  telemetry.skipped = input.frameResult.skipped;
  telemetry.submitted = input.frameResult.submitted;
  telemetry.culled = input.frameResult.culled;
  telemetry.stateEffectSamples.length = 0;
  telemetry.localEffectSamples.length = 0;
  if (debug.telemetry) {
    for (const effect of (input.state.effects ?? []).slice(0, 8)) {
      telemetry.stateEffectSamples.push({
        id: effect.id,
        kind: effect.kind,
        effectKind: effect.effectKind,
        ageMs: Math.round(effect.ageMs),
        lifetimeMs: Math.round(effect.lifetimeMs),
        x: Math.round(effect.x),
        y: Math.round(effect.y)
      });
    }
    for (const effect of input.activeLocalEffects.slice(0, 8)) {
      telemetry.localEffectSamples.push({
        kind: effect.kind,
        ageMs: Math.max(0, Math.round(input.timeMs - effect.startedMs)),
        lifetimeMs: Math.round(effect.lifetimeMs),
        x: Math.round(effect.x),
        y: Math.round(effect.y),
        size: effect.size,
        length: effect.length,
        velocityX: effect.velocityX,
        velocityY: effect.velocityY
      });
    }
  }
  Reflect.set(globalThis, "__mmoSkillDemoTelemetry", telemetry);

  const baseStatus = debugStatusText(input.state, debug);
  const nextStatus = debug.telemetry && baseStatus
    ? `${baseStatus} raw ${telemetry.rawAbility || "-"}:${Math.round(telemetry.rawChargeMs)} vis ${telemetry.visualAbility || "-"}:${Math.round(telemetry.visualChargeMs)} fx ${telemetry.stateEffects}/${telemetry.activeLocalEffects} draw ${telemetry.drawn}/${telemetry.skipped}${telemetry.staleVisualCharge ? " staleCharge" : ""}`
    : baseStatus;
  if (debug.telemetry && nextStatus && nextStatus !== input.statusState.text
    && input.timeMs - input.statusState.updatedAt >= STATUS_UPDATE_INTERVAL_MS) {
    input.status.hidden = false;
    input.status.textContent = nextStatus;
    input.statusState.text = nextStatus;
    input.statusState.updatedAt = input.timeMs;
  }
}
