const DEFAULT_DATABASE_NAME = "hyperfocus-save-profiles";
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 16;
const STORE_NAME = "profiles";

export type IndexedDbSaveStorageOptions = {
  databaseName?: string;
  maxBytes?: number;
  maxRetries?: number;
  indexedDB?: IDBFactory;
  onError?: (error: BrowserSaveStorageError) => void;
};

export type BrowserSaveStorageErrorCode = "quota-exceeded" | "unavailable" | "blocked" | "transaction-failed" | "corrupt-data";

export function createBrowserSaveStorageError(code: BrowserSaveStorageErrorCode, message: string, cause?: unknown) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.name = "BrowserSaveStorageError";
  return Object.assign(error, { code, cause });
}

export type BrowserSaveStorageError = ReturnType<typeof createBrowserSaveStorageError>;

export function isBrowserSaveStorageError(cause: unknown): cause is BrowserSaveStorageError {
  return cause instanceof Error && cause.name === "BrowserSaveStorageError" && typeof Reflect.get(cause, "code") === "string";
}

export function normalizeBrowserSaveStorageError(cause: unknown): BrowserSaveStorageError {
  if (isBrowserSaveStorageError(cause)) return cause;
  const name = cause !== null && typeof cause === "object" ? Reflect.get(cause, "name") : undefined;
  if (name === "QuotaExceededError") {
    return createBrowserSaveStorageError("quota-exceeded", "Browser storage quota is exhausted; the save was not committed.", cause);
  }
  if (name === "InvalidStateError" || name === "NotSupportedError" || name === "SecurityError") {
    return createBrowserSaveStorageError("unavailable", "IndexedDB is unavailable in the current browser context.", cause);
  }
  return createBrowserSaveStorageError("transaction-failed", "IndexedDB save transaction failed.", cause);
}

type IndexedDbSaveStorageState = {
  factory: IDBFactory;
  databaseName: string;
  maxBytes: number;
  maxRetries: number;
  onError: IndexedDbSaveStorageOptions["onError"];
  database: Promise<IDBDatabase> | undefined;
};

/** Creates optimistic compare-and-swap browser save storage with explicit disposal. */
export function createIndexedDbSaveStorage(options: IndexedDbSaveStorageOptions = {}) {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw createBrowserSaveStorageError("unavailable", "IndexedDB is unavailable; browser save profiles cannot persist.");
  const state: IndexedDbSaveStorageState = {
    factory,
    databaseName: boundedText(options.databaseName ?? DEFAULT_DATABASE_NAME, "Save database name", 256),
    maxBytes: positiveInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes"),
    maxRetries: positiveInteger(options.maxRetries ?? DEFAULT_MAX_RETRIES, "maxRetries"),
    onError: options.onError,
    database: undefined,
  };
  return Object.freeze({
    read: (key: string) => readIndexedDbSave(state, key),
    updateAtomic: (key: string, update: (current: Uint8Array | undefined) => Promise<Uint8Array | undefined>) => updateIndexedDbSave(state, key, update),
    async close() {
      const database = state.database ? await state.database : undefined;
      database?.close();
      state.database = undefined;
    },
  });
}

export type IndexedDbSaveStorage = ReturnType<typeof createIndexedDbSaveStorage>;

async function readIndexedDbSave(state: IndexedDbSaveStorageState, key: string): Promise<Uint8Array | undefined> {
  storageKey(key);
  try {
    const database = await openIndexedDbSave(state);
    const transaction = database.transaction(STORE_NAME, "readonly");
    const value = await request(transaction.objectStore(STORE_NAME).get(key));
    await transactionDone(transaction);
    return storedBytes(value, state.maxBytes);
  } catch (cause) {
    throw delegateIndexedDbSaveError(state, cause);
  }
}

async function updateIndexedDbSave(state: IndexedDbSaveStorageState, key: string, update: (current: Uint8Array | undefined) => Promise<Uint8Array | undefined>): Promise<Uint8Array | undefined> {
  storageKey(key);
  if (typeof update !== "function") throw new TypeError("Atomic save update must be a function.");
  for (let attempt = 0; attempt < state.maxRetries; attempt += 1) {
    const current = await readIndexedDbSave(state, key);
    const proposed = await update(current ? new Uint8Array(current) : undefined);
    if (proposed !== undefined && !(proposed instanceof Uint8Array)) throw new TypeError("Atomic save update must return Uint8Array or undefined.");
    if (proposed && proposed.byteLength > state.maxBytes) throw new Error(`Browser save value exceeds byte limit ${state.maxBytes}.`);
    try {
      if (await compareAndSwapIndexedDbSave(state, key, current, proposed)) return proposed ? new Uint8Array(proposed) : undefined;
    } catch (cause) {
      throw delegateIndexedDbSaveError(state, cause);
    }
  }
  throw new Error(`Browser save update exceeded ${state.maxRetries} atomic conflict retries.`);
}

function delegateIndexedDbSaveError(state: IndexedDbSaveStorageState, cause: unknown) {
  const error = normalizeBrowserSaveStorageError(cause);
  state.onError?.(error);
  return error;
}

async function compareAndSwapIndexedDbSave(state: IndexedDbSaveStorageState, key: string, expected: Uint8Array | undefined, proposed: Uint8Array | undefined) {
  const database = await openIndexedDbSave(state);
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  const latest = storedBytes(await request(store.get(key)), state.maxBytes);
  if (!sameBytes(expected, latest)) {
    await transactionDone(transaction);
    return false;
  }
  if (proposed === undefined) store.delete(key);
  else store.put(new Uint8Array(proposed), key);
  await transactionDone(transaction);
  return true;
}

function openIndexedDbSave(state: IndexedDbSaveStorageState): Promise<IDBDatabase> {
  if (state.database) return state.database;
  state.database = new Promise((resolve, reject) => {
    const opening = state.factory.open(state.databaseName, 1);
    opening.addEventListener("upgradeneeded", () => {
      if (!opening.result.objectStoreNames.contains(STORE_NAME)) opening.result.createObjectStore(STORE_NAME);
    });
    opening.addEventListener("success", () => resolve(opening.result), { once: true });
    opening.addEventListener("error", () => reject(opening.error ?? new Error("IndexedDB save database failed to open.")), { once: true });
    opening.addEventListener("blocked", () => reject(createBrowserSaveStorageError("blocked", "IndexedDB save database upgrade is blocked by another page.")), { once: true });
  });
  return state.database;
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener("success", () => resolve(value.result), { once: true });
    value.addEventListener("error", () => reject(value.error ?? new Error("IndexedDB save request failed.")), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB save transaction was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB save transaction failed.")), { once: true });
  });
}

function storedBytes(value: unknown, maxBytes: number): Uint8Array | undefined {
  if (value === undefined) return undefined;
  const bytes = value instanceof Uint8Array ? new Uint8Array(value) : value instanceof ArrayBuffer ? new Uint8Array(value.slice(0)) : undefined;
  if (!bytes) throw createBrowserSaveStorageError("corrupt-data", "IndexedDB save value is not a byte array.");
  if (bytes.byteLength > maxBytes) throw new Error(`Browser save value exceeds byte limit ${maxBytes}.`);
  return bytes;
}

function sameBytes(left: Uint8Array | undefined, right: Uint8Array | undefined) {
  if (!left || !right) return left === right;
  if (left.byteLength !== right.byteLength) return false;
  let different = 0;
  for (let index = 0; index < left.byteLength; index += 1) different |= left[index] ^ right[index];
  return different === 0;
}

function storageKey(value: string) {
  boundedText(value, "Save storage key", 2_048);
}

function boundedText(value: unknown, label: string, maxBytes: number): string {
  if (typeof value !== "string" || !value || new TextEncoder().encode(value).byteLength > maxBytes || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be non-empty bounded text without control characters.`);
  }
  return value;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}
