/** Conservative JSON UTF-8 bound without constructing a serialized checkpoint. */
export function retainedCheckpointBytes(value: unknown, limit = 16777216): number {
  const ancestors: object[] = [];
  function count(value: unknown, remaining: number): number {
    if (remaining < 0) return Infinity;
    if (typeof value === 'number') return 24;
    if (typeof value === 'string') return value.length > remaining ? Infinity : stringBytes(value);
    if (value === null || typeof value === 'boolean' || value === undefined) return 5;
    if (typeof value !== 'object' || 'toJSON' in value || ancestors.length >= 128 || ancestors.includes(value)) return Infinity;
    ancestors.push(value);
    let bytes = 2;
    if (Array.isArray(value)) {
      for (const child of value) { bytes += count(child, remaining - bytes) + 1;if (bytes > remaining) break; }
    } else {
      for (const key of Object.keys(value)) { bytes += stringBytes(key) + 2 + count(Reflect.get(value, key), remaining - bytes);if (bytes > remaining) break; }
    }
    ancestors.pop();return bytes > remaining ? Infinity : bytes;
  }
  const bytes = count(value, limit);return bytes > limit ? Infinity : bytes;
}

function stringBytes(value: string) {
  let bytes = 2;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32) bytes += 6;
    else if (code === 34 || code === 92) bytes += 2;
    else if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4;i++; }
    else bytes += code >= 0xd800 && code <= 0xdfff ? 6 : 3;
  }
  return bytes;
}
