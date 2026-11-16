import { expect, test } from 'bun:test';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import { createTrainingRoom } from '../training/room.ts';
import { readTrainingSnapshot, trainingProtocolVersion } from '../../src/training/protocol.ts';
import { createRewardService } from './service.ts';
import { withSocialProgression } from './social-room.ts';
import { createProfileCombatRoom } from '../profiles/room.ts';
import { profileProtocolVersion } from '../../src/appearance/profile.ts';

test('private set rewards use fighter observations even when the first viewer is a spectator', async () => {
  let time = 86400000;const rewards = createRewardService({ databasePath: ':memory:', now: () => time });
  const room = createAuthoritativeRoom({ id: 'private', now: () => time, metrics: { record() {} }, type: withSocialProgression({ rewards, now: () => time,
    room: createProfileCombatRoom({ matchId: 'set', contentId: 'content', seed: 7, allowedActions: ['jab', 'guard'], maxSpectators: 1 }),
  }) });
  try {
    for (const id of ['watch', 'a', 'b']) await room.join({ id, userId: id, roomId: 'private', sessionId: id, joinedAt: time, lastInputAt: time }, { matchId: 'set', contentId: 'content', profileVersion: profileProtocolVersion, role: id === 'watch' ? 'spectator' : 'fighter' });
    await room.update(1);
    for (let frame = 0; frame < 301; frame++) {
      for (const id of ['a', 'b']) await room.input(id, { matchId: 'set', frame, actions: [frame % 2 ? 'jab' : 'guard'], direction: { x: 0, y: 0, z: 0 } });
      time += 1000;await room.update(1);
    }
    expect(rewards.read({ userId: 'watch' }).coins).toBe(0);
    for (const userId of ['a', 'b']) expect(rewards.read({ userId })).toMatchObject({ coins: 25, matches: 0, wins: 0 });
  } finally { rewards.close(); }
});

async function fixture(failOnce = false) {
  let time = 86400000, frame = 0;
  const rewards = createRewardService({ databasePath: ':memory:', now: () => time });
  const attempts: string[] = [];
  const room = createAuthoritativeRoom({ id: 'social', now: () => time, metrics: { record() {} }, type: withSocialProgression({
    room: createTrainingRoom({ contentId: 'content', seed: 7, allowedActions: ['jab', 'guard'], now: () => time }), now: () => time,
    rewards: { ...rewards, async awardSocial(input) { attempts.push(input.receiptId);if (failOnce && attempts.length === 1) throw Error('Storage temporarily unavailable');return rewards.awardSocial(input); } },
  }) });
  for (const id of ['a', 'b']) await room.join({ id, userId: id, roomId: 'social', sessionId: id, joinedAt: time, lastInputAt: time }, { contentId: 'content', trainingVersion: trainingProtocolVersion, role: 'fighter' });
  await room.update(1);
  const snapshot = () => readTrainingSnapshot(room.snapshotFor('a'));
  return { room, rewards, attempts, snapshot, resetFrame() { frame = 0; },
    async step(count: number, active: 'both' | 'one' | 'held' = 'both', ms = 1000) {
      for (let index = 0; index < count; index++) {
        const matchId = snapshot().matchId;
        for (const id of ['a', 'b']) await room.input(id, { matchId, frame, actions: active === 'one' && id === 'b' ? [] : [active === 'held' || frame % 2 ? 'jab' : 'guard'], direction: { x: 0, y: 0, z: 0 } });
        frame++;time += ms;await room.update(ms / 1000);
      }
    },
  };
}

test('both active partners earn together across a training reset, once, without wins', async () => {
  const f = await fixture();
  try {
    await f.step(150);expect(f.rewards.read({ userId: 'a' }).coins).toBe(0);
    const first = f.snapshot();await f.room.event('a', { type: 'training-propose', matchId: first.matchId, requestId: 'reset', action: 'reset' });
    await f.room.event('b', { type: 'training-respond', matchId: first.matchId, proposalId: f.snapshot().training.proposalId, accept: true });f.resetFrame();
    await f.step(151);
    for (const userId of ['a', 'b']) expect(f.rewards.read({ userId })).toMatchObject({ coins: 25, socialCoins: 25, matches: 0, wins: 0 });
    expect(f.attempts).toHaveLength(1);
  } finally { f.rewards.close(); }
});

test('idle partners, held controls, disconnected seats and clock jumps do not farm five minutes', async () => {
  const f = await fixture();
  try {
    await f.step(320, 'one');await f.step(320, 'held');
    f.room.ctx.players.get('b')!.reconnectUntil = Number.MAX_SAFE_INTEGER;await f.step(320);delete f.room.ctx.players.get('b')!.reconnectUntil;
    await f.step(1, 'both', 300000);
    expect(f.rewards.read({ userId: 'a' }).coins).toBe(0);expect(f.attempts).toEqual([]);
  } finally { f.rewards.close(); }
});

test('an interrupted grant retries the same receipt and the daily cap stops further grants', async () => {
  const f = await fixture(true);
  try {
    await f.step(301);expect(f.rewards.read({ userId: 'a' }).coins).toBe(0);
    await f.step(5);expect(f.attempts).toHaveLength(2);expect(f.attempts[1]).toBe(f.attempts[0]);
    expect(f.rewards.read({ userId: 'a' }).coins).toBe(25);
    await f.step(1500);expect(f.rewards.read({ userId: 'a' }).coins).toBe(100);expect(f.attempts).toHaveLength(5);
  } finally { f.rewards.close(); }
});
