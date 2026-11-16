import { expect, test } from "bun:test";
import { summarizeSwarmBaseline } from "./baseline-summary";

function receipt(count = 480) {
  const values = Array.from({ length: count }, (_, index) => 1 + index / count);
  return { samples: values, scenario: "current-cpu-preparation", workloadHash: "fixture-workload", runtimeVersion: "Bun fixture",
    cpuModel: "shared CPU fixture", platform: "linux", architecture: "x64", warmupFrames: 120, warmupMs: 100, durationMs: 1000,
    memory: { rssBytes: 1000, heapBytes: 500, allocatedBytes: null, scope: "Process boundary; not allocation profiling." }, gc: { count: null, durationMs: null },
    stages: { simulation: values, sampling: values, presentation: values, application: values.map(value => value * 2),
      commandPreparation: values.map(value => value * 3), totalCpu: values.map(value => value * 4) },
    structural: { finalStateHash: "b".repeat(64), entityCounts: Array(count).fill(5), commandCounts: Array(count).fill(8) },
    limitations: ["No browser main thread, GPU, display freshness, interpolation or image-repeatability measurement.", "No allocation/GC profiler in acceptance timing."] };
}
function summarize(value: unknown) { return summarizeSwarmBaseline({ value, sourceRevision: "a".repeat(40), artifactId: "raw-baseline-artifact", requireCpuEvidence: true }); }

test("large raw receipts retain every late CPU stage in a compact diagnostic with the raw artifact reference", () => {
  const value = receipt(), raw = JSON.stringify(value), text = summarize(value);
  expect(raw.indexOf('"application"')).toBeGreaterThan(12000);
  expect(text.length).toBeLessThan(8000);
  const summary = JSON.parse(text.slice(text.indexOf("\n") + 1));
  expect(Object.keys(summary.stages).sort()).toEqual(Object.keys(value.stages).sort());
  expect(summary.stages.application).toMatchObject({ sampleCount: 480, medianMs: 2.997916666666667 });
  expect(summary.stages.commandPreparation.p99Ms).toBeGreaterThan(summary.stages.commandPreparation.p95Ms);
  expect(summary.stages.totalCpu.medianMs).toBeGreaterThan(summary.primary.medianMs);
  expect(summary.rawArtifactId).toBe("raw-baseline-artifact");
  expect(summary.finalStateHash).toBe(value.structural.finalStateHash);
  expect(summary.warmup).toEqual({ frames: 120, elapsedMs: 100 });
  expect(summary.gc).toEqual({ count: null, durationMs: null });
  expect(summary.memory.allocatedBytes).toBeNull();
  expect(summary.limitations).toEqual(value.limitations);
  expect(summary.kind).toBe("single-baseline-diagnostic");
  expect(summary.interpretation).toContain("no performance improvement or winner");
  expect(JSON.stringify(value)).toBe(raw);
});

test("unsupported tail quantiles remain null for small diagnostic samples", () => {
  const text = summarize(receipt(10)), summary = JSON.parse(text.slice(text.indexOf("\n") + 1));
  expect(summary.primary.p95Ms).toBeNull(); expect(summary.primary.p99Ms).toBeNull();
  const enoughForP95 = summarize(receipt(30)), intermediate = JSON.parse(enoughForP95.slice(enoughForP95.indexOf("\n") + 1));
  expect(intermediate.stages.totalCpu.p95Ms).not.toBeNull(); expect(intermediate.stages.totalCpu.p99Ms).toBeNull();
});

test("invalid primary and later stage samples fail instead of becoming investigation evidence", () => {
  for (const invalid of [0, -1, Infinity, NaN, "1"]) {
    const value = receipt();
    expect(() => summarize({ ...value, samples: [invalid, ...value.samples.slice(1)] })).toThrow();
    expect(() => summarize({ ...value, stages: { ...value.stages, commandPreparation: [invalid, ...value.stages.commandPreparation.slice(1)] } })).toThrow();
  }
  const value = receipt();
  expect(() => summarize({ ...value, stages: { ...value.stages, application: value.stages.application.slice(1) } })).toThrow("same measured frames");
});
