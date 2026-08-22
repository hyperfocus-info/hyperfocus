import type { AtomicSaveStorage } from "./index.ts";

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

export class BrowserSaveStorageError extends Error {
  readonly code: BrowserSaveStorageErrorCode;
  readonly cause?: unknown;

  constructor(code: BrowserSaveStorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "BrowserSaveStorageError";
    this.code = code;
    this.cause = cause;
  }
}

export function normalizeBrowserSaveStorageError(cause: unknown): BrowserSaveStorageError {
  if (cause instanceof BrowserSaveStorageError) return cause;
  const named = cause as { name?: unknown; message?: unknown } | null;
  if (named?.name === "QuotaExceededError") {
    return new BrowserSaveStorageError("quota-exceeded", "Browser storage quota is exhausted; the save was not committed.", cause);
  }
  if (named?.name === "InvalidStateError" || named?.name === "NotSupportedError" || named?.name === "SecurityError") {
    return new BrowserSaveStorageError("unavailable", "IndexedDB is unavailable in the current browser context.", cause);
  }
  return new BrowserSaveStorageError("transaction-failed", "IndexedDB save transaction failed.", cause);
}

/**
 * Browser save storage with optimistic compare-and-swap commits. IndexedDB
 * serializes the final read/write transaction, so concurrent adapter instances
 * either commit against the bytes they read or retry the caller's update.
 */
export class IndexedDbSaveStorage implements AtomicSaveStorage {
  readonly #factory: IDBFactory;
  readonly #databaseName: string;
  readonly #maxBytes: number;
  readonly #maxRetries: number;
  readonly #onError?: (error: BrowserSaveStorageError) => void;
  #database: Promise<IDBDatabase> | undefined;

  constructor(options: IndexedDbSaveStorageOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new BrowserSaveStorageError("unavailable", "IndexedDB is unavailable; browser save profiles cannot persist.");
    this.#factory = factory;
    this.#databaseName = boundedText(options.databaseName ?? DEFAULT_DATABASE_NAME, "Save database name", 256);
    this.#maxBytes = positiveInteger(options.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes");
    this.#maxRetries = positiveInteger(options.maxRetries ?? DEFAULT_MAX_RETRIES, "maxRetries");
    this.#onError = options.onError;
  }

  async read(key: string): Promise<Uint8Array | undefined> {
    storageKey(key);
    try {
      const database = await this.#open();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const value = await request(transaction.objectStore(STORE_NAME).get(key));
      await transactionDone(transaction);
      return storedBytes(value, this.#maxBytes);
    } catch (cause) {
      throw this.#delegate(cause);
    }
  }

  async updateAtomic(
    key: string,
    update: (current: Uint8Array | undefined) => Promise<Uint8Array | undefined>,
  ): Promise<Uint8Array | undefined> {
    storageKey(key);
    if (typeof update !== "function") throw new TypeError("Atomic save update must be a function.");
    for (let attempt = 0; attempt < this.#maxRetries; attempt += 1) {
      const current = await this.read(key);
      const proposed = await update(current ? new Uint8Array(current) : undefined);
      if (proposed !== undefined && !(proposed instanceof Uint8Array)) throw new TypeError("Atomic save update must return Uint8Array or undefined.");
      if (proposed && proposed.byteLength > this.#maxBytes) throw new Error(`Browser save value exceeds byte limit ${this.#maxBytes}.`);
      try {
        if (await this.#compareAndSwap(key, current, proposed)) return proposed ? new Uint8Array(proposed) : undefined;
      } catch (cause) {
        throw this.#delegate(cause);
      }
    }
    throw new Error(`Browser save update exceeded ${this.#maxRetries} atomic conflict retries.`);
  }

  async close(): Promise<void> {
    const database = this.#database ? await this.#database : undefined;
    database?.close();
    this.#database = undefined;
  }

  #delegate(cause: unknown) {
    const error = normalizeBrowserSaveStorageError(cause);
    this.#onError?.(error);
    return error;
  }

  async #compareAndSwap(key: string, expected: Uint8Array | undefined, proposed: Uint8Array | undefined): Promise<boolean> {
    const database = await this.#open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const latest = storedBytes(await request(store.get(key)), this.#maxBytes);
    if (!sameBytes(expected, latest)) {
      await transactionDone(transaction);
      return false;
    }
    if (proposed === undefined) store.delete(key);
    else store.put(new Uint8Array(proposed), key);
    await transactionDone(transaction);
    return true;
  }

  #open(): Promise<IDBDatabase> {
    if (this.#database) return this.#database;
    this.#database = new Promise((resolve, reject) => {
      const opening = this.#factory.open(this.#databaseName, 1);
      opening.addEventListener("upgradeneeded", () => {
        if (!opening.result.objectStoreNames.contains(STORE_NAME)) opening.result.createObjectStore(STORE_NAME);
      });
      opening.addEventListener("success", () => resolve(opening.result), { once: true });
      opening.addEventListener("error", () => reject(opening.error ?? new Error("IndexedDB save database failed to open.")), { once: true });
      opening.addEventListener("blocked", () => reject(new BrowserSaveStorageError("blocked", "IndexedDB save database upgrade is blocked by another page.")), { once: true });
    });
    return this.#database;
  }
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
  if (!bytes) throw new BrowserSaveStorageError("corrupt-data", "IndexedDB save value is not a byte array.");
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
