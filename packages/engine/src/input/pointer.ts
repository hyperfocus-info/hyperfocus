export type CanvasPoint = { x: number; y: number };
export type CanvasPointSurface = {
  width: number;
  height: number;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
};
type Point = CanvasPoint;

export type TouchClusterPoint = Point & { id: number };
export type TouchClusterSnapshot = Point & { active: boolean; count: number; membershipChanged: boolean };

/** Keeps a gesture centroid continuous when fingers join or leave the cluster. */
export function createTouchClusterTracker() {
  let ids = new Set<number>();
  let offsetX = 0;
  let offsetY = 0;
  let lastX = 0;
  let lastY = 0;
  let active = false;

  return {
    sample(points: readonly TouchClusterPoint[], out: TouchClusterSnapshot = { x: 0, y: 0, active: false, count: 0, membershipChanged: false }) {
      if (points.length === 0) {
        ids.clear();
        offsetX = 0;
        offsetY = 0;
        active = false;
        out.x = lastX;
        out.y = lastY;
        out.active = false;
        out.count = 0;
        out.membershipChanged = true;
        return out;
      }
      let rawX = 0;
      let rawY = 0;
      const nextIds = new Set<number>();
      for (const point of points) {
        if (!Number.isSafeInteger(point.id) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError("touch cluster points must have finite coordinates and safe integer ids");
        if (nextIds.has(point.id)) throw new Error(`touch cluster contains duplicate id ${point.id}`);
        nextIds.add(point.id);
        rawX += point.x;
        rawY += point.y;
      }
      rawX /= points.length;
      rawY /= points.length;
      let membershipChanged = nextIds.size !== ids.size;
      if (!membershipChanged) {
        for (const id of nextIds) {
          if (!ids.has(id)) { membershipChanged = true; break; }
        }
      }
      if (!active) {
        offsetX = 0;
        offsetY = 0;
      } else if (membershipChanged) {
        offsetX = lastX - rawX;
        offsetY = lastY - rawY;
      }
      ids = nextIds;
      active = true;
      lastX = rawX + offsetX;
      lastY = rawY + offsetY;
      out.x = lastX;
      out.y = lastY;
      out.active = true;
      out.count = points.length;
      out.membershipChanged = membershipChanged;
      return out;
    },
    reset() {
      ids.clear(); offsetX = 0; offsetY = 0; active = false; lastX = 0; lastY = 0;
    }
  };
}

type PointerInputOptions = {
  toWorld?: (point: Point) => Point;
  resetOnLifecycleChange?: boolean;
  lifecycleTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  visibilityTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener"> & { hidden?: boolean; visibilityState?: string };
};

type PointerSnapshot = Point & {
  id: number;
  type: string;
  down: boolean;
  pressed: boolean;
  released: boolean;
  moved: boolean;
  worldX: number;
  worldY: number;
  source: Event;
};

export function canvasPointFromClient(canvas: CanvasPointSurface, clientX: number, clientY: number): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / (rect.width || canvas.width || 1);
  const scaleY = canvas.height / (rect.height || canvas.height || 1);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function canvasPoint(canvas: HTMLCanvasElement, event: MouseEvent | Touch) {
  return canvasPointFromClient(canvas, event.clientX ?? 0, event.clientY ?? 0);
}

function eventTouches(event: TouchEvent) {
  return event.changedTouches ? Array.from(event.changedTouches) : [];
}

export function createPointerInput(canvas: HTMLCanvasElement, options: PointerInputOptions = {}) {
  const listeners = new Map<string, Set<(event: PointerSnapshot) => void>>();
  const pointers = new Map<number, PointerSnapshot>();
  let primary: PointerSnapshot | null = null;
  const lifecycleTarget = options.lifecycleTarget ?? (typeof window === "undefined" ? undefined : window);
  const visibilityTarget = options.visibilityTarget ?? (typeof document === "undefined" ? undefined : document);
  const resetOnLifecycleChange = options.resetOnLifecycleChange ?? true;

  function emit(type: string, pointer: PointerSnapshot) {
    const handlers = listeners.get(type);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(pointer);
      } catch {
        // Independent input listeners cannot interrupt pointer state progression.
      }
    }
  }

  function snapshot(source: Event, id: number, pointerType: string, point: Point, changes = {}) {
    const world = options.toWorld ? options.toWorld(point) : point;
    const previous = pointers.get(id);
    const next: PointerSnapshot = {
      id,
      type: pointerType,
      x: point.x,
      y: point.y,
      worldX: world.x,
      worldY: world.y,
      down: previous?.down ?? false,
      pressed: previous?.pressed ?? false,
      released: previous?.released ?? false,
      moved: previous?.moved ?? false,
      source,
      ...changes
    };
    pointers.set(id, next);
    primary = next;
    return next;
  }

  function mouse(event: MouseEvent, type: string, changes = {}) {
    const pointer = snapshot(event, 1, "mouse", canvasPoint(canvas, event), changes);
    emit(type, pointer);
    event.preventDefault();
  }

  function touch(event: TouchEvent, type: string, changes = {}) {
    for (const changed of eventTouches(event)) {
      const pointer = snapshot(event, changed.identifier, "touch", canvasPoint(canvas, changed), changes);
      emit(type, pointer);
    }
    event.preventDefault();
  }

  function onMouseDown(event: MouseEvent) {
    mouse(event, "down", { down: true, pressed: true });
  }
  function onMouseMove(event: MouseEvent) {
    mouse(event, "move", { down: (event.buttons ?? 0) > 0, moved: true });
  }
  function onMouseUp(event: MouseEvent) {
    mouse(event, "up", { down: false, released: true });
  }
  function onMouseLeave(event: MouseEvent) {
    mouse(event, "leave", { down: false, released: primary?.down === true });
  }
  function onTouchStart(event: TouchEvent) {
    touch(event, "down", { down: true, pressed: true });
  }
  function onTouchMove(event: TouchEvent) {
    touch(event, "move", { down: true, moved: true });
  }
  function onTouchEnd(event: TouchEvent) {
    touch(event, "up", { down: false, released: true });
  }
  function onTouchCancel(event: TouchEvent) {
    touch(event, "cancel", { down: false, released: true });
  }

  function releaseAll(source: Event) {
    for (const pointer of pointers.values()) {
      if (!pointer.down) continue;
      pointer.down = false;
      pointer.released = true;
      pointer.source = source;
      emit("cancel", pointer);
    }
  }

  function onLifecycleChange(event: Event) {
    releaseAll(event);
  }

  function onVisibilityChange(event: Event) {
    if (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden") releaseAll(event);
  }

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchCancel, { passive: false });
  if (resetOnLifecycleChange) {
    lifecycleTarget?.addEventListener("blur", onLifecycleChange);
    lifecycleTarget?.addEventListener("pagehide", onLifecycleChange);
    lifecycleTarget?.addEventListener("freeze", onLifecycleChange);
    visibilityTarget?.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    on(type: string, handler: (event: PointerSnapshot) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
    pointer(id = primary?.id ?? 1) {
      return pointers.get(id) ?? null;
    },
    primary() {
      return primary;
    },
    update() {
      for (const [id, pointer] of pointers) {
        if (pointer.type === "touch" && pointer.released && !pointer.down) {
          pointers.delete(id);
          if (primary === pointer) primary = [...pointers.values()].at(-1) ?? null;
          continue;
        }
        pointer.pressed = false;
        pointer.released = false;
        pointer.moved = false;
      }
    },
    dispose() {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchCancel);
      if (resetOnLifecycleChange) {
        lifecycleTarget?.removeEventListener("blur", onLifecycleChange);
        lifecycleTarget?.removeEventListener("pagehide", onLifecycleChange);
        lifecycleTarget?.removeEventListener("freeze", onLifecycleChange);
        visibilityTarget?.removeEventListener("visibilitychange", onVisibilityChange);
      }
      listeners.clear();
      pointers.clear();
      primary = null;
    }
  };
}
