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

type BroadphaseQueryState<TId extends CollisionBroadphaseId> = {
  packedIndex: Flatbush | undefined;
  packedEntries: BoundsNode<TId>[];
  sweepEntries: BoundsNode<TId>[];
  sweepEntriesDirty: boolean;
  pendingMutations: number;
  autoLinearQueriesRemaining: number;
  lastQueryStrategy: Exclude<CollisionBroadphaseStrategy, "auto">;
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
  let nextOrder = 1;
  const queryState = createBroadphaseQueryState<TId>();

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
    queryState.sweepEntries = [...entries.values()].sort(compareSweepEntries);
    queryState.sweepEntriesDirty = false;
    root = emptyBranch<TId>();
    rootValid = false;
    queryState.packedIndex = undefined;
    queryState.packedEntries.length = 0;
    queryState.pendingMutations = 0;
    queryState.autoLinearQueriesRemaining = 0;
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
      queryState.packedIndex = undefined;
      queryState.packedEntries.length = 0;
      if (rootValid) recalculateAncestors(existing.parent);
      queryState.sweepEntriesDirty = true;
      queryState.pendingMutations += 1;
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
    queryState.packedIndex = undefined;
    queryState.packedEntries.length = 0;
    if (rootValid) insert(entry);
    queryState.sweepEntriesDirty = true;
    queryState.pendingMutations += 1;
    return entry;
  }

  function remove(id: TId) {
    if (!entries.has(id)) return false;
    entries.delete(id);
    queryState.packedIndex = undefined;
    queryState.packedEntries.length = 0;
    if (rootValid) root = buildPackedTree([...entries.values()], maxEntries);
    queryState.sweepEntriesDirty = true;
    queryState.pendingMutations += 1;
    return true;
  }

  function clear() {
    entries.clear();
    root = emptyBranch<TId>();
    rootValid = true;
    queryState.packedIndex = undefined;
    queryState.packedEntries.length = 0;
    queryState.sweepEntries.length = 0;
    queryState.sweepEntriesDirty = false;
    nextOrder = 1;
    queryState.pendingMutations = 0;
    queryState.autoLinearQueriesRemaining = 0;
  }

  const queries = createBroadphaseQueryOperations(entries, queryState, {
    strategy,
    linearScanThreshold,
    dynamicUpdateRatio,
  });

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

  return {
    upsert,
    remove,
    clear,
    rebuild,
    query: queries.query,
    queryEntries: queries.queryEntries,
    collides: queries.collides,
    pairs: queries.pairs,
    forEachPair: queries.visitSweepPairs,
    count() {
      return entries.size;
    },
    queryStrategy() {
      return queryState.lastQueryStrategy;
    },
    boundsOf(id: TId) {
      const entry = entries.get(id);
      if (!entry) return undefined;
      return { minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY };
    }
  };
}

function createBroadphaseQueryState<TId extends CollisionBroadphaseId>(): BroadphaseQueryState<TId> {
  return {
    packedIndex: undefined,
    packedEntries: [],
    sweepEntries: [],
    sweepEntriesDirty: false,
    pendingMutations: 0,
    autoLinearQueriesRemaining: 0,
    lastQueryStrategy: "linear",
  };
}

function createBroadphaseQueryOperations<TId extends CollisionBroadphaseId>(
  entries: ReadonlyMap<TId, BoundsNode<TId>>,
  state: BroadphaseQueryState<TId>,
  options: {
    strategy: CollisionBroadphaseStrategy;
    linearScanThreshold: number;
    dynamicUpdateRatio: number;
  },
) {
  function selectQueryStrategy() {
    if (options.strategy !== "auto") return options.strategy;
    if (entries.size <= options.linearScanThreshold) return "linear";
    const dynamicThreshold = Math.max(1, Math.ceil(entries.size * options.dynamicUpdateRatio));
    if (state.pendingMutations >= dynamicThreshold) state.autoLinearQueriesRemaining = AUTO_LINEAR_QUERY_WINDOW;
    if (state.autoLinearQueriesRemaining > 0) {
      state.autoLinearQueriesRemaining -= 1;
      state.pendingMutations = 0;
      return "linear";
    }
    return "packed";
  }

  function visitLinear(bounds: CollisionAabb, visit: (entry: BoundsNode<TId>) => boolean | void) {
    for (const entry of entries.values()) {
      if (aabbsOverlap(entry, bounds) && visit(entry) === false) return;
    }
  }

  function ensurePackedIndex() {
    if (state.packedIndex) return state.packedIndex;
    state.packedEntries = [...entries.values()];
    const index = new Flatbush(state.packedEntries.length);
    for (const entry of state.packedEntries) index.add(entry.minX, entry.minY, entry.maxX, entry.maxY);
    index.finish();
    state.packedIndex = index;
    state.pendingMutations = 0;
    return index;
  }

  function query(bounds: CollisionAabb, out: TId[] = []) {
    const normalized = normalizeAabb(bounds);
    if (entries.size === 0) return out;
    state.lastQueryStrategy = selectQueryStrategy();
    if (state.lastQueryStrategy === "linear") {
      visitLinear(normalized, (entry) => {
        out.push(requireLeafId(entry));
      });
      return out;
    }
    const hits = ensurePackedIndex().search(
      normalized.minX,
      normalized.minY,
      normalized.maxX,
      normalized.maxY,
      (index) => aabbsOverlap(state.packedEntries[index], normalized),
    );
    for (let index = 0; index < hits.length; index += 1) {
      out.push(requireLeafId(state.packedEntries[hits[index]]));
    }
    return out;
  }

  function queryEntries(bounds: CollisionAabb, out: CollisionBroadphaseEntry<TId>[] = []) {
    const ids = query(bounds);
    for (const id of ids) {
      const entry = entries.get(id);
      if (entry) out.push({ id, minX: entry.minX, minY: entry.minY, maxX: entry.maxX, maxY: entry.maxY });
    }
    return out;
  }

  function collides(bounds: CollisionAabb) {
    const normalized = normalizeAabb(bounds);
    if (entries.size === 0) return false;
    state.lastQueryStrategy = selectQueryStrategy();
    if (state.lastQueryStrategy === "linear") {
      let hit = false;
      visitLinear(normalized, () => {
        hit = true;
        return false;
      });
      return hit;
    }
    return ensurePackedIndex().search(
      normalized.minX,
      normalized.minY,
      normalized.maxX,
      normalized.maxY,
      (index) => aabbsOverlap(state.packedEntries[index], normalized),
    ).length > 0;
  }

  function visitSweepPairs(visit: CollisionBroadphasePairVisitor<TId>) {
    if (state.sweepEntriesDirty) {
      state.sweepEntries = [...entries.values()].sort(compareSweepEntries);
      state.sweepEntriesDirty = false;
    }
    let count = 0;
    for (let leftIndex = 0; leftIndex < state.sweepEntries.length; leftIndex += 1) {
      const left = state.sweepEntries[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < state.sweepEntries.length; rightIndex += 1) {
        const right = state.sweepEntries[rightIndex];
        if (right.minX >= left.maxX) break;
        if (left.minY >= right.maxY || left.maxY <= right.minY) continue;
        const leftId = requireLeafId(left);
        const rightId = requireLeafId(right);
        if ((left.order ?? 0) <= (right.order ?? 0)) visit(leftId, rightId);
        else visit(rightId, leftId);
        count += 1;
      }
    }
    return count;
  }

  function pairs(out: CollisionBroadphasePair<TId>[] = []) {
    const outputStart = out.length;
    visitSweepPairs((left, right) => out.push({ a: left, b: right }));
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

  return { query, queryEntries, collides, pairs, visitSweepPairs };
}

function requireLeafId<TId extends CollisionBroadphaseId>(entry: BoundsNode<TId>): TId {
  if (entry.id === undefined) throw new Error("Collision broadphase leaf is missing its id");
  return entry.id;
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
