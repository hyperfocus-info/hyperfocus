import type { TextureResource3D } from '../3d-scene.ts';
import { validateTexture } from './scene-validation.ts';

/** Validate and copy before the registry commits either resource or byte accounting. */
export function prepareTextureReplacement(previous: TextureResource3D, width: number, height: number, pixels: Uint8Array | Uint8ClampedArray, usedBytes: number, limit: number) {
  const next = { ...previous, width, height, pixels };validateTexture(next);
  const bytes = usedBytes - previous.pixels.byteLength + pixels.byteLength;
  if (!Number.isSafeInteger(bytes) || bytes > limit) throw new RangeError('Replacement exceeds texture byte budget.');
  return { resource: { ...next, pixels: new Uint8Array(pixels) }, bytes };
}
