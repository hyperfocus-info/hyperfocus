import { decodeField, decodeSnapshot, encodeField, encodeSnapshot, __protocolInternals } from "./encode.ts";
import { defineSchema, type NormalizedField, type ReplicationSchema, type SchemaDefinition } from "./schema.ts";

const DELTA_PATCH = 1;
const DELTA_FULL_SNAPSHOT = 2;
const DELTA_PATCH_V2 = 3;

const PATCH_FULL_FIELD = 1;
const PATCH_OBJECT_FIELDS = 2;
const PATCH_MAP_ENTRIES = 3;
const PATCH_ARRAY_ENTRIES = 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function cloneSerializable<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown) {
  return (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function sameFieldValue(field: NormalizedField, a: unknown, b: unknown): boolean {
  if (field.kind === "scalar") return a === b;
  if (field.kind === "json") return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (field.kind === "object") {
    const left = asRecord(a);
    const right = asRecord(b);
    for (const entry of field.fields) {
      if (!sameFieldValue(entry.field, left[entry.name], right[entry.name])) return false;
    }
    return true;
  }
  if (field.kind === "array") {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!sameFieldValue(field.item, a[i], b[i])) return false;
    }
    return true;
  }
  const left = asRecord(a);
  const right = asRecord(b);
  let leftCount = 0;
  for (const key in left) {
    if (!hasOwn(left, key)) continue;
    leftCount += 1;
    if (!hasOwn(right, key) || !sameFieldValue(field.value, left[key], right[key])) return false;
  }
  let rightCount = 0;
  for (const key in right) {
    if (hasOwn(right, key)) rightCount += 1;
  }
  return leftCount === rightCount;
}

function rootField(schema: ReplicationSchema): NormalizedField {
  return { kind: "object", fields: schema.fields };
}

function isReplicationSchema<TState>(schema: ReplicationSchema<TState> | SchemaDefinition): schema is ReplicationSchema<TState> {
  return Array.isArray((schema as ReplicationSchema<TState>).fields) && "definition" in (schema as Record<string, unknown>);
}

function writeMapKey(writer: ReturnType<typeof __protocolInternals.createWriter>, field: Extract<NormalizedField, { kind: "map" }>, key: string) {
  if (field.key === "u32") writer.writeU32(parseU32MapKey(key));
  else {
    const keyBytes = textEncoder.encode(key);
    if (keyBytes.length > 255) throw new Error("map key exceeds schema max length 255");
    writer.writeU16(keyBytes.length);
    writer.writeBytes(keyBytes);
  }
}

function parseU32MapKey(key: string) {
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error(`u32 map key must be an integer between 0 and 4294967295: ${key}`);
  const value = Number(key);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`u32 map key must be an integer between 0 and 4294967295: ${key}`);
  }
  return value;
}

function readMapKey(reader: ReturnType<typeof __protocolInternals.createReader>, field: Extract<NormalizedField, { kind: "map" }>) {
  if (field.key === "u32") return String(reader.readU32());
  const length = reader.readU16();
  if (length > 255) throw new Error("map key exceeds schema max length 255");
  return textDecoder.decode(reader.readBytesView(length));
}

function setOwn(record: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(record, key, { value, enumerable: true, configurable: true, writable: true });
}

type FieldPatch =
  | { kind: typeof PATCH_FULL_FIELD; value: unknown }
  | { kind: typeof PATCH_OBJECT_FIELDS; fields: { index: number; patch: FieldPatch }[] }
  | { kind: typeof PATCH_MAP_ENTRIES; removed: string[]; changed: { key: string; patch: FieldPatch }[] }
  | { kind: typeof PATCH_ARRAY_ENTRIES; length: number; entries: { index: number; patch: FieldPatch }[] };

export type EncodeDeltaOptions = {
  dirtyFields?: Iterable<string | number>;
};

function createFieldPatch(field: NormalizedField, before: unknown, after: unknown): FieldPatch | undefined {
  if (field.kind === "scalar") {
    return sameFieldValue(field, before, after) ? undefined : { kind: PATCH_FULL_FIELD, value: after };
  }

  if (field.kind === "json") {
    return sameFieldValue(field, before, after) ? undefined : { kind: PATCH_FULL_FIELD, value: after };
  }

  if (field.kind === "array") {
    if (Array.isArray(after) && after.length > field.maxLength) {
      throw new Error(`array exceeds schema max length ${field.maxLength}`);
    }
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
      return sameFieldValue(field, before, after) ? undefined : { kind: PATCH_FULL_FIELD, value: after };
    }
    const entries: { index: number; patch: FieldPatch }[] = [];
    for (let i = 0; i < after.length; i += 1) {
      const patch = createFieldPatch(field.item, before[i], after[i]);
      if (patch) entries.push({ index: i, patch });
    }
    if (!entries.length) return undefined;
    if (entries.length >= after.length) return { kind: PATCH_FULL_FIELD, value: after };
    return { kind: PATCH_ARRAY_ENTRIES, length: after.length, entries };
  }

  if (field.kind === "object") {
    const left = asRecord(before);
    const right = asRecord(after);
    const fields: { index: number; patch: FieldPatch }[] = [];
    for (let i = 0; i < field.fields.length; i += 1) {
      const entry = field.fields[i];
      const patch = createFieldPatch(entry.field, left[entry.name], right[entry.name]);
      if (patch) fields.push({ index: i, patch });
    }
    return fields.length ? { kind: PATCH_OBJECT_FIELDS, fields } : undefined;
  }

  const left = asRecord(before);
  const right = asRecord(after);
  const rightCount = Object.keys(right).length;
  if (rightCount > field.maxEntries) throw new Error(`map exceeds schema max entries ${field.maxEntries}`);
  const removed: string[] = [];
  const changed: { key: string; patch: FieldPatch }[] = [];
  for (const key in left) {
    if (hasOwn(left, key) && !hasOwn(right, key)) removed.push(key);
  }
  for (const key in right) {
    if (!hasOwn(right, key)) continue;
    const patch = hasOwn(left, key) ? createFieldPatch(field.value, left[key], right[key]) : { kind: PATCH_FULL_FIELD, value: right[key] } satisfies FieldPatch;
    if (patch) changed.push({ key, patch });
  }
  return removed.length || changed.length ? { kind: PATCH_MAP_ENTRIES, removed, changed } : undefined;
}

function encodeFieldPatch(writer: ReturnType<typeof __protocolInternals.createWriter>, field: NormalizedField, patch: FieldPatch): void {
  writer.writeU8(patch.kind);
  if (patch.kind === PATCH_FULL_FIELD) {
    encodeField(writer, field, patch.value);
    return;
  }
  if (patch.kind === PATCH_OBJECT_FIELDS) {
    if (field.kind !== "object") throw new Error("object field patch applied to non-object schema field");
    if (patch.fields.length > field.fields.length) throw new Error("object patch exceeds schema field count");
    writer.writeU16(patch.fields.length);
    for (const entryPatch of patch.fields) {
      const entry = field.fields[entryPatch.index];
      writer.writeU16(entryPatch.index);
      encodeFieldPatch(writer, entry.field, entryPatch.patch);
    }
    return;
  }
  if (patch.kind === PATCH_ARRAY_ENTRIES) {
    if (field.kind !== "array") throw new Error("array field patch applied to non-array schema field");
    if (patch.length > field.maxLength) throw new Error(`array exceeds schema max length ${field.maxLength}`);
    if (patch.entries.length > patch.length) throw new Error("array patch entry count exceeds array length");
    writer.writeU16(patch.length);
    writer.writeU16(patch.entries.length);
    for (const entryPatch of patch.entries) {
      writer.writeU16(entryPatch.index);
      encodeFieldPatch(writer, field.item, entryPatch.patch);
    }
    return;
  }
  if (field.kind !== "map") throw new Error("map field patch applied to non-map schema field");
  if (patch.removed.length > field.maxEntries || patch.changed.length > field.maxEntries) {
    throw new Error(`map patch exceeds schema max entries ${field.maxEntries}`);
  }
  writer.writeU16(patch.removed.length);
  for (const key of patch.removed) writeMapKey(writer, field, key);
  writer.writeU16(patch.changed.length);
  for (const entryPatch of patch.changed) {
    writeMapKey(writer, field, entryPatch.key);
    encodeFieldPatch(writer, field.value, entryPatch.patch);
  }
}

function decodeFieldPatch(reader: ReturnType<typeof __protocolInternals.createReader>, field: NormalizedField, baseline: unknown): unknown {
  const patchKind = reader.readU8();
  if (patchKind === PATCH_FULL_FIELD) return decodeField(reader, field);

  if (patchKind === PATCH_OBJECT_FIELDS) {
    if (field.kind !== "object") throw new Error("object field patch applied to non-object schema field");
    const base = asRecord(baseline);
    const next: Record<string, unknown> = { ...base };
    const count = reader.readU16();
    if (count > field.fields.length) throw new Error("object patch exceeds schema field count");
    const seen = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const fieldIndex = reader.readU16();
      const entry = field.fields[fieldIndex];
      if (!entry) throw new Error(`delta references unknown object field index: ${fieldIndex}`);
      if (seen.has(fieldIndex)) throw new Error(`delta contains duplicate object field index: ${fieldIndex}`);
      seen.add(fieldIndex);
      setOwn(next, entry.name, decodeFieldPatch(reader, entry.field, base[entry.name]));
    }
    return next;
  }

  if (patchKind === PATCH_ARRAY_ENTRIES) {
    if (field.kind !== "array") throw new Error("array field patch applied to non-array schema field");
    const length = reader.readU16();
    if (length > field.maxLength) throw new Error(`array exceeds schema max length ${field.maxLength}`);
    const base = Array.isArray(baseline) ? baseline : [];
    const next = base.slice(0, length);
    next.length = length;
    const count = reader.readU16();
    if (count > length) throw new Error("array patch entry count exceeds array length");
    const seen = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const index = reader.readU16();
      if (index >= length) throw new Error(`delta references array index outside length: ${index}`);
      if (seen.has(index)) throw new Error(`delta contains duplicate array index: ${index}`);
      seen.add(index);
      next[index] = decodeFieldPatch(reader, field.item, base[index]);
    }
    return next;
  }

  if (patchKind === PATCH_MAP_ENTRIES) {
    if (field.kind !== "map") throw new Error("map field patch applied to non-map schema field");
    const base = asRecord(baseline);
    const next: Record<string, unknown> = { ...base };
    const removed = reader.readU16();
    if (removed > field.maxEntries) throw new Error(`map patch exceeds schema max entries ${field.maxEntries}`);
    const touched = new Set<string>();
    for (let i = 0; i < removed; i += 1) {
      const key = readMapKey(reader, field);
      if (touched.has(key)) throw new Error(`delta contains duplicate map key: ${key}`);
      touched.add(key);
      delete next[key];
    }
    const changed = reader.readU16();
    if (changed > field.maxEntries) throw new Error(`map patch exceeds schema max entries ${field.maxEntries}`);
    for (let i = 0; i < changed; i += 1) {
      const key = readMapKey(reader, field);
      if (touched.has(key)) throw new Error(`delta contains duplicate map key: ${key}`);
      touched.add(key);
      setOwn(next, key, decodeFieldPatch(reader, field.value, base[key]));
    }
    if (Object.keys(next).length > field.maxEntries) throw new Error(`map exceeds schema max entries ${field.maxEntries}`);
    return next;
  }

  throw new Error(`unknown delta patch kind: ${patchKind}`);
}

export function encodeDelta<TState>(
  schema: ReplicationSchema<TState> | SchemaDefinition,
  before: TState | null | undefined,
  after: TState,
  options: EncodeDeltaOptions = {}
): Uint8Array {
  const normalized = isReplicationSchema(schema) ? schema : defineSchema<TState>(schema);
  const writer = __protocolInternals.createWriter();
  if (!before) {
    const snapshot = encodeSnapshot(normalized, after);
    writer.writeU8(DELTA_FULL_SNAPSHOT);
    writer.writeBytes(snapshot);
    return writer.toUint8Array();
  }

  const beforeRecord = (before ?? {}) as Record<string, unknown>;
  const afterRecord = (after ?? {}) as Record<string, unknown>;
  const changed: { index: number; patch: FieldPatch }[] = [];
  const dirtyIndexes = options.dirtyFields ? resolveDirtyFieldIndexes(normalized, options.dirtyFields) : undefined;
  const scanIndexes = dirtyIndexes ?? normalized.fields.keys();
  for (const i of scanIndexes) {
    const entry = normalized.fields[i];
    const patch = createFieldPatch(entry.field, beforeRecord[entry.name], afterRecord[entry.name]);
    if (patch) changed.push({ index: i, patch });
  }

  writer.writeU8(DELTA_PATCH_V2);
  writer.writeU16(changed.length);
  for (const { index, patch } of changed) {
    const entry = normalized.fields[index];
    writer.writeU16(index);
    encodeFieldPatch(writer, entry.field, patch);
  }
  return writer.toUint8Array();
}

function resolveDirtyFieldIndexes(schema: ReplicationSchema, dirtyFields: Iterable<string | number>): number[] {
  const byName = new Map<string, number>();
  for (let i = 0; i < schema.fields.length; i += 1) byName.set(schema.fields[i].name, i);

  const seen = new Set<number>();
  const indexes: number[] = [];
  for (const field of dirtyFields) {
    const index = typeof field === "number" ? field : byName.get(field);
    if (index === undefined || index < 0 || index >= schema.fields.length || !Number.isInteger(index)) {
      throw new Error(`dirty delta field is not in schema: ${String(field)}`);
    }
    if (seen.has(index)) continue;
    seen.add(index);
    indexes.push(index);
  }
  return indexes;
}

export function decodeDelta<TState>(
  schema: ReplicationSchema<TState> | SchemaDefinition,
  baseline: TState | null | undefined,
  bytes: Uint8Array
): TState {
  const normalized = isReplicationSchema(schema) ? schema : defineSchema<TState>(schema);
  const reader = __protocolInternals.createReader(bytes);
  const kind = reader.readU8();
  if (kind === DELTA_FULL_SNAPSHOT) {
    return decodeSnapshot(normalized, bytes.subarray(1));
  }
  if (kind !== DELTA_PATCH && kind !== DELTA_PATCH_V2) throw new Error(`unknown delta kind: ${kind}`);
  if (!baseline) throw new Error("delta baseline required for patch payload");

  const base = asRecord(baseline);
  const next = kind === DELTA_PATCH ? (cloneSerializable(baseline) as Record<string, unknown>) : { ...base };
  const patchCount = reader.readU16();
  if (patchCount > normalized.fields.length) throw new Error("delta patch count exceeds schema field count");
  const seen = new Set<number>();
  for (let i = 0; i < patchCount; i += 1) {
    const fieldIndex = reader.readU16();
    const entry = normalized.fields[fieldIndex];
    if (!entry) throw new Error(`delta references unknown field index: ${fieldIndex}`);
    if (seen.has(fieldIndex)) throw new Error(`delta contains duplicate field index: ${fieldIndex}`);
    seen.add(fieldIndex);
    setOwn(next, entry.name, kind === DELTA_PATCH ? decodeField(reader, entry.field) : decodeFieldPatch(reader, entry.field, base[entry.name]));
  }
  if (reader.remaining !== 0) throw new Error(`delta has ${reader.remaining} trailing bytes`);
  return next as TState;
}
