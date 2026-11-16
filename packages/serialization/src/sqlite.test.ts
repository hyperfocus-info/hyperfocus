import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readStoredValue } from "./value";
import { upgradeSqliteValues } from "./sqlite";

test("protobuf upgrade pages old payloads, keeps corrupt evidence and rolls back failed commits", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, payload_json TEXT, browser_sessions_json TEXT)");
    const insert = db.query("INSERT INTO records VALUES (?, ?, ?)");
    for (let id = 1; id <= 260; id++) insert.run(id, JSON.stringify({ id, empty: null }), "[]");
    insert.run(261, "corrupt", "[]");
    db.exec("CREATE TRIGGER abort_upgrade BEFORE UPDATE ON records WHEN NEW.id=200 BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    expect(() => upgradeSqliteValues(db, [{ table: "records", column: "payload_json" }], { invalid: "preserve" })).toThrow("fixture failure");
    expect(db.query("SELECT count(*) AS count FROM records WHERE typeof(payload_json)='blob'").get()).toEqual({ count: 0 });
    db.exec("DROP TRIGGER abort_upgrade");
    expect(upgradeSqliteValues(db, [{ table: "records", column: "payload_json" }], { invalid: "preserve" })).toBe(260);
    expect(upgradeSqliteValues(db, [{ table: "records", column: "payload_json" }], { invalid: "preserve" })).toBe(0);
    expect(db.query("SELECT count(*) AS count FROM records WHERE typeof(payload_json)='blob'").get()).toEqual({ count: 260 });
    const row = db.query<{ payload_json: Uint8Array; browser_sessions_json: string }, []>("SELECT * FROM records WHERE id=260").get()!;
    expect(readStoredValue(row.payload_json)).toEqual({ id: 260, empty: null });
    expect(row.browser_sessions_json).toBe("[]");
    expect(db.query("SELECT payload_json FROM records WHERE id=261").get()).toEqual({ payload_json: "corrupt" });
  } finally { db.close(); }
});

test("unsafe SQLite rowids abort without skipping or rewriting a record", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, payload TEXT); INSERT INTO records VALUES (1, '{}'), (9223372036854775807, '{}')");
    expect(() => upgradeSqliteValues(db, [{ table: "records", column: "payload" }])).toThrow("safe integer rowids");
    expect(db.query("SELECT count(*) AS count FROM records WHERE typeof(payload)='text'").get()).toEqual({ count: 2 });
  } finally { db.close(); }
});
