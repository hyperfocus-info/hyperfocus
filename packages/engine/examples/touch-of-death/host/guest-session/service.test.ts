import { afterEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createGuestSessionService } from './service.ts';
import { readIssuedSession } from './response-fixture.ts';
const roots: string[] = [], services: ReturnType<typeof createGuestSessionService>[] = [];
afterEach(async () => { for (const service of services.splice(0)) service.close();for (const root of roots.splice(0)) { if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unsafe fixture cleanup');await rm(root, { recursive: true, force: true }); } });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'tod-guest-'));roots.push(root);let time = 100000;
  const options = { databasePath: join(root, 'guest.sqlite'), origin: 'http://127.0.0.1:8802', now: () => time };
  const open = () => { const service = createGuestSessionService(options);services.push(service);return service; };
  const request = (body: unknown = {}, cookie?: string, headers: Record<string, string> = {}) => new Request(options.origin + '/tod-guest-session', { method: 'POST', headers: { origin: options.origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
  return { options, open, request, advance(ms: number) { time += ms; } };
}
async function issued(service: ReturnType<typeof createGuestSessionService>, request: Request) {
  const response = (await service.handle(request))!;expect(response.status).toBe(200);return { response, value: readIssuedSession(await response.json()), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

test('untrusted verifier errors cannot impersonate public guest rejections', async () => {
  const f = await fixture();
  const service = createGuestSessionService({ ...f.options, async verifyIdentity() {
    throw Object.assign(new Error('private verifier detail'), { status: 400, code: 'private-code' });
  } });
  services.push(service);
  const response = (await service.handle(f.request()))!;
  expect(response.status).toBe(503);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(await response.json()).toEqual({ error: 'Guest service unavailable. Try again.' });
});
test('cookie account, signing keys and one-use replay survive reopen while refreshed tokens retain connection identity', async () => {
  const f = await fixture();let service = f.open();const first = await issued(service, f.request());
  expect(first.response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Strict; Path=/');expect(first.response.headers.get('cache-control')).toBe('no-store');
  const identity = await service.auth.verify(first.value.token);expect(identity.ok).toBe(true);expect((await service.auth.verify(first.value.token)).ok).toBe(false);
  service.close();service = f.open();expect((await service.auth.verify(first.value.token)).ok).toBe(false);
  const refresh = await issued(service, f.request({ lease: first.value.lease }, first.cookie));expect(refresh.cookie).toBeUndefined();expect(await service.auth.verify(refresh.value.token)).toEqual(identity);
  const next = await issued(service, f.request({}, first.cookie));const nextIdentity = await service.auth.verify(next.value.token);expect(nextIdentity.userId).toBe(identity.userId);expect(nextIdentity.sessionId).not.toBe(identity.sessionId);
  const pair = await issued(service, f.request({ lease: next.value.lease }, first.cookie));expect((await Promise.all([service.auth.verify(pair.value.token), service.auth.verify(pair.value.token)])).filter(value => value.ok)).toHaveLength(1);
});
test('cross-origin, hostile host, malformed bodies, foreign leases and expired refresh fail explicitly', async () => {
  const f = await fixture(), service = f.open();
  const invalidHeaders: Record<string, string>[] = [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { 'sec-fetch-site': 'cross-site' }, { 'content-type': 'text/plain' }];
  for (const headers of invalidHeaders) expect((await service.handle(f.request({}, undefined, headers)))!.status).toBeGreaterThanOrEqual(400);
  expect((await service.handle(f.request({ userId: 'admin' })))!.status).toBe(400);expect((await service.handle(f.request({ lease: 'x'.repeat(600) })))!.status).toBe(413);
  const a = await issued(service, f.request()), b = await issued(service, f.request());
  expect((await service.handle(f.request({ lease: a.value.lease }, b.cookie)))!.status).toBe(401);
  expect((await service.handle(f.request({ lease: a.value.lease })))!.status).toBe(401);
  f.advance(30001);expect((await service.auth.verify(a.value.token)).ok).toBe(false);f.advance(86400000);
  expect((await service.handle(f.request({ lease: a.value.lease }, a.cookie)))!.status).toBe(401);
  expect((await service.auth.verify('dev:fake')).ok).toBe(false);
});
test('normal repeated joins retain a bounded lease cache and issuance throttles without changing account', async () => {
  const f = await fixture(), service = f.open(), first = await issued(service, f.request());
  let last = first;for (let index = 0; index < 10; index++) last = await issued(service, f.request({}, first.cookie));
  const db = new Database(f.options.databasePath);expect(db.query('SELECT count(*) AS count FROM tod_guest_leases').get()).toEqual({ count: 8 });db.close();
  expect((await service.handle(f.request({ lease: first.value.lease }, first.cookie)))!.status).toBe(401);
  for (let index = 0; index < 9; index++) await issued(service, f.request({ lease: last.value.lease }, first.cookie));
  expect((await service.handle(f.request({ lease: last.value.lease }, first.cookie)))!.status).toBe(429);f.advance(60000);
  expect((await service.handle(f.request({ lease: last.value.lease }, first.cookie)))!.status).toBe(200);
});
test('failed durable allocation publishes no cookie or credential and replay storage failure denies admission', async () => {
  const f = await fixture(), service = f.open(), db = new Database(f.options.databasePath);
  db.run("CREATE TRIGGER fail_guest BEFORE INSERT ON tod_guest_leases BEGIN SELECT RAISE(ABORT,'private storage error'); END");
  const failed = (await service.handle(f.request()))!;expect(failed.status).toBe(503);expect(failed.headers.get('set-cookie')).toBeNull();expect(await failed.text()).not.toContain('private storage error');expect(db.query('SELECT count(*) AS count FROM tod_guest_accounts').get()).toEqual({ count: 0 });
  db.run('DROP TRIGGER fail_guest');const accepted = await issued(service, f.request());
  db.run("CREATE TRIGGER fail_replay BEFORE INSERT ON tod_guest_replay BEGIN SELECT RAISE(ABORT,'offline'); END");expect((await service.auth.verify(accepted.value.token)).ok).toBe(false);db.run('DROP TRIGGER fail_replay');expect((await service.auth.verify(accepted.value.token)).ok).toBe(true);db.close();
});

test('expired accounts are reclaimed and invalid leases consume the global request budget', async () => {
  const f = await fixture(), service = f.open(), first = await issued(service, f.request());
  for (let index = 0; index < 119; index++) expect((await service.handle(f.request({ lease: 'a'.repeat(64) }, first.cookie)))!.status).toBe(401);
  expect((await service.handle(f.request({}, first.cookie)))!.status).toBe(429);
  f.advance(2592000001);const next = await issued(service, f.request());
  expect((await service.handle(f.request({}, first.cookie)))!.status).toBe(401);
  const db = new Database(f.options.databasePath);
  try { expect(db.query('SELECT count(*) AS count FROM tod_guest_accounts').get()).toEqual({ count: 1 }); } finally { db.close(); }
  expect((await service.auth.verify(next.value.token)).ok).toBe(true);
});

test('identity and lease failures offer distinct recovery without replacing an account', async () => {
  const f = await fixture(), service = f.open(), first = await issued(service, f.request());
  const identity = await service.auth.verify(first.value.token);
  f.advance(86400001);
  const expiredLease = (await service.handle(f.request({ lease: first.value.lease }, first.cookie)))!;
  expect(expiredLease.status).toBe(401);expect(await expiredLease.json()).toMatchObject({ code: 'guest-lease-expired' });
  expect(expiredLease.headers.get('set-cookie')).toBeNull();
  const rejoin = await issued(service, f.request({}, first.cookie));
  expect((await service.auth.verify(rejoin.value.token)).userId).toBe(identity.userId);
  f.advance(2592000000);
  for (const cookie of [first.cookie, 'tod_guest=invalid']) {
    const rejected = (await service.handle(f.request({}, cookie)))!;
    expect(rejected.status).toBe(401);expect(await rejected.json()).toMatchObject({ code: 'guest-identity-unavailable' });
    expect(rejected.headers.get('set-cookie')).toBeNull();
  }
  const lostCookie = (await service.handle(f.request({ lease: rejoin.value.lease })))!;
  expect(lostCookie.status).toBe(401);expect(await lostCookie.json()).toMatchObject({ code: 'guest-identity-unavailable' });
  expect(lostCookie.headers.get('set-cookie')).toBeNull();
});

test('slow request bodies time out and secure origins issue secure cookies', async () => {
  const f = await fixture(), service = f.open();let cancelled = false;
  const request = new Request(f.options.origin + '/tod-guest-session', { method: 'POST', headers: { origin: f.options.origin, 'content-type': 'application/json' }, body: new ReadableStream({ cancel() { cancelled = true; } }) });
  expect((await service.handle(request))!.status).toBe(408);expect(cancelled).toBe(true);
  service.close();const secure = createGuestSessionService({ ...f.options, origin: 'https://game.example' });services.push(secure);
  const response = (await secure.handle(new Request('https://game.example/tod-guest-session', { method: 'POST', headers: { origin: 'https://game.example', 'content-type': 'application/json' }, body: '{}' })))!;
  expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('; Secure');
});



test('Clerk exchange preserves account across browsers, rejects cross-account leases and disables guest recovery', async () => {
  const f = await fixture();
  const service = createGuestSessionService({ ...f.options, async verifyIdentity(request) {
    const value = request.headers.get('authorization');
    if (value !== 'Bearer first' && value !== 'Bearer second') throw Error('Authentication required');
    return value === 'Bearer first' ? 'clerk:user_first' : 'clerk:user_second';
  } });services.push(service);
  expect((await service.handle(f.request()))!.status).not.toBe(200);
  const first = await issued(service, f.request({}, undefined, { authorization: 'Bearer first' }));
  expect(first.cookie).toBeUndefined();
  const identity = await service.auth.verify(first.value.token);expect(identity.ok).toBe(true);
  if (identity.ok) expect(identity.userId).toBe('clerk:user_first');
  const otherBrowser = await issued(service, f.request({}, undefined, { authorization: 'Bearer first' }));
  const otherIdentity = await service.auth.verify(otherBrowser.value.token);
  if (otherIdentity.ok && identity.ok) expect(otherIdentity.userId).toBe(identity.userId);
  expect((await service.handle(f.request({ lease: first.value.lease }, undefined, { authorization: 'Bearer second' })))!.status).toBe(401);
  const refreshed = await issued(service, f.request({ lease: first.value.lease }, undefined, { authorization: 'Bearer first' }));
  expect(refreshed.value.lease).toBe(first.value.lease);
  const recovery = new Request(f.options.origin + '/tod-guest-recovery', { method: 'POST', headers: { origin: f.options.origin, 'content-type': 'application/json', authorization: 'Bearer first' }, body: JSON.stringify({ operation: 'restore', key: 'a'.repeat(64) }) });
  expect((await service.handle(recovery))!.status).toBe(404);
});
