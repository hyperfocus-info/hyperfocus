export type MmoInventoryMap = Record<string, number>;

export type MmoInventoryEntries = Record<string, number> | Iterable<readonly [string, number]>;

export type MmoInventoryMaxStack = number | Record<string, number> | ((itemId: string) => number | undefined);

export type MmoInventoryOpsConfig = {
  aliases?: Record<string, string>;
  maxStack?: MmoInventoryMaxStack;
};

export type MmoInventoryOps = {
  get(inventory: MmoInventoryMap, itemId: string): number;
  add(inventory: MmoInventoryMap, itemId: string, amount?: number): number;
  addMany(inventory: MmoInventoryMap, items: MmoInventoryEntries): MmoInventoryMap;
  remove(inventory: MmoInventoryMap, itemId: string, amount?: number): boolean;
  removeMany(inventory: MmoInventoryMap, items: MmoInventoryEntries): boolean;
  has(inventory: MmoInventoryMap, itemId: string, amount?: number): boolean;
  entries(inventory: MmoInventoryMap): Array<[string, number]>;
  compact(inventory: MmoInventoryMap): MmoInventoryMap;
};

const MAX_INVENTORY_COUNT = Number.MAX_SAFE_INTEGER;

function positiveInteger(value: number | undefined, fallback = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized >= 0 && Number.isSafeInteger(normalized) ? normalized : fallback;
}

function requestedInteger(value: number | undefined, fallback: number): number | undefined {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) return undefined;
  const normalized = Math.floor(resolved);
  return Number.isSafeInteger(normalized) ? normalized : undefined;
}

function emptyInventoryMap(): MmoInventoryMap {
  return Object.create(null);
}

function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function setInventoryCount(inventory: MmoInventoryMap, itemId: string, count: number) {
  Object.defineProperty(inventory, itemId, {
    value: count,
    configurable: true,
    enumerable: true,
    writable: true
  });
}

function replaceInventory(target: MmoInventoryMap, source: MmoInventoryMap) {
  for (const itemId of Object.keys(target)) delete target[itemId];
  for (const [itemId, count] of Object.entries(source)) setInventoryCount(target, itemId, count);
  return target;
}

function copyInventory(inventory: MmoInventoryMap) {
  const copy = emptyInventoryMap();
  for (const [itemId, count] of Object.entries(inventory)) setInventoryCount(copy, itemId, count);
  return copy;
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function entryPairs(items: MmoInventoryEntries): Array<readonly [string, number]> {
  if (isInventoryIterable(items)) return [...items];
  return Object.entries(items);
}

function isInventoryIterable(items: MmoInventoryEntries): items is Iterable<readonly [string, number]> {
  return typeof Reflect.get(items, Symbol.iterator) === "function";
}

export function createMmoInventoryOps(config: MmoInventoryOpsConfig = {}): MmoInventoryOps {
  const aliases = config.aliases ?? {};

  function resolve(itemId: string) {
    let current = itemId;
    const path: string[] = [];
    const positions = new Map<string, number>();
    while (true) {
      const next = ownValue(aliases, current);
      if (typeof next !== "string" || !next || next === current) return current;
      positions.set(current, path.length);
      path.push(current);
      const cycleStart = positions.get(next);
      if (cycleStart !== undefined) {
        return path.slice(cycleStart).sort(compareIds)[0];
      }
      current = next;
    }
  }

  function maxFor(itemId: string) {
    const maxStack = config.maxStack;
    if (maxStack === undefined) return MAX_INVENTORY_COUNT;
    const value = typeof maxStack === "function" ? maxStack(itemId) : typeof maxStack === "number" ? maxStack : ownValue(maxStack, itemId);
    if (value === undefined || value === Number.POSITIVE_INFINITY) return MAX_INVENTORY_COUNT;
    return positiveInteger(value);
  }

  function addClamped(itemId: string, current: number, amount: number) {
    const maximum = maxFor(itemId);
    if (current >= maximum) return maximum;
    return current + Math.min(amount, maximum - current);
  }

  function compact(inventory: MmoInventoryMap) {
    const totals = emptyInventoryMap();
    for (const [rawId, rawCount] of Object.entries(inventory)) {
      const itemId = resolve(rawId);
      const count = positiveInteger(rawCount);
      if (count <= 0) continue;
      const current = ownValue(totals, itemId) ?? 0;
      const next = addClamped(itemId, current, count);
      if (next > 0) setInventoryCount(totals, itemId, next);
    }
    return replaceInventory(inventory, totals);
  }

  function addWithoutCompacting(inventory: MmoInventoryMap, itemId: string, amount = 1) {
    const canonicalId = resolve(itemId);
    const delta = requestedInteger(amount, 1);
    const current = ownValue(inventory, canonicalId) ?? 0;
    if (delta === undefined || delta === 0) return current;
    const next = addClamped(canonicalId, current, delta);
    if (next <= 0) delete inventory[canonicalId];
    else setInventoryCount(inventory, canonicalId, next);
    return ownValue(inventory, canonicalId) ?? 0;
  }

  function add(inventory: MmoInventoryMap, itemId: string, amount = 1) {
    compact(inventory);
    return addWithoutCompacting(inventory, itemId, amount);
  }

  function removeMany(inventory: MmoInventoryMap, items: MmoInventoryEntries) {
    const requested = emptyInventoryMap();
    for (const [itemId, rawAmount] of entryPairs(items)) {
      const amount = requestedInteger(rawAmount, 0);
      if (amount === undefined) return false;
      if (amount <= 0) continue;
      const canonicalId = resolve(itemId);
      const current = ownValue(requested, canonicalId) ?? 0;
      if (amount > MAX_INVENTORY_COUNT - current) return false;
      setInventoryCount(requested, canonicalId, current + amount);
    }
    const staged = compact(copyInventory(inventory));
    for (const [itemId, amount] of Object.entries(requested)) {
      if ((ownValue(staged, itemId) ?? 0) < amount) return false;
    }
    for (const [itemId, amount] of Object.entries(requested)) {
      const next = (ownValue(staged, itemId) ?? 0) - amount;
      if (next <= 0) delete staged[itemId];
      else setInventoryCount(staged, itemId, next);
    }
    replaceInventory(inventory, staged);
    return true;
  }

  return {
    get(inventory, itemId) {
      compact(inventory);
      return ownValue(inventory, resolve(itemId)) ?? 0;
    },
    add,
    addMany(inventory, items) {
      const pairs = entryPairs(items);
      const staged = compact(copyInventory(inventory));
      for (const [itemId, amount] of pairs) addWithoutCompacting(staged, itemId, amount);
      return replaceInventory(inventory, staged);
    },
    remove(inventory, itemId, amount = 1) {
      return removeMany(inventory, [[itemId, amount]]);
    },
    removeMany,
    has(inventory, itemId, amount = 1) {
      compact(inventory);
      const requested = requestedInteger(amount, 1);
      return requested !== undefined && (ownValue(inventory, resolve(itemId)) ?? 0) >= requested;
    },
    entries(inventory) {
      compact(inventory);
      return Object.entries(inventory).sort(([a], [b]) => compareIds(a, b));
    },
    compact
  };
}
