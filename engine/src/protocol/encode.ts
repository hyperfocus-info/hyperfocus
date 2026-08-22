import { defineSchema, type NormalizedField, type ReplicationSchema, type SchemaDefinition } from "./schema.ts";

type ByteWriter = {
  bytes: Uint8Array;
  view: DataView;
  offset: number;
  ensure(length: number): void;
  writeU8(value: number): void;
  writeU16(value: number): void;
  writeU32(value: number): void;
  writeI16(value: number): void;
  writeI32(value: number): void;
  writeF32(value: number): void;
  writeF64(value: number): void;
  writeBytes(bytes: Uint8Array): void;
  toUint8Array(): Uint8Array;
};

type ByteReader = {
  offset: number;
  readonly remaining: number;
  bytes: Uint8Array;
  readU8(): number;
  readU16(): number;
  readU32(): number;
  readI16(): number;
  readI32(): number;
  readF32(): number;
  readF64(): number;
  readBytes(length: number): Uint8Array;
  readBytesView(length: number): Uint8Array;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_STRING_BYTE_CACHE_ENTRIES = 4096;
const encodedStringBytes = new Map<string, Uint8Array>();

function createWriter(initialSize = 256): ByteWriter {
  const initial = new Uint8Array(Math.max(1, initialSize));
  return {
    bytes: initial,
    view: new DataView(initial.buffer),
    offset: 0,
    ensure(length: number) {
      if (this.offset + length <= this.bytes.byteLength) return;
      let nextLength = this.bytes.byteLength;
      while (this.offset + length > nextLength) nextLength *= 2;
      const next = new Uint8Array(nextLength);
      next.set(this.bytes);
      this.bytes = next;
      this.view = new DataView(next.buffer);
    },
    writeU8(value) {
      this.ensure(1);
      this.bytes[this.offset] = value & 0xff;
      this.offset += 1;
    },
    writeU16(value) {
      this.ensure(2);
      this.view.setUint16(this.offset, value, true);
      this.offset += 2;
    },
    writeU32(value) {
      this.ensure(4);
      this.view.setUint32(this.offset, value, true);
      this.offset += 4;
    },
    writeI16(value) {
      this.writeU16(value & 0xffff);
    },
    writeI32(value) {
      this.writeU32(value >>> 0);
    },
    writeF32(value) {
      this.ensure(4);
      this.view.setFloat32(this.offset, value, true);
      this.offset += 4;
    },
    writeF64(value) {
      this.ensure(8);
      this.view.setFloat64(this.offset, value, true);
      this.offset += 8;
    },
    writeBytes(bytes) {
      this.ensure(bytes.length);
      this.bytes.set(bytes, this.offset);
      this.offset += bytes.length;
    },
    toUint8Array() {
      return this.bytes.subarray(0, this.offset);
    }
  } as ByteWriter & { ensure(length: number): void };
}

function createReader(bytes: Uint8Array): ByteReader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function ensure(offset: number, length: number) {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError(`protocol reader length must be a non-negative safe integer: ${String(length)}`);
    }
    if (length > bytes.byteLength - offset) throw new Error("protocol reader exceeded buffer length");
  }
  return {
    bytes,
    offset: 0,
    get remaining() {
      return this.bytes.byteLength - this.offset;
    },
    readU8() {
      ensure(this.offset, 1);
      const value = view.getUint8(this.offset);
      this.offset += 1;
      return value;
    },
    readU16() {
      ensure(this.offset, 2);
      const value = view.getUint16(this.offset, true);
      this.offset += 2;
      return value;
    },
    readU32() {
      ensure(this.offset, 4);
      const value = view.getUint32(this.offset, true);
      this.offset += 4;
      return value;
    },
    readI16() {
      ensure(this.offset, 2);
      const value = view.getInt16(this.offset, true);
      this.offset += 2;
      return value;
    },
    readI32() {
      ensure(this.offset, 4);
      const value = view.getInt32(this.offset, true);
      this.offset += 4;
      return value;
    },
    readF32() {
      ensure(this.offset, 4);
      const value = view.getFloat32(this.offset, true);
      this.offset += 4;
      return value;
    },
    readF64() {
      ensure(this.offset, 8);
      const value = view.getFloat64(this.offset, true);
      this.offset += 8;
      return value;
    },
    readBytes(length) {
      ensure(this.offset, length);
      const value = this.bytes.slice(this.offset, this.offset + length);
      this.offset += length;
      return value;
    },
    readBytesView(length) {
      ensure(this.offset, length);
      const value = this.bytes.subarray(this.offset, this.offset + length);
      this.offset += length;
      return value;
    }
  };
}

function asRecord(value: unknown) {
  return (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
}

function cachedUtf8Bytes(value: string) {
  let bytes = encodedStringBytes.get(value);
  if (bytes) return bytes;
  bytes = textEncoder.encode(value);
  if (value.length <= 256) {
    if (encodedStringBytes.size >= MAX_STRING_BYTE_CACHE_ENTRIES) encodedStringBytes.clear();
    encodedStringBytes.set(value, bytes);
  }
  return bytes;
}

function writeAsciiString(writer: ByteWriter, value: string, maxLength: number) {
  if (value.length > maxLength) throw new Error(`string exceeds schema max length ${maxLength}`);
  writer.writeU16(value.length);
  writer.ensure(value.length);
  for (let i = 0; i < value.length; i += 1) writer.bytes[writer.offset + i] = value.charCodeAt(i);
  writer.offset += value.length;
}

function encodeString(writer: ByteWriter, value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    writer.writeU16(0);
    return;
  }
  const source = typeof value === "string" ? value : String(value);
  let ascii = true;
  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) > 0x7f) {
      ascii = false;
      break;
    }
  }
  if (ascii) {
    writeAsciiString(writer, source, maxLength);
    return;
  }
  const bytes = cachedUtf8Bytes(source);
  if (bytes.length > maxLength) throw new Error(`string exceeds schema max length ${maxLength}`);
  writer.writeU16(bytes.length);
  writer.writeBytes(bytes);
}

function decodeString(reader: ByteReader, maxLength: number) {
  const length = reader.readU16();
  if (length > maxLength) throw new Error(`string exceeds schema max length ${maxLength}`);
  return textDecoder.decode(reader.readBytesView(length));
}

function numberField(type: string, value: unknown, fallback = 0) {
  const next = value ?? fallback;
  if (typeof next !== "number" || !Number.isFinite(next)) throw new Error(`${type} field must be a finite number`);
  return next;
}

function integerField(type: string, value: unknown, min: number, max: number) {
  const next = numberField(type, value);
  if (!Number.isInteger(next) || next < min || next > max) {
    throw new Error(`${type} field must be an integer between ${min} and ${max}`);
  }
  return next;
}

function u32MapKey(key: string) {
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error(`u32 map key must be an integer between 0 and 4294967295: ${key}`);
  const value = Number(key);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`u32 map key must be an integer between 0 and 4294967295: ${key}`);
  }
  return value;
}

function encodeJson(writer: ByteWriter, value: unknown, maxLength: number) {
  const source = JSON.stringify(value ?? null) ?? "null";
  try {
    encodeString(writer, source, maxLength);
  } catch (error) {
    if (error instanceof Error && error.message.includes("string exceeds schema max length")) throw new Error(`json exceeds schema max length ${maxLength}`);
    throw error;
  }
}

function decodeJson(reader: ByteReader, maxLength: number) {
  return JSON.parse(decodeString(reader, maxLength)) as unknown;
}

function setOwn(record: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(record, key, { value, enumerable: true, configurable: true, writable: true });
}

type FieldEncoder = (writer: ByteWriter, value: unknown) => void;
const fieldEncoderCache = new WeakMap<NormalizedField, FieldEncoder>();
const schemaEncoderCache = new WeakMap<ReplicationSchema, FieldEncoder>();
const schemaWriterSizeHint = new WeakMap<ReplicationSchema, number>();
export const PREENCODED_SNAPSHOT_BYTES = Symbol.for("engine.preencodedSnapshotBytes");

function compileScalarEncoder(field: Extract<NormalizedField, { kind: "scalar" }>): FieldEncoder {
  switch (field.type) {
    case "u8":
      return (writer, value) => writer.writeU8(integerField("u8", value, 0, 0xff));
    case "u16":
      return (writer, value) => writer.writeU16(integerField("u16", value, 0, 0xffff));
    case "u32":
      return (writer, value) => writer.writeU32(integerField("u32", value, 0, 0xffffffff));
    case "i16":
      return (writer, value) => writer.writeI16(integerField("i16", value, -0x8000, 0x7fff));
    case "i32":
      return (writer, value) => writer.writeI32(integerField("i32", value, -0x80000000, 0x7fffffff));
    case "f32":
      return (writer, value) => writer.writeF32(numberField("f32", value));
    case "f64":
      return (writer, value) => writer.writeF64(numberField("f64", value));
    case "bool":
      return (writer, value) => {
        if (typeof (value ?? false) !== "boolean") throw new Error("bool field must be boolean");
        writer.writeU8(value ? 1 : 0);
      };
    default: {
      const maxLength = field.maxLength ?? 0;
      return (writer, value) => encodeString(writer, value, maxLength);
    }
  }
}

function compileObjectEncoder(field: Extract<NormalizedField, { kind: "object" }>): FieldEncoder {
  const entries = field.fields.map((entry) => ({ name: entry.name, encode: compiledFieldEncoder(entry.field) }));
  return (writer, value) => {
    const record = asRecord(value);
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      entry.encode(writer, record[entry.name]);
    }
  };
}

function compileArrayEncoder(field: Extract<NormalizedField, { kind: "array" }>): FieldEncoder {
  const encodeItem = compiledFieldEncoder(field.item);
  const maxLength = field.maxLength;
  return (writer, value) => {
    const values = Array.isArray(value) ? value : [];
    if (values.length > maxLength) throw new Error(`array exceeds schema max length ${maxLength}`);
    writer.writeU16(values.length);
    for (let i = 0; i < values.length; i += 1) encodeItem(writer, values[i]);
  };
}

function countOwnKeys(record: Record<string, unknown>) {
  let count = 0;
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) count += 1;
  }
  return count;
}

function compileMapEncoder(field: Extract<NormalizedField, { kind: "map" }>): FieldEncoder {
  const encodeValue = compiledFieldEncoder(field.value);
  const maxEntries = field.maxEntries;
  if (field.key === "u32") {
    return (writer, value) => {
      const record = asRecord(value);
      const count = countOwnKeys(record);
      if (count > maxEntries) throw new Error(`map exceeds schema max entries ${maxEntries}`);
      writer.writeU16(count);
      for (const key in record) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
        writer.writeU32(u32MapKey(key));
        encodeValue(writer, record[key]);
      }
    };
  }
  return (writer, value) => {
    const record = asRecord(value);
    const count = countOwnKeys(record);
    if (count > maxEntries) throw new Error(`map exceeds schema max entries ${maxEntries}`);
    writer.writeU16(count);
    for (const key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
      encodeString(writer, key, 255);
      encodeValue(writer, record[key]);
    }
  };
}

function compiledFieldEncoder(field: NormalizedField): FieldEncoder {
  const cached = fieldEncoderCache.get(field);
  if (cached) return cached;
  let encoder: FieldEncoder;
  if (field.kind === "scalar") encoder = compileScalarEncoder(field);
  else if (field.kind === "json") {
    const maxLength = field.maxLength;
    encoder = (writer, value) => encodeJson(writer, value, maxLength);
  } else if (field.kind === "object") encoder = compileObjectEncoder(field);
  else if (field.kind === "array") encoder = compileArrayEncoder(field);
  else encoder = compileMapEncoder(field);
  fieldEncoderCache.set(field, encoder);
  return encoder;
}

export function encodeField(writer: ByteWriter, field: NormalizedField, value: unknown): void {
  compiledFieldEncoder(field)(writer, value);
}

export function decodeField(reader: ByteReader, field: NormalizedField): unknown {
  if (field.kind === "scalar") {
    switch (field.type) {
      case "u8":
        return reader.readU8();
      case "u16":
        return reader.readU16();
      case "u32":
        return reader.readU32();
      case "i16":
        return reader.readI16();
      case "i32":
        return reader.readI32();
      case "f32":
        return reader.readF32();
      case "f64":
        return reader.readF64();
      case "bool":
        {
          const value = reader.readU8();
          if (value !== 0 && value !== 1) throw new Error(`bool field must be encoded as 0 or 1: ${value}`);
          return value === 1;
        }
      default:
        return decodeString(reader, field.maxLength ?? 0);
    }
  }

  if (field.kind === "json") return decodeJson(reader, field.maxLength);

  if (field.kind === "object") {
    const record: Record<string, unknown> = {};
    for (const entry of field.fields) setOwn(record, entry.name, decodeField(reader, entry.field));
    return record;
  }

  if (field.kind === "array") {
    const length = reader.readU16();
    if (length > field.maxLength) throw new Error(`array exceeds schema max length ${field.maxLength}`);
    const values: unknown[] = [];
    for (let i = 0; i < length; i += 1) values.push(decodeField(reader, field.item));
    return values;
  }

  const count = reader.readU16();
  if (count > field.maxEntries) throw new Error(`map exceeds schema max entries ${field.maxEntries}`);
  const record: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    const key = field.key === "u32" ? String(reader.readU32()) : decodeString(reader, 255);
    if (Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`map contains duplicate key: ${key}`);
    setOwn(record, key, decodeField(reader, field.value));
  }
  return record;
}

function rootField(schema: ReplicationSchema): NormalizedField {
  return { kind: "object", fields: schema.fields };
}

function isReplicationSchema<TState>(schema: ReplicationSchema<TState> | SchemaDefinition): schema is ReplicationSchema<TState> {
  return Array.isArray((schema as ReplicationSchema<TState>).fields) && "definition" in (schema as Record<string, unknown>);
}

export function encodeSnapshot<TState>(schema: ReplicationSchema<TState> | SchemaDefinition, state: TState): Uint8Array {
  const preencoded = typeof state === "object" && state !== null ? (state as Record<PropertyKey, unknown>)[PREENCODED_SNAPSHOT_BYTES] : undefined;
  if (preencoded instanceof Uint8Array) return preencoded;
  const normalized = isReplicationSchema(schema) ? schema : defineSchema<TState>(schema);
  let encoder = schemaEncoderCache.get(normalized);
  if (!encoder) {
    encoder = compiledFieldEncoder(rootField(normalized));
    schemaEncoderCache.set(normalized, encoder);
  }
  const writer = createWriter(schemaWriterSizeHint.get(normalized) ?? 256);
  encoder(writer, state);
  const bytes = writer.toUint8Array();
  schemaWriterSizeHint.set(normalized, Math.max(256, bytes.byteLength));
  return bytes;
}

export function decodeSnapshot<TState = unknown>(schema: ReplicationSchema<TState> | SchemaDefinition, bytes: Uint8Array): TState {
  const normalized = isReplicationSchema(schema) ? schema : defineSchema<TState>(schema);
  const reader = createReader(bytes);
  const state = decodeField(reader, rootField(normalized)) as TState;
  if (reader.remaining !== 0) throw new Error(`snapshot has ${reader.remaining} trailing bytes`);
  return state;
}

export function estimateMessageBytes(message: unknown): number {
  if (message instanceof Uint8Array) return message.byteLength;
  if (message instanceof ArrayBuffer) return message.byteLength;
  if (typeof message === "string") return textEncoder.encode(message).byteLength;
  return textEncoder.encode(JSON.stringify(message)).byteLength;
}

export const __protocolInternals = {
  createWriter,
  createReader
};
