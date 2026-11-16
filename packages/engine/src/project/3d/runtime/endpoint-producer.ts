import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { acquireSceneEndpointWriter3D } from '../../../render/3d-scene.ts';
import { createRuntimeEntityApplicator3D } from './entities.ts';
import { createRuntimeEndpointMaterials3D, validateEndpointMaterialRevisionNamespace3D } from './endpoint-materials.ts';

type EntityOptions = Parameters<typeof createRuntimeEntityApplicator3D>[0];
type MaterialOptions = Omit<Parameters<typeof createRuntimeEndpointMaterials3D>[0], 'endpoint'>;

/** Producer-only application owner. General skeleton/socket/performance inputs
 * fall back to the unchanged complete applicators. Effects and lights always
 * execute the complete runtime path after this owner's static entity/material
 * pass. No simulation, presentation history, inputs or frame objects are owned.
 */
export function createRuntimeEndpointProducer3D(options: {
  sceneId: string; entities: EntityOptions; materials: MaterialOptions; skeletons: number;
}) {
  if (options.entities.transformStrategy && options.entities.transformStrategy !== 'original') throw Error('Endpoint producer requires original entity application.');
  validateEndpointMaterialRevisionNamespace3D(options.materials.revisionNamespace);
  const endpoint = acquireSceneEndpointWriter3D(options.entities.scene);
  const unsupported = options.skeletons > 0 || [...options.materials.handles.values()].some(forms => forms.skinned !== undefined);
  const entities = unsupported ? undefined : createRuntimeEntityApplicator3D({ ...options.entities, endpoint });
  const materials = unsupported ? undefined : createRuntimeEndpointMaterials3D({ ...options.materials, endpoint });
  let revisionSource: 'disabled' | 'pending' | 'endpoint' | 'full-fallback' = options.materials.revisionNamespace === undefined ? 'disabled' : 'pending';
  let appliedStatic = false, appliedFallback = false;
  const work = {
    applications: 0, staticApplications: 0, staticMaintenanceCountersAvailable: 0, fullFallbacks: 0, skeletonFallbacks: 0, socketFallbacks: 0, performanceFallbacks: 0,
    entityVisits: 0, transformValidations: 0, instanceResourceValidations: 0, entityRendererComparisons: 0, entityRendererWrites: 0,
    materialVisits: 0, materialInputComparisons: 0, materialResourceValidations: 0, materialNumericValidations: 0,
    materialInputCacheCopies: 0, materialRendererComparisons: 0, materialRendererWrites: 0, materialRendererCacheBytesCopied: 0,
    fullEffectPasses: 0, fullLightApplications: 0, materialCacheEntries: 0, materialTextureSlots: 0,
    scratchBytes: endpoint.storageBytes, entityBindingCapacity: options.entities.entities.length, materialBindingCapacity: options.materials.materials.length,
  };
  const resetKeys = [
    'applications', 'staticApplications', 'staticMaintenanceCountersAvailable', 'fullFallbacks', 'skeletonFallbacks', 'socketFallbacks', 'performanceFallbacks',
    'entityVisits', 'transformValidations', 'instanceResourceValidations', 'entityRendererComparisons', 'entityRendererWrites',
    'materialVisits', 'materialInputComparisons', 'materialResourceValidations', 'materialNumericValidations',
    'materialInputCacheCopies', 'materialRendererComparisons', 'materialRendererWrites', 'materialRendererCacheBytesCopied',
    'fullEffectPasses', 'fullLightApplications',
  ] as const;
  const invalidateMaterialInputRevisions = () => {
    materials?.invalidateInputRevisions();appliedStatic = appliedFallback = false;
    if (options.materials.revisionNamespace !== undefined) revisionSource = 'pending';
  };
  return {
    work,
    invalidateMaterialInputRevisions,
    tryApply(frame: Readonly<Hyperfocus3DEvaluatedFrame>) {
      invalidateMaterialInputRevisions();
      for (const key of resetKeys) work[key] = 0;
      work.applications = 1;materials?.resetWork();
      if (frame.sceneId !== options.sceneId) throw Error(`3D frame ${frame.sceneId} does not match active scene ${options.sceneId}.`);
      const sockets = frame.socketAttachments.length > 0;
      const performances = frame.performances.length > 0 || frame.poseCorrections.length > 0 || frame.ikCorrections.length > 0 || frame.physicalBodies.length > 0;
      if (unsupported || sockets || performances) {
        options.entities.trsJournal?.fullFallback();
        work.fullFallbacks = 1;work.skeletonFallbacks = Number(unsupported);work.socketFallbacks = Number(sockets);work.performanceFallbacks = Number(performances);
        appliedFallback = true;
        return false;
      }
      entities!(frame.entities);materials!.apply(frame.materials);
      const entityWork = entities!.readEndpointWork(), materialWork = materials!.work;
      work.staticApplications = 1;work.staticMaintenanceCountersAvailable = 1;work.entityVisits = entityWork.entityVisits;work.transformValidations = entityWork.transformValidations;work.instanceResourceValidations = entityWork.instanceResourceValidations;
      work.materialVisits = materialWork.materialVisits;work.materialInputComparisons = materialWork.inputComparisons;work.materialResourceValidations = materialWork.resourceValidations;
      work.materialNumericValidations = materialWork.numericValidations;work.materialInputCacheCopies = materialWork.inputCacheCopies;
      work.materialCacheEntries = materialWork.cacheEntries;work.materialTextureSlots = materialWork.textureSlots;
      appliedStatic = true;
      return true;
    },
    finish(frame: Readonly<Hyperfocus3DEvaluatedFrame>) {
      work.fullEffectPasses = 1;work.fullLightApplications = frame.lights.length;
      // Called only after the owner's full effects/lights or fallback apply
      // succeeds. Failed entity/material/full-fallback applications stay pending.
      if (options.materials.revisionNamespace !== undefined) {
        if (!appliedStatic && !appliedFallback) throw Error('Endpoint revision publication has no successful application.');
        revisionSource = appliedStatic ? 'endpoint' : 'full-fallback';
      }
      if (appliedStatic) options.entities.trsJournal?.commit();
    },
    /** Full fallback has its own cache/issuer; the adapter must explicitly read
     * that issuer under a distinct namespace. Never fall through on failure. */
    readMaterialInputRevisions() {
      if (revisionSource === 'pending') throw Error('Endpoint material revisions are unavailable before complete application.');
      if (revisionSource === 'endpoint') return { source: revisionSource, ...materials!.readInputRevisions() } as const;
      return { source: revisionSource } as const;
    },
    readMaterialInputRevisionWork: () => materials?.readInputRevisionWork(),
  };
}
export type EndpointProducerApplication3D = ReturnType<typeof createRuntimeEndpointProducer3D>;
