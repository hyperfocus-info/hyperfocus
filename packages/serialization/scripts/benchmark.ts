import { deepStrictEqual } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPerformanceEvidenceReport, readBenchmarkEnvironment } from "@hyperfocus/performance";
import { encodeValue, decodeValue, normalizeValue } from "../src/value";

const iterations = 200, rounds = 12, warmup = 100;
const encoder = new TextEncoder(), decoder = new TextDecoder();
const codecs = {
  json: { encode: (value: unknown) => encoder.encode(JSON.stringify(value)), decode: (bytes: Uint8Array) => JSON.parse(decoder.decode(bytes)) },
  protobuf: { encode: encodeValue, decode: decodeValue },
};
const delta = { type: "chat.delta", requestId: "request-123", payload: { projectId: "project-123", threadId: "thread-123", content: "A small streamed fragment." } };
const fixtures = {
  preferences: { version: 1, theme: "dark", volumes: { music: 0.75, effects: 0.8 }, enabled: true },
  delta,
  batch: { type: "server.events-batch", payload: { events: Array.from({ length: 64 }, (_, index) => ({ ...delta, requestId: `request-${index}` })) } },
  history: Array.from({ length: 128 }, (_, index) => ({ id: `message-${index}`, role: index % 2 ? "assistant" : "user", content: "Representative transcript content. ".repeat(16), createdAt: "2026-10-07T00:00:00.000Z" })),
};
type CodecName = keyof typeof codecs;
type Sample = { wallUs: number; cpuUs: number; heapDelta: number };
const measurements: Record<string, Record<string, unknown>> = {};
const structuralEvidence: Record<string, { parity: true; jsonBytes: number; protobufBytes: number }> = {};
let sink: unknown;
for (const [name, value] of Object.entries(fixtures)) {
  const encoded = { json: codecs.json.encode(value), protobuf: codecs.protobuf.encode(value) };
  deepStrictEqual(codecs.protobuf.decode(encoded.protobuf), normalizeValue(codecs.json.decode(encoded.json)));
  structuralEvidence[name] = { parity: true, jsonBytes: encoded.json.byteLength, protobufBytes: encoded.protobuf.byteLength };
  const results: Record<string, Sample[]> = {};
  for (const operation of ["encode", "decode", "roundtrip"] as const) {
    const run = (codec: CodecName) => {
      sink = operation === "encode" ? codecs[codec].encode(value)
        : codecs[codec].decode(operation === "decode" ? encoded[codec] : codecs[codec].encode(value));
    };
    for (const codec of ["json", "protobuf"] as const) for (let i = 0; i < warmup; i++) run(codec);
    // ABBA order alternates which implementation sees the warmer machine.
    for (let round = 0; round < rounds; round++) {
      const order: CodecName[] = round % 2 ? ["protobuf", "json", "json", "protobuf"] : ["json", "protobuf", "protobuf", "json"];
      for (const codec of order) {
        Bun.gc(true);
        const heap = process.memoryUsage().heapUsed, cpu = process.cpuUsage(), start = performance.now();
        for (let i = 0; i < iterations; i++) run(codec);
        const wallUs = (performance.now() - start) * 1000 / iterations, used = process.cpuUsage(cpu);
        (results[`${codec}.${operation}`] ??= []).push({ wallUs, cpuUs: (used.user + used.system) / iterations,
          heapDelta: process.memoryUsage().heapUsed - heap });
      }
    }
  }
  measurements[name] = Object.fromEntries(Object.entries(results).map(([key, samples]) => {
    const sorted = samples.map(sample => sample.wallUs).sort((a, b) => a - b);
    return [key, { medianUs: sorted[Math.floor(sorted.length / 2)], p95Us: sorted[Math.floor(sorted.length * 0.95)], samples }];
  }));
}
if (sink === undefined) throw new Error("Benchmark did not execute");
const report = createPerformanceEvidenceReport({ benchmark: "serialization-json-protobuf", config: { iterations, rounds, warmup,
  note: "Dynamic Value codec; JSON includes UTF-8 conversion. No transport, compression, domain validation or I/O. Heap deltas are diagnostics, not allocated byte counts." },
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }), structuralEvidence, measurements });
const output = fileURLToPath(new URL("../.local/benchmark.json", import.meta.url));
mkdirSync(fileURLToPath(new URL("../.local/", import.meta.url)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2)); // Human-readable performance evidence is an explicit export.
console.log(JSON.stringify({ output, structuralEvidence, timings: Object.fromEntries(Object.entries(measurements).map(([name, operations]) =>
  [name, Object.fromEntries(Object.entries(operations).map(([key, result]) => [key, Reflect.get(Object(result), "medianUs")]))])) }, null, 2));
