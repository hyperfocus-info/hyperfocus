import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import type { cutawaySceneBindings } from './scene-bindings.ts';

type Bindings = ReturnType<typeof cutawaySceneBindings>;
type Frame = Pick<Hyperfocus3DEvaluatedFrame, 'entities' | 'materials'>;
type Entity = Frame['entities'][number];
type Material = Frame['materials'][number];
type Apply = (material: Material, owner: Entity | undefined, source: Material | undefined,
  piece: Entity | undefined, pieces: readonly number[] | undefined) => void;
export type FollowerPlanWork3D = {
  followerCalls: number; followerApplications: number;
  followerPlanBuilds: number; followerPlanMapLookups: number; followerPlanEntityLookups: number; followerPlanMaterialLookups: number; followerPlanDependencyVisits: number;
  followerPlanDependencyChecks: number; followerPlanArrayAllocations: number; followerPlanMapAllocations: number;
  followerPlanSlotLoads: number; followerPlanStorageBytes: number; followerPlanPeakStorageBytes: number;
  followerPlanBuildTypedBytes: number; followerPlanPieceReferences: number; followerPlanUnboundOwners: number; followerPlanTopologyReferences: number;
  followerPlanRetainedFrameReferences: number; followerPlanRetainedLookReferences: number;
};

/** Static dependency traversal only. The caller supplies current validated
 * bindings and keeps topology/authored associations stable during apply. Live
 * poses, visibility, looks, resource checks and fade/query work stay in applyOne.
 * No frame, material or look is retained. One owner; callbacks must not reenter.
 * Work is borrowed until the next apply/clear. */
export function createFollowerPlan3D() {
  let binding: Bindings | undefined, authored: ReadonlyMap<string, string> | undefined;
  let materials = new Int32Array(0), owners = new Int32Array(0), sources = new Int32Array(0), pieces = new Int32Array(0);
  let shared: Array<readonly number[] | undefined> = [];
  let unboundOwners: Array<{ id: string; material: string | undefined }> = [];
  let cycle: string | undefined, applying = false, peak = 0, pieceReferences = 0;
  const work: FollowerPlanWork3D = {
    followerCalls: 0, followerApplications: 0, followerPlanBuilds: 0, followerPlanMapLookups: 0, followerPlanEntityLookups: 0, followerPlanMaterialLookups: 0, followerPlanDependencyVisits: 0,
    followerPlanDependencyChecks: 0, followerPlanArrayAllocations: 0, followerPlanMapAllocations: 0, followerPlanSlotLoads: 0,
    followerPlanStorageBytes: 0, followerPlanPeakStorageBytes: 0, followerPlanBuildTypedBytes: 0, followerPlanPieceReferences: 0, followerPlanUnboundOwners: 0, followerPlanTopologyReferences: 0,
    followerPlanRetainedFrameReferences: 0, followerPlanRetainedLookReferences: 0,
  };
  const keys = Object.keys(work), counters: Record<string, number> = work;
  const resetWork = () => { for (const key of keys) counters[key] = 0; };
  function rebuild(next: Bindings, ids: ReadonlyMap<string, string> | undefined) {
    const entries = [...next.followerMaterials.entries()], count = entries.length;
    if (count > 0x7fffffff) throw new RangeError('Follower plan capacity exceeded');
    const indices = new Map(entries.map(([id], index) => [id, index]));
    const ownerSlots = new Int32Array(count), sourceSlots = new Int32Array(count), pieceSlots = new Int32Array(count), dependencies = new Int32Array(count);
    const groups: Array<readonly number[] | undefined> = [], unresolved: typeof unboundOwners = [];
    // Includes Map iterator entry tuples and the temporary index-map tuples.
    work.followerPlanMapAllocations++;work.followerPlanArrayAllocations += 11 + count * 2;
    for (let index = 0; index < count; index++) {
      const [id, follower] = entries[index]!;
      const owner = next.entities.get(follower.owner), authoredId = ids?.get(follower.owner);
      const source = next.materials.get(authoredId ?? `${follower.owner}:occlusion`), group = next.followers.get(id);
      work.followerPlanMapLookups += ids ? 4 : 3;
      work.followerPlanEntityLookups++;work.followerPlanMaterialLookups++;
      ownerSlots[index] = owner ?? -1;sourceSlots[index] = source ?? -1;groups.push(group);
      if (owner === undefined) unresolved.push({ id: follower.owner, material: authoredId });
      pieceSlots[index] = group ? -1 : next.entities.get(follower.piece) ?? -1;
      if (!group) { work.followerPlanMapLookups++;work.followerPlanEntityLookups++; }
      dependencies[index] = source === undefined ? -1 : indices.get(next.materialIds[source]!) ?? -1;
      if (source !== undefined) work.followerPlanMapLookups++;
    }
    const state = new Uint8Array(count), order: number[] = [], stack: number[] = [];
    let failed: string | undefined;
    // Stable iterative DFS matches the reference's first-encounter order. A
    // cycle is a terminal plan item: earlier acyclic callbacks still execute.
    roots: for (let root = 0; root < count; root++) {
      if (state[root] === 2) continue;
      stack.push(root);
      while (stack.length) {
        const index = stack[stack.length - 1]!;
        if (!state[index]) { state[index] = 1;work.followerPlanDependencyVisits++; }
        const dependency = dependencies[index]!;
        if (dependency >= 0 && state[dependency] !== 2) {
          if (state[dependency] === 1) { failed = entries[dependency]![0];break roots; }
          stack.push(dependency);continue;
        }
        state[index] = 2;order.push(index);stack.pop();
      }
    }
    materials = new Int32Array(order.length);owners = new Int32Array(order.length);
    sources = new Int32Array(order.length);pieces = new Int32Array(order.length);shared = [];
    work.followerPlanArrayAllocations += 5;
    work.followerPlanBuildTypedBytes += count * 17 + order.length * 16;
    for (let index = 0; index < order.length; index++) {
      const original = order[index]!;
      materials[index] = entries[original]![1].slot;owners[index] = ownerSlots[original]!;
      sources[index] = sourceSlots[original]!;pieces[index] = pieceSlots[original]!;shared.push(groups[original]);
    }
    pieceReferences = shared.reduce((count, value) => count + Number(!!value), 0);
    binding = next;authored = ids;unboundOwners = unresolved;cycle = failed;work.followerPlanBuilds++;
  }
  return {
    apply(frame: Frame, next: Bindings, ids: ReadonlyMap<string, string> | undefined, applyOne: Apply): Readonly<FollowerPlanWork3D> {
      if (applying) throw new Error('Follower plan is not reentrant');
      applying = true;
      try {
        resetWork();
        let valid = binding === next && authored === ids;
        if (valid) for (const owner of unboundOwners) {
          work.followerPlanDependencyChecks++;
          if (ids) work.followerPlanMapLookups++;
          if (ids?.get(owner.id) !== owner.material) { valid = false;break; }
        }
        if (!valid) rebuild(next, ids);
        work.followerPlanStorageBytes = materials.byteLength + owners.byteLength + sources.byteLength + pieces.byteLength;
        peak = Math.max(peak, work.followerPlanStorageBytes);work.followerPlanPeakStorageBytes = peak;
        work.followerPlanPieceReferences = pieceReferences;
        work.followerPlanUnboundOwners = unboundOwners.length;work.followerPlanTopologyReferences = 1 + Number(!!ids);
        for (let index = 0; index < materials.length; index++) {
          const material = frame.materials[materials[index]!]!, owner = owners[index]!, source = sources[index]!, piece = pieces[index]!;
          work.followerPlanSlotLoads += 4;work.followerCalls++;work.followerApplications++;
          applyOne(material, owner < 0 ? undefined : frame.entities[owner], source < 0 ? undefined : frame.materials[source],
            piece < 0 ? undefined : frame.entities[piece], shared[index]);
        }
        if (cycle !== undefined) throw Error(`Cyclic scenery fade ownership: ${cycle}.`);
        return work;
      } finally { applying = false; }
    },
    clear() {
      if (applying) throw new Error('Follower plan is applying');
      binding = authored = undefined;cycle = undefined;unboundOwners = [];shared = [];
      materials = new Int32Array(0);owners = new Int32Array(0);sources = new Int32Array(0);pieces = new Int32Array(0);
      peak = pieceReferences = 0;resetWork();
    },
  };
}
