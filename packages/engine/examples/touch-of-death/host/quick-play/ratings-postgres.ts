import type { SQL } from 'bun';
import { quickPlayInitialRating, updateQuickPlayRatings } from './policy.ts';
import type { RatingMatch } from './ratings.ts';
import { isRecord } from '@hyperfocus/utilities/records';

function identity(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw Error('Invalid ratings identity.');return value; }
function rating(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000) throw Error('Invalid stored rating.');return value; }
function timeValue(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Invalid ratings clock.');return value; }
function winnerValue(value: unknown): 0 | 1 | null { if (value !== 0 && value !== 1 && value !== null) throw Error('Invalid rating winner.');return value; }
function pair<T>(value: unknown, read: (value: unknown) => T): [T, T] { if (!Array.isArray(value) || value.length !== 2) throw Error('Invalid ratings pair.');return [read(value[0]), read(value[1])]; }
function receipt(value: unknown): RatingMatch {
  if (!isRecord(value)) throw Error('Invalid rating receipt.');
  // PostgreSQL JSONB is an unknown foreign record; each field is checked below.
  const row = value;
  if (row.status !== 'pending' && row.status !== 'complete' && row.status !== 'aborted') throw Error('Invalid rating status.');
  return { matchId: identity(row.matchId), users: pair(row.users, identity), before: pair(row.before, rating), after: pair(row.after, rating), status: row.status,
    winner: winnerValue(row.winner), createdAt: timeValue(row.createdAt), finishedAt: row.finishedAt === null ? null : timeValue(row.finishedAt) };
}

/** PostgreSQL owns every receipt and balance. The caller owns the SQL pool lifetime.
 * A transaction-scoped service lock serializes reservations and completions across
 * processes; no in-memory reservation can acknowledge an uncommitted write.
 */
export async function createPostgresQuickPlayRatings(options: { sql: SQL; now?: () => number }) {
  const { sql } = options;
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('tod-ratings'))`;
    await tx`CREATE TABLE IF NOT EXISTS tod_pg_ratings_players (user_id TEXT PRIMARY KEY, rating DOUBLE PRECISION NOT NULL CHECK(rating BETWEEN -100000 AND 100000))`;
    await tx`CREATE TABLE IF NOT EXISTS tod_pg_ratings_matches (match_id TEXT PRIMARY KEY, receipt JSONB NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_pg_ratings_active (user_id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES tod_pg_ratings_matches(match_id))`;
  });
  function time() { return timeValue((options.now ?? Date.now)()); }
  async function get({ userId }: { userId: string }) {
    identity(userId);const rows = await sql<{ rating: number }[]>`SELECT rating FROM tod_pg_ratings_players WHERE user_id=${userId}`;
    return rating(rows[0]?.rating ?? quickPlayInitialRating);
  }
  async function finish(matchId: string, winner: 0 | 1 | null, abort: boolean) {
    identity(matchId);winnerValue(winner);
    return sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('tod-ratings'))`;
      const rows = await tx<{ receipt: unknown }[]>`SELECT receipt FROM tod_pg_ratings_matches WHERE match_id=${matchId}`;
      if (!rows[0]) throw Error('Unknown ratings match.');
      const current = receipt(rows[0].receipt), status = abort ? 'aborted' : 'complete';
      if (current.status !== 'pending') {
        if (current.status !== status || current.winner !== winner) throw Error('Conflicting ratings result.');return current;
      }
      const after = abort ? current.before : updateQuickPlayRatings({ ratings: current.before, result: winner === null ? 'draw' : winner === 0 ? 'win' : 'loss' }).ratings;
      const result = receipt({ ...current, after, winner, status, finishedAt: time() });
      if (!abort) for (const [seat, userId] of current.users.entries()) await tx`INSERT INTO tod_pg_ratings_players (user_id,rating) VALUES (${userId},${result.after[seat]!}) ON CONFLICT(user_id) DO UPDATE SET rating=EXCLUDED.rating`;
      await tx`UPDATE tod_pg_ratings_matches SET receipt=${result}::jsonb WHERE match_id=${matchId}`;
      await tx`DELETE FROM tod_pg_ratings_active WHERE match_id=${matchId}`;
      return result;
    });
  }
  return {
    get,
    async reserve(request: { matchId: string; users: [string, string] }) {
      identity(request.matchId);pair(request.users, identity);
      if (request.users[0] === request.users[1]) throw Error('Rating participants must differ.');
      return sql.begin(async tx => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('tod-ratings'))`;
        const existing = await tx<{ receipt: unknown }[]>`SELECT receipt FROM tod_pg_ratings_matches WHERE match_id=${request.matchId}`;
        if (existing[0]) {
          const result = receipt(existing[0].receipt);
          if (JSON.stringify(result.users) !== JSON.stringify(request.users)) throw Error('Ratings match participants cannot change.');return result;
        }
        const before: [number, number] = [quickPlayInitialRating, quickPlayInitialRating];
        for (const [seat, userId] of request.users.entries()) {
          const active = await tx`SELECT match_id FROM tod_pg_ratings_active WHERE user_id=${userId}`;
          if (active.length) throw Error('Player already has an unfinished rated match.');
          const rows = await tx<{ rating: number }[]>`SELECT rating FROM tod_pg_ratings_players WHERE user_id=${userId}`;
          before[seat] = rating(rows[0]?.rating ?? quickPlayInitialRating);
        }
        const result: RatingMatch = { matchId: request.matchId, users: [...request.users], before, after: [...before], status: 'pending', winner: null, createdAt: time(), finishedAt: null };
        await tx`INSERT INTO tod_pg_ratings_matches (match_id,receipt) VALUES (${request.matchId},${result}::jsonb)`;
        for (const userId of request.users) await tx`INSERT INTO tod_pg_ratings_active (user_id,match_id) VALUES (${userId},${request.matchId})`;
        return result;
      });
    },
    complete(request: { matchId: string; winner: 0 | 1 | null }) { return finish(request.matchId, request.winner, false); },
    abort({ matchId }: { matchId: string }) { return finish(matchId, null, true); },
    async pending() {
      const rows = await sql<{ receipt: unknown }[]>`SELECT receipt FROM tod_pg_ratings_matches WHERE receipt->>'status'='pending' ORDER BY (receipt->>'createdAt')::bigint,match_id`;
      return rows.map(row => receipt(row.receipt));
    },
    close() {},
  };
}
