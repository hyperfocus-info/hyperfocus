import type { BulkTotals } from './pool.ts';
import { describeTacticalContext, describeTacticalLesson } from './findings/descriptions.ts';
import { observedOutcomeFindings } from './findings/outcomes.ts';

type Model = NonNullable<BulkTotals['contextual']>['models'][number];
type Evidence = { context: string; action: string; rows: { opponentKey: string; samples: number; reward: number }[] };

function groupedEvidence(models: readonly Model[]) {
  const groups = new Map<string, Evidence>();
  for (const { opponentKey, model } of models) for (const row of model.actions) {
    if (!describeTacticalContext(row.context) || row.samples <= 0 || !Number.isFinite(row.samples) || !Number.isFinite(row.reward)) continue;
    const action = row.action.replace(/^forced:/, 'attack:');
    if (!/^(attack:|dash:|grapple$)/.test(action)) continue;
    const key = `${row.context}|${action}`;
    let group = groups.get(key);
    if (!group) { group = { context: row.context, action, rows: [] };groups.set(key, group); }
    group.rows.push({ opponentKey, samples: row.samples, reward: row.reward });
  }
  return [...groups.values()];
}

/** These are descriptive sampled outcomes, never counterfactual superiority or match-win claims. */
export function tacticalFindings(value: BulkTotals) {
  const models = value.contextual?.models ?? [];
  const rows = groupedEvidence(models).map(group => {
    const effectiveSamples = group.rows.reduce((sum, row) => sum + row.samples, 0);
    const reward = group.rows.reduce((sum, row) => sum + row.reward, 0);
    const priorSamples = 8 * group.rows.length;
    const posteriorReward = reward / (effectiveSamples + priorSamples);
    const confidence = effectiveSamples / (effectiveSamples + priorSamples);
    const direction = posteriorReward > 0 ? 'promising' as const : 'unfavorable' as const;
    const agreement = group.rows.filter(row => Math.sign(row.reward) === Math.sign(reward)).length / group.rows.length;
    const strength = confidence >= .5 && agreement >= .75 && group.rows.length >= 2 ? 'repeated signal' : 'tentative signal';
    const outcomeCounts: Record<string, number> = {};
    for (const trial of value.contextual?.recent ?? []) for (const seat of trial.decisions) for (const trace of seat.traces) {
      if (trace.status !== 'complete' || trace.context !== group.context || trace.chosen.replace(/^forced:/, 'attack:') !== group.action) continue;
      outcomeCounts[trace.outcome] = (outcomeCounts[trace.outcome] ?? 0) + 1;
    }
    const description = describeTacticalLesson(group.action, group.context, direction === 'promising' ? 'is looking promising' : 'is getting poor results');
    return { id: `${group.context}|${group.action}`, context: group.context, action: group.action, direction, strength, description,
      effectiveSamples, opponentPolicies: group.rows.length, priorSamples, posteriorReward, confidence, agreement, outcomeCounts,
      scope: 'retained-opponent-policy-models' as const,
      support: `${strength}; ${effectiveSamples.toFixed(1)} decay-weighted attempts across ${group.rows.length} opponent ${group.rows.length === 1 ? 'policy' : 'policies'}; prior confidence ${(confidence * 100).toFixed(0)}%.`,
      interpretation: 'Reward combines observed damage dealt/taken, blocks, parries and misses; it does not establish superiority over untried choices or increased match wins.' };
  }).filter(row => Math.abs(row.posteriorReward) >= .08);
  rows.sort((a, b) => Math.abs(b.posteriorReward) * b.agreement - Math.abs(a.posteriorReward) * a.agreement || a.id.localeCompare(b.id));
  // Retain an encouraging signal even when failures dominate the largest absolute rewards.
  const observed = observedOutcomeFindings(value.contextual?.outcomes ?? []);
  const observedIds = new Set(observed.map(row => `${row.context}|${row.action}`));
  const combined = [...observed, ...rows.filter(row => !observedIds.has(row.id))];
  const selected = combined.slice(0, 6), promising = combined.find(row => row.direction === 'promising');
  if (promising && !selected.includes(promising)) selected[selected.length - 1] = promising;
  return { version: 1 as const, findings: selected, omitted: Math.max(0, combined.length - selected.length), omittedOutcomeWindows: value.contextual?.omittedOutcomes ?? 0,
    limitations: observed.length ? `These are sampled observations, not controlled comparisons or proof of higher win rates. Stamina is recorded at the decision; health and motion are not conditioned in these summaries. Corner state remains unknown.${value.contextual?.omittedOutcomes ? ` ${value.contextual.omittedOutcomes} action windows were omitted by evidence limits.` : ''}`
      : 'These are observational, recent-data-weighted signals, not controlled comparisons. Effective attempts decay and are not lifetime counts. Recorded context distinguishes distance, grounded state and opponent commitment; stamina and corner position were not recorded in this model.',
    emptyReason: selected.length ? '' : !models.length ? 'Start training to collect fight lessons.'
      : 'Fights are building evidence. No clear lesson yet.' };
}

export function tacticalFindingLines(value: BulkTotals) {
  const report = tacticalFindings(value);
  return report.findings.length ? report.findings.map(row => row.description) : [report.emptyReason];
}
