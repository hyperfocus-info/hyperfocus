import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import type { MaterialLook3D } from '../../../../render/materials/3d-presets.ts';
import type { cutawaySceneBindings } from './scene-bindings.ts';

type Bindings = ReturnType<typeof cutawaySceneBindings>;
type Frame = Pick<Hyperfocus3DEvaluatedFrame, 'entities' | 'materials'>;
type Groups = readonly (readonly string[])[];
type SameLook = (a: MaterialLook3D, b: MaterialLook3D) => boolean;
export type MaterialAliasPlanWork3D = {
  aliasGroupVisits: number; aliasMaterialVisits: number; aliasLookComparisons: number; aliasEntries: number;
  aliasMapBuilds: number; aliasRepresentativeArrays: number; aliasEntityVisits: number; aliasWrites: number;
  aliasMaterialMapLookups: number; aliasMapLookups: number; aliasMapSets: number; aliasDeleteCalls: number;
  aliasPlanBuilds: number; aliasPlanMaterialLookups: number; aliasPlanArrayAllocations: number;
  aliasSlotLoads: number; aliasSlotsCleared: number; aliasStorageBytes: number; aliasPeakStorageBytes: number;
  aliasTopologyOwnerReferences: number; aliasRetainedFrameReferences: number; aliasRetainedLookReferences: number;
};

/** Numeric topology only. The caller must supply the current validated bindings
 * and keep topology/groups stable for this synchronous call. Current looks,
 * opacity and variants are always read again; the supplied exact comparator is
 * authoritative and must not mutate inputs. No evaluated frame, material look or live resource is retained.
 * One owner, non-reentrant. Work is borrowed until the next apply/clear. */
export function createMaterialAliasPlan3D() {
  let binding: Bindings | undefined, grouping: Groups | undefined;
  let offsets = new Int32Array(0), members = new Int32Array(0), authored = new Int32Array(0);
  let representatives = new Int32Array(0), aliases = new Int32Array(0);
  let applying = false;
  let peakStorageBytes = 0;
  const work: MaterialAliasPlanWork3D = {
    aliasGroupVisits: 0, aliasMaterialVisits: 0, aliasLookComparisons: 0, aliasEntries: 0,
    aliasMapBuilds: 0, aliasRepresentativeArrays: 0, aliasEntityVisits: 0, aliasWrites: 0,
    aliasMaterialMapLookups: 0, aliasMapLookups: 0, aliasMapSets: 0, aliasDeleteCalls: 0,
    aliasPlanBuilds: 0, aliasPlanMaterialLookups: 0, aliasPlanArrayAllocations: 0,
    aliasSlotLoads: 0, aliasSlotsCleared: 0, aliasStorageBytes: 0, aliasPeakStorageBytes: 0,
    aliasTopologyOwnerReferences: 0, aliasRetainedFrameReferences: 0, aliasRetainedLookReferences: 0,
  };
  const workKeys = Object.keys(work), counters: Record<string, number> = work;
  const resetWork = () => { for (const key of workKeys) counters[key] = 0; };
  function rebuild(next: Bindings, groups: Groups, materialCount: number) {
    let count = 0, maximum = 0;
    for (const group of groups) { count += group.length;maximum = Math.max(maximum, group.length); }
    if (!Number.isSafeInteger(count) || count > 0x7fffffff || materialCount > 0x7fffffff) throw new RangeError('Material alias plan capacity exceeded');
    offsets = new Int32Array(groups.length + 1);members = new Int32Array(count);
    authored = new Int32Array(next.batchEntities.length);representatives = new Int32Array(maximum);aliases = new Int32Array(materialCount);
    let cursor = 0;
    for (let group = 0; group < groups.length; group++) {
      offsets[group] = cursor;
      for (const id of groups[group]!) { members[cursor++] = next.materials.get(id) ?? -1;work.aliasPlanMaterialLookups++; }
    }
    offsets[groups.length] = cursor;
    for (let index = 0; index < next.batchEntities.length; index++) {
      const id = next.authored[next.batchEntities[index]!]!;
      authored[index] = next.materials.get(id) ?? -1;work.aliasPlanMaterialLookups++;
    }
    binding = next;grouping = groups;work.aliasPlanBuilds++;work.aliasPlanArrayAllocations += 5;
  }
  return {
    apply(frame: Frame, next: Bindings, groups: Groups, sameLook: SameLook): Readonly<MaterialAliasPlanWork3D> {
      if (applying) throw new Error('Material alias plan is not reentrant');
      applying = true;
      try {
        resetWork();
        if (binding !== next || grouping !== groups) rebuild(next, groups, frame.materials.length);
        work.aliasStorageBytes = offsets.byteLength + members.byteLength + authored.byteLength + representatives.byteLength + aliases.byteLength;
        peakStorageBytes = Math.max(peakStorageBytes, work.aliasStorageBytes);
        work.aliasPeakStorageBytes = peakStorageBytes;work.aliasTopologyOwnerReferences = 2;
        aliases.fill(-1);work.aliasSlotsCleared = aliases.length;work.aliasGroupVisits = groups.length;
        for (let group = 0; group < groups.length; group++) {
          let representativeCount = 0;
          const end = offsets[group + 1]!;work.aliasSlotLoads += 2;
          for (let index = offsets[group]!; index < end; index++) {
            const slot = members[index]!;work.aliasSlotLoads++;work.aliasMaterialVisits++;
            const material = slot < 0 ? undefined : frame.materials[slot];
            if (!material || material.look.opacity !== 1) continue;
            let shared = -1;
            for (let previous = 0; previous < representativeCount; previous++) {
              const candidate = representatives[previous]!;work.aliasSlotLoads++;work.aliasLookComparisons++;
              if (sameLook(frame.materials[candidate]!.look, material.look)) { shared = candidate;break; }
            }
            if (shared >= 0) { aliases[slot] = shared;work.aliasEntries++; }
            else representatives[representativeCount++] = slot;
          }
        }
        work.aliasEntityVisits = next.batchEntities.length;
        for (let index = 0; index < next.batchEntities.length; index++) {
          const entity = frame.entities[next.batchEntities[index]!]!;
          delete entity.renderMaterialId;work.aliasDeleteCalls++;
          if (!entity.variantId) {
            const slot = authored[index]!;work.aliasSlotLoads++;
            if (slot < 0) continue;
            const target = aliases[slot]!;work.aliasSlotLoads++;
            const shared = target < 0 ? undefined : frame.materials[target]?.id;
            if (shared) { entity.renderMaterialId = shared;work.aliasWrites++; }
          }
        }
        return work;
      } finally { applying = false; }
    },
    clear() {
      if (applying) throw new Error('Material alias plan is applying');
      binding = grouping = undefined;
      offsets = new Int32Array(0);members = new Int32Array(0);authored = new Int32Array(0);
      representatives = new Int32Array(0);aliases = new Int32Array(0);peakStorageBytes = 0;resetWork();
    },
  };
}
