import { describe, expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import type { CombatSnapshot } from '../../../../combat/state.ts';
import { createCombatAi3D, type CombatAiObservation } from '../../combat-ai.ts';
import type { CombatAiTuning } from '../policy/instrumentation.ts';
import { rewriteWeaponInputs, synthesizeWeaponAttacks } from '../../combat-interaction/weapons/attacks.ts';
import { initialLearning, type CombatAiLearning } from './model.ts';

test('logical opponent identity preserves its model across reused seats and clears evidence for a new opponent', () => {
  const { ai, sim, options } = fixture({ mode: 'adaptive', opponentId: 'sparring-partner' });
  const model = initialLearning({ opponentId: 'sparring-partner' });
  model.actions = [{ context: 'near:ground:ground:neutral', action: 'attack:jab', samples: 8, reward: -4 }];
  ai.restoreLearning({ value: model, opponentId: 'sparring-partner' });
  ai.step(options(sim.capture()));
  expect(ai.learning()!.actions).toEqual(model.actions);
  ai.step({ ...options(sim.capture()), opponentId: 'new-partner' });
  expect(ai.learning()!.actions).toEqual([]);
  expect(ai.learning()!.opponentId).toBe('new-partner');
});

test('frozen evidence cannot cross a known opponent identity boundary', () => {
  const model = initialLearning({ opponentId: 'old-partner' });
  model.actions = [{ context: 'near:ground:ground:neutral', action: 'attack:jab', samples: 16, reward: -16 }];
  for (let seed = 1; seed <= 16; seed++) {
    const supplied = fixture({ mode: 'adaptive', learningFrozen: true, opponentId: 'new-partner' }, model);
    const empty = fixture({ mode: 'adaptive', learningFrozen: true, opponentId: 'new-partner' });
    expect(supplied.ai.step(supplied.options(supplied.sim.capture(), seed))).toEqual(empty.ai.step(empty.options(empty.sim.capture(), seed)));
    expect(supplied.ai.learning()).toEqual(model);
  }
});

function fixture(tuning: CombatAiTuning = { mode: 'adaptive', compression: false }, learning?: CombatAiLearning, weapon = false) {
  const config = createTouchOfDeathPreset(), held = { lightMoveId: 'tool-jab', heavyMoveId: 'tool-heavy', length: 2.5 };
  if (weapon) {
    const light = config.moves.find(move => move.id === 'jab')!, heavy = config.moves.find(move => move.id === 'heavy')!;
    config.moves.push({ ...structuredClone(light), id: held.lightMoveId, command: ['tool-jab'], reach: held.length },
      { ...structuredClone(heavy), id: held.heavyMoveId, command: ['tool-heavy'], reach: held.length });
    synthesizeWeaponAttacks({ config, weapons: [held] });
  }
  const sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 }, facing: { x: 1, y: 0, z: 0 } },
    { id: 'b', position: { x: 1.3, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const ai = createCombatAi3D({ config, tuning, learning });
  const initial = sim.capture();
  function options(state: CombatSnapshot, seed = 6): CombatAiObservation {
    const self = state.fighters[0]!, target = state.fighters[1]!;
    return { state, seed, fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
      ...(weapon ? { weapons: [{ ...held, owner: 'a', projectileOwner: '', position: self.position, velocity: { x: 0, y: 0, z: 0 } }] } : {}),
      body: { ...self.position, velocityX: 0, velocityY: 0, velocityZ: 0 },
      targetBody: { ...target.position, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  }
  function advance(count: number) {
    const actions = [], events = [];
    for (let i = 0; i < count; i++) {
      const action = ai.step(options(sim.capture()));actions.push(action);
      if (weapon) rewriteWeaponInputs(config, action.input, held);
      const resolved = sim.step({ inputs: [action.input, { fighterId: 'b', guard: false }] });events.push(...resolved);
      ai.observe({ state: sim.capture(), events: resolved, fighterId: 'a', targetId: 'b' });
    }
    return { actions, events };
  }
  return { ai, sim, config, initial, options, advance };
}

function trained() {
  const f = fixture();
  const events: ReturnType<typeof f.advance>['events'] = [];
  for (let round = 0; round < 4; round++) {
    events.push(...f.advance(160).events);f.ai.reset({ round: true });f.sim.restore({ snapshot: f.initial });
  }
  return { ...f, events };
}

describe('controller contextual adaptation through real combat', () => {
  test('actual executed attacks and public contacts become effectiveness evidence that changes later legal probabilities', () => {
    const f = trained(), learned = f.ai.learning()!;
    expect(learned.actions.some(row => row.action.startsWith('attack:') && row.reward > 0)).toBe(true);
    expect(f.events.some(event => event.kind === 'hit' && event.damage > 0)).toBe(true);
    // Round reset can censor a continuing combo; its observed contacts still teach the learner.
    expect(learned.traces.some(trace => trace.reward > 0 && (trace.outcome.startsWith('hit') || trace.outcome === 'partial-contact'))).toBe(true);
    const saved = f.ai.capture(), control = fixture();
    control.ai.restore({ ...saved, learning: initialLearning({ opponentId: 'b' }) });
    const observation = f.options(f.initial);
    f.ai.step(observation);control.ai.step(observation);
    const actual = f.ai.learning()!.traces.at(-1)!, fresh = control.ai.learning()!.traces.at(-1)!;
    expect(actual.context).toBe(fresh.context);expect(actual.candidates.map(c => c.id)).toEqual(fresh.candidates.map(c => c.id));
    const differences = actual.candidates.map((candidate, i) => candidate.score - fresh.candidates[i]!.score);
    expect(differences.some(delta => Math.abs(delta) > .01)).toBe(true);
    expect(differences.every(delta => Math.abs(delta) <= 1.5)).toBe(true);
    expect(actual.candidates.some((c, i) => Math.abs(c.probability! - fresh.candidates[i]!.probability!) > .001)).toBe(true);
    expect(actual.candidates.reduce((sum, c) => sum + c.probability!, 0)).toBeCloseTo(1);
  });

  test('adaptation disabled neither updates nor applies supplied evidence', () => {
    const learning = trained().ai.learning()!, disabled = fixture({ mode: 'adaptive', compression: false, adaptation: false }, learning);
    const fresh = fixture({ mode: 'adaptive', compression: false, adaptation: false });
    expect(disabled.advance(120).actions).toEqual(fresh.advance(120).actions);
    expect(disabled.ai.learning()).toEqual(learning);expect(fresh.ai.learning()).toBeUndefined();
  });

  test('frozen evaluation applies learned scores without mutating the learned model', () => {
    const learning = trained().ai.learning()!;
    let different = 0;
    for (let seed = 1; seed <= 64; seed++) {
      const learned = fixture({ mode: 'adaptive', compression: false, learningFrozen: true }, learning);
      const fresh = fixture({ mode: 'adaptive', compression: false, learningFrozen: true }, initialLearning({ opponentId: 'b' }));
      const observation = learned.options(learned.initial, seed);
      if (JSON.stringify(learned.ai.step(observation)) !== JSON.stringify(fresh.ai.step(observation))) different++;
      expect(learned.ai.learning()).toEqual(learning);
    }
    expect(different).toBeGreaterThan(0);
    const f = fixture({ mode: 'adaptive', compression: false, learningFrozen: true }, learning);f.advance(120);
    expect(f.ai.learning()).toEqual(learning);
  });

  test('JSON save and restore continue actual simulation actions and learning exactly', () => {
    const f = fixture();f.advance(45);
    const savedAi = JSON.parse(JSON.stringify(f.ai.capture())), savedSim = JSON.parse(JSON.stringify(f.sim.capture()));
    const expected = f.advance(110), expectedAi = f.ai.capture(), expectedSim = f.sim.capture();
    f.ai.restore(savedAi);f.sim.restore({ snapshot: savedSim });
    expect(f.advance(110)).toEqual(expected);expect(f.ai.capture()).toEqual(expectedAi);expect(f.sim.capture()).toEqual(expectedSim);
  });

  test('same-opponent game resets retain completed evidence, censor pending decisions, and new opponents clear evidence', () => {
    const f = trained();f.ai.step(f.options(f.initial));
    const previous = f.ai.learning()!;expect(previous.pending).not.toBeNull();
    f.ai.reset({ round: true });
    expect(f.ai.learning()!.actions).toEqual(previous.actions);expect(f.ai.learning()!.pending).toBeNull();
    expect(f.ai.learning()!.traces.some(t => t.status === 'censored')).toBe(true);
    f.ai.restoreLearning({ value: JSON.parse(JSON.stringify(previous)), opponentId: 'b' });
    expect(f.ai.learning()!.actions).toEqual(previous.actions);expect(f.ai.learning()!.pending).toBeNull();
    f.ai.restoreLearning({ value: previous, opponentId: 'b', newOpponent: true });
    expect(f.ai.learning()!.actions).toHaveLength(0);expect(f.ai.learning()!.habits).toHaveLength(0);expect(f.ai.learning()!.traces).toHaveLength(0);
  });

  test('held weapon command rewriting credits actual physical hits to authored tactical alternatives', () => {
    const f = fixture({ mode: 'adaptive', compression: false }, undefined, true), result = f.advance(240);
    expect(result.events.some(event => event.attackerId === 'a' && event.moveId.startsWith('tool-') && event.damage > 0)).toBe(true);
    const learned = f.ai.learning()!;
    expect(learned.traces.some(trace => trace.status === 'complete' && trace.move.startsWith('tool-') && trace.chosen.startsWith('attack:') && !trace.chosen.includes('tool-'))).toBe(true);
    expect(learned.actions.some(row => row.action.startsWith('attack:') && !row.action.includes('tool-') && row.reward > 0)).toBe(true);
  });
});
