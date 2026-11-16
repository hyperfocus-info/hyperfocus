import { expect, test } from 'bun:test';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import { createCombatRelayRoom } from '@hyperfocus/engine/server';
import { rewardResponseSchema } from '../../src/rewards/model.ts';
import { createRewardService } from './service.ts';
import { withRoomProgression } from './room.ts';

test('reward commands use admitted identity, private replies, and distinguish uncertain storage failures', async () => {
  const rewards = createRewardService({ databasePath: ':memory:', now: () => 86400000 });let failing = false;
  const type = withRoomProgression({ room: createCombatRelayRoom({ matchId: 'match', contentId: 'content', seed: 1, allowedActions: [] }),
    rewards: { ...rewards, command(input) { if (failing) throw Error('Database unavailable');return rewards.command(input); } } });
  const room = createAuthoritativeRoom({ id: 'private', type, now: () => 1000, metrics: { record() {} } });
  try {
    for (const userId of ['a', 'b']) await room.join({ id: userId, userId, sessionId: userId, roomId: 'private', joinedAt: 1000, lastInputAt: 1000 }, { matchId: 'match', contentId: 'content' });
    const command = { type: 'reward-command', requestId: 'daily', action: 'daily' };
    await room.event('a', { ...command, userId: 'b' });expect(room.drainBroadcasts()).toHaveLength(0);
    await room.event('a', command);let broadcast = room.drainBroadcasts()[0]!;
    expect(broadcast.recipients).toEqual(['a']);expect(rewardResponseSchema.parse(broadcast.event).state?.coins).toBe(50);expect(rewards.read({ userId: 'b' }).coins).toBe(0);
    await room.event('a', { ...command, requestId: 'duplicate' });expect(rewardResponseSchema.parse(room.drainBroadcasts()[0]!.event).retryable).toBe(false);
    failing = true;await room.event('a', { ...command, requestId: 'retry', action: 'next' });broadcast = room.drainBroadcasts()[0]!;
    expect(broadcast.recipients).toEqual(['a']);expect(rewardResponseSchema.parse(broadcast.event).retryable).toBe(true);
    failing = false;await room.event('a', { ...command, requestId: 'retry', action: 'next' });expect(rewardResponseSchema.parse(room.drainBroadcasts()[0]!.event).state?.stage).toBe(1);
  } finally { await room.dispose('test');rewards.close(); }
});
