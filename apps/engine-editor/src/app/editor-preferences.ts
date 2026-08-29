import { defaultWorkbenchLayout, normalizeWorkbenchLayout, type WorkbenchLayout } from "@hyperfocus/ui/workbench/layout";
import { HYPERFOCUS_SHARED_USER_PREFERENCES_KEY, defaultHyperfocusSharedUserPreferences, normalizeHyperfocusSharedUserPreferences, readHyperfocusSharedUserPreferences, writeHyperfocusSharedUserPreferences } from "@hyperfocus/ui/preferences/storage";

export const EDITOR_UI_PREFERENCES_KEY = "hyperfocus.editor.ui-preferences.v2";
export const LEGACY_EDITOR_UI_PREFERENCES_KEY = "hyperfocus.editor.ui-preferences.v1";

export type EditorWorkspaceId = "stage" | "scene3d" | "tilemap" | "atlas" | "script" | "post" | "motion" | "diagnostics";
export type EditorNarrowPane = "project" | "main" | "inspector";

export type HyperfocusSharedPreferences = Omit<typeof defaultHyperfocusSharedUserPreferences, "version">;

export type EditorUiPreferences = {
  version: 2;
  shared: HyperfocusSharedPreferences;
  app: {
    workbench: WorkbenchLayout;
    workspaces: Record<string, WorkspacePanelLayout>;
    defaultWorkspace: EditorWorkspaceId;
    narrowPane: EditorNarrowPane;
    aiHarnessEndpoint: string;
    aiAgent: "pi" | "copilot-cli" | "codex-cli";
  };
};

export type WorkspacePanelLayout = {
  sizes: number[];
  collapsed: boolean[];
  visible: boolean[];
  narrowPanel: number;
};

export const defaultEditorUiPreferences: EditorUiPreferences = {
  version: 2,
  shared: sharedWithoutVersion(defaultHyperfocusSharedUserPreferences),
  app: {
    workbench: normalizeWorkbenchLayout({ ...defaultWorkbenchLayout, sidebarSize: 280, inspectorSize: 320, inspectorCollapsed: false, bottomCollapsed: true }),
    workspaces: {},
    defaultWorkspace: "stage",
    narrowPane: "main",
    aiHarnessEndpoint: "http://127.0.0.1:8787",
    aiAgent: "pi",
  },
};

export function normalizeEditorUiPreferences(value: unknown): EditorUiPreferences {
  const candidate = isObject(value) ? value : {};
  const shared = normalizeHyperfocusSharedUserPreferences(candidate.shared);
  const app = isObject(candidate.app) ? candidate.app : {};
  const workbench = isObject(app.workbench) ? app.workbench : {};
  const workspaceCandidates = isObject(app.workspaces) ? app.workspaces : {};
  const workspaces = Object.fromEntries(Object.entries(workspaceCandidates).flatMap(([id, entry]) => {
    if (!isObject(entry) || !Array.isArray(entry.sizes) || !Array.isArray(entry.collapsed)) return [];
    const sizes = entry.sizes.slice(0, 8).map((size) => clampNumber(size, 160, 720, 260));
    const collapsed = entry.collapsed.slice(0, 8).map((value) => value === true);
    const visibleSource = Array.isArray(entry.visible) ? entry.visible : [];
    const visible = sizes.map((_, index) => visibleSource[index] !== false);
    const narrowPanel = clampInteger(entry.narrowPanel, 0, Math.max(0, sizes.length - 1), 0);
    return [[id, { sizes, collapsed, visible, narrowPanel }]];
  }));
  return {
    version: 2,
    shared: {
      ...sharedWithoutVersion(shared),
    },
    app: {
      workbench: normalizeWorkbenchLayout({ ...defaultEditorUiPreferences.app.workbench, ...workbench }),
      workspaces,
      defaultWorkspace: isWorkspaceId(app.defaultWorkspace) ? app.defaultWorkspace : defaultEditorUiPreferences.app.defaultWorkspace,
      narrowPane: app.narrowPane === "project" || app.narrowPane === "main" || app.narrowPane === "inspector" ? app.narrowPane : defaultEditorUiPreferences.app.narrowPane,
      aiHarnessEndpoint: normalizeEndpoint(app.aiHarnessEndpoint),
      aiAgent: app.aiAgent === "copilot-cli" || app.aiAgent === "codex-cli" || app.aiAgent === "pi" ? app.aiAgent : defaultEditorUiPreferences.app.aiAgent,
    },
  };
}

export function readEditorUiPreferences(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): EditorUiPreferences {
  if (!storage) return structuredClone(defaultEditorUiPreferences);
  try {
    const value = storage.getItem(EDITOR_UI_PREFERENCES_KEY) ?? storage.getItem(LEGACY_EDITOR_UI_PREFERENCES_KEY);
    const migrated = value ? JSON.parse(value) : defaultEditorUiPreferences;
    const normalized = normalizeEditorUiPreferences(migrated);
    const shared = storage.getItem(HYPERFOCUS_SHARED_USER_PREFERENCES_KEY)
      ? readHyperfocusSharedUserPreferences(storage)
      : normalizeHyperfocusSharedUserPreferences(isObject(migrated) ? migrated.shared : undefined);
    return { ...normalized, shared: sharedWithoutVersion(shared) };
  } catch {
    return structuredClone(defaultEditorUiPreferences);
  }
}

export function writeEditorUiPreferences(preferences: EditorUiPreferences, storage: Pick<Storage, "setItem"> | undefined = safeStorage()) {
  const normalized = normalizeEditorUiPreferences(preferences);
  writeHyperfocusSharedUserPreferences(normalized.shared, storage);
  try { storage?.setItem(EDITOR_UI_PREFERENCES_KEY, JSON.stringify({ version: normalized.version, app: normalized.app })); } catch { /* Storage can be unavailable or quota-limited. */ }
  return normalized;
}

export function applyEditorUiPreferences(preferences: EditorUiPreferences, root: HTMLElement = document.documentElement) {
  const normalized = normalizeEditorUiPreferences(preferences);
  const systemDark = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;
  root.dataset.hfTheme = normalized.shared.theme === "system" ? systemDark ? "dark" : "light" : normalized.shared.theme;
  root.dataset.hfDensity = normalized.shared.density;
  root.dataset.hfReducedMotion = String(normalized.shared.reducedMotion);
  root.dataset.hfNumericAlignment = normalized.shared.numericAlignment;
  root.dataset.hfEditorNarrowPane = normalized.app.narrowPane;
  root.style.setProperty("--editor-ui-scale", String(normalized.shared.uiScale));
  root.style.setProperty("--project-sidebar-width", `${normalized.app.workbench.sidebarSize}px`);
}

/** Small adapter for panels that should not depend on the editor shell. */
export function readEditorAiHarnessEndpoint(storage: Pick<Storage, "getItem"> | undefined = safeStorage()) {
  return readEditorUiPreferences(storage).app.aiHarnessEndpoint;
}

/** Persists the harness endpoint in the same versioned app-user document. */
export function writeEditorAiHarnessEndpoint(endpoint: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeStorage()) {
  const current = readEditorUiPreferences(storage);
  return writeEditorUiPreferences({ ...current, app: { ...current.app, aiHarnessEndpoint: endpoint } }, storage).app.aiHarnessEndpoint;
}

export function readEditorAiAgent(storage: Pick<Storage, "getItem"> | undefined = safeStorage()) {
  return readEditorUiPreferences(storage).app.aiAgent;
}

export function writeEditorAiAgent(agent: "pi" | "copilot-cli" | "codex-cli", storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeStorage()) {
  const current = readEditorUiPreferences(storage);
  return writeEditorUiPreferences({ ...current, app: { ...current.app, aiAgent: agent } }, storage).app.aiAgent;
}

function safeStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  return Math.round(clampNumber(value, minimum, maximum, fallback));
}

function isWorkspaceId(value: unknown): value is EditorWorkspaceId {
  return value === "stage" || value === "scene3d" || value === "tilemap" || value === "atlas" || value === "script" || value === "post" || value === "motion" || value === "diagnostics";
}

function normalizeEndpoint(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return defaultEditorUiPreferences.app.aiHarnessEndpoint;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/$/, "") : defaultEditorUiPreferences.app.aiHarnessEndpoint;
  } catch { return defaultEditorUiPreferences.app.aiHarnessEndpoint; }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sharedWithoutVersion(preferences: typeof defaultHyperfocusSharedUserPreferences): HyperfocusSharedPreferences {
  const { version: _version, ...shared } = preferences;
  return shared;
}
