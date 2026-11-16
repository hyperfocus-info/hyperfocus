import { expect, test } from 'bun:test';
import { compareBenchmarkCandidate, environmentNoise, selectBenchmarkWinner } from './comparison';
import { pairedMeasurements } from './fixtures';
import { sampleDistribution } from './statistics';
import type { BenchmarkMeasurement } from './contracts';

const correctness = { passed: true, artifactIds: ['correctness-report'], blockers: [] };
const compare = (pairs = pairedMeasurements()) => compareBenchmarkCandidate({ baselineRevision: 'baseline', candidateRevision: 'candidate', correctness, pairs });

test('qualifies repeated paired effects without claiming physical CPU isolation', () => {
  const result = compare();
  expect(result.decision).toBe('IMPROVED');
  expect(result.effect?.improvementPercent).toBeCloseTo(25);
  expect(result.physicalCpuExclusivityGuaranteed).toBe(false);
  expect(result.trials[0]?.baseline.p99).toBe(10);
});

test('small or noisy effects cannot become winners', () => {
  expect(compare(pairedMeasurements({ candidate: 9.9 })).decision).toBe('NO_IMPROVEMENT');
  expect(compare(pairedMeasurements({ count: 4 })).decision).toBe(environmentNoise);
  const pairs = pairedMeasurements();
  pairs[0]!.baseline.samples.fill(14);
  expect(compare(pairs).decision).toBe(environmentNoise);
  expect(selectBenchmarkWinner({ candidates: [{ id: 'noisy', comparison: compare(pairs) }] }).winnerId).toBeNull();
});

test('correctness including exact image failure blocks even a large measured effect', () => {
  const result = compareBenchmarkCandidate({ baselineRevision: 'baseline', candidateRevision: 'candidate', pairs: pairedMeasurements({ candidate: 2 }),
    correctness: { passed: true, artifactIds: ['tests'], blockers: ['Same-version image repeatability failed.'] } });
  expect(result.decision).toBe('REJECTED_CORRECTNESS');
});

test('rejects mixed environments, duplicate evidence, contention and unknown metering', () => {
  for (const mutate of [
    (pairs: ReturnType<typeof pairedMeasurements>) => { pairs[0]!.candidate.environment.runtime = 'other'; },
    (pairs: ReturnType<typeof pairedMeasurements>) => { pairs[0]!.candidate.environment.activeSwarmWorkloads = 1; },
    (pairs: ReturnType<typeof pairedMeasurements>) => { pairs[0]!.candidate.id = pairs[0]!.baseline.id; },
    (pairs: ReturnType<typeof pairedMeasurements>) => { pairs[0]!.candidate.sourceRevision = 'stale'; },
    (pairs: ReturnType<typeof pairedMeasurements>) => { pairs[0]!.candidate.memory.gcMs = NaN; },
  ]) {
    const pairs = pairedMeasurements(); mutate(pairs);
    expect(compare(pairs).decision).toBe(environmentNoise);
  }
});

test('tail regression rejects a faster median and sparse samples do not invent percentiles', () => {
  const pairs = pairedMeasurements();
  for (const pair of pairs) pair.candidate.samples.fill(30, 90);
  expect(compare(pairs).decision).toBe('NO_IMPROVEMENT');
  expect(sampleDistribution([1, 2, 3]).p95).toBeNull();
  expect(sampleDistribution(Array(99).fill(1)).p99).toBeNull();
  expect(() => sampleDistribution([1, Infinity])).toThrow();
});

test.each([4.9, 5, 5.1])('tail allowance measures latency increase of %s percent, not inverse speedup', increase => {
  const pairs = pairedMeasurements();
  for (const pair of pairs) pair.candidate.samples.fill(10 * (1 + increase / 100), 90);
  const result = compare(pairs);
  expect(result.effect?.improvementPercent).toBeCloseTo(25);
  expect(result.decision).toBe(increase > 5 ? 'NO_IMPROVEMENT' : 'IMPROVED');
});

test('overlapping candidate intervals require direct comparison instead of a fabricated winner', () => {
  const result = compare();
  expect(selectBenchmarkWinner({ candidates: [{ id: 'a', comparison: result }, { id: 'b', comparison: result }] }).winnerId).toBeNull();
  expect(selectBenchmarkWinner({ candidates: [{ id: 'a', comparison: result }, { id: 'b', comparison: compare(pairedMeasurements({ candidate: 9 })) }] }).winnerId).toBe('a');
});

function variedPairs(sampleCount = 200, higherIsBetter = false) {
  return Array.from({ length: 12 }, (_, index) => {
    function trial(side: 'baseline' | 'candidate'): BenchmarkMeasurement {
      const value = 12 + index * 0.01, scale = side === 'baseline' ? 1 : higherIsBetter ? 1.25 : 0.8;
      return {
        id: `${side}-varied-${index}`, sessionId: `varied-session-${Math.floor(index / 4)}`, sourceRevision: side,
        scenario: 'variable-latency', workloadHash: 'varied-workload', metric: higherIsBetter ? 'throughput' : 'latency', unit: higherIsBetter ? 'ops/s' : 'ms', higherIsBetter,
        samples: Array.from({ length: sampleCount }, (_, sample) => (value + sample % 7 * 0.01) * scale), warmupMs: 1000, durationMs: 2000,
        environment: { workerId: 'varied-worker', leaseFence: 3, cpu: 'varied CPU', runtime: 'test runtime', browser: null, fingerprint: 'varied-environment', hardwareIsolation: 'shared', activeSwarmWorkloads: 0 },
        memory: { rssBytes: 4096, heapBytes: null, allocatedBytes: null, gcCount: null, gcMs: null }, artifactIds: [`receipt-${side}-${index}`],
      };
    }
    return { baseline: trial('baseline'), candidate: trial('candidate') };
  });
}

test('one missing baseline or candidate p95 blocks an otherwise stable winner', () => {
  for (const side of ['baseline', 'candidate'] as const) {
    const pairs = variedPairs();
    pairs[5]![side].samples.length = 19;
    const result = compare(pairs);
    expect(result.effect?.lower95Percent).toBeGreaterThan(5);
    expect(result.decision).toBe(environmentNoise);
    expect(result.reasons.some(reason => reason.includes('p95'))).toBe(true);
    expect(selectBenchmarkWinner({ candidates: [{ id: side, comparison: result }] }).winnerId).toBeNull();
  }
});

test('p99-only regression blocks a winner with improving median and p95', () => {
  const pairs = variedPairs();
  for (const pair of pairs) pair.candidate.samples.fill(36, 194);
  const result = compare(pairs);
  expect(result.tailEffect?.lower95Percent).toBeGreaterThan(5);
  expect(result.decision).toBe('NO_IMPROVEMENT');
  expect(result.reasons.some(reason => reason.includes('p99'))).toBe(true);
  expect(selectBenchmarkWinner({ candidates: [{ id: 'long-tail', comparison: result }] }).winnerId).toBeNull();
});

test('p99 may be absent uniformly but cannot disappear from one trial', () => {
  expect(compare(variedPairs(20)).decision).toBe('IMPROVED');
  for (const side of ['baseline', 'candidate'] as const) {
    const pairs = variedPairs();
    pairs[7]![side].samples.length = 99;
    const result = compare(pairs);
    expect(result.decision).toBe(environmentNoise);
    expect(result.reasons.some(reason => reason.includes('p99'))).toBe(true);
    expect(selectBenchmarkWinner({ candidates: [{ id: side, comparison: result }] }).winnerId).toBeNull();
  }
});

test('small supported p99 changes and sparse higher-is-better trials retain useful semantics', () => {
  const pairs = variedPairs();
  for (const pair of pairs) pair.candidate.samples.fill(12.2, 194);
  expect(compare(pairs).decision).toBe('IMPROVED');
  const throughput = compare(variedPairs(10, true));
  expect(throughput.decision).toBe('IMPROVED');
  expect(throughput.tailEffect).toBeNull();
  expect(selectBenchmarkWinner({ candidates: [{ id: 'throughput', comparison: throughput }] }).winnerId).toBe('throughput');
});
