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
export class SharedStateArena {
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly byteLength: number;
  readonly shared: boolean;
  readonly #header: Int32Array;

  constructor(options: SharedStateArenaOptions) {
    const requestedLength = options.byteLength ?? options.buffer?.byteLength;
    if (requestedLength === undefined) throw new Error("state arena requires byteLength or buffer.");
    size(requestedLength, "byteLength");
    if (requestedLength < HEADER_BYTES) throw new RangeError(`state arena requires at least ${HEADER_BYTES} bytes.`);
    const canShare = typeof SharedArrayBuffer === "function";
    if (options.requireShared && !canShare && !options.buffer) throw new Error("SharedArrayBuffer is unavailable.");
    this.buffer = options.buffer ?? (options.requireShared ? new SharedArrayBuffer(requestedLength) : new ArrayBuffer(requestedLength));
    if (this.buffer.byteLength < requestedLength) throw new RangeError("provided arena buffer is smaller than byteLength.");
    this.byteLength = requestedLength;
    this.shared = canShare && this.buffer instanceof SharedArrayBuffer;
    if (options.requireShared && !this.shared) throw new Error("state arena requires a SharedArrayBuffer.");
    this.#header = new Int32Array(this.buffer, 0, HEADER_INTS);
    if (options.initialize ?? true) {
      this.#header.fill(0);
      this.#write(MAGIC_INDEX, ARENA_MAGIC);
      this.#write(VERSION_INDEX, ARENA_VERSION);
      this.#write(CAPACITY_INDEX, requestedLength);
      this.#write(CURSOR_INDEX, HEADER_BYTES);
    } else {
      if (this.#read(MAGIC_INDEX) !== ARENA_MAGIC || this.#read(VERSION_INDEX) !== ARENA_VERSION) {
        throw new Error("state arena header is invalid or incompatible.");
      }
      if (this.#read(CAPACITY_INDEX) !== requestedLength) throw new Error("state arena byteLength does not match its header.");
    }
  }

  get usedBytes(): number {
    return this.#read(CURSOR_INDEX);
  }

  get epoch(): number {
    return this.#read(EPOCH_INDEX) >>> 0;
  }

  get sealed(): boolean {
    return this.#read(SEALED_INDEX) !== 0;
  }

  allocate(byteLength: number, alignment = 4): StateArenaRegion {
    size(byteLength, "byteLength");
    if (!Number.isSafeInteger(alignment) || alignment <= 0 || (alignment & (alignment - 1)) !== 0) {
      throw new RangeError("alignment must be a positive power of two.");
    }
    if (this.sealed) throw new Error("state arena is sealed.");
    if (this.shared) {
      while (true) {
        const cursor = Atomics.load(this.#header, CURSOR_INDEX);
        const byteOffset = align(cursor, alignment);
        const next = byteOffset + byteLength;
        if (!Number.isSafeInteger(next) || next > this.byteLength) throw new RangeError("state arena capacity exceeded.");
        if (Atomics.compareExchange(this.#header, CURSOR_INDEX, cursor, next) === cursor) return { byteOffset, byteLength };
      }
    }
    const byteOffset = align(this.#header[CURSOR_INDEX], alignment);
    const next = byteOffset + byteLength;
    if (!Number.isSafeInteger(next) || next > this.byteLength) throw new RangeError("state arena capacity exceeded.");
    this.#header[CURSOR_INDEX] = next;
    return { byteOffset, byteLength };
  }

  bytes(region: StateArenaRegion): Uint8Array {
    this.#assertRegion(region, 1);
    return new Uint8Array(this.buffer, region.byteOffset, region.byteLength);
  }

  float32(region: StateArenaRegion): Float32Array {
    this.#assertRegion(region, Float32Array.BYTES_PER_ELEMENT);
    return new Float32Array(this.buffer, region.byteOffset, region.byteLength / Float32Array.BYTES_PER_ELEMENT);
  }

  int32(region: StateArenaRegion): Int32Array {
    this.#assertRegion(region, Int32Array.BYTES_PER_ELEMENT);
    return new Int32Array(this.buffer, region.byteOffset, region.byteLength / Int32Array.BYTES_PER_ELEMENT);
  }

  publish(): number {
    if (this.shared) return (Atomics.add(this.#header, EPOCH_INDEX, 1) + 1) >>> 0;
    this.#header[EPOCH_INDEX] = (this.#header[EPOCH_INDEX] + 1) | 0;
    return this.#header[EPOCH_INDEX] >>> 0;
  }

  seal(): void {
    this.#write(SEALED_INDEX, 1);
  }

  #assertRegion(region: StateArenaRegion, elementBytes: number): void {
    size(region.byteOffset, "region.byteOffset");
    size(region.byteLength, "region.byteLength");
    if (region.byteOffset < HEADER_BYTES || region.byteOffset + region.byteLength > this.byteLength) {
      throw new RangeError("region is outside the state arena payload.");
    }
    if (region.byteOffset % elementBytes !== 0 || region.byteLength % elementBytes !== 0) {
      throw new RangeError(`region must be aligned to ${elementBytes} bytes.`);
    }
  }

  #read(index: number): number {
    return this.shared ? Atomics.load(this.#header, index) : this.#header[index];
  }

  #write(index: number, value: number): void {
    if (this.shared) Atomics.store(this.#header, index, value);
    else this.#header[index] = value;
  }
}

export function createSharedStateArena(options: SharedStateArenaOptions): SharedStateArena {
  return new SharedStateArena(options);
}
