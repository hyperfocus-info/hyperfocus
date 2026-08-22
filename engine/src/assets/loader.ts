export type AssetLoadStatus = "idle" | "loading" | "loaded" | "failed";

export type FontHydrationRequest = {
  /** CSS font shorthand accepted by FontFaceSet.load(), for example `16px QuestSans`. */
  font: string;
  sample?: string;
  timeoutMs?: number;
  required?: boolean;
};

export type FontHydrationResult = {
  font: string;
  status: "loaded" | "timed-out" | "failed";
  error?: unknown;
};

export type FontHydrationOptions = {
  fonts?: Pick<FontFaceSet, "load">;
  defaultTimeoutMs?: number;
};

/** Hydrates each web font behind its own timeout so one bad face cannot stall startup. */
export async function hydrateFonts(
  requests: readonly FontHydrationRequest[],
  options: FontHydrationOptions = {},
): Promise<FontHydrationResult[]> {
  const fonts = options.fonts ?? (typeof document === "undefined" ? undefined : document.fonts);
  if (!fonts) throw new Error("FontFaceSet is unavailable; font assets cannot be hydrated.");
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 3_000;
  if (!Number.isFinite(defaultTimeoutMs) || defaultTimeoutMs < 0) throw new RangeError("font hydration defaultTimeoutMs must be non-negative and finite");

  return Promise.all(requests.map(async (request) => {
    if (!request.font || request.font.length > 1_024) throw new Error("font hydration shorthand must be bounded non-empty text");
    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new RangeError("font hydration timeoutMs must be non-negative and finite");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timed-out">((resolve) => {
      timer = setTimeout(() => resolve("timed-out"), timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        Promise.resolve(fonts.load(request.font, request.sample ?? "BESbswy")).then((loaded) => loaded.length > 0 ? "loaded" as const : "failed" as const),
        timeout,
      ]);
      const result: FontHydrationResult = { font: request.font, status: outcome };
      if (request.required && outcome !== "loaded") throw new Error(`Required font did not load: ${request.font}`);
      return result;
    } catch (error) {
      if (request.required) throw error;
      return { font: request.font, status: "failed", error };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }));
}

export type AssetLoadTaskContext = {
  id: string;
  signal?: AbortSignal;
  reportProgress(progress: number, label?: string): void;
};

export type AssetLoadTask<TAsset = unknown> = {
  id: string;
  label?: string;
  group?: string;
  weight?: number;
  /** Start-order policy; reserve `critical-audio` for stream feed/decode work. */
  priority?: "critical-audio" | "high" | "normal" | "background" | number;
  load(context: AssetLoadTaskContext): TAsset | Promise<TAsset>;
};

export type AssetLoadSnapshot = {
  status: AssetLoadStatus;
  total: number;
  started: number;
  completed: number;
  failed: number;
  active: number;
  loadedWeight: number;
  weightedProgress: number;
  totalWeight: number;
  actualProgress: number;
  visibleProgress: number;
  label: string;
  activeLabel: string;
  error?: unknown;
  startedAt: number;
  updatedAt: number;
};

export type AssetLoaderOptions = {
  label?: string;
  concurrency?: number;
  rejectOnError?: boolean;
  signal?: AbortSignal;
  now?: () => number;
  onSnapshot?: (snapshot: AssetLoadSnapshot) => void;
};

export type AssetLoader = {
  add<TAsset>(task: AssetLoadTask<TAsset>): void;
  load(ids?: readonly string[]): Promise<Record<string, unknown>>;
  loadAsset<TAsset = unknown>(id: string): Promise<TAsset>;
  loadGroup(group: string): Promise<Record<string, unknown>>;
  snapshot(): AssetLoadSnapshot;
  onSnapshot(listener: (snapshot: AssetLoadSnapshot) => void): () => void;
  result<TAsset = unknown>(id: string): TAsset | undefined;
  results(): Record<string, unknown>;
};

export type ImageAssetTaskOptions = {
  id: string;
  src: string;
  label?: string;
  group?: string;
  weight?: number;
  imageFactory?: () => HTMLImageElement;
  crossOrigin?: "" | "anonymous" | "use-credentials";
  referrerPolicy?: ReferrerPolicy;
  decoding?: "async" | "sync" | "auto";
  loading?: "eager" | "lazy";
  decode?: boolean;
  allowFailure?: boolean;
};

export type LoadImageAssetsOptions = {
  label?: string;
  group?: string;
  weight?: number;
  concurrency?: number;
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  decode?: boolean;
  allowFailure?: boolean;
  imageFactory?: () => HTMLImageElement;
  crossOrigin?: "" | "anonymous" | "use-credentials";
  referrerPolicy?: ReferrerPolicy;
  labelFor?: (id: string, src: string) => string;
  onSnapshot?: (snapshot: AssetLoadSnapshot) => void;
};

export type SmoothedAssetProgressOptions = {
  initialProgress?: number;
  speed?: number;
  completeSpeed?: number;
  minAdvancePerSecond?: number;
  maxDeltaSeconds?: number;
  holdAt?: number;
  now?: () => number;
};

export type AssetProgressSmoother = {
  update(snapshot: AssetLoadSnapshot, time?: number): AssetLoadSnapshot;
  reset(value?: number): void;
  set(value: number): void;
  value(): number;
};

export type AssetLoaderRafLoopOptions = {
  read: () => AssetLoadSnapshot;
  render: (snapshot: AssetLoadSnapshot) => void;
  smoother?: AssetProgressSmoother;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  stopWhen?: (snapshot: AssetLoadSnapshot) => boolean;
  now?: () => number;
};

export type AssetLoaderRafLoop = {
  stop(): void;
  isRunning(): boolean;
};

export type CanvasAssetLoaderPalette = {
  background: string;
  backgroundDeep: string;
  grid: string;
  accent: string;
  accentAlt: string;
  warning: string;
  text: string;
  muted: string;
  track: string;
};

export type CanvasAssetLoaderOptions = {
  title?: string;
  subtitle?: string;
  palette?: Partial<CanvasAssetLoaderPalette>;
  fontFamily?: string;
  reduceMotion?: boolean;
};

export type CanvasAssetLoaderView = {
  render(snapshot: AssetLoadSnapshot): void;
  clear(): void;
};

export type AssetLoaderUiPalette = {
  surface: string;
  surfaceAlt: string;
  border: string;
  accent: string;
  accentAlt: string;
  text: string;
  muted: string;
  shadow: string;
};

export type AssetLoaderUiOptions = {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  palette?: Partial<AssetLoaderUiPalette>;
  zIndex?: number;
  document?: Document;
  parent?: HTMLElement;
};

export type AssetLoaderUi = {
  root: HTMLElement;
  render(snapshot: AssetLoadSnapshot): void;
  attach(parent?: HTMLElement): void;
  hide(options?: { removeDelayMs?: number }): void;
  remove(): void;
};

type InternalTask = {
  task: AssetLoadTask;
  status: AssetLoadStatus;
  progress: number;
  startedAt: number;
  updatedAt: number;
  error?: unknown;
  promise?: Promise<unknown>;
};

const defaultCanvasPalette: CanvasAssetLoaderPalette = {
  background: "#10170f",
  backgroundDeep: "#050807",
  grid: "rgba(202, 226, 183, 0.16)",
  accent: "#f0c96a",
  accentAlt: "#8de6c2",
  warning: "#ff8b66",
  text: "#f8f5e8",
  muted: "#c3d1b5",
  track: "rgba(0, 0, 0, 0.48)"
};

const defaultUiPalette: AssetLoaderUiPalette = {
  surface: "rgba(8, 13, 12, 0.9)",
  surfaceAlt: "rgba(21, 31, 27, 0.88)",
  border: "rgba(220, 238, 190, 0.34)",
  accent: "#d7ff8d",
  accentAlt: "#88d8ff",
  text: "#f6fff0",
  muted: "#cfe0c8",
  shadow: "rgba(0, 0, 0, 0.48)"
};

const uiStyleId = "ce-asset-loader-style";

export function createAssetLoader(tasks: readonly AssetLoadTask[] = [], options: AssetLoaderOptions = {}): AssetLoader {
  const now = options.now ?? defaultNow;
  const concurrency = normalizeConcurrency(options.concurrency);
  const states = new Map<string, InternalTask>();
  const results = new Map<string, unknown>();
  const listeners = new Set<(snapshot: AssetLoadSnapshot) => void>();
  let scopeIds: string[] | null = null;
  let status: AssetLoadStatus = "idle";
  let activeLabel = options.label ?? "";
  let error: unknown;
  let startedAt = now();
  let updatedAt = startedAt;

  function add(task: AssetLoadTask) {
    assertTask(task);
    if (states.has(task.id)) throw new Error(`Duplicate asset task id: ${task.id}`);
    states.set(task.id, {
      task,
      status: "idle",
      progress: 0,
      startedAt,
      updatedAt
    });
    emit();
  }

  for (const task of tasks) add(task);

  function selectedStates() {
    const ids = scopeIds ?? [...states.keys()];
    return ids.map((id) => states.get(id)).filter((state): state is InternalTask => Boolean(state));
  }

  function snapshot(): AssetLoadSnapshot {
    const selected = selectedStates();
    const total = selected.length;
    let started = 0;
    let completed = 0;
    let failed = 0;
    let active = 0;
    let loadedWeight = 0;
    let weightedProgress = 0;
    let totalWeight = 0;
    let activeTaskLabel = "";

    for (const state of selected) {
      const weight = normalizeWeight(state.task.weight);
      totalWeight += weight;
      if (state.status !== "idle") started += 1;
      if (state.status === "loaded") {
        completed += 1;
        loadedWeight += weight;
        weightedProgress += weight;
      } else if (state.status === "failed") {
        failed += 1;
        weightedProgress += weight;
      } else if (state.status === "loading") {
        active += 1;
        weightedProgress += clamp01(state.progress) * weight;
        if (!activeTaskLabel) activeTaskLabel = state.task.label ?? state.task.id;
      }
    }

    const actualProgress = totalWeight > 0 ? clamp01(weightedProgress / totalWeight) : status === "loaded" ? 1 : 0;
    return {
      status,
      total,
      started,
      completed,
      failed,
      active,
      loadedWeight,
      weightedProgress,
      totalWeight,
      actualProgress,
      visibleProgress: actualProgress,
      label: activeLabel || options.label || defaultStatusLabel(status),
      activeLabel: activeTaskLabel || activeLabel || options.label || defaultStatusLabel(status),
      error,
      startedAt,
      updatedAt
    };
  }

  function emit() {
    updatedAt = now();
    const next = snapshot();
    notifySnapshotListener(options.onSnapshot, next);
    for (const listener of listeners) notifySnapshotListener(listener, next);
  }

  async function runTask(state: InternalTask) {
    if (state.status === "loaded") return results.get(state.task.id);
    if (state.status === "loading" && state.promise) return state.promise;

    state.status = "loading";
    state.progress = Math.max(0.02, state.progress);
    state.error = undefined;
    state.startedAt = now();
    state.updatedAt = state.startedAt;
    activeLabel = state.task.label ?? state.task.id;
    emit();

    state.promise = Promise.resolve().then(() => state.task.load({
      id: state.task.id,
      signal: options.signal,
      reportProgress(progress, label) {
        state.progress = clamp01(progress);
        state.updatedAt = now();
        if (label) activeLabel = label;
        emit();
      }
    })).then((result) => {
      state.status = "loaded";
      state.progress = 1;
      state.promise = undefined;
      results.set(state.task.id, result);
      activeLabel = state.task.label ?? state.task.id;
      emit();
      return result;
    }).catch((taskError) => {
      state.status = "failed";
      state.progress = 1;
      state.promise = undefined;
      state.error = taskError;
      error = taskError;
      activeLabel = state.task.label ?? state.task.id;
      emit();
      throw taskError;
    });

    return state.promise;
  }

  async function load(ids?: readonly string[]) {
    const selectedIds = ids
      ? [...new Set(ids.map((id) => requireTask(states, id).task.id))]
      : [...states.keys()];
    scopeIds = selectedIds;
    status = "loading";
    error = undefined;
    startedAt = now();
    updatedAt = startedAt;
    activeLabel = options.label ?? "Loading assets";
    emit();

    const queue = selectedIds
      .map((id, order) => ({ state: requireTask(states, id), order }))
      .filter((entry) => entry.state.status !== "loaded")
      .sort((left, right) => taskPriority(right.state.task.priority) - taskPriority(left.state.task.priority) || left.order - right.order)
      .map((entry) => entry.state);
    const errors: unknown[] = [];
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const state = queue[cursor];
        cursor += 1;
        try {
          await runTask(state);
        } catch (taskError) {
          errors.push(taskError);
        }
      }
    }

    const workerCount = Math.min(concurrency, Math.max(1, queue.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    status = errors.length ? "failed" : "loaded";
    error = errors[0];
    activeLabel = errors.length ? "Loading failed" : "Ready";
    emit();

    if (errors.length && options.rejectOnError !== false) throw errors[0];
    return pickResults(results, selectedIds);
  }

  return {
    add,
    load,
    loadAsset(id) {
      return load([id]).then((loaded) => loaded[id] as never);
    },
    loadGroup(group) {
      const ids = [...states.values()].filter((state) => state.task.group === group).map((state) => state.task.id);
      return load(ids);
    },
    snapshot,
    onSnapshot(listener) {
      listeners.add(listener);
      notifySnapshotListener(listener, snapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    result(id) {
      return results.get(id) as never;
    },
    results() {
      return Object.fromEntries(results);
    }
  };
}

export function createAssetLoadSnapshot(overrides: Partial<AssetLoadSnapshot> = {}): AssetLoadSnapshot {
  const now = defaultNow();
  return {
    status: "idle",
    total: 0,
    started: 0,
    completed: 0,
    failed: 0,
    active: 0,
    loadedWeight: 0,
    weightedProgress: 0,
    totalWeight: 0,
    actualProgress: 0,
    visibleProgress: 0,
    label: "",
    activeLabel: "",
    startedAt: now,
    updatedAt: now,
    ...overrides
  };
}

export function createImageAssetTask(options: ImageAssetTaskOptions): AssetLoadTask<HTMLImageElement | null> {
  return {
    id: options.id,
    label: options.label ?? options.id,
    group: options.group,
    weight: options.weight,
    load(context) {
      const imageFactory = options.imageFactory ?? (() => new Image());
      const image = imageFactory();
      if (options.crossOrigin !== undefined) image.crossOrigin = options.crossOrigin;
      if (options.referrerPolicy !== undefined) image.referrerPolicy = options.referrerPolicy;
      if (options.decoding !== undefined) image.decoding = options.decoding;
      if (options.loading !== undefined) image.loading = options.loading;

      return new Promise<HTMLImageElement | null>((resolve, reject) => {
        let settled = false;
        const signal = context.signal;

        const cleanup = () => {
          image.onload = null;
          image.onerror = null;
          signal?.removeEventListener("abort", abort);
        };

        const abort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(signal?.reason ?? new DOMException("Image load aborted", "AbortError"));
        };

        const finish = async () => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            context.reportProgress(0.92, options.label);
            if (options.decode !== false && typeof image.decode === "function") {
              await image.decode().catch(() => undefined);
            }
            context.reportProgress(1, options.label);
            resolve(image);
          } catch (error) {
            reject(error);
          }
        };

        image.onload = () => {
          void finish();
        };
        image.onerror = () => {
          if (settled) return;
          settled = true;
          cleanup();
          context.reportProgress(1, options.label);
          if (options.allowFailure) {
            resolve(null);
            return;
          }
          reject(new Error(`Failed to load image asset: ${options.id}`));
        };

        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        context.reportProgress(0.08, options.label);
        image.src = options.src;
        if (image.complete && image.naturalWidth !== 0) void finish();
      });
    }
  };
}

export async function loadImageAssets(
  entries: Record<string, string>,
  options: LoadImageAssetsOptions = {}
): Promise<Record<string, HTMLImageElement | null>> {
  const tasks = Object.entries(entries).map(([id, src]) => createImageAssetTask({
    id,
    src,
    label: options.labelFor?.(id, src) ?? id,
    group: options.group,
    weight: options.weight,
    imageFactory: options.imageFactory,
    crossOrigin: options.crossOrigin,
    referrerPolicy: options.referrerPolicy,
    decoding: options.decoding,
    loading: options.loading,
    decode: options.decode,
    allowFailure: options.allowFailure
  }));
  const loader = createAssetLoader(tasks, {
    label: options.label ?? "Loading images",
    concurrency: options.concurrency,
    rejectOnError: options.allowFailure ? false : true,
    onSnapshot: options.onSnapshot
  });
  const results = await loader.load();
  const images: Record<string, HTMLImageElement | null> = {};
  for (const id of Object.keys(entries)) images[id] = results[id] as HTMLImageElement | null ?? null;
  return images;
}

export function progressFromLoadEvent(event: unknown): number | undefined {
  const candidate = event as { lengthComputable?: unknown; loaded?: unknown; total?: unknown };
  const loaded = typeof candidate.loaded === "number" ? candidate.loaded : Number(candidate.loaded);
  const total = typeof candidate.total === "number" ? candidate.total : Number(candidate.total);
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) return undefined;
  return clamp01(loaded / total);
}

export function createSmoothedAssetProgress(options: SmoothedAssetProgressOptions = {}): AssetProgressSmoother {
  const now = options.now ?? defaultNow;
  const speed = nonNegativeFinite(options.speed ?? 7, "asset progress speed");
  const completeSpeed = nonNegativeFinite(options.completeSpeed ?? 12, "asset progress completeSpeed");
  const minAdvancePerSecond = nonNegativeFinite(options.minAdvancePerSecond ?? 0.025, "asset progress minAdvancePerSecond");
  const maxDeltaSeconds = nonNegativeFinite(options.maxDeltaSeconds ?? 0.08, "asset progress maxDeltaSeconds");
  const holdAt = clamp01(options.holdAt ?? 0.985);
  let visible = clamp01(options.initialProgress ?? 0);
  let lastTime: number | undefined;
  let lastStartedAt = 0;

  function update(snapshot: AssetLoadSnapshot, time = now()) {
    if (!Number.isFinite(time)) throw new RangeError("asset progress time must be finite");
    if (snapshot.startedAt !== lastStartedAt) {
      lastStartedAt = snapshot.startedAt;
      visible = Math.min(visible, clamp01(snapshot.actualProgress));
    }

    const dt = lastTime === undefined ? 0 : Math.min(maxDeltaSeconds, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;

    if (snapshot.status === "idle") {
      visible = 0;
      return { ...snapshot, visibleProgress: visible };
    }

    const actual = clamp01(snapshot.actualProgress);
    const target = snapshot.status === "loaded" ? 1 : Math.min(actual, holdAt);
    if (target <= visible) {
      visible = target;
      return { ...snapshot, visibleProgress: visible };
    }

    const response = 1 - Math.exp(-(snapshot.status === "loaded" ? completeSpeed : speed) * dt);
    const eased = visible + (target - visible) * response;
    const advanced = visible + minAdvancePerSecond * dt;
    visible = Math.min(target, Math.max(eased, advanced));
    if (snapshot.status === "loaded" && 1 - visible < 0.001) visible = 1;
    return { ...snapshot, visibleProgress: visible };
  }

  return {
    update,
    reset(value = 0) {
      visible = clamp01(value);
      lastTime = undefined;
      lastStartedAt = 0;
    },
    set(value: number) {
      visible = clamp01(value);
    },
    value() {
      return visible;
    }
  };
}

export function runAssetLoaderRafLoop(options: AssetLoaderRafLoopOptions): AssetLoaderRafLoop {
  const requestFrame = options.requestAnimationFrame ?? fallbackRequestAnimationFrame(options.now);
  const cancelFrame = options.cancelAnimationFrame ?? fallbackCancelAnimationFrame;
  let running = true;
  let frameId = 0;

  function tick(time: number) {
    if (!running) return;
    frameId = 0;
    try {
      if (!Number.isFinite(time)) throw new RangeError("asset loader frame time must be finite");
      const raw = options.read();
      const snapshot = options.smoother ? options.smoother.update(raw, time) : raw;
      options.render(snapshot);
      if (!running) return;
      if (options.stopWhen?.(snapshot)) {
        stop();
        return;
      }
      frameId = requestFrame(tick);
    } catch (error) {
      running = false;
      frameId = 0;
      throw error;
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelFrame(frameId);
    frameId = 0;
  }

  frameId = requestFrame(tick);
  return {
    stop,
    isRunning() {
      return running;
    }
  };
}

export function createCanvasAssetLoader(
  target: HTMLCanvasElement | CanvasRenderingContext2D,
  options: CanvasAssetLoaderOptions = {}
): CanvasAssetLoaderView {
  const rawContext = "getContext" in target ? target.getContext("2d") : target;
  if (!rawContext) throw new Error("createCanvasAssetLoader requires a 2D canvas context");
  const ctx: CanvasRenderingContext2D = rawContext;
  const canvas = ctx.canvas;
  const palette = { ...defaultCanvasPalette, ...options.palette };
  const fontFamily = options.fontFamily ?? "Inter, ui-sans-serif, system-ui, sans-serif";

  function render(snapshot: AssetLoadSnapshot) {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const cssWidth = Math.max(1, canvas.clientWidth || width);
    const cssScale = width / cssWidth;
    const compact = cssWidth < 520;
    const titlePx = cssPixels(cssWidth, cssScale, 28, cssWidth / 11, 56);
    const subtitlePx = cssPixels(cssWidth, cssScale, 13, cssWidth / 30, 19);
    const percentPx = cssPixels(cssWidth, cssScale, 20, cssWidth / 13, 34);
    const metaPx = cssPixels(cssWidth, cssScale, 12, cssWidth / 34, 15);
    const progress = clamp01(snapshot.visibleProgress);
    const time = options.reduceMotion ? 0 : defaultNow() / 1000;
    const title = options.title ?? snapshot.label ?? "Loading";
    const subtitle = snapshot.activeLabel || options.subtitle || snapshot.label || "Preparing assets";
    const percent = `${Math.round(progress * 100).toString().padStart(2, "0")}%`;

    ctx.save();
    try {
      ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, palette.background);
    bg.addColorStop(1, palette.backgroundDeep);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    drawCanvasLoaderBands(ctx, width, height, palette, time);
    drawCanvasLoaderContours(ctx, width, height, palette, time);

    const panelWidth = Math.min(width * 0.72, 560);
    const panelX = (width - panelWidth) * 0.5;
    const panelY = height * 0.5 - 78;
    const barWidth = panelWidth;
    const barHeight = cssPixels(cssWidth, cssScale, 10, cssWidth / 36, 16);
    const barY = panelY + 86;

    ctx.font = `800 ${titlePx}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = palette.text;
    drawFittedCanvasText(ctx, title, panelX, panelY, compact ? panelWidth : panelWidth * 0.72);

    ctx.font = `600 ${subtitlePx}px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    drawFittedCanvasText(ctx, subtitle, panelX, panelY + 32, panelWidth * 0.84);

    if (!compact) {
      ctx.font = `900 ${percentPx}px ${fontFamily}`;
      ctx.textAlign = "right";
      ctx.fillStyle = snapshot.status === "failed" ? palette.warning : palette.accent;
      ctx.fillText(percent, panelX + panelWidth, panelY + 12);
    }

    drawRoundedRect(ctx, panelX, barY, barWidth, barHeight, barHeight * 0.5);
    ctx.fillStyle = palette.track;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const fillWidth = Math.max(barHeight, barWidth * progress);
    drawRoundedRect(ctx, panelX, barY, fillWidth, barHeight, barHeight * 0.5);
    const fill = ctx.createLinearGradient(panelX, 0, panelX + barWidth, 0);
    fill.addColorStop(0, palette.accentAlt);
    fill.addColorStop(0.55, palette.accent);
    fill.addColorStop(1, snapshot.status === "failed" ? palette.warning : "#fff2a0");
    ctx.fillStyle = fill;
    ctx.fill();

    if (!options.reduceMotion && snapshot.status !== "failed") {
      const shimmerX = panelX + ((time * 180) % (barWidth + 90)) - 90;
      ctx.save();
      try {
        drawRoundedRect(ctx, panelX, barY, fillWidth, barHeight, barHeight * 0.5);
        ctx.clip();
        const shine = ctx.createLinearGradient(shimmerX, 0, shimmerX + 90, 0);
        shine.addColorStop(0, "rgba(255,255,255,0)");
        shine.addColorStop(0.5, "rgba(255,255,255,0.42)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.fillRect(shimmerX, barY, 90, barHeight);
      } finally {
        ctx.restore();
      }
    }

    ctx.font = `700 ${metaPx}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillStyle = palette.muted;
    ctx.fillText(`${snapshot.completed}/${Math.max(1, snapshot.total)} ready`, panelX, barY + 34);
    ctx.textAlign = "right";
    ctx.fillStyle = compact ? (snapshot.status === "failed" ? palette.warning : palette.accent) : palette.muted;
      ctx.fillText(compact ? percent : snapshot.failed ? `${snapshot.failed} failed` : "streaming assets", panelX + panelWidth, barY + 34);
    } finally {
      ctx.restore();
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { render, clear };
}

export function createAssetLoaderUi(options: AssetLoaderUiOptions = {}): AssetLoaderUi {
  const doc = options.document ?? document;
  ensureAssetLoaderStyle(doc);
  const palette = { ...defaultUiPalette, ...options.palette };
  const root = doc.createElement("div");
  root.className = "ce-asset-loader";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  setCssVar(root, "--ce-asset-loader-z", String(options.zIndex ?? 20));
  setCssVar(root, "--ce-asset-loader-bg-image", options.backgroundImage ?? "none");
  setCssVar(root, "--ce-asset-loader-surface", palette.surface);
  setCssVar(root, "--ce-asset-loader-surface-alt", palette.surfaceAlt);
  setCssVar(root, "--ce-asset-loader-border", palette.border);
  setCssVar(root, "--ce-asset-loader-accent", palette.accent);
  setCssVar(root, "--ce-asset-loader-accent-alt", palette.accentAlt);
  setCssVar(root, "--ce-asset-loader-text", palette.text);
  setCssVar(root, "--ce-asset-loader-muted", palette.muted);
  setCssVar(root, "--ce-asset-loader-shadow", palette.shadow);

  const panel = doc.createElement("div");
  panel.className = "ce-asset-loader__panel";

  const title = doc.createElement("div");
  title.className = "ce-asset-loader__title";
  title.textContent = options.title ?? "Loading";

  const subtitle = doc.createElement("div");
  subtitle.className = "ce-asset-loader__subtitle";
  subtitle.textContent = options.subtitle ?? "Preparing assets";

  const meter = doc.createElement("div");
  meter.className = "ce-asset-loader__meter";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");

  const fill = doc.createElement("span");
  fill.className = "ce-asset-loader__fill";
  const spark = doc.createElement("span");
  spark.className = "ce-asset-loader__spark";
  fill.appendChild(spark);
  meter.appendChild(fill);

  const readout = doc.createElement("div");
  readout.className = "ce-asset-loader__readout";
  const label = doc.createElement("span");
  label.textContent = options.subtitle ?? "Preparing assets";
  const percent = doc.createElement("strong");
  percent.textContent = "00%";
  readout.append(label, percent);

  panel.append(title, subtitle, meter, readout);
  root.append(panel);
  let removeTimer: ReturnType<typeof setTimeout> | undefined;

  function clearRemoveTimer() {
    if (removeTimer === undefined) return;
    clearTimeout(removeTimer);
    removeTimer = undefined;
  }

  function render(snapshot: AssetLoadSnapshot) {
    const progress = clamp01(snapshot.visibleProgress);
    const percentValue = Math.round(progress * 100);
    root.dataset.status = snapshot.status;
    title.textContent = options.title ?? snapshot.label ?? "Loading";
    subtitle.textContent = snapshot.activeLabel || options.subtitle || snapshot.label || "Preparing assets";
    label.textContent = snapshot.failed ? `${snapshot.failed} failed` : `${snapshot.completed}/${Math.max(1, snapshot.total)} ready`;
    percent.textContent = `${percentValue.toString().padStart(2, "0")}%`;
    fill.style.transform = `scaleX(${progress})`;
    meter.setAttribute("aria-valuenow", String(percentValue));
  }

  function attach(parent = options.parent ?? doc.body) {
    clearRemoveTimer();
    root.classList.remove("is-done");
    if (!root.parentNode) parent.appendChild(root);
  }

  function remove() {
    clearRemoveTimer();
    root.parentNode?.removeChild(root);
  }

  function hide(hideOptions: { removeDelayMs?: number } = {}) {
    root.classList.add("is-done");
    const delay = nonNegativeFinite(hideOptions.removeDelayMs ?? 260, "asset loader removeDelayMs");
    clearRemoveTimer();
    removeTimer = setTimeout(remove, delay);
  }

  if (options.parent) attach(options.parent);
  return { root, render, attach, hide, remove };
}

function assertTask(task: AssetLoadTask) {
  if (!task.id.trim()) throw new Error("Asset task id must not be empty");
  if (typeof task.load !== "function") throw new Error(`Asset task ${task.id} needs a load function`);
}

function taskPriority(priority: AssetLoadTask["priority"]) {
  if (typeof priority === "number") {
    if (!Number.isFinite(priority)) throw new RangeError("asset task priority must be finite");
    return priority;
  }
  switch (priority) {
    case "critical-audio": return 300;
    case "high": return 200;
    case "background": return -100;
    default: return 0;
  }
}

function requireTask(states: Map<string, InternalTask>, id: string) {
  const state = states.get(id);
  if (!state) throw new Error(`Unknown asset task: ${id}`);
  return state;
}

function pickResults(results: Map<string, unknown>, ids: readonly string[]) {
  const picked: Record<string, unknown> = {};
  for (const id of ids) picked[id] = results.get(id);
  return picked;
}

function normalizeWeight(value: number | undefined) {
  return Number.isFinite(value) && (value as number) > 0 ? value as number : 1;
}

function normalizeConcurrency(value: number | undefined) {
  if (value === undefined || value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("asset loader concurrency must be a positive finite number or Infinity");
  return Math.max(1, Math.floor(value));
}

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function notifySnapshotListener(listener: ((snapshot: AssetLoadSnapshot) => void) | undefined, snapshot: AssetLoadSnapshot) {
  if (!listener) return;
  try {
    listener(snapshot);
  } catch {
    // Progress observers must not alter the outcome of asset loading.
  }
}

function defaultStatusLabel(status: AssetLoadStatus) {
  if (status === "loading") return "Loading assets";
  if (status === "loaded") return "Ready";
  if (status === "failed") return "Loading failed";
  return "Waiting";
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function defaultNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function fallbackRequestAnimationFrame(now?: () => number) {
  return (callback: FrameRequestCallback) => {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
    return setTimeout(() => callback((now ?? defaultNow)()), 16) as unknown as number;
  };
}

function fallbackCancelAnimationFrame(id: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
}

function drawCanvasLoaderBands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: CanvasAssetLoaderPalette,
  time: number
) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let index = 0; index < 10; index += 1) {
    const y = (index / 9) * height;
    const offset = Math.sin(time * 0.6 + index * 0.8) * 18;
    const line = ctx.createLinearGradient(0, y, width, y + 28);
    line.addColorStop(0, "rgba(255,255,255,0)");
    line.addColorStop(0.5, palette.grid);
    line.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-40, y + offset);
    ctx.lineTo(width + 40, y - height * 0.12 + offset);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCanvasLoaderContours(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: CanvasAssetLoaderPalette,
  time: number
) {
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let row = 0; row < 5; row += 1) {
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 18) {
      const baseY = height * (0.18 + row * 0.17);
      const y = baseY + Math.sin(x * 0.015 + row * 1.2 + time * 0.35) * 16;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, Math.abs(width) * 0.5, Math.abs(height) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
}

function drawFittedCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  const originalFont = ctx.font;
  const fontSizeMatch = /(\d+(?:\.\d+)?)px/.exec(originalFont);
  if (fontSizeMatch) {
    const originalSize = Number(fontSizeMatch[1]);
    let size = originalSize;
    while (size > Math.max(12, originalSize * 0.62) && ctx.measureText(text).width > maxWidth) {
      size -= 1;
      ctx.font = originalFont.replace(fontSizeMatch[0], `${size}px`);
    }
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      ctx.font = originalFont;
      return;
    }
    ctx.font = originalFont;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
  ctx.fillText(`${clipped}...`, x, y);
}

function cssPixels(cssWidth: number, cssScale: number, min: number, preferred: number, max: number) {
  const cssSize = Math.max(min, Math.min(max, preferred || cssWidth));
  return cssSize * Math.max(0.5, cssScale);
}

function setCssVar(element: HTMLElement, name: string, value: string) {
  element.style.setProperty(name, value);
}

function ensureAssetLoaderStyle(doc: Document) {
  if (doc.getElementById(uiStyleId)) return;
  const style = doc.createElement("style");
  style.id = uiStyleId;
  style.textContent = `
.ce-asset-loader {
  align-items: center;
  background:
    linear-gradient(90deg, rgba(3, 7, 7, 0.78), rgba(4, 9, 8, 0.38) 48%, rgba(0, 0, 0, 0.78)),
    linear-gradient(180deg, rgba(6, 9, 8, 0.18), rgba(0, 0, 0, 0.82) 72%, rgba(0, 0, 0, 0.96)),
    var(--ce-asset-loader-bg-image);
  background-position: center;
  background-size: cover;
  color: var(--ce-asset-loader-text);
  display: grid;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  inset: 0;
  justify-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  padding: 18px;
  pointer-events: auto;
  position: fixed;
  transition: opacity 220ms ease, visibility 220ms ease;
  width: 100vw;
  z-index: var(--ce-asset-loader-z);
}
.ce-asset-loader::before {
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px);
  content: "";
  inset: 0;
  opacity: 0.5;
  pointer-events: none;
  position: absolute;
}
.ce-asset-loader.is-done {
  opacity: 0;
  visibility: hidden;
}
.ce-asset-loader__panel {
  background:
    linear-gradient(180deg, var(--ce-asset-loader-surface-alt), var(--ce-asset-loader-surface));
  border: 1px solid var(--ce-asset-loader-border);
  border-radius: 8px;
  box-shadow:
    0 28px 80px var(--ce-asset-loader-shadow),
    inset 0 1px 0 rgba(255,255,255,0.08);
  box-sizing: border-box;
  display: grid;
  gap: 12px;
  max-width: calc(100vw - 28px);
  padding: 20px;
  position: relative;
  width: min(540px, calc(100vw - 28px));
}
.ce-asset-loader__title {
  color: var(--ce-asset-loader-text);
  font-size: clamp(28px, 6vw, 54px);
  font-weight: 900;
  letter-spacing: 0;
  line-height: 0.98;
}
.ce-asset-loader__subtitle {
  color: var(--ce-asset-loader-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  min-height: 18px;
}
.ce-asset-loader__meter {
  background: rgba(0, 0, 0, 0.46);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  height: 14px;
  margin-top: 4px;
  overflow: hidden;
  position: relative;
}
.ce-asset-loader__fill {
  background:
    linear-gradient(90deg, var(--ce-asset-loader-accent-alt), var(--ce-asset-loader-accent), #fff2a0);
  display: block;
  height: 100%;
  position: relative;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 90ms linear;
  width: 100%;
}
.ce-asset-loader__spark {
  animation: ceAssetLoaderSpark 1300ms linear infinite;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.62), transparent);
  inset: 0 auto 0 0;
  position: absolute;
  width: 90px;
}
.ce-asset-loader__readout {
  align-items: center;
  color: var(--ce-asset-loader-muted);
  display: flex;
  font-size: 12px;
  font-weight: 800;
  gap: 12px;
  justify-content: space-between;
  line-height: 1.2;
}
.ce-asset-loader__readout span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ce-asset-loader__readout strong {
  color: var(--ce-asset-loader-accent);
  font-size: 18px;
  line-height: 1;
}
.ce-asset-loader[data-status="failed"] .ce-asset-loader__fill {
  background: linear-gradient(90deg, #ff8b66, #ffd178);
}
@keyframes ceAssetLoaderSpark {
  from { transform: translateX(-90px); }
  to { transform: translateX(560px); }
}
@media (prefers-reduced-motion: reduce) {
  .ce-asset-loader, .ce-asset-loader__fill { transition: none; }
  .ce-asset-loader__spark { animation: none; display: none; }
}
@media (max-width: 720px) {
  .ce-asset-loader {
    align-items: end;
    padding: 14px;
  }
  .ce-asset-loader__panel {
    gap: 10px;
    padding: 16px;
    width: min(420px, calc(100vw - 28px));
  }
  .ce-asset-loader__title {
    font-size: clamp(30px, 12vw, 42px);
  }
}
`;
  (doc.head ?? doc.documentElement).appendChild(style);
}
