export type BitWriter = {
  readonly bitOffset: number;
  readonly byteLength: number;
  writeBits(value: number, bitCount: number): void;
  writeSigned(value: number, bitCount: number): void;
  writeBool(value: boolean): void;
  alignToByte(): void;
  toUint8Array(): Uint8Array;
};

export type BitReader = {
  readonly bitOffset: number;
  readonly remainingBits: number;
  readBits(bitCount: number): number;
  readSigned(bitCount: number): number;
  readBool(): boolean;
  alignToByte(): void;
};

function assertBitCount(bitCount: number, allowZero = true) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(bitCount) || bitCount < minimum || bitCount > 32) {
    throw new RangeError(`bit count must be an integer from ${minimum} to 32`);
  }
}

function maximumUnsigned(bitCount: number) {
  return bitCount === 32 ? 0xffff_ffff : 2 ** bitCount - 1;
}

export function createBitWriter(initialBytes = 32): BitWriter {
  if (!Number.isFinite(initialBytes)) throw new RangeError("bit writer initial size must be finite");
  const capacity = Math.max(1, Math.floor(initialBytes));
  if (!Number.isSafeInteger(capacity)) throw new RangeError("bit writer initial size must be a safe integer");
  let bytes = new Uint8Array(capacity);
  let bitOffset = 0;

  function ensureBits(bitCount: number) {
    const requiredBytes = Math.ceil((bitOffset + bitCount) / 8);
    if (requiredBytes <= bytes.byteLength) return;
    let nextLength = bytes.byteLength;
    while (nextLength < requiredBytes) nextLength *= 2;
    const next = new Uint8Array(nextLength);
    next.set(bytes);
    bytes = next;
  }

  function writeBits(value: number, bitCount: number) {
    assertBitCount(bitCount);
    if (!Number.isSafeInteger(value) || value < 0 || value > maximumUnsigned(bitCount)) {
      throw new RangeError(`value ${String(value)} does not fit in ${bitCount} unsigned bits`);
    }
    ensureBits(bitCount);
    let remaining = bitCount;
    let source = value;
    while (remaining > 0) {
      const byteIndex = bitOffset >>> 3;
      const usedBits = bitOffset & 7;
      const writable = Math.min(8 - usedBits, remaining);
      const mask = 2 ** writable - 1;
      bytes[byteIndex] |= (source & mask) << usedBits;
      source = Math.floor(source / 2 ** writable);
      bitOffset += writable;
      remaining -= writable;
    }
  }

  return {
    get bitOffset() {
      return bitOffset;
    },
    get byteLength() {
      return Math.ceil(bitOffset / 8);
    },
    writeBits,
    writeSigned(value, bitCount) {
      assertBitCount(bitCount, false);
      const minimum = -(2 ** (bitCount - 1));
      const maximum = 2 ** (bitCount - 1) - 1;
      if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new RangeError(`value ${String(value)} does not fit in ${bitCount} signed bits`);
      }
      writeBits(value < 0 ? value + 2 ** bitCount : value, bitCount);
    },
    writeBool(value) {
      if (typeof value !== "boolean") throw new TypeError("bit boolean value must be a boolean");
      writeBits(value ? 1 : 0, 1);
    },
    alignToByte() {
      bitOffset = Math.ceil(bitOffset / 8) * 8;
    },
    toUint8Array() {
      return bytes.slice(0, Math.ceil(bitOffset / 8));
    }
  };
}

export function createBitReader(bytes: Uint8Array): BitReader {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("bit reader input must be a Uint8Array");
  let bitOffset = 0;

  function readBits(bitCount: number) {
    assertBitCount(bitCount);
    if (bitCount > bytes.byteLength * 8 - bitOffset) throw new Error("bit reader exceeded buffer length");
    let value = 0;
    let destinationOffset = 0;
    let remaining = bitCount;
    while (remaining > 0) {
      const byteIndex = bitOffset >>> 3;
      const usedBits = bitOffset & 7;
      const readable = Math.min(8 - usedBits, remaining);
      const mask = 2 ** readable - 1;
      const chunk = (bytes[byteIndex] >>> usedBits) & mask;
      value += chunk * 2 ** destinationOffset;
      bitOffset += readable;
      destinationOffset += readable;
      remaining -= readable;
    }
    return value >>> 0;
  }

  return {
    get bitOffset() {
      return bitOffset;
    },
    get remainingBits() {
      return bytes.byteLength * 8 - bitOffset;
    },
    readBits,
    readSigned(bitCount) {
      assertBitCount(bitCount, false);
      const value = readBits(bitCount);
      const sign = 2 ** (bitCount - 1);
      return value >= sign ? value - 2 ** bitCount : value;
    },
    readBool() {
      return readBits(1) === 1;
    },
    alignToByte() {
      bitOffset = Math.ceil(bitOffset / 8) * 8;
      if (bitOffset > bytes.byteLength * 8) throw new Error("bit reader exceeded buffer length");
    }
  };
}
