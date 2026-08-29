import { Database } from "bun:sqlite";
import type { DurableJson, DurableServiceStore, DurableServiceTransaction, DurableStoreRecord, DurableStoreScan } from "./durable-service-types.ts";
import { parseDurableJson, validateDurableServiceRecords, validateDurableStoreRecord } from "./durable-services.ts";

export type SqliteDurableServiceStoreOptions = {
  path: string;
  busyTimeoutMs?: number;
};

/** Bun SQLite implementation. Every service callback runs in BEGIN IMMEDIATE. */
export function createSqliteDurableServiceStore(options: SqliteDurableServiceStoreOptions): DurableServiceStore & { close(): void } {
  if (typeof options.path !== "string" || !options.path) throw new Error("SQLite durable service path is required.");
  const timeout = options.busyTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 60_000) throw new Error("busyTimeoutMs must be 0-60000.");
  const db = new Database(options.path, { create: true, strict: true });
  db.run("pragma journal_mode = WAL");
  db.run("pragma synchronous = FULL");
  db.run(`pragma busy_timeout = ${timeout}`);
  db.run("create table if not exists durable_records (bucket text not null, key text not null, value text not null, primary key(bucket, key)) without rowid");
  db.run("create table if not exists durable_sequences (name text primary key, value integer not null check(value >= 0)) without rowid");

  const getRecord = db.query<{ value: string }, [string, string]>("select value from durable_records where bucket = ? and key = ?");
  const putRecord = db.query("insert into durable_records(bucket,key,value) values(?,?,?) on conflict(bucket,key) do update set value=excluded.value");
  const deleteRecord = db.query("delete from durable_records where bucket = ? and key = ?");
  const scanForward = db.query<{ key: string; value: string }, [string, string, string, string, number]>("select key,value from durable_records where bucket = ? and key >= ? and key < ? and key > ? order by key asc limit ?");
  const scanReverse = db.query<{ key: string; value: string }, [string, string, string, string, number]>("select key,value from durable_records where bucket = ? and key >= ? and key < ? and key < ? order by key desc limit ?");
  const getSequence = db.query<{ value: number }, [string]>("select value from durable_sequences where name = ?");
  const putSequence = db.query("insert into durable_sequences(name,value) values(?,?) on conflict(name) do update set value=excluded.value");
  const allRecords = db.query<{ bucket: string; key: string; value: string }, []>("select bucket,key,value from durable_records order by bucket,key");
  const allSequences = db.query<{ name: string; value: number }, []>("select name,value from durable_sequences order by name");
  const clearRecords = db.query("delete from durable_records");
  const clearSequences = db.query("delete from durable_sequences");
  let closed = false;

  const transaction: DurableServiceTransaction = {
    get(bucket, key) { const row = getRecord.get(bucket, key); return row ? parse(row.value) : undefined; },
    put(bucket, key, value) { validateDurableStoreRecord({ bucket, key, value }); putRecord.run(bucket, key, stringify(value)); },
    delete(bucket, key) { return deleteRecord.run(bucket, key).changes > 0; },
    scan(bucket, options) { return scan(bucket, options); },
    nextSequence(name) {
      const current = getSequence.get(name)?.value ?? 0;
      if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) throw new Error(`SQLite sequence ${name} is corrupt or exhausted.`);
      const next = current + 1;
      putSequence.run(name, next);
      return next;
    },
  };

  function scan(bucket: string, options: DurableStoreScan): DurableStoreRecord[] {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 1_000_000) throw new Error("SQLite scan limit is invalid.");
    const prefix = options.prefix ?? "";
    const upper = `${prefix}\uffff`;
    const rows = options.reverse
      ? scanReverse.all(bucket, prefix, upper, options.after ?? upper, options.limit)
      : scanForward.all(bucket, prefix, upper, options.after ?? "", options.limit);
    return rows.map((row) => ({ bucket, key: row.key, value: parse(row.value) }));
  }

  function ensureOpen() { if (closed) throw new Error("SQLite durable service store is closed."); }

  return {
    async transaction<T>(operation: (value: DurableServiceTransaction) => T) {
      ensureOpen();
      return db.transaction(() => {
        const value = operation(transaction);
        if (isPromiseLike(value)) {
          throw new Error("Durable store transaction callbacks must be synchronous.");
        }
        return value;
      }).immediate();
    },
    async exportRecords() {
      ensureOpen();
      const records: DurableStoreRecord[] = [
        ...allRecords.all().map((row) => ({ bucket: row.bucket, key: row.key, value: parse(row.value) })),
        ...allSequences.all().map((row) => ({ bucket: "$sequence", key: row.name, value: row.value })),
      ];
      return records.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.key.localeCompare(b.key));
    },
    async replaceRecordsAtomic(records) {
      ensureOpen();
      validateDurableServiceRecords(records);
      db.transaction(() => {
        clearRecords.run(); clearSequences.run();
        const seen = new Set<string>();
        for (const record of records) {
          validateDurableStoreRecord(record, true);
          const unique = `${record.bucket}\0${record.key}`;
          if (seen.has(unique)) throw new Error(`Duplicate durable SQLite record ${record.bucket}/${record.key}.`);
          seen.add(unique);
          if (record.bucket === "$sequence") {
            if (typeof record.value !== "number" || !Number.isSafeInteger(record.value) || record.value < 0) throw new Error(`Invalid durable SQLite sequence ${record.key}.`);
            putSequence.run(record.key, record.value);
          } else putRecord.run(record.bucket, record.key, stringify(record.value));
        }
      }).immediate();
    },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}

function stringify(value: DurableJson) {
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("SQLite durable value must be JSON.");
  return result;
}

function parse(value: string): DurableJson {
  try {
    const parsed: unknown = JSON.parse(value);
    return parseDurableJson(parsed);
  }
  catch { throw new Error("SQLite durable record contains corrupt JSON."); }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null
    && (typeof value === "object" || typeof value === "function")
    && "then" in value
    && typeof value.then === "function";
}
