export type FixedGridSpatialItem = {
  x: number;
  y: number;
  radius?: number;
};

export type FixedGridSpatialQuery = {
  x: number;
  y: number;
  radius: number;
};

export type FixedGridSpatialIndexOptions = {
  cellSize: number;
  worldSize?: number;
  originX?: number;
  originY?: number;
  /** Retain empty bucket arrays across rebuilds. Defaults on for finite wrapped worlds and off otherwise. */
  retainBuckets?: boolean;
};

export type FixedGridSpatialDiagnostics = {
  bucketArrayAllocations: number;
  retainedBuckets: number;
  activeBuckets: number;
};

export type FixedGridSpatialIndex<TEntity extends FixedGridSpatialItem = FixedGridSpatialItem> = {
  add(entity: TEntity): void;
  rebuild(items: Iterable<TEntity>): void;
  clear(): void;
  queryCircle(query: FixedGridSpatialQuery, out?: TEntity[]): TEntity[];
  size(): number;
  diagnostics(): FixedGridSpatialDiagnostics;
};

type CellKey = number | string;

const PACKED_AXIS_BITS = 26;
const PACKED_AXIS_SIZE = 2 ** PACKED_AXIS_BITS;
const PACKED_AXIS_MIN = -(2 ** (PACKED_AXIS_BITS - 1));
const PACKED_AXIS_MAX = 2 ** (PACKED_AXIS_BITS - 1) - 1;

function zigZag(value: number) {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function cellKey(x: number, y: number): CellKey {
  if (x < PACKED_AXIS_MIN || x > PACKED_AXIS_MAX || y < PACKED_AXIS_MIN || y > PACKED_AXIS_MAX) return `${x},${y}`;
  return zigZag(x) * PACKED_AXIS_SIZE + zigZag(y);
}

function wrapValue(value: number, min: number, size: number) {
  const valueRemainder = ((value % size) + size) % size;
  const minRemainder = ((min % size) + size) % size;
  return (((valueRemainder - minRemainder) % size) + size) % size + min;
}

function wrappedDelta(a: number, b: number, size: number) {
  const wrappedA = ((a % size) + size) % size;
  const wrappedB = ((b % size) + size) % size;
  let delta = wrappedB - wrappedA;
  if (delta > size / 2) delta -= size;
  else if (delta < -size / 2) delta += size;
  return delta;
}

export function createFixedGridSpatialIndex<TEntity extends FixedGridSpatialItem = FixedGridSpatialItem>(
  options: FixedGridSpatialIndexOptions
): FixedGridSpatialIndex<TEntity> {
  const cellSize = options.cellSize;
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("Fixed grid cellSize must be a positive finite number");
  const worldSize = options.worldSize;
  if (worldSize !== undefined && (!Number.isFinite(worldSize) || worldSize <= 0)) {
    throw new Error("Fixed grid worldSize must be a positive finite number");
  }
  const originX = options.originX ?? (worldSize === undefined ? 0 : -worldSize / 2);
  const originY = options.originY ?? (worldSize === undefined ? 0 : -worldSize / 2);
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) throw new Error("Fixed grid origins must be finite numbers");
  if (worldSize !== undefined && (!Number.isFinite(originX + worldSize) || !Number.isFinite(originY + worldSize))) {
    throw new RangeError("Fixed grid wrapped world bounds must be finite");
  }
  const cellCount = worldSize === undefined ? 0 : Math.max(1, Math.ceil(worldSize / cellSize));
  if (worldSize !== undefined && !Number.isSafeInteger(cellCount)) {
    throw new RangeError("Fixed grid worldSize/cellSize produces too many cells");
  }
  const items: TEntity[] = [];
  const cells = new Map<CellKey, TEntity[]>();
  const activeBuckets: TEntity[][] = [];
  const retainBuckets = options.retainBuckets ?? worldSize !== undefined;
  let bucketArrayAllocations = 0;
  let maxRadius = 0;

  function radiusOf(entity: TEntity) {
    return Number.isFinite(entity.radius) ? Math.max(0, Number(entity.radius)) : 0;
  }

  function validateEntity(entity: TEntity) {
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
      throw new RangeError("Fixed grid entity coordinates must be finite");
    }
    if (entity.radius !== undefined && (!Number.isFinite(entity.radius) || entity.radius < 0)) {
      throw new RangeError("Fixed grid entity radius must be a non-negative finite number");
    }
  }

  function normalizeCellX(x: number) {
    return worldSize === undefined ? x : ((x % cellCount) + cellCount) % cellCount;
  }

  function normalizeCellY(y: number) {
    return worldSize === undefined ? y : ((y % cellCount) + cellCount) % cellCount;
  }

  function cellOfX(value: number) {
    const x = worldSize === undefined ? value : wrapValue(value, originX, worldSize);
    const cell = Math.floor((x - originX) / cellSize);
    if (!Number.isSafeInteger(cell)) throw new RangeError("Fixed grid x coordinate exceeds the supported cell range");
    return cell;
  }

  function cellOfY(value: number) {
    const y = worldSize === undefined ? value : wrapValue(value, originY, worldSize);
    const cell = Math.floor((y - originY) / cellSize);
    if (!Number.isSafeInteger(cell)) throw new RangeError("Fixed grid y coordinate exceeds the supported cell range");
    return cell;
  }

  function keyFor(x: number, y: number) {
    return cellKey(normalizeCellX(x), normalizeCellY(y));
  }

  function add(entity: TEntity) {
    validateEntity(entity);
    const x = cellOfX(entity.x);
    const y = cellOfY(entity.y);
    const key = keyFor(x, y);
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
      bucketArrayAllocations += 1;
    }
    if (bucket.length === 0) activeBuckets.push(bucket);
    bucket.push(entity);
    items.push(entity);
    maxRadius = Math.max(maxRadius, radiusOf(entity));
  }

  function distanceSq(query: FixedGridSpatialQuery, entity: TEntity) {
    const dx = worldSize === undefined ? entity.x - query.x : wrappedDelta(query.x, entity.x, worldSize);
    const dy = worldSize === undefined ? entity.y - query.y : wrappedDelta(query.y, entity.y, worldSize);
    return dx * dx + dy * dy;
  }

  function appendHits(query: FixedGridSpatialQuery, queryRadius: number, candidates: Iterable<TEntity>, out: TEntity[], seen?: Set<TEntity>) {
    for (const item of candidates) {
      if (seen?.has(item)) continue;
      seen?.add(item);
      const radius = queryRadius + radiusOf(item);
      if (distanceSq(query, item) <= radius * radius) out.push(item);
    }
  }

  return {
    add,
    rebuild(nextItems) {
      const validated = Array.isArray(nextItems) ? nextItems : [...nextItems];
      for (const item of validated) {
        validateEntity(item);
        cellOfX(item.x);
        cellOfY(item.y);
      }
      this.clear();
      for (const item of validated) add(item);
    },
    clear() {
      items.length = 0;
      if (retainBuckets) {
        for (const bucket of activeBuckets) bucket.length = 0;
      } else {
        cells.clear();
      }
      activeBuckets.length = 0;
      maxRadius = 0;
    },
    queryCircle(query, out = []) {
      if (!Number.isFinite(query.x) || !Number.isFinite(query.y)) {
        throw new RangeError("Fixed grid query coordinates must be finite");
      }
      if (!Number.isFinite(query.radius) || query.radius < 0) {
        throw new RangeError("Fixed grid query radius must be a non-negative finite number");
      }
      out.length = 0;
      const queryRadius = query.radius;
      const scanRadius = queryRadius + maxRadius;
      const rangeCells = Math.ceil(scanRadius / cellSize);
      const span = rangeCells * 2 + 1;
      const estimatedCellVisits = span * span;
      if (!Number.isSafeInteger(rangeCells) || !Number.isSafeInteger(estimatedCellVisits)
        || estimatedCellVisits > Math.max(64, activeBuckets.length * 4)) {
        appendHits(query, queryRadius, items, out);
        return out;
      }
      const startX = worldSize === undefined ? cellOfX(query.x - scanRadius) : cellOfX(query.x) - Math.min(rangeCells, cellCount - 1);
      const startY = worldSize === undefined ? cellOfY(query.y - scanRadius) : cellOfY(query.y) - Math.min(rangeCells, cellCount - 1);
      const endX = worldSize === undefined ? cellOfX(query.x + scanRadius) : cellOfX(query.x) + Math.min(rangeCells, cellCount - 1);
      const endY = worldSize === undefined ? cellOfY(query.y + scanRadius) : cellOfY(query.y) + Math.min(rangeCells, cellCount - 1);
      const mayRepeatCells = worldSize !== undefined && (endX - startX + 1 > cellCount || endY - startY + 1 > cellCount);
      const seen = mayRepeatCells ? new Set<TEntity>() : undefined;
      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          const bucket = cells.get(keyFor(x, y));
          if (!bucket) continue;
          appendHits(query, queryRadius, bucket, out, seen);
        }
      }
      return out;
    },
    size() {
      return items.length;
    },
    diagnostics() {
      return {
        bucketArrayAllocations,
        retainedBuckets: cells.size,
        activeBuckets: activeBuckets.length
      };
    }
  };
}
