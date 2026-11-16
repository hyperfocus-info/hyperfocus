import { expect, test } from 'bun:test';
import { connectAuthoritative, type AuthoritativeClient } from '../../net/authoritative-client.ts';
import { defineSchema } from '../../protocol/schema.ts';
import { createAuthoritativeServer } from '../server.ts';
import type { RoomContext, RoomType } from '../core/types.ts';
import { isServerSocket } from './server-admission.ts';

const schema = defineSchema<{ count: number }>({ count: 'u32' });
async function until(predicate: () => boolean) { const end = Date.now() + 3000;while (!predicate()) { if (Date.now() > end) throw new Error('Recovery timed out.');await Bun.sleep(2); } }
function fixture(grace = 250, reconnect = false) {
  const leaves: string[] = [], joins: string[] = [], clients: AuthoritativeClient<{ count: number }>[] = [];
  let context!: RoomContext<{ count: number }>;
  const room: RoomType<{ count: number }> = { name: 'resume', maxPlayers: 1, schema, createState: () => ({ count: 0 }), getSnapshot: ctx => ctx.state,
    onJoin(ctx, player) { context = ctx;joins.push(player.id); }, onLeave(_ctx, _player, reason) { leaves.push(reason); }, onInput(ctx) { ctx.state.count++; } };
  const server = createAuthoritativeServer({ transport: 'websocket', hostname: '127.0.0.1', port: 0, tickRate: .1, reconnectGraceMs: grace, rooms: [room],
    auth: { async verify(token) { const [userId, sessionId] = token.split(':');return { ok: true, userId: userId!, sessionId: sessionId! }; } }, replication: { binary: true } });server.start();
  function client(token = 'a:one', roomId = 'r', roomType = 'resume', capture?: (socket: WebSocket) => void) {
    const result = connectAuthoritative({ url: `ws://127.0.0.1:${server.getStats().port}`, token, roomId, roomType, schema, reconnect: reconnect ? { initialDelayMs: 1, maxDelayMs: 1 } : false, createWebSocket(url) { const socket = new WebSocket(url);capture?.(socket);return socket; } });clients.push(result);return result;
  }
  function disconnect(id: string, code = 1011) { const socket = server.presence.get(id)!.connection;if (!isServerSocket(socket)) throw new Error('Expected attached socket.');socket.close(code, 'fixture transport loss'); }
  return { server, client, leaves, joins, disconnect, context: () => context, async dispose() { for (const client of clients) client.close();await server.stop(); } };
}

test('actual websocket recovery retains seat, state and capacity with a fresh baseline and no duplicate join', async () => {
  const f = fixture(1000);
  try {
    const first = f.client(), admitted = await first.connect();
    first.sendInput({});await until(() => f.context().state.count === 1);
    const prior = f.server.presence.get(admitted.playerId)!;f.disconnect(admitted.playerId);
    await until(() => prior.reconnectUntil !== undefined);expect(prior.connection).toBeUndefined();expect(f.leaves).toEqual([]);expect(f.server.presence.count()).toBe(1);
    await expect(f.client('b:one').connect()).rejects.toThrow('room full');
    const resumed = f.client();let snapshot = -1;resumed.onSnapshot(state => { snapshot = state.count; });
    expect((await resumed.connect()).playerId).toBe(admitted.playerId);await f.server.tick();await until(() => snapshot === 1);
    expect(f.server.presence.get(admitted.playerId)).toBe(prior);expect(prior.reconnectUntil).toBeUndefined();expect(f.joins).toEqual([admitted.playerId]);
    resumed.sendInput({});await until(() => f.context().state.count === 2);expect(f.leaves).toEqual([]);
    resumed.close();await until(() => f.leaves.length === 1);expect(f.leaves).toEqual(['leave']);expect(f.server.presence.count()).toBe(0);
  } finally { await f.dispose(); }
});

test('reservation rejects session, room and room-type mismatches without taking the seat; expiry is independent of ticks', async () => {
  const f = fixture(300);
  try {
    const first = await f.client().connect();f.disconnect(first.playerId);await until(() => !!f.server.presence.get(first.playerId)?.reconnectUntil);
    for (const client of [f.client('a:two'), f.client('a:one', 'other'), f.client('a:one', 'r', 'other')]) await expect(client.connect()).rejects.toThrow('mismatch');
    expect(f.joins).toEqual([first.playerId]);expect(f.leaves).toEqual([]);
    await until(() => f.leaves.includes('reconnect-timeout'));expect(f.server.presence.count()).toBe(0);
    expect((await f.client().connect()).playerId).not.toBe(first.playerId);
  } finally { await f.dispose(); }
});

test('default-disabled recovery, clean close and shutdown remain terminal and invalid grace bounds reject', async () => {
  const f = fixture(0);
  try { const first = await f.client().connect();f.disconnect(first.playerId);await until(() => f.leaves.length > 0);expect(f.leaves).toEqual(['disconnect']); } finally { await f.dispose(); }
  const retained = fixture(1000);
  const first = await retained.client().connect();retained.disconnect(first.playerId);await until(() => !!retained.server.presence.get(first.playerId)?.reconnectUntil);
  await retained.dispose();expect(retained.leaves).toEqual(['server-stop']);expect(retained.server.presence.count()).toBe(0);await Bun.sleep(20);expect(retained.leaves).toHaveLength(1);
  for (const reconnectGraceMs of [-1, 30001, .5, NaN]) expect(() => createAuthoritativeServer({ transport: 'websocket', port: 0, reconnectGraceMs, rooms: [{ name: 'r', schema, createState: () => ({ count: 0 }), getSnapshot: ctx => ctx.state }] })).toThrow('reconnectGraceMs');
});

test('queued private events cannot cross a reattached socket; concurrent admissions preserve live duplicate-login policy', async () => {
  const f = fixture(1000);
  try {
    const first = await f.client().connect(), prior = f.server.presence.get(first.playerId)!;
    const oldSocket = prior.connection;if (!isServerSocket(oldSocket)) throw new Error('Expected attached socket.');
    f.context().broadcast('old-private', { recipients: [first.playerId] });
    f.disconnect(first.playerId);await until(() => prior.reconnectUntil !== undefined);
    const a = f.client(), b = f.client(), messages: string[] = [];
    a.onMessage(message => { if (message.type === 'event') { if (typeof message.payload !== 'string') throw new Error('Expected string event.');messages.push(message.payload); } });
    const resumed = await a.connect();expect(resumed.playerId).toBe(first.playerId);
    oldSocket.close(1011, 'late old close');await Bun.sleep(5);expect(prior.reconnectUntil).toBeUndefined();expect(f.server.presence.get(first.playerId)).toBe(prior);
    f.context().broadcast('new-private', { recipients: [first.playerId] });await f.server.tick();await until(() => messages.includes('new-private'));expect(messages).toEqual(['new-private']);
    const liveReplacement = await b.connect();expect(liveReplacement.playerId).not.toBe(first.playerId);expect(f.leaves).toEqual(['duplicate-login']);expect(f.server.presence.count()).toBe(1);
    f.disconnect(liveReplacement.playerId);await until(() => !!f.server.presence.get(liveReplacement.playerId)?.reconnectUntil);
    const both = await Promise.all([f.client().connect(), f.client().connect()]);
    expect(both.filter(result => result.playerId === liveReplacement.playerId)).toHaveLength(1);expect(f.server.presence.count()).toBe(1);expect(f.leaves).toEqual(['duplicate-login', 'duplicate-login']);
  } finally { await f.dispose(); }
});

test('replication send failures use grace when enabled and expire without a running server clock', async () => {
  const leaves: string[] = [];
  const server = createAuthoritativeServer({ transport: 'websocket', port: 0, devMode: true, reconnectGraceMs: 30,
    rooms: [{ name: 'r', schema, createState: () => ({ count: 0 }), getSnapshot: ctx => ctx.state, onLeave(_ctx, _player, reason) { leaves.push(reason); } }] });
  const socket = { send() { throw new Error('lost transport'); }, close() {} };
  try {
    const joined = await server.joinRoom({ token: 'dev:a', roomId: 'r', roomType: 'r', connection: socket });expect(joined.ok).toBe(true);
    await server.tick();expect(server.presence.count()).toBe(1);expect(server.presence.list()[0]!.reconnectUntil).toBeDefined();expect(leaves).toEqual([]);
    await until(() => leaves.length > 0);expect(leaves).toEqual(['reconnect-timeout']);expect(server.presence.count()).toBe(0);
  } finally { await server.stop(); }
});


test('client custom closes settle as connection-close with recovery enabled; default clean close remains leave', async () => {
  for (const grace of [0, 1000]) {
    for (const code of [1000, 4000]) {
      const f = fixture(grace);
      try {
        let socket!: WebSocket;
        const admitted = await f.client('a:one', 'r', 'resume', value => { socket = value; }).connect();
        socket.close(code);
        await until(() => f.leaves.length > 0);
        expect(f.leaves).toEqual([code === 1000 ? 'leave' : grace ? 'connection-close' : 'disconnect']);
        expect(f.server.presence.get(admitted.playerId)).toBeUndefined();
        expect(f.server.presence.count()).toBe(0);
        await Bun.sleep(10);expect(f.leaves).toHaveLength(1);
      } finally { await f.dispose(); }
    }
  }
});


test('explicit client suspension holds admission without retries until connect; expiry remains terminal', async () => {
  const f = fixture(150, true);
  try {
    const client = f.client(), first = await client.connect();
    client.sendInput({});await until(() => f.context().state.count === 1);
    client.close({ mode: 'suspend' });
    expect(client.getDebugSnapshot().state).toEqual({ status: 'recovering', attempt: 0, reason: 'Connection suspended.' });
    await until(() => !!f.server.presence.get(first.playerId)?.reconnectUntil);
    await Bun.sleep(30);expect(f.joins).toEqual([first.playerId]);expect(f.leaves).toEqual([]);
    expect((await client.connect()).playerId).toBe(first.playerId);expect(f.context().state.count).toBe(1);
    client.close({ mode: 'suspend' });await until(() => f.leaves.length === 1);
    expect(f.leaves).toEqual(['reconnect-timeout']);expect(f.server.presence.count()).toBe(0);
    expect(client.getDebugSnapshot().state.status).toBe('recovering');
    expect((await client.connect()).playerId).not.toBe(first.playerId);
  } finally { await f.dispose(); }
});

test('an actual empty masked WebSocket close cannot turn a played admission into an unrated disconnect', async () => {
  const f = fixture(1000);
  let socket: Awaited<ReturnType<typeof Bun.connect>> | undefined;
  try {
    let handshake = false;
    socket = await Bun.connect({ hostname: '127.0.0.1', port: f.server.getStats().port!, socket: {
      data(_socket, bytes) { if (new TextDecoder().decode(bytes).includes('101 Switching Protocols')) handshake = true; },
      error() {}, close() {},
    } });
    socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
    await until(() => handshake);
    const payload = new TextEncoder().encode(JSON.stringify({ v: 1, type: 'join_room', payload: { token: 'a:one', roomId: 'r', roomType: 'resume' } }));
    expect(payload.length).toBeLessThan(126);
    const frame = new Uint8Array(6 + payload.length);frame[0] = 0x81;frame[1] = 0x80 | payload.length;frame.set(payload, 6);
    socket.write(frame);await until(() => f.joins.length === 1);
    // Empty close payload, masked as required for clients: peer observes code 1005.
    socket.write(new Uint8Array([0x88, 0x80, 0, 0, 0, 0]));
    await until(() => f.leaves.length === 1);
    expect(f.leaves).toEqual(['connection-close']);expect(f.server.presence.count()).toBe(0);
  } finally { socket?.end();await f.dispose(); }
});
