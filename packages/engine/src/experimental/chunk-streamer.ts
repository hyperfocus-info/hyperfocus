export interface ChunkCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface ChunkRegion {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface BoundedChunkStreamerOptions<Value> {
  load(coordinate: ChunkCoordinate, signal: AbortSignal): Promise<Value>;
  maxCachedChunks?: number;
  maxConcurrentLoads?: number;
  maxPendingLoads?: number;
}

interface PendingChunk<Value> {
  readonly coordinate: ChunkCoordinate;
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (error: unknown) => void;
  controller?: AbortController;
}

export interface ChunkStreamerStats {
  readonly cached: number;
  readonly pending: number;
  readonly active: number;
  readonly cacheHits: number;
  readonly loads: number;
  readonly evictions: number;
}

/** Creates a bounded async LRU streamer around an injected loader. */
export function createBoundedChunkStreamer<Value>(options: BoundedChunkStreamerOptions<Value>) {
  const maxCached = positiveInteger(options.maxCachedChunks ?? 64, "maxCachedChunks");
  const maxConcurrent = positiveInteger(options.maxConcurrentLoads ?? 4, "maxConcurrentLoads");
  const maxPending = positiveInteger(options.maxPendingLoads ?? 128, "maxPendingLoads");
  const cache = new Map<string, { value: Value }>();
  const pending = new Map<string, PendingChunk<Value>>();
  const queue: string[] = [];
  const retained = new Set<string>();
  let head = 0;
  let active = 0;
  let cacheHits = 0;
  let loads = 0;
  let evictions = 0;
  let disposed = false;
  const evictToCapacity = () => {
    while (cache.size > maxCached) {
      let victim: string | undefined;
      for (const key of cache.keys()) {
        if (!retained.has(key)) { victim = key; break; }
      }
      victim ??= cache.keys().next().value;
      if (victim === undefined) return;
      cache.delete(victim);
      evictions += 1;
    }
  };
  const pump = () => {
    while (!disposed && active < maxConcurrent && head < queue.length) {
      const key = queue[head++];
      const item = pending.get(key);
      if (!item || item.controller) continue;
      const controller = new AbortController();
      item.controller = controller;
      active += 1;
      loads += 1;
      void options.load(item.coordinate, controller.signal).then(
        (value) => {
          if (pending.get(key) !== item) return;
          pending.delete(key);
          active -= 1;
          if (!disposed) {
            cache.delete(key);
            cache.set(key, { value });
            evictToCapacity();
            item.resolve(value);
            pump();
          }
        },
        (error) => {
          if (pending.get(key) !== item) return;
          pending.delete(key);
          active -= 1;
          item.reject(error);
          pump();
        }
      );
    }
    if (head > 64 && head * 2 >= queue.length) {
      queue.splice(0, head);
      head = 0;
    }
  };
  const get = (x: number, y: number): Value | undefined => {
    const key = chunkKey(integer(x, "x"), integer(y, "y"));
    const entry = cache.get(key);
    if (!entry) return undefined;
    cache.delete(key);
    cache.set(key, entry);
    cacheHits += 1;
    return entry.value;
  };
  const request = (x: number, y: number): Promise<Value> => {
    if (disposed) return Promise.reject(new Error("chunk streamer is disposed."));
    const coordinate = { x: integer(x, "x"), y: integer(y, "y") };
    const key = chunkKey(coordinate.x, coordinate.y);
    const cached = cache.get(key);
    if (cached) {
      get(coordinate.x, coordinate.y);
      return Promise.resolve(cached.value);
    }
    const existing = pending.get(key);
    if (existing) return existing.promise;
    if (pending.size >= maxPending) return Promise.reject(new Error("chunk pending-load capacity exceeded."));
    let resolve = (_value: Value) => {};
    let reject = (_error: unknown) => {};
    const promise = new Promise<Value>((accept, decline) => { resolve = accept; reject = decline; });
    pending.set(key, { coordinate, promise, resolve, reject });
    queue.push(key);
    pump();
    return promise;
  };
  return Object.freeze({
    stats(): ChunkStreamerStats {
      return { cached: cache.size, pending: pending.size, active, cacheHits, loads, evictions };
    },
    get,
    request,
    /** Replaces the retained viewport and requests every inclusive coordinate. */
    loadRegion(region: ChunkRegion): Promise<readonly Value[]> {
    const minX = integer(region.minX, "minX"), minY = integer(region.minY, "minY");
    const maxX = integer(region.maxX, "maxX"), maxY = integer(region.maxY, "maxY");
    if (minX > maxX || minY > maxY) throw new RangeError("chunk region minimum must not exceed maximum.");
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    if (!Number.isSafeInteger(area) || area > maxCached) throw new RangeError("chunk region exceeds cache capacity.");
    retained.clear();
    const requests: Promise<Value>[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        retained.add(chunkKey(x, y));
        requests.push(request(x, y));
      }
    }
    evictToCapacity();
    return Promise.all(requests);
    },

    dispose(reason: unknown = new Error("chunk streamer disposed.")): void {
    if (disposed) return;
    disposed = true;
    for (const item of pending.values()) {
      item.controller?.abort();
      item.reject(reason);
    }
    pending.clear();
    queue.length = 0;
    cache.clear();
    retained.clear();
    head = 0;
    active = 0;
    },
  });
}

export type BoundedChunkStreamer<Value> = ReturnType<typeof createBoundedChunkStreamer<Value>>;

function integer(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function chunkKey(x: number, y: number): string { return `${x},${y}`; }
