import { createObjectPool } from "@hyperfocus/engine";
import { pruneExpiredTimedEffectQueue, pushBoundedEffect, renderablePathCommand, renderableRecord, renderArray, renderRecord, type PathCommand, type PooledRenderCommand, type PooledRenderRecord, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { type PlayerEntity } from "../../shared-contracts.ts";
import type { AimPoint, EffectSink, VisualEffect } from "./types.ts";

type VisualEffectOptions = Partial<Omit<VisualEffect, "id" | "kind" | "x" | "y" | "color" | "startedMs">>;
type PooledRecord = PooledRenderRecord;
let activeRenderPool: RenderFramePool | undefined;

export type EffectQueue = EffectSink & {
  pushRing(x: number, y: number, color: string, timeMs: number, size?: number, options?: VisualEffectOptions): void;
  pushBeam(x: number, y: number, toX: number, toY: number, color: string, timeMs: number, size?: number, options?: VisualEffectOptions): void;
  pushSpark(x: number, y: number, color: string, timeMs: number, size?: number, options?: VisualEffectOptions): void;
  pushSwipe(x: number, y: number, color: string, timeMs: number, size?: number, options?: VisualEffectOptions): void;
  pushAfterimpact(x: number, y: number, color: string, timeMs: number, size?: number, options?: VisualEffectOptions): void;
  toRenderCalls(timeMs: number, out?: Renderable[], pool?: RenderFramePool): Renderable[];
  active(): readonly VisualEffect[];
  prune(predicate: (effect: VisualEffect) => boolean): void;
};

function createPooledVisualEffect(): VisualEffect {
  return {
    id: 0,
    kind: "particle",
    x: 0,
    y: 0,
    color: "",
    startedMs: 0,
    lifetimeMs: 1,
    size: 0
  };
}

function resetPooledVisualEffect(effect: VisualEffect) {
  effect.id = 0;
  effect.kind = "particle";
  effect.x = 0;
  effect.y = 0;
  delete effect.toX;
  delete effect.toY;
  delete effect.controlX;
  delete effect.controlY;
  delete effect.text;
  effect.color = "";
  delete effect.coreColor;
  delete effect.accentColor;
  effect.startedMs = 0;
  effect.lifetimeMs = 1;
  effect.size = 0;
  delete effect.angle;
  delete effect.arc;
  delete effect.count;
  delete effect.seed;
  delete effect.spread;
  delete effect.length;
  delete effect.thickness;
  delete effect.ringCount;
  delete effect.driftX;
  delete effect.driftY;
  delete effect.velocityX;
  delete effect.velocityY;
  delete effect.gravity;
  delete effect.pulse;
  delete effect.rotation;
  delete effect.intensity;
  delete effect.ownerId;
  delete effect.abilityId;
  delete effect.slot;
  delete effect.cleanupOnAbilityEnd;
}

function acquireRenderArray() {
  return renderArray(activeRenderPool);
}

function acquireCall(kind: string) {
  return renderRecord(activeRenderPool, kind);
}

function pushCall(calls: Renderable[], call: PooledRecord) {
  calls.push(renderableRecord(call));
  return call;
}

function pushCircle(calls: Renderable[], x: number, y: number, radius: number) {
  const call = acquireCall("circle");
  call.x = x;
  call.y = y;
  call.radius = radius;
  return pushCall(calls, call);
}

function pushEllipse(calls: Renderable[], x: number, y: number, radiusX: number, radiusY: number) {
  const call = acquireCall("ellipse");
  call.x = x;
  call.y = y;
  call.radiusX = radiusX;
  call.radiusY = radiusY;
  return pushCall(calls, call);
}

function pushLine(calls: Renderable[], x1: number, y1: number, x2: number, y2: number) {
  const call = acquireCall("line");
  call.x1 = x1;
  call.y1 = y1;
  call.x2 = x2;
  call.y2 = y2;
  return pushCall(calls, call);
}

function pushText(calls: Renderable[], text: string, x: number, y: number) {
  const call = acquireCall("text");
  call.text = text;
  call.x = x;
  call.y = y;
  return pushCall(calls, call);
}

function acquirePathCommands() {
  return activeRenderPool ? activeRenderPool.commands() : [];
}

function pathMoveTo(x: number, y: number) {
  const command: PooledRenderCommand = activeRenderPool?.command("moveTo") ?? { kind: "moveTo" };
  command.x = x;
  command.y = y;
  return renderablePathCommand(command);
}

function pathQuadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
  const command: PooledRenderCommand = activeRenderPool?.command("quadraticCurveTo") ?? { kind: "quadraticCurveTo" };
  command.cpx = cpx;
  command.cpy = cpy;
  command.x = x;
  command.y = y;
  return renderablePathCommand(command);
}

function pathArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const command: PooledRenderCommand = activeRenderPool?.command("arc") ?? { kind: "arc" };
  command.x = x;
  command.y = y;
  command.radius = radius;
  command.startAngle = startAngle;
  command.endAngle = endAngle;
  return renderablePathCommand(command);
}

function pushPath(calls: Renderable[], commands: PathCommand[]) {
  const call = acquireCall("path");
  call.commands = commands;
  return pushCall(calls, call);
}

function pushGroup(calls: Renderable[], id: string, x: number, y: number, ySort: number | undefined, alpha: number | undefined, children: Renderable[]) {
  const call = acquireCall("group");
  call.id = id;
  call.x = x;
  call.y = y;
  if (ySort !== undefined) call.ySort = ySort;
  if (alpha !== undefined) call.alpha = alpha;
  call.calls = children;
  return pushCall(calls, call);
}

export function createVisualEffectQueue(maxEffects = 96): EffectQueue {
  const effects: VisualEffect[] = [];
  const effectPool = createObjectPool({ create: createPooledVisualEffect, reset: resetPooledVisualEffect, capacity: maxEffects * 2 });
  let nextEffectId = 1;

  function assignEffect(target: VisualEffect, effect: Omit<VisualEffect, "id">) {
    target.id = nextEffectId++;
    target.kind = effect.kind;
    target.x = effect.x;
    target.y = effect.y;
    target.toX = effect.toX;
    target.toY = effect.toY;
    target.controlX = effect.controlX;
    target.controlY = effect.controlY;
    target.text = effect.text;
    target.color = effect.color;
    target.coreColor = effect.coreColor;
    target.accentColor = effect.accentColor;
    target.startedMs = effect.startedMs;
    target.lifetimeMs = effect.lifetimeMs;
    target.size = effect.size;
    target.angle = effect.angle;
    target.arc = effect.arc;
    target.count = effect.count;
    target.seed = effect.seed;
    target.spread = effect.spread;
    target.length = effect.length;
    target.thickness = effect.thickness;
    target.ringCount = effect.ringCount;
    target.driftX = effect.driftX;
    target.driftY = effect.driftY;
    target.velocityX = effect.velocityX;
    target.velocityY = effect.velocityY;
    target.gravity = effect.gravity;
    target.pulse = effect.pulse;
    target.rotation = effect.rotation;
    target.intensity = effect.intensity;
    target.ownerId = effect.ownerId;
    target.abilityId = effect.abilityId;
    target.slot = effect.slot;
    target.cleanupOnAbilityEnd = effect.cleanupOnAbilityEnd;
    return target;
  }

  function push(effect: Omit<VisualEffect, "id">) {
    pushBoundedEffect(effects, assignEffect(effectPool.acquire(), effect), { maxEffects, onDrop: (removed) => effectPool.release(removed) });
  }

  function pushFloat(text: string, x: number, y: number, color: string, timeMs: number, size = 14) {
    push({ kind: "float", text, x, y, color, startedMs: timeMs, lifetimeMs: 1100, size });
  }

  function pushBurst(x: number, y: number, color: string, timeMs: number, size = 28, text = "") {
    push({ kind: "burst", text, x, y, color, startedMs: timeMs, lifetimeMs: 760, size });
  }

  function pushRing(x: number, y: number, color: string, timeMs: number, size = 24, options: VisualEffectOptions = {}) {
    push({ kind: "ring", x, y, color, startedMs: timeMs, lifetimeMs: 520, size, ...options });
  }

  function pushBeam(x: number, y: number, toX: number, toY: number, color: string, timeMs: number, size = 3, options: VisualEffectOptions = {}) {
    push({ kind: "beam", x, y, toX, toY, color, startedMs: timeMs, lifetimeMs: 280, size, ...options });
  }

  function pushSpark(x: number, y: number, color: string, timeMs: number, size = 18, options: VisualEffectOptions = {}) {
    push({ kind: "spark", x, y, color, startedMs: timeMs, lifetimeMs: 420, size, ...options });
  }

  function pushSwipe(x: number, y: number, color: string, timeMs: number, size = 24, options: VisualEffectOptions = {}) {
    push({ kind: "swipe", x, y, color, startedMs: timeMs, lifetimeMs: 360, size, ...options });
  }

  function pushAfterimpact(x: number, y: number, color: string, timeMs: number, size = 32, options: VisualEffectOptions = {}) {
    push({ kind: "afterimpact", x, y, color, startedMs: timeMs, lifetimeMs: 620, size, ...options });
  }

  function prune(predicate: (effect: VisualEffect) => boolean) {
    let write = 0;
    for (let read = 0; read < effects.length; read += 1) {
      const effect = effects[read];
      if (predicate(effect)) {
        effectPool.release(effect);
        continue;
      }
      effects[write] = effect;
      write += 1;
    }
    effects.length = write;
  }

  function toRenderCalls(timeMs: number, out?: Renderable[], pool?: RenderFramePool) {
    const previousPool = activeRenderPool;
    activeRenderPool = pool;
    try {
      pruneExpiredTimedEffectQueue(effects, timeMs, { onExpire: (effect) => effectPool.release(effect) });
      const frame = out ?? acquireRenderArray();
      for (const effect of effects) appendEffectRenderCall(frame, effect, timeMs);
      return frame;
    } finally {
      activeRenderPool = previousPool;
    }
  }

  return {
    push,
    pushFloat,
    pushBurst,
    pushRing,
    pushBeam,
    pushSpark,
    pushSwipe,
    pushAfterimpact,
    toRenderCalls,
    prune,
    active() {
      return effects;
    }
  };
}

const TAU = Math.PI * 2;
const SHADOW = "rgba(0,0,0,0.44)";
const WHITE_CORE = "rgba(255,255,255,0.9)";
const SOFT_CORE = "rgba(255,255,255,0.52)";

function appendEffectRenderCall(frame: Renderable[], effect: VisualEffect, timeMs: number) {
  const age = Math.max(0, timeMs - effect.startedMs);
  const t = Math.min(1, age / Math.max(1, effect.lifetimeMs));
  const alpha = 1 - t;
  const calls = acquireRenderArray();
  if (effect.kind === "float" && effect.text) {
    appendFloatCalls(calls, effect, t);
  } else if ((effect.kind === "beam" || effect.kind === "tether") && effect.toX !== undefined && effect.toY !== undefined) {
    appendBeamCalls(calls, effect, t, effect.kind === "tether");
  } else if (effect.kind === "ring") {
    appendRingCalls(calls, effect, t);
  } else if (effect.kind === "slash" || effect.kind === "swipe") {
    appendSwipeCalls(calls, effect, t);
  } else if (effect.kind === "burst") {
    appendBurstCalls(calls, effect, t);
  } else if (effect.kind === "spark") {
    appendSparkCalls(calls, effect, t);
  } else if (effect.kind === "afterimpact") {
    appendAfterimpactCalls(calls, effect, t);
  } else if (effect.kind === "particle") {
    appendParticleCalls(calls, effect, t);
  }
  pushGroup(frame, `effect-${effect.id}`, effect.x, effect.y, effect.y, Math.max(0, alpha), calls);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function stableUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function effectSeed(effect: VisualEffect, salt: number) {
  return (effect.seed ?? effect.id * 4099) + salt * 131;
}

function effectEndX(effect: VisualEffect) {
  return effect.toX ?? effect.x;
}

function effectEndY(effect: VisualEffect) {
  return effect.toY ?? effect.y;
}

function effectDirection(effect: VisualEffect, fallback = 0) {
  if (effect.angle !== undefined) return effect.angle;
  const dx = effectEndX(effect) - effect.x;
  const dy = effectEndY(effect) - effect.y;
  return Math.hypot(dx, dy) > 0.01 ? Math.atan2(dy, dx) : fallback;
}

function effectBeamPointX(effect: VisualEffect, t: number, endX = effectEndX(effect)) {
  if (effect.controlX === undefined || effect.controlY === undefined) return effect.x + (endX - effect.x) * t;
  const one = 1 - t;
  return one * one * effect.x + 2 * one * t * effect.controlX + t * t * endX;
}

function effectBeamPointY(effect: VisualEffect, t: number, endY = effectEndY(effect)) {
  if (effect.controlX === undefined || effect.controlY === undefined) return effect.y + (endY - effect.y) * t;
  const one = 1 - t;
  return one * one * effect.y + 2 * one * t * effect.controlY + t * t * endY;
}

function quadraticPath(effect: VisualEffect, x: number, y: number) {
  const commands = acquirePathCommands();
  commands.push(pathMoveTo(effect.x, effect.y), pathQuadraticCurveTo(effect.controlX ?? effect.x, effect.controlY ?? effect.y, x, y));
  return commands;
}

function arcPath(effect: VisualEffect, radius: number, start: number, end: number) {
  const commands = acquirePathCommands();
  commands.push(pathArc(effect.x, effect.y, radius, start, end));
  return commands;
}

function appendFloatCalls(calls: Renderable[], effect: VisualEffect, t: number) {
  const y = effect.y - easeOutCubic(t) * 34 - Math.sin(t * Math.PI) * 4;
  const font = `800 ${effect.size}px system-ui`;
  const shadow = pushText(calls, effect.text ?? "", effect.x, y);
  shadow.font = font;
  shadow.align = "center";
  shadow.stroke = "rgba(0,0,0,0.72)";
  shadow.fill = "rgba(0,0,0,0)";
  shadow.lineWidth = 3;
  const text = pushText(calls, effect.text ?? "", effect.x, y);
  text.font = font;
  text.align = "center";
  text.fill = effect.color;
}

function appendBeamCalls(calls: Renderable[], effect: VisualEffect, t: number, tether: boolean) {
  const endX = effectEndX(effect);
  const endY = effectEndY(effect);
  const width = effect.thickness ?? effect.size;
  const core = effect.coreColor ?? WHITE_CORE;
  const accent = effect.accentColor ?? SOFT_CORE;
  const travel = clamp01(t * 1.35);
  const drawEndX = effectBeamPointX(effect, travel, endX);
  const drawEndY = effectBeamPointY(effect, travel, endY);
  const curved = tether && effect.controlX !== undefined && effect.controlY !== undefined;

  if (curved) {
    const glow = pushPath(calls, quadraticPath(effect, drawEndX, drawEndY));
    glow.stroke = accent;
    glow.lineWidth = width + 6;
    glow.cap = "round";
    glow.shadowColor = effect.color;
    glow.shadowBlur = 10;
    const beam = pushPath(calls, quadraticPath(effect, drawEndX, drawEndY));
    beam.stroke = effect.color;
    beam.lineWidth = width + 1;
    beam.cap = "round";
    const coreBeam = pushPath(calls, quadraticPath(effect, drawEndX, drawEndY));
    coreBeam.stroke = core;
    coreBeam.lineWidth = Math.max(1, width * 0.38);
    coreBeam.cap = "round";
  } else {
    const glow = pushLine(calls, effect.x, effect.y, drawEndX, drawEndY);
    glow.stroke = accent;
    glow.lineWidth = width + 6;
    glow.cap = "round";
    glow.shadowColor = effect.color;
    glow.shadowBlur = 10;
    const beam = pushLine(calls, effect.x, effect.y, drawEndX, drawEndY);
    beam.stroke = effect.color;
    beam.lineWidth = width + 1;
    beam.cap = "round";
    const coreBeam = pushLine(calls, effect.x, effect.y, drawEndX, drawEndY);
    coreBeam.stroke = core;
    coreBeam.lineWidth = Math.max(1, width * 0.38);
    coreBeam.cap = "round";
  }

  const count = effect.count ?? (tether ? 6 : 4);
  const angle = Math.atan2(endY - effect.y, endX - effect.x);
  const normal = angle + Math.PI / 2;
  for (let i = 0; i < count; i += 1) {
    const u = clamp01((i + stableUnit(effectSeed(effect, i))) / Math.max(1, count));
    if (u > travel + 0.05) continue;
    const pointX = effectBeamPointX(effect, u, endX);
    const pointY = effectBeamPointY(effect, u, endY);
    const jitter = (stableUnit(effectSeed(effect, i + 31)) - 0.5) * width * (tether ? 4 : 2.5);
    const particle = pushCircle(calls, pointX + Math.cos(normal) * jitter, pointY + Math.sin(normal) * jitter, Math.max(1.2, width * 0.55));
    particle.fill = core;
  }
  const endpoint = pushCircle(calls, drawEndX, drawEndY, Math.max(3, width * (1.4 + t * 1.2)));
  endpoint.stroke = core;
  endpoint.lineWidth = Math.max(1, width * 0.45);
}

function appendRingCalls(calls: Renderable[], effect: VisualEffect, t: number, ringCount?: number, pulseOverride?: number, sizeOverride?: number, countOverride?: number) {
  const size = sizeOverride ?? effect.size;
  const rings = Math.max(1, ringCount ?? effect.ringCount ?? 2);
  const pulse = pulseOverride ?? effect.pulse ?? 1;
  const shadow = pushEllipse(calls, effect.x, effect.y + size * 0.1, size * (0.44 + t * 0.72), size * (0.17 + t * 0.28));
  shadow.fill = "rgba(255,255,255,0.06)";
  for (let i = 0; i < rings; i += 1) {
    const localT = clamp01((t - i * 0.14) / Math.max(0.2, 1 - i * 0.14));
    const eased = easeOutCubic(localT);
    const radius = size * (0.34 + eased * (1.1 + i * 0.18)) * pulse;
    const lineWidth = Math.max(1, (effect.thickness ?? 2.4) * (1 - localT * 0.45));
    const ring = pushCircle(calls, effect.x, effect.y, radius);
    ring.stroke = i === 0 ? effect.color : (effect.accentColor ?? SOFT_CORE);
    ring.lineWidth = lineWidth;
    ring.shadowColor = effect.color;
    ring.shadowBlur = i === 0 ? 8 : 0;
    ring.alpha = 1 - localT * 0.35;
  }
  const notchCount = countOverride ?? effect.count ?? 6;
  for (let i = 0; i < notchCount; i += 1) {
    const angle = (effect.rotation ?? 0) + (TAU * i) / notchCount;
    const inner = size * (0.46 + t * 0.58);
    const outer = inner + size * 0.16;
    const notch = pushLine(calls, effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner, effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer);
    notch.stroke = effect.accentColor ?? effect.color;
    notch.lineWidth = 1.3;
    notch.cap = "round";
    notch.alpha = 0.75;
  }
}

function appendSwipeCalls(calls: Renderable[], effect: VisualEffect, t: number) {
  const angle = effectDirection(effect, 0.225);
  const arc = effect.arc ?? (effect.kind === "slash" ? 2.25 : 1.45);
  const radius = (effect.length ?? effect.size) * (0.72 + easeOutCubic(t) * 0.34);
  const start = angle - arc / 2 + t * 0.28;
  const end = angle + arc / 2 + t * 0.28;
  const shadow = pushPath(calls, arcPath(effect, radius + 4, start, end));
  shadow.stroke = SHADOW;
  shadow.lineWidth = Math.max(5, effect.size * 0.18);
  shadow.cap = "round";
  const slash = pushPath(calls, arcPath(effect, radius, start, end));
  slash.stroke = effect.color;
  slash.lineWidth = effect.thickness ?? 3.2;
  slash.cap = "round";
  slash.shadowColor = effect.color;
  slash.shadowBlur = 8;
  const core = pushPath(calls, arcPath(effect, radius - Math.max(3, effect.size * 0.16), start + 0.2, end - 0.15));
  core.stroke = effect.coreColor ?? WHITE_CORE;
  core.lineWidth = 1.2;
  core.cap = "round";
  for (let i = 0; i < 3; i += 1) {
    const u = (i + 1) / 4;
    const tipAngle = start + (end - start) * u;
    const tipRadius = radius + effect.size * (0.08 + stableUnit(effectSeed(effect, i)) * 0.08);
    const tip = pushLine(calls, effect.x + Math.cos(tipAngle) * (tipRadius - effect.size * 0.18), effect.y + Math.sin(tipAngle) * (tipRadius - effect.size * 0.18), effect.x + Math.cos(tipAngle) * tipRadius, effect.y + Math.sin(tipAngle) * tipRadius);
    tip.stroke = effect.accentColor ?? effect.color;
    tip.lineWidth = 1.4;
    tip.cap = "round";
  }
}

function appendBurstCalls(calls: Renderable[], effect: VisualEffect, t: number) {
  const core = pushCircle(calls, effect.x, effect.y, effect.size * (0.18 + t * 0.25));
  core.fill = effect.coreColor ?? WHITE_CORE;
  core.alpha = 0.62;
  const ring = pushCircle(calls, effect.x, effect.y, effect.size * (0.28 + easeOutCubic(t)));
  ring.stroke = effect.color;
  ring.lineWidth = effect.thickness ?? 2;
  ring.shadowColor = effect.color;
  ring.shadowBlur = 10;
  appendSparkCalls(calls, effect, t, effect.count ?? 10, effect.spread ?? TAU, effect.size * 0.82);
  if (effect.text) {
    const y = effect.y - effect.size * 0.7 - t * 20;
    const font = `800 ${Math.max(12, effect.size * 0.45)}px system-ui`;
    const shadow = pushText(calls, effect.text, effect.x, y);
    shadow.font = font;
    shadow.align = "center";
    shadow.stroke = "rgba(0,0,0,0.62)";
    shadow.lineWidth = 3;
    shadow.fill = "rgba(0,0,0,0)";
    const label = pushText(calls, effect.text, effect.x, y);
    label.font = font;
    label.align = "center";
    label.fill = effect.color;
  }
}

function appendSparkCalls(calls: Renderable[], effect: VisualEffect, t: number, countOverride?: number, spreadOverride?: number, sizeOverride?: number, lengthOverride?: number) {
  const size = sizeOverride ?? effect.size;
  const count = Math.max(1, countOverride ?? effect.count ?? 12);
  const spread = spreadOverride ?? effect.spread ?? TAU;
  const baseAngle = effectDirection(effect, -Math.PI / 2);
  const fullCircle = spread >= TAU - 0.01;
  const eased = easeOutCubic(t);
  const reach = lengthOverride ?? effect.length ?? size;
  for (let i = 0; i < count; i += 1) {
    const seed = effectSeed(effect, i);
    const angle = fullCircle ? stableUnit(seed) * TAU : baseAngle + (stableUnit(seed) - 0.5) * spread;
    const speed = 0.42 + stableUnit(seed + 7) * 0.78;
    const travel = reach * (0.18 + eased * speed);
    const tail = Math.max(3, size * (0.12 + stableUnit(seed + 13) * 0.12));
    const driftX = (effect.driftX ?? 0) * t;
    const driftY = (effect.driftY ?? 0) * t + (effect.gravity ?? 0) * t * t;
    const x2 = effect.x + Math.cos(angle) * travel + driftX;
    const y2 = effect.y + Math.sin(angle) * travel + driftY;
    const spark = pushLine(calls, x2 - Math.cos(angle) * tail, y2 - Math.sin(angle) * tail, x2, y2);
    spark.stroke = i % 3 === 0 ? (effect.coreColor ?? WHITE_CORE) : effect.color;
    spark.lineWidth = Math.max(1, (effect.thickness ?? 2) * (0.55 + stableUnit(seed + 23) * 0.5));
    spark.cap = "round";
    spark.shadowColor = effect.color;
    spark.shadowBlur = 5;
  }
}

function appendParticleCalls(calls: Renderable[], effect: VisualEffect, t: number, countOverride?: number, spreadOverride?: number, gravityOverride?: number, sizeOverride?: number) {
  const size = sizeOverride ?? effect.size;
  const dx = effectEndX(effect) - effect.x;
  const dy = effectEndY(effect) - effect.y;
  const lineLength = Math.hypot(dx, dy);
  const count = Math.max(1, countOverride ?? effect.count ?? (lineLength > 20 ? 12 : 9));
  const baseAngle = effectDirection(effect, -Math.PI / 2) + (lineLength > 20 ? Math.PI : 0);
  const travelLength = effect.length ?? size;
  const seconds = (Math.max(1, effect.lifetimeMs) * t) / 1000;
  for (let i = 0; i < count; i += 1) {
    const seed = effectSeed(effect, i);
    const along = lineLength > 20 ? stableUnit(seed + 3) : 0;
    const originX = effect.x + dx * along * Math.min(1, t + 0.25);
    const originY = effect.y + dy * along * Math.min(1, t + 0.25);
    const angle = baseAngle + (stableUnit(seed + 11) - 0.5) * (spreadOverride ?? effect.spread ?? 1.45);
    const travel = travelLength * easeOutCubic(t) * (0.42 + stableUnit(seed + 19) * 0.78);
    const x = originX + Math.cos(angle) * travel + (effect.driftX ?? 0) * t + (effect.velocityX ?? 0) * seconds;
    const y = originY + Math.sin(angle) * travel + (effect.driftY ?? 0) * t + (effect.velocityY ?? 0) * seconds + (gravityOverride ?? effect.gravity ?? 0) * t * t;
    const particle = pushCircle(calls, x, y, Math.max(1.2, size * (0.075 + stableUnit(seed + 29) * 0.055) * (1 - t * 0.32)));
    particle.fill = i % 4 === 0 ? (effect.coreColor ?? WHITE_CORE) : effect.color;
    particle.shadowColor = effect.color;
    particle.shadowBlur = 5;
  }
}

function appendAfterimpactCalls(calls: Renderable[], effect: VisualEffect, t: number) {
  const intensity = effect.intensity ?? 1;
  appendRingCalls(calls, effect, t, effect.ringCount ?? 3, effect.pulse ?? intensity);
  const cracks = effect.count ?? 7;
  for (let i = 0; i < cracks; i += 1) {
    const seed = effectSeed(effect, i);
    const angle = stableUnit(seed) * TAU;
    const inner = effect.size * (0.18 + stableUnit(seed + 5) * 0.18);
    const outer = effect.size * (0.52 + easeOutCubic(t) * (0.48 + stableUnit(seed + 9) * 0.35)) * intensity;
    const crack = pushLine(calls, effect.x + Math.cos(angle) * inner, effect.y + Math.sin(angle) * inner, effect.x + Math.cos(angle) * outer, effect.y + Math.sin(angle) * outer);
    crack.stroke = i % 2 === 0 ? effect.color : (effect.accentColor ?? SOFT_CORE);
    crack.lineWidth = Math.max(1, (effect.thickness ?? 2) * (1 - t * 0.5));
    crack.cap = "round";
    crack.alpha = 0.82;
  }
  appendParticleCalls(calls, effect, t, Math.max(8, cracks + 3), TAU, effect.gravity ?? 14, effect.size * 0.65);
}

export function createAimReticleRenderCalls(player: PlayerEntity | undefined, aim?: AimPoint, out: Renderable[] = [], pool?: RenderFramePool, options: { alpha?: number } = {}): Renderable[] {
  const previousPool = activeRenderPool;
  activeRenderPool = pool;
  try {
    const target = aim ?? (player ? { x: player.aimX, y: player.aimY } : undefined);
    if (!target) return out;
    const x = target.x;
    const y = target.y;
    const calls = acquireRenderArray();
    const circle = pushCircle(calls, x, y, 9);
    circle.stroke = "rgba(245, 243, 232, 0.78)";
    circle.lineWidth = 1.5;
    const left = pushLine(calls, x - 15, y, x - 6, y);
    left.stroke = "rgba(245, 243, 232, 0.78)";
    left.lineWidth = 1.5;
    const right = pushLine(calls, x + 6, y, x + 15, y);
    right.stroke = "rgba(245, 243, 232, 0.78)";
    right.lineWidth = 1.5;
    const top = pushLine(calls, x, y - 15, x, y - 6);
    top.stroke = "rgba(245, 243, 232, 0.78)";
    top.lineWidth = 1.5;
    const bottom = pushLine(calls, x, y + 6, x, y + 15);
    bottom.stroke = "rgba(245, 243, 232, 0.78)";
    bottom.lineWidth = 1.5;
    pushGroup(out, "aim-reticle", x, y, undefined, options.alpha, calls);
    return out;
  } finally {
    activeRenderPool = previousPool;
  }
}
