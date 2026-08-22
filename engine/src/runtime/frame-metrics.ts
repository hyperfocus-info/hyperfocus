export type MetricSummary = {
  count: number;
  latest: number;
  min: number;
  max: number;
  average: number;
  p50: number;
  p95: number;
  p99: number;
};

export type LongFrameRecord = {
  durationMs: number;
  at: number;
};

export type FrameMetricsSnapshot = {
  capacity: number;
  series: Record<string, MetricSummary>;
  longFrames: readonly LongFrameRecord[];
  droppedSeries: number;
};

export type FrameMetricsOptions = {
  capacity?: number;
  maxSeries?: number;
  maxLongFrames?: number;
  longFrameMs?: number;
  now?: () => number;
};

export type FrameMetrics = {
  record(name: string, value: number): boolean;
  increment(name: string, value?: number): boolean;
  start(name: string): () => number;
  measure<T>(name: string, operation: () => T): T;
  snapshot(): FrameMetricsSnapshot;
  reset(): void;
};

type MetricSeries = {
  values: Float64Array;
  cursor: number;
  count: number;
  latest: number;
};

function positiveSafeInteger(value: number | undefined, fallback: number, label: string) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return resolved;
}

function nonNegativeFinite(value: number | undefined, fallback: number, label: string) {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return resolved;
}

function percentile(sorted: Float64Array, count: number, quantile: number) {
  return sorted[Math.min(count - 1, Math.floor((count - 1) * quantile))] ?? 0;
}

export function createFrameMetrics(options: FrameMetricsOptions = {}): FrameMetrics {
  const capacity = positiveSafeInteger(options.capacity, 240, "frame metrics capacity");
  const maxSeries = positiveSafeInteger(options.maxSeries, 64, "frame metrics maxSeries");
  const maxLongFrames = positiveSafeInteger(options.maxLongFrames, 24, "frame metrics maxLongFrames");
  const longFrameMs = nonNegativeFinite(options.longFrameMs, 16.7, "frame metrics longFrameMs");
  const now = options.now ?? (() => performance.now());
  const series = new Map<string, MetricSeries>();
  const longFrames: LongFrameRecord[] = [];
  const scratch = new Float64Array(capacity);
  let droppedSeries = 0;

  function getSeries(name: string) {
    if (typeof name !== "string" || name.length === 0) throw new Error("metric name must be a non-empty string");
    let metric = series.get(name);
    if (metric) return metric;
    if (series.size >= maxSeries) {
      droppedSeries += 1;
      return undefined;
    }
    metric = { values: new Float64Array(capacity), cursor: 0, count: 0, latest: 0 };
    series.set(name, metric);
    return metric;
  }

  function record(name: string, value: number) {
    if (!Number.isFinite(value)) return false;
    const metric = getSeries(name);
    if (!metric) return false;
    metric.values[metric.cursor] = value;
    metric.cursor = (metric.cursor + 1) % capacity;
    metric.count = Math.min(capacity, metric.count + 1);
    metric.latest = value;
    if (name === "frame.ms" && value > longFrameMs) {
      if (longFrames.length >= maxLongFrames) longFrames.shift();
      longFrames.push({ durationMs: value, at: now() });
    }
    return true;
  }

  function summary(metric: MetricSeries): MetricSummary {
    const count = metric.count;
    scratch.set(metric.values.subarray(0, count), 0);
    const sorted = scratch.subarray(0, count);
    sorted.sort();
    let total = 0;
    for (let index = 0; index < count; index += 1) total += sorted[index];
    return {
      count,
      latest: metric.latest,
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      average: count > 0 ? total / count : 0,
      p50: count > 0 ? percentile(sorted, count, 0.5) : 0,
      p95: count > 0 ? percentile(sorted, count, 0.95) : 0,
      p99: count > 0 ? percentile(sorted, count, 0.99) : 0
    };
  }

  function start(name: string) {
    const startedAt = now();
    let ended = false;
    return () => {
      if (ended) return 0;
      ended = true;
      const duration = Math.max(0, now() - startedAt);
      record(name, duration);
      return duration;
    };
  }

  return {
    record,
    increment(name, value = 1) {
      const current = series.get(name)?.latest ?? 0;
      return record(name, current + value);
    },
    start,
    measure(name, operation) {
      const end = start(name);
      try {
        return operation();
      } finally {
        end();
      }
    },
    snapshot() {
      const result: Record<string, MetricSummary> = Object.create(null);
      for (const [name, metric] of series) result[name] = summary(metric);
      return { capacity, series: result, longFrames: longFrames.map((entry) => ({ ...entry })), droppedSeries };
    },
    reset() {
      series.clear();
      longFrames.length = 0;
      droppedSeries = 0;
    }
  };
}
