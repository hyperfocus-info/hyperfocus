import { isRecord } from '@hyperfocus/utilities/records';
import { readCombatAiLearning, type CombatAiLearning } from '@hyperfocus/engine/project/runtime-3d';
import type { PolicyBackend } from '../learning/backend.ts';

export type ContextualTrainingRow = { opponentKey: string; model: CombatAiLearning };
export const CONTEXTUAL_TRAINING_OPPONENT_LIMIT = 16;
const RECORD_BYTES = 1048576;

function identity(value: string) {
  if (typeof value !== 'string' || !value || value.length > 4096) throw Error('Invalid contextual training content identity.');
}
function revision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Invalid contextual training revision.');
}
function object(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) throw Error('Invalid contextual training record.');
  const row = value;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw Error('Invalid contextual training fields.');
  return row;
}
function rows(value: unknown): ContextualTrainingRow[] {
  if (!Array.isArray(value) || value.length > CONTEXTUAL_TRAINING_OPPONENT_LIMIT) throw Error('Contextual training opponent limit exceeded.');
  const keys = new Set<string>();
  return value.map(value => {
    const row = object(value, ['opponentKey', 'model']);
    if (typeof row.opponentKey !== 'string' || !row.opponentKey || row.opponentKey.length > 160 || keys.has(row.opponentKey)) throw Error('Invalid or duplicate contextual opponent.');
    keys.add(row.opponentKey);
    const model = readCombatAiLearning(row.model), fresh = readCombatAiLearning(undefined).transient;
    if (model.opponentId !== row.opponentKey || model.pending !== null || model.next !== null || model.traces.length
      || model.transient.eventIds.length || (['frame', 'serial', 'habitFrame', 'distance', 'x', 'z'] as const).some(key => !Object.is(model.transient[key], fresh[key]))) {
      throw Error('Contextual training models must be between-set checkpoints for their logical opponent.');
    }
    return { opponentKey: row.opponentKey, model };
  });
}
function empty(contentIdentity: string) {
  const rows: ContextualTrainingRow[] = [];
  return { version: 1 as const, contentIdentity, revision: 0, rows };
}
function bounded(text: string) {
  if (text.length > RECORD_BYTES || new TextEncoder().encode(text).byteLength > RECORD_BYTES) throw Error('Contextual training record exceeds its storage budget.');
}
function checksum(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function encode(record: ReturnType<typeof empty>) {
  const payload = JSON.stringify(record), encoded = JSON.stringify({ payload, checksum: checksum(payload) });
  bounded(encoded);return encoded;
}
function decode(raw: unknown, contentIdentity: string) {
  if (raw === null) return empty(contentIdentity);
  if (typeof raw !== 'string') throw Error('Invalid contextual training storage value.');
  bounded(raw);
  const envelope = object(JSON.parse(raw), ['payload', 'checksum']);
  if (typeof envelope.payload !== 'string' || envelope.checksum !== checksum(envelope.payload)) throw Error('Contextual training checksum is corrupt.');
  const record = object(JSON.parse(envelope.payload), ['version', 'contentIdentity', 'revision', 'rows']);
  revision(record.revision);
  if (record.version !== 1 || record.contentIdentity !== contentIdentity || record.revision < 1) throw Error('Contextual training identity or version is incompatible.');
  return { version: 1 as const, contentIdentity, revision: record.revision, rows: rows(record.rows) };
}

/** Separate from approved score offsets; transactions resolve only after a strict durable commit. */
export function createIndexedContextualTrainingBackend(options: { factory?: IDBFactory } = {}): PolicyBackend {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) { reject(Error('Contextual training IndexedDB storage is unavailable.'));return; }
    const request = factory.open('hyperfocus-combat-contextual-learning', 1);
    let settled = false;
    const timeout = setTimeout(() => { settled = true;reject(Error('Contextual training database open timed out.')); }, 10000);
    const fail = (error: Error | DOMException) => { clearTimeout(timeout);settled = true;reject(error); };
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('banks')) request.result.createObjectStore('banks'); };
    request.onblocked = () => fail(Error('Contextual training database upgrade is blocked by another tab.'));
    request.onerror = () => fail(request.error ?? Error('Contextual training database could not open.'));
    request.onsuccess = () => { clearTimeout(timeout);if (settled) request.result.close();else { settled = true;resolve(request.result); } };
  });
  async function transaction(contentIdentity: string, mutate?: (raw: unknown) => string) {
    const database = await open();
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = mutate ? database.transaction('banks', 'readwrite', { durability: 'strict' }) : database.transaction('banks', 'readonly');
        const store = transaction.objectStore('banks'), request = store.get(contentIdentity);
        let result: unknown, failure: unknown;
        request.onsuccess = () => {
          try { result = request.result ?? null;if (mutate) { result = mutate(result);store.put(result, contentIdentity); } }
          catch (error) { failure = error;transaction.abort(); }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error ?? Error('Contextual training transaction aborted.'));
      });
    } finally { database.close(); }
  }
  return { read: contentIdentity => transaction(contentIdentity), async transact(contentIdentity, mutate) {
    const result = await transaction(contentIdentity, mutate);
    if (typeof result !== 'string') throw Error('Contextual training transaction returned invalid data.');
    return result;
  } };
}

export function createContextualTrainingStore(options: { contentIdentity: string; previousContentIdentity?: string; backend?: PolicyBackend; factory?: IDBFactory }) {
  const { contentIdentity } = options;identity(contentIdentity);
  const backend = options.backend ?? createIndexedContextualTrainingBackend({ factory: options.factory });
  const listeners = new Set<(record: ReturnType<typeof empty>) => void>();
  function publish(record: ReturnType<typeof empty>) {
    for (const listener of listeners) {
      try { listener(structuredClone(record)); } catch { /* Observers cannot undo a durable commit. */ }
    }
    return record;
  }
  async function commit(next: ContextualTrainingRow[], expectedRevision: number, discardInvalid = false) {
    revision(expectedRevision);
    const raw = await backend.transact(contentIdentity, raw => {
      let current;
      try { current = decode(raw, contentIdentity); }
      catch (error) { if (!discardInvalid) throw error;current = empty(contentIdentity); }
      if (current.revision !== expectedRevision) throw Error('Contextual training revision conflict; reload before saving.');
      if (current.revision === Number.MAX_SAFE_INTEGER) throw Error('Contextual training revision exhausted.');
      return encode({ ...current, revision: current.revision + 1, rows: next });
    });
    return publish(decode(raw, contentIdentity));
  }
  return {
    async load() {
      const raw = await backend.read(contentIdentity);
      if (raw === null && options.previousContentIdentity && options.previousContentIdentity !== contentIdentity) {
        const previous = decode(await backend.read(options.previousContentIdentity), options.previousContentIdentity);
        return publish({ ...empty(contentIdentity), rows: previous.rows });
      }
      return publish(decode(raw, contentIdentity));
    },
    subscribe(listener: (record: ReturnType<typeof empty>) => void) { listeners.add(listener);return () => { listeners.delete(listener); }; },
    async save(options: { rows: readonly ContextualTrainingRow[]; expectedRevision: number }) { return commit(rows(options.rows), options.expectedRevision); },
    /** Explicit recovery may discard a corrupt bank, using expectedRevision zero; valid banks still enforce revision checks. */
    reset(options: { expectedRevision: number; discardInvalid?: boolean }) { return commit([], options.expectedRevision, options.discardInvalid); },
  };
}
