import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Mechanical gates run on every city generation before committing editor state. */
export function validateCityPresentation(declaration: Hyperfocus3DDeclaration, combat: CombatProject3D) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw Error('City presentation requires an active scene.');
  const entities = new Map(scene.entities.map(entity => [entity.id, entity]));
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  const weapons = new Set(combat.interactions?.weapons.map(weapon => weapon.entityId));
  for (const kind of ['directional', 'point', 'spot'] as const) {
    const count = scene.lights.filter(light => light.kind === kind).length, limit = kind === 'point' ? 8 : kind === 'directional' ? 2 : 0;
    if (count > limit) throw Error(`City ${kind} lighting requires ${count} lights; renderer supports ${limit}.`);
  }
  for (const entity of scene.entities) {
    if (!entity.id.startsWith('tod:city:')) continue;
    if (![...entity.position, ...entity.scale].every(Number.isFinite) || entity.scale.some(value => value < 0)) throw Error(`Non-finite or negative city geometry: ${entity.id}.`);
    const material = materials.get(entity.materialId);
    if (!material) throw Error(`Missing city material for ${entity.id}.`);
    const marker = material.id.indexOf(':occlusion-follow:');
    if (marker >= 0) {
      const owner = material.id.slice(0, marker);
      const seen = new Set([entity.id]); let support = owner;
      while (true) {
        const host = entities.get(support), source = host && materials.get(host.materialId);
        if (!host || !source || seen.has(support)) throw Error(`City fade follower ${entity.id} has missing or cyclic support ${support}.`);
        seen.add(support);
        const parent = source.id.indexOf(':occlusion-follow:');
        if (parent >= 0) { support = source.id.slice(0, parent);continue; }
        if (!source.id.endsWith(':occlusion')) throw Error(`City fade follower ${entity.id} has no fading support ${support}.`);
        break;
      }
      for (const layout of combat.arenaLayouts ?? []) for (const variant of layout.variants) {
        const host = variant.props.find(prop => prop.entityId === owner), trim = variant.props.find(prop => prop.entityId === entity.id);
        if (host && !trim) throw Error(`City dressing ${entity.id} is missing from layout ${variant.id}.`);
        if (host && trim) for (let axis = 0; axis < 3; axis++) {
          const original = entity.position[axis]! - entities.get(owner)!.position[axis]!;
          if (Math.abs(trim.position[axis]! - host.position[axis]! - original) > .001) throw Error(`City dressing ${entity.id} separates from support in ${variant.id}.`);
        }
      }
    } else if (!weapons.has(entity.id) && !/^tod:city:(?:weapon|tool):/.test(entity.id) && material.baseColor[3] >= .5
      && entity.position[1] + entity.scale[1] > .4 && Math.max(...entity.scale) >= .5 && !material.id.endsWith(':occlusion')) {
      throw Error(`City geometry ${entity.id} can obscure the fight without a cutaway material.`);
    }
  }
  return { entities: scene.entities.length, lights: scene.lights.length, fadeOwnership: 'valid' as const };
}
