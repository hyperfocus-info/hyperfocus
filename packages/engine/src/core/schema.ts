export type SharedPrimitiveFieldType = "u8" | "u16" | "u32" | "i16" | "i32" | "f32" | "bool";
export type SharedFieldType = SharedPrimitiveFieldType;

export type SharedSchemaDefinition = Readonly<Record<string, SharedPrimitiveFieldType>>;

export type SharedFieldValue<Type extends SharedPrimitiveFieldType> = Type extends "bool" ? boolean : number;

export type SharedEntity<Definition extends SharedSchemaDefinition> = {
  -readonly [Name in keyof Definition]: SharedFieldValue<Definition[Name]>;
};

export type SharedEntityHandle<Definition extends SharedSchemaDefinition> = {
  readonly slot: number;
  /** Occupancy generation used to invalidate stale entity proxies after slot reuse. */
  readonly generation: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly entity: SharedEntity<Definition>;
};

export type SharedSchemaField<Type extends SharedPrimitiveFieldType = SharedPrimitiveFieldType> = {
  readonly name: string;
  readonly type: Type;
  readonly offset: number;
  readonly byteSize: number;
  readonly alignment: number;
};

export type SharedSchema<Definition extends SharedSchemaDefinition = SharedSchemaDefinition> = {
  readonly definition: Definition;
  readonly fields: readonly SharedSchemaField[];
  readonly fieldMap: Readonly<{ [Name in keyof Definition & string]: SharedSchemaField<Definition[Name]> }>;
  readonly byteSize: number;
  readonly alignment: number;
};

export type SharedMemoryPoolOptions = {
  readonly slotCount?: number;
  readonly capacity?: number;
  readonly buffer?: SharedArrayBuffer;
  /** Pads occupancy tokens and entity strides to separate cache lines for independent multi-writer slots. */
  readonly cacheLineAlignedSlots?: boolean;
};

export type SharedFieldColumn = Uint8Array | Uint16Array | Uint32Array | Int16Array | Int32Array | Float32Array;

export type SharedMemoryReadOptions = {
  readonly maxAttempts?: number;
};

export type SharedEntityByteReadOptions = SharedMemoryReadOptions & {
  readonly target?: Uint8Array;
};

export type SharedMemoryConsistentRead<T> = {
  readonly value: T;
  readonly tick: number;
  readonly attempts: number;
};

export type SharedEntityByteRead = {
  readonly bytes: Uint8Array;
  readonly tick: number;
  readonly attempts: number;
};

export const SHARED_CACHE_LINE_BYTE_SIZE = 64;
export const SHARED_MEMORY_HEADER_BYTE_SIZE = SHARED_CACHE_LINE_BYTE_SIZE;
export const SHARED_MEMORY_HEADER_BYTES = SHARED_MEMORY_HEADER_BYTE_SIZE;

const TICK_HEADER_INDEX = 0;
const SLOT_COUNT_HEADER_INDEX = 1;
const SLOT_BYTE_SIZE_HEADER_INDEX = 2;
const SCHEMA_HASH_A_HEADER_INDEX = 3;
const SCHEMA_HASH_B_HEADER_INDEX = 4;
const DATA_BYTE_OFFSET_HEADER_INDEX = 5;
const FORMAT_VERSION_HEADER_INDEX = 6;
const INITIALIZATION_STATE_HEADER_INDEX = 7;
const OCCUPANCY_STRIDE_HEADER_INDEX = 8;
const SLOT_STRIDE_BYTE_SIZE_HEADER_INDEX = 9;
const HEADER_INT_COUNT = SHARED_MEMORY_HEADER_BYTE_SIZE / Int32Array.BYTES_PER_ELEMENT;
const SHARED_MEMORY_FORMAT_VERSION = 3;
const HEADER_INITIALIZING = 1;
const HEADER_READY = 2;
const SLOT_FREE = 0;
const SLOT_ALLOCATING = 1;
const SLOT_OCCUPIED = 2;
const SLOT_RELEASING = 3;
const SLOT_STATE_MASK = 3;
const SLOT_GENERATION_INCREMENT = 4;
const sharedEntityMeta = new WeakMap<object, { slot: number; generation: number; byteOffset: number; byteLength: number }>();

const PRIMITIVE_LAYOUT = {
  u8: { byteSize: 1, alignment: 1 },
  u16: { byteSize: 2, alignment: 2 },
  u32: { byteSize: 4, alignment: 4 },
  i16: { byteSize: 2, alignment: 2 },
  i32: { byteSize: 4, alignment: 4 },
  f32: { byteSize: 4, alignment: 4 },
  bool: { byteSize: 1, alignment: 1 }
} as const;

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function createFieldColumn(type: SharedPrimitiveFieldType, length: number): SharedFieldColumn {
  switch (type) {
    case "u8":
    case "bool":
      return new Uint8Array(length);
    case "u16":
      return new Uint16Array(length);
    case "u32":
      return new Uint32Array(length);
    case "i16":
      return new Int16Array(length);
    case "i32":
      return new Int32Array(length);
    case "f32":
      return new Float32Array(length);
  }
}

function schemaIdentity(schema: SharedSchema): readonly [number, number] {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  const source = `${schema.byteSize}:${schema.alignment};${schema.fields
    .map((field) => `${field.name.length}:${field.name}:${field.type}:${field.offset}:${field.byteSize}:${field.alignment}`)
    .join(";")}`;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ code, 0x85ebca6b);
    hashB ^= hashB >>> 13;
  }
  return [hashA | 0, hashB | 0];
}

function assertPrimitiveType(type: string): asserts type is SharedPrimitiveFieldType {
  if (!Object.prototype.hasOwnProperty.call(PRIMITIVE_LAYOUT, type)) throw new Error(`unsupported shared schema field type: ${type}`);
}

function isSharedSchemaFieldMap<Definition extends SharedSchemaDefinition>(
  definition: Definition,
  fieldMap: object
): fieldMap is Readonly<{ [Name in keyof Definition & string]: SharedSchemaField<Definition[Name]> }> {
  const names = Object.keys(definition);
  if (Reflect.ownKeys(fieldMap).length !== names.length) return false;
  return names.every((name) => {
    const field = Reflect.get(fieldMap, name);
    return isSharedSchemaField(field) && field.name === name && field.type === Reflect.get(definition, name);
  });
}

function isSharedSchemaField(value: unknown): value is SharedSchemaField {
  if (typeof value !== "object" || value === null) return false;
  const type = Reflect.get(value, "type");
  return typeof Reflect.get(value, "name") === "string"
    && typeof type === "string"
    && Object.prototype.hasOwnProperty.call(PRIMITIVE_LAYOUT, type)
    && typeof Reflect.get(value, "offset") === "number"
    && typeof Reflect.get(value, "byteSize") === "number"
    && typeof Reflect.get(value, "alignment") === "number";
}

function isSharedFieldValue<Type extends SharedPrimitiveFieldType>(
  type: Type,
  value: unknown
): value is SharedFieldValue<Type> {
  return type === "bool" ? typeof value === "boolean" : typeof value === "number" && Number.isFinite(value);
}

function isSharedEntityForSchema<Definition extends SharedSchemaDefinition>(
  value: object,
  schema: SharedSchema<Definition>
): value is SharedEntity<Definition> {
  return schema.fields.every((field) => Reflect.has(value, field.name) && isSharedFieldValue(field.type, Reflect.get(value, field.name)));
}

function sharedEntityEntry<Definition extends SharedSchemaDefinition, Type extends SharedPrimitiveFieldType>(
  pool: SharedMemoryPoolState<Definition>,
  slotIndex: number,
  field: SharedSchemaField<Type>
): readonly [string, SharedFieldValue<Type>] {
  return [field.name, readFieldByInfo(pool, slotIndex, field)];
}

function assertSlotCount(slotCount: number) {
  if (!Number.isSafeInteger(slotCount) || slotCount < 0) throw new Error(`shared memory slotCount must be a non-negative safe integer: ${slotCount}`);
}

function assertAttempts(maxAttempts: number) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error(`shared memory maxAttempts must be a positive integer: ${maxAttempts}`);
}

function assertIntegerRange(value: unknown, type: string, min: number, max: number): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`shared ${type} value out of range: ${String(value)}`);
}

function assertFiniteNumber(value: unknown, type: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`shared ${type} value must be finite: ${String(value)}`);
}

function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`shared bool value must be boolean: ${String(value)}`);
}

function readPrimitive(view: DataView, offset: number, type: SharedPrimitiveFieldType) {
  switch (type) {
    case "u8":
      return view.getUint8(offset);
    case "u16":
      return view.getUint16(offset, true);
    case "u32":
      return view.getUint32(offset, true);
    case "i16":
      return view.getInt16(offset, true);
    case "i32":
      return view.getInt32(offset, true);
    case "f32":
      return view.getFloat32(offset, true);
    case "bool":
      return view.getUint8(offset) !== 0;
  }
}

function writePrimitive(view: DataView, offset: number, type: SharedPrimitiveFieldType, value: unknown) {
  switch (type) {
    case "u8":
      assertIntegerRange(value, type, 0, 255);
      view.setUint8(offset, value);
      return;
    case "u16":
      assertIntegerRange(value, type, 0, 65535);
      view.setUint16(offset, value, true);
      return;
    case "u32":
      assertIntegerRange(value, type, 0, 4294967295);
      view.setUint32(offset, value, true);
      return;
    case "i16":
      assertIntegerRange(value, type, -32768, 32767);
      view.setInt16(offset, value, true);
      return;
    case "i32":
      assertIntegerRange(value, type, -2147483648, 2147483647);
      view.setInt32(offset, value, true);
      return;
    case "f32":
      assertFiniteNumber(value, type);
      view.setFloat32(offset, value, true);
      return;
    case "bool":
      assertBoolean(value);
      view.setUint8(offset, value ? 1 : 0);
      return;
  }
}

export function isSharedMemoryTickStable(tick: number): boolean {
  return (tick & 1) === 0;
}

export function isSharedMemoryReadConsistent(startTick: number, endTick: number): boolean {
  return startTick === endTick && isSharedMemoryTickStable(endTick);
}

export function defineSharedSchema<const Definition extends SharedSchemaDefinition>(definition: Definition): SharedSchema<Definition> {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
    throw new Error("shared schema definition must be an object");
  }
  const definitionPrototype = Object.getPrototypeOf(definition);
  if (definitionPrototype !== Object.prototype && definitionPrototype !== null) {
    throw new Error("shared schema definition must be a plain object");
  }
  for (const key of Reflect.ownKeys(definition)) {
    if (typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(definition, key)) {
      throw new Error("shared schema fields must be enumerable string properties");
    }
  }
  let offset = 0;
  let maxAlignment = 1;
  const fields: SharedSchemaField[] = [];

  for (const name of Object.keys(definition)) {
    const type = Reflect.get(definition, name);
    if (typeof type !== "string") throw new Error(`unsupported shared schema field type: ${String(type)}`);
    if (name === "toJSON") throw new Error("shared schema field name is reserved: toJSON");
    assertPrimitiveType(type);
    const layout = PRIMITIVE_LAYOUT[type];
    offset = alignTo(offset, layout.alignment);
    const field: SharedSchemaField = Object.freeze({
      name,
      type,
      offset,
      byteSize: layout.byteSize,
      alignment: layout.alignment
    });
    fields.push(field);
    offset += layout.byteSize;
    maxAlignment = Math.max(maxAlignment, layout.alignment);
  }

  const fieldMap: Readonly<Record<string, SharedSchemaField | undefined>> = Object.freeze(Object.fromEntries(
    fields.map((field) => [field.name, field])
  ));
  if (!isSharedSchemaFieldMap(definition, fieldMap)) throw new Error("shared schema field map does not match its definition");

  return Object.freeze({
    definition,
    fields: Object.freeze(fields.slice()),
    fieldMap: Object.freeze(fieldMap),
    byteSize: alignTo(offset, maxAlignment),
    alignment: maxAlignment
  });
}

export type SharedMemoryPool<Definition extends SharedSchemaDefinition = SharedSchemaDefinition> = {
  readonly schema: SharedSchema<Definition>;
  readonly slotCount: number;
  readonly slotByteSize: number;
  readonly slotStrideByteSize: number;
  readonly occupancyStride: number;
  readonly buffer: SharedArrayBuffer;
  readonly dataByteOffset: number;
  beginTick(): number;
  endTick(): number;
  readTick(): number;
  withTick<T>(write: () => T): T;
  readConsistent<T>(read: () => T, options?: SharedMemoryReadOptions): SharedMemoryConsistentRead<T>;
  getEntityByteOffset(slotIndex: number): number;
  getEntityByteSlice(slotIndex: number): Uint8Array;
  copyEntityBytes(slotIndex: number, target?: Uint8Array): Uint8Array;
  spawn(initial?: Partial<SharedEntity<Definition>>): SharedEntityHandle<Definition>;
  release(handle: Pick<SharedEntityHandle<Definition>, "slot" | "generation">): void;
  release(slotIndex: number, expectedGeneration: number): void;
  readConsistentEntityBytes(slotIndex: number, options?: SharedEntityByteReadOptions): SharedEntityByteRead;
  createEntityView(slotIndex: number): SharedEntity<Definition>;
  readField<Name extends keyof Definition & string>(slotIndex: number, fieldName: Name): SharedFieldValue<Definition[Name]>;
  writeField<Name extends keyof Definition & string>(slotIndex: number, fieldName: Name, value: SharedFieldValue<Definition[Name]>): void;
  occupiedSlots(out?: number[]): number[];
  readFieldColumn<Name extends keyof Definition & string>(fieldName: Name, slots: readonly number[], target?: SharedFieldColumn): SharedFieldColumn;
  writeFieldColumn<Name extends keyof Definition & string>(fieldName: Name, slots: readonly number[], values: ArrayLike<number>): void;
  snapshotEntity(slotIndex: number): SharedEntity<Definition>;
  clearSlot(slotIndex: number): void;
};

type SharedMemoryPoolState<Definition extends SharedSchemaDefinition> = {
  readonly schema: SharedSchema<Definition>;
  readonly slotCount: number;
  readonly slotByteSize: number;
  readonly slotStrideByteSize: number;
  readonly occupancyStride: number;
  readonly buffer: SharedArrayBuffer;
  readonly dataByteOffset: number;
  readonly view: DataView;
  readonly header: Int32Array;
  readonly occupied: Int32Array;
  readonly entityViews: Map<number, { token: number; entity: object }>;
  nextSlot: number;
  openTick: number | undefined;
};

export function createSharedMemoryPool<Definition extends SharedSchemaDefinition>(
  schema: SharedSchema<Definition>,
  optionsOrSlotCount: SharedMemoryPoolOptions | number
): SharedMemoryPool<Definition> {
  const options = typeof optionsOrSlotCount === "number" ? { slotCount: optionsOrSlotCount } : optionsOrSlotCount;
  const slotCount = options.slotCount ?? options.capacity;
  if (slotCount === undefined) throw new Error("shared memory pool requires slotCount or capacity");
  assertSlotCount(slotCount);
  const slotByteSize = schema.byteSize;
  const occupancyStride = options.cacheLineAlignedSlots ? SHARED_CACHE_LINE_BYTE_SIZE / Int32Array.BYTES_PER_ELEMENT : 1;
  const slotStrideByteSize = options.cacheLineAlignedSlots ? alignTo(slotByteSize, SHARED_CACHE_LINE_BYTE_SIZE) : slotByteSize;
  const occupancyByteLength = slotCount * occupancyStride * Int32Array.BYTES_PER_ELEMENT;
  const dataByteOffset = alignTo(SHARED_MEMORY_HEADER_BYTE_SIZE + occupancyByteLength, SHARED_CACHE_LINE_BYTE_SIZE);
  const byteLength = dataByteOffset + slotCount * slotStrideByteSize;
  if (![occupancyByteLength, dataByteOffset, byteLength].every(Number.isSafeInteger)) {
    throw new Error("shared memory pool byte length exceeds the safe integer range");
  }
  const buffer = options.buffer ?? new SharedArrayBuffer(byteLength);
  if (buffer.byteLength < byteLength) throw new Error("shared memory buffer too small: need " + byteLength + " bytes, got " + buffer.byteLength);
  const pool: SharedMemoryPoolState<Definition> = {
    schema,
    slotCount,
    slotByteSize,
    slotStrideByteSize,
    occupancyStride,
    buffer,
    dataByteOffset,
    view: new DataView(buffer),
    header: new Int32Array(buffer, 0, HEADER_INT_COUNT),
    occupied: new Int32Array(buffer, SHARED_MEMORY_HEADER_BYTE_SIZE, slotCount * occupancyStride),
    entityViews: new Map(),
    nextSlot: 0,
    openTick: undefined
  };
  initializeHeader(pool);
  return {
    schema,
    slotCount,
    slotByteSize,
    slotStrideByteSize,
    occupancyStride,
    buffer,
    dataByteOffset,
    beginTick: () => beginTick(pool),
    endTick: () => endTick(pool),
    readTick: () => readTick(pool),
    withTick: (write) => withTick(pool, write),
    readConsistent: (read, options) => readConsistent(pool, read, options),
    getEntityByteOffset: (slotIndex) => getEntityByteOffset(pool, slotIndex),
    getEntityByteSlice: (slotIndex) => getEntityByteSlice(pool, slotIndex),
    copyEntityBytes: (slotIndex, target) => copyEntityBytes(pool, slotIndex, target),
    spawn: (initial) => spawn(pool, initial),
    release: (slotOrHandle: number | Pick<SharedEntityHandle<Definition>, "slot" | "generation">, expectedGeneration?: number) => release(pool, slotOrHandle, expectedGeneration),
    readConsistentEntityBytes: (slotIndex, options) => readConsistentEntityBytes(pool, slotIndex, options),
    createEntityView: (slotIndex) => createEntityView(pool, slotIndex),
    readField: (slotIndex, fieldName) => readField(pool, slotIndex, fieldName),
    writeField: (slotIndex, fieldName, value) => writeField(pool, slotIndex, fieldName, value),
    occupiedSlots: (out) => occupiedSlots(pool, out),
    readFieldColumn: (fieldName, slots, target) => readFieldColumn(pool, fieldName, slots, target),
    writeFieldColumn: (fieldName, slots, values) => writeFieldColumn(pool, fieldName, slots, values),
    snapshotEntity: (slotIndex) => snapshotEntity(pool, slotIndex),
    clearSlot: (slotIndex) => clearSlot(pool, slotIndex)
  };
}

export function SharedMemoryPool<Definition extends SharedSchemaDefinition>(
  schema: SharedSchema<Definition>,
  optionsOrSlotCount: SharedMemoryPoolOptions | number
): SharedMemoryPool<Definition> {
  return createSharedMemoryPool(schema, optionsOrSlotCount);
}

function beginTick<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>): number {
    if (pool.openTick !== undefined) throw new Error("shared memory tick already open");
    const current = Atomics.load(pool.header, TICK_HEADER_INDEX);
    if (!isSharedMemoryTickStable(current)) throw new Error("shared memory tick already open");
    const next = (current + 1) | 0;
    if (Atomics.compareExchange(pool.header, TICK_HEADER_INDEX, current, next) !== current) {
      throw new Error("shared memory tick already open");
    }
    pool.openTick = next;
    return next;
  }

function endTick<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>): number {
    const current = pool.openTick;
    if (current === undefined) throw new Error("shared memory tick is not open for this pool");
    const next = (current + 1) | 0;
    if (Atomics.compareExchange(pool.header, TICK_HEADER_INDEX, current, next) !== current) {
      pool.openTick = undefined;
      throw new Error("shared memory tick ownership was lost");
    }
    pool.openTick = undefined;
    Atomics.notify(pool.header, TICK_HEADER_INDEX);
    return next;
  }

function readTick<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>): number {
    return Atomics.load(pool.header, TICK_HEADER_INDEX);
  }

function withTick<Definition extends SharedSchemaDefinition, T>(pool: SharedMemoryPoolState<Definition>, write: () => T): T {
    beginTick(pool);
    try {
      return write();
    } finally {
      endTick(pool);
    }
  }

function readConsistent<Definition extends SharedSchemaDefinition, T>(pool: SharedMemoryPoolState<Definition>, read: () => T, options: SharedMemoryReadOptions = {}): SharedMemoryConsistentRead<T> {
    const maxAttempts = options.maxAttempts ?? 8;
    assertAttempts(maxAttempts);

    for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
      const startTick = readTick(pool);
      if (!isSharedMemoryTickStable(startTick)) continue;
      const value = read();
      const endTick = readTick(pool);
      if (isSharedMemoryReadConsistent(startTick, endTick)) return { value, tick: endTick, attempts };
    }

    throw new Error(`shared memory read stayed inconsistent after ${maxAttempts} attempts`);
  }

function getEntityByteOffset<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number): number {
    assertSlotIndex(pool, slotIndex);
    return pool.dataByteOffset + slotIndex * pool.slotStrideByteSize;
  }

function getEntityByteSlice<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number): Uint8Array {
    const offset = getEntityByteOffset(pool, slotIndex);
    return new Uint8Array(pool.buffer, offset, pool.slotByteSize);
  }

function copyEntityBytes<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number, target?: Uint8Array): Uint8Array {
    const output = prepareByteTarget(pool, target);
    output.set(getEntityByteSlice(pool, slotIndex));
    return output;
  }

function spawn<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, initial: Partial<SharedEntity<Definition>> = {}): SharedEntityHandle<Definition> {
    const { slot, occupiedToken } = allocateSlot(pool);
    try {
      clearSlotBytes(pool, slot);
      for (const field of pool.schema.fields) {
        const value = Reflect.get(initial, field.name);
        if (value !== undefined) writeFieldByInfo(pool, slot, field, value);
      }
      Atomics.store(pool.occupied, occupancyIndexForPool(pool, slot), occupiedToken);
      const entity = createEntityView(pool, slot);
      return {
        slot,
        generation: occupiedToken >>> 2,
        byteOffset: getEntityByteOffset(pool, slot),
        byteLength: pool.slotByteSize,
        entity
      };
    } catch (error) {
      clearSlotBytes(pool, slot);
      pool.entityViews.delete(slot);
      Atomics.store(pool.occupied, occupancyIndexForPool(pool, slot), (occupiedToken - SLOT_OCCUPIED) | 0);
      Atomics.notify(pool.occupied, occupancyIndexForPool(pool, slot));
      throw error;
    }
  }

function release<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotOrHandle: number | Pick<SharedEntityHandle<Definition>, "slot" | "generation">, expectedGeneration?: number): void {
    const slotIndex = typeof slotOrHandle === "number" ? slotOrHandle : slotOrHandle.slot;
    const generation = typeof slotOrHandle === "number" ? expectedGeneration : slotOrHandle.generation;
    if (generation === undefined || !Number.isSafeInteger(generation) || generation < 0) {
      throw new Error("shared entity release requires a non-negative safe generation");
    }
    assertSlotIndex(pool, slotIndex);
    const occupancyIndex = occupancyIndexForPool(pool, slotIndex);
    const occupiedToken = Atomics.load(pool.occupied, occupancyIndex);
    if ((occupiedToken & SLOT_STATE_MASK) !== SLOT_OCCUPIED) {
      throw new Error(`shared entity slot is not occupied: ${slotIndex}`);
    }
    if (occupiedToken >>> 2 !== generation) {
      throw new Error(`shared entity handle is stale: ${slotIndex}`);
    }
    const releasingToken = (occupiedToken - SLOT_OCCUPIED + SLOT_RELEASING) | 0;
    if (Atomics.compareExchange(pool.occupied, occupancyIndex, occupiedToken, releasingToken) !== occupiedToken) {
      throw new Error(`shared entity slot is not occupied: ${slotIndex}`);
    }
    clearSlotBytes(pool, slotIndex);
    pool.entityViews.delete(slotIndex);
    pool.nextSlot = Math.min(pool.nextSlot, slotIndex);
    Atomics.store(pool.occupied, occupancyIndex, (occupiedToken - SLOT_OCCUPIED + SLOT_GENERATION_INCREMENT) | 0);
    Atomics.notify(pool.occupied, occupancyIndex);
  }

function readConsistentEntityBytes<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number, options: SharedEntityByteReadOptions = {}): SharedEntityByteRead {
    assertSlotIndex(pool, slotIndex);
    const maxAttempts = options.maxAttempts ?? 8;
    assertAttempts(maxAttempts);
    const output = prepareByteTarget(pool, options.target);
    const source = getEntityByteSlice(pool, slotIndex);

    for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
      const occupancy = assertOccupiedSlot(pool, slotIndex);
      const startTick = readTick(pool);
      if (!isSharedMemoryTickStable(startTick)) continue;
      output.set(source);
      const endTick = readTick(pool);
      if (isSharedMemoryReadConsistent(startTick, endTick) && Atomics.load(pool.occupied, occupancyIndexForPool(pool, slotIndex)) === occupancy) {
        return { bytes: output, tick: endTick, attempts };
      }
    }

    throw new Error(`shared entity byte read stayed inconsistent after ${maxAttempts} attempts`);
  }

function createEntityView<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number): SharedEntity<Definition> {
    assertSlotIndex(pool, slotIndex);
    const token = assertOccupiedSlot(pool, slotIndex);
    const cached = pool.entityViews.get(slotIndex);
    if (cached?.token === token) {
      if (!isSharedEntityForSchema(cached.entity, pool.schema)) throw new Error(`shared entity cache is invalid: ${slotIndex}`);
      return cached.entity;
    }

    let entity: object = Object.create(null);
    const proxy = new Proxy(entity, {
      get: (_target, property) => {
        assertEntityToken(pool, slotIndex, token, entity);
        if (property === "toJSON") {
          return () => {
            assertEntityToken(pool, slotIndex, token, entity);
            return snapshotEntity(pool, slotIndex);
          };
        }
        if (typeof property !== "string") return undefined;
        const field = getField(pool, property);
        return readFieldByInfo(pool, slotIndex, field);
      },
      set: (_target, property, value) => {
        assertEntityToken(pool, slotIndex, token, entity);
        if (typeof property !== "string") throw new Error("shared entity field name must be a string");
        const field = getField(pool, property);
        writeFieldByInfo(pool, slotIndex, field, value);
        return true;
      },
      has: (_target, property) => {
        assertEntityToken(pool, slotIndex, token, entity);
        return typeof property === "string" && property in pool.schema.fieldMap;
      },
      ownKeys: () => {
        assertEntityToken(pool, slotIndex, token, entity);
        return pool.schema.fields.map((field) => field.name);
      },
      getOwnPropertyDescriptor: (_target, property) => {
        assertEntityToken(pool, slotIndex, token, entity);
        if (typeof property !== "string" || !(property in pool.schema.fieldMap)) return undefined;
        return { enumerable: true, configurable: true };
      },
      deleteProperty: () => {
        assertEntityToken(pool, slotIndex, token, entity);
        throw new Error("shared entity fields cannot be deleted");
      }
    });
    entity = proxy;
    pool.entityViews.set(slotIndex, { token, entity });
    if (!isSharedEntityForSchema(proxy, pool.schema)) {
      pool.entityViews.delete(slotIndex);
      throw new Error(`shared entity proxy does not match its schema: ${slotIndex}`);
    }

    sharedEntityMeta.set(proxy, {
      slot: slotIndex,
      generation: token >>> 2,
      byteOffset: getEntityByteOffset(pool, slotIndex),
      byteLength: pool.slotByteSize
    });
    pool.entityViews.set(slotIndex, { token, entity: proxy });
    return proxy;
  }

function readField<Definition extends SharedSchemaDefinition, Name extends keyof Definition & string>(pool: SharedMemoryPoolState<Definition>, slotIndex: number, fieldName: Name): SharedFieldValue<Definition[Name]> {
    assertOccupiedSlot(pool, slotIndex);
    return readFieldByInfo(pool, slotIndex, getField(pool, fieldName));
  }

function writeField<Definition extends SharedSchemaDefinition, Name extends keyof Definition & string>(pool: SharedMemoryPoolState<Definition>, slotIndex: number, fieldName: Name, value: SharedFieldValue<Definition[Name]>): void {
    assertOccupiedSlot(pool, slotIndex);
    writeFieldByInfo(pool, slotIndex, getField(pool, fieldName), value);
  }

function occupiedSlots<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, out: number[] = []): number[] {
    out.length = 0;
    for (let slot = 0; slot < pool.slotCount; slot += 1) {
      if ((Atomics.load(pool.occupied, occupancyIndexForPool(pool, slot)) & SLOT_STATE_MASK) === SLOT_OCCUPIED) out.push(slot);
    }
    return out;
  }

function readFieldColumn<Definition extends SharedSchemaDefinition, Name extends keyof Definition & string>(pool: SharedMemoryPoolState<Definition>, fieldName: Name, slots: readonly number[], target?: SharedFieldColumn): SharedFieldColumn {
    const field = getField(pool, fieldName);
    const output = target ?? createFieldColumn(field.type, slots.length);
    if (output.length < slots.length) throw new Error(`shared field column target too small: need ${slots.length} values, got ${output.length}`);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      assertOccupiedSlot(pool, slot);
      output[index] = Number(readFieldByInfo(pool, slot, field));
    }
    return output;
  }

function writeFieldColumn<Definition extends SharedSchemaDefinition, Name extends keyof Definition & string>(pool: SharedMemoryPoolState<Definition>, fieldName: Name, slots: readonly number[], values: ArrayLike<number>): void {
    if (values.length < slots.length) throw new Error(`shared field column source too small: need ${slots.length} values, got ${values.length}`);
    const field = getField(pool, fieldName);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      assertOccupiedSlot(pool, slot);
      writeFieldByInfo(pool, slot, field, field.type === "bool" ? values[index] !== 0 : values[index]);
    }
  }

function snapshotEntity<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number): SharedEntity<Definition> {
    assertOccupiedSlot(pool, slotIndex);
    const snapshot = Object.fromEntries(pool.schema.fields.map((field) => sharedEntityEntry(pool, slotIndex, field)));
    if (!isSharedEntityForSchema(snapshot, pool.schema)) throw new Error(`shared entity snapshot does not match its schema: ${slotIndex}`);
    return snapshot;
  }

function clearSlot<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number): void {
    assertOccupiedSlot(pool, slotIndex);
    clearSlotBytes(pool, slotIndex);
  }

function initializeHeader<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>) {
    const [schemaHashA, schemaHashB] = schemaIdentity(pool.schema);
    let state = Atomics.compareExchange(pool.header, INITIALIZATION_STATE_HEADER_INDEX, 0, HEADER_INITIALIZING);
    if (state === 0) {
      Atomics.store(pool.header, TICK_HEADER_INDEX, 0);
      Atomics.store(pool.header, SLOT_COUNT_HEADER_INDEX, pool.slotCount);
      Atomics.store(pool.header, SLOT_BYTE_SIZE_HEADER_INDEX, pool.slotByteSize);
      Atomics.store(pool.header, SCHEMA_HASH_A_HEADER_INDEX, schemaHashA);
      Atomics.store(pool.header, SCHEMA_HASH_B_HEADER_INDEX, schemaHashB);
      Atomics.store(pool.header, DATA_BYTE_OFFSET_HEADER_INDEX, pool.dataByteOffset);
      Atomics.store(pool.header, FORMAT_VERSION_HEADER_INDEX, SHARED_MEMORY_FORMAT_VERSION);
      Atomics.store(pool.header, OCCUPANCY_STRIDE_HEADER_INDEX, pool.occupancyStride);
      Atomics.store(pool.header, SLOT_STRIDE_BYTE_SIZE_HEADER_INDEX, pool.slotStrideByteSize);
      pool.occupied.fill(SLOT_FREE);
      new Uint8Array(pool.buffer, pool.dataByteOffset, pool.slotCount * pool.slotStrideByteSize).fill(0);
      Atomics.store(pool.header, INITIALIZATION_STATE_HEADER_INDEX, HEADER_READY);
      Atomics.notify(pool.header, INITIALIZATION_STATE_HEADER_INDEX);
      return;
    }

    if (state === HEADER_INITIALIZING) {
      for (let attempts = 0; attempts < 100 && state === HEADER_INITIALIZING; attempts += 1) {
        try {
          Atomics.wait(pool.header, INITIALIZATION_STATE_HEADER_INDEX, HEADER_INITIALIZING, 10);
        } catch {
          // Atomics.wait is unavailable on browser main threads; repeated atomic loads still observe worker initialization.
        }
        state = Atomics.load(pool.header, INITIALIZATION_STATE_HEADER_INDEX);
      }
    }

    if (state !== HEADER_READY) throw new Error("shared memory header initialization did not complete");
    if (
      Atomics.load(pool.header, FORMAT_VERSION_HEADER_INDEX) !== SHARED_MEMORY_FORMAT_VERSION ||
      Atomics.load(pool.header, SLOT_COUNT_HEADER_INDEX) !== pool.slotCount ||
      Atomics.load(pool.header, SLOT_BYTE_SIZE_HEADER_INDEX) !== pool.slotByteSize ||
      Atomics.load(pool.header, SCHEMA_HASH_A_HEADER_INDEX) !== schemaHashA ||
      Atomics.load(pool.header, SCHEMA_HASH_B_HEADER_INDEX) !== schemaHashB ||
      Atomics.load(pool.header, DATA_BYTE_OFFSET_HEADER_INDEX) !== pool.dataByteOffset ||
      Atomics.load(pool.header, OCCUPANCY_STRIDE_HEADER_INDEX) !== pool.occupancyStride ||
      Atomics.load(pool.header, SLOT_STRIDE_BYTE_SIZE_HEADER_INDEX) !== pool.slotStrideByteSize
    ) {
      throw new Error("shared memory header does not match schema or slot count");
    }
  }

function assertSlotIndex<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= pool.slotCount) {
      throw new Error(`shared entity slot out of range: ${slotIndex}`);
    }
  }

function allocateSlot<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>) {
    for (let scan = 0; scan < pool.slotCount; scan += 1) {
      const slot = (pool.nextSlot + scan) % pool.slotCount;
      const occupancyIndex = occupancyIndexForPool(pool, slot);
      const freeToken = Atomics.load(pool.occupied, occupancyIndex);
      if ((freeToken & SLOT_STATE_MASK) !== SLOT_FREE) continue;
      const allocatingToken = (freeToken + SLOT_ALLOCATING) | 0;
      if (Atomics.compareExchange(pool.occupied, occupancyIndex, freeToken, allocatingToken) !== freeToken) continue;
      pool.nextSlot = (slot + 1) % pool.slotCount;
      return { slot, occupiedToken: (freeToken + SLOT_OCCUPIED) | 0 };
    }
    throw new Error("shared memory pool is full");
  }

function getField<Definition extends SharedSchemaDefinition, Name extends keyof Definition & string>(
  pool: SharedMemoryPoolState<Definition>,
  fieldName: Name
): SharedSchemaField<Definition[Name]>;
function getField<Definition extends SharedSchemaDefinition>(
  pool: SharedMemoryPoolState<Definition>,
  fieldName: string
): SharedSchemaField;
function getField<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, fieldName: string): SharedSchemaField {
    const field = Reflect.get(pool.schema.fieldMap, fieldName);
    if (!field) throw new Error(`unknown shared schema field: ${fieldName}`);
    if (!isSharedSchemaField(field) || field.type !== Reflect.get(pool.schema.definition, fieldName)) {
      throw new Error(`shared schema field metadata is invalid: ${fieldName}`);
    }
    return field;
  }

function assertOccupiedSlot<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number) {
    assertSlotIndex(pool, slotIndex);
    const token = Atomics.load(pool.occupied, occupancyIndexForPool(pool, slotIndex));
    if ((token & SLOT_STATE_MASK) !== SLOT_OCCUPIED) throw new Error(`shared entity slot is not occupied: ${slotIndex}`);
    return token;
  }

function assertEntityToken<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number, token: number, entity: object) {
    const cached = pool.entityViews.get(slotIndex);
    if (cached?.entity !== entity || cached.token !== token || Atomics.load(pool.occupied, occupancyIndexForPool(pool, slotIndex)) !== token) {
      throw new Error(`shared entity view is stale: ${slotIndex}`);
    }
  }

function readFieldByInfo<Definition extends SharedSchemaDefinition, Type extends SharedPrimitiveFieldType>(
  pool: SharedMemoryPoolState<Definition>,
  slotIndex: number,
  field: SharedSchemaField<Type>
): SharedFieldValue<Type> {
    assertSlotIndex(pool, slotIndex);
    const value = readPrimitive(pool.view, getEntityByteOffset(pool, slotIndex) + field.offset, field.type);
    if (!isSharedFieldValue(field.type, value)) throw new Error(`shared field value is invalid: ${field.name}`);
    return value;
  }

function writeFieldByInfo<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number, field: SharedSchemaField, value: unknown) {
    assertSlotIndex(pool, slotIndex);
    writePrimitive(pool.view, getEntityByteOffset(pool, slotIndex) + field.offset, field.type, value);
  }

function clearSlotBytes<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number) {
    const offset = pool.dataByteOffset + slotIndex * pool.slotStrideByteSize;
    new Uint8Array(pool.buffer, offset, pool.slotByteSize).fill(0);
  }

function occupancyIndexForPool<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, slotIndex: number) {
    return slotIndex * pool.occupancyStride;
  }

function prepareByteTarget<Definition extends SharedSchemaDefinition>(pool: SharedMemoryPoolState<Definition>, target?: Uint8Array): Uint8Array {
    if (!target) return new Uint8Array(pool.slotByteSize);
    if (target.byteLength < pool.slotByteSize) {
      throw new Error(`shared entity byte target too small: need ${pool.slotByteSize} bytes, got ${target.byteLength}`);
    }
    return target.byteLength === pool.slotByteSize ? target : target.subarray(0, pool.slotByteSize);
  }

export function sharedEntityBytes(entity: object) {
  const meta = sharedEntityMeta.get(entity);
  if (!meta) throw new Error("object is not a shared entity proxy");
  return meta;
}
