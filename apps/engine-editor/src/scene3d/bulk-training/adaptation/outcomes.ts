import { readCombatAiLearningEvidence, type CombatAiLearningEvidence } from '@hyperfocus/engine/project/runtime-3d';

export type TrainingOutcome = NonNullable<CombatAiLearningEvidence['outcomes']>[number];
const count = (row: TrainingOutcome) => row.completeCount + row.partialCount + row.censoredCount;
const key = (row: TrainingOutcome) => [row.context, row.action, row.facts.targetStamina, row.facts.targetHealth, row.facts.targetMotion].join('|');

/** Fresh journal windows only. Seeded models and repeated report snapshots add no evidence. */
export function createTrainingOutcomes() {
  const rows = new Map<string, TrainingOutcome>();
  let omitted = 0, sets = 0;
  return {
    record(evidence: readonly (CombatAiLearningEvidence | undefined)[]) {
      if (evidence.some(value => value?.outcomes?.length || value?.omittedOutcomes)) sets++;
      for (const journal of evidence) {
        omitted += journal?.omittedOutcomes ?? 0;
        for (const source of journal?.outcomes ?? []) {
          const id = key(source), row = rows.get(id);
          if (!row) {
            rows.set(id, structuredClone(source));
            if (rows.size > 64) { const first = rows.keys().next().value!;omitted += count(rows.get(first)!);rows.delete(first); }
          } else {
            for (const field of ['completeCount', 'partialCount', 'censoredCount', 'confidence', 'completeReward', 'completeDealt', 'completeReceived', 'partialReward', 'partialDealt', 'partialReceived'] as const) row[field] += source[field];
            for (const [cause, total] of Object.entries(source.outcomeCounts)) row.outcomeCounts[cause] = (row.outcomeCounts[cause] ?? 0) + total;
          }
        }
      }
    },
    snapshot() { return { outcomes: structuredClone([...rows.values()]), omittedOutcomes: omitted, outcomeSets: sets }; },
  };
}

/** Reuse the engine's strict bounds and exclusive-count checks for durable diagnostics. */
export function readTrainingOutcomes(outcomes: unknown, omittedOutcomes: unknown) {
  return readCombatAiLearningEvidence({ version: 1, opponentId: '', actions: [], habits: [], probes: [], omittedProbes: 0,
    outcomes, omittedOutcomes }).outcomes!;
}
