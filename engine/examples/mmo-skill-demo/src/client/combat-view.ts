import type { PlayerEntity } from "../shared.ts";

export const COMBAT_SLOTS = ["LMB", "RMB", "Space", "Q", "E", "R"] as const;
export type CombatSlot = (typeof COMBAT_SLOTS)[number];

type LoosePlayer = PlayerEntity & {
  energy?: unknown;
  maxEnergy?: unknown;
  energyMax?: unknown;
  slotCooldowns?: unknown;
  cooldowns?: unknown;
  activeAbility?: unknown;
  chargeMs?: unknown;
  rushDistance?: unknown;
  rush?: unknown;
  rushMs?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numberField(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function combatNumber(player: PlayerEntity | undefined, field: keyof LoosePlayer, fallback = 0) {
  if (!player) return fallback;
  return numberField((player as LoosePlayer)[field], fallback);
}

export function activeAbility(player: PlayerEntity | undefined) {
  const value = player ? (player as LoosePlayer).activeAbility : undefined;
  return typeof value === "string" ? value : "";
}

export function chargeMs(player: PlayerEntity | undefined) {
  return combatNumber(player, "chargeMs");
}

export function rushMs(player: PlayerEntity | undefined) {
  if (!player) return 0;
  const loose = player as LoosePlayer;
  return numberField(loose.rushMs, numberField(loose.rushDistance, typeof loose.rush === "boolean" && loose.rush ? 1 : 0));
}

export function energyValue(player: PlayerEntity | undefined) {
  return combatNumber(player, "energy");
}

export function energyMax(player: PlayerEntity | undefined) {
  if (!player) return 100;
  const loose = player as LoosePlayer;
  return Math.max(1, numberField(loose.maxEnergy, numberField(loose.energyMax, 100)));
}

export function energyReady(player: PlayerEntity | undefined) {
  return energyValue(player) >= energyMax(player) - 0.001;
}

export function slotCooldownMs(player: PlayerEntity | undefined, slot: CombatSlot) {
  if (!player) return 0;
  const loose = player as LoosePlayer;
  const cooldowns = asRecord(loose.slotCooldowns || loose.cooldowns);
  const candidates = [slot, slot.toLowerCase(), slot === "LMB" ? "lmb" : "", slot === "RMB" ? "rmb" : ""].filter(Boolean);
  for (const key of candidates) {
    const value = numberField(cooldowns[key], Number.NaN);
    if (Number.isFinite(value)) return Math.max(0, value);
  }
  return 0;
}

export function slotUnlocked(player: PlayerEntity | undefined, slot: CombatSlot, fallback: (slot: string) => boolean) {
  if (!player) return true;
  if (slot === "R") {
    const abilitySlots = asRecord((player as LoosePlayer).abilitySlots);
    return Boolean(abilitySlots.R || abilitySlots["r-ultimate"] || abilitySlots["r-finisher"] || abilitySlots["r-overdrive"]);
  }
  return fallback(slot);
}
