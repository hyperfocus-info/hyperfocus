import type { MetricsSink } from "./types.ts";

export type ServerMetricKind = "counter" | "gauge" | "histogram";
export type ServerMetricSummary = { kind: ServerMetricKind; count: number; total: number; min: number; max: number; latest: number; average: number };
export type ServerMetricsDiagnostics = { series: number; maxSeries: number; droppedSeries: number; rejectedTags: number };
export type ServerMetrics = MetricsSink & {
  summary(metric: string): ServerMetricSummary | undefined;
  snapshot(): Record<string, ServerMetricSummary>;
  increment(metric: string, value?: number, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  observe(metric: string, value: number, tags?: Record<string, string>): void;
  diagnostics(): ServerMetricsDiagnostics;
  reset(): void;
};
export type ServerMetricsOptions = { sink?: "memory" | "console" | MetricsSink; maxSeries?: number; maxTags?: number; maxTagLength?: number };

function positiveSafeInteger(value: number | undefined, fallback: number, label: string) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return resolved;
}

export function createServerMetrics(options: ServerMetricsOptions = {}): ServerMetrics {
  const maxSeries = positiveSafeInteger(options.maxSeries, 2048, "server metrics maxSeries");
  const maxTags = positiveSafeInteger(options.maxTags, 8, "server metrics maxTags");
  const maxTagLength = positiveSafeInteger(options.maxTagLength, 128, "server metrics maxTagLength");
  const values = new Map<string, ServerMetricSummary>();
  const externalSink = typeof options.sink === "object" ? options.sink : undefined;
  let droppedSeries = 0;
  let rejectedTags = 0;

  function keyFor(metric: string, tags?: Record<string, string>) {
    if (typeof metric !== "string" || metric.length === 0) throw new Error("metric name must be a non-empty string");
    if (!tags || Object.keys(tags).length === 0) return metric;
    const entries = Object.entries(tags);
    if (entries.length > maxTags || entries.some(([key, value]) => key.length > maxTagLength || value.length > maxTagLength)) {
      rejectedTags += 1;
      return undefined;
    }
    return `${metric}{${entries.sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(",")}}`;
  }

  function store(kind: ServerMetricKind, metric: string, value: number, tags?: Record<string, string>) {
    if (!Number.isFinite(value)) return;
    const key = keyFor(metric, tags);
    if (!key) return;
    let summary = values.get(key);
    if (!summary && values.size >= maxSeries) {
      droppedSeries += 1;
      try { externalSink?.record(metric, value, tags); } catch { /* isolate external sinks */ }
      return;
    }
    if (!summary) {
      summary = { kind, count: 0, total: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, latest: 0, average: 0 };
      values.set(key, summary);
    }
    if (summary.kind !== kind) return;
    summary.count += 1;
    summary.latest = kind === "counter" ? summary.latest + value : value;
    summary.total = kind === "gauge" ? value : summary.total + value;
    summary.min = Math.min(summary.min, value);
    summary.max = Math.max(summary.max, value);
    summary.average = kind === "gauge" ? value : summary.total / summary.count;
    if (options.sink === "console") {
      try { console.info(`[engine:metric] ${key} ${value}`); } catch { /* metrics never interrupt state */ }
    }
    try { externalSink?.record(metric, value, tags); } catch { /* isolate external sinks */ }
  }

  return {
    record(metric, value = 1, tags) { store("histogram", metric, value, tags); },
    increment(metric, value = 1, tags) { store("counter", metric, value, tags); },
    gauge(metric, value, tags) { store("gauge", metric, value, tags); },
    observe(metric, value, tags) { store("histogram", metric, value, tags); },
    summary(metric) { return values.get(metric); },
    snapshot() { return Object.fromEntries([...values.entries()].map(([key, value]) => [key, { ...value }])); },
    diagnostics() { return { series: values.size, maxSeries, droppedSeries, rejectedTags }; },
    reset() { values.clear(); droppedSeries = 0; rejectedTags = 0; }
  };
}
