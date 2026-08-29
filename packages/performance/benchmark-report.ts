import type { BenchmarkEnvironment } from "./benchmark-environment.ts";

export type PerformanceEvidenceReport<Config, StructuralEvidence, Measurements> = {
  schema: "hyperfocus-performance-evidence-v1";
  benchmark: string;
  generatedAt: string;
  environment: BenchmarkEnvironment;
  config: Config;
  evidence: {
    portable: StructuralEvidence;
    calibration: {
      role: "diagnostic-only";
      measurements: Measurements;
    };
  };
};

export type PerformanceEvidenceReportOptions<Config, StructuralEvidence, Measurements> = {
  benchmark: string;
  environment: BenchmarkEnvironment;
  config: Config;
  structuralEvidence: StructuralEvidence;
  measurements: Measurements;
  generatedAt?: string;
};

export type PerformanceEvidenceComparison = {
  benchmarkMatches: boolean;
  configMatches: boolean;
  structuralEvidenceMatches: boolean;
  timingComparable: boolean;
  timingComparisonReasons: string[];
};

/** Keeps portable work/count claims separate from host-specific timing calibration. */
export function createPerformanceEvidenceReport<Config, StructuralEvidence, Measurements>(
  options: PerformanceEvidenceReportOptions<Config, StructuralEvidence, Measurements>
): PerformanceEvidenceReport<Config, StructuralEvidence, Measurements> {
  if (!options.benchmark.trim()) throw new Error("Performance evidence requires a benchmark name.");
  return {
    schema: "hyperfocus-performance-evidence-v1",
    benchmark: options.benchmark,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    environment: options.environment,
    config: options.config,
    evidence: {
      portable: options.structuralEvidence,
      calibration: { role: "diagnostic-only", measurements: options.measurements }
    }
  };
}

/** Refuses timing comparisons when the workload or recorded machine context differs. */
export function comparePerformanceEvidence(
  options: {
    baseline: PerformanceEvidenceReport<unknown, unknown, unknown>;
    candidate: PerformanceEvidenceReport<unknown, unknown, unknown>;
  }
): PerformanceEvidenceComparison {
  const { baseline, candidate } = options;
  const benchmarkMatches = baseline.benchmark === candidate.benchmark;
  const configMatches = stableJson(baseline.config) === stableJson(candidate.config);
  const structuralEvidenceMatches = stableJson(baseline.evidence.portable) === stableJson(candidate.evidence.portable);
  const timingComparisonReasons: string[] = [];
  if (!benchmarkMatches) timingComparisonReasons.push("benchmark differs");
  if (!configMatches) timingComparisonReasons.push("workload config differs");
  if (!baseline.environment.timingContextComplete || !candidate.environment.timingContextComplete) {
    timingComparisonReasons.push("power, thermal, contention, device, or active-agent context is unrecorded");
  }
  if (baseline.environment.timingFingerprint !== candidate.environment.timingFingerprint) {
    timingComparisonReasons.push("runtime or machine context differs");
  }
  return {
    benchmarkMatches,
    configMatches,
    structuralEvidenceMatches,
    timingComparable: timingComparisonReasons.length === 0,
    timingComparisonReasons
  };
}

function stableJson(value: unknown) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(Reflect.get(value, key))]));
}
