import { availableParallelism, cpus, freemem, loadavg, totalmem } from "node:os";

export type BenchmarkEnvironment = ReturnType<typeof readBenchmarkEnvironment>;

export function readBenchmarkEnvironment(runtime: { name: string; version: string }) {
  const cpuList = cpus();
  const clockSpeeds = cpuList.map((cpu) => cpu.speed).filter((speed) => Number.isFinite(speed) && speed > 0);
  const powerProfile = environmentText("HYPERFOCUS_BENCH_POWER_PROFILE");
  const thermalState = environmentText("HYPERFOCUS_BENCH_THERMAL_STATE");
  const contentionProfile = environmentText("HYPERFOCUS_BENCH_CONTENTION");
  const deviceProfile = environmentText("HYPERFOCUS_BENCH_DEVICE_PROFILE");
  const activeAgents = environmentInteger("HYPERFOCUS_BENCH_ACTIVE_AGENTS");
  const timingFingerprint = [
    runtime.name,
    runtime.version,
    process.platform,
    process.arch,
    cpuList[0]?.model ?? "unknown",
    cpuList.length,
    availableParallelism(),
    powerProfile,
    thermalState,
    contentionProfile,
    deviceProfile,
    activeAgents
  ].join("|");
  return {
    runtime,
    platform: process.platform,
    architecture: process.arch,
    cpu: cpuList[0]?.model ?? "unknown",
    logicalCpus: cpuList.length,
    availableParallelism: availableParallelism(),
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    loadAverage: loadavg(),
    cpuClockMHz: {
      minimum: clockSpeeds.length ? Math.min(...clockSpeeds) : 0,
      maximum: clockSpeeds.length ? Math.max(...clockSpeeds) : 0,
      average: clockSpeeds.length ? clockSpeeds.reduce((sum, speed) => sum + speed, 0) / clockSpeeds.length : 0
    },
    powerProfile,
    thermalState,
    contentionProfile,
    deviceProfile,
    activeAgents,
    timingFingerprint,
    timingContextComplete: ![powerProfile, thermalState, contentionProfile, deviceProfile, activeAgents].includes("unrecorded"),
    notes: process.env.HYPERFOCUS_BENCH_NOTES ?? ""
  };
}

function environmentText(name: string) {
  return process.env[name]?.trim() || "unrecorded";
}

function environmentInteger(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return "unrecorded" as const;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : "unrecorded" as const;
}

export {
  comparePerformanceEvidence,
  createPerformanceEvidenceReport,
  type PerformanceEvidenceComparison,
  type PerformanceEvidenceReport,
  type PerformanceEvidenceReportOptions
} from "./benchmark-report.ts";
export {
  appendPerformanceHistory,
  type PerformanceEvidenceHistory,
  type PerformanceEvidenceHistoryEntry
} from "./performance-history.ts";
