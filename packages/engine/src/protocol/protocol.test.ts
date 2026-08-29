import { expect, test } from "bun:test";
import { createBinaryReader, createBinaryWriter, createReusableBinaryReader } from "./byte-buffer.ts";
import { decodeDelta, encodeDelta } from "./delta.ts";
import { decodeSnapshot, encodeSnapshot, estimateMessageBytes, PREENCODED_SNAPSHOT_BYTES } from "./encode.ts";
import { decodeMultipartReplicationEnvelope, decodeReplicationFrame, encodeMultipartReplicationEnvelope, encodeReplicationFrame } from "./frames.ts";
import { createBinaryProtocolParser, createProtocolMessage, encodeBinaryInputMessage, encodeProtocolMessage, parseBinaryProtocolMessage, parseProtocolMessage, PROTOCOL_BINARY_INPUT_MAX_BYTES, PROTOCOL_CONTROL_FRAME_MAX_BYTES, type BinaryPayloadCodec } from "./messages.ts";
import { defineSchema, defineSchemaFor, defineSchemaProjection } from "./schema.ts";

if (false) {
  defineSchemaFor<{ x: number }>()({ x: "u16" });
  // @ts-expect-error Checked schema builders cannot omit or rename state fields.
  defineSchemaFor<{ x: number }>()({ y: "u16" });
  // @ts-expect-error Checked schema builders cannot encode a number as a boolean.
  defineSchemaFor<{ x: number }>()({ x: "bool" });
  // @ts-expect-error Checked schema builders require nested state fields too.
  defineSchemaFor<{ point: { x: number; y: number } }>()({ point: { x: "f32" } });
  defineSchemaFor<{ value: number; derived?: string }>()({ value: "u16" });
  defineSchemaProjection<{ value: number; derived: string }, { value: number }>({ value: "u16" });
}
import { createSnapshotFrameCodec } from "./snapshot-frame.ts";

test("protocol messages reject malformed roots, metadata, and wrapping binary sequences", () => {
  expect(() => parseProtocolMessage("null")).toThrow("must be an object");
  expect(() => parseProtocolMessage('{"v":1,"type":"input","seq":-1}')).toThrow("seq");
  expect(() => parseProtocolMessage('{"v":1,"type":"input","seq":4294967296}')).toThrow("seq");
  expect(() => parseProtocolMessage('{"v":1,"type":"input","roomId":7}')).toThrow("roomId");
  expect(() => parseProtocolMessage('{"v":1,"type":"input","playerId":""}')).toThrow("playerId");
  expect(() => encodeProtocolMessage({ v: 1, type: "event", seq: Number.NaN })).toThrow("seq");

  const codec = { encode: () => new Uint8Array(), decode: () => null };
  expect(() => encodeBinaryInputMessage(null, codec, { seq: -1 })).toThrow("seq");
  expect(() => encodeBinaryInputMessage(null, codec, { seq: 0x1_0000_0000 })).toThrow("seq");
  expect(createProtocolMessage("event", {}, { seq: 0xffffffff }).seq).toBe(0xffffffff);
});

test("JSON protocol messages reject payloads that would serialize lossily", () => {
  expect(() => createProtocolMessage("event", { value: Number.NaN })).toThrow("JSON wire-safe");
  expect(() => createProtocolMessage("event", { value: undefined })).toThrow("JSON wire-safe");
  expect(() => createProtocolMessage("event", { value: () => 1 })).toThrow("JSON wire-safe");
  expect(() => createProtocolMessage("event", { value: 1n })).toThrow("JSON wire-safe");
  expect(() => createProtocolMessage("event", new Date())).toThrow("JSON wire-safe");
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  expect(() => createProtocolMessage("event", cycle)).toThrow("JSON wire-safe");
  const shared = { value: 1 };
  expect(() => createProtocolMessage("event", { first: shared, second: shared })).toThrow("JSON wire-safe");
  expect(() => createProtocolMessage("event", undefined)).not.toThrow();
  expect(parseProtocolMessage(encodeProtocolMessage(createProtocolMessage("event", { value: null })))).toMatchObject({ payload: { value: null } });
});

test("protocol control and input frames reject oversized or deeply nested payloads", () => {
  expect(() => parseProtocolMessage("x".repeat(PROTOCOL_CONTROL_FRAME_MAX_BYTES + 1))).toThrow("exceeds");
  expect(() => encodeProtocolMessage(createProtocolMessage("event", { text: "x".repeat(PROTOCOL_CONTROL_FRAME_MAX_BYTES) }))).toThrow("wire-safe");
  let nested: Record<string, unknown> = {};
  for (let depth = 0; depth < 65; depth += 1) nested = { nested };
  expect(() => createProtocolMessage("event", nested)).toThrow("wire-safe");
  const codec = { encode: () => new Uint8Array(PROTOCOL_BINARY_INPUT_MAX_BYTES), decode: () => ({}) };
  expect(() => encodeBinaryInputMessage({}, codec)).toThrow("exceeds");
});

const playerSchema = defineSchema<{
  id: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  name: string;
}>({
  id: "string:32",
  x: "f32",
  y: "f32",
  hp: "u16",
  alive: "bool",
  name: "string:32"
});

test("protocol snapshot encodes and decodes schema values", () => {
  const state = { id: "p1", x: 10.5, y: -4.25, hp: 99, alive: true, name: "Rin" };
  const bytes = encodeSnapshot(playerSchema, state);

  expect(decodeSnapshot(playerSchema, bytes)).toEqual(state);
  expect(bytes).toBeInstanceOf(Uint8Array);
});

test("protocol snapshot can return non-enumerable preencoded bytes", () => {
  const schema = defineSchema({ tick: "u32" });
  const preencoded = Uint8Array.from([9, 8, 7]);
  const state = { tick: 1 };
  Object.defineProperty(state, PREENCODED_SNAPSHOT_BYTES, { value: preencoded });

  expect(encodeSnapshot(schema, state)).toBe(preencoded);
});

test("protocol delta patches changed top-level fields", () => {
  const before = { id: "p1", x: 10, y: 2, hp: 100, alive: true, name: "Rin" };
  const after = { id: "p1", x: 12, y: 2, hp: 80, alive: true, name: "Rin" };

  const bytes = encodeDelta(playerSchema, before, after);

  expect(decodeDelta(playerSchema, before, bytes)).toEqual(after);
  expect(bytes.byteLength).toBeLessThan(encodeSnapshot(playerSchema, after).byteLength);
});

test("protocol delta can use opt-in dirty root field hints", () => {
  const before = { id: "p1", x: 10, y: 2, hp: 100, alive: true, name: "Rin" };
  const after = { id: "p1", x: 12, y: 99, hp: 80, alive: true, name: "Rin" };

  const bytes = encodeDelta(playerSchema, before, after, { dirtyFields: ["x", "hp", "x"] });

  expect(decodeDelta(playerSchema, before, bytes)).toEqual({ ...before, x: 12, hp: 80 });
  expect(() => encodeDelta(playerSchema, before, after, { dirtyFields: ["missing"] })).toThrow("dirty delta field");
});

test("protocol delta can carry full snapshot without baseline", () => {
  const after = { id: "p1", x: 12, y: 2, hp: 80, alive: true, name: "Rin" };

  expect(decodeDelta(playerSchema, null, encodeDelta(playerSchema, null, after))).toEqual(after);
});

test("protocol delta patch requires a baseline", () => {
  const before = { id: "p1", x: 10, y: 2, hp: 100, alive: true, name: "Rin" };
  const after = { id: "p1", x: 12, y: 2, hp: 80, alive: true, name: "Rin" };

  expect(() => decodeDelta(playerSchema, null, encodeDelta(playerSchema, before, after))).toThrow("baseline");
});

test("protocol replication frame wraps binary snapshot payload", () => {
  const bytes = encodeSnapshot(playerSchema, { id: "p1", x: 1, y: 2, hp: 10, alive: true, name: "Rin" });
  const frame = decodeReplicationFrame(encodeReplicationFrame({ kind: "snapshot", sequence: 7, baseline: 0, bytes }));

  expect(frame.kind).toBe("snapshot");
  expect(frame.sequence).toBe(7);
  expect(decodeSnapshot(playerSchema, frame.bytes).id).toBe("p1");
});

test("snapshot frame codec wraps schema snapshots with custom normalization", () => {
  const codec = createSnapshotFrameCodec<
    { type: "state"; tick: number; name: string | null },
    { tick: number; name: string }
  >({
    schema: defineSchema({ tick: "u32", name: "string:16" }),
    normalize: (snapshot) => ({ tick: snapshot.tick, name: snapshot.name ?? "" }),
    denormalize: (encoded) => ({ type: "state", tick: encoded.tick, name: encoded.name || null }),
    sequence: (encoded) => encoded.tick
  });

  const decoded = codec.decodeFrame(codec.encode({ type: "state", tick: 42, name: null }));

  expect(decoded.frame.sequence).toBe(42);
  expect(decoded.snapshot).toEqual({ type: "state", tick: 42, name: null });
});

test("snapshot frame codec keeps identity schemas on a same-type path", () => {
  const codec = createSnapshotFrameCodec({ schema: defineSchema({ tick: "u32" }), sequence: (encoded) => encoded.tick });
  const decoded = codec.decodeFrame(codec.encode({ tick: 7 }));
  expect(decoded.frame.sequence).toBe(7);
  expect(decoded.snapshot).toEqual({ tick: 7 });
});

test("protocol frame decoders expose zero-copy payload views", () => {
  const payload = Uint8Array.from([1, 2, 3, 4]);
  const frameBytes = encodeReplicationFrame({ kind: "delta", sequence: 9, baseline: 4, bytes: payload });
  const frame = decodeReplicationFrame(frameBytes);
  expect(frame.bytes.buffer).toBe(frameBytes.buffer);
  expect(frame.bytes.byteOffset).toBe(frameBytes.byteOffset + 10);
  expect([...frame.bytes]).toEqual([...payload]);

  const envelopeBytes = encodeMultipartReplicationEnvelope({
    sequence: 10,
    baseline: 9,
    segments: [{ id: "cell:1", kind: "delta", bytes: payload }]
  });
  const envelope = decodeMultipartReplicationEnvelope(envelopeBytes);
  expect(envelope.segments[0].bytes.buffer).toBe(envelopeBytes.buffer);
  expect([...envelope.segments[0].bytes]).toEqual([...payload]);
});

test("protocol multipart replication envelope preserves segment ids, kinds, and binary payloads", () => {
  const snapshot = encodeSnapshot(playerSchema, { id: "p1", x: 1, y: 2, hp: 10, alive: true, name: "Rin" });
  const raw = Uint8Array.from([99, 0, 255, 1, 2, 10, 13, 34, 92, 100]).subarray(1, 9);
  const encoded = encodeMultipartReplicationEnvelope({
    sequence: 12,
    baseline: 7,
    segments: [
      { id: "player:p1", kind: "snapshot", bytes: snapshot },
      { id: "fx:hit:7", kind: "event", bytes: raw }
    ]
  });
  const decoded = decodeMultipartReplicationEnvelope(encoded, {
    parseKind(kind): "snapshot" | "event" {
      if (kind === "snapshot" || kind === "event") return kind;
      throw new Error(`Unexpected segment kind: ${kind}`);
    },
  });

  expect(decoded.sequence).toBe(12);
  expect(decoded.baseline).toBe(7);
  expect(decoded.segments).toHaveLength(2);
  expect(decoded.segments[0].id).toBe("player:p1");
  expect(decoded.segments[0].kind).toBe("snapshot");
  expect(decodeSnapshot(playerSchema, decoded.segments[0].bytes).name).toBe("Rin");
  expect(decoded.segments[1].id).toBe("fx:hit:7");
  expect(decoded.segments[1].kind).toBe("event");
  expect([...decoded.segments[1].bytes]).toEqual([...raw]);
});

test("protocol multipart replication envelope rejects truncated segment payloads", () => {
  const encoded = encodeMultipartReplicationEnvelope({
    sequence: 1,
    baseline: 0,
    segments: [{ id: "segment:1", kind: "delta", bytes: Uint8Array.from([1, 2, 3, 4]) }]
  });

  expect(() => decodeMultipartReplicationEnvelope(encoded.slice(0, -1))).toThrow("segment payload");
});

test("protocol multipart replication envelope validates caller-owned segment kinds", () => {
  const encoded = encodeMultipartReplicationEnvelope({
    sequence: 1,
    baseline: 0,
    segments: [{ id: "segment:1", kind: "unknown", bytes: new Uint8Array() }],
  });

  expect(() => decodeMultipartReplicationEnvelope(encoded, {
    parseKind(kind): "snapshot" {
      if (kind === "snapshot") return kind;
      throw new Error(`Unexpected segment kind: ${kind}`);
    },
  })).toThrow("Unexpected segment kind: unknown");
});

test("protocol enforces string length caps and estimates message bytes", () => {
  expect(() => encodeSnapshot(playerSchema, { id: "p1", x: 0, y: 0, hp: 1, alive: true, name: "x".repeat(33) })).toThrow();
  expect(estimateMessageBytes({ type: "join_room" })).toBeGreaterThan(0);
});

test("protocol snapshot decoder rejects truncated, trailing, and noncanonical payloads", () => {
  const stringSchema = defineSchema({ name: "string:5" });
  const boolSchema = defineSchema({ alive: "bool" });
  const valid = encodeSnapshot(stringSchema, { name: "ok" });
  const trailing = new Uint8Array(valid.byteLength + 1);
  trailing.set(valid);
  trailing[valid.byteLength] = 99;

  expect(() => decodeSnapshot(stringSchema, Uint8Array.from([5, 0, 65]))).toThrow("buffer length");
  expect(() => decodeSnapshot(stringSchema, trailing)).toThrow("trailing bytes");
  expect(() => decodeSnapshot(boolSchema, Uint8Array.from([2]))).toThrow("0 or 1");
  expect(() => decodeSnapshot(defineSchema({ name: "string:1" }), Uint8Array.from([2, 0, 65, 66]))).toThrow("max length 1");
});

test("protocol validates collection schema limits and decoded collection counts", () => {
  expect(() => defineSchema({ values: { type: "array", item: "u8", maxLength: -1 } })).toThrow("array maxLength");
  expect(() => defineSchema({ values: { type: "array", item: "u8", maxLength: 65_536 } })).toThrow("array maxLength");
  expect(() => defineSchema({ values: { type: "map", key: "string", value: "u8", maxEntries: 1.5 } })).toThrow("map maxEntries");

  const arraySchema = defineSchema({ values: { type: "array", item: "u8", maxLength: 1 } });
  const mapSchema = defineSchema({ values: { type: "map", key: "string", value: "u8", maxEntries: 1 } });
  expect(() => decodeSnapshot(arraySchema, Uint8Array.from([2, 0, 1, 2]))).toThrow("array exceeds");
  expect(() => decodeSnapshot(mapSchema, Uint8Array.from([2, 0]))).toThrow("map exceeds");

  const baseline = { values: [1] };
  const delta = encodeDelta(arraySchema, baseline, { values: [2] });
  const oversizedDelta = delta.slice();
  oversizedDelta[6] = 2;
  expect(() => decodeDelta(arraySchema, baseline, oversizedDelta)).toThrow("array exceeds");
});

test("protocol delta decoder rejects trailing bytes", () => {
  const before = { id: "p1", x: 10, y: 2, hp: 100, alive: true, name: "Rin" };
  const after = { ...before, hp: 90 };
  const delta = encodeDelta(playerSchema, before, after);
  const trailing = new Uint8Array(delta.byteLength + 1);
  trailing.set(delta);

  expect(() => decodeDelta(playerSchema, before, trailing)).toThrow("trailing bytes");
});

test("protocol frame encoders reject sequence and baseline values that would wrap", () => {
  const bytes = Uint8Array.from([1]);
  expect(() => encodeReplicationFrame({ kind: "snapshot", sequence: -1, baseline: 0, bytes })).toThrow("sequence");
  expect(() => encodeReplicationFrame({ kind: "snapshot", sequence: Number.NaN, baseline: 0, bytes })).toThrow("sequence");
  expect(() => encodeReplicationFrame({ kind: "snapshot", sequence: 1, baseline: 0x1_0000_0000, bytes })).toThrow("baseline");
  expect(() => encodeMultipartReplicationEnvelope({ sequence: 1.5, baseline: 0, segments: [] })).toThrow("sequence");
});

test("protocol rejects numeric values that would silently coerce or wrap", () => {
  const strictSchema = defineSchema({
    hp: "u8",
    coins: "u16",
    signed: "i16",
    precise: "f32",
    ids: { type: "map", key: "u32", value: "u8" }
  });
  const valid = { hp: 1, coins: 2, signed: -3, precise: 4.5, ids: { 7: 1 } };

  expect(() => encodeSnapshot(strictSchema, { ...valid, hp: 300 })).toThrow("u8");
  expect(() => encodeSnapshot(strictSchema, { ...valid, coins: -1 })).toThrow("u16");
  expect(() => encodeSnapshot(strictSchema, { ...valid, signed: 40000 })).toThrow("i16");
  expect(() => encodeSnapshot(strictSchema, { ...valid, precise: Number.NaN })).toThrow("f32");
  expect(() => encodeSnapshot(strictSchema, { ...valid, ids: { bad: 1 } })).toThrow("u32 map key");
});

test("protocol json fields preserve arbitrary small payloads", () => {
  const jsonSchema = defineSchema({ data: { type: "json", maxLength: 128 } });
  const state = { data: { name: "Rin", flags: ["ready"], nested: { rank: 2 } } };

  expect(decodeSnapshot(jsonSchema, encodeSnapshot(jsonSchema, state))).toEqual(state);
  expect(() => encodeSnapshot(jsonSchema, { data: { text: "x".repeat(200) } })).toThrow("json");
});

test("optional protocol json fields distinguish missing values from explicit null", () => {
  const schema = defineSchema({ data: { type: "json", maxLength: 128, optional: true } });

  expect(decodeSnapshot(schema, encodeSnapshot(schema, { data: undefined }))).toEqual({ data: undefined });
  expect(decodeSnapshot(schema, encodeSnapshot(schema, { data: null }))).toEqual({ data: null });
  const explicitNull = decodeDelta(schema, { data: undefined }, encodeDelta(schema, { data: undefined }, { data: null }));
  expect(explicitNull).toEqual({ data: null });
  expect(decodeDelta(schema, explicitNull, encodeDelta(schema, explicitNull, { data: undefined }))).toEqual({ data: undefined });
});

test("protocol encodes high-rate input as binary payloads", () => {
  const codec = {
    encode(input: { action: number; x: number; y: number }) {
      const bytes = new Uint8Array(9);
      const view = new DataView(bytes.buffer);
      bytes[0] = input.action;
      view.setFloat32(1, input.x, true);
      view.setFloat32(5, input.y, true);
      return bytes;
    },
    decode(bytes: Uint8Array) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { action: bytes[0], x: view.getFloat32(1, true), y: view.getFloat32(5, true) };
    }
  };

  const frame = encodeBinaryInputMessage({ action: 3, x: 12.5, y: -4 }, codec, { seq: 42 });
  const message = parseBinaryProtocolMessage(frame, codec);

  expect(message).toMatchObject({ type: "input", seq: 42, payload: { action: 3, x: 12.5, y: -4 } });
  expect(frame.byteLength).toBeLessThan(JSON.stringify({ v: 1, type: "input", seq: 42, payload: { action: 3, x: 12.5, y: -4 } }).length);
});

test("protocol binary input parser keeps copied payloads by default", () => {
  let decodedBytes: Uint8Array | undefined;
  const codec = {
    encode: () => Uint8Array.from([3, 4, 5]),
    decode: (bytes: Uint8Array) => {
      decodedBytes = bytes;
      return { action: bytes[0] };
    }
  };
  const frame = encodeBinaryInputMessage({ action: 3 }, codec, { seq: 1 });
  const message = parseBinaryProtocolMessage(frame, codec);

  expect(message.payload?.action).toBe(3);
  expect(decodedBytes?.buffer).not.toBe(frame.buffer);
  expect([...decodedBytes!]).toEqual([3, 4, 5]);
});

test("protocol binary input parser can expose an opt-in zero-copy payload view", () => {
  let decodedBytes: Uint8Array | undefined;
  const codec = {
    encode: () => Uint8Array.from([7, 8, 9]),
    decode: (bytes: Uint8Array) => {
      decodedBytes = bytes;
      return { action: bytes[0] };
    }
  };
  const frame = encodeBinaryInputMessage({ action: 7 }, codec, { seq: 2 });
  const message = parseBinaryProtocolMessage(frame, codec, { payloadOwnership: "borrow" });

  expect(message.payload?.action).toBe(7);
  expect(decodedBytes?.buffer).toBe(frame.buffer);
  expect(decodedBytes?.byteOffset).toBe(frame.byteOffset + 6);
  expect([...decodedBytes!]).toEqual([7, 8, 9]);
});

test("protocol binary parser rejects invalid payload ownership", () => {
  const codec = { encode: () => Uint8Array.of(1), decode: (bytes: Uint8Array) => ({ value: bytes[0] }) };
  const frame = encodeBinaryInputMessage({ value: 1 }, codec);
  expect(() => Reflect.apply(parseBinaryProtocolMessage, undefined, [frame, codec, { payloadOwnership: "retain" }]))
    .toThrow("copy or borrow");
});

test("protocol binary parser abstraction normalizes ownership once", () => {
  const codec = { encode: () => Uint8Array.of(4), decode: (bytes: Uint8Array) => ({ value: bytes[0] }) };
  const parser = createBinaryProtocolParser({ inputCodec: codec, payloadOwnership: "borrow" });
  expect(parser.payloadOwnership).toBe("borrow");
  expect(parser.payloadViewObjectsPerParse).toBe(1);
  expect(parser.parse(encodeBinaryInputMessage({ value: 4 }, codec)).payload).toEqual({ value: 4 });
});

test("protocol binary parser can decode a borrowed range without allocating a payload view", () => {
  const reader = createReusableBinaryReader();
  let decodeCalls = 0;
  type Input = { first: number; remaining: number };
  const codec: BinaryPayloadCodec<Input> = {
    encode: () => Uint8Array.of(9, 10, 11),
    decode: (): Input => { throw new Error("view decoder should not run"); },
    decodeRange(bytes: Uint8Array, byteOffset: number, byteLength: number) {
      decodeCalls += 1;
      reader.reset(bytes, byteOffset, byteLength);
      return { first: reader.readU8(), remaining: reader.remaining };
    }
  };
  const parser = createBinaryProtocolParser({ inputCodec: codec, payloadOwnership: "borrow" });

  expect(parser.payloadViewObjectsPerParse).toBe(0);
  expect(parser.parse(encodeBinaryInputMessage({ first: 0, remaining: 0 }, codec)).payload).toEqual({ first: 9, remaining: 2 });
  expect(decodeCalls).toBe(1);
});

test("protocol encodes arrays of entity records", () => {
  const worldSchema = defineSchema({
    entities: {
      type: "array",
      item: {
        type: "entity",
        fields: {
          id: "u16",
          x: "f32",
          y: "f32",
          hp: "u16"
        }
      }
    }
  });
  const state = {
    entities: [
      { id: 1, x: 1, y: 2, hp: 10 },
      { id: 2, x: 3, y: 4, hp: 9 }
    ]
  };

  expect(decodeSnapshot(worldSchema, encodeSnapshot(worldSchema, state))).toEqual(state);
});

test("protocol byte buffers round-trip primitive packed payloads safely", () => {
  const writer = createBinaryWriter(4);
  writer.writeU8(7);
  writer.writeU16(512);
  writer.writeU32(123456);
  writer.writeF32(1.5);
  writer.writeF64(1234567890123);
  writer.writeStringU8("ok");

  const reader = createBinaryReader(writer.toUint8Array());
  expect(reader.readU8()).toBe(7);
  expect(reader.readU16()).toBe(512);
  expect(reader.readU32()).toBe(123456);
  expect(reader.readF32()).toBe(1.5);
  expect(reader.readF64()).toBe(1234567890123);
  expect(reader.readStringU8()).toBe("ok");
  expect(() => reader.readU8()).toThrow("buffer length");
});

test("protocol byte writers reject non-finite initial capacities", () => {
  expect(() => createBinaryWriter(Number.NaN)).toThrow("initial size must be finite");
  expect(() => createBinaryWriter(Number.POSITIVE_INFINITY)).toThrow("initial size must be finite");
  expect(createBinaryWriter(0).offset).toBe(0);
});

test("protocol snapshot preserves f64 timestamps", () => {
  const schema = defineSchema({ time: "f64", x: "f32" });
  const state = { time: 1234567890123, x: 1.25 };
  expect(decodeSnapshot(schema, encodeSnapshot(schema, state))).toEqual(state);
});

test("protocol byte buffers expose read-only byte views without changing copied reads", () => {
  const writer = createBinaryWriter(4);
  writer.writeU8(99);
  writer.writeBytes(Uint8Array.from([1, 2, 3]));
  const bytes = writer.toUint8Array();

  const viewReader = createBinaryReader(bytes);
  expect(viewReader.readU8()).toBe(99);
  const view = viewReader.readBytesView(3);
  expect(view.buffer).toBe(bytes.buffer);
  expect(view.byteOffset).toBe(bytes.byteOffset + 1);
  expect([...view]).toEqual([1, 2, 3]);

  const copyReader = createBinaryReader(bytes);
  expect(copyReader.readU8()).toBe(99);
  const copy = copyReader.readBytes(3);
  expect(copy.buffer).not.toBe(bytes.buffer);
  expect([...copy]).toEqual([1, 2, 3]);
});

test("protocol byte readers reject invalid requested lengths without moving the cursor", () => {
  const reader = createBinaryReader(Uint8Array.from([1, 2, 3]));
  expect(() => reader.readBytes(-1)).toThrow("non-negative safe integer");
  expect(reader.offset).toBe(0);
  expect(() => reader.readBytesView(4)).toThrow("buffer length");
  expect(reader.offset).toBe(0);
});

test("protocol delta patches changed array entries without resending whole array", () => {
  const worldSchema = defineSchema({
    entities: {
      type: "array",
      item: {
        type: "entity",
        fields: {
          id: "u16",
          x: "f32",
          y: "f32",
          hp: "u16"
        }
      }
    }
  });
  const before = {
    entities: Array.from({ length: 1000 }, (_, id) => ({ id, x: id, y: id * 2, hp: 100 }))
  };
  const after = {
    entities: before.entities.map((entity, index) => (index < 10 ? { ...entity, x: entity.x + 1 } : entity))
  };
  const delta = encodeDelta(worldSchema, before, after);

  expect(decodeDelta(worldSchema, before, delta)).toEqual(after);
  expect(delta.byteLength).toBeLessThan(encodeSnapshot(worldSchema, after).byteLength / 10);
});

test("protocol delta patches nested map entity fields without resending full entities", () => {
  const worldSchema = defineSchema({
    players: {
      type: "map",
      key: "string",
      value: {
        type: "entity",
        fields: {
          id: "string:16",
          name: "string:16",
          x: "f32",
          y: "f32",
          hp: "u16"
        }
      }
    }
  });
  const before = {
    players: {
      p1: { id: "p1", name: "Rin", x: 1, y: 2, hp: 10 },
      p2: { id: "p2", name: "Sol", x: 3, y: 4, hp: 12 }
    }
  };
  const after = {
    players: {
      p1: { id: "p1", name: "Rin", x: 5, y: 2, hp: 10 },
      p2: { id: "p2", name: "Sol", x: 3, y: 4, hp: 12 }
    }
  };
  const delta = encodeDelta(worldSchema, before, after);

  expect(decodeDelta(worldSchema, before, delta)).toEqual(after);
  expect(delta.byteLength).toBeLessThan(encodeSnapshot(worldSchema, after).byteLength);
});
