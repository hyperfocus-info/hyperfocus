import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import type { CityGenerationSettings } from './settings.ts';

/** Stable local sampling never consumes the combat or weapon-selection random stream. */
export function citySample(seed: number, id: string) {
  let value = seed ^ 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return (value >>> 0) / 4294967296;
}

export function finishCityGeneration({ declaration, combat, settings }: {
  declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; settings: CityGenerationSettings;
}) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  // Density changes disposable scenery, never weapon stock, support or escape routes.
  const removed = new Set((combat.environment?.surfaces ?? []).filter(surface => (surface.entityId.startsWith('tod:city:prop:') || surface.entityId.startsWith('tod:city:overhaul:')) && citySample(settings.seed, surface.entityId) >= settings.density).flatMap(surface => [surface.entityId, ...surface.debrisIds ?? []]));
  if (combat.environment) combat.environment.surfaces = combat.environment.surfaces.filter(surface => !removed.has(surface.entityId));
  scene.entities = scene.entities.filter(entity => !removed.has(entity.id));
  for (const district of combat.arenaLayouts ?? []) for (const variant of district.variants) variant.props = variant.props.filter(prop => !removed.has(prop.entityId));
  const used = new Set(declaration.scenes.flatMap(scene => scene.entities.map(entity => entity.materialId)));
  declaration.materials = declaration.materials.filter(material => !material.id.startsWith('tod:city:prop:') || used.has(material.id));
  for (const entity of scene.entities) {
    if (!entity.id.startsWith('tod:city:traffic:') || entity.animation?.kind !== 'ping-pong' || entity.animation.travelSeconds === undefined) continue;
    const motion = entity.animation;
    if (motion.turnRadius !== undefined) {
      const rate = Math.max(.85, Math.min(1.4, 1 / Math.sqrt(settings.hazardFrequency)));
      motion.periodSeconds *= rate;motion.travelSeconds! *= rate;continue;
    }
    motion.periodSeconds = motion.travelSeconds! * 2 + Math.max(0, motion.periodSeconds - motion.travelSeconds! * 2) / settings.hazardFrequency;
  }
  if (settings.districtSize === 'compact') compactCity(declaration, combat);
  const entities = declaration.scenes.reduce((sum, scene) => sum + scene.entities.length + (scene.effectCapacity ?? 0), 0);
  const bodies = scene.entities.filter(entity => entity.physics);
  const moving = bodies.filter(entity => entity.animation || entity.physics!.type !== 'static');
  for (const [label, count, limit] of [['entities including effects', entities, settings.maxEntities], ['physics bodies', bodies.length, settings.maxPhysicsBodies], ['moving bodies', moving.length, settings.maxMovingBodies]] as const) {
    if (count > limit) throw new Error(`City requires ${count} ${label}; budget is ${limit}. Reduce density or increase that budget.`);
  }
  declaration.budgets = { ...declaration.budgets, entities: settings.maxEntities, materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}

/** Compress horizontal architecture by ten percent; fighter and item dimensions stay intact. */
function compactCity(declaration: Hyperfocus3DDeclaration, combat: CombatProject3D) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const weapons = new Set(combat.interactions?.weapons.map(weapon => weapon.entityId) ?? []);
  const actors = new Set(combat.fighters.map(fighter => fighter.entityId));
  const point = (p: [number, number, number]) => { p[0] *= .9;p[2] *= .9; };
  for (const entity of scene.entities) {
    if (!entity.id.startsWith('tod:city:') && !actors.has(entity.id)) continue;
    point(entity.position);
    if (!actors.has(entity.id) && !weapons.has(entity.id) && !entity.id.startsWith('tod:city:weapon:') && !entity.id.startsWith('tod:city:tool:')) { entity.scale[0] *= .9;entity.scale[2] *= .9; }
    if (entity.animation?.kind === 'ping-pong') {
      point(entity.animation.offset);
      if (entity.animation.turnPivot) point(entity.animation.turnPivot);
      if (entity.animation.turnRadius !== undefined) entity.animation.turnRadius *= .9;
    }
  }
  for (const spawn of combat.spawns ?? []) { for (const position of spawn.positions) point(position);for (const prop of spawn.props ?? []) point(prop.position); }
  for (const district of combat.weaponLayouts ?? []) for (const variant of district.variants) for (const prop of variant.props) point(prop.position);
  for (const district of combat.arenaLayouts ?? []) for (const variant of district.variants) for (const prop of variant.props) point(prop.position);
  for (const light of scene.lights) if (light.id.startsWith('tod:city:encounter-light:') && light.position) point(light.position);
}
