import { attachMmoEntityViews } from "../shared-entity-registry.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "../shared-contracts.ts";

export type MmoInterpolationMode = "interpolate" | "hold" | "snap";

export type MmoInterpolationDebug = {
  delayMs: number;
  bufferedFrames: number;
  mode: MmoInterpolationMode;
  serverTickMs: number;
  targetServerMs: number;
};

export type MmoStateInterpolator = {
  observe(state: MmoSkillDemoState, receivedMs: number): void;
  sample(state: MmoSkillDemoState, timeMs: number, localPlayerId?: string): MmoSkillDemoState;
  setServerTickRate(tickRate: number): void;
  debug(): MmoInterpolationDebug;
  reset(): void;
};

export type MmoStateInterpolatorOptions = {
  serverTickMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  delayMultiplier?: number;
  remoteSnapDistancePx?: number;
  selfSnapDistancePx?: number;
  selfHalfLifeMs?: number;
  maxBufferedFrames?: number;
};

type ActorPoint = {
  id: string;
  x: number;
  y: number;
  zoneId: string;
  hp: number;
  maxHp: number;
  serverMs: number;
  snap: boolean;
};

type SnapshotFrame = {
  tick: number;
  serverMs: number;
  receivedMs: number;
  players: Record<string, ActorPoint>;
  npcs: Record<string, ActorPoint>;
};

type SelfVisualPoint = {
  x: number;
  y: number;
  zoneId: string;
  hp: number;
  lastSampleMs: number;
};

type SampledPoint = {
  x: number;
  y: number;
  mode: MmoInterpolationMode;
};

const DEFAULT_SERVER_TICK_MS = 50;
const DEFAULT_MIN_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 180;
const DEFAULT_DELAY_MULTIPLIER = 1.1;
const DEFAULT_REMOTE_SNAP_DISTANCE_PX = 128;
const DEFAULT_SELF_SNAP_DISTANCE_PX = 96;
const DEFAULT_SELF_HALF_LIFE_MS = 36;
const DEFAULT_MAX_BUFFERED_FRAMES = 12;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function modeWith(current: MmoInterpolationMode, next: MmoInterpolationMode): MmoInterpolationMode {
  if (current === "snap" || next === "snap") return "snap";
  if (current === "interpolate" || next === "interpolate") return "interpolate";
  return "hold";
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pointFromEntity(
  entity: Pick<PlayerEntity | NpcEntity, "id" | "x" | "y" | "zoneId" | "hp" | "maxHp">,
  serverMs: number,
  previous: ActorPoint | undefined,
  snapDistancePx: number
): ActorPoint {
  const snap =
    !previous ||
    previous.zoneId !== entity.zoneId ||
    (previous.hp <= 0 && entity.hp > 0) ||
    previous.maxHp !== entity.maxHp ||
    distance(previous, entity) > snapDistancePx;

  return {
    id: entity.id,
    x: entity.x,
    y: entity.y,
    zoneId: entity.zoneId,
    hp: entity.hp,
    maxHp: entity.maxHp,
    serverMs,
    snap
  };
}

function buildActorPoints<T extends PlayerEntity | NpcEntity>(
  entities: Record<string, T>,
  serverMs: number,
  previous: Record<string, ActorPoint> | undefined,
  snapDistancePx: number
) {
  const points: Record<string, ActorPoint> = {};
  for (const id in entities) points[id] = pointFromEntity(entities[id], serverMs, previous?.[id], snapDistancePx);
  return points;
}

function interpolatePoint(a: ActorPoint, b: ActorPoint, targetServerMs: number): SampledPoint {
  const span = b.serverMs - a.serverMs;
  if (span <= 0) return { x: b.x, y: b.y, mode: b.snap ? "snap" : "hold" };
  const t = clamp((targetServerMs - a.serverMs) / span, 0, 1);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    mode: "interpolate"
  };
}

function attachEntityViewsIfEntityBacked(state: MmoSkillDemoState) {
  if (Object.keys(state.entities ?? {}).length <= 0) return;
  const hasActorViews = Object.keys(state.players ?? {}).length > 0 || Object.keys(state.npcs ?? {}).length > 0;
  if (!hasActorViews) attachMmoEntityViews(state);
}

export function createMmoStateInterpolator(options: MmoStateInterpolatorOptions = {}): MmoStateInterpolator {
  let serverTickMs = options.serverTickMs ?? DEFAULT_SERVER_TICK_MS;
  const minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const delayMultiplier = options.delayMultiplier ?? DEFAULT_DELAY_MULTIPLIER;
  const remoteSnapDistancePx = options.remoteSnapDistancePx ?? DEFAULT_REMOTE_SNAP_DISTANCE_PX;
  const selfSnapDistancePx = options.selfSnapDistancePx ?? DEFAULT_SELF_SNAP_DISTANCE_PX;
  const selfHalfLifeMs = options.selfHalfLifeMs ?? DEFAULT_SELF_HALF_LIFE_MS;
  const maxBufferedFrames = options.maxBufferedFrames ?? DEFAULT_MAX_BUFFERED_FRAMES;
  const frames: SnapshotFrame[] = [];
  const selfVisual = new Map<string, SelfVisualPoint>();
  const visualPlayers: Record<string, PlayerEntity> = {};
  const visualNpcs: Record<string, NpcEntity> = {};
  const visualState = createVisualState(visualPlayers, visualNpcs);
  let observedFrameIntervalMs: number | undefined;
  let lastDebug: MmoInterpolationDebug = {
    delayMs: clamp(serverTickMs * 2 * delayMultiplier, minDelayMs, maxDelayMs),
    bufferedFrames: 0,
    mode: "hold",
    serverTickMs,
    targetServerMs: 0
  };

  function delayMs() {
    return clamp((observedFrameIntervalMs ?? serverTickMs * 2) * delayMultiplier, minDelayMs, maxDelayMs);
  }

  function makeFrame(state: MmoSkillDemoState, receivedMs: number, previous: SnapshotFrame | undefined): SnapshotFrame {
    const serverMs = state.tick * serverTickMs;
    return {
      tick: state.tick,
      serverMs,
      receivedMs,
      players: buildActorPoints(state.players ?? {}, serverMs, previous?.players, remoteSnapDistancePx),
      npcs: buildActorPoints(state.npcs ?? {}, serverMs, previous?.npcs, remoteSnapDistancePx)
    };
  }

  function observe(state: MmoSkillDemoState, receivedMs: number) {
    attachEntityViewsIfEntityBacked(state);
    const previous = frames.at(-1);
    if (previous && state.tick < previous.tick) {
      frames.length = 0;
      selfVisual.clear();
    }
    const baseline = frames.at(-1);
    const frame = makeFrame(state, receivedMs, baseline);
    if (baseline && frame.tick === baseline.tick) {
      frames[frames.length - 1] = frame;
      return;
    }
    if (baseline && frame.serverMs > baseline.serverMs) {
      const interval = frame.serverMs - baseline.serverMs;
      if (Number.isFinite(interval) && interval > 0 && interval < 1000) {
        observedFrameIntervalMs = observedFrameIntervalMs === undefined ? interval : observedFrameIntervalMs * 0.75 + interval * 0.25;
      }
    }
    frames.push(frame);
    while (frames.length > maxBufferedFrames) frames.shift();
  }

  function latestPoint(kind: "players" | "npcs", id: string) {
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      const point = frames[i][kind][id];
      if (point) return point;
    }
    return undefined;
  }

  function sampleRemote(kind: "players" | "npcs", id: string, fallback: { x: number; y: number }, targetServerMs: number): SampledPoint {
    const latest = latestPoint(kind, id);
    if (!latest) return { x: fallback.x, y: fallback.y, mode: "hold" };

    let before: ActorPoint | undefined;
    let after: ActorPoint | undefined;
    for (const frame of frames) {
      const point = frame[kind][id];
      if (!point) continue;
      if (point.serverMs <= targetServerMs) before = point;
      if (point.serverMs >= targetServerMs) {
        after = point;
        break;
      }
    }

    if (before && after && before !== after) {
      if (after.snap || before.zoneId !== after.zoneId || distance(before, after) > remoteSnapDistancePx) {
        return { x: latest.x, y: latest.y, mode: "snap" };
      }
      return interpolatePoint(before, after, targetServerMs);
    }

    const held = before ?? after ?? latest;
    return { x: held.x, y: held.y, mode: held.snap ? "snap" : "hold" };
  }

  function sampleSelf(player: PlayerEntity, timeMs: number): SampledPoint {
    const visual = selfVisual.get(player.id);
    if (!visual || visual.zoneId !== player.zoneId || (visual.hp <= 0 && player.hp > 0)) {
      selfVisual.set(player.id, { x: player.x, y: player.y, zoneId: player.zoneId, hp: player.hp, lastSampleMs: timeMs });
      return { x: player.x, y: player.y, mode: "snap" };
    }

    const gap = distance(visual, player);
    if (gap > selfSnapDistancePx) {
      visual.x = player.x;
      visual.y = player.y;
      visual.zoneId = player.zoneId;
      visual.hp = player.hp;
      visual.lastSampleMs = timeMs;
      return { x: visual.x, y: visual.y, mode: "snap" };
    }

    const dt = Math.max(0, timeMs - visual.lastSampleMs);
    const alpha = dt > 0 ? 1 - 2 ** (-dt / selfHalfLifeMs) : 0;
    visual.x += (player.x - visual.x) * alpha;
    visual.y += (player.y - visual.y) * alpha;
    visual.zoneId = player.zoneId;
    visual.hp = player.hp;
    visual.lastSampleMs = timeMs;
    return { x: visual.x, y: visual.y, mode: gap > 0.05 ? "interpolate" : "hold" };
  }

  function sample(state: MmoSkillDemoState, timeMs: number, localPlayerId?: string): MmoSkillDemoState {
    const latestFrame = frames.at(-1);
    if (!latestFrame) {
      lastDebug = { delayMs: delayMs(), bufferedFrames: 0, mode: "hold", serverTickMs, targetServerMs: 0 };
      return state;
    }

    const delay = delayMs();
    const targetServerMs = latestFrame.serverMs + (timeMs - latestFrame.receivedMs) - delay;
    let mode: MmoInterpolationMode = "hold";
    updateVisualStateShell(visualState, state);

    for (const id in state.players ?? {}) {
      const player = state.players[id];
      const point = id === localPlayerId ? sampleSelf(player, timeMs) : sampleRemote("players", id, player, targetServerMs);
      syncVisualPlayer(visualPlayers, id, player, point);
      mode = modeWith(mode, point.mode);
    }
    pruneMissing(visualPlayers, state.players);

    for (const id in state.npcs ?? {}) {
      const npc = state.npcs[id];
      const point = sampleRemote("npcs", id, npc, targetServerMs);
      syncVisualNpc(visualNpcs, id, npc, point);
      mode = modeWith(mode, point.mode);
    }
    pruneMissing(visualNpcs, state.npcs);

    lastDebug = {
      delayMs: delay,
      bufferedFrames: frames.length,
      mode,
      serverTickMs,
      targetServerMs
    };

    return visualState;
  }

  function setServerTickRate(tickRate: number) {
    if (!Number.isFinite(tickRate) || tickRate <= 0) return;
    serverTickMs = 1000 / tickRate;
    observedFrameIntervalMs = undefined;
    for (const frame of frames) frame.serverMs = frame.tick * serverTickMs;
    for (const frame of frames) {
      for (const point of Object.values(frame.players)) point.serverMs = frame.serverMs;
      for (const point of Object.values(frame.npcs)) point.serverMs = frame.serverMs;
    }
    lastDebug = { ...lastDebug, serverTickMs, delayMs: delayMs() };
  }

  function debug() {
    return lastDebug;
  }

  function reset() {
    frames.length = 0;
    selfVisual.clear();
    for (const id in visualPlayers) delete visualPlayers[id];
    for (const id in visualNpcs) delete visualNpcs[id];
    observedFrameIntervalMs = undefined;
    lastDebug = { delayMs: delayMs(), bufferedFrames: 0, mode: "hold", serverTickMs, targetServerMs: 0 };
  }

  return { observe, sample, setServerTickRate, debug, reset };
}

function createVisualState(
  players: Record<string, PlayerEntity>,
  npcs: Record<string, NpcEntity>,
): MmoSkillDemoState {
  return {
    tick: 0,
    mapRevision: "",
    roomKind: "",
    roomLabel: "",
    activePlayers: 0,
    worldEventId: "",
    worldEventName: "",
    worldEventZoneId: "ashwood",
    worldEventPhase: "",
    worldEventObjective: "",
    worldEventProgress: 0,
    worldEventGoal: 1,
    worldEventTimerMs: 0,
    worldEventReward: "",
    effects: [],
    entities: {},
    players,
    npcs,
    resources: {},
    loots: {},
    hazards: {}
  };
}

function updateVisualStateShell(visualState: MmoSkillDemoState, state: MmoSkillDemoState) {
  visualState.tick = state.tick;
  visualState.mapRevision = state.mapRevision;
  visualState.roomKind = state.roomKind;
  visualState.roomLabel = state.roomLabel;
  visualState.activePlayers = state.activePlayers;
  visualState.worldEventId = state.worldEventId;
  visualState.worldEventName = state.worldEventName;
  visualState.worldEventZoneId = state.worldEventZoneId;
  visualState.worldEventPhase = state.worldEventPhase;
  visualState.worldEventObjective = state.worldEventObjective;
  visualState.worldEventProgress = state.worldEventProgress;
  visualState.worldEventGoal = state.worldEventGoal;
  visualState.worldEventTimerMs = state.worldEventTimerMs;
  visualState.worldEventReward = state.worldEventReward;
  visualState.effects = state.effects ?? [];
  visualState.entities = state.entities;
  visualState.resources = state.resources;
  visualState.loots = state.loots;
  visualState.hazards = state.hazards;
}

function syncVisualPlayer(
  players: Record<string, PlayerEntity>,
  id: string,
  source: PlayerEntity,
  point: SampledPoint,
) {
  let visual = players[id];
  if (!visual) {
    visual = { ...source, x: point.x, y: point.y };
    players[id] = visual;
  } else {
    Object.assign(visual, source);
  }
  visual.activeAbility = stringField(source.activeAbility);
  visual.activeSlot = stringField(source.activeSlot);
  visual.activeMs = numberField(source.activeMs);
  visual.activeDurationMs = numberField(source.activeDurationMs);
  visual.chargeMs = numberField(source.chargeMs);
  visual.abilityTickMs = numberField(source.abilityTickMs);
  visual.abilityHits = stringField(source.abilityHits);
  visual.rushDistance = numberField(source.rushDistance);
  visual.castMs = numberField(source.castMs);
  visual.x = point.x;
  visual.y = point.y;
  return visual;
}

function syncVisualNpc(npcs: Record<string, NpcEntity>, id: string, source: NpcEntity, point: SampledPoint) {
  let visual = npcs[id];
  if (!visual) {
    visual = { ...source, x: point.x, y: point.y };
    npcs[id] = visual;
    return visual;
  }
  Object.assign(visual, source);
  visual.x = point.x;
  visual.y = point.y;
  return visual;
}

function pruneMissing<T>(visuals: Record<string, T>, source: Record<string, unknown> | undefined) {
  for (const id in visuals) {
    if (!source?.[id]) delete visuals[id];
  }
}
