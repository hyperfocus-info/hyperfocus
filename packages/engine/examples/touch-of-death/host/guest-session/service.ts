import { guestRejected, isGuestRejected, readGuestRequest } from './request.ts';
import { createGuestRecovery } from './recovery.ts';
import { Database } from 'bun:sqlite';
import { createSignedSessionAuthority, type SessionReplayStore } from '@hyperfocus/engine/server';
import type { AuthAdapter } from '@hyperfocus/engine/server';
const cookieName = 'tod_guest', day = 86400000;
const opaque = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const hash = (value: string) => new Bun.CryptoHasher('sha256').update(value).digest('hex');
/** Local host policy. Cookie identifies an account; each page connection owns a separate lease. */
export function createGuestSessionService(options: { databasePath: string; origin: string; now?: () => number; verifyIdentity?: (request: Request) => Promise<string>; onRestore?: (userId:string)=>Promise<void> }) {
  const origin = new URL(options.origin);
  if (origin.origin !== options.origin || origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol)
    || origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Guest sessions require an exact HTTPS or loopback origin.');
  const db = new Database(options.databasePath, { create: true, strict: true });
  db.run('PRAGMA journal_mode=WAL');db.run('PRAGMA synchronous=FULL');db.run('PRAGMA busy_timeout=5000');
  db.run('CREATE TABLE IF NOT EXISTS tod_guest_key (id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL)');
  db.run('INSERT OR IGNORE INTO tod_guest_key VALUES (1, ?)', [opaque()]);
  db.run('CREATE TABLE IF NOT EXISTS tod_guest_accounts (cookie_hash TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS tod_guest_leases (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS tod_guest_replay (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS tod_guest_rates (key TEXT PRIMARY KEY, start INTEGER NOT NULL, count INTEGER NOT NULL)');
  const secret = db.query<{ secret: string }, []>('SELECT secret FROM tod_guest_key WHERE id=1').get()!.secret;
  if (!/^[a-f0-9]{64}$/.test(secret)) { db.close();throw new Error('Invalid guest signing key.'); }
  let closed = false;
  const now = () => { const value = (options.now ?? Date.now)();if (closed || !Number.isSafeInteger(value) || value < 0) throw new Error('Guest session service unavailable.');return value; };
  const replayStore: SessionReplayStore = { async consume(nonce, expiresAt, time) {
    now();return db.transaction(() => {
      db.run('DELETE FROM tod_guest_replay WHERE expires<=?', [time]);
      if (db.query('SELECT 1 FROM tod_guest_replay WHERE nonce=?').get(nonce)) return 'replayed' as const;
      if (db.query<{ count: number }, []>('SELECT count(*) AS count FROM tod_guest_replay').get()!.count >= 10000) return 'saturated' as const;
      db.run('INSERT INTO tod_guest_replay VALUES (?,?)', [nonce, expiresAt]);return 'accepted' as const;
    }).immediate();
  } };
  const authority = createSignedSessionAuthority({ issuer: options.origin, audience: 'tod-demo', keys: [{ id: 'guest-v1', secret: new Uint8Array(Buffer.from(secret, 'hex')) }], activeKeyId: 'guest-v1', sessionTtlMs: 30000, maxSessionTtlMs: 30000, maxClockSkewMs: 0, maxAttributesBytes: 256, replayStore, now });
  function rate(key: string, maximum: number, time: number) {
    const value = db.query<{ start: number; count: number }, [string]>('SELECT start,count FROM tod_guest_rates WHERE key=?').get(key);
    if (value && time - value.start < 60000 && value.count >= maximum) throw guestRejected('Too many requests. Try again shortly.', 429);
    db.run('INSERT OR REPLACE INTO tod_guest_rates VALUES (?,?,?)', [key, value && time - value.start < 60000 ? value.start : time, value && time - value.start < 60000 ? value.count + 1 : 1]);
  }
  function issueIdentity(cookie: string | undefined, requestedLease: string | undefined, verifiedUserId?: string) {
    const time = now();db.transaction(() => { db.run('DELETE FROM tod_guest_rates WHERE start<=?', [time - 60000]);rate('global-token', 120, time); }).immediate();
    return db.transaction(() => {
      db.run('DELETE FROM tod_guest_leases WHERE expires<=?', [time]);db.run('DELETE FROM tod_guest_accounts WHERE expires<=?', [time]);
      let setCookie: string | undefined, userId: string;
      if (verifiedUserId) {
        userId = verifiedUserId;
        if (!/^clerk:user_[A-Za-z0-9]+$/.test(userId)) throw guestRejected('Invalid account identity.', 401);
        if (!db.query('SELECT 1 FROM tod_guest_accounts WHERE user_id=?').get(userId)) {
          rate('global-create', 10, time);
          if (db.query<{ count: number }, []>('SELECT count(*) AS count FROM tod_guest_accounts').get()!.count >= 10000) throw guestRejected('Account capacity reached.', 503);
        }
        db.run('INSERT INTO tod_guest_accounts VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires', [hash(`account:${userId}`), userId, time + 30 * day]);
      } else if (cookie) {
        const account = db.query<{ user_id: string; expires: number }, [string]>('SELECT user_id,expires FROM tod_guest_accounts WHERE cookie_hash=?').get(hash(cookie));
        if (!account || account.expires <= time) throw guestRejected('Guest identity expired. Clear this site cookie to start a new guest.', 401, 'guest-identity-unavailable');
        userId = account.user_id;
      } else {
        if (requestedLease) throw guestRejected('Guest cookie is required to refresh this connection.', 401, 'guest-identity-unavailable');
        rate('global-create', 10, time);
        if (db.query<{ count: number }, []>('SELECT count(*) AS count FROM tod_guest_accounts').get()!.count >= 10000) throw guestRejected('Guest capacity reached. Ask the host for help.', 503);
        const token = opaque();userId = `guest:${crypto.randomUUID()}`;
        db.run('INSERT INTO tod_guest_accounts VALUES (?,?,?)', [hash(token), userId, time + 30 * day]);
        setCookie = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${origin.protocol === 'https:' ? '; Secure' : ''}`;
      }
      rate(`user:${userId}`, 20, time);
      let lease = requestedLease;
      if (lease) {
        const row = db.query<{ user_id: string; expires: number }, [string]>('SELECT user_id,expires FROM tod_guest_leases WHERE hash=?').get(hash(lease));
        if (!row || row.user_id !== userId || row.expires <= time) throw guestRejected('Connection lease expired. Leave and join again.', 401, 'guest-lease-expired');
      } else {
        db.run('DELETE FROM tod_guest_leases WHERE hash IN (SELECT hash FROM tod_guest_leases WHERE user_id=? ORDER BY expires DESC,rowid DESC LIMIT -1 OFFSET 7)', [userId]);
        if (db.query<{ count: number }, []>('SELECT count(*) AS count FROM tod_guest_leases').get()!.count >= 20000) throw guestRejected('Too many guest connections. Try again later.', 429);
        lease = opaque();db.run('INSERT INTO tod_guest_leases VALUES (?,?,?)', [hash(lease), userId, time + day]);
      }
      return { userId, lease, setCookie };
    }).immediate();
  }
  const recovery=createGuestRecovery({db,now,rate,onRestore:options.onRestore});
  const auth: AuthAdapter = { isCurrent(identity) {
    try {
      const lease=identity.sessionId?.replace(/^guest-session:/,'');
      if(!lease || !/^[a-f0-9]{64}$/.test(lease))return false;
      const row=db.query<{user_id:string;expires:number},[string]>('SELECT user_id,expires FROM tod_guest_leases WHERE hash=?').get(lease);
      const account=db.query<{expires:number},[string]>('SELECT expires FROM tod_guest_accounts WHERE user_id=?').get(identity.userId),time=now();
      return !!row && row.user_id===identity.userId && row.expires>time && !!account && account.expires>time;
    }catch{return false;}
  }, async verify(token) {
    try {
      const identity = await authority.verify(token), lease = identity.attributes.lease;
      if (typeof lease !== 'string' || !/^[a-f0-9]{64}$/.test(lease)) return { ok: false, reason: 'Invalid guest session.' };
      const row = db.query<{ user_id: string; expires: number }, [string]>('SELECT user_id,expires FROM tod_guest_leases WHERE hash=?').get(lease);
      const time = now(), account = db.query<{ expires: number }, [string]>('SELECT expires FROM tod_guest_accounts WHERE user_id=?').get(identity.subject);
      if (!row || row.user_id !== identity.subject || row.expires <= time || !account || account.expires <= time) return { ok: false, reason: 'Guest connection expired.' };
      return { ok: true, userId: identity.subject, sessionId: `guest-session:${lease}` };
    } catch { return { ok: false, reason: 'Guest session rejected.' }; }
  } };
  return { auth,
    async handle(request: Request): Promise<Response | undefined> {
      const recoveryRequest=new URL(request.url).pathname==='/tod-guest-recovery';
      if (!recoveryRequest && new URL(request.url).pathname !== '/tod-guest-session') return;
      const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      try {
        const value=await readGuestRequest(request,origin);
        if (options.verifyIdentity && recoveryRequest) throw guestRejected('Manage account recovery through Clerk.', 404);
        const verifiedUserId = options.verifyIdentity ? await options.verifyIdentity(request) : undefined;
        if (!recoveryRequest && Object.keys(value).some(key=>key!=='lease')) throw guestRejected('Invalid session request.',400);
        const lease = Reflect.get(value, 'lease');if (lease !== undefined && (typeof lease !== 'string' || !/^[a-f0-9]{64}$/.test(lease))) throw guestRejected('Invalid connection lease.', 400);
        const cookies = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
        const restoring = recoveryRequest && value.operation === 'restore';
        if (!options.verifyIdentity && !restoring && (cookies.length > 1 || cookies[0] && !/^tod_guest=[a-f0-9]{64}$/.test(cookies[0]))) throw guestRejected('Invalid guest cookie.', 401, 'guest-identity-unavailable');
        if(recoveryRequest){const result=await recovery.handle(value,restoring?undefined:cookies[0]?.slice(cookieName.length+1));if(result.cookie)headers.set('Set-Cookie',`${cookieName}=${result.cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${origin.protocol==='https:'?'; Secure':''}`);return Response.json({ok:true},{headers});}
        const issued = issueIdentity(cookies[0]?.slice(cookieName.length + 1), lease, verifiedUserId);
        const token = await authority.issue(issued.userId, { attributes: { lease: hash(issued.lease) } });
        if (issued.setCookie) headers.set('Set-Cookie', issued.setCookie);
        return Response.json({ token, lease: issued.lease }, { headers });
      } catch (error) { return Response.json({ error: isGuestRejected(error) ? error.message : 'Guest service unavailable. Try again.', ...(isGuestRejected(error) && error.code ? { code: error.code } : {}) }, { status: isGuestRejected(error) ? error.status : 503, headers }); }
    },
    close() { if (!closed) { closed = true;db.close(); } },
  };
}
