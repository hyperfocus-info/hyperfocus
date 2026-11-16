import type { SQL } from 'bun';
import { normalizePortablePersistenceRecord, validatePortablePersistenceSnapshot, type PortablePersistenceAdapter, type PortablePersistenceLimits } from '@hyperfocus/engine/server';

/** Borrowed PostgreSQL pool. Limits and whole-snapshot writes serialize across host processes. */
export async function createPostgresPersistenceAdapter(options: { sql: SQL } & PortablePersistenceLimits): Promise<PortablePersistenceAdapter & { close(): void }> {
  const { sql } = options;
  validatePortablePersistenceSnapshot({ version: 1, players: [], rooms: [], events: [] }, options);
  const maxPlayers = options.maxPlayers ?? 100_000, maxRooms = options.maxRooms ?? 100_000, maxEvents = options.maxEvents ?? 1_000_000;
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('tod:persistence'))`;
    await tx`CREATE TABLE IF NOT EXISTS tod_players (id text COLLATE "C" PRIMARY KEY, record text NOT NULL, updated_at bigint NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_rooms (id text COLLATE "C" PRIMARY KEY, snapshot text NOT NULL, updated_at bigint NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event text NOT NULL, created_at bigint NOT NULL)`;
  });
  let closed = false;
  const ensureOpen = () => { if (closed) throw new Error('PostgreSQL persistence adapter is closed.'); };
  const record = (value: unknown) => JSON.stringify(normalizePortablePersistenceRecord(value, options));
  const parse = (value: string) => normalizePortablePersistenceRecord(JSON.parse(value), options);
  function id(value: string) { if (typeof value !== 'string' || !value.length || value.length > 512 || value.includes('\0')) throw new Error('Persistence id must contain 1-512 non-NUL characters.'); }
  async function append(values: readonly unknown[]) {
    ensureOpen();if (!Array.isArray(values)) throw new TypeError('Portable persistence event batch must be an array.');
    const encoded = values.map(record);
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('tod:persistence'))`;
      const [count] = await tx`SELECT count(*)::integer AS value FROM tod_events`;
      if (count.value + encoded.length > maxEvents) throw new Error(`Portable persistence exceeds event limit ${maxEvents}.`);
      for (const event of encoded) await tx`INSERT INTO tod_events(event,created_at) VALUES (${event},${Date.now()})`;
    });
  }
  return {
    async loadPlayer(playerId) { ensureOpen();id(playerId);const [row] = await sql`SELECT record FROM tod_players WHERE id=${playerId}`;return row ? parse(row.record) : null; },
    async loadRoom(roomId) { ensureOpen();id(roomId);const [row] = await sql`SELECT snapshot FROM tod_rooms WHERE id=${roomId}`;return row ? parse(row.snapshot) : null; },
    async savePlayer(playerId, value) {
      ensureOpen();id(playerId);const encoded = record(value);
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod:persistence'))`;
        const [count] = await tx`SELECT count(*)::integer AS value FROM tod_players`;
        const rows = await tx`SELECT id FROM tod_players WHERE id=${playerId}`;
        if (!rows.length && count.value >= maxPlayers) throw new Error(`Portable persistence exceeds player limit ${maxPlayers}.`);
        await tx`INSERT INTO tod_players(id,record,updated_at) VALUES (${playerId},${encoded},${Date.now()}) ON CONFLICT(id) DO UPDATE SET record=excluded.record,updated_at=excluded.updated_at`;
      });
    },
    async saveRoom(roomId, value) {
      ensureOpen();id(roomId);const encoded = record(value);
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod:persistence'))`;
        const [count] = await tx`SELECT count(*)::integer AS value FROM tod_rooms`;
        const rows = await tx`SELECT id FROM tod_rooms WHERE id=${roomId}`;
        if (!rows.length && count.value >= maxRooms) throw new Error(`Portable persistence exceeds room limit ${maxRooms}.`);
        await tx`INSERT INTO tod_rooms(id,snapshot,updated_at) VALUES (${roomId},${encoded},${Date.now()}) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at`;
      });
    },
    appendEvent: value => append([value]), appendEvents: append,
    async exportPortableSnapshot() {
      ensureOpen();
      return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod:persistence'))`;
        const players = await tx`SELECT id,record FROM tod_players ORDER BY id`, rooms = await tx`SELECT id,snapshot FROM tod_rooms ORDER BY id`, events = await tx`SELECT event FROM tod_events ORDER BY id`;
        return validatePortablePersistenceSnapshot({ version: 1, players: players.map((row: { id: string; record: string }) => ({ id: row.id, record: parse(row.record) })),
          rooms: rooms.map((row: { id: string; snapshot: string }) => ({ id: row.id, snapshot: parse(row.snapshot) })), events: events.map((row: { event: string }) => parse(row.event)) }, options);
      });
    },
    async replacePortableSnapshotAtomic(value) {
      ensureOpen();const next = validatePortablePersistenceSnapshot(value, options);
      await sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod:persistence'))`;
        await tx`DELETE FROM tod_players`;await tx`DELETE FROM tod_rooms`;await tx`DELETE FROM tod_events`;
        for (const row of next.players) await tx`INSERT INTO tod_players(id,record,updated_at) VALUES (${row.id},${JSON.stringify(row.record)},${Date.now()})`;
        for (const row of next.rooms) await tx`INSERT INTO tod_rooms(id,snapshot,updated_at) VALUES (${row.id},${JSON.stringify(row.snapshot)},${Date.now()})`;
        for (const event of next.events) await tx`INSERT INTO tod_events(event,created_at) VALUES (${JSON.stringify(event)},${Date.now()})`;
      });
    },
    close() { closed = true; },
  };
}
