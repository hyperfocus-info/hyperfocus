import { expect, test } from "bun:test";
import { comparePerformanceEvidence, createPerformanceEvidenceReport } from "./benchmark-report.ts";
import type { BenchmarkEnvironment } from "./benchmark-environment.ts";

const environment = {
  timingContextComplete: true,
  timingFingerprint: "same-context"
} as BenchmarkEnvironment;

test("reports reject lossy JSON evidence at creation and comparison boundaries", () => {
  const create = (structuralEvidence: unknown) => createPerformanceEvidenceReport({ benchmark: "queue", environment, config: {}, structuralEvidence, measurements: {} });
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const value of [NaN, Infinity, -Infinity, undefined, 1n, () => 1, Symbol("x"), new Date(), new Map(), cycle, new Array(2)]) {
    expect(() => create({ value })).toThrow();
  }
  const valid = create({ value: null });
  const imported = { ...valid, evidence: { ...valid.evidence, portable: { value: NaN } } };
  expect(() => comparePerformanceEvidence({ baseline: valid, candidate: imported })).toThrow("finite");
  const shared = { count: 1 };
  expect(() => create({ left: shared, right: shared })).not.toThrow();
});

test("performance evidence keeps structural facts outside timing calibration", () => {
  const report = createPerformanceEvidenceReport({
    benchmark: "queue",
    environment,
    config: { tasks: 100 },
    structuralEvidence: { scans: 100 },
    measurements: { p95Ms: 2 },
    generatedAt: "2026-08-29T00:00:00.000Z"
  });
  expect(report.evidence.portable.scans).toBe(100);
  expect(report.evidence.calibration.role).toBe("diagnostic-only");
});

test("timing comparisons require the same workload and fully recorded context", () => {
  const baseline = createPerformanceEvidenceReport({ benchmark: "queue", environment, config: { tasks: 100 }, structuralEvidence: { scans: 100 }, measurements: { p95Ms: 2 } });
  const same = createPerformanceEvidenceReport({ benchmark: "queue", environment: { ...environment }, config: { tasks: 100 }, structuralEvidence: { scans: 100 }, measurements: { p95Ms: 1 } });
  expect(comparePerformanceEvidence({ baseline, candidate: same }).timingComparable).toBe(true);

  const different = createPerformanceEvidenceReport({
    benchmark: "queue",
    environment: { ...environment, timingContextComplete: false, timingFingerprint: "battery-and-busy" },
    config: { tasks: 1_000 },
    structuralEvidence: { scans: 1_000 },
    measurements: { p95Ms: 20 }
  });
  const comparison = comparePerformanceEvidence({ baseline, candidate: different });
  expect(comparison.timingComparable).toBe(false);
  expect(comparison.timingComparisonReasons).toContain("workload config differs");
  expect(comparison.timingComparisonReasons).toContain("runtime or machine context differs");
});
