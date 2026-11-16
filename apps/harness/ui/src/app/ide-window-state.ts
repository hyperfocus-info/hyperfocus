export type IdeWindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
const IDE_WINDOW_STORAGE_KEY = "pi-harness:ide-window-state:v1";
export function createDefaultIdeWindowBounds(): IdeWindowBounds {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(1120, Math.max(240, viewportWidth - (viewportWidth < 640 ? 16 : 160)));
  const height = Math.min(720, Math.max(320, viewportHeight - (viewportWidth < 640 ? 16 : 140)));
  return {
    x: viewportWidth < 640 ? 8 : 72,
    y: viewportWidth < 640 ? 8 : 64,
    width,
    height
  };
}

export function readPersistedIdeWindowState() {
  const fallback = { open: false, maximized: false, bounds: createDefaultIdeWindowBounds() };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IDE_WINDOW_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return {
      open: typeof parsed.open === "boolean" ? parsed.open : fallback.open,
      maximized: typeof parsed.maximized === "boolean" ? parsed.maximized : fallback.maximized,
      bounds: normalizeIdeWindowBounds(parsed.bounds, fallback.bounds)
    };
  } catch {
    return fallback;
  }
}

export function persistIdeWindowState(state: { open: boolean; maximized: boolean; bounds: IdeWindowBounds }) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(IDE_WINDOW_STORAGE_KEY, JSON.stringify(state));
}

function normalizeIdeWindowBounds(value: unknown, fallback: IdeWindowBounds): IdeWindowBounds {
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const maximumWidth = Math.max(240, window.innerWidth - 16);
  const maximumHeight = Math.max(320, window.innerHeight - 16);
  return {
    x: clampWindowNumber(Reflect.get(value, "x"), 8, Math.max(8, window.innerWidth - 160), fallback.x),
    y: clampWindowNumber(Reflect.get(value, "y"), 8, Math.max(8, window.innerHeight - 80), fallback.y),
    width: clampWindowNumber(Reflect.get(value, "width"), Math.min(640, maximumWidth), maximumWidth, fallback.width),
    height: clampWindowNumber(Reflect.get(value, "height"), Math.min(420, maximumHeight), maximumHeight, fallback.height)
  };
}

function clampWindowNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
