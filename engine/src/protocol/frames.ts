import { PROTOCOL_VERSION } from "./messages.ts";

export type ReplicationFrameKind = "snapshot" | "delta" | "ack" | "event" | "multipart_snapshot" | "multipart_delta";

export type ReplicationFrameMeta = {
  kind: ReplicationFrameKind;
  sequence: number;
  baseline: number;
};

export type ReplicationFrame = ReplicationFrameMeta & {
  bytes: Uint8Array;
};

export type ReplicationPacket = ReplicationFrame & {
  dropped: boolean;
  deferredSegments?: number;
  segments?: readonly ReplicationEnvelopeSegment[];
};

const HEADER_BYTES = 10;
const ENVELOPE_HEADER_BYTES = HEADER_BYTES + 2;
const SEGMENT_HEADER_BYTES = 8;
const MULTIPART_ENVELOPE_KIND = 32;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export type ReplicationEnvelopeSegment<TKind extends string = string> = {
  id: string;
  kind: TKind;
  bytes: Uint8Array;
};

export type MultipartReplicationEnvelope<TKind extends string = string> = {
  sequence: number;
  baseline: number;
  segments: readonly ReplicationEnvelopeSegment<TKind>[];
};

const kindToByte: Record<ReplicationFrameKind, number> = {
  snapshot: 1,
  delta: 2,
  ack: 3,
  event: 4,
  multipart_snapshot: 5,
  multipart_delta: 6
};

const byteToKind: Record<number, ReplicationFrameKind | undefined> = {
  1: "snapshot",
  2: "delta",
  3: "ack",
  4: "event",
  5: "multipart_snapshot",
  6: "multipart_delta"
};

function assertU16Length(label: string, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError(`${label} must fit in u16`);
}

function assertU32Length(label: string, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must fit in u32`);
}

function encodeSegmentText(label: string, value: string) {
  const bytes = textEncoder.encode(value);
  if (bytes.byteLength === 0) throw new Error(`replication envelope segment ${label} is required`);
  assertU16Length(`replication envelope segment ${label}`, bytes.byteLength);
  return bytes;
}

function ensureAvailable(bytes: Uint8Array, offset: number, length: number, label: string) {
  if (offset + length > bytes.byteLength) throw new Error(`multipart replication envelope ${label} exceeds packet length`);
}

export function encodeReplicationFrame(packet: ReplicationFrame): Uint8Array {
  assertU32Length("replication frame sequence", packet.sequence);
  assertU32Length("replication frame baseline", packet.baseline);
  if (!(packet.bytes instanceof Uint8Array)) throw new Error("replication frame bytes must be Uint8Array");
  const kind = kindToByte[packet.kind];
  if (typeof kind !== "number") throw new Error(`unsupported replication frame kind: ${String(packet.kind)}`);
  const frame = new Uint8Array(HEADER_BYTES + packet.bytes.byteLength);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  frame[0] = PROTOCOL_VERSION;
  frame[1] = kind;
  view.setUint32(2, packet.sequence, true);
  view.setUint32(6, packet.baseline, true);
  frame.set(packet.bytes, HEADER_BYTES);
  return frame;
}

export function decodeReplicationFrame(bytes: Uint8Array): ReplicationFrame {
  if (bytes.byteLength < HEADER_BYTES) throw new Error("replication frame too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) throw new Error(`unsupported replication frame version: ${version}`);
  const kind = byteToKind[view.getUint8(1)];
  if (!kind) throw new Error(`unsupported replication frame kind: ${view.getUint8(1)}`);
  return {
    kind,
    sequence: view.getUint32(2, true),
    baseline: view.getUint32(6, true),
    bytes: bytes.subarray(HEADER_BYTES)
  };
}

export function encodeMultipartReplicationEnvelope(envelope: MultipartReplicationEnvelope): Uint8Array {
  assertU32Length("multipart replication envelope sequence", envelope.sequence);
  assertU32Length("multipart replication envelope baseline", envelope.baseline);
  assertU16Length("multipart replication envelope segment count", envelope.segments.length);
  const prepared = envelope.segments.map((segment) => {
    if (!(segment.bytes instanceof Uint8Array)) throw new Error("replication envelope segment bytes must be Uint8Array");
    const id = encodeSegmentText("id", segment.id);
    const kind = encodeSegmentText("kind", segment.kind);
    assertU32Length("replication envelope segment payload", segment.bytes.byteLength);
    return { id, kind, bytes: segment.bytes };
  });
  const payloadBytes = prepared.reduce((total, segment) => total + SEGMENT_HEADER_BYTES + segment.id.byteLength + segment.kind.byteLength + segment.bytes.byteLength, 0);
  const frame = new Uint8Array(ENVELOPE_HEADER_BYTES + payloadBytes);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  frame[0] = PROTOCOL_VERSION;
  frame[1] = MULTIPART_ENVELOPE_KIND;
  view.setUint32(2, envelope.sequence, true);
  view.setUint32(6, envelope.baseline, true);
  view.setUint16(HEADER_BYTES, prepared.length, true);
  let offset = ENVELOPE_HEADER_BYTES;
  for (const segment of prepared) {
    view.setUint16(offset, segment.id.byteLength, true);
    view.setUint16(offset + 2, segment.kind.byteLength, true);
    view.setUint32(offset + 4, segment.bytes.byteLength, true);
    offset += SEGMENT_HEADER_BYTES;
    frame.set(segment.id, offset);
    offset += segment.id.byteLength;
    frame.set(segment.kind, offset);
    offset += segment.kind.byteLength;
    frame.set(segment.bytes, offset);
    offset += segment.bytes.byteLength;
  }
  return frame;
}

export function decodeMultipartReplicationEnvelope<TKind extends string = string>(bytes: Uint8Array): MultipartReplicationEnvelope<TKind> {
  if (bytes.byteLength < ENVELOPE_HEADER_BYTES) throw new Error("multipart replication envelope too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== PROTOCOL_VERSION) throw new Error(`unsupported multipart replication envelope version: ${version}`);
  const envelopeKind = view.getUint8(1);
  if (envelopeKind !== MULTIPART_ENVELOPE_KIND) throw new Error(`unsupported multipart replication envelope kind: ${envelopeKind}`);
  const segmentCount = view.getUint16(HEADER_BYTES, true);
  const segments: ReplicationEnvelopeSegment<TKind>[] = [];
  let offset = ENVELOPE_HEADER_BYTES;
  for (let index = 0; index < segmentCount; index += 1) {
    ensureAvailable(bytes, offset, SEGMENT_HEADER_BYTES, "segment header");
    const idLength = view.getUint16(offset, true);
    const kindLength = view.getUint16(offset + 2, true);
    const payloadLength = view.getUint32(offset + 4, true);
    offset += SEGMENT_HEADER_BYTES;
    ensureAvailable(bytes, offset, idLength, "segment id");
    if (idLength === 0) throw new Error("replication envelope segment id is required");
    const id = textDecoder.decode(bytes.subarray(offset, offset + idLength));
    offset += idLength;
    ensureAvailable(bytes, offset, kindLength, "segment kind");
    if (kindLength === 0) throw new Error("replication envelope segment kind is required");
    const kind = textDecoder.decode(bytes.subarray(offset, offset + kindLength)) as TKind;
    offset += kindLength;
    ensureAvailable(bytes, offset, payloadLength, "segment payload");
    const payload = bytes.subarray(offset, offset + payloadLength);
    offset += payloadLength;
    segments.push({ id, kind, bytes: payload });
  }
  if (offset !== bytes.byteLength) throw new Error("multipart replication envelope has trailing bytes");
  return {
    sequence: view.getUint32(2, true),
    baseline: view.getUint32(6, true),
    segments
  };
}
