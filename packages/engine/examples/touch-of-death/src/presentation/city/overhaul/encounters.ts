import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Encounter roles refer to authored routes and reusable systems, never a scatter quota. */
export const districtEncounterRules = [
  { district: 'construction', stock: 'worksite', street: 'worksite', roof: 'worksite-roof', test: 'Scaffold movement, demolition and exposed work tools', routes: ['tod:city:freight-lift', 'tod:city:demolition-floor'] },
  { district: 'market', stock: 'market', street: 'east-court', roof: 'east-court-roof', test: 'Counter pressure, disposable props and flooded service access', routes: ['tod:city:expanded:court:2:step:11', 'tod:city:expanded:court:2:lift'] },
  { district: 'residential', stock: 'residential', street: 'west-court', roof: 'west-court-roof', test: 'Doorway commitment, breach escape and boiler awareness', routes: ['tod:city:expanded:court:1:step:11', 'tod:city:expanded:court:1:lift'] },
  { district: 'depot', stock: 'depot', street: 'south-court', roof: 'south-court-roof', test: 'Traffic timing, platform changes and loading cover', routes: ['tod:city:expanded:court:4:step:11', 'tod:city:expanded:court:4:lift'] },
  { district: 'utility', stock: 'utility', street: 'north-court', roof: 'north-court-roof', test: 'Service machinery, fire escape and observation access', routes: ['tod:city:expanded:court:3:step:11', 'tod:city:expanded:court:3:lift'] },
] as const;

const prefix = 'tod:city:hazards:residential-boiler:';

/** Inspect the actual selected pools and worst arrangement access, including height. */
export function auditDistrictEncounters({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const entities = new Map(scene.entities.map(entity => [entity.id, entity]));
  return districtEncounterRules.flatMap(rule => [rule.street, rule.roof].map(startId => {
    const start = combat.spawns?.find(start => start.id === startId), stock = combat.weaponLayouts?.find(layout => layout.id === rule.stock);
    if (!start || !stock) throw Error(`Missing district encounter ${startId}.`);
    const p = start.positions[0]!;
    const distance = (q: readonly number[]) => Math.hypot(p[0] - q[0]!, p[2] - q[2]!, (p[1] - q[1]!) * 2);
    const worstPositionDistance = (entityId: string) => {
      const positions = combat.arenaLayouts?.flatMap(layout => layout.variants.flatMap(variant => variant.props.filter(prop => prop.entityId === entityId).map(prop => prop.position))) ?? [];
      if (!positions.length && entities.has(entityId)) positions.push(entities.get(entityId)!.position);
      return positions.length ? Math.max(...positions.map(distance)) : Infinity;
    };
    return {
      district: rule.district, startId, test: rule.test,
      stockDistance: Math.max(...stock.variants.map(variant => Math.min(...variant.props.map(prop => distance(prop.position))))),
      destructibleDistance: Math.min(...(combat.environment?.surfaces.map(surface => worstPositionDistance(surface.entityId)) ?? [])),
      movingHazardDistance: Math.min(...scene.entities.filter(entity => entity.physics && entity.animation).map(entity => distance(entity.position))),
      routes: rule.routes.filter(id => entities.has(id)),
      roofRequiresDescent: p[1] > 5 && stock.variants.some(variant => variant.props.every(prop => prop.position[1] < 5)),
    };
  }));
}

/** Residential equipment supplies one local physical cause using the existing bounded fire system. */
export function authorResidentialBoiler({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  const environment = combat.environment ??= { surfaces: [] };
  environment.surfaces = environment.surfaces.filter(surface => !surface.entityId.startsWith(prefix));
  environment.hazards = environment.hazards?.filter(hazard => !hazard.entityId.startsWith(prefix)) ?? [];
  const add = (id: string, material: string, position: [number, number, number], scale: [number, number, number], solid = false) => {
    const entityId = prefix + id;
    scene.entities.push({ id: entityId, meshId: 'tod:box', materialId: `tod:city:${material}`, position, scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static' as const, shape: 'box' as const, gravityScale: 0, continuous: false } } : {}) });
    return entityId;
  };
  const x = -53.5, z = -14.5;
  const supply = add('supply', 'steel', [x + 2.2, .8, z], [.28, .8, .8], true);
  const top = add('supply-top', 'warning', [x + 2.2, 1.7, z], [.3, .12, .85]);
  const pipe = add('supply-line', 'steel', [x + 2.2, 2.2, z], [.12, .45, .12]);
  const split = add('split', 'fracture', [x + 1.905, .85, z], [.015, .48, .035]);
  const outlet = add('outlet', 'hazards:fire', [x + 1.98, .3, z], [.12, .16, .35]);
  const debrisIds = [0, 1, 2].map(i => add(`fragment:${i}`, 'steel', [x + 1.7 - i * .3, .07, z - .6 + i * .55], [.2, .07, .18]));
  environment.surfaces.push({ entityId: supply, trigger: { kind: 'impact', minSpeed: 4 }, hideIds: [top, pipe, split], revealIds: [outlet], debrisIds });
  const zone = add('zone', 'hazards:fire', [x, .5, z], [1.8, .5, 1.6]);
  environment.hazards.push({ entityId: zone, activationSurfaceId: supply, kind: 'fire', damage: 10, intervalFrames: 30 });
  for (const side of [-1, 1]) add(`edge:${side}`, 'warning', [x + side * 1.88, .02, z], [.045, .02, 1.68]);
  scene.effectCapacity = Math.max(scene.effectCapacity ?? 0, 512 + environment.hazards.length * 12);
}
