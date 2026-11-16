import { expect, test } from 'bun:test';
import { readCombatAiLearningEvidence, readCombatAiLearningProbe } from './evidence-validation.ts';
import { validateOutcomeEvidence } from './outcome-validation.ts';
import type { CombatAiLearningOutcomeEvidence } from './outcome-evidence.ts';

test('coerced probe movement exposes the declared string contract', () => {
  const input = { frame: 0, context: 'near:ground:ground:neutral', difficulty: 1,
    opponentId: '', candidates: [{ id: 'move', score: 0, movement: ['toward'] }] }, before = structuredClone(input);
  const result = readCombatAiLearningProbe(input);
  expect(result.candidates[0]!.movement).toBe('toward');
  expect(input).toEqual(before);expect(result).not.toBe(input);expect(result.candidates).not.toBe(input.candidates);
  for (const movement of ['toward', 'away', 'flank'] as const) expect(readCombatAiLearningProbe({ ...input, candidates: [{ id: 'move', score: 0, movement }] }).candidates[0]!.movement).toBe(movement);
  for (const movement of [[], ['invented'], ['toward', 'away']]) expect(() => readCombatAiLearningProbe({ ...input, candidates: [{ id: 'move', score: 0, movement }] })).toThrow('Invalid contextual probe movement');
});

test('coerced tactical facts expose the declared string contracts', () => {
  const row: CombatAiLearningOutcomeEvidence = {
    context: 'near:ground:ground:neutral', action: 'move',
    facts: { targetStamina: 'low', targetHealth: 'medium', targetMotion: 'retreat', targetCorner: 'unknown' },
    completeCount: 1, partialCount: 0, censoredCount: 0, confidence: 1,
    completeReward: 0, completeDealt: 0, completeReceived: 0,
    partialReward: 0, partialDealt: 0, partialReceived: 0, outcomeCounts: { movement: 1 },
  };
  const input = [{ ...row, facts: { ...row.facts, targetStamina: ['low'], targetHealth: ['medium'], targetMotion: ['retreat'] } }], before = structuredClone(input);
  const result = validateOutcomeEvidence(input, 0);
  expect(result[0]!.facts).toEqual(row.facts);
  expect(input).toEqual(before);expect(result[0]!.facts).not.toBe(input[0]!.facts);
  expect(validateOutcomeEvidence([row], 0)).toEqual([row]);
  for (const targetStamina of [[], ['invented'], ['low', 'high']]) expect(() => validateOutcomeEvidence([{ ...row, facts: { ...row.facts, targetStamina } }], 0)).toThrow('Invalid tactical resource fact');
  const evidence = { version: 1, opponentId: '', actions: [], habits: [], probes: [], omittedProbes: 0, outcomes: input, omittedOutcomes: 0 };
  expect(readCombatAiLearningEvidence(evidence).outcomes![0]!.facts).toEqual(row.facts);
});

test('probe coercion is cached once and original cloning still rejects non-cloneable values', () => {
  let calls = 0;
  const movement = { toString() { calls++;return 'toward'; } };
  const input = { frame: 0, context: 'near:ground:ground:neutral', difficulty: 1,
    opponentId: '', candidates: [{ id: 'move', score: 0, movement }] };
  expect(() => readCombatAiLearningProbe(input)).toThrow();expect(calls).toBe(1);
  calls = 0;expect(() => readCombatAiLearningProbe({ ...input, frame: -1 })).toThrow('Invalid contextual evidence number');expect(calls).toBe(0);
});

test('tactical fact coercion is cached once before cloning and preserves earlier rejection order', () => {
  let calls = 0;
  const targetStamina = { toString() { calls++;return 'low'; } };
  const row = { context: 'near:ground:ground:neutral', action: 'move',
    facts: { targetStamina, targetHealth: 'medium', targetMotion: 'retreat', targetCorner: 'unknown' },
    completeCount: 1, partialCount: 0, censoredCount: 0, confidence: 1,
    completeReward: 0, completeDealt: 0, completeReceived: 0, partialReward: 0, partialDealt: 0, partialReceived: 0, outcomeCounts: { movement: 1 } };
  const input = { version: 1, opponentId: '', actions: [], habits: [], probes: [], omittedProbes: 0, outcomes: [row], omittedOutcomes: 0 };
  expect(() => readCombatAiLearningEvidence(input)).toThrow();expect(calls).toBe(1);
  calls = 0;expect(() => readCombatAiLearningEvidence({ ...input, outcomes: [{ ...row, action: '' }] })).toThrow('Invalid tactical outcome identity');expect(calls).toBe(0);
});
