import { expect, test } from 'bun:test';
import { connectAuthoritative } from '../../net/authoritative-client.ts';
import { combatRoomInputCodec, combatRoomSnapshotSchema, type CombatRoomSnapshot } from '../../combat/net/protocol.ts';
import { createAuthoritativeServer } from '../server.ts';
import { createCombatRelayRoom } from './room.ts';
import { isObject } from '@hyperfocus/utilities/records';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Spectator transport timed out.');await Bun.sleep(2); }
}
function fixture(maxSpectatorFrames = 36000) {
  const server = createAuthoritativeServer({ transport: 'websocket', hostname: '127.0.0.1', port: 0, devMode: true,
    rooms: [createCombatRelayRoom({ matchId: 'bout', contentId: 'v1', seed: 7, allowedActions: ['jab'], maxSpectators: 2, maxSpectatorFrames })],
    inputCodec: combatRoomInputCodec, replication: { binary: true, snapshotRate: 2, deltaRate: 60 } });server.start();
  const clients: ReturnType<typeof connectAuthoritative<CombatRoomSnapshot>>[] = [];
  const states = new Map<string, CombatRoomSnapshot>(), rejections: string[] = [];
  const traffic = { bytes: 0, messages: 0, maxPayload: 0 };
  const make = (id: string, role = 'fighter') => {
    const client = connectAuthoritative<CombatRoomSnapshot>({ url: `ws://127.0.0.1:${server.getStats().port}`, token: `dev:${id}`, roomId: 'arena', roomType: 'combat-relay',
      request: { matchId: 'bout', contentId: 'v1', role }, inputCodec: combatRoomInputCodec, schema: combatRoomSnapshotSchema, reconnect: false,
      createWebSocket(url) { const socket = new WebSocket(url);socket.binaryType = 'arraybuffer';socket.addEventListener('message', event => {
        if (role === 'spectator' && event.data instanceof ArrayBuffer) { traffic.bytes += event.data.byteLength;traffic.messages++;traffic.maxPayload = Math.max(traffic.maxPayload, event.data.byteLength); }
      });return socket; } });
    client.onSnapshot(state => states.set(id, state));client.onDelta(state => states.set(id, state));
    client.onMessage(message => { const event = message.payload;if (isObject(event) && event.type === 'combat-input-rejected') { if (typeof event.reason !== 'string') throw new Error('Expected combat rejection reason.');rejections.push(event.reason); } });
    clients.push(client);return client;
  };
  const input = (frame: number) => ({ matchId: 'bout', frame, actions: frame % 2 ? ['jab'] : [], direction: { x: 0, y: 0, z: 0 } });
  return { server, states, rejections, make, input, traffic, async dispose() { for (const client of clients) client.close();await server.stop(); } };
}

test('late spectator streams bounded confirmed history beyond rollback retention without fighter permissions', async () => {
  const f = fixture();
  try {
    const a = f.make('a'), b = f.make('b');const first = await a.connect(), second = await b.connect();
    await until(() => f.states.get('a')?.status === 'ready');
    for (let batch = 0; batch < 27; batch++) {
      for (let frame = batch * 10; frame < batch * 10 + 10; frame++) { a.sendInput(f.input(frame));b.sendInput(f.input(frame)); }
      await until(() => f.states.get('a')?.confirmedFrame === batch * 10 + 9);
    }
    expect(f.states.get('a')!.frames['0:0']).toBeUndefined();
    const watcher = f.make('watcher', 'spectator');await watcher.connect();await until(() => !!f.states.get('watcher'));
    let snapshot = f.states.get('watcher')!;expect(snapshot.seats).toEqual([first.playerId, second.playerId]);
    expect(snapshot.confirmedFrame).toBe(269);expect(Object.keys(snapshot.frames)).toHaveLength(240);expect(snapshot.frames['0:0']).toEqual({ ...f.input(0), seat: 0 });
    watcher.sendInput(f.input(270));a.sendEvent({ type: 'combat-spectator-cursor', frame: 120 });watcher.sendEvent({ type: 'combat-spectator-cursor', frame: 121 });
    await until(() => f.rejections.includes('unassigned-seat') && f.rejections.includes('invalid-spectator-cursor'));
    expect(f.states.get('a')!.confirmedFrame).toBe(269);expect(f.states.get('a')!.frames['0:270']).toBeUndefined();
    watcher.sendEvent({ type: 'combat-spectator-cursor', frame: 120 });await until(() => !!f.states.get('watcher')?.frames['0:120']);
    snapshot = f.states.get('watcher')!;expect(snapshot.frames['0:0']).toBeUndefined();expect(Object.keys(snapshot.frames)).toHaveLength(240);
    watcher.sendEvent({ type: 'combat-spectator-cursor', frame: 0 });watcher.sendEvent({ type: 'combat-spectator-cursor', frame: 240 });
    await until(() => !!f.states.get('watcher')?.frames['0:240']);expect(Object.keys(f.states.get('watcher')!.frames)).toHaveLength(60);
    const watcher2 = f.make('watcher2', 'spectator');await watcher2.connect();await expect(f.make('overflow', 'spectator').connect()).rejects.toThrow();
    expect(f.traffic.maxPayload).toBeLessThan(40000);console.info('Spectator bounded binary evidence', JSON.stringify({ ...f.traffic, fighters: 2, spectators: 2, confirmedFrames: 270 }));
    watcher.close();await until(() => f.server.getStats().players === 3);expect(f.states.get('a')!.status).toBe('ready');
    b.close();await until(() => f.states.get('watcher2')?.status === 'interrupted');expect(f.states.get('a')!.status).toBe('interrupted');
  } finally { await f.dispose(); }
});

test('spectator limits reject invalid authored host settings', () => {
  for (const limits of [{ maxSpectators: -1 }, { maxSpectators: 33 }, { maxSpectators: 1.5 }, { maxSpectatorFrames: 0 }, { maxSpectatorFrames: 36001 }]) {
    expect(() => createCombatRelayRoom({ matchId: 'bout', contentId: 'v1', seed: 7, allowedActions: [], ...limits })).toThrow('spectator limits');
  }
});

test('spectator archive exhaustion refuses new viewers and stops existing viewers without stopping fighters', async () => {
  const f = fixture(2);
  try {
    const a = f.make('a'), b = f.make('b'), watcher = f.make('watcher', 'spectator');await a.connect();await watcher.connect();await b.connect();
    await until(() => f.states.get('a')?.status === 'ready');
    for (let frame = 0; frame < 3; frame++) { a.sendInput(f.input(frame));b.sendInput(f.input(frame)); }
    await until(() => f.states.get('watcher')?.status === 'archive-ended');
    expect(f.states.get('watcher')!.confirmedFrame).toBe(2);expect(Object.keys(f.states.get('watcher')!.frames)).toHaveLength(4);
    expect(f.states.get('a')!.status).toBe('ready');await expect(f.make('late', 'spectator').connect()).rejects.toThrow('history exhausted');
    a.sendInput(f.input(3));b.sendInput(f.input(3));await until(() => f.states.get('a')?.confirmedFrame === 3);
    expect(f.states.get('a')!.status).toBe('ready');
  } finally { await f.dispose(); }
});
