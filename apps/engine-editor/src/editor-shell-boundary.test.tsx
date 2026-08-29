import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { EditorScriptFileList, mountEditorShellView } from "./editor-shell-view";

afterEach(() => { document.body.replaceChildren(); });

describe("Solid editor shell boundary", () => {
  test("owns chrome state without absorbing the engine runtime host", async () => {
    document.body.innerHTML = `<div class="app-shell"><header class="topbar"><nav class="workspace-tabs"><button data-workspace-tab="stage">Stage</button></nav></header><main class="workspace-host"><canvas id="stage-canvas"></canvas><div id="script-file-list"></div></main></div>`;
    const app = document.querySelector<HTMLElement>(".app-shell")!;
    const workspaceHost = document.querySelector<HTMLElement>(".workspace-host")!;
    const resourceNav = document.querySelector<HTMLElement>(".workspace-tabs")!;
    const view = mountEditorShellView({
      app,
      workspaceHost,
      resourceNav,
      projectBrowser: {
        projectName: "Component-owned project",
        dirty: true,
        canUndo: true,
        scenes: [{ id: "scene-main", name: "Main", entityCount: 1, active: true, menu: [] }],
        entities: [{ id: "player", label: "Player", kind: "actor", layer: 2, depth: 0, selected: true, menu: [] }],
        assets: [{ id: "sprite", name: "Player.png", kind: "image", detail: "image · 1 KB", icon: "▧", title: "Sprite", selected: false, draggable: true, menu: [] }],
      },
    });

    expect(document.querySelector('[data-solid-owner="editor-workbench"]')).not.toBeNull();
    expect(document.querySelector('[data-solid-state="project-browser"]')).toBe(view.sidebar);
    expect(document.querySelector('[data-runtime-owner="engine"]')?.contains(workspaceHost)).toBe(true);
    expect(workspaceHost.querySelector("#stage-canvas")).not.toBeNull();

    expect(document.querySelector('[data-solid-owner="editor-modes"]')).not.toBeNull();
    expect(document.querySelectorAll(".sidebar-tool-group")).toHaveLength(2);
    expect(document.querySelectorAll(".sidebar-tool-icon")).toHaveLength(4);
    expect(document.querySelector('[data-editor-action="history"]')?.getAttribute("aria-label")).toBe("View project history");
    expect(view.center.hidden).toBe(true);
    expect(view.consoleDrawer.hidden).toBe(true);

    expect(document.querySelector("#editor-project-name")?.textContent).toBe("Component-owned project");
    expect(document.querySelector("#editor-project-state")?.textContent).toBe("Unsaved changes");
    expect(document.querySelector('[data-project-scene="scene-main"]')?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[data-project-entity="player"]')?.textContent).toContain("Player");
    expect(document.querySelector('[data-project-asset="sprite"]')?.getAttribute("draggable")).toBe("true");

    view.update({ sidebarSize: 336 });
    expect(document.querySelector<HTMLElement>('[data-test-workbench-shell]')?.style.gridTemplateColumns).toContain("336px");
    view.update({ sidebarCollapsed: true });
    expect(document.querySelector<HTMLElement>('[data-solid-state="project-browser"]')?.hidden).toBe(true);
    view.update({ sidebarCollapsed: false });
    expect(document.querySelector<HTMLElement>('[data-solid-state="project-browser"]')?.hidden).toBe(false);
    expect(resourceNav.isConnected).toBe(true);
    expect(document.querySelector('[data-runtime-owner="engine"]')?.contains(workspaceHost)).toBe(true);

    view.dispose();
    expect(document.querySelector('[data-solid-state="project-browser"]')).toBeNull();
  });

  test("renders the script browser as a component-owned resource list", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <EditorScriptFileList state={{
      activePath: "src/player.ts",
      selectedEntityId: "player",
      files: [{ path: "src/player.ts", active: true, menu: [{ label: "Rename", action: "rename-script", data: { path: "src/player.ts" } }] }],
    }} />, host);

    expect(host.querySelector('[data-script-path="src/player.ts"]')?.textContent).toBe("src/player.ts");
    expect(host.querySelector('[data-editor-action="attach-script"]')?.hasAttribute("disabled")).toBe(false);
    expect(host.querySelector('[aria-label="src/player.ts script actions"]')).not.toBeNull();
    dispose();
  });
});
