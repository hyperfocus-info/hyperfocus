/** Exact checkpoint identity: includes negative zero, undefined and typed-array bytes. */
export function exactHash(value: unknown) {
  const hasher = new Bun.CryptoHasher('sha256');
  function write(value: unknown): void {
    if (ArrayBuffer.isView(value)) {
      hasher.update(`view:${value.constructor.name}:${value.byteLength}:`);
      hasher.update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));return;
    }
    if (value instanceof ArrayBuffer) { hasher.update(`buffer:${value.byteLength}:`);hasher.update(new Uint8Array(value));return; }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      hasher.update(`${Array.isArray(value) ? `array:${value.length}` : 'object'}:${entries.length}:`);
      for (const [key, child] of entries) { hasher.update(JSON.stringify(key));write(child); }return;
    }
    hasher.update(`${typeof value}:${Object.is(value, -0) ? '-0' : JSON.stringify(value) ?? 'undefined'};`);
  }
  write(value);return hasher.digest('hex');
}
