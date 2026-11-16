import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D } from '../../gameplay.ts';
import { overrideCombatAiDecision } from './override.ts';

function fixture() {
  const config = createTouchOfDeathPreset(), simulation = createCombatSimulation({ config,
    fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 2, y: 1, z: 0 } }] });
  const observation = { state: simulation.capture(), fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 2, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { config, simulation, observation };
}

test('experiment callbacks receive immutable detached legal candidates and cannot choose an unavailable action', () => {
  const candidates = [{ id: 'space', score: 1 }];
  expect(overrideCombatAiDecision(candidates, 5, (frame, view) => {
    expect(frame).toBe(5);expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view[0])).toBe(true);
    expect(Reflect.set(view[0]!, 'score', 50)).toBe(false);return view[0]!.id;
  })).toBe(candidates[0]);
  expect(candidates[0]!.score).toBe(1);
  expect(() => overrideCombatAiDecision(candidates, 5, () => 'attack:unavailable')).toThrow('available legal candidate');
  expect(overrideCombatAiDecision(candidates, 5, () => undefined)).toBeUndefined();
});

test('an absent or undefined-returning override preserves actual actions and all controller state exactly', () => {
  const { config, observation } = fixture();
  for (let seed = 1; seed <= 32; seed++) {
    const ordinary = createCombatAi3D({ config }), candidate = createCombatAi3D({ config, decisionOverride: () => undefined });
    for (let tick = 0; tick < 20; tick++) {
      observation.state.frame = tick;
      expect(candidate.step({ ...observation, seed })).toEqual(ordinary.step({ ...observation, seed }));
      expect(candidate.capture()).toEqual(ordinary.capture());
    }
  }
});

test('an actual forced legal choice records one-hot alternatives and probability one without consuming the RNG', () => {
  const { config, observation } = fixture(), ai = createCombatAi3D({ config, decisionOverride: () => 'space' });
  ai.startLearningEvidence();const action = ai.step(observation), saved = ai.capture(), trace = ai.learning()!.traces[0]!;
  expect(action.direction.x).toBeLessThan(0);expect(saved.policy.random).toBe(0);
  expect(trace.chosen).toBe('space');expect(trace.probability).toBe(1);expect(trace.candidates.length).toBeGreaterThan(1);
  expect(trace.candidates.reduce((sum, candidate) => sum + candidate.probability!, 0)).toBe(1);
  expect(trace.candidates.every(candidate => candidate.probability === Number(candidate.id === 'space'))).toBe(true);
  expect(JSON.stringify(saved)).not.toContain('decisionOverride');
});

test('actual airborne candidates prevent a scenario override from bypassing grounded-only dash legality', () => {
  const { config, observation } = fixture(), ai = createCombatAi3D({ config, decisionOverride: () => 'dash' });
  expect(() => ai.step({ ...observation, grounded: false })).toThrow('available legal candidate');
});

test('gameplay propagates the opt-in override with actual seat and frame while checkpoints keep no callback', async () => {
  const f = await combatMotionFixture({ match: true }), calls: { seat: 0 | 1; frame: number }[] = [];
  const game = createGameplay3D({ project: f.project, runtime: f.runtime, combatAiDecisionOverride: (seat, frame, candidates) => {
    calls.push({ seat, frame });return candidates.find(candidate => candidate.id === 'space')?.id;
  } });
  game.startCombatAiLearningEvidence();game.advance({ actions: ['match:theater'] });game.advance({ actions: ['match:start'] });
  for (let tick = 0; tick < 195; tick++) game.advance();
  expect(calls.some(call => call.seat === 0)).toBe(true);expect(calls.some(call => call.seat === 1)).toBe(true);
  expect(calls.every(call => Number.isSafeInteger(call.frame) && call.frame >= 0)).toBe(true);
  const finished = game.finishCombatAiLearningEvidence()!;
  expect(finished.learning.every(model => model?.traces.some(trace => trace.chosen === 'space' && trace.probability === 1))).toBe(true);
  expect(JSON.stringify(game.snapshot())).not.toContain('DecisionOverride');
});
