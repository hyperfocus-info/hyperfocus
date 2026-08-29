import { requireRuntimeInstance, THREE } from "./boot-and-dom.ts";
import type * as Three from "three";
import { state } from "./arena-state.ts";
import { ARCHITECT_UI_ROOT, CLASS_WEAPON_ICON_BY_ID, EVOLUTION_ICON_BY_WEAPON_ID, PASSIVE_ICON_BY_ID, WEAPON_ICON_BY_ID } from "./asset-catalog.ts";
import { CLASS_LEVEL_STORAGE_KEY, CLASS_LOADOUT_STORAGE_KEY, DEFAULT_CLASS_LEVEL, SETTINGS_STORAGE_KEY, data, passiveItemsById, playerClasses, weaponsById } from "./content-runtime.ts";
import type { ArenaPropDefinition, ClassUnlock, LevelChoice, PlayerClassDefinition } from "./content-types.ts";
import type { ArenaAnimationClip } from "./runtime-types.ts";
export { createInitialClassLevels, createInitialClassLoadouts, readSettings, readStorageRecord, settingNumber } from "./initial-state-storage.ts";

export function architectUiAsset(path: string): string {
  return path ? `${ARCHITECT_UI_ROOT}/${path}` : "";
}

export function weaponIconPath(id: string, evolved = false): string {
  return architectUiAsset((evolved ? EVOLUTION_ICON_BY_WEAPON_ID[id] : null) ?? WEAPON_ICON_BY_ID[id] ?? WEAPON_ICON_BY_ID.boneSplinter);
}

export function passiveIconPath(id: string): string {
  return architectUiAsset(PASSIVE_ICON_BY_ID[id] ?? "status/debuff-4.png");
}

export function classSigilPath(klass: PlayerClassDefinition | null | undefined): string {
  const classIcon = klass ? CLASS_WEAPON_ICON_BY_ID[klass.id] : undefined;
  const starterWeaponIcon = klass ? WEAPON_ICON_BY_ID[klass.starterWeapon] : undefined;
  return architectUiAsset(classIcon ?? starterWeaponIcon ?? WEAPON_ICON_BY_ID.boneSplinter);
}

export function classPassiveDeckPath(klass: PlayerClassDefinition | null | undefined): string {
  return architectUiAsset(`passives/${klass?.id ?? "vanguard"}-1.png`);
}

export function choiceVisual(choice: LevelChoice): { icon: string; kind: string } {
  if (choice.kind === "evolution") return { icon: weaponIconPath(choice.id, true), kind: "Evolution" };
  if (choice.kind === "weapon") return { icon: weaponIconPath(choice.id), kind: choice.owned ? "Weapon tier" : "New weapon" };
  if (choice.kind === "passive") return { icon: passiveIconPath(choice.id), kind: choice.owned ? "Passive tier" : "Passive" };
  if (choice.kind === "heal") return { icon: architectUiAsset("status/debuff-1.png"), kind: "Recover" };
  return { icon: architectUiAsset("status/debuff-4.png"), kind: "Core" };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasArenaAnimationMetadata(clip: Three.AnimationClip): clip is ArenaAnimationClip {
  return "userData" in clip && isRecord(clip.userData);
}

export function forEachObjectMaterial(
  object: Three.Object3D,
  visit: (material: Three.Material) => void
): void {
  if (!("material" in object)) return;
  const material = object.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (entry instanceof THREE.Material) visit(entry);
    }
    return;
  }
  if (material instanceof THREE.Material) visit(material);
}

export function cachedGeometry(key: string, factory: () => Three.BufferGeometry): Three.BufferGeometry {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.BufferGeometry, `Cached geometry ${key}`);
}

export function cachedMeshBasicMaterial(key: string, factory: () => Three.MeshBasicMaterial): Three.MeshBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.MeshBasicMaterial, `Cached material ${key}`);
}

export function cachedMeshStandardMaterial(key: string, factory: () => Three.MeshStandardMaterial): Three.MeshStandardMaterial {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.MeshStandardMaterial, `Cached material ${key}`);
}

export function cachedLineBasicMaterial(key: string, factory: () => Three.LineBasicMaterial): Three.LineBasicMaterial {
  return requireRuntimeInstance(state.renderCache.get(key, factory), THREE.LineBasicMaterial, `Cached material ${key}`);
}

export function isArenaPropDefinition(value: unknown): value is ArenaPropDefinition {
  return isRecord(value)
    && typeof value.model === "string"
    && typeof value.x === "number"
    && typeof value.z === "number";
}

export function writeStorageJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional in private or embedded contexts.
  }
}

export function saveSettings(): void {
  writeStorageJson(SETTINGS_STORAGE_KEY, state.settings);
}

export function saveClassLevels(): void {
  const payload: Record<string, number> = {};
  for (const klass of playerClasses) payload[klass.id] = Math.max(DEFAULT_CLASS_LEVEL, state.classLevels.get(klass.id) ?? DEFAULT_CLASS_LEVEL);
  writeStorageJson(CLASS_LEVEL_STORAGE_KEY, payload);
}

export function saveClassLoadouts(): void {
  writeStorageJson(CLASS_LOADOUT_STORAGE_KEY, state.configuredLoadouts);
}

export function flattenWeaponUnlockFallback(): string[] {
  const ids: string[] = [];
  for (const id of data.levelUpPools?.starterWeapons ?? []) ids.push(id);
  for (const entry of data.levelUpPools?.unlockOrder ?? []) {
    for (const id of entry.weaponIds ?? []) ids.push(id);
  }
  for (const weapon of data.weapons ?? []) ids.push(weapon.id);
  return ids;
}

export function normalizeUnlockList(
  entries: unknown,
  fallbackIds: Array<string | null | undefined>,
  validIds: ReadonlyMap<string, unknown>
): ClassUnlock[] {
  const result: ClassUnlock[] = [];
  const seen = new Set<string>();
  const push = (entry: unknown, fallbackLevel: number): void => {
    const id = typeof entry === "string" ? entry : isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
    if (typeof id !== "string" || !validIds.has(id) || seen.has(id)) return;
    const rawLevel = typeof entry === "string" ? fallbackLevel : isRecord(entry) ? entry.level ?? fallbackLevel : fallbackLevel;
    const level = Math.max(DEFAULT_CLASS_LEVEL, Math.floor(Number(rawLevel) || fallbackLevel || DEFAULT_CLASS_LEVEL));
    seen.add(id);
    result.push({ id, level });
  };
  const explicitEntries = Array.isArray(entries) && entries.length ? entries : null;
  if (explicitEntries) {
    for (const entry of explicitEntries) push(entry, DEFAULT_CLASS_LEVEL);
  } else {
    fallbackIds.forEach((id, index) => push(id, index === 0 ? DEFAULT_CLASS_LEVEL : 1 + index * 2));
  }
  result.sort((left, right) => left.level - right.level || displayNameForUnlock(left.id).localeCompare(displayNameForUnlock(right.id)));
  return result;
}

export function classWeaponUnlocks(klass: PlayerClassDefinition | null | undefined): ClassUnlock[] {
  const fallback = [klass?.starterWeapon, ...flattenWeaponUnlockFallback()].filter((id): id is string => typeof id === "string");
  return normalizeUnlockList(klass?.progression?.weapons, fallback, weaponsById);
}

export function classPassiveUnlocks(klass: PlayerClassDefinition | null | undefined): ClassUnlock[] {
  const fallback = [...(klass?.starterPassives ?? []), ...data.passiveItems.map((passive) => passive.id)];
  return normalizeUnlockList(klass?.progression?.passives, fallback, passiveItemsById);
}

export function classUnlocks(klass: PlayerClassDefinition | null | undefined): Array<ClassUnlock & { kind: "weapon" | "passive" }> {
  return [
    ...classWeaponUnlocks(klass).map((unlock): ClassUnlock & { kind: "weapon" } => ({ ...unlock, kind: "weapon" })),
    ...classPassiveUnlocks(klass).map((unlock): ClassUnlock & { kind: "passive" } => ({ ...unlock, kind: "passive" }))
  ].sort((left, right) => left.level - right.level || displayNameForUnlock(left.id).localeCompare(displayNameForUnlock(right.id)));
}

export function displayNameForUnlock(id: string): string {
  return weaponsById.get(id)?.name ?? passiveItemsById.get(id)?.name ?? id;
}
