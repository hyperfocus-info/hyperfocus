import { isRecord as isPlainObject } from "@hyperfocus/utilities/records";
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
  optional?: boolean;
}

type NumericFieldType = Exclude<PrimitiveFieldType, "bool">;

export type SchemaFieldFor<TValue> =
  [TValue] extends [never] ? FieldDefinition
    : unknown extends TValue ? FieldDefinition
      : NonNullable<TValue> extends number ? NumericFieldType
        : NonNullable<TValue> extends boolean ? "bool"
          : NonNullable<TValue> extends string ? StringFieldType
            : NonNullable<TValue> extends readonly (infer TItem)[] ? ArrayFieldFor<TItem> | JsonFieldDefinition
              : NonNullable<TValue> extends object ? ObjectFieldFor<NonNullable<TValue>> | MapFieldFor<NonNullable<TValue>> | JsonFieldDefinition
                : JsonFieldDefinition;

export type SchemaDefinitionFor<TState> = NonNullable<TState> extends object
  ? { [TKey in keyof NonNullable<TState>]?: SchemaFieldFor<NonNullable<TState>[TKey]> }
  : never;

type RequiredKeys<TValue extends object> = {
  [TKey in keyof TValue]-?: Record<never, never> extends Pick<TValue, TKey> ? never : TKey
}[keyof TValue];

type OptionalKeys<TValue extends object> = Exclude<keyof TValue, RequiredKeys<TValue>>;

export type CompleteSchemaDefinitionFor<TState> = NonNullable<TState> extends object
  ? { [TKey in RequiredKeys<NonNullable<TState>>]-?: CompleteSchemaFieldFor<NonNullable<TState>[TKey]> }
    & { [TKey in OptionalKeys<NonNullable<TState>>]?: CompleteSchemaFieldFor<NonNullable<TState>[TKey]> }
  : never;

export type CompleteSchemaFieldFor<TValue> =
  [TValue] extends [never] ? FieldDefinition
    : unknown extends TValue ? FieldDefinition
      : NonNullable<TValue> extends number ? NumericFieldType
        : NonNullable<TValue> extends boolean ? "bool"
          : NonNullable<TValue> extends string ? StringFieldType
            : NonNullable<TValue> extends readonly (infer TItem)[] ? CompleteArrayFieldFor<TItem> | JsonFieldDefinition
              : NonNullable<TValue> extends object
                ? CompleteObjectFieldFor<NonNullable<TValue>> | CompleteMapFieldFor<NonNullable<TValue>> | JsonFieldDefinition
                : JsonFieldDefinition;

type ArrayFieldFor<TItem> = {
  type: "array";
  item: SchemaFieldFor<TItem>;
  maxLength?: number;
};

type CompleteArrayFieldFor<TItem> = {
  type: "array";
  item: CompleteSchemaFieldFor<TItem>;
  maxLength?: number;
};

type ObjectFieldFor<TValue extends object> =
  | SchemaDefinitionFor<TValue>
  | { type: "object" | "entity"; fields: SchemaDefinitionFor<TValue> };

type CompleteObjectFieldFor<TValue extends object> =
  | CompleteSchemaDefinitionFor<TValue>
  | { type: "object" | "entity"; fields: CompleteSchemaDefinitionFor<TValue> };

type MapValue<TValue extends object> = string extends keyof TValue
  ? TValue[string & keyof TValue]
  : number extends keyof TValue
    ? TValue[number & keyof TValue]
    : never;

type MapFieldFor<TValue extends object> = [MapValue<TValue>] extends [never]
  ? never
  : {
      type: "map";
      key: "string" | "u32";
      value: SchemaFieldFor<MapValue<TValue>>;
      maxEntries?: number;
    };

type CompleteMapFieldFor<TValue extends object> = [MapValue<TValue>] extends [never]
  ? never
  : {
      type: "map";
      key: "string" | "u32";
      value: CompleteSchemaFieldFor<MapValue<TValue>>;
      maxEntries?: number;
    };

export type StateFromSchemaField<TField> = TField extends NumericFieldType ? number
  : TField extends "bool" ? boolean
    : TField extends StringFieldType ? string
      : TField extends { type: "json" } ? unknown
        : TField extends { type: "array"; item: infer TItem } ? StateFromSchemaField<TItem>[]
          : TField extends { type: "map"; value: infer TValue } ? Record<string, StateFromSchemaField<TValue>>
            : TField extends { type: "object" | "entity"; fields: infer TFields } ? StateFromSchemaDefinition<TFields>
              : TField extends Record<string, FieldDefinition> ? StateFromSchemaDefinition<TField>
                : never;

export type StateFromSchemaDefinition<TDefinition> = TDefinition extends Record<string, FieldDefinition>
  ? { [TKey in keyof TDefinition]: StateFromSchemaField<TDefinition[TKey]> }
  : never;

export type NormalizedField =
  | { kind: "scalar"; type: ScalarFieldType; maxLength?: number }
  | { kind: "json"; maxLength: number; optional: boolean }
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

function normalizeCollectionLimit(label: string, value: unknown, fallback: number) {
  const limit = value ?? fallback;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0 || limit > MAX_COLLECTION_LENGTH) {
    throw new Error(`invalid schema ${label}: ${String(limit)}`);
  }
  return limit;
}

function isStringFieldType(type: string): type is StringFieldType {
  return /^string:\d+$/.test(type);
}

function parseStringType(type: StringFieldType) {
  const maxLength = Number(type.slice("string:".length));
  if (!Number.isInteger(maxLength) || maxLength < 0 || maxLength > 65535) {
    throw new Error(`invalid schema string length: ${type}`);
  }
  return maxLength;
}



function isSchemaDefinition(value: unknown): value is SchemaDefinition {
  return isPlainObject(value);
}

function isTypedField(value: Record<string, unknown>, type: string) {
  return value.type === type;
}

function normalizeField(definition: unknown): NormalizedField {
  if (typeof definition === "string") {
    if (definition === "u8" || definition === "u16" || definition === "u32" || definition === "i16" || definition === "i32" || definition === "f32" || definition === "f64" || definition === "bool") {
      return { kind: "scalar", type: definition };
    }
    if (isStringFieldType(definition)) return { kind: "scalar", type: definition, maxLength: parseStringType(definition) };
    throw new Error(`unsupported schema field type: ${definition}`);
  }

  if (!isPlainObject(definition)) throw new Error("schema field must be a string or object");

  if (isTypedField(definition, "array")) {
    return {
      kind: "array",
      item: normalizeField(definition.item),
      maxLength: normalizeCollectionLimit("array maxLength", definition.maxLength, DEFAULT_MAX_ARRAY_LENGTH)
    };
  }

  if (isTypedField(definition, "map")) {
    if (definition.key !== "string" && definition.key !== "u32") {
      throw new Error(`invalid schema map key type: ${String(definition.key)}`);
    }
    return {
      kind: "map",
      key: definition.key,
      value: normalizeField(definition.value),
      maxEntries: normalizeCollectionLimit("map maxEntries", definition.maxEntries, DEFAULT_MAX_MAP_ENTRIES)
    };
  }

  if (isTypedField(definition, "json")) {
    const maxLength = definition.maxLength ?? DEFAULT_MAX_JSON_LENGTH;
    if (typeof maxLength !== "number" || !Number.isInteger(maxLength) || maxLength < 0 || maxLength > 65535) {
      throw new Error(`invalid schema json length: ${maxLength}`);
    }
    if (definition.optional !== undefined && typeof definition.optional !== "boolean") {
      throw new Error(`invalid schema json optional flag: ${String(definition.optional)}`);
    }
    return { kind: "json", maxLength, optional: definition.optional ?? false };
  }

  if (isTypedField(definition, "entity")) {
    return normalizeObject(definition.fields);
  }

  if (isTypedField(definition, "object")) {
    return normalizeObject(definition.fields);
  }

  return normalizeObject(definition);
}

function normalizeObject(fields: unknown): NormalizedField {
  if (!isPlainObject(fields)) throw new Error("schema object fields must be an object");
  const entries = Object.entries(fields);
  if (entries.length > MAX_COLLECTION_LENGTH) throw new Error(`schema object exceeds ${MAX_COLLECTION_LENGTH} fields`);
  return {
    kind: "object",
    fields: entries.map(([name, field]) => ({ name, field: normalizeField(field) }))
  };
}

export function defineSchema<const TDefinition extends SchemaDefinition>(
  definition: TDefinition
): ReplicationSchema<StateFromSchemaDefinition<TDefinition>>;
export function defineSchema<TState>(definition: CompleteSchemaDefinitionFor<TState>): ReplicationSchema<TState>;
export function defineSchema(definition: unknown): ReplicationSchema {
  if (!isSchemaDefinition(definition)) throw new Error("root replication schema must be an object");
  return normalizeSchemaDefinition(definition);
}

/** Explicitly maps a complete wire projection when runtime state also contains derived, non-replicated fields. */
export function defineSchemaProjection<TState, TProjection extends Partial<TState>>(
  definition: CompleteSchemaDefinitionFor<TProjection>
): ReplicationSchema<TState> {
  if (!isSchemaDefinition(definition)) throw new Error("root replication schema must be an object");
  const normalized = normalizeField(definition);
  if (normalized.kind !== "object") throw new Error("root replication schema must be an object");
  return {
    definition,
    fields: normalized.fields
  };
}

export function normalizeSchemaDefinition(definition: SchemaDefinition): ReplicationSchema {
  const normalized = normalizeField(definition);
  if (normalized.kind !== "object") throw new Error("root replication schema must be an object");
  return {
    definition,
    fields: normalized.fields
  };
}

export function defineSchemaFor<TState>() {
  return <const TDefinition extends CompleteSchemaDefinitionFor<TState>>(definition: TDefinition): ReplicationSchema<TState> => {
    if (!isSchemaDefinition(definition)) throw new Error("root replication schema must be an object");
    const normalized = normalizeField(definition);
    if (normalized.kind !== "object") throw new Error("root replication schema must be an object");
    return {
      definition,
      fields: normalized.fields
    };
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
