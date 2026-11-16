import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { readCombatAiTuning } from '../policy/instrumentation.ts';

test('ordinary tuning resolves to adaptation on and compression off; baseline and frozen evaluation remain explicit', () => {
  expect(readCombatAiTuning(undefined)).toEqual({ mode: 'adaptive', adaptation: true, compression: false });
  expect(readCombatAiTuning({})).toEqual(readCombatAiTuning(undefined));
  expect(readCombatAiTuning({ mode: 'baseline' })).toEqual({ mode: 'baseline', adaptation: false, compression: false });
  expect(readCombatAiTuning({ learningFrozen: true })).toEqual({ mode: 'adaptive', adaptation: true, compression: false, learningFrozen: true });
  expect(readCombatAiTuning({ adaptation: false })).toEqual({ mode: 'adaptive', adaptation: false, compression: false });
  expect(() => readCombatAiTuning({ adaptation: 'true' })).toThrow();
  expect(readCombatAiTuning({ exploration: .08 }).exploration).toBe(.08);
  for (const exploration of [-1, 1.01, NaN, Infinity, '0.1']) expect(() => readCombatAiTuning({ exploration })).toThrow();
});

test('controller with no tuning learns from actual committed fights and preserves that evidence across games', () => {
  const config = createTouchOfDeathPreset(), ai = createCombatAi3D({ config }), sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1.3, y: 1, z: 0 } },
  ] });
  for (let frame = 0; frame < 160; frame++) {
    const state = sim.capture(), action = ai.step({ state, seed: 6, fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
      body: { ...state.fighters[0]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...state.fighters[1]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
    const events = sim.step({ inputs: [action.input] });ai.observe({ state: sim.capture(), events, fighterId: 'a', targetId: 'b' });
  }
  expect(ai.capture().tuning).toEqual({ mode: 'adaptive', adaptation: true, compression: false });
  expect(ai.learning()?.actions.some(row => row.samples > 0)).toBe(true);
  const learned = ai.learning()!.actions;ai.reset();
  const retained = ai.learning()!;
  // The boundary may credit a pending attack's already observed contacts once.
  for (const row of learned) expect(retained.actions.find(entry => entry.action === row.action && entry.context === row.context)!.samples).toBeGreaterThanOrEqual(row.samples);
  expect(retained.pending).toBeNull();expect(retained.next).toBeNull();
  ai.reset();expect(ai.learning()!.actions).toEqual(retained.actions);
  const baseline = createCombatAi3D({ config, tuning: { mode: 'baseline' } });
  expect(baseline.capture().tuning?.mode).toBe('baseline');expect(baseline.learning()).toBeUndefined();
});
