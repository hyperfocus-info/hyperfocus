export type CanvasContextType = "2d" | "webgl" | "webgl2";
export type ScaleMode = "letterbox" | "fit" | "stretch";
type ParentTarget = HTMLElement | string;

export type InitOptions = {
  width?: number;
  height?: number;
  context?: CanvasContextType;
  parent?: ParentTarget;
  canvas?: HTMLCanvasElement;
  scaleMode?: ScaleMode;
  background?: string;
  autoStart?: boolean;
  maxDelta?: number;
  silenceContextMenu?: boolean;
  /** Debounces monitor/DPR resize thrashing while preserving an immediate initial layout. */
  resizeDebounceMs?: number;
  /** Consecutive equal viewport samples required before reallocating buffers. */
  resizeSettleFrames?: number;
  /** Called when the browser invalidates the canvas backing store. */
  onContextLost?: (event: Event) => void;
  /** Rehydrates context-owned images, atlases, fonts, or other resources after restoration. */
  onContextRestored?: (context: RenderingContext) => void | Promise<void>;
  onContextRecoveryError?: (error: unknown) => void;
  globals?: boolean;
  update?: (deltaTime: number, elapsedTime: number) => void;
  render?: (deltaTime: number, elapsedTime: number) => void;
};

export type InitApp = ReturnType<typeof init>;

function resolveParent(parent?: ParentTarget) {
  if (!parent) return document.body;
  if (typeof parent === "string") {
    const target = document.querySelector(parent);
    if (!target) throw new Error(`Canvas parent not found: ${parent}`);
    return target as HTMLElement;
  }
  return parent;
}

function viewportOf(parent: HTMLElement) {
  if (parent === document.body || parent === document.documentElement) {
    return { width: positiveDimension(window.innerWidth), height: positiveDimension(window.innerHeight) };
  }

  const rect = parent.getBoundingClientRect();
  return {
    width: positiveDimension(rect.width),
    height: positiveDimension(rect.height)
  };
}

function positiveDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function requirePositiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number`);
  return value;
}

function requireNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function requirePositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function acquireContext(canvas: HTMLCanvasElement, type: CanvasContextType) {
  const context = canvas.getContext(type);
  if (!context) throw new Error(`Unable to acquire ${type} canvas context`);
  return context;
}

function setGlobalTimes(deltaTime: number, elapsedTime: number) {
  const target = globalThis as typeof globalThis & {
    deltaTime?: number;
    elapsedTime?: number;
  };
  target.deltaTime = deltaTime;
  target.elapsedTime = elapsedTime;
}

export function init(options: InitOptions = {}) {
  const logicalWidth = requirePositiveFinite(options.width ?? 960, "canvas width");
  const logicalHeight = requirePositiveFinite(options.height ?? 540, "canvas height");
  const contextType = options.context ?? "2d";
  const scaleMode = options.scaleMode ?? "letterbox";
  const autoStart = options.autoStart ?? false;
  const maxDelta = requireNonNegativeFinite(options.maxDelta ?? 0.05, "canvas maxDelta");
  const exposeGlobals = options.globals ?? false;
  const resizeDebounceMs = requireNonNegativeFinite(options.resizeDebounceMs ?? 0, "canvas resize debounce");
  const resizeSettleFrames = requirePositiveSafeInteger(options.resizeSettleFrames ?? 1, "canvas resize settle frames");
  const parent = resolveParent(options.parent);
  const canvas = options.canvas ?? document.createElement("canvas");
  const context = acquireContext(canvas, contextType);

  let dpr = 1;
  let deltaTime = 0;
  let elapsedTime = 0;
  let lastTime = 0;
  let frameId = 0;
  let running = false;
  let destroyed = false;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeFrame = 0;
  let pendingViewport = "";
  let stableViewportFrames = 0;
  let recovery: Promise<void> | undefined;

  if (!canvas.parentElement) parent.appendChild(canvas);
  if (options.background) canvas.style.background = options.background;
  canvas.style.display = "block";
  canvas.style.touchAction = "none";

  function resize() {
    dpr = positiveDimension(window.devicePixelRatio);
    const viewport = viewportOf(parent);
    const backingWidth = Math.max(1, Math.round(logicalWidth * dpr));
    const backingHeight = Math.max(1, Math.round(logicalHeight * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    if (scaleMode === "stretch") {
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
    } else {
      const scale = Math.min(viewport.width / logicalWidth, viewport.height / logicalHeight);
      canvas.style.width = `${Math.max(1, Math.floor(logicalWidth * scale))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(logicalHeight * scale))}px`;
      canvas.style.margin = scaleMode === "letterbox" ? "auto" : "0";
    }

    if (contextType === "2d") {
      const ctx = context as CanvasRenderingContext2D;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function scheduleResize() {
    if (resizeFrame !== 0) cancelAnimationFrame(resizeFrame);
    resizeFrame = 0;
    stableViewportFrames = 0;
    pendingViewport = "";
    const begin = () => {
      if (resizeSettleFrames === 1) { resize(); return; }
      const sample = () => {
        resizeFrame = 0;
        if (destroyed) return;
        const viewport = viewportOf(parent);
        const key = `${viewport.width}|${viewport.height}|${positiveDimension(window.devicePixelRatio)}`;
        if (key === pendingViewport) stableViewportFrames += 1;
        else { pendingViewport = key; stableViewportFrames = 1; }
        if (stableViewportFrames >= resizeSettleFrames) resize();
        else resizeFrame = requestAnimationFrame(sample);
      };
      resizeFrame = requestAnimationFrame(sample);
    };
    if (resizeDebounceMs === 0) { begin(); return; }
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resizeTimer = undefined; begin(); }, resizeDebounceMs);
  }

  function recoverContext() {
    if (destroyed) return Promise.resolve();
    if (recovery) return recovery;
    recovery = Promise.resolve().then(async () => {
      resize();
      await options.onContextRestored?.(context);
    }).catch((error) => {
      options.onContextRecoveryError?.(error);
      if (!options.onContextRecoveryError) throw error;
    }).finally(() => {
      recovery = undefined;
    });
    return recovery;
  }

  function onContextLost(event: Event) {
    // Preventing the default opts WebGL into restoration and is harmless for
    // browsers that expose the equivalent Canvas 2D lifecycle event.
    event.preventDefault();
    options.onContextLost?.(event);
  }

  function onContextRestored() {
    void recoverContext().catch(() => undefined);
  }

  function frame(time: number) {
    if (!running) return;
    try {
      if (!Number.isFinite(time)) throw new RangeError("animation frame time must be finite");
      const rawDelta = lastTime ? (time - lastTime) / 1000 : 0;
      lastTime = time;
      deltaTime = Math.min(maxDelta, Math.max(0, rawDelta));
      elapsedTime += deltaTime;
      if (exposeGlobals) setGlobalTimes(deltaTime, elapsedTime);
      options.update?.(deltaTime, elapsedTime);
      if (!running) return;
      options.render?.(deltaTime, elapsedTime);
      if (!running) return;
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      running = false;
      frameId = 0;
      throw error;
    }
  }

  function start() {
    if (running) return;
    if (destroyed) throw new Error("Cannot start a destroyed canvas app");
    running = true;
    lastTime = 0;
    try {
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      running = false;
      frameId = 0;
      throw error;
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    window.removeEventListener("resize", scheduleResize);
    window.visualViewport?.removeEventListener("resize", scheduleResize);
    if (resizeTimer !== undefined) clearTimeout(resizeTimer);
    if (resizeFrame !== 0) cancelAnimationFrame(resizeFrame);
    canvas.removeEventListener("contextmenu", preventContextMenu);
    canvas.removeEventListener("contextlost", onContextLost);
    canvas.removeEventListener("contextrestored", onContextRestored);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
  }

  function preventContextMenu(event: Event) {
    event.preventDefault();
  }

  if (options.silenceContextMenu ?? true) {
    canvas.addEventListener("contextmenu", preventContextMenu);
  }
  window.addEventListener("resize", scheduleResize);
  window.visualViewport?.addEventListener("resize", scheduleResize);
  if (contextType === "2d") {
    canvas.addEventListener("contextlost", onContextLost);
    canvas.addEventListener("contextrestored", onContextRestored);
  } else {
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
  }
  resize();
  if (exposeGlobals) setGlobalTimes(deltaTime, elapsedTime);
  if (autoStart) start();

  return {
    canvas,
    context,
    ctx: context,
    contextType,
    width: logicalWidth,
    height: logicalHeight,
    resize,
    recoverContext,
    start,
    stop,
    pause: stop,
    resume: start,
    destroy,
    isRunning() {
      return running;
    },
    get deltaTime() {
      return deltaTime;
    },
    get elapsedTime() {
      return elapsedTime;
    },
    get devicePixelRatio() {
      return dpr;
    }
  };
}
