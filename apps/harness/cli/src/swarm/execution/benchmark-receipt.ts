import { z } from 'zod';
import { compareBenchmarkCandidate, environmentNoise, latencyRegressesBeyond, type BenchmarkCorrectness, type BenchmarkPair } from '@hyperfocus/performance/swarm';

const observation = z.number().finite().nonnegative().nullable();
const samples = z.array(z.number().finite().positive()).min(10).max(1000000);
const trialSchema = z.object({
  samples, scenario: z.string().min(1), workloadHash: z.string().min(1), runtimeVersion: z.string().min(1), cpuModel: z.string().min(1), platform: z.string().min(1), architecture: z.string().min(1),
  warmupMs: z.number().finite().positive(), durationMs: z.number().finite().positive(),
  memory: z.object({ rssBytes: observation, heapBytes: observation, allocatedBytes: observation.optional() }).passthrough(),
  gc: z.object({ count: observation, durationMs: observation }).passthrough().optional(),
  stages: z.object({ totalCpu: samples }).passthrough().optional(),
  structural: z.object({ finalStateHash: z.string().regex(/^[a-f0-9]{64}$/), entityCounts: z.array(z.number().int().nonnegative()), commandCounts: z.array(z.number().int().nonnegative()) }).passthrough().optional(),
}).passthrough();
export type BenchmarkTrial = z.infer<typeof trialSchema>;

/** Foreign sandbox stdout is evidence only after bounds and shape validation. */
export function parseBenchmarkTrial(options: { value: unknown; requireCpuEvidence?: boolean }) {
  const trial = trialSchema.parse(options.value);
  if (options.requireCpuEvidence && (!trial.structural || !trial.stages)) throw new Error('CPU preparation receipt needs deterministic state, work counts and total CPU samples.');
  if (trial.stages && trial.stages.totalCpu.length !== trial.samples.length) throw new Error('Total CPU and primary samples must describe the same frames.');
  if (trial.structural && (trial.structural.entityCounts.length !== trial.samples.length || trial.structural.commandCounts.length !== trial.samples.length)) throw new Error('Structural evidence must describe every measured frame.');
  return trial;
}

export function compareBenchmarkReceipts(options: {
  baselineRevision: string; candidateRevision: string; correctness: BenchmarkCorrectness;
  pairs: BenchmarkPair[]; receipts: ReadonlyMap<string, BenchmarkTrial>; requireCpuEvidence?: boolean;
}) {
  const trials = options.pairs.flatMap(pair => [options.receipts.get(pair.baseline.id), options.receipts.get(pair.candidate.id)]);
  const blockers = [...options.correctness.blockers];
  if (trials.some(trial => !trial)) blockers.push('A raw benchmark receipt is missing.');
  const baseline = options.receipts.get(options.pairs[0]?.baseline.id ?? '');
  if (options.requireCpuEvidence || trials.some(trial => trial?.structural)) {
    for (const trial of trials) {
      if (!baseline?.structural || !trial?.structural) { blockers.push('Deterministic structural evidence is incomplete.'); continue; }
      if (trial.structural.finalStateHash !== baseline.structural.finalStateHash) blockers.push('Gameplay checkpoint differs across baseline/candidate or repeated trials.');
      if (JSON.stringify(trial.structural.entityCounts) !== JSON.stringify(baseline.structural.entityCounts) || JSON.stringify(trial.structural.commandCounts) !== JSON.stringify(baseline.structural.commandCounts)) {
        blockers.push('Measured entity/command workload changed; this CPU scenario requires preserved structural output.');
      }
    }
  }
  const totalPairs: BenchmarkPair[] = [];
  for (const pair of options.pairs) {
    const a = options.receipts.get(pair.baseline.id)?.stages?.totalCpu, b = options.receipts.get(pair.candidate.id)?.stages?.totalCpu;
    if (a && b) totalPairs.push({ baseline: { ...pair.baseline, id: `${pair.baseline.id}:total-cpu`, metric: 'total-cpu-ms', samples: a }, candidate: { ...pair.candidate, id: `${pair.candidate.id}:total-cpu`, metric: 'total-cpu-ms', samples: b } });
  }
  if (options.requireCpuEvidence && totalPairs.length !== options.pairs.length) blockers.push('Total CPU regression evidence is incomplete.');
  const correctness = { ...options.correctness, blockers: [...new Set(blockers)] };
  const primary = compareBenchmarkCandidate({ ...options, correctness });
  const totalCpu = totalPairs.length === options.pairs.length && totalPairs.length ? compareBenchmarkCandidate({ ...options, pairs: totalPairs, correctness }) : null;
  const regressionReasons: string[] = [];
  let decision = primary.decision;
  const cpuEffects = [totalCpu?.effect, totalCpu?.tailEffect, totalCpu?.p99TailEffect];
  if (cpuEffects.some(effect => effect && latencyRegressesBeyond(effect.lower95Percent, 5))) {
    const demonstrated = cpuEffects.some(effect => effect && latencyRegressesBeyond(effect.upper95Percent, 5));
    regressionReasons.push(demonstrated ? 'Total CPU or its p95/p99 materially regresses despite the primary metric.' : 'Total CPU uncertainty does not exclude a material regression.');
    if (decision === 'IMPROVED') decision = demonstrated ? 'NO_IMPROVEMENT' : environmentNoise;
  }
  if (totalCpu?.decision === environmentNoise && decision === 'IMPROVED') {
    decision = environmentNoise; regressionReasons.push('Total CPU environment qualification is inconclusive.');
  }
  return { ...primary, decision, reasons: [...primary.reasons, ...regressionReasons], totalCpu };
}
