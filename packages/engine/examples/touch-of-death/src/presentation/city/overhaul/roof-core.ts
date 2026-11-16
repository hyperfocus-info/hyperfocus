import type { DistrictKit, Positions } from './kit.ts';

/** Keep inspected starts and every legal station pose; move most of the roof area. */
export function authorCourtRoof({ kit, district }: { kit: DistrictKit; district: 'market' | 'residential' }) {
  const market = district === 'market';
  const x = market ? 47.5 : -52.5, z = market ? 14.7 : -21.3;
  kit.box('roof:core', 'concrete', [x, 5.8, z], [5.5, .2, 1.9], true);
  kit.box('roof:stair-link', 'concrete', [x - 6.5, 5.8, z], [1, .2, 1.9], true);
  kit.box('roof:lift-link', 'steel', [x + 6.25, 5.8, z - .7], [.75, .2, 1.2], true);
  const positions: Positions = market
    ? [[48, 5.8, 10], [53, 5.8, 19.4], [45, 5.8, 19.4]]
    : [[-52.5, 5.8, -26], [-48, 5.8, -16.6], [-55, 5.8, -16.6]];
  kit.module('roof:wing', positions, add => {
    // Adjacent/overlapping support tops must share one material; alternating
    // coplanar concrete colors flickered at the assembly seam in moving captures.
    const deck = add('deck', 'concrete', [0, 0, 0], [5.5, .2, 2.8], true);
    for (const side of [-1, 1]) add(`edge:${side}`, market ? 'warning' : 'chalk', [side * 5.45, .22, 0], [.045, .025, 2.8], false, deck);
  });
}
