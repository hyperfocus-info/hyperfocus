import type { ContextualTrainingReport, ContextualTrialInput } from '../adaptation/session.ts';
import { describeTacticalAction, describeTacticalContext } from '../findings/descriptions.ts';

export type ReplaySituation = { key: string; label: string; seed: number; frame: number; seat: 0 | 1; context: string; actions: string[]; legalIds: string[]; input: ContextualTrialInput };

/** Only retained, actually observed legal pools can nominate a reproducible situation. */
export function replaySituations(report?: ContextualTrainingReport, limit = 6): ReplaySituation[] {
  const situations: ReplaySituation[] = [];
  for (const trial of [...report?.recent ?? []].reverse()) {
    for (const seat of [0, 1] as const) {
      const effect = trial.effects.find(value => value.seat === seat);
      for (const probe of [...effect?.probes ?? []].reverse()) {
        if (!probe.available || probe.candidates.length < 2) continue;
        const candidates = [...probe.candidates].sort((a, b) => b.beforeProbability - a.beforeProbability || a.id.localeCompare(b.id));
        const trace = trial.decisions.find(value => value.seat === seat)?.traces.find(value => value.frame === probe.frame);
        const reference = candidates.find(value => value.id === trace?.chosen) ?? candidates[0]!;
        const alternatives = candidates.filter(value => value.id !== reference.id).sort((a, b) => {
          const promise = (value: typeof a) => value.afterProbability + Math.max(0, value.delta) + Number(value.id.startsWith('attack:') || value.id.startsWith('dash:')) * .15;
          return promise(b) - promise(a) || a.id.localeCompare(b.id);
        });
        const actions = [reference.id, ...alternatives.map(value => value.id)];
        situations.push({ key: `${trial.job}:${seat}:${probe.frame}`, label: `P${seat + 1}, frame ${probe.frame}: ${describeTacticalContext(probe.context) ?? probe.context}. ${actions.length} legal options (${actions.slice(0, 3).map(describeTacticalAction).join(', ')}${actions.length > 3 ? ', …' : ''}).`,
          seed: trial.seed, frame: probe.frame, seat, context: probe.context, actions, legalIds: candidates.map(row => row.id), input: structuredClone(trial.input) });
        if (situations.length === limit) return situations;
      }
    }
  }
  return situations;
}

/** Vary real observed spacing, resources and histories through distinct fight seeds. */
export function investigationSituations(report: ContextualTrainingReport | undefined, selected: ReplaySituation, situations = replaySituations(report, 64)) {
  const rows = [selected], seeds = new Set([selected.seed]);
  for (const row of situations) {
    if (seeds.has(row.seed) || row.context !== selected.context || !row.legalIds.includes(selected.actions[0]!)) continue;
    seeds.add(row.seed);rows.push({ ...row, actions: [selected.actions[0]!, ...row.actions.filter(action => action !== selected.actions[0])] });
    if (rows.length === 3) break;
  }
  return rows;
}

export function situationLessonKey(row: ReplaySituation) { return JSON.stringify([row.input.opponentKeys[row.seat], row.context, row.seed]); }

/** Investigate a meaningful observed signal while its policy confidence is still low. */
export function uncertainLessonSituation(report: ContextualTrainingReport | undefined, investigated: ReadonlySet<string>, situations = replaySituations(report, 64)) {
  return situations.find(row => {
    if (investigated.has(situationLessonKey(row))) return false;
    const model = report?.models.find(value => value.opponentKey === row.input.opponentKeys[row.seat])?.model;
    return model?.actions.some(action => action.context === row.context && row.actions.some(id => id.replace(/^forced:/, 'attack:') === action.action)
      && action.samples > 0 && action.samples < 8 && Math.abs(action.reward / (action.samples + 8)) > .025);
  });
}
