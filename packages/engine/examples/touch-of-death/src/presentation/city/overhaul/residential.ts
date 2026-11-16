import type { DistrictKit, Positions } from './kit.ts';
import { authorCourtRoof } from './roof-core.ts';

/** Apartment wings, open rooms and inhabited-scale balconies replace a depot shell. */
export function authorResidential({ kit }: { kit: DistrictKit }) {
  const { box, module } = kit;
  authorCourtRoof({ kit, district: 'residential' });
  // Near the initial street fight, apartment entrances occupy the former empty
  // loading court. Moving the porches changes which side passage is sheltered.
  const porches: Positions[] = [
    [[-57, 0, -25], [-57, 0, -21], [-57, 0, -17]],
    [[-49, 0, -24.5], [-47, 0, -16], [-49, 0, -22]],
  ];
  for (const [index, origins] of porches.entries()) module(`entrance:${index}`, origins, add => {
    const wall = add('wall', 'plaster', [0, 2.8, 0], [1.5, 2.8, .2], true);
    const roof = add('porch-roof', 'concrete-light', [0, 3.4, .5], [1.8, .15, 1], true);
    add('base-course', 'concrete-dark', [0, .24, .23], [1.5, .24, .03], false, wall);
    add('door', 'concrete-dark', [-.75, 1.26, .225], [.53, 1.02, .025], false, wall);
    for (const side of [-1, 1]) add(`door-jamb:${side}`, 'concrete-light', [-.75 + side * .6, 1.34, .27], [.065, 1.1, .055], false, wall);
    add('door-head', 'concrete-light', [-.75, 2.43, .27], [.665, .065, .055], false, wall);
    add('window', 'window', [.8, 1.82, .24], [.42, .5, .035], false, wall);
    add('window-sill', 'concrete-light', [.8, 1.26, .3], [.53, .055, .12], false, wall);
    add('window-mullion', 'concrete-light', [.8, 1.82, .29], [.025, .5, .015], false, wall);
    add('porch-lamp', 'lamp', [1.33, 2.6, .28], [.1, .15, .04], false, wall);
    add('porch-number', 'chalk', [-.75, 2.75, .24], [.1, .065, .01], false, wall);
    add('porch-edge', 'concrete-light', [0, 3.36, 1.51], [1.8, .12, .04], false, roof);
    add('upper-window', 'window', [0, 4.5, .24], [.8, .5, .035], false, wall);
    add('upper-window-sill', 'concrete-light', [0, 3.94, .3], [.9, .055, .12], false, wall);
  });
  // Tall solid wings live outside the preserved stairs, freight lift and stock.
  // They give the entire west district a stepped, domestic skyline.
  const west = box('west-wing', 'brick', [-70.5, 7, -24], [3, 7, 10], true);
  box('west-wing:cap', 'concrete', [-70.5, 14.25, -24], [3.2, .25, 10.2], true);
  for (const [floor, y] of [3.4, 7.1, 10.8].entries()) {
    const balcony = box(`west:balcony:${floor}`, 'concrete', [-66.4, y, -24], [1.1, .15, 9], true);
    box(`west:rail:${floor}`, 'steel', [-65.3, y + .65, -24], [.07, .45, 9], true, balcony);
    for (let room = 0; room < 4; room++) {
      const z = -31 + room * 4.6;
      box(`west:door:${floor}:${room}`, 'steel', [-67.46, y + 1.2, z], [.035, 1.05, .7], false, west);
      box(`west:window:${floor}:${room}`, 'window', [-67.45, y + 1.5, z + 1.55], [.04, .55, .55], false, west);
      box(`west:balcony-divider:${floor}:${room}`, 'concrete-dark', [-66.4, y + .65, z - .85], [1.1, .5, .07], false, balcony);
    }
  }
  module('north', [[-53, 0, -37], [-59, 0, -42], [-45, 0, -44]], add => {
    const north = add('wing', 'concrete-dark', [0, 9, 0], [10, 9, 3.5], true);
    add('cap', 'concrete', [0, 18.25, 0], [10.3, .25, 3.8], true);
    for (const [floor, y] of [3, 7, 11, 15].entries()) {
      const balcony = add(`balcony:${floor}`, 'concrete', [0, y, 4.6], [9.2, .15, 1.1], true);
      add(`rail:${floor}`, 'steel', [0, y + .65, 5.7], [9.2, .45, .06], true, balcony);
      for (let room = 0; room < 4; room++) {
        const x = -7 + room * 4.6;
        add(`door:${floor}:${room}`, 'steel', [x, y + 1.15, 3.54], [.65, 1.05, .035], false, north);
        add(`window:${floor}:${room}`, 'window', [x + 1.55, y + 1.55, 3.55], [.55, .55, .04], false, north);
      }
    }
    add('observation', 'steel', [7.8, 8.5, 3.57], [.65, .2, .04], false, north);
    add('observation-slit', 'window', [7.8, 8.5, 3.62], [.48, .07, .018], false, north);
  });

  // A low two-ended apartment is walkable, with an internal island that gives
  // doorway pressure and an escape around either side. The whole room changes
  // position between arrangements, opening a courtyard or a long street passage.
  module('apartment', [[-52, 0, -6], [-45, 0, -8], [-59, 0, -7]], add => {
    const roof = add('ceiling', 'concrete', [0, 3.4, 0], [4.6, .18, 3.2], true);
    for (const side of [-1, 1]) {
      const wall = add(`wall:${side}`, 'plaster', [side * 4.5, 1.6, 0], [.18, 1.6, 3], true);
      add(`wall:skirting:${side}`, 'concrete-dark', [side * 4.3, .14, 0], [.025, .14, 3], false, wall);
      add(`door-frame:${side}`, 'steel', [side * 2.3, 1.6, 3.1], [.1, 1.6, .1], false, roof);
      add(`lintel:${side}`, 'concrete-dark', [0, 3, side * 3.1], [4.4, .28, .1], false, roof);
    }
    const island = add('kitchen-island', 'concrete-dark', [1.8, .55, 0], [.65, .55, 1.15], true);
    add('kitchen-top', 'steel', [1.8, 1.13, 0], [.7, .03, 1.2], false, island);
    add('kitchen-mark', 'chalk', [1.8, 1.17, -.55], [.28, .008, .3], false, island);
    add('interior-light', 'lamp', [0, 3.18, 0], [.6, .04, .08], false, roof);
    add('orange-entry-band', 'warning', [0, 3.12, 3.22], [1.6, .09, .025], false, roof);
  });

  // A second room faces the retained breach wall. Broad open ends permit a
  // northern escape into maintenance access without cutting through traffic.
  module('laundry', [[-51, 0, -30], [-58, 0, -30], [-47, 0, -30]], add => {
    const roof = add('roof', 'concrete', [0, 3.3, 0], [2.7, .15, 1.6], true);
    const back = add('back', 'plaster', [0, 1.5, -1.5], [2.7, 1.5, .15], true);
    add('machine-row', 'concrete-dark', [-1, .65, -.9], [1.2, .65, .55], true);
    for (const x of [-1.6, -.4]) {
      add(`machine:${x}`, 'steel', [x, .75, -.33], [.46, .46, .025], false, back);
      add(`machine-face:${x}`, 'window', [x, .75, -.3], [.22, .22, .015], false, back);
    }
    add('entry-band', 'warning', [0, 3.08, 1.62], [2.3, .1, .025], false, roof);
  });

  // Stair access and the fixed six-metre exercise corner stay clear. Roof garden
  // walls alter the usable terrace edges without supplying a free weapon.
  module('terrace-screen', [[-58, 6, -25.3], [-47, 6, -25.3], [-57.5, 6, -18.6]], add => {
    const planter = add('planter', 'concrete-dark', [0, .4, 0], [1.4, .4, .4], true);
    add('screen', 'steel', [0, 1.4, 0], [1.4, .55, .08], true);
    add('screen-mark', 'warning', [0, 1.45, .09], [.6, .07, .015], false, planter);
  });
  kit.cover('courtyard-divider', [[-57, .65, -12], [-52, .65, -10], [-44, .65, -16]], [1.2, .65, .45], 'plaster');
}
