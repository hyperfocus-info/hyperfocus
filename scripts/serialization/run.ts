import { deepStrictEqual } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPerformanceEvidenceReport, readBenchmarkEnvironment } from "@hyperfocus/performance";
import { backupWorkload, inputWorkload, pluginWorkload, replayWorkload, streamWorkload } from "./workloads";
import { bandwidthEstimate, measure, statistics, variant, type Sample } from "./measure";
import { measureStorage } from "./storage";

const rounds = 6;
const storageOnly = process.argv.includes("--storage-only");
const selected = process.argv.indexOf("--workload");
const filter = selected < 0 ? "" : process.argv[selected + 1];
if (filter === undefined || filter.startsWith("--")) throw new Error("--workload requires a name substring.");
const workloads = [inputWorkload(), streamWorkload(1), streamWorkload(), pluginWorkload(), replayWorkload(), await backupWorkload()].filter(workload => workload.name.includes(filter));
if (!workloads.length) throw new Error(`No workloads match: ${filter}`);
const results = [];
for (const workload of storageOnly ? [] : workloads) {
  for (const compressed of [false, true]) {
    const variants = workload.candidates.map(candidate => variant(candidate, compressed));
    for (const candidate of variants) deepStrictEqual(candidate.decode(candidate.bytes), workload.value);
    const iterations = compressed ? Math.min(100, workload.iterations) : workload.iterations;
    const measurements: Record<string, Sample[]> = {};
    const baseline = variants[0]!;
    for (const operation of ["encode", "decode", "roundtrip"] as const) {
      for (const candidate of variants) measure(candidate, operation, Math.max(2, Math.min(iterations, 20)));
      for (const alternative of variants.slice(1)) for (let round = 0; round < rounds; round++) {
        const order = round % 2 ? [alternative, baseline, baseline, alternative] : [baseline, alternative, alternative, baseline];
        for (const candidate of order) (measurements[`${candidate.name}.${operation}`] ??= []).push(measure(candidate, operation, iterations));
      }
    }
    const summaries = Object.fromEntries(Object.entries(measurements).map(([key, samples]) => [key, statistics(samples)]));
    const result = { workload: workload.name, compression: compressed ? "gzip-6" : "none", iterations, limits: workload.limits,
      sizes: Object.fromEntries(variants.map(candidate => [candidate.name, candidate.bytes.byteLength])), measurements: summaries,
      bandwidthEstimates: Object.fromEntries(variants.slice(1).map(candidate => [candidate.name, bandwidthEstimate(
        { bytes: baseline.bytes.byteLength, roundtripUs: summaries[`${baseline.name}.roundtrip`]!.medianUs },
        { bytes: candidate.bytes.byteLength, roundtripUs: summaries[`${candidate.name}.roundtrip`]!.medianUs })])) };
    results.push(result);
    console.log(JSON.stringify({ workload: result.workload, compression: result.compression, bytes: result.sizes,
      roundtripUs: Object.fromEntries(variants.map(candidate => [candidate.name, summaries[`${candidate.name}.roundtrip`]!.medianUs])) }));
  }
}
const directory = join(import.meta.dir, ".local"); mkdirSync(directory, { recursive: true });
const storage = measureStorage(workloads.filter(workload => /replay|plugin|backup/.test(workload.name)), join(directory, "storage-fixtures"));
const report = createPerformanceEvidenceReport({ benchmark: "serialization-domain-boundaries-v1",
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  config: { rounds, storageOnly, workloads: workloads.map(workload => workload.name), order: "serial paired ABBA/BAAB", gzipLevel: 6, warmup: "2-20 iterations per candidate and operation",
    note: "GC requested outside samples. Retained heap deltas are not allocation counts. p95 is of batch means, not per-event latency. CPU samples use process.cpuUsage. No rollout gate is implied." },
  structuralEvidence: results.map(({ workload, compression, sizes }) => ({ workload, compression, sizes, parity: true })),
  measurements: { codecs: results, storage },
});
const output = join(directory, `domain-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`);
writeFileSync(output, JSON.stringify(report, null, 2)); // Explicit human-readable benchmark evidence.
console.log(`Report: ${output}`);
