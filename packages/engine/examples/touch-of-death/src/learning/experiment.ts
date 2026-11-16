import { type CombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import { copyPolicy, evaluatePolicy, policyCandidates, trialPairs, winScore, type PolicyEvidence, type PolicyResult } from './trials.ts';

export function createPolicyExperiment(options: { seed: number; active?: CombatAiPolicy; previous?: CombatAiPolicy }) {
  const { seed } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Invalid policy experiment seed.');
  const active = copyPolicy(options.active), previous = copyPolicy(options.previous);
  const candidates = policyCandidates(seed, active);
  const trials: PolicyEvidence[] = [];
  let status: 'training' | 'evaluation' | 'approved' | 'rejected' = 'training';
  let selected: CombatAiPolicy | undefined;
  let evaluation: ReturnType<typeof evaluatePolicy> | undefined;
  let queue = candidates.flatMap(candidate => trialPairs({ seed, offset: 0, pairs: 4, phase: 'training', candidate, opponent: active, opponentGroup: 'active' }));

  function beginEvaluation() {
    let bestScore = -1;
    for (const candidate of candidates) {
      const matches = trials.filter(trial => trial.candidateId === candidate.id);
      if (matches.length !== 8 || matches.some(trial => trial.status !== 'completed')) continue;
      const score = matches.reduce((sum, trial) => sum + (winScore(trial) ?? 0), 0);
      if (score > bestScore) { bestScore = score; selected = candidate; }
    }
    if (!selected) { status = 'rejected'; return; }
    status = 'evaluation';
    const held = { seed, pairs: 16, phase: 'evaluation' as const };
    queue = [
      ...trialPairs({ ...held, offset: 1024, candidate: selected, opponent: active, opponentGroup: 'active' }),
      ...trialPairs({ ...held, offset: 2048, candidate: selected, opponent: previous, opponentGroup: 'frozen' }),
      ...trialPairs({ ...held, offset: 2048, candidate: active, opponent: previous, opponentGroup: 'frozen', control: true }),
    ];
  }

  return {
    next() { return queue[0] ? structuredClone(queue[0]) : undefined; },
    pendingTrials() { return structuredClone(queue); },
    record(result: PolicyResult) {
      const pending = queue[0];
      if (!pending || result.id !== pending.id) throw Error('Policy trial is unknown, duplicated or out of order.');
      if (!['completed', 'capped'].includes(result.status) || !Number.isSafeInteger(result.ticks) || result.ticks < 1
        || result.status === 'completed' && !['player', 'opponent', 'draw'].includes(result.winner ?? '')
        || result.status === 'capped' && result.winner !== undefined) throw Error('Invalid policy trial result.');
      trials.push({ ...pending, status: result.status, winner: result.winner, ticks: result.ticks }); queue.shift();
      if (!queue.length && status === 'training') beginEvaluation();
      else if (!queue.length && status === 'evaluation') { evaluation = evaluatePolicy(trials); status = evaluation.approved ? 'approved' : 'rejected'; }
    },
    snapshot() {
      const evidence = trials.map(({ policies: _policies, ...trial }) => trial);
      return structuredClone({ version: 1 as const, seed, status, active, previous, candidates, selected, trials: evidence, evaluation,
        approved: status === 'approved' ? selected : undefined, totalTrials: 128 });
    },
  };
}

export type PolicyExperimentSnapshot = ReturnType<ReturnType<typeof createPolicyExperiment>['snapshot']>;

/** Recompute scheduling, selection and acceptance; never trust an imported promotion flag. */
export function readPolicyExperiment(value: unknown) {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('seed' in value) || typeof value.seed !== 'number' || !('trials' in value) || !Array.isArray(value.trials)
    || value.trials.length > 128) throw Error('Invalid policy experiment evidence.');
  const active = 'active' in value ? copyPolicy(value.active) : undefined;
  const previous = 'previous' in value ? copyPolicy(value.previous) : undefined;
  const experiment = createPolicyExperiment({ seed: value.seed, active, previous });
  for (const row of value.trials) {
    const pending = experiment.next();
    if (!row || !pending || row.id !== pending.id || row.seed !== pending.seed || row.candidateSeat !== pending.candidateSeat
      || row.candidateId !== pending.candidateId || row.opponentId !== pending.opponentId || row.control !== pending.control
      || row.phase !== pending.phase || row.opponentGroup !== pending.opponentGroup) throw Error('Policy evidence does not match the experiment.');
    experiment.record({ id: row.id, status: row.status, winner: row.winner, ticks: row.ticks });
  }
  return experiment.snapshot();
}
