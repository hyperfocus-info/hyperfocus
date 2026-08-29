import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readTimestampPage } from "./presentation-pagination";
import { ensureNotificationRevisionTriggers } from "./notification-persistence";

test("presentation cursors reject foreign kinds and stale revisions", () => {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE entries (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  db.run(`INSERT INTO entries VALUES ('a', '2026-01-03', '2026-01-03'), ('b', '2026-01-02', '2026-01-02'), ('c', '2026-01-01', '2026-01-01')`);
  const read = (kind: "notifications" | "background-jobs", cursor?: string) => readTimestampPage<{ id: string; created_at: string }>({
    db, kind, select: `SELECT id, created_at, updated_at FROM entries`, cursor, limit: 1 });
  const cursor = read("notifications").nextCursor!;
  expect(() => read("background-jobs", cursor)).toThrow("Invalid or stale");
  db.run(`DELETE FROM entries WHERE id = 'c'`);
  expect(() => read("notifications", cursor)).toThrow("Invalid or stale");
  expect(() => read("notifications", "not-a-cursor")).toThrow("Invalid or stale");
});

test("notification payload-only updates stale existing cursors", () => {
  const db = new Database(":memory:"); db.run(`CREATE TABLE workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(`CREATE TABLE notifications (id TEXT PRIMARY KEY, payload_json TEXT, created_at TEXT, read_at TEXT, archived_at TEXT)`);
  ensureNotificationRevisionTriggers(db);
  db.run(`INSERT INTO notifications VALUES ('b', '{}', '2026-01-02', NULL, NULL), ('a', '{}', '2026-01-01', NULL, NULL)`);
  const read = (cursor?: string) => readTimestampPage<{ id: string; created_at: string }>({ db, kind: "notifications",
    select: `SELECT id, created_at, read_at, archived_at FROM notifications`, scope: "archived_at IS NULL", cursor, limit: 1,
    revisionSalt: db.query<{ value: string }, []>(`SELECT value FROM workspace_meta WHERE key = 'notification_revision'`).get()?.value });
  const cursor = read().nextCursor!; db.run(`UPDATE notifications SET payload_json = '{"changed":true}' WHERE id = 'b'`);
  expect(() => read(cursor)).toThrow("Invalid or stale");
});
