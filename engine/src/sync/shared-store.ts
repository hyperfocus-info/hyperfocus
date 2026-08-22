export type SharedStorePath = readonly (string | number)[];

export type SharedStorePatch = {
  path: SharedStorePath;
  value: unknown;
  timestamp: number;
  peerId: string;
};

export type SharedStoreClock = Omit<SharedStorePatch, "value">;

export type SharedStoreSnapshot<T extends object = object> = {
  state: T;
  clocks: readonly SharedStoreClock[];
  /** Canonical replay base. Present on snapshots produced by this implementation. */
  base?: T;
  /** Latest operation for each path, used to replay overlapping parent/child writes deterministically. */
  patches?: readonly SharedStorePatch[];
};

export type SharedStoreOptions = {
  peerId?: string;
  now?: () => number;
  onPatch?: (patch: SharedStorePatch) => void;
  merge?: (currentValue: unknown, incomingValue: unknown, patch: SharedStorePatch) => unknown;
  onDispose?: () => void;
};

export type SharedStoreApi<T extends object> = T & {
  $applyPatch(patch: SharedStorePatch): void;
  $applySnapshot(snapshot: SharedStoreSnapshot<T>): boolean;
  $exportSnapshot(): SharedStoreSnapshot<T>;
  $subscribe(listener: (patch: SharedStorePatch) => void): () => void;
  $snapshot(): T;
  $dispose(): void;
};

type ClockEntry = SharedStoreClock;

const blockedPathParts = new Set(["__proto__", "prototype", "constructor"]);
const reservedRootParts = new Set(["$applyPatch", "$applySnapshot", "$exportSnapshot", "$subscribe", "$snapshot", "$dispose"]);

function hasRootApiCollision(value: object) {
  return [...reservedRootParts].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isSafePathPart(value: unknown): value is string | number {
  if (typeof value === "string") return value.length > 0 && !blockedPathParts.has(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasSafeStructure(value: unknown, allowUndefined = false, ancestors = new WeakSet<object>()): boolean {
  if (value === undefined) return allowUndefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") continue;
        if (
          typeof key !== "string" ||
          !Object.prototype.propertyIsEnumerable.call(value, key) ||
          !/^(0|[1-9]\d*)$/.test(key) ||
          Number(key) >= value.length
        ) return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor) || !hasSafeStructure(descriptor.value, false, ancestors)) return false;
      }
      return true;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol" || blockedPathParts.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor) || !hasSafeStructure(descriptor.value, false, ancestors)) return false;
    }
    return true;
  } finally {
    ancestors.delete(value);
  }
}

function isSafeState(value: unknown): value is object {
  return typeof value === "object" && value !== null && hasSafeStructure(value);
}

export function isSharedStorePatch(value: unknown): value is SharedStorePatch {
  if (typeof value !== "object" || value === null) return false;
  try {
    const patch = value as Partial<SharedStorePatch>;
    return (
      Array.isArray(patch.path) &&
      patch.path.length > 0 &&
      patch.path.every(isSafePathPart) &&
      !(typeof patch.path[0] === "string" && reservedRootParts.has(patch.path[0])) &&
      typeof patch.timestamp === "number" &&
      Number.isSafeInteger(patch.timestamp) &&
      patch.timestamp >= 0 &&
      typeof patch.peerId === "string" &&
      patch.peerId.length > 0 &&
      hasSafeStructure(patch.value, true)
    );
  } catch {
    return false;
  }
}

export function isSharedStoreSnapshot(value: unknown): value is SharedStoreSnapshot {
  if (typeof value !== "object" || value === null) return false;
  try {
    const snapshot = value as Partial<SharedStoreSnapshot>;
    if (!isSafeState(snapshot.state) || hasRootApiCollision(snapshot.state) || !Array.isArray(snapshot.clocks)) return false;
    if ((snapshot.base === undefined) !== (snapshot.patches === undefined)) return false;
    if (snapshot.base !== undefined && (!isSafeState(snapshot.base) || hasRootApiCollision(snapshot.base))) return false;
    if (snapshot.patches !== undefined && (!Array.isArray(snapshot.patches) || !snapshot.patches.every(isSharedStorePatch))) return false;
    return snapshot.clocks.every(
      (clock) =>
        typeof clock === "object" &&
        clock !== null &&
        isSharedStorePatch({ ...(clock as object), value: undefined })
    );
  } catch {
    return false;
  }
}

function pathKey(path: SharedStorePath) {
  return JSON.stringify(path.map((part) => (typeof part === "number" ? ["n", part] : ["s", part])));
}

function compareClock(a: Pick<ClockEntry, "timestamp" | "peerId">, b: Pick<ClockEntry, "timestamp" | "peerId">) {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  return a.peerId < b.peerId ? -1 : a.peerId > b.peerId ? 1 : 0;
}

function comparePatch(a: SharedStorePatch, b: SharedStorePatch) {
  const clock = compareClock(a, b);
  if (clock !== 0) return clock;
  const aPath = pathKey(a.path);
  const bPath = pathKey(b.path);
  return aPath < bPath ? -1 : aPath > bPath ? 1 : 0;
}

function structurallyEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => structurallyEqual(value, b[index]));
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length || aKeys.some((key, index) => key !== bKeys[index])) return false;
  return aKeys.every((key) => structurallyEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function getAtPath(target: unknown, path: SharedStorePath) {
  let cursor: unknown = target;
  for (const part of path) {
    if (typeof cursor !== "object" || cursor === null || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = (cursor as Record<string | number, unknown>)[part];
  }
  return cursor;
}

function setAtPath(target: unknown, path: SharedStorePath, value: unknown) {
  let cursor = target as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i += 1) {
    const part = path[i];
    const next = Object.prototype.hasOwnProperty.call(cursor, part) ? cursor[part] : undefined;
    if (typeof next !== "object" || next === null) cursor[part] = typeof path[i + 1] === "number" ? [] : {};
    cursor = cursor[part] as Record<string | number, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function deleteAtPath(target: unknown, path: SharedStorePath) {
  let cursor = target as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i += 1) {
    const part = path[i];
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) return;
    const next = cursor[part];
    if (typeof next !== "object" || next === null) return;
    cursor = next as Record<string | number, unknown>;
  }
  delete cursor[path[path.length - 1]];
}

function replaceObjectContents(target: object, next: object) {
  if (Array.isArray(target) && Array.isArray(next)) {
    target.length = next.length;
    for (let index = 0; index < next.length; index += 1) {
      const current = target[index];
      const value = next[index];
      if (typeof current === "object" && current !== null && typeof value === "object" && value !== null && Array.isArray(current) === Array.isArray(value)) {
        replaceObjectContents(current, value);
      } else {
        target[index] = cloneSerializable(value);
      }
    }
    return;
  }

  const targetRecord = target as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  for (const key of Object.keys(targetRecord)) {
    if (!Object.prototype.hasOwnProperty.call(nextRecord, key)) Reflect.deleteProperty(targetRecord, key);
  }
  for (const key of Object.keys(nextRecord)) {
    const current = targetRecord[key];
    const value = nextRecord[key];
    if (typeof current === "object" && current !== null && typeof value === "object" && value !== null && Array.isArray(current) === Array.isArray(value)) {
      replaceObjectContents(current, value);
    } else {
      Reflect.set(targetRecord, key, cloneSerializable(value));
    }
  }
}

export function createSharedStore<T extends object>(initialState: T, options: SharedStoreOptions = {}): SharedStoreApi<T> {
  const peerId = options.peerId ?? `peer-${Math.random().toString(36).slice(2)}`;
  if (typeof peerId !== "string" || peerId.length === 0) throw new Error("shared store peerId must be a non-empty string");
  if (!isSafeState(initialState) || hasRootApiCollision(initialState)) throw new Error("shared store initial state must be a wire-safe object without reserved API keys");
  const now = options.now ?? (() => Date.now());
  let base = cloneSerializable(initialState);
  const source = cloneSerializable(initialState);
  const listeners = new Set<(patch: SharedStorePatch) => void>();
  const clocks = new Map<string, ClockEntry>();
  const patches = new Map<string, SharedStorePatch>();
  const proxyCache = new WeakMap<object, Map<string, object>>();
  let logicalTimestamp = 0;
  let disposed = false;

  function nextTimestamp(path: SharedStorePath) {
    const sampledTime = now();
    const currentTime = Number.isFinite(sampledTime) ? Math.max(0, Math.floor(sampledTime)) : Date.now();
    const next = Math.max(currentTime, logicalTimestamp + 1);
    if (!Number.isSafeInteger(next)) throw new Error("shared store logical clock exhausted");
    return next;
  }

  function rememberClock(clock: ClockEntry) {
    const key = pathKey(clock.path);
    const previous = clocks.get(key);
    if (!previous || compareClock(clock, previous) > 0) {
      clocks.set(key, { path: [...clock.path], timestamp: clock.timestamp, peerId: clock.peerId });
    }
    logicalTimestamp = Math.max(logicalTimestamp, clock.timestamp);
  }

  function emit(patch: SharedStorePatch) {
    if (disposed) return;
    try {
      options.onPatch?.({ ...patch, path: [...patch.path], value: cloneSerializable(patch.value) });
    } catch {
      // Patch fan-out is isolated: state is already committed and later listeners must still run.
    }
    for (const listener of listeners) {
      try {
        listener({ ...patch, path: [...patch.path], value: cloneSerializable(patch.value) });
      } catch {
        // Independent subscribers cannot interrupt each other.
      }
    }
  }

  function materialize(replay: ReadonlyMap<string, SharedStorePatch>, replayBase: T = base) {
    const next = cloneSerializable(replayBase);
    for (const patch of [...replay.values()].sort(comparePatch)) {
      const incoming = cloneSerializable(patch.value);
      const merged = options.merge ? options.merge(getAtPath(next, patch.path), incoming, patch) : incoming;
      if (merged !== undefined && !hasSafeStructure(merged)) throw new Error("shared store merge returned an unsafe value");
      if (merged === undefined) deleteAtPath(next, patch.path);
      else setAtPath(next, patch.path, cloneSerializable(merged));
    }
    if (!isSafeState(next)) throw new Error("shared store patch produced an unsafe state");
    return next;
  }

  function commitPatch(patch: SharedStorePatch, notify: boolean) {
    const key = pathKey(patch.path);
    const previousClock = clocks.get(key);
    if (previousClock && compareClock(patch, previousClock) <= 0) return false;
    const owned = { ...patch, path: [...patch.path], value: cloneSerializable(patch.value) };
    const previousPatch = patches.get(key);
    patches.set(key, owned);
    let next: T;
    try {
      next = materialize(patches);
    } catch (error) {
      if (previousPatch) patches.set(key, previousPatch);
      else patches.delete(key);
      if (notify) throw error;
      return false;
    }
    rememberClock(owned);
    replaceObjectContents(source, next);
    if (notify) emit(owned);
    return true;
  }

  function wrap<Value extends object>(target: Value, basePath: SharedStorePath): Value {
    const cacheKey = pathKey(basePath);
    let cachedByPath = proxyCache.get(target);
    const cached = cachedByPath?.get(cacheKey);
    if (cached) return cached as Value;

    const proxy = new Proxy(target, {
      get(current, property, receiver) {
        if (basePath.length === 0) {
          if (property === "$applyPatch") return applyPatch;
          if (property === "$applySnapshot") return applySnapshot;
          if (property === "$exportSnapshot") return exportSnapshot;
          if (property === "$subscribe") return subscribe;
          if (property === "$snapshot") return () => cloneSerializable(source);
          if (property === "$dispose") return dispose;
        }
        if (typeof property === "string" && blockedPathParts.has(property) && !Object.prototype.hasOwnProperty.call(current, property)) {
          return undefined;
        }
        const value = Reflect.get(current, property, receiver);
        if (typeof value === "object" && value !== null && typeof property !== "symbol") return wrap(value, [...basePath, property]);
        return value;
      },
      set(current, property, value, receiver) {
        if (typeof property === "symbol") return false;
        if (blockedPathParts.has(property) || (basePath.length === 0 && reservedRootParts.has(property))) return false;
        const path = [...basePath, property];
        if (!hasSafeStructure(value)) throw new Error("shared store values must be wire-safe");
        return commitPatch({ path, value, timestamp: nextTimestamp(path), peerId }, true);
      },
      deleteProperty(current, property) {
        if (typeof property === "symbol") return false;
        if (blockedPathParts.has(property) || (basePath.length === 0 && reservedRootParts.has(property))) return false;
        const path = [...basePath, property];
        return commitPatch({ path, value: undefined, timestamp: nextTimestamp(path), peerId }, true);
      },
      defineProperty() {
        // Descriptor writes bypass the patch clock and cannot be represented by the wire format.
        return false;
      },
      setPrototypeOf() {
        return false;
      },
      preventExtensions() {
        return false;
      }
    });

    if (!cachedByPath) {
      cachedByPath = new Map();
      proxyCache.set(target, cachedByPath);
    }
    cachedByPath.set(cacheKey, proxy);
    return proxy as Value;
  }

  function applyPatch(patch: SharedStorePatch) {
    if (!isSharedStorePatch(patch)) return;
    commitPatch(patch, false);
  }

  function applySnapshot(snapshot: SharedStoreSnapshot<T>) {
    if (!isSharedStoreSnapshot(snapshot)) return false;
    let nextBase: T;
    try {
      nextBase = cloneSerializable((snapshot.base ?? snapshot.state) as T);
    } catch {
      return false;
    }
    if (Array.isArray(source) !== Array.isArray(nextBase)) return false;

    const snapshotClocks = new Map<string, SharedStoreClock>();
    for (const clock of snapshot.clocks) {
      const key = pathKey(clock.path);
      const previous = snapshotClocks.get(key);
      if (!previous || compareClock(clock, previous) > 0) snapshotClocks.set(key, clock);
    }
    const nextPatches = new Map<string, SharedStorePatch>();
    for (const patch of snapshot.patches ?? []) {
      const key = pathKey(patch.path);
      const declaredClock = snapshotClocks.get(key);
      if (!declaredClock || compareClock(patch, declaredClock) !== 0) return false;
      const previous = nextPatches.get(key);
      if (!previous || compareClock(patch, previous) > 0) nextPatches.set(key, { ...patch, path: [...patch.path], value: cloneSerializable(patch.value) });
    }
    if (snapshot.base !== undefined) {
      if (snapshotClocks.size !== nextPatches.size) return false;
      for (const key of snapshotClocks.keys()) {
        if (!nextPatches.has(key)) return false;
      }
    }
    let incomingState: T;
    try {
      incomingState = materialize(nextPatches, nextBase);
    } catch {
      return false;
    }
    if (snapshot.base !== undefined && !structurallyEqual(incomingState, snapshot.state)) return false;
    if (snapshot.base !== undefined && snapshot.patches !== undefined) {
      for (const [key, patch] of patches) {
        const incomingPatch = nextPatches.get(key);
        if (!incomingPatch || compareClock(patch, incomingPatch) > 0) nextPatches.set(key, patch);
      }
    }

    let nextState: T;
    try {
      nextState = materialize(nextPatches, nextBase);
    } catch {
      return false;
    }
    base = nextBase;
    patches.clear();
    for (const [key, patch] of nextPatches) patches.set(key, patch);
    clocks.clear();
    logicalTimestamp = 0;
    for (const clock of snapshot.clocks) rememberClock(clock);
    for (const patch of nextPatches.values()) rememberClock(patch);
    replaceObjectContents(source, nextState);
    return true;
  }

  function exportSnapshot(): SharedStoreSnapshot<T> {
    const replayPatches = [...clocks.entries()].map(([key, clock]) => {
      const operation = patches.get(key);
      if (operation && compareClock(operation, clock) === 0) {
        return { ...operation, path: [...operation.path], value: cloneSerializable(operation.value) };
      }
      return { ...clock, path: [...clock.path], value: cloneSerializable(getAtPath(source, clock.path)) };
    });
    return {
      state: cloneSerializable(source),
      clocks: [...clocks.values()].map((clock) => ({ path: [...clock.path], timestamp: clock.timestamp, peerId: clock.peerId })),
      base: cloneSerializable(base),
      patches: replayPatches
    };
  }

  function subscribe(listener: (patch: SharedStorePatch) => void) {
    if (disposed) return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    options.onDispose?.();
  }

  return wrap(source, []) as SharedStoreApi<T>;
}
