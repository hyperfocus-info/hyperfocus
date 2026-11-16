/** Reads only bounded ID3v2 TBPM tags; absence does not imply a failed tempo estimate. */
export function readAudioMetadata(options: { bytes: ArrayBuffer | Uint8Array }) {
  const bytes = options.bytes instanceof Uint8Array ? options.bytes : new Uint8Array(options.bytes);
  if (bytes.length < 10 || bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51 || bytes[4] === 255) return;
  const version = bytes[3], flags = bytes[5]!;
  if (version !== 3 && version !== 4 || flags & (version === 3 ? 31 : 15)) return;
  const size = integer(bytes, 6, true);
  if (size === undefined || size > 1048576 || size + 10 > bytes.length) return;
  let tag = bytes.subarray(10, size + 10), offset = 0;
  if (version === 3 && flags & 128) tag = unsynchronize(tag);
  if (flags & 64) {
    const extendedSize = integer(tag, 0, version === 4);
    if (extendedSize === undefined || extendedSize < 6) return;
    offset = extendedSize + (version === 3 ? 4 : 0);
    if (offset > tag.length) return;
  }
  for (let frame = 0; frame < 256 && offset + 10 <= tag.length; frame++) {
    const id = String.fromCharCode(...tag.subarray(offset, offset + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) return;
    const length = integer(tag, offset + 4, version === 4), frameFlags = tag[offset + 9]!;
    if (length === undefined || length === 0 || offset + 10 + length > tag.length) return;
    const start = offset + 10;offset = start + length;
    if (id !== 'TBPM' || length > 256) continue;
    // Encrypted/compressed frames cannot be interpreted without another decoder.
    if (frameFlags & (version === 3 ? 192 : 12)) continue;
    let payload = tag.subarray(start, offset);
    if (version === 4 && (flags & 128 || frameFlags & 2)) payload = unsynchronize(payload);
    let prefix = frameFlags & (version === 3 ? 32 : 64) ? 1 : 0;
    if (version === 4 && frameFlags & 1) {
      const declared = integer(payload, prefix, true);if (declared === undefined || declared !== payload.length - prefix - 4) continue;
      prefix += 4;
    }
    const bpm = tempo(payload.subarray(prefix));
    if (bpm !== undefined) return { bpm, bpmStatus: 'tagged' as const, bpmConfidence: 1 as const, bpmSource: `ID3v2.${version}/TBPM` };
  }
}

export type AudioMetadata = NonNullable<ReturnType<typeof readAudioMetadata>>;

function integer(bytes: Uint8Array, offset: number, synchsafe: boolean) {
  if (offset + 4 > bytes.length) return;
  let value = 0;
  for (let i = offset; i < offset + 4; i++) { const byte = bytes[i]!;if (synchsafe && byte > 127) return;value = value * (synchsafe ? 128 : 256) + byte; }
  return value;
}

function unsynchronize(bytes: Uint8Array) {
  const result = new Uint8Array(bytes.length);let length = 0;
  for (let i = 0; i < bytes.length; i++) { const byte = bytes[i]!;result[length++] = byte;if (byte === 255 && bytes[i + 1] === 0) i++; }
  return result.subarray(0, length);
}

function tempo(bytes: Uint8Array) {
  const encoding = bytes[0];let offset = 1, width = 1, little = false, text = '';
  if (encoding === 1) {
    if (bytes[1] === 255 && bytes[2] === 254) little = true;
    else if (bytes[1] !== 254 || bytes[2] !== 255) return;
    offset = 3;width = 2;
  } else if (encoding === 2) width = 2;
  else if (encoding !== 0 && encoding !== 3) return;
  if ((bytes.length - offset) % width) return;
  let terminated = false;
  for (let i = offset; i < bytes.length; i += width) {
    const code = width === 1 ? bytes[i]! : little ? bytes[i]! + bytes[i + 1]! * 256 : bytes[i]! * 256 + bytes[i + 1]!;
    if (code === 0) { terminated = true;continue; }
    if (terminated || code > 127) return;
    text += String.fromCharCode(code);
  }
  if (!/^\s*\d+(?:\.\d+)?\s*$/.test(text)) return;
  const value = Number(text);if (value >= 30 && value <= 300) return value;
}
