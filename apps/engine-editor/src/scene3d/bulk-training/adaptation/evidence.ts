import { combatAiLearningProbe, type CombatAiLearning, type CombatAiLearningProbe } from '@hyperfocus/engine/project/runtime-3d';

const rowLimit = 8;
const confidence = (samples: number) => samples / (samples + 8);
type ResetReason = 'new-opponent' | 'manual' | 'disabled';

function modelSummary(model: CombatAiLearning) {
  return { opponentId: model.opponentId, actionRows: model.actions.length, habitRows: model.habits.length,
    actionEffectiveSamples: model.actions.reduce((sum, row) => sum + row.samples, 0),
    habitEffectiveSamples: model.habits.reduce((sum, row) => sum + row.samples, 0) };
}

function actionEvidence(before: CombatAiLearning, after: CombatAiLearning) {
  const identities = new Map<string, { context: string; action: string }>();
  for (const row of [...before.actions, ...after.actions]) identities.set(`${row.context}|${row.action}`, row);
  const rows = [...identities.values()].map(({ context, action }) => {
    const prior = before.actions.find(row => row.context === context && row.action === action);
    const next = after.actions.find(row => row.context === context && row.action === action);
    const snapshot = (row: typeof prior) => ({ effectiveSamples: row?.samples ?? 0, confidence: confidence(row?.samples ?? 0),
      posteriorReward: (row?.reward ?? 0) / ((row?.samples ?? 0) + 8) });
    return { context, action, before: snapshot(prior), after: snapshot(next) };
  });
  rows.sort((a, b) => Math.abs(b.after.posteriorReward - b.before.posteriorReward) - Math.abs(a.after.posteriorReward - a.before.posteriorReward)
    || Math.abs(b.after.confidence - b.before.confidence) - Math.abs(a.after.confidence - a.before.confidence)
    || a.context.localeCompare(b.context) || a.action.localeCompare(b.action));
  return { rows: rows.slice(0, rowLimit), omitted: Math.max(0, rows.length - rowLimit) };
}

function habitEvidence(before: CombatAiLearning, after: CombatAiLearning) {
  const contexts = new Set([...before.habits, ...after.habits].map(row => row.context));
  const rows = [...contexts].map(context => {
    const prior = before.habits.find(row => row.context === context), next = after.habits.find(row => row.context === context);
    const snapshot = (row: typeof prior) => ({ effectiveSamples: row?.samples ?? 0, confidence: confidence(row?.samples ?? 0),
      guard: (row?.guard ?? 0) / ((row?.samples ?? 0) + 8), retreat: (row?.retreat ?? 0) / ((row?.samples ?? 0) + 8),
      attack: (row?.attack ?? 0) / ((row?.samples ?? 0) + 8) });
    return { context, before: snapshot(prior), after: snapshot(next) };
  });
  const change = (row: typeof rows[number]) => Math.abs(row.after.guard - row.before.guard) + Math.abs(row.after.retreat - row.before.retreat)
    + Math.abs(row.after.attack - row.before.attack) + Math.abs(row.after.confidence - row.before.confidence);
  rows.sort((a, b) => change(b) - change(a) || a.context.localeCompare(b.context));
  return { rows: rows.slice(0, rowLimit), omitted: Math.max(0, rows.length - rowLimit) };
}

function observedEvidence(model: CombatAiLearning) {
  const outcomes: Record<string, number> = {};
  let complete = 0, censored = 0, pending = 0, partialContacts = 0, omittedAlternatives = 0;
  for (const trace of model.traces) {
    if (trace.status === 'complete') complete++;
    else if (trace.status === 'censored') censored++;
    else pending++;
    if (trace.outcome) outcomes[trace.outcome] = (outcomes[trace.outcome] ?? 0) + 1;
    if (trace.outcome === 'partial-contact') partialContacts++;
    omittedAlternatives += trace.omitted;
  }
  return { scope: 'retained-recent-decisions' as const, retained: model.traces.length, complete, censored, pending, partialContacts,
    openAttributionWindows: Number(model.pending !== null) + Number(model.next !== null), omittedAlternatives, outcomes };
}

/** Effective samples decay; retained decision counts are neither lifetime attempts nor untried-action outcomes. */
export function collectAdaptationEvidence({ before, after, observed = after, reset, beforeRevision, afterRevision, probes = [], omittedProbes = 0 }: {
  before: CombatAiLearning; after: CombatAiLearning; observed?: CombatAiLearning; reset?: ResetReason;
  beforeRevision?: number; afterRevision?: number; probes?: readonly CombatAiLearningProbe[]; omittedProbes?: number;
}) {
  const sameOpponent = before.opponentId === after.opponentId;
  return { before: modelSummary(before), after: modelSummary(after), sameOpponent,
    ...(reset || !sameOpponent ? { reset: reset ?? 'new-opponent' as const } : {}),
    ...(beforeRevision === undefined ? {} : { beforeRevision }), ...(afterRevision === undefined ? {} : { afterRevision }),
    actions: actionEvidence(before, after), habits: habitEvidence(before, after), observed: observedEvidence(observed),
    probes: probes.slice(-4).map(probe => combatAiLearningProbe({ before, after, probe })),
    probabilityScope: 'hypothetical-re-score-of-observed-legal-alternatives' as const,
    omittedProbes: omittedProbes + Math.max(0, probes.length - 4),
    limits: { actionRows: rowLimit, habitRows: rowLimit, probabilityProbes: 4 },
    interpretation: 'Model deltas and hypothetical re-scoring of observed legal alternatives do not infer outcomes for untried actions.' };
}

export type AdaptationEvidence = ReturnType<typeof collectAdaptationEvidence>;
