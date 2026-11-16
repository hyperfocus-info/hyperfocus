import { MATERIAL_FLOAT_STRIDE_3D, MATERIAL_TEXTURE_STRIDE_3D, type BoundedScene3D, type Material3D } from '../../../render/3d-scene.ts';
import type { MaterialLook3D } from '../../../render/materials/3d-presets.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { requireMapValue } from '../runtime-assets.ts';
import { runtimeMaterialValue3D, sameRuntimeMaterialLook3D as sameLook, copyRuntimeMaterialLook3D as copyLook } from './material-input.ts';
import { isRetainedImmutableMaterialLook3D } from '../../../frame/immutable-material-3d.ts';

type Form = { handle: number; skinned: boolean; data?: Float32Array; textures?: Int32Array; flags?: number };
type Binding = { declared: { alphaMode?: Material3D['alphaMode'] }; forms: Form[]; look?: MaterialLook3D; alphaMode?: Material3D['alphaMode'] };

/** Bounded by authored handles. Cache detached values, never caller-owned frame objects. */
export function createRuntimeMaterialApplicator3D(options: {
  scene: BoundedScene3D;
  materials: readonly { id: string; alphaMode?: Material3D['alphaMode'] }[];
  handles: ReadonlyMap<string, { static?: number; skinned?: number }>;
  textures: ReadonlyMap<string, number>;
  diagnostics?: boolean;
}) {
  const { scene } = options, bindings = new Map<string, Binding>();
  const work = { visits: 0, identityChecksReused: 0, deepChecks: 0, resourceChecks: 0, updates: 0 };
  for (const declared of options.materials) {
    const handles = options.handles.get(declared.id);if (!handles) continue;
    const forms: Form[] = [];
    if (handles.static !== undefined) forms.push({ handle: handles.static, skinned: false });
    if (handles.skinned !== undefined) forms.push({ handle: handles.skinned, skinned: true });
    bindings.set(declared.id, { declared, forms });
  }
  const texture = (id: string | undefined) => id === undefined ? undefined : requireMapValue(options.textures, id, `3D frame texture ${id}`);
  // Retain bounded storage, but revoke every detached input/live-storage match.
  // The next apply uses the ordinary validators; resources and epochs are untouched.
  const resetHistory = () => {
    for (const binding of bindings.values()) {
      delete binding.look;delete binding.alphaMode;
      for (const form of binding.forms) delete form.flags;
    }
  };
  return Object.assign((materials: Readonly<Hyperfocus3DEvaluatedFrame['materials']>) => {
    for (const material of materials) {
      const binding = bindings.get(material.id);if (!binding) continue;
      const look = material.look, alphaMode = look.opacity < 1 ? 'blend' : binding.declared.alphaMode ?? 'opaque';
      if (options.diagnostics) work.visits++;
      if (binding.look && binding.alphaMode === alphaMode) {
        const identical = binding.look === look;
        if (options.diagnostics) { if (identical) work.identityChecksReused++;else work.deepChecks++; }
        if (identical || sameLook(binding.look, look)) {
          if (options.diagnostics) work.resourceChecks += binding.forms.length;
          if (matchesForms(scene, binding.forms)) continue;
        }
      }
      const value = runtimeMaterialValue3D(look, alphaMode, texture);
      for (const form of binding.forms) {
        scene.updateMaterial(form.handle, { ...value, skinning: form.skinned });
        if (options.diagnostics) work.updates++;
        const offset = form.handle * MATERIAL_FLOAT_STRIDE_3D, textures = form.handle * MATERIAL_TEXTURE_STRIDE_3D;
        form.data = scene.materialData.slice(offset, offset + MATERIAL_FLOAT_STRIDE_3D);
        form.textures = scene.materialTextureHandles.slice(textures, textures + MATERIAL_TEXTURE_STRIDE_3D);
        form.flags = scene.materialFlags[form.handle];
      }
      // A failed validation must not mark partially applied input as clean.
      binding.look = isRetainedImmutableMaterialLook3D(look) ? look : copyLook(look);binding.alphaMode = alphaMode;
    }
  }, { resetHistory, work });
}

function matchesForms(scene: BoundedScene3D, forms: readonly Form[]): boolean {
  for (const form of forms) if (!matchesScene(scene, form)) return false;
  return true;
}

function matchesScene(scene: BoundedScene3D, form: Form): boolean {
  const { handle, data, textures } = form;
  if (!data || !textures || !scene.isMaterialActive(handle) || scene.materialFlags[handle] !== form.flags) return false;
  const offset = handle * MATERIAL_FLOAT_STRIDE_3D, textureOffset = handle * MATERIAL_TEXTURE_STRIDE_3D;
  for (let i = 0; i < data.length; i++) if (!Object.is(scene.materialData[offset + i], data[i])) return false;
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i]!;
    if (scene.materialTextureHandles[textureOffset + i] !== texture || texture !== -1 && !scene.isTextureActive(texture)) return false;
  }
  return true;
}
