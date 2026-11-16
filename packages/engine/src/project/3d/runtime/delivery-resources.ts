import {createBoundedScene3D} from '../../../render/3d-scene.ts';
import {createRuntimeTextures3D} from './textures.ts';
import {requireMapValue, type cookRuntimeAssets3D} from '../runtime-assets.ts';
import type {Hyperfocus3DDeclaration} from '../declaration.ts';

/** Allocate the active delivery closure while preserving authored material and rig semantics. */
export function createDeliveredSceneResources3D(options: {
  declaration: Hyperfocus3DDeclaration; resources: Hyperfocus3DDeclaration; active: Hyperfocus3DDeclaration['scenes'][number];
  cooked: Pick<Awaited<ReturnType<typeof cookRuntimeAssets3D>>, 'assetById' | 'cookedById' | 'rigById'>;
}) {
  const { declaration, resources, active, cooked: {assetById,cookedById,rigById} } = options;
  const skinnedEntities = active.entities.filter((entity) => entity.skeleton);
  let jointsPerSkeleton = 0;
  for (const entity of skinnedEntities) {
    const rig = requireMapValue(rigById, entity.skeleton!.rigId, `3D rig ${entity.skeleton!.rigId}`);
    const skeleton = rig.skeletons[entity.skeleton!.skinIndex];
    if (!skeleton) throw new Error(`Rig ${entity.skeleton!.rigId} has no skin ${entity.skeleton!.skinIndex}.`);
    jointsPerSkeleton = Math.max(jointsPerSkeleton, skeleton.jointNodes.length);
  }
  const materialUsage = runtimeMaterialUsage(active, resources.materials);
  const materialCapacity = [...materialUsage.values()].reduce((total, usage) => total + Number(usage.static) + Number(usage.skinned), 0);
  const scene = createBoundedScene3D({
    transforms: active.entities.length + (active.effectCapacity ?? 0),
    meshes: resources.meshes.length + Number((active.effectCapacity ?? 0) > 0),
    textures: resources.textures.length,
    textureBytes: declaration.budgets.textureBytes,
    materials: materialCapacity,
    lights: active.lights.length,
    instances: active.entities.length + (active.effectCapacity ?? 0),
    skeletons: skinnedEntities.length,
    ...(skinnedEntities.length ? { jointsPerSkeleton } : {}),
  });
  const meshHandles = new Map<string, number>();
  for (const mesh of resources.meshes) {
    const cooked = requireMapValue(cookedById, mesh.id, `cooked 3D mesh ${mesh.id}`);
    const streams = mesh.skin ? requireMapValue(rigById, mesh.skin.rigId, `3D rig ${mesh.skin.rigId}`).meshes.find((item) => item.meshIndex === mesh.skin!.meshIndex && item.primitiveIndex === mesh.skin!.primitiveIndex) : undefined;
    if (mesh.skin && !streams) throw new Error(`Rig ${mesh.skin.rigId} has no skin streams for mesh ${mesh.skin.meshIndex} primitive ${mesh.skin.primitiveIndex}.`);
    meshHandles.set(mesh.id, scene.registerMesh({ positions: cooked.positions, normals: cooked.normals, uvs: cooked.uvs, indices: cooked.indices, ...(streams ? { joints: streams.joints, weights: streams.weights } : {}), topology: cooked.topology, bounds: cooked.bounds, label: mesh.id }));
  }
  const billboardMesh = (active.effectCapacity ?? 0) > 0 ? scene.registerMesh({
    positions: new Float32Array([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    label: "builtin:effect-billboard",
  }) : undefined;
  const textures = createRuntimeTextures3D({ scene, textures: resources.textures, assets: assetById }), textureHandles = textures.handles;
  const materialHandles = new Map<string, { static?: number; skinned?: number }>();
  for (const material of declaration.materials) {
    const usage = materialUsage.get(material.id); if (!usage) continue;
    const definition = (skinning: boolean) => ({
      shading: material.shading,
      shader: material.shader,
      alphaMode: material.alphaMode, alphaCutoff: material.alphaCutoff,
      baseColor: material.baseColor,
      emissive: material.emissive,
      baseColorTexture: material.textureIds?.baseColor === undefined ? (material.textureId === undefined ? undefined : textureHandles.get(material.textureId)) : textureHandles.get(material.textureIds.baseColor),
      metallicRoughnessTexture: material.textureIds?.metallicRoughness === undefined ? undefined : textureHandles.get(material.textureIds.metallicRoughness),
      normalTexture: material.textureIds?.normal === undefined ? undefined : textureHandles.get(material.textureIds.normal),
      occlusionTexture: material.textureIds?.occlusion === undefined ? undefined : textureHandles.get(material.textureIds.occlusion),
      emissiveTexture: material.textureIds?.emissive === undefined ? undefined : textureHandles.get(material.textureIds.emissive),
      uvOffset: material.uv?.offset, uvScale: material.uv?.scale, uvRotation: material.uv?.rotation,
      toon: material.toon,
      metallic: material.metallic,
      roughness: material.roughness,
      doubleSided: material.doubleSided,
      ...(skinning ? { skinning: true } : {}),
    });
    materialHandles.set(material.id, {
      ...(usage.static ? { static: scene.createMaterial(definition(false)) } : {}),
      ...(usage.skinned ? { skinned: scene.createMaterial(definition(true)) } : {}),
    });
  }
  const lightHandles = new Map<string, number>();
  for (const light of active.lights) lightHandles.set(light.id, scene.createLight(light));
  return { scene, meshHandles, billboardMesh, textures, textureHandles, materialHandles, lightHandles };
}

function runtimeMaterialUsage(active: Hyperfocus3DDeclaration['scenes'][number], materials: Hyperfocus3DDeclaration['materials']) {
  const usageById = new Map<string, { static: boolean; skinned: boolean }>();
  for (const entity of active.entities) for (const id of [entity.materialId, ...(entity.variants?.map(variant => variant.materialId) ?? [])]) {
    const usage = usageById.get(id) ?? { static: false, skinned: false };
    if (entity.skeleton) usage.skinned = true; else usage.static = true;
    usageById.set(id, usage);
  }
  const staticForm = active.entities.some(entity => !entity.skeleton) || (active.effectCapacity ?? 0) > 0;
  const skinnedForm = active.entities.some(entity => !!entity.skeleton);
  for (const material of materials) {
    // Project-wide extensions can retain presentation materials before an entity
    // selects them. Allocate only the delivered closure, in its possible forms.
    const usage = usageById.get(material.id) ?? { static: staticForm, skinned: skinnedForm };
    if ((active.effectCapacity ?? 0) > 0) usage.static = true;
    usageById.set(material.id, usage);
  }
  return usageById;
}
