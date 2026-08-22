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
} as const satisfies Record<SharedPrimitiveFieldType, { byteSize: number; alignment: number }>;

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
  const fieldMap = Object.create(null) as { [Name in keyof Definition & string]: SharedSchemaField<Definition[Name]> };

  for (const [name, type] of Object.entries(definition) as [keyof Definition & string, Definition[keyof Definition & string]][]) {
    if (name === "toJSON") throw new Error("shared schema field name is reserved: toJSON");
    assertPrimitiveType(type);
    const layout = PRIMITIVE_LAYOUT[type];
    offset = alignTo(offset, layout.alignment);
    const field = Object.freeze({
      name,
      type,
      offset,
      byteSize: layout.byteSize,
      alignment: layout.alignment
    }) as SharedSchemaField<Definition[typeof name]>;
    fields.push(field);
    fieldMap[name] = field;
    offset += layout.byteSize;
    maxAlignment = Math.max(maxAlignment, layout.alignment);
  }

  return Object.freeze({
    definition,
    fields: Object.freeze(fields.slice()),
    fieldMap: Object.freeze(fieldMap),
    byteSize: alignTo(offset, maxAlignment),
    alignment: maxAlignment
  });
}

export class SharedMemoryPool<Definition extends SharedSchemaDefinition> {
  readonly schema: SharedSchema<Definition>;
  readonly slotCount: number;
  readonly slotByteSize: number;
  readonly slotStrideByteSize: number;
  readonly occupancyStride: number;
  readonly buffer: SharedArrayBuffer;
  readonly dataByteOffset: number;

  private readonly view: DataView;
  private readonly header: Int32Array;
  private readonly occupied: Int32Array;
  private readonly entityViews = new Map<number, { token: number; entity: SharedEntity<Definition> }>();
  private nextSlot = 0;
  private openTick: number | undefined;

  constructor(schema: SharedSchema<Definition>, optionsOrSlotCount: SharedMemoryPoolOptions | number) {
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
    if (buffer.byteLength < byteLength) {
      throw new Error(`shared memory buffer too small: need ${byteLength} bytes, got ${buffer.byteLength}`);
    }

    this.schema = schema;
    this.slotCount = slotCount;
    this.slotByteSize = slotByteSize;
    this.slotStrideByteSize = slotStrideByteSize;
    this.occupancyStride = occupancyStride;
    this.buffer = buffer;
    this.dataByteOffset = dataByteOffset;
    this.view = new DataView(buffer);
    this.header = new Int32Array(buffer, 0, HEADER_INT_COUNT);
    this.occupied = new Int32Array(buffer, SHARED_MEMORY_HEADER_BYTE_SIZE, this.slotCount * this.occupancyStride);
    this.initializeHeader();
  }

  beginTick(): number {
    if (this.openTick !== undefined) throw new Error("shared memory tick already open");
    const current = Atomics.load(this.header, TICK_HEADER_INDEX);
    if (!isSharedMemoryTickStable(current)) throw new Error("shared memory tick already open");
    const next = (current + 1) | 0;
    if (Atomics.compareExchange(this.header, TICK_HEADER_INDEX, current, next) !== current) {
      throw new Error("shared memory tick already open");
    }
    this.openTick = next;
    return next;
  }

  endTick(): number {
    const current = this.openTick;
    if (current === undefined) throw new Error("shared memory tick is not open for this pool");
    const next = (current + 1) | 0;
    if (Atomics.compareExchange(this.header, TICK_HEADER_INDEX, current, next) !== current) {
      this.openTick = undefined;
      throw new Error("shared memory tick ownership was lost");
    }
    this.openTick = undefined;
    Atomics.notify(this.header, TICK_HEADER_INDEX);
    return next;
  }

  readTick(): number {
    return Atomics.load(this.header, TICK_HEADER_INDEX);
  }

  withTick<T>(write: () => T): T {
    this.beginTick();
    try {
      return write();
    } finally {
      this.endTick();
    }
  }

  readConsistent<T>(read: () => T, options: SharedMemoryReadOptions = {}): SharedMemoryConsistentRead<T> {
    const maxAttempts = options.maxAttempts ?? 8;
    assertAttempts(maxAttempts);

    for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
      const startTick = this.readTick();
      if (!isSharedMemoryTickStable(startTick)) continue;
      const value = read();
      const endTick = this.readTick();
      if (isSharedMemoryReadConsistent(startTick, endTick)) return { value, tick: endTick, attempts };
    }

    throw new Error(`shared memory read stayed inconsistent after ${maxAttempts} attempts`);
  }

  getEntityByteOffset(slotIndex: number): number {
    this.assertSlotIndex(slotIndex);
    return this.dataByteOffset + slotIndex * this.slotStrideByteSize;
  }

  getEntityByteSlice(slotIndex: number): Uint8Array {
    const offset = this.getEntityByteOffset(slotIndex);
    return new Uint8Array(this.buffer, offset, this.slotByteSize);
  }

  copyEntityBytes(slotIndex: number, target?: Uint8Array): Uint8Array {
    const output = this.prepareByteTarget(target);
    output.set(this.getEntityByteSlice(slotIndex));
    return output;
  }

  spawn(initial: Partial<SharedEntity<Definition>> = {}): SharedEntityHandle<Definition> {
    const { slot, occupiedToken } = this.allocateSlot();
    try {
      this.clearSlotBytes(slot);
      for (const field of this.schema.fields) {
        const value = (initial as Record<string, unknown>)[field.name];
        if (value !== undefined) this.writeFieldByInfo(slot, field, value);
      }
      Atomics.store(this.occupied, this.occupancyIndex(slot), occupiedToken);
      const entity = this.createEntityView(slot);
      return {
        slot,
        generation: occupiedToken >>> 2,
        byteOffset: this.getEntityByteOffset(slot),
        byteLength: this.slotByteSize,
        entity
      };
    } catch (error) {
      this.clearSlotBytes(slot);
      this.entityViews.delete(slot);
      Atomics.store(this.occupied, this.occupancyIndex(slot), (occupiedToken - SLOT_OCCUPIED) | 0);
      Atomics.notify(this.occupied, this.occupancyIndex(slot));
      throw error;
    }
  }

  release(handle: Pick<SharedEntityHandle<Definition>, "slot" | "generation">): void;
  release(slotIndex: number, expectedGeneration: number): void;
  release(slotOrHandle: number | Pick<SharedEntityHandle<Definition>, "slot" | "generation">, expectedGeneration?: number): void {
    const slotIndex = typeof slotOrHandle === "number" ? slotOrHandle : slotOrHandle.slot;
    const generation = typeof slotOrHandle === "number" ? expectedGeneration : slotOrHandle.generation;
    if (generation === undefined || !Number.isSafeInteger(generation) || generation < 0) {
      throw new Error("shared entity release requires a non-negative safe generation");
    }
    this.assertSlotIndex(slotIndex);
    const occupancyIndex = this.occupancyIndex(slotIndex);
    const occupiedToken = Atomics.load(this.occupied, occupancyIndex);
    if ((occupiedToken & SLOT_STATE_MASK) !== SLOT_OCCUPIED) {
      throw new Error(`shared entity slot is not occupied: ${slotIndex}`);
    }
    if (occupiedToken >>> 2 !== generation) {
      throw new Error(`shared entity handle is stale: ${slotIndex}`);
    }
    const releasingToken = (occupiedToken - SLOT_OCCUPIED + SLOT_RELEASING) | 0;
    if (Atomics.compareExchange(this.occupied, occupancyIndex, occupiedToken, releasingToken) !== occupiedToken) {
      throw new Error(`shared entity slot is not occupied: ${slotIndex}`);
    }
    this.clearSlotBytes(slotIndex);
    this.entityViews.delete(slotIndex);
    this.nextSlot = Math.min(this.nextSlot, slotIndex);
    Atomics.store(this.occupied, occupancyIndex, (occupiedToken - SLOT_OCCUPIED + SLOT_GENERATION_INCREMENT) | 0);
    Atomics.notify(this.occupied, occupancyIndex);
  }

  readConsistentEntityBytes(slotIndex: number, options: SharedEntityByteReadOptions = {}): SharedEntityByteRead {
    this.assertSlotIndex(slotIndex);
    const maxAttempts = options.maxAttempts ?? 8;
    assertAttempts(maxAttempts);
    const output = this.prepareByteTarget(options.target);
    const source = this.getEntityByteSlice(slotIndex);

    for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
      const occupancy = this.assertOccupiedSlot(slotIndex);
      const startTick = this.readTick();
      if (!isSharedMemoryTickStable(startTick)) continue;
      output.set(source);
      const endTick = this.readTick();
      if (isSharedMemoryReadConsistent(startTick, endTick) && Atomics.load(this.occupied, this.occupancyIndex(slotIndex)) === occupancy) {
        return { bytes: output, tick: endTick, attempts };
      }
    }

    throw new Error(`shared entity byte read stayed inconsistent after ${maxAttempts} attempts`);
  }

  createEntityView(slotIndex: number): SharedEntity<Definition> {
    this.assertSlotIndex(slotIndex);
    const token = this.assertOccupiedSlot(slotIndex);
    const cached = this.entityViews.get(slotIndex);
    if (cached?.token === token) return cached.entity;

    let entity!: SharedEntity<Definition>;
    entity = new Proxy(Object.create(null), {
      get: (_target, property) => {
        this.assertEntityToken(slotIndex, token, entity);
        if (property === "toJSON") {
          return () => {
            this.assertEntityToken(slotIndex, token, entity);
            return this.snapshotEntity(slotIndex);
          };
        }
        if (typeof property !== "string") return undefined;
        const field = this.getField(property);
        return this.readFieldByInfo(slotIndex, field);
      },
      set: (_target, property, value) => {
        this.assertEntityToken(slotIndex, token, entity);
        if (typeof property !== "string") throw new Error("shared entity field name must be a string");
        const field = this.getField(property);
        this.writeFieldByInfo(slotIndex, field, value);
        return true;
      },
      has: (_target, property) => {
        this.assertEntityToken(slotIndex, token, entity);
        return typeof property === "string" && property in this.schema.fieldMap;
      },
      ownKeys: () => {
        this.assertEntityToken(slotIndex, token, entity);
        return this.schema.fields.map((field) => field.name);
      },
      getOwnPropertyDescriptor: (_target, property) => {
        this.assertEntityToken(slotIndex, token, entity);
        if (typeof property !== "string" || !(property in this.schema.fieldMap)) return undefined;
        return { enumerable: true, configurable: true };
      },
      deleteProperty: () => {
        this.assertEntityToken(slotIndex, token, entity);
        throw new Error("shared entity fields cannot be deleted");
      }
    }) as SharedEntity<Definition>;

    sharedEntityMeta.set(entity, {
      slot: slotIndex,
      generation: token >>> 2,
      byteOffset: this.getEntityByteOffset(slotIndex),
      byteLength: this.slotByteSize
    });
    this.entityViews.set(slotIndex, { token, entity });
    return entity;
  }

  readField<Name extends keyof Definition & string>(slotIndex: number, fieldName: Name): SharedFieldValue<Definition[Name]> {
    this.assertOccupiedSlot(slotIndex);
    return this.readFieldByInfo(slotIndex, this.getField(fieldName)) as SharedFieldValue<Definition[Name]>;
  }

  writeField<Name extends keyof Definition & string>(slotIndex: number, fieldName: Name, value: SharedFieldValue<Definition[Name]>): void {
    this.assertOccupiedSlot(slotIndex);
    this.writeFieldByInfo(slotIndex, this.getField(fieldName), value);
  }

  occupiedSlots(out: number[] = []): number[] {
    out.length = 0;
    for (let slot = 0; slot < this.slotCount; slot += 1) {
      if ((Atomics.load(this.occupied, this.occupancyIndex(slot)) & SLOT_STATE_MASK) === SLOT_OCCUPIED) out.push(slot);
    }
    return out;
  }

  readFieldColumn<Name extends keyof Definition & string>(
    fieldName: Name,
    slots: readonly number[],
    target?: SharedFieldColumn
  ): SharedFieldColumn {
    const field = this.getField(fieldName);
    const output = target ?? createFieldColumn(field.type, slots.length);
    if (output.length < slots.length) throw new Error(`shared field column target too small: need ${slots.length} values, got ${output.length}`);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      this.assertOccupiedSlot(slot);
      output[index] = Number(this.readFieldByInfo(slot, field));
    }
    return output;
  }

  writeFieldColumn<Name extends keyof Definition & string>(
    fieldName: Name,
    slots: readonly number[],
    values: ArrayLike<number>
  ): void {
    if (values.length < slots.length) throw new Error(`shared field column source too small: need ${slots.length} values, got ${values.length}`);
    const field = this.getField(fieldName);
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      this.assertOccupiedSlot(slot);
      this.writeFieldByInfo(slot, field, field.type === "bool" ? values[index] !== 0 : values[index]);
    }
  }

  snapshotEntity(slotIndex: number): SharedEntity<Definition> {
    this.assertOccupiedSlot(slotIndex);
    const snapshot = Object.create(null) as SharedEntity<Definition>;
    for (const field of this.schema.fields) {
      (snapshot as Record<string, unknown>)[field.name] = this.readFieldByInfo(slotIndex, field);
    }
    return snapshot;
  }

  clearSlot(slotIndex: number): void {
    this.assertOccupiedSlot(slotIndex);
    this.clearSlotBytes(slotIndex);
  }

  private initializeHeader() {
    const [schemaHashA, schemaHashB] = schemaIdentity(this.schema);
    let state = Atomics.compareExchange(this.header, INITIALIZATION_STATE_HEADER_INDEX, 0, HEADER_INITIALIZING);
    if (state === 0) {
      Atomics.store(this.header, TICK_HEADER_INDEX, 0);
      Atomics.store(this.header, SLOT_COUNT_HEADER_INDEX, this.slotCount);
      Atomics.store(this.header, SLOT_BYTE_SIZE_HEADER_INDEX, this.slotByteSize);
      Atomics.store(this.header, SCHEMA_HASH_A_HEADER_INDEX, schemaHashA);
      Atomics.store(this.header, SCHEMA_HASH_B_HEADER_INDEX, schemaHashB);
      Atomics.store(this.header, DATA_BYTE_OFFSET_HEADER_INDEX, this.dataByteOffset);
      Atomics.store(this.header, FORMAT_VERSION_HEADER_INDEX, SHARED_MEMORY_FORMAT_VERSION);
      Atomics.store(this.header, OCCUPANCY_STRIDE_HEADER_INDEX, this.occupancyStride);
      Atomics.store(this.header, SLOT_STRIDE_BYTE_SIZE_HEADER_INDEX, this.slotStrideByteSize);
      this.occupied.fill(SLOT_FREE);
      new Uint8Array(this.buffer, this.dataByteOffset, this.slotCount * this.slotStrideByteSize).fill(0);
      Atomics.store(this.header, INITIALIZATION_STATE_HEADER_INDEX, HEADER_READY);
      Atomics.notify(this.header, INITIALIZATION_STATE_HEADER_INDEX);
      return;
    }

    if (state === HEADER_INITIALIZING) {
      for (let attempts = 0; attempts < 100 && state === HEADER_INITIALIZING; attempts += 1) {
        try {
          Atomics.wait(this.header, INITIALIZATION_STATE_HEADER_INDEX, HEADER_INITIALIZING, 10);
        } catch {
          // Atomics.wait is unavailable on browser main threads; repeated atomic loads still observe worker initialization.
        }
        state = Atomics.load(this.header, INITIALIZATION_STATE_HEADER_INDEX);
      }
    }

    if (state !== HEADER_READY) throw new Error("shared memory header initialization did not complete");
    if (
      Atomics.load(this.header, FORMAT_VERSION_HEADER_INDEX) !== SHARED_MEMORY_FORMAT_VERSION ||
      Atomics.load(this.header, SLOT_COUNT_HEADER_INDEX) !== this.slotCount ||
      Atomics.load(this.header, SLOT_BYTE_SIZE_HEADER_INDEX) !== this.slotByteSize ||
      Atomics.load(this.header, SCHEMA_HASH_A_HEADER_INDEX) !== schemaHashA ||
      Atomics.load(this.header, SCHEMA_HASH_B_HEADER_INDEX) !== schemaHashB ||
      Atomics.load(this.header, DATA_BYTE_OFFSET_HEADER_INDEX) !== this.dataByteOffset ||
      Atomics.load(this.header, OCCUPANCY_STRIDE_HEADER_INDEX) !== this.occupancyStride ||
      Atomics.load(this.header, SLOT_STRIDE_BYTE_SIZE_HEADER_INDEX) !== this.slotStrideByteSize
    ) {
      throw new Error("shared memory header does not match schema or slot count");
    }
  }

  private assertSlotIndex(slotIndex: number) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.slotCount) {
      throw new Error(`shared entity slot out of range: ${slotIndex}`);
    }
  }

  private allocateSlot() {
    for (let scan = 0; scan < this.slotCount; scan += 1) {
      const slot = (this.nextSlot + scan) % this.slotCount;
      const occupancyIndex = this.occupancyIndex(slot);
      const freeToken = Atomics.load(this.occupied, occupancyIndex);
      if ((freeToken & SLOT_STATE_MASK) !== SLOT_FREE) continue;
      const allocatingToken = (freeToken + SLOT_ALLOCATING) | 0;
      if (Atomics.compareExchange(this.occupied, occupancyIndex, freeToken, allocatingToken) !== freeToken) continue;
      this.nextSlot = (slot + 1) % this.slotCount;
      return { slot, occupiedToken: (freeToken + SLOT_OCCUPIED) | 0 };
    }
    throw new Error("shared memory pool is full");
  }

  private getField(fieldName: string): SharedSchemaField {
    const field = (this.schema.fieldMap as Readonly<Record<string, SharedSchemaField | undefined>>)[fieldName];
    if (!field) throw new Error(`unknown shared schema field: ${fieldName}`);
    return field;
  }

  private assertOccupiedSlot(slotIndex: number) {
    this.assertSlotIndex(slotIndex);
    const token = Atomics.load(this.occupied, this.occupancyIndex(slotIndex));
    if ((token & SLOT_STATE_MASK) !== SLOT_OCCUPIED) throw new Error(`shared entity slot is not occupied: ${slotIndex}`);
    return token;
  }

  private assertEntityToken(slotIndex: number, token: number, entity: SharedEntity<Definition>) {
    const cached = this.entityViews.get(slotIndex);
    if (cached?.entity !== entity || cached.token !== token || Atomics.load(this.occupied, this.occupancyIndex(slotIndex)) !== token) {
      throw new Error(`shared entity view is stale: ${slotIndex}`);
    }
  }

  private readFieldByInfo(slotIndex: number, field: SharedSchemaField) {
    this.assertSlotIndex(slotIndex);
    return readPrimitive(this.view, this.getEntityByteOffset(slotIndex) + field.offset, field.type);
  }

  private writeFieldByInfo(slotIndex: number, field: SharedSchemaField, value: unknown) {
    this.assertSlotIndex(slotIndex);
    writePrimitive(this.view, this.getEntityByteOffset(slotIndex) + field.offset, field.type, value);
  }

  private clearSlotBytes(slotIndex: number) {
    const offset = this.dataByteOffset + slotIndex * this.slotStrideByteSize;
    new Uint8Array(this.buffer, offset, this.slotByteSize).fill(0);
  }

  private occupancyIndex(slotIndex: number) {
    return slotIndex * this.occupancyStride;
  }

  private prepareByteTarget(target?: Uint8Array): Uint8Array {
    if (!target) return new Uint8Array(this.slotByteSize);
    if (target.byteLength < this.slotByteSize) {
      throw new Error(`shared entity byte target too small: need ${this.slotByteSize} bytes, got ${target.byteLength}`);
    }
    return target.byteLength === this.slotByteSize ? target : target.subarray(0, this.slotByteSize);
  }
}

export function createSharedMemoryPool<Definition extends SharedSchemaDefinition>(
  schema: SharedSchema<Definition>,
  optionsOrSlotCount: SharedMemoryPoolOptions | number
) {
  return new SharedMemoryPool(schema, optionsOrSlotCount);
}

export function sharedEntityBytes(entity: object) {
  const meta = sharedEntityMeta.get(entity);
  if (!meta) throw new Error("object is not a shared entity proxy");
  return meta;
}
