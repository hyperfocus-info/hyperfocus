import { Database } from "bun:sqlite";
import type { PersistenceAdapter } from "./types.ts";

export type SqlitePersistenceAdapterOptions = {
  path: string;
};

function stringifyPersistenceValue(value: unknown, label: string) {
  const encoded = JSON.stringify(value, (_key, entry) => {
    if (entry === undefined || typeof entry === "function" || typeof entry === "symbol" || typeof entry === "bigint") {
      throw new TypeError(`${label} must contain only JSON values`);
    }
    if (typeof entry === "number" && !Number.isFinite(entry)) throw new TypeError(`${label} numbers must be finite`);
    return entry;
  });
  if (encoded === undefined) throw new TypeError(`${label} must contain a JSON value`);
  return encoded;
}

export function createSqlitePersistenceAdapter(options: SqlitePersistenceAdapterOptions): PersistenceAdapter & { close(): void } {
  if (typeof options.path !== "string" || options.path.length === 0) throw new Error("sqlite persistence path is required");
  const db = new Database(options.path);
  let closed = false;
  db.run("create table if not exists players (id text primary key, record text not null, updated_at integer not null)");
  db.run("create table if not exists rooms (id text primary key, snapshot text not null, updated_at integer not null)");
  db.run("create table if not exists events (id integer primary key autoincrement, event text not null, created_at integer not null)");

  const loadPlayer = db.query<{ record: string }, [string]>("select record from players where id = ?");
  const savePlayer = db.query("insert into players (id, record, updated_at) values (?, ?, ?) on conflict(id) do update set record = excluded.record, updated_at = excluded.updated_at");
  const loadRoom = db.query<{ snapshot: string }, [string]>("select snapshot from rooms where id = ?");
  const saveRoom = db.query("insert into rooms (id, snapshot, updated_at) values (?, ?, ?) on conflict(id) do update set snapshot = excluded.snapshot, updated_at = excluded.updated_at");
  const appendEvent = db.query("insert into events (event, created_at) values (?, ?)");

  return {
    async loadPlayer(playerId) {
      const row = loadPlayer.get(playerId);
      return row ? JSON.parse(row.record) : null;
    },
    async savePlayer(playerId, record) {
      savePlayer.run(playerId, stringifyPersistenceValue(record, "player record"), Date.now());
    },
    async loadRoom(roomId) {
      const row = loadRoom.get(roomId);
      return row ? JSON.parse(row.snapshot) : null;
    },
    async saveRoom(roomId, snapshot) {
      saveRoom.run(roomId, stringifyPersistenceValue(snapshot, "room snapshot"), Date.now());
    },
    async appendEvent(event) {
      appendEvent.run(stringifyPersistenceValue(event, "event"), Date.now());
    },
    close() {
      if (closed) return;
      closed = true;
      db.close();
    }
  };
}
