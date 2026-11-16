import type { BulkStatus } from '../pool.ts';

/** Bounded throughput evidence for exported slow-run reports; never used as a learning reward. */
export function createTrainingTelemetry() {
  let seed: number | undefined, sample: { time: number; ticks: number } | undefined, started = 0, omitted = 0;
  const samples: { elapsedMs: number; durationMs: number; ticks: number; ticksPerSecond: number; workers: number; busyWorkers: number; systemCpuPercent?: number }[] = [];
  return {
    update(options: { value: BulkStatus; now: number; systemCpuPercent?: number }) {
      const { value, now, systemCpuPercent } = options;
      if (seed !== value.runSeed) { seed = value.runSeed;samples.length = 0;sample = undefined;started = now;omitted = 0; }
      if (value.state !== 'running') { sample = undefined;return; }
      sample ??= { time: now, ticks: value.ticks };
      const durationMs = now - sample.time;if (durationMs < 5000) return;
      const ticks = value.ticks - sample.ticks;
      samples.push({ elapsedMs: now - started, durationMs, ticks, ticksPerSecond: ticks * 1000 / durationMs,
        workers: value.workers, busyWorkers: value.busyWorkers ?? value.workers,
        ...(systemCpuPercent !== undefined && Number.isFinite(systemCpuPercent) && systemCpuPercent >= 0 && systemCpuPercent <= 100 ? { systemCpuPercent } : {}) });
      if (samples.length > 120) { samples.shift();omitted++; }
      sample = { time: now, ticks: value.ticks };
    },
    snapshot() { return { intervalMs: 5000, limit: 120, omitted, cpuScope: 'system-wide-all-apps', samples: samples.map(row => ({ ...row })) }; },
  };
}
