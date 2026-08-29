export const HYPERFOCUS_SHARED_USER_PREFERENCES_KEY = "hyperfocus.ui.shared-user-preferences.v1";

export type HyperfocusSharedUserPreferences = {
  version: 1;
  theme: "system" | "dark" | "light";
  density: "comfortable" | "compact";
  uiScale: number;
  reducedMotion: boolean;
  numericAlignment: "tabular" | "natural";
};

export const defaultHyperfocusSharedUserPreferences: HyperfocusSharedUserPreferences = {
  version: 1,
  theme: "dark",
  density: "comfortable",
  uiScale: 1,
  reducedMotion: false,
  numericAlignment: "tabular",
};

export function normalizeHyperfocusSharedUserPreferences(value: unknown): HyperfocusSharedUserPreferences {
  const candidate = isObject(value) ? value : {};
  return {
    version: 1,
    theme: candidate.theme === "system" || candidate.theme === "light" || candidate.theme === "dark" ? candidate.theme : defaultHyperfocusSharedUserPreferences.theme,
    density: candidate.density === "compact" || candidate.density === "comfortable" ? candidate.density : defaultHyperfocusSharedUserPreferences.density,
    uiScale: clamp(candidate.uiScale, 0.9, 1.5, defaultHyperfocusSharedUserPreferences.uiScale),
    reducedMotion: typeof candidate.reducedMotion === "boolean" ? candidate.reducedMotion : defaultHyperfocusSharedUserPreferences.reducedMotion,
    numericAlignment: candidate.numericAlignment === "natural" || candidate.numericAlignment === "tabular" ? candidate.numericAlignment : defaultHyperfocusSharedUserPreferences.numericAlignment,
  };
}

export function readHyperfocusSharedUserPreferences(storage: Pick<Storage, "getItem"> | undefined = safeStorage()) {
  if (!storage) return structuredClone(defaultHyperfocusSharedUserPreferences);
  try {
    const value = storage.getItem(HYPERFOCUS_SHARED_USER_PREFERENCES_KEY);
    return value ? normalizeHyperfocusSharedUserPreferences(JSON.parse(value)) : structuredClone(defaultHyperfocusSharedUserPreferences);
  } catch { return structuredClone(defaultHyperfocusSharedUserPreferences); }
}

export function writeHyperfocusSharedUserPreferences(preferences: unknown, storage: Pick<Storage, "setItem"> | undefined = safeStorage()) {
  const normalized = normalizeHyperfocusSharedUserPreferences(preferences);
  try { storage?.setItem(HYPERFOCUS_SHARED_USER_PREFERENCES_KEY, JSON.stringify(normalized)); } catch { /* Storage may be unavailable or quota-limited. */ }
  return normalized;
}

function safeStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
