import { expect, test } from 'bun:test';
import { createCombatRelayRoom } from './room.ts';
import type { AuthoritativePlayer } from '../core/types.ts';
import { combatRoomSnapshotSchema } from '../../combat/net/protocol.ts';
import { encodeSnapshot, decodeSnapshot } from '../../protocol/encode.ts';

test('reserved fighter recovery preserves accepted windows and roster for fighters and spectators', async () => {
  const room = createCombatRelayRoom({ matchId: 'bout', contentId: 'v1', seed: 1, allowedActions: ['jab'], maxSpectators: 1 });
  const base = { roomId: 'room', roomType: room.name, now: () => 100 };
  const events: unknown[] = [], players = new Map<string, AuthoritativePlayer>();
  const ctx = { ...base, state: room.createState(base), players, broadcast: (event: unknown) => { events.push(event); }, metrics: { record() {} } };
  const humans: [AuthoritativePlayer, AuthoritativePlayer, AuthoritativePlayer] = [
    { id: 'a', userId: 'a', sessionId: 'a', roomId: 'room', joinedAt: 0, lastInputAt: 0 },
    { id: 'b', userId: 'b', sessionId: 'b', roomId: 'room', joinedAt: 0, lastInputAt: 0 },
    { id: 'watch', userId: 'watch', sessionId: 'watch', roomId: 'room', joinedAt: 0, lastInputAt: 0 },
  ];
  for (const player of humans) { players.set(player.id, player);await room.onJoin!(ctx, player, { role: player.id === 'watch' ? 'spectator' : 'fighter' }); }
  const [a, b, watcher] = humans;
  const input = { matchId: 'bout', frame: 0, actions: ['jab'], direction: { x: 0, y: 0, z: 0 } };
  await room.onInput!(ctx, a, input);a.reconnectUntil = 200;
  for (const player of humans) expect(room.getSnapshot(ctx, player).status).toBe('recovering');
  // Already-in-flight input remains valid while display/simulation is suspended.
  await room.onInput!(ctx, b, input);await room.onInput!(ctx, a, input);
  const paused = room.getSnapshot(ctx, b);expect(paused.confirmedFrame).toBe(0);expect(Object.keys(paused.frames)).toHaveLength(2);expect(events).toHaveLength(0);
  expect(decodeSnapshot(combatRoomSnapshotSchema, encodeSnapshot(combatRoomSnapshotSchema, paused))).toEqual(paused);
  await room.onInput!(ctx, a, { ...input, actions: [] });expect(events.at(-1)).toMatchObject({ reason: 'conflicting-frame' });
  await room.onInput!(ctx, a, { ...input, frame: 121 });expect(events.at(-1)).toMatchObject({ reason: 'future-frame' });
  delete a.reconnectUntil;expect(room.getSnapshot(ctx, a)).toEqual({ ...paused, status: 'ready' });
  expect(room.getSnapshot(ctx, watcher).seats).toEqual(['a', 'b']);
  await room.onLeave!(ctx, a, 'reconnect-timeout');expect(room.getSnapshot(ctx, b).status).toBe('interrupted');
});
