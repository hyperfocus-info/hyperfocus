import type { BoundedScene3D } from '../../../render/3d-scene.ts';
import type { Hyperfocus3DDeclaration, PortableAsset3D } from '../declaration.ts';
import { requireMapValue } from '../runtime-assets.ts';

/** Declared texture handles plus a private authored pixel copy for presentation reset. */
export function createRuntimeTextures3D(options: { scene: BoundedScene3D; textures: Hyperfocus3DDeclaration['textures']; assets: ReadonlyMap<string, PortableAsset3D> }) {
  const { scene } = options, handles = new Map<string, number>();
  const originals = new Map<string, { width: number; height: number; pixels: Uint8Array }>();
  for (const texture of options.textures) {
    const source = requireMapValue(options.assets, texture.assetId, `3D texture asset ${texture.assetId}`);
    originals.set(texture.id, { width: texture.width, height: texture.height, pixels: new Uint8Array(source.bytes) });
    handles.set(texture.id, scene.registerTexture({ width: texture.width, height: texture.height, pixels: source.bytes, filter: texture.filter, wrapU: texture.wrap, wrapV: texture.wrap, flipY: texture.flipY, label: texture.id }));
  }
  return {
    handles,
    replaceTexture({ textureId, width, height, pixels }: { textureId: string; width: number; height: number; pixels: Uint8Array | Uint8ClampedArray }) {
      scene.replaceTexture({ handle: requireMapValue(handles, textureId, `3D declared texture ${textureId}`), width, height, pixels });
    },
    resetTexture({ textureId }: { textureId: string }) {
      scene.replaceTexture({ handle: requireMapValue(handles, textureId, `3D declared texture ${textureId}`), ...requireMapValue(originals, textureId, `3D authored texture ${textureId}`) });
    },
  };
}
