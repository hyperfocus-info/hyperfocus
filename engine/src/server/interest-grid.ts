export type InterestGridOptions = {
  cellSize?: number;
  maxEntitiesPerClient?: number;
  maxEntitiesPerClientByType?: Record<string, number>;
  hysteresisCells?: number;
};

export type InterestEntity = {
  id: string;
  type?: string;
  x: number;
  y: number;
  radius?: number;
  priority?: number;
  global?: boolean;
};

export type InterestTarget = {
  x: number;
  y: number;
  radius: number;
};

export type VisibilityResult = {
  visible: string[];
  entered: string[];
  left: string[];
  overflow: number;
};

export type InterestIndex = {
  upsert(entity: InterestEntity): void;
  remove(id: string): boolean;
  query(target: InterestTarget): string[];
  computeVisibility(clientId: string, target: InterestTarget): VisibilityResult;
  clearClient(clientId: string): void;
  size(): number;
};

const PACKED_AXIS_BITS = 26;
const PACKED_AXIS_SIZE = 2 ** PACKED_AXIS_BITS;
const PACKED_AXIS_MIN = -(2 ** (PACKED_AXIS_BITS - 1));
const PACKED_AXIS_MAX = 2 ** (PACKED_AXIS_BITS - 1) - 1;

type InternalCellKey = number | string;

function zigZagCell(value: number) {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function packCell(x: number, y: number): InternalCellKey {
  if (x < PACKED_AXIS_MIN || x > PACKED_AXIS_MAX || y < PACKED_AXIS_MIN || y > PACKED_AXIS_MAX) return `${x},${y}`;
  return zigZagCell(x) * PACKED_AXIS_SIZE + zigZagCell(y);
}

function cellKey(x: number, y: number, cellSize: number) {
  return packCell(Math.floor(x / cellSize), Math.floor(y / cellSize));
}

function distanceSquared(a: InterestTarget, b: InterestEntity) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function assignEntity(target: InterestEntity, source: InterestEntity) {
  target.id = source.id;
  target.type = source.type;
  target.x = source.x;
  target.y = source.y;
  target.radius = source.radius;
  target.priority = source.priority;
  target.global = source.global;
}

function comparePriority(a: InterestEntity, b: InterestEntity) {
  const priority = (b.priority ?? 0) - (a.priority ?? 0);
  if (priority !== 0) return priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function betterThan(a: InterestEntity, b: InterestEntity) {
  return comparePriority(a, b) < 0;
}

function worseThan(a: InterestEntity, b: InterestEntity) {
  return comparePriority(a, b) > 0;
}

function siftWorstDown(heap: InterestEntity[], index: number) {
  for (;;) {
    const left = index * 2 + 1;
    const right = left + 1;
    let worst = index;
    if (left < heap.length && worseThan(heap[left], heap[worst])) worst = left;
    if (right < heap.length && worseThan(heap[right], heap[worst])) worst = right;
    if (worst === index) return;
    const swap = heap[index];
    heap[index] = heap[worst];
    heap[worst] = swap;
    index = worst;
  }
}

function heapifyWorst(heap: InterestEntity[]) {
  for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i -= 1) siftWorstDown(heap, i);
}

function pushTopCandidate(heap: InterestEntity[], entity: InterestEntity, limit: number) {
  if (limit <= 0) return;
  if (heap.length < limit) {
    heap.push(entity);
    return;
  }
  if (!betterThan(entity, heap[0])) return;
  heap[0] = entity;
  siftWorstDown(heap, 0);
}

function selectTopCandidatesHeap(candidates: readonly InterestEntity[], limit: number): InterestEntity[] {
  if (limit <= 0) return [];
  if (candidates.length <= limit) return candidates.slice();
  const heap = candidates.slice(0, limit);
  heapifyWorst(heap);
  for (let i = limit; i < candidates.length; i += 1) pushTopCandidate(heap, candidates[i], limit);
  heap.sort(comparePriority);
  return heap;
}

function priorityBucket(entity: InterestEntity) {
  const priority = entity.priority ?? 0;
  return Number.isInteger(priority) && priority >= 0 && priority < 64 ? priority : -1;
}

function selectTopCandidatesByType(candidates: readonly InterestEntity[], limit: number, maxByType: Readonly<Record<string, number>>): InterestEntity[] {
  if (limit <= 0) return [];
  const uncapped: InterestEntity[] = [];
  const capped = new Map<string, InterestEntity[]>();
  for (const entity of candidates) {
    const type = entity.type ?? "";
    const typeLimit = type && Object.prototype.hasOwnProperty.call(maxByType, type) ? maxByType[type] : undefined;
    if (typeLimit === undefined) {
      uncapped.push(entity);
      continue;
    }
    if (typeLimit <= 0) continue;
    const bucket = capped.get(type) ?? [];
    bucket.push(entity);
    capped.set(type, bucket);
  }
  for (const [type, bucket] of capped) {
    uncapped.push(...selectTopCandidatesHeap(bucket, Math.min(limit, maxByType[type] ?? limit)));
  }
  const selected: InterestEntity[] = selectTopCandidates(uncapped, limit);
  selected.sort(comparePriority);
  return selected;
}

function hasTypeLimits(maxByType: Readonly<Record<string, number>>) {
  return Object.keys(maxByType).length > 0;
}

function selectTopCandidates(candidates: readonly InterestEntity[], limit: number, maxByType: Readonly<Record<string, number>> = {}): InterestEntity[] {
  if (limit <= 0) return [];
  if (hasTypeLimits(maxByType)) return selectTopCandidatesByType(candidates, limit, maxByType);
  if (candidates.length <= limit) return candidates.slice();
  const buckets: InterestEntity[][] = Array.from({ length: 64 }, () => []);
  for (const entity of candidates) {
    const bucket = priorityBucket(entity);
    if (bucket < 0) return selectTopCandidatesHeap(candidates, limit);
    buckets[bucket].push(entity);
  }
  const selected: InterestEntity[] = [];
  for (let priority = buckets.length - 1; priority >= 0; priority -= 1) {
    const bucket = buckets[priority];
    if (!bucket.length) continue;
    bucket.sort(comparePriority);
    const remaining = limit - selected.length;
    selected.push(...(bucket.length > remaining ? bucket.slice(0, remaining) : bucket));
    if (selected.length >= limit) return selected;
  }
  return selected;
}

export function createInterestGrid(options: InterestGridOptions = {}): InterestIndex {
  const cellSize = options.cellSize ?? 256;
  const maxEntitiesPerClient = options.maxEntitiesPerClient ?? 512;
  const maxEntitiesPerClientByType = options.maxEntitiesPerClientByType ?? {};
  const hysteresisCells = options.hysteresisCells ?? 1;
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("interest grid cellSize must be a positive finite number");
  if (!Number.isSafeInteger(maxEntitiesPerClient) || maxEntitiesPerClient < 0) throw new RangeError("interest grid maxEntitiesPerClient must be a non-negative safe integer");
  if (!Number.isFinite(hysteresisCells) || hysteresisCells < 0) throw new RangeError("interest grid hysteresisCells must be a non-negative finite number");
  if (typeof maxEntitiesPerClientByType !== "object" || maxEntitiesPerClientByType === null || Array.isArray(maxEntitiesPerClientByType)) {
    throw new TypeError("interest grid maxEntitiesPerClientByType must be an object");
  }
  for (const [type, limit] of Object.entries(maxEntitiesPerClientByType)) {
    if (!type) throw new Error("interest grid entity type limits require non-empty type names");
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError(`interest grid limit for ${type} must be a non-negative safe integer`);
  }
  const entities = new Map<string, InterestEntity>();
  const entityCells = new Map<string, InternalCellKey>();
  const entityCellIndexes = new Map<string, number>();
  const cells = new Map<InternalCellKey, InterestEntity[]>();
  const globalEntities = new Set<InterestEntity>();
  const clientVisible = new Map<string, Set<string>>();
  const candidates: InterestEntity[] = [];
  const visibleCandidates: InterestEntity[] = [];
  const enteredScratch: string[] = [];
  const leftScratch: string[] = [];
  let maxEntityRadius = 0;
  let maxEntityRadiusDirty = false;

  function entityRadius(entity: InterestEntity | undefined) {
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

  function removeFromCell(id: string) {
    const previousCell = entityCells.get(id);
    const entity = entities.get(id);
    if (previousCell === undefined) return;
    const bucket = cells.get(previousCell);
    const index = entityCellIndexes.get(id);
    if (entity && bucket && index !== undefined && bucket[index] === entity) {
      const last = bucket.pop();
      if (last && last !== entity) {
        bucket[index] = last;
        entityCellIndexes.set(last.id, index);
      }
    } else if (entity && bucket) {
      const fallbackIndex = bucket.indexOf(entity);
      if (fallbackIndex >= 0) bucket.splice(fallbackIndex, 1);
    }
    entityCells.delete(id);
    entityCellIndexes.delete(id);
  }

  function addCandidate(entity: InterestEntity, target: InterestTarget) {
    const radius = target.radius + entityRadius(entity);
    if (!entity.global && distanceSquared(target, entity) > radius * radius) return;
    candidates.push(entity);
  }

  function queryWithRadius(target: InterestTarget, radius: number) {
    const scanRadius = radius + currentMaxEntityRadius();
    const minCellX = Math.floor((target.x - scanRadius) / cellSize);
    const maxCellX = Math.floor((target.x + scanRadius) / cellSize);
    const minCellY = Math.floor((target.y - scanRadius) / cellSize);
    const maxCellY = Math.floor((target.y + scanRadius) / cellSize);
    candidates.length = 0;
    for (const entity of globalEntities) addCandidate(entity, target);
    for (let y = minCellY; y <= maxCellY; y += 1) {
      for (let x = minCellX; x <= maxCellX; x += 1) {
        const bucket = cells.get(packCell(x, y));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i += 1) addCandidate(bucket[i], target);
      }
    }
    return candidates;
  }

  function visibleTopCandidates(target: InterestTarget, previous: Set<string>, source: readonly InterestEntity[], expandedRadius: number) {
    visibleCandidates.length = 0;
    for (const entity of source) {
      if (!entity.global) {
        const entityDistanceSq = distanceSquared(target, entity);
        const entityRadiusValue = entityRadius(entity);
        const targetLimit = target.radius + entityRadiusValue;
        const expandedLimit = expandedRadius + entityRadiusValue;
        if (entityDistanceSq > targetLimit * targetLimit && (entityDistanceSq > expandedLimit * expandedLimit || !previous.has(entity.id))) continue;
      }
      visibleCandidates.push(entity);
    }
    const selected = selectTopCandidates(visibleCandidates, maxEntitiesPerClient, maxEntitiesPerClientByType);
    return { selected, overflow: Math.max(0, visibleCandidates.length - selected.length) };
  }

  return {
    upsert(entity) {
      if (typeof entity.id !== "string" || entity.id.length === 0) throw new Error("interest entity id is required");
      if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) throw new RangeError(`interest entity ${entity.id} position must be finite`);
      if (entity.radius !== undefined && (!Number.isFinite(entity.radius) || entity.radius < 0)) throw new RangeError(`interest entity ${entity.id} radius must be non-negative and finite`);
      if (entity.priority !== undefined && !Number.isFinite(entity.priority)) throw new RangeError(`interest entity ${entity.id} priority must be finite`);
      const nextCell = cellKey(entity.x, entity.y, cellSize);
      let stored = entities.get(entity.id);
      const previousRadius = entityRadius(stored);
      const previousCell = entityCells.get(entity.id);
      const wasGlobal = stored ? globalEntities.has(stored) : false;
      if ((wasGlobal && entity.global) || (previousCell === nextCell && wasGlobal === Boolean(entity.global))) {
        if (stored) {
          assignEntity(stored, entity);
          trackRadiusChange(previousRadius, entityRadius(stored));
        } else {
          stored = { ...entity };
          entities.set(entity.id, stored);
          trackRadiusChange(0, entityRadius(stored));
        }
        return;
      }
      removeFromCell(entity.id);
      if (stored) globalEntities.delete(stored);
      if (!stored) {
        stored = { ...entity };
        entities.set(entity.id, stored);
      } else {
        assignEntity(stored, entity);
      }
      trackRadiusChange(previousRadius, entityRadius(stored));
      if (stored.global) {
        globalEntities.add(stored);
        return;
      }
      let bucket = cells.get(nextCell);
      if (!bucket) {
        bucket = [];
        cells.set(nextCell, bucket);
      }
      entityCellIndexes.set(entity.id, bucket.length);
      bucket.push(stored);
      entityCells.set(entity.id, nextCell);
    },
    remove(id) {
      const entity = entities.get(id);
      removeFromCell(id);
      const existed = entities.delete(id);
      if (entity) globalEntities.delete(entity);
      if (entity) trackRadiusChange(entityRadius(entity), 0);
      return existed;
    },
    query(target) {
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.radius) || target.radius < 0) {
        throw new RangeError("interest target position and non-negative radius must be finite");
      }
      return selectTopCandidates(queryWithRadius(target, target.radius), maxEntitiesPerClient, maxEntitiesPerClientByType).map((entity) => entity.id);
    },
    computeVisibility(clientId, target) {
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.radius) || target.radius < 0) {
        throw new RangeError("interest target position and non-negative radius must be finite");
      }
      const previous = clientVisible.get(clientId) ?? new Set<string>();
      const expandedRadius = target.radius + hysteresisCells * cellSize;
      const candidates = queryWithRadius(target, expandedRadius);
      const { selected, overflow } = visibleTopCandidates(target, previous, candidates, expandedRadius);
      enteredScratch.length = 0;
      leftScratch.length = 0;
      const visible = selected.map((entity) => entity.id);
      const visibleSet = new Set(visible);
      for (const id of visible) {
        if (!previous.has(id)) enteredScratch.push(id);
      }
      for (const id of previous) {
        if (!visibleSet.has(id)) leftScratch.push(id);
      }
      clientVisible.set(clientId, visibleSet);
      return { visible, entered: [...enteredScratch], left: [...leftScratch], overflow };
    },
    clearClient(clientId) {
      clientVisible.delete(clientId);
    },
    size() {
      return entities.size;
    }
  };
}
