import { expect, test } from 'bun:test';
import { connectAuthoritative } from '../../net/authoritative-client.ts';
import { combatRoomInputCodec, combatRoomSnapshotSchema, type CombatRoomSnapshot } from '../../combat/net/protocol.ts';
import { SESSION_SUPERSEDED_CLOSE_CODE } from '../../protocol/messages.ts';
import { createAuthoritativeServer } from '../server.ts';
import { createCombatRelayRoom } from './room.ts';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Superseded login transport timed out.');await Bun.sleep(2); }
}

test('same account in another room terminates old waiting connection without reconnect theft', async () => {
  const server = createAuthoritativeServer({ transport: 'websocket', hostname: '127.0.0.1', port: 0, devMode: true,
    rooms: [createCombatRelayRoom({ matchId: 'bout', contentId: 'v1', seed: 7, allowedActions: ['jab'] })],
    inputCodec: combatRoomInputCodec, replication: { binary: true, snapshotRate: 2, deltaRate: 60 } });
  server.start();
  const connections = new Map<string, number>(), closed: number[] = [];
  const make = (roomId: string, user: string) => connectAuthoritative<CombatRoomSnapshot>({
    url: `ws://127.0.0.1:${server.getStats().port}`, token: `dev:${user}`, roomId, roomType: 'combat-relay',
    request: { matchId: 'bout', contentId: 'v1' }, inputCodec: combatRoomInputCodec, schema: combatRoomSnapshotSchema,
    reconnect: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 },
    createWebSocket(url) { connections.set(roomId, (connections.get(roomId) ?? 0) + 1);const socket = new WebSocket(url);socket.addEventListener('close', event => closed.push(event.code));return socket; },
  });
  const first = make('old-room', 'shared'), second = make('new-room', 'shared'), other = make('other-room', 'unrelated'), manual = make('manual-room', 'shared');
  const clients = [first, second, other, manual];let firstSnapshot: CombatRoomSnapshot | undefined;
  first.onSnapshot(snapshot => { firstSnapshot = snapshot; });
  try {
    const original = await first.connect(), unrelated = await other.connect();await until(() => firstSnapshot?.status === 'waiting');
    const replacement = await second.connect();await until(() => first.getDebugSnapshot().state.status === 'failed');
    expect(first.getDebugSnapshot()).toMatchObject({ connected: false, state: { status: 'failed', reason: 'This account signed in elsewhere. Sign in again to continue.' } });
    expect(closed).toContain(SESSION_SUPERSEDED_CLOSE_CODE);await Bun.sleep(40);
    expect(connections.get('old-room')).toBe(1);expect(server.presence.byUser('shared')?.id).toBe(replacement.playerId);
    expect(server.presence.get(original.playerId)).toBeUndefined();expect(server.presence.byUser('unrelated')?.id).toBe(unrelated.playerId);
    expect(other.getDebugSnapshot().connected).toBe(true);expect(server.getStats().players).toBe(2);
    const resumed = await manual.connect();await until(() => second.getDebugSnapshot().state.status === 'failed');await Bun.sleep(40);
    expect(server.presence.byUser('shared')?.id).toBe(resumed.playerId);expect(connections.get('new-room')).toBe(1);
    expect(server.getStats().players).toBe(2);expect(other.getDebugSnapshot().connected).toBe(true);
  } finally { for (const client of clients) client.close();await server.stop(); }
});
