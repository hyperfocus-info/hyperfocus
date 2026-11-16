import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
type Box = (id: string, material: string, position: Vec3, halfExtents: Vec3, solid?: boolean) => Entity;

/** Large architectural shapes establish a district silhouette without adding collision. */
export function authorCityArchitecture(options: { box: Box }) {
  const add = (id: string, material: string, position: Vec3, scale: Vec3) => options.box(`architecture:${id}`, material, position, scale, false);
  // The enclosing blocks have different heights, roof crowns and service cores.
  // All bulk stays outside the existing physical frontage.
  for (const side of [-1, 1]) {
    for (const y of [6.1, 12.1, 18.1, 22]) add(`cornice:${side}:${y}`, 'concrete-light', [side * 16.03, y, 0], [.25, .09, 12]);
    for (let i = 0; i < 3; i++) {
      const z = -8 + i * 8, height = 2.5 + (i + (side > 0 ? 1 : 0)) % 3 * 1.8;
      add(`crown:${side}:${i}`, i % 2 ? 'brick' : 'paint', [side * 17, 22 + height, z], [1.05, height, 3.8]);
      add(`cap:${side}:${i}`, 'concrete-dark', [side * 17, 22 + height * 2, z], [1.2, .15, 3.95]);
      add(`service-riser:${side}:${i}`, 'rust', [side * 15.75, 11, z - 3.25], [.12, 10.9, .13]);
      add(`utility-housing:${side}:${i}`, 'steel', [side * 15.6, 9 + i * 3, z], [.18, .47, .8]);
      add(`utility-face:${side}:${i}`, 'concrete-dark', [side * 15.4, 9 + i * 3, z], [.035, .34, .65]);
      for (let slit = 0; slit < 3; slit++) add(`utility-vent:${side}:${i}:${slit}`, 'steel', [side * 15.35, 8.8 + i * 3 + slit * .2, z], [.025, .025, .6]);
    }
    // Selective lit windows create occupancy without a field of emissive noise.
    for (let i = 0; i < 5; i++) add(`window-lit:${side}:${i}`, 'glass-lit', [side * 15.70, 6 + i % 3 * 6, -7.5 + i * 3], [.018, .42, .9]);
    add(`ground-plinth:${side}`, 'paint', [side * 15.76, .85, 0], [.03, .85, 11.7]);
  }
  for (const y of [6.1, 12.1, 18.1, 22]) add(`south-cornice:${y}`, 'concrete-light', [0, y, 12.02], [16, .09, .25]);
  for (let i = 0; i < 5; i++) {
    const x = -12 + i * 6;
    add(`south-crown:${i}`, 'concrete-dark', [x, 23 + i % 2, 13], [2.8, 1 + i % 2, .8]);
  }
  // Flush street repairs, gutter edges and low paint give feet a readable scale.
  for (const side of [-1, 1]) {
    add(`gutter:${side}`, 'concrete-dark', [side * 14.8, .018, 0], [.16, .018, 11.4]);
    add(`street-repair:${side}`, 'concrete-dark', [side * 11.3, .008, 1.2], [1.8, .008, 2.4]);
    add(`street-repair-edge:${side}`, 'fracture', [side * 11.3, .018, 3.59], [1.8, .01, .025]);
    add(`threshold:${side}`, 'steel', [0, .012, side < 0 ? -6 : 4], [1.98, .012, .19]);
    // Header trims are fixed to surviving door lintels, outside the opening.
    add(`door-header:${side}`, 'warning', [0, 4.67, side < 0 ? -6.23 : 4.23], [1.98, .06, .025]);
    add(`door-header-ink:${side}`, 'steel', [0, 4.81, side < 0 ? -6.23 : 4.23], [1.98, .07, .025]);
    add(`door-lamp:${side}`, 'lamp', [0, 5.65, side < 0 ? -6.24 : 4.24], [.45, .07, .03]);
    for (const x of [-4, 4]) {
      const z = side < 0 ? -6.23 : 4.23;
      add(`workshop-painted-base:${side}:${x}`, 'paint', [x, .8, z], [1.95, .8, .015]);
      add(`workshop-base-cap:${side}:${x}`, 'chalk', [x, 1.6, z + side * .015], [1.95, .035, .02]);
      add(`workshop-pier:${side}:${x}`, 'concrete-light', [x < 0 ? -5.85 : 5.85, 3, z], [.12, 3, .04]);
    }
  }
  // Suspended infrastructure reads from street and roof. No new usable surface.
  for (const z of [-14.5, -17.5]) add(`rail:${z}`, 'concrete-light', [0, 7.43, z], [27, .08, .065]);
  for (let i = 0; i < 10; i++) add(`rail-sleeper:${i}`, 'rust', [-24 + i * 5.3, 7.38, -16], [.12, .035, 1.55]);
  for (const x of [-20, -10, 0, 10, 20]) {
    add(`rail-bracket:${x}`, 'steel', [x, 5.8, -16], [1.3, .3, 1.55]);
    add(`rail-service:${x}`, 'warning', [x, 7, -14.17], [.25, .2, .025]);
  }
  add('gantry-spine', 'steel', [10.5, 10.4, 0], [7.9, .09, .32]);
  for (let i = 0; i < 7; i++) add(`gantry-rib:${i}`, 'steel', [3.5 + i * 2.3, 10, 0], [.065, .34, .45]);
  add('gantry-motor', 'steel', [3, 10.5, 0], [.55, .25, .5]);
  add('gantry-motor-lamp', 'lamp', [3, 10.51, .51], [.12, .08, .025]);
}
