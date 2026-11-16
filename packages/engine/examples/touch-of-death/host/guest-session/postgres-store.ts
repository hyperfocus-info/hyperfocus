import type { SQL, TransactionSQL } from 'bun';
import { guestRejected } from './request.ts';

export const guestDay = 86400000;
export const guestHash = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
export const guestOpaque = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
export async function guestTransaction<T>(sql: SQL, run: (tx: TransactionSQL) => Promise<T>): Promise<T> {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(184772, 1)`;
    return run(tx);
  });
}
export async function prepareGuestPostgres(sql: SQL) {
  await guestTransaction(sql, async tx => {
    await tx`CREATE TABLE IF NOT EXISTS tod_guest_key (id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_guest_accounts (cookie_hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, expires BIGINT NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_guest_leases (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires BIGINT NOT NULL, sequence BIGSERIAL UNIQUE)`;
    await tx`CREATE INDEX IF NOT EXISTS tod_guest_leases_user ON tod_guest_leases(user_id)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_guest_replay (nonce TEXT PRIMARY KEY, expires BIGINT NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_guest_rates (key TEXT PRIMARY KEY, start BIGINT NOT NULL, count INTEGER NOT NULL)`;
    await tx`CREATE TABLE IF NOT EXISTS tod_guest_recovery (user_id TEXT PRIMARY KEY, active_hash TEXT UNIQUE, pending_hash TEXT UNIQUE, pending_until BIGINT NOT NULL)`;
    await tx`INSERT INTO tod_guest_key VALUES (1, ${guestOpaque()}) ON CONFLICT(id) DO NOTHING`;
  });
  const [row] = await sql`SELECT secret FROM tod_guest_key WHERE id=1`;
  if (!row || typeof row.secret !== 'string' || !/^[a-f0-9]{64}$/.test(row.secret)) throw Error('Invalid guest signing key.');
  const secret: unknown = row.secret;
  if (typeof secret !== 'string') throw Error('Invalid guest signing key.');
  return secret;
}
/** Caller holds the auth advisory transaction lock; failed allocations do not spend user quota. */
export async function guestRate(tx: TransactionSQL, key: string, maximum: number, time: number) {
  const [value] = await tx`SELECT start,count FROM tod_guest_rates WHERE key=${key}`;
  const active = value && time - Number(value.start) < 60000;
  if (active && value.count >= maximum) throw guestRejected('Too many requests. Try again shortly.', 429);
  await tx`INSERT INTO tod_guest_rates VALUES (${key},${active ? Number(value.start) : time},${active ? value.count + 1 : 1}) ON CONFLICT(key) DO UPDATE SET start=excluded.start,count=excluded.count`;
}
export async function currentGuestPostgres(sql: SQL, userId: string, lease: string, time: number) {
  const rows = await sql`SELECT 1 FROM tod_guest_leases l JOIN tod_guest_accounts a ON a.user_id=l.user_id WHERE l.hash=${lease} AND l.user_id=${userId} AND l.expires>${time} AND a.expires>${time}`;
  return rows.length === 1;
}
export async function issueGuestPostgres(options: { sql: SQL; time: number; cookie?: string; lease?: string; verifiedUserId?: string }) {
  const { sql, time } = options;
  await guestTransaction(sql, async tx => { await tx`DELETE FROM tod_guest_rates WHERE start<=${time - 60000}`;await guestRate(tx, 'global-token', 120, time); });
  return guestTransaction(sql, async tx => {
    await tx`DELETE FROM tod_guest_leases WHERE expires<=${time}`;await tx`DELETE FROM tod_guest_accounts WHERE expires<=${time}`;
    let userId: string, cookie: string | undefined;
    if (options.verifiedUserId) {
      userId = options.verifiedUserId;
      if (!/^clerk:user_[A-Za-z0-9]+$/.test(userId)) throw guestRejected('Invalid account identity.', 401);
      if (!(await tx`SELECT 1 FROM tod_guest_accounts WHERE user_id=${userId}`).length) await requireCapacity(tx, time);
      await tx`INSERT INTO tod_guest_accounts VALUES (${guestHash(`account:${userId}`)},${userId},${time + 30 * guestDay}) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires`;
    } else if (options.cookie) {
      const [account] = await tx`SELECT user_id FROM tod_guest_accounts WHERE cookie_hash=${guestHash(options.cookie)} AND expires>${time}`;
      if (!account) throw guestRejected('Guest identity expired. Restore your fighter or start a new guest.', 401, 'guest-identity-unavailable');
      userId = account.user_id;
    } else {
      if (options.lease) throw guestRejected('Guest cookie is required to refresh this connection.', 401, 'guest-identity-unavailable');
      await requireCapacity(tx, time);cookie = guestOpaque();userId = `guest:${crypto.randomUUID()}`;
      await tx`INSERT INTO tod_guest_accounts VALUES (${guestHash(cookie)},${userId},${time + 30 * guestDay})`;
    }
    await guestRate(tx, `user:${userId}`, 20, time);
    let lease = options.lease;
    if (lease) {
      if (!(await tx`SELECT 1 FROM tod_guest_leases WHERE hash=${guestHash(lease)} AND user_id=${userId} AND expires>${time}`).length) throw guestRejected('Connection lease expired. Leave and join again.', 401, 'guest-lease-expired');
    } else {
      await tx`DELETE FROM tod_guest_leases WHERE hash IN (SELECT hash FROM tod_guest_leases WHERE user_id=${userId} ORDER BY expires DESC,sequence DESC OFFSET 7)`;
      const [count] = await tx`SELECT count(*)::integer AS count FROM tod_guest_leases`;
      if (count.count >= 20000) throw guestRejected('Too many guest connections. Try again later.', 429);
      lease = guestOpaque();await tx`INSERT INTO tod_guest_leases(hash,user_id,expires) VALUES (${guestHash(lease)},${userId},${time + guestDay})`;
    }
    return { userId, lease, cookie };
  });
}
async function requireCapacity(tx: TransactionSQL, time: number) {
  await guestRate(tx, 'global-create', 10, time);
  const [count] = await tx`SELECT count(*)::integer AS count FROM tod_guest_accounts`;
  if (count.count >= 10000) throw guestRejected('Guest capacity reached. Ask the host for help.', 503);
}
