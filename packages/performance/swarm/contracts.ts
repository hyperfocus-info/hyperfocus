/** One observation window. Samples are frames/operations, never independent trials. */
export type BenchmarkMeasurement = {
  id: string;
  sessionId: string;
  sourceRevision: string;
  scenario: string;
  workloadHash: string;
  metric: string;
  unit: string;
  higherIsBetter: boolean;
  samples: number[];
  warmupMs: number;
  durationMs: number;
  environment: {
    workerId: string;
    leaseFence: number;
    cpu: string;
    runtime: string;
    browser: string | null;
    fingerprint: string;
    hardwareIsolation: 'shared' | 'dedicated' | 'unknown';
    activeSwarmWorkloads: number;
  };
  memory: { rssBytes: number | null; heapBytes: number | null; allocatedBytes: number | null; gcCount: number | null; gcMs: number | null };
  artifactIds: string[];
};

export type BenchmarkPair = { baseline: BenchmarkMeasurement; candidate: BenchmarkMeasurement };
export type BenchmarkCorrectness = { passed: boolean; artifactIds: string[]; blockers: string[] };
export type BenchmarkLease = { resourceId: string; ownerId: string; fence: number; expiresAt: number };

/** The coordinator supplies durable CAS/fencing. A JS mutex is insufficient. */
export type BenchmarkLeaseStore = {
  acquire: (signal: AbortSignal) => Promise<BenchmarkLease>;
  renew: (lease: BenchmarkLease) => Promise<BenchmarkLease>;
  assertHeld: (lease: BenchmarkLease) => Promise<void>;
  release: (lease: BenchmarkLease) => Promise<void>;
};
