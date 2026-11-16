import { afterAll, beforeAll, expect, test } from 'bun:test';
import { SQL } from 'bun';
import { createPostgresGuestSessionService } from './postgres.ts';
import { guestRejected } from './request.ts';

const configured = !!(process.env.TEST_POSTGRES_URL || process.env.TEST_POSTGRES_URL_FILE);
const pgTest = configured ? test : test.skip;
const schema = `tod_guest_test_${crypto.randomUUID().replaceAll('-', '')}`;
const origin = 'https://game.example';let sql: SQL, admin: SQL, time = Date.now();
beforeAll(async () => {
  if (!configured) return;
  const url = process.env.TEST_POSTGRES_URL ?? (await Bun.file(process.env.TEST_POSTGRES_URL_FILE!).text()).trim();
  admin = new SQL(url, { max: 2 });await admin.unsafe(`CREATE SCHEMA ${schema}`);
  sql = new SQL(url, { max: 6, connection: { search_path: schema } });
});
afterAll(async () => {
  if (!configured) return;
  await sql?.close();
  if (admin) { try { if (!/^tod_guest_test_[a-f0-9]{32}$/.test(schema)) throw Error('Unsafe test schema');await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.close(); } }
});
const request = (value: unknown = {}, cookie?: string, path = '/tod-guest-session', authorization?: string) => new Request(origin + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) }, body: JSON.stringify(value) });
async function issue(service: Awaited<ReturnType<typeof createPostgresGuestSessionService>>, cookie?: string, lease?: string, authorization?: string) {
  const response = (await service.handle(request(lease ? { lease } : {}, cookie, undefined, authorization)))!;
  expect(response.status).toBe(200);
  const body: { token: string; lease: string } = await response.json();return { ...body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

pgTest('PostgreSQL persists signing identity, atomically consumes nonces and recovers across service instances', async () => {
  const options = { sql, origin, now: () => time };let restored = '';
  const firstService = await createPostgresGuestSessionService(options);
  const first = await issue(firstService);expect(first.cookie).toBeDefined();
  const secondService = await createPostgresGuestSessionService({ ...options, async onRestore(id) { restored = id; } });
  const accepted = await Promise.all([firstService.auth.verify(first.token), secondService.auth.verify(first.token)]);
  expect(accepted.filter(value => value.ok).length).toBe(1);
  const identity = accepted.find(value => value.ok)!;if (!identity.ok) throw Error('No admitted identity');
  const refreshed = await issue(secondService, first.cookie, first.lease);
  expect(refreshed.lease).toBe(first.lease);expect((await firstService.auth.verify(refreshed.token)).ok).toBe(true);
  expect(await secondService.auth.isCurrent!(identity)).toBe(true);
  const key = 'a'.repeat(64);
  for (const operation of ['prepare', 'confirm']) expect((await firstService.handle(request({ operation, key }, first.cookie, '/tod-guest-recovery')))!.status).toBe(200);
  firstService.close();time += 2678400000;
  const recovery = (await secondService.handle(request({ operation: 'restore', key }, undefined, '/tod-guest-recovery')))!;
  expect(recovery.status).toBe(200);expect(restored).toBe(identity.userId);expect(await secondService.auth.isCurrent!(identity)).toBe(false);
  const cookie = recovery.headers.get('set-cookie')!.split(';')[0];
  const next = await issue(secondService, cookie);const nextIdentity = await secondService.auth.verify(next.token);
  expect(nextIdentity.ok && nextIdentity.userId).toBe(identity.userId);
  expect((await secondService.handle(request({}, first.cookie)))!.status).toBe(401);
  secondService.close();
});

pgTest('PostgreSQL recovery callback failures publish no cookie and retry without consuming the key', async () => {
  time += 60000;let fail = true;
  const service = await createPostgresGuestSessionService({ sql, origin, now: () => time, async onRestore() { if (fail) throw Error('fixture eviction failure'); } });
  const first = await issue(service), identity = await service.auth.verify(first.token), key = 'b'.repeat(64);
  for (const operation of ['prepare', 'confirm']) expect((await service.handle(request({ operation, key }, first.cookie, '/tod-guest-recovery')))!.status).toBe(200);
  const failed = (await service.handle(request({ operation: 'restore', key }, undefined, '/tod-guest-recovery')))!;
  expect(failed.status).toBe(503);expect(failed.headers.get('set-cookie')).toBeNull();
  if (identity.ok) expect(await service.auth.isCurrent!(identity)).toBe(false);
  fail = false;const restored = (await service.handle(request({ operation: 'restore', key }, undefined, '/tod-guest-recovery')))!;
  expect(restored.status).toBe(200);service.close();
});

pgTest('PostgreSQL Clerk exchange requires verifier, keeps stable identity and rejects foreign leases', async () => {
  time += 60000;
  const service = await createPostgresGuestSessionService({ sql, origin, now: () => time, async verifyIdentity(request) {
    const value = request.headers.get('authorization');if (!['Bearer alpha', 'Bearer beta'].includes(value ?? '')) throw guestRejected('Sign in required.', 401);
    return value === 'Bearer alpha' ? 'clerk:user_alpha' : 'clerk:user_beta';
  } });
  expect((await service.handle(request()))!.status).toBe(401);
  const first = await issue(service, undefined, undefined, 'Bearer alpha');expect(first.cookie).toBeUndefined();
  const identity = await service.auth.verify(first.token);expect(identity.ok && identity.userId).toBe('clerk:user_alpha');
  const other = await issue(service, undefined, undefined, 'Bearer alpha');const next = await service.auth.verify(other.token);expect(next.ok && next.userId).toBe('clerk:user_alpha');
  expect((await service.handle(request({ lease: first.lease }, undefined, undefined, 'Bearer beta')))!.status).toBe(401);
  expect((await service.handle(request({ operation: 'restore', key: 'a'.repeat(64) }, undefined, '/tod-guest-recovery', 'Bearer alpha')))!.status).toBe(404);
  service.close();
});

pgTest('PostgreSQL restore commits revocation before eviction and serializes competing restores', async () => {
  time += 60000;let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });const blocked = new Promise<void>(resolve => { release = resolve; });
  const options = { sql, origin, now: () => time };
  const firstService = await createPostgresGuestSessionService({ ...options, async onRestore() { entered();await blocked; } });
  const secondService = await createPostgresGuestSessionService(options), first = await issue(firstService), key = 'c'.repeat(64);
  for (const operation of ['prepare', 'confirm']) expect((await firstService.handle(request({ operation, key }, first.cookie, '/tod-guest-recovery')))!.status).toBe(200);
  const restoring = firstService.handle(request({ operation: 'restore', key }, undefined, '/tod-guest-recovery'));
  await started;expect((await secondService.handle(request({}, first.cookie)))!.status).toBe(401);
  const competing = secondService.handle(request({ operation: 'restore', key }, undefined, '/tod-guest-recovery'));
  release();const [earlier, later] = await Promise.all([restoring, competing]);
  expect(earlier!.status).toBe(200);expect(later!.status).toBe(200);
  const earlierCookie = earlier!.headers.get('set-cookie')!.split(';')[0], laterCookie = later!.headers.get('set-cookie')!.split(';')[0];
  expect((await firstService.handle(request({}, earlierCookie)))!.status).toBe(401);
  expect((await firstService.handle(request({}, laterCookie)))!.status).toBe(200);
  firstService.close();secondService.close();
});

pgTest('PostgreSQL allocation and replay failures roll back and never expose storage errors', async () => {
  time += 60000;const service = await createPostgresGuestSessionService({ sql, origin, now: () => time });
  await sql.unsafe("CREATE FUNCTION fail_guest_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private fixture storage error'; END $$");
  await sql.unsafe('CREATE TRIGGER guest_failure BEFORE INSERT ON tod_guest_leases FOR EACH ROW EXECUTE FUNCTION fail_guest_fixture()');
  const [before] = await sql`SELECT count(*)::integer AS count FROM tod_guest_accounts`;
  const failed = (await service.handle(request()))!;
  expect(failed.status).toBe(503);expect(failed.headers.get('set-cookie')).toBeNull();expect(await failed.text()).not.toContain('private fixture');
  const [after] = await sql`SELECT count(*)::integer AS count FROM tod_guest_accounts`;expect(after.count).toBe(before.count);
  await sql.unsafe('DROP TRIGGER guest_failure ON tod_guest_leases');
  const first = await issue(service);
  await sql.unsafe('CREATE TRIGGER nonce_failure BEFORE INSERT ON tod_guest_replay FOR EACH ROW EXECUTE FUNCTION fail_guest_fixture()');
  expect((await service.auth.verify(first.token)).ok).toBe(false);
  await sql.unsafe('DROP TRIGGER nonce_failure ON tod_guest_replay');
  expect((await service.auth.verify(first.token)).ok).toBe(true);service.close();
});
