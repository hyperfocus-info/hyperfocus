import { expect, test } from 'bun:test';
import { defineSchema } from '../../protocol/schema.ts';
import { connectAuthoritative } from '../../net/authoritative-client.ts';
import { createAuthoritativeServer } from '../server.ts';
import { createAuthoritativeRoom } from '../core/room.ts';
import type { RoomContext, RoomType } from '../core/types.ts';

const schema = defineSchema<{ count: number }>({ count: 'u32' });
const room: RoomType<{ count: number }> = { name: 'scoped', schema, createState: () => ({ count: 0 }), getSnapshot: ctx => ctx.state };
async function until(predicate: () => boolean) { const end = Date.now() + 3000;while (!predicate()) { if (Date.now() > end) throw new Error('Event delivery timed out.');await Bun.sleep(2); } }

test('recipient scope validates and detaches before enqueue and excludes IDs absent at enqueue', async () => {
  const runtime = createAuthoritativeRoom({ id: 'r', type: room, now: () => 0, metrics: { record() {} } });await runtime.ready();
  const player = { id: 'one', userId: 'one', sessionId: 's', roomId: 'r', joinedAt: 0, lastInputAt: 0 };await runtime.join(player);
  const recipients = ['one', 'later'];runtime.ctx.broadcast('private', { recipients });recipients.push('other');
  await runtime.join({ ...player, id: 'later' });
  expect(runtime.drainBroadcasts()).toEqual([{ event: 'private', durability: 'transient', recipients: ['one'], recipientConnections: new Map([['one', undefined]]) }]);
  for (const recipients of [['one', 'one'], [''], ['x'.repeat(129)], Array(257).fill('one'), Array(1)]) expect(() => runtime.ctx.broadcast('invalid', { recipients })).toThrow();
  expect(runtime.drainBroadcasts()).toEqual([]);
  runtime.ctx.broadcast('none', { recipients: [] });expect(runtime.drainBroadcasts()[0]!.recipients).toEqual([]);
  expect(() => runtime.ctx.broadcast('durable', { recipients: ['one'], durability: 'durable' })).toThrow('persistence');
  await runtime.dispose();
});

test('three real WebSocket clients receive only addressed events; reconnect and stale IDs cannot inherit them', async () => {
  let context: RoomContext | undefined;
  const persisted: unknown[] = [];
  const server = createAuthoritativeServer({ transport: 'websocket', hostname: '127.0.0.1', port: 0, devMode: true,
    rooms: [{ ...room, onJoin(ctx) { context = ctx; } }], replication: { binary: true },
    persistence: { async loadPlayer() { return null; }, async savePlayer() {}, async loadRoom() { return null; }, async saveRoom() {}, async appendEvent(value) { persisted.push(value); } },
  });server.start();
  const clients: ReturnType<typeof connectAuthoritative<{ count: number }>>[] = [], received: string[][] = [];
  const join = async (user: string) => {
    const index = clients.length;received[index] = [];
    const client = connectAuthoritative({ url: `ws://127.0.0.1:${server.getStats().port}`, token: `dev:${user}`, roomId: 'r', roomType: 'scoped', schema, reconnect: false });
    client.onMessage(message => { if (message.type === 'event') { if (typeof message.payload !== 'string') throw new Error('Expected string event.');received[index]!.push(message.payload); } });clients.push(client);
    return await client.connect();
  };
  try {
    const a = await join('a'), b = await join('b');await join('c');
    context!.broadcast('only-b', { recipients: [b.playerId], durability: 'durable' });context!.broadcast('everyone');
    await until(() => received.every(events => events.includes('everyone')));
    expect(received).toEqual([['everyone'], ['only-b', 'everyone'], ['everyone']]);
    clients[1]!.close();await until(() => !context!.players.has(b.playerId));
    context!.broadcast('stale', { recipients: [b.playerId] });
    const replacement = await join('b');expect(replacement.playerId).not.toBe(b.playerId);
    context!.broadcast('empty', { recipients: [] });context!.broadcast('new', { recipients: [replacement.playerId] });context!.broadcast('barrier');
    await until(() => received[3]!.includes('barrier') && received[0]!.includes('barrier') && received[2]!.includes('barrier'));
    expect(received[3]).toEqual(['new', 'barrier']);expect(received[0]).toEqual(['everyone', 'barrier']);expect(received[2]).toEqual(['everyone', 'barrier']);
    expect(context!.players.has(a.playerId)).toBe(true);
  } finally { for (const client of clients) client.close();await server.stop(); }
  expect(persisted).toEqual([{ roomId: 'r', roomType: 'scoped', at: expect.any(Number), event: 'only-b' }]);
});
