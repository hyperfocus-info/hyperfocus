import { expect, test } from 'bun:test';
import { connectAuthoritative } from '../../net/authoritative-client.ts';
import { combatRoomInputCodec, combatRoomSnapshotSchema, type CombatRoomSnapshot } from '../../combat/net/protocol.ts';
import { createAuthoritativeServer } from '../server.ts';
import { createCombatRelayRoom, type ConfirmedCombatFrames } from './room.ts';
import { isObject } from '@hyperfocus/utilities/records';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Combat relay transport timed out.');await Bun.sleep(2); }
}
const input = (frame: number, actions: string[] = []) => ({ matchId: 'match', frame, actions, direction: { x: 0, y: 0, z: 0 } });

test('two binary clients receive immutable authenticated inputs and bounded120-frame history', async () => {
  const recording: ConfirmedCombatFrames[] = [];
  const server = createAuthoritativeServer({ transport: 'websocket', hostname: '127.0.0.1', port: 0, devMode: true,
    rooms: [createCombatRelayRoom({ matchId: 'match', contentId: 'combat-v2:same-project', seed: 42, allowedActions: ['jab', 'guard'], onConfirmedFrames(batch) { recording.push(structuredClone(batch));batch.frames[0]!.actions.push('observer-mutation');batch.seats.length = 0; } })],
    inputCodec: combatRoomInputCodec, replication: { binary: true, snapshotRate: 2, deltaRate: 60 } });
  server.start();
  const counters = { sentBinary: 0, sentInputs: 0, receivedBinary: 0, sentBytes: 0, receivedBytes: 0, maxReceivedBytes: 0, firstBatchLatencyMs: 0 };
  const states: Array<CombatRoomSnapshot | undefined> = [], rejections: string[] = [];
  const clients = ['a', 'b', 'third', 'mismatch'].map((id, index) => {
    const client = connectAuthoritative<CombatRoomSnapshot>({ url: `ws://127.0.0.1:${server.getStats().port}`, token: `dev:${id}`,
      roomId: 'arena', roomType: 'combat-relay', request: { matchId: 'match', contentId: index === 3 ? 'combat-v1:same-project' : 'combat-v2:same-project' },
      reconnect: false, inputCodec: combatRoomInputCodec, schema: combatRoomSnapshotSchema,
      createWebSocket(url) {
        const socket = new WebSocket(url), send = socket.send.bind(socket);
        socket.binaryType = 'arraybuffer';
        socket.send = data => { if (typeof data !== 'string') { counters.sentBinary++;if (data instanceof Uint8Array && data[0] === 1 && data[1] === 16) counters.sentInputs++;counters.sentBytes += data instanceof Blob ? data.size : data.byteLength; } send(data); };
        socket.addEventListener('message', event => { if (event.data instanceof ArrayBuffer) {
          counters.receivedBinary++;counters.receivedBytes += event.data.byteLength;counters.maxReceivedBytes = Math.max(counters.maxReceivedBytes, event.data.byteLength);
        } });
        return socket;
      },
    });
    client.onSnapshot(state => { states[index] = state; });client.onDelta(state => { states[index] = state; });
    client.onMessage(message => { const payload = message.payload;
      if (isObject(payload) && payload.type === 'combat-input-rejected') { if (typeof payload.reason !== 'string') throw new Error('Expected combat rejection reason.');rejections.push(payload.reason); } });
    return client;
  });
  try {
    await expect(clients[3]!.connect()).rejects.toThrow('mismatch');
    const first = await clients[0]!.connect(), second = await clients[1]!.connect();
    await until(() => states[0]?.status === 'ready' && states[1]?.status === 'ready');
    expect(states[0]!.seats).toEqual([first.playerId, second.playerId]);expect(states[1]!.seed).toBe(42);
    await expect(clients[2]!.connect()).rejects.toThrow();
    const startedInputsAt = performance.now();
    for (let batch = 0; batch < 13; batch++) {
      for (let frame = batch * 10; frame < batch * 10 + 10; frame++) {
        clients[0]!.sendInput({ ...input(frame, frame === 0 ? ['jab'] : []), seat: 1, fighterId: second.playerId });clients[1]!.sendInput(input(frame, ['guard']));
      }
      await until(() => states[0]?.confirmedFrame === batch * 10 + 9 && states[1]?.confirmedFrame === batch * 10 + 9);
      if (batch === 0) counters.firstBatchLatencyMs = performance.now() - startedInputsAt;
    }
    expect(states[0]).toEqual(states[1]);
    expect(Object.keys(states[0]!.frames)).toHaveLength(240);
    expect(states[0]!.frames['0:10']!.seat).toBe(0);expect(states[0]!.frames['1:129']!.actions).toEqual(['guard']);
    clients[0]!.sendInput(input(129)); // Idempotent duplicate.
    clients[0]!.sendInput(input(129, ['jab']));
    clients[0]!.sendInput(input(0));
    clients[0]!.sendInput(input(250));
    clients[0]!.sendInput({ ...input(130), matchId: 'wrong' });
    clients[0]!.sendInput(input(130, ['unknown']));
    await until(() => ['conflicting-frame', 'stale-frame', 'future-frame', 'wrong-match', 'invalid-actions'].every(reason => rejections.includes(reason)));
    expect(states[0]!.frames['0:129']!.actions).toEqual([]);
    expect(states[0]!.frames['0:130']).toBeUndefined();
    const recorded = recording.flatMap(batch => batch.frames);
    expect(recorded).toHaveLength(260);
    expect(recorded.map(frame => `${frame.seat}:${frame.frame}`)).toEqual(Array.from({ length: 130 }, (_, frame) => [`0:${frame}`, `1:${frame}`]).flat());
    expect(recorded[0]!.actions).toEqual(['jab']);expect(recording[0]!.seats).toEqual([first.playerId, second.playerId]);
    expect(recording.every(batch => batch.roomId === 'arena' && batch.contentId === 'combat-v2:same-project')).toBe(true);
    expect(counters.sentInputs).toBe(266);
    expect(counters.sentBinary).toBe(counters.sentInputs);
    expect(counters.maxReceivedBytes).toBeLessThan(40000);
    expect(counters.receivedBytes).toBeLessThan(150000);
    console.info('Combat relay binary evidence', JSON.stringify(counters));
    clients[1]!.close();await until(() => states[0]?.status === 'interrupted');
    clients[0]!.sendInput(input(130));await until(() => rejections.includes('match-not-ready'));
  } finally { for (const client of clients) client.close();await server.stop(); }
});
