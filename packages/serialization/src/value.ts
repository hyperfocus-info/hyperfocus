import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { ValueSchema } from "./generated/value_pb";
import { fromMessage, toMessage } from "./message";

export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
export type Codec<T> = { encode(value: T): Uint8Array; decode(bytes: Uint8Array): T };
export type Limits = { maxBytes?: number; maxDepth?: number; maxNodes?: number };
const magic = new Uint8Array([72, 70, 80, 66, 1]); // HFPB, envelope version 1; google.protobuf.Value payload.

export function resolveLimits(options: Limits = {}) {
  const limits = { maxBytes: options.maxBytes ?? 16777216, maxDepth: options.maxDepth ?? 64, maxNodes: options.maxNodes ?? 1000000 };
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("Serialization limits must be positive safe integers");
  return limits;
}

/** Normalize JSON-shaped domain values without serializing through JSON text. */
export function normalizeValue(value: unknown, options: Limits = {}): Value {
  const limits = resolveLimits(options), ancestors = new Set<object>();
  let nodes = 0, stringBytes = 0;
  const encoder = new TextEncoder();
  function string(value: string) {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new TypeError("Protobuf strings must be valid Unicode");
    if (value.length > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
    stringBytes += encoder.encode(value).byteLength;
    if (stringBytes > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
    return value;
  }
  function visit(value: unknown, depth: number): Value {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) throw new RangeError("Serialization structure limit exceeded");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") return string(value);
    if (typeof value === "number" && Number.isFinite(value)) return value === 0 ? 0 : value;
    if (typeof value !== "object" || !value || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new TypeError("Values must be finite JSON data");
    }
    if (ancestors.has(value)) throw new TypeError("Cyclic serialization value");
    ancestors.add(value);
    const result = Array.isArray(value)
      ? Array.from(value, item => visit(item === undefined ? null : item, depth + 1))
      : Object.fromEntries(Object.keys(value).sort().flatMap(key => {
        const item: unknown = Reflect.get(value, key);
        return item === undefined ? [] : [[string(key), visit(item, depth + 1)]];
      }));
    ancestors.delete(value);
    return result;
  }
  return visit(value, 0);
}

export function encodeValue(value: unknown, options: Limits = {}) {
  const limits = resolveLimits(options);
  const payload = toBinary(ValueSchema, toMessage(normalizeValue(value, limits)));
  if (payload.byteLength + magic.length > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
  const bytes = new Uint8Array(magic.length + payload.length);
  bytes.set(magic); bytes.set(payload, magic.length);
  return bytes;
}

export function decodeValue(bytes: Uint8Array, options: Limits = {}): Value {
  const limits = resolveLimits(options);
  if (bytes.byteLength > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
  if (!magic.every((byte, index) => bytes[index] === byte)) throw new Error("Unsupported protobuf value envelope");
  const message = fromBinary(ValueSchema, bytes.subarray(magic.length), { recursionLimit: limits.maxDepth * 3 + 3 });
  return normalizeValue(fromMessage(message), limits);
}

/** Compatibility reader: binary is authoritative; malformed binary never falls back to JSON. */
export function readStoredValue(input: Uint8Array | string, options: Limits = {}): Value {
  if (typeof input !== "string") return decodeValue(input, options);
  const limits = resolveLimits(options);
  if (input.length > limits.maxBytes || new TextEncoder().encode(input).byteLength > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
  return normalizeValue(JSON.parse(input), limits);
}

/** File migration reader; current binary takes precedence over legacy UTF-8 JSON. */
export function readStoredBytes(bytes: Uint8Array, options: Limits = {}) {
  if (bytes.byteLength > resolveLimits(options).maxBytes) throw new RangeError("Serialization byte limit exceeded");
  if (bytes[0] === magic[0]) return decodeValue(bytes, options);
  return readStoredValue(new TextDecoder("utf-8", { fatal: true }).decode(bytes), options);
}

/** Keep domain validation at the boundary while replacing the storage representation. */
export function createValueCodec<T>(options: { parse: (value: unknown) => T } & Limits): Codec<T> {
  return {
    encode: value => encodeValue(options.parse(value), options),
    decode: bytes => options.parse(decodeValue(bytes, options)),
  };
}
