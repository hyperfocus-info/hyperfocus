import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createFighter, type CombatSnapshot } from '../../../../combat/state.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { compactLearning } from './capture.ts';
import { initialLearning, observeLearning, recordDecision, resolveLearning, type LearningCandidate } from './model.ts';
import { readLearning } from './validation.ts';

function attribution() {
  const memory = initialLearning(), state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [
    createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100),
    createFighter({ id: 'b', position: { x: 2, y: 0, z: 0 } }, 100),
  ] };
  const context = 'near:ground:ground:neutral', candidates: LearningCandidate[] = [
    { id: 'attack:jab', moveId: 'jab', score: 2, probability: .6 },
    { id: 'attack:heavy', moveId: 'heavy', score: 1, probability: .4 },
  ];
  observeLearning(memory, { state, fighterId: 'a', targetId: 'b', distance: 2 });
  recordDecision(memory, { frame: 0, context, candidates, chosen: candidates[0]!, probability: .6 });
  state.frame = 1;state.fighters[0]!.attackSerial++;state.fighters[0]!.moveId = 'jab';
  resolveLearning(memory, { state, fighterId: 'a', targetId: 'b', events: [] });
  observeLearning(memory, { state, fighterId: 'a', targetId: 'b', distance: 2 });
  state.frame = 2;
  recordDecision(memory, { frame: 2, context, candidates, chosen: candidates[1]!, probability: .4 });
  memory.actions = [{ context, action: 'attack:jab', samples: 5, reward: 2 }];
  memory.habits = [{ context, samples: 3, guard: 1, retreat: 2, attack: 0 }];
  memory.transient.eventIds = ['observed-contact'];
  const history = structuredClone(memory.traces[0]!);history.status = 'complete';history.frame = 0;
  memory.traces.unshift(history);
  return memory;
}

test('compact capture retains complete pending/next distributions, useful weights and independent continuation state', () => {
  const memory = attribution(), before = structuredClone(memory), compact = compactLearning(memory);
  expect(compact.traces).toEqual(memory.traces.filter(trace => trace.status === 'pending'));
  expect(compact.traces).toHaveLength(2);expect(compact.pending).not.toBeNull();expect(compact.next).not.toBeNull();
  expect(compact.actions).toEqual(memory.actions);expect(compact.habits).toEqual(memory.habits);
  expect(compact.transient).toEqual(memory.transient);expect(readLearning(JSON.parse(JSON.stringify(compact)))).toEqual(compact);
  compact.actions[0]!.reward = -1;compact.habits[0]!.guard = 0;
  compact.transient.eventIds.push('new-contact');compact.pending!.dealt = 12;compact.next!.reach = 3;
  compact.traces[0]!.candidates[0]!.score = 99;
  expect(memory).toEqual(before);
});

test('completed audit history can be omitted without erasing any accumulated model or event suppression', () => {
  const memory = attribution();memory.pending = null;memory.next = null;
  for (const trace of memory.traces) trace.status = 'censored';
  const compact = compactLearning(memory);
  expect(compact.traces).toEqual([]);
  expect({ ...compact, traces: memory.traces }).toEqual(memory);
  expect(readLearning(compact)).toEqual(compact);
});

test('pending contact and a queued cancel survive compact restore with identical handoff and recovery attribution', () => {
  const memory = attribution();memory.pending!.dealt = 12;memory.pending!.contacts = 1;
  const full = readLearning(memory), compact = readLearning(compactLearning(memory));
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 3, fighters: [
    createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100),
    createFighter({ id: 'b', position: { x: 2, y: 0, z: 0 } }, 100),
  ] };
  Object.assign(state.fighters[0]!, { attackSerial: 2, moveId: 'heavy' });
  const events = [{ id: 'heavy-contact', frame: 2, kind: 'hit' as const, moveId: 'heavy', attackerId: 'a', targetId: 'b', damage: 18, impulse: { x: 0, y: 0, z: 0 } }];
  for (const model of [full, compact]) {
    resolveLearning(model, { state, events, fighterId: 'a', targetId: 'b' });
    observeLearning(model, { state, fighterId: 'a', targetId: 'b', distance: 2 });
  }
  expect(compactLearning(compact)).toEqual(compactLearning(full));
  state.fighters[0]!.moveId = '';state.frame = 4;
  for (const model of [full, compact]) resolveLearning(model, { state, events: [], fighterId: 'a', targetId: 'b' });
  state.frame = 16;
  for (const model of [full, compact]) resolveLearning(model, { state, events: [], fighterId: 'a', targetId: 'b' });
  expect(compactLearning(compact)).toEqual(compactLearning(full));
  expect(compact.actions.some(row => row.action === 'attack:heavy' && row.reward > 0)).toBe(true);
});

function fight() {
  const config = createTouchOfDeathPreset(), ai = createCombatAi3D({ config }), sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1.3, y: 1, z: 0 } },
  ] });
  function advance(count: number) {
    const actions = [], events = [];
    for (let tick = 0; tick < count; tick++) {
      const state = sim.capture(), action = ai.step({ state, seed: 6, fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
        body: { ...state.fighters[0]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...state.fighters[1]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
      actions.push(action);const resolved = sim.step({ inputs: [action.input] });events.push(...resolved);
      ai.observe({ state: sim.capture(), events: resolved, fighterId: 'a', targetId: 'b' });
    }
    return { actions, events };
  }
  return { ai, sim, advance };
}

test('compact versus full JSON checkpoints continue actual combat actions, contacts, physics and learning exactly', () => {
  const f = fight();f.advance(45);
  const savedAi = JSON.parse(JSON.stringify(f.ai.capture())), savedSim = JSON.parse(JSON.stringify(f.sim.capture()));
  expect(savedAi.learning.traces.some((trace: { status: string }) => trace.status !== 'pending')).toBe(true);
  const compactAi = f.ai.capture({ compactLearning: true });
  expect(compactAi).toEqual({ ...savedAi, learning: compactLearning(savedAi.learning) });
  const expected = f.advance(110), expectedSim = f.sim.capture(), expectedAi = f.ai.capture();
  f.ai.restore(JSON.parse(JSON.stringify(compactAi)));f.sim.restore({ snapshot: savedSim });
  expect(f.advance(110)).toEqual(expected);expect(f.sim.capture()).toEqual(expectedSim);
  const actualAi = f.ai.capture();
  expect({ ...actualAi, learning: compactLearning(actualAi.learning!) })
    .toEqual({ ...expectedAi, learning: compactLearning(expectedAi.learning!) });
});

test('two ordinary Touch of Death controllers retain long-session weights within the declared 64 KiB save budget', () => {
  const config = createTouchOfDeathPreset(), brains = [createCombatAi3D({ config }), createCombatAi3D({ config })];
  const sim = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 8, y: 1, z: 0 } }] });
  const state = sim.capture();
  for (let tick = 0; tick < 2400; tick++) {
    state.frame = tick;
    for (const [seat, brain] of brains.entries()) {
      const self = state.fighters[seat]!, target = state.fighters[1 - seat]!;
      // A legal neutral fight state with repeated delivery/censorship grows the
      // real controller's audit history; no hypothetical move outcome is fed.
      brain.step({ state, seed: 6 + seat, fighterId: self.id, targetId: target.id, difficulty: 9, grounded: true, targetGrounded: true,
        body: { ...self.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...target.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
      brain.observe({ state, events: [], fighterId: self.id, targetId: target.id });
    }
  }
  const full = brains.map(brain => brain.capture()), compact = brains.map(brain => brain.capture({ compactLearning: true }));
  expect(full.every(saved => saved.learning!.traces.length === 64)).toBe(true);
  expect(compact.every(saved => saved.learning!.traces.length <= 2)).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify({ combat: state, ai: compact })).length).toBeLessThan(65536);
  for (const [seat, saved] of compact.entries()) {
    expect(saved.learning!.actions).toEqual(full[seat]!.learning!.actions);
    expect(saved.learning!.habits).toEqual(full[seat]!.learning!.habits);
    expect(readLearning(saved.learning)).toEqual(saved.learning!);
  }
});
