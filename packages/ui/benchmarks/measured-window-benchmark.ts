import { positiveInteger, nonNegativeInteger } from "./arguments";
import { roundDecimal } from "@hyperfocus/utilities/math";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createMeasuredWindowModel } from "../src/transcript/measured-window-model";
import { readBenchmarkEnvironment } from "@hyperfocus/performance";

type Sample = { elapsedMs: number; checksum: number };

const options = parseOptions(process.argv.slice(2));
const keys = Array.from({ length: options.rows }, (_, index) => `row-${index}`);
const control = createPrefixRebuildWorkload(options.rows, options.measurements);
const candidate = createMeasuredModelWorkload(keys, options.measurements);

for (let index = 0; index < options.warmup; index += 1) {
  control.run();
  candidate.run();
}

const controlSamples: Sample[] = [];
const candidateSamples: Sample[] = [];
for (let round = 0; round < options.rounds; round += 1) {
  Bun.gc(true);
  controlSamples.push(measure(control.run));
  candidateSamples.push(measure(candidate.run), measure(candidate.run));
  controlSamples.push(measure(control.run));
}
const controlChecksum = controlSamples.at(-1)?.checksum;
const candidateChecksum = candidateSamples.at(-1)?.checksum;
if (controlChecksum !== candidateChecksum) {
  throw new Error(`Measured-window parity failed: prefix ${controlChecksum}, model ${candidateChecksum}.`);
}

const controlSummary = summarize(controlSamples);
const candidateSummary = summarize(candidateSamples);
const report = {
  generatedAt: new Date().toISOString(),
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  config: options,
  structuralEvidence: {
    controlComplexityPerMeasurement: `O(rows): ${options.rows.toLocaleString("en-US")} prefix writes plus one Float64Array allocation`,
    candidateComplexityPerMeasurement: `O(log rows): at most ${Math.ceil(Math.log2(options.rows + 1))} Fenwick-tree writes and no typed-array allocation`,
    controlTypedArrayAllocationsPerSample: options.measurements,
    candidateTypedArrayAllocationsPerSampleAfterSync: 0,
    controlPrefixWritesPerSample: options.rows * options.measurements,
    candidateTreeWritesUpperBoundPerSample: Math.ceil(Math.log2(options.rows + 1)) * options.measurements
  },
  control: { strategy: "rebuild-prefix-array", ...controlSummary },
  candidate: { strategy: "fenwick-measured-model", ...candidateSummary },
  p50DeltaPercent: percentDelta(candidateSummary.p50Ms, controlSummary.p50Ms),
  p95DeltaPercent: percentDelta(candidateSummary.p95Ms, controlSummary.p95Ms)
};
await mkdir(dirname(options.out), { recursive: true });
await Bun.write(options.out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Measured window p95: ${controlSummary.p95Ms}ms -> ${candidateSummary.p95Ms}ms (${report.p95DeltaPercent}%)`);
console.log(`report: ${options.out}`);

function createPrefixRebuildWorkload(rows: number, measurements: number) {
  const sizes = new Float64Array(rows);
  sizes.fill(112);
  let update = 0;
  return {
    run() {
      let checksum = 0;
      for (let count = 0; count < measurements; count += 1) {
        const index = update * 7919 % rows;
        sizes[index] = 64 + update % 192;
        const offsets = new Float64Array(rows + 1);
        for (let row = 0; row < rows; row += 1) offsets[row + 1] = offsets[row] + sizes[row];
        checksum = offsets[rows] + offsets[index];
        update += 1;
      }
      return checksum;
    }
  };
}

function createMeasuredModelWorkload(keys: readonly string[], measurements: number) {
  const model = createMeasuredWindowModel();
  model.sync(keys, 112);
  let update = 0;
  return {
    run() {
      let checksum = 0;
      for (let count = 0; count < measurements; count += 1) {
        const index = update * 7919 % keys.length;
        model.measure(keys[index], 64 + update % 192);
        checksum = model.totalSize + model.offsetAt(index);
        update += 1;
      }
      return checksum;
    }
  };
}

function measure(run: () => number): Sample {
  const startedAt = performance.now();
  const checksum = run();
  return { elapsedMs: performance.now() - startedAt, checksum };
}

function summarize(samples: readonly Sample[]) {
  const times = samples.map((sample) => round(sample.elapsedMs));
  return { samplesMs: times, p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95) };
}

function percentile(values: readonly number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function percentDelta(value: number, baseline: number) {
  return round((value - baseline) / Math.max(0.001, baseline) * 100);
}

function round(value: number) { return roundDecimal(value, 3); }

function parseOptions(argv: readonly string[]) {
  return {
    rows: positiveInteger("rows", argument(argv, "rows", "50000")),
    measurements: positiveInteger("measurements", argument(argv, "measurements", "64")),
    warmup: nonNegativeInteger("warmup", argument(argv, "warmup", "2")),
    rounds: positiveInteger("rounds", argument(argv, "rounds", "4")),
    out: resolve(argument(argv, "out", ".local/ui-performance/measured-window.json"))
  };
}

function argument(argv: readonly string[], name: string, fallback: string) {
  const prefix = `--${name}=`;
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}
