import type { ScenarioProgress } from './simulation.ts';
import { describeTacticalAction, describeTacticalContext } from '../findings/descriptions.ts';

export function scenarioSummary(progress: ScenarioProgress) {
  const lines = [`${progress.status === 'reconstructing' ? 'Recreating observed situation' : progress.status === 'complete' ? 'Replay complete' : 'Testing legal choices'}: ${progress.completed}/${progress.total} trials.`,
    `${progress.testedOptionCount}/${progress.legalOptionCount} legal options tested${progress.exhaustive ? '; full legal pool requested' : '; incomplete option coverage'}.`, describeTacticalContext(progress.context) ?? progress.context];
  for (const action of progress.actions) {
    const rows = progress.results.filter(row => row.action === action), complete = rows.filter(row => row.status === 'complete');
    const rollouts = rows.flatMap(row => row.rollout?.complete ? [row.rollout] : []);
    const damage = rollouts.length ? rollouts.reduce((sum, row) => sum + row.healthDealt - row.healthReceived, 0) / rollouts.length
      : complete.length ? complete.reduce((sum, row) => sum + row.dealt - row.received, 0) / complete.length : undefined;
    const causes = [...new Set(complete.map(row => row.outcome))].join(', ');
    lines.push(`${describeTacticalAction(action)}: ${rollouts.length ? `${rollouts.length}/${rows.length} completed response windows` : `${complete.length}/${rows.length} completed action windows`}${damage === undefined ? '' : `, mean ${rollouts.length ? 'net health loss inflicted' : 'net damage'} ${damage.toFixed(1)}`}. Direct action attribution: ${complete.length} complete, ${rows.length - complete.length} partial/censored/unexecuted${causes ? `; ${causes}` : ''}.`);
  }
  for (const row of progress.comparisons) {
    lines.push(`${describeTacticalAction(row.action)} versus ${describeTacticalAction(row.reference)}: ${row.pairedComplete} complete paired responses${row.meanNetDamageDifference === null ? '' : `, mean ${row.scope === 'fixed-response-window' ? 'net health loss' : 'net damage'} difference ${row.meanNetDamageDifference.toFixed(1)}`}; ${row.wins} better, ${row.ties} tied, ${row.losses} worse.`);
  }
  if (progress.comparisonTolerance !== undefined) lines.push(`Health differences within ${progress.comparisonTolerance.toPrecision(2)} points count as ties.`);
  lines.push(`Each choice gets ${progress.windowTicks} ticks of follow-up play against the same paired opponent responses, or until the match ends. Comparisons use completed windows.`);
  return lines.join('\n\n');
}
