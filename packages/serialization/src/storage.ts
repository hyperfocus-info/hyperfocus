import { encodeValue, normalizeValue, resolveLimits, type Limits } from "./value";

/** Dynamic records retain JSON until the owner measures a reason to select protobuf. */
export function encodeStorageValue(value: unknown, options: Limits & { encoding?: "json" | "protobuf" } = {}): string | Uint8Array {
  if (options.encoding === "protobuf") return encodeValue(value, options);
  if (options.maxBytes !== undefined || options.maxNodes !== undefined || options.maxDepth !== undefined) {
    const limits = resolveLimits(options);
    const encoded = JSON.stringify(normalizeValue(value, limits));
    if (new TextEncoder().encode(encoded).byteLength > limits.maxBytes) throw new RangeError("Serialization byte limit exceeded");
    return encoded;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("Storage value is not serializable");
  return encoded;
}
