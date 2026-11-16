import type { SQL, TransactionSQL } from 'bun';
import { validateDurableServiceRecords, validateDurableStoreRecord, type DurableServiceStore, type DurableStoreRecord } from '@hyperfocus/engine/server';
import { createDurableTransaction } from './transaction.ts';

/** Snapshot bridge for the engine's synchronous callback contract; one locked PostgreSQL commit. */
export async function createPostgresDurableServiceStore(options: { sql: SQL; maxRecords?: number; maxBytes?: number }): Promise<DurableServiceStore & { close(): void }> {
  const { sql } = options, maxRecords = options.maxRecords ?? 100_000, maxBytes = options.maxBytes ?? 67108864;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 1_000_000 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 536870912) throw new Error('Invalid PostgreSQL durable store bounds.');
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('tod:durable'))`;
    await tx`CREATE TABLE IF NOT EXISTS tod_durable_records (bucket text COLLATE "C" NOT NULL, key text COLLATE "C" NOT NULL, value text NOT NULL, PRIMARY KEY(bucket,key))`;
  });
  let closed = false;
  function ensureOpen() { if (closed) throw new Error('PostgreSQL durable service store is closed.'); }
  function bounded(records: readonly DurableStoreRecord[]) {
    if (records.length > maxRecords) throw new Error('PostgreSQL durable record limit exceeded.');
    if (new TextEncoder().encode(JSON.stringify(records)).byteLength > maxBytes) throw new Error('PostgreSQL durable byte limit exceeded.');
  }
  async function read(tx: TransactionSQL): Promise<DurableStoreRecord[]> {
    const [size] = await tx`SELECT count(*)::integer AS count, coalesce(sum(octet_length(bucket)+octet_length(key)+octet_length(value)),0)::bigint AS bytes FROM tod_durable_records`;
    if (size.count > maxRecords || Number(size.bytes) > maxBytes) throw new Error('PostgreSQL durable store exceeds snapshot bounds.');
    const rows: Array<{ bucket: string; key: string; value: string }> = await tx`SELECT bucket,key,value FROM tod_durable_records ORDER BY bucket,key`;
    const records = rows.map(row => ({ bucket: row.bucket, key: row.key, value: JSON.parse(row.value) }));
    bounded(records);for (const row of records) validateDurableStoreRecord(row, true);return records;
  }
  return {
    async transaction(operation) {
      ensureOpen();
      return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod:durable'))`;
        const before = await read(tx), memory = createDurableTransaction(before);
        const result = operation(memory.transaction);
        if (result !== null && (typeof result === 'object' || typeof result === 'function') && 'then' in result && typeof result.then === 'function') throw new Error('Durable store transaction callbacks must be synchronous.');
        const after = memory.records();bounded(after);
        const key = (row: DurableStoreRecord) => JSON.stringify([row.bucket, row.key]);
        const previous = new Map(before.map(row => [key(row), JSON.stringify(row.value)])), remaining = new Set(after.map(key));
        for (const row of before) if (!remaining.has(key(row))) await tx`DELETE FROM tod_durable_records WHERE bucket=${row.bucket} AND key=${row.key}`;
        for (const row of after) {
          const encoded = JSON.stringify(row.value);if (previous.get(key(row)) === encoded) continue;
          await tx`INSERT INTO tod_durable_records(bucket,key,value) VALUES (${row.bucket},${row.key},${encoded}) ON CONFLICT(bucket,key) DO UPDATE SET value=excluded.value`;
        }
        return result;
      });
    },
    async exportRecords() { ensureOpen();return sql.begin(async tx => { await tx`SELECT pg_advisory_xact_lock(hashtext('tod:durable'))`;return read(tx); }); },
    async replaceRecordsAtomic(records) {
      ensureOpen();bounded(records);validateDurableServiceRecords(records);
      const next = structuredClone(records);
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod:durable'))`;await tx`DELETE FROM tod_durable_records`;
        for (const row of next) await tx`INSERT INTO tod_durable_records(bucket,key,value) VALUES (${row.bucket},${row.key},${JSON.stringify(row.value)})`;
      });
    },
    close() { closed = true; },
  };
}
