import { createCombatAiPolicy, readCombatAiPolicy, type CombatAiPolicy } from '@hyperfocus/engine/project/runtime-3d';

export type PolicyTrial = {
  id: string; seed: number; phase: 'training' | 'evaluation'; candidateSeat: 0 | 1;
  policies: [CombatAiPolicy | undefined, CombatAiPolicy | undefined];
  candidateId: string; opponentId: string; opponentGroup: 'active' | 'frozen'; control: boolean;
};
export type PolicyResult = { id: string; status: 'completed' | 'capped'; winner?: 'player' | 'opponent' | 'draw'; ticks: number };
export type PolicyEvidence = PolicyTrial & PolicyResult;

export function copyPolicy(policy: unknown) { return readCombatAiPolicy(policy); }

/** Two coordinates, both directions. Candidate selection never sees held-out outcomes. */
export function policyCandidates(seed: number, active: CombatAiPolicy | undefined) {
  const coordinates = ['attack:jab', 'attack:heavy', 'approach', 'sprint', 'dash', 'flank', 'space', 'grapple'];
  let fingerprint = 2166136261;
  for (const char of JSON.stringify(active ?? null)) fingerprint = Math.imul(fingerprint ^ char.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: 4 }, (_, index) => {
    const scores = { ...active?.scores };
    const available = Object.keys(scores).length === 64 ? Object.keys(scores).sort() : coordinates;
    const key = available[(seed + Math.floor(index / 2)) % available.length]!;
    const delta = index % 2 === 0 ? 0.35 : -0.35;
    scores[key] = Math.max(-2, Math.min(2, (scores[key] ?? 0) + delta));
    return createCombatAiPolicy({ id: `learn-${seed}-${fingerprint}-${index}`, scores });
  });
}

export function trialPairs(options: {
  seed: number; offset: number; pairs: number; phase: PolicyTrial['phase'];
  candidate: CombatAiPolicy | undefined; opponent: CombatAiPolicy | undefined;
  opponentGroup: PolicyTrial['opponentGroup']; control?: boolean;
}): PolicyTrial[] {
  const { seed, offset, pairs, phase, candidate, opponent, opponentGroup, control = false } = options;
  const result: PolicyTrial[] = [];
  for (let pair = 0; pair < pairs; pair++) for (const candidateSeat of [0, 1] as const) {
    const trialSeed = (seed + offset + pair) >>> 0;
    result.push({ id: `${phase}-${candidate?.id ?? 'default'}-${opponentGroup}-${control ? 'control' : 'candidate'}-${pair}-${candidateSeat}`,
      seed: trialSeed, phase, candidateSeat, candidateId: candidate?.id ?? 'default', opponentId: opponent?.id ?? 'default', opponentGroup, control,
      policies: candidateSeat === 0 ? [copyPolicy(candidate), copyPolicy(opponent)] : [copyPolicy(opponent), copyPolicy(candidate)] });
  }
  return result;
}

export function winScore(trial: PolicyEvidence) {
  if (trial.status !== 'completed') return undefined;
  if (trial.winner === 'draw') return 0.5;
  return trial.winner === (trial.candidateSeat === 0 ? 'player' : 'opponent') ? 1 : 0;
}

function signProbability(positive: number, negative: number) {
  const count = positive + negative;
  if (!count) return 1;
  let coefficient = 1, probability = 0;
  for (let index = 0; index <= count; index++) {
    if (index >= positive) probability += coefficient / 2 ** count;
    coefficient = coefficient * (count - index) / (index + 1);
  }
  return probability;
}

/** Seats share randomness; the independent sign-test unit is a complete seed pair. */
export function evaluatePolicy(trials: PolicyEvidence[]) {
  const rows = trials.filter(trial => trial.phase === 'evaluation');
  const groups = (['active', 'frozen'] as const).map(opponentGroup => {
    const candidate = rows.filter(trial => trial.opponentGroup === opponentGroup && !trial.control);
    const controls = rows.filter(trial => trial.opponentGroup === opponentGroup && trial.control);
    let positive = 0, negative = 0, tied = 0, improvement = 0;
    for (let index = 0; index < candidate.length; index += 2) {
      const pair = candidate.slice(index, index + 2);
      const score = pair.reduce((sum, trial) => sum + (winScore(trial) ?? 0), 0);
      const control = opponentGroup === 'active' ? 1 : controls.filter(trial => trial.seed === pair[0]?.seed).reduce((sum, trial) => sum + (winScore(trial) ?? 0), 0);
      const difference = score - control; improvement += difference;
      if (difference > 0) positive++; else if (difference < 0) negative++; else tied++;
    }
    return { opponentGroup, positive, negative, tied, improvement, probability: signProbability(positive, negative) };
  });
  const complete = rows.length === 96 && rows.every(row => row.status === 'completed');
  const approved = complete && groups.every(group => group.opponentGroup === 'active'
    ? group.improvement > 0 && group.probability <= 0.025 : group.improvement >= 0);
  return { complete, approved, groups, reason: !complete ? 'Incomplete or capped evaluation.' : approved ? 'Passed both held-out paired comparisons.' : 'Insufficient held-out improvement.' };
}
