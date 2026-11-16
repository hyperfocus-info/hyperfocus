import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import type { CombatInput } from '../../../../combat/state.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { createCombatInteractions } from '../../combat-interaction/session.ts';
import { initialLearning, learningContext, observeLearning, recordDecision, resetLearning, resolveLearning } from './model.ts';
import { readLearning } from './validation.ts';

test('real 24-frame reaction delivery keeps the original decision despite later draws', () => {
  const config = createTouchOfDeathPreset();let attached = false;
  for (let seed = 1; seed <= 20 && !attached; seed++) {
    const sim = createCombatSimulation({ config, fighters: [
      { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1.3, y: 1, z: 0 } },
    ] });
    const ai = createCombatAi3D({ config, tuning: { mode: 'adaptive', compression: false } });
    let first: ReturnType<typeof ai.learning>;
    for (let tick = 0; tick < 25; tick++) {
      const state = sim.capture(), self = state.fighters[0]!, target = state.fighters[1]!;
      const action = ai.step({ state, seed, fighterId: 'a', targetId: 'b', difficulty: 1, grounded: true, targetGrounded: true,
        body: { ...self.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...target.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
      if (tick === 0) first = ai.learning();
      const events = sim.step({ inputs: [action.input] });ai.observe({ state: sim.capture(), events, fighterId: 'a', targetId: 'b' });
    }
    if (!first?.pending?.move) continue;
    const memory = ai.learning()!;
    expect(memory.pending?.frame).toBe(0);expect(memory.pending?.started).toBe(24);
    expect(memory.pending?.action).toBe(first.pending.action);expect(memory.pending?.context).toBe(first.pending.context);
    expect(memory.traces[0]?.probability).toBe(first.traces[0]?.probability);
    expect(memory.traces.slice(1).every(trace => trace.status === 'censored')).toBe(true);
    expect(memory.pending?.move).toBe(sim.capture().fighters[0]!.moveId);
    attached = true;
  }
  expect(attached).toBe(true);
});

function grappleFixture() {
  const config = createTouchOfDeathPreset(), sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const session = createCombatInteractions({ config, definition: { weapons: [], grappleStartupFrames: 8, grappleTechFrames: 6 }, positions: new Map(), fighterIds: ['a', 'b'] });
  const memory = initialLearning({ opponentId: 'b' }), initial = sim.capture(), context = learningContext(initial.fighters[0]!, initial.fighters[1]!, 1);
  observeLearning(memory, { state: initial, fighterId: 'a', targetId: 'b', distance: 1 });
  const chosen = { id: 'grapple', grapple: true, score: 1 };
  recordDecision(memory, { frame: 0, context, candidates: [chosen], chosen, probability: 1 });
  const tick = (inputs: CombatInput[] = []) => {
    const state = sim.capture();observeLearning(memory, { state, fighterId: 'a', targetId: 'b', distance: 1 });
    const events = session.before(state, inputs);sim.restore({ snapshot: state });events.push(...sim.step({ inputs }));
    resolveLearning(memory, { state: sim.capture(), events, fighterId: 'a', targetId: 'b' });return events;
  };
  return { sim, session, memory, tick };
}

test('real interaction grapples earn one observed throw or tech outcome without attack serials', () => {
  for (const tech of [false, true]) {
    const f = grappleFixture();f.tick([{ fighterId: 'a', pressed: ['interact'] }]);
    for (let i = 0; i < 35; i++) f.tick(tech && f.session.techWindow('b') ? [{ fighterId: 'b', pressed: ['interact'] }] : []);
    expect(f.sim.capture().fighters[0]!.attackSerial).toBe(0);
    expect(f.memory.actions).toHaveLength(1);expect(f.memory.actions[0]?.action).toBe('grapple');expect(f.memory.actions[0]?.samples).toBe(1);
    expect(f.memory.actions[0]?.reward).toBeCloseTo(tech ? -.8 : 0.13333333333333333);
    expect(f.memory.traces[0]?.outcome).toBe(tech ? 'grapple-teched' : 'hit');
    expect(readLearning(f.memory)).toEqual(f.memory);
  }
});

test('failed grapple windup is censored when public contacts cannot prove execution', () => {
  const f = grappleFixture();f.tick([{ fighterId: 'a', pressed: ['interact'] }]);
  const moved = f.sim.capture();moved.fighters[1]!.position.x = 20;f.sim.restore({ snapshot: moved });
  for (let i = 0; i < 181; i++) f.tick();
  expect(f.session.capture().trace.some(row => row.kind === 'grapple-whiff')).toBe(true);
  expect(f.memory.actions).toHaveLength(0);expect(f.memory.traces[0]?.status).toBe('censored');
});

test('queued movement attribution starts at delivery and does not learn pre-delivery damage', () => {
  const f = grappleFixture();resetLearning(f.memory, { round: true });f.memory.traces = [];
  const chosen = { id: 'space', movement: 'away' as const, score: 1 };
  recordDecision(f.memory, { frame: 0, context: 'near:ground:ground:neutral', candidates: [chosen], chosen, probability: 1, deliveryDelay: 24 });
  expect(f.memory.pending?.started).toBe(24);expect(f.memory.pending?.deadline).toBe(36);
  const state = f.sim.capture();state.frame = 10;
  resolveLearning(f.memory, { state, fighterId: 'a', targetId: 'b', events: [{ id: 'earlier', frame: 9, attackerId: 'b', targetId: 'a', moveId: 'jab', kind: 'hit', damage: 10, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(f.memory.pending?.received).toBe(0);expect(f.memory.actions).toHaveLength(0);
});
