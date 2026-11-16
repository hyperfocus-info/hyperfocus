import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Visible physical enclosure: launches rebound instead of leaving a finite floor. */
export function encloseTouchOfDeathArena(declaration: Hyperfocus3DDeclaration) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  const floor = scene?.entities.find(entity => entity.id === 'tod:arena');
  if (!scene || !floor) throw new Error('Touch of Death arena is missing.');
  declaration.save = { ...declaration.save, restoreOnBoot: false };
  floor.position = [0, -1.02, 0];floor.scale = [15.6, 1, 12.6];
  const back = scene.entities.find(entity => entity.id === 'tod:back-wall');
  if (back) { back.position = [0, .98, -12.3];back.scale = [15.6, 1, .3]; }
  const stripe = scene.entities.find(entity => entity.id === 'tod:wall-stripe');
  if (stripe) { stripe.position = [0, 1.8, -11.98];stripe.scale = [15, .05, .02]; }
  // Decorative architecture stays behind the playable boundary so it cannot
  // cover airborne fighters when the camera follows them toward the back wall.
  for (const entity of scene.entities) if (entity.id.startsWith('tod:gate:') || entity.id === 'tod:gate-top') entity.position[2] = -12.8;
  if (!declaration.materials.some(material => material.id === 'tod:boundary')) declaration.materials.push({ id: 'tod:boundary', shading: 'unlit', baseColor: [.15, .75, .9, .10], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith('tod:boundary:'));
  const add = (id: string, position: [number, number, number], scale: [number, number, number], solid: boolean) => scene.entities.push({
    id: `tod:boundary:${id}`, meshId: 'tod:box', materialId: solid ? 'tod:boundary' : 'tod:gold', position, scale, rotationY: 0,
    ...(solid ? { physics: { type: 'static' as const, shape: 'box' as const, gravityScale: 0, continuous: false } } : {}),
  });
  for (const side of [-1, 1]) {
    add(`wall-x:${side}`, [side * 15.3, 8.98, 0], [.3, 9, 12.6], true);
    add(`wall-z:${side}`, [0, 8.98, side * 12.3], [15.6, 9, .3], true);
    add(`rim-x:${side}`, [side * 15, .02, 0], [.05, .04, 12], false);
    add(`rim-z:${side}`, [0, .02, side * 12], [15, .04, .05], false);
    for (const other of [-1, 1]) add(`post:${side}:${other}`, [side * 15, 8.98, other * 12], [.06, 9, .06], false);
  }
  add('ceiling', [0, 18.28, 0], [15.6, .3, 12.6], true);
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith('tod:platform:'));
  if (!declaration.materials.some(material => material.id === 'tod:platform')) declaration.materials.push({
    id: 'tod:platform', shading: 'lit', shader: 'toon', baseColor: [.28, .32, .38, 1],
    metallic: 0, roughness: .85, doubleSided: false,
    toon: { bands: 3, outlineColor: [.025, .03, .055, 1], outlineWidth: .003, rimColor: [.7, .88, 1], rimStrength: .12, shadowColor: [.19, .21, .35] },
  });
  // Open central neutral space; side decks create changing approach elevations.
  for (const side of [-1, 1]) scene.entities.push({
    id: `tod:platform:${side}`, meshId: 'tod:box', materialId: 'tod:platform',
    position: [-3 * side, 1.2, 5.5 * side], scale: [2.1, .18, 1.45], rotationY: 0,
    physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false },
    animation: { kind: 'ping-pong', offset: [6 * side, 0, 0], periodSeconds: 9, phase: 0 },
  });
  for (const side of [-1, 1]) scene.entities.push({
    id: `tod:platform:lift:${side}`, meshId: 'tod:box', materialId: 'tod:platform',
    position: [8.5 * side, side < 0 ? .5 : 3.7, 1.5 * side], scale: [2.1, .18, 1.45], rotationY: 0,
    physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false },
    animation: { kind: 'ping-pong', offset: [0, 3.2, 0], periodSeconds: 8, phase: side < 0 ? 0 : .5 },
  });
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
