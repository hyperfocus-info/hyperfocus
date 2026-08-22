export type PrimitiveFieldType = "u8" | "u16" | "u32" | "i16" | "i32" | "f32" | "f64" | "bool";
export type StringFieldType = `string:${number}`;
export type ScalarFieldType = PrimitiveFieldType | StringFieldType;

export type SchemaDefinition = ObjectSchemaDefinition | ObjectFieldDefinition;

export interface ObjectSchemaDefinition {
  [key: string]: FieldDefinition;
}

export interface ObjectFieldDefinition {
  type: "object";
  fields: Record<string, FieldDefinition>;
}

export type FieldDefinition =
  | ScalarFieldType
  | ObjectSchemaDefinition
  | ObjectFieldDefinition
  | ArrayFieldDefinition
  | MapFieldDefinition
  | EntityFieldDefinition
  | JsonFieldDefinition;

export interface ArrayFieldDefinition {
  type: "array";
  item: FieldDefinition;
  maxLength?: number;
}

export interface MapFieldDefinition {
  type: "map";
  key: "string" | "u32";
  value: FieldDefinition;
  maxEntries?: number;
}

export interface EntityFieldDefinition {
  type: "entity";
  fields: Record<string, FieldDefinition>;
}

export interface JsonFieldDefinition {
  type: "json";
  maxLength?: number;
}

export type NormalizedField =
  | { kind: "scalar"; type: ScalarFieldType; maxLength?: number }
  | { kind: "json"; maxLength: number }
  | { kind: "object"; fields: readonly NormalizedFieldEntry[] }
  | { kind: "array"; item: NormalizedField; maxLength: number }
  | { kind: "map"; key: "string" | "u32"; value: NormalizedField; maxEntries: number };

export type NormalizedFieldEntry = {
  name: string;
  field: NormalizedField;
};

export type ReplicationSchema<TState = unknown> = {
  readonly fields: readonly NormalizedFieldEntry[];
  readonly definition: SchemaDefinition;
  readonly __state?: TState;
};

const DEFAULT_MAX_ARRAY_LENGTH = 4096;
const DEFAULT_MAX_MAP_ENTRIES = 4096;
const DEFAULT_MAX_JSON_LENGTH = 4096;
const MAX_COLLECTION_LENGTH = 0xffff;

function normalizeCollectionLimit(label: string, value: number | undefined, fallback: number) {
  const limit = value ?? fallback;
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_COLLECTION_LENGTH) {
    throw new Error(`invalid schema ${label}: ${String(limit)}`);
  }
  return limit;
}

function parseStringType(type: string) {
  const [, length] = /^string:(\d+)$/.exec(type) ?? [];
  if (!length) return undefined;
  const maxLength = Number(length);
  if (!Number.isInteger(maxLength) || maxLength < 0 || maxLength > 65535) {
    throw new Error(`invalid schema string length: ${type}`);
  }
  return maxLength;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTypedField(value: Record<string, unknown>, type: string) {
  return value.type === type;
}

function normalizeField(definition: FieldDefinition): NormalizedField {
  if (typeof definition === "string") {
    if (definition === "u8" || definition === "u16" || definition === "u32" || definition === "i16" || definition === "i32" || definition === "f32" || definition === "f64" || definition === "bool") {
      return { kind: "scalar", type: definition };
    }
    const maxLength = parseStringType(definition);
    if (maxLength !== undefined) return { kind: "scalar", type: definition as StringFieldType, maxLength };
    throw new Error(`unsupported schema field type: ${definition}`);
  }

  if (!isPlainObject(definition)) throw new Error("schema field must be a string or object");

  if (isTypedField(definition, "array")) {
    const arrayDefinition = definition as unknown as ArrayFieldDefinition;
    return {
      kind: "array",
      item: normalizeField(arrayDefinition.item),
      maxLength: normalizeCollectionLimit("array maxLength", arrayDefinition.maxLength, DEFAULT_MAX_ARRAY_LENGTH)
    };
  }

  if (isTypedField(definition, "map")) {
    const mapDefinition = definition as unknown as MapFieldDefinition;
    if (mapDefinition.key !== "string" && mapDefinition.key !== "u32") {
      throw new Error(`invalid schema map key type: ${String(mapDefinition.key)}`);
    }
    return {
      kind: "map",
      key: mapDefinition.key,
      value: normalizeField(mapDefinition.value),
      maxEntries: normalizeCollectionLimit("map maxEntries", mapDefinition.maxEntries, DEFAULT_MAX_MAP_ENTRIES)
    };
  }

  if (isTypedField(definition, "json")) {
    const jsonDefinition = definition as unknown as JsonFieldDefinition;
    const maxLength = jsonDefinition.maxLength ?? DEFAULT_MAX_JSON_LENGTH;
    if (!Number.isInteger(maxLength) || maxLength < 0 || maxLength > 65535) {
      throw new Error(`invalid schema json length: ${maxLength}`);
    }
    return { kind: "json", maxLength };
  }

  if (isTypedField(definition, "entity")) {
    return normalizeObject((definition as unknown as EntityFieldDefinition).fields);
  }

  if (isTypedField(definition, "object")) {
    return normalizeObject((definition as unknown as ObjectFieldDefinition).fields);
  }

  return normalizeObject(definition as Record<string, FieldDefinition>);
}

function normalizeObject(fields: Record<string, FieldDefinition>): NormalizedField {
  if (!isPlainObject(fields)) throw new Error("schema object fields must be an object");
  const entries = Object.entries(fields);
  if (entries.length > MAX_COLLECTION_LENGTH) throw new Error(`schema object exceeds ${MAX_COLLECTION_LENGTH} fields`);
  return {
    kind: "object",
    fields: entries.map(([name, field]) => ({ name, field: normalizeField(field) }))
  };
}

export function defineSchema<TState = unknown>(definition: SchemaDefinition): ReplicationSchema<TState> {
  const normalized = normalizeField(definition);
  if (normalized.kind !== "object") throw new Error("root replication schema must be an object");
  return {
    definition,
    fields: normalized.fields
  };
}

export function getFieldByPath(schema: ReplicationSchema, path: readonly string[]): NormalizedField | undefined {
  let current: NormalizedField = { kind: "object", fields: schema.fields };
  for (const part of path) {
    if (current.kind !== "object") return undefined;
    let entry: NormalizedFieldEntry | undefined;
    for (const candidate of current.fields) {
      if (candidate.name === part) {
        entry = candidate;
        break;
      }
    }
    if (!entry) return undefined;
    current = entry.field;
  }
  return current;
}
