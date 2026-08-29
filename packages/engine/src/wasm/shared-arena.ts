const ARENA_MAGIC = 0x48534131;
const ARENA_VERSION = 1;
const HEADER_INTS = 16;
const HEADER_BYTES = HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const MAGIC_INDEX = 0;
const VERSION_INDEX = 1;
const CAPACITY_INDEX = 2;
const CURSOR_INDEX = 3;
const EPOCH_INDEX = 4;
const SEALED_INDEX = 5;

export interface SharedStateArenaOptions {
  byteLength?: number;
  buffer?: ArrayBuffer | SharedArrayBuffer;
  /** Set false when attaching to an arena initialized by another thread. */
  initialize?: boolean;
  /** Require shared memory instead of allowing an ArrayBuffer fallback. */
  requireShared?: boolean;
}

export interface StateArenaRegion {
  readonly byteOffset: number;
  readonly byteLength: number;
}

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function size(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`);
  return value;
}

/**
 * Startup-only bump arena whose views can be handed directly to TypeScript,
 * workers, or a WebAssembly.Memory buffer without serialization.
 */
export type SharedStateArena = {
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly byteLength: number;
  readonly shared: boolean;
  readonly usedBytes: number;
  readonly epoch: number;
  readonly sealed: boolean;
  allocate(byteLength: number, alignment?: number): StateArenaRegion;
  bytes(region: StateArenaRegion): Uint8Array;
  float32(region: StateArenaRegion): Float32Array;
  int32(region: StateArenaRegion): Int32Array;
  publish(): number;
  seal(): void;
};

type SharedStateArenaFactory = {
  (options: SharedStateArenaOptions): SharedStateArena;
  new(options: SharedStateArenaOptions): SharedStateArena;
  readonly prototype: object;
};

const sharedStateArenaPrototype = {};

export function createSharedStateArena(options: SharedStateArenaOptions): SharedStateArena {
  const requestedLength = options.byteLength ?? options.buffer?.byteLength;
  if (requestedLength === undefined) throw new Error("state arena requires byteLength or buffer.");
  size(requestedLength, "byteLength");
  if (requestedLength < HEADER_BYTES) throw new RangeError(`state arena requires at least ${HEADER_BYTES} bytes.`);
  const canShare = typeof SharedArrayBuffer === "function";
  if (options.requireShared && !canShare && !options.buffer) throw new Error("SharedArrayBuffer is unavailable.");
  const buffer = options.buffer ?? (options.requireShared ? new SharedArrayBuffer(requestedLength) : new ArrayBuffer(requestedLength));
  if (buffer.byteLength < requestedLength) throw new RangeError("provided arena buffer is smaller than byteLength.");
  const shared = canShare && buffer instanceof SharedArrayBuffer;
  if (options.requireShared && !shared) throw new Error("state arena requires a SharedArrayBuffer.");
  const header = new Int32Array(buffer, 0, HEADER_INTS);
  const read = (index: number): number => shared ? Atomics.load(header, index) : header[index];
  const write = (index: number, value: number): void => {
    if (shared) Atomics.store(header, index, value);
    else header[index] = value;
  };
  const assertRegion = (region: StateArenaRegion, elementBytes: number): void => {
    size(region.byteOffset, "region.byteOffset");
    size(region.byteLength, "region.byteLength");
    if (region.byteOffset < HEADER_BYTES || region.byteOffset + region.byteLength > requestedLength) {
      throw new RangeError("region is outside the state arena payload.");
    }
    if (region.byteOffset % elementBytes !== 0 || region.byteLength % elementBytes !== 0) {
      throw new RangeError(`region must be aligned to ${elementBytes} bytes.`);
    }
  };

  if (options.initialize ?? true) {
    header.fill(0);
    write(MAGIC_INDEX, ARENA_MAGIC);
    write(VERSION_INDEX, ARENA_VERSION);
    write(CAPACITY_INDEX, requestedLength);
    write(CURSOR_INDEX, HEADER_BYTES);
  } else {
    if (read(MAGIC_INDEX) !== ARENA_MAGIC || read(VERSION_INDEX) !== ARENA_VERSION) {
      throw new Error("state arena header is invalid or incompatible.");
    }
    if (read(CAPACITY_INDEX) !== requestedLength) throw new Error("state arena byteLength does not match its header.");
  }

  const arena: SharedStateArena = {
    buffer,
    byteLength: requestedLength,
    shared,
    get usedBytes() { return read(CURSOR_INDEX); },
    get epoch() { return read(EPOCH_INDEX) >>> 0; },
    get sealed() { return read(SEALED_INDEX) !== 0; },
    allocate(byteLength, alignment = 4) {
      size(byteLength, "byteLength");
      if (!Number.isSafeInteger(alignment) || alignment <= 0 || (alignment & (alignment - 1)) !== 0) {
        throw new RangeError("alignment must be a positive power of two.");
      }
      if (read(SEALED_INDEX) !== 0) throw new Error("state arena is sealed.");
      if (shared) {
        while (true) {
          const cursor = Atomics.load(header, CURSOR_INDEX);
          const byteOffset = align(cursor, alignment);
          const next = byteOffset + byteLength;
          if (!Number.isSafeInteger(next) || next > requestedLength) throw new RangeError("state arena capacity exceeded.");
          if (Atomics.compareExchange(header, CURSOR_INDEX, cursor, next) === cursor) return { byteOffset, byteLength };
        }
      }
      const byteOffset = align(header[CURSOR_INDEX], alignment);
      const next = byteOffset + byteLength;
      if (!Number.isSafeInteger(next) || next > requestedLength) throw new RangeError("state arena capacity exceeded.");
      header[CURSOR_INDEX] = next;
      return { byteOffset, byteLength };
    },
    bytes(region) {
      assertRegion(region, 1);
      return new Uint8Array(buffer, region.byteOffset, region.byteLength);
    },
    float32(region) {
      assertRegion(region, Float32Array.BYTES_PER_ELEMENT);
      return new Float32Array(buffer, region.byteOffset, region.byteLength / Float32Array.BYTES_PER_ELEMENT);
    },
    int32(region) {
      assertRegion(region, Int32Array.BYTES_PER_ELEMENT);
      return new Int32Array(buffer, region.byteOffset, region.byteLength / Int32Array.BYTES_PER_ELEMENT);
    },
    publish() {
      if (shared) return (Atomics.add(header, EPOCH_INDEX, 1) + 1) >>> 0;
      header[EPOCH_INDEX] = (header[EPOCH_INDEX] + 1) | 0;
      return header[EPOCH_INDEX] >>> 0;
    },
    seal() { write(SEALED_INDEX, 1); }
  };
  Object.setPrototypeOf(arena, sharedStateArenaPrototype);
  return arena;
}

function sharedStateArenaFactory(options: SharedStateArenaOptions): SharedStateArena {
  return createSharedStateArena(options);
}

function isSharedStateArenaFactory(value: unknown): value is SharedStateArenaFactory {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function requireSharedStateArenaFactory(value: unknown): SharedStateArenaFactory {
  if (!isSharedStateArenaFactory(value)) throw new Error("Shared state arena factory must be constructable");
  return value;
}

Object.defineProperty(sharedStateArenaFactory, "prototype", { value: sharedStateArenaPrototype });
export const SharedStateArena = requireSharedStateArenaFactory(sharedStateArenaFactory);
