import type { BenchmarkMeasurement, BenchmarkPair } from './contracts';

export function measurement(options: { id: string; value?: number; revision?: string; sessionId?: string }): BenchmarkMeasurement {
  return {
    id: options.id, sessionId: options.sessionId ?? 'session-0', sourceRevision: options.revision ?? 'baseline',
    scenario: 'seeded-rooftop', workloadHash: 'workload-sha', metric: 'producer-ms', unit: 'ms', higherIsBetter: false,
    samples: Array.from({ length: 100 }, () => options.value ?? 10), warmupMs: 5000, durationMs: 10000,
    environment: { workerId: 'benchmark-worker', leaseFence: 1, cpu: 'test CPU', runtime: 'Bun test', browser: null, fingerprint: 'test-env', hardwareIsolation: 'shared', activeSwarmWorkloads: 0 },
    memory: { rssBytes: 1000, heapBytes: null, allocatedBytes: null, gcCount: null, gcMs: null }, artifactIds: [`raw:${options.id}`],
  };
}

export function pairedMeasurements(options: { candidate?: number; count?: number } = {}): BenchmarkPair[] {
  return Array.from({ length: options.count ?? 8 }, (_, index) => ({
    baseline: measurement({ id: `baseline-${index}`, sessionId: `session-${Math.floor(index / 4)}` }),
    candidate: measurement({ id: `candidate-${index}`, value: options.candidate ?? 8, revision: 'candidate', sessionId: `session-${Math.floor(index / 4)}` }),
  }));
}
