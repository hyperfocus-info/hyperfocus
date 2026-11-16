import { expect, test } from 'bun:test';
import { createFighter, type CombatEvent, type CombatSnapshot } from '../../../../combat/state.ts';
import { initialLearning, observeLearning, recordDecision, resetLearning, resolveLearning } from './model.ts';
import { captureLearningEvidence, trackLearningEvidence } from './evidence.ts';
import { readCombatAiLearningEvidence } from './evidence-validation.ts';
import { finishOutcomeAttempt, startOutcomeAttempt } from './outcome-evidence.ts';

const context = 'near:ground:ground:neutral';
function fixture() {
  const memory = initialLearning({ opponentId: 'b' }), state: CombatSnapshot = { version: 1, configKey: '', frame: 0,
    fighters: [createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100), createFighter({ id: 'b', position: { x: 2, y: 0, z: 0 } }, 20)] };
  const self = state.fighters[0]!, target = state.fighters[1]!;target.stamina = 10;trackLearningEvidence(memory);
  const observe = (distance = 2, maxima = true) => observeLearning(memory, { state, fighterId: 'a', targetId: 'b', distance,
    ...(maxima ? { maxHealth: 100, maxStamina: 100 } : {}) });
  const resolve = (events: CombatEvent[] = []) => resolveLearning(memory, { state, events, fighterId: 'a', targetId: 'b' });
  const decide = (delay = 0) => {
    const chosen = { id: 'attack:jab', moveId: 'jab', score: 1, probability: 1 };
    recordDecision(memory, { frame: state.frame, context, candidates: [chosen], chosen, probability: 1, deliveryDelay: delay });
  };
  const contact = () => {
    state.frame++;self.moveId = 'jab';self.attackSerial++;
    resolve([{ id: `hit:${state.frame}`, frame: state.frame - 1, kind: 'hit', moveId: 'jab', attackerId: 'a', targetId: 'b', damage: 20,
      impulse: { x: 1, y: 0, z: 0 } }]);
  };
  return { memory, state, self, target, observe, resolve, decide, contact };
}

test('decision resource facts survive delayed delivery and later observations until the actual completed outcome', () => {
  const f = fixture();f.observe();f.decide(8);
  expect(captureLearningEvidence(f.memory)!.outcomes).toEqual([]);
  f.state.frame = 8;f.target.stamina = 100;f.target.health = 100;f.target.position.x = 4;f.observe(4);f.contact();
  expect(captureLearningEvidence(f.memory)!.outcomes).toEqual([]);
  f.state.frame++;f.self.moveId = '';f.resolve();f.state.frame += 12;f.resolve();
  const row = captureLearningEvidence(f.memory)!.outcomes![0]!;
  expect(row.facts).toEqual({ targetStamina: 'low', targetHealth: 'low', targetMotion: 'unknown', targetCorner: 'unknown' });
  expect(row.context).toBe(context);expect(row.completeCount).toBe(1);expect(row.confidence).toBe(1);
  expect(row.completeDealt).toBe(20);expect(row.completeReceived).toBe(0);expect(row.completeReward).toBeCloseTo(0.6666666666666666, 12);
  expect(row.outcomeCounts).toEqual({ hit: 1 });expect(row.partialCount).toBe(0);expect(row.censoredCount).toBe(0);
});

test('partial contacts preserve actual damage separately and no-contact censorship never implies success or failure', () => {
  const partial = fixture();partial.observe();partial.decide();partial.contact();resetLearning(partial.memory, { round: true });
  const row = captureLearningEvidence(partial.memory)!.outcomes![0]!;
  expect(row.completeCount).toBe(0);expect(row.partialCount).toBe(1);expect(row.censoredCount).toBe(0);
  expect(row.confidence).toBe(.25);expect(row.completeDealt).toBe(0);expect(row.completeReward).toBe(0);
  expect(row.partialDealt).toBe(20);expect(row.outcomeCounts).toEqual({ 'partial-contact': 1 });
  const once = captureLearningEvidence(partial.memory);resetLearning(partial.memory, { round: true });expect(captureLearningEvidence(partial.memory)).toEqual(once);
  const censored = fixture();censored.observe();censored.decide();resetLearning(censored.memory, { round: true });
  const unknown = captureLearningEvidence(censored.memory)!.outcomes![0]!;
  expect(unknown.completeCount).toBe(0);expect(unknown.partialCount).toBe(0);expect(unknown.censoredCount).toBe(1);
  expect(unknown.confidence).toBe(0);expect(unknown.completeDealt).toBe(0);expect(unknown.completeReward).toBe(0);expect(unknown.outcomeCounts).toEqual({ censored: 1 });
});

test('opponent motion uses actual opponent displacement, unknown resource maxima and corner facts stay unknown', () => {
  const f = fixture();f.observe(2, false);f.state.frame++;f.self.position.x = -2;f.observe(4, false);f.decide();f.contact();
  f.state.frame++;f.self.moveId = '';f.resolve();f.state.frame += 12;f.resolve();
  expect(captureLearningEvidence(f.memory)!.outcomes![0]!.facts).toEqual({ targetStamina: 'unknown', targetHealth: 'unknown', targetMotion: 'stationary', targetCorner: 'unknown' });
  f.state.frame++;f.target.position.x += 1;f.observe(5);f.decide();resetLearning(f.memory, { round: true });
  expect(captureLearningEvidence(f.memory)!.outcomes![1]!.facts.targetMotion).toBe('retreat');
});

test('exact fresh counts do not decay or inherit model estimates; group omissions count lost actual windows', () => {
  const f = fixture();f.memory.actions = [{ context, action: 'attack:jab', samples: 16, reward: 8 }];f.observe();
  for (let index = 0; index < 65; index++) {
    const attempt = { context, action: `forced:move${index}`, dealt: 3, received: 2 };
    startOutcomeAttempt(f.memory, attempt);finishOutcomeAttempt(f.memory, attempt, 'complete', 'hit', .1);
    finishOutcomeAttempt(f.memory, attempt, 'complete', 'hit', .1);
  }
  const evidence = captureLearningEvidence(f.memory)!;
  expect(evidence.outcomes).toHaveLength(64);expect(evidence.omittedOutcomes).toBe(1);
  expect(evidence.outcomes!.every(row => row.completeCount === 1 && row.confidence === 1 && row.completeDealt === 3)).toBe(true);
  expect(evidence.actions).toEqual([]);expect(f.memory.actions[0]!.samples).toBe(16);
  expect(readCombatAiLearningEvidence(evidence)).toEqual(evidence);
});

test('strict restore rejects fictional corners and inconsistent exact counts while legacy journals remain readable', () => {
  const f = fixture();f.observe();f.decide();f.contact();resetLearning(f.memory, { round: true });
  const evidence = captureLearningEvidence(f.memory)!, row = evidence.outcomes![0]!;
  expect(() => readCombatAiLearningEvidence({ ...evidence, outcomes: [{ ...row, facts: { ...row.facts, targetCorner: 'cornered' } }] })).toThrow();
  expect(() => readCombatAiLearningEvidence({ ...evidence, outcomes: [{ ...row, confidence: 1 }] })).toThrow();
  expect(() => readCombatAiLearningEvidence({ ...evidence, outcomes: [{ ...row, outcomeCounts: { hit: 1 } }] })).toThrow();
  expect(() => readCombatAiLearningEvidence({ ...evidence, outcomes: [...evidence.outcomes!, row] })).toThrow();
  expect(() => readCombatAiLearningEvidence({ ...evidence, omittedOutcomes: undefined })).toThrow();
  const { outcomes: _outcomes, omittedOutcomes: _omitted, ...legacy } = evidence;
  expect(readCombatAiLearningEvidence(legacy)).toEqual(legacy);
});
