import { expect, test } from 'bun:test';
import { COMBAT_ATTACK_POSES, createCombatPreset } from '../../../../combat/config.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { sampleCombatAttackPose } from '../attack-pose.ts';

test('dash followup families have distinct anticipation and remain inside actual contact volumes', () => {
  const config = createCombatPreset(), fighter = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture().fighters[0]!;
  const signatures = new Set<string>();
  for (const pose of COMBAT_ATTACK_POSES) {
    const move = { ...config.moves[0]!, id: pose, pose, startupFrames: 12, activeFrames: 6, recoveryFrames: 18, reach: 2.4, hitRadius: 1, hitHeight: pose === 'wheel-kick' ? 2 : 0 };
    fighter.moveFrame = 7;signatures.add(JSON.stringify(sampleCombatAttackPose(fighter, move)));
    fighter.facing = { x: .6, y: .6, z: Math.sqrt(.28) };
    for (let frame = 12; frame < 18; frame++) {
      fighter.moveFrame = frame;const sample = sampleCombatAttackPose(fighter, move), low = fighter.facing.y * move.reach, high = low + move.hitHeight;
      const dy = sample.fist[1] - Math.max(low, Math.min(high, sample.fist[1]));
      expect(Math.hypot(sample.fist[0], dy, sample.fist[2] - .8 * move.reach)).toBeLessThanOrEqual(move.hitRadius);
    }
    fighter.moveFrame = 36;const ready = sampleCombatAttackPose(fighter, move);
    for (let index = 0; index < 3; index++) expect(ready.fist[index]).toBeCloseTo([.46 * ready.hand, .2, .28][index]!);expect(ready.pitch).toBeCloseTo(0);expect(ready.yaw).toBeCloseTo(0);
  }
  expect(signatures.size).toBe(COMBAT_ATTACK_POSES.length);
});

test('wheel kick leans through one bounded sweep then settles without replaying the roll', () => {
  const config = createTouchOfDeathPreset(), wheel = config.moves.find(move => move.id === 'dash-wheel-kick')!;
  const fighter = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture().fighters[0]!;
  for (const stringOnly of [false, true]) {
    const move = { ...wheel, stringOnly };
    const rolls: number[] = [];
    for (let frame = 0; frame <= move.startupFrames + move.activeFrames + move.recoveryFrames; frame++) {
      fighter.moveFrame = frame;
      const sample = sampleCombatAttackPose(fighter, move);
      expect(sample.kick).toBe(true);
      expect(sample.hand).toBe(1);
      expect(Math.abs(sample.roll)).toBeLessThanOrEqual(.53);
      rolls.push(sample.roll);
    }
    const deepest = rolls.indexOf(Math.min(...rolls));
    for (let frame = 1; frame <= deepest; frame++) expect(rolls[frame]!).toBeLessThanOrEqual(rolls[frame - 1]! + 1e-6);
    for (let frame = deepest + 1; frame < rolls.length; frame++) expect(rolls[frame]!).toBeGreaterThanOrEqual(rolls[frame - 1]! - 1e-6);
    expect(deepest).toBeGreaterThanOrEqual(move.startupFrames);
    expect(deepest).toBeLessThan(move.startupFrames + move.activeFrames);
    expect(rolls.at(-1)).toBeCloseTo(0);
  }
});
