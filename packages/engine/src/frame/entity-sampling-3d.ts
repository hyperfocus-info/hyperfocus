import type { Hyperfocus3DEvaluatedFrame as Frame } from './3d.ts';
import type { Hyperfocus3DDeclaration } from '../project/3d/declaration.ts';

export type EntitySamplingStrategy3D = 'detached' | 'immutable-trs';
export type AuthoredSampleEntity3D = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** Logical constructions/copies, not heap size or measured RAM traffic. Cache
 * storage describes only engine-retained latest tuples; callers may retain any
 * number of escaped immutable generations, just as with detached outputs. */
export function createEntitySamplingWork3D() {
  return { enabled: 1, samples: 0, requestedImmutable: 0, immutableSamples: 0, detachedSamples: 0,
    fallbackSamples: 0, missingContractFallbacks: 0, unsupportedTimelineFallbacks: 0, topologyFallbackEntities: 0,
    entityVisits: 0, recordAllocations: 0, recordReuses: 0, vectorAllocations: 0, vectorReuses: 0,
    scalarCopies: 0, scalarWrites: 0, yawQuaternionComputations: 0, trigCalls: 0,
    sourceLookups: 0, sourceMapGets: 0, cacheHits: 0, cacheMisses: 0, freezes: 0,
    sourceGenerationInvalidations: 0, scaleComparisons: 0, cacheAllocations: 0, cacheReferenceArraysAllocated: 0, cacheGenerationArraysAllocated: 0, cacheGenerationBuffersAllocated: 0, cacheClears: 0, cacheReferencesReleased: 0,
    eligibleSlots: 0, volatileSlots: 0, cacheSlots: 0, retainedVectorArrays: 0, retainedScalarValues: 0, cacheReferenceCapacity: 0, cacheGenerationBytes: 0, frameReferences: 0 };
}
export type EntitySamplingWork3D = ReturnType<typeof createEntitySamplingWork3D>;
/** Internal frame-owner seam. Runtime sampleFrame never accepts this object. */
export type EntitySamplingOwner3D = {
  work: EntitySamplingWork3D;
  sample(entity: AuthoredSampleEntity3D, index: number, copy: (entity: AuthoredSampleEntity3D) => Frame['entities'][number]): Frame['entities'][number];
};

const retained = new Set(['enabled','eligibleSlots','volatileSlots','cacheSlots','retainedVectorArrays','retainedScalarValues','cacheReferenceCapacity','cacheGenerationBytes']);
const resetKeys=Object.keys(createEntitySamplingWork3D()).filter(key=>!retained.has(key));
export function resetEntitySamplingWork3D(work: EntitySamplingWork3D) {
  const counters: Record<string, number> = work;
  for (const key of resetKeys) counters[key] = 0;
}
