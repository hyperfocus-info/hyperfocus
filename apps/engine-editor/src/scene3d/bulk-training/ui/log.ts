import type { BulkStatus } from '../pool.ts';
import type { PolicyExperimentSnapshot } from '@hyperfocus/touch-of-death/learning/experiment';
import { tacticalFindings } from '../tactical-findings.ts';

/** Bounded event history: only completed evidence, stage changes and failures become log entries. */
export function createTrainingLog() {
  const lines: string[] = [], seen = new Set<string>();let seed: number | undefined, state = '', milestone = -1;
  const append = (key: string, line: string) => {
    if (seen.has(key)) return;seen.add(key);lines.push(line);
    if (lines.length > 120) lines.shift();
    if (seen.size > 512) seen.delete(seen.values().next().value!);
  };
  function experiment(value: PolicyExperimentSnapshot) {
    const changes = (scores: Record<string, number>) => Object.entries(scores).filter(([key, weight]) => weight !== (value.active?.scores[key] ?? 0))
      .map(([key, weight]) => `${key} ${(weight - (value.active?.scores[key] ?? 0)) > 0 ? '+' : ''}${(weight - (value.active?.scores[key] ?? 0)).toFixed(2)}`).join(', ');
    for (const [index, candidate] of value.candidates.entries()) {
      const rows = value.trials.filter(row => row.phase === 'training' && row.candidateId === candidate.id);
      if (rows.length !== 8) continue;
      const wins = rows.filter(row => row.status === 'completed' && row.winner === (row.candidateSeat === 0 ? 'player' : 'opponent')).length;
      const delta = changes(candidate.scores);
      append(candidate.id, `Search ${index + 1} · ${delta} · ${wins}/8 wins${rows.some(row => row.status !== 'completed') ? ' · incomplete sets' : ''}`);
    }
    if (value.selected) {
      append(`${value.seed}:selected`, `Selected ${changes(value.selected.scores)} · testing on new seeds, from both seats.`);
      const rows = value.trials.filter(row => row.phase === 'evaluation' && row.opponentGroup === 'active' && !row.control && row.status === 'completed');
      if (rows.length && (rows.length % 8 === 0 || value.evaluation)) {
        const points = rows.reduce((sum, row) => sum + (row.winner === 'draw' ? .5 : row.winner === (row.candidateSeat === 0 ? 'player' : 'opponent') ? 1 : 0), 0);
        append(`${value.seed}:held:${rows.length}`, `Held-out vs active · ${(100 * points / rows.length).toFixed(1)}% score · ${rows.length}/32 sets${rows.length < 32 ? ' · partial' : ''}`);
      }
    }
    if (value.evaluation) {
      const rows = value.trials.filter(row => row.phase === 'evaluation' && row.opponentGroup === 'frozen' && row.status === 'completed');
      if (rows.length === 64) {
        const score = (control: boolean) => rows.filter(row => !!row.control === control).reduce((sum, row) => sum + (row.winner === 'draw' ? .5 : row.winner === (row.candidateSeat === 0 ? 'player' : 'opponent') ? 1 : 0), 0) * 100 / 32;
        append(`${value.seed}:frozen`, `Frozen opponent · candidate ${score(false).toFixed(1)}% vs active ${score(true).toFixed(1)}% · 16 matched seed pairs`);
      }
    }
    if (value.status === 'approved' || value.status === 'rejected') append(`${value.seed}:result`, `${value.status === 'approved' ? 'PASSED evaluation' : 'REJECTED'} · ${value.evaluation?.reason ?? 'No eligible candidate'} · seed ${value.seed}`);
  }
  return {
    update(value: BulkStatus) {
      if (seed !== value.runSeed) { seed = value.runSeed;lines.length = 0;seen.clear();state = '';milestone = -1; }
      if (state !== value.state) { state = value.state;append(`state:${state}:${value.ticks}`, `${state === 'running' ? value.learning || value.contextual && !value.benchmark ? 'Training' : 'Benchmark' : state} · seed ${seed ?? 'unknown'}${value.error ? ` · ${value.error}` : ''}`); }
      if (value.learning) append('plan', 'Each experiment: 4 candidates × 8 search sets, then 96 held-out sets. Only passing changes are saved.');
      for (const completed of value.experiments?.recent ?? []) experiment(completed);
      for (const pending of value.experiments?.pending ?? []) experiment(pending.learning);
      if (value.learning) experiment(value.learning);
      if (!value.learning && Math.floor(value.fights / 25) > milestone) {
        milestone = Math.floor(value.fights / 25);
        if (value.fights) append(`sets:${milestone}`, `${value.fights} sets · P1 ${value.p1Wins} / P2 ${value.p2Wins} / draws ${value.draws} · ${value.contextual && !value.benchmark ? `${value.contextual.informative} informative sets ingested` : 'stored lessons unchanged'}`);
      }
      if (value.capped) append(`caps:${value.capped}`, `${value.capped} sets hit the simulation limit; excluded from win scores.`);
      for (const finding of tacticalFindings(value).findings.filter(row => row.effectiveSamples >= 4).slice(0, 2)) {
        const stage = Math.floor(finding.confidence / .2);
        append(`finding:${finding.id}:${finding.direction}:${stage}`, finding.description);
      }
      return lines.join('\n\n');
    },
  };
}
