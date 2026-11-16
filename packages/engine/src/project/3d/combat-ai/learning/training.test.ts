import { expect, test } from 'bun:test';
import { createFighter, type CombatEvent, type CombatSnapshot } from '../../../../combat/state.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../../combat/touch-of-death.ts';
import { createCombatAi3D } from '../../combat-ai.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { initialLearning, observeLearning, recordDecision, resetLearning, resolveLearning, type CombatAiLearning } from './model.ts';
import { captureLearningEvidence, recordActionEvidence, recordHabitEvidence, recordLearningProbe, trackLearningEvidence, type CombatAiLearningProbe } from './evidence.ts';
import { readCombatAiLearningEvidence } from './evidence-validation.ts';
import { mergeCombatAiLearning, prepareCombatAiLearning } from './training.ts';
import { combatAiLearningProbe } from './probe.ts';

const context = 'near:ground:ground:neutral';
function attribution(baseline = initialLearning({ opponentId: 'b' })) {
  const memory = prepareCombatAiLearning({ model: baseline }), state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [
    createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100), createFighter({ id: 'b', position: { x: 2, y: 0, z: 0 } }, 100),
  ] };
  trackLearningEvidence(memory);
  const observe = () => observeLearning(memory, { state, fighterId: 'a', targetId: 'b', distance: 2 });
  const resolve = (events: CombatEvent[] = []) => resolveLearning(memory, { state, events, fighterId: 'a', targetId: 'b' });
  observe();
  function hit(damage: number, partial = false, moveId = 'jab') {
    state.frame++;observe();const chosen = { id: `attack:${moveId}`, moveId, score: 1, probability: 1 };
    recordDecision(memory, { frame: state.frame, context, candidates: [chosen], chosen, probability: 1 });
    state.frame++;Object.assign(state.fighters[0]!, { moveId, attackSerial: state.fighters[0]!.attackSerial + 1 });
    resolve([{ id: `hit:${state.frame}`, frame: state.frame - 1, kind: 'hit', moveId, attackerId: 'a', targetId: 'b', damage, impulse: { x: 0, y: 0, z: 0 } }]);
    if (partial) return;
    state.frame++;state.fighters[0]!.moveId = '';resolve();state.frame += 12;resolve();observe();
  }
  return { memory, state, observe, hit };
}

test('prepare retains real partial evidence once, closes all windows and rebinds only the host-known policy', () => {
  const f = attribution();f.hit(30, true);
  const next = { id: 'forced:heavy', moveId: 'heavy', score: 1, probability: 1 };
  recordDecision(f.memory, { frame: f.state.frame, context, candidates: [next], chosen: next, probability: 1 });
  const before = structuredClone(f.memory), clean = prepareCombatAiLearning({ model: f.memory, opponentId: 'policy:known' });
  expect(clean.actions[0]!.samples).toBe(.25);expect(clean.actions[0]!.reward).toBe(.25);
  expect(clean.pending).toBeNull();expect(clean.next).toBeNull();expect(clean.traces).toEqual([]);
  expect(clean.transient).toEqual(initialLearning().transient);expect(clean.opponentId).toBe('policy:known');
  expect(prepareCombatAiLearning({ model: clean })).toEqual(clean);expect(f.memory).toEqual(before);
  const swapped = prepareCombatAiLearning({ model: clean, opponentId: 'a' });
  observeLearning(swapped, { state: f.state, fighterId: 'b', targetId: 'a', distance: 2 });
  expect(swapped.actions).toEqual(clean.actions);
  expect(prepareCombatAiLearning({ model: clean, opponentId: 'new-policy', newOpponent: true }).actions).toEqual([]);
  expect(prepareCombatAiLearning({ model: f.memory, retainPartial: false }).actions).toEqual([]);
});

test('parallel seeded trials merge only fresh affine evidence in deterministic sequence, including fractional partial samples', () => {
  const baseline = initialLearning({ opponentId: 'b' });
  baseline.actions = [{ context, action: 'attack:jab', samples: 4, reward: 1 }];
  baseline.habits = [{ context, samples: 2, guard: 2, retreat: 0, attack: 0 }];
  const first = attribution(baseline), second = attribution(baseline);
  first.hit(30);second.hit(30);
  for (const f of [first, second]) { f.state.frame = 60;f.state.fighters[1]!.guarding = true;f.observe(); }
  const evidence = [first, second].map((f, sequence) => ({ sequence, evidence: captureLearningEvidence(f.memory)! }));
  const merged = mergeCombatAiLearning({ baseline, evidence }), reversed = mergeCombatAiLearning({ baseline, evidence: [...evidence].reverse() });
  expect(merged).toEqual(reversed);expect(merged.actions[0]!.samples).toBe(6);
  expect(merged.actions[0]!.reward).toBe(3);
  expect(merged.habits[0]!.samples).toBeCloseTo(3.52, 12);
  expect(merged.actions[0]!.samples).toBeLessThan(first.memory.actions[0]!.samples + second.memory.actions[0]!.samples);
  expect(merged.pending).toBeNull();expect(merged.traces).toEqual([]);expect(merged.transient).toEqual(initialLearning().transient);
  second.hit(30, true);resetLearning(second.memory, { round: true });
  const partial = captureLearningEvidence(second.memory)!, once = mergeCombatAiLearning({ baseline, evidence: [{ sequence: 2, evidence: partial }] });
  expect(once.actions[0]!.samples).toBeCloseTo(second.memory.actions[0]!.samples, 12);
  expect(once.actions[0]!.reward).toBeCloseTo(second.memory.actions[0]!.reward, 12);
  const unchanged = captureLearningEvidence(second.memory);resetLearning(second.memory, { round: true });
  expect(captureLearningEvidence(second.memory)).toEqual(unchanged);
  expect(() => mergeCombatAiLearning({ baseline, evidence: [evidence[0]!, evidence[0]!] })).toThrow();
  expect(() => mergeCombatAiLearning({ baseline: prepareCombatAiLearning({ opponentId: 'other' }), evidence })).toThrow();
});

test('journal bounds, strict restore, opponent reset and probe omissions preserve the portable model schema', () => {
  const memory = initialLearning({ opponentId: 'b' }), before = structuredClone(memory);trackLearningEvidence(memory);
  for (let index = 0; index < 100; index++) recordActionEvidence(memory, context, `attack:move${index}`, .94, 1, .5);
  for (const near of ['near', 'far']) for (const own of ['ground', 'air']) for (const enemy of ['ground', 'air']) for (const state of ['neutral', 'guard', 'committed']) {
    recordHabitEvidence(memory, `${near}:${own}:${enemy}:${state}`, 1, 0, 0);
  }
  const probe: CombatAiLearningProbe = { frame: 0, context, difficulty: 9, opponentId: 'b', candidates: [{ id: 'attack:jab', moveId: 'jab', score: 2 }] };
  for (let frame = 0; frame < 5; frame++) recordLearningProbe(memory, { ...probe, frame });
  recordLearningProbe(memory, { ...probe, candidates: Array.from({ length: 65 }, (_, id) => ({ id: `attack:move${id}`, score: 1 })) });
  const evidence = captureLearningEvidence(memory)!;
  expect(evidence.actions).toHaveLength(100);expect(evidence.habits).toHaveLength(16);expect(evidence.probes).toHaveLength(4);expect(evidence.omittedProbes).toBe(2);
  expect(evidence.omittedActions).toBe(0);expect(evidence.omittedHabits).toBe(8);
  expect(memory).toEqual(before);expect(readCombatAiLearningEvidence(JSON.parse(JSON.stringify(evidence)))).toEqual(evidence);
  expect(() => readCombatAiLearningEvidence({ ...evidence, actions: [...evidence.actions, evidence.actions[0]] })).toThrow();
  expect(() => readCombatAiLearningEvidence({ ...evidence, actions: [{ ...evidence.actions[0], reward: 2 }] })).toThrow();
  expect(() => readCombatAiLearningEvidence({ ...evidence, hidden: true })).toThrow();
  resetLearning(memory, { opponentId: 'other', newOpponent: true });
  expect(captureLearningEvidence(memory)!.actions).toEqual([]);expect(captureLearningEvidence(memory)!.probes).toEqual([]);
});

test('broad exploration retains every learned row and fresh journal update across merge and reload', () => {
  const baseline = initialLearning({ opponentId: 'b' });
  baseline.actions = [{ context, action: 'attack:jab', samples: 4, reward: 1 }];
  const f = attribution(baseline);f.hit(30);
  for (let index = 0; index < 100; index++) f.hit(30, false, `move${index}`);
  expect(f.memory.actions).toHaveLength(101);
  f.hit(15);const evidence = captureLearningEvidence(f.memory)!, delta = evidence.actions.find(row => row.action === 'attack:jab')!;
  expect(delta.decay).toBe(1);expect(delta.samples).toBe(2);expect(delta.reward).toBe(1.5);expect(evidence.omittedActions).toBe(0);
  expect(evidence.actions).toHaveLength(101);
  const merged = mergeCombatAiLearning({ baseline, evidence: [{ sequence: 0, evidence }] });
  expect(merged.actions.find(row => row.action === 'attack:jab')).toEqual(f.memory.actions.find(row => row.action === 'attack:jab'));
  expect(prepareCombatAiLearning({ model: JSON.parse(JSON.stringify(merged)) }).actions).toEqual(f.memory.actions);
  const cold = attribution();cold.hit(30, false, 'cold');const fresh = captureLearningEvidence(cold.memory)!;
  expect(fresh.actions[0]!.decay).toBe(1);
  const bank = initialLearning({ opponentId: 'b' });bank.actions = [{ context, action: 'attack:cold', samples: 8, reward: 4 }];
  expect(mergeCombatAiLearning({ baseline: bank, evidence: [{ sequence: 1, evidence: fresh }] }).actions[0]!.samples).toBe(9);
});

test('negative evidence cannot improve a disfavored action by weakening its personality penalty', () => {
  const before = initialLearning({ opponentId: 'b' }), after = initialLearning({ opponentId: 'b' });
  after.actions = [{ context, action: 'attack:heavy', samples: 1, reward: -.1 }];
  const probe: CombatAiLearningProbe = { frame: 0, context, difficulty: 9, opponentId: 'b', candidates: [
    { id: 'attack:heavy', moveId: 'heavy', score: 1, styleScore: -1.4 },
    { id: 'attack:jab', moveId: 'jab', score: 2, styleScore: 1.4 },
  ] };
  const heavy = combatAiLearningProbe({ before, after, probe }).candidates[0]!;
  expect(heavy.afterScore).toBeLessThan(heavy.beforeScore);
  expect(heavy.afterProbability).toBeLessThan(heavy.beforeProbability);
});

test('cumulative evidence exceeds the old effective-sample ceiling and still accepts legacy decayed journals', () => {
  const f = attribution();for (let index = 0; index < 100; index++) f.hit(15);
  const baseline = prepareCombatAiLearning({ model: JSON.parse(JSON.stringify(f.memory)) });
  expect(baseline.actions[0]!.samples).toBe(100);expect(baseline.actions[0]!.reward).toBe(50);
  const evidence = captureLearningEvidence(f.memory)!;
  expect(mergeCombatAiLearning({ opponentId: 'b', evidence: [{ sequence: 1, evidence }] }).actions).toEqual(baseline.actions);
  const legacy = { ...evidence, actions: [{ context, action: 'attack:jab', decay: .94, samples: 1, reward: -.5 }] };
  const restored = mergeCombatAiLearning({ baseline, evidence: [{ sequence: 2, evidence: legacy }] });
  expect(restored.actions[0]!.samples).toBe(95);expect(restored.actions[0]!.reward).toBe(46.5);
});

function fight(learning?: CombatAiLearning, exploration?: number) {
  const config = createTouchOfDeathPreset(), ai = createCombatAi3D({ config, learning, tuning: { exploration } }), sim = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1.3, y: 1, z: 0 } },
  ] });
  const tick = () => {
    const state = sim.capture(), result = ai.step({ state, seed: 6, fighterId: 'a', targetId: 'b', difficulty: 9, grounded: true, targetGrounded: true,
      body: { ...state.fighters[0]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { ...state.fighters[1]!.position, velocityX: 0, velocityY: 0, velocityZ: 0 } });
    const events = sim.step({ inputs: [result.input] });ai.observe({ state: sim.capture(), events, fighterId: 'a', targetId: 'b' });
    return events;
  };
  return { ai, sim, tick };
}

test.each([0, .08])('real controller and probe probabilities agree before and after fresh learning with exploration %s', exploration => {
  const baseline = prepareCombatAiLearning({ opponentId: 'b' }), f = fight(baseline, exploration);f.ai.startLearningEvidence();
  const contacts = [];
  for (let frame = 0; frame < 120; frame++) { contacts.push(...f.tick());if (f.ai.learning()!.actions.some(row => row.reward > 0)) break; }
  expect(contacts.some(event => event.attackerId === 'a' && event.damage > 0)).toBe(true);
  const finished = f.ai.finishLearningEvidence(), merged = mergeCombatAiLearning({ baseline, evidence: [{ sequence: 0, evidence: finished.evidence! }] });
  expect(finished.learning!.pending).toBeNull();expect(finished.learning!.traces.length).toBeGreaterThan(0);
  expect(f.ai.finishLearningEvidence()).toEqual(finished);
  expect(merged.actions.some(row => row.reward > 0)).toBe(true);expect(finished.evidence!.probes.length).toBeGreaterThan(0);
  const reports = finished.evidence!.probes.map(probe => combatAiLearningProbe({ before: baseline, after: merged, probe }));
  expect(reports.some(report => report.available && report.maxProbabilityChange > 0)).toBe(true);
  const firstProbe = finished.evidence!.probes.find(probe => probe.frame === 0)!;
  expect(firstProbe).toBeDefined();
  const firstTrace = finished.learning!.traces.find(trace => trace.frame === firstProbe.frame)!, replay = combatAiLearningProbe({ before: baseline, after: merged, probe: firstProbe });
  for (const candidate of replay.candidates) expect(candidate.beforeProbability).toBeCloseTo(firstTrace.candidates.find(row => row.id === candidate.id)!.probability!, 12);
  for (const report of reports) {
    expect(report.candidates.reduce((sum, row) => sum + row.afterProbability, 0)).toBeCloseTo(1, 12);
    expect(report.candidates.every(row => Number.isFinite(row.afterScore))).toBe(true);
  }
  expect(combatAiLearningProbe({ before: baseline, after: prepareCombatAiLearning({ model: merged, opponentId: 'other' }), probe: finished.evidence!.probes[0]! }).available).toBe(false);
  const next = fight(prepareCombatAiLearning({ model: merged, opponentId: 'b' }), exploration);next.ai.startLearningEvidence();
  expect(next.ai.learningEvidence()!.actions).toEqual([]);expect(next.ai.learning()!.actions).toEqual(merged.actions);
  next.tick();const nextTrace = next.ai.learning()!.traces[0]!;
  for (const candidate of replay.candidates) expect(nextTrace.candidates.find(row => row.id === candidate.id)!.probability!).toBeCloseTo(candidate.afterProbability, 12);
});

test('probe replay preserves guaranteed priority and rejects incomplete oversized or invalid selector inputs', () => {
  const before = prepareCombatAiLearning({ opponentId: 'b' }), after = prepareCombatAiLearning({ model: before });
  after.actions = [{ context, action: 'attack:jab', samples: 16, reward: -16 }];
  const probe: CombatAiLearningProbe = { frame: 0, context, opponentId: 'b', difficulty: 9, candidates: [
    { id: 'attack:jab', moveId: 'jab', score: 2, styleScore: 1.4, priority: true }, { id: 'attack:heavy', moveId: 'heavy', score: 100 },
  ] };
  const report = combatAiLearningProbe({ before, after, probe });
  expect(report.candidates.map(row => [row.beforeProbability, row.afterProbability])).toEqual([[1, 1], [0, 0]]);
  expect(report.maxProbabilityChange).toBe(0);
  expect(() => combatAiLearningProbe({ before, after, probe: { ...probe, difficulty: 0 } })).toThrow();
  expect(() => combatAiLearningProbe({ before, after, probe: { ...probe, candidates: Array.from({ length: 65 }, (_, id) => ({ id: `attack:${id}`, score: 1 })) } })).toThrow();
});

test('opt-in journaling preserves ordinary seeded combat, decisions, captures and learned behavior', () => {
  const tracked = fight(), ordinary = fight();tracked.ai.startLearningEvidence();
  for (let frame = 0; frame < 80; frame++) {
    expect(tracked.tick()).toEqual(ordinary.tick());expect(tracked.sim.capture()).toEqual(ordinary.sim.capture());
    expect(tracked.ai.capture()).toEqual(ordinary.ai.capture());
  }
  expect(tracked.ai.learningEvidence()).toBeDefined();expect(ordinary.ai.learningEvidence()).toBeUndefined();
});

test('training exploration persists through a JSON checkpoint with exact subsequent decisions', () => {
  const original = fight(undefined, .08), restored = fight();
  for (let frame = 0; frame < 40; frame++) original.tick();
  restored.sim.restore({ snapshot: JSON.parse(JSON.stringify(original.sim.capture())) });
  restored.ai.restore(JSON.parse(JSON.stringify(original.ai.capture())));
  expect(restored.ai.capture().tuning?.exploration).toBe(.08);
  for (let frame = 0; frame < 40; frame++) {
    expect(restored.tick()).toEqual(original.tick());
    expect(restored.sim.capture()).toEqual(original.sim.capture());
    expect(restored.ai.capture()).toEqual(original.ai.capture());
  }
});

test('gameplay opt-in journals both AI seats and frozen/off/baseline controllers remain unchanged', async () => {
  const f = await combatMotionFixture({ match: true });f.game.startCombatAiLearningEvidence();f.game.advance({ actions: ['match:theater'] });
  for (let frame = 0; frame < 60; frame++) f.game.advance();
  expect(f.game.combatAiLearningEvidence()!.every(evidence => evidence !== undefined)).toBe(true);
  const finished = f.game.finishCombatAiLearningEvidence()!;
  expect(finished.evidence).toHaveLength(2);expect(finished.learning.every(model => !model?.pending && !model?.next)).toBe(true);
  const config = createTouchOfDeathPreset(), model = initialLearning({ opponentId: 'b' });
  model.actions = [{ context, action: 'attack:jab', samples: 4, reward: 1 }];
  for (const tuning of [{ mode: 'baseline' as const }, { adaptation: false }, { learningFrozen: true }]) {
    const ai = createCombatAi3D({ config, learning: model, tuning });
    expect(ai.startLearningEvidence()).toBe(false);expect(ai.finishLearningEvidence().evidence).toBeUndefined();expect(ai.learning()).toEqual(model);
  }
});
