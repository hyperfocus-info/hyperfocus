import type { MmoVec2 } from "./types.ts";

export type MmoAbilityRuntime = {
  activeAbility: string;
  activeSlot: string;
  activeMs: number;
  activeDurationMs: number;
  chargeMs: number;
  abilityVectorX: number;
  abilityVectorY: number;
  abilityTickMs: number;
  abilityHits: string;
};

export type MmoAbilityTickResult = {
  previousMs: number;
  activeMs: number;
  elapsedMs: number;
};

function finiteMs(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function clampU16Ms(value: number) {
  return Math.max(0, Math.min(65535, Math.floor(value)));
}

function positiveSafeLimit(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function normalizedDirection(direction: MmoVec2): MmoVec2 {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return { x: 1, y: 0 };
  const scale = Math.max(Math.abs(direction.x), Math.abs(direction.y));
  if (scale === 0) return { x: 1, y: 0 };
  const scaledX = direction.x / scale;
  const scaledY = direction.y / scale;
  const length = Math.hypot(scaledX, scaledY);
  return { x: scaledX / length, y: scaledY / length };
}

function tickLimit(value: number) {
  if (value === Number.POSITIVE_INFINITY) return 65535;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(65535, Math.floor(value));
}

export function beginMmoAbility(actor: MmoAbilityRuntime, slot: string, abilityId: string, durationMs: number, direction: MmoVec2 = { x: 1, y: 0 }) {
  const normalized = normalizedDirection(direction);
  actor.activeAbility = abilityId;
  actor.activeSlot = slot;
  actor.activeMs = 0;
  actor.activeDurationMs = finiteMs(durationMs);
  actor.chargeMs = 0;
  actor.abilityVectorX = normalized.x;
  actor.abilityVectorY = normalized.y;
  actor.abilityTickMs = 0;
  actor.abilityHits = "";
}

export function clearMmoAbility(actor: MmoAbilityRuntime) {
  actor.activeAbility = "";
  actor.activeSlot = "";
  actor.activeMs = 0;
  actor.activeDurationMs = 0;
  actor.chargeMs = 0;
  actor.abilityTickMs = 0;
  actor.abilityHits = "";
}

export function tickMmoAbility(actor: MmoAbilityRuntime, dtSeconds: number): MmoAbilityTickResult {
  const previousMs = finiteMs(actor.activeMs);
  const elapsedMs = finiteMs(dtSeconds * 1000);
  actor.activeMs = clampU16Ms(previousMs + elapsedMs);
  return { previousMs, activeMs: actor.activeMs, elapsedMs };
}

export function chargeMmoAbility(actor: MmoAbilityRuntime, maxChargeMs: number) {
  actor.chargeMs = Math.min(finiteMs(maxChargeMs), finiteMs(actor.activeMs));
  return actor.chargeMs;
}

export function mmoAbilityReady(actor: MmoAbilityRuntime, castMs: number) {
  return finiteMs(actor.activeMs) >= finiteMs(castMs);
}

export function tickMmoAbilityInterval(actor: MmoAbilityRuntime, dtSeconds: number, intervalMs: number, onTick: () => void, maxTicks = Number.POSITIVE_INFINITY) {
  let remainingMs = clampU16Ms(finiteMs(actor.abilityTickMs) + finiteMs(dtSeconds * 1000));
  const interval = Math.max(1, finiteMs(intervalMs));
  const ticks = Math.min(Math.floor(remainingMs / interval), tickLimit(maxTicks));
  for (let tick = 0; tick < ticks; tick += 1) {
    remainingMs -= interval;
    actor.abilityTickMs = remainingMs;
    try {
      onTick();
    } catch (error) {
      actor.abilityTickMs = remainingMs;
      throw error;
    }
  }
  actor.abilityTickMs = remainingMs;
  return ticks;
}

export function hasMmoAbilityEvent(actor: Pick<MmoAbilityRuntime, "abilityHits">, value: string) {
  return (actor.abilityHits || "").split("|").includes(value);
}

export function markMmoAbilityEvent(actor: Pick<MmoAbilityRuntime, "abilityHits">, value: string, maxLength = 192) {
  if (hasMmoAbilityEvent(actor, value)) return;
  actor.abilityHits = [...(actor.abilityHits || "").split("|").filter(Boolean), value].join("|").slice(0, positiveSafeLimit(maxLength, "ability event maxLength"));
}

export function mmoAbilityEventMs(actor: Pick<MmoAbilityRuntime, "abilityHits">, prefix: string, id: string) {
  const entry = (actor.abilityHits || "").split("|").find((part) => part.startsWith(`${prefix}:${id}:`));
  if (!entry) return Number.NEGATIVE_INFINITY;
  const value = Number(entry.split(":")[2]);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function markMmoAbilityEventMs(actor: Pick<MmoAbilityRuntime, "abilityHits">, prefix: string, id: string, ms: number, maxEntries = 12, maxLength = 192) {
  const key = `${prefix}:${id}:`;
  const entries = (actor.abilityHits || "").split("|").filter((part) => part && !part.startsWith(key));
  entries.push(`${key}${finiteMs(ms)}`);
  actor.abilityHits = entries
    .slice(-positiveSafeLimit(maxEntries, "ability event maxEntries"))
    .join("|")
    .slice(0, positiveSafeLimit(maxLength, "ability event maxLength"));
}
