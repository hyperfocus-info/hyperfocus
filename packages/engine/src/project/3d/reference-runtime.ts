import type { CookedGltfStaticMesh } from '../../assets/gltf-static.ts';
import type { BoundedScene3D } from '../../render/3d-scene.ts';
import { hashHyperfocusAsset } from '../asset-hash.ts';
import type { Hyperfocus3DDeclaration, PortableAsset3D } from './declaration.ts';
import { assertReferenceFindings3D, inspectReference3D, referenceProjection3D, type Reference3D } from './reference.ts';

/** Hash actual immutable sources and inspect cooked geometry before runtime allocation. */
export async function verifyReferenceAssets3D(options: {
  contract: Reference3D; declaration: Hyperfocus3DDeclaration;
  assets: readonly PortableAsset3D[]; cooked: ReadonlyMap<string, CookedGltfStaticMesh>;
}) {
  const { contract, declaration } = options, assets = new Map(options.assets.map(asset => [asset.id, asset]));
  const source = assets.get(contract.source.assetId);
  if (!source || !source.mimeType.startsWith('image/') || source.bytes.length > 67108864 || await hashHyperfocusAsset(source.bytes) !== contract.source.sha256) throw Error('Reference source image bytes/hash are missing or changed');
  const scene = declaration.scenes.find(item => item.id === contract.sceneId)!;
  const hashes = new Map<string, string>();
  for (const volume of contract.volumes) {
    const entity = scene.entities.find(item => item.id === volume.entityId)!;
    const mesh = declaration.meshes.find(item => item.id === entity.meshId)!, asset = assets.get(mesh.assetId);
    if (!asset) throw Error(`Missing calibrated reference mesh ${mesh.assetId}`);
    let hash = hashes.get(asset.id);
    if (!hash) { hash = await hashHyperfocusAsset(asset.bytes);hashes.set(asset.id, hash); }
    if (hash !== volume.meshSha256) throw Error(`Reference mesh bytes changed: ${volume.entityId}; remeasure before rebinding`);
  }
  // Inactive-scene meshes are deliberately not loaded by runtime resource delivery.
  if (contract.sceneId !== declaration.activeSceneId) return;
  for (const volume of contract.volumes) {
    const entity = scene.entities.find(item => item.id === volume.entityId)!, bounds = options.cooked.get(entity.meshId)?.bounds;
    const actual = bounds ? bounds.maxZ - bounds.minZ : NaN;
    if (!Number.isFinite(actual) || Math.abs(actual - volume.localDepth) > Math.max(1e-6, actual * 1e-5)) throw Error(`Reference calibrated depth does not match cooked geometry: ${volume.entityId}`);
  }
  assertReferenceFindings3D(inspectReference3D({ contract, declaration, depth(entityId) {
    const entity = scene.entities.find(item => item.id === entityId)!, bounds = options.cooked.get(entity.meshId)?.bounds;
    return bounds ? (bounds.maxZ - bounds.minZ) * Math.abs(entity.scale[2]) : undefined;
  } }));
}

/** Uses current scene matrices, so sampled/animated scale and translation cannot bypass admission. */
export function createReferenceRuntimeGuard3D(options: {
  contract?: Reference3D; declaration: Hyperfocus3DDeclaration; scene: BoundedScene3D;
  transforms: ReadonlyMap<string, number>; meshHandles: ReadonlyMap<string, number>;
}) {
  const { contract, declaration, scene, transforms, meshHandles } = options;
  if (!contract || contract.sceneId !== declaration.activeSceneId) return () => {};
  const projection = referenceProjection3D(contract), depthByEntity = new Map<string, number>();
  const active = declaration.scenes.find(item => item.id === contract.sceneId)!;
  for (const volume of contract.volumes) {
    const entity = active.entities.find(item => item.id === volume.entityId)!;
    const mesh = scene.getMesh(meshHandles.get(entity.meshId)!);
    let minimum = Infinity, maximum = -Infinity;
    for (let i = 2; i < mesh.positions.length; i += 3) { minimum = Math.min(minimum, mesh.positions[i]!);maximum = Math.max(maximum, mesh.positions[i]!); }
    depthByEntity.set(volume.entityId, maximum - minimum);
  }
  const matrixPoint = (entityId: string, point: readonly number[]) => {
    const handle = transforms.get(entityId);
    if (handle === undefined || !scene.transforms.active[handle]) return;
    const m = scene.transforms.worldMatrices, o = handle * 16, [x, y, z] = point;
    return [m[o]! * x! + m[o + 4]! * y! + m[o + 8]! * z! + m[o + 12]!,
      m[o + 1]! * x! + m[o + 5]! * y! + m[o + 9]! * z! + m[o + 13]!,
      m[o + 2]! * x! + m[o + 6]! * y! + m[o + 10]! * z! + m[o + 14]!];
  };
  return () => {
    scene.transforms.updateWorldMatrices();
    assertReferenceFindings3D(inspectReference3D({ contract, declaration, projection, worldPoint: matrixPoint, depth(entityId) {
      const handle = transforms.get(entityId);
      if (handle === undefined || !scene.transforms.active[handle]) return;
      const m = scene.transforms.worldMatrices, offset = handle * 16;
      return depthByEntity.get(entityId)! * Math.hypot(m[offset + 8]!, m[offset + 9]!, m[offset + 10]!);
    } }));
  };
}
