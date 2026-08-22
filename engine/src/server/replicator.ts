import { decodeDelta, encodeDelta } from "../protocol/delta.ts";
import { encodeSnapshot } from "../protocol/encode.ts";
import { encodeMultipartReplicationEnvelope, type ReplicationEnvelopeSegment, type ReplicationPacket } from "../protocol/frames.ts";
import type { ReplicationSchema } from "../protocol/schema.ts";
import { isSharedMemoryReadConsistent, isSharedMemoryTickStable, type SharedMemoryPool } from "../core/schema.ts";

export type { ReplicationPacket } from "../protocol/frames.ts";

export type ReplicationPriorityFn<TState> = (state: TState, clientId: string) => number;

export type SharedReplicationSegmentSource = {
  readTick(): number;
  maxAttempts?: number;
};

export type SharedReplicationEnvelopeSegment<TKind extends string = string> = ReplicationEnvelopeSegment<TKind> & {
  sharedSource?: SharedReplicationSegmentSource;
};

export const SHARED_CELL_SLAB_VERSION = 1;
export const SHARED_CELL_DIRTY_SLAB_VERSION = 2;
export const SHARED_CELL_SLAB_HEADER_BYTES = 8;
export const SHARED_CELL_SLAB_RECORD_BYTES = 12;
export const SHARED_CELL_DIRTY_SLAB_RECORD_BYTES = 16;
const MULTIPART_ENVELOPE_BASE_BYTES = 12;
const MULTIPART_SEGMENT_HEADER_BYTES = 8;
const REPLICATION_FRAME_HEADER_BYTES = 10;
const MAX_U8 = 0xff;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffffffff;
const multipartTextEncoder = new TextEncoder();

export type SharedCellReplicationEntity = {
  readonly idCode: number;
  readonly typeCode: number;
  readonly slotIndex: number;
  readonly dirtyMask?: number;
};

export type SharedCellDirtyRange = {
  readonly mask: number;
  readonly offset: number;
  readonly byteLength: number;
};

export type SharedCellReplicatorOptions = {
  readonly maxAttempts?: number;
  readonly dirtyRanges?: readonly SharedCellDirtyRange[];
  readonly fullDirtyMask?: number;
};

export type SharedCellReplicator<TKind extends string = string> = {
  encodeCell(entities: readonly SharedCellReplicationEntity[]): Uint8Array;
  segment(id: string, kind: TKind, entities: readonly SharedCellReplicationEntity[]): ReplicationEnvelopeSegment<TKind>;
};

export type EntityReplicatorOptions<TState> = {
  schema: ReplicationSchema<TState>;
  snapshotRate?: number;
  deltaRate?: number;
  maxBytesPerClientPerSecond?: number;
  telemetry?: boolean;
  priority?: ReplicationPriorityFn<TState>;
  initialSequence?: number;
};

export type ReplicationMetricsSample = {
  volatileBytes: number;
  staticDeferredBytes: number;
  staticDeferredCount: number;
  totalBytes: number;
  budgetUtilization: number;
  packets: number;
};

export type ReplicationMetrics = {
  enabled: boolean;
  currentTick: ReplicationMetricsSample;
  rollingAverage: ReplicationMetricsSample;
  rollingSamples: number;
  pendingStaticCount: number;
  pendingStaticBytes: number;
  maxBytesPerClientPerSecond: number;
};

export type EntityReplicator<TState> = {
  snapshot(clientId: string, state: TState): ReplicationPacket;
  delta(clientId: string, before: TState | undefined, after: TState): ReplicationPacket;
  multipartSnapshot(clientId: string, segments: readonly ReplicationEnvelopeSegment[]): ReplicationPacket;
  multipartDelta(clientId: string, segments: readonly ReplicationEnvelopeSegment[]): ReplicationPacket;
  ack(clientId: string, sequence: number): boolean;
  removeClient(clientId: string): boolean;
  clear(): void;
  beginTick(): void;
  resetWindow(nowMs?: number): void;
  stats(clientId: string): { bytesThisSecond: number; lastAck?: number; lastSequence?: number };
  metrics(): ReplicationMetrics;
};

export function createSharedEntityReplicationSegment<TKind extends string>(
  pool: Pick<SharedMemoryPool<any>, "getEntityByteSlice" | "readTick">,
  slotIndex: number,
  id: string,
  kind: TKind,
  options: { maxAttempts?: number } = {}
): SharedReplicationEnvelopeSegment<TKind> {
  assertIntegerInRange("shared replication slotIndex", slotIndex, MAX_U32);
  if (typeof id !== "string" || id.length === 0) throw new Error("shared replication segment id is required");
  if (typeof kind !== "string" || kind.length === 0) throw new Error("shared replication segment kind is required");
  if (options.maxAttempts !== undefined) assertPositiveSafeInteger("shared replication maxAttempts", options.maxAttempts);
  return {
    id,
    kind,
    bytes: pool.getEntityByteSlice(slotIndex),
    sharedSource: {
      readTick: () => pool.readTick(),
      maxAttempts: options.maxAttempts
    }
  };
}

function multipartTextByteLength(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) return multipartTextEncoder.encode(value).byteLength;
  }
  return value.length;
}

function multipartSegmentByteLength(segment: ReplicationEnvelopeSegment) {
  return MULTIPART_SEGMENT_HEADER_BYTES + multipartTextByteLength(segment.id) + multipartTextByteLength(segment.kind) + segment.bytes.byteLength;
}

function assertIntegerInRange(name: string, value: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError(`${name} must be an integer from 0 through ${maximum}`);
}

function assertPositiveSafeInteger(name: string, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
}

function nextSequence(sequence: number) {
  return (sequence + 1) >>> 0;
}

function wireByteLength(payload: Uint8Array) {
  return REPLICATION_FRAME_HEADER_BYTES + payload.byteLength;
}

export function createSharedCellReplicator<TKind extends string = string>(
  pool: Pick<SharedMemoryPool<any>, "slotByteSize" | "buffer" | "getEntityByteOffset" | "getEntityByteSlice" | "readTick"> & { readonly slotStrideByteSize?: number },
  options: SharedCellReplicatorOptions = {}
): SharedCellReplicator<TKind> {
  const maxAttempts = options.maxAttempts ?? 8;
  const dirtyRanges = options.dirtyRanges ?? [];
  const fullDirtyMask = options.fullDirtyMask ?? dirtyRanges.reduce((mask, range) => mask | range.mask, 0);
  assertPositiveSafeInteger("shared cell maxAttempts", maxAttempts);
  assertPositiveSafeInteger("shared cell slotByteSize", pool.slotByteSize);
  if (pool.slotByteSize > MAX_U16) throw new RangeError("shared cell slotByteSize must fit in u16");
  assertIntegerInRange("shared cell fullDirtyMask", fullDirtyMask, MAX_U8);
  for (const [index, range] of dirtyRanges.entries()) {
    assertIntegerInRange(`shared cell dirtyRanges[${index}].mask`, range.mask, MAX_U8);
    if (range.mask === 0) throw new RangeError(`shared cell dirtyRanges[${index}].mask must be positive`);
    assertIntegerInRange(`shared cell dirtyRanges[${index}].offset`, range.offset, MAX_U16);
    assertIntegerInRange(`shared cell dirtyRanges[${index}].byteLength`, range.byteLength, MAX_U16);
    if (range.byteLength === 0) throw new RangeError(`shared cell dirtyRanges[${index}].byteLength must be positive`);
    if (range.offset + range.byteLength > pool.slotByteSize) throw new RangeError(`shared cell dirtyRanges[${index}] exceeds slotByteSize`);
  }

  function validateEntities(entities: readonly SharedCellReplicationEntity[], recordBytes: number) {
    assertIntegerInRange("shared cell entity count", entities.length, MAX_U16);
    const headerBytes = SHARED_CELL_SLAB_HEADER_BYTES + entities.length * recordBytes;
    if (headerBytes > MAX_U16) throw new RangeError("shared cell header exceeds u16");
    for (const [index, entity] of entities.entries()) {
      assertIntegerInRange(`shared cell entities[${index}].idCode`, entity.idCode, MAX_U32);
      assertIntegerInRange(`shared cell entities[${index}].typeCode`, entity.typeCode, MAX_U8);
      assertIntegerInRange(`shared cell entities[${index}].slotIndex`, entity.slotIndex, MAX_U32);
      if (entity.dirtyMask !== undefined) assertIntegerInRange(`shared cell entities[${index}].dirtyMask`, entity.dirtyMask, MAX_U8);
    }
    return headerBytes;
  }

  function sortedEntities(entities: readonly SharedCellReplicationEntity[]) {
    return [...entities].sort((a, b) => a.slotIndex - b.slotIndex || a.idCode - b.idCode || a.typeCode - b.typeCode);
  }

  function writeHeader(bytes: Uint8Array, entities: readonly SharedCellReplicationEntity[], headerBytes: number) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    bytes[0] = SHARED_CELL_SLAB_VERSION;
    bytes[1] = 0;
    view.setUint16(2, entities.length, true);
    view.setUint16(4, pool.slotByteSize, true);
    view.setUint16(6, headerBytes, true);
    let offset = SHARED_CELL_SLAB_HEADER_BYTES;
    for (const entity of entities) {
      view.setUint32(offset, entity.idCode >>> 0, true);
      view.setUint32(offset + 4, entity.slotIndex >>> 0, true);
      bytes[offset + 8] = entity.typeCode & 0xff;
      bytes[offset + 9] = 0;
      bytes[offset + 10] = 0;
      bytes[offset + 11] = 0;
      offset += SHARED_CELL_SLAB_RECORD_BYTES;
    }
  }

  function copyBlob(bytes: Uint8Array, entities: readonly SharedCellReplicationEntity[], blobOffset: number) {
    if (!entities.length) return;
    const firstSlot = entities[0].slotIndex;
    let contiguous = true;
    for (let index = 1; index < entities.length; index += 1) {
      if (entities[index].slotIndex !== firstSlot + index) {
        contiguous = false;
        break;
      }
    }
    if (contiguous && (pool.slotStrideByteSize ?? pool.slotByteSize) === pool.slotByteSize) {
      const sourceOffset = pool.getEntityByteOffset(firstSlot);
      bytes.set(new Uint8Array(pool.buffer, sourceOffset, entities.length * pool.slotByteSize), blobOffset);
      return;
    }
    for (let index = 0; index < entities.length; index += 1) {
      bytes.set(pool.getEntityByteSlice(entities[index].slotIndex), blobOffset + index * pool.slotByteSize);
    }
  }

  function encodeCellOnce(entities: readonly SharedCellReplicationEntity[]) {
    const ordered = sortedEntities(entities);
    if (dirtyRanges.length) return encodeDirtyCellOnce(ordered);
    const headerBytes = validateEntities(ordered, SHARED_CELL_SLAB_RECORD_BYTES);
    const bytes = new Uint8Array(headerBytes + ordered.length * pool.slotByteSize);
    writeHeader(bytes, ordered, headerBytes);
    copyBlob(bytes, ordered, headerBytes);
    return bytes;
  }

  function encodeDirtyCellOnce(entities: readonly SharedCellReplicationEntity[]) {
    const headerBytes = validateEntities(entities, SHARED_CELL_DIRTY_SLAB_RECORD_BYTES);
    let totalPayloadBytes = 0;
    for (const entity of entities) {
      const mask = entity.dirtyMask ?? fullDirtyMask;
      for (const range of dirtyRanges) {
        if ((mask & range.mask) !== 0) totalPayloadBytes += range.byteLength;
      }
    }
    if (headerBytes + totalPayloadBytes > MAX_U16) throw new RangeError("shared dirty cell slab exceeds u16 offsets");
    const bytes = new Uint8Array(headerBytes + totalPayloadBytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    bytes[0] = SHARED_CELL_DIRTY_SLAB_VERSION;
    bytes[1] = 0;
    view.setUint16(2, entities.length, true);
    view.setUint16(4, pool.slotByteSize, true);
    view.setUint16(6, headerBytes, true);
    let payloadOffset = headerBytes;
    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index];
      const mask = (entity.dirtyMask ?? fullDirtyMask) & 0xff;
      const recordOffset = SHARED_CELL_SLAB_HEADER_BYTES + index * SHARED_CELL_DIRTY_SLAB_RECORD_BYTES;
      let payloadLength = 0;
      for (const range of dirtyRanges) {
        if ((mask & range.mask) !== 0) payloadLength += range.byteLength;
      }
      view.setUint32(recordOffset, entity.idCode >>> 0, true);
      view.setUint32(recordOffset + 4, entity.slotIndex >>> 0, true);
      bytes[recordOffset + 8] = entity.typeCode & 0xff;
      bytes[recordOffset + 9] = mask;
      view.setUint16(recordOffset + 10, payloadOffset >>> 0, true);
      view.setUint16(recordOffset + 12, payloadLength >>> 0, true);
      view.setUint16(recordOffset + 14, 0, true);
      if (!mask) continue;
      const entityOffset = pool.getEntityByteOffset(entity.slotIndex);
      for (const range of dirtyRanges) {
        if ((mask & range.mask) === 0) continue;
        bytes.set(new Uint8Array(pool.buffer, entityOffset + range.offset, range.byteLength), payloadOffset);
        payloadOffset += range.byteLength;
      }
    }
    return bytes;
  }

  function encodeCell(entities: readonly SharedCellReplicationEntity[]) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const before = pool.readTick();
      if (!isSharedMemoryTickStable(before)) continue;
      const bytes = encodeCellOnce(entities);
      const after = pool.readTick();
      if (isSharedMemoryReadConsistent(before, after)) return bytes;
    }
    throw new Error(`shared cell slab changed during encode after ${maxAttempts} attempts`);
  }

  return {
    encodeCell,
    segment(id, kind, entities) {
      return { id, kind, bytes: encodeCell(entities) };
    }
  };
}

export function createEntityReplicator<TState>(options: EntityReplicatorOptions<TState>): EntityReplicator<TState> {
  const maxBytes = options.maxBytesPerClientPerSecond ?? 32 * 1024;
  const telemetryEnabled = options.telemetry ?? false;
  assertIntegerInRange("maxBytesPerClientPerSecond", maxBytes, Number.MAX_SAFE_INTEGER);
  if (options.snapshotRate !== undefined && (!Number.isFinite(options.snapshotRate) || options.snapshotRate <= 0)) {
    throw new RangeError("snapshotRate must be a positive finite number");
  }
  if (options.deltaRate !== undefined && (!Number.isFinite(options.deltaRate) || options.deltaRate <= 0)) {
    throw new RangeError("deltaRate must be a positive finite number");
  }
  if (options.initialSequence !== undefined) assertIntegerInRange("initialSequence", options.initialSequence, MAX_U32);
  const clientStats = new Map<string, { bytesThisSecond: number; lastAck?: number; lastSequence?: number; windowStartedAt: number }>();
  const pendingStaticSegments = new Map<string, ReplicationEnvelopeSegment[]>();
  const rollingSamples: ReplicationMetricsSample[] = [];
  let sequence = options.initialSequence ?? 0;
  let currentWindowNow = performance.now();
  let lastWindowResetAt: number | undefined;
  let currentTickMetrics = emptyMetricsSample();

  function emptyMetricsSample(): ReplicationMetricsSample {
    return {
      volatileBytes: 0,
      staticDeferredBytes: 0,
      staticDeferredCount: 0,
      totalBytes: 0,
      budgetUtilization: 0,
      packets: 0
    };
  }

  function updateBudgetUtilization(sample: ReplicationMetricsSample) {
    sample.budgetUtilization = sample.packets > 0 ? sample.totalBytes / Math.max(1, maxBytes * sample.packets) : 0;
  }

  function recordMetrics(sample: Omit<ReplicationMetricsSample, "budgetUtilization" | "packets">) {
    if (!telemetryEnabled) return;
    currentTickMetrics.volatileBytes += sample.volatileBytes;
    currentTickMetrics.staticDeferredBytes += sample.staticDeferredBytes;
    currentTickMetrics.staticDeferredCount += sample.staticDeferredCount;
    currentTickMetrics.totalBytes += sample.totalBytes;
    currentTickMetrics.packets += 1;
    updateBudgetUtilization(currentTickMetrics);
  }

  function hasMetrics(sample: ReplicationMetricsSample) {
    return sample.packets > 0 || sample.volatileBytes > 0 || sample.staticDeferredBytes > 0 || sample.staticDeferredCount > 0 || sample.totalBytes > 0;
  }

  function pushRollingSample(sample: ReplicationMetricsSample) {
    if (!hasMetrics(sample)) return;
    rollingSamples.push({ ...sample });
    while (rollingSamples.length > 100) rollingSamples.shift();
  }

  function averageSamples(samples: readonly ReplicationMetricsSample[]) {
    if (!samples.length) return emptyMetricsSample();
    const total = emptyMetricsSample();
    for (const sample of samples) {
      total.volatileBytes += sample.volatileBytes;
      total.staticDeferredBytes += sample.staticDeferredBytes;
      total.staticDeferredCount += sample.staticDeferredCount;
      total.totalBytes += sample.totalBytes;
      total.packets += sample.packets;
    }
    const average = {
      volatileBytes: total.volatileBytes / samples.length,
      staticDeferredBytes: total.staticDeferredBytes / samples.length,
      staticDeferredCount: total.staticDeferredCount / samples.length,
      totalBytes: total.totalBytes / samples.length,
      budgetUtilization: 0,
      packets: total.packets / samples.length
    };
    average.budgetUtilization = samples.reduce((sum, sample) => sum + sample.budgetUtilization, 0) / samples.length;
    return average;
  }

  function stateFor(clientId: string) {
    let stats = clientStats.get(clientId);
    if (!stats) {
      stats = { bytesThisSecond: 0, windowStartedAt: currentWindowNow };
      clientStats.set(clientId, stats);
    }
    return stats;
  }

  function packet(clientId: string, kind: ReplicationPacket["kind"], bytes: Uint8Array, baseline = 0): ReplicationPacket {
    const stats = stateFor(clientId);
    const size = wireByteLength(bytes);
    sequence = nextSequence(sequence);
    const dropped = stats.bytesThisSecond + size > maxBytes;
    if (!dropped) stats.bytesThisSecond += size;
    if (!dropped) stats.lastSequence = sequence;
    recordMetrics({ volatileBytes: 0, staticDeferredBytes: 0, staticDeferredCount: 0, totalBytes: dropped ? 0 : size });
    return { kind, sequence, baseline, bytes: dropped ? new Uint8Array() : bytes, dropped };
  }

  function segmentRank(segment: ReplicationEnvelopeSegment) {
    if (segment.kind === "private-volatile") return 1;
    if (segment.kind === "world-cell-volatile") return 2;
    if (segment.kind === "transient") return 3;
    if (segment.kind === "private-static") return 4;
    if (segment.kind === "world-cell-static") return 5;
    return segment.kind.includes("static") ? 6 : 3;
  }

  function isStaticSegment(segment: ReplicationEnvelopeSegment) {
    return segment.kind.includes("static");
  }

  function isVolatileSegment(segment: ReplicationEnvelopeSegment) {
    return segment.kind.includes("volatile");
  }

  function segmentKey(segment: ReplicationEnvelopeSegment) {
    return JSON.stringify([segment.kind, segment.id]);
  }

  function compareSegments(a: ReplicationEnvelopeSegment, b: ReplicationEnvelopeSegment) {
    return segmentRank(a) - segmentRank(b) || a.id.localeCompare(b.id);
  }

  function orderedUniqueSegments(clientId: string, segments: readonly ReplicationEnvelopeSegment[]) {
    const byId = new Map<string, ReplicationEnvelopeSegment>();
    for (const segment of pendingStaticSegments.get(clientId) ?? []) byId.set(segmentKey(segment), segment);
    for (const segment of segments) byId.set(segmentKey(segment), segment);
    return [...byId.values()].sort(compareSegments);
  }

  function setPendingStaticSegments(clientId: string, segments: ReplicationEnvelopeSegment[]) {
    if (segments.length) pendingStaticSegments.set(clientId, segments);
    else pendingStaticSegments.delete(clientId);
  }

  function multipartPacket(clientId: string, kind: "multipart_snapshot" | "multipart_delta", segments: readonly ReplicationEnvelopeSegment[], baseline = 0): ReplicationPacket {
    const stats = stateFor(clientId);
    const selected: ReplicationEnvelopeSegment[] = [];
    const deferred: ReplicationEnvelopeSegment[] = [];
    const packetSequence = nextSequence(sequence);
    let selectedWireBytes = REPLICATION_FRAME_HEADER_BYTES + MULTIPART_ENVELOPE_BASE_BYTES;
    const orderedSegments = orderedUniqueSegments(clientId, segments);
    for (const segment of orderedSegments) {
      const segmentBytes = multipartSegmentByteLength(segment);
      if (!isStaticSegment(segment)) {
        selected.push(segment);
        selectedWireBytes += segmentBytes;
        continue;
      }
      if (stats.bytesThisSecond + selectedWireBytes + segmentBytes <= maxBytes) {
        selected.push(segment);
        selectedWireBytes += segmentBytes;
      } else {
        deferred.push(segment);
      }
    }
    if (selected.length === 0 && stats.bytesThisSecond === 0 && deferred.length > 0) {
      selected.push(deferred.shift()!);
    }
    if (selected.length === 0 && stats.bytesThisSecond + selectedWireBytes > maxBytes) {
      setPendingStaticSegments(clientId, deferred);
      sequence = packetSequence;
      recordMetrics({ volatileBytes: 0, staticDeferredBytes: deferred.reduce((total, segment) => total + segment.bytes.byteLength, 0), staticDeferredCount: deferred.length, totalBytes: 0 });
      return { kind, sequence, baseline, bytes: new Uint8Array(), dropped: true, deferredSegments: deferred.length, segments: [] };
    }
    const bytes = encodeMultipartEnvelopeStable(packetSequence, baseline, selected);
    const size = wireByteLength(bytes);
    setPendingStaticSegments(clientId, deferred);
    sequence = packetSequence;
    stats.bytesThisSecond += size;
    stats.lastSequence = sequence;
    if (telemetryEnabled) {
      const volatileBytes = selected.reduce((total, segment) => total + (isVolatileSegment(segment) ? segment.bytes.byteLength : 0), 0);
      const staticDeferredBytes = deferred.reduce((total, segment) => total + segment.bytes.byteLength, 0);
      recordMetrics({ volatileBytes, staticDeferredBytes, staticDeferredCount: deferred.length, totalBytes: size });
    }
    return { kind, sequence, baseline, bytes, dropped: false, deferredSegments: deferred.length, segments: selected };
  }

  function sharedSources(segments: readonly ReplicationEnvelopeSegment[]): SharedReplicationSegmentSource[] {
    const sources: SharedReplicationSegmentSource[] = [];
    for (const segment of segments) {
      const source = (segment as SharedReplicationEnvelopeSegment).sharedSource;
      if (source) sources.push(source);
    }
    return sources;
  }

  function encodeMultipartEnvelopeStable(sequence: number, baseline: number, segments: readonly ReplicationEnvelopeSegment[]) {
    const sources = sharedSources(segments);
    if (!sources.length) return encodeMultipartReplicationEnvelope({ sequence, baseline, segments });
    const sourceAttempts = sources.map((source, index) => {
      const attempts = source.maxAttempts ?? 4;
      assertPositiveSafeInteger(`shared replication source ${index} maxAttempts`, attempts);
      return attempts;
    });
    const maxAttempts = Math.min(...sourceAttempts);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const before = sources.map((source) => source.readTick());
      if (before.some((tick) => !isSharedMemoryTickStable(tick))) continue;
      const bytes = encodeMultipartReplicationEnvelope({ sequence, baseline, segments });
      const after = sources.map((source) => source.readTick());
      if (before.every((tick, index) => isSharedMemoryReadConsistent(tick, after[index]))) return bytes;
    }
    throw new Error(`shared replication segment changed during multipart encode after ${maxAttempts} attempts`);
  }

  return {
    snapshot(clientId, state) {
      return packet(clientId, "snapshot", encodeSnapshot(options.schema, state));
    },
    delta(clientId, before, after) {
      if (!before) return this.snapshot(clientId, after);
      const stats = stateFor(clientId);
      return packet(clientId, "delta", encodeDelta(options.schema, before, after), stats.lastSequence ?? stats.lastAck ?? 0);
    },
    multipartSnapshot(clientId, segments) {
      return multipartPacket(clientId, "multipart_snapshot", segments);
    },
    multipartDelta(clientId, segments) {
      const stats = stateFor(clientId);
      const baseline = stats.lastSequence ?? stats.lastAck ?? 0;
      return multipartPacket(clientId, "multipart_delta", segments, baseline);
    },
    ack(clientId, ackSequence) {
      assertIntegerInRange("replication acknowledgement", ackSequence, MAX_U32);
      const stats = stateFor(clientId);
      if (stats.lastSequence === undefined || ackSequence !== stats.lastSequence || ackSequence === stats.lastAck) return false;
      stats.lastAck = ackSequence;
      return true;
    },
    removeClient(clientId) {
      const removed = clientStats.delete(clientId);
      pendingStaticSegments.delete(clientId);
      return removed;
    },
    clear() {
      clientStats.clear();
      pendingStaticSegments.clear();
      rollingSamples.length = 0;
      currentTickMetrics = emptyMetricsSample();
    },
    beginTick() {
      if (!telemetryEnabled) return;
      pushRollingSample(currentTickMetrics);
      currentTickMetrics = emptyMetricsSample();
    },
    resetWindow(nowMs = performance.now()) {
      if (!Number.isFinite(nowMs) || nowMs < 0) throw new RangeError("replication window time must be a non-negative finite number");
      if (lastWindowResetAt !== undefined && nowMs < lastWindowResetAt) throw new RangeError("replication window time cannot move backwards");
      lastWindowResetAt = nowMs;
      currentWindowNow = nowMs;
      for (const stats of clientStats.values()) {
        if (nowMs - stats.windowStartedAt >= 1000) {
          stats.bytesThisSecond = 0;
          stats.windowStartedAt = nowMs;
        }
      }
    },
    stats(clientId) {
      const stats = stateFor(clientId);
      return { bytesThisSecond: stats.bytesThisSecond, lastAck: stats.lastAck, lastSequence: stats.lastSequence };
    },
    metrics() {
      let pendingStaticCount = 0;
      let pendingStaticBytes = 0;
      for (const segments of pendingStaticSegments.values()) {
        pendingStaticCount += segments.length;
        for (const segment of segments) pendingStaticBytes += segment.bytes.byteLength;
      }
      return {
        enabled: telemetryEnabled,
        currentTick: { ...currentTickMetrics },
        rollingAverage: telemetryEnabled ? averageSamples(rollingSamples) : emptyMetricsSample(),
        rollingSamples: telemetryEnabled ? rollingSamples.length : 0,
        pendingStaticCount,
        pendingStaticBytes,
        maxBytesPerClientPerSecond: maxBytes
      };
    }
  };
}

export function applyReplicationDelta<TState>(schema: ReplicationSchema<TState>, baseline: TState, packet: ReplicationPacket): TState {
  if (packet.kind !== "delta") throw new Error(`replication packet kind ${packet.kind} cannot be applied as a schema delta`);
  if (packet.dropped || packet.bytes.byteLength === 0) throw new Error("dropped or empty replication delta cannot be applied");
  return decodeDelta(schema, baseline, packet.bytes);
}
