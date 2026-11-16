export type BinaryJournalLimits = {
  maxBytes?: number;
  maxOperations?: number;
};

export type BinaryJournalEntry = {
  kind: "snapshot" | "delta";
  sequence: number;
  baselineSequence?: number;
  bytes: Uint8Array;
};

export type EncodeBinaryJournalOptions = BinaryJournalLimits & {
  sequence: number;
  baselineSequence?: number;
  baseline?: Uint8Array;
};

const MAGIC = 0x314a4648; // HFJ1, little endian
const VERSION = 1;
const KIND_SNAPSHOT = 0;
const KIND_DELTA = 1;
const HEADER_BYTES = 40;
const DEFAULT_MAX_BYTES = 4194304;
const DEFAULT_MAX_OPERATIONS = 65_535;

function u32(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  return value;
}

function limits(options: BinaryJournalLimits) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 0xffff_ffff) throw new RangeError("binary journal maxBytes must be an unsigned 32-bit integer");
  if (!Number.isSafeInteger(maxOperations) || maxOperations < 0 || maxOperations > 0xffff_ffff) throw new RangeError("binary journal maxOperations must be an unsigned 32-bit integer");
  return { maxBytes, maxOperations };
}

function bytes(value: Uint8Array, label: string) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${label} must be a Uint8Array`);
  return value;
}

function checksum(parts: readonly Uint8Array[]) {
  let hash = 2166136261;
  for (const part of parts) {
    for (const value of part) hash = Math.imul(hash ^ value, 16777619);
  }
  return hash >>> 0;
}

/** Encodes a bounded snapshot or a smaller changed-run delta, whichever wins. */
export function encodeBinaryJournalEntry(current: Uint8Array, options: EncodeBinaryJournalOptions): Uint8Array {
  bytes(current, "binary journal current bytes");
  const resolved = limits(options);
  const sequence = u32(options.sequence, "binary journal sequence");
  if (current.byteLength > resolved.maxBytes) throw new RangeError(`binary journal result exceeds ${resolved.maxBytes} bytes`);
  const baseline = options.baseline;
  const canDelta = baseline !== undefined && options.baselineSequence !== undefined;
  if ((baseline === undefined) !== (options.baselineSequence === undefined)) {
    throw new Error("binary journal baseline bytes and sequence must be provided together");
  }

  let kind = KIND_SNAPSHOT;
  let baselineSequence = 0;
  let baselineLength = 0;
  let operationCount = 0;
  let payload = new Uint8Array(current);

  if (canDelta) {
    bytes(baseline, "binary journal baseline bytes");
    baselineSequence = u32(options.baselineSequence!, "binary journal baseline sequence");
    baselineLength = baseline.byteLength;
    if (baselineLength > resolved.maxBytes) throw new RangeError(`binary journal baseline exceeds ${resolved.maxBytes} bytes`);
    const runs: Array<{ offset: number; length: number }> = [];
    let offset = 0;
    while (offset < current.byteLength) {
      if (offset < baseline.byteLength && current[offset] === baseline[offset]) {
        offset += 1;
        continue;
      }
      const start = offset;
      do {
        offset += 1;
      } while (offset < current.byteLength && (offset >= baseline.byteLength || current[offset] !== baseline[offset]));
      runs.push({ offset: start, length: offset - start });
      if (runs.length > resolved.maxOperations) break;
    }
    const changedBytes = runs.reduce((sum, run) => sum + run.length, 0);
    const deltaLength = changedBytes + runs.length * 8;
    if (runs.length <= resolved.maxOperations && deltaLength < current.byteLength) {
      kind = KIND_DELTA;
      operationCount = runs.length;
      payload = new Uint8Array(deltaLength);
      const view = new DataView(payload.buffer);
      let payloadOffset = 0;
      for (const run of runs) {
        view.setUint32(payloadOffset, run.offset, true);
        view.setUint32(payloadOffset + 4, run.length, true);
        payload.set(current.subarray(run.offset, run.offset + run.length), payloadOffset + 8);
        payloadOffset += 8 + run.length;
      }
    }
  }
  if (kind === KIND_SNAPSHOT) {
    baselineSequence = 0;
    baselineLength = 0;
  }

  if (HEADER_BYTES + payload.byteLength > resolved.maxBytes) throw new RangeError(`binary journal entry exceeds ${resolved.maxBytes} bytes`);
  const output = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, MAGIC, true);
  output[4] = VERSION;
  output[5] = kind;
  view.setUint16(6, 0, true);
  view.setUint32(8, sequence, true);
  view.setUint32(12, baselineSequence, true);
  view.setUint32(16, baselineLength, true);
  view.setUint32(20, current.byteLength, true);
  view.setUint32(24, operationCount, true);
  view.setUint32(28, payload.byteLength, true);
  view.setUint32(36, checksum([current]), true);
  output.set(payload, HEADER_BYTES);
  view.setUint32(32, checksum([output.subarray(0, 32), output.subarray(36, 40), payload]), true);
  return output;
}

/** Decodes and applies one journal entry. Its checksum detects corruption but is not authentication. */
export function decodeBinaryJournalEntry(
  encoded: Uint8Array,
  baseline?: Uint8Array,
  options: BinaryJournalLimits = {}
): BinaryJournalEntry {
  bytes(encoded, "binary journal entry");
  const resolved = limits(options);
  if (encoded.byteLength > resolved.maxBytes) throw new RangeError(`binary journal entry exceeds ${resolved.maxBytes} bytes`);
  if (encoded.byteLength < HEADER_BYTES) throw new Error("binary journal entry is truncated");
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  if (view.getUint32(0, true) !== MAGIC || encoded[4] !== VERSION || view.getUint16(6, true) !== 0) throw new Error("binary journal header is invalid or unsupported");
  const kind = encoded[5];
  if (kind !== KIND_SNAPSHOT && kind !== KIND_DELTA) throw new Error("binary journal entry kind is invalid");
  const sequence = view.getUint32(8, true);
  const baselineSequence = view.getUint32(12, true);
  const baselineLength = view.getUint32(16, true);
  const resultLength = view.getUint32(20, true);
  const operationCount = view.getUint32(24, true);
  const payloadLength = view.getUint32(28, true);
  const expectedChecksum = view.getUint32(32, true);
  const expectedResultChecksum = view.getUint32(36, true);
  if (resultLength > resolved.maxBytes || operationCount > resolved.maxOperations) throw new RangeError("binary journal decoded bounds exceed configured limits");
  if (payloadLength !== encoded.byteLength - HEADER_BYTES) throw new Error("binary journal payload length is invalid");
  const payload = encoded.subarray(HEADER_BYTES);
  if (checksum([encoded.subarray(0, 32), encoded.subarray(36, 40), payload]) !== expectedChecksum) throw new Error("binary journal checksum verification failed");

  if (kind === KIND_SNAPSHOT) {
    if (baselineLength !== 0 || operationCount !== 0 || payloadLength !== resultLength) throw new Error("binary journal snapshot metadata is invalid");
    const result = new Uint8Array(payload);
    if (checksum([result]) !== expectedResultChecksum) throw new Error("binary journal result checksum verification failed");
    return { kind: "snapshot", sequence, bytes: result };
  }

  const baselineBytes = bytes(baseline!, "binary journal delta baseline");
  if (baselineBytes.byteLength !== baselineLength) throw new Error(`binary journal baseline length mismatch: expected ${baselineLength}, received ${baselineBytes.byteLength}`);
  const result = new Uint8Array(resultLength);
  result.set(baselineBytes.subarray(0, resultLength));
  const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let payloadOffset = 0;
  let previousEnd = 0;
  for (let index = 0; index < operationCount; index += 1) {
    if (payloadOffset + 8 > payload.byteLength) throw new Error("binary journal delta operation is truncated");
    const offset = payloadView.getUint32(payloadOffset, true);
    const length = payloadView.getUint32(payloadOffset + 4, true);
    payloadOffset += 8;
    if (length === 0 || offset < previousEnd || offset + length > resultLength || payloadOffset + length > payload.byteLength) {
      throw new Error("binary journal delta operation is invalid or overlapping");
    }
    result.set(payload.subarray(payloadOffset, payloadOffset + length), offset);
    payloadOffset += length;
    previousEnd = offset + length;
  }
  if (payloadOffset !== payload.byteLength) throw new Error("binary journal delta has trailing payload bytes");
  if (checksum([result]) !== expectedResultChecksum) throw new Error("binary journal result checksum verification failed");
  return { kind: "delta", sequence, baselineSequence, bytes: result };
}
