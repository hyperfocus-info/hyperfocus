import { expect, test } from 'bun:test';
import { createCombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';
import { createPolicyExperiment, readPolicyExperiment } from './experiment.ts';
import type { PolicyTrial } from './trials.ts';

export function runObjective(options: { seed?: number; active?: ReturnType<typeof createCombatAiPolicy>; outcome?: (trial: PolicyTrial) => 'player' | 'opponent' | 'draw' | undefined } = {}) {
  const experiment = createPolicyExperiment({ seed: options.seed ?? 123, active: options.active });
  let trial;
  while ((trial = experiment.next())) {
    const scores = trial.policies.map(policy => Object.values(policy?.scores ?? {}).reduce((sum, value) => sum + value, 0));
    const winner = options.outcome ? options.outcome(trial) : scores[0]! > scores[1]! ? 'player' : scores[0]! < scores[1]! ? 'opponent' : 'draw';
    experiment.record({ id: trial.id, status: winner ? 'completed' : 'capped', winner, ticks: 100 });
  }
  return experiment.snapshot();
}

test('bounded coordinate search improves a synthetic objective and passes disjoint held-out seat pairs', () => {
  const result = runObjective();
  expect(result.status).toBe('approved');
  expect(result.trials).toHaveLength(128);
  expect(Object.values(result.approved?.scores ?? {})).toContain(0.35);
  expect(result.active).toBeUndefined();
  expect(result.evaluation?.groups.every(group => group.probability < 0.025)).toBe(true);
  const training = new Set(result.trials.filter(trial => trial.phase === 'training').map(trial => trial.seed));
  expect(result.trials.filter(trial => trial.phase === 'evaluation').every(trial => !training.has(trial.seed))).toBe(true);
  for (const trial of result.trials.filter(trial => trial.control)) {
    expect(result.trials.some(other => !other.control && other.opponentGroup === 'frozen' && other.seed === trial.seed && other.candidateSeat === trial.candidateSeat)).toBe(true);
  }
  expect(JSON.stringify(result).length).toBeLessThan(60000);
  expect(readPolicyExperiment(JSON.parse(JSON.stringify(result)))).toEqual(result);
  expect(runObjective()).toEqual(result);
});

test('ties, capped evaluation and frozen-opponent regressions cannot promote', () => {
  expect(runObjective({ outcome: () => 'draw' }).status).toBe('rejected');
  expect(runObjective({ outcome: trial => trial.phase === 'evaluation' ? undefined : 'player' }).status).toBe('rejected');
  const regression = runObjective({ outcome: trial => {
    const wins = trial.opponentGroup === 'active' || trial.control;
    return wins === (trial.candidateSeat === 0) ? 'player' : 'opponent';
  } });
  expect(regression.evaluation?.groups[0]?.improvement).toBeGreaterThan(0);
  expect(regression.evaluation?.groups[1]?.improvement).toBeLessThan(0);
  expect(regression.status).toBe('rejected');
});

test('capped training excludes whole candidate and no complete candidate ends without evaluation', () => {
  const result = runObjective({ outcome: () => undefined });
  expect(result.status).toBe('rejected');
  expect(result.trials).toHaveLength(32);
  expect(result.selected).toBeUndefined();
});

test('trial results reject duplicates, wrong IDs and malformed completion without consuming pending work', () => {
  const experiment = createPolicyExperiment({ seed: 0xffffffff });
  const first = experiment.next()!;
  expect(() => experiment.record({ id: 'unknown', status: 'completed', winner: 'player', ticks: 1 })).toThrow();
  expect(() => experiment.record({ id: first.id, status: 'completed', ticks: 1 })).toThrow();
  expect(() => experiment.record({ id: first.id, status: 'capped', winner: 'draw', ticks: 1 })).toThrow();
  expect(experiment.next()).toEqual(first);
  experiment.record({ id: first.id, status: 'completed', winner: 'draw', ticks: 1 });
  expect(() => experiment.record({ id: first.id, status: 'completed', winner: 'draw', ticks: 1 })).toThrow();
  expect(experiment.snapshot().trials).toHaveLength(1);
});

test('evidence validates seeds and reconstructs promotion instead of trusting flags', () => {
  const result = runObjective();
  result.trials[0]!.seed++;
  expect(() => readPolicyExperiment(result)).toThrow();
  const rejected = runObjective({ outcome: () => 'draw' });
  expect(readPolicyExperiment({ ...rejected, status: 'approved', approved: createCombatAiPolicy({ id: 'forged', scores: { approach: 2 } }) }).status).toBe('rejected');
});

test('snapshots and returned trials do not permit mutation of pending policies', () => {
  const active = createCombatAiPolicy({ id: 'initial', scores: { approach: 0.2 } });
  const experiment = createPolicyExperiment({ seed: 0, active });
  const pending = experiment.next()!;
  pending.policies[0]!.scores.approach = 2;
  active.scores.approach = -2;
  expect(experiment.next()?.policies[0]?.scores.approach).toBe(0.2);
  expect(experiment.snapshot().active?.scores.approach).toBe(0.2);
});

test('continued search preserves the policy coordinate budget and finite score bounds', () => {
  const scores = Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`attack:move-${index}`, index % 2 ? -2 : 2]));
  const active = createCombatAiPolicy({ id: 'full-policy', scores });
  const result = createPolicyExperiment({ seed: 0xffffffff, active }).snapshot();
  for (const candidate of result.candidates) {
    expect(Object.keys(candidate.scores)).toHaveLength(64);
    expect(Object.values(candidate.scores).every(value => Number.isFinite(value) && value >= -2 && value <= 2)).toBe(true);
  }
  expect(active.scores).toEqual(scores);
});

test('uint32 seed wrap preserves disjoint evaluation sets and swaps policy artifacts between seats', () => {
  const experiment = createPolicyExperiment({ seed: 0xfffffffe });
  let trial, prior: PolicyTrial | undefined;
  while ((trial = experiment.next())) {
    if (trial.candidateSeat === 1) {
      expect(prior).toBeDefined();expect(trial.seed).toBe(prior!.seed);
      expect(trial.policies).toEqual([prior?.policies[1], prior?.policies[0]]);
    }
    prior = trial;
    experiment.record({ id: trial.id, status: 'completed', winner: 'draw', ticks: 1 });
  }
  const rows = experiment.snapshot().trials;
  const training = new Set(rows.filter(row => row.phase === 'training').map(row => row.seed));
  const active = new Set(rows.filter(row => row.phase === 'evaluation' && row.opponentGroup === 'active').map(row => row.seed));
  const frozen = new Set(rows.filter(row => row.opponentGroup === 'frozen').map(row => row.seed));
  expect([...training]).toEqual([0xfffffffe, 0xffffffff, 0, 1]);
  expect(active.size).toBe(16);expect(frozen.size).toBe(16);
  expect([...active, ...frozen].every(seed => !training.has(seed))).toBe(true);
  expect([...frozen].every(seed => !active.has(seed))).toBe(true);
});

test('held-out outcomes cannot change training selection or approve an unfinished final pair', () => {
  const experiment = createPolicyExperiment({ seed: 123 });
  while (experiment.snapshot().trials.length < 32) {
    const trial = experiment.next()!;
    experiment.record({ id: trial.id, status: 'completed', winner: 'draw', ticks: 1 });
  }
  const selected = experiment.snapshot().selected;
  while (experiment.snapshot().trials.length < 127) {
    const trial = experiment.next()!;
    experiment.record({ id: trial.id, status: 'completed', winner: trial.candidateSeat === 0 ? 'player' : 'opponent', ticks: 1 });
  }
  expect(experiment.snapshot().status).toBe('evaluation');expect(experiment.snapshot().approved).toBeUndefined();
  expect(readPolicyExperiment({ ...experiment.snapshot(), status: 'approved', approved: selected }).approved).toBeUndefined();
  const final = experiment.next()!;
  experiment.record({ id: final.id, status: 'capped', ticks: 1 });
  expect(experiment.snapshot().status).toBe('rejected');expect(experiment.snapshot().selected).toEqual(selected);
});

test('interaction counts and interrupted combos never enter the match-outcome objective', () => {
  for (const result of [runObjective(), runObjective({ outcome: () => 'draw' })]) {
    const noisy = { ...result, trials: result.trials.map(row => ({ ...row,
      attackStarts: 1e9, damageDealt: 1e9, chainsCompleted: 1e9, chainsBroken: 1e9,
      samples: [{ end: 'interrupted', avoidable: false }], reward: 1e9 })) };
    expect(readPolicyExperiment(noisy)).toEqual(result);
  }
});
