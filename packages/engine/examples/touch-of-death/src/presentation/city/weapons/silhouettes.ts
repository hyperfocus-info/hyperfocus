import type { CityWeaponKey } from './catalogue.ts';
import { bar, block, hoop, move, plate, transform, vessel, type WeaponFace } from './geometry.ts';

const grip = (width: number, bottom: number, top: number) => vessel([[bottom, width * .8], [bottom + .04, width], [top - .04, width], [top, width * .8]], .8, 8);
const bottle = (oil: boolean) => vessel([[-.98, .58], [-.89, .76], [.16, .76], [.4, .34], [.86, .3], [.9, .38], [.98, .38]], oil ? .74 : 1);
const container = (bottom: number, top: number, radius: number) => vessel([[bottom, radius * .76], [bottom + .08, radius], [top - .08, radius], [top, radius * .82]]);
const knife = (key: CityWeaponKey): WeaponFace[] => {
  const sword = key === 'sword', dagger = key === 'dagger', bottom = sword ? -.44 : -.3;
  const outline: readonly (readonly [number, number])[] = key === 'machete' ? [[-.34, bottom], [.62, bottom], [.92, .58], [.67, .9], [.1, .99], [-.34, .84]]
    : key === 'kitchen-knife' ? [[-.58, bottom], [.87, bottom], [.82, .68], [-.42, .98], [-.58, .91]]
      : [[-.54, bottom], [.54, bottom], [.48, dagger ? .53 : .72], [0, .99], [-.48, dagger ? .53 : .72]];
  return [...plate(outline, .35), ...grip(.34, -.96, bottom),
    ...(sword || dagger ? block(0, bottom, 0, .92, .045, .58) : block(0, bottom, 0, .38, .035, .42)),
    ...block(0, -.97, 0, .39, .025, .46),
    ...[-.82, -.66, -.5].filter(y => y < bottom).flatMap(y => block(0, y, .3, .35, .012, .055))];
};

/** One closed, faceted mesh per pickup; Y remains the gameplay grip/reach axis. */
export function cityWeaponFaces(key: CityWeaponKey): WeaponFace[] {
  switch (key) {
    case 'sword': case 'dagger': case 'machete': case 'kitchen-knife': return knife(key);
    case 'short-pipe': case 'long-pipe': return vessel([[-.98, .6], [-.89, .69], [-.78, .69], [-.74, .6], [.79, .6], [.84, .7], [.94, .7], [.98, .6], [.98, .38], [-.98, .38]], 1, 8, true);
    case 'screwdriver': return [...grip(.89, -.99, -.24), ...vessel([[-.27, .5], [-.21, .5], [-.18, .22], [.81, .22]], 1, 8),
      ...plate([[-.22, .77], [.22, .77], [.36, .99], [-.36, .99]], .14)];
    case 'baton': return [...grip(.74, -.96, -.35), ...vessel([[-.36, .9], [-.3, .9], [-.27, .65], [.92, .65], [.98, .5]], 1, 8),
      ...bar(.5, -.39, 0, .46, .065, .48), ...block(.93, -.39, 0, .065, .09, .56)];
    case 'wrench': return [...plate([[-.2, -.87], [.2, -.87], [.27, .48], [-.27, .48]], .42), ...block(0, .46, 0, .7, .12, .48),
      ...plate([[.43, .5], [.76, .5], [.94, .93], [.5, .85]], .55), ...plate([[-.76, .5], [-.43, .5], [-.5, .85], [-.94, .93]], .55),
      ...move(transform(vessel([[-.13, .42], [.13, .42], [.13, .2], [-.13, .2]], 1, 8, true), 1, 1, .45, 1.5707963267948966), 0, -.79, 0)];
    case 'nunchaku': return [...move(grip(.39, -.94, -.13), -.39, 0, 0), ...move(grip(.39, .13, .94), .39, 0, 0),
      ...bar(0, 0, 0, .055, .21, .1, -.85), ...block(-.39, -.14, 0, .22, .045, .48), ...block(.39, .14, 0, .22, .045, .48)];
    case 'broom': return [...grip(.13, -.67, .98), ...block(0, -.74, 0, .88, .07, .76),
      ...[-.8, -.6, -.4, -.2, 0, .2, .4, .6, .8].flatMap(x => bar(x, -.908, 0, .08, .085, .65, x * .12))];
    case 'rebar': return [...grip(.62, -.98, .98), ...[-.85, -.65, -.45, -.25, -.05, .15, .35, .55, .75, .9].flatMap(y => bar(0, y, 0, .77, .013, .73, .04))];
    case 'sledgehammer': return [...bar(0, -.14, 0, .12, .84, .24), ...block(0, .66, 0, .97, .23, .87),
      ...block(-.86, .66, 0, .12, .26, .97), ...block(.86, .66, 0, .12, .26, .97), ...block(0, .95, 0, .13, .04, .3)];
    case 'shovel': return [...plate([[-.79, -.52], [-.42, -.9], [0, -.99], [.42, -.9], [.79, -.52], [.68, -.28], [-.68, -.28]], .58),
      ...bar(0, .18, 0, .13, .62, .3), ...hoop(0, .81, 0, .33, .12, .07), ...block(0, -.43, .45, .16, .23, .12)];
    case 'folding-chair': return [...block(0, -.02, .1, .86, .08, .79), ...block(0, .68, -.69, .86, .27, .13),
      ...[-.8, .8].flatMap(x => [...bar(x, -.48, -.39, .07, .5, .07, -.09), ...bar(x, -.48, .64, .07, .5, .07, .09), ...bar(x, .4, -.69, .07, .47, .07)]),
      ...bar(0, -.68, -.39, .83, .045, .055), ...bar(0, -.65, .64, .83, .045, .055)];
    case 'wine-glass': return [...vessel([[-.96, .75], [-.9, .8], [-.83, .22], [-.22, .12], [-.06, .53], [.4, .87], [.94, .78], [.94, .64], [.41, .71], [.08, .44]], 1, 10)];
    case 'wine-bottle': return bottle(false);
    case 'oil-bottle': return [...bottle(true), ...block(0, .89, 0, .4, .1, .32)];
    case 'ceramic-mug': return [...move(vessel([[-.91, .56], [-.83, .65], [.88, .65], [.96, .61], [.96, .47], [-.66, .47]], 1.2), -.25, 0, 0),
      ...hoop(.59, .02, 0, .32, .53, .09)];
    case 'plate': return transform(vessel([[-.33, .67], [-.23, .9], [.26, .98], [.36, .92], [-.05, .72], [-.12, .08]], 1, 12), 1, 1, 1, 1.5707963267948966);
    case 'takeout-noodles': return [...block(0, -.17, 0, .69, .64, .69, .22), ...block(0, .51, 0, .87, .07, .87),
      ...bar(-.23, .79, .03, .035, .2, .045, -.23), ...bar(.17, .79, -.05, .035, .2, .045, .18), ...bar(0, .49, .75, .44, .16, .045)];
    case 'takeaway-drink': return [...vessel([[-.96, .53], [-.84, .57], [.63, .78], [.65, .94], [.75, .94], [.81, .8]]),
      ...bar(.24, .895, 0, .052, .1, .052, -.12)];
    case 'flour-bag': return [...block(0, -.14, 0, .79, .77, .77, .27), ...block(0, .68, 0, .74, .075, .64), ...block(0, .83, 0, .76, .06, .2)];
    case 'fire-extinguisher': return [...container(-.98, .54, .67), ...bar(0, .65, 0, .16, .12, .22), ...bar(.04, .88, 0, .48, .055, .18),
      ...bar(.2, .78, 0, .38, .04, .16, -.12), ...block(.74, -.08, .08, .065, .61, .1), ...block(.55, .48, .08, .2, .055, .1),
      ...block(.74, -.69, .08, .12, .075, .17), ...block(0, .68, .34, .22, .075, .1)];
    case 'pepper-spray': return [...container(-.98, .67, .76), ...block(0, .82, 0, .57, .15, .58), ...block(0, .82, .72, .23, .055, .21)];
    case 'serving-tray': return [...block(0, 0, -.5, .82, .8, .14), ...[-1, 1].flatMap(side => [...block(side * .88, 0, -.28, .08, .87, .35), ...block(0, side * .86, -.28, .88, .08, .35)]),
      ...hoop(-.85, 0, .27, .09, .3, .045), ...hoop(.85, 0, .27, .09, .3, .045)];
    case 'bin-lid': return [...transform(vessel([[-.24, .98], [-.08, .98], [.25, .82], [.32, .5], [.33, .06]], 1, 12), 1, 1, 1, 1.5707963267948966), ...hoop(0, 0, .61, .25, .09, .06)];
    case 'briefcase': return [...block(0, -.14, 0, .96, .7, .83), ...hoop(0, .765, 0, .31, .16, .075),
      ...[-.6, .6].flatMap(x => block(x, .39, .86, .06, .09, .04)), ...block(0, -.14, .87, .89, .035, .035)];
    case 'detergent-bottle': return [...move(container(-.97, .4, .68), -.24, 0, 0), ...block(-.36, .57, 0, .33, .23, .5), ...block(-.37, .88, 0, .31, .1, .47),
      ...hoop(.54, .25, 0, .34, .4, .095)];
    case 'bag-of-marbles': return [...vessel([[-.95, .43], [-.71, .78], [-.12, .87], [.46, .28], [.66, .34], [.83, .6], [.96, .48]], .8, 8), ...block(0, .53, 0, .35, .065, .33)];
  }
}
