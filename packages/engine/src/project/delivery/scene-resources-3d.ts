import type { Hyperfocus3DDeclaration } from '../3d/declaration.ts';
import { asRecord } from '@hyperfocus/utilities/records';
import { readAppearanceCatalog3D } from '../3d/appearance/catalog.ts';
import { resolveAppearanceTexture3D } from '../3d/appearance/texture-targets.ts';

/** Keep every resource reachable from a scene or a project-wide extension. */
export function sceneResources3D(options: { declaration: Hyperfocus3DDeclaration; project: unknown; sceneId?: string }) {
  const declaration = options.declaration, sceneId = options.sceneId ?? declaration.activeSceneId;
  const scene = declaration.scenes.find(scene => scene.id === sceneId);if (!scene) throw Error(`Unknown 3D scene: ${sceneId}`);
  const references = new Set<string>();
  function collect(value: unknown, depth = 0) {
    if (depth > 128) throw Error('3D resource graph exceeds its depth limit.');
    if (typeof value === 'string') references.add(value);
    else if (Array.isArray(value)) for (const child of value) collect(child, depth + 1);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) if (!['hyperfocus3D', 'hyperfocusDelivery', 'assets', 'scenes'].includes(key)) collect(child, depth + 1);
  }
  collect(options.project);collect(scene);
  // Appearance targets are composed from actor IDs and suffixes. The generic
  // string walk cannot see these IDs until a user chooses or uploads a look.
  const appearance = readAppearanceCatalog3D(asRecord(asRecord(options.project).extensions).hyperfocusAppearance);
  if (appearance) for (const actor of appearance.actors) {
    for (const slot of appearance.slots) for (const option of slot.options) {
      for (const color of option.colors ?? []) references.add(actor.entityId + color.materialSuffix);
    }
    for (const slot of appearance.textureSlots ?? []) {
      const target = resolveAppearanceTexture3D({ catalog: appearance, actorId: actor.entityId, slotId: slot.id });
      references.add(target.materialId);references.add(target.textureId);
    }
  }
  const meshes = new Set(declaration.meshes.filter(mesh => references.has(mesh.id)).map(mesh => mesh.id));
  const rigs = new Set((declaration.rigs ?? []).filter(rig => references.has(rig.id)).map(rig => rig.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const mesh of declaration.meshes) if (meshes.has(mesh.id) && mesh.skin && !rigs.has(mesh.skin.rigId)) { rigs.add(mesh.skin.rigId);changed = true; }
    for (const rig of declaration.rigs ?? []) if (rigs.has(rig.id) && !meshes.has(rig.meshId)) { meshes.add(rig.meshId);changed = true; }
  }
  const materials = declaration.materials.filter(material => references.has(material.id) || (scene.effectCapacity ?? 0) > 0);
  for (const material of materials) collect(material);
  return { ...declaration, activeSceneId: sceneId, scenes: [scene], meshes: declaration.meshes.filter(mesh => meshes.has(mesh.id)),
    rigs: declaration.rigs?.filter(rig => rigs.has(rig.id)), materials, textures: declaration.textures.filter(texture => references.has(texture.id)) };
}
