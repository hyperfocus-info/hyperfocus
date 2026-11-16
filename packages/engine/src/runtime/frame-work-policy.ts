export type FrameWorkJob = { id: string; intervalMs: number; maxAgeMs: number; estimatedCostMs: number };

/** Bounded optional work, called by the existing frame owner. Required input,
 * simulation and rendering never enter this queue. Dirty changes coalesce into
 * one invocation; maximum age prevents starvation. No timers or DOM ownership.
 */
export function createFrameWorkPolicy(jobs: readonly FrameWorkJob[], clock: () => number) {
  const records = new Map(jobs.map(job => {
    if (!job.id || !Number.isFinite(job.intervalMs) || job.intervalMs < 0 || !Number.isFinite(job.maxAgeMs) || job.maxAgeMs < job.intervalMs || !Number.isFinite(job.estimatedCostMs) || job.estimatedCostMs < 0) throw Error('Invalid frame work policy');
    const state: FrameWorkJob & { lastRun: number; revision: unknown; cost: number; pending: boolean } = {
      ...job, lastRun: -Infinity, revision: undefined, cost: job.estimatedCostMs, pending: false,
    };
    return [job.id, state];
  }));
  if (records.size !== jobs.length) throw Error('Duplicate frame work job');
  const work = { runs: 0, deferred: 0, unchanged: 0, forced: 0, coalesced: 0, pending: 0, peakPending: 0, cpuMs: 0 };
  return {
    work,
    run(id: string, options: { nowMs: number; remainingMs: number; revision: unknown; urgent?: boolean }, operation: () => void): boolean {
      const job = records.get(id);if (job === undefined) throw Error(`Unknown frame work job: ${id}`);
      if (!Number.isFinite(options.nowMs) || !Number.isFinite(options.remainingMs)) throw Error('Invalid frame work clock/budget');
      if (options.nowMs < job.lastRun) throw Error('Frame work clock moved backwards; reset the owner');
      const changed = !Object.is(options.revision, job.revision), age = options.nowMs - job.lastRun;
      const expired = age >= job.maxAgeMs;
      if (!options.urgent && !changed && !job.pending && !expired) { work.unchanged++;return false; }
      if (!options.urgent && !expired && (age < job.intervalMs || options.remainingMs < job.cost)) {
        work.deferred++;if (job.pending) work.coalesced++;else { job.pending = true;work.pending++;work.peakPending = Math.max(work.peakPending, work.pending); }
        return false;
      }
      const start = clock();operation();const cost = Math.max(0, clock() - start);
      job.lastRun = options.nowMs;job.revision = options.revision;job.cost = job.cost * .75 + cost * .25;
      if (job.pending) { job.pending = false;work.pending--; }
      work.runs++;work.cpuMs += cost;if (options.urgent || expired) work.forced++;return true;
    },
    reset() { for (const job of records.values()) { job.lastRun = -Infinity;job.revision = undefined;job.cost = job.estimatedCostMs;job.pending = false; }work.pending = 0; },
  };
}
