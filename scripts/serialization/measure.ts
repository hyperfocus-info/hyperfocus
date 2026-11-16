import { gzipSync, gunzipSync } from "node:zlib";
import type { Candidate } from "./workloads";

export type Variant = Candidate & { bytes: Uint8Array };
export type Sample = { wallUs: number; cpuUs: number; retainedHeapDelta: number };
let sink: unknown;

export function variant(candidate: Candidate, compressed: boolean): Variant {
  const encode = compressed ? () => gzipSync(candidate.encode(), { level: 6 }) : candidate.encode;
  const decode = compressed ? (bytes: Uint8Array) => candidate.decode(gunzipSync(bytes)) : candidate.decode;
  return { name: candidate.name, encode, decode, bytes: encode() };
}

export function measure(candidate: Variant, operation: "encode" | "decode" | "roundtrip", iterations: number): Sample {
  Bun.gc(true);
  const heap = process.memoryUsage().heapUsed, cpu = process.cpuUsage(), start = performance.now();
  for (let i = 0; i < iterations; i++) sink = operation === "encode" ? candidate.encode()
    : candidate.decode(operation === "decode" ? candidate.bytes : candidate.encode());
  const wallUs = (performance.now() - start) * 1000 / iterations, used = process.cpuUsage(cpu);
  if (sink === undefined) throw new Error("Empty benchmark result");
  return { wallUs, cpuUs: (used.user + used.system) / iterations, retainedHeapDelta: process.memoryUsage().heapUsed - heap };
}

export function statistics(samples: readonly Sample[]) {
  const sorted = samples.map(sample => sample.wallUs).sort((a, b) => a - b);
  return { medianUs: sorted[Math.floor(sorted.length / 2)]!, p95BatchMeanUs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!, samples };
}

/** Estimate only: one serial encode + transfer + decode, with no RTT, concurrency, framing or queueing. */
export function bandwidthEstimate(baseline: { bytes: number; roundtripUs: number }, candidate: { bytes: number; roundtripUs: number }) {
  const savedBytes = baseline.bytes - candidate.bytes, extraCpuUs = candidate.roundtripUs - baseline.roundtripUs;
  return { savedBytes, extraCpuUs,
    breakEvenMbps: savedBytes > 0 && extraCpuUs > 0 ? savedBytes * 8 / extraCpuUs : null,
    codecDominates: savedBytes > 0 && extraCpuUs <= 0,
    estimatedSerialUs: [1, 10, 100, 1000].map(mbps => ({ mbps,
      baseline: baseline.roundtripUs + baseline.bytes * 8 / mbps, candidate: candidate.roundtripUs + candidate.bytes * 8 / mbps })) };
}
