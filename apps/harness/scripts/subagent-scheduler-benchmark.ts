import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createPerformanceEvidenceReport, readBenchmarkEnvironment } from "@hyperfocus/performance";
import { createIndexedTaskQueue, scheduleSubagentTasks } from "../cli/src/pi-subagents.ts";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const outputPath = path.join(repositoryRoot, ".local", "harness-performance", "subagent-scheduler.json");
const counts = [100, 1_000, 10_000];
const queueStorage = counts.map(compareQueueStorage);
const schedulerCapacity = [];
for (const taskCount of [100, 1_000]) {
  for (const concurrency of [4, 32, 128]) {
    schedulerCapacity.push(await runSchedulerCapacity(taskCount, Math.min(taskCount, concurrency)));
  }
}

const report = createPerformanceEvidenceReport({
  benchmark: "harness-subagent-scheduler",
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  config: { queueCounts: counts, schedulerTaskCounts: [100, 1_000], concurrency: [4, 32, 128] },
  structuralEvidence: {
    control: "front splice shifts n*(n-1)/2 retained slots",
    candidate: "indexed dequeue scans each unconstrained task slot once, with amortized compaction",
    capacity: "active execution never exceeds the configured concurrency bound",
    queueStorage: queueStorage.map(({ count, control, candidate }) => ({
      count,
      controlShiftedSlots: control.shiftedSlots,
      candidateSlotScans: candidate.slotScans,
      candidateCompactions: candidate.compactions
    })),
    schedulerCapacity: schedulerCapacity.map(({ taskCount, concurrency, metrics }) => ({
      taskCount,
      concurrency,
      peakActive: metrics.peakActive,
      slotScans: metrics.slotScans
    }))
  },
  measurements: {
    queueStorage: queueStorage.map(({ count, control, candidate }) => ({
      count,
      controlElapsedMs: control.elapsedMs,
      candidateElapsedMs: candidate.elapsedMs
    })),
    schedulerCapacity: schedulerCapacity.map(({ elapsedMs, ...entry }) => ({
      taskCount: entry.taskCount,
      concurrency: entry.concurrency,
      elapsedMs
    }))
  }
});

await mkdir(path.dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function compareQueueStorage(count: number) {
  const values = Array.from({ length: count }, (_, index) => index);
  let controlShiftedSlots = 0;
  let controlChecksum = 0;
  const controlQueue = [...values];
  const controlStartedAt = performance.now();
  while (controlQueue.length > 0) {
    controlShiftedSlots += controlQueue.length - 1;
    controlChecksum += controlQueue.splice(0, 1)[0] ?? 0;
  }
  const controlMs = performance.now() - controlStartedAt;

  const candidateQueue = createIndexedTaskQueue(values);
  let candidateChecksum = 0;
  const candidateStartedAt = performance.now();
  while (candidateQueue.size > 0) candidateChecksum += candidateQueue.dequeue() ?? 0;
  const candidateMs = performance.now() - candidateStartedAt;
  if (candidateChecksum !== controlChecksum || candidateQueue.metrics.slotScans !== count) {
    throw new Error(`Queue structural parity failed for ${count} tasks.`);
  }
  return {
    count,
    control: { elapsedMs: controlMs, shiftedSlots: controlShiftedSlots },
    candidate: { elapsedMs: candidateMs, ...candidateQueue.metrics }
  };
}

async function runSchedulerCapacity(taskCount: number, concurrency: number) {
  const startedAt = performance.now();
  const result = await scheduleSubagentTasks<number, { id: string }, never>({
    tasks: Array.from({ length: taskCount }, (_, index) => index),
    maxConcurrency: concurrency,
    getTaskId: (task) => String(task),
    async executeTask(task) {
      await Promise.resolve();
      return { result: { id: String(task) } };
    }
  });
  if (result.results.length !== taskCount || result.metrics.peakActive > concurrency
    || result.metrics.slotScans !== taskCount) {
    throw new Error(`Scheduler capacity parity failed for ${taskCount} tasks at concurrency ${concurrency}.`);
  }
  return {
    taskCount,
    concurrency,
    elapsedMs: performance.now() - startedAt,
    metrics: result.metrics
  };
}
