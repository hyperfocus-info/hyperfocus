import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cookPrimitiveModel } from '@hyperfocus/engine/assets/model-cooking';

const prefix = 'tod:city:traffic:';
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** A fixed folded panel replaces fragmentation; tilts are baked into the portable mesh. */
export function cookCityWreckPanel() {
  return cookPrimitiveModel({ label: 'Buckled steel panel with lifted corner', parts: [
    ['box', -.46, .08, 0, .5, .06, .92, -.12, 0, -.16],
    ['box', .43, .22, .07, .48, .06, .87, .19, -.06, .24],
  ] });
}

function wreckDetails(body: Entity): Entity[] {
  const part = (name: string, materialId: string, position: Entity['position'], scale: Entity['scale'], rotationY = 0, meshId = 'tod:box'): Entity => ({
    id: body.id.replace(/:body$/, `:wreck-mark:${name}`), meshId, materialId,
    position: [body.position[0] + position[0], position[1], body.position[2] + position[2]], scale, rotationY, animation: structuredClone(body.animation),
  });
  if (body.id.includes(':car-')) return [
    part('hood', body.materialId, [.04, 1.39, 1.49], [.88, .035, .58], .08),
    part('roof', body.materialId, [-.04, 2.018, -.25], [.72, .035, .79], -.09),
    part('bumper', 'tod:city:vehicle-metal', [.04, .72, 2.22], [.78, .07, .09], -.16),
    part('scrape-left', 'tod:city:vehicle-metal', [-.958, .89, .58], [.018, .07, .46], -.02),
    part('scrape-right', 'tod:city:vehicle-rubber', [.958, .88, -.48], [.018, .09, .54], .02),
  ];
  return [-1, 1].map(side => part(String(side), 'tod:city:steel', [0, body.position[1], side * (body.scale[2] + .025)], [body.scale[0] * .7, body.scale[1] * .28, .03]));
}
/** Cars and bus disable into solid wrecks. The second east car has a half-circuit headway. */
export function authorCityVehicleWrecks(options: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = options.declaration.scenes.find(scene => scene.id === options.declaration.activeSceneId), environment = options.combat.environment;
  if (!scene || !environment) return;
  const follow = prefix + 'car-east-follow', original = prefix + 'car-east';
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(follow + ':') && !entity.id.includes(':wreck-mark:'));
  options.declaration.materials = options.declaration.materials.filter(material => !material.id.startsWith(follow + ':'));
  for (const entity of scene.entities.filter(entity => entity.id.startsWith(original + ':') && entity.animation)) {
    const copy = structuredClone(entity);copy.id = copy.id.replace(original, follow);
    if (copy.animation?.kind === 'ping-pong') copy.animation.phase = (copy.animation.phase + .5) % 1;
    const source = options.declaration.materials.find(material => material.id === copy.materialId);
    if (source && source.id.includes(original)) { const material = structuredClone(source);material.id = material.id.replaceAll(original, follow);if (!options.declaration.materials.some(existing => existing.id === material.id)) options.declaration.materials.push(material);copy.materialId = material.id; }
    scene.entities.push(copy);
  }
  environment.traffic = environment.traffic?.filter(traffic => traffic.entityId !== follow + ':body');
  const traffic = environment.traffic?.find(traffic => traffic.entityId === original + ':body');if (traffic) environment.traffic!.push({ ...traffic, entityId: follow + ':body' });
  const vehicles = ['car-east', 'car-west', 'car-east-follow', 'bus-south'].map(id => prefix + id);
  environment.surfaces = environment.surfaces.filter(surface => !vehicles.some(id => surface.entityId === id + ':body'));
  for (const id of vehicles) {
    const body = scene.entities.find(entity => entity.id === id + ':body');if (!body?.animation) continue;
    const parts = scene.entities.filter(entity => entity.id.startsWith(id + ':') && entity.animation && entity.id !== body.id);
    const marks = wreckDetails(body);scene.entities.push(...marks);parts.push(...marks);
    const panelInstalled = options.declaration.meshes.some(mesh => mesh.id === 'tod:city-model:wreck-panel');
    if (panelInstalled) for (const mark of marks) if (/:(hood|roof)$/.test(mark.id)) { mark.meshId = 'tod:city-model:wreck-panel';mark.scale[1] = mark.id.endsWith(':hood') ? .8 : .55; }
    environment.surfaces.push({ entityId: body.id, trigger: { kind: 'impact', minSpeed: 6 }, stopMotionIds: parts.map(part => part.id), revealIds: marks.map(mark => mark.id),
      // A disabled car keeps its dark cabin recess. Removing glass made wrecks read as blank boxes.
      hideIds: parts.filter(part => /:light:|:(roof-cap|front-grille)$/.test(part.id)).map(part => part.id) });
  }
  options.declaration.budgets = { ...options.declaration.budgets, entities: Math.max(options.declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(options.declaration.budgets.materials, options.declaration.materials.length) };
}
