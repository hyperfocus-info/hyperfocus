import type { BenchmarkCorrectness, BenchmarkLease, BenchmarkLeaseStore, BenchmarkMeasurement, BenchmarkPair } from './contracts';

/** AB/BA pairs form ABBA/BAAB blocks. Revisions and scenario are fixed by the host. */
export function pairedTrialPlan(options: { sessions?: number; pairsPerSession?: number }) {
  const sessions = options.sessions ?? 2, pairsPerSession = options.pairsPerSession ?? 4;
  if (!Number.isSafeInteger(sessions) || sessions < 1 || sessions > 20 || !Number.isSafeInteger(pairsPerSession) || pairsPerSession < 2 || pairsPerSession > 100) {
    throw new Error('Benchmark plan needs 1–20 sessions and 2–100 pairs per session.');
  }
  return Array.from({ length: sessions * pairsPerSession }, (_, index) => ({
    pair: index,
    session: Math.floor(index / pairsPerSession),
    order: index % 2 === 0 ? ['baseline', 'candidate'] as const : ['candidate', 'baseline'] as const,
  }));
}

/**
 * Measurement callbacks must stop their remote process and settle when aborted.
 * Release waits for that settlement; an aborted but running command never frees
 * the worker for another task. Durable resource fencing belongs to the host.
 */
export async function runPairedBenchmarkLane(options: {
  correctness: BenchmarkCorrectness;
  leases: BenchmarkLeaseStore;
  signal?: AbortSignal;
  heartbeatMs?: number;
  trialTimeoutMs?: number;
  sessions?: number;
  pairsPerSession?: number;
  beginSession: (options: { session: number; lease: BenchmarkLease; signal: AbortSignal }) => Promise<void>;
  measure: (options: { side: 'baseline' | 'candidate'; pair: number; session: number; lease: BenchmarkLease; signal: AbortSignal }) => Promise<BenchmarkMeasurement>;
  persistTrial: (options: { side: 'baseline' | 'candidate'; pair: number; measurement: BenchmarkMeasurement }) => Promise<void>;
}) {
  if (!options.correctness.passed || options.correctness.blockers.length || !options.correctness.artifactIds.length) {
    throw new Error('Correctness evidence must pass before acquiring the benchmark lane.');
  }
  const plan = pairedTrialPlan(options), heartbeatMs = options.heartbeatMs ?? 10000, trialTimeoutMs = options.trialTimeoutMs ?? 120000;
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 1 || !Number.isSafeInteger(trialTimeoutMs) || trialTimeoutMs < 1) throw new Error('Benchmark heartbeat and timeout must be positive integers.');
  const controller = new AbortController(), propagateAbort = () => controller.abort(options.signal?.reason ?? new Error('Benchmark cancelled.'));
  options.signal?.addEventListener('abort', propagateAbort, { once: true });
  if (options.signal?.aborted) propagateAbort();
  let lease: BenchmarkLease | undefined, heartbeat: ReturnType<typeof setInterval> | undefined, renewal: Promise<void> | undefined;
  const pairs: BenchmarkPair[] = [];
  try {
    controller.signal.throwIfAborted();
    lease = await options.leases.acquire(controller.signal);
    const acquired = lease;
    heartbeat = setInterval(() => {
      if (renewal || controller.signal.aborted) return;
      renewal = options.leases.renew(lease!).then(next => {
        if (next.ownerId !== acquired.ownerId || next.fence !== acquired.fence || next.resourceId !== acquired.resourceId) throw new Error('Benchmark lease identity changed.');
        lease = next;
      }).catch(error => { controller.abort(error); }).finally(() => { renewal = undefined; });
    }, heartbeatMs);
    let session = -1;
    for (const step of plan) {
      controller.signal.throwIfAborted();
      await options.leases.assertHeld(lease);
      if (session !== step.session) {
        session = step.session;
        await options.beginSession({ session, lease, signal: controller.signal });
      }
      let baseline: BenchmarkMeasurement | undefined, candidate: BenchmarkMeasurement | undefined;
      for (const side of step.order) {
        controller.signal.throwIfAborted();
        await options.leases.assertHeld(lease);
        const timeout = setTimeout(() => controller.abort(new Error('Benchmark trial timed out.')), trialTimeoutMs);
        let measurement: BenchmarkMeasurement;
        try { measurement = await options.measure({ side, pair: step.pair, session, lease, signal: controller.signal }); }
        finally { clearTimeout(timeout); }
        // Preserve returned evidence even if cancellation/lease loss occurred
        // while collecting it; it is never promoted to a completed pair below.
        await options.persistTrial({ side, pair: step.pair, measurement });
        controller.signal.throwIfAborted();
        await options.leases.assertHeld(lease);
        if (measurement.environment.workerId !== lease.resourceId || measurement.environment.leaseFence !== lease.fence || measurement.environment.activeSwarmWorkloads !== 0) {
          throw new Error('Measurement does not identify the exclusively leased worker.');
        }
        if (side === 'baseline') baseline = measurement; else candidate = measurement;
      }
      if (!baseline || !candidate) throw new Error('Incomplete benchmark pair.');
      pairs.push({ baseline, candidate });
    }
    return pairs;
  } finally {
    clearInterval(heartbeat);
    await renewal;
    options.signal?.removeEventListener('abort', propagateAbort);
    if (lease) await options.leases.release(lease);
  }
}
