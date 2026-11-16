import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { createCombatAiPolicy } from '../policy/trained.ts';
import { learningAdjustment } from './model.ts';
import { readLearning } from './validation.ts';

function fixture() {
  const config = createTouchOfDeathPreset(), ai = createCombatAi3D({ config }), sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1.3, y: 1, z: 0 } },
  ] });
  function advance(count: number) {
    for (let tick = 0; tick < count; tick++) {
      const state = sim.capture(), action = ai.step({ state, seed: 6, fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
        body: { ...state.fighters[0]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...state.fighters[1]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
      const events = sim.step({ inputs: [action.input] });ai.observe({ state: sim.capture(), events, fighterId: 'a', targetId: 'b' });
    }
  }
  return { config, ai, sim, advance };
}

test('an actual confirmed lethal cancel has one deterministic trace and teaches its authored hitstun action', () => {
  const f = fixture(), state = f.sim.capture(), jab = f.config.moves.find(move => move.id === 'jab')!;
  state.frame = 20;
  Object.assign(state.fighters[0]!, { moveId: 'jab', moveFrame: jab.startupFrames + jab.activeFrames, attackSerial: 1, hitTargets: ['b'], hitConfirmed: true });
  Object.assign(state.fighters[1]!, { stunKind: 'hit', stunFrames: 60, health: 1 });
  f.sim.restore({ snapshot: state });f.advance(60);
  const learning = f.ai.learning()!, trace = learning.traces.find(t => t.chosen.startsWith('forced:') && t.status === 'complete')!;
  expect(trace).toBeDefined();expect(trace.context).toBe('near:ground:ground:stunned');
  expect(trace.probability).toBe(1);expect(trace.candidates).toHaveLength(1);expect(trace.candidates[0]?.probability).toBe(1);
  const action = `attack:${trace.chosen.slice(7)}`, row = learning.actions.find(r => r.context === trace.context && r.action === action)!;
  expect(row.samples).toBe(1);expect(row.reward).toBeGreaterThan(0);expect(f.sim.capture().fighters[1]!.health).toBe(0);
  expect(learningAdjustment(learning, trace.context, { id: action, score: 0 })).toBeGreaterThan(0);
  expect(learning.traces.filter(t => t.frame === trace.frame)).toHaveLength(1);
  expect(readLearning(learning)).toEqual(learning);
});

test('an actual armored escape decision records its observed outcome once without claiming neutral alternatives', () => {
  const f = fixture(), state = f.sim.capture();Object.assign(state.fighters[0]!, { stunKind: 'hit', stunFrames: 40 });
  f.sim.restore({ snapshot: state });f.advance(100);
  const learning = f.ai.learning()!, trace = learning.traces.find(t => t.chosen === 'forced:escape')!;
  expect(trace).toBeDefined();expect(trace.candidates).toHaveLength(1);expect(trace.probability).toBe(1);
  expect(trace.status === 'complete' || trace.outcome === 'partial-contact').toBe(true);
  const row = learning.actions.find(r => r.action === 'attack:escape')!;expect(row).toBeDefined();expect(row.samples).toBeGreaterThan(0);
  expect(learning.traces.filter(t => t.frame === trace.frame && t.chosen === trace.chosen)).toHaveLength(1);
});

test('a real neutral hit followed by a confirmed cancel teaches both actions once with separate windows', () => {
  const config = createTouchOfDeathPreset(), jab = config.moves.find(move => move.id === 'jab')!;
  const second = config.moves.find(move => move.stringOnly && move.command[0] === 'jab' && jab.cancels.some(cancel => cancel.moveId === move.id) && move.drive && move.direction === 'neutral')!;
  expect(second).toBeDefined();
  const ids = new Set([jab.id, second.id]);config.moves = [jab, second].map(move => ({ ...move, cancels: move.id === second.id ? [] : move.cancels.filter(cancel => ids.has(cancel.moveId)) }));
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1.3, y: 1, z: 0 } }] });
  const ai = createCombatAi3D({ config, trainedPolicy: createCombatAiPolicy({ id: 'jab-start', scores: { 'attack:jab': 2, approach: -2, space: -2 } }) });
  for (let tick = 0; tick < 100; tick++) {
    const state = sim.capture(), action = ai.step({ state, seed: 6, fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
      body: { ...state.fighters[0]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...state.fighters[1]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
    const events = sim.step({ inputs: [action.input] });ai.observe({ state: sim.capture(), events, fighterId: 'a', targetId: 'b' });
    if (ai.learning()?.actions.some(row => row.action === `attack:${second.id}`)) break;
  }
  const learning = ai.learning()!, original = learning.actions.find(row => row.action === 'attack:jab')!, continuation = learning.actions.find(row => row.action === `attack:${second.id}`)!;
  expect(original).toBeDefined();expect(continuation).toBeDefined();expect(original.samples).toBe(.25);expect(continuation.samples).toBe(1);
  expect(original.reward).toBeGreaterThan(0);expect(continuation.reward).toBeGreaterThan(0);
  expect(learning.traces.some(trace => trace.chosen === `forced:${second.id}` && trace.status === 'complete' && trace.context.endsWith(':stunned'))).toBe(true);
});
