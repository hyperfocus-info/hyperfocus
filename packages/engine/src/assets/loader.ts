export { createAssetLoaderUi, createCanvasAssetLoader, runAssetLoaderRafLoop } from "./presentation.ts";
export type {
  AssetLoaderRafLoop,
  AssetLoaderRafLoopOptions,
  AssetLoaderUi,
  AssetLoaderUiOptions,
  AssetLoaderUiPalette,
  CanvasAssetLoaderOptions,
  CanvasAssetLoaderPalette,
  CanvasAssetLoaderView
} from "./presentation.ts";

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
        Promise.resolve(fonts.load(request.font, request.sample ?? "BESbswy")).then(fontLoadStatus),
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
  loadAsset(id: string): Promise<unknown>;
  loadAsset<TAsset>(id: string, parse: AssetResultParser<TAsset>): Promise<TAsset>;
  loadGroup(group: string): Promise<Record<string, unknown>>;
  snapshot(): AssetLoadSnapshot;
  onSnapshot(listener: (snapshot: AssetLoadSnapshot) => void): () => void;
  result(id: string): unknown;
  result<TAsset>(id: string, parse: AssetResultParser<TAsset>): TAsset | undefined;
  results(): Record<string, unknown>;
};

export type AssetResultParser<TAsset> = (value: unknown, id: string) => TAsset;

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

type InternalTask = {
  task: AssetLoadTask;
  status: AssetLoadStatus;
  progress: number;
  startedAt: number;
  updatedAt: number;
  error?: unknown;
  promise?: Promise<unknown>;
};

function createInternalTask(task: AssetLoadTask, timestamp: number): InternalTask {
  return { task, status: "idle", progress: 0, startedAt: timestamp, updatedAt: timestamp };
}

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
    states.set(task.id, createInternalTask(task, startedAt));
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

  const resultAccessors = createAssetResultAccessors(load, results);

  return {
    add,
    load,
    loadAsset: resultAccessors.loadAsset,
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
    result: resultAccessors.result,
    results() {
      return Object.fromEntries(results);
    }
  };
}

function createAssetResultAccessors(
  load: AssetLoader["load"],
  results: Map<string, unknown>
): Pick<AssetLoader, "loadAsset" | "result"> {
  async function loadAsset(id: string): Promise<unknown>;
  async function loadAsset<TAsset>(id: string, parse: AssetResultParser<TAsset>): Promise<TAsset>;
  async function loadAsset<TAsset>(id: string, parse?: AssetResultParser<TAsset>): Promise<unknown> {
    const value = (await load([id]))[id];
    return parse ? parse(value, id) : value;
  }

  function result(id: string): unknown;
  function result<TAsset>(id: string, parse: AssetResultParser<TAsset>): TAsset | undefined;
  function result<TAsset>(id: string, parse?: AssetResultParser<TAsset>): unknown {
    const value = results.get(id);
    return parse && value !== undefined ? parse(value, id) : value;
  }

  return { loadAsset, result };
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
  for (const id of Object.keys(entries)) images[id] = parseImageAsset(results[id], id);
  return images;
}

export function progressFromLoadEvent(event: unknown): number | undefined {
  if ((typeof event !== "object" && typeof event !== "function") || event === null) return undefined;
  const loadedValue = Reflect.get(event, "loaded");
  const totalValue = Reflect.get(event, "total");
  const loaded = typeof loadedValue === "number" ? loadedValue : Number(loadedValue);
  const total = typeof totalValue === "number" ? totalValue : Number(totalValue);
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
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
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

function fontLoadStatus(loaded: FontFace[]): "loaded" | "failed" {
  return loaded.length > 0 ? "loaded" : "failed";
}

function parseImageAsset(value: unknown, id: string): HTMLImageElement | null {
  if (value === null) return null;
  if (isHtmlImageElement(value)) return value;
  throw new TypeError(`Asset ${id} did not produce an HTML image element`);
}

function isHtmlImageElement(value: unknown): value is HTMLImageElement {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "src") === "string"
    && (typeof Reflect.get(value, "decode") === "function" || "onload" in value);
}
