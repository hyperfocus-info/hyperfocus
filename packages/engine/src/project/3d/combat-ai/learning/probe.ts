import { candidateProbabilities } from '../policy/selection.ts';
import { learningAdjustment, type CombatAiLearning, type LearningCandidate } from './model.ts';
import { readLearning } from './validation.ts';
import { readCombatAiLearningProbe } from './evidence-validation.ts';
import type { CombatAiLearningProbe } from './evidence.ts';

export type CombatAiLearningProbeReport = {
  available: boolean; reason?: 'opponent-mismatch'; frame: number; context: string; difficulty: number;
  candidates: { id: string; beforeScore: number; afterScore: number; beforeProbability: number; afterProbability: number; delta: number }[];
  maxProbabilityChange: number; totalVariation: number;
};

function adjusted(memory: CombatAiLearning, context: string, candidate: LearningCandidate) {
  return { ...candidate, score: candidate.score + learningAdjustment(memory, context, candidate) };
}

/** Replay actual legal alternatives; this measures probability change, never untried outcomes. */
export function combatAiLearningProbe({ before, after, probe: supplied }: {
  before?: unknown; after?: unknown; probe: CombatAiLearningProbe;
}): CombatAiLearningProbeReport {
  const probe = readCombatAiLearningProbe(supplied), old = readLearning(before), next = readLearning(after);
  const base = { frame: probe.frame, context: probe.context, difficulty: probe.difficulty };
  if ([old, next].some(model => model.opponentId !== probe.opponentId && (model.opponentId || model.actions.length || model.habits.length))) {
    return { ...base, available: false, reason: 'opponent-mismatch', candidates: [], maxProbabilityChange: 0, totalVariation: 0 };
  }
  const prior = probe.candidates.map(candidate => adjusted(old, probe.context, candidate));
  const learned = probe.candidates.map(candidate => adjusted(next, probe.context, candidate));
  const beforeProbability = candidateProbabilities(prior, probe.difficulty, probe.exploration), afterProbability = candidateProbabilities(learned, probe.difficulty, probe.exploration);
  const candidates = prior.map((candidate, index) => ({ id: candidate.id, beforeScore: candidate.score, afterScore: learned[index]!.score,
    beforeProbability: beforeProbability[index]!, afterProbability: afterProbability[index]!, delta: afterProbability[index]! - beforeProbability[index]! }));
  return { ...base, available: true, candidates, maxProbabilityChange: Math.max(...candidates.map(row => Math.abs(row.delta))),
    totalVariation: candidates.reduce((sum, row) => sum + Math.abs(row.delta), 0) / 2 };
}
