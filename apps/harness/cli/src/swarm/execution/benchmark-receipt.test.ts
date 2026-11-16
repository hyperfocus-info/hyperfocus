import { expect, test } from 'bun:test';
import type { BenchmarkMeasurement, BenchmarkPair } from '@hyperfocus/performance/swarm';
import { compareBenchmarkReceipts, parseBenchmarkTrial, type BenchmarkTrial } from './benchmark-receipt';

function trial(options: { primary?: number; total?: number; totalSamples?: number[]; state?: string; count?: number } = {}) {
  return parseBenchmarkTrial({ requireCpuEvidence: true, value: {
    samples: Array(100).fill(options.primary ?? 10), scenario: 'cpu-preparation', workloadHash: 'fixed-inputs', runtimeVersion: 'Bun test', cpuModel: 'test CPU', platform: 'linux', architecture: 'x64',
    warmupMs: 5000, durationMs: 10000, memory: { rssBytes: 1000, heapBytes: 500, allocatedBytes: null }, gc: { count: null, durationMs: null },
    stages: { totalCpu: options.totalSamples ?? Array(100).fill(options.total ?? 20) }, structural: { finalStateHash: options.state ?? 'a'.repeat(64), entityCounts: Array(100).fill(2000), commandCounts: Array(100).fill(options.count ?? 1000) },
  } });
}

function comparison(options: { state?: string; count?: number; total?: number; totalSamples?: number[] } = {}) {
  const receipts = new Map<string, BenchmarkTrial>(), pairs: BenchmarkPair[] = [];
  for (let index = 0; index < 8; index++) {
    function measurement(side: 'baseline' | 'candidate'): BenchmarkMeasurement {
      const id = `${side}-${index}`, raw = side === 'baseline' ? trial() : trial({ ...options, primary: 8 }); receipts.set(id, raw);
      return { id, sessionId: `session-${Math.floor(index / 4)}`, sourceRevision: side, scenario: raw.scenario, workloadHash: raw.workloadHash, metric: 'presentation-ms', unit: 'ms', higherIsBetter: false,
        samples: raw.samples, warmupMs: raw.warmupMs, durationMs: raw.durationMs, artifactIds: [id],
        environment: { workerId: 'worker', leaseFence: 1, cpu: raw.cpuModel, runtime: raw.runtimeVersion, browser: null, fingerprint: 'environment', hardwareIsolation: 'shared', activeSwarmWorkloads: 0 },
        memory: { rssBytes: 1000, heapBytes: 500, allocatedBytes: null, gcCount: null, gcMs: null } };
    }
    pairs.push({ baseline: measurement('baseline'), candidate: measurement('candidate') });
  }
  return compareBenchmarkReceipts({ baselineRevision: 'baseline', candidateRevision: 'candidate', correctness: { passed: true, blockers: [], artifactIds: ['correctness'] }, pairs, receipts, requireCpuEvidence: true });
}

test('foreign benchmark receipts reject missing evidence, non-finite observations and mismatched frame membership', () => {
  const valid = trial(); expect(valid.samples).toHaveLength(100);
  expect(() => parseBenchmarkTrial({ value: { ...valid, stages: undefined }, requireCpuEvidence: true })).toThrow('total CPU');
  expect(() => parseBenchmarkTrial({ value: { ...valid, samples: [NaN, ...valid.samples] } })).toThrow();
  expect(() => parseBenchmarkTrial({ value: { ...valid, memory: { rssBytes: Infinity, heapBytes: null } } })).toThrow();
  expect(() => parseBenchmarkTrial({ value: { ...valid, stages: { totalCpu: Array(50).fill(10) } } })).toThrow('same frames');
});

test('faster presentation cannot hide changed gameplay or omitted command workload', () => {
  expect(comparison().decision).toBe('IMPROVED');
  expect(comparison({ state: 'b'.repeat(64) }).decision).toBe('REJECTED_CORRECTNESS');
  expect(comparison({ count: 500 }).decision).toBe('REJECTED_CORRECTNESS');
});

test('faster presentation with worse whole preparation is rejected', () => {
  const result = comparison({ total: 30 });
  expect(result.effect?.improvementPercent).toBeCloseTo(25);
  expect(result.totalCpu?.effect?.improvementPercent).toBeCloseTo(-33.3333333333);
  expect(result.decision).toBe('NO_IMPROVEMENT');
  expect(result.reasons.some(reason => reason.includes('Total CPU'))).toBe(true);
});

test.each([4.9, 5, 5.1])('whole CPU guard uses the declared latency increase allowance at %s percent', increase => {
  const result = comparison({ total: 20 * (1 + increase / 100) });
  expect(result.effect?.improvementPercent).toBeCloseTo(25);
  expect(result.decision).toBe(increase > 5 ? 'NO_IMPROVEMENT' : 'IMPROVED');
});

test('faster presentation cannot hide a p99-only total CPU regression', () => {
  const totalSamples = Array.from({ length: 100 }, (_, index) => index < 98 ? 16 + index % 3 * 0.01 : 60);
  const result = comparison({ totalSamples });
  expect(result.effect?.lower95Percent).toBeGreaterThan(5);
  expect(result.totalCpu?.effect?.lower95Percent).toBeGreaterThan(5);
  expect(result.totalCpu?.tailEffect?.lower95Percent).toBeGreaterThan(5);
  expect(result.decision).toBe('NO_IMPROVEMENT');
  expect(result.reasons.some(reason => reason.includes('p99'))).toBe(true);
});
