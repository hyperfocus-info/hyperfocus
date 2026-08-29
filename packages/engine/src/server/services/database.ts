import { Database } from "bun:sqlite";
import {
  normalizePortablePersistenceRecord,
  validatePortablePersistenceSnapshot,
  type PortablePersistenceAdapter,
  type PortablePersistenceLimits,
  type PortablePersistenceSnapshot
} from "../operations/operations.ts";

const DEFAULT_MAX_RECORDS = 100_000;
const DEFAULT_MAX_EVENTS = 1_000_000;
const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export type SqlitePersistenceAdapterOptions = PortablePersistenceLimits & {
  path: string;
  busyTimeoutMs?: number;
};

export type SqlitePersistenceAdapter = PortablePersistenceAdapter & { close(): void };

export function createSqlitePersistenceAdapter(options: SqlitePersistenceAdapterOptions): SqlitePersistenceAdapter {
  if (typeof options.path !== "string" || options.path.length === 0) throw new Error("sqlite persistence path is required");
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
    throw new RangeError("sqlite persistence busyTimeoutMs must be an integer from 0 through 60000");
  }
  const maxPlayers = options.maxPlayers ?? DEFAULT_MAX_RECORDS;
  const maxRooms = options.maxRooms ?? DEFAULT_MAX_RECORDS;
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  for (const [label, value] of [["maxPlayers", maxPlayers], ["maxRooms", maxRooms], ["maxEvents", maxEvents]] as const) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 10_000_000) throw new RangeError(`sqlite persistence ${label} must be an integer from 1 through 10000000`);
  }
  validatePortablePersistenceSnapshot({ version: 1, players: [], rooms: [], events: [] }, options);

  const db = new Database(options.path);
  let closed = false;
  db.run("pragma journal_mode = WAL");
  db.run("pragma synchronous = FULL");
  db.run(`pragma busy_timeout = ${busyTimeoutMs}`);
  db.run("create table if not exists players (id text primary key, record text not null, updated_at integer not null)");
  db.run("create table if not exists rooms (id text primary key, snapshot text not null, updated_at integer not null)");
  db.run("create table if not exists events (id integer primary key autoincrement, event text not null, created_at integer not null)");

  const loadPlayer = db.query<{ record: string }, [string]>("select record from players where id = ?");
  const savePlayer = db.query("insert into players (id, record, updated_at) values (?, ?, ?) on conflict(id) do update set record = excluded.record, updated_at = excluded.updated_at");
  const loadRoom = db.query<{ snapshot: string }, [string]>("select snapshot from rooms where id = ?");
  const saveRoom = db.query("insert into rooms (id, snapshot, updated_at) values (?, ?, ?) on conflict(id) do update set snapshot = excluded.snapshot, updated_at = excluded.updated_at");
  const appendEvent = db.query("insert into events (event, created_at) values (?, ?)");
  const countPlayers = db.query<{ count: number }, []>("select count(*) as count from players");
  const countRooms = db.query<{ count: number }, []>("select count(*) as count from rooms");
  const countEvents = db.query<{ count: number }, []>("select count(*) as count from events");
  const hasPlayer = db.query<{ found: number }, [string]>("select 1 as found from players where id = ?");
  const hasRoom = db.query<{ found: number }, [string]>("select 1 as found from rooms where id = ?");

  function ensureOpen() {
    if (closed) throw new Error("sqlite persistence adapter is closed");
  }

  function record(value: unknown) {
    return JSON.stringify(normalizePortablePersistenceRecord(value, options));
  }

  function parseRecord(encoded: string, label: string) {
    let value: unknown;
    try {
      value = JSON.parse(encoded);
    } catch {
      throw new Error(`sqlite persistence ${label} contains corrupt JSON`);
    }
    return normalizePortablePersistenceRecord(value, options);
  }

  function assertId(id: string, label: string) {
    if (typeof id !== "string" || id.length === 0 || id.length > 512) throw new Error(`${label} must contain 1-512 characters`);
  }

  const appendBatch = db.transaction((encoded: readonly string[], createdAt: number) => {
    for (const event of encoded) appendEvent.run(event, createdAt);
  });
  const replaceSnapshot = db.transaction((snapshot: PortablePersistenceSnapshot) => {
    db.run("delete from players");
    db.run("delete from rooms");
    db.run("delete from events");
    const updatedAt = Date.now();
    for (const entry of snapshot.players) savePlayer.run(entry.id, JSON.stringify(entry.record), updatedAt);
    for (const entry of snapshot.rooms) saveRoom.run(entry.id, JSON.stringify(entry.snapshot), updatedAt);
    for (const event of snapshot.events) appendEvent.run(JSON.stringify(event), updatedAt);
  });

  return {
    async loadPlayer(playerId) {
      ensureOpen();
      assertId(playerId, "player id");
      const row = loadPlayer.get(playerId);
      return row ? parseRecord(row.record, `player ${playerId}`) : null;
    },
    async savePlayer(playerId, value) {
      ensureOpen();
      assertId(playerId, "player id");
      if (!hasPlayer.get(playerId) && countPlayers.get()!.count >= maxPlayers) throw new Error(`Portable persistence exceeds player limit ${maxPlayers}.`);
      savePlayer.run(playerId, record(value), Date.now());
    },
    async loadRoom(roomId) {
      ensureOpen();
      assertId(roomId, "room id");
      const row = loadRoom.get(roomId);
      return row ? parseRecord(row.snapshot, `room ${roomId}`) : null;
    },
    async saveRoom(roomId, value) {
      ensureOpen();
      assertId(roomId, "room id");
      if (!hasRoom.get(roomId) && countRooms.get()!.count >= maxRooms) throw new Error(`Portable persistence exceeds room limit ${maxRooms}.`);
      saveRoom.run(roomId, record(value), Date.now());
    },
    async appendEvent(value) {
      ensureOpen();
      if (countEvents.get()!.count >= maxEvents) throw new Error(`Portable persistence exceeds event limit ${maxEvents}.`);
      appendEvent.run(record(value), Date.now());
    },
    async appendEvents(values) {
      ensureOpen();
      if (!Array.isArray(values)) throw new TypeError("Portable persistence event batch must be an array.");
      if (countEvents.get()!.count + values.length > maxEvents) throw new Error(`Portable persistence exceeds event limit ${maxEvents}.`);
      appendBatch(values.map(record), Date.now());
    },
    async exportPortableSnapshot() {
      ensureOpen();
      return validatePortablePersistenceSnapshot({
        version: 1,
        players: db.query<{ id: string; record: string }, []>("select id, record from players order by id").all().map((entry) => ({ id: entry.id, record: parseRecord(entry.record, `player ${entry.id}`) })),
        rooms: db.query<{ id: string; snapshot: string }, []>("select id, snapshot from rooms order by id").all().map((entry) => ({ id: entry.id, snapshot: parseRecord(entry.snapshot, `room ${entry.id}`) })),
        events: db.query<{ id: number; event: string }, []>("select id, event from events order by id").all().map((entry) => parseRecord(entry.event, `event ${entry.id}`))
      }, options);
    },
    async replacePortableSnapshotAtomic(value) {
      ensureOpen();
      const snapshot = validatePortablePersistenceSnapshot(value, options);
      replaceSnapshot(snapshot);
    },
    close() {
      if (closed) return;
      closed = true;
      db.close();
    }
  };
}
