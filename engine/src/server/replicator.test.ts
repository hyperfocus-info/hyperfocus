import { expect, test } from "bun:test";
import { decodeMultipartReplicationEnvelope, defineSchema, encodeDelta, encodeMultipartReplicationEnvelope, encodeReplicationFrame, encodeSnapshot, estimateMessageBytes } from "../protocol/index.ts";
import { createSharedMemoryPool, defineSharedSchema } from "../core/schema.ts";
import {
  createEntityReplicator,
  applyReplicationDelta,
  createSharedCellReplicator,
  createSharedEntityReplicationSegment,
  SHARED_CELL_DIRTY_SLAB_RECORD_BYTES,
  SHARED_CELL_DIRTY_SLAB_VERSION,
  SHARED_CELL_SLAB_HEADER_BYTES,
  SHARED_CELL_SLAB_RECORD_BYTES,
  SHARED_CELL_SLAB_VERSION
} from "./replicator.ts";

test("entity replicator snapshots, deltas, acks, and budget drops", () => {
  const schema = defineSchema({ x: "f32", hp: "u16" });
  const snapshotWireBytes = estimateMessageBytes(encodeSnapshot(schema, { x: 1, hp: 10 })) + 10;
  const replicator = createEntityReplicator({ schema, maxBytesPerClientPerSecond: snapshotWireBytes });
  const snapshot = replicator.snapshot("c1", { x: 1, hp: 10 });
  replicator.ack("c1", snapshot.sequence);
  const delta = replicator.delta("c1", { x: 1, hp: 10 }, { x: 2, hp: 10 });

  expect(snapshot.kind).toBe("snapshot");
  expect(delta.dropped).toBe(true);
  expect(replicator.stats("c1").lastAck).toBe(snapshot.sequence);
});

test("entity replicator starts new client budget windows from reset clock", () => {
  const schema = defineSchema({ ticks: "u16" });
  const maxBytesPerWindow = Math.max(
    estimateMessageBytes(encodeSnapshot(schema, { ticks: 1 })),
    estimateMessageBytes(encodeDelta(schema, { ticks: 1 }, { ticks: 2 }))
  ) + 10;
  const replicator = createEntityReplicator({ schema, maxBytesPerClientPerSecond: maxBytesPerWindow });

  replicator.resetWindow(10_000);
  expect(replicator.snapshot("c1", { ticks: 1 }).dropped).toBe(false);
  expect(replicator.delta("c1", { ticks: 1 }, { ticks: 2 }).dropped).toBe(true);

  replicator.resetWindow(10_999);
  expect(replicator.delta("c1", { ticks: 1 }, { ticks: 2 }).dropped).toBe(true);

  replicator.resetWindow(11_000);
  expect(replicator.delta("c1", { ticks: 1 }, { ticks: 2 }).dropped).toBe(false);
});

test("entity replicator emits multipart snapshots and deltas with ack baselines", () => {
  const schema = defineSchema({ ticks: "u16" });
  const replicator = createEntityReplicator({ schema });
  const segment = { id: "cell:0,0:volatile", kind: "world-cell-volatile", bytes: Uint8Array.from([1, 2, 3]) };

  const snapshot = replicator.multipartSnapshot("c1", [segment]);
  replicator.ack("c1", snapshot.sequence);
  const delta = replicator.multipartDelta("c1", [segment]);

  expect(snapshot.kind).toBe("multipart_snapshot");
  expect(delta.kind).toBe("multipart_delta");
  expect(delta.baseline).toBe(snapshot.sequence);
  expect(decodeMultipartReplicationEnvelope(snapshot.bytes).segments[0]).toMatchObject({ id: segment.id, kind: segment.kind });
});

test("entity replicator keeps volatile multipart data and defers static over budget", () => {
  const schema = defineSchema({ ticks: "u16" });
  const volatile = { id: "private:volatile", kind: "private-volatile", bytes: Uint8Array.from({ length: 60 }, (_, index) => index & 0xff) };
  const staticSegment = { id: "world-static:npc-1", kind: "world-cell-static", bytes: Uint8Array.from({ length: 70 }, (_, index) => index & 0xff) };
  const replicator = createEntityReplicator({ schema, maxBytesPerClientPerSecond: 150, telemetry: true });
  replicator.resetWindow(0);

  const first = replicator.multipartSnapshot("c1", [staticSegment, volatile]);
  const firstEnvelope = decodeMultipartReplicationEnvelope(first.bytes);
  const metrics = replicator.metrics();

  expect(first.dropped).toBe(false);
  expect(first.deferredSegments).toBe(1);
  expect(firstEnvelope.segments.map((segment) => segment.kind)).toEqual(["private-volatile"]);
  expect(metrics.currentTick.volatileBytes).toBe(volatile.bytes.byteLength);
  expect(metrics.currentTick.staticDeferredBytes).toBe(staticSegment.bytes.byteLength);
  expect(metrics.currentTick.staticDeferredCount).toBe(1);
  expect(metrics.currentTick.budgetUtilization).toBeGreaterThan(0);

  replicator.resetWindow(1_000);
  const second = replicator.multipartDelta("c1", []);
  const secondEnvelope = decodeMultipartReplicationEnvelope(second.bytes);

  expect(second.dropped).toBe(false);
  expect(secondEnvelope.segments.map((segment) => segment.id)).toEqual(["world-static:npc-1"]);
});

test("entity replicator can use shared memory slices for volatile multipart segments", () => {
  const schema = defineSchema({ ticks: "u16" });
  const sharedSchema = defineSharedSchema({ x: "f32", y: "f32", hp: "u16", flags: "u8" });
  const pool = createSharedMemoryPool(sharedSchema, { capacity: 1 });
  const { entity, slot } = pool.spawn({ x: 5, y: 7, hp: 99, flags: 3 });
  const replicator = createEntityReplicator({ schema, telemetry: true });

  const frame = replicator.multipartSnapshot("c1", [
    createSharedEntityReplicationSegment(pool, slot, "player-hot:1", "private-volatile")
  ]);
  const envelope = decodeMultipartReplicationEnvelope(frame.bytes);
  const payload = envelope.segments[0].bytes;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  expect(envelope.segments[0].id).toBe("player-hot:1");
  expect(view.getFloat32(sharedSchema.fieldMap.x.offset, true)).toBe(5);
  expect(view.getFloat32(sharedSchema.fieldMap.y.offset, true)).toBe(7);
  expect(view.getUint16(sharedSchema.fieldMap.hp.offset, true)).toBe(99);
  entity.hp = 42;

  const nextFrame = replicator.multipartDelta("c1", [
    createSharedEntityReplicationSegment(pool, slot, "player-hot:1", "private-volatile")
  ]);
  const nextPayload = decodeMultipartReplicationEnvelope(nextFrame.bytes).segments[0].bytes;
  const nextView = new DataView(nextPayload.buffer, nextPayload.byteOffset, nextPayload.byteLength);
  expect(nextView.getUint16(sharedSchema.fieldMap.hp.offset, true)).toBe(42);
  expect(replicator.metrics().currentTick.volatileBytes).toBe(sharedSchema.byteSize * 2);
});

test("shared cell replicator emits aligned metadata and slab bytes", () => {
  const sharedSchema = defineSharedSchema({ x: "f32", y: "f32", hp: "u16", targetId: "u32", action: "u8", combatState: "u8", statusMask: "u32" });
  const pool = createSharedMemoryPool(sharedSchema, { capacity: 2 });
  const first = pool.spawn({ x: 10, y: 20, hp: 91, targetId: 123, action: 2, combatState: 4, statusMask: 7 });
  const second = pool.spawn({ x: 30, y: 40, hp: 55, targetId: 456, action: 3, combatState: 5, statusMask: 8 });
  const cell = createSharedCellReplicator(pool).encodeCell([
    { idCode: 1001, typeCode: 1, slotIndex: second.slot },
    { idCode: 1000, typeCode: 2, slotIndex: first.slot }
  ]);
  const view = new DataView(cell.buffer, cell.byteOffset, cell.byteLength);
  const headerBytes = SHARED_CELL_SLAB_HEADER_BYTES + 2 * SHARED_CELL_SLAB_RECORD_BYTES;

  expect(cell[0]).toBe(SHARED_CELL_SLAB_VERSION);
  expect(view.getUint16(2, true)).toBe(2);
  expect(view.getUint16(4, true)).toBe(sharedSchema.byteSize);
  expect(view.getUint16(6, true)).toBe(headerBytes);
  expect(view.getUint32(SHARED_CELL_SLAB_HEADER_BYTES, true)).toBe(1000);
  expect(view.getUint32(SHARED_CELL_SLAB_HEADER_BYTES + SHARED_CELL_SLAB_RECORD_BYTES, true)).toBe(1001);
  expect(view.getFloat32(headerBytes + sharedSchema.fieldMap.x.offset, true)).toBe(10);
  expect(view.getUint16(headerBytes + sharedSchema.fieldMap.hp.offset, true)).toBe(91);
  expect(view.getFloat32(headerBytes + sharedSchema.byteSize + sharedSchema.fieldMap.x.offset, true)).toBe(30);
  expect(view.getUint32(headerBytes + sharedSchema.byteSize + sharedSchema.fieldMap.targetId.offset, true)).toBe(456);
});

test("shared cell replicator skips contiguous-copy assumptions for cache-line-padded slots", () => {
  const sharedSchema = defineSharedSchema({ value: "u16" });
  const pool = createSharedMemoryPool(sharedSchema, { capacity: 2, cacheLineAlignedSlots: true });
  const first = pool.spawn({ value: 111 });
  const second = pool.spawn({ value: 222 });
  const cell = createSharedCellReplicator(pool).encodeCell([
    { idCode: 1, typeCode: 1, slotIndex: first.slot },
    { idCode: 2, typeCode: 1, slotIndex: second.slot }
  ]);
  const headerBytes = SHARED_CELL_SLAB_HEADER_BYTES + 2 * SHARED_CELL_SLAB_RECORD_BYTES;
  const view = new DataView(cell.buffer, cell.byteOffset, cell.byteLength);
  expect(view.getUint16(headerBytes, true)).toBe(111);
  expect(view.getUint16(headerBytes + sharedSchema.byteSize, true)).toBe(222);
});

test("shared cell replicator emits dirty slab rows without clean payload copies", () => {
  const sharedSchema = defineSharedSchema({ x: "f32", y: "f32", hp: "u16", flags: "u8" });
  const pool = createSharedMemoryPool(sharedSchema, { capacity: 2 });
  const first = pool.spawn({ x: 10, y: 20, hp: 91, flags: 3 });
  const second = pool.spawn({ x: 30, y: 40, hp: 55, flags: 8 });
  const cell = createSharedCellReplicator(pool, {
    fullDirtyMask: 3,
    dirtyRanges: [
      { mask: 1, offset: sharedSchema.fieldMap.x.offset, byteLength: 4 },
      { mask: 2, offset: sharedSchema.fieldMap.hp.offset, byteLength: 2 }
    ]
  }).encodeCell([
    { idCode: 1000, typeCode: 2, slotIndex: first.slot, dirtyMask: 1 },
    { idCode: 1001, typeCode: 1, slotIndex: second.slot, dirtyMask: 0 }
  ]);
  const view = new DataView(cell.buffer, cell.byteOffset, cell.byteLength);
  const headerBytes = SHARED_CELL_SLAB_HEADER_BYTES + 2 * SHARED_CELL_DIRTY_SLAB_RECORD_BYTES;

  expect(cell[0]).toBe(SHARED_CELL_DIRTY_SLAB_VERSION);
  expect(view.getUint16(2, true)).toBe(2);
  expect(view.getUint16(6, true)).toBe(headerBytes);
  expect(cell.byteLength).toBe(headerBytes + 4);
  expect(view.getUint8(SHARED_CELL_SLAB_HEADER_BYTES + 9)).toBe(1);
  expect(view.getUint16(SHARED_CELL_SLAB_HEADER_BYTES + 12, true)).toBe(4);
  expect(view.getUint8(SHARED_CELL_SLAB_HEADER_BYTES + SHARED_CELL_DIRTY_SLAB_RECORD_BYTES + 9)).toBe(0);
  expect(view.getUint16(SHARED_CELL_SLAB_HEADER_BYTES + SHARED_CELL_DIRTY_SLAB_RECORD_BYTES + 12, true)).toBe(0);
  expect(view.getFloat32(headerBytes, true)).toBe(10);
});

test("entity replicator wraps u32 sequences without producing invalid frames", () => {
  const schema = defineSchema({ value: "u16" });
  const replicator = createEntityReplicator({ schema, initialSequence: 0xfffffffe });

  const snapshot = replicator.snapshot("wrap", { value: 1 });
  expect(snapshot.sequence).toBe(0xffffffff);
  expect(replicator.ack("wrap", snapshot.sequence)).toBe(true);

  const delta = replicator.delta("wrap", { value: 1 }, { value: 2 });
  expect(delta.sequence).toBe(0);
  expect(delta.baseline).toBe(0xffffffff);
  expect(() => encodeReplicationFrame(delta)).not.toThrow();
});

test("entity replicator accepts acknowledgements only for the latest sent packet", () => {
  const schema = defineSchema({ value: "u16" });
  const replicator = createEntityReplicator({ schema });
  const snapshot = replicator.snapshot("ack", { value: 1 });
  const delta = replicator.delta("ack", { value: 1 }, { value: 2 });

  expect(replicator.ack("ack", snapshot.sequence)).toBe(false);
  expect(replicator.ack("ack", delta.sequence)).toBe(true);
  expect(replicator.ack("ack", delta.sequence)).toBe(false);
  expect(() => replicator.ack("ack", 0x1_0000_0000)).toThrow("0 through 4294967295");
});

test("multipart segment identity cannot collide across kind and id delimiters", () => {
  const schema = defineSchema({ value: "u16" });
  const replicator = createEntityReplicator({ schema });
  const packet = replicator.multipartSnapshot("keys", [
    { kind: "a:b", id: "c", bytes: Uint8Array.of(1) },
    { kind: "a", id: "b:c", bytes: Uint8Array.of(2) }
  ]);

  expect(decodeMultipartReplicationEnvelope(packet.bytes).segments).toHaveLength(2);
});

test("multipart encode failures do not discard deferred static segments", () => {
  const schema = defineSchema({ value: "u16" });
  const replicator = createEntityReplicator({ schema, maxBytesPerClientPerSecond: 150, telemetry: true });
  const volatile = { id: "volatile", kind: "private-volatile", bytes: new Uint8Array(60) };
  const staticSegment = { id: "static", kind: "world-cell-static", bytes: new Uint8Array(70) };
  replicator.multipartSnapshot("stable", [volatile, staticSegment]);
  expect(replicator.metrics().pendingStaticCount).toBe(1);

  replicator.resetWindow(1000);
  const unstable = {
    id: "unstable",
    kind: "private-volatile",
    bytes: Uint8Array.of(1),
    sharedSource: { readTick: () => 1, maxAttempts: 1 }
  };
  expect(() => replicator.multipartDelta("stable", [unstable])).toThrow("changed during multipart encode");
  expect(replicator.metrics().pendingStaticCount).toBe(1);
});

test("oversized static segments make bounded forward progress", () => {
  const schema = defineSchema({ value: "u16" });
  const replicator = createEntityReplicator({ schema, maxBytesPerClientPerSecond: 1 });
  const segment = { id: "large", kind: "world-cell-static", bytes: new Uint8Array(64) };

  const packet = replicator.multipartSnapshot("oversized", [segment]);
  expect(packet.dropped).toBe(false);
  expect(decodeMultipartReplicationEnvelope(packet.bytes).segments.map((entry) => entry.id)).toEqual(["large"]);
  expect(replicator.metrics().pendingStaticCount).toBe(0);
});

test("replication windows reject invalid and backwards time", () => {
  const replicator = createEntityReplicator({ schema: defineSchema({ value: "u16" }) });
  replicator.resetWindow(100);
  expect(() => replicator.resetWindow(Number.NaN)).toThrow("non-negative finite");
  expect(() => replicator.resetWindow(99)).toThrow("cannot move backwards");
});

test("schema delta application rejects non-delta and dropped packets", () => {
  const schema = defineSchema({ value: "u16" });
  const replicator = createEntityReplicator({ schema });
  const snapshot = replicator.snapshot("apply", { value: 1 });
  const multipartBytes = encodeMultipartReplicationEnvelope({ sequence: 2, baseline: 1, segments: [] });

  expect(() => applyReplicationDelta(schema, { value: 1 }, snapshot)).toThrow("cannot be applied");
  expect(() => applyReplicationDelta(schema, { value: 1 }, { kind: "multipart_delta", sequence: 2, baseline: 1, bytes: multipartBytes, dropped: false })).toThrow("cannot be applied");
  expect(() => applyReplicationDelta(schema, { value: 1 }, { kind: "delta", sequence: 2, baseline: 1, bytes: new Uint8Array(), dropped: true })).toThrow("dropped or empty");
});

test("shared cell replication rejects values that would truncate its slab format", () => {
  const sharedSchema = defineSharedSchema({ value: "u8" });
  const pool = createSharedMemoryPool(sharedSchema, { capacity: 1 });
  const slot = pool.spawn({ value: 1 }).slot;

  expect(() => createSharedCellReplicator(pool, { maxAttempts: 0 })).toThrow("positive safe integer");
  expect(() => createSharedCellReplicator(pool, { dirtyRanges: [{ mask: 1, offset: 1, byteLength: 1 }] })).toThrow("exceeds slotByteSize");
  expect(() => createSharedCellReplicator(pool).encodeCell([{ idCode: 1, typeCode: 256, slotIndex: slot }])).toThrow("0 through 255");
  const excessiveHeader = Array.from({ length: 5461 }, (_, index) => ({ idCode: index, typeCode: 1, slotIndex: slot }));
  expect(() => createSharedCellReplicator(pool).encodeCell(excessiveHeader)).toThrow("header exceeds u16");
});
