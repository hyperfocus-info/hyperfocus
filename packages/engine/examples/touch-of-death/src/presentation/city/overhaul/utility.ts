import type { DistrictKit, Positions } from './kit.ts';

/** Pressure towers, overhead pipe gates and a protected observation gallery. */
export function authorUtility({ kit }: { kit: DistrictKit }) {
  const { box, module } = kit;
  // Two landing islands, a stock strip and service bridges leave the utility
  // court open to the sky. The flanking decks change size and route by placement.
  for (const x of [-5, 0]) box(`service-deck:start:${x}`, 'steel', [x, 5.8, -46], [1.25, .2, 1.1], true);
  box('service-deck:start-link', 'steel', [-2.5, 5.8, -46], [2.5, .2, .8], true);
  box('service-deck:stock', 'steel', [-2.5, 5.8, -43.6], [5.6, .2, 1.3], true);
  box('service-deck:stock-link', 'steel', [-2.5, 5.8, -44.8], [1, .2, 1.3], true);
  box('service-deck:stairs', 'steel', [-8.2, 5.8, -46.5], [2.6, .2, .85], true);
  box('service-deck:lift', 'steel', [2.85, 5.8, -46], [1.65, .2, 1.1], true);
  box('service-deck:gallery', 'steel', [-5, 5.8, -48.2], [1.05, .2, 1.9], true);
  box('service-deck:catwalk', 'steel', [-3, 5.8, -42.2], [1.25, .2, 1], true);
  const wings: Positions[] = [
    [[2, 5.8, -48.5], [-7.7, 5.8, -43.5], [2.5, 5.8, -43.8]],
    [[-7.5, 5.8, -49], [0, 5.8, -42.3], [0, 5.8, -48.9]],
  ];
  for (const [index, positions] of wings.entries()) module(`service-deck:wing:${index}`, positions, add => {
    const deck = add('deck', 'steel', [0, 0, 0], [index ? 2.5 : 2.1, .2, index ? 1.3 : 2], true);
    for (const side of [-1, 1]) add(`edge:${side}`, 'warning', [side * (index ? 2.5 : 2.1), -.05, 0], [.05, .25, index ? 1.3 : 2], false, deck);
  });
  // Readable industrial equipment occupies the actual fighting court. Moving
  // this arch changes both flanking routes while its overhead pipe stays clear.
  module('control-gate', [[-2, 0, -46], [0, 0, -47.5], [2, 0, -45.7]], add => {
    for (const side of [-1, 1]) {
      const pipe = add(`riser:${side}`, 'rust', [side * 2.2, 2.25, 0], [.2, 2.25, .2], true);
      add(`flange:${side}`, 'warning', [side * 2.2, 2, 0], [.28, .12, .28], false, pipe);
      add(`valve:${side}`, 'steel', [side * 2.2, 1.4, .36], [.35, .35, .09], false, pipe);
    }
    const pipe = add('cross-pipe', 'rust', [0, 4.5, 0], [2.4, .22, .22]);
    add('flow-band', 'warning', [0, 4.5, .24], [.45, .23, .025], false, pipe);
    const control = add('switchgear', 'concrete-dark', [0, .85, .45], [1.25, .85, .4], true);
    add('control-screen', 'window', [0, 1.15, .88], [.8, .28, .035], false, control);
    add('control-strip', 'lamp', [0, .55, .88], [.75, .045, .025], false, control);
  });
  module('cooling', [[2.8, 6, -49], [-8.4, 6, -43.2], [2.8, 6, -43.6]], add => {
    const cabinet = add('tower', 'steel', [0, 1.9, 0], [.7, 1.9, .65], true);
    add('cap', 'concrete-dark', [0, 3.9, 0], [.95, .12, .9], false, cabinet);
    for (const y of [.6, 1.6, 2.6]) add(`vent:${y}`, 'window', [0, y, .68], [.5, .23, .025], false, cabinet);
    add('pressure-band', 'warning', [0, 3.2, .68], [.71, .16, .025], false, cabinet);
  });
  // A traversable gallery behind the utility roof exposes its real purpose.
  // Ground passage and both end openings remain open beneath and beside it.
  const gallery = box('gallery:floor', 'steel', [0, 5.8, -54], [8.5, .2, 2.7], true);
  const roof = box('gallery:roof', 'concrete-dark', [0, 10.7, -54], [8.8, .25, 2.9], true);
  const rear = box('gallery:rear', 'concrete', [0, 8.2, -56.6], [8.5, 2.2, .18], true);
  box('gallery:link', 'steel', [-5, 5.8, -50.8], [1.2, .2, 1.4], true);
  for (const x of [-8.1, 8.1]) {
    const column = box(`gallery:pier:${x}`, 'concrete-dark', [x, 2.8, -55.6], [.3, 2.8, .3], true);
    box(`gallery:pier-band:${x}`, 'warning', [x, 1.4, -55.6], [.315, .3, .315], false, column);
    box(`gallery:mullion:${x}`, 'steel', [x, 8.2, -51.3], [.08, 2.2, .08], false, gallery);
  }
  for (const x of [-4.8, 4.8]) box(`gallery:parapet:${x}`, 'steel', [x, 6.4, -51.3], [3.7, .4, .15], true);
  for (const x of [-5.8, -1.9, 2, 5.9]) {
    box(`gallery:window:${x}`, 'window', [x, 8.2, -51.3], [1.85, 1.5, .035], false, gallery);
    box(`gallery:window-base:${x}`, 'steel', [x, 6.6, -51.3], [1.9, .08, .08], false, gallery);
    box(`gallery:monitor:${x}`, 'window', [x, 8, -56.37], [1.15, .55, .03], false, rear);
    box(`gallery:monitor-light:${x}`, 'lamp', [x + .9, 7.65, -56.31], [.05, .05, .015], false, rear);
  }
  // Repeated surveillance slots are too regular for a civilian service building.
  for (const x of [-6, 0, 6]) {
    box(`gallery:camera:${x}`, 'steel', [x, 10.15, -51.1], [.28, .16, .28], false, roof);
    box(`gallery:lens:${x}`, 'window', [x, 10.13, -50.81], [.14, .075, .015], false, roof);
  }

  // Compressor court / bypass court / split service yard: move whole towers,
  // their plinths and connecting pipe mouths, leaving different routes between.
  const towers: Positions[] = [
    [[-25, 0, -44], [-25, 0, -37], [-23, 0, -49]],
    [[-24, 0, -54], [-24, 0, -53], [-30, 0, -39]],
    [[28, 0, -53], [29, 0, -51], [29, 0, -53]],
  ];
  for (const [index, origins] of towers.entries()) module(`pressure-tower:${index}`, origins, add => {
    const height = index === 1 ? 11.8 : 9.6;
    const tower = add('body', 'steel', [0, height / 2, 0], [2.3, height / 2, 2.3], true);
    add('foot', 'concrete-dark', [0, .3, 0], [2.65, .3, 2.65], true);
    add('cap', 'concrete-dark', [0, height + .12, 0], [2.5, .12, 2.5], false, tower);
    for (const y of [1.8, height - 1.1]) {
      for (const side of [-1, 1]) {
        add(`strap-x:${y}:${side}`, 'warning', [side * 2.32, y, 0], [.035, .16, 2.34], false, tower);
        add(`strap-z:${y}:${side}`, 'warning', [0, y, side * 2.32], [2.34, .16, .035], false, tower);
      }
    }
    add('gauge', 'concrete-dark', [0, 2.5, 2.36], [.42, .55, .06], false, tower);
    add('gauge-display', 'window', [0, 2.65, 2.43], [.28, .18, .025], false, tower);
    add('pipe-mouth', 'rust', [2.65, 4, 0], [.36, .35, .35], false, tower);
  });

  // The huge rectangular pipe portal makes the north silhouette distinct even
  // from another district; the opening is wide enough for both fighters.
  const portals: Positions[] = [
    [[-23, 0, -35], [-25, 0, -46], [-24, 0, -34]],
    [[21, 0, -54], [20, 0, -54], [21, 0, -54]],
  ];
  for (const [index, origins] of portals.entries()) module(`pipe-gate:${index}`, origins, add => {
    for (const side of [-1, 1]) {
      const pipe = add(`riser:${side}`, 'rust', [side * 4.8, 3.8, 0], [.24, 3.8, .24], true);
      for (const y of [1.4, 6.8]) add(`flange:${side}:${y}`, 'steel', [side * 4.8, y, 0], [.38, .12, .38], false, pipe);
      add(`base:${side}`, 'concrete-dark', [side * 4.8, .25, 0], [.5, .25, .5], false, pipe);
    }
    const beam = add('cross-pipe', 'rust', [0, 7.6, 0], [5.05, .24, .24], true);
    add('danger-band', 'warning', [0, 7.6, .255], [.9, .26, .025], false, beam);
  });

  // Low cabinets change cover and approach angles but never seal the center.
  const cabinets: Positions[] = [
    [[-18, 0, -39], [-19, 0, -49], [-19, 0, -36]],
    [[19, 0, -35], [10, 0, -35], [27, 0, -35]],
  ];
  for (const [index, origins] of cabinets.entries()) module(`switchgear:${index}`, origins, add => {
    const body = add('body', 'concrete-dark', [0, 1.1, 0], [1.7, 1.1, .6], true);
    for (const x of [-.85, .85]) {
      add(`panel:${x}`, 'steel', [x, 1.25, .63], [.72, .8, .025], false, body);
      add(`indicator:${x}`, 'lamp', [x, 1.7, .67], [.045, .045, .015], false, body);
      add(`slot:${x}`, 'window', [x, 1.4, .67], [.35, .06, .015], false, body);
    }
    add('safety-line', 'warning', [0, .13, .64], [1.72, .06, .015], false, body);
  });
  kit.cover('service:barrier', [[-7, .55, -37], [7, .55, -37], [-7, .55, -40]], [1.35, .55, .45]);
}
