import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];
export type DistrictBox = (id: string, material: string, position: Vec3, scale: Vec3, solid?: boolean, owner?: string) => Entity;

/** Occupancy and infrastructure are mounted to real walls, never floating set dressing. */
export function authorDistrictDetails({ add }: { add: DistrictBox }) {
  // West apartments: recessed-looking window rows, balconies and utility meters.
  for (const side of [-1, 1]) {
    const x = -50 + side * 6, owner = `tod:city:district:residential:tower:${side}`;
    add(`residential:tower:${side}`, 'concrete', [x, 8.8, -26], [3.8, 2.8, .45], true);
    for (const y of [7.4, 9.4]) for (const offset of [-2.3, 0, 2.3]) {
      add(`residential:window:${side}:${y}:${offset}`, (offset === 0) === (side > 0) ? 'glass-lit' : 'window', [x + offset, y, -25.53], [.6, .6, .025], false, owner);
      add(`residential:sill:${side}:${y}:${offset}`, 'concrete-light', [x + offset, y - .65, -25.38], [.7, .06, .18], false, owner);
    }
    add(`residential:service:${side}`, 'rust', [x + side * 3.5, 6, -25.5], [.09, 5.8, .09], false, owner);
    add(`residential:crown:${side}`, 'concrete-dark', [x, 11.68, -26], [3.95, .08, .58], false, owner);
  }
  for (let i = 0; i < 4; i++) {
    add(`residential:mail:${i}`, 'steel', [-57.9 + i * .8, 1.4, -25.65], [.3, .4, .05], false, 'tod:city:expanded:court:1:back-left');
    add(`residential:mail-slot:${i}`, 'chalk', [-57.9 + i * .8, 1.52, -25.58], [.18, .018, .012], false, 'tod:city:expanded:court:1:back-left');
  }
  // East market: striped shop canopies, closed shutters, tiled counters and a transit mast.
  for (const side of [-1, 1]) {
    const x = 50 + side * 6, owner = `tod:city:expanded:court:2:back-${side < 0 ? 'left' : 'right'}`;
    add(`market:shutter:${side}`, 'steel', [x, 2.3, 10.32], [2.7, 1.6, .035], false, owner);
    for (let y = 1; y <= 3; y++) add(`market:shutter-rib:${side}:${y}`, 'concrete-dark', [x, y, 10.37], [2.65, .04, .025], false, owner);
    add(`market:canopy:${side}`, 'warning', [x, 4.25, 11], [3.2, .12, .7], true);
    for (let stripe = 0; stripe < 5; stripe++) add(`market:canopy-stripe:${side}:${stripe}`, 'chalk', [x - 2.6 + stripe * 1.3, 4.38, 11], [.25, .01, .65], false, `tod:city:district:market:canopy:${side}`);
    add(`market:sign:${side}`, 'paint', [x, 4.85, 10.35], [2.7, .4, .04], false, owner);
    for (let i = 0; i < 3; i++) add(`market:sign-mark:${side}:${i}`, 'chalk', [x - 1.2 + i * 1.2, 4.85, 10.4], [.25, .18, .015], false, owner);
  }
  // North utility hall: blue observation glass and ducts behind ordinary service frontage.
  for (const side of [-1, 1]) {
    const owner = `tod:city:expanded:court:3:back-${side < 0 ? 'left' : 'right'}`;
    add(`utility:observation:${side}`, 'window', [side * 6, 3.1, -49.68], [3.1, 1.3, .025], false, owner);
    for (let i = 0; i < 3; i++) add(`utility:monitor:${side}:${i}`, 'paint', [side * 6 - 1.7 + i * 1.7, 3.2, -49.63], [.55, .42, .025], false, owner);
    add(`utility:duct:${side}`, 'steel', [side * 6, 5.15, -49.35], [3.8, .25, .35], false, owner);
    add(`utility:duct-band:${side}`, 'warning', [side * 6, 5.15, -48.99], [.25, .26, .02], false, owner);
  }
  // South depot: a broad sawtooth-like roof crown and public route signage.
  for (let i = 0; i < 4; i++) {
    const x = -8 + i * 3.8, owner = `tod:city:district:depot:vent:${i}`;
    add(`depot:vent:${i}`, 'steel', [x, 6.6, 34.2], [1.4, .6, .65], true);
    add(`depot:vent-face:${i}`, 'window', [x, 6.7, 34.87], [1.25, .35, .025], false, owner);
  }
  for (const side of [-1, 1]) {
    const owner = `tod:city:expanded:court:4:back-${side < 0 ? 'left' : 'right'}`;
    add(`depot:route-board:${side}`, 'paint', [side * 6, 3.3, 34.34], [2.5, 1.1, .04], false, owner);
    for (let line = 0; line < 3; line++) {
      add(`depot:route:${side}:${line}`, 'warning', [side * 6, 2.8 + line * .5, 34.4], [1.8, .04, .02], false, owner);
      for (const stop of [-1, 0, 1]) add(`depot:stop:${side}:${line}:${stop}`, 'chalk', [side * 6 + stop * 1.4, 2.8 + line * .5, 34.43], [.1, .1, .015], false, owner);
    }
  }
}
