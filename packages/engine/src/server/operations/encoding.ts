
export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function decodeUtf8(value: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(value); }
  catch { throw new Error("Encoded data is not valid UTF-8."); }
}

export function copyBytes(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError("Backup source must be a UTF-8 string or Uint8Array.");
  return new Uint8Array(value);
}

export function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
