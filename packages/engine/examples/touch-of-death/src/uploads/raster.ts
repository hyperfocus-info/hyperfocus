import { isRecord } from '@hyperfocus/utilities/records';

export const maxUploadDimension = 128;
export const maxUploadPixels = 16384;
export type UploadRaster = { width: number; height: number; rgba: string };

/** Low-rate upload data, separate from simulation and authored project assets. */
export function readUploadRaster(value: unknown): UploadRaster {
  if (!isRecord(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== 3
    || ['width', 'height', 'rgba'].some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !descriptor?.enumerable || !('value' in descriptor);
    })) throw new Error('Invalid uploaded raster fields.');
  // Own data properties were checked before reading the foreign object.
  const { width, height, rgba } = value;
  if (typeof width !== 'number' || typeof height !== 'number'
    || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > maxUploadDimension || height > maxUploadDimension
    || width * height > maxUploadPixels) throw new Error('Uploaded images must fit within 128 by 128 pixels.');
  const length = width * height * 4;
  if (typeof rgba !== 'string' || rgba.length !== Math.ceil(length / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(rgba)) throw new Error('Invalid uploaded pixel data.');
  const decoded = atob(rgba);
  if (decoded.length !== length || btoa(decoded) !== rgba) throw new Error('Invalid uploaded pixel data.');
  return { width, height, rgba };
}

export function uploadRasterBytes(raster: UploadRaster) {
  const valid = readUploadRaster(raster), decoded = atob(valid.rgba);
  return Uint8ClampedArray.from(decoded, character => character.charCodeAt(0));
}
