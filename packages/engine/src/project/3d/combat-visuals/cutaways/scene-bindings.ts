type RecordId = { id: string };
type SceneRecords = { entities?: readonly RecordId[]; materials?: readonly RecordId[] };

/** Optional caller-owned cumulative counters. Validation visits count actual
 * comparisons; construction counts are separate because a cache miss builds all slots.
 */
export type CutawayTopologyWork3D = {
  calls: number; validationEntityVisits: number; validationMaterialVisits: number;
  builds: number; builtEntities: number; builtMaterials: number;
};
export function createCutawayTopologyWork3D(): CutawayTopologyWork3D {
  return { calls: 0, validationEntityVisits: 0, validationMaterialVisits: 0, builds: 0, builtEntities: 0, builtMaterials: 0 };
}

/** Topology only: indices never retain an evaluated frame or its mutable records. */
type CutawaySceneBindings = {
  entityIds: string[]; materialIds: string[]; authored: Array<string | undefined>;
  entities: Map<string, number>; materials: Map<string, number>;
  solids: Array<{ slot: number; owner: string }>;
  followers: Map<string, number[]>;
  followerMaterials: Map<string, { slot: number; owner: string; piece: string }>;
  limbs: number[]; cues: number[]; edges: number[]; props: number[]; batchEntities: number[];
  fading: Set<string>;
};
const cache = new WeakMap<ReadonlyMap<string, string>, CutawaySceneBindings>();
const empty: readonly RecordId[] = [];

/** Validate identity/order and authored associations; pose/look changes need no rediscovery. */
export function cutawaySceneBindings(frame: SceneRecords, authoredIds?: ReadonlyMap<string, string>, work?: CutawayTopologyWork3D): CutawaySceneBindings {
  if (work) work.calls++;
  const entities = frame.entities ?? empty, materials = frame.materials ?? empty;
  const previous = authoredIds && cache.get(authoredIds);
  if (previous && matches(previous, entities, materials, authoredIds!, work)) return previous;
  if (work) { work.builds++;work.builtEntities += entities.length;work.builtMaterials += materials.length; }
  const bindings: CutawaySceneBindings = {
    entityIds: entities.map(entity => entity.id), materialIds: materials.map(material => material.id),
    authored: entities.map(entity => authoredIds?.get(entity.id)),
    entities: new Map(entities.map((entity, slot) => [entity.id, slot])), materials: new Map(materials.map((material, slot) => [material.id, slot])),
    solids: [], followers: new Map(), followerMaterials: new Map(), limbs: [], cues: [], edges: [], props: [], batchEntities: [], fading: new Set(),
  };
  for (let slot = 0; slot < materials.length; slot++) {
    const id = materials[slot]!.id, marker = id.indexOf(':occlusion-follow:');
    if (id.endsWith(':occlusion')) {
      const owner = id.slice(0, -10);bindings.solids.push({ slot, owner });
      if (bindings.entities.has(owner) && authoredIds?.get(owner) === id) bindings.fading.add(owner);
    }
    if (marker >= 0) bindings.followerMaterials.set(id, { slot, owner: id.slice(0, marker), piece: id.slice(marker + ':occlusion-follow:'.length) });
  }
  for (let slot = 0; slot < entities.length; slot++) {
    const id = entities[slot]!.id, material = bindings.authored[slot];
    if (/:(head|hair|face|belt|(?:left|right)-(?:arm|forearm|hand|thigh|shin|boot))$/.test(id)) bindings.limbs.push(slot);
    if (/:(guard-shell|impact|armor|(?:shield|parry|spark|trail|influence):\d+)$/.test(id)) bindings.cues.push(slot);
    if (/:occlusion-edge:\d+$/.test(id)) bindings.edges.push(slot);
    if (id.startsWith('tod:city:prop:') || id.startsWith('tod:city:overhaul:') || id.startsWith('tod:city:finish:') || id.startsWith('tod:city:neighborhood:')) bindings.props.push(slot);
    if (material?.startsWith('tod:city:') && /:occlusion(?:$|-follow:)/.test(material)) bindings.batchEntities.push(slot);
    if (!material?.includes(':occlusion-follow:')) continue;
    const group = bindings.followers.get(material);
    if (group) group.push(slot);else bindings.followers.set(material, [slot]);
    if (bindings.materials.has(material)) bindings.fading.add(id);
  }
  if (authoredIds) cache.set(authoredIds, bindings);
  return bindings;
}

function matches(binding: CutawaySceneBindings, entities: readonly RecordId[], materials: readonly RecordId[], authoredIds: ReadonlyMap<string, string>, work?: CutawayTopologyWork3D) {
  if (entities.length !== binding.entityIds.length || materials.length !== binding.materialIds.length) return false;
  for (let slot = 0; slot < entities.length; slot++) {
    const id = entities[slot]!.id;
    if (binding.entityIds[slot] !== id || binding.authored[slot] !== authoredIds.get(id)) {
      if (work) work.validationEntityVisits += slot + 1;
      return false;
    }
  }
  if (work) work.validationEntityVisits += entities.length;
  for (let slot = 0; slot < materials.length; slot++) {
    if (binding.materialIds[slot] !== materials[slot]!.id) {
      if (work) work.validationMaterialVisits += slot + 1;
      return false;
    }
  }
  if (work) work.validationMaterialVisits += materials.length;
  return true;
}
