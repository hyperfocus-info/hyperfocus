import type { DistrictKit, Positions } from './kit.ts';
import { authorCourtRoof } from './roof-core.ts';

/** Broad awnings and open serving aisles make the market readable at fighter height. */
export function authorMarket({ kit }: { kit: DistrictKit }) {
  const { module } = kit;
  authorCourtRoof({ kit, district: 'market' });
  // The street fight begins under the retained terrace. Full-size serving
  // stalls belong inside that view, where their placement changes the approach
  // to the rear opening and gives a low landing on the way to the roof.
  const streetStalls: Positions[] = [
    [[44, 0, 15], [45, 0, 12], [45, 0, 15.5]],
    [[51.8, 0, 13], [51.8, 0, 15.3], [50.5, 0, 12.5]],
  ];
  for (const [index, origins] of streetStalls.entries()) module(`street-stall:${index}`, origins, add => {
    const canopy = add('canopy', 'concrete-light', [0, 3.3, 0], [2.3, .15, 1.25], true);
    for (let stripe = 0; stripe < 5; stripe++) {
      const x = -1.84 + stripe * .92;
      add(`stripe:${stripe}`, stripe % 2 ? 'concrete-light' : 'warning', [x, 3.465, 0], [.455, .015, 1.25], false, canopy);
      add(`valance:${stripe}`, stripe % 2 ? 'concrete-light' : 'warning', [x, 3.03, 1.24], [.455, .25, .06], false, canopy);
    }
    const counter = add('counter', 'concrete-dark', [0, .55, -.7], [1.5, .55, .45], true);
    add('serving-top', 'concrete-light', [0, 1.13, -.7], [1.6, .03, .5], false, counter);
    add('serving-shelf', 'warning', [0, .85, -.23], [1.25, .13, .025], false, counter);
    for (const side of [-1, 1]) add(`post:${side}`, 'steel', [side * 1.8, 1.55, -1], [.12, 1.55, .12], true);
    add('menu', 'concrete-dark', [0, 2.6, -.98], [.65, .28, .04], false, canopy);
    add('menu-line', 'chalk', [0, 2.62, -.93], [.4, .035, .012], false, canopy);
  });
  // A stepped food hall replaces the identical loading-court silhouette. Its
  // frontage is open, with the existing six-metre roof functioning as a terrace.
  const halls: Positions[] = [[[45, 0, 6.5], [45.4, 0, 6.5], [48, 0, 6.5]], [[57, 0, 6.5], [54, 0, 6.5], [58, 0, 6.5]]];
  for (const [index, positions] of halls.entries()) module(`hall:${index}`, positions, add => {
    const wall = add('back', 'concrete-dark', [0, 4.3, 0], [3, 4.3, .45], true);
    add('crown', 'steel', [0, 8.8, 0], [3.2, .25, 1], true);
    add('sign', 'warning', [0, 7.45, .52], [2.8, .7, .06], false, wall);
    for (const side of [-1, 1]) {
      add(`shutter:${side}`, 'steel', [side * 1.5, 3, .5], [1.15, 2.5, .055], false, wall);
      add(`clerestory:${side}`, 'window', [side * 1.5, 8.15, .525], [1.1, .23, .04], false, wall);
      add(`sign-mark:${side}`, 'concrete-dark', [side * 1.5, 7.45, .595], [.65, .34, .018], false, wall);
    }
    add('observation-panel', 'steel', [2.4, 5.8, .53], [.4, .3, .07], false, wall);
    add('observation-lens', 'window', [2.4, 5.8, .61], [.2, .12, .025], false, wall);
  });
  // The giant striped canopy is a traversable deck, with a raised clear entrance
  // beneath it. Its edge reads from the ordinary street and roof fight cameras.
  module('terrace', [[48, 0, 12], [55, 0, 2], [63, 0, 24]], add => {
    const canopy = add('awning', 'steel', [0, 9.3, 0], [7, .18, 3], true);
    for (let index = 0; index < 7; index++) {
      add(`stripe:${index}`, index % 2 ? 'concrete-dark' : 'warning', [-6 + index * 2, 9.49, 0], [.98, .012, 3], false, canopy);
      add(`valance:${index}`, index % 2 ? 'concrete-dark' : 'warning', [-6 + index * 2, 9.04, 3.02], [.98, .26, .06], false, canopy);
    }
    for (const side of [-1, 1]) add(`frame:${side}`, 'steel', [side * 5, 4.65, -3.4], [.18, 4.65, .18], true);
    add('service-light', 'lamp', [0, 9.05, 2.75], [2, .06, .06], false, canopy);
  });

  const aisles: Positions[] = [
    [[65, 0, 18], [63, 0, 30], [54, 0, 32]],
    [[56, 0, 29], [69, 0, 19], [67, 0, 36]],
  ];
  for (const [index, origins] of aisles.entries()) module(`aisle:${index}`, origins, add => {
    const roof = add('canopy', 'steel', [0, 4.1, 0], [4.4, .15, 3], true);
    for (let stripe = 0; stripe < 5; stripe++) {
      add(`cloth:${stripe}`, stripe % 2 ? 'concrete-dark' : 'warning', [-3.52 + stripe * 1.76, 4.27, 0], [.87, .012, 3], false, roof);
      add(`valance:${stripe}`, stripe % 2 ? 'concrete-dark' : 'warning', [-3.52 + stripe * 1.76, 3.83, 3], [.87, .25, .06], false, roof);
    }
    // The serving counter makes each moved hall alter ground cover and the
    // available passage. Both open sides remain wide enough for a fight.
    const counter = add('counter', 'concrete-dark', [0, .65, -1.8], [3.1, .65, .75], true);
    add('counter:top', 'steel', [0, 1.32, -1.8], [3.15, .035, .8], false, counter);
    add('counter:public-band', 'warning', [0, .95, -.99], [2.7, .14, .035], false, counter);
    for (const side of [-1, 1]) add(`frame:${side}`, 'steel', [side * 4.1, 2, -2.65], [.16, 2, .16], true);
    add('suspended-light', 'lamp', [0, 3.84, .1], [1.2, .06, .06], false, roof);
    add('menu-board', 'concrete-dark', [0, 3.22, -2.9], [1.6, .45, .08], false, roof);
    for (const side of [-1, 1]) add(`menu-mark:${side}`, 'chalk', [side * .7, 3.24, -2.8], [.35, .035, .015], false, roof);
  });

  // Rolling service kiosks change the route around the fixed starting plaza.
  module('kiosk', [[59.5, 0, 22], [66, 0, 10], [56, 0, 25]], add => {
    const body = add('body', 'concrete-dark', [0, .95, 0], [1.8, .95, 1.1], true);
    add('top', 'steel', [0, 1.93, 0], [1.85, .04, 1.15], false, body);
    add('front', 'warning', [0, 1, 1.125], [1.55, .5, .025], false, body);
    const screen = add('service-board', 'steel', [0, 3.1, -.8], [1.6, .5, .08]);
    add('service-mark', 'chalk', [0, 3.1, -.7], [.75, .055, .015], false, screen);
    for (const side of [-1, 1]) add(`upright:${side}`, 'steel', [side * 1.6, 2.5, -.8], [.07, .7, .07], false, body);
  });

  // Civilian signage doubles as a concealed observation point, visibly repeated
  // in the utility district. Keep it blue and small against the orange market.
  kit.cover('delivery-stack', [[60, .8, 24], [59, .8, 13], [61, .8, 38]], [1.5, .8, .8]);
}
