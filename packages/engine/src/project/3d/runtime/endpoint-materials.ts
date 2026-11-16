import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { Material3D, SceneEndpointWriter3D } from '../../../render/3d-scene.ts';
import type { MaterialLook3D } from '../../../render/materials/3d-presets.ts';
import { requireMapValue } from '../runtime-assets.ts';
import { copyRuntimeMaterialLook3D, runtimeMaterialValue3D, sameRuntimeMaterialLook3D } from './material-input.ts';

type Binding = { declared: { alphaMode?: Material3D['alphaMode'] }; handle: number; look?: MaterialLook3D; alphaMode?: Material3D['alphaMode']; textures?: number[]; revision?: number };
export type EndpointMaterialRevisionWindow3D = Readonly<{ namespace: string; values: Float64Array }>;
export function validateEndpointMaterialRevisionNamespace3D(namespace: string | undefined) {
  if (namespace !== undefined && (typeof namespace !== 'string' || !namespace || namespace.length > 256)) throw Error('Endpoint material revision namespace must contain 1–256 characters.');
}

/** Detached semantic input cache only. Renderer storage is never trusted or
 * maintained; every call rechecks live material/texture handles. Full application
 * has a separate cache, so fallback and endpoint calls cannot poison each other.
 */
export function createRuntimeEndpointMaterials3D(options: {
  endpoint: SceneEndpointWriter3D;
  materials: readonly { id: string; alphaMode?: Material3D['alphaMode'] }[];
  handles: ReadonlyMap<string, { static?: number; skinned?: number }>;
  textures: ReadonlyMap<string, number>;
  /** Opt in with a namespace unique to this owner lifetime, including recreated
   * worlds. Use a different namespace for the full fallback issuer. Revision
   * arrays are read-only borrows until the next apply/invalidation; copy or
   * synchronously serialize them before then. No input or resource trust passes
   * from this producer cache to a consumer's live scene. */
  revisionNamespace?: string;
}) {
  validateEndpointMaterialRevisionNamespace3D(options.revisionNamespace);
  const bindings = new Map<string, Binding>();
  for (const declared of options.materials) {
    const handle = options.handles.get(declared.id);
    if (handle?.skinned !== undefined) throw Error('Endpoint material owner requires static material forms.');
    if (handle?.static !== undefined) bindings.set(declared.id, { declared, handle: handle.static });
  }
  const texture = (id: string | undefined) => id === undefined ? undefined : requireMapValue(options.textures, id, `3D frame texture ${id}`);
  const work = { materialVisits: 0, inputComparisons: 0, resourceValidations: 0, numericValidations: 0,
    inputCacheCopies: 0, rendererComparisons: 0, rendererWrites: 0, rendererCacheBytesCopied: 0, cacheEntries: 0, textureSlots: 0 };
  let revisionWindow: EndpointMaterialRevisionWindow3D | undefined;
  const revisions = options.revisionNamespace === undefined ? undefined : {
    namespace: options.revisionNamespace,
    work: { available: 0, entries: 0, backingBytes: 0, allocations: 0, writes: 0, changes: 0, serial: 0 },
  };
  const applyOriginal = (materials: Readonly<Hyperfocus3DEvaluatedFrame['materials']>) => {
      for (const material of materials) {
        work.materialVisits++;
        const binding = bindings.get(material.id);if (!binding) continue; // Match the full applicator's unknown-material behavior.
        const look = material.look, alphaMode = look.opacity < 1 ? 'blend' : binding.declared.alphaMode ?? 'opaque';
        work.inputComparisons++;
        if (binding.look && binding.alphaMode === alphaMode && sameRuntimeMaterialLook3D(binding.look, look)) {
          options.endpoint.materialResources(binding.handle, binding.textures!, false);work.resourceValidations++;
          continue;
        }
        const textures = options.endpoint.material(binding.handle, runtimeMaterialValue3D(look, alphaMode, texture));
        work.numericValidations++;work.resourceValidations++;
        // Commit only after validation, and never retain caller-owned nested arrays.
        if (!binding.look) { work.cacheEntries++;work.textureSlots += textures.length; }
        binding.look = copyRuntimeMaterialLook3D(look);binding.alphaMode = alphaMode;binding.textures = textures;work.inputCacheCopies++;
      }
  };
  const invalidateInputRevisions = () => { if (revisions) revisions.work.available = revisions.work.writes = revisions.work.changes = 0; };
  const applyWithRevisions = (materials: Readonly<Hyperfocus3DEvaluatedFrame['materials']>) => {
    const state = revisions!, counts = state.work;invalidateInputRevisions();counts.writes = counts.changes = 0;
    if (materials.length > 20000) throw Error('Endpoint material revision window exceeds 20000 entries.');
    if (revisionWindow?.values.length !== materials.length) {
      revisionWindow = { namespace: state.namespace, values: new Float64Array(materials.length) };
      counts.allocations++;counts.entries = materials.length;counts.backingBytes = revisionWindow.values.byteLength;
    }
    const values = revisionWindow.values;
    for (let index = 0; index < materials.length; index++) {
      const material = materials[index]!;work.materialVisits++;
      const binding = bindings.get(material.id);
      if (!binding) { values[index] = 0;counts.writes++;continue; }
      const look = material.look, alphaMode = look.opacity < 1 ? 'blend' : binding.declared.alphaMode ?? 'opaque';
      work.inputComparisons++;
      const unchanged = !!binding.look && sameRuntimeMaterialLook3D(binding.look, look);
      if (unchanged && binding.alphaMode === alphaMode) {
        options.endpoint.materialResources(binding.handle, binding.textures!, false);work.resourceValidations++;
      } else {
        const textures = options.endpoint.material(binding.handle, runtimeMaterialValue3D(look, alphaMode, texture));
        work.numericValidations++;work.resourceValidations++;
        const detached = copyRuntimeMaterialLook3D(look);
        if (!unchanged) {
          if (counts.serial === Number.MAX_SAFE_INTEGER) throw Error('Endpoint material input revision exhausted.');
          binding.revision = ++counts.serial;counts.changes++;
        }
        if (!binding.look) { work.cacheEntries++;work.textureSlots += textures.length; }
        binding.look = detached;binding.alphaMode = alphaMode;binding.textures = textures;work.inputCacheCopies++;
      }
      values[index] = binding.revision!;counts.writes++;
    }
    // No partially validated window is publishable. Successful earlier entries
    // can keep detached caches/revisions after a later failure; serials never
    // rewind, and retry still validates every live resource before publication.
    counts.available = 1;
  };
  return {
    work,
    resetWork() { work.materialVisits = work.inputComparisons = work.resourceValidations = work.numericValidations = work.inputCacheCopies = 0; },
    apply: revisions ? applyWithRevisions : applyOriginal,
    invalidateInputRevisions,
    readInputRevisions(): EndpointMaterialRevisionWindow3D {
      if (!revisions?.work.available || !revisionWindow) throw Error('Endpoint material revisions require an enabled, complete successful application.');
      return revisionWindow;
    },
    /** Borrowed counters; absence means disabled, with zero revision arrays. */
    readInputRevisionWork: (): Readonly<NonNullable<typeof revisions>['work']> | undefined => revisions?.work,
  };
}
