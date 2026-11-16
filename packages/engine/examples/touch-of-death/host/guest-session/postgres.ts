import type { SQL } from 'bun';
import { createSignedSessionAuthority, type AuthAdapter, type SessionReplayStore } from '@hyperfocus/engine/server';
import { guestRejected, isGuestRejected, readGuestRequest } from './request.ts';
import { createPostgresGuestRecovery } from './postgres-recovery.ts';
import { currentGuestPostgres, guestHash, guestTransaction, issueGuestPostgres, prepareGuestPostgres } from './postgres-store.ts';

/** Shared PostgreSQL pool is owned by the host; no credentials enter game/project data. */
export async function createPostgresGuestSessionService(options: { sql: SQL; origin: string; now?: () => number; verifyIdentity?: (request: Request) => Promise<string>; onRestore?: (userId: string) => Promise<void> }) {
  const origin = new URL(options.origin), { sql } = options;
  if (origin.origin !== options.origin || origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol)
    || origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw Error('Guest sessions require an exact HTTPS or loopback origin.');
  const secret = await prepareGuestPostgres(sql);let closed = false;
  const now = () => { const time = (options.now ?? Date.now)();if (closed || !Number.isSafeInteger(time) || time < 0) throw Error('Guest session service unavailable.');return time; };
  const replayStore: SessionReplayStore = { async consume(nonce, expiresAt, time) {
    now();return guestTransaction(sql, async tx => {
      await tx`DELETE FROM tod_guest_replay WHERE expires<=${time}`;
      if ((await tx`SELECT 1 FROM tod_guest_replay WHERE nonce=${nonce}`).length) return 'replayed' as const;
      const [count] = await tx`SELECT count(*)::integer AS count FROM tod_guest_replay`;
      if (count.count >= 10000) return 'saturated' as const;
      await tx`INSERT INTO tod_guest_replay VALUES (${nonce},${expiresAt})`;return 'accepted' as const;
    });
  } };
  const authority = createSignedSessionAuthority({ issuer: options.origin, audience: 'tod-demo', keys: [{ id: 'guest-v1', secret: new Uint8Array(Buffer.from(secret, 'hex')) }], activeKeyId: 'guest-v1', sessionTtlMs: 30000, maxSessionTtlMs: 30000, maxClockSkewMs: 0, maxAttributesBytes: 256, replayStore, now });
  const auth: AuthAdapter = {
    async isCurrent(identity) {
      try { const lease = identity.sessionId?.replace(/^guest-session:/, '');return !!lease && /^[a-f0-9]{64}$/.test(lease) && await currentGuestPostgres(sql, identity.userId, lease, now()); } catch { return false; }
    },
    async verify(token) {
      try {
        const identity = await authority.verify(token), lease = identity.attributes.lease;
        if (typeof lease !== 'string' || !/^[a-f0-9]{64}$/.test(lease) || !await currentGuestPostgres(sql, identity.subject, lease, now())) return { ok: false, reason: 'Guest connection expired.' };
        return { ok: true, userId: identity.subject, sessionId: `guest-session:${lease}` };
      } catch { return { ok: false, reason: 'Guest session rejected.' }; }
    },
  };
  const recovery = createPostgresGuestRecovery({ sql, now, onRestore: options.onRestore });
  const setCookie = (headers: Headers, cookie: string) => headers.set('Set-Cookie', `tod_guest=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${origin.protocol === 'https:' ? '; Secure' : ''}`);
  return { auth,
    async handle(request: Request): Promise<Response | undefined> {
      const recoveryRequest = new URL(request.url).pathname === '/tod-guest-recovery';
      if (!recoveryRequest && new URL(request.url).pathname !== '/tod-guest-session') return;
      const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      try {
        now();const value = await readGuestRequest(request, origin);
        if (options.verifyIdentity && recoveryRequest) throw guestRejected('Manage account recovery through Clerk.', 404);
        const verifiedUserId = options.verifyIdentity ? await options.verifyIdentity(request) : undefined;
        if (!recoveryRequest && Object.keys(value).some(key => key !== 'lease')) throw guestRejected('Invalid session request.', 400);
        const lease = value.lease;
        if (lease !== undefined && (typeof lease !== 'string' || !/^[a-f0-9]{64}$/.test(lease))) throw guestRejected('Invalid connection lease.', 400);
        const cookies = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith('tod_guest='));
        const restoring = recoveryRequest && value.operation === 'restore';
        if (!options.verifyIdentity && !restoring && (cookies.length > 1 || cookies[0] && !/^tod_guest=[a-f0-9]{64}$/.test(cookies[0]))) throw guestRejected('Invalid guest cookie.', 401, 'guest-identity-unavailable');
        const cookie = cookies[0]?.slice('tod_guest='.length);
        if (recoveryRequest) {
          const result = await recovery.handle(value, restoring ? undefined : cookie);if (result.cookie) setCookie(headers, result.cookie);
          return Response.json({ ok: true }, { headers });
        }
        const issued = await issueGuestPostgres({ sql, time: now(), cookie, lease, verifiedUserId });
        const token = await authority.issue(issued.userId, { attributes: { lease: guestHash(issued.lease) } });
        if (issued.cookie) setCookie(headers, issued.cookie);
        return Response.json({ token, lease: issued.lease }, { headers });
      } catch (error) { return Response.json({ error: isGuestRejected(error) ? error.message : 'Guest service unavailable. Try again.', ...(isGuestRejected(error) && error.code ? { code: error.code } : {}) }, { status: isGuestRejected(error) ? error.status : 503, headers }); }
    },
    close() { closed = true; },
  };
}
