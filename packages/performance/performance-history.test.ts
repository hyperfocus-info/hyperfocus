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
