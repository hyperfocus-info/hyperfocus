import { mkdir } from "node:fs/promises";
import path from "node:path";
import { heapStats } from "bun:jsc";
import { createReusableBinaryReader } from "../src/protocol/byte-buffer.ts";
import { createBinaryProtocolParser, encodeBinaryInputMessage, type BinaryInputPayloadOwnership, type BinaryPayloadCodec } from "../src/protocol/messages.ts";
import { createPerformanceEvidenceReport, readBenchmarkEnvironment } from "@hyperfocus/performance";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const outputPath = path.join(repositoryRoot, ".local", "engine-perf", "protocol-input-ownership.json");
const iterations = 100_000;
const payloadBytes = 4_096;
let decodedView: Uint8Array | undefined;
let decodedRangeBuffer: Uint8Array | undefined;
const rangeReader = createReusableBinaryReader();
const payload = Uint8Array.from({ length: payloadBytes }, (_, index) => index & 0xff);
const codec = {
  encode() {
    return payload;
  },
  decode(bytes: Uint8Array) {
    decodedView = bytes;
    return { checksum: bytes[0] + bytes[bytes.length - 1], byteLength: bytes.byteLength };
  }
};
const rangeCodec: BinaryPayloadCodec<unknown> = {
  ...codec,
  decodeRange(bytes, byteOffset, byteLength) {
    decodedRangeBuffer = bytes;
    rangeReader.reset(bytes, byteOffset, byteLength);
    const first = rangeReader.readU8();
    rangeReader.reset(bytes, byteOffset + byteLength - 1, 1);
    return { checksum: first + rangeReader.readU8(), byteLength };
  }
};
const frame = encodeBinaryInputMessage({}, codec, { seq: 42 });
const copy = runMode("copy", codec);
const borrow = runMode("borrow", codec);
const borrowRange = runMode("borrow", rangeCodec);
if (copy.checksum !== borrow.checksum || copy.checksum !== borrowRange.checksum
  || copy.sharedFrameBuffer || !borrow.sharedFrameBuffer || !borrowRange.sharedFrameBuffer) {
  throw new Error("Binary input ownership parity or buffer-ownership proof failed.");
}

const report = createPerformanceEvidenceReport({
  benchmark: "protocol-input-ownership",
  environment: readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
  config: { iterations, payloadBytes, frameBytes: frame.byteLength },
  structuralEvidence: {
    lifetime: "borrowed bytes are valid only during synchronous codec decode and must not be retained",
    structuralDecision: "decodeRange eliminates both the payload backing-buffer copy and the per-parse subarray view",
    copyPayloadBackingBufferAllocations: copy.payloadBackingBufferAllocations,
    borrowRangePayloadBackingBufferAllocations: borrowRange.payloadBackingBufferAllocations,
    borrowRangePayloadViewObjects: borrowRange.payloadViewObjects
  },
  measurements: { copy, borrow, borrowRange }
});
await mkdir(path.dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function runMode(payloadOwnership: BinaryInputPayloadOwnership, inputCodec: BinaryPayloadCodec<unknown>) {
  const parser = createBinaryProtocolParser({ inputCodec, payloadOwnership });
  for (let warmup = 0; warmup < 3_000; warmup += 1) parser.parse(frame);
  const samplesMs: number[] = [];
  const heapDeltaBytes: number[] = [];
  const objectCountDelta: number[] = [];
  let checksum = 0;
  for (let round = 0; round < 8; round += 1) {
    Bun.gc(true);
    const before = heapStats();
    const startedAt = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      checksum += parser.parse(frame).payload?.checksum ?? 0;
    }
    samplesMs.push(performance.now() - startedAt);
    const after = heapStats();
    heapDeltaBytes.push(after.heapSize - before.heapSize);
    objectCountDelta.push(after.objectCount - before.objectCount);
  }
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    payloadOwnership,
    checksum,
    samplesMs,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    heapDeltaBytes,
    objectCountDelta,
    parseCalls: iterations * samplesMs.length,
    payloadBackingBufferAllocations: payloadOwnership === "copy" ? iterations * samplesMs.length : 0,
    payloadBytesCopied: payloadOwnership === "copy" ? payloadBytes * iterations * samplesMs.length : 0,
    payloadViewObjects: parser.payloadViewObjectsPerParse * iterations * samplesMs.length,
    parseOptionsObjects: 0,
    sharedFrameBuffer: inputCodec.decodeRange
      ? decodedRangeBuffer?.buffer === frame.buffer
      : decodedView?.buffer === frame.buffer
  };
}

function percentile(sorted: readonly number[], fraction: number) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
