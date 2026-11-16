import { createEffect, createMemo, createSignal, onCleanup, onMount, splitProps, untrack, type JSX } from "solid-js";
import { createVirtualizer, observeElementOffset } from "@tanstack/solid-virtual";
import { recordUiTelemetry } from "../../../lib/ui-telemetry";
import {
  DEFAULT_VISIBLE_COUNT, NEAR_END_PX, NO_RESIZE_OBSERVER_ROW_SETTLE_FRAMES,
  PAGINATION_SCROLL_THROTTLE_MS, VIEWPORT_MEASUREMENT_SETTLE_FRAMES, anchorsEqual,
  clampLoadedCount, getListAnchor, isVirtualListDebugEnabled, parseCssPixels, readWindowItems,
  resolveBatchSize, resolveInitialCount, resolveThresholdPx, shouldResizeVirtualListRow,
  type EstimatedVirtualItem, type ListAnchor, type ViewWindow, type ViewportMeasurementOptions,
  type VirtualListHandle, type VirtualListProps,
} from "./model";

export function createVirtualListModel<T>(props: VirtualListProps<T>) {
  const [local, rest] = splitProps(props, [
    "items",
    "getKey",
    "estimateSize",
    "pagination",
    "overscan",
    "class",
    "contentClass",
    "itemClass",
    "dataTest",
    "empty",
    "stickToEnd",
    "viewportRef",
    "handleRef",
    "onScroll",
    "onStickToEndChange",
    "children"
  ]);
  const [loadedCount, setLoadedCount] = createSignal(resolveInitialCount(local.pagination));
  const [lastAnchor, setLastAnchor] = createSignal<ListAnchor>();
  const [stuckToEnd, setStuckToEnd] = createSignal(true);
  const [itemSignature, setItemSignature] = createSignal("");
  const [measurementVersion, setMeasurementVersion] = createSignal(0);
  const runtime: {
    viewport?: HTMLDivElement;
    viewportObserver?: ResizeObserver;
    synchronizeScrollOffset?: () => void;
    paginationThrottle?: number;
    pendingPaginationFrame?: number;
    pendingViewportMeasurementFrame?: number;
    pendingViewportMeasurementOptions: ViewportMeasurementOptions;
    pendingObservedRowsMeasurementFrame?: number;
    paginationAbortController?: AbortController;
    stickToEndSettleFramesRemaining: number;
    debugMeasureSequence: number;
    debugLastContentTrace: string;
  } = {
    pendingViewportMeasurementOptions: {},
    stickToEndSettleFramesRemaining: 0,
    debugMeasureSequence: 0,
    debugLastContentTrace: "",
  };
  const rowObservers = new WeakMap<HTMLDivElement, ResizeObserver>();
  const observedRowElements = new Set<HTMLDivElement>();
  const measuredRowSizes = new Map<string, number>();
  const items = () => props.items;
  const viewWindow = createMemo<ViewWindow<T>>(() => {
    const currentItems = items();
    if (local.pagination.kind === "all") {
      return { items: readWindowItems(currentItems, 0, currentItems.length), absoluteStart: 0 };
    }
    const count = Math.min(currentItems.length, loadedCount());
    if (local.pagination.kind === "reverse") {
      const absoluteStart = Math.max(0, currentItems.length - count);
      return { items: readWindowItems(currentItems, absoluteStart, currentItems.length), absoluteStart };
    }
    return { items: readWindowItems(currentItems, 0, count), absoluteStart: 0 };
  });
  const keyIndex = createMemo(() => {
    const index = new Map<string, number>();
    items().forEach((item, absoluteIndex) => index.set(local.getKey(item, absoluteIndex), absoluteIndex));
    return index;
  });
  return {
    local, rest, runtime, rowObservers, observedRowElements, measuredRowSizes, items,
    loadedCount, setLoadedCount, lastAnchor, setLastAnchor, stuckToEnd, setStuckToEnd,
    itemSignature, setItemSignature, measurementVersion, setMeasurementVersion,
    viewWindow, keyIndex,
  };
}

export type VirtualListModel<T> = ReturnType<typeof createVirtualListModel<T>>;
export type VirtualListVirtualizer = ReturnType<typeof createVirtualizer<HTMLDivElement, HTMLDivElement>>;

export function observeVirtualListOffset<T>(model: VirtualListModel<T>, virtualizer: VirtualListVirtualizer, onChange: (offset: number, scrolling: boolean) => void) {
  const cleanup = observeElementOffset(virtualizer, (offset, scrolling) => {
    const element = virtualizer.scrollElement;
    // A queued scroll-end callback may still carry the offset observed while hidden.
    onChange(element && element.clientHeight > 0 ? element.scrollTop : offset, scrolling);
  });
  const synchronize = () => {
    const element = virtualizer.scrollElement;
    // Revealing a mounted pane can restore scrollTop without a new scroll event.
    if (element && element.clientHeight > 0 && element.scrollTop !== virtualizer.scrollOffset) onChange(element.scrollTop, false);
  };
  model.runtime.synchronizeScrollOffset = synchronize;
  return () => {
    cleanup?.();
    if (model.runtime.synchronizeScrollOffset === synchronize) model.runtime.synchronizeScrollOffset = undefined;
  };
}

export function getVirtualListRowElementIndex(element: HTMLElement) {
  const index = Number(element.dataset.index);
  return Number.isFinite(index) ? index : -1;
}

export function createVirtualListSizeEstimator<T>(model: VirtualListModel<T>) {
  const { local, measuredRowSizes, viewWindow } = model;

  function getVirtualRowKey(index: number) {
    const item = viewWindow().items[index];
    const absoluteIndex = viewWindow().absoluteStart + index;
    return item ? local.getKey(item, absoluteIndex) : `virtual-row-${absoluteIndex}`;
  }

  function estimateBaseSizeForIndex(index: number) {
    const measuredSize = measuredRowSizes.get(getVirtualRowKey(index));
    if (measuredSize !== undefined) return measuredSize;
    const item = viewWindow().items[index];
    if (typeof local.estimateSize === "number") return local.estimateSize;
    return item === undefined ? DEFAULT_VISIBLE_COUNT : local.estimateSize(item);
  }

  function estimateWindowTotalSize() {
    return Math.max(0, estimateWindowContentSize() - 720);
  }

  function estimateAverageSize() {
    const count = viewWindow().items.length;
    if (count === 0) return DEFAULT_VISIBLE_COUNT;
    if (typeof local.estimateSize === "number") return local.estimateSize;
    const sampleCount = Math.min(count, 24);
    let total = 0;
    for (let index = 0; index < sampleCount; index += 1) total += estimateBaseSizeForIndex(index);
    return total / sampleCount;
  }

  function estimateWindowContentSize() {
    const count = viewWindow().items.length;
    let total = 0;
    for (let index = 0; index < count; index += 1) total += estimateBaseSizeForIndex(index);
    return total;
  }

  function estimateOffsetForIndex(index: number) {
    let offset = 0;
    for (let current = 0; current < index; current += 1) offset += estimateBaseSizeForIndex(current);
    return offset;
  }

  function estimateVirtualItemForIndex(index: number): EstimatedVirtualItem | undefined {
    if (index < 0 || index >= viewWindow().items.length) return undefined;
    return { index, start: estimateOffsetForIndex(index), size: estimateBaseSizeForIndex(index) };
  }

  return {
    getVirtualRowKey, estimateBaseSizeForIndex, estimateWindowTotalSize,
    estimateAverageSize, estimateWindowContentSize, estimateOffsetForIndex,
    estimateVirtualItemForIndex,
  };
}

export function createVirtualListDebugRuntime<T>(
  model: VirtualListModel<T>,
  virtualizer: VirtualListVirtualizer,
  getElementIndex: (element: HTMLElement) => number,
) {
  const { local, runtime, items, loadedCount, viewWindow } = model;

  function debugRowStyle(start: number): JSX.CSSProperties {
    const style: JSX.CSSProperties = { transform: `translateY(${start}px)` };
    if (isVirtualListDebugEnabled()) {
      style.outline = "1px solid red";
      style.background = "rgba(255, 0, 0, 0.025)";
      style["will-change"] = "transform";
    }
    return style;
  }

  function debugContentStyle(height: number): JSX.CSSProperties {
    const style: JSX.CSSProperties = { height: `${height}px` };
    if (isVirtualListDebugEnabled()) {
      style.outline = "1px solid rgba(255, 0, 0, 0.55)";
      style["background-image"] = "linear-gradient(to bottom, rgba(255, 0, 0, 0.08) 0, rgba(255, 0, 0, 0.08) 1px, transparent 1px, transparent 40px)";
    }
    return style;
  }

  function debugTraceRowMeasurement(label: string, detail: Record<string, unknown>) {
    runtime.debugMeasureSequence += 1;
    debugTrace(label, {
      seq: runtime.debugMeasureSequence,
      dataTest: local.dataTest,
      itemCount: items().length,
      windowItemCount: viewWindow().items.length,
      loadedCount: loadedCount(),
      ...detail,
    });
  }

  function debugTraceVirtualOffsets(label: string, changedIndex: number, oldSize: number | undefined, newSize: number) {
    const rows = virtualizer.getVirtualItems().filter((row) => row !== undefined);
    const changedRow = rows.find((row) => row.index === changedIndex);
    const nextRow = rows.find((row) => row.index > changedIndex);
    const previousRow = rows.slice().reverse().find((row) => row.index < changedIndex);
    debugTrace(label, {
      seq: runtime.debugMeasureSequence,
      dataTest: local.dataTest,
      changedIndex,
      oldSize,
      newSize,
      changedStart: changedRow?.start,
      changedVirtualSize: changedRow?.size,
      previousIndex: previousRow?.index,
      previousStart: previousRow?.start,
      previousSize: previousRow?.size,
      nextIndex: nextRow?.index,
      nextStart: nextRow?.start,
      nextSize: nextRow?.size,
      expectedNextStart: changedRow ? changedRow.start + newSize : undefined,
      nextStartDelta: changedRow && nextRow ? nextRow.start - (changedRow.start + newSize) : undefined,
      totalSize: virtualizer.getTotalSize(),
      scrollHeight: runtime.viewport?.scrollHeight,
      scrollTop: runtime.viewport?.scrollTop,
    });
  }

  function debugForceRepaint(element: HTMLElement, reason: string) {
    const rect = element.getBoundingClientRect();
    debugTrace("forced-repaint", {
      seq: runtime.debugMeasureSequence,
      dataTest: local.dataTest,
      reason,
      index: getElementIndex(element),
      rectHeight: rect.height,
      offsetHeight: element.offsetHeight,
      contentHeight: element.parentElement?.offsetHeight,
    });
  }

  function debugTrace(label: string, detail: Record<string, unknown>) {
    console.log(`[virtual-list debug] ${label}`, detail);
  }

  return { debugRowStyle, debugContentStyle, debugTraceRowMeasurement, debugTraceVirtualOffsets, debugForceRepaint, debugTrace };
}

export function createVirtualListPaginationRuntime<T>(
  model: VirtualListModel<T>,
  virtualizer: VirtualListVirtualizer,
  isNearEnd: () => boolean,
) {
  const { local, runtime, items, loadedCount, setLoadedCount, setStuckToEnd, setMeasurementVersion } = model;

  function ensureIndexLoaded(index: number) {
    if (local.pagination.kind === "all") return;
    if (local.pagination.kind === "forward") {
      setLoadedCount((current) => Math.max(current, index + 1));
      return;
    }
    setLoadedCount((current) => Math.max(current, items().length - index));
  }

  function loadNextPage() {
    const currentItems = items();
    if (!runtime.viewport || local.pagination.kind === "all" || loadedCount() >= currentItems.length) return false;
    const batchSize = resolveBatchSize(local.pagination);
    runtime.paginationAbortController?.abort();
    const abortController = new AbortController();
    runtime.paginationAbortController = abortController;
    if (local.pagination.kind === "forward") {
      setLoadedCount((current) => Math.min(currentItems.length, current + batchSize));
      if (abortController.signal.aborted) return false;
      queueCatchUpPaginationCheck();
      return true;
    }
    const previousScrollHeight = runtime.viewport.scrollHeight || virtualizer.getTotalSize();
    const previousScrollTop = runtime.viewport.scrollTop;
    setLoadedCount((current) => Math.min(currentItems.length, current + batchSize));
    if (runtime.pendingPaginationFrame !== undefined) window.cancelAnimationFrame(runtime.pendingPaginationFrame);
    runtime.pendingPaginationFrame = window.requestAnimationFrame(() => {
      runtime.pendingPaginationFrame = undefined;
      if (!runtime.viewport || abortController.signal.aborted) return;
      const nextScrollHeight = runtime.viewport.scrollHeight || virtualizer.getTotalSize();
      const nextScrollTop = previousScrollTop + Math.max(0, nextScrollHeight - previousScrollHeight);
      runtime.viewport.scrollTop = nextScrollTop;
      virtualizer.scrollToOffset(nextScrollTop);
      setStuckToEnd(isNearEnd());
      setMeasurementVersion((version) => version + 1);
      queueCatchUpPaginationCheck();
    });
    return true;
  }

  function schedulePaginationCheck(immediate = false) {
    if (runtime.paginationThrottle !== undefined) {
      window.clearTimeout(runtime.paginationThrottle);
      runtime.paginationThrottle = undefined;
    }
    if (immediate) {
      runPaginationCheck();
      return;
    }
    runtime.paginationThrottle = window.setTimeout(() => {
      runtime.paginationThrottle = undefined;
      runPaginationCheck();
    }, PAGINATION_SCROLL_THROTTLE_MS);
  }

  function runPaginationCheck() {
    if (runtime.viewport && isWithinPaginationThreshold()) loadNextPage();
  }

  function queueCatchUpPaginationCheck() {
    queueMicrotask(() => {
      if (runtime.viewport && isWithinPaginationThreshold()) schedulePaginationCheck(true);
    });
  }

  function isWithinPaginationThreshold() {
    if (!runtime.viewport || local.pagination.kind === "all") return false;
    const thresholdPx = resolveThresholdPx(local.pagination);
    return local.pagination.kind === "forward"
      ? runtime.viewport.scrollHeight - runtime.viewport.scrollTop - runtime.viewport.clientHeight <= thresholdPx
      : runtime.viewport.scrollTop <= thresholdPx;
  }

  function handleScroll(event: Event & { currentTarget: HTMLDivElement; target: Element }) {
    local.onScroll?.(event);
    if (local.pagination.kind !== "all") schedulePaginationCheck();
    if (local.pagination.kind === "forward") {
      const distanceFromEnd = event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight;
      setStuckToEnd(distanceFromEnd <= NEAR_END_PX);
      return;
    }
    setStuckToEnd(isNearEnd());
  }

  return { ensureIndexLoaded, handleScroll };
}

export function registerVirtualListLifecycle<T>(
  model: VirtualListModel<T>,
  virtualizer: VirtualListVirtualizer,
  handle: VirtualListHandle,
  capabilities: {
    observeViewport: () => void;
    startStickToEndSettle: () => void;
    queueViewportMeasurement: (options?: ViewportMeasurementOptions) => void;
    scrollToEnd: () => void;
    disconnectRowObserver: (element: HTMLDivElement) => void;
    measureObservedRows: () => void;
    queueObservedRowsMeasurement: () => void;
  },
) {
  const {
    local, runtime, observedRowElements, items, loadedCount, setLoadedCount,
    lastAnchor, setLastAnchor, stuckToEnd, itemSignature, setItemSignature,
    setMeasurementVersion,
  } = model;
  const {
    observeViewport, startStickToEndSettle, queueViewportMeasurement, scrollToEnd,
    disconnectRowObserver, measureObservedRows, queueObservedRowsMeasurement,
  } = capabilities;
  onMount(() => {
    observeViewport();
    startStickToEndSettle();
    queueViewportMeasurement({
      forceScrollToEnd: local.stickToEnd || local.pagination.kind === "reverse",
      stickToEndSettle: local.stickToEnd,
      retryFrames: VIEWPORT_MEASUREMENT_SETTLE_FRAMES
    });
    if (local.stickToEnd || local.pagination.kind === "reverse") {
      queueMicrotask(scrollToEnd);
    }
  });

  onCleanup(() => {
    if (runtime.paginationThrottle !== undefined) {
      window.clearTimeout(runtime.paginationThrottle);
    }
    if (runtime.pendingPaginationFrame !== undefined) {
      window.cancelAnimationFrame(runtime.pendingPaginationFrame);
    }
    if (runtime.pendingViewportMeasurementFrame !== undefined) {
      window.cancelAnimationFrame(runtime.pendingViewportMeasurementFrame);
    }
    if (runtime.pendingObservedRowsMeasurementFrame !== undefined) {
      window.cancelAnimationFrame(runtime.pendingObservedRowsMeasurementFrame);
    }
    runtime.paginationAbortController?.abort();
    runtime.viewportObserver?.disconnect();
    observedRowElements.forEach(disconnectRowObserver);
  });

  createEffect(() => {
    local.handleRef?.(handle);
  });

  createEffect(() => {
    const currentItems = items();
    const anchor = getListAnchor(currentItems, local.getKey);
    const previous = untrack(lastAnchor);
    // Empty mounts still need an anchor so the first async page restores its window.
    if (!previous || !anchorsEqual(previous, anchor)) {
      setLastAnchor(anchor);
    }
    if (currentItems.length === 0) {
      setLoadedCount(0);
      return;
    }
    if (!previous) {
      return;
    }

    const currentLoadedCount = loadedCount();
    const initialCount = resolveInitialCount(local.pagination);
    if (local.pagination.kind === "all") {
      setLoadedCount(currentItems.length);
      return;
    }

    if (local.pagination.kind === "reverse" && previous.lastKey && anchor.lastKey !== previous.lastKey) {
      const previousLastIndex = currentItems.findIndex((item, index) => local.getKey(item, index) === previous.lastKey);
      if (previousLastIndex >= 0 && previousLastIndex < currentItems.length - 1) {
        const appendedCount = currentItems.length - previousLastIndex - 1;
        setLoadedCount(Math.min(currentItems.length, currentLoadedCount + appendedCount));
        return;
      }
    }

    if (local.pagination.kind === "forward" && previous.firstKey && anchor.firstKey === previous.firstKey) {
      setLoadedCount(clampLoadedCount(currentItems.length, Math.max(initialCount, currentLoadedCount)));
      return;
    }

    if (local.pagination.kind === "reverse" && previous.lastKey && anchor.lastKey === previous.lastKey) {
      setLoadedCount(clampLoadedCount(currentItems.length, Math.max(initialCount, currentLoadedCount)));
      return;
    }

    setLoadedCount(clampLoadedCount(currentItems.length, initialCount));
  });

  createEffect(() => {
    if (local.pagination.kind === "all") {
      setLoadedCount(items().length);
    } else if (loadedCount() > items().length) {
      setLoadedCount(items().length);
    }
  });

  createEffect(() => {
    itemSignature();
    virtualizer.measure();
    queueMicrotask(measureObservedRows);
    queueObservedRowsMeasurement();
    setMeasurementVersion((version) => version + 1);
  });

  createEffect(() => {
    local.onStickToEndChange?.(stuckToEnd());
  });

  createEffect(() => {
    const currentItems = items();
    const keys = currentItems.map((item, index) => local.getKey(item, index)).join("\n");
    if (keys !== untrack(itemSignature)) {
      recordUiTelemetry("virtual-list.item-signature", {
        dataTest: local.dataTest,
        itemCount: currentItems.length,
        loadedCount: loadedCount(),
        paginationKind: local.pagination.kind
      });
      setItemSignature(keys);
    }
  });

  createEffect(() => {
    const itemCount = items().length;
    const wasStuck = untrack(stuckToEnd);
    if (local.stickToEnd && (wasStuck || runtime.stickToEndSettleFramesRemaining > 0) && itemCount > 0) {
      startStickToEndSettle();
      queueViewportMeasurement({ forceScrollToEnd: true, stickToEndSettle: true, retryFrames: VIEWPORT_MEASUREMENT_SETTLE_FRAMES });
      queueMicrotask(scrollToEnd);
    }
  });

}

export function createVirtualListViewportRuntime<T>(
  model: VirtualListModel<T>,
  virtualizer: VirtualListVirtualizer,
  capabilities: {
    measureObservedRows: () => void;
    queueObservedRowsMeasurement: () => void;
    totalEstimatedSize: () => number;
  },
) {
  const { local, runtime, stuckToEnd, setStuckToEnd, setMeasurementVersion, viewWindow } = model;
  const { measureObservedRows, queueObservedRowsMeasurement, totalEstimatedSize } = capabilities;
  function setViewport(element: HTMLDivElement) {
    runtime.viewport = element;
    local.viewportRef?.(element);
    observeViewport();
    startStickToEndSettle();
    queueViewportMeasurement({
      forceScrollToEnd: local.stickToEnd || local.pagination.kind === "reverse",
      stickToEndSettle: local.stickToEnd,
      retryFrames: VIEWPORT_MEASUREMENT_SETTLE_FRAMES
    });
  }

  function observeViewport() {
    if (!runtime.viewport) {
      return;
    }
    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor !== "undefined") {
      const element = runtime.viewport;
      runtime.viewportObserver?.disconnect();
      runtime.viewportObserver = new ResizeObserverCtor((entries) => {
        entries[0]?.contentRect.width;
        entries[0]?.contentRect.height;
        queueViewportMeasurement({ scrollToEndIfStuck: local.stickToEnd });
      });
      runtime.viewportObserver.observe(element);
    }
  }

  function startStickToEndSettle() {
    if (!local.stickToEnd) {
      return;
    }
    runtime.stickToEndSettleFramesRemaining = Math.max(runtime.stickToEndSettleFramesRemaining, VIEWPORT_MEASUREMENT_SETTLE_FRAMES);
  }

  function queueViewportMeasurement(options: ViewportMeasurementOptions = {}) {
    runtime.pendingViewportMeasurementOptions = {
      forceScrollToEnd: runtime.pendingViewportMeasurementOptions.forceScrollToEnd || options.forceScrollToEnd,
      scrollToEndIfStuck: runtime.pendingViewportMeasurementOptions.scrollToEndIfStuck || options.scrollToEndIfStuck,
      stickToEndSettle: runtime.pendingViewportMeasurementOptions.stickToEndSettle || options.stickToEndSettle,
      retryFrames: Math.max(runtime.pendingViewportMeasurementOptions.retryFrames ?? 0, options.retryFrames ?? 0)
    };
    if (runtime.pendingViewportMeasurementFrame !== undefined) {
      return;
    }
    runtime.pendingViewportMeasurementFrame = window.requestAnimationFrame(() => {
      runtime.pendingViewportMeasurementFrame = undefined;
      const currentOptions = runtime.pendingViewportMeasurementOptions;
      runtime.pendingViewportMeasurementOptions = {};
      if (!runtime.viewport) {
        return;
      }
      const wasStuck = stuckToEnd();
      const shouldSettleToEnd = Boolean(currentOptions.stickToEndSettle && local.stickToEnd && runtime.stickToEndSettleFramesRemaining > 0);
      runtime.synchronizeScrollOffset?.();
      virtualizer.measure();
      measureObservedRows();
      queueObservedRowsMeasurement();
      setStuckToEnd(isNearEnd());
      setMeasurementVersion((version) => version + 1);
      if (currentOptions.forceScrollToEnd || shouldSettleToEnd || (currentOptions.scrollToEndIfStuck && wasStuck)) {
        queueMicrotask(scrollToEnd);
      }
      if (shouldSettleToEnd) {
        runtime.stickToEndSettleFramesRemaining = Math.max(0, runtime.stickToEndSettleFramesRemaining - 1);
      }
      if ((currentOptions.retryFrames ?? 0) > 0) {
        queueViewportMeasurement({
          forceScrollToEnd: currentOptions.forceScrollToEnd && runtime.viewport.clientHeight <= 1,
          scrollToEndIfStuck: currentOptions.scrollToEndIfStuck || (local.stickToEnd && wasStuck),
          stickToEndSettle: currentOptions.stickToEndSettle && runtime.stickToEndSettleFramesRemaining > 0,
          retryFrames: (currentOptions.retryFrames ?? 0) - 1
        });
      }
    });
  }

  function isNearEnd() {
    if (!runtime.viewport) {
      return true;
    }
    return runtime.viewport.scrollHeight - runtime.viewport.scrollTop - runtime.viewport.clientHeight <= NEAR_END_PX;
  }

  function scrollToEnd() {
    queueMicrotask(() => {
      const count = viewWindow().items.length;
      if (runtime.viewport && count > 0) {
        const nextScrollTop = Math.max(0, totalEstimatedSize() - (runtime.viewport.clientHeight || 720));
        virtualizer.scrollToIndex(count - 1, { align: "end" });
        runtime.viewport.scrollTop = nextScrollTop;
        virtualizer.scrollToOffset(nextScrollTop);
        setMeasurementVersion((version) => version + 1);
      }
    });
  }

  return { setViewport, observeViewport, startStickToEndSettle, queueViewportMeasurement, isNearEnd, scrollToEnd };
}

export function createVirtualListMeasurementRuntime<T>(
  model: VirtualListModel<T>,
  estimator: ReturnType<typeof createVirtualListSizeEstimator<T>>,
  virtualizer: VirtualListVirtualizer,
  debug: ReturnType<typeof createVirtualListDebugRuntime<T>>,
  scrollToEnd: () => void,
  isNearEnd: () => boolean,
  totalContentSize: () => number,
) {
  const {
    local, runtime, rowObservers, observedRowElements, measuredRowSizes, items,
    loadedCount, setMeasurementVersion, viewWindow,
  } = model;
  const { getVirtualRowKey, estimateBaseSizeForIndex, estimateVirtualItemForIndex } = estimator;
  const { debugTraceRowMeasurement, debugTraceVirtualOffsets, debugForceRepaint } = debug;
  function setRowElement(element: HTMLDivElement, index: number, key: string) {
    element.setAttribute("data-index", String(index));
    element.setAttribute("data-virtual-key", key);
    observedRowElements.add(element);
    queueMicrotask(() => measureRowElement(element, index));
    window.requestAnimationFrame(() => measureRowElement(element, getVirtualListRowElementIndex(element), true));

    const ResizeObserverCtor = globalThis.ResizeObserver;
    if (typeof ResizeObserverCtor === "undefined") {
      queueRowElementMeasurementRetry(element, NO_RESIZE_OBSERVER_ROW_SETTLE_FRAMES);
      return;
    }
    if (rowObservers.has(element)) {
      return;
    }

    const observer = new ResizeObserverCtor(() => measureRowElement(element, getVirtualListRowElementIndex(element), true));
    observer.observe(element);
    rowObservers.set(element, observer);
  }

  function measureRowElement(element: HTMLDivElement, index: number, allowEstimatedVirtualRow = false) {
    if (!element.isConnected || index < 0 || index >= viewWindow().items.length) {
      if (!element.isConnected) {
        disconnectRowObserver(element);
      }
      recordUiTelemetry("virtual-list.measure-row-skipped", {
        dataTest: local.dataTest,
        index,
        itemCount: items().length,
        windowItemCount: viewWindow().items.length,
        loadedCount: loadedCount(),
        connected: element.isConnected
      });
      return;
    }

    const debugEnabled = isVirtualListDebugEnabled();
    const rect = element.getBoundingClientRect();
    const styles = debugEnabled ? window.getComputedStyle(element) : undefined;
    const marginTop = styles ? parseCssPixels(styles.marginTop) : 0;
    const marginBottom = styles ? parseCssPixels(styles.marginBottom) : 0;
    const measuredSize = Math.ceil(rect.height || element.offsetHeight || estimateBaseSizeForIndex(index));
    const measurementKey = getRowElementMeasurementKey(element, index);
    const previousMeasuredSize = measuredRowSizes.get(measurementKey);
    const actualVirtualRow = virtualizer.getVirtualItems().find((item) => item?.index === index);
    const virtualRowBefore = actualVirtualRow ?? (allowEstimatedVirtualRow ? estimateVirtualItemForIndex(index) : undefined);
    const usingEstimatedVirtualRow = !actualVirtualRow && Boolean(virtualRowBefore);
    const estimatedSize = estimateBaseSizeForIndex(index);
    if (debugEnabled) {
      debugTraceRowMeasurement("before-resizeItem", {
        index,
        oldSize: previousMeasuredSize,
        measuredSize,
        estimatedSize,
        rectHeight: rect.height,
        offsetHeight: element.offsetHeight,
        scrollHeight: element.scrollHeight,
        marginTop,
        marginBottom,
        visualHeightWithMargins: rect.height + marginTop + marginBottom,
        virtualStart: virtualRowBefore?.start,
        virtualSize: virtualRowBefore?.size,
        totalSize: virtualizer.getTotalSize(),
        contentSize: totalContentSize(),
        scrollTop: runtime.viewport?.scrollTop
      });
    }
    if (!virtualRowBefore) {
      queueRowElementMeasurement(element);
      return;
    }

    if (
      (usingEstimatedVirtualRow && previousMeasuredSize === measuredSize) ||
      !shouldResizeVirtualListRow(previousMeasuredSize, virtualRowBefore.size, measuredSize)
    ) {
      recordUiTelemetry("virtual-list.measure-row-unchanged", {
        dataTest: local.dataTest,
        index,
        measuredSize,
        itemCount: items().length,
        loadedCount: loadedCount()
      });
      if (debugEnabled) {
        debugForceRepaint(element, "unchanged-measurement");
      }
      return;
    }

    const shouldMaintainStickToEnd = local.stickToEnd && (runtime.stickToEndSettleFramesRemaining > 0 || isNearEnd());
    measuredRowSizes.set(measurementKey, measuredSize);
    recordUiTelemetry("virtual-list.measure-row", {
      dataTest: local.dataTest,
      index,
      measuredSize,
      previousMeasuredSize,
      itemCount: items().length,
      loadedCount: loadedCount()
    });
    virtualizer.resizeItem(index, measuredSize);
    if (shouldMaintainStickToEnd) {
      queueMicrotask(scrollToEnd);
    }
    if (debugEnabled) {
      debugForceRepaint(element, "after-resizeItem-sync");
      debugTraceVirtualOffsets("after-resizeItem-sync", index, previousMeasuredSize, measuredSize);
      queueMicrotask(() => debugTraceVirtualOffsets("after-resizeItem-microtask", index, previousMeasuredSize, measuredSize));
      window.requestAnimationFrame(() => {
        debugForceRepaint(element, "after-resizeItem-raf");
        debugTraceVirtualOffsets("after-resizeItem-raf", index, previousMeasuredSize, measuredSize);
      });
    }
    setMeasurementVersion((version) => version + 1);
  }

  function getVirtualListRowElementIndex(element: HTMLElement) {
    const index = Number(element.dataset.index);
    return Number.isFinite(index) ? index : -1;
  }

  function getRowElementMeasurementKey(element: HTMLDivElement, index: number) {
    return element.dataset.virtualKey ?? getVirtualRowKey(index);
  }

  function queueRowElementMeasurement(element: HTMLDivElement) {
    window.requestAnimationFrame(() => measureRowElement(element, getVirtualListRowElementIndex(element), true));
  }

  function queueRowElementMeasurementRetry(element: HTMLDivElement, remainingFrames: number) {
    if (remainingFrames <= 0) {
      return;
    }
    window.requestAnimationFrame(() => {
      measureRowElement(element, getVirtualListRowElementIndex(element), true);
      if (element.isConnected) {
        queueRowElementMeasurementRetry(element, remainingFrames - 1);
      }
    });
  }

  function queueObservedRowsMeasurement() {
    if (runtime.pendingObservedRowsMeasurementFrame !== undefined) {
      return;
    }
    runtime.pendingObservedRowsMeasurementFrame = window.requestAnimationFrame(() => {
      runtime.pendingObservedRowsMeasurementFrame = undefined;
      measureObservedRows();
    });
  }

  function measureObservedRows() {
    observedRowElements.forEach((element) => measureRowElement(element, getVirtualListRowElementIndex(element), true));
  }

  function disconnectRowObserver(element: HTMLDivElement) {
    const observer = rowObservers.get(element);
    if (observer) {
      observer.disconnect();
      rowObservers.delete(element);
    }
    observedRowElements.delete(element);
    recordUiTelemetry("virtual-list.row-observer-disconnect", {
      dataTest: local.dataTest,
      index: getVirtualListRowElementIndex(element)
    });
  }

  return {
    setRowElement, measureRowElement, queueObservedRowsMeasurement,
    measureObservedRows, disconnectRowObserver,
  };
}
