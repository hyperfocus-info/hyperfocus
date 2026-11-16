import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Scene = Hyperfocus3DDeclaration['scenes'][number];
type Vec3 = [number, number, number];
type Box = (id: string, material: string, position: Vec3, halfExtents: Vec3, solid?: boolean) => Scene['entities'][number];

/** Cosmetic worksite detail uses existing meshes and never changes traversal geometry. */
export function authorCityDetails(options: { scene: Scene; box: Box }) {
  const { scene, box } = options;
  const decoration = (id: string, material: string, position: Vec3, scale: Vec3) => box(id, material, position, scale, false);
  // Uneven repairs and seams break up the large concrete surfaces without fake doors.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      decoration(`detail:facade-pier:${side}:${i}`, 'concrete-dark', [side * 15.75, 10.5, -10.5 + i * 3], [.05, 10.5, .09]);
      decoration(`detail:facade-patch:${side}:${i}`, i % 2 ? 'concrete-light' : 'concrete-dark', [side * 15.74, 1 + i % 3 * .4, -10.5 + i * 3], [.025, .6, .65]);
      decoration(`detail:facade-drip:${side}:${i}`, 'rust', [side * 15.73, 4.7 + i % 2 * 6, -10.5 + i * 3], [.025, .6 + i % 3 * .2, .045]);
    }
    for (let floor = 0; floor < 6; floor++) for (let pane = 0; pane < 7; pane++) {
      // Dark frames segment the former uninterrupted window strip.
      decoration(`detail:window-frame:${side}:${floor}:${pane}`, 'concrete-dark', [side * 15.72, 3 + floor * 3, -9 + pane * 3], [.025, .56, .06]);
    }
    for (const z of [-6, 4]) {
      decoration(`detail:door-post:${side}:${z}`, 'rust', [side * 2.04, 2.3, z + (z > 0 ? .23 : -.23)], [.045, 2.3, .025]);
      decoration(`detail:door-foot:${side}:${z}`, 'warning', [side * 2.05, .6, z + (z > 0 ? .24 : -.24)], [.05, .45, .025]);
      for (let course = 0; course < 5; course++) decoration(`detail:wall-course:${side}:${z}:${course}`, 'concrete-dark', [side * 4, .7 + course, z + (z > 0 ? .215 : -.215)], [1.9, .015, .012]);
    }
  }
  // Road repairs and drainage lie flat and do not imply additional collision.
  for (const x of [-12, 12]) {
    for (let z = -8; z <= 8; z += 4) decoration(`detail:street-mark:${x}:${z}`, 'chalk', [x, .012, z], [.035, .012, .75]);
    decoration(`detail:drain:${x}`, 'steel', [x, .02, 9], [.6, .015, .3]);
    for (let i = 0; i < 5; i++) decoration(`detail:drain-slot:${x}:${i}`, 'asphalt', [x - .44 + i * .22, .038, 9], [.035, .01, .25]);
  }
  for (let i = 0; i < 12; i++) {
    decoration(`detail:stair-nosing:${i}`, 'chalk', [-8, i * .5 + .518, 5.96 - i], [1.42, .012, .035]);
    decoration(`detail:stair-riser:${i}`, 'concrete-dark', [-8, i * .5 + .25, 6.012 - i], [1.42, .12, .012]);
  }
  // The safety screen reads as structural rail frontage rather than free-standing bars.
  for (const x of [-15, -7.5, 0, 7.5, 15]) {
    decoration(`detail:screen-foot:${x}`, 'rust', [x, 3.04, -12.8], [.22, .06, .22]);
    decoration(`detail:screen-girder:${x}`, 'steel', [x, 12.5, -12.82], [.15, 9.5, .08]);
  }
  for (const y of [7, 13, 19]) decoration(`detail:screen-crossbar:${y}`, 'rust', [0, y, -12.82], [16.5, .065, .08]);
  decoration('detail:rail-front-girder', 'rust', [0, 6.85, -14.28], [27, .32, .08]);
  for (const x of [-20, -10, 0, 10, 20]) {
    decoration(`detail:pier-cap:${x}`, 'concrete-light', [x, 6.5, -16], [1.25, .2, 1.65]);
    decoration(`detail:pier-foot:${x}`, 'concrete-dark', [x, .15, -16], [1, .15, 1]);
  }
  for (const train of scene.entities.filter(entity => /^tod:city:train:\d+$/.test(entity.id))) {
    const i = train.id.split(':').at(-1)!;
    const attach = (id: string, material: string, offset: Vec3, scale: Vec3) => {
      const entity = decoration(`detail:train:${i}:${id}`, material, [train.position[0] + offset[0], train.position[1] + offset[1], train.position[2] + offset[2]], scale);
      if (train.animation) entity.animation = structuredClone(train.animation);
      return entity;
    };
    attach('undercarriage', 'steel', [0, -1.15, 0], [2.55, .18, 1.1]);
    attach('roof', 'concrete-light', [0, 1.32, 0], [2.65, .08, 1.18]);
    attach('coupler', 'steel', [3, -.85, 0], [.23, .12, .15]);
    for (const side of [-1, 1]) {
      attach(`stripe:${side}`, 'rust', [0, -.45, side * 1.27], [2.72, .09, .02]);
      attach(`door:${side}`, 'concrete-light', [.9, -.1, side * 1.28], [.38, .98, .025]);
      attach(`door-glass:${side}`, 'window', [.9, .34, side * 1.315], [.25, .37, .015]);
      attach(`door-seam:${side}`, 'steel', [.9, -.13, side * 1.34], [.015, .93, .012]);
      for (const x of [-1.8, -.65, 1.8]) attach(`window-frame:${side}:${x}`, 'train', [x, .4, side * 1.285], [.04, .45, .025]);
      for (const x of [-1.8, 1.8]) {
        const wheel = attach(`wheel:${side}:${x}`, 'steel', [x, -1.25, side * .95], [.32, .32, .12]); wheel.meshId = 'tod:sphere';
      }
    }
    attach('headlamp', 'lamp', [2.815, -.6, -.7], [.02, .12, .15]);
  }
  const wallDetails: string[] = [], roofDetails: string[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const y = .6 + i * .85, z = i % 2 ? .12 : -.32;
      wallDetails.push(decoration(`detail:fracture:${side}:${i}`, 'fracture', [6 + side * .224, y, z], [.018, .29, .055]).id);
      wallDetails.push(decoration(`detail:fracture-branch:${side}:${i}`, 'fracture', [6 + side * .226, y + .28, -.1], [.018, .035, .27]).id);
    }
    for (let i = 0; i < 4; i++) wallDetails.push(decoration(`detail:exposed-masonry:${side}:${i}`, 'rust', [6 + side * .218, .65 + i * 1.25, -1.4 + i % 2 * 2.7], [.015, .2, .32]).id);
  }
  for (const x of [.15, 5.85]) roofDetails.push(decoration(`detail:roof-cut-x:${x}`, 'fracture', [x, 6.035, 0], [.025, .014, 3.8]).id);
  for (const z of [-3.85, 3.85]) roofDetails.push(decoration(`detail:roof-cut-z:${z}`, 'fracture', [3, 6.035, z], [2.85, .014, .025]).id);
  for (let i = 0; i < 4; i++) roofDetails.push(decoration(`detail:roof-fracture:${i}`, 'concrete-dark', [1 + i * 1.15, 6.03, i % 2 ? -.4 : .5], [.025, .012, .9]).id);
  const fragments = (name: string, count: number, x: number, width: number, depth: number) => Array.from({ length: count }, (_, i) => {
    const angle = i * 2.4, radius = .35 + (i % 4) * .21;
    const height = .09 + i % 3 * .045;
    const entity = decoration(`${name}:${i}`, i % 3 ? 'concrete-light' : 'concrete-dark', [x + Math.cos(angle) * width * radius, height, Math.sin(angle) * depth * radius], [.16 + i % 4 * .08, height, .14 + i % 3 * .09]);
    entity.rotationY = angle;
    return entity.id;
  });
  return { wallDetails, roofDetails, wallDebris: fragments('weak-wall-debris', 12, 6.3, 1.5, 2), floorDebris: fragments('floor-debris', 18, 3, 2.6, 3.2) };
}
