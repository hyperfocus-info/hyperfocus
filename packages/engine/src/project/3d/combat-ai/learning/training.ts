import { initialLearning, resetLearning, type CombatAiLearning } from './model.ts';
import { readLearning } from './validation.ts';
import { readCombatAiLearningEvidence } from './evidence-validation.ts';
import type { CombatAiLearningEvidence } from './evidence.ts';

/** Clean boundary copy. Rebinding is allowed only for a host-known identical opponent policy. */
export function prepareCombatAiLearning({ model, opponentId, newOpponent = false, retainPartial = true }: {
  model?: unknown; opponentId?: string; newOpponent?: boolean; retainPartial?: boolean;
} = {}): CombatAiLearning {
  const learning = readLearning(model);
  resetLearning(learning, { round: true, newOpponent, retainPartial });
  if (opponentId !== undefined) {
    if (typeof opponentId !== 'string' || opponentId.length > 128) throw Error('Invalid contextual opponent identity');
    learning.opponentId = opponentId;
  }
  learning.traces = [];learning.transient = initialLearning().transient;
  return learning;
}

export type CombatAiLearningEvidenceTrial = { sequence: number; evidence: CombatAiLearningEvidence };

/** Each independently seeded trial contributes its affine fresh-evidence operation once. */
export function mergeCombatAiLearning({ baseline, evidence, opponentId }: {
  baseline?: unknown; evidence: readonly CombatAiLearningEvidenceTrial[]; opponentId?: string;
}): CombatAiLearning {
  if (!Array.isArray(evidence) || evidence.length > 4096) throw Error('Invalid contextual evidence batch');
  const learning = prepareCombatAiLearning({ model: baseline, opponentId, retainPartial: false });
  const sequences = new Set<number>();
  const ordered = evidence.map(trial => {
    if (!Number.isSafeInteger(trial.sequence) || trial.sequence < 0 || sequences.has(trial.sequence)) throw Error('Invalid or duplicate contextual trial sequence');
    sequences.add(trial.sequence);
    return { sequence: trial.sequence, evidence: readCombatAiLearningEvidence(trial.evidence) };
  }).sort((a, b) => a.sequence - b.sequence);
  for (const trial of ordered) {
    if (trial.evidence.opponentId !== learning.opponentId) throw Error('Contextual evidence opponent mismatch');
    for (const delta of trial.evidence.actions) {
      let row = learning.actions.find(row => row.context === delta.context && row.action === delta.action);
      if (!row) {
        row = { context: delta.context, action: delta.action, samples: 0, reward: 0 };learning.actions.push(row);
      }
      row.samples = row.samples * delta.decay + delta.samples;row.reward = row.reward * delta.decay + delta.reward;
    }
    for (const delta of trial.evidence.habits) {
      let row = learning.habits.find(row => row.context === delta.context);
      if (!row) {
        if (learning.habits.length >= 16) learning.habits.shift();
        row = { context: delta.context, samples: 0, guard: 0, retreat: 0, attack: 0 };learning.habits.push(row);
      }
      row.samples = row.samples * delta.decay + delta.samples;
      for (const key of ['guard', 'retreat', 'attack'] as const) row[key] = row[key] * delta.decay + delta[key];
    }
  }
  return readLearning(learning);
}
