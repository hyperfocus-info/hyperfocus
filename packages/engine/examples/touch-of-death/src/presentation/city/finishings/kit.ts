import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Vec3 = [number, number, number];

/** Bounded civilian dressing follows the exact authored host through every layout. */
export function createCityFinishKit({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const entities = new Map(scene.entities.map(entity => [entity.id, entity]));
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  const added: string[] = [];
  function materialFor(role: string, host?: string) {
    const material = materials.get(`tod:city:style:${role}`);
    if (!material) throw Error(`Missing city finish material ${role}.`);
    const materialId = host ? `${host}:occlusion-follow:${material.id}` : material.id;
    if (!materials.has(materialId)) {
      const follower = { ...structuredClone(material), id: materialId, alphaMode: 'blend' as const };
      declaration.materials.push(follower);materials.set(materialId, follower);
    }
    return materialId;
  }
  function box(name: string, role: string, position: Vec3, scale: Vec3, host?: string) {
    const id = `tod:city:finish:${name}`;
    if (entities.has(id)) throw Error(`Duplicate city finish ${id}.`);
    const owner = host ? entities.get(host) : undefined;
    if (host && !owner) throw Error(`Missing city finish host ${host}.`);
    const materialId = materialFor(role, owner?.id);
    const at: Vec3 = owner ? [owner.position[0] + position[0], owner.position[1] + position[1], owner.position[2] + position[2]] : [...position];
    const entity = { id, meshId: 'tod:box', materialId, position: at, scale, rotationY: 0 };
    scene.entities.push(entity);entities.set(id, entity);added.push(id);
    if (owner) {
      for (const layout of combat.arenaLayouts ?? []) for (const variant of layout.variants) {
        const placement = variant.props.find(prop => prop.entityId === owner.id);
        if (placement) variant.props.push({ entityId: id, position: [placement.position[0] + position[0], placement.position[1] + position[1], placement.position[2] + position[2]] });
      }
      const surface = combat.environment?.surfaces.find(surface => surface.entityId === owner.id);
      if (surface) surface.hideIds = [...surface.hideIds ?? [], id];
    }
    return entity;
  }
  return { box, entities, added, materialFor };
}

export type CityFinishKit = ReturnType<typeof createCityFinishKit>;
