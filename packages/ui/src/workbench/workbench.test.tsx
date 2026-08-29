import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { defaultWorkbenchLayout, type WorkbenchLayout } from "./layout";
import { WorkbenchShell } from "./workbench";

afterEach(() => document.body.replaceChildren());

describe("WorkbenchShell", () => {
  test("exposes keyboard-resizable and collapsible separators", () => {
    const host = document.createElement("div");
    document.body.append(host);
    let current: WorkbenchLayout = { ...defaultWorkbenchLayout, inspectorCollapsed: true, bottomCollapsed: true };
    const [layout, setLayout] = createSignal(current);
    const dispose = render(() => (
      <WorkbenchShell
        layout={layout}
        sidebar={<div data-test-sidebar="">Sidebar</div>}
        main={<div>Main</div>}
        panelLabels={{ sidebar: "project browser" }}
        onLayoutChange={(next) => { current = next; setLayout(next); }}
      />
    ), host);

    const separator = host.querySelector<HTMLElement>('[data-workbench-handle="sidebar"]')!;
    expect(separator.getAttribute("role")).toBe("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(current.sidebarSize).toBe(defaultWorkbenchLayout.sidebarSize + 10);
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(current.sidebarCollapsed).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-workbench-panel="sidebar"]')?.hidden).toBe(true);
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(current.sidebarCollapsed).toBe(false);
    separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(current.sidebarSize).toBe(defaultWorkbenchLayout.sidebarSize);
    dispose();
  });

  test("shares captured pointer and axis-aware separator behavior with generalized panels", () => {
    const host = document.createElement("div");
    document.body.append(host);
    let current: WorkbenchLayout = { ...defaultWorkbenchLayout };
    const changes: Array<{ reason: string; panel: string }> = [];
    const [layout, setLayout] = createSignal(current);
    const dispose = render(() => (
      <WorkbenchShell
        layout={layout}
        sidebar={<div>Sidebar</div>}
        main={<div>Main</div>}
        inspector={<div>Inspector</div>}
        bottomPanel={<div>Console</div>}
        onLayoutChange={(next, reason, panel) => {
          current = next;
          changes.push({ reason, panel });
          setLayout(next);
        }}
      />
    ), host);

    const sidebar = host.querySelector<HTMLElement>('[data-workbench-handle="sidebar"]')!;
    let capturedPointer: number | undefined;
    sidebar.setPointerCapture = (pointerId) => { capturedPointer = pointerId; };
    sidebar.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    sidebar.releasePointerCapture = () => { capturedPointer = undefined; };
    sidebar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 13, clientX: 100 }));
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 13, clientX: 140 }));
    expect(current.sidebarSize).toBe(defaultWorkbenchLayout.sidebarSize + 40);
    sidebar.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 13 }));
    expect(capturedPointer).toBeUndefined();
    expect(changes.at(-1)).toEqual({ reason: "resize-commit", panel: "sidebar" });
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");

    const inspector = host.querySelector<HTMLElement>('[data-workbench-handle="inspector"]')!;
    inspector.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }));
    expect(current.inspectorSize).toBe(defaultWorkbenchLayout.inspectorSize + 50);
    const bottom = host.querySelector<HTMLElement>('[data-workbench-handle="bottom"]')!;
    bottom.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(current.bottomSize).toBe(defaultWorkbenchLayout.bottomSize + 10);
    dispose();
  });
});
