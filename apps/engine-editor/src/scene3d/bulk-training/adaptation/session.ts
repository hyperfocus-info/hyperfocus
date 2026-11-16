import { mergeCombatAiLearning, prepareCombatAiLearning, readCombatAiLearningEvidence, readCombatAiLearning, type CombatAiLearning, type CombatAiPolicy, type CombatAiLearningEvidence } from '@hyperfocus/engine/project/runtime-3d';
import { collectAdaptationEvidence } from './evidence.ts';
import type { ContextualTrainingRow } from './storage.ts';
import type { PolicyTrial } from '@hyperfocus/touch-of-death/learning/trials';
import { createTrainingOutcomes } from './outcomes.ts';
import { scenarioLessonEvidence } from '../scenario/learning.ts';
import type { ScenarioProgress } from '../scenario/simulation.ts';
import { generalTrainingModel } from './general.ts';

export type ContextualTrialInput = { opponentKeys: [string, string]; models: [CombatAiLearning | undefined, CombatAiLearning | undefined]; baselineRevision: number; carry: boolean; policies?: PolicyTrial['policies']; exploration?: number; frozen?: boolean };
export type ContextualTrialResult = { input: ContextualTrialInput; learning: readonly [CombatAiLearning | undefined, CombatAiLearning | undefined]; evidence: readonly [CombatAiLearningEvidence | undefined, CombatAiLearningEvidence | undefined] };

/** Opponent identity follows actual weights, independent of artifact names and fighter seats. */
export async function contextualOpponentKey(policy?: CombatAiPolicy) {
  const scores = Object.entries(policy?.scores ?? {}).filter(([, value]) => value !== 0).sort(([a], [b]) => a.localeCompare(b));
  if (!scores.length) return 'default';
  const bytes = new TextEncoder().encode(JSON.stringify(scores));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `policy:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Completed observations merge immediately; approval's ordered buffer cannot block learning. */
export function createContextualTrainingSession(options: { rows?: readonly ContextualTrainingRow[]; general?: boolean } = {}) {
  const initial = options.general ? [{ opponentKey: 'general', model: generalTrainingModel(options.rows ?? []) }] : options.rows ?? [];
  const bank = new Map(initial.map(row => [row.opponentKey, prepareCombatAiLearning({ model: row.model, opponentId: row.opponentKey })]));
  const recorded = new Set<string>();
  const keys = new Map<string, Promise<string>>();
  const outcomes = createTrainingOutcomes();
  const scenarioCredits = new Map<string, number>();
  let investigations = 0, investigationWindows = 0;
  let revision = 0, sets = 0, fragments = 0, carried = 0, freshEvaluations = 0, informative = 0, omitted = 0, evicted = 0;
  const recent: { job: string; seed: number; complete: boolean; carried: boolean; baselineRevision: number; commitRevision: number;
    input: ContextualTrialInput; decisions: { seat: 0 | 1; traces: CombatAiLearning['traces']; omittedRetainedTraces: number }[];
    journalOmissions: { actions: number; habits: number }[]; effects: (ReturnType<typeof collectAdaptationEvidence> & { seat?: 0 | 1 })[] }[] = [];
  const key = (policy?: CombatAiPolicy) => {
    const identity = JSON.stringify(Object.entries(policy?.scores ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    let result = keys.get(identity);
    if (!result) { result = contextualOpponentKey(policy);keys.set(identity, result);if (keys.size > 64) keys.delete(keys.keys().next().value!); }
    return result;
  };
  return {
    async input(trial?: PolicyTrial): Promise<ContextualTrialInput> {
      const opponentKeys: [string, string] = options.general ? ['general', 'general'] : [await key(trial?.policies[1]), await key(trial?.policies[0])];
      const carry = trial?.phase !== 'evaluation';
      const model = (opponentId: string) => carry && bank.has(opponentId) ? prepareCombatAiLearning({ model: bank.get(opponentId), opponentId }) : undefined;
      return { opponentKeys, models: [model(opponentKeys[0]), model(opponentKeys[1])], baselineRevision: revision, carry,
        ...(trial ? { policies: structuredClone(trial.policies) } : {}) };
    },
    record(options: { job: string; seed: number; complete?: boolean; result: ContextualTrialResult }) {
      const identity = `${options.job}:${options.seed}`;
      if (recorded.has(identity)) return;
      const { result } = options, effects: (ReturnType<typeof collectAdaptationEvidence> & { seat: 0 | 1 })[] = [], journalOmissions: { actions: number; habits: number }[] = [];
      const staged = new Map(bank), journals = result.evidence.map(value => value && readCombatAiLearningEvidence(value));
      const observed = result.learning.map(value => value && readCombatAiLearning(value));
      const input = structuredClone(result.input);
      let useful = false, removed = 0;
      for (const seat of [0, 1] as const) {
        const supplied = journals[seat];if (!supplied) continue;
        const opponentKey = result.input.opponentKeys[seat];
        const evidence = opponentKey === 'general' ? { ...supplied, habits: [] } : supplied;
        if (evidence.opponentId !== opponentKey) throw Error('Contextual evidence belongs to a different opponent.');
        const before = staged.get(opponentKey) ?? prepareCombatAiLearning({ opponentId: opponentKey });
        const after = mergeCombatAiLearning({ baseline: before, opponentId: opponentKey, evidence: [{ sequence: revision, evidence }] });
        useful ||= evidence.actions.length > 0 || evidence.habits.length > 0;
        journalOmissions.push({ actions: evidence.omittedActions ?? 0, habits: evidence.omittedHabits ?? 0 });
        effects.push({ ...collectAdaptationEvidence({ before, after, observed: observed[seat], probes: evidence.probes,
          beforeRevision: revision, afterRevision: revision + 1, omittedProbes: evidence.omittedProbes }), seat });
        staged.delete(opponentKey);staged.set(opponentKey, after);
        if (staged.size > 16) { staged.delete(staged.keys().next().value!);removed++; }
      }
      bank.clear();for (const [key, value] of staged) bank.set(key, value);evicted += removed;
      outcomes.record(journals);
      recorded.add(identity);
      revision++;if (options.complete === false) fragments++;else sets++;
      if (result.input.carry) carried++;else freshEvaluations++;
      if (useful) informative++;
      const decisions = ([0, 1] as const).map(seat => {
        const all = observed[seat]?.traces ?? [], informative = all.filter(trace => trace.status === 'complete' || trace.outcome === 'partial-contact');
        const traces = structuredClone((informative.length ? informative : all).slice(-2));
        return { seat, traces, omittedRetainedTraces: all.length - traces.length };
      });
      recent.push({ job: options.job, seed: options.seed, complete: options.complete !== false, carried: result.input.carry, baselineRevision: result.input.baselineRevision,
        commitRevision: revision, input, decisions, journalOmissions, effects });
      if (recent.length > 8) { recent.shift();omitted++; }
    },
    rows(): ContextualTrainingRow[] { return [...bank].map(([opponentKey, model]) => ({ opponentKey, model: prepareCombatAiLearning({ model, opponentId: opponentKey }) })); },
    recordScenario(progress: ScenarioProgress, input: ContextualTrialInput) {
      const opponentId = input.opponentKeys[progress.seat], update = scenarioLessonEvidence(progress, opponentId, scenarioCredits);
      const before = bank.get(opponentId) ?? prepareCombatAiLearning({ opponentId });
      if (!update.evidence.actions.length) return { applied: false, effectiveSamples: 0, completeWindows: update.completeWindows };
      const after = mergeCombatAiLearning({ baseline: before, opponentId, evidence: [{ sequence: revision, evidence: update.evidence }] });
      const effect = collectAdaptationEvidence({ before, after, probes: update.evidence.probes, beforeRevision: revision, afterRevision: revision + 1 });
      for (const credit of update.credits) scenarioCredits.set(credit.key, (scenarioCredits.get(credit.key) ?? 0) + credit.samples);
      bank.delete(opponentId);bank.set(opponentId, after);if (bank.size > 16) { bank.delete(bank.keys().next().value!);evicted++; }
      revision++;investigations++;investigationWindows += update.completeWindows;
      return { applied: true, effectiveSamples: update.credits.reduce((sum, row) => sum + row.samples, 0), completeWindows: update.completeWindows, effect };
    },
    snapshot() { return structuredClone({ version: 1 as const, revision, sets, fragments, carried, freshEvaluations, informative, evicted, omitted, recent, models: [...bank].map(([opponentKey, model]) => ({ opponentKey, model })), ...outcomes.snapshot(), investigations, investigationWindows }); },
  };
}
export type ContextualTrainingReport = ReturnType<ReturnType<typeof createContextualTrainingSession>['snapshot']> & { persistence?: 'loading' | 'pending' | 'saved' | 'error'; storageRevision?: number; error?: string; modelRecordsOmitted?: number };
