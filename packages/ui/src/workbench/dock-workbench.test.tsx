import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { createDockLayout, dockPanelIsOpen, listDockStacks, type DockLayout } from "./dock-layout";
import { DockingWorkbench, type DockingWorkbenchApi } from "./dock-workbench";

afterEach(() => document.body.replaceChildren());

const panelIds = ["project", "workspace", "inspector", "console"];

describe("DockingWorkbench", () => {
  test("keeps layout and commands isolated between simultaneous workbenches", () => {
    const first = document.createElement("div"), second = document.createElement("div");
    document.body.append(first, second);
    const [firstLayout, setFirstLayout] = createSignal(createDockLayout(["workspace", "inspector"]));
    const [secondLayout, setSecondLayout] = createSignal(createDockLayout(["workspace", "inspector"]));
    let firstApi: DockingWorkbenchApi | undefined;
    const panels = ["workspace", "inspector"].map(id => ({ id, label: id, content: id }));
    const disposeFirst = render(() => <DockingWorkbench ariaLabel="First workspace" panels={panels}
      layout={firstLayout} onLayoutChange={setFirstLayout} apiRef={api => { firstApi = api; }} />, first);
    const disposeSecond = render(() => <DockingWorkbench ariaLabel="Second workspace" panels={panels}
      layout={secondLayout} onLayoutChange={setSecondLayout} />, second);
    try {
      firstApi?.hidePanel("inspector");
      expect(dockPanelIsOpen(firstLayout(), "inspector")).toBe(false);
      expect(dockPanelIsOpen(secondLayout(), "inspector")).toBe(true);
      expect(first.querySelector('[data-dock-tab="inspector"]')).toBeNull();
      expect(second.querySelector('[data-dock-tab="inspector"]')).not.toBeNull();
      firstApi?.showPanel("inspector");
      expect(first.querySelector('[data-dock-tab="inspector"]')?.getAttribute("aria-selected")).toBe("true");
      expect(second.querySelector('[data-dock-tab="workspace"]')?.getAttribute("aria-selected")).toBe("true");
    } finally { disposeFirst(); disposeSecond(); }
  });

  test("showPanel reveals its destination after a different narrow tab was selected", () => {
    const bounds = spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, 390, 600));
    const host = document.createElement("div");
    document.body.append(host);
    let api: DockingWorkbenchApi | undefined;
    const [layout, setLayout] = createSignal(createDockLayout(["project", "workspace"]));
    const dispose = render(() => <DockingWorkbench ariaLabel="Narrow editor docks" apiRef={value => { api = value; }}
      panels={["project", "workspace"].map(id => ({ id, label: id, content: <div>{id}</div> }))}
      layout={layout} onLayoutChange={setLayout} />, host);
    try {
      expect(host.querySelector('[data-docking-workbench]')?.getAttribute("data-narrow")).toBe("true");
      host.querySelector<HTMLButtonElement>('[data-dock-tab="project"]')!.click();
      expect(host.querySelector('[data-dock-tab="project"]')?.getAttribute("aria-selected")).toBe("true");
      expect(api?.showPanel("workspace")).toBe(true);
      expect(host.querySelector('[data-dock-tab="workspace"]')?.getAttribute("aria-selected")).toBe("true");
      expect(api?.showPanel("missing")).toBe(false);
      expect(host.querySelector('[data-dock-tab="workspace"]')?.getAttribute("aria-selected")).toBe("true");
    } finally { dispose(); bounds.mockRestore(); }
  });

  test("splits active tabs, keeps add controls in every dock, and restores closed panels", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let current = createDockLayout(panelIds);
    let api: DockingWorkbenchApi | undefined;
    const [layout, setLayout] = createSignal<DockLayout>(current);
    const dispose = render(() => <DockingWorkbench
      ariaLabel="Editor docks"
      apiRef={(value) => { api = value; }}
      panels={panelIds.map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), content: <div data-panel-content={id}>{id}</div> }))}
      layout={layout}
      onLayoutChange={(next) => { current = next; setLayout(next); }}
    />, host);

    host.querySelector<HTMLButtonElement>('[data-dock-tab="inspector"]')?.click();
    await Promise.resolve();
    expect(listDockStacks(current)[0]?.activePanelId).toBe("inspector");
    expect(host.querySelector('[data-dock-tab="inspector"]')?.getAttribute("aria-selected")).toBe("true");
    const options = host.querySelector<HTMLButtonElement>('[data-dock-panel-options="inspector"]');
    expect(options).not.toBeNull();
    options?.click();
    await Promise.resolve();
    const splitRight = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((button) => button.textContent === "Split right");
    expect(splitRight).not.toBeUndefined();
    splitRight?.click();
    await Promise.resolve();
    expect(listDockStacks(current).map((stack) => stack.panelIds)).toEqual([["project", "workspace", "console"], ["inspector"]]);
    expect(host.querySelectorAll<HTMLButtonElement>('[aria-label="Add panel"]')).toHaveLength(2);

    expect(api?.hidePanel("project")).toBe(false);
    expect(dockPanelIsOpen(current, "project")).toBe(false);
    expect(api?.showPanel("project")).toBe(true);
    expect(dockPanelIsOpen(current, "project")).toBe(true);
    expect(host.querySelectorAll('[data-panel-content="project"]')).toHaveLength(1);
    dispose();
  });

  test("saves the current tree as a named global preset", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [layout, setLayout] = createSignal(createDockLayout(["workspace"]));
    let saved: { name: string; layout: DockLayout } | undefined;
    const dispose = render(() => <DockingWorkbench
      ariaLabel="Editor docks"
      panels={[{ id: "workspace", label: "Workspace", content: <div>Canvas</div>, closeable: false }]}
      layout={layout}
      onLayoutChange={setLayout}
      onSavePreset={(name, value) => { saved = { name, layout: value }; }}
    />, host);

    host.querySelector<HTMLButtonElement>('[data-dock-save-preset]')?.click();
    await Promise.resolve();
    const input = host.querySelector<HTMLInputElement>('[aria-label="Layout preset name"]')!;
    input.value = "Animation";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.closest("form")?.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    expect(saved?.name).toBe("Animation");
    expect(saved?.layout.version).toBe(1);
    dispose();
  });
});


test("tab arrows leave modified navigation to the host command owner", () => {
  const [layout, setLayout] = createSignal(createDockLayout(["one", "two"]));
  const dispose = render(() => <DockingWorkbench ariaLabel="Keyboard dock" panels={[{ id: "one", label: "One", content: "One" }, { id: "two", label: "Two", content: "Two" }]} layout={layout} onLayoutChange={setLayout}/>, document.body);
  try {
    const one = document.querySelector<HTMLButtonElement>('[data-dock-tab="one"]'); if (!one) throw new Error("Missing first tab");
    one.focus();
    const modified = new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    one.dispatchEvent(modified); expect(modified.defaultPrevented).toBe(false);
    expect(document.activeElement === one).toBe(true);
    const plain = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    one.dispatchEvent(plain); expect(plain.defaultPrevented).toBe(true);
    expect(document.activeElement?.getAttribute("data-dock-tab")).toBe("two");
  } finally { dispose(); }
});
