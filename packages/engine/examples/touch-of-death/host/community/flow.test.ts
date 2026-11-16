import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../test/combat-fixture.ts';
import { createCommunityCoordinator } from './coordinator.ts';
import { createCombatResultJudge } from './judge.ts';

test('physical set result rotates the durable queue once, including a failed save and retry', async () => {
  let stored: unknown = null, failSave = false;
  const room = createCommunityCoordinator({ roomId: 'friends', now: () => 1000,
    persistence: {
      async loadRoom() { return structuredClone(stored); },
      async saveRoom(_id, value) { if (failSave) throw new Error('disk unavailable');stored = structuredClone(value); },
    },
  });
  for (const userId of ['alice', 'bob', 'cara']) await room.join({ userId, connectionId: `connection-${userId}`, wantsQueue: true });
  const battle = room.snapshot().battle!;
  expect(battle.fighters).toEqual(['alice', 'bob']);
  await room.ready({ userId: 'alice', connectionId: 'connection-alice', battleId: battle.id });
  await room.ready({ userId: 'bob', connectionId: 'connection-bob', battleId: battle.id });
  const before = room.snapshot(), durableBefore = structuredClone(stored);
  const f = await combatMotionFixture({ match: true });f.game.reset();
  const match = { matchId: battle.id, contentId: 'fixture', seed: 19, seats: ['connection-alice', 'connection-bob'] };
  const judge = createCombatResultJudge({ project: f.project, runtime: f.runtime, match, battleId: battle.id, roomId: 'friends' });
  let result;
  // Ordinary approach and Strike inputs drive the same contact, recovery and resource rules.
  for (let frame = 0; frame < 5000 && !result; frame++) {
    const actor = f.runtime.physics.body('a')!, target = f.runtime.physics.body('b')!;
    const dx = target.x - actor.x, dz = target.z - actor.z, length = Math.hypot(dx, dz);
    result = judge.accept({ ...match, roomId: 'friends', frames: [0, 1].map(seat => ({
      matchId: match.matchId, frame, seat, actions: seat === 0 && frame % 30 === 0 ? ['jab'] : [],
      direction: seat === 0 && length > 1.3 ? { x: dx / length, y: 0, z: dz / length } : { x: 0, y: 0, z: 0 },
    })) });
  }
  expect(result?.score).toEqual([3, 0]);
  const outcome = { battleId: result!.battleId, fighters: battle.fighters, winner: result!.winner };
  failSave = true;
  await expect(room.complete(outcome)).rejects.toThrow('disk unavailable');
  expect(room.snapshot()).toEqual(before);expect(stored).toEqual(durableBefore);
  failSave = false;
  const next = await room.complete(outcome);
  expect(next.battle?.fighters).toEqual(['alice', 'cara']);expect(next.battle?.phase).toBe('ready');
  expect(next.queue).toEqual(['bob']);expect(next.streak).toEqual({ userId: 'alice', wins: 1 });
  expect(next.lastResult).toEqual(outcome);
  expect(await room.complete(outcome)).toEqual(next);
  expect(room.snapshot().battle?.ready).toEqual([false, false]);
  // The current set ended physically; starting the next set still requires both people.
  await expect(room.ready({ userId: 'bob', connectionId: 'connection-bob', battleId: next.battle!.id })).rejects.toThrow('stale');
  expect(room.snapshot()).toEqual(next);
}, 30000);
