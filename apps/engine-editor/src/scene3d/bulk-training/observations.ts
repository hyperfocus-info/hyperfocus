import type { BulkStatus, BulkTotals } from './pool.ts';
import type { PolicyExperimentSnapshot } from '@hyperfocus/touch-of-death/learning/experiment';
import { tacticalFindingLines } from './tactical-findings.ts';

type Trial = PolicyExperimentSnapshot['trials'][number];
function score(rows: Trial[]) {
  const complete = rows.filter(row => row.status === 'completed');
  const wins = complete.filter(row => row.winner === (row.candidateSeat === 0 ? 'player' : 'opponent')).length;
  const draws = complete.filter(row => row.winner === 'draw').length;
  return { count: complete.length, wins, draws, losses: complete.length - wins - draws,
    percent: complete.length ? 100 * (wins + draws / 2) / complete.length : undefined };
}
function signed(value: number) { return `${value >= 0 ? '+' : ''}${Number(value.toFixed(2))}`; }

/** Descriptive evidence only. Promotion is still computed from the complete experiment. */
export function bulkObservations(value: BulkTotals) {
  const experiment = value.learning, lines: string[] = [];
  if (experiment) {
    const training = experiment.trials.filter(row => row.phase === 'training');
    const evaluation = experiment.trials.filter(row => row.phase === 'evaluation');
    lines.push(`Candidate search ${training.length}/32 sets; held-out evaluation ${evaluation.length}/96 sets. ${experiment.status === 'approved' ? 'Candidate passed local evaluation.' : experiment.status === 'rejected' ? experiment.evaluation?.reason ?? 'No candidate completed its training sets.' : 'No new weights approved yet.'}`);
    const waiting = value.experiments ? value.pendingTrialResults?.length ?? 0 : value.fights + value.capped - experiment.trials.length;
    if (waiting > 0) lines.push(`${waiting} finished sets await earlier trial results before joining the ordered evaluation evidence.${value.pendingTrialResults?.length === waiting ? ' Their exact results are retained separately in the export.' : ''}`);
    experiment.candidates.forEach((candidate, index) => {
      const changes = Object.entries(candidate.scores).filter(([key, weight]) => weight !== (experiment.active?.scores[key] ?? 0))
        .map(([key, weight]) => `${key} ${signed(weight - (experiment.active?.scores[key] ?? 0))}`).join(', ') || 'no weight change';
      const rows = training.filter(row => row.candidateId === candidate.id), result = score(rows);
      lines.push(`Candidate ${index + 1} (${changes}): ${rows.length}/8 search sets; ${result.wins} wins, ${result.losses} losses, ${result.draws} draws${rows.length > result.count ? `, ${rows.length - result.count} capped` : ''}${experiment.selected?.id === candidate.id ? '; selected for evaluation' : ''}.`);
    });
    const direct = score(evaluation.filter(row => row.opponentGroup === 'active' && !row.control));
    if (direct.count) lines.push(`Held-out vs active: ${direct.percent!.toFixed(1)}% score (${direct.count}/32 sets; draws count half), ${signed(direct.percent! - 50)} percentage points from even. ${experiment.evaluation?.reason ?? 'Partial results; no improvement claim yet.'}`);
    const frozen = evaluation.filter(row => row.opponentGroup === 'frozen');
    // Compare only completed seed pairs available for both candidate and control.
    const seeds = [...new Set(frozen.map(row => row.seed))].filter(seed => {
      const rows = frozen.filter(row => row.seed === seed && row.status === 'completed');
      return rows.length === 4;
    });
    const paired = frozen.filter(row => seeds.includes(row.seed));
    if (paired.length) lines.push(`Frozen opponent, ${seeds.length}/16 matched seed pairs: candidate ${score(paired.filter(row => !row.control)).percent!.toFixed(1)}% vs active control ${score(paired.filter(row => row.control)).percent!.toFixed(1)}% score.`);
  } else if (value.benchmark) {
    const result = value.benchmark;
    lines.push(`Saved model vs cold model: ${result.sets ? (100 * result.points / result.sets).toFixed(1) : '—'}% score across ${result.sets} completed sets, ${result.capped} capped. Seeds are paired across alternating seats; both models stay frozen and benchmark evidence is never ingested.`);
  } else lines.push(`${value.fights} completed sets: P1 ${value.p1Wins}, P2 ${value.p2Wins}, draws ${value.draws}. ${value.contextual ? 'Informative fights immediately update contextual lessons; saved revisions activate next match.' : 'Observation runs collect evidence; they do not change weights.'}`);
  if (value.experiments) {
    const waiting = value.experiments.pending.filter(row => ['approved', 'rejected'].includes(row.learning.status)).length;
    lines.push(`${value.experiments.completed + waiting} evaluations finished (${waiting} await ordered finalization); ${value.experiments.pending.length - waiting} retained in flight; ${value.experiments.canceled} canceled after a policy change. ${value.experiments.omitted} older completed and ${value.experiments.pendingOmitted ?? 0} in-flight experiment records omitted from this summary.`);
  }
  if (value.contextual) {
    const lesson = value.contextual;
    const contexts = lesson.models.reduce((sum, row) => sum + row.model.actions.length, 0);
    lines.push(`Contextual learning: ${lesson.informative} informative sets/fragments, ${lesson.carried} inherited-model trials, ${lesson.freshEvaluations} fresh-model evaluation trials; ${contexts} action contexts across ${lesson.models.length} stored models. Lessons activate independently of score offsets.`);
    const probes = lesson.recent.flatMap(row => row.effects.flatMap(effect => effect.probes)).filter(probe => probe.available);
    const shift = Math.max(0, ...probes.map(probe => probe.maxProbabilityChange));
    if (probes.length) lines.push(`Recent learning changes legal-action probabilities by up to ${(shift * 100).toFixed(3)} percentage points when the same observed choices are re-scored. This measures policy change, not an increased win rate.`);
    if (lesson.modelRecordsOmitted) lines.push(`Last-run history omitted ${lesson.modelRecordsOmitted} model records and ${lesson.omitted} detailed learning records; full models are kept in separate lesson storage.`);
    lines.push(...tacticalFindingLines(value));
  }
  if (value.capped) lines.push(`${value.capped} sets reached the tick limit; excluded from win scores and cannot pass evaluation.`);
  const retained = value.trials?.length ?? 0;
  lines.push(`Coverage: detailed samples for ${retained}/${value.fights + value.capped} finished or capped sets, at most 2 exchange sequences per set. ${value.droppedMoveSummaries === undefined ? 'Move-count coverage unknown.' : value.droppedMoveSummaries ? `${value.droppedMoveSummaries} move-summary rows omitted; move totals are incomplete.` : 'Move totals are descriptive, not rewards.'}`);
  return lines;
}

/** One shared render budget, including transitions and asynchronous storage/CPU updates. */
export function createBulkDisplay(options: { render: (value: BulkStatus) => void; delayMs?: number }) {
  let timer: ReturnType<typeof setTimeout> | undefined, latest: BulkStatus | undefined;
  let renderedAt = -Infinity, disposed = false;
  const render = () => { timer = undefined;if (!disposed && latest) { renderedAt = performance.now();options.render(latest); } };
  const flush = () => {
    if (disposed || !latest || timer) return;
    const remaining = (options.delayMs ?? 250) - (performance.now() - renderedAt);
    if (remaining <= 0) render();else timer = setTimeout(render, Math.ceil(remaining));
  };
  return {
    update(value: BulkStatus) {
      if (disposed) return;
      latest = value;
      flush();
    },
    flush,
    dispose() { disposed = true;clearTimeout(timer);latest = undefined; },
  };
}
