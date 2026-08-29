import { afterEach, describe, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { PanelGroup, type PanelDescriptor, type PanelGroupLayoutChangeReason } from "./panel-group";
import { normalizePanelGroupLayout, type PanelGroupLayout, type PanelGroupLayoutInput } from "./panel-group-layout";

const nativeResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: nativeResizeObserver });
});

function requireElement<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function horizontalPanels(): readonly PanelDescriptor[] {
  return [
    {
      id: "resources",
      label: "Resources",
      axis: "horizontal",
      minimumSize: 180,
      defaultSize: 260,
      maximumSize: 480,
      collapseMode: "hidden",
      persistenceScope: "editor.workspace.stage",
      resizeHandle: "end",
      narrowMode: "mode",
      content: <div data-test-resources="">Resources content</div>,
    },
    {
      id: "viewport",
      label: "Viewport",
      axis: "horizontal",
      minimumSize: 320,
      defaultSize: 720,
      maximumSize: 2_000,
      collapseMode: "none",
      persistenceScope: "editor.workspace.stage",
      resizeHandle: "none",
      narrowMode: "primary",
      grow: true,
      content: <div data-test-viewport="">Viewport content</div>,
    },
  ];
}

function mountPanelGroup(options: {
  panels?: readonly PanelDescriptor[];
  input?: PanelGroupLayoutInput;
  narrowBreakpoint?: number | false;
} = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const panels = options.panels ?? horizontalPanels();
  let current = normalizePanelGroupLayout(panels, options.input);
  const [layout, setLayout] = createSignal<PanelGroupLayoutInput>(current);
  const changes: Array<{ layout: PanelGroupLayout; reason: PanelGroupLayoutChangeReason; panelId: string }> = [];
  const dispose = render(() => (
    <PanelGroup
      id="stage-panels"
      panels={panels}
      layout={layout}
      ariaLabel="Stage workspace"
      narrowBreakpoint={options.narrowBreakpoint}
      onLayoutChange={(next, reason, panelId) => {
        current = next;
        changes.push({ layout: next, reason, panelId });
        setLayout(next);
      }}
    />
  ), host);
  return { host, panels, changes, dispose, current: () => current };
}

describe("PanelGroup", () => {
  test("exposes a clamped, collapsible horizontal separator to the keyboard", () => {
    const mounted = mountPanelGroup({ narrowBreakpoint: false });
    const separator = requireElement<HTMLElement>(mounted.host, '[data-panel-group-handle="resources"]');
    const panel = requireElement<HTMLElement>(mounted.host, '[data-panel-group-panel="resources"]');

    expect(separator.getAttribute("role")).toBe("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");
    expect(separator.getAttribute("aria-valuemin")).toBe("0");
    expect(separator.getAttribute("aria-valuemax")).toBe("480");
    expect(separator.getAttribute("aria-valuenow")).toBe("260");
    expect(separator.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.dataset.persistenceScope).toBe("editor.workspace.stage");

    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mounted.current().resources?.size).toBe(270);
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
    expect(mounted.current().resources?.size).toBe(320);
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(mounted.current().resources?.size).toBe(180);
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(mounted.current().resources?.size).toBe(480);

    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(mounted.current().resources?.collapsed).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(separator.getAttribute("aria-valuenow")).toBe("0");
    expect(separator.getAttribute("aria-valuetext")).toBe("Collapsed");
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(mounted.current().resources?.collapsed).toBe(false);

    separator.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(mounted.current().resources?.size).toBe(260);
    expect(mounted.changes.map((change) => change.reason)).toEqual([
      "resize-commit", "resize-commit", "resize-commit", "resize-commit", "toggle", "toggle", "reset",
    ]);
    mounted.dispose();
  });

  test("uses physical arrow direction for a start-edge vertical separator", () => {
    const resourcePanel = horizontalPanels()[0];
    if (!resourcePanel) throw new Error("Missing resource panel fixture");
    const panel: PanelDescriptor = {
      ...resourcePanel,
      id: "timeline",
      label: "Timeline",
      axis: "vertical",
      minimumSize: 120,
      defaultSize: 220,
      maximumSize: 600,
      resizeHandle: "start",
      content: <div>Timeline content</div>,
    };
    const mounted = mountPanelGroup({ panels: [panel], narrowBreakpoint: false });
    const separator = requireElement<HTMLElement>(mounted.host, '[data-panel-group-handle="timeline"]');
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");

    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(mounted.current().timeline?.size).toBe(210);
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true }));
    expect(mounted.current().timeline?.size).toBe(260);
    mounted.dispose();
  });

  test("commits captured pointer movement and stops after lost capture", () => {
    const mounted = mountPanelGroup({ narrowBreakpoint: false });
    const separator = requireElement<HTMLElement>(mounted.host, '[data-panel-group-handle="resources"]');
    let capturedPointer: number | undefined;
    separator.setPointerCapture = (pointerId) => { capturedPointer = pointerId; };
    separator.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    separator.releasePointerCapture = (pointerId) => { if (capturedPointer === pointerId) capturedPointer = undefined; };

    separator.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 7, clientX: 100 }));
    expect(capturedPointer).toBe(7);
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 145 }));
    expect(mounted.current().resources?.size).toBe(305);
    separator.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 7 }));
    expect(capturedPointer).toBeUndefined();
    expect(mounted.changes.at(-1)?.reason).toBe("resize-commit");
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");

    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 220 }));
    expect(mounted.current().resources?.size).toBe(305);
    mounted.dispose();
  });

  test("rolls pointer movement back on pointer cancel and releases capture", () => {
    const mounted = mountPanelGroup({ narrowBreakpoint: false });
    const separator = requireElement<HTMLElement>(mounted.host, '[data-panel-group-handle="resources"]');
    let capturedPointer: number | undefined;
    separator.setPointerCapture = (pointerId) => { capturedPointer = pointerId; };
    separator.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    separator.releasePointerCapture = () => { capturedPointer = undefined; };

    separator.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 9, clientX: 100 }));
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 9, clientX: 160 }));
    expect(mounted.current().resources?.size).toBe(320);
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 9, clientX: 160 }));
    expect(mounted.current().resources?.size).toBe(260);
    expect(mounted.changes.at(-1)?.reason).toBe("resize-cancel");
    expect(capturedPointer).toBeUndefined();
    mounted.dispose();
  });

  test("uses its own observed container to provide an explicit narrow panel mode", () => {
    let triggerResize: ((width: number, height: number) => void) | undefined;
    function FakeResizeObserver(callback: ResizeObserverCallback) {
      const observer: ResizeObserver = { observe() {}, unobserve() {}, disconnect() {} };
      triggerResize = (width, height) => callback([{
        target: document.body,
        contentRect: new DOMRectReadOnly(0, 0, width, height),
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: []
      }], observer);
      return observer;
    }
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: FakeResizeObserver });
    const mounted = mountPanelGroup({ input: { resources: { collapsed: true } }, narrowBreakpoint: 600 });
    const root = requireElement<HTMLElement>(mounted.host, "[data-panel-group]");

    triggerResize?.(480, 700);
    expect(root.dataset.narrow).toBe("true");
    expect(mounted.host.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(mounted.host.querySelector<HTMLElement>('[data-panel-group-handle-cell="resources"]')?.hidden).toBe(true);
    expect(mounted.host.querySelector<HTMLElement>('[data-panel-group-panel="viewport"]')?.hidden).toBe(false);
    expect(mounted.host.querySelector<HTMLElement>('[data-panel-group-panel="resources"]')?.hidden).toBe(true);

    const resourcesMode = requireElement<HTMLButtonElement>(mounted.host, '[data-panel-group-mode="resources"]');
    expect(resourcesMode.getAttribute("aria-controls")).toBe(
      requireElement<HTMLElement>(mounted.host, '[data-panel-group-panel="resources"]').id
    );
    resourcesMode.click();
    expect(mounted.current().resources?.collapsed).toBe(false);
    expect(resourcesMode.getAttribute("aria-selected")).toBe("true");
    expect(mounted.host.querySelector<HTMLElement>('[data-panel-group-panel="resources"]')?.hidden).toBe(false);
    expect(mounted.host.querySelector<HTMLElement>('[data-panel-group-panel="viewport"]')?.hidden).toBe(true);

    resourcesMode.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mounted.host.querySelector<HTMLButtonElement>('[data-panel-group-mode="viewport"]')?.getAttribute("aria-selected")).toBe("true");

    triggerResize?.(900, 700);
    expect(root.dataset.narrow).toBe("false");
    expect(mounted.host.querySelector<HTMLElement>('[role="tablist"]')?.hidden).toBe(true);
    expect(mounted.host.querySelector<HTMLElement>('[data-panel-group-handle-cell="resources"]')?.hidden).toBe(false);
    mounted.dispose();
  });
});
