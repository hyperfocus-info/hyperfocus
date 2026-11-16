import type { CombatAiLearningEvidence } from '@hyperfocus/engine/project/runtime-3d';
import { describeTacticalContext, describeTacticalLesson } from './descriptions.ts';

type Outcome = NonNullable<CombatAiLearningEvidence['outcomes']>[number];
const outcomeLabels: Record<string, string> = { hit: 'hits', 'range-predicted': 'predicted range misses', 'displacement-predicted': 'predicted displacement misses',
  'unknown-miss': 'misses (cause unknown)', 'interruption-observed': 'observed interruptions', 'hit-armored-observed': 'observed armored hits',
  'grapple-teched': 'escaped throws', block: 'blocks', parry: 'parries', contact: 'contacts' };

/** Aggregate only observed windows, without filling in untried alternatives. */
export function observedOutcomeFindings(outcomes: readonly Outcome[]) {
  const groups = new Map<string, Outcome>();
  for (const row of outcomes) {
    if (!describeTacticalContext(row.context) || !/^(attack:|dash:|grapple$)/.test(row.action)) continue;
    const key = `${row.context}|${row.action}|${row.facts.targetStamina}`;
    const prior = groups.get(key);
    if (!prior) { groups.set(key, structuredClone(row));continue; }
    for (const count of ['completeCount', 'partialCount', 'censoredCount', 'confidence', 'completeReward', 'completeDealt', 'completeReceived', 'partialReward', 'partialDealt', 'partialReceived'] as const) prior[count] += row[count];
    for (const [outcome, count] of Object.entries(row.outcomeCounts)) prior.outcomeCounts[outcome] = (prior.outcomeCounts[outcome] ?? 0) + count;
  }
  return [...groups.values()].filter(row => row.completeCount >= 2 && Math.abs(row.completeReward / row.completeCount) >= .08).map(row => {
    const meanReward = row.completeReward / row.completeCount;
    const meanNetDamage = (row.completeDealt - row.completeReceived) / row.completeCount;
    const confidence = row.completeCount / (row.completeCount + 8);
    const direction = meanReward > 0 ? 'promising' as const : 'unfavorable' as const;
    const strength = row.completeCount >= 12 ? 'repeated observations' : 'tentative signal';
    const description = describeTacticalLesson(row.action, row.context, meanReward > 0 ? 'is looking promising' : 'is getting poor results', row.facts.targetStamina);
    const reasons = Object.entries(row.outcomeCounts).filter(([outcome]) => !['censored', 'partial-contact'].includes(outcome));
    const reasonText = reasons.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([outcome, count]) => `${count} ${outcomeLabels[outcome] ?? outcome.replaceAll('-', ' ')}`).join(', ');
    return { id: `${row.context}|${row.action}|${row.facts.targetStamina}`, context: row.context, action: row.action, direction, strength, description,
      effectiveSamples: row.confidence, confidence, meanReward, meanNetDamage, completeCount: row.completeCount,
      partialCount: row.partialCount, censoredCount: row.censoredCount, outcomeCounts: row.outcomeCounts,
      scope: 'current-run-observed-action-windows' as const,
      facts: { targetStamina: row.facts.targetStamina, targetHealth: 'not-conditioned' as const, targetMotion: 'not-conditioned' as const, targetCorner: 'unknown' as const },
      support: `${strength}; ${row.completeCount} completed action windows; mean net damage ${meanNetDamage > 0 ? '+' : ''}${meanNetDamage.toFixed(1)}.${reasonText ? ` Outcomes: ${reasonText}.` : ''}${row.partialCount || row.censoredCount ? ` ${row.partialCount} partial and ${row.censoredCount} censored windows excluded from these means.` : ''}`,
      interpretation: 'Sampled contexts and actions were not assigned as controlled alternatives. Partial and censored windows are excluded from reward and damage means; no match-win or superiority claim.' };
  }).sort((a, b) => Math.abs(b.meanReward) * b.confidence - Math.abs(a.meanReward) * a.confidence || a.id.localeCompare(b.id));
}
