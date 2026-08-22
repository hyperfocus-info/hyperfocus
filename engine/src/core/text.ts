const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

/** Truncates at a Unicode code-point boundary without exceeding a UTF-8 wire limit. */
export function truncateUtf8(value: string, maxBytes: number): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }
  if (utf8ByteLength(value) <= maxBytes) return value;
  let result = "";
  let usedBytes = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (usedBytes + characterBytes > maxBytes) break;
    result += character;
    usedBytes += characterBytes;
  }
  return result;
}
