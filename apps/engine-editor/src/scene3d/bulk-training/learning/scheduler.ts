import { createPolicyExperiment, type PolicyExperimentSnapshot } from '@hyperfocus/touch-of-death/learning/experiment';
import type { PolicyResult } from '@hyperfocus/touch-of-death/learning/trials';

/** Execute within a phase in any order, but replay results in the original v1 order. */
export function createPolicyScheduler(options: Parameters<typeof createPolicyExperiment>[0]) {
  const experiment = createPolicyExperiment(options);
  let phase = experiment.pendingTrials();
  const assigned = new Set<string>(), results = new Map<string, PolicyResult>();
  let snapshot = experiment.snapshot();
  return {
    take() {
      const next = phase.find(trial => !assigned.has(trial.id) && !results.has(trial.id));
      if (!next) return undefined;
      assigned.add(next.id); return structuredClone(next);
    },
    release(id: string) { return assigned.delete(id); },
    record(result: PolicyResult) {
      if (!assigned.has(result.id) || results.has(result.id)) throw Error('Policy trial result is unknown or duplicated.');
      if (!['completed', 'capped'].includes(result.status) || !Number.isSafeInteger(result.ticks) || result.ticks < 1
        || result.status === 'completed' && !['player', 'opponent', 'draw'].includes(result.winner ?? '')
        || result.status === 'capped' && result.winner !== undefined) throw Error('Invalid policy trial result.');
      assigned.delete(result.id); results.set(result.id, structuredClone(result));
      const committed: string[] = [];
      let next = experiment.next();
      while (next && results.has(next.id)) {
        experiment.record(results.get(next.id)!); results.delete(next.id); committed.push(next.id);
        phase = phase.filter(trial => trial.id !== next!.id);
        next = experiment.next();
      }
      // Selection depends on every training result; never expose the next phase early.
      if (!phase.length) phase = experiment.pendingTrials();
      snapshot = experiment.snapshot();
      return committed;
    },
    snapshot() { return structuredClone(snapshot); },
    pendingResults(): PolicyExperimentSnapshot['trials'] {
      return phase.flatMap(({ policies: _policies, ...trial }) => {
        const result = results.get(trial.id);
        return result ? [{ ...trial, ...structuredClone(result) }] : [];
      });
    },
    get done() { return snapshot.status === 'approved' || snapshot.status === 'rejected'; },
  };
}

/** Inspect buffered completions without committing them or changing approval evidence. */
export function readPendingTrialResults(options: { learning: PolicyExperimentSnapshot; value: unknown }): PolicyExperimentSnapshot['trials'] {
  if (!Array.isArray(options.value) || options.value.length > 96) throw Error('Invalid pending policy results.');
  const experiment = createPolicyExperiment(options.learning);
  for (const trial of options.learning.trials) experiment.record(trial);
  const pending = experiment.pendingTrials(), results = new Map<string, PolicyResult>();
  for (const row of options.value) {
    if (!row || typeof row !== 'object') throw Error('Invalid pending policy result.');
    const trial = pending.find(trial => trial.id === row.id);
    if (!trial || results.has(row.id)
      || (['seed', 'phase', 'candidateSeat', 'candidateId', 'opponentId', 'opponentGroup', 'control'] as const).some(key => row[key] !== trial[key])
      || !['completed', 'capped'].includes(row.status) || !Number.isSafeInteger(row.ticks) || row.ticks < 1
      || row.status === 'completed' && !['player', 'opponent', 'draw'].includes(row.winner)
      || row.status === 'capped' && row.winner !== undefined) throw Error('Invalid pending policy result.');
    results.set(row.id, { id: row.id, status: row.status, winner: row.winner, ticks: row.ticks });
  }
  return pending.flatMap(({ policies: _policies, ...trial }) => {
    const result = results.get(trial.id);
    return result ? [{ ...trial, ...result }] : [];
  });
}
