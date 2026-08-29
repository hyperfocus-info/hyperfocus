import { ARENA_DATA } from "../arena-data.ts";
import { state } from "./arena-state.ts";
import { DEFAULT_CLASS_ID, DEFAULT_CLASS_LEVEL, MAX_LOADOUT_PASSIVES, PASSIVE_TEAMWORK_EFFECTS, data, passiveItemsById, playerClasses, playerClassesById } from "./content-runtime.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const classPassiveUnlocks = runtimeCallback("contentUi", "classPassiveUnlocks");
const classUnlocks = runtimeCallback("contentUi", "classUnlocks");
const classWeaponUnlocks = runtimeCallback("contentUi", "classWeaponUnlocks");
const displayNameForUnlock = runtimeCallback("contentUi", "displayNameForUnlock");
const saveClassLevels = runtimeCallback("contentUi", "saveClassLevels");
const saveClassLoadouts = runtimeCallback("contentUi", "saveClassLoadouts");
const clamp = runtimeCallback("hud", "clamp");
const toast = runtimeCallback("hud", "toast");
const updateHud = runtimeCallback("hud", "updateHud");
const focusLoadoutOption = runtimeCallback("progressionUi", "focusLoadoutOption");
const renderClassPicker = runtimeCallback("progressionUi", "renderClassPicker");
const worldDistanceSquared = runtimeCallback("worldMath", "worldDistanceSquared");
import { remotePlayers } from "./runtime-context.ts";
import type { ClassLoadout, ResolvedClassLoadout } from "./content-runtime.ts";
import type { ClassUnlock, PlayerClassDefinition, ProgressionBonus } from "./content-types.ts";
import type { ClassLevelNotice, ProgressionStats } from "./runtime-types.ts";

export { normalizeArenaData, resolveWeaponKnockback, expandArenaProps, wrapValue } from "./arena-normalization.ts";

export function selectedClass(): PlayerClassDefinition | undefined {
  return playerClassesById.get(state.selectedClassId) ?? playerClasses[0];
}

export function selectedClassLevel(): number {
  return classLevelFor(selectedClass()?.id);
}

export function classLevelFor(classId: string | null | undefined): number {
  const storedLevel = typeof classId === "string" ? state.classLevels.get(classId) : undefined;
  return Math.max(DEFAULT_CLASS_LEVEL, Math.floor(Number(storedLevel ?? DEFAULT_CLASS_LEVEL) || DEFAULT_CLASS_LEVEL));
}

export function classMaxUnlockLevel(klass: PlayerClassDefinition | null | undefined): number {
  return Math.max(DEFAULT_CLASS_LEVEL, ...classUnlocks(klass).map((unlock) => unlock.level));
}

export function classNextUnlocks(
  klass: PlayerClassDefinition | null | undefined,
  level = classLevelFor(klass?.id)
): Array<ClassUnlock & { kind: "weapon" | "passive" }> {
  const nextLevel = classUnlocks(klass).find((unlock) => unlock.level > level)?.level;
  if (!nextLevel) return [];
  return classUnlocks(klass).filter((unlock) => unlock.level === nextLevel);
}

export function classUnlocksAtLevel(
  klass: PlayerClassDefinition | null | undefined,
  level: number
): Array<ClassUnlock & { kind: "weapon" | "passive" }> {
  return classUnlocks(klass).filter((unlock) => unlock.level === level);
}

export function classUnlockedWeaponIds(klass = selectedClass(), level = classLevelFor(klass?.id)): string[] {
  return classWeaponUnlocks(klass)
    .filter((unlock) => unlock.level <= level)
    .map((unlock) => unlock.id);
}

export function classUnlockedPassiveIds(klass = selectedClass(), level = classLevelFor(klass?.id)): string[] {
  return classPassiveUnlocks(klass)
    .filter((unlock) => unlock.level <= level)
    .map((unlock) => unlock.id);
}

export type ClassUnlockKind = "weapon" | "passive";

export function isClassUnlockAvailable(
  klass: PlayerClassDefinition | null | undefined,
  id: string | null | undefined,
  kind: ClassUnlockKind,
  level = classLevelFor(klass?.id)
): boolean {
  const unlocks = kind === "weapon" ? classWeaponUnlocks(klass) : classPassiveUnlocks(klass);
  const unlock = unlocks.find((entry) => entry.id === id);
  return Boolean(unlock && unlock.level <= level);
}

export function firstUnlockedId(unlocks: ClassUnlock[], level: number, fallbackId?: string): string | null {
  const unlocked = unlocks.find((unlock) => unlock.level <= level);
  if (unlocked) return unlocked.id;
  return fallbackId ?? unlocks[0]?.id ?? null;
}

export function normalizeLoadoutPassiveIds(
  klass: PlayerClassDefinition | null | undefined,
  current: ClassLoadout,
  level: number,
  passiveUnlocks: ClassUnlock[]
): string[] {
  const ids: string[] = [];
  const push = (id: string | null | undefined): void => {
    if (typeof id !== "string" || ids.includes(id)) return;
    if (!isClassUnlockAvailable(klass, id, "passive", level)) return;
    ids.push(id);
  };
  for (const id of Array.isArray(current.passiveIds) ? current.passiveIds : []) push(id);
  push(current.passiveId);
  for (const id of klass?.starterPassives ?? []) push(id);
  for (const unlock of passiveUnlocks) {
    if (ids.length >= MAX_LOADOUT_PASSIVES) break;
    push(unlock.id);
  }
  return ids.slice(0, MAX_LOADOUT_PASSIVES);
}

export function configuredLoadoutForClass(klass = selectedClass()): ResolvedClassLoadout {
  const classId = klass?.id ?? DEFAULT_CLASS_ID;
  const level = classLevelFor(classId);
  const current = state.configuredLoadouts[classId] ?? {};
  const weaponUnlocks = classWeaponUnlocks(klass);
  const passiveUnlocks = classPassiveUnlocks(klass);
  const fallbackWeapon = firstUnlockedId(weaponUnlocks, level, klass?.starterWeapon);
  const weaponId = isClassUnlockAvailable(klass, current.weaponId, "weapon", level) ? current.weaponId : fallbackWeapon;
  const passiveIds = normalizeLoadoutPassiveIds(klass, current, level, passiveUnlocks);
  const next: ResolvedClassLoadout = { weaponId: weaponId ?? undefined, passiveIds };
  const rawCurrentPassiveIds = Array.isArray(current.passiveIds) ? current.passiveIds : [current.passiveId].filter(Boolean);
  const currentKey = `${current.weaponId ?? ""}|${rawCurrentPassiveIds.join(",")}`;
  const nextKey = `${next.weaponId ?? ""}|${next.passiveIds.join(",")}`;
  if (currentKey !== nextKey) {
    state.configuredLoadouts[classId] = next;
    saveClassLoadouts();
  }
  return next;
}

export function setConfiguredLoadout(kind: ClassUnlockKind, id: string): void {
  const klass = selectedClass();
  if (!klass) return;
  if (!isClassUnlockAvailable(klass, id, kind)) {
    const unlocks = kind === "weapon" ? classWeaponUnlocks(klass) : classPassiveUnlocks(klass);
    const unlock = unlocks.find((entry) => entry.id === id);
    toast(`Unlocks at class L${unlock?.level ?? "?"}`);
    return;
  }
  const current = configuredLoadoutForClass(klass);
  let toastText = `${displayNameForUnlock(id)} equipped`;
  if (kind === "weapon") {
    state.configuredLoadouts[klass.id] = { ...current, weaponId: id };
  } else {
    let passiveIds = [...(current.passiveIds ?? [])];
    const index = passiveIds.indexOf(id);
    if (index >= 0) {
      if (passiveIds.length > 1) {
        passiveIds.splice(index, 1);
        toastText = `${displayNameForUnlock(id)} removed`;
      }
    } else if (passiveIds.length < MAX_LOADOUT_PASSIVES) {
      passiveIds.push(id);
      toastText = `${displayNameForUnlock(id)} equipped (${passiveIds.length}/${MAX_LOADOUT_PASSIVES})`;
    } else {
      passiveIds = [...passiveIds.slice(1), id];
      toastText = `${displayNameForUnlock(id)} equipped (${MAX_LOADOUT_PASSIVES}/${MAX_LOADOUT_PASSIVES})`;
    }
    state.configuredLoadouts[klass.id] = { ...current, passiveIds };
  }
  saveClassLoadouts();
  renderClassPicker();
  updateHud(0, true);
  toast(toastText);
  focusLoadoutOption(kind, id);
}

export function advanceSelectedClassLevel(): ClassLevelNotice | null {
  const klass = selectedClass();
  if (!klass) return null;
  const previous = classLevelFor(klass.id);
  const next = previous + 1;
  state.classLevels.set(klass.id, next);
  const unlocked = classUnlocksAtLevel(klass, next);
  state.classLevelNotice = { classId: klass.id, level: next, unlocked };
  saveClassLevels();
  return state.classLevelNotice;
}

export function classUnlockNoticeText(notice: ClassLevelNotice | null | undefined): string {
  if (!notice?.unlocked?.length) return "";
  return notice.unlocked.map((unlock) => displayNameForUnlock(unlock.id)).slice(0, 2).join(" + ");
}

export function xpForLevel(level: number): number {
  const curve = data.progression ?? {};
  const base = curve.xpCurveBase ?? 24;
  const power = curve.xpCurvePower ?? 1.28;
  const linear = curve.xpCurveLinear ?? 8;
  return Math.max(8, Math.round(base * Math.pow(Math.max(1, level), power) + linear * Math.max(1, level)));
}

export function createProgressionStats(): ProgressionStats {
  return {
    maxHpFlat: 0,
    maxHpMultiplier: 1,
    regenFlat: 0,
    moveSpeedMultiplier: 1,
    jumpHeightMultiplier: 1,
    gravityMultiplier: 1,
    maxJumpsFlat: 0,
    cooldownMultiplier: 1,
    damageMultiplier: 1,
    projectileSpeedMultiplier: 1,
    projectileSizeMultiplier: 1,
    projectileCountFlat: 0,
    splashDamageFlat: 0,
    pickupRadiusFlat: 0,
    armorFlat: 0,
    knockbackForceMultiplier: 1,
    knockbackResistFlat: 0,
    contactGraceSecondsFlat: 0,
    contactThornsDamage: 0,
    effectDurationMultiplier: 1,
    auraRadiusMultiplier: 1,
    auraDamageMultiplier: 1,
    fireDamageMultiplier: 1,
    silverDamageMultiplier: 1,
    plagueDamageMultiplier: 1,
    bleedDamageMultiplier: 1,
    eliteDamageMultiplier: 1,
    healMultiplier: 1,
    critChanceFlat: 0,
    critMultiplier: ARENA_DATA.balance.combat?.critMultiplier ?? 1.75,
    xpMultiplier: 1,
    curseMultiplier: 1,
    luckMultiplier: 1
  };
}

export const PROGRESSION_STAT_KEYS: ReadonlySet<string> = new Set(Object.keys(createProgressionStats()));

export function isProgressionStatKey(key: string): key is keyof ProgressionStats {
  return PROGRESSION_STAT_KEYS.has(key);
}

export function applyProgressionBonus(stats: ProgressionStats, bonus: ProgressionBonus = {}): void {
  for (const [key, rawValue] of Object.entries(bonus)) {
    if (key === "level" || key === "badge" || key === "stateLabel" || key === "category") continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    if (isProgressionStatKey(key)) {
      if (key.endsWith("Multiplier")) stats[key] *= value;
      else stats[key] += value;
      continue;
    }
    if (key.endsWith("Multiplier") && key.toLowerCase().includes("damage")) stats.damageMultiplier *= value;
  }
}

export function applyScaledProgressionBonus(stats: ProgressionStats, bonus: ProgressionBonus = {}, scale = 1): void {
  for (const [key, rawValue] of Object.entries(bonus)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    if (isProgressionStatKey(key)) {
      if (key.endsWith("Multiplier")) stats[key] *= 1 + (value - 1) * scale;
      else stats[key] += value * scale;
      continue;
    }
    if (key.endsWith("Multiplier") && key.toLowerCase().includes("damage")) {
      stats.damageMultiplier *= 1 + (value - 1) * scale;
    }
  }
}

export function nearbyAllyCount(radius = 36): number {
  if (!state.player || !remotePlayers.size) return 0;
  let count = 0;
  const radiusSq = radius * radius;
  for (const remote of remotePlayers.values()) {
    const rx = remote.mesh?.position?.x;
    const rz = remote.mesh?.position?.z;
    if (!Number.isFinite(rx) || !Number.isFinite(rz)) continue;
    if (worldDistanceSquared(state.player.x, state.player.z, rx, rz) <= radiusSq) count += 1;
  }
  return count;
}

export function passiveTeamworkScale(): number {
  return 1 + Math.min(3, nearbyAllyCount()) * 0.35;
}

export function applyPassiveTeamworkEffects(stats: ProgressionStats): void {
  const scale = passiveTeamworkScale();
  for (const [passiveId, effects] of state.passiveTeamworkEffects) {
    if (!state.passiveSlots.includes(passiveId)) continue;
    for (const effectId of effects ?? []) {
      const effect = PASSIVE_TEAMWORK_EFFECTS.find((entry) => entry.id === effectId);
      if (effect) applyScaledProgressionBonus(stats, effect.bonus, scale);
    }
  }
}

export function resolveProgressionStats(): ProgressionStats {
  const stats = createProgressionStats();
  applyProgressionBonus(stats, selectedClass()?.stats);
  for (const bonus of state.statBonuses) applyProgressionBonus(stats, bonus);
  for (const [id, level] of state.passiveLevels) {
    const passive = passiveItemsById.get(id);
    for (const bonus of passive?.bonuses ?? []) {
      if ((bonus.level ?? 0) <= level) applyProgressionBonus(stats, bonus);
    }
  }
  applyPassiveTeamworkEffects(stats);
  stats.cooldownMultiplier = Math.max(0.45, stats.cooldownMultiplier);
  stats.moveSpeedMultiplier = Math.max(0.65, stats.moveSpeedMultiplier);
  stats.jumpHeightMultiplier = clamp(stats.jumpHeightMultiplier, 0.65, 2.6);
  stats.gravityMultiplier = clamp(stats.gravityMultiplier, 0.5, 1.6);
  stats.maxJumpsFlat = clamp(Math.floor(stats.maxJumpsFlat), 0, 4);
  stats.projectileSizeMultiplier = Math.max(0.45, stats.projectileSizeMultiplier);
  stats.splashDamageFlat = clamp(stats.splashDamageFlat, 0, 1.2);
  stats.knockbackResistFlat = clamp(stats.knockbackResistFlat, 0, 0.72);
  stats.critChanceFlat = clamp(stats.critChanceFlat, 0, 0.45);
  stats.curseMultiplier = clamp(stats.curseMultiplier, 0.25, 4);
  stats.luckMultiplier = clamp(stats.luckMultiplier, 0, 6);
  return stats;
}

export function applyProgressionStats(options: { fullHeal?: boolean } = {}): void {
  const player = state.player;
  if (!player) return;
  const previousMax = Math.max(1, player.maxHp ?? data.player.startHealth ?? 100);
  const stats = resolveProgressionStats();
  state.progressionStats = stats;
  const baseHp = data.player.startHealth ?? 100;
  const nextMax = Math.max(60, Math.round((baseHp + stats.maxHpFlat) * stats.maxHpMultiplier));
  const hpDelta = Math.max(0, nextMax - previousMax);
  player.maxHp = nextMax;
  player.speed = (data.player.moveSpeed ?? 10.8) * stats.moveSpeedMultiplier;
  player.regenPerSecond = (data.player.healthRegenPerSecond ?? 0) + stats.regenFlat;
  player.armor = stats.armorFlat;
  player.knockbackResist = stats.knockbackResistFlat;
  if (options.fullHeal) player.hp = nextMax;
  else player.hp = Math.min(nextMax, Math.max(1, (player.hp ?? nextMax) + hpDelta));
  if (state.lights.playerGlow) {
    state.lights.playerGlow.color.set(selectedClass()?.color ?? "#d7ff8d");
  }
}
