import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** A terrain rebuild does not own the independently authored weapon inventory. */
export function retainCityInventory(declaration: Hyperfocus3DDeclaration, combat: CombatProject3D, wasCompact = false) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const weapons = structuredClone(combat.interactions?.weapons ?? []);
  const ids = new Set(weapons.map(weapon => weapon.entityId));
  const belongs = (id: string) => ids.has(id) || weapons.some(weapon => id.startsWith(weapon.entityId + ':'));
  const entities = structuredClone(scene.entities.filter(entity => belongs(entity.id)));
  const materials = structuredClone(declaration.materials.filter(material => entities.some(entity => entity.materialId === material.id)));
  const layouts = structuredClone(combat.weaponLayouts);
  const stations = structuredClone(scene.entities.filter(entity => entity.id.startsWith('tod:city:neighborhood:station:') && entity.physics));
  if (wasCompact) {
    for (const entity of entities) { entity.position[0] /= .9;entity.position[2] /= .9; }
    for (const district of layouts ?? []) for (const variant of district.variants) for (const prop of variant.props) { prop.position[0] /= .9;prop.position[2] /= .9; }
    for (const station of stations) { station.position[0] /= .9;station.position[2] /= .9;station.scale[0] /= .9;station.scale[2] /= .9; }
  }
  function restore() {
    if (!layouts) return;
    const live = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
    // The full catalog supersedes the older pair of worksite tools. Existing
    // catalog transforms, wear accessories and material bindings remain authored.
    const retained = new Map(entities.map(entity => [entity.id, entity]));
    live.entities = live.entities.filter(entity => !entity.id.startsWith('tod:city:tool:')).map(entity => {
      const previous = retained.get(entity.id);
      if (previous) { retained.delete(entity.id);return previous; }
      return entity;
    });
    live.entities.push(...retained.values());
    for (const material of materials) {
      const slot = declaration.materials.findIndex(current => current.id === material.id);
      if (slot >= 0) declaration.materials[slot] = material;else declaration.materials.push(material);
    }
    combat.interactions = { ...combat.interactions, weapons };
    combat.weaponLayouts = layouts;
    for (const spawn of combat.spawns ?? []) spawn.props = spawn.props?.filter(prop => !prop.entityId.startsWith('tod:city:tool:') && !ids.has(prop.entityId));
  }
  function rebind() {
    if (!layouts) return;
    const live = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
    const mounted = (position: [number, number, number]) => {
      const old = stations.find(station => (Math.abs(position[1] - station.position[1] - station.scale[1] - .03) < .002
        || Math.abs(position[1] - station.position[1] - station.scale[1] - .15) < .002)
        && Math.abs(position[0] - station.position[0]) <= station.scale[0] + .001
        && Math.abs(position[2] - station.position[2]) <= station.scale[2] + .001);
      if (!old) return;
      const next = live.entities.find(entity => entity.id === old.id);
      if (!next) throw Error(`Mounted city stock lost its support ${old.id}.`);
      for (const axis of [0, 1, 2]) {
        const delta = next.position[axis]! - old.position[axis]!;
        // Compact normalization can leave a sub-picometre round-trip residue;
        // do not turn an unchanged table into a new portable stock coordinate.
        if (Math.abs(delta) > .00000001) position[axis]! += delta;
      }
    };
    for (const district of combat.weaponLayouts ?? []) for (const variant of district.variants) for (const prop of variant.props) mounted(prop.position);
    for (const entity of live.entities) if (belongs(entity.id)) mounted(entity.position);
  }
  return { restore, rebind };
}
