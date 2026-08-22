export type ProceduralPath = Pick<Path2D, "moveTo" | "lineTo" | "closePath"> & Partial<Pick<Path2D, "arc" | "ellipse" | "quadraticCurveTo" | "bezierCurveTo">>;

export type BoundedPathCacheOptions<TPath extends ProceduralPath = Path2D> = {
  maxEntries?: number;
  createPath?: () => TPath;
};

/** Bounded LRU cache for procedural geography and other stable vector paths. */
export function createBoundedPathCache<TPath extends ProceduralPath = Path2D>(options: BoundedPathCacheOptions<TPath> = {}) {
  const maxEntries = options.maxEntries ?? 256;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) throw new RangeError("path cache maxEntries must be a non-negative safe integer");
  const createPath = options.createPath ?? (() => new Path2D() as unknown as TPath);
  const entries = new Map<string, TPath>();

  return {
    get(key: string, build: (path: TPath) => void): TPath {
      if (!key || key.length > 2_048) throw new Error("path cache key must be bounded non-empty text");
      const cached = entries.get(key);
      if (cached) {
        entries.delete(key);
        entries.set(key, cached);
        return cached;
      }
      const path = createPath();
      build(path);
      if (maxEntries > 0) {
        if (entries.size >= maxEntries) {
          const oldest = entries.keys().next();
          if (!oldest.done) entries.delete(oldest.value);
        }
        entries.set(key, path);
      }
      return path;
    },
    delete(key: string) { return entries.delete(key); },
    clear() { entries.clear(); },
    has(key: string) { return entries.has(key); },
    get size() { return entries.size; },
    maxEntries,
  };
}
