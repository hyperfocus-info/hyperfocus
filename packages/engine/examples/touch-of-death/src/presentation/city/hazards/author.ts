import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

const prefix = 'tod:city:hazards:';
// The district pass owns this site; direct street-hazard reauthoring preserves it.
const streetSite = (id: string) => id.startsWith(prefix) && !id.startsWith(prefix + 'residential-boiler:');
type Vec3 = [number, number, number];

/** Bounded street-side hazards open from visibly damaged equipment, with clear routes around them. */
export function authorCityHazards({ declaration, combat, frequency = 1 }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; frequency?: number }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene?.entities.some(entity => entity.id === 'tod:city:street')) throw Error('City hazards require the moving city.');
  scene.entities = scene.entities.filter(entity => !streetSite(entity.id));
  declaration.materials = declaration.materials.filter(material => !streetSite(material.id));
  for (const [name, baseColor, emissive] of [
    ['fire', [1, .16, .015, .52], [.8, .075, .008]],
    ['water', [.11, .43, .54, .52], [.025, .065, .075]],
  ] as const) declaration.materials.push({ id: prefix + name, shading: 'lit', baseColor: [...baseColor], emissive: [...emissive], alphaMode: 'blend', metallic: .2, roughness: name === 'water' ? .12 : .7, doubleSided: true });
  const add = (id: string, materialId: string, position: Vec3, scale: Vec3, solid = false) => {
    const entity: typeof scene.entities[number] = { id: prefix + id, meshId: 'tod:box', materialId, position, scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } as const } : {}) };
    scene.entities.push(entity);return entity;
  };
  const environment = combat.environment ?? { surfaces: [] };
  environment.surfaces = environment.surfaces.filter(surface => !streetSite(surface.entityId));
  environment.hazards = environment.hazards?.filter(hazard => !streetSite(hazard.entityId)) ?? [];
  const sites: Array<readonly ['fire' | 'flood', number, number, string]> = [['fire', 11, -47, 'fire'], ['flood', -28, 39, 'flood']];
  if (frequency > 1) sites.push(['fire', 14, 15, 'worksite-fire']);
  if (frequency > 1.5) sites.push(['flood', 41.5, 24, 'market-flood']);
  if (frequency < .75) sites.splice(1);
  for (const [kind, x, z, site] of sites) {
    const metal = 'tod:city:steel', orange = 'tod:city:warning';
    const apparatus = add(`${site}:supply`, metal, [x + 2.2, .8, z], [.28, .8, .8], true);
    const top = add(`${site}:supply-top`, orange, [x + 2.2, 1.7, z], [.3, .12, .85]);
    const line = add(`${site}:supply-line`, metal, [x + 2.2, 2.2, z], [.12, .45, .12]);
    const crack = add(`${site}:split`, 'tod:city:fracture', [x + 1.905, .85, z], [.015, .48, .035]);
    const outlet = add(`${site}:outlet`, kind === 'fire' ? prefix + 'fire' : prefix + 'water', [x + 1.98, .3, z], [.12, .16, .35]);
    const debris = [0, 1, 2].map(i => add(`${site}:fragment:${i}`, metal, [x + 1.7 - i * .3, .07, z - .6 + i * .55], [.2, .07, .18]).id);
    environment.surfaces.push({ entityId: apparatus.id, trigger: { kind: 'impact', minSpeed: 4 }, hideIds: [crack.id, top.id, line.id], revealIds: [outlet.id], debrisIds: debris });
    const zone = add(`${site}:zone`, prefix + (kind === 'fire' ? 'fire' : 'water'), [x, kind === 'fire' ? .5 : .16, z], [1.8, kind === 'fire' ? .5 : .16, 1.6]);
    environment.hazards.push(kind === 'fire' ? { entityId: zone.id, activationSurfaceId: apparatus.id, kind, damage: 10, intervalFrames: 30 } : { entityId: zone.id, activationSurfaceId: apparatus.id, kind, groundSpeedScale: .65 });
    // Recessed service grate and painted edging announce equipment without text.
    for (let i = 0; i < 6; i++) add(`${site}:grate:${i}`, metal, [x - 1.55 + i * .62, .025, z], [.035, .025, 1.55]);
    for (const side of [-1, 1]) add(`${site}:edge:${side}`, orange, [x + side * 1.88, .02, z], [.045, .02, 1.68]);
  }
  combat.environment = environment;
  // Existing combat particles retain their allocation; each zone adds twelve bounded particles.
  scene.effectCapacity = Math.max(scene.effectCapacity ?? 0, 512 + environment.hazards.length * 12);
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + scene.effectCapacity), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
