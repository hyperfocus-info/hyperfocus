import { expect, test } from 'bun:test';
import { createAuthoritativeServer } from '@hyperfocus/engine/server';
import { connectAuthoritative } from '@hyperfocus/engine/net';
import { combatRoomInputCodec } from '@hyperfocus/engine/combat/net';
import { createTrainingRoom } from '../training/room.ts';
import { trainingProtocolVersion, trainingRoomSnapshotSchema, type TrainingRoomSnapshot } from '../../src/training/protocol.ts';
import { rewardResponseSchema, socialProgressSchema } from '../../src/rewards/model.ts';
import { createRewardService } from './service.ts';
import { withSocialProgression } from './social-room.ts';

test('real WebSocket partners receive their saved participation receipts, with a controlled host clock', async () => {
  let time = 86400000;
  const rewards = createRewardService({ databasePath: ':memory:', now: () => time });
  const server = createAuthoritativeServer({ transport: 'websocket', hostname: '127.0.0.1', port: 0, devMode: true,
    rooms: [withSocialProgression({ rewards, now: () => time, room: createTrainingRoom({ contentId: 'content', seed: 7, allowedActions: ['jab', 'guard'] }) })],
    inputCodec: combatRoomInputCodec, replication: { binary: true, snapshotRate: 2, deltaRate: 60 } });server.start();
  const states = new Map<string, TrainingRoomSnapshot>(), receipts = new Map<string, ReturnType<typeof rewardResponseSchema.parse>>();
  const activity = new Map<string, ReturnType<typeof socialProgressSchema.parse>>();
  const clients = ['a', 'b'].map(id => {
    const client = connectAuthoritative<TrainingRoomSnapshot>({ url: `ws://127.0.0.1:${server.getStats().port}`, token: `dev:${id}`, roomId: 'training', roomType: 'tod-training', reconnect: false,
      request: { contentId: 'content', trainingVersion: trainingProtocolVersion, role: 'fighter' }, inputCodec: combatRoomInputCodec, schema: trainingRoomSnapshotSchema });
    client.onSnapshot(state => states.set(id, state));client.onDelta(state => states.set(id, state));
    client.onMessage(message => { const parsed = rewardResponseSchema.safeParse(message.payload);if (parsed.success) receipts.set(id, parsed.data);const progress = socialProgressSchema.safeParse(message.payload);if (progress.success) activity.set(id, progress.data); });
    return client;
  });
  async function until(predicate: () => boolean) { const deadline = Date.now() + 4000;while (!predicate()) { if (Date.now() > deadline) throw Error('Social transport timed out.');await Bun.sleep(2); } }
  try {
    await Promise.all(clients.map(client => client.connect()));await until(() => [...states.values()].filter(state => state.status === 'ready').length === 2);
    for (let frame = 0; frame < 302; frame++) {
      for (const client of clients) client.sendInput({ matchId: states.get('a')!.matchId, frame, actions: [frame % 2 ? 'jab' : 'guard'], direction: { x: 0, y: 0, z: 0 } });
      time += 1000;await until(() => [...states.values()].every(state => state.confirmedFrame >= frame));
      if (frame === 150) { await until(() => activity.size === 2);for (const value of activity.values()) { expect(value.status).toBe('active');expect(value.elapsedMs).toBeGreaterThan(100000);expect(value.elapsedMs).toBeLessThan(200000); }expect(receipts.size).toBe(0); }
    }
    await until(() => receipts.size === 2);
    for (const id of ['a', 'b']) {
      expect(receipts.get(id)).toMatchObject({ requestId: 'social-progress', error: '', state: { coins: 25, matches: 0, wins: 0, socialCoins: 25 } });
      expect(rewards.read({ userId: id }).coins).toBe(25);
    }
  } finally { for (const client of clients) client.close();await server.stop();rewards.close(); }
}, 60000);
