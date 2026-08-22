export type SpatialHashId = string | number;

export type SpatialHashEntity<TId extends SpatialHashId = SpatialHashId> = {
  id: TId;
  x: number;
  y: number;
  radius?: number;
};

export type SpatialHashOptions = {
  cellSize?: number;
};

export type SpatialHashCell = {
  x: number;
  y: number;
  key: string;
};

export type SpatialHashQuery = {
  x: number;
  y: number;
  radius: number;
};

export type SpatialHashMutation<TId extends SpatialHashId = SpatialHashId> = {
  id: TId;
  existed: boolean;
  inserted: boolean;
  removed: boolean;
  moved: boolean;
  dirty: boolean;
  cellChanged: boolean;
  cellCrossed: boolean;
  previousCell?: SpatialHashCell;
  nextCell?: SpatialHashCell;
  dirtyCells: SpatialHashCell[];
};

export type SpatialHashIndex<TEntity extends SpatialHashEntity = SpatialHashEntity> = {
  upsert(entity: TEntity): SpatialHashMutation<TEntity["id"]>;
  remove(id: TEntity["id"]): SpatialHashMutation<TEntity["id"]>;
  queryNearby(target: SpatialHashQuery, out?: TEntity[]): TEntity[];
  get(id: TEntity["id"]): TEntity | undefined;
  clear(): void;
  size(): number;
  cellOf(x: number, y: number): SpatialHashCell;
};

const DEFAULT_CELL_SIZE = 256;
const PACKED_AXIS_BITS = 26;
const PACKED_AXIS_SIZE = 2 ** PACKED_AXIS_BITS;
const PACKED_AXIS_MIN = -(2 ** (PACKED_AXIS_BITS - 1));
const PACKED_AXIS_MAX = 2 ** (PACKED_AXIS_BITS - 1) - 1;

type InternalCellKey = number | string;

function publicCellKey(x: number, y: number) {
  return `${x},${y}`;
}

function zigZagCell(value: number) {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function internalCellKey(x: number, y: number): InternalCellKey {
  if (x < PACKED_AXIS_MIN || x > PACKED_AXIS_MAX || y < PACKED_AXIS_MIN || y > PACKED_AXIS_MAX) {
    return publicCellKey(x, y);
  }
  return zigZagCell(x) * PACKED_AXIS_SIZE + zigZagCell(y);
}

export function createSpatialHash<TEntity extends SpatialHashEntity = SpatialHashEntity>(
  options: SpatialHashOptions = {}
): SpatialHashIndex<TEntity> {
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("Spatial hash cellSize must be a positive finite number");
  }

  type EntityId = TEntity["id"];

  const entities = new Map<EntityId, TEntity>();
  const entityCells = new Map<EntityId, SpatialHashCell>();
  const entityCellKeys = new Map<EntityId, InternalCellKey>();
  const entityCellIndexes = new Map<EntityId, number>();
  const cells = new Map<InternalCellKey, TEntity[]>();
  let maxEntityRadius = 0;
  let maxEntityRadiusDirty = false;

  function cellOf(x: number, y: number): SpatialHashCell {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("spatial hash position must be finite");
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);
    return { x: cellX, y: cellY, key: publicCellKey(cellX, cellY) };
  }

  function entityRadius(entity: SpatialHashEntity | undefined) {
    return entity && Number.isFinite(entity.radius) ? Math.max(0, Number(entity.radius)) : 0;
  }

  function currentMaxEntityRadius() {
    if (!maxEntityRadiusDirty) return maxEntityRadius;
    maxEntityRadius = 0;
    for (const entity of entities.values()) maxEntityRadius = Math.max(maxEntityRadius, entityRadius(entity));
    maxEntityRadiusDirty = false;
    return maxEntityRadius;
  }

  function trackRadiusChange(previousRadius: number, nextRadius: number) {
    if (nextRadius > maxEntityRadius) {
      maxEntityRadius = nextRadius;
      maxEntityRadiusDirty = false;
    } else if (previousRadius >= maxEntityRadius && nextRadius < previousRadius) {
      maxEntityRadiusDirty = true;
    }
  }

  function cloneCell(cell: SpatialHashCell): SpatialHashCell {
    return { x: cell.x, y: cell.y, key: cell.key };
  }

  function dirtyCells(previousCell: SpatialHashCell | undefined, nextCell: SpatialHashCell | undefined) {
    const dirty: SpatialHashCell[] = [];
    if (previousCell && previousCell.key !== nextCell?.key) dirty.push(cloneCell(previousCell));
    if (nextCell && previousCell?.key !== nextCell.key) dirty.push(cloneCell(nextCell));
    return dirty;
  }

  function mutation(
    id: EntityId,
    flags: {
      existed: boolean;
      inserted?: boolean;
      removed?: boolean;
      moved?: boolean;
      previousCell?: SpatialHashCell;
      nextCell?: SpatialHashCell;
    }
  ): SpatialHashMutation<EntityId> {
    const previousCell = flags.previousCell ? cloneCell(flags.previousCell) : undefined;
    const nextCell = flags.nextCell ? cloneCell(flags.nextCell) : undefined;
    const changedCells = dirtyCells(flags.previousCell, flags.nextCell);
    const cellCrossed = Boolean(flags.previousCell && flags.nextCell && flags.previousCell.key !== flags.nextCell.key);
    return {
      id,
      existed: flags.existed,
      inserted: Boolean(flags.inserted),
      removed: Boolean(flags.removed),
      moved: Boolean(flags.moved),
      dirty: changedCells.length > 0,
      cellChanged: changedCells.length > 0,
      cellCrossed,
      previousCell,
      nextCell,
      dirtyCells: changedCells
    };
  }

  function removeFromCell(id: EntityId) {
    const previousCell = entityCells.get(id);
    if (!previousCell) return;
    const previousKey = entityCellKeys.get(id) ?? previousCell.key;
    const entity = entities.get(id);
    const bucket = cells.get(previousKey);
    const index = entityCellIndexes.get(id);
    if (entity && bucket && index !== undefined && bucket[index] === entity) {
      const last = bucket.pop();
      if (last && last !== entity) {
        bucket[index] = last;
        entityCellIndexes.set(last.id as EntityId, index);
      }
    } else if (entity && bucket) {
      const fallbackIndex = bucket.indexOf(entity);
      if (fallbackIndex >= 0) {
        bucket.splice(fallbackIndex, 1);
        for (let i = fallbackIndex; i < bucket.length; i += 1) {
          entityCellIndexes.set(bucket[i].id as EntityId, i);
        }
      }
    }
    if (bucket?.length === 0) cells.delete(previousKey);
    entityCells.delete(id);
    entityCellKeys.delete(id);
    entityCellIndexes.delete(id);
  }

  function addToCell(entity: TEntity, cell: SpatialHashCell) {
    const key = internalCellKey(cell.x, cell.y);
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    entityCellIndexes.set(entity.id as EntityId, bucket.length);
    entityCells.set(entity.id as EntityId, cloneCell(cell));
    entityCellKeys.set(entity.id as EntityId, key);
    bucket.push(entity);
  }

  function isNearby(target: SpatialHashQuery, entity: TEntity, targetRadius: number) {
    const radius = targetRadius + entityRadius(entity);
    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  return {
    upsert(entity) {
      const id = entity.id as EntityId;
      if ((typeof id !== "string" && typeof id !== "number") || (typeof id === "string" && id.length === 0) || (typeof id === "number" && !Number.isFinite(id))) {
        throw new Error("spatial hash entity id must be a non-empty string or finite number");
      }
      if (entity.radius !== undefined && (!Number.isFinite(entity.radius) || entity.radius < 0)) {
        throw new RangeError("spatial hash entity radius must be non-negative and finite");
      }
      const nextCell = cellOf(entity.x, entity.y);
      const stored = entities.get(id);
      if (!stored) {
        const inserted = { ...entity } as TEntity;
        entities.set(id, inserted);
        addToCell(inserted, nextCell);
        trackRadiusChange(0, entityRadius(inserted));
        return mutation(id, { existed: false, inserted: true, nextCell });
      }

      const previousCell = entityCells.get(id);
      const previousRadius = entityRadius(stored);
      const moved = stored.x !== entity.x || stored.y !== entity.y;
      const cellChanged = previousCell?.key !== nextCell.key;
      if (cellChanged) removeFromCell(id);
      Object.assign(stored, entity);
      if (cellChanged) addToCell(stored, nextCell);
      trackRadiusChange(previousRadius, entityRadius(stored));
      return mutation(id, { existed: true, moved, previousCell, nextCell });
    },
    remove(id) {
      const entityId = id as EntityId;
      const entity = entities.get(entityId);
      if (!entity) return mutation(entityId, { existed: false });
      const previousCell = entityCells.get(entityId);
      removeFromCell(entityId);
      entities.delete(entityId);
      trackRadiusChange(entityRadius(entity), 0);
      return mutation(entityId, { existed: true, removed: true, previousCell });
    },
    queryNearby(target, out = []) {
      out.length = 0;
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.radius) || target.radius < 0) {
        throw new RangeError("spatial hash query position and non-negative radius must be finite");
      }
      const targetRadius = target.radius;
      const scanRadius = targetRadius + currentMaxEntityRadius();
      const minCellX = Math.floor((target.x - scanRadius) / cellSize);
      const maxCellX = Math.floor((target.x + scanRadius) / cellSize);
      const minCellY = Math.floor((target.y - scanRadius) / cellSize);
      const maxCellY = Math.floor((target.y + scanRadius) / cellSize);
      for (let y = minCellY; y <= maxCellY; y += 1) {
        for (let x = minCellX; x <= maxCellX; x += 1) {
          const bucket = cells.get(internalCellKey(x, y));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 1) {
            if (isNearby(target, bucket[i], targetRadius)) out.push(bucket[i]);
          }
        }
      }
      return out;
    },
    get(id) {
      return entities.get(id as EntityId);
    },
    clear() {
      entities.clear();
      entityCells.clear();
      entityCellKeys.clear();
      entityCellIndexes.clear();
      cells.clear();
      maxEntityRadius = 0;
      maxEntityRadiusDirty = false;
    },
    size() {
      return entities.size;
    },
    cellOf
  };
}
