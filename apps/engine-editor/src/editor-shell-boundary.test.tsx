import { afterEach, describe, expect, test } from "bun:test";
import { mountEditorShellView } from "./editor-shell-view";

afterEach(() => { document.body.replaceChildren(); });

describe("Solid editor shell boundary", () => {
  test("owns chrome state without absorbing the engine runtime host", () => {
    document.body.innerHTML = `<div class="app-shell"><header class="topbar"><nav class="workspace-tabs"><button data-workspace-tab="stage">Stage</button></nav></header><main class="workspace-host"><canvas id="stage-canvas"></canvas></main></div>`;
    const app = document.querySelector<HTMLElement>(".app-shell")!;
    const workspaceHost = document.querySelector<HTMLElement>(".workspace-host")!;
    const resourceNav = document.querySelector<HTMLElement>(".workspace-tabs")!;
    const view = mountEditorShellView({ app, workspaceHost, resourceNav });

    expect(document.querySelector('[data-solid-owner="editor-workbench"]')).not.toBeNull();
    expect(document.querySelector('[data-solid-state="project-browser"]')).toBe(view.sidebar);
    expect(document.querySelector('[data-runtime-owner="engine"]')?.contains(workspaceHost)).toBe(true);
    expect(workspaceHost.querySelector("#stage-canvas")).not.toBeNull();

    expect(document.querySelector('[data-editor-mode="edit"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(view.center.hidden).toBe(true);
    expect(view.consoleDrawer.hidden).toBe(true);

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
});
