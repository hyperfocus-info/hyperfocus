export type MeasuredWindow = {
  first: number;
  last: number;
};

export type MeasuredWindowModel = {
  readonly count: number;
  readonly totalSize: number;
  sync(keys: readonly string[], estimatedSize: number): boolean;
  measure(key: string, size: number): boolean;
  offsetAt(index: number): number;
  indexAtOffset(offset: number): number;
  windowAt(offset: number, viewportSize: number, overscan: number): MeasuredWindow;
};

export function createMeasuredWindowModel(): MeasuredWindowModel {
  let keys: readonly string[] = [];
  let estimatedSize = 1;
  let sizes = new Float64Array(0);
  let tree = new Float64Array(1);
  let totalSize = 0;
  const measuredSizes = new Map<string, number>();
  const indexes = new Map<string, number>();

  function sync(nextKeys: readonly string[], nextEstimatedSize: number) {
    validatePositiveNumber(nextEstimatedSize, "estimatedSize");
    if (nextEstimatedSize === estimatedSize && equalKeys(keys, nextKeys)) return false;

    keys = nextKeys.slice();
    estimatedSize = nextEstimatedSize;
    sizes = new Float64Array(keys.length);
    tree = new Float64Array(keys.length + 1);
    indexes.clear();
    const liveKeys = new Set<string>();
    totalSize = 0;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const size = measuredSizes.get(key) ?? estimatedSize;
      liveKeys.add(key);
      indexes.set(key, index);
      sizes[index] = size;
      addToTree(tree, index, size);
      totalSize += size;
    }
    for (const key of measuredSizes.keys()) {
      if (!liveKeys.has(key)) measuredSizes.delete(key);
    }
    return true;
  }

  function measure(key: string, size: number) {
    validatePositiveNumber(size, "measured size");
    const index = indexes.get(key);
    if (index === undefined || sizes[index] === size) return false;
    const delta = size - sizes[index];
    sizes[index] = size;
    measuredSizes.set(key, size);
    addToTree(tree, index, delta);
    totalSize += delta;
    return true;
  }

  function offsetAt(index: number) {
    const normalizedIndex = Math.max(0, Math.min(keys.length, Math.trunc(index)));
    return prefixSum(tree, normalizedIndex);
  }

  function indexAtOffset(offset: number) {
    if (keys.length === 0) return -1;
    const target = Number.isFinite(offset) ? Math.max(0, offset) : 0;
    let index = 0;
    let sum = 0;
    for (let step = highestPowerOfTwoAtMost(keys.length); step > 0; step >>= 1) {
      const next = index + step;
      if (next <= keys.length && sum + tree[next] <= target) {
        index = next;
        sum += tree[next];
      }
    }
    return Math.min(index, keys.length - 1);
  }

  return {
    get count() {
      return keys.length;
    },
    get totalSize() {
      return totalSize;
    },
    sync,
    measure,
    offsetAt,
    indexAtOffset,
    windowAt(offset, viewportSize, overscan) {
      if (keys.length === 0) return { first: 0, last: -1 };
      const normalizedOverscan = Number.isSafeInteger(overscan) && overscan >= 0 ? overscan : 0;
      const normalizedViewport = Number.isFinite(viewportSize) ? Math.max(0, viewportSize) : 0;
      return {
        first: Math.max(0, indexAtOffset(offset) - normalizedOverscan),
        last: Math.min(keys.length - 1, indexAtOffset(offset + normalizedViewport) + normalizedOverscan)
      };
    }
  };
}

function addToTree(tree: Float64Array, index: number, delta: number) {
  for (let treeIndex = index + 1; treeIndex < tree.length; treeIndex += treeIndex & -treeIndex) {
    tree[treeIndex] += delta;
  }
}

function prefixSum(tree: Float64Array, count: number) {
  let sum = 0;
  for (let treeIndex = count; treeIndex > 0; treeIndex -= treeIndex & -treeIndex) {
    sum += tree[treeIndex];
  }
  return sum;
}

function highestPowerOfTwoAtMost(value: number) {
  let result = 1;
  while (result * 2 <= value) result *= 2;
  return result;
}

function equalKeys(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function validatePositiveNumber(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}
