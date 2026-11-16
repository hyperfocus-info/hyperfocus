import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Scene = Hyperfocus3DDeclaration['scenes'][number];
type Vec3 = [number, number, number];
type Box = (id: string, material: string, position: Vec3, halfExtents: Vec3, solid?: boolean) => Scene['entities'][number];

/** Glazed transit frontage and staggered service buildings replace the visual cage rhythm. */
export function authorCityFrontage(options: { scene: Scene; box: Box }) {
  const { scene, box } = options;
  const add = (id: string, material: string, position: Vec3, scale: Vec3) => box(`architecture:${id}`, material, position, scale, false);
  // A continuous acoustic screen makes the existing dense collision bars readable
  // as glazing, supported by five broad structural bays rather than 23 dark bars.
  for (let bay = 0; bay < 4; bay++) {
    const x = -11.25 + bay * 7.5;
    add(`transit-glass:${bay}`, 'screen-glass', [x, 12.5, -12.78], [3.68, 9.45, .025]);
    add(`transit-spandrel:${bay}`, 'paint', [x, 3.7, -12.74], [3.68, .65, .055]);
    add(`transit-header:${bay}`, 'concrete-light', [x, 21.65, -12.7], [3.68, .3, .14]);
  }
  for (const entity of scene.entities) {
    if (entity.id.startsWith('tod:city:detail:screen-crossbar:')) {
      // Existing editable crossbars become restrained glazing mullions.
      entity.materialId = 'tod:city:concrete-dark'; entity.scale[1] = .035; entity.scale[2] = .035;
    }
    if (entity.id.startsWith('tod:city:detail:screen-girder:')) {
      entity.materialId = 'tod:city:concrete-light'; entity.scale[0] = .26; entity.scale[2] = .2;
    }
  }
  const blocks = [
    [-24, -26, 20, 5, 4], [-12, -30, 29, 4, 5], [-2, -25, 18, 5, 3], [10, -29, 25, 4, 4], [22, -25, 17, 5, 3],
  ];
  for (const [index, block] of blocks.entries()) {
    const [x = 0, z = 0, height = 20, width = 4, depth = 4] = block;
    add(`district-block:${index}`, index % 2 ? 'skyline-light' : 'skyline', [x, height / 2, z], [width, height / 2, depth]);
    add(`district-roof:${index}`, 'steel', [x, height + .2, z], [width + .2, .2, depth + .2]);
    add(`district-setback:${index}`, 'skyline', [x + .6, height + 1.5, z - .6], [width * .55, 1.3, depth * .55]);
    for (let floor = 0; floor < Math.floor(height / 3) - 1; floor++) {
      add(`district-window:${index}:${floor}`, floor % 4 === index % 4 ? 'glass-lit' : 'window', [x, 3.5 + floor * 3, z + depth + .03], [width - .5, .53, .03]);
      add(`district-sill:${index}:${floor}`, 'concrete-dark', [x, 2.9 + floor * 3, z + depth + .1], [width, .08, .12]);
    }
    for (const side of [-1, 1]) add(`district-pier:${index}:${side}`, 'skyline-light', [x + side * width * .65, height / 2, z + depth + .08], [.13, height / 2, .12]);
    const vent = add(`district-vent:${index}`, 'steel', [x - 1, height + 3, z], [.5, 1.5, .5]); vent.meshId = 'tod:sphere';
  }
  // Hydraulic service details are fixed to the existing gantry; the moving tool
  // retains exactly its two original transition-controlled entities.
  for (const side of [-1, 1]) {
    add(`gantry-hydraulic:${side}`, 'steel', [17.55 + side * .18, 5.8, .42], [.055, 3.6, .055]).meshId = 'tod:sphere';
    add(`gantry-hose:${side}`, 'rust', [18.4, 5.8, side * .45], [.06, 3.3, .06]).meshId = 'tod:sphere';
    for (let wheel = 0; wheel < 4; wheel++) add(`gantry-wheel:${side}:${wheel}`, 'concrete-dark', [16.9 + wheel * 1.05, .5, side * 2.27], [.4, .4, .08]).meshId = 'tod:sphere';
  }
  add('gantry-counterweight', 'concrete-dark', [20.3, 1.4, .4], [.5, .7, 1.4]);
  add('gantry-exhaust', 'steel', [19.2, 3.5, .9], [.12, .8, .12]).meshId = 'tod:sphere';
}
