import { createObjectPool } from "../runtime/object-pool.ts";

export type CompactTransientEffect = {
  id: string;
  kind: "line" | "aoe";
  zoneId: string;
  x: number;
  y: number;
  toX: number;
  toY: number;
  radius: number;
  ageMs: number;
  lifetimeMs: number;
  effectKind: string;
  text: string;
  pulse: number;
  priority: number;
};

export type TransientEffectTarget = {
  x: number;
  y: number;
  radius: number;
  zoneId?: string;
};

export type TransientEffectSpawn = Partial<Pick<CompactTransientEffect, "ageMs" | "priority" | "text" | "pulse">> &
  Omit<CompactTransientEffect, "ageMs" | "priority" | "text" | "pulse">;

export type TransientEffectSelectOptions = {
  maxEffects?: number;
};

export const transientEffectSchemaFields = {
  id: "string:32",
  kind: "string:8",
  zoneId: "string:16",
  x: "f32",
  y: "f32",
  toX: "f32",
  toY: "f32",
  radius: "u16",
  ageMs: "u16",
  lifetimeMs: "u16",
  effectKind: "string:16",
  text: "string:64",
  pulse: "u16",
  priority: "u16"
} as const;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function u16(value: number) {
  const normalized = Number.isNaN(value) ? 0 : value;
  return Math.max(0, Math.min(65535, Math.floor(normalized)));
}

function effectLimit(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
  return value;
}

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function finiteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number`);
  return value;
}

function createPooledTransientEffect(): CompactTransientEffect {
  return {
    id: "",
    kind: "aoe",
    zoneId: "",
    x: 0,
    y: 0,
    toX: 0,
    toY: 0,
    radius: 0,
    ageMs: 0,
    lifetimeMs: 1,
    effectKind: "",
    text: "",
    pulse: 0,
    priority: 0
  };
}

function resetPooledTransientEffect(effect: CompactTransientEffect) {
  effect.id = "";
  effect.kind = "aoe";
  effect.zoneId = "";
  effect.x = 0;
  effect.y = 0;
  effect.toX = 0;
  effect.toY = 0;
  effect.radius = 0;
  effect.ageMs = 0;
  effect.lifetimeMs = 1;
  effect.effectKind = "";
  effect.text = "";
  effect.pulse = 0;
  effect.priority = 0;
}

const transientEffectPool = createObjectPool({
  create: createPooledTransientEffect,
  reset: resetPooledTransientEffect,
  capacity: 1024
});

function assignNormalizedEffect(target: CompactTransientEffect, effect: TransientEffectSpawn) {
  target.id = effect.id.slice(0, 32);
  target.kind = effect.kind === "line" ? "line" : "aoe";
  target.zoneId = effect.zoneId.slice(0, 16);
  target.x = finite(effect.x);
  target.y = finite(effect.y);
  target.toX = finite(effect.toX, effect.x);
  target.toY = finite(effect.toY, effect.y);
  target.radius = u16(effect.radius);
  target.ageMs = u16(effect.ageMs ?? 0);
  target.lifetimeMs = Math.max(1, u16(effect.lifetimeMs));
  target.effectKind = effect.effectKind.slice(0, 16);
  target.text = (effect.text ?? "").slice(0, 64);
  target.pulse = u16(effect.pulse ?? 0);
  target.priority = u16(effect.priority ?? 0);
  return target;
}

function effectBounds(effect: CompactTransientEffect) {
  if (effect.kind !== "line") return { x: effect.x, y: effect.y, radius: effect.radius };
  return {
    x: (effect.x + effect.toX) * 0.5,
    y: (effect.y + effect.toY) * 0.5,
    radius: effect.radius + Math.hypot(effect.toX - effect.x, effect.toY - effect.y) * 0.5
  };
}

function distanceSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function spawnTransientEffect(lane: CompactTransientEffect[], effect: TransientEffectSpawn, maxEffects = 512) {
  effectLimit(maxEffects, "maxEffects");
  const pooled = transientEffectPool.acquire();
  try {
    lane.push(assignNormalizedEffect(pooled, effect));
  } catch (error) {
    transientEffectPool.release(pooled);
    throw error;
  }
  while (lane.length > maxEffects) {
    const removed = lane.shift();
    if (removed) transientEffectPool.release(removed);
  }
}

export function updateTransientEffects(lane: CompactTransientEffect[], dt: number) {
  const ms = u16(nonNegativeFinite(dt, "effect delta") * 1000);
  let write = 0;
  for (let read = 0; read < lane.length; read += 1) {
    const effect = lane[read];
    effect.ageMs = u16(effect.ageMs + ms);
    if (effect.ageMs >= effect.lifetimeMs) {
      transientEffectPool.release(effect);
      continue;
    }
    lane[write] = effect;
    write += 1;
  }
  lane.length = write;
}

export function selectTransientEffectsForViewer(
  lane: readonly CompactTransientEffect[],
  target: TransientEffectTarget,
  options: TransientEffectSelectOptions = {}
) {
  const maxEffects = effectLimit(options.maxEffects ?? 64, "maxEffects");
  finiteNumber(target.x, "viewer x");
  finiteNumber(target.y, "viewer y");
  nonNegativeFinite(target.radius, "viewer radius");
  const candidates: Array<{ effect: CompactTransientEffect; distanceSq: number }> = [];
  for (const effect of lane) {
    if (target.zoneId && effect.zoneId && effect.zoneId !== target.zoneId) continue;
    const bounds = effectBounds(effect);
    const reach = target.radius + bounds.radius;
    const distSq = distanceSq(target.x, target.y, bounds.x, bounds.y);
    if (distSq > reach * reach) continue;
    candidates.push({ effect, distanceSq: distSq });
  }
  candidates.sort((a, b) => {
    const priority = b.effect.priority - a.effect.priority;
    if (priority !== 0) return priority;
    const distance = a.distanceSq - b.distanceSq;
    if (distance !== 0) return distance;
    return a.effect.id.localeCompare(b.effect.id);
  });
  return candidates.slice(0, maxEffects).map((candidate) => ({ ...candidate.effect }));
}
