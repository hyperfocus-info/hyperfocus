export type ObjectPoolOptions<T> = {
  create: () => T;
  reset: (item: T) => void;
  capacity?: number;
  serializeItem?: (item: T) => unknown;
  deserializeItem?: (snapshot: unknown) => T;
};

export type ObjectPoolSnapshot<TSnapshot = unknown> = {
  version: 1;
  capacity: number;
  created: number;
  free: TSnapshot[];
};

export type ObjectPool<T> = {
  acquire(): T;
  release(item: T): void;
  preload(count?: number): void;
  freeCount(): number;
  createdCount(): number;
  serialize(): ObjectPoolSnapshot;
  deserialize(snapshot: ObjectPoolSnapshot): void;
};

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNonNegativeSafeInteger(label: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`object pool ${label} must be a non-negative safe integer: ${String(value)}`);
  }
}

export function createObjectPool<T>({
  create,
  reset,
  capacity = 256,
  serializeItem = (item) => cloneSerializable(item),
  deserializeItem = (snapshot) => cloneSerializable(snapshot) as T
}: ObjectPoolOptions<T>): ObjectPool<T> {
  assertNonNegativeSafeInteger("capacity", capacity);
  const free: T[] = [];
  const freeCounts = new Map<T, number>();
  const checkedOutCounts = new Map<T, number>();
  let created = 0;

  function incrementCount(counts: Map<T, number>, item: T) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  function decrementCount(counts: Map<T, number>, item: T) {
    const count = counts.get(item) ?? 0;
    if (count <= 1) counts.delete(item);
    else counts.set(item, count - 1);
  }

  function createItem() {
    if (created >= Number.MAX_SAFE_INTEGER) {
      throw new Error("object pool created count exceeds the safe integer range");
    }
    const item = create();
    created += 1;
    return item;
  }

  function acquire() {
    const item = free.length > 0 ? free.pop() as T : createItem();
    decrementCount(freeCounts, item);
    incrementCount(checkedOutCounts, item);
    return item;
  }

  function release(item: T) {
    if ((checkedOutCounts.get(item) ?? 0) <= 0) {
      throw new Error("object pool cannot release a foreign or already released item");
    }
    decrementCount(checkedOutCounts, item);
    try {
      reset(item);
    } catch (error) {
      incrementCount(checkedOutCounts, item);
      throw error;
    }
    if (free.length < capacity) {
      free.push(item);
      incrementCount(freeCounts, item);
    }
  }

  return {
    acquire,
    release,
    preload(count = capacity) {
      assertNonNegativeSafeInteger("preload count", count);
      while (free.length < count && free.length < capacity) {
        const item = createItem();
        free.push(item);
        incrementCount(freeCounts, item);
      }
    },
    freeCount() {
      return free.length;
    },
    createdCount() {
      return created;
    },
    serialize() {
      return {
        version: 1,
        capacity,
        created,
        free: free.map((item) => serializeItem(item))
      };
    },
    deserialize(snapshot) {
      if (typeof snapshot !== "object" || snapshot === null) throw new Error("object pool snapshot must be an object");
      if (snapshot.version !== 1) throw new Error(`unsupported object pool snapshot version: ${String(snapshot.version)}`);
      assertNonNegativeSafeInteger("snapshot capacity", snapshot.capacity);
      if (snapshot.capacity !== capacity) {
        throw new Error(`object pool snapshot capacity ${snapshot.capacity} does not match pool capacity ${capacity}`);
      }
      assertNonNegativeSafeInteger("snapshot created count", snapshot.created);
      if (!Array.isArray(snapshot.free)) throw new Error("object pool snapshot free items must be an array");
      if (snapshot.free.length > capacity) throw new Error(`object pool snapshot exceeds capacity ${capacity}`);
      if (snapshot.free.length > snapshot.created) throw new Error("object pool snapshot has more free items than created items");
      const restored = snapshot.free.map((item) => deserializeItem(item));
      free.splice(0, free.length, ...restored);
      freeCounts.clear();
      checkedOutCounts.clear();
      for (const item of restored) incrementCount(freeCounts, item);
      created = snapshot.created;
    }
  };
}
