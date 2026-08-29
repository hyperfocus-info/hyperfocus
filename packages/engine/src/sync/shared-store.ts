export type SharedStorePath = readonly (string | number)[];

export type SharedStorePatch = {
  path: SharedStorePath;
  value: unknown;
  timestamp: number;
  peerId: string;
};

export type SharedStoreClock = Omit<SharedStorePatch, "value">;

export type SharedStoreSnapshot = {
  state: object;
  clocks: readonly SharedStoreClock[];
  /** Canonical replay base. Present on snapshots produced by this implementation. */
  base?: object;
  /** Latest operation for each path, used to replay overlapping parent/child writes deterministically. */
  patches?: readonly SharedStorePatch[];
};

export type SharedStoreOptions = {
  peerId?: string;
  now?: () => number;
  /** Maximum amount a received logical clock may advance beyond local observed time. */
  maxRemoteClockAdvanceMs?: number;
  onPatch?: (patch: SharedStorePatch) => void;
  merge?: (currentValue: unknown, incomingValue: unknown, patch: SharedStorePatch) => unknown;
  onDispose?: () => void;
};

export type SharedStoreApi<T extends object> = T & {
  $applyPatch(patch: SharedStorePatch): boolean;
  $applySnapshot(snapshot: SharedStoreSnapshot): boolean;
  $exportSnapshot(): SharedStoreSnapshot;
  $subscribe(listener: (patch: SharedStorePatch) => void): () => void;
  $snapshot(): T;
  $dispose(): void;
};

type ClockEntry = SharedStoreClock;

const blockedPathParts = new Set(["__proto__", "prototype", "constructor"]);
const reservedRootParts = new Set(["$applyPatch", "$applySnapshot", "$exportSnapshot", "$subscribe", "$snapshot", "$dispose"]);
const MAX_SHARED_STORE_PATH_DEPTH = 64;
const MAX_SHARED_STORE_PEER_ID_LENGTH = 256;
const MAX_SHARED_STORE_STRUCTURE_DEPTH = 64;
const MAX_SHARED_STORE_STRUCTURE_NODES = 100_000;
const MAX_SHARED_STORE_STRING_BYTES = 1024 * 1024;
const MAX_SHARED_STORE_OPERATIONS = 100_000;
const DEFAULT_MAX_REMOTE_CLOCK_ADVANCE_MS = 5 * 60_000;
const textEncoder = new TextEncoder();

function hasRootApiCollision(value: object) {
  return [...reservedRootParts].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function cloneSerializable<T>(value: T): T {
  return structuredClone(value);
}

function readProperty(value: object, key: PropertyKey): unknown {
  const property: unknown = Reflect.get(value, key);
  return property;
}

function isSafePathPart(value: unknown): value is string | number {
  if (typeof value === "string") return value.length > 0 && !blockedPathParts.has(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

type StructureValidation = {
  ancestors: WeakSet<object>;
  nodes: number;
  stringBytes: number;
};

function hasSafeStructure(
  value: unknown,
  allowUndefined = false,
  validation: StructureValidation = { ancestors: new WeakSet(), nodes: 0, stringBytes: 0 },
  depth = 0
): boolean {
  validation.nodes += 1;
  if (validation.nodes > MAX_SHARED_STORE_STRUCTURE_NODES || depth > MAX_SHARED_STORE_STRUCTURE_DEPTH) return false;
  if (value === undefined) return allowUndefined;
  if (typeof value === "string") {
    validation.stringBytes += textEncoder.encode(value).byteLength;
    return validation.stringBytes <= MAX_SHARED_STORE_STRING_BYTES;
  }
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== "object") return false;
  if (validation.ancestors.has(value)) return false;
  validation.ancestors.add(value);
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
        if (!descriptor?.enumerable || !("value" in descriptor) || !hasSafeStructure(descriptor.value, false, validation, depth + 1)) return false;
      }
      return true;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol" || blockedPathParts.has(key)) return false;
      validation.stringBytes += textEncoder.encode(key).byteLength;
      if (validation.stringBytes > MAX_SHARED_STORE_STRING_BYTES) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor) || !hasSafeStructure(descriptor.value, false, validation, depth + 1)) return false;
    }
    return true;
  } finally {
    validation.ancestors.delete(value);
  }
}

function isSafeState(value: unknown): value is object {
  return typeof value === "object" && value !== null && hasSafeStructure(value);
}

export function isSharedStorePatch(value: unknown): value is SharedStorePatch {
  if (typeof value !== "object" || value === null) return false;
  try {
    const path = readProperty(value, "path");
    const timestamp = readProperty(value, "timestamp");
    const peerId = readProperty(value, "peerId");
    return (
      Array.isArray(path) &&
      path.length > 0 &&
      path.length <= MAX_SHARED_STORE_PATH_DEPTH &&
      path.every(isSafePathPart) &&
      !(typeof path[0] === "string" && reservedRootParts.has(path[0])) &&
      typeof timestamp === "number" &&
      Number.isSafeInteger(timestamp) &&
      timestamp >= 0 &&
      typeof peerId === "string" &&
      peerId.length > 0 &&
      peerId.length <= MAX_SHARED_STORE_PEER_ID_LENGTH &&
      hasSafeStructure(readProperty(value, "value"), true)
    );
  } catch {
    return false;
  }
}

export function isSharedStoreSnapshot(value: unknown): value is SharedStoreSnapshot {
  if (typeof value !== "object" || value === null) return false;
  try {
    const state = readProperty(value, "state");
    const clocks = readProperty(value, "clocks");
    const base = readProperty(value, "base");
    const patches = readProperty(value, "patches");
    if (!isSafeState(state) || hasRootApiCollision(state) || !Array.isArray(clocks) || clocks.length > MAX_SHARED_STORE_OPERATIONS) return false;
    if ((base === undefined) !== (patches === undefined)) return false;
    if (base !== undefined && (!isSafeState(base) || hasRootApiCollision(base))) return false;
    if (patches !== undefined && (!Array.isArray(patches) || patches.length > MAX_SHARED_STORE_OPERATIONS || !patches.every(isSharedStorePatch))) return false;
    return clocks.every(isSharedStoreClock);
  } catch {
    return false;
  }
}

function isSharedStoreClock(value: unknown): value is SharedStoreClock {
  if (typeof value !== "object" || value === null) return false;
  return isSharedStorePatch({
    path: readProperty(value, "path"),
    timestamp: readProperty(value, "timestamp"),
    peerId: readProperty(value, "peerId"),
    value: undefined,
  });
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
  return aKeys.every((key) => structurallyEqual(readProperty(a, key), readProperty(b, key)));
}

function getAtPath(target: unknown, path: SharedStorePath) {
  let cursor: unknown = target;
  for (const part of path) {
    if (typeof cursor !== "object" || cursor === null || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = readProperty(cursor, part);
  }
  return cursor;
}

function setAtPath(target: unknown, path: SharedStorePath, value: unknown) {
  if (typeof target !== "object" || target === null) throw new TypeError("shared store patch target must be an object");
  let cursor: object = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const part = path[i];
    const next = Object.prototype.hasOwnProperty.call(cursor, part) ? readProperty(cursor, part) : undefined;
    const child = typeof next === "object" && next !== null ? next : typeof path[i + 1] === "number" ? [] : {};
    if (child !== next) Reflect.set(cursor, part, child);
    cursor = child;
  }
  Reflect.set(cursor, path[path.length - 1], value);
}

function deleteAtPath(target: unknown, path: SharedStorePath) {
  if (typeof target !== "object" || target === null) return;
  let cursor: object = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const part = path[i];
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) return;
    const next = readProperty(cursor, part);
    if (typeof next !== "object" || next === null) return;
    cursor = next;
  }
  Reflect.deleteProperty(cursor, path[path.length - 1]);
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

  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) Reflect.deleteProperty(target, key);
  }
  for (const key of Object.keys(next)) {
    const current = readProperty(target, key);
    const value = readProperty(next, key);
    if (typeof current === "object" && current !== null && typeof value === "object" && value !== null && Array.isArray(current) === Array.isArray(value)) {
      replaceObjectContents(current, value);
    } else {
      Reflect.set(target, key, cloneSerializable(value));
    }
  }
}

type SharedStoreProxyOptions<T extends object> = {
  applyPatch(patch: SharedStorePatch): boolean;
  applySnapshot(snapshot: SharedStoreSnapshot): boolean;
  commitPatch(patch: SharedStorePatch, notify: boolean): boolean;
  dispose(): void;
  exportSnapshot(): SharedStoreSnapshot;
  nextTimestamp(): number;
  peerId: string;
  source: T;
  subscribe(listener: (patch: SharedStorePatch) => void): () => void;
};

function createSharedStoreProxy<T extends object>(options: SharedStoreProxyOptions<T>): SharedStoreApi<T> {
  const proxyCache = new WeakMap<object, Map<string, object>>();

  function wrap<Value extends object>(target: Value, basePath: SharedStorePath): Value {
    const cacheKey = pathKey(basePath);
    let cachedByPath = proxyCache.get(target);
    const cached = cachedByPath?.get(cacheKey);
    if (cached) {
      if (!isProxyForTarget(cached, target)) throw new Error("shared store proxy cache does not match its target");
      return cached;
    }

    const proxy = new Proxy(target, {
      get(current, property, receiver) {
        if (basePath.length === 0) {
          if (property === "$applyPatch") return options.applyPatch;
          if (property === "$applySnapshot") return options.applySnapshot;
          if (property === "$exportSnapshot") return options.exportSnapshot;
          if (property === "$subscribe") return options.subscribe;
          if (property === "$snapshot") return () => cloneSerializable(options.source);
          if (property === "$dispose") return options.dispose;
        }
        if (typeof property === "string" && blockedPathParts.has(property) && !Object.prototype.hasOwnProperty.call(current, property)) {
          return undefined;
        }
        const value = Reflect.get(current, property, receiver);
        if (typeof value === "object" && value !== null && typeof property !== "symbol") return wrap(value, [...basePath, property]);
        return value;
      },
      set(_current, property, value) {
        if (typeof property === "symbol") return false;
        if (blockedPathParts.has(property) || (basePath.length === 0 && reservedRootParts.has(property))) return false;
        const path = [...basePath, property];
        if (!hasSafeStructure(value)) throw new Error("shared store values must be wire-safe");
        return options.commitPatch({ path, value, timestamp: options.nextTimestamp(), peerId: options.peerId }, true);
      },
      deleteProperty(_current, property) {
        if (typeof property === "symbol") return false;
        if (blockedPathParts.has(property) || (basePath.length === 0 && reservedRootParts.has(property))) return false;
        const path = [...basePath, property];
        return options.commitPatch({ path, value: undefined, timestamp: options.nextTimestamp(), peerId: options.peerId }, true);
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
    return proxy;
  }

  const store = wrap(options.source, []);
  if (!isSharedStoreApi(store)) throw new Error("shared store proxy is missing its API methods");
  return store;
}

function isProxyForTarget<Value extends object>(value: object, target: Value): value is Value {
  return Object.getPrototypeOf(value) === Object.getPrototypeOf(target)
    && Reflect.ownKeys(target).every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isSharedStoreApi<T extends object>(value: T): value is SharedStoreApi<T> {
  return typeof readProperty(value, "$applyPatch") === "function"
    && typeof readProperty(value, "$applySnapshot") === "function"
    && typeof readProperty(value, "$exportSnapshot") === "function"
    && typeof readProperty(value, "$subscribe") === "function"
    && typeof readProperty(value, "$snapshot") === "function"
    && typeof readProperty(value, "$dispose") === "function";
}

function normalizeSharedStoreOptions(initialState: object, options: SharedStoreOptions) {
  const peerId = options.peerId ?? `peer-${Math.random().toString(36).slice(2)}`;
  if (typeof peerId !== "string" || peerId.length === 0) throw new Error("shared store peerId must be a non-empty string");
  if (!isSafeState(initialState) || hasRootApiCollision(initialState)) throw new Error("shared store initial state must be a wire-safe object without reserved API keys");
  const maxRemoteClockAdvanceMs = options.maxRemoteClockAdvanceMs ?? DEFAULT_MAX_REMOTE_CLOCK_ADVANCE_MS;
  if (!Number.isSafeInteger(maxRemoteClockAdvanceMs) || maxRemoteClockAdvanceMs < 0) {
    throw new RangeError("shared store maxRemoteClockAdvanceMs must be a non-negative safe integer");
  }
  return { maxRemoteClockAdvanceMs, now: options.now ?? (() => Date.now()), peerId };
}

export function createSharedStore<T extends object>(initialState: T, options: SharedStoreOptions = {}): SharedStoreApi<T> {
  const { maxRemoteClockAdvanceMs, now, peerId } = normalizeSharedStoreOptions(initialState, options);
  let base: object = cloneSerializable(initialState);
  const source = cloneSerializable(initialState);
  const listeners = new Set<(patch: SharedStorePatch) => void>();
  const clocks = new Map<string, ClockEntry>();
  const patches = new Map<string, SharedStorePatch>();
  let logicalTimestamp = 0;
  let disposed = false;

  function nextTimestamp() {
    const sampledTime = now();
    const currentTime = Number.isFinite(sampledTime) ? Math.max(0, Math.floor(sampledTime)) : Date.now();
    const next = Math.max(currentTime, logicalTimestamp + 1);
    if (!Number.isSafeInteger(next)) throw new Error("shared store logical clock exhausted");
    return next;
  }

  function acceptsRemoteTimestamp(timestamp: number) {
    const sampledTime = now();
    const currentTime = Number.isFinite(sampledTime) ? Math.max(0, Math.floor(sampledTime)) : Date.now();
    const reference = Math.max(currentTime, logicalTimestamp);
    const maximum = Math.min(Number.MAX_SAFE_INTEGER, reference + maxRemoteClockAdvanceMs);
    return timestamp <= maximum;
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

  function materialize(replay: ReadonlyMap<string, SharedStorePatch>, replayBase: object = base) {
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
    let next: object;
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

  function applyPatch(patch: SharedStorePatch) {
    if (!isSharedStorePatch(patch) || !acceptsRemoteTimestamp(patch.timestamp)) return false;
    return commitPatch(patch, false);
  }

  function applySnapshot(snapshot: SharedStoreSnapshot) {
    const snapshotBase = snapshot.base ?? snapshot.state;
    if (!isSharedStoreSnapshot(snapshot)) return false;
    if (snapshot.clocks.some((clock) => !acceptsRemoteTimestamp(clock.timestamp))) return false;
    if (snapshot.patches?.some((patch) => !acceptsRemoteTimestamp(patch.timestamp))) return false;
    let nextBase: object;
    try {
      nextBase = cloneSerializable(snapshotBase);
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
    let incomingState: object;
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

    let nextState: object;
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

  function exportSnapshot(): SharedStoreSnapshot {
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

  return createSharedStoreProxy({
    applyPatch,
    applySnapshot,
    commitPatch,
    dispose,
    exportSnapshot,
    nextTimestamp,
    peerId,
    source,
    subscribe
  });
}
