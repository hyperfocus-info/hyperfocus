import { Database } from 'bun:sqlite';
import { quickPlayInitialRating, updateQuickPlayRatings } from './policy.ts';

export type RatingMatch = { matchId: string; users: [string, string]; before: [number, number]; after: [number, number];
  status: 'pending' | 'complete' | 'aborted'; winner: 0 | 1 | null; createdAt: number; finishedAt: number | null };
/** Async storage is awaited at admission and mutation boundaries; snapshots show committed receipts. */
export type QuickPlayRatings = { [K in keyof ReturnType<typeof createQuickPlayRatings>]: (...args: Parameters<ReturnType<typeof createQuickPlayRatings>[K]>) => ReturnType<ReturnType<typeof createQuickPlayRatings>[K]> | Promise<ReturnType<ReturnType<typeof createQuickPlayRatings>[K]>> };
type Row = { match_id: string; user0: string; user1: string; before0: number; before1: number; after0: number; after1: number;
  status: RatingMatch['status']; winner: 0 | 1 | null; created_at: number; finished_at: number | null };

/** Host-only local ratings authority. Complete accepts trusted judged or concession outcomes.
 * The app coordinator owns terminal departure policy; host interruptions abort
 * without rating changes. Recover pending reservations explicitly after restart.
 */
export function createQuickPlayRatings(options: { path: string; now?: () => number }) {
  if (typeof options.path !== 'string' || !options.path) throw new Error('Ratings database path is required.');
  const db = new Database(options.path, { create: true, strict: true });
  db.run('PRAGMA journal_mode = WAL');db.run('PRAGMA synchronous = FULL');db.run('PRAGMA busy_timeout = 5000');
  db.run('CREATE TABLE IF NOT EXISTS tod_ratings_players (user_id TEXT PRIMARY KEY, rating REAL NOT NULL CHECK(rating >= -100000 AND rating <= 100000))');
  db.run(`CREATE TABLE IF NOT EXISTS tod_ratings_matches (match_id TEXT PRIMARY KEY, user0 TEXT NOT NULL, user1 TEXT NOT NULL,
    before0 REAL NOT NULL, before1 REAL NOT NULL, after0 REAL NOT NULL, after1 REAL NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','complete','aborted')), winner INTEGER, created_at INTEGER NOT NULL, finished_at INTEGER)`);
  db.run('CREATE TABLE IF NOT EXISTS tod_ratings_active (user_id TEXT PRIMARY KEY, match_id TEXT NOT NULL)');
  let closed = false;
  function open() { if (closed) throw new Error('Ratings database is closed.'); }
  function id(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error('Invalid ratings identity.');
  }
  function time() { const value = (options.now ?? Date.now)();if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid ratings clock.');return value; }
  function rating(value: number) { if (!Number.isFinite(value) || Math.abs(value) > 100000) throw new Error('Invalid stored rating.');return value; }
  const selectPlayer = db.query<{ rating: number }, [string]>('SELECT rating FROM tod_ratings_players WHERE user_id = ?');
  const selectMatch = db.query<Row, [string]>('SELECT * FROM tod_ratings_matches WHERE match_id = ?');
  function get({ userId }: { userId: string }) { open();id(userId);return rating(selectPlayer.get(userId)?.rating ?? quickPlayInitialRating); }
  function receipt(row: Row): RatingMatch {
    return { matchId: row.match_id, users: [row.user0, row.user1], before: [rating(row.before0), rating(row.before1)],
      after: [rating(row.after0), rating(row.after1)], status: row.status, winner: row.winner, createdAt: row.created_at, finishedAt: row.finished_at };
  }
  const reserve = db.transaction((request: { matchId: string; users: [string, string] }) => {
    const existing = selectMatch.get(request.matchId);
    if (existing) {
      if (existing.user0 !== request.users[0] || existing.user1 !== request.users[1]) throw new Error('Ratings match participants cannot change.');
      return receipt(existing);
    }
    for (const user of request.users) if (db.query('SELECT match_id FROM tod_ratings_active WHERE user_id = ?').get(user)) throw new Error('Player already has an unfinished rated match.');
    const before = request.users.map(userId => get({ userId })), createdAt = time();
    db.query(`INSERT INTO tod_ratings_matches VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`)
      .run(request.matchId, request.users[0], request.users[1], before[0]!, before[1]!, before[0]!, before[1]!, createdAt);
    for (const user of request.users) db.query('INSERT INTO tod_ratings_active VALUES (?, ?)').run(user, request.matchId);
    return receipt(selectMatch.get(request.matchId)!);
  });
  const finish = db.transaction((matchId: string, winner: 0 | 1 | null, abort: boolean) => {
    const current = selectMatch.get(matchId);if (!current) throw new Error('Unknown ratings match.');
    const status = abort ? 'aborted' : 'complete';
    if (current.status !== 'pending') {
      if (current.status !== status || current.winner !== winner) throw new Error('Conflicting ratings result.');
      return receipt(current);
    }
    let first = current.before0, second = current.before1;
    if (!abort) {
      [first, second] = updateQuickPlayRatings({ ratings: [first, second], result: winner === null ? 'draw' : winner === 0 ? 'win' : 'loss' }).ratings;
      rating(first);rating(second);
      db.query('INSERT INTO tod_ratings_players VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating').run(current.user0, first);
      db.query('INSERT INTO tod_ratings_players VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating').run(current.user1, second);
    }
    db.query('UPDATE tod_ratings_matches SET after0=?, after1=?, status=?, winner=?, finished_at=? WHERE match_id=?').run(first, second, status, winner, time(), matchId);
    db.query('DELETE FROM tod_ratings_active WHERE match_id=?').run(matchId);
    return receipt(selectMatch.get(matchId)!);
  });
  return {
    get,
    reserve(request: { matchId: string; users: [string, string] }) {
      open();id(request.matchId);
      if (!Array.isArray(request.users) || request.users.length !== 2) throw new Error('Two rating participants are required.');
      request.users.forEach(id);if (request.users[0] === request.users[1]) throw new Error('Rating participants must differ.');
      return reserve.immediate({ matchId: request.matchId, users: [...request.users] });
    },
    complete(request: { matchId: string; winner: 0 | 1 | null }) {
      open();id(request.matchId);if (request.winner !== 0 && request.winner !== 1 && request.winner !== null) throw new Error('Invalid rating winner.');
      return finish.immediate(request.matchId, request.winner, false);
    },
    abort({ matchId }: { matchId: string }) { open();id(matchId);return finish.immediate(matchId, null, true); },
    pending() { open();return db.query<Row, []>("SELECT * FROM tod_ratings_matches WHERE status='pending' ORDER BY created_at, match_id").all().map(receipt); },
    close() { if (!closed) { closed = true;db.close(); } },
  };
}
