import { expect, test } from 'bun:test';
import { defineSchema } from '../../protocol/schema.ts';
import { createAuthoritativeServer } from '../server.ts';
import type { RoomType } from '../core/types.ts';
import type { EngineServerWebSocket } from './server-contract.ts';

function gate() { let resolve!: () => void;const promise = new Promise<void>(accept => { resolve = accept; });return { promise, resolve }; }
function fixture(asyncCurrent = false) {
  const entered = gate(), release = gate(), revoked = new Set<string>(), leaves: string[] = [];
  let joins = 0, verifies = 0, checks = 0, throws = false;
  const room: RoomType<{ inputs: number }> = { name: 'current', schema: defineSchema({ inputs: 'u32' }), createState: () => ({ inputs: 0 }), getSnapshot: ctx => ctx.state,
    async onJoin() { joins++;entered.resolve();await release.promise; }, onLeave(_ctx, _player, reason) { leaves.push(reason); }, onInput(ctx) { ctx.state.inputs++; } };
  const server = createAuthoritativeServer({ transport: 'websocket', port: 0, rooms: [room], auth: {
    async verify(token) { verifies++;return { ok: true, userId: 'user', sessionId: token }; },
    isCurrent(identity) {
      checks++;
      const check = () => { if (throws) throw Error('database unavailable');return !revoked.has(identity.sessionId!); };
      return asyncCurrent ? Promise.resolve().then(check) : check();
    },
  } });
  return { server, entered, release, revoked, leaves, get joins() { return joins; }, get verifies() { return verifies; }, get checks() { return checks; }, set throws(value: boolean) { throws = value; },
    join: (token = 'session') => server.joinRoom({ token, roomId: 'room', roomType: 'current' }) };
}

test('revocation during asynchronous room admission cleans membership before publishing presence', async () => {
  const f = fixture();
  try {
    const pending = f.join();await f.entered.promise;f.revoked.add('session');f.release.resolve();
    expect(await pending).toEqual({ ok: false, reason: 'authentication revoked' });
    expect(f.server.presence.count()).toBe(0);expect(f.server.rooms()[0]!.ctx.players.size).toBe(0);
    expect(await f.server.rooms()[0]!.input('unadmitted', {})).toBe(false);
    expect(f.leaves).toEqual(['authentication-revoked']);expect(f.verifies).toBe(1);
    f.revoked.clear();expect((await f.join()).ok).toBe(true);expect(f.server.presence.count()).toBe(1);
  } finally { f.release.resolve();await f.server.stop(); }
});

test('asynchronous durable current checks reject revocation and database rejection', async () => {
  const f = fixture(true);
  try {
    const pending = f.join();await f.entered.promise;f.revoked.add('session');f.release.resolve();
    expect(await pending).toEqual({ ok: false, reason: 'authentication revoked' });
    expect(f.server.presence.count()).toBe(0);expect(f.server.rooms()[0]!.ctx.players.size).toBe(0);
    f.revoked.clear();f.throws = true;
    expect(await f.join()).toEqual({ ok: false, reason: 'authentication revoked' });
    f.throws = false;expect((await f.join()).ok).toBe(true);
  } finally { f.release.resolve();await f.server.stop(); }
});

test('queued revocation cannot evict a valid session, and a throwing current check rejects', async () => {
  const f = fixture();
  try {
    const first = f.join('first');await f.entered.promise;
    const second = f.join('second');await Promise.resolve();f.revoked.add('second');f.release.resolve();
    const admitted = await first;expect(admitted.ok).toBe(true);
    expect(await second).toEqual({ ok: false, reason: 'authentication revoked' });
    expect(f.joins).toBe(1);expect(f.leaves).toEqual([]);expect(f.verifies).toBe(2);
    f.throws = true;expect(await f.join('third')).toEqual({ ok: false, reason: 'authentication revoked' });
    expect(f.server.presence.byUser('user')?.sessionId).toBe('first');
  } finally { f.release.resolve();await f.server.stop(); }
});

test('a current-check exception after joining removes the unpublished member', async () => {
  const f = fixture();
  try {
    const pending = f.join();await f.entered.promise;f.throws = true;f.release.resolve();
    expect(await pending).toEqual({ ok: false, reason: 'authentication revoked' });
    expect(f.server.presence.count()).toBe(0);expect(f.server.rooms()[0]!.ctx.players.size).toBe(0);
    expect(f.leaves).toEqual(['authentication-revoked']);
  } finally { f.release.resolve();await f.server.stop(); }
});

test('reconnect checks identity again inside the room lane before reattaching a reserved seat', async () => {
  const f = fixture(), entered = gate(), release = gate();f.release.resolve();
  try {
    const admitted = await f.join();if (!admitted.ok || !admitted.player || !admitted.room) throw Error('Fixture admission failed');
    const prior = admitted.player;prior.reconnectUntil = performance.now() + 10000;
    const held = admitted.room.runExclusive(async () => { entered.resolve();await release.promise; });await entered.promise;
    const socket: EngineServerWebSocket<unknown> = { data: {}, send() { return 1; }, close() {} };
    const checks = f.checks, resume = f.server.joinRoom({ token: 'session', roomId: 'room', roomType: 'current', connection: socket });
    for (let turn = 0; f.checks === checks && turn < 20; turn++) await Promise.resolve();
    expect(f.checks).toBeGreaterThan(checks);f.revoked.add('session');release.resolve();await held;
    expect((await resume).ok).toBe(false);expect(prior.connection).toBeUndefined();expect(prior.reconnectUntil).toBeDefined();
    expect(f.joins).toBe(1);expect(f.leaves).toEqual([]);expect(f.server.presence.get(prior.id)).toBe(prior);
  } finally { release.resolve();await f.server.stop(); }
});
