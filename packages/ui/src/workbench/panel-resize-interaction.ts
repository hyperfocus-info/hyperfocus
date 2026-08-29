import type { PanelAxis } from "./panel-group-layout";

export type PanelResizeEdge = "start" | "end";

export type PanelPointerResizeOptions = {
  event: PointerEvent;
  target: HTMLElement;
  axis: PanelAxis;
  edge: PanelResizeEdge;
  startSize: number;
  onResize: (size: number) => void;
  onCommit: () => void;
  onCancel: () => void;
};

export type PanelPointerResizeController = {
  start(options: PanelPointerResizeOptions): void;
  lostPointerCapture(pointerId: number): void;
  dispose(): void;
};

type ActivePointerResize = PanelPointerResizeOptions & {
  pointerId: number;
  startCoordinate: number;
  target: HTMLElement;
};

export function createPanelPointerResizeController(): PanelPointerResizeController {
  let active: ActivePointerResize | undefined;

  const coordinate = (axis: PanelAxis, event: PointerEvent) => axis === "horizontal" ? event.clientX : event.clientY;
  const direction = (edge: PanelResizeEdge) => edge === "end" ? 1 : -1;
  const removeWindowListeners = () => {
    if (typeof window === "undefined") return;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  };
  const clear = () => {
    const resize = active;
    if (!resize) return;
    active = undefined;
    removeWindowListeners();
    if (resize.target.hasPointerCapture?.(resize.pointerId)) resize.target.releasePointerCapture(resize.pointerId);
    if (typeof document !== "undefined") {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    }
  };
  const commit = (pointerId: number) => {
    if (!active || active.pointerId !== pointerId) return;
    const callback = active.onCommit;
    clear();
    callback();
  };
  const cancel = (pointerId: number) => {
    if (!active || active.pointerId !== pointerId) return;
    const callback = active.onCancel;
    clear();
    callback();
  };
  function onPointerMove(event: PointerEvent) {
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = (coordinate(active.axis, event) - active.startCoordinate) * direction(active.edge);
    active.onResize(active.startSize + delta);
  }
  function onPointerUp(event: PointerEvent) {
    commit(event.pointerId);
  }
  function onPointerCancel(event: PointerEvent) {
    cancel(event.pointerId);
  }

  return {
    start(options) {
      if (active) clear();
      options.event.preventDefault();
      const target = options.target;
      active = {
        ...options,
        pointerId: options.event.pointerId,
        startCoordinate: coordinate(options.axis, options.event),
        target,
      };
      target.setPointerCapture?.(options.event.pointerId);
      if (typeof document !== "undefined") {
        document.body.style.cursor = options.axis === "horizontal" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      }
      if (typeof window !== "undefined") {
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
      }
    },
    lostPointerCapture(pointerId) {
      commit(pointerId);
    },
    dispose() {
      clear();
    },
  };
}

export type PanelSeparatorKeyAction =
  | { kind: "resize"; size: number }
  | { kind: "toggle" };

export type ResolvePanelSeparatorKeyOptions = {
  key: string;
  shiftKey: boolean;
  axis: PanelAxis;
  edge: PanelResizeEdge;
  currentSize: number;
  minimumSize: number;
  maximumSize: number;
  collapsible: boolean;
};

export function resolvePanelSeparatorKey(options: ResolvePanelSeparatorKeyOptions): PanelSeparatorKeyAction | undefined {
  if (options.key === "Enter") return options.collapsible ? { kind: "toggle" } : undefined;
  if (options.key === "Home") return { kind: "resize", size: options.minimumSize };
  if (options.key === "End") return { kind: "resize", size: options.maximumSize };

  const physicalDirection = options.axis === "horizontal"
    ? options.key === "ArrowRight" ? 1 : options.key === "ArrowLeft" ? -1 : 0
    : options.key === "ArrowDown" ? 1 : options.key === "ArrowUp" ? -1 : 0;
  if (!physicalDirection) return undefined;
  const edgeDirection = options.edge === "end" ? 1 : -1;
  return {
    kind: "resize",
    size: options.currentSize + physicalDirection * edgeDirection * (options.shiftKey ? 50 : 10),
  };
}
