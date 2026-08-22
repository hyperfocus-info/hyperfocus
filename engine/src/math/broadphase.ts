export type CollisionBroadphaseId = string | number;

export type CollisionAabb = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type CollisionBroadphaseEntry<TId extends CollisionBroadphaseId = CollisionBroadphaseId> = CollisionAabb & {
  id: TId;
};

export type CollisionBroadphasePair<TId extends CollisionBroadphaseId = CollisionBroadphaseId> = {
  a: TId;
  b: TId;
};

export type CollisionBroadphasePairVisitor<TId extends CollisionBroadphaseId = CollisionBroadphaseId> = (a: TId, b: TId) => void;

export type CollisionBroadphaseStrategy = "auto" | "packed" | "linear";

export type CollisionBroadphaseOptions = {
  maxEntries?: number;
  /** Packed indexes favor mostly-static scenes; linear avoids rebuild churn in fully dynamic scenes. */
  strategy?: CollisionBroadphaseStrategy;
  /** In auto mode, use linear queries at or below this entry count. */
  linearScanThreshold?: number;
  /** In auto mode, the updated-entry ratio that activates a short linear-query window. */
  dynamicUpdateRatio?: number;
};

type BoundsNode<TId extends CollisionBroadphaseId> = CollisionAabb & {
  leaf: boolean;
  children: BoundsNode<TId>[];
  parent?: BoundsNode<TId>;
  id?: TId;
  order?: number;
};

const DEFAULT_MAX_ENTRIES = 12;
const DEFAULT_LINEAR_SCAN_THRESHOLD = 32;
const DEFAULT_DYNAMIC_UPDATE_RATIO = 0.5;
const AUTO_LINEAR_QUERY_WINDOW = 8;

function validateId(id: CollisionBroadphaseId) {
  if (typeof id === "number" && !Number.isFinite(id)) throw new RangeError("Collision broadphase numeric ids must be finite");
}

export function createAabb(x: number, y: number, w: number, h: number): CollisionAabb {
  for (const [value, label] of [[x, "x"], [y, "y"], [w, "width"], [h, "height"]] as const) {
    if (!Number.isFinite(value)) throw new RangeError(`AABB ${label} must be finite`);
  }
  if (!Number.isFinite(x + w) || !Number.isFinite(y + h)) throw new RangeError("AABB bounds must be finite");
  return normalizeAabb({
    minX: x,
    minY: y,
    maxX: x + w,
    maxY: y + h
  });
}

export function aabbsOverlap(a: CollisionAabb, b: CollisionAabb) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function normalizeAabb(bounds: CollisionAabb): CollisionAabb {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
    throw new RangeError("AABB bounds must be finite");
  }
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    minY: Math.min(bounds.minY, bounds.maxY),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxY: Math.max(bounds.minY, bounds.maxY)
  };
}

export function createCollisionBroadphase<TId extends CollisionBroadphaseId = CollisionBroadphaseId>(
  options: CollisionBroadphaseOptions = {}
) {
  const requestedMaxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (!Number.isSafeInteger(requestedMaxEntries) || requestedMaxEntries <= 0) {
    throw new RangeError("Collision broadphase maxEntries must be a positive safe integer");
  }
  const maxEntries = Math.max(4, requestedMaxEntries);
  const strategy = options.strategy ?? "auto";
  if (strategy !== "auto" && strategy !== "packed" && strategy !== "linear") {
    throw new RangeError(`Collision broadphase strategy is invalid: ${String(strategy)}`);
  }
  const linearScanThreshold = options.linearScanThreshold ?? DEFAULT_LINEAR_SCAN_THRESHOLD;
  if (!Number.isSafeInteger(linearScanThreshold) || linearScanThreshold < 0) {
    throw new RangeError("Collision broadphase linearScanThreshold must be a non-negative safe integer");
  }
  const dynamicUpdateRatio = options.dynamicUpdateRatio ?? DEFAULT_DYNAMIC_UPDATE_RATIO;
  if (!Number.isFinite(dynamicUpdateRatio) || dynamicUpdateRatio < 0 || dynamicUpdateRatio > 1) {
    throw new RangeError("Collision broadphase dynamicUpdateRatio must be between 0 and 1");
  }
  const entries = new Map<TId, BoundsNode<TId>>();
  let root = emptyBranch<TId>();
  let rootValid = true;
  let packedIndex: Flatbush | undefined;
  let packedEntries: BoundsNode<TId>[] = [];
  let nextOrder = 1;
  let sweepEntries: BoundsNode<TId>[] = [];
  let sweepEntriesDirty = false;
  let pendingMutations = 0;
  let autoLinearQueriesRemaining = 0;
  let lastQueryStrategy: Exclude<CollisionBroadphaseStrategy, "auto"> = "linear";

  function rebuild(items: Iterable<CollisionBroadphaseEntry<TId>>) {
    const source = Array.isArray(items) ? items : [...items];
    for (const item of source) {
      validateId(item.id);
      validateAabb(item);
    }
    const nextEntries = new Map<TId, BoundsNode<TId>>();
    let order = 1;
    for (const item of source) {
      const entry = entries.get(item.id) ?? emptyLeaf<TId>();
      entry.minX = Math.min(item.minX, item.maxX);
      entry.minY = Math.min(item.minY, item.maxY);
      entry.maxX = Math.max(item.minX, item.maxX);
      entry.maxY = Math.max(item.minY, item.maxY);
      entry.id = item.id;
      entry.order = order;
      entry.parent = undefined;
      order += 1;
      nextEntries.set(item.id, entry);
    }
    entries.clear();
    for (const [id, entry] of nextEntries) entries.set(id, entry);
    nextOrder = order;
    sweepEntries = [...entries.values()].sort(compareSweepEntries);
    sweepEntriesDirty = false;
    root = emptyBranch<TId>();
    rootValid = false;
    packedIndex = undefined;
    packedEntries.length = 0;
    pendingMutations = 0;
    autoLinearQueriesRemaining = 0;
  }

  function upsert(id: TId, bounds: CollisionAabb) {
    validateId(id);
    const normalized = normalizeAabb(bounds);
    const existing = entries.get(id);
    if (existing) {
      existing.minX = normalized.minX;
      existing.minY = normalized.minY;
      existing.maxX = normalized.maxX;
      existing.maxY = normalized.maxY;
      packedIndex = undefined;
      packedEntries.length = 0;
      if (rootValid) recalculateAncestors(existing.parent);
      sweepEntriesDirty = true;
      pendingMutations += 1;
      return existing;
    }
    const entry: BoundsNode<TId> = {
      ...normalized,
      id,
      order: nextOrder,
      leaf: true,
      children: []
    };
    nextOrder += 1;
    entries.set(id, entry);
    packedIndex = undefined;
    packedEntries.length = 0;
    if (rootValid) insert(entry);
    sweepEntriesDirty = true;
    pendingMutations += 1;
    return entry;
  }

  function remove(id: TId) {
    if (!entries.has(id)) return false;
    entries.delete(id);
    packedIndex = undefined;
    packedEntries.length = 0;
    if (rootValid) root = buildPackedTree([...entries.values()], maxEntries);
    sweepEntriesDirty = true;
    pendingMutations += 1;
    return true;
  }

  function clear() {
    entries.clear();
    root = emptyBranch<TId>();
    rootValid = true;
    packedIndex = undefined;
    packedEntries.length = 0;
    sweepEntries.length = 0;
    sweepEntriesDirty = false;
    nextOrder = 1;
    pendingMutations = 0;
    autoLinearQueriesRemaining = 0;
  }

  function selectQueryStrategy() {
    if (strategy !== "auto") return strategy;
    if (entries.size <= linearScanThreshold) return "linear";
    const dynamicThreshold = Math.max(1, Math.ceil(entries.size * dynamicUpdateRatio));
    if (pendingMutations >= dynamicThreshold) autoLinearQueriesRemaining = AUTO_LINEAR_QUERY_WINDOW;
    if (autoLinearQueriesRemaining > 0) {
      autoLinearQueriesRemaining -= 1;
      pendingMutations = 0;
      return "linear";
    }
    return "packed";
  }

  function visitLinear(bounds: CollisionAabb, visit: (entry: BoundsNode<TId>) => boolean | void) {
    for (const entry of entries.values()) {
      if (aabbsOverlap(entry, bounds) && visit(entry) === false) return;
    }
  }

  function query(bounds: CollisionAabb, out: TId[] = []) {
    const normalized = normalizeAabb(bounds);
    if (entries.size === 0) return out;
    lastQueryStrategy = selectQueryStrategy();
    if (lastQueryStrategy === "linear") {
      visitLinear(normalized, (entry) => {
        out.push(entry.id as TId);
      });
      return out;
    }
    const index = ensurePackedIndex();
    const hits = index.search(
      normalized.minX,
      normalized.minY,
      normalized.maxX,
      normalized.maxY,
      (index) => aabbsOverlap(packedEntries[index], normalized)
    );
    for (let i = 0; i < hits.length; i += 1) out.push(packedEntries[hits[i]].id as TId);
    return out;
  }

  function queryEntries(bounds: CollisionAabb, out: CollisionBroadphaseEntry<TId>[] = []) {
    const ids = query(bounds);
    for (let i = 0; i < ids.length; i += 1) {
      const entry = entries.get(ids[i]);
      if (!entry) continue;
      out.push({ id: ids[i], minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY });
    }
    return out;
  }

  function collides(bounds: CollisionAabb) {
    const normalized = normalizeAabb(bounds);
    if (entries.size === 0) return false;
    lastQueryStrategy = selectQueryStrategy();
    if (lastQueryStrategy === "linear") {
      let hit = false;
      visitLinear(normalized, () => {
        hit = true;
        return false;
      });
      return hit;
    }
    const index = ensurePackedIndex();
    return index.search(
      normalized.minX,
      normalized.minY,
      normalized.maxX,
      normalized.maxY,
      (entryIndex) => aabbsOverlap(packedEntries[entryIndex], normalized)
    ).length > 0;
  }

  function ensurePackedIndex() {
    if (packedIndex) return packedIndex;
    packedEntries = [...entries.values()];
    const index = new Flatbush(packedEntries.length);
    for (const entry of packedEntries) index.add(entry.minX, entry.minY, entry.maxX, entry.maxY);
    index.finish();
    packedIndex = index;
    pendingMutations = 0;
    return index;
  }

  function pairs(out: CollisionBroadphasePair<TId>[] = []) {
    const outputStart = out.length;
    visitSweepPairs((left, right) => {
      out.push({ a: left, b: right });
    });
    // Preserve the API's insertion-order pair traversal while using a cache-friendly
    // sweep for candidate generation.
    if (out.length - outputStart > 1) {
      const ordered = out.splice(outputStart).sort((left, right) => {
        const leftA = entries.get(left.a)?.order ?? 0;
        const rightA = entries.get(right.a)?.order ?? 0;
        return leftA - rightA || (entries.get(left.b)?.order ?? 0) - (entries.get(right.b)?.order ?? 0);
      });
      out.push(...ordered);
    }
    return out;
  }

  function visitSweepPairs(visit: CollisionBroadphasePairVisitor<TId>) {
    if (sweepEntriesDirty) {
      sweepEntries = [...entries.values()].sort(compareSweepEntries);
      sweepEntriesDirty = false;
    }
    let count = 0;
    for (let i = 0; i < sweepEntries.length; i += 1) {
      const left = sweepEntries[i];
      for (let j = i + 1; j < sweepEntries.length; j += 1) {
        const right = sweepEntries[j];
        if (right.minX >= left.maxX) break;
        if (left.minY >= right.maxY || left.maxY <= right.minY) continue;
        const leftOrder = left.order ?? 0;
        const rightOrder = right.order ?? 0;
        if (leftOrder <= rightOrder) visit(left.id as TId, right.id as TId);
        else visit(right.id as TId, left.id as TId);
        count += 1;
      }
    }
    return count;
  }

  function insert(entry: BoundsNode<TId>) {
    const split = insertInto(root, entry);
    if (!split) return;
    root = branchFromChildren([root, split]);
  }

  function insertInto(node: BoundsNode<TId>, entry: BoundsNode<TId>): BoundsNode<TId> | undefined {
    if (node.leaf) {
      throw new Error("Cannot insert into a leaf entry");
    }

    if (node.children.length === 0 || node.children[0].leaf) {
      node.children.push(entry);
      entry.parent = node;
    } else {
      const child = chooseSubtree(node.children, entry);
      const split = insertInto(child, entry);
      if (split) {
        node.children.push(split);
        split.parent = node;
      }
    }

    recalculateBounds(node);
    if (node.children.length <= maxEntries) return undefined;
    return splitNode(node);
  }

  function splitNode(node: BoundsNode<TId>) {
    const axis = boundsWidth(node) >= boundsHeight(node) ? "x" : "y";
    node.children.sort((a, b) => (axis === "x" ? a.minX - b.minX : a.minY - b.minY));
    const half = Math.ceil(node.children.length / 2);
    const siblingChildren = node.children.splice(half);
    recalculateBounds(node);
    return branchFromChildren(siblingChildren);
  }

  function queryNode(node: BoundsNode<TId>, bounds: CollisionAabb, out: TId[]) {
    if (!aabbsOverlap(node, bounds)) return;
    if (node.leaf) {
      out.push(node.id as TId);
      return;
    }
    for (let i = 0; i < node.children.length; i += 1) {
      queryNode(node.children[i], bounds, out);
    }
  }

  function hasOverlap(node: BoundsNode<TId>, bounds: CollisionAabb): boolean {
    if (!aabbsOverlap(node, bounds)) return false;
    if (node.leaf) return true;
    for (let i = 0; i < node.children.length; i += 1) {
      if (hasOverlap(node.children[i], bounds)) return true;
    }
    return false;
  }

  return {
    upsert,
    remove,
    clear,
    rebuild,
    query,
    queryEntries,
    collides,
    pairs,
    forEachPair: visitSweepPairs,
    count() {
      return entries.size;
    },
    queryStrategy() {
      return lastQueryStrategy;
    },
    boundsOf(id: TId) {
      const entry = entries.get(id);
      if (!entry) return undefined;
      return { minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY };
    }
  };
}

function validateAabb(bounds: CollisionAabb) {
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) {
    throw new RangeError("AABB bounds must be finite");
  }
}

function emptyLeaf<TId extends CollisionBroadphaseId>(): BoundsNode<TId> {
  return {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    leaf: true,
    children: []
  };
}

function emptyBranch<TId extends CollisionBroadphaseId>(): BoundsNode<TId> {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    leaf: false,
    children: []
  };
}

function branchFromChildren<TId extends CollisionBroadphaseId>(children: BoundsNode<TId>[]) {
  const node = emptyBranch<TId>();
  node.children = children;
  for (const child of children) child.parent = node;
  recalculateBounds(node);
  return node;
}

function buildPackedTree<TId extends CollisionBroadphaseId>(nodes: BoundsNode<TId>[], maxEntries: number) {
  if (nodes.length === 0) return emptyBranch<TId>();
  let level = nodes;
  while (level.length > maxEntries) {
    level = packSpatialLevel(level, maxEntries);
  }
  return branchFromChildren(level);
}

function packSpatialLevel<TId extends CollisionBroadphaseId>(nodes: BoundsNode<TId>[], maxEntries: number) {
  const groupCount = Math.ceil(nodes.length / maxEntries);
  const sliceCount = Math.max(1, Math.ceil(Math.sqrt(groupCount)));
  const sliceSize = Math.ceil(nodes.length / sliceCount);
  nodes.sort(compareCenterX);
  const next: BoundsNode<TId>[] = [];
  for (let sliceStart = 0; sliceStart < nodes.length; sliceStart += sliceSize) {
    const sliceEnd = Math.min(nodes.length, sliceStart + sliceSize);
    const slice = nodes.slice(sliceStart, sliceEnd).sort(compareCenterY);
    for (let groupStart = 0; groupStart < slice.length; groupStart += maxEntries) {
      next.push(branchFromChildren(slice.slice(groupStart, groupStart + maxEntries)));
    }
  }
  return next;
}

function compareCenterX<TId extends CollisionBroadphaseId>(left: BoundsNode<TId>, right: BoundsNode<TId>) {
  return left.minX + left.maxX - right.minX - right.maxX
    || left.minY + left.maxY - right.minY - right.maxY
    || (left.order ?? 0) - (right.order ?? 0);
}

function compareCenterY<TId extends CollisionBroadphaseId>(left: BoundsNode<TId>, right: BoundsNode<TId>) {
  return left.minY + left.maxY - right.minY - right.maxY
    || left.minX + left.maxX - right.minX - right.maxX
    || (left.order ?? 0) - (right.order ?? 0);
}

function compareSweepEntries<TId extends CollisionBroadphaseId>(left: BoundsNode<TId>, right: BoundsNode<TId>) {
  return left.minX - right.minX || left.maxX - right.maxX || (left.order ?? 0) - (right.order ?? 0);
}

function recalculateAncestors<TId extends CollisionBroadphaseId>(node: BoundsNode<TId> | undefined) {
  let current = node;
  while (current) {
    recalculateBounds(current);
    current = current.parent;
  }
}

function recalculateBounds<TId extends CollisionBroadphaseId>(node: BoundsNode<TId>) {
  if (node.children.length === 0) {
    node.minX = Number.POSITIVE_INFINITY;
    node.minY = Number.POSITIVE_INFINITY;
    node.maxX = Number.NEGATIVE_INFINITY;
    node.maxY = Number.NEGATIVE_INFINITY;
    return;
  }
  node.minX = Number.POSITIVE_INFINITY;
  node.minY = Number.POSITIVE_INFINITY;
  node.maxX = Number.NEGATIVE_INFINITY;
  node.maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < node.children.length; i += 1) {
    expandToInclude(node, node.children[i]);
  }
}

function chooseSubtree<TId extends CollisionBroadphaseId>(children: BoundsNode<TId>[], entry: CollisionAabb) {
  let best = children[0];
  let bestEnlargement = enlargement(best, entry);
  let bestArea = area(best);
  for (let i = 1; i < children.length; i += 1) {
    const child = children[i];
    const nextEnlargement = enlargement(child, entry);
    const nextArea = area(child);
    if (nextEnlargement < bestEnlargement || (nextEnlargement === bestEnlargement && nextArea < bestArea)) {
      best = child;
      bestEnlargement = nextEnlargement;
      bestArea = nextArea;
    }
  }
  return best;
}

function expandToInclude(target: CollisionAabb, bounds: CollisionAabb) {
  target.minX = Math.min(target.minX, bounds.minX);
  target.minY = Math.min(target.minY, bounds.minY);
  target.maxX = Math.max(target.maxX, bounds.maxX);
  target.maxY = Math.max(target.maxY, bounds.maxY);
}

function enlargement(a: CollisionAabb, b: CollisionAabb) {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.maxX, b.maxX);
  const maxY = Math.max(a.maxY, b.maxY);
  return (maxX - minX) * (maxY - minY) - area(a);
}

function area(bounds: CollisionAabb) {
  return boundsWidth(bounds) * boundsHeight(bounds);
}

function boundsWidth(bounds: CollisionAabb) {
  return Math.max(0, bounds.maxX - bounds.minX);
}

function boundsHeight(bounds: CollisionAabb) {
  return Math.max(0, bounds.maxY - bounds.minY);
}
import Flatbush from "flatbush";
