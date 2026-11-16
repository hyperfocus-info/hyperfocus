import type { DistrictKit, Positions } from './kit.ts';

/** Long transit roofs and loading bays leave open lanes beneath the roof circuit. */
export function authorDepot({ kit }: { kit: DistrictKit }) {
  const { box, module } = kit;
  // Separate platforms replace the repeated rectangular court roof. The narrow
  // fixed network carries starts, stock and connections; large wings move around
  // it, opening different views through the station and changing playable edges.
  for (const x of [-5, 0]) box(`platform:start:${x}`, 'steel', [x, 5.8, 38], [1.25, .2, 1.1], true);
  box('platform:start-link', 'steel', [-2.5, 5.8, 38], [2.5, .2, .8], true);
  box('platform:stock', 'steel', [-2.5, 5.8, 40.4], [5.6, .2, 1.3], true);
  box('platform:stock-link', 'steel', [-2.5, 5.8, 39.2], [1, .2, 1.3], true);
  box('platform:stairs', 'steel', [-8.2, 5.8, 37.5], [2.6, .2, .85], true);
  box('platform:lift', 'steel', [2.85, 5.8, 38], [1.65, .2, 1.1], true);
  box('platform:north-link', 'steel', [-3, 5.8, 35.7], [1.1, .2, 1.5], true);
  box('platform:bridge', 'steel', [.5, 5.8, 34], [3.5, .2, 1.1], true);
  const platformWings: Positions[] = [
    [[-7, 5.8, 35.1], [-4, 5.8, 35.2], [1.4, 5.8, 35.6]],
    [[1.4, 5.8, 43.5], [-8.7, 5.8, 42], [1, 5.8, 46.4]],
  ];
  for (const [index, positions] of platformWings.entries()) module(`platform:wing:${index}`, positions, add => {
    const deck = add('deck', 'steel', [0, 0, 0], [3, .2, index ? 2 : 1.7], true);
    for (const side of [-1, 1]) add(`fascia:${side}`, 'warning', [0, -.03, side * (index ? 2 : 1.7)], [3, .27, .04], false, deck);
  });
  // The boarding shelter sits in the actual starting court, below its old roof.
  // Its large fascia and chest-high island change the fighter-height view and
  // leave two approach lanes; distant bus bays alone cannot communicate variety.
  module('boarding', [[-3.8, 0, 37], [1, 0, 37], [0, 0, 39]], add => {
    const roof = add('shelter-roof', 'paint', [0, 3.8, 0], [3.5, .16, 1.2], true);
    for (const side of [-1, 1]) {
      const post = add(`post:${side}`, 'steel', [side * 3.25, 1.8, -.9], [.12, 1.8, .12], true);
      add(`post-band:${side}`, 'warning', [side * 3.25, 1.3, -.9], [.13, .25, .13], false, post);
    }
    add('fascia', 'warning', [0, 3.6, 1.22], [3.5, .35, .045], false, roof);
    for (const x of [-2, 0, 2]) add(`route-mark:${x}`, 'chalk', [x, 3.6, 1.28], [.45, .045, .015], false, roof);
    const island = add('service-island', 'concrete-dark', [0, .28, .4], [1.7, .28, .35], true);
    add('service-top', 'warning', [0, .585, .4], [1.75, .025, .38], false, island);
  });
  module('dispatch', [[-8, 6, 36], [-4, 6, 35.8], [2.8, 6, 35.6]], add => {
    const cabinet = add('body', 'steel', [0, 1.2, 0], [1.2, 1.2, .65], true);
    add('crown', 'warning', [0, 2.5, 0], [1.4, .12, .8], false, cabinet);
    add('window', 'window', [0, 1.65, .675], [.95, .4, .025], false, cabinet);
    add('board', 'paint', [0, .65, .69], [.8, .35, .025], false, cabinet);
    for (const x of [-.5, .5]) add(`route:${x}`, 'chalk', [x, .65, .72], [.04, .26, .015], false, cabinet);
  });
  module('concourse', [[-10.8, 0, 33], [10.8, 0, 43], [-16, 0, 44]], add => {
    const roof = add('canopy', 'steel', [0, 9, 0], [5, .2, 3], true);
    const column = add('mast', 'concrete-dark', [0, 4.4, 0], [.22, 4.4, .22], true);
    add('mast-band', 'warning', [0, 1.5, 0], [.235, .35, .235], false, column);
    for (const side of [-1, 1]) add(`fascia:${side}`, 'warning', [0, 9, side * 3], [5, .24, .08], false, roof);
    add('sign', 'paint', [0, 7.9, 2.9], [2.6, .6, .12], false, roof);
    for (let i = 0; i < 3; i++) add(`route-line:${i}`, 'chalk', [0, 7.63 + i * .27, 3.04], [1.7, .025, .015], false, roof);
  });

  // West loading, split platforms, east interchange. These relocate entire
  // shelters and their solid cover, changing which ground approaches are open.
  const shelters: Positions[] = [
    [[-23, 0, 50], [24, 0, 38], [29, 0, 53]],
    [[26, 0, 53], [-26, 0, 49], [-24, 0, 36]],
  ];
  for (const [index, origins] of shelters.entries()) module(`shelter:${index}`, origins, add => {
    const roof = add('canopy', 'paint', [0, 4.5, 0], [7, .16, 2.4], true);
    for (const side of [-1, 1]) {
      const post = add(`post:${side}`, 'steel', [side * 6.5, 2.15, 1.95], [.16, 2.15, .16], true);
      add(`post-band:${side}`, 'warning', [side * 6.5, 1.2, 1.95], [.17, .22, .17], false, post);
      add(`roof-edge:${side}`, 'warning', [0, 4.5, side * 2.38], [7, .18, .045], false, roof);
    }
    // A chest-high service island splits the interior into two fighting lanes.
    const island = add('service-island', 'concrete', [0, .55, .85], [2.1, .55, .45], true);
    add('island-top', 'warning', [0, 1.12, .85], [2.15, .03, .48], false, island);
    add('stop-board', 'steel', [5.9, 2.2, 1.95], [.6, .9, .09], false, roof);
    add('stop-board-face', 'chalk', [5.9, 2.4, 1.84], [.36, .35, .015], false, roof);
    // Paint remains flush with the street: no hidden ankle-height collision.
    for (let i = -3; i <= 3; i++) add(`boarding-mark:${i}`, 'chalk', [i * 1.7, .025, -2.1], [.45, .025, .08]);
  });

  // Cargo gives the two outer passages genuine alternative cover arrangements.
  const cargo: Positions[] = [
    [[-19, 0, 35], [18, 0, 34], [-19, 0, 53]],
    [[33, 0, 38], [-33, 0, 52], [32, 0, 36]],
  ];
  for (const [index, origins] of cargo.entries()) module(`cargo:${index}`, origins, add => {
    const body = add('body', 'rust', [0, 1.25, 0], [3.1, 1.25, 1.4], true);
    for (const side of [-1, 1]) {
      add(`corner:${side}`, 'steel', [side * 2.95, 1.25, 1.43], [.1, 1.2, .04], false, body);
      add(`lock:${side}`, 'warning', [side * 1.15, 1.3, 1.46], [.035, .85, .035], false, body);
    }
    for (let i = -2; i <= 2; i++) add(`rib:${i}`, 'concrete-dark', [i * 1.05, 1.25, -1.43], [.05, 1.15, .04], false, body);
  });

  // Street-facing loading apron: an escape route around either end, not a wall.
  const rear = box('loading:roof', 'steel', [0, 4.7, 55.6], [10, .18, 1.65], true);
  for (const x of [-9.5, 9.5]) box(`loading:post:${x}`, 'steel', [x, 2.25, 56.4], [.18, 2.25, .18], true);
  box('loading:edge', 'warning', [0, 4.7, 53.93], [10, .2, .04], false, rear);
  for (let i = -3; i <= 3; i++) box(`loading:bay:${i}`, 'chalk', [i * 2.7, .018, 53.5], [.045, .018, 2.4]);
  kit.cover('loading:pallet', [[-6, .65, 49], [6, .65, 51], [-7, .65, 51]], [1.5, .65, .65], 'rust');
  kit.cover('loading:barrier', [[13, .55, 51], [-18, .55, 43], [14, .55, 47]], [1.25, .55, .45]);
}
