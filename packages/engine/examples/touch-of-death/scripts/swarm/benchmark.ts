import { cpus } from 'node:os';
import { createCpuPreparationWorkload, cpuWorkloadConfiguration } from "../../src/swarm/workload.ts";

// This executable is dispatched inside the selected execution provider. The
// coordinator owns cancellation, timeout, isolation, pairing and artifact copy.
// A direct invocation requires an explicit local diagnostic choice.
if (!['railway', 'local'].includes(process.env.HYPERFOCUS_SWARM_BACKEND ?? '') && !process.argv.includes('--allow-local')) {
  throw new Error('Run through the swarm execution provider; --allow-local explicitly permits a local diagnostic.');
}
const workload = await createCpuPreparationWorkload();
const warmupStarted = performance.now();
for (let index = 0; index < cpuWorkloadConfiguration.warmupFrames; index++) workload.frame();
const warmupMs = performance.now() - warmupStarted;
workload.reset();
const memoryBefore = process.memoryUsage(), start = performance.now(), rows = [];
for (let index = 0; index < cpuWorkloadConfiguration.measuredFrames; index++) rows.push(workload.frame());
const durationMs = performance.now() - start, memoryAfter = process.memoryUsage();
const hash = (value: unknown) => new Bun.CryptoHasher('sha256').update(JSON.stringify(value)).digest('hex');
console.log(JSON.stringify({
  samples: rows.map(row => row.presentationMs), scenario: cpuWorkloadConfiguration.schema,
  workloadHash: hash(cpuWorkloadConfiguration), runtimeVersion: `Bun ${Bun.version}`, cpuModel: cpus()[0]?.model ?? 'unknown', platform: process.platform, architecture: process.arch,
  warmupMs, warmupFrames: cpuWorkloadConfiguration.warmupFrames, durationMs,
  memory: { rssBytes: memoryAfter.rss, heapBytes: memoryAfter.heapUsed, allocatedBytes: null, before: memoryBefore, after: memoryAfter,
    scope: 'Process boundary observations; heap delta is not an allocation rate or retained-memory measurement.' },
  gc: { count: null, durationMs: null },
  stages: { simulation: rows.map(row => row.simulationMs), sampling: rows.map(row => row.samplingMs), presentation: rows.map(row => row.presentationMs),
    application: rows.map(row => row.applicationMs), commandPreparation: rows.map(row => row.commandPreparationMs), totalCpu: rows.map(row => row.totalCpuMs) },
  structural: { entityCounts: rows.map(row => row.entityCount), commandCounts: rows.map(row => row.commandCount), finalStateHash: hash(workload.checkpoint()) },
  limitations: ['No browser main thread, GPU, display freshness, interpolation or image-repeatability measurement.', 'No allocation/GC profiler in acceptance timing.'],
}));
