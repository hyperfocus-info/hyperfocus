export type MutableNumericArray = {
  readonly length: number;
  [index: number]: number;
};

export type WasmMemoryLease = {
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly capacityBytes: number;
  readonly epoch: number;
  writeFloat32(relativeByteOffset: number, source: ArrayLike<number>, count: number): void;
  readFloat32(relativeByteOffset: number, target: MutableNumericArray, count: number): void;
  readUint8(relativeByteOffset: number, target: MutableNumericArray, count: number): void;
  /** Ends this lease; repeated or stale release cannot end a later lease. */
  release(): void;
};

export type WasmMemoryArena = WasmMemoryLease & {
  readonly leased: boolean;
  /** Reuses backing storage, but returns a distinct checked lifetime. */
  lease(byteLength: number): WasmMemoryLease;
};

export type WasmMemoryArenaOptions = {
  memory: WebAssembly.Memory;
  allocate: (byteLength: number) => number;
  initialCapacityBytes?: number;
  fixedCapacityBytes?: number;
  maximumCapacityBytes?: number;
  growthFactor?: number;
  label?: string;
};

export function createWasmMemoryArena(options: WasmMemoryArenaOptions): WasmMemoryArena {
  const label = options.label ?? "WASM arena";
  const fixedCapacityBytes = options.fixedCapacityBytes;
  if (fixedCapacityBytes !== undefined) validateByteLength(fixedCapacityBytes, "fixedCapacityBytes");
  const initialCapacityBytes = options.initialCapacityBytes ?? fixedCapacityBytes ?? 0;
  validateByteLength(initialCapacityBytes, "initialCapacityBytes");
  const maximumCapacityBytes = options.maximumCapacityBytes ?? Number.MAX_SAFE_INTEGER;
  validateByteLength(maximumCapacityBytes, "maximumCapacityBytes");
  if (fixedCapacityBytes !== undefined && fixedCapacityBytes > maximumCapacityBytes) {
    throw new RangeError("fixedCapacityBytes cannot exceed maximumCapacityBytes");
  }
  if (initialCapacityBytes > maximumCapacityBytes) {
    throw new RangeError("initialCapacityBytes cannot exceed maximumCapacityBytes");
  }
  if (fixedCapacityBytes !== undefined && initialCapacityBytes > fixedCapacityBytes) {
    throw new RangeError("initialCapacityBytes cannot exceed fixedCapacityBytes");
  }
  const growthFactor = options.growthFactor ?? 2;
  if (!Number.isFinite(growthFactor) || growthFactor < 1) {
    throw new RangeError("growthFactor must be a finite number greater than or equal to one");
  }

  let byteOffset = 0;
  let leasedByteLength = 0;
  let capacityBytes = 0;
  let epoch = 0;
  let leased = false;
  let currentLease: WasmMemoryLease | undefined;
  let buffer: ArrayBuffer | undefined;
  let float32 = new Float32Array(0);
  let uint8 = new Uint8Array(0);

  function refreshViews() {
    if (buffer === options.memory.buffer) return;
    buffer = options.memory.buffer;
    float32 = new Float32Array(buffer);
    uint8 = new Uint8Array(buffer);
    epoch += 1;
  }

  function allocate(capacity: number) {
    if (capacity === 0) return;
    const allocated = options.allocate(capacity);
    if (!Number.isSafeInteger(allocated) || allocated <= 0 || allocated % Float32Array.BYTES_PER_ELEMENT !== 0) {
      throw new RangeError("WASM allocator returned an invalid arena pointer");
    }
    refreshViews();
    if (!Number.isSafeInteger(allocated + capacity) || allocated + capacity > options.memory.buffer.byteLength) {
      throw new RangeError("WASM allocator returned arena memory outside linear memory");
    }
    byteOffset = allocated;
    capacityBytes = capacity;
  }

  function ensureCapacity(requiredBytes: number) {
    if (requiredBytes <= capacityBytes) {
      refreshViews();
      return;
    }
    if (requiredBytes > maximumCapacityBytes) {
      throw new RangeError(
        `${label} maximum capacity ${maximumCapacityBytes} bytes exceeded by ${requiredBytes}-byte lease`
      );
    }
    if (fixedCapacityBytes !== undefined) {
      throw new RangeError(`${label} capacity ${capacityBytes} bytes exceeded by ${requiredBytes}-byte lease`);
    }
    const grown = capacityBytes === 0
      ? Math.max(1024, requiredBytes)
      : Math.max(requiredBytes, Math.ceil(capacityBytes * growthFactor));
    allocate(Math.min(maximumCapacityBytes, align(grown, Float32Array.BYTES_PER_ELEMENT)));
  }

  allocate(initialCapacityBytes);
  refreshViews();

  const assertCurrent = (lease?: WasmMemoryLease) => {
    if (!leased || (lease !== undefined && currentLease !== lease)) throw new Error("WASM lease released");
  };
  const assertActiveRange = (relativeByteOffset: number, count: number, elementBytes: number) => {
    assertCurrent();
    validateByteLength(relativeByteOffset, "relativeByteOffset");
    validateByteLength(count, "count");
    const bytes = count * elementBytes;
    if (!Number.isSafeInteger(bytes) || relativeByteOffset % elementBytes !== 0
      || relativeByteOffset + bytes > leasedByteLength) {
      throw new RangeError("WASM memory lease access is outside the leased range");
    }
    // Another arena or a module call can grow the same memory during this lease.
    refreshViews();
  };

  const arena: WasmMemoryArena = {
    get byteOffset() {
      return byteOffset;
    },
    get byteLength() {
      return leasedByteLength;
    },
    get capacityBytes() {
      return capacityBytes;
    },
    get epoch() {
      refreshViews();
      return epoch;
    },
    get leased() {
      return leased;
    },
    lease(byteLength) {
      validateByteLength(byteLength, "byteLength");
      if (leased) throw new Error("WASM arena already has an active lease");
      ensureCapacity(byteLength);
      leased = true;
      leasedByteLength = byteLength;
      const lease: WasmMemoryLease = {
        byteOffset,
        byteLength,
        capacityBytes,
        get epoch() { assertCurrent(lease); return arena.epoch; },
        writeFloat32(offset, source, count) { assertCurrent(lease); arena.writeFloat32(offset, source, count); },
        readFloat32(offset, target, count) { assertCurrent(lease); arena.readFloat32(offset, target, count); },
        readUint8(offset, target, count) { assertCurrent(lease); arena.readUint8(offset, target, count); },
        release() { if (currentLease === lease) arena.release(); }
      };
      currentLease = lease;
      return lease;
    },
    writeFloat32(relativeByteOffset, source, count) {
      assertActiveRange(relativeByteOffset, count, Float32Array.BYTES_PER_ELEMENT);
      if (source.length < count) throw new RangeError("WASM lease source too short");
      const targetOffset = (byteOffset + relativeByteOffset) >> 2;
      if (source instanceof Float32Array) {
        float32.set(source.subarray(0, count), targetOffset);
        return;
      }
      for (let index = 0; index < count; index += 1) float32[targetOffset + index] = source[index];
    },
    readFloat32(relativeByteOffset, target, count) {
      assertActiveRange(relativeByteOffset, count, Float32Array.BYTES_PER_ELEMENT);
      if (target.length < count) throw new RangeError("WASM lease target too short");
      const sourceOffset = (byteOffset + relativeByteOffset) >> 2;
      if (target instanceof Float32Array) {
        target.set(float32.subarray(sourceOffset, sourceOffset + count));
        return;
      }
      for (let index = 0; index < count; index += 1) target[index] = float32[sourceOffset + index];
    },
    readUint8(relativeByteOffset, target, count) {
      assertActiveRange(relativeByteOffset, count, Uint8Array.BYTES_PER_ELEMENT);
      if (target.length < count) throw new RangeError("WASM lease target too short");
      const sourceOffset = byteOffset + relativeByteOffset;
      if (target instanceof Uint8Array) {
        target.set(uint8.subarray(sourceOffset, sourceOffset + count));
        return;
      }
      for (let index = 0; index < count; index += 1) target[index] = uint8[sourceOffset + index];
    },
    release() {
      leased = false;
      currentLease = undefined;
    }
  };
  return arena;
}

function validateByteLength(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

function align(value: number, alignment: number) {
  return Math.ceil(value / alignment) * alignment;
}
