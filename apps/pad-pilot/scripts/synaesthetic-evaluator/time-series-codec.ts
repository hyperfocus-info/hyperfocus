export function encodeTimeSeries(values: readonly number[]) {
  const bytes = new Uint8Array(values.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (const [index, value] of values.entries()) {
    if (!Number.isFinite(value)) {
      throw new Error(`Time-series value at index ${index} must be finite.`);
    }
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
  }
  return bytes;
}

export function decodeTimeSeries(bytes: Uint8Array) {
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Time-series blob length must be divisible by four bytes.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from(
    { length: bytes.byteLength / Float32Array.BYTES_PER_ELEMENT },
    (_, index) => view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true),
  );
}
