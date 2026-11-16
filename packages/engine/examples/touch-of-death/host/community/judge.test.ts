import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../test/combat-fixture.ts';
import type { ConfirmedCombatFrames } from '@hyperfocus/engine/server';
import { createCombatResultJudge } from './judge.ts';

const match = { matchId: 'set', contentId: 'fixture', seed: 19, seats: ['one', 'two'] };
function batch(frame: number): ConfirmedCombatFrames {
  return { ...match, roomId: 'friends', frames: [0, 1].map(seat => ({ matchId: match.matchId, frame, seat, actions: [], direction: { x: 0, y: 0, z: 0 } })) };
}
async function fixture() {
  const f = await combatMotionFixture({ match: true });f.game.reset();
  return { ...f, judge: createCombatResultJudge({ project: f.project, runtime: f.runtime, match, battleId: 'battle', roomId: 'friends' }) };
}

test('trusted judge accepts shared grab and pickup input while still rejecting unknown commands', async () => {
  const f = await fixture();
  for (let frame = 0; frame < 181; frame++) f.judge.accept(batch(frame));
  const grab = batch(181);grab.frames[0]!.actions = ['interact'];
  expect(() => f.judge.accept(grab)).not.toThrow();
  const invalid = batch(182);invalid.frames[0]!.actions = ['invented'];
  expect(() => f.judge.accept(invalid)).toThrow('authored action');
  expect(() => f.judge.accept(batch(182))).not.toThrow();
});

test('judge validates whole batches before advancing and rejects gaps, identities and conflicting duplicates', async () => {
  const f = await fixture(), initial = f.runtime.snapshot();
  expect(() => f.judge.accept({ ...batch(0), roomId: 'wrong' })).toThrow('identity');
  expect(() => f.judge.accept(batch(1))).toThrow('gap');
  const invalid = batch(0);invalid.frames.push(...batch(1).frames);invalid.frames[3]!.actions = ['invented'];
  expect(() => f.judge.accept(invalid)).toThrow('authored action');expect(f.runtime.snapshot()).toEqual(initial);
  expect(f.judge.accept(batch(0))).toBeUndefined();const after = f.runtime.snapshot();
  expect(f.judge.accept(batch(0))).toBeUndefined();expect(f.runtime.snapshot()).toEqual(after);
  const conflict = batch(0);conflict.frames[0]!.actions = ['jab'];
  expect(() => f.judge.accept(conflict)).toThrow('Conflicting');
  for (let frame = 1; frame <= 120; frame++) expect(f.judge.accept(batch(frame))).toBeUndefined();
  expect(() => f.judge.accept(batch(0))).toThrow('Stale');
});

test('ordinary authored jabs and approach inputs earn a stable first-to-three judge outcome', async () => {
  const f = await fixture();let result, frame = 0, last = batch(0);
  // The judge's physics owns all movement/contact. No health, stun or transform writes.
  for (; frame < 5000 && !result; frame++) {
    last = batch(frame);
    const actor = f.runtime.physics.body('a')!, target = f.runtime.physics.body('b')!;
    const dx = target.x - actor.x, dz = target.z - actor.z, length = Math.hypot(dx, dz);
    if (length > 1.3) last.frames[0]!.direction = { x: dx / length, y: 0, z: dz / length };
    if (frame % 30 === 0) last.frames[0]!.actions = ['jab'];
    result = f.judge.accept(last);
  }
  expect(result).toEqual({ battleId: 'battle', matchId: 'set', seats: ['one', 'two'], winner: 0, confirmedFrame: frame - 1, score: [3, 0] });
  const terminal = f.runtime.snapshot();expect(f.judge.accept(last)).toEqual(result);
  result!.score[0] = 99;result!.seats[0] = 'tampered';
  expect(f.judge.accept(last)).toMatchObject({ score: [3, 0], seats: ['one', 'two'] });
  expect(f.judge.accept(batch(frame))).toMatchObject({ winner: 0, confirmedFrame: frame - 1 });
  expect(f.runtime.snapshot()).toEqual(terminal);
}, 30000);
