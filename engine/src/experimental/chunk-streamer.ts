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

/** Bounded async LRU streamer; the injected loader can read IndexedDB or the network. */
export class BoundedChunkStreamer<Value> {
  readonly #load: BoundedChunkStreamerOptions<Value>["load"];
  readonly #maxCached: number;
  readonly #maxConcurrent: number;
  readonly #maxPending: number;
  readonly #cache = new Map<string, Value>();
  readonly #pending = new Map<string, PendingChunk<Value>>();
  readonly #queue: string[] = [];
  readonly #retained = new Set<string>();
  #head = 0;
  #active = 0;
  #cacheHits = 0;
  #loads = 0;
  #evictions = 0;
  #disposed = false;

  constructor(options: BoundedChunkStreamerOptions<Value>) {
    this.#load = options.load;
    this.#maxCached = positiveInteger(options.maxCachedChunks ?? 64, "maxCachedChunks");
    this.#maxConcurrent = positiveInteger(options.maxConcurrentLoads ?? 4, "maxConcurrentLoads");
    this.#maxPending = positiveInteger(options.maxPendingLoads ?? 128, "maxPendingLoads");
  }

  stats(): ChunkStreamerStats {
    return {
      cached: this.#cache.size, pending: this.#pending.size, active: this.#active,
      cacheHits: this.#cacheHits, loads: this.#loads, evictions: this.#evictions
    };
  }

  get(x: number, y: number): Value | undefined {
    const key = chunkKey(integer(x, "x"), integer(y, "y"));
    if (!this.#cache.has(key)) return undefined;
    const value = this.#cache.get(key);
    this.#cache.delete(key);
    this.#cache.set(key, value as Value);
    this.#cacheHits += 1;
    return value;
  }

  request(x: number, y: number): Promise<Value> {
    if (this.#disposed) return Promise.reject(new Error("chunk streamer is disposed."));
    const coordinate = { x: integer(x, "x"), y: integer(y, "y") };
    const key = chunkKey(coordinate.x, coordinate.y);
    if (this.#cache.has(key)) return Promise.resolve(this.get(coordinate.x, coordinate.y) as Value);
    const existing = this.#pending.get(key);
    if (existing) return existing.promise;
    if (this.#pending.size >= this.#maxPending) return Promise.reject(new Error("chunk pending-load capacity exceeded."));
    let resolve!: (value: Value) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<Value>((accept, decline) => { resolve = accept; reject = decline; });
    this.#pending.set(key, { coordinate, promise, resolve, reject });
    this.#queue.push(key);
    this.#pump();
    return promise;
  }

  /** Replaces the retained viewport and requests every inclusive coordinate. */
  loadRegion(region: ChunkRegion): Promise<readonly Value[]> {
    const minX = integer(region.minX, "minX"), minY = integer(region.minY, "minY");
    const maxX = integer(region.maxX, "maxX"), maxY = integer(region.maxY, "maxY");
    if (minX > maxX || minY > maxY) throw new RangeError("chunk region minimum must not exceed maximum.");
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    if (!Number.isSafeInteger(area) || area > this.#maxCached) throw new RangeError("chunk region exceeds cache capacity.");
    this.#retained.clear();
    const requests: Promise<Value>[] = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        this.#retained.add(chunkKey(x, y));
        requests.push(this.request(x, y));
      }
    }
    this.#evictToCapacity();
    return Promise.all(requests);
  }

  dispose(reason: unknown = new Error("chunk streamer disposed.")): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const pending of this.#pending.values()) {
      pending.controller?.abort();
      pending.reject(reason);
    }
    this.#pending.clear();
    this.#queue.length = 0;
    this.#cache.clear();
    this.#retained.clear();
    this.#head = 0;
    this.#active = 0;
  }

  #pump(): void {
    while (!this.#disposed && this.#active < this.#maxConcurrent && this.#head < this.#queue.length) {
      const key = this.#queue[this.#head++];
      const pending = this.#pending.get(key);
      if (!pending || pending.controller) continue;
      const controller = new AbortController();
      pending.controller = controller;
      this.#active += 1;
      this.#loads += 1;
      void this.#load(pending.coordinate, controller.signal).then(
        (value) => this.#complete(key, pending, value),
        (error) => this.#fail(key, pending, error)
      );
    }
    if (this.#head > 64 && this.#head * 2 >= this.#queue.length) {
      this.#queue.splice(0, this.#head);
      this.#head = 0;
    }
  }

  #complete(key: string, pending: PendingChunk<Value>, value: Value): void {
    if (this.#pending.get(key) !== pending) return;
    this.#pending.delete(key);
    this.#active -= 1;
    if (!this.#disposed) {
      this.#cache.delete(key);
      this.#cache.set(key, value);
      this.#evictToCapacity();
      pending.resolve(value);
      this.#pump();
    }
  }

  #fail(key: string, pending: PendingChunk<Value>, error: unknown): void {
    if (this.#pending.get(key) !== pending) return;
    this.#pending.delete(key);
    this.#active -= 1;
    pending.reject(error);
    this.#pump();
  }

  #evictToCapacity(): void {
    while (this.#cache.size > this.#maxCached) {
      let victim: string | undefined;
      for (const key of this.#cache.keys()) {
        if (!this.#retained.has(key)) { victim = key; break; }
      }
      victim ??= this.#cache.keys().next().value;
      if (victim === undefined) return;
      this.#cache.delete(victim);
      this.#evictions += 1;
    }
  }
}

function integer(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function chunkKey(x: number, y: number): string { return `${x},${y}`; }

export function createBoundedChunkStreamer<Value>(options: BoundedChunkStreamerOptions<Value>): BoundedChunkStreamer<Value> {
  return new BoundedChunkStreamer(options);
}
