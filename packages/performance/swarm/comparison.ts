import type { BenchmarkCorrectness, BenchmarkMeasurement, BenchmarkPair } from './contracts';
import { latencyRegressesBeyond, pairedEffect, sampleDistribution } from './statistics';

export const environmentNoise = 'INCONCLUSIVE — ENVIRONMENT NOISE' as const;

export function compareBenchmarkCandidate(options: {
  baselineRevision: string;
  candidateRevision: string;
  correctness: BenchmarkCorrectness;
  pairs: readonly BenchmarkPair[];
  policy?: { minimumPairs?: number; minimumSessions?: number; minimumEffectPercent?: number; maximumControlSpreadPercent?: number; maximumTailRegressionPercent?: number };
}) {
  const policy = { minimumPairs: 8, minimumSessions: 2, minimumEffectPercent: 5, maximumControlSpreadPercent: 5, maximumTailRegressionPercent: 5, ...options.policy };
  if (!Number.isSafeInteger(policy.minimumPairs) || policy.minimumPairs < 4 || !Number.isSafeInteger(policy.minimumSessions) || policy.minimumSessions < 1 ||
    [policy.minimumEffectPercent, policy.maximumControlSpreadPercent, policy.maximumTailRegressionPercent].some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Invalid benchmark qualification policy.');
  }
  const reasons: string[] = [], trials = options.pairs.map(pair => ({ baseline: sampleDistribution(pair.baseline.samples), candidate: sampleDistribution(pair.candidate.samples) }));
  const controls = trials.map(pair => pair.baseline.median), candidates = trials.map(pair => pair.candidate.median);
  const effect = options.pairs.length >= 2 ? pairedEffect({ pairs: trials.map(pair => ({ baseline: pair.baseline.median, candidate: pair.candidate.median })), higherIsBetter: options.pairs[0]!.baseline.higherIsBetter }) : null;
  const controlSpreadPercent = controls.length ? sampleDistribution(controls).relativeSpreadPercent : null;
  const candidateSpreadPercent = candidates.length ? sampleDistribution(candidates).relativeSpreadPercent : null;
  const reference = options.pairs[0]?.baseline, ids = new Set<string>();
  for (const pair of options.pairs) {
    if (pair.baseline.sourceRevision !== options.baselineRevision || pair.candidate.sourceRevision !== options.candidateRevision) reasons.push('Source revision does not match the declared comparison.');
    if (pair.baseline.sessionId !== pair.candidate.sessionId) reasons.push('Pair crosses measurement sessions.');
    for (const measurement of [pair.baseline, pair.candidate]) {
      if (ids.has(measurement.id)) reasons.push('Duplicate measurement identity.');
      ids.add(measurement.id);
      reasons.push(...qualification(measurement));
      if (reference && !comparable(reference, measurement)) reasons.push('Workload policy, metric, worker or runtime context differs.');
    }
  }
  if (options.pairs.length < policy.minimumPairs) reasons.push(`At least ${policy.minimumPairs} independent pairs required.`);
  if (new Set(options.pairs.map(pair => pair.baseline.sessionId)).size < policy.minimumSessions) reasons.push(`At least ${policy.minimumSessions} independent sessions required.`);
  if (controlSpreadPercent !== null && controlSpreadPercent > policy.maximumControlSpreadPercent) reasons.push('Baseline drift exceeds the predeclared noise allowance.');
  const tailEffects = (['p95', 'p99'] as const).map(percentile => {
    if (reference?.higherIsBetter !== false) return null;
    const tails = trials.flatMap(pair => {
      const baseline = pair.baseline[percentile], candidate = pair.candidate[percentile];
      return baseline === null || candidate === null ? [] : [{ baseline, candidate }];
    });
    const required = percentile === 'p95' || trials.some(pair => pair.baseline[percentile] !== null || pair.candidate[percentile] !== null);
    if (required && tails.length !== trials.length) reasons.push(`Complete ${percentile} evidence is required in every baseline and candidate trial.`);
    const effect = tails.length === trials.length && tails.length >= 2 ? pairedEffect({ pairs: tails, higherIsBetter: false }) : null;
    if (effect && latencyRegressesBeyond(effect.improvementPercent, policy.maximumTailRegressionPercent)) reasons.push(`Candidate ${percentile} regresses beyond the predeclared allowance.`);
    return effect;
  });
  const rejected = !options.correctness.passed || options.correctness.blockers.length > 0 || options.correctness.artifactIds.length === 0;
  if (rejected) reasons.push(...options.correctness.blockers, 'Correctness and regression evidence is required before promotion.');
  const significantRegression = tailEffects.some(effect => effect !== null && latencyRegressesBeyond(effect.improvementPercent, policy.maximumTailRegressionPercent));
  const qualified = reasons.length === 0;
  const decision = rejected ? 'REJECTED_CORRECTNESS' as const : !qualified && !significantRegression ? environmentNoise
    : significantRegression ? 'NO_IMPROVEMENT' as const : effect && effect.lower95Percent >= policy.minimumEffectPercent ? 'IMPROVED' as const
    : effect && effect.upper95Percent <= policy.minimumEffectPercent ? 'NO_IMPROVEMENT' as const : environmentNoise;
  if (!reasons.length && decision === environmentNoise) reasons.push('Uncertainty includes effects below the predeclared useful improvement.');
  return { decision, reasons: [...new Set(reasons)], effect, controlSpreadPercent, candidateSpreadPercent, tailEffect: tailEffects[0] ?? null, p99TailEffect: tailEffects[1] ?? null, trials, policy,
    hardwareIsolation: reference?.environment.hardwareIsolation ?? 'unknown', physicalCpuExclusivityGuaranteed: reference?.environment.hardwareIsolation === 'dedicated' };
}

function qualification(measurement: BenchmarkMeasurement) {
  const reasons: string[] = [];
  if (!measurement.id || !measurement.sessionId || !measurement.workloadHash || !measurement.metric || !measurement.scenario || !measurement.unit || !measurement.artifactIds.length) reasons.push('Measurement identity, workload and immutable raw artifacts are required.');
  if (!Number.isFinite(measurement.warmupMs) || measurement.warmupMs <= 0 || !Number.isFinite(measurement.durationMs) || measurement.durationMs <= 0) reasons.push('Warmup and duration must be recorded.');
  if (!measurement.environment.cpu || measurement.environment.cpu === 'unknown' || !measurement.environment.runtime || !measurement.environment.fingerprint) reasons.push('CPU/runtime environment is incomplete.');
  if (measurement.environment.activeSwarmWorkloads !== 0 || !measurement.environment.workerId || !Number.isSafeInteger(measurement.environment.leaseFence) || measurement.environment.leaseFence < 1) reasons.push('Exclusive measurement-worker lease was not demonstrated.');
  for (const value of Object.values(measurement.memory)) if (value !== null && (!Number.isFinite(value) || value < 0)) reasons.push('Memory/GC observations must be nonnegative finite values or null when unavailable.');
  return reasons;
}

function comparable(a: BenchmarkMeasurement, b: BenchmarkMeasurement) {
  return a.scenario === b.scenario && a.workloadHash === b.workloadHash && a.metric === b.metric && a.unit === b.unit && a.higherIsBetter === b.higherIsBetter &&
    // Fixed-operation workloads have varying elapsed durations. The workload
    // hash includes planned warmup/sample conditions; observed wall time does not.
    a.environment.workerId === b.environment.workerId &&
    a.environment.leaseFence === b.environment.leaseFence && a.environment.cpu === b.environment.cpu && a.environment.runtime === b.environment.runtime &&
    a.environment.browser === b.environment.browser && a.environment.fingerprint === b.environment.fingerprint && a.environment.hardwareIsolation === b.environment.hardwareIsolation;
}

export function selectBenchmarkWinner(options: { candidates: readonly { id: string; comparison: ReturnType<typeof compareBenchmarkCandidate> }[] }) {
  const ranked = options.candidates.filter(candidate => candidate.comparison.decision === 'IMPROVED').sort((a, b) => b.comparison.effect!.improvementPercent - a.comparison.effect!.improvementPercent);
  const best = ranked[0];
  if (!best) return { winnerId: null, reason: 'No correctness-qualified candidate demonstrates a useful improvement.' };
  // Comparison against a common control cannot confidently order overlapping effects.
  if (ranked.slice(1).some(candidate => candidate.comparison.effect!.upper95Percent >= best.comparison.effect!.lower95Percent)) {
    return { winnerId: null, reason: 'Improved candidates have overlapping uncertainty; direct paired comparison is required.' };
  }
  return { winnerId: best.id, reason: 'Qualified improvement; separated from the other candidate intervals. Human integration approval remains required.' };
}
