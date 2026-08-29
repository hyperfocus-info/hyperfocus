import {
  drawRenderable,
  finiteOr,
  type Renderable,
  type RenderCamera,
  type RenderRectLike,
  type RenderLayerOptions,
  type ResolvedRenderLayerOptions
} from "./draw-data.ts";
import { renderCallIntersectsRect } from "./batch.ts";
import { createObjectPool } from "../runtime/object-pool.ts";

export type RenderStageOptions = {
  width?: number;
  height?: number;
  clearStyle?: string | CanvasGradient | CanvasPattern;
  autoClearCanvas?: boolean;
  drawDataCaches?: boolean;
  cullRect?: RenderRectLike;
};

export type RenderStageResult = {
  layers: number;
  submitted: number;
  drawn: number;
  skipped: number;
  culled: number;
};

export type RenderStageLayer = {
  name: string;
  options: ResolvedRenderLayerOptions;
  push(call: Renderable): Renderable;
  pushMany(calls: Iterable<Renderable>): number;
  clear(): void;
  size(): number;
};

export type RenderStage = {
  addLayer(name: string, layerOptions?: RenderLayerOptions): RenderStageLayer;
  clear(clearOptions?: { canvas?: boolean }): void;
  push(layerName: string, call: Renderable): Renderable;
  pushMany(layerName: string, calls: Iterable<Renderable>): number;
  setCamera(camera: RenderCamera): RenderCamera;
  setDrawDataCaches(enabled: boolean): boolean;
  render(): RenderStageResult;
  flush(): RenderStageResult;
  getLayer(name: string): RenderStageLayer | undefined;
  layerNames(): string[];
  size(layerName?: string): number;
};

type InternalLayer = {
  name: string;
  options: ResolvedRenderLayerOptions;
  index: number;
  calls: RenderStageEntry[];
};

type RenderStageEntry = {
  call: Renderable;
  order: number;
};

type PreparedRenderLayer = {
  name: string;
  options: ResolvedRenderLayerOptions;
  layerCullRect?: RenderRectLike;
  effectiveCullRect?: RenderRectLike;
  calls: RenderStageEntry[];
  visibleCalls: RenderStageEntry[];
  sortedCalls: RenderStageEntry[];
};

const emptyRenderable: Renderable = () => {};
const renderStageEntryPool = createObjectPool<RenderStageEntry>({
  create: () => ({ call: emptyRenderable, order: 0 }),
  reset(entry) {
    entry.call = emptyRenderable;
    entry.order = 0;
  },
  capacity: 32768
});

const defaultLayerOptions: ResolvedRenderLayerOptions = {
  sort: "none",
  ignoreCamera: false,
  order: 0,
  cullRect: undefined
};

function sortY(entry: RenderStageEntry) {
  if (typeof entry.call === "function") return entry.order;
  return finiteOr(entry.call.ySort ?? entry.call.sortY ?? entry.call.y, entry.order);
}

function sortZ(entry: RenderStageEntry) {
  return typeof entry.call === "function" ? 0 : finiteOr(entry.call.z, 0);
}

function applyCamera(ctx: CanvasRenderingContext2D, camera: RenderCamera) {
  const scale = camera.scale ?? camera.zoom ?? 1;
  ctx.scale(scale, scale);
  if (camera.rotation) ctx.rotate(camera.rotation);
  ctx.translate(-(camera.x ?? 0), -(camera.y ?? 0));
}

function clearCanvas(ctx: CanvasRenderingContext2D, options: RenderStageOptions) {
  const canvas = ctx.canvas;
  const width = options.width ?? canvas?.width ?? 0;
  const height = options.height ?? canvas?.height ?? 0;
  if (!width || !height) return;
  if (options.clearStyle) {
    ctx.save();
    ctx.fillStyle = options.clearStyle;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else {
    ctx.clearRect(0, 0, width, height);
  }
}

function pushToLayer(layer: InternalLayer, call: Renderable) {
  const entry = renderStageEntryPool.acquire();
  entry.call = call;
  entry.order = layer.calls.length;
  layer.calls.push(entry);
  return call;
}

function releaseLayerCalls(layer: InternalLayer) {
  for (const entry of layer.calls) renderStageEntryPool.release(entry);
  layer.calls.length = 0;
}

function sortedLayerCalls(layer: PreparedRenderLayer, source: readonly RenderStageEntry[]) {
  layer.sortedCalls.length = 0;
  for (const entry of source) {
    layer.sortedCalls.push(entry);
  }
  return layer.sortedCalls.sort(compareRenderStageEntries);
}

function visibleLayerCalls(layer: PreparedRenderLayer, cullRect: RenderRectLike | undefined) {
  if (!cullRect) return { calls: layer.calls, skipped: 0 };
  layer.visibleCalls.length = 0;
  let skipped = 0;
  for (const entry of layer.calls) {
    if (renderCallIntersectsRect(entry.call, cullRect)) layer.visibleCalls.push(entry);
    else skipped += 1;
  }
  return { calls: layer.visibleCalls, skipped };
}

function compareRenderStageEntries(a: RenderStageEntry, b: RenderStageEntry) {
  return sortY(a) - sortY(b) || sortZ(a) - sortZ(b) || a.order - b.order;
}

function sortLayers(a: InternalLayer, b: InternalLayer) {
  return a.options.order - b.options.order || a.index - b.index;
}

function copyRect(source: RenderRectLike | undefined, target: RenderRectLike | undefined) {
  if (!source) return undefined;
  const next = target ?? { x: 0, y: 0 };
  next.x = source.x;
  next.y = source.y;
  next.width = source.width;
  next.height = source.height;
  next.w = source.w;
  next.h = source.h;
  return next;
}

function prepareRenderLayer(
  prepared: PreparedRenderLayer,
  layer: InternalLayer,
  stageCullRect: RenderRectLike | undefined
) {
  prepared.name = layer.name;
  prepared.options.sort = layer.options.sort;
  prepared.options.ignoreCamera = layer.options.ignoreCamera;
  prepared.options.order = layer.options.order;
  prepared.layerCullRect = copyRect(layer.options.cullRect, prepared.layerCullRect);
  prepared.options.cullRect = prepared.layerCullRect;
  prepared.effectiveCullRect = prepared.layerCullRect
    ?? copyRect(stageCullRect, prepared.effectiveCullRect);

  for (let index = 0; index < layer.calls.length; index += 1) {
    const source = layer.calls[index];
    const target = prepared.calls[index] ?? { call: emptyRenderable, order: 0 };
    prepared.calls[index] = target;
    target.call = source.call;
    target.order = source.order;
  }
  prepared.calls.length = layer.calls.length;
  prepared.visibleCalls.length = 0;
  prepared.sortedCalls.length = 0;
}

function layerApi(layer: InternalLayer): RenderStageLayer {
  return {
    name: layer.name,
    options: layer.options,
    push(call) {
      return pushToLayer(layer, call);
    },
    pushMany(calls) {
      let pushed = 0;
      for (const call of calls) {
        pushToLayer(layer, call);
        pushed += 1;
      }
      return pushed;
    },
    clear() {
      releaseLayerCalls(layer);
    },
    size() {
      return layer.calls.length;
    }
  };
}

export function createRenderStage(ctx: CanvasRenderingContext2D, camera: RenderCamera = {}, options: RenderStageOptions = {}): RenderStage {
  const layers = new Map<string, InternalLayer>();
  const orderedLayerCache: InternalLayer[] = [];
  const preparedLayers: PreparedRenderLayer[] = [];
  const frameCamera: RenderCamera = {};
  let activeCamera = camera;
  let activeDrawDataCaches = options.drawDataCaches ?? false;
  let nextLayerIndex = 0;
  let orderedLayerCacheDirty = true;
  let rendering = false;

  function addLayer(name: string, layerOptions: RenderLayerOptions = {}) {
    const existing = layers.get(name);
    if (existing) {
      existing.options = { ...existing.options, ...layerOptions };
      orderedLayerCacheDirty = true;
      return layerApi(existing);
    }
    const layer: InternalLayer = {
      name,
      options: { ...defaultLayerOptions, order: nextLayerIndex, ...layerOptions },
      index: nextLayerIndex,
      calls: []
    };
    nextLayerIndex += 1;
    layers.set(name, layer);
    orderedLayerCacheDirty = true;
    return layerApi(layer);
  }

  function orderedLayerCacheValid() {
    if (orderedLayerCacheDirty || orderedLayerCache.length !== layers.size) return false;
    let previous: InternalLayer | undefined;
    for (const layer of orderedLayerCache) {
      if (layers.get(layer.name) !== layer) return false;
      if (previous && sortLayers(previous, layer) > 0) return false;
      previous = layer;
    }
    return true;
  }

  function orderedLayers() {
    if (orderedLayerCacheValid()) return orderedLayerCache;
    orderedLayerCache.length = 0;
    for (const layer of layers.values()) orderedLayerCache.push(layer);
    orderedLayerCache.sort(sortLayers);
    orderedLayerCacheDirty = false;
    return orderedLayerCache;
  }

  function clear(clearOptions: { canvas?: boolean } = {}) {
    for (const layer of layers.values()) releaseLayerCalls(layer);
    if (clearOptions.canvas ?? options.autoClearCanvas ?? true) clearCanvas(ctx, options);
  }

  function requireLayer(layerName: string) {
    const layer = layers.get(layerName);
    if (!layer) throw new Error(`Render layer not found: ${layerName}`);
    return layer;
  }

  function push(layerName: string, call: Renderable) {
    return pushToLayer(requireLayer(layerName), call);
  }

  function pushMany(layerName: string, calls: Iterable<Renderable>) {
    const layer = requireLayer(layerName);
    let pushed = 0;
    for (const call of calls) {
      pushToLayer(layer, call);
      pushed += 1;
    }
    return pushed;
  }

  function setCamera(nextCamera: RenderCamera) {
    activeCamera = nextCamera;
    return activeCamera;
  }

  function setDrawDataCaches(enabled: boolean) {
    activeDrawDataCaches = enabled;
    return activeDrawDataCaches;
  }

  function render() {
    if (rendering) throw new Error("Render stage cannot render reentrantly");
    rendering = true;
    try {
      const ordered = orderedLayers();
      const layerCount = ordered.length;
      frameCamera.x = activeCamera.x;
      frameCamera.y = activeCamera.y;
      frameCamera.scale = activeCamera.scale;
      frameCamera.zoom = activeCamera.zoom;
      frameCamera.rotation = activeCamera.rotation;
      const drawDataCaches = activeDrawDataCaches;

      // Snapshot queue entries before invoking user draw callbacks. Stage clears and
      // pushes can then safely reuse pooled queue entries without corrupting this frame.
      for (let index = 0; index < layerCount; index += 1) {
        const prepared = preparedLayers[index] ?? {
          name: "",
          options: { ...defaultLayerOptions },
          calls: [],
          visibleCalls: [],
          sortedCalls: []
        };
        preparedLayers[index] = prepared;
        prepareRenderLayer(prepared, ordered[index], options.cullRect);
      }

      let drawn = 0;
      let skipped = 0;
      let submitted = 0;
      let culled = 0;
      for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
        const layer = preparedLayers[layerIndex];
        submitted += layer.calls.length;
        if (layer.calls.length === 0) continue;
        const visible = visibleLayerCalls(layer, layer.effectiveCullRect);
        skipped += visible.skipped;
        culled += visible.skipped;
        if (visible.calls.length === 0) continue;
        const calls = layer.options.sort === "y-axis"
          ? sortedLayerCalls(layer, visible.calls)
          : visible.calls;
        const drawState = {
          camera: frameCamera,
          layer: layer.name,
          layerOptions: layer.options,
          order: 0,
          drawDataCaches
        };

        if (!layer.options.ignoreCamera) {
          ctx.save();
          applyCamera(ctx, frameCamera);
        }
        try {
          for (const entry of calls) {
            drawState.order = entry.order;
            const ok = drawRenderable(ctx, entry.call, drawState);
            if (ok) drawn += 1;
            else skipped += 1;
          }
        } finally {
          if (!layer.options.ignoreCamera) ctx.restore();
        }
      }
      return { layers: layerCount, submitted, drawn, skipped, culled };
    } finally {
      rendering = false;
    }
  }

  return {
    addLayer,
    clear,
    push,
    pushMany,
    setCamera,
    setDrawDataCaches,
    render,
    flush: render,
    getLayer(name: string) {
      const layer = layers.get(name);
      return layer ? layerApi(layer) : undefined;
    },
    layerNames() {
      return orderedLayers().map((layer) => layer.name);
    },
    size(layerName?: string) {
      if (layerName) return layers.get(layerName)?.calls.length ?? 0;
      let count = 0;
      for (const layer of layers.values()) count += layer.calls.length;
      return count;
    }
  };
}

export type CanvasRenderStageTarget = {
  getContext(contextId: "2d"): CanvasRenderingContext2D | null;
};

export type CanvasRenderStageOptions = RenderStageOptions & {
  camera?: RenderCamera;
};

export function createCanvasRenderStage(canvas: CanvasRenderStageTarget, options: CanvasRenderStageOptions = {}): RenderStage {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  const { camera = {}, ...stageOptions } = options;
  return createRenderStage(ctx, camera, stageOptions);
}
