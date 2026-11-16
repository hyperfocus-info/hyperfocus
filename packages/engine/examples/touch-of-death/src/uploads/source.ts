export const maxUploadSourceBytes = 2097152;
const maxSourceDimension = 2048;

/** Inspect dimensions before allocating decoded pixels. MIME and filenames are not trusted. */
export function inspectUploadSource(bytes: Uint8Array): { width: number; height: number; mime: 'image/png' | 'image/jpeg' } {
  if (bytes.length < 24 || bytes.length > maxUploadSourceBytes) throw new Error('Choose a PNG or JPEG image under 2 MiB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    let offset = 8, width = 0, height = 0, image = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), end = offset + 12 + length;
      if (end > bytes.length) throw new Error('The PNG image is incomplete.');
      const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (offset === 8 && (kind !== 'IHDR' || length !== 13)) throw new Error('The PNG header is invalid.');
      if (kind === 'IHDR') {
        if (width || length !== 13) throw new Error('The PNG header is invalid.');
        width = view.getUint32(offset + 8);height = view.getUint32(offset + 12);dimensions(width, height);
      }
      if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT') throw new Error('Choose a still image, not an animation.');
      if (kind === 'IDAT') image = true;
      if (kind === 'IEND') {
        if (length || end !== bytes.length || !image) throw new Error('The PNG image has invalid trailing data.');
        return { width, height, mime: 'image/png' };
      }
      offset = end;
    }
    throw new Error('The PNG image is incomplete.');
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2, width = 0, height = 0;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) throw new Error('The JPEG header is invalid.');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 && width && height && offset + 2 <= bytes.length) {
        const length = view.getUint16(offset);
        if (length >= 6 && offset + length <= bytes.length - 2 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return { width, height, mime: 'image/jpeg' };
      }
      if (marker === undefined || marker === 0 || marker === 216 || marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194].includes(marker)) {
        if (length < 8 || width) break;
        height = view.getUint16(offset + 3);width = view.getUint16(offset + 5);
        dimensions(width, height);
      } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        throw new Error('Choose a baseline or progressive JPEG image.');
      }
      offset += length;
    }
    throw new Error('Choose a complete baseline or progressive JPEG image.');
  }
  throw new Error('Choose a still PNG or JPEG image.');
}

function dimensions(width: number, height: number) {
  if (!width || !height || width > maxSourceDimension || height > maxSourceDimension) throw new Error('Source images must fit within 2048 by 2048 pixels.');
}
