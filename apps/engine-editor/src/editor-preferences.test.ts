import { describe, expect, test } from "bun:test";
import { applyEditorUiPreferences, defaultEditorUiPreferences, normalizeEditorUiPreferences, readEditorAiHarnessEndpoint, readEditorUiPreferences, writeEditorAiHarnessEndpoint, writeEditorUiPreferences } from "./app/editor-preferences";
import { HYPERFOCUS_SHARED_USER_PREFERENCES_KEY } from "@hyperfocus/ui/preferences/storage";

describe("editor UI preferences", () => {
  test("normalizes app chrome independently from project data", () => {
    const preferences = normalizeEditorUiPreferences({
      shared: { theme: "light", uiScale: 99, reducedMotion: true, numericAlignment: "natural" },
      app: { workbench: { sidebarSize: 4, sidebarCollapsed: true } },
    });
    expect(preferences.shared.uiScale).toBe(1.5);
    expect(preferences.app.workbench.sidebarSize).toBe(180);
    expect(preferences.app.workbench.sidebarCollapsed).toBe(true);
    expect(preferences.app.workbench.inspectorCollapsed).toBe(false);
    expect(preferences.version).toBe(2);
  });

  test("clamps durable workspace modes and rejects invalid startup choices", () => {
    const preferences = normalizeEditorUiPreferences({ app: {
      defaultWorkspace: "made-up",
      narrowPane: "toolbar",
      workspaces: { post: { sizes: [-4, 9999, 300], collapsed: [false, true, false], visible: [true, false, true], narrowPanel: 99 } },
    } });
    expect(preferences.app.defaultWorkspace).toBe("stage");
    expect(preferences.app.narrowPane).toBe("main");
    expect(preferences.app.workspaces.post).toEqual({ sizes: [160, 720, 300], collapsed: [false, true, false], visible: [true, false, true], narrowPanel: 2 });
  });

  test("round trips through an injected storage adapter", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    writeEditorUiPreferences({ ...defaultEditorUiPreferences, shared: { ...defaultEditorUiPreferences.shared, density: "compact" } }, storage);
    expect(readEditorUiPreferences(storage).shared.density).toBe("compact");
    expect(JSON.parse(values.get(HYPERFOCUS_SHARED_USER_PREFERENCES_KEY) ?? "{}").density).toBe("compact");
    expect(JSON.parse(values.get("hyperfocus.editor.ui-preferences.v2") ?? "{}").shared).toBeUndefined();
  });

  test("migrates legacy editor-shared values into the cross-app record on the next write", () => {
    const values = new Map<string, string>([["hyperfocus.editor.ui-preferences.v1", JSON.stringify({ shared: { theme: "light", density: "compact", uiScale: 1.2, reducedMotion: true, numericAlignment: "natural" }, app: {} })]]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const migrated = readEditorUiPreferences(storage);
    expect(migrated.shared).toMatchObject({ theme: "light", density: "compact", reducedMotion: true });
    writeEditorUiPreferences(migrated, storage);
    expect(JSON.parse(values.get(HYPERFOCUS_SHARED_USER_PREFERENCES_KEY) ?? "{}")).toMatchObject({ version: 1, theme: "light", density: "compact" });
  });

  test("applies semantic attributes without touching a project", () => {
    const root = document.createElement("html");
    applyEditorUiPreferences({ ...defaultEditorUiPreferences, shared: { ...defaultEditorUiPreferences.shared, reducedMotion: true } }, root);
    expect(root.dataset.hfReducedMotion).toBe("true");
    expect(root.style.getPropertyValue("--editor-ui-scale")).toBe("1");
    expect(root.dataset.hfEditorNarrowPane).toBe("main");
  });

  test("exposes a shell-independent AI endpoint bridge on the versioned preference", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(writeEditorAiHarnessEndpoint("http://localhost:9999/", storage)).toBe("http://localhost:9999");
    expect(readEditorAiHarnessEndpoint(storage)).toBe("http://localhost:9999");
  });
});
