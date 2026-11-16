import type { Hyperfocus3DEvaluatedFrame as Frame } from '../../../frame/3d.ts';
import { createEntitySamplingWork3D, resetEntitySamplingWork3D, type EntitySamplingOwner3D, type EntitySamplingStrategy3D } from '../../../frame/entity-sampling-3d.ts';

type Entity = Frame['entities'][number];
/** This is a caller obligation, not the combat-capture observer contract.
 * During the synchronous operation, entity TRS writes/aliases are confined to
 * the declared writable IDs. No reentry, topology/ID edits, runtime mutation
 * or writes through undeclared aliases are permitted. Detached output may be
 * retained after return; its authority expires on synchronous return (including
 * Promise return), so later applications always use the checked fallback. */
export type SampledEntityWriteContract3D = 'declared-entity-writes';

/** Bounded authority for fresh canonical entity shells. Detached sampling caches
 * numeric validity only; explicit immutable sampling also retains owned frozen
 * TRS tuples. Consumers still assert the live transform and all current
 * instance/mesh/material resources on every application. */
export function createEntityTrsValidationJournal3D(ids: readonly string[], writableIds: readonly string[], volatileIds: readonly string[] = []) {
  if (ids.length > 20000 || new Set(ids).size !== ids.length) throw Error('TRS journal requires bounded unique authored IDs.');
  const identities = [...ids];
  const slots = new Map(identities.map((id, index) => [id, index])), count = identities.length;
  const writable = new Uint8Array(count), knownScale = new Uint8Array(count);
  const scales = new Float64Array(count * 3), poses = new Float64Array(count), scaleVersions = new Float64Array(count);
  const validPoses = new Float64Array(count).fill(-1), validScales = new Float64Array(count).fill(-1);
  const pending = new Uint32Array(count);
  const samplingWork = createEntitySamplingWork3D();
  let cachedPositions: Array<Entity['position'] | undefined> | undefined, cachedRotations: Array<Entity['rotation'] | undefined> | undefined,
    cachedScales: Array<Entity['scale'] | undefined> | undefined, cachedPoses: Float64Array | undefined, cachedScaleVersions: Float64Array | undefined;
  for (const id of writableIds) {
    const slot = slots.get(id);if (slot === undefined) throw Error(`TRS journal writer is not authored: ${id}`);writable[slot] = 1;
  }
  // Bit one preserves the existing writer authority. Bit two only excludes
  // continuously refreshed simulation sources from immutable tuple storage.
  for (const id of volatileIds) { const slot=slots.get(id);if(slot===undefined)throw Error(`TRS journal source is not authored: ${id}`);writable[slot]!|=2; }
  samplingWork.eligibleSlots=writable.reduce((sum,value)=>sum+Number(value===0),0);
  samplingWork.volatileSlots=writable.reduce((sum,value)=>sum+Number(!!(value&2)),0);
  const work = { enabled: 1, transactions: 0, sourceGenerationInvalidations: 0, sampleVisits: 0, scaleComparisons: 0,
    scaleChanges: 0, scaleValuesCopied: 0, commitGenerationWrites: 0, writableSlots: writable.reduce((sum, value) => sum + (value&1), 0), applicationSlots: 0,
    numericValidations: 0, numericReuses: 0, liveTransformChecks: 0, fallbackApplications: 0, fullFallbackApplications: 0, validationCountersAvailable: 1,
    committedSlots: 0, abortedTransactions: 0, resets: 0, retainedFrameReferences: 0,
    storageBytes: writable.byteLength + knownScale.byteLength + scales.byteLength + poses.byteLength + scaleVersions.byteLength + validPoses.byteLength + validScales.byteLength + pending.byteLength,
    bindingEntries: count, identityReferences: count * 2 };
  let frame: Frame | undefined, sampling = false, sampled = 0, supported = false, active = false, validApplication = false;
  let pendingCount = 0, poseWrites = 0, resets = 0;
  let cacheClears = 0, cacheReferencesReleased = 0;
  const resetWork = () => {
    for (const key of ['transactions', 'sampleVisits', 'scaleComparisons', 'scaleChanges', 'scaleValuesCopied', 'commitGenerationWrites', 'applicationSlots', 'numericValidations', 'numericReuses', 'liveTransformChecks', 'fallbackApplications', 'fullFallbackApplications', 'committedSlots', 'abortedTransactions'] as const) work[key] = 0;
    work.validationCountersAvailable = 1;
    work.sourceGenerationInvalidations = poseWrites;poseWrites = 0;work.resets = resets;resets = 0;
    resetEntitySamplingWork3D(samplingWork);samplingWork.sourceGenerationInvalidations = work.sourceGenerationInvalidations;
    samplingWork.cacheClears = cacheClears;samplingWork.cacheReferencesReleased = cacheReferencesReleased;cacheClears = cacheReferencesReleased = 0;
  };
  const invalidate = () => {
    validPoses.fill(-1);validScales.fill(-1);supported = false;pendingCount = 0;resets++;
    if (cachedPositions) {
      cacheClears++;cacheReferencesReleased += samplingWork.retainedVectorArrays;
      cachedPositions.fill(undefined);cachedRotations!.fill(undefined);cachedScales!.fill(undefined);cachedPoses!.fill(-1);cachedScaleVersions!.fill(-1);
      samplingWork.cacheSlots = samplingWork.retainedVectorArrays = samplingWork.retainedScalarValues = 0;
    }
  };
  const observeSource = (index: number, id: string, scale: Entity['scale']) => {
    if (!sampling) return false;
    work.sampleVisits++;
    if (index !== sampled++ || index >= count || identities[index] !== id) { supported = false;return false; }
    const offset = index * 3;work.scaleComparisons += 3;samplingWork.scaleComparisons += 3;
    const x = Object.is(scales[offset], scale[0]), y = Object.is(scales[offset + 1], scale[1]), z = Object.is(scales[offset + 2], scale[2]);
    const same = knownScale[index] && x && y && z;
    if (!same) {
      if (scaleVersions[index] === Number.MAX_SAFE_INTEGER) { scaleVersions.fill(0);invalidate(); }
      scaleVersions[index]!++;knownScale[index] = 1;work.scaleChanges++;work.scaleValuesCopied += 3;
      for (let axis = 0; axis < 3; axis++) scales[offset + axis] = scale[axis]!;
    }
    return true;
  };
  const detached: EntitySamplingOwner3D = { work: samplingWork, sample(entity, index, copy) {
    samplingWork.entityVisits++;if (!observeSource(index, entity.id, entity.scale)) samplingWork.topologyFallbackEntities++;
    return copy(entity);
  } };
  const immutable: EntitySamplingOwner3D = { work: samplingWork, sample(entity, index, copy) {
    samplingWork.entityVisits++;
    if (!observeSource(index, entity.id, entity.scale)) samplingWork.topologyFallbackEntities++;
    if (!supported || writable[index]) return copy(entity);
    if (cachedPositions![index] && cachedPoses![index] === poses[index] && cachedScaleVersions![index] === scaleVersions[index]) {
      samplingWork.cacheHits++;samplingWork.recordAllocations++;samplingWork.vectorReuses += 3;
      return { id: entity.id, position: cachedPositions![index]!, rotation: cachedRotations![index]!, scale: cachedScales![index]!, visible: true };
    }
    samplingWork.cacheMisses++;
    const result = copy(entity);
    // Freeze only fresh copied tuples. Never freeze/mutate authored or private
    // runtime vectors. Replacing cache entries cannot alter escaped old frames.
    Object.freeze(result.position);Object.freeze(result.rotation);Object.freeze(result.scale);samplingWork.freezes += 3;
    if (!cachedPositions![index]) { samplingWork.cacheSlots++;samplingWork.retainedVectorArrays += 3;samplingWork.retainedScalarValues += 10; }
    cachedPositions![index] = result.position;cachedRotations![index] = result.rotation;cachedScales![index] = result.scale;
    cachedPoses![index] = poses[index]!;cachedScaleVersions![index] = scaleVersions[index]!;
    return result;
  } };
  let selected = detached;
  return {
    work,
    samplingWork,
    entitySampling: () => selected,
    invalidate,
    sourceChanged(id: string) {
      const slot = slots.get(id);if (slot === undefined) { invalidate();return; }
      if (poses[slot] === Number.MAX_SAFE_INTEGER) { poses.fill(0);invalidate(); }
      poses[slot]!++;poseWrites++;
      // Runtime writes during a borrowed frame invalidate the entire borrow.
      if (active) supported = false;
    },
    sample(index: number, entity: Entity) {
      observeSource(index,entity.id,entity.scale);
    },
    run<T>(sample: () => Frame, operation: (frame: Frame) => T, contract?: SampledEntityWriteContract3D, entitySampling: EntitySamplingStrategy3D = 'detached', unsupportedTimeline = false): T {
      if (active) throw Error('Owned sampled-frame operation cannot reenter.');
      resetWork();work.transactions = 1;active = true;sampling = true;sampled = 0;supported = contract === 'declared-entity-writes';
      samplingWork.samples = 1;samplingWork.requestedImmutable = Number(entitySampling === 'immutable-trs');
      selected = entitySampling === 'immutable-trs' && supported ? immutable : detached;
      samplingWork.immutableSamples = Number(selected === immutable);samplingWork.detachedSamples = Number(selected === detached);
      if (entitySampling === 'immutable-trs' && !supported) {
        samplingWork.fallbackSamples = 1;samplingWork.unsupportedTimelineFallbacks = Number(unsupportedTimeline);samplingWork.missingContractFallbacks = Number(!unsupportedTimeline);
      }
      try {
        if (selected === immutable && !cachedPositions) {
          const positions = new Array<Entity['position'] | undefined>(count), rotations = new Array<Entity['rotation'] | undefined>(count), scales = new Array<Entity['scale'] | undefined>(count);
          const poseGenerations = new Float64Array(count).fill(-1), scaleGenerations = new Float64Array(count).fill(-1);
          cachedPositions = positions;cachedRotations = rotations;cachedScales = scales;cachedPoses = poseGenerations;cachedScaleVersions = scaleGenerations;
          samplingWork.cacheAllocations++;samplingWork.cacheReferenceArraysAllocated = 3;samplingWork.cacheGenerationArraysAllocated = samplingWork.cacheGenerationBuffersAllocated = 2;
          samplingWork.cacheReferenceCapacity = count * 3;samplingWork.cacheGenerationBytes = count * 16;
        }
        frame = sample();work.retainedFrameReferences = samplingWork.frameReferences = 1;sampling = false;supported &&= sampled === count && frame.entities.length === count;
        return operation(frame);
      } catch (error) { work.abortedTransactions++;invalidate();throw error; }
      finally { frame = undefined;work.retainedFrameReferences = samplingWork.frameReferences = 0;active = sampling = supported = validApplication = false;pendingCount = 0;selected = detached; }
    },
    beginApplication(entities: readonly Entity[]) {
      if (!active) resetWork();
      pendingCount = 0;validApplication = active && supported && frame?.entities === entities && entities.length === count;
      if (!validApplication) work.fallbackApplications++;
      return validApplication;
    },
    fullFallback() {
      if (!active) resetWork();
      work.fullFallbackApplications++;work.fallbackApplications++;work.validationCountersAvailable = 0;
      validApplication = false;pendingCount = 0;
    },
    canReuse(index: number) {
      work.applicationSlots++;
      return validApplication && !(writable[index]!&1) && validPoses[index] === poses[index] && validScales[index] === scaleVersions[index];
    },
    reused() { work.numericReuses++;work.liveTransformChecks++; },
    validated(index: number) {
      work.numericValidations++;work.liveTransformChecks++;
      if (validApplication && !(writable[index]!&1)) pending[pendingCount++] = index;
    },
    commit() {
      if (!validApplication || !supported) return;
      for (let i = 0; i < pendingCount; i++) {
        const slot = pending[i]!;validPoses[slot] = poses[slot]!;validScales[slot] = scaleVersions[slot]!;
      }
      work.committedSlots += pendingCount;work.commitGenerationWrites += pendingCount * 2;pendingCount = 0;
    },
  };
}
export type EntityTrsValidationJournal3D = ReturnType<typeof createEntityTrsValidationJournal3D>;
