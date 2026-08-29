export type BinaryWriter = {
  readonly offset: number;
  writeU8(value: number): void;
  writeU16(value: number): void;
  writeU32(value: number): void;
  writeI16(value: number): void;
  writeI32(value: number): void;
  writeF32(value: number): void;
  writeF64(value: number): void;
  writeBytes(bytes: Uint8Array): void;
  writeStringU8(value: string): void;
  writeStringU16(value: string): void;
  toUint8Array(): Uint8Array;
};

export type BinaryReader = {
  readonly offset: number;
  readonly remaining: number;
  readU8(): number;
  readU16(): number;
  readU32(): number;
  readI16(): number;
  readI32(): number;
  readF32(): number;
  readF64(): number;
  readBytes(length: number): Uint8Array;
  readBytesView(length: number): Uint8Array;
  readStringU8(): string;
  readStringU16(): string;
};

export type ReusableBinaryReader = BinaryReader & {
  /** Repositions this reader over a byte range without creating a payload view. */
  reset(bytes: Uint8Array, byteOffset?: number, byteLength?: number): void;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function assertLength(label: string, length: number, max: number) {
  if (!Number.isInteger(length) || length < 0 || length > max) throw new RangeError(`${label} length exceeds ${max} bytes`);
}

export function createBinaryWriter(initialSize = 256): BinaryWriter {
  if (!Number.isFinite(initialSize)) throw new RangeError("binary writer initial size must be finite");
  const normalizedInitialSize = Math.max(1, Math.floor(initialSize));
  if (!Number.isSafeInteger(normalizedInitialSize)) throw new RangeError("binary writer initial size must be a safe integer");
  let bytes = new Uint8Array(normalizedInitialSize);
  let view = new DataView(bytes.buffer);
  let offset = 0;

  function ensure(length: number) {
    if (offset + length <= bytes.byteLength) return;
    let nextLength = bytes.byteLength;
    while (offset + length > nextLength) nextLength *= 2;
    const next = new Uint8Array(nextLength);
    next.set(bytes);
    bytes = next;
    view = new DataView(bytes.buffer);
  }

  function writeString(value: string, maxLength: number, writeLength: (length: number) => void) {
    const encoded = textEncoder.encode(value);
    assertLength("binary string", encoded.byteLength, maxLength);
    writeLength(encoded.byteLength);
    ensure(encoded.byteLength);
    bytes.set(encoded, offset);
    offset += encoded.byteLength;
  }

  return {
    get offset() {
      return offset;
    },
    writeU8(value) {
      ensure(1);
      bytes[offset] = value & 0xff;
      offset += 1;
    },
    writeU16(value) {
      ensure(2);
      view.setUint16(offset, value, true);
      offset += 2;
    },
    writeU32(value) {
      ensure(4);
      view.setUint32(offset, value >>> 0, true);
      offset += 4;
    },
    writeI16(value) {
      ensure(2);
      view.setInt16(offset, value, true);
      offset += 2;
    },
    writeI32(value) {
      ensure(4);
      view.setInt32(offset, value, true);
      offset += 4;
    },
    writeF32(value) {
      ensure(4);
      view.setFloat32(offset, value, true);
      offset += 4;
    },
    writeF64(value) {
      ensure(8);
      view.setFloat64(offset, value, true);
      offset += 8;
    },
    writeBytes(payload) {
      ensure(payload.byteLength);
      bytes.set(payload, offset);
      offset += payload.byteLength;
    },
    writeStringU8(value) {
      writeString(value, 0xff, (length) => this.writeU8(length));
    },
    writeStringU16(value) {
      writeString(value, 0xffff, (length) => this.writeU16(length));
    },
    toUint8Array() {
      return bytes.slice(0, offset);
    }
  };
}

export function createBinaryReader(bytes: Uint8Array): BinaryReader {
  const reader = createReusableBinaryReader();
  reader.reset(bytes);
  return reader;
}

export function createReusableBinaryReader(): ReusableBinaryReader {
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let rangeStart = 0;
  let rangeLength = 0;
  let viewBuffer: ArrayBufferLike | undefined;
  let view: DataView<ArrayBufferLike> = new DataView(new ArrayBuffer(0));
  let offset = 0;

  function ensure(length: number) {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new RangeError(`binary reader length must be a non-negative safe integer: ${String(length)}`);
    }
    if (length > rangeLength - offset) throw new Error("binary reader exceeded buffer length");
  }

  function readString(length: number) {
    ensure(length);
    const value = textDecoder.decode(bytes.subarray(rangeStart + offset, rangeStart + offset + length));
    offset += length;
    return value;
  }

  const reader: ReusableBinaryReader = {
    get offset() {
      return offset;
    },
    get remaining() {
      return rangeLength - offset;
    },
    reset(nextBytes, byteOffset = 0, byteLength = nextBytes.byteLength - byteOffset) {
      if (!Number.isSafeInteger(byteOffset) || byteOffset < 0
        || !Number.isSafeInteger(byteLength) || byteLength < 0
        || byteOffset + byteLength > nextBytes.byteLength) {
        throw new RangeError("binary reader range is outside the supplied bytes");
      }
      bytes = nextBytes;
      rangeStart = byteOffset;
      rangeLength = byteLength;
      offset = 0;
      if (viewBuffer !== bytes.buffer) {
        viewBuffer = bytes.buffer;
        view = new DataView(bytes.buffer);
      }
    },
    readU8() {
      ensure(1);
      const value = view.getUint8(bytes.byteOffset + rangeStart + offset);
      offset += 1;
      return value;
    },
    readU16() {
      ensure(2);
      const value = view.getUint16(bytes.byteOffset + rangeStart + offset, true);
      offset += 2;
      return value;
    },
    readU32() {
      ensure(4);
      const value = view.getUint32(bytes.byteOffset + rangeStart + offset, true);
      offset += 4;
      return value;
    },
    readI16() {
      ensure(2);
      const value = view.getInt16(bytes.byteOffset + rangeStart + offset, true);
      offset += 2;
      return value;
    },
    readI32() {
      ensure(4);
      const value = view.getInt32(bytes.byteOffset + rangeStart + offset, true);
      offset += 4;
      return value;
    },
    readF32() {
      ensure(4);
      const value = view.getFloat32(bytes.byteOffset + rangeStart + offset, true);
      offset += 4;
      return value;
    },
    readF64() {
      ensure(8);
      const value = view.getFloat64(bytes.byteOffset + rangeStart + offset, true);
      offset += 8;
      return value;
    },
    readBytes(length) {
      ensure(length);
      const value = bytes.slice(rangeStart + offset, rangeStart + offset + length);
      offset += length;
      return value;
    },
    readBytesView(length) {
      ensure(length);
      const value = bytes.subarray(rangeStart + offset, rangeStart + offset + length);
      offset += length;
      return value;
    },
    readStringU8() {
      return readString(this.readU8());
    },
    readStringU16() {
      return readString(this.readU16());
    }
  };
  return reader;
}
