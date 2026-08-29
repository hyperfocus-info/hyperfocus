import type { JSX } from "solid-js";

export type VirtualListPagination =
  | { kind: "forward"; initialCount?: number; batchSize?: number; thresholdPx?: number }
  | { kind: "reverse"; initialCount?: number; batchSize?: number; thresholdPx?: number }
  | { kind: "all" };

export type VirtualListHandle = {
  scrollToIndex: (index: number, align?: "start" | "center" | "end") => void;
  scrollToKey: (key: string, align?: "start" | "center" | "end") => void;
  scrollToEnd: () => void;
  isNearEnd: () => boolean;
};
export type VirtualListProps<T> = {
  items: readonly T[];
  getKey: (item: T, absoluteIndex: number) => string;
  estimateSize: number | ((item: T) => number);
  pagination: VirtualListPagination;
  overscan?: number;
  class?: string;
  contentClass?: string;
  itemClass?: string;
  dataTest?: string;
  empty?: JSX.Element;
  stickToEnd?: boolean;
  viewportRef?: (element: HTMLDivElement) => void;
  handleRef?: (handle: VirtualListHandle) => void;
  onScroll?: JSX.EventHandler<HTMLDivElement, Event>;
  onStickToEndChange?: (stuck: boolean) => void;
  children: (item: T, absoluteIndex: number) => JSX.Element;
} & Pick<JSX.HTMLAttributes<HTMLDivElement>, "aria-busy" | "aria-labelledby" | "role">;

export const DEFAULT_VISIBLE_COUNT = 80;
export const DEFAULT_THRESHOLD_PX = 1000;
export const DEFAULT_OVERSCAN = 20;
export const NEAR_END_PX = 32;
export const PAGINATION_SCROLL_THROTTLE_MS = 50;
export const VIEWPORT_MEASUREMENT_SETTLE_FRAMES = 24;
export const NO_RESIZE_OBSERVER_ROW_SETTLE_FRAMES = 8;
export const VIRTUAL_LIST_DEBUG_STORAGE_KEY = "virtual-list-debug";
export const VIRTUAL_LIST_DEBUG_QUERY_PARAM = "virtualListDebug";

export type ViewWindow<T> = {
  items: readonly T[];
  absoluteStart: number;
};

export type EstimatedVirtualItem = {
  index: number;
  start: number;
  size: number;
};

export type ViewportMeasurementOptions = {
  forceScrollToEnd?: boolean;
  scrollToEndIfStuck?: boolean;
  stickToEndSettle?: boolean;
  retryFrames?: number;
};

export type VirtualListScrollTargetProps<T> = {
  items: readonly T[];
  getKey: (item: T, absoluteIndex: number) => string;
  key: string;
  pagination: VirtualListPagination;
  loadedCount: number;
  estimateSize: number | ((item: T) => number);
  viewportHeight: number;
  align?: "start" | "center" | "end";
};

export function getVirtualListNextLoadedCount(
  pagination: VirtualListPagination,
  loadedCount: number,
  itemCount: number,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
) {
  if (pagination.kind === "all" || loadedCount >= itemCount) {
    return loadedCount;
  }

  const thresholdPx = resolveThresholdPx(pagination);
  if (pagination.kind === "forward" && scrollHeight - scrollTop - clientHeight > thresholdPx) {
    return loadedCount;
  }
  if (pagination.kind === "reverse" && scrollTop > thresholdPx) {
    return loadedCount;
  }

  return Math.min(itemCount, loadedCount + resolveBatchSize(pagination));
}

export function getVirtualListReverseScrollTop(previousScrollTop: number, previousScrollHeight: number, nextScrollHeight: number) {
  return previousScrollTop + Math.max(0, nextScrollHeight - previousScrollHeight);
}

export function getVirtualListStickToEndScrollTop(
  wasNearEnd: boolean,
  currentScrollTop: number,
  totalSize: number,
  viewportHeight: number
) {
  return wasNearEnd ? Math.max(0, totalSize - viewportHeight) : currentScrollTop;
}

export function getVirtualListScrollTarget<T>(props: VirtualListScrollTargetProps<T>) {
  const absoluteIndex = props.items.findIndex((item, index) => props.getKey(item, index) === props.key);
  if (absoluteIndex < 0) {
    return undefined;
  }

  const loadedCount =
    props.pagination.kind === "all"
      ? props.items.length
      : props.pagination.kind === "forward"
        ? Math.max(props.loadedCount, absoluteIndex + 1)
        : Math.max(props.loadedCount, props.items.length - absoluteIndex);
  const windowStart = props.pagination.kind === "reverse" ? Math.max(0, props.items.length - loadedCount) : 0;
  const localIndex = Math.max(0, absoluteIndex - windowStart);
  const offset = estimateVirtualListOffset(props.items.slice(windowStart), props.estimateSize, localIndex);
  const size = estimateVirtualListSize(props.items[absoluteIndex], props.estimateSize);
  const align = props.align ?? "start";
  const scrollTop =
    align === "end"
      ? offset - props.viewportHeight + size
      : align === "center"
        ? offset - Math.max(0, (props.viewportHeight - size) / 2)
        : offset;
  return {
    absoluteIndex,
    loadedCount,
    localIndex,
    scrollTop: Math.max(0, scrollTop)
  };
}

export function isVirtualListDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(VIRTUAL_LIST_DEBUG_STORAGE_KEY) === "1" || new URLSearchParams(window.location.search).has(VIRTUAL_LIST_DEBUG_QUERY_PARAM);
  } catch {
    return false;
  }
}

export function parseCssPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type ListAnchor = {
  firstKey?: string;
  lastKey?: string;
};

export function getListAnchor<T>(items: readonly T[], getKey: (item: T, absoluteIndex: number) => string): ListAnchor {
  return {
    firstKey: items[0] ? getKey(items[0], 0) : undefined,
    lastKey: items.length > 0 ? getKey(items[items.length - 1], items.length - 1) : undefined
  };
}

export function anchorsEqual(left: ListAnchor | undefined, right: ListAnchor) {
  return left?.firstKey === right.firstKey && left?.lastKey === right.lastKey;
}

export function readWindowItems<T>(items: readonly T[], start: number, end: number) {
  const windowItems: T[] = [];
  for (let index = start; index < end; index += 1) {
    const item = items[index];
    if (item !== undefined) {
      windowItems.push(item);
    }
  }
  return windowItems;
}

export function resolveInitialCount(pagination: VirtualListPagination) {
  return pagination.kind === "all" ? Number.MAX_SAFE_INTEGER : pagination.initialCount ?? DEFAULT_VISIBLE_COUNT;
}

export function clampLoadedCount(itemCount: number, count: number) {
  return Math.min(itemCount, Math.max(0, count));
}

export function resolveBatchSize(pagination: Exclude<VirtualListPagination, { kind: "all" }>) {
  return pagination.batchSize ?? pagination.initialCount ?? DEFAULT_VISIBLE_COUNT;
}

export function resolveThresholdPx(pagination: VirtualListPagination) {
  return pagination.kind === "all" ? 0 : pagination.thresholdPx ?? DEFAULT_THRESHOLD_PX;
}

export function getVirtualListContentSize(virtualizedSize: number, estimatedSize: number) {
  return Math.max(virtualizedSize, estimatedSize);
}

export function shouldResizeVirtualListRow(
  previousMeasuredSize: number | undefined,
  currentVirtualSize: number | undefined,
  measuredSize: number
) {
  return previousMeasuredSize !== measuredSize || currentVirtualSize === undefined || Math.ceil(currentVirtualSize) !== measuredSize;
}

export function estimateVirtualListSize<T>(item: T | undefined, estimateSize: number | ((item: T) => number)) {
  if (typeof estimateSize === "number") {
    return estimateSize;
  }
  return item === undefined ? DEFAULT_VISIBLE_COUNT : estimateSize(item);
}

export function estimateVirtualListOffset<T>(items: readonly T[], estimateSize: number | ((item: T) => number), index: number) {
  if (typeof estimateSize === "number") {
    return index * estimateSize;
  }
  let offset = 0;
  for (let current = 0; current < index; current += 1) {
    offset += estimateVirtualListSize(items[current], estimateSize);
  }
  return offset;
}
