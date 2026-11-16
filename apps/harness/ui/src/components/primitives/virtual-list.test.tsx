import { makeItems } from "../../utils/tests/list-fixtures";
/** @jsxImportSource solid-js */
import { afterEach,beforeAll,expect,it } from "bun:test";
import { createUiTest } from "../../utils/tests/test-harness";
import {
getVirtualListContentSize,
getVirtualListNextLoadedCount,
getVirtualListReverseScrollTop,
getVirtualListScrollTarget,
getVirtualListStickToEndScrollTop,
shouldResizeVirtualListRow
} from "./virtual-list";

let render: typeof import("@solidjs/testing-library").render;
let screen: typeof import("@solidjs/testing-library").screen;
let waitFor: typeof import("@solidjs/testing-library").waitFor;
let VirtualList: typeof import("./virtual-list").VirtualList;
const nativeResizeObserver = globalThis.ResizeObserver;

createUiTest("VirtualList", () => {
  beforeAll(async () => {
    ({ render, screen, waitFor } = await import("@solidjs/testing-library"));
    ({ VirtualList } = await import("./virtual-list"));
  });

  afterEach(() => {
    globalThis.ResizeObserver = nativeResizeObserver;
    window.__HARNESS_UI_TELEMETRY__ = [];
  });

  for (const kind of ['forward', 'reverse'] as const) {
    it(`renders the initial ${kind} page when items arrive after an empty mount`, async () => {
      const { createSignal } = await import('solid-js');
      const [items, setItems] = createSignal<ReturnType<typeof makeItems>>([]);
      const mounted = render(() => <VirtualList items={items()} getKey={item => item.id} estimateSize={40} pagination={{ kind, initialCount: 10 }} overscan={0}>
        {item => <div data-testid="arriving-row">{item.label}</div>}
      </VirtualList>);
      await Promise.resolve();
      expect(mounted.container.querySelectorAll('[data-testid="arriving-row"]')).toHaveLength(0);
      setItems(makeItems(80));
      await waitFor(() => expect(mounted.container.querySelectorAll('[data-testid="arriving-row"]').length).toBeGreaterThan(0));
      const canvas = mounted.container.querySelector<HTMLElement>('[data-test-virtual-list] > div');
      expect(Number.parseFloat(canvas?.style.height ?? '0')).toBeGreaterThan(0);
      expect(mounted.container.textContent).toContain(kind === 'forward' ? 'Row 0' : 'Row 79');
    });
  }

  it('resynchronizes rows when a hidden viewport restores its scroll position without a scroll event', async () => {
    const resizeObserver = installFakeResizeObserver();
    const mounted = render(() => <VirtualList items={makeItems(80)} getKey={item => item.id} estimateSize={40} pagination={{ kind: 'all' }} overscan={0}>
      {item => <div data-testid="revealed-row">{item.label}</div>}
    </VirtualList>);
    const viewport = mounted.container.querySelector<HTMLElement>('[data-test-virtual-list]')!;
    let height = 400;
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, get: () => height });
    Object.defineProperty(viewport, 'offsetHeight', { configurable: true, get: () => height });
    Object.defineProperty(viewport, 'offsetWidth', { configurable: true, get: () => 300 });
    viewport.scrollTop = 2800;
    viewport.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(mounted.container.textContent).toContain('Row 79'));
    height = 0; viewport.scrollTop = 0; viewport.dispatchEvent(new Event('scroll'));
    resizeObserver.triggerViewport();
    await Promise.resolve();
    height = 400; viewport.scrollTop = 2800;
    resizeObserver.triggerViewport();
    await waitFor(() => expect(mounted.container.textContent).toContain('Row 79'));
    expect(viewport.scrollTop).toBe(2800);
    // TanStack's scroll-end debounce may still contain the hidden pane's zero offset.
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(mounted.container.textContent).toContain('Row 79');
    expect(viewport.scrollTop).toBe(2800);
  });

  it("renders bounded visible rows for a large list", async () => {
    render(() => (
      <VirtualList
        items={makeItems(1000)}
        getKey={(item) => item.id}
        estimateSize={40}
        pagination={{ kind: "all" }}
        overscan={2}
      >
        {(item) => <div data-testid="virtual-list-row">{item.label}</div>}
      </VirtualList>
    ));

    await waitFor(() => expect(screen.getAllByTestId("virtual-list-row").length).toBeLessThan(40));
    expect(screen.getByText("Row 0")).not.toBeNull();
  });

  it("keeps the scroll canvas height stable when row content is taller than the estimate", async () => {
    const { container } = render(() => (
      <VirtualList
        items={makeItems(5)}
        getKey={(item) => item.id}
        estimateSize={40}
        pagination={{ kind: "all" }}
        overscan={0}
      >
        {(item) => (
          <div data-testid="virtual-list-row" style={{ height: "120px" }}>
            {item.label}
          </div>
        )}
      </VirtualList>
    ));

    await waitFor(() => expect(screen.getAllByTestId("virtual-list-row").length).toBeGreaterThan(0));
    const canvas = container.querySelector("[data-test-virtual-list] > div");
    const firstItem = container.querySelector("[data-test-virtual-list-item]");
    expect(canvas?.getAttribute("style")).toContain("height: 200px");
    expect(firstItem?.className).toContain("item");
  });

  it("lets measured virtual content shrink below the initial estimate", () => {
    expect(getVirtualListContentSize(280, 900)).toBe(900);
    expect(getVirtualListContentSize(0, 900)).toBe(900);
  });

  it("loads the next forward page near the bottom", () => {
    expect(
      getVirtualListNextLoadedCount({ kind: "forward", initialCount: 20, batchSize: 20, thresholdPx: 500 }, 20, 160, 390, 800, 400)
    ).toBe(40);
  });

  it("loads older reverse rows near the top and preserves scroll position", () => {
    expect(
      getVirtualListNextLoadedCount({ kind: "reverse", initialCount: 20, batchSize: 20, thresholdPx: 500 }, 20, 160, 0, 800, 400)
    ).toBe(40);
    expect(getVirtualListReverseScrollTop(120, 800, 1600)).toBe(920);
  });

  it("keeps stick-to-end rows pinned only while already near the end", () => {
    expect(getVirtualListStickToEndScrollTop(true, 400, 840, 400)).toBe(440);
    expect(getVirtualListStickToEndScrollTop(false, 0, 880, 400)).toBe(0);
  });

  it("scrolls to a key after pagination reset", () => {
    const target = getVirtualListScrollTarget({
      items: makeItems(120),
      getKey: (item) => item.id,
      key: "row-10",
      pagination: { kind: "reverse", initialCount: 20, batchSize: 20 },
      loadedCount: 20,
      estimateSize: 40,
      viewportHeight: 400
    });

    expect(target).toEqual({
      absoluteIndex: 10,
      loadedCount: 110,
      localIndex: 0,
      scrollTop: 0
    });
  });

  it("reapplies unchanged row measurements after virtualizer cache resets", () => {
    expect(shouldResizeVirtualListRow(64, 40, 64)).toBe(true);
    expect(shouldResizeVirtualListRow(64, 64, 64)).toBe(false);
    expect(shouldResizeVirtualListRow(64, 64, 96)).toBe(true);
    expect(shouldResizeVirtualListRow(undefined, 40, 64)).toBe(true);
  });

  it("emits repeated ResizeObserver row measurements when size is unchanged", async () => {
    const resizeObserver = installFakeResizeObserver();
    const { container } = render(() => (
      <VirtualList
        dataTest="measurement-test"
        items={makeItems(12)}
        getKey={(item) => item.id}
        estimateSize={40}
        pagination={{ kind: "all" }}
        overscan={0}
      >
        {(item) => <div data-testid="virtual-list-row">{item.label}</div>}
      </VirtualList>
    ));

    await waitFor(() => expect(screen.getAllByTestId("virtual-list-row").length).toBeGreaterThan(0));
    await waitFor(() => expect(resizeObserver.observedRowCount()).toBeGreaterThan(0));
    window.__HARNESS_UI_TELEMETRY__ = [];

    setMeasuredRowHeight(container, 64);
    resizeObserver.triggerObservedRows();
    await Promise.resolve();

    setMeasuredRowHeight(container, 64);
    resizeObserver.triggerObservedRows();
    await Promise.resolve();

    const telemetry = window.__HARNESS_UI_TELEMETRY__ ?? [];
    expect(telemetry.some((event) => event.kind === "virtual-list.measure-row" || event.kind === "virtual-list.measure-row-unchanged")).toBe(true);
  });
});



function setMeasuredRowHeight(container: HTMLElement, height: number) {
  container.querySelectorAll<HTMLElement>("[data-test-virtual-list-item]").forEach((element) => {
    element.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: height,
        width: 100,
        height,
        toJSON: () => ({})
      });
  });
}

function installFakeResizeObserver() {
  type FakeResizeObserver = ResizeObserver & { callback: ResizeObserverCallback; target?: Element };
  const observers: FakeResizeObserver[] = [];

  function FakeResizeObserver(callback: ResizeObserverCallback) {
    const observer: FakeResizeObserver = {
      callback,
      observe(target) { observer.target = target; },
      unobserve() { observer.target = undefined; },
      disconnect() { observer.target = undefined; },
    };
    observers.push(observer);
    return observer;
  }

  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, writable: true, value: FakeResizeObserver });

  return {
    triggerViewport() {
      for (const observer of observers) {
        const target = observer.target;
        if (!(target instanceof HTMLElement) || !target.hasAttribute('data-test-virtual-list')) continue;
        observer.callback([{ target, contentRect: target.getBoundingClientRect(), borderBoxSize: [{ inlineSize: target.offsetWidth, blockSize: target.offsetHeight }], contentBoxSize: [], devicePixelContentBoxSize: [] }], observer);
      }
    },
    triggerObservedRows() {
      for (const observer of observers) {
        const target = observer.target;
        if (!(target instanceof HTMLElement) || !target.hasAttribute("data-test-virtual-list-item")) {
          continue;
        }
        observer.callback(
          [
            {
              target,
              contentRect: target.getBoundingClientRect(),
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            }
          ],
          observer
        );
      }
    },
    observedRowCount() {
      return observers.filter((observer) => observer.target instanceof HTMLElement && observer.target.hasAttribute("data-test-virtual-list-item")).length;
    }
  };
}
