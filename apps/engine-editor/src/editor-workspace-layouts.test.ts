import { afterEach, describe, expect, test } from "bun:test";
import { mountEditorWorkspaceLayouts } from "./editor-workspace-layouts";

afterEach(() => document.body.replaceChildren());

describe("editor workspace layouts", () => {
  test("upgrades fixed grids with accessible, persisted panel controls", () => {
    document.body.innerHTML = `<div class="stage-layout"><aside><div class="panel-title"><span>Hierarchy</span></div></aside><main><div class="panel-title"><span>Stage</span></div></main><aside><div class="panel-title"><span>Inspector</span></div></aside></div>`;
    const commits: Array<{ id: string; sizes: number[]; collapsed: boolean[]; visible: boolean[]; narrowPanel: number }> = [];
    const dispose = mountEditorWorkspaceLayouts({
      root: document,
      layouts: { stage: { sizes: [252, 0, 280], collapsed: [false, false, false], visible: [true, true, true], narrowPanel: 1 } },
      onCommit: (id, layout) => commits.push({ id, ...layout }),
    });
    const container = document.querySelector<HTMLElement>(".stage-layout")!;
    const handles = [...container.querySelectorAll<HTMLElement>("[role='separator']")];
    expect(handles).toHaveLength(2);
    expect(handles[0].getAttribute("aria-orientation")).toBe("vertical");

    handles[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(commits.at(-1)?.sizes[0]).toBe(262);
    handles[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(commits.at(-1)?.collapsed[2]).toBe(true);
    expect(commits.at(-1)?.visible).toEqual([true, true, true]);
    expect(container.children[4]?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector<HTMLElement>("main")?.style.gridColumn).toBe("3");
    expect(container.style.gap).toBe("0");

    dispose();
    expect(container.querySelectorAll("[role='separator']")).toHaveLength(0);
    expect(container.querySelector<HTMLElement>("main")?.style.gridColumn).toBe("");
  });

  test("keeps Post preview primary and supporting panes collapsed by default", () => {
    document.body.innerHTML = `<div class="post-layout"><main><div class="panel-title"><span>Game preview</span></div></main><aside><div class="panel-title"><span>Effect stack</span></div></aside><aside><div class="panel-title"><span>Budget</span></div></aside></div>`;
    const dispose = mountEditorWorkspaceLayouts({ root: document });
    const panels = [...document.querySelectorAll<HTMLElement>(".post-layout > [data-workspace-panel]")];
    expect(panels.map((panel) => panel.hidden)).toEqual([false, true, true]);
    expect(document.querySelector<HTMLElement>(".post-layout")?.style.gridTemplateColumns).toContain("minmax(0, 1fr)");
    dispose();
  });

  test("makes the timeline side panels and rig dock independently resizable", () => {
    document.body.innerHTML = `<div class="sequence-shell">
      <div class="sequence-commandbar"></div>
      <aside class="sequence-tracks-panel"></aside>
      <section class="sequence-editor-panel"></section>
      <aside class="sequence-right-column"></aside>
      <section class="rig-dock"></section>
    </div>`;
    const commits: Array<{ sizes: number[]; collapsed: boolean[]; visible: boolean[]; narrowPanel: number }> = [];
    const dispose = mountEditorWorkspaceLayouts({ root: document, onCommit: (id, layout) => { if (id === "motion") commits.push(layout); } });
    const handles = [...document.querySelectorAll<HTMLElement>(".sequence-shell [role='separator']")];
    expect(handles).toHaveLength(3);
    expect(handles[2].getAttribute("aria-orientation")).toBe("horizontal");

    handles[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(commits.at(-1)?.sizes[3]).toBe(184);
    handles[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(commits.at(-1)?.collapsed[0]).toBe(true);
    expect(document.querySelector<HTMLElement>(".sequence-tracks-panel")?.hidden).toBe(true);

    dispose();
    expect(document.querySelectorAll(".sequence-shell [role='separator']")).toHaveLength(0);
  });
});
