import type { DistrictKit } from './kit.ts';

/** Open concrete skeleton, occupied scaffold floors and movable site compounds. */
export function authorConstruction({ kit }: { kit: DistrictKit }) {
  // The small assembly gantry occupies a different side of the starting fight.
  // Its table is usable cover; the open frame leaves a walkable escape behind it.
  kit.module('assembly-bay', [[15, 0, 6], [-13, 0, 5], [15, 0, -7]], add => {
    for (const side of [-1, 1]) {
      const post = add(`post:${side}`, 'warning', [side * 2.2, 2.45, -.7], [.13, 2.45, .13], true);
      add(`foot:${side}`, 'steel', [side * 2.2, .1, -.7], [.35, .1, .35], false, post);
    }
    add('beam', 'warning', [0, 4.8, -.7], [2.5, .17, .2], true);
    const bench = add('workbench', 'concrete-light', [0, .7, 0], [1.65, .7, .65], true);
    add('top', 'steel', [0, 1.45, 0], [1.75, .05, .7], false, bench);
    for (const x of [-.8, 0, .8]) add(`offcut:${x}`, 'rust', [x, 1.56, 0], [.06, .06, .55], false, bench);
    add('hoist', 'steel', [0, 3.7, -.7], [.04, .95, .04]);
    add('hook', 'warning', [0, 2.7, -.7], [.16, .1, .06]);
  });
  kit.module('unfinished-wing', [[10, 0, -16], [17, 0, -17], [9, 0, -21]], add => {
    for (const x of [-3, 3]) for (const z of [-3.5, 3.5]) {
      const column = add(`column:${x}:${z}`, 'concrete-light', [x, 6, z], [.4, 6, .4], true);
      add(`foot:${x}:${z}`, 'warning', [x, .2, z], [.65, .2, .65], false, column);
      add(`rebar:${x}:${z}`, 'steel', [x, 12.75, z], [.06, .75, .06], false, column);
    }
    for (const y of [3, 6, 9]) {
      const floor = add(`floor:${y}`, 'concrete', [0, y - .2, 0], [3.6, .2, 4.1], true);
      add(`floor-edge:${y}`, 'warning', [0, y + .02, 4.03], [3.6, .04, .08], false, floor);
      for (const x of [-3.4, 3.4]) add(`crossbar:${y}:${x}`, 'steel', [x, y + .8, 0], [.05, .05, 3.8], false, floor);
    }
    // Broad half-metre treads offer an ordinary walk onto the first scaffold.
    for (let step = 0; step < 6; step++) add(`stair:${step}`, 'steel', [-5, (step + 1) / 4, 3 - step], [1.2, (step + 1) / 4, .5], true);
    add('stair-landing', 'steel', [-3.75, 2.8, -2.5], [.75, .2, 1.2], true);
    for (const z of [-2.2, 1.5]) add(`formwork:${z}`, 'warning', [0, .7, z], [2, .7, .22], true);
  });
  kit.module('site-office', [[-16, 0, 23], [10, 0, 22], [-15, 0, -23]], add => {
    const roof = add('roof', 'steel', [0, 3.1, 0], [3.5, .15, 2.5], true);
    // Two open ends allow pursuit through the compound, not an ornamental box.
    for (const side of [-1, 1]) {
      add(`wall:${side}`, 'warning', [side * 3.3, 1.5, 0], [.16, 1.5, 2.4], true);
      add(`window:${side}`, 'window', [side * 3.47, 1.9, 0], [.02, .55, 1.35], false, roof);
    }
    add('lintel', 'steel', [0, 2.75, 2.35], [3.3, .2, .15], false, roof);
    add('service-panel', 'paint', [-3.48, 1.3, 1.7], [.03, .4, .4], false, roof);
  });
  kit.cover('stacked-formwork', [[-9, .8, 11], [-9, .8, 22], [-17, .8, 8]], [2.2, .8, .65], 'concrete-light');
  kit.cover('roof-offcuts', [[-3.5, 6.6, 2.5], [-4.7, 6.6, .5], [-1, 6.6, 2.4]], [.65, .6, 1], 'tool-wood');
  // A high frame gives the worksite a silhouette visible from all normal starts.
  const beam = kit.box('lifting-frame', 'warning', [[14, 13, -16], [21, 13, -17], [13, 13, -21]], [10.4, .35, .45]);
  kit.box('hoist-line', 'steel', [[24, 10.7, -16], [31, 10.7, -17], [23, 10.7, -21]], [.045, 2, .045], false, beam);
  kit.box('hoist-hook', 'warning', [[24, 8.6, -16], [31, 8.6, -17], [23, 8.6, -21]], [.18, .15, .08], false, beam);
}
