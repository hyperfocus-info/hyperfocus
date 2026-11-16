import type { BulkProgress, BulkSimulationOptions } from '../protocol.ts';
import { createPolicyScheduler } from './scheduler.ts';
import type { PolicyExperimentSnapshot } from '@hyperfocus/touch-of-death/learning/experiment';
import type { PolicyResult, PolicyTrial } from '@hyperfocus/touch-of-death/learning/trials';

type Assignment = { sequence: number; trial: PolicyTrial };
export const policyJobKey = (job: Assignment) => `${job.sequence}:${job.trial.id}`;

/** Fill phase tails with independent searches; finalize in creation order only. */
export function createPolicyPipeline(options: {
  seed: number; learning: NonNullable<BulkSimulationOptions['learning']>;
  finish?: (experiment: PolicyExperimentSnapshot) => Promise<NonNullable<BulkSimulationOptions['learning']>>;
  changed: (reset: boolean) => void; failed: (error: unknown) => void;
}) {
  let baseline = structuredClone(options.learning), sequence = 0, completed = 0, canceled = 0;
  let closed = false, finalizing = false;
  const pending = new Map<number, ReturnType<typeof createPolicyScheduler>>();
  const recent: PolicyExperimentSnapshot[] = [];
  let report: NonNullable<BulkProgress['experiments']>;
  function snapshot() {
    report = { started: sequence, completed, canceled, omitted: completed - recent.length,
      recent: [...recent], pending: [...pending].map(([index, scheduler]) => ({ sequence: index, learning: scheduler.snapshot(), pendingTrialResults: scheduler.pendingResults() })) };
  }
  function add() {
    // Odd stride traverses uint32 seeds; each experiment retains its own disjoint held-out offsets.
    const index = sequence++, scheduler = createPolicyScheduler({ seed: (options.seed + Math.imul(index, 4099)) >>> 0, ...baseline });
    pending.set(index, scheduler);snapshot();return { index, scheduler };
  }
  async function finalize() {
    if (closed || finalizing) return;
    finalizing = true;
    try {
      for (let first = pending.entries().next().value; first && first[1].done && !closed; first = pending.entries().next().value) {
        const [index, scheduler] = first, experiment = scheduler.snapshot();
        const next = await options.finish?.(experiment) ?? baseline;
        if (closed) return;
        pending.delete(index);completed++;recent.push(experiment);if (recent.length > 2) recent.shift();
        const reset = JSON.stringify(next.active ?? null) !== JSON.stringify(baseline.active ?? null)
          || JSON.stringify(next.previous ?? null) !== JSON.stringify(baseline.previous ?? null);
        baseline = structuredClone(next);
        if (reset) { canceled += pending.size;pending.clear(); }
        snapshot();options.changed(reset);
      }
    } catch (error) { if (!closed) options.failed(error); }
    finally { finalizing = false; }
  }
  add();
  return {
    take(options: { capacity: number }): Assignment | undefined {
      if (closed) return;
      for (const [index, scheduler] of pending) {
        const trial = scheduler.take();if (trial) return { sequence: index, trial };
      }
      // Every blocked experiment has at least one running job (or awaits a durable commit).
      if (pending.size >= options.capacity) return;
      const { index, scheduler } = add();return { sequence: index, trial: scheduler.take()! };
    },
    release(job: Assignment) { pending.get(job.sequence)?.release(job.trial.id); },
    record(job: Assignment, result: PolicyResult) {
      const scheduler = pending.get(job.sequence);if (!scheduler) throw Error('Unknown policy experiment.');
      const committed = scheduler.record(result).map(id => `${job.sequence}:${id}`);
      snapshot();void finalize();return committed;
    },
    get report() { return report; },
    close() { closed = true; },
  };
}
