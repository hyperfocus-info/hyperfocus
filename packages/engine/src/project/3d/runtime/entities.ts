import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import type { BoundedScene3D, SceneEndpointWriter3D } from '../../../render/3d-scene.ts';
import { requireMapValue } from '../runtime-assets.ts';
import { createEntityTransformApplication3D, type EntityApplicationStrategy3D, type EntityTransformBinding } from './entity-transforms.ts';
import type { EntityInputLease3D } from './entity-input-lease.ts';
import type { EntityTrsValidationJournal3D } from './entity-trs-journal.ts';

type DeclaredEntity = { id: string; meshId: string; materialId: string; skeleton?: unknown; variants?: readonly { id: string; meshId: string; materialId: string }[] };
type Binding = EntityTransformBinding & {
  declared: DeclaredEntity; instance: number;
  meshId?: string; mesh?: number; materialId?: string; material?: number; skinned?: boolean;
};

/** Runtime-owned bindings and detached quaternion values, bounded by the authored scene.
 * Every skip checks live scene storage; simulation, restore and external writes remain authoritative.
 */
export function createRuntimeEntityApplicator3D(options: {
  scene: BoundedScene3D; entities: readonly DeclaredEntity[];
  transforms: ReadonlyMap<string, number>; instances: ReadonlyMap<string, number>;
  meshes: ReadonlyMap<string, number>; materials: ReadonlyMap<string, { static?: number; skinned?: number }>;
  transformStrategy?: EntityApplicationStrategy3D; diagnostics?: boolean;
  /** Exclusive non-renderable scene owner; full application remains the default. */
  endpoint?: SceneEndpointWriter3D;
  trsJournal?: EntityTrsValidationJournal3D;
}) {
  const { scene } = options, bindings = new Map<string, Binding>(), slots: Binding[] = [];
  for (const declared of options.entities) bindings.set(declared.id, {
    declared, transform: requireMapValue(options.transforms, declared.id, `3D frame transform ${declared.id}`),
    instance: requireMapValue(options.instances, declared.id, `3D frame instance ${declared.id}`), slot: bindings.size,
  });
  const transforms = createEntityTransformApplication3D(scene, bindings.size, options.transformStrategy, options.diagnostics);
  if (options.trsJournal && !options.endpoint) throw Error('TRS journal requires an endpoint entity owner.');
  if (options.endpoint && options.transformStrategy && options.transformStrategy !== 'original') throw Error('Endpoint entities do not support transform reuse strategies.');
  const endpointWork = { entityVisits: 0, transformValidations: 0, instanceResourceValidations: 0, rendererComparisons: 0, rendererWrites: 0 };
  const validateTransform = (binding: Binding, entity: Hyperfocus3DEvaluatedFrame['entities'][number], _inputIndex?: number) => {
    scene.transforms.validateTrs(binding.transform, entity.position, entity.rotation, entity.scale);
    endpointWork.entityVisits++;endpointWork.transformValidations++;
  };
  const journalTransform = options.trsJournal ? (binding: Binding, entity: Hyperfocus3DEvaluatedFrame['entities'][number], index = 0) => {
    if (options.trsJournal!.canReuse(index)) { scene.transforms.assertActive(binding.transform);options.trsJournal!.reused();endpointWork.entityVisits++; }
    else { validateTransform(binding, entity, index);options.trsJournal!.validated(index); }
  } : validateTransform;
  const beginInput = options.endpoint ? (lease?: EntityInputLease3D, entities?: readonly Hyperfocus3DEvaluatedFrame['entities'][number][]) => {
    if (lease) throw Error('Endpoint entities do not accept display input leases.');
    if (options.trsJournal) options.trsJournal.beginApplication(entities!);
    return journalTransform;
  } : transforms.beginInput;
  const present = options.endpoint ? (instance: number, mesh: number, material: number, _visible: boolean) => {
    options.endpoint!.instance(instance, mesh, material);endpointWork.instanceResourceValidations++;
  } : (instance: number, mesh: number, material: number, visible: boolean) => scene.setInstancePresentation(instance, mesh, material, visible);
  const resetTransformHistory = () => {
    transforms.resetHistory();
    for (const binding of bindings.values()) { delete binding.rotation;delete binding.packedRotation; }
  };
  return Object.assign((entities: Readonly<Hyperfocus3DEvaluatedFrame['entities']>, lease?: EntityInputLease3D) => {
    transforms.resetWork();
    endpointWork.entityVisits = endpointWork.transformValidations = endpointWork.instanceResourceValidations = 0;
    const applyTransform = beginInput(lease, entities);
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index]!;
      let binding: Binding | undefined = slots[index];
      if (binding?.declared.id !== entity.id) {
        binding = bindings.get(entity.id);
        if (!binding) throw new Error(`3D frame transform ${entity.id} is not available.`);
        if (index < bindings.size) slots[index] = binding;
      }
      const { instance, declared } = binding;
      applyTransform(binding, entity, index);
      const variant = entity.variantId ? declared.variants?.find(item => item.id === entity.variantId) : undefined;
      if (entity.variantId && !variant) throw new Error(`Entity ${entity.id} has no canonical model variant ${entity.variantId}.`);
      const meshId = variant?.meshId ?? declared.meshId, materialId = entity.renderMaterialId ?? variant?.materialId ?? declared.materialId, skinned = !!declared.skeleton;
      if (binding.meshId !== meshId) { binding.mesh = requireMapValue(options.meshes, meshId, `3D variant mesh ${meshId}`);binding.meshId = meshId; }
      if (binding.materialId !== materialId || binding.skinned !== skinned) {
        const handle = requireMapValue(options.materials, materialId, `3D variant material ${materialId}`)[skinned ? 'skinned' : 'static'];
        if (handle === undefined) throw new Error(`3D variant material ${materialId} has no ${skinned ? 'skinned' : 'static'} runtime form.`);
        binding.material = handle;binding.materialId = materialId;binding.skinned = skinned;
      }
      present(instance, binding.mesh!, binding.material!, entity.visible);
    }
  }, { readWork: () => transforms.work, readEndpointWork: () => endpointWork, resetTransformHistory });
}
