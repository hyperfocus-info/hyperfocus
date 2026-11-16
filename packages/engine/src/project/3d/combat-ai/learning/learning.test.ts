import { describe, expect, test } from 'bun:test';
import { createFighter, type CombatEvent, type CombatSnapshot } from '../../../../combat/state.ts';
import { candidateProbabilities } from '../policy/selection.ts';
import { initialLearning, learningAdjustment, learningConfidence, learningContext, observeLearning, recordDecision, resetLearning, resolveLearning, type LearningCandidate } from './model.ts';
import { readLearning } from './validation.ts';

function fixture() {
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [
    createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100),
    createFighter({ id: 'b', position: { x: 2, y: 0, z: 0 } }, 100),
  ] };
  const self = state.fighters[0]!, target = state.fighters[1]!, memory = initialLearning();
  const context = learningContext(self, target, 2), candidates: LearningCandidate[] = [
    { id: 'attack:jab', moveId: 'jab', score: 2, reach: 3, probability: .55 },
    { id: 'attack:heavy', moveId: 'heavy', score: 1.75, reach: 3, probability: .45 },
  ];
  const observe = () => observeLearning(memory, { state, fighterId: 'a', targetId: 'b', distance: 2 });
  const resolve = (events: CombatEvent[] = []) => resolveLearning(memory, { state, fighterId: 'a', targetId: 'b', events });
  const event = (kind: CombatEvent['kind'], damage = 0): CombatEvent => ({ id: `${state.frame}:${kind}`, frame: state.frame, moveId: self.moveId, kind, damage,
    attackerId: 'a', targetId: 'b', impulse: { x: 0, y: 0, z: 0 } });
  observe();
  const attempt = (chosen: LearningCandidate, outcome: 'hit' | 'parry' | 'miss', damage = 30) => {
    state.frame++;observe();
    recordDecision(memory, { frame: state.frame, context, candidates, chosen, probability: chosen.probability! });
    state.frame++;self.attackSerial++;self.moveId = chosen.moveId!;
    resolve(outcome === 'miss' ? [] : [event(outcome, outcome === 'hit' ? damage : 0)]);observe();
    state.frame++;self.moveId = '';resolve();observe();
    state.frame += 12;resolve();observe();
  };
  return { state, self, target, memory, context, candidates, observe, resolve, event, attempt };
}

describe('contextual tactical learning with bounded diagnostics', () => {
  test('tried outcomes can reverse the initial distribution; other contexts and untried alternatives remain neutral', () => {
    const f = fixture(), jab = f.candidates[0]!, heavy = f.candidates[1]!;
    const before = candidateProbabilities(f.candidates, 9);
    for (let i = 0; i < 30; i++) f.attempt(jab, 'parry');
    const after = candidateProbabilities(f.candidates.map(c => ({ ...c, score: c.score + learningAdjustment(f.memory, f.context, c) })), 9);
    expect(before[0]).toBeGreaterThan(before[1]!);expect(after[0]).toBeLessThan(after[1]!);
    expect(learningAdjustment(f.memory, 'far:air:air:neutral', jab)).toBe(0);
    expect(learningAdjustment(f.memory, f.context, heavy)).toBe(0);
    expect(f.memory.actions).toHaveLength(1);
    expect(f.memory.traces.at(-1)?.candidates).toEqual(f.candidates.map(c => ({ id: c.id, score: c.score, probability: c.probability! })));
  });

  test('a lucky hit is weak evidence, multiple contacts still count one attempt, and guaranteed priority stays intact', () => {
    const f = fixture(), jab = f.candidates[0]!;
    f.attempt(jab, 'hit');
    expect(learningAdjustment(f.memory, f.context, jab)).toBeCloseTo(0.16666666666666666);
    expect(learningAdjustment(f.memory, f.context, { ...jab, priority: true })).toBe(0);
    f.state.frame++;f.observe();recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen: jab, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';
    const first = f.event('hit', 30), second = { ...first, id: first.id + 'second' };
    f.resolve([first, second]);f.resolve([first, second]);
    f.state.frame++;f.self.moveId = '';f.resolve();f.state.frame += 12;f.resolve();
    expect(f.memory.actions[0]?.samples).toBe(2);
    expect(f.memory.actions[0]?.reward).toBe(2);
  });

  test('action evidence accumulates while opponent habits adapt to recent observations', () => {
    const f = fixture(), jab = f.candidates[0]!;
    for (let i = 0; i < 60; i++) f.attempt(jab, 'hit');
    expect(learningAdjustment(f.memory, f.context, jab)).toBeGreaterThan(.5);
    for (let i = 0; i < 60; i++) f.attempt(jab, 'parry');
    expect(f.memory.actions[0]!.samples).toBe(120);
    expect(f.memory.actions[0]!.reward).toBeCloseTo(12);
    expect(learningAdjustment(f.memory, f.context, jab)).toBeCloseTo(0.140625);
    const grapple = { id: 'grapple', grapple: true, score: 1 };
    f.target.guarding = true;
    for (let i = 0; i < 60; i++) { f.state.frame += 30;f.observe(); }
    const guarding = learningAdjustment(f.memory, f.context, grapple);
    f.target.guarding = false;
    for (let i = 0; i < 60; i++) { f.state.frame += 30;f.observe(); }
    expect(guarding).toBeGreaterThan(.2);
    expect(learningAdjustment(f.memory, f.context, grapple)).toBeLessThan(.01);
  });

  test('unexecuted decisions and round-censored attacks never acquire fabricated outcomes', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55, deliveryDelay: 24 });
    f.state.frame = 25;f.resolve();expect(f.memory.pending).not.toBeNull();
    f.state.frame = 33;f.resolve();expect(f.memory.pending).toBeNull();expect(f.memory.actions).toHaveLength(0);
    expect(f.memory.traces[0]?.status).toBe('censored');
    f.state.frame++;f.observe();recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve([f.event('hit', 30)]);
    resetLearning(f.memory, { round: true });expect(f.memory.actions[0]?.samples).toBe(.25);expect(f.memory.actions[0]?.reward).toBe(.25);
    expect(f.memory.traces.at(-1)?.outcome).toBe('partial-contact');expect(f.memory.traces.at(-1)?.status).toBe('censored');
    const saved = readLearning(f.memory);resetLearning(f.memory, { round: true });expect(f.memory.actions).toEqual(saved.actions);
  });

  test('completed attacks include received damage during the subsequent punish window', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve([f.event('hit', 10)]);
    f.state.frame++;f.self.moveId = '';f.resolve();
    f.state.frame += 5;f.resolve([{ ...f.event('hit', 30), attackerId: 'b', targetId: 'a', moveId: 'heavy' }]);
    f.state.frame += 7;f.resolve();
    expect(f.memory.actions[0]?.reward).toBeCloseTo((-0.6666666666666666));
  });

  test('restored pending attribution continues identically, same opponent retains and a different opponent resets', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve([f.event('hit', 10)]);
    const restored = readLearning(JSON.parse(JSON.stringify(f.memory)));
    f.state.frame++;f.self.moveId = '';f.resolve();resolveLearning(restored, { state: f.state, events: [], fighterId: 'a', targetId: 'b' });
    f.state.frame += 12;f.resolve();resolveLearning(restored, { state: f.state, events: [], fighterId: 'a', targetId: 'b' });
    expect(restored).toEqual(f.memory);
    resetLearning(restored, { opponentId: 'b', round: true });expect(restored.actions).toHaveLength(1);
    resetLearning(restored, { opponentId: 'other' });expect(restored.actions).toHaveLength(0);expect(restored.habits).toHaveLength(0);
    restored.traces.push(...f.memory.traces);expect(f.memory.traces).not.toBe(restored.traces);
  });

  test('strict persistence rejects invalid state and collections remain bounded', () => {
    const f = fixture();for (let i = 0; i < 80; i++) f.attempt(f.candidates[0]!, 'miss');
    expect(f.memory.traces).toHaveLength(64);expect(readLearning(f.memory)).toEqual(f.memory);
    const invalid = structuredClone(f.memory);invalid.actions[0]!.reward = NaN;expect(() => readLearning(invalid)).toThrow();
    expect(() => readLearning({ ...f.memory, unknown: true })).toThrow();
    expect(() => readLearning({ ...f.memory, traces: Array(65).fill(f.memory.traces[0]) })).toThrow();
    expect(() => readLearning({ ...f.memory, habits: [{ context: 'unbounded', samples: 1, guard: 0, retreat: 0, attack: 0 }] })).toThrow();
  });

  test('range and displacement miss explanations are explicitly predictions and armor does not imply a miss', () => {
    const f = fixture(), chosen = { ...f.candidates[0]!, reach: 1 };
    f.attempt(chosen, 'miss');expect(f.memory.traces.at(-1)?.outcome).toBe('range-predicted');
    f.target.armorFrames = 10;f.attempt(f.candidates[0]!, 'hit');expect(f.memory.traces.at(-1)?.outcome).toBe('hit-armored-observed');
    expect(f.memory.traces.at(-1)?.reward).toBe(1);
  });

  test('an animation still active at the capped horizon is censored, and observing a new opponent replaces transient state', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve();
    f.state.frame += 180;f.resolve();expect(f.memory.actions).toHaveLength(0);expect(f.memory.traces[0]?.status).toBe('censored');
    f.target.id = 'new';f.state.frame++;
    observeLearning(f.memory, { state: f.state, fighterId: 'a', targetId: 'new', distance: 2 });
    expect(f.memory.transient.frame).toBe(f.state.frame);expect(f.memory.opponentId).toBe('new');
  });

  test('weapon move aliases attach while authored alternatives retain identity, including immediate post-step contacts', () => {
    const f = fixture(), chosen = { ...f.candidates[0]!, observedMoveId: 'jab:weapon' };
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab:weapon';
    f.resolve([{ ...f.event('hit', 30), frame: f.state.frame - 1 }]);
    expect(f.memory.pending?.dealt).toBe(30);expect(f.memory.pending?.started).toBe(0);
    f.state.frame++;f.self.moveId = '';f.resolve();f.state.frame += 12;f.resolve();
    expect(f.memory.actions[0]?.action).toBe('attack:jab');expect(f.memory.traces[0]?.move).toBe('jab:weapon');
    expect(learningAdjustment(f.memory, f.context, chosen)).toBeGreaterThan(0);
  });

  test('logical identity changes at lower frames reset before monotonic checks; restored same-opponent rounds retain evidence', () => {
    const f = fixture();f.attempt(f.candidates[0]!, 'hit');
    f.memory.opponentId = 'checkpoint:1';f.state.frame = 0;
    observeLearning(f.memory, { state: f.state, fighterId: 'a', targetId: 'b', opponentId: 'checkpoint:2', distance: 2 });
    expect(f.memory.actions).toHaveLength(0);expect(f.memory.transient.frame).toBe(0);expect(f.memory.opponentId).toBe('checkpoint:2');
    f.state.frame++;f.observe();f.attempt(f.candidates[0]!, 'hit');
    const restored = readLearning(f.memory);resetLearning(restored, { opponentId: 'b', round: true });
    f.state.frame = 0;observeLearning(restored, { state: f.state, fighterId: 'a', targetId: 'b', distance: 2 });
    expect(restored.actions).toHaveLength(1);expect(restored.transient.frame).toBe(0);
    const before = structuredClone(restored);learningAdjustment(restored, f.context, f.candidates[0]!);
    expect(restored).toEqual(before);
  });

  test('zero-damage post-KO contacts are censored and invalid captured distributions are rejected', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.target.health = 0;f.resolve([f.event('hit', 0)]);
    expect(f.memory.pending).toBeNull();expect(f.memory.actions).toHaveLength(0);
    expect(() => recordDecision(f.memory, { frame: 3, context: f.context, candidates: f.candidates.map(c => ({ ...c, probability: 1 })), chosen, probability: 1 })).toThrow();
    expect(() => readLearning({ ...f.memory, pending: { ...f.memory.pending, armored: 'yes' } })).toThrow();
  });

  test('tried context confidence starts small; partial round evidence is weaker and never credited twice', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    expect(learningConfidence(f.memory, f.context, chosen.id)).toBe(0);
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve([f.event('hit', 30)]);
    resetLearning(f.memory, { round: true });
    expect(learningConfidence(f.memory, f.context, chosen.id)).toBeCloseTo(0.030303030303030304);
    expect(learningConfidence(f.memory, f.context, f.candidates[1]!.id)).toBe(0);
    expect(learningAdjustment(f.memory, f.context, chosen)).toBeCloseTo(0.045454545454545456);
    const before = structuredClone(f.memory.actions);resetLearning(f.memory, { round: true });expect(f.memory.actions).toEqual(before);
  });

  test('frozen boundary censoring can discard pending fragments without changing completed evidence', () => {
    const f = fixture(), chosen = f.candidates[0]!;f.attempt(chosen, 'hit');
    const before = structuredClone(f.memory.actions);
    recordDecision(f.memory, { frame: f.state.frame, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve([f.event('hit', 30)]);
    resetLearning(f.memory, { round: true, retainPartial: false });expect(f.memory.actions).toEqual(before);
  });

  test('a movement safety window never receives positive credit for another action hitting', () => {
    const f = fixture(), chosen = { id: 'space', movement: 'away' as const, score: 1 };
    recordDecision(f.memory, { frame: 0, context: f.context, candidates: [chosen], chosen, probability: 1 });
    f.state.frame = 1;f.self.moveId = 'jab';f.resolve([f.event('hit', 30)]);
    expect(f.memory.pending?.dealt).toBe(0);
    f.state.frame = 12;f.resolve();expect(f.memory.actions[0]?.reward).toBe(0);
  });

  test('our retreat cannot fabricate their retreat habit; visible outward opponent displacement contributes', () => {
    const f = fixture();
    for (let i = 0; i < 30; i++) {
      f.state.frame++;f.self.position.x -= .1;
      observeLearning(f.memory, { state: f.state, fighterId: 'a', targetId: 'b', distance: f.target.position.x - f.self.position.x });
    }
    expect(f.memory.habits.every(row => row.retreat === 0)).toBe(true);
    for (let i = 0; i < 30; i++) {
      f.state.frame++;f.target.position.x += .1;
      observeLearning(f.memory, { state: f.state, fighterId: 'a', targetId: 'b', distance: f.target.position.x - f.self.position.x });
    }
    expect(f.memory.habits.some(row => row.retreat > 0)).toBe(true);
  });

  test('forced authored actions share effectiveness keys while confirmed hitstun stays distinct from neutral', () => {
    const f = fixture();f.target.stunKind = 'hit';f.target.stunFrames = 30;
    const context = learningContext(f.self, f.target, 2), chosen = { id: 'forced:jab', moveId: 'jab', score: 0 };
    expect(context).toBe('near:ground:ground:stunned');
    recordDecision(f.memory, { frame: 0, context, candidates: [chosen], chosen, probability: 1 });
    f.state.frame++;f.self.attackSerial++;f.self.moveId = 'jab';f.resolve([f.event('hit', 30)]);
    f.state.frame++;f.self.moveId = '';f.resolve();f.state.frame += 12;f.resolve();
    expect(f.memory.traces[0]?.chosen).toBe('forced:jab');expect(f.memory.actions[0]?.action).toBe('attack:jab');
    expect(learningAdjustment(f.memory, context, f.candidates[0]!)).toBeGreaterThan(0);
    expect(learningConfidence(f.memory, context, 'attack:jab')).toBe(learningConfidence(f.memory, context, 'forced:jab'));
    expect(learningAdjustment(f.memory, f.context, f.candidates[0]!)).toBe(0);
    expect(readLearning(f.memory)).toEqual(f.memory);
  });

  test('a queued executed continuation keeps its own context and probability without overlapping damage credit', () => {
    const f = fixture(), jab = f.candidates[0]!, heavy = f.candidates[1]!;
    recordDecision(f.memory, { frame: 0, context: f.context, candidates: f.candidates, chosen: jab, probability: .55 });
    f.state.frame = 1;f.self.moveId = 'jab';f.self.attackSerial++;f.resolve([f.event('hit', 30)]);f.observe();
    f.state.frame = 2;f.observe();
    recordDecision(f.memory, { frame: 2, context: 'near:ground:ground:stunned', candidates: f.candidates, chosen: heavy, probability: .45 });
    expect(f.memory.next?.action).toBe(heavy.id);expect(f.memory.actions).toHaveLength(0);
    const restored = readLearning(f.memory);expect(restored.next).toEqual(f.memory.next);
    f.state.frame = 3;f.self.moveId = 'heavy';f.self.attackSerial++;
    const hit = f.event('hit', 30), punish = { ...hit, id: 'punish', attackerId: 'b', targetId: 'a', moveId: 'jab', damage: 10 };
    f.resolve([hit, punish]);f.resolve([hit, punish]);
    expect(f.memory.actions[0]?.samples).toBe(.25);expect(f.memory.actions[0]?.reward).toBe(.25);
    expect(f.memory.traces[0]?.outcome).toBe('partial-contact');expect(f.memory.pending?.received).toBe(10);
    f.state.frame = 4;f.self.moveId = '';f.resolve();f.state.frame = 16;f.resolve();
    const learned = f.memory.actions.find(row => row.action === heavy.id)!;
    expect(learned.samples).toBe(1);expect(learned.reward).toBeCloseTo(0.6666666666666666);expect(f.memory.traces[1]?.probability).toBe(.45);
    expect(f.memory.pending).toBeNull();expect(f.memory.next).toBeNull();expect(readLearning(f.memory)).toEqual(f.memory);
  });

  test('legacy memory without next restores safely and superseded or unexecuted next slots never gain outcomes', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    const { next: _next, ...legacy } = initialLearning();expect(readLearning(legacy).next).toBeNull();
    recordDecision(f.memory, { frame: 0, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame = 1;f.self.moveId = 'jab';f.self.attackSerial++;f.resolve();f.observe();
    f.state.frame = 2;recordDecision(f.memory, { frame: 2, context: f.context, candidates: f.candidates, chosen: f.candidates[1]!, probability: .45 });
    f.state.frame = 3;recordDecision(f.memory, { frame: 3, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    expect(f.memory.traces[1]?.status).toBe('censored');
    f.state.frame = 12;f.resolve();expect(f.memory.next).toBeNull();expect(f.memory.traces[2]?.status).toBe('censored');
    expect(f.memory.actions).toHaveLength(0);
    const broken = initialLearning();broken.next = structuredClone(f.memory.pending);
    expect(() => readLearning(broken)).toThrow();
  });

  test('an uninformative external KO censors both executing and waiting slots without leaving an invalid save', () => {
    const f = fixture(), chosen = f.candidates[0]!;
    recordDecision(f.memory, { frame: 0, context: f.context, candidates: f.candidates, chosen, probability: .55 });
    f.state.frame = 1;f.self.moveId = 'jab';f.self.attackSerial++;f.resolve();f.observe();
    f.state.frame = 2;recordDecision(f.memory, { frame: 2, context: f.context, candidates: f.candidates, chosen: f.candidates[1]!, probability: .45 });
    expect(f.memory.next).not.toBeNull();f.target.health = 0;f.resolve();
    expect(f.memory.pending).toBeNull();expect(f.memory.next).toBeNull();expect(f.memory.actions).toHaveLength(0);
    expect(readLearning(f.memory)).toEqual(f.memory);
  });
});
