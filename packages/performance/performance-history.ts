import { comparePerformanceEvidence, type PerformanceEvidenceComparison, type PerformanceEvidenceReport } from "./benchmark-report.ts";

type UnknownReport = PerformanceEvidenceReport<unknown, unknown, unknown>;

export type PerformanceEvidenceHistoryEntry = {
  report: UnknownReport;
  comparisonToPrevious?: PerformanceEvidenceComparison;
};

export type PerformanceEvidenceHistory = {
  schema: "hyperfocus-performance-history-v1";
  entries: PerformanceEvidenceHistoryEntry[];
};

/** Appends reports to a bounded longitudinal record without treating unlike timings as a trend. */
export function appendPerformanceHistory(options: {
  history?: PerformanceEvidenceHistory;
  reports: readonly UnknownReport[];
  limitPerBenchmark?: number;
}): PerformanceEvidenceHistory {
  const limit = options.limitPerBenchmark ?? 104;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Performance history limit must be a positive safe integer.");
  const byBenchmark = new Map<string, PerformanceEvidenceHistoryEntry[]>();
  for (const entry of options.history?.entries ?? []) {
    if (entry.report.schema !== "hyperfocus-performance-evidence-v1") continue;
    const entries = byBenchmark.get(entry.report.benchmark) ?? [];
    entries.push(entry);
    byBenchmark.set(entry.report.benchmark, entries);
  }
  for (const report of options.reports) {
    if (report.schema !== "hyperfocus-performance-evidence-v1") throw new Error("Cannot record an unsupported performance evidence report.");
    const entries = byBenchmark.get(report.benchmark) ?? [];
    if (entries.some((entry) => entry.report.generatedAt === report.generatedAt)) continue;
    entries.push({ report });
    byBenchmark.set(report.benchmark, entries);
  }
  for (const entries of byBenchmark.values()) {
    entries.sort(compareGeneratedAt);
    if (entries.length > limit) entries.splice(0, entries.length - limit);
  }
  const entries = [...byBenchmark.values()].flatMap((benchmarkEntries) => benchmarkEntries.map((entry, index) => {
    const previous = benchmarkEntries[index - 1]?.report;
    return {
      report: entry.report,
      ...(previous ? { comparisonToPrevious: comparePerformanceEvidence({ baseline: previous, candidate: entry.report }) } : {})
    };
  }));
  return {
    schema: "hyperfocus-performance-history-v1",
    entries: entries.sort(compareGeneratedAt)
  };
}

function compareGeneratedAt(left: PerformanceEvidenceHistoryEntry, right: PerformanceEvidenceHistoryEntry) {
  return left.report.generatedAt.localeCompare(right.report.generatedAt);
}
