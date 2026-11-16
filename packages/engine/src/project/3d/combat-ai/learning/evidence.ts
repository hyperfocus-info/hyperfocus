import type { CombatAiLearning, LearningCandidate } from './model.ts';
import { trackOutcomeEvidence, type CombatAiLearningOutcomeEvidence } from './outcome-evidence.ts';

export type CombatAiLearningProbe = { frame: number; context: string; difficulty: number; opponentId: string; candidates: LearningCandidate[]; exploration?: number };
export type CombatAiLearningEvidence = {
  version: 1; opponentId: string;
  actions: { context: string; action: string; decay: number; samples: number; reward: number }[];
  habits: { context: string; decay: number; samples: number; guard: number; retreat: number; attack: number }[];
  probes: CombatAiLearningProbe[]; omittedProbes: number; omittedActions: number; omittedHabits: number;
  outcomes?: CombatAiLearningOutcomeEvidence[]; omittedOutcomes?: number;
};
type Journal = { evidence: CombatAiLearningEvidence; initialHabits: Set<string>; forgottenHabits: string[] };
const journals = new WeakMap<CombatAiLearning, Journal>();

/** Opt-in per-trial journal. Portable captures and ordinary play stay unchanged. */
export function trackLearningEvidence(memory: CombatAiLearning) {
  const evidence: Required<CombatAiLearningEvidence> = { version: 1, opponentId: memory.opponentId, actions: [], habits: [], probes: [], omittedProbes: 0, omittedActions: 0, omittedHabits: 0,
    outcomes: [], omittedOutcomes: 0 };
  trackOutcomeEvidence(memory, evidence);
  journals.set(memory, { evidence,
    initialHabits: new Set(memory.habits.map(row => row.context)), forgottenHabits: [] });
}
export function resetLearningEvidence(memory: CombatAiLearning) {
  if (journals.has(memory)) trackLearningEvidence(memory);
}
export function captureLearningEvidence(memory: CombatAiLearning): CombatAiLearningEvidence | undefined {
  const evidence = journals.get(memory)?.evidence;
  return evidence ? structuredClone({ ...evidence, opponentId: memory.opponentId }) : undefined;
}

/** Compose only actual updates: old evidence * decay + newly observed evidence. */
export function recordActionEvidence(memory: CombatAiLearning, context: string, action: string, decay: number, samples: number, reward: number) {
  const journal = journals.get(memory);if (!journal) return;
  const evidence = journal.evidence;
  let row = evidence.actions.find(row => row.context === context && row.action === action);
  if (!row) {
    row = { context, action, decay: 1, samples: 0, reward: 0 };evidence.actions.push(row);
  }
  row.decay *= decay;row.samples = row.samples * decay + samples;row.reward = row.reward * decay + reward;
}
export function recordHabitEvidence(memory: CombatAiLearning, context: string, guard: number, retreat: number, attack: number, created = false) {
  const journal = journals.get(memory);if (!journal) return;
  const evidence = journal.evidence, recreated = created && (journal.initialHabits.has(context) || journal.forgottenHabits.includes(context));
  let row = evidence.habits.find(row => row.context === context);
  if (!row) {
    if (evidence.habits.length >= 16) { evidence.habits.shift();evidence.omittedHabits++; }
    row = { context, decay: 1, samples: 0, guard: 0, retreat: 0, attack: 0 };evidence.habits.push(row);
  }
  if (recreated) { row.decay = 0;row.samples = 0;row.guard = 0;row.retreat = 0;row.attack = 0; }
  row.decay *= .9;row.samples = row.samples * .9 + 1;
  row.guard = row.guard * .9 + guard;row.retreat = row.retreat * .9 + retreat;row.attack = row.attack * .9 + attack;
}

/** Bounded within-trial eviction history distinguishes recreation from cold new evidence. */
export function recordLearningEviction(memory: CombatAiLearning, context: string) {
  const journal = journals.get(memory);if (!journal) return;
  const forgotten = journal.forgottenHabits, key = context;
  const prior = forgotten.indexOf(key);if (prior >= 0) forgotten.splice(prior, 1);
  forgotten.push(key);if (forgotten.length > 16) forgotten.shift();
}

/** Raw legal selector inputs, after host offsets and before any learning adjustment. */
export function recordLearningProbe(memory: CombatAiLearning, probe: CombatAiLearningProbe) {
  const evidence = journals.get(memory)?.evidence;if (!evidence) return;
  if (!probe.candidates.length) return;
  if (probe.candidates.length > 64) { evidence.omittedProbes++;return; }
  evidence.probes.push(structuredClone(probe));if (evidence.probes.length > 4) { evidence.probes.shift();evidence.omittedProbes++; }
}
