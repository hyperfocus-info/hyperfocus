import { readList, readObject, optional, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';
import type { PortableAsset3D } from '../declaration.ts';

function readAssetBytes(value: unknown) {
  if (!(value instanceof Uint8Array)) throw new TypeError('Portable asset bytes must be Uint8Array.');
  return value;
}

let fields: ObjectReaders<PortableAsset3D>;

/** Fresh descriptors borrow their validated byte arrays. The caller owns bytes
 * and their transfer/disposal; this does not decode or copy large asset payloads. */
export function readPortableAsset3D(value: unknown): PortableAsset3D {
  return readObject(value, (fields ??= {
  id: requireText, name: optional(requireText), mimeType: requireText, bytes: readAssetBytes,
}));
}

export function readPortableAssets3D(value: unknown): PortableAsset3D[] {
  return readList(value, readPortableAsset3D);
}
