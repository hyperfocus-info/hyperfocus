import Flatbush from "flatbush";
import { circleRectOverlap, type RectLike } from "../math/collision.ts";
import { createAabb, createCollisionBroadphase, aabbsOverlap, type CollisionAabb, type CollisionBroadphaseEntry } from "../math/broadphase.ts";
import type { TileMap } from "./tile-map.ts";
import type { TileDefinition } from "./tileset.ts";

export type TileCollisionPredicate = (tile: TileDefinition, x: number, y: number, layer: string) => boolean;

export type CollisionExtractionOptions = {
  layer?: number | string;
  tags?: readonly string[];
  predicate?: TileCollisionPredicate;
  merge?: boolean;
  instanceId?: string;
};

export type StaticRectCollisionTest = (rect: RectLike, x: number, y: number, radius: number) => boolean;
export type StaticRectCollisionIndexStrategy = "flatbush" | "tree";
export type StaticRectCollisionIndexOptions = {
  strategy?: StaticRectCollisionIndexStrategy;
};

export type StaticRectCollisionIndex = {
  rects: readonly RectLike[];
  strategy: StaticRectCollisionIndexStrategy;
  queryCircle(x: number, y: number, radius: number, out?: RectLike[]): RectLike[];
  collidesCircle(x: number, y: number, radius: number, test?: StaticRectCollisionTest): boolean;
};

function defaultCollision(tile: TileDefinition, tags: readonly string[]) {
  return tile.collision || tile.solid || tags.some((tag) => tile.tags.includes(tag));
}

function layerMatchesInstance(metadata: Record<string, unknown> | undefined, instanceId: string | undefined) {
  if (instanceId === undefined) return true;
  const layerInstanceId = metadata?.instanceId;
  return layerInstanceId === undefined || layerInstanceId === instanceId;
}

function mergeRows(rects: RectLike[]) {
  const merged: RectLike[] = [];
  let previousRow = new Map<string, RectLike>();
  let currentRow = new Map<string, RectLike>();
  let rowY = Number.NaN;
  for (const rect of rects) {
    if (rect.y !== rowY) {
      previousRow = currentRow;
      currentRow = new Map<string, RectLike>();
      rowY = rect.y;
    }
    const key = `${rect.x}:${rect.w}`;
    const existing = previousRow.get(key);
    if (existing && existing.y + existing.h === rect.y) {
      existing.h += rect.h;
      currentRow.set(key, existing);
    } else {
      const next = { ...rect };
      merged.push(next);
      currentRow.set(key, next);
    }
  }
  return merged;
}

export function extractCollisionRects(map: TileMap, options: CollisionExtractionOptions = {}) {
  const layer = map.getLayer(options.layer ?? 0);
  if (!layer || !layerMatchesInstance(layer.metadata, options.instanceId)) return [];
  const tags = options.tags ?? ["solid"];
  const rects: RectLike[] = [];

  for (let y = 0; y < layer.height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= layer.width; x += 1) {
      const tileId = x < layer.width ? layer.tiles[y * layer.width + x] : null;
      const tile = tileId === null || tileId === undefined ? undefined : map.tileset.getTile(tileId);
      const collides = tile
        ? options.predicate?.(tile, x, y, layer.id) ?? defaultCollision(tile, tags)
        : false;
      if (collides && runStart < 0) runStart = x;
      if ((!collides || x === layer.width) && runStart >= 0) {
        rects.push({
          x: runStart * map.tileWidth + layer.offsetX,
          y: y * map.tileHeight + layer.offsetY,
          w: (x - runStart) * map.tileWidth,
          h: map.tileHeight
        });
        runStart = -1;
      }
    }
  }

  return options.merge === false ? rects : mergeRows(rects);
}

function rectBounds(rect: RectLike): CollisionAabb {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.w,
    maxY: rect.y + rect.h
  };
}

function snapshotRect(rect: RectLike, index: number): RectLike {
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) {
    throw new RangeError(`Collision rectangle ${index} must contain finite values`);
  }
  if (rect.w < 0 || rect.h < 0) throw new RangeError(`Collision rectangle ${index} dimensions must be non-negative`);
  if (!Number.isFinite(rect.x + rect.w) || !Number.isFinite(rect.y + rect.h)) {
    throw new RangeError(`Collision rectangle ${index} bounds must be finite`);
  }
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}

function validateCircleQuery(x: number, y: number, radius: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("Collision query coordinates must be finite");
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError("Collision query radius must be a non-negative finite number");
}

export function createStaticRectCollisionIndex(
  rects: readonly RectLike[],
  options: StaticRectCollisionIndexOptions = {}
): StaticRectCollisionIndex {
  const strategy = options.strategy ?? "flatbush";
  if (strategy !== "flatbush" && strategy !== "tree") throw new Error(`Unknown collision index strategy: ${String(strategy)}`);
  const indexedRects = rects.map(snapshotRect);
  const defaultTest: StaticRectCollisionTest = (rect, x, y, radius) => circleRectOverlap({ x, y, r: radius }, rect);
  if (strategy === "flatbush") {
    const index = new Flatbush(indexedRects.length);
    for (let i = 0; i < indexedRects.length; i += 1) {
      const bounds = rectBounds(indexedRects[i]);
      index.add(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    }
    index.finish();
    const scratch: number[] = [];
    return {
      rects: indexedRects,
      strategy,
      queryCircle(x, y, radius, out = []) {
        validateCircleQuery(x, y, radius);
        const bounds = createAabb(x - radius, y - radius, radius * 2, radius * 2);
        scratch.length = 0;
        scratch.push(...index.search(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, (id) => aabbsOverlap(rectBounds(indexedRects[id]), bounds)));
        for (let i = 0; i < scratch.length; i += 1) {
          const rect = indexedRects[scratch[i]];
          if (rect) out.push(rect);
        }
        return out;
      },
      collidesCircle(x, y, radius, test = defaultTest) {
        validateCircleQuery(x, y, radius);
        const bounds = createAabb(x - radius, y - radius, radius * 2, radius * 2);
        scratch.length = 0;
        scratch.push(...index.search(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, (id) => aabbsOverlap(rectBounds(indexedRects[id]), bounds)));
        for (let i = 0; i < scratch.length; i += 1) {
          const rect = indexedRects[scratch[i]];
          if (rect && test(rect, x, y, radius)) return true;
        }
        return false;
      }
    };
  }

  const entries: CollisionBroadphaseEntry<number>[] = indexedRects.map((rect, index) => ({
    id: index,
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.w,
    maxY: rect.y + rect.h
  }));
  const index = createCollisionBroadphase<number>();
  index.rebuild(entries);
  const scratch: number[] = [];

  return {
    rects: indexedRects,
    strategy,
    queryCircle(x, y, radius, out = []) {
      validateCircleQuery(x, y, radius);
      scratch.length = 0;
      index.query(createAabb(x - radius, y - radius, radius * 2, radius * 2), scratch);
      for (let i = 0; i < scratch.length; i += 1) {
        const rect = indexedRects[scratch[i]];
        if (rect) out.push(rect);
      }
      return out;
    },
    collidesCircle(x, y, radius, test = defaultTest) {
      validateCircleQuery(x, y, radius);
      scratch.length = 0;
      index.query(createAabb(x - radius, y - radius, radius * 2, radius * 2), scratch);
      for (let i = 0; i < scratch.length; i += 1) {
        const rect = indexedRects[scratch[i]];
        if (rect && test(rect, x, y, radius)) return true;
      }
      return false;
    }
  };
}
