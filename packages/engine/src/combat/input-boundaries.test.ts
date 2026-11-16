import { expect, test } from 'bun:test';
import { createCombatSimulation } from './simulation.ts';
import { normalizeFacing } from './state.ts';
import { createCombatPreset } from './config.ts';
import { advanceFighter } from './step.ts';
import { createTouchOfDeathPreset } from './touch-of-death.ts';

test('recovery buffers start on the first actionable frame and expire during longer stun', () => {
  const config = createCombatPreset();
  for (const kind of ['hit', 'block'] as const) for (const duration of [2, config.inputBufferFrames + 1]) {
    const simulation = createCombatSimulation({ config, fighters: [{ id: 'player', position: { x: 0, y: 0, z: 0 } }] });
    const fighter = simulation.capture().fighters[0]!;
    fighter.stunKind = kind;
    fighter.stunFrames = duration;
    for (let frame = 0; frame < duration; frame++) {
      advanceFighter(fighter, frame === 0 ? { fighterId: 'player', pressed: ['jab'] } : undefined, config, frame);
      expect(fighter.moveId).toBe('');
    }
    advanceFighter(fighter, undefined, config, duration);
    expect(fighter.moveId).toBe(duration < config.inputBufferFrames ? 'jab' : '');
    expect(fighter.attackSerial).toBe(duration < config.inputBufferFrames ? 1 : 0);
  }
});

test('foreign guard types reject before poses or fighter state mutate', () => {
  const simulation = createCombatSimulation({ fighters: [{ id: 'player', position: { x: 0, y: 0, z: 0 } }] });
  const before = simulation.capture();
  // JSON is the actual untyped boundary used by custom hosts and remote inputs.
  const inputs = JSON.parse('[{"fighterId":"player","guard":"false"}]');
  expect(() => simulation.step({ inputs, poses: [{ fighterId: 'player', position: { x: 4, y: 0, z: 0 } }] })).toThrow('boolean');
  expect(simulation.capture()).toEqual(before);
});

test('facing normalization handles finite vectors whose length would overflow', () => {
  const facing = normalizeFacing({ x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE });
  expect(Math.hypot(facing.x, facing.y, facing.z)).toBeCloseTo(1);
  expect(facing.x).toBeCloseTo(1 / Math.sqrt(3));
});

test('saved facing must remain a unit direction and rejects atomically', () => {
  const simulation = createCombatSimulation({ fighters: [{ id: 'player', position: { x: 0, y: 0, z: 0 } }] });
  const before = simulation.capture(), invalid = simulation.capture();
  invalid.fighters[0]!.facing.x = 2;
  expect(() => simulation.restore({ snapshot: invalid })).toThrow('facing');
  expect(simulation.capture()).toEqual(before);
});

test('physical whiff punishment respects the final committed frame and fresh versus held guard', () => {
  const config = { ...createTouchOfDeathPreset(), idleStaminaRegen: undefined, staminaRegen: 0, hitstunStaminaRegen: 0, parryStaminaRestore: 0 };
  const flurry = config.moves.find(move => move.id === 'drive-jab')!;
  const heavy = config.moves.find(move => move.id === 'heavy')!;
  const recovered = flurry.startupFrames + flurry.activeFrames + flurry.recoveryFrames;
  for (const scenario of [
    { impact: recovered - 1, held: false, kind: 'hit' },
    { impact: recovered, held: false, kind: 'parry' },
    { impact: recovered + 1, held: false, kind: 'parry' },
    { impact: recovered, held: true, kind: 'block' },
  ] as const) {
    const sim = createCombatSimulation({ config, fighters: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 2.3, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
    ] });
    for (let frame = 0; frame <= scenario.impact; frame++) {
      const events = sim.step({ inputs: [
        { fighterId: 'a', pressed: frame === 0 ? ['jab'] : [], drive: frame === 0, guard: scenario.held || frame === scenario.impact },
        { fighterId: 'b', pressed: frame === scenario.impact - heavy.startupFrames ? ['heavy'] : [] },
      ] });
      if (frame < scenario.impact) expect(events).toEqual([]);
      else expect(events).toMatchObject([{ attackerId: 'b', targetId: 'a', kind: scenario.kind }]);
    }
    expect(sim.capture().fighters[0]!.attackSerial).toBe(1);
    expect(sim.capture().fighters[1]!.attackSerial).toBe(1);
    // All four Drive strike windows whiffed: no hidden contact refund.
    expect(sim.capture().fighters[0]!.stamina).toBe(config.maxStamina! - flurry.staminaCost!);
  }
});
