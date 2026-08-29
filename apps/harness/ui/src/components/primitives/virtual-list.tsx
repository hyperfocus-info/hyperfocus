import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, splitProps, untrack, type JSX } from "solid-js";
import { createVirtualizer, measureElement as measureVirtualElement } from "@tanstack/solid-virtual";
import * as stylex from "@stylexjs/stylex";
import { recordUiTelemetry } from "../../lib/ui-telemetry";
import { cn } from "../../lib/utils";

import {
  DEFAULT_OVERSCAN,
  DEFAULT_VISIBLE_COUNT,
  NEAR_END_PX,
  NO_RESIZE_OBSERVER_ROW_SETTLE_FRAMES,
  PAGINATION_SCROLL_THROTTLE_MS,
  VIEWPORT_MEASUREMENT_SETTLE_FRAMES,
  anchorsEqual,
  clampLoadedCount,
  estimateVirtualListOffset,
  estimateVirtualListSize,
  getListAnchor,
  getVirtualListContentSize,
  getVirtualListNextLoadedCount,
  getVirtualListReverseScrollTop,
  getVirtualListScrollTarget,
  getVirtualListStickToEndScrollTop,
  isVirtualListDebugEnabled,
  parseCssPixels,
  readWindowItems,
  resolveBatchSize,
  resolveInitialCount,
  resolveThresholdPx,
  shouldResizeVirtualListRow,
  type EstimatedVirtualItem,
  type ListAnchor,
  type ViewWindow,
  type ViewportMeasurementOptions,
  type VirtualListHandle,
  type VirtualListProps,
} from "./virtual-list/model";

export {
  getVirtualListContentSize,
  getVirtualListNextLoadedCount,
  getVirtualListReverseScrollTop,
  getVirtualListScrollTarget,
  getVirtualListStickToEndScrollTop,
  shouldResizeVirtualListRow,
} from "./virtual-list/model";
export type { VirtualListHandle, VirtualListPagination, VirtualListProps } from "./virtual-list/model";

const pulse = stylex.keyframes({ "50%": { opacity: 0.5 } });

const styles = stylex.create({
  loadingRow: {
    borderRadius: "0.5rem",
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: pulse,
    animationTimingFunction: "cubic-bezier(0.4, 0, 0.6, 1)",
    backgroundColor: "rgb(0 0 0 / 0.035)",
    width: "100%",
  },
  viewport: { overflow: "auto" },
  content: { position: "relative", width: "100%" },
  item: { position: "absolute", left: 0, top: 0, width: "100%", }
});

import {
  createVirtualListDebugRuntime, createVirtualListMeasurementRuntime, createVirtualListModel,
  createVirtualListPaginationRuntime, createVirtualListSizeEstimator, createVirtualListViewportRuntime,
  getVirtualListRowElementIndex, registerVirtualListLifecycle,
} from "./virtual-list/runtime";

function VirtualListLoadingRow(props: { size: number }) {
  return (
    <div
      {...stylex.attrs(styles.loadingRow)}
      style={{ height: `${Math.max(24, props.size)}px` }}
      aria-hidden="true"
    />
  );
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const model = createVirtualListModel(props);
  const {
    local, rest, runtime, rowObservers, observedRowElements, measuredRowSizes, items,
    loadedCount, setLoadedCount, lastAnchor, setLastAnchor, stuckToEnd, setStuckToEnd,
    itemSignature, setItemSignature, measurementVersion, setMeasurementVersion,
    viewWindow, keyIndex,
  } = model;
  const estimator = createVirtualListSizeEstimator(model);
  const {
    getVirtualRowKey, estimateBaseSizeForIndex, estimateWindowTotalSize,
    estimateAverageSize, estimateWindowContentSize, estimateOffsetForIndex,
    estimateVirtualItemForIndex,
  } = estimator;

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return viewWindow().items.length;
    },
    getScrollElement: () => runtime.viewport ?? null,
    estimateSize: (index) => estimateBaseSizeForIndex(index),
    getItemKey: (index) => getVirtualRowKey(index),
    overscan: local.overscan ?? DEFAULT_OVERSCAN,
    gap: 0,
    initialRect: { width: 0, height: 720 },
    initialOffset: () => (local.pagination.kind === "reverse" || local.stickToEnd ? estimateWindowTotalSize() : 0),
    measureElement: (element, entry, instance) => {
      const measuredSize = measureVirtualElement(element, entry, instance);
      return Math.ceil(measuredSize || element.getBoundingClientRect().height || estimateBaseSizeForIndex(instance.indexFromElement(element)));
    }
  });
  const debug = createVirtualListDebugRuntime(model, virtualizer, getVirtualListRowElementIndex);
  const {
    debugRowStyle, debugContentStyle, debugTraceRowMeasurement,
    debugTraceVirtualOffsets, debugForceRepaint, debugTrace,
  } = debug;
  const viewportRuntime = createVirtualListViewportRuntime(model, virtualizer, {
    measureObservedRows: () => measurement.measureObservedRows(),
    queueObservedRowsMeasurement: () => measurement.queueObservedRowsMeasurement(),
    totalEstimatedSize: () => {
      measurementVersion();
      return totalContentSize();
    },
  });
  const {
    setViewport, observeViewport, startStickToEndSettle, queueViewportMeasurement,
    isNearEnd, scrollToEnd,
  } = viewportRuntime;
  const measurement = createVirtualListMeasurementRuntime(
    model, estimator, virtualizer, debug, scrollToEnd, isNearEnd, () => totalContentSize(),
  );
  const { setRowElement, measureObservedRows, queueObservedRowsMeasurement, disconnectRowObserver } = measurement;
  const pagination = createVirtualListPaginationRuntime(model, virtualizer, isNearEnd);
  const { ensureIndexLoaded, handleScroll } = pagination;

  const virtualItems = createMemo(() => {
    measurementVersion();
    const items = virtualizer.getVirtualItems();
    if (items.length > 0 || viewWindow().items.length === 0) {
      return items;
    }
    return estimateVisibleVirtualItems();
  });
  createEffect(() => {
    const count = viewWindow().items.length;
    virtualizer.setOptions({
      ...virtualizer.options,
      count
    });
    virtualizer.measure();
    queueMicrotask(measureObservedRows);
    queueObservedRowsMeasurement();
    setMeasurementVersion((version) => version + 1);
  });

  const handle: VirtualListHandle = {
    scrollToIndex: (index, align = "start") => {
      recordUiTelemetry("virtual-list.scroll-to-index", {
        dataTest: local.dataTest,
        index,
        align,
        itemCount: items().length,
        loadedCount: loadedCount(),
        absoluteStart: viewWindow().absoluteStart
      });
      ensureIndexLoaded(index);
      setMeasurementVersion((version) => version + 1);
      queueMicrotask(() => {
        queueMicrotask(() => virtualizer.scrollToIndex(Math.max(0, index - viewWindow().absoluteStart), { align }));
      });
    },
    scrollToKey: (key, align = "start") => {
      const index = keyIndex().get(key) ?? -1;
      if (index < 0) {
        return;
      }
      handle.scrollToIndex(index, align);
    },
    scrollToEnd: () => {
      scrollToEnd();
    },
    isNearEnd: () => isNearEnd()
  };

  local.handleRef?.(handle);
  registerVirtualListLifecycle(model, virtualizer, handle, {
    observeViewport, startStickToEndSettle, queueViewportMeasurement, scrollToEnd,
    disconnectRowObserver, measureObservedRows, queueObservedRowsMeasurement,
  });


  return (
    <div
      {...rest}
      ref={setViewport}
      data-test-scroll-area=""
      data-test-virtual-list={local.dataTest ?? ""}
      class={cn(stylex.attrs(styles.viewport).class, local.class)}
      onScroll={handleScroll}
    >
      <Show when={items().length > 0} fallback={local.empty}>
        <div class={cn(stylex.attrs(styles.content).class, local.contentClass)} style={debugContentStyle(totalContentSize())}>
          <For each={virtualItems()}>
            {(virtualRow) => {
              const item = () => viewWindow().items[virtualRow.index];
              const absoluteIndex = () => viewWindow().absoluteStart + virtualRow.index;
              return (
                <div
                  ref={(element) => setRowElement(element, virtualRow.index, getVirtualRowKey(virtualRow.index))}
                  data-index={virtualRow.index}
                  data-virtual-start={virtualRow.start}
                  data-virtual-size={virtualRow.size}
                  data-virtual-key={getVirtualRowKey(virtualRow.index)}
                  data-test-virtual-list-item=""
                  class={cn(stylex.attrs(styles.item).class, local.itemClass)}
                  style={debugRowStyle(virtualRow.start)}
                >
                  <Show when={item()} keyed fallback={<VirtualListLoadingRow size={virtualRow.size} />}>
                    {(resolvedItem) => local.children(resolvedItem, absoluteIndex())}
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );

  function totalContentSize() {
    measurementVersion();
    const virtualizedSize = virtualizer.getTotalSize();
    const estimatedSize = estimateWindowContentSize();
    const contentSize = getVirtualListContentSize(virtualizedSize, estimatedSize);
    if (isVirtualListDebugEnabled()) {
      const trace = `${viewWindow().items.length}:${virtualizedSize}:${estimatedSize}:${contentSize}:${measuredRowSizes.size}`;
      if (trace !== runtime.debugLastContentTrace) {
        runtime.debugLastContentTrace = trace;
        debugTrace("content-size", {
          count: viewWindow().items.length,
          measuredRows: measuredRowSizes.size,
          virtualizedSize,
          estimatedSize,
          contentSize,
          scrollHeight: runtime.viewport?.scrollHeight,
          clientHeight: runtime.viewport?.clientHeight,
          scrollTop: runtime.viewport?.scrollTop
        });
      }
    }
    return contentSize;
  }

  function estimateVisibleVirtualItems(): EstimatedVirtualItem[] {
    const count = viewWindow().items.length;
    if (count === 0) {
      return [];
    }

    const viewportHeight = runtime.viewport?.clientHeight || 720;
    const overscan = local.overscan ?? DEFAULT_OVERSCAN;
    const estimatedAverageSize = estimateAverageSize();
    const estimateSize = Number.isFinite(estimatedAverageSize) && estimatedAverageSize > 0 ? estimatedAverageSize : 1;
    const virtualScrollOffset = virtualizer.scrollOffset;
    const scrollOffset = virtualScrollOffset !== null && Number.isFinite(virtualScrollOffset)
      ? Math.max(0, virtualScrollOffset)
      : Math.max(0, runtime.viewport?.scrollTop ?? 0);
    const rawVisibleStartIndex = Math.floor(scrollOffset / estimateSize);
    const visibleStartIndex = Number.isFinite(rawVisibleStartIndex)
      ? Math.min(count - 1, Math.max(0, rawVisibleStartIndex))
      : count - 1;
    const visibleEndIndex = visibleStartIndex + Math.ceil(viewportHeight / estimateSize);
    const startIndex = Math.max(0, visibleStartIndex - overscan);
    const endIndex = Math.min(count - 1, visibleEndIndex + overscan);
    const items: EstimatedVirtualItem[] = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
      items.push({
        index,
        start: estimateOffsetForIndex(index),
        size: estimateBaseSizeForIndex(index)
      });
    }
    return items;
  }


}
