import type { ScenarioProgress, ScenarioResult } from './simulation.ts';
import { describeTacticalAction, describeTacticalLesson } from '../findings/descriptions.ts';

const measurementScope = (row: ScenarioResult) => row.rollout ? 'fixed-response-window' as const : 'direct-action-window' as const;
function comparisonTolerance(progress: ScenarioProgress) {
  const value = 'comparisonTolerance' in progress ? progress.comparisonTolerance : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : .1;
}
function observedNet(row: ScenarioResult, requestedTicks: number) {
  if (row.rollout) {
    const terminal = 'terminal' in row.rollout && row.rollout.terminal === true;
    return row.rollout.complete && (row.rollout.ticks === requestedTicks || terminal) ? row.rollout.healthDealt - row.rollout.healthReceived : undefined;
  }
  return row.status === 'complete' ? row.dealt - row.received : undefined;
}

/** Identical checkpoint/response seeds are one observation even across manual reruns. */
function uniqueCheckpoints(progresses: readonly ScenarioProgress[]) {
  const checkpoints = new Map<string, { progress: ScenarioProgress; results: Map<string, ScenarioResult>; raw: boolean }>();
  for (const progress of progresses) {
    if (progress.status !== 'complete' || !progress.exhaustive) continue;
    const identity = JSON.stringify([progress.seed, progress.frame, progress.seat, progress.context, progress.stateDigest ?? 'unknown', progress.windowTicks, comparisonTolerance(progress)]);
    let entry = checkpoints.get(identity);
    if (!entry) { entry = { progress, results: new Map(), raw: false };checkpoints.set(identity, entry); }
    entry.raw ||= progress.results.length > 0;
    const support = (row: ScenarioProgress) => row.comparisons.reduce((sum, comparison) => sum + comparison.pairedComplete, 0);
    if (support(progress) > support(entry.progress)) entry.progress = progress;
    for (const result of progress.results) {
      if (observedNet(result, progress.windowTicks) === undefined) continue;
      entry.results.set(JSON.stringify([measurementScope(result), result.action, result.opponentSeed]), result);
    }
  }
  return [...checkpoints.values()].map(({ progress, results, raw }) => {
    // Legacy diagnostic rows without raw windows can retain only their strongest
    // single checkpoint summary; overlapping aggregate counts cannot be added.
    if (!results.size) return raw ? { ...progress, comparisons: [] } : progress;
    const windows = [...results.values()], reference = progress.actions[0]!, tolerance = comparisonTolerance(progress);
    const comparisons = progress.actions.slice(1).flatMap(action => (['fixed-response-window', 'direct-action-window'] as const).map(scope => {
      const differences = windows.filter(row => row.action === action && measurementScope(row) === scope).flatMap(row => {
        const control = results.get(JSON.stringify([scope, reference, row.opponentSeed]));
        const net = observedNet(row, progress.windowTicks), referenceNet = control && observedNet(control, progress.windowTicks);
        return net !== undefined && referenceNet !== undefined ? [net - referenceNet] : [];
      });
      return { action, reference, scope, pairedComplete: differences.length,
        meanNetDamageDifference: differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null,
        wins: differences.filter(value => value > tolerance).length, ties: differences.filter(value => Math.abs(value) <= tolerance).length, losses: differences.filter(value => value < -tolerance).length };
    }));
    return { ...progress, comparisons };
  });
}

/** Compare completed paired responses; different fight seeds remain explicit evidence units. */
export function investigationReport(progresses: readonly ScenarioProgress[]) {
  const completed = uniqueCheckpoints(progresses);
  if (!completed.length) return;
  const candidates = new Map<string, { action: string; reference: string; context: string; scope: 'fixed-response-window' | 'direct-action-window'; windowTicks: number; tolerance: number; seeds: Set<number>; pairs: number; difference: number; better: number; worse: number }>();
  for (const progress of completed) for (const row of progress.comparisons) {
    if (!row.pairedComplete || row.meanNetDamageDifference === null) continue;
    const scope = row.scope ?? 'direct-action-window';
    const tolerance = comparisonTolerance(progress);
    const key = `${progress.context}|${row.action}|${row.reference}|${scope}|${scope === 'fixed-response-window' ? progress.windowTicks : ''}|${tolerance}`;
    const total = candidates.get(key) ?? { action: row.action, reference: row.reference, context: progress.context, scope, windowTicks: progress.windowTicks, tolerance, seeds: new Set<number>(), pairs: 0, difference: 0, better: 0, worse: 0 };
    total.seeds.add(progress.seed);total.pairs += row.pairedComplete;total.difference += row.meanNetDamageDifference * row.pairedComplete;total.better += row.wins;total.worse += row.losses;candidates.set(key, total);
  }
  const rows = [...candidates.values()].filter(row => row.pairs >= 4).sort((a, b) => Number(b.scope === 'fixed-response-window') - Number(a.scope === 'fixed-response-window') || Math.abs(b.difference / b.pairs) - Math.abs(a.difference / a.pairs));
  const strongest = rows[0];
  const offeredChoices = completed.reduce((sum, row) => sum + row.legalOptionCount, 0);
  const fightSeeds = new Set(completed.map(row => row.seed)).size;
  if (!strongest) return { offeredChoices, fightSeeds, finding: undefined, description: 'More completed replays are needed to compare the options.' };
  const meanNetDamageDifference = strongest.difference / strongest.pairs;
  const outcome = Math.abs(meanNetDamageDifference) <= strongest.tolerance ? 'similar' as const : meanNetDamageDifference > 0 ? 'better' as const : 'worse' as const;
  const reference = describeTacticalAction(strongest.reference);
  const result = outcome === 'similar' ? `performed about the same as ${reference}` : `had ${outcome} average results than ${reference}`;
  return { offeredChoices, fightSeeds,
    finding: { action: strongest.action, reference: strongest.reference, context: strongest.context, scope: strongest.scope,
      windowTicks: strongest.windowTicks, tolerance: strongest.tolerance, fightSeeds: strongest.seeds.size,
      pairedComplete: strongest.pairs, meanNetDamageDifference, better: strongest.better, worse: strongest.worse,
      ties: strongest.pairs - strongest.better - strongest.worse, outcome },
    description: describeTacticalLesson(strongest.action, strongest.context, result) };
}

export function investigationFinding(progresses: readonly ScenarioProgress[]) {
  return investigationReport(progresses)?.description ?? '';
}
