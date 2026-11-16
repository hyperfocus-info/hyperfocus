import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Scene = Hyperfocus3DDeclaration['scenes'][number];
type Vec3 = [number, number, number];
type Box = (id: string, material: string, position: Vec3, scale: Vec3, solid?: boolean) => Scene['entities'][number];

export const cityFightStarts = [[0, 8], [-50, -18], [50, 18], [0, -42], [0, 42]] as const;
const groundTools: readonly (readonly [Vec3, Vec3])[] = [
  [[-3.4, .15, 8], [10, .15, 10]],
  [[-69, .15, -19], [-43, .15, -33]],
  [[52, .15, 23], [63, .15, 6]],
  [[-17, .15, -40], [18, .15, -48]],
  [[-22, .15, 45], [20, .15, 50]],
];
const roofTools: readonly (readonly [Vec3, Vec3])[] = [
  [[-5, 6.15, 2], [10, .15, 10]],
  [[-58, 6.15, -25], [-34, .15, -12]],
  [[68, .15, 25], [43, 6.15, 11]],
  [[-22, .15, -38], [21, .15, -47]],
  [[-8, 6.15, 40], [19, .15, 50]],
];

/** Ten inspected street/roof starts, each with a distinct worksite tool layout. */
export function authorCityMatchLayouts({ combat }: { combat: CombatProject3D }) {
  const names = ['worksite', 'west-court', 'east-court', 'north-court', 'south-court'];
  combat.spawns = Array.from({ length: 10 }, (_, index) => {
    const court = index % 5, roof = index >= 5, [x, z] = cityFightStarts[court]!;
    const positions: Vec3[] = roof ? court === 0 ? [[-3, 7, -3], [3, 7, -3]] : [[x - 5, 7, z - 4], [x, 7, z - 4]] : [[x - 2, 1, z], [x + 2, 1, z]];
    const props: NonNullable<NonNullable<CombatProject3D['spawns']>[number]['props']> = [];
    for (const site of cityFightStarts.keys()) {
      const elevated = roof && site === court;
      for (const [side, name] of [[-1, 'timber-brace'], [1, 'detached-handrail']] as const) {
        const entityId = `tod:city:tool:${name}${site ? ':' + site : ''}`;
        if (!combat.interactions?.weapons.some(weapon => weapon.entityId === entityId)) continue;
        const placement = (elevated ? roofTools : groundTools)[site]![side < 0 ? 0 : 1];
        const position: Vec3 = [...placement];
        // Active street deliveries differ by court, while distant deliveries stay put.
        // Most starts must travel or leave the roof to claim a tool; only the
        // introductory worksite deliberately leaves one brace within hand reach.
        if (!roof && site === court) { position[0] += side * court * .35;position[2] += court * .6; }
        props.push({ entityId, position });
      }
    }
    return { id: `${names[court]}${roof ? '-roof' : ''}`, positions, props };
  });
}

/** Relocate perimeter art, then add connected courts rather than scaling combat geometry. */
export function authorCityExpansion(options: { scene: Scene; box: Box }) {
  const { scene, box } = options;
  const surfaces: NonNullable<CombatProject3D['environment']>['surfaces'] = [];
  scene.camera.far = Math.max(scene.camera.far, 300);
  for (const entity of scene.entities) {
    const id = entity.id.replace('tod:city:', '');
    if (id === 'street') entity.scale = [80, .3, 60];
    if (/^retaining-x:/.test(id)) { entity.position[0] += Math.sign(entity.position[0]) * 64; entity.scale[2] = 60; }
    if (/^retaining-z:/.test(id)) { entity.position[2] += Math.sign(entity.position[2]) * 48; entity.scale[0] = 81.8; }
    if (/^facade-x:/.test(id)) { entity.position[0] += Math.sign(entity.position[0]) * 64; entity.scale[2] = 58; }
    if (/^facade-z:/.test(id)) { entity.position[2] += 48; entity.scale[0] = 78; }
    if (/^(rail-screen|detail:screen-|architecture:transit-)/.test(id)) {
      entity.position[2] -= 48; entity.position[0] *= 5;
      if (!id.startsWith('rail-screen:')) entity.scale[0] *= 5;
    }
    if (/^(rail-deck|rail-pier:|train:|train-window:|detail:(rail-|pier-|train:)|architecture:(rail:|rail-sleeper:|rail-bracket:|rail-service:|district-))/.test(id)) entity.position[2] -= 48;
    if (/^(detail:(facade-|window-frame:)|architecture:(cornice:|crown:|cap:|service-riser:|utility-|window-lit:|ground-plinth:))/.test(id)) entity.position[0] += Math.sign(entity.position[0]) * 64;
    if (/^architecture:south-/.test(id)) entity.position[2] += 48;
  }
  scene.entities = scene.entities.filter(entity => !/^tod:city:rail-screen:-?\d+$/.test(entity.id) || Math.abs(entity.position[0]) < 80);
  // Additional visible structural bars retain the original safe narrow spacing.
  for (let i = -53; i <= 53; i++) {
    if (i % 5 === 0 && Math.abs(i) <= 55) continue;
    box(`expanded:screen:${i}`, 'screen-glass', [i * 1.5, 12.5, -60.8], [.09, 9.5, .09]);
  }
  for (const [index, [x, z]] of cityFightStarts.entries()) {
    if (index === 0) continue;
    const add = (id: string, material: string, offset: Vec3, scale: Vec3, solid = true) => box(`expanded:court:${index}:${id}`, material, [x + offset[0], offset[1], z + offset[2]], scale, solid);
    // Two open ends and broad side passages keep the courts connected to streets.
    add('back-left', 'concrete', [-6, 3, -8], [4, 3, .3]);
    add('back-right', 'concrete', [6, 3, -8], [4, 3, .3]);
    const panel = add('weak-back', 'plaster', [0, 3, -8], [2, 3, .3]);
    const cracks: string[] = [], debris: string[] = [];
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      cracks.push(add(`crack:${side}:${i}`, 'fracture', [(i % 2 ? .25 : -.15), 1 + i * .8, -8 + side * .315], [.22, .035, .012], false).id);
    }
    for (let i = 0; i < 8; i++) debris.push(add(`debris:${i}`, 'plaster', [-1.7 + i % 4 * 1.1, .15, -9 + Math.floor(i / 4) * 2], [.3, .15, .25], false).id);
    surfaces.push({ entityId: panel.id, trigger: { kind: 'impact', minSpeed: 4 }, hideIds: cracks, debrisIds: debris });
    add('side', 'brick', [-10, 3, -2], [.3, 3, 6]);
    add('roof', 'concrete', [-2.75, 5.8, -4], [7.25, .2, 4]);
    for (let step = 0; step < 12; step++) add(`step:${step}`, 'concrete', [-12.5, (step + 1) / 4, 5.5 - step], [1.5, (step + 1) / 4, .5]);
    add('roof-link', 'steel', [-10.75, 5.8, -5], [.75, .2, 1]);
    for (let i = 0; i < 5; i++) {
      const seam = add(`seam:${i}`, 'concrete-dark', [-8 + i * 4, 2.8, -7.68], [.035, 2.8, .02], false);
      if (i === 2) cracks.push(seam.id);
      add(`paint:${i}`, 'warning', [-8 + i * 4, .015, 6], [.8, .015, .06], false);
    }
    add('header', 'paint', [0, 4.8, -7.67], [9.8, .45, .025], false);
    add('lamp', 'lamp', [0, 5.5, -7.6], [1.2, .08, .08], false);
    const deck = add('lift', 'steel', [7, 2.2, -4], [2.2, .2, 2.2]);
    deck.animation = { kind: 'ping-pong', offset: [0, 3.7, 0], periodSeconds: 10, phase: index * .2 };
    const stripe = add('lift-edge', 'warning', [7, 2.41, -1.85], [2.2, .02, .05], false);
    stripe.animation = structuredClone(deck.animation);
    add('lift-guide', 'steel', [9.4, 3.6, -4], [.1, 3.6, 2.5], false);
  }
  // Street markings connect the five distinct courts without placing new barriers.
  for (let x = -70; x <= 70; x += 8) box(`expanded:road-x:${x}`, 'chalk', [x, .012, 10], [1.5, .012, .08], false);
  for (let z = -50; z <= 50; z += 8) box(`expanded:road-z:${z}`, 'chalk', [16, .012, z], [.08, .012, 1.5], false);
  // Render-only machinery is now inside the district; give its solid base real collision.
  for (const entity of scene.entities) if (/^tod:city:demolition-(base|track:)/.test(entity.id)) entity.physics = { type: 'static', shape: 'box', gravityScale: 0, continuous: false };
  return surfaces;
}
