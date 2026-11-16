import { readStoredBytes, readStoredValue, type Limits } from "./value";

/** Reads a bounded protobuf frame or a legacy UTF-8 JSON frame. Blobs must be bounded before awaiting their bytes. */
export function readValueFrame(data: unknown, limits: Limits = {}) {
  if (typeof data === "string") return readStoredValue(data, limits);
  if (data instanceof ArrayBuffer) return readStoredBytes(new Uint8Array(data), limits);
  if (ArrayBuffer.isView(data)) return readStoredBytes(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), limits);
  throw new TypeError("Expected a protobuf binary frame or legacy JSON text");
}
