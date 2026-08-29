import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { defaultEditorUiPreferences } from "../app/editor-preferences.ts";
import { createDefaultProject } from "@hyperfocus/engine/project";
import { EditorCenterContent } from "./editor-center-content.tsx";

afterEach(() => document.body.replaceChildren());

function mount(state: Parameters<typeof EditorCenterContent>[0]["state"]) {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <EditorCenterContent state={state} />, host);
  return { host, dispose };
}

describe("EditorCenterContent", () => {
  test("renders starter actions from typed project state", () => {
    const project = createDefaultProject("Current game");
    const mounted = mount({ kind: "project", project, hasRecovery: true });

    const selector = mounted.host.querySelector<HTMLSelectElement>('[aria-label="Starter template"]')!;
    expect(selector.options).toHaveLength(5);
    expect(selector.value).toBe("pong");
    expect(Array.from(selector.options, (option) => option.value)).toContain("platformer");
    expect(mounted.host.querySelector('[data-template="pong"]')?.textContent).toBe("Create playable Pong");
    expect(mounted.host.textContent).toContain("Current game");
    expect(mounted.host.textContent).toContain("local recovery available");
    mounted.dispose();
  });

  test("renders build checks and escapes profile data without HTML injection", () => {
    const project = createDefaultProject("Build target");
    let mounted = mount({
      kind: "build",
      project,
      sourcePreflight: { status: "error", detail: "Source failed" },
      validation: [{ ok: false, blocking: true, label: "Assets", detail: "Missing asset" }],
    });
    expect(mounted.host.querySelector<HTMLButtonElement>('[data-editor-action="download-build"]')?.disabled).toBe(true);
    expect(mounted.host.textContent).toContain("Missing asset");
    mounted.dispose();

    mounted = mount({ kind: "profile", profile: { sample: "<script>bad()</script>" } });
    expect(mounted.host.querySelector("script")).toBeNull();
    expect(mounted.host.querySelector("pre")?.textContent).toContain("<script>bad()</script>");
    mounted.dispose();
  });

  test("composes settings without creating another render root", () => {
    const project = createDefaultProject("Settings");
    const mounted = mount({ kind: "settings", project, uiPreferences: defaultEditorUiPreferences, onSave() {} });
    expect(mounted.host.querySelector(".editor-preferences-composite")).not.toBeNull();
    expect(mounted.host.textContent).toContain("Input map");
    expect(mounted.host.textContent).toContain("Save settings");
    mounted.dispose();
  });
});
