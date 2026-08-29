import {
  CLASS_LEVEL_STORAGE_KEY,
  CLASS_LOADOUT_STORAGE_KEY,
  DEFAULT_CLASS_LEVEL,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  playerClasses,
} from "./content-runtime.ts";
import type { ClassLoadouts, NumericSettingKey, Settings } from "./content-runtime.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readStorageRecord(key: string): Record<string, unknown> {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function settingNumber(source: Record<string, unknown>, key: NumericSettingKey, min: number, max: number): number {
  const value = Number(source[key]);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : DEFAULT_SETTINGS[key];
}

export function readSettings(): Settings {
  const stored = readStorageRecord(SETTINGS_STORAGE_KEY);
  return {
    mouseSensitivity: settingNumber(stored, "mouseSensitivity", 0.5, 2),
    stickSensitivity: settingNumber(stored, "stickSensitivity", 0.5, 2),
    invertY: typeof stored.invertY === "boolean" ? stored.invertY : DEFAULT_SETTINGS.invertY,
    masterVolume: settingNumber(stored, "masterVolume", 0, 1),
    musicVolume: settingNumber(stored, "musicVolume", 0, 1),
    sfxVolume: settingNumber(stored, "sfxVolume", 0, 1),
    muted: typeof stored.muted === "boolean" ? stored.muted : DEFAULT_SETTINGS.muted
  };
}

export function createInitialClassLevels(): Map<string, number> {
  const stored = readStorageRecord(CLASS_LEVEL_STORAGE_KEY);
  const levels = new Map<string, number>();
  for (const klass of playerClasses) {
    const value = Math.floor(Number(stored[klass.id] ?? DEFAULT_CLASS_LEVEL));
    levels.set(klass.id, Math.max(DEFAULT_CLASS_LEVEL, Number.isFinite(value) ? value : DEFAULT_CLASS_LEVEL));
  }
  return levels;
}

export function createInitialClassLoadouts(): ClassLoadouts {
  const stored = readStorageRecord(CLASS_LOADOUT_STORAGE_KEY);
  const loadouts: ClassLoadouts = {};
  for (const [classId, value] of Object.entries(stored)) {
    if (!isRecord(value)) continue;
    const weaponId = typeof value.weaponId === "string" ? value.weaponId : undefined;
    const passiveIds = Array.isArray(value.passiveIds)
      ? value.passiveIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const passiveId = typeof value.passiveId === "string" ? value.passiveId : undefined;
    loadouts[classId] = { weaponId, passiveIds, passiveId };
  }
  return loadouts;
}
