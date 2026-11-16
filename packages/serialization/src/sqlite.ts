import type { Database } from "bun:sqlite";
import { encodeValue, readStoredValue, type Limits } from "./value";

export type SqliteValueColumn = { table: string; column: string; parse?: (value: unknown) => unknown };

/** Host owns schema/version markers. All selected TEXT payloads upgrade atomically; existing BLOBs are untouched. */
export function upgradeSqliteValues(database: Database, columns: readonly SqliteValueColumn[],
  options: Limits & { invalid?: "preserve" | "reject" } = {}) {
  for (const { table, column } of columns) if (![table, column].every(name => /^[a-z_][a-z0-9_]*$/i.test(name))) {
    throw new Error("Invalid SQLite value column identifier");
  }
  return database.transaction(() => {
    let upgraded = 0;
    for (const { table, column, parse } of columns) {
      let after: number | null = null;
      const read = database.query<{ migration_rowid: number; value: string }, [number | null]>(
        `SELECT rowid AS migration_rowid, "${column}" AS value FROM "${table}" WHERE typeof("${column}")='text'
          AND (?1 IS NULL OR rowid>?1) ORDER BY rowid LIMIT 128`);
      const write = database.query(`UPDATE "${table}" SET "${column}"=?1 WHERE rowid=?2`);
      while (true) {
        const rows = read.all(after);
        if (!rows.length) break;
        for (const row of rows) {
          if (!Number.isSafeInteger(row.migration_rowid)) throw new Error("SQLite migration requires safe integer rowids");
          after = row.migration_rowid;
          let bytes: Uint8Array;
          try {
            const value = readStoredValue(row.value, options);
            bytes = encodeValue(parse ? parse(value) : value, options);
          } catch (error) {
            if (options.invalid === "preserve") continue;
            throw error;
          }
          write.run(bytes, row.migration_rowid); upgraded++;
        }
      }
    }
    return upgraded;
  }).immediate();
}
