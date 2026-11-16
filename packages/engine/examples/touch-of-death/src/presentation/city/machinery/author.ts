import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

const prefix = 'tod:city:machine-stop:';
const deckId = 'tod:city:traffic:transfer:deck';

/** An impact can jam the existing transfer carriage where it is, retaining its usable solid deck. */
export function authorCityMachineStop({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  const deck = scene?.entities.find(entity => entity.id === deckId);
  if (!scene || deck?.animation?.kind !== 'ping-pong') return;
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  const add = (id: string, material: string, offset: [number, number, number], scale: [number, number, number]) => {
    const entity: typeof deck = { id: prefix + id, meshId: 'tod:box', materialId: `tod:city:${material}`, position: [deck.position[0] + offset[0], deck.position[1] + offset[1], deck.position[2] + offset[2]], rotationY: 0, scale, animation: structuredClone(deck.animation) };
    scene.entities.push(entity);return entity.id;
  };
  const motor = add('motor', 'warning', [1.75,.46,1.6], [.25,.26,.4]);
  const lamp = add('power', 'lamp', [1.49,.5,1.6], [.025,.05,.15]);
  const broken = add('broken-motor', 'steel', [1.75,.38,1.6], [.25,.18,.4]);
  const fracture = add('broken-cover', 'rust', [1.52,.48,1.45], [.035,.12,.25]);
  const linked = scene.entities.filter(entity => entity.id.startsWith('tod:city:traffic:transfer:edge:') || entity.id.startsWith(prefix)).map(entity => entity.id);
  const environment = combat.environment ?? { surfaces: [] };
  environment.surfaces = environment.surfaces.filter(surface => surface.entityId !== deckId);
  environment.surfaces.push({ entityId: deckId, trigger: { kind: 'impact', minSpeed: 4 }, stopMotionIds: linked, hideIds: [motor,lamp], revealIds: [broken,fracture] });
  combat.environment = environment;
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)) };
}
