import { validateDurableStoreRecord, type DurableStoreRecord, type DurableServiceTransaction } from '@hyperfocus/engine/server';

/** Per-transaction detached workspace. It escapes neither the advisory lock nor SQL commit. */
export function createDurableTransaction(records: readonly DurableStoreRecord[]) {
  const identity = (bucket: string, key: string) => JSON.stringify([bucket, key]);
  const rows = new Map(records.map(row => [identity(row.bucket, row.key), structuredClone(row)]));
  const transaction: DurableServiceTransaction = {
    get(bucket, key) { const row = rows.get(identity(bucket, key));return row ? structuredClone(row.value) : undefined; },
    put(bucket, key, value) { const row = { bucket, key, value };validateDurableStoreRecord(row);rows.set(identity(bucket, key), structuredClone(row)); },
    delete(bucket, key) { return rows.delete(identity(bucket, key)); },
    scan(bucket, options) {
      if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 1_000_000) throw new Error('Durable scan limit is invalid.');
      const matches = [...rows.values()].filter(row => row.bucket === bucket && (!options.prefix || row.key.startsWith(options.prefix))
        && (!options.after || (options.reverse ? row.key < options.after : row.key > options.after)));
      matches.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);if (options.reverse) matches.reverse();
      return structuredClone(matches.slice(0, options.limit));
    },
    nextSequence(name) {
      const key = identity('$sequence', name), current = rows.get(key)?.value ?? 0;
      if (typeof current !== 'number' || !Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) throw new Error('Durable sequence is corrupt or exhausted.');
      const row = { bucket: '$sequence', key: name, value: current + 1 };validateDurableStoreRecord(row, true);rows.set(key, row);return row.value;
    },
  };
  return { transaction, records: () => [...rows.values()].map(row => structuredClone(row)) };
}
