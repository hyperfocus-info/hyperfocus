import { expect, test } from "bun:test";
import type { BenchmarkEnvironment } from "./benchmark-environment.ts";
import { createPerformanceEvidenceReport } from "./benchmark-report.ts";
import { appendPerformanceHistory } from "./performance-history.ts";

const environment = { timingContextComplete: true, timingFingerprint: "laptop-ac" } as BenchmarkEnvironment;
const report = (generatedAt: string, fingerprint = "laptop-ac") => createPerformanceEvidenceReport({
  benchmark: "codec",
  environment: { ...environment, timingFingerprint: fingerprint },
  config: { bytes: 64 },
  structuralEvidence: { copies: 0 },
  measurements: { p95Ms: 1 },
  generatedAt
});

test("normalizes and bounds imported groups even without new reports", () => {
  const history = appendPerformanceHistory({ reports: [report("3"), report("1"), report("2")] });
  history.entries.reverse();
  const trimmed = appendPerformanceHistory({ history, reports: [], limitPerBenchmark: 2 });
  expect(trimmed.entries.map((entry) => entry.report.generatedAt)).toEqual(["2", "3"]);
  expect(trimmed.entries[0]?.comparisonToPrevious).toBeUndefined();
  const other = { ...report("4"), benchmark: "other" };
  const mixed = appendPerformanceHistory({ history, reports: [other], limitPerBenchmark: 1 });
  expect(mixed.entries.map((entry) => [entry.report.benchmark, entry.report.generatedAt])).toEqual([["codec", "3"], ["other", "4"]]);
  expect(history.entries).toHaveLength(3);
});

test("performance history is bounded and records whether adjacent timings are comparable", () => {
  const first = appendPerformanceHistory({ reports: [report("2026-08-27T00:00:00.000Z")] });
  const second = appendPerformanceHistory({
    history: first,
    reports: [report("2026-08-28T00:00:00.000Z", "laptop-battery"), report("2026-08-29T00:00:00.000Z", "laptop-battery")],
    limitPerBenchmark: 2
  });
  expect(second.entries).toHaveLength(2);
  expect(second.entries[0]?.report.generatedAt).toBe("2026-08-28T00:00:00.000Z");
  expect(second.entries[0]?.comparisonToPrevious).toBeUndefined();
  expect(second.entries[1]?.comparisonToPrevious?.timingComparable).toBe(true);
});
