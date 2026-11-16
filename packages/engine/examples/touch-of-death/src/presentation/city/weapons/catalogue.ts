/** Object variants share eleven predictable kits; appearance explains reach and purpose. */
export const cityWeaponFamilies = {
  blade: { kit: 'combat', durability: 72, light: [12, 3, 18, 12, 16, 2], heavy: [28, 5, 40, 30, 34, 7] },
  piercing: { kit: 'combat', durability: 36, light: [10, 2, 14, 7, 12, 1], heavy: [24, 3, 34, 20, 27, 4] },
  blunt: { kit: 'combat', durability: 48, light: [15, 4, 22, 10, 18, 3], heavy: [32, 5, 48, 42, 42, 12] },
  flexible: { kit: 'combat', durability: 42, light: [14, 13, 25, 4, 12, .8], heavy: [28, 6, 40, 24, 30, 6] },
  long: { kit: 'combat', durability: 54, light: [17, 3, 24, 11, 18, 3], heavy: [32, 6, 44, 32, 36, 9] },
  heavy: { kit: 'simple', durability: 30, light: [22, 4, 34, 20, 24, 5], heavy: [40, 6, 60, 52, 48, 14] },
  fragile: { kit: 'single-use', durability: 1, light: [4, 3, 12, 3, 28, 1], heavy: [4, 3, 12, 3, 28, 1] },
  distraction: { kit: 'single-use', durability: 1, light: [5, 3, 14, 0, 10, .5], heavy: [5, 3, 14, 0, 10, .5] },
  spray: { kit: 'spray', durability: 24, light: [8, 3, 16, 7, 10, 2], heavy: [10, 5, 20, 0, 10, .5] },
  shield: { kit: 'simple', durability: 30, light: [7, 3, 15, 6, 9, 2], heavy: [13, 4, 23, 8, 15, 8] },
  ground: { kit: 'ground', durability: 1, light: [7, 1, 16, 0, 0, 0], heavy: [7, 1, 16, 0, 0, 0] },
} as const;

export const CITY_WEAPONS = [
  ['sword', 'Sword', 'blade', 1.3, .16, .07, 'metal'],
  ['machete', 'Machete', 'blade', .9, .21, .07, 'metal'],
  ['dagger', 'Dagger', 'piercing', .48, .12, .06, 'metal'],
  ['kitchen-knife', 'Kitchen knife', 'piercing', .48, .13, .05, 'metal'],
  ['screwdriver', 'Screwdriver', 'piercing', .38, .09, .09, 'metal'],
  ['baton', 'Baton', 'blunt', .7, .1, .1, 'metal'],
  ['wrench', 'Wrench', 'blunt', .56, .18, .06, 'metal'],
  ['short-pipe', 'Short pipe', 'blunt', .7, .11, .11, 'metal'],
  ['nunchaku', 'Nunchaku', 'flexible', .95, .15, .1, 'wood'],
  ['broom', 'Broom', 'long', 1.7, .4, .15, 'wood'],
  ['long-pipe', 'Long pipe', 'long', 1.9, .13, .13, 'metal'],
  ['rebar', 'Rebar', 'long', 1.8, .08, .08, 'metal'],
  ['sledgehammer', 'Sledgehammer', 'heavy', 1.1, .48, .24, 'metal'],
  ['shovel', 'Shovel', 'heavy', 1.5, .36, .11, 'metal'],
  ['folding-chair', 'Folding chair', 'heavy', 1.05, .66, .5, 'metal'],
  ['wine-glass', 'Wine glass', 'fragile', .28, .16, .16, 'wood'],
  ['wine-bottle', 'Wine bottle', 'fragile', .4, .15, .15, 'wood'],
  ['ceramic-mug', 'Ceramic mug', 'fragile', .2, .24, .16, 'wood'],
  ['plate', 'Plate', 'fragile', .3, .3, .05, 'wood'],
  ['takeout-noodles', 'Takeout noodles', 'distraction', .22, .23, .23, 'wood'],
  ['takeaway-drink', 'Takeaway drink', 'distraction', .3, .15, .15, 'wood'],
  ['flour-bag', 'Flour bag', 'distraction', .32, .25, .16, 'wood'],
  ['fire-extinguisher', 'Fire extinguisher', 'spray', .6, .3, .24, 'metal'],
  ['pepper-spray', 'Pepper spray', 'spray', .2, .07, .07, 'metal'],
  ['serving-tray', 'Serving tray', 'shield', .48, .65, .06, 'metal'],
  ['bin-lid', 'Bin lid', 'shield', .62, .62, .1, 'metal'],
  ['briefcase', 'Briefcase', 'shield', .42, .6, .16, 'wood'],
  ['oil-bottle', 'Oil bottle', 'ground', .3, .13, .13, 'wood'],
  ['detergent-bottle', 'Detergent bottle', 'ground', .36, .24, .15, 'wood'],
  ['bag-of-marbles', 'Bag of marbles', 'ground', .18, .18, .13, 'wood'],
] as const;

export type CityWeaponKey = typeof CITY_WEAPONS[number][0];

export function cityWeapon(key: string) {
  const row = CITY_WEAPONS.find(value => value[0] === key);
  if (!row) throw new Error(`Unknown city weapon ${key}.`);
  const [id, name, family, length, width, depth, material] = row;
  const definition = cityWeaponFamilies[family];
  const restPose = ['wine-glass', 'wine-bottle', 'ceramic-mug', 'takeout-noodles', 'takeaway-drink', 'flour-bag', 'fire-extinguisher', 'pepper-spray', 'briefcase', 'oil-bottle', 'detergent-bottle', 'bag-of-marbles', 'folding-chair'].includes(id) ? 'upright' as const : 'flat' as const;
  const single = definition.kit === 'single-use' || definition.kit === 'ground';
  const effect = family === 'spray' ? { durationFrames: 45, movementScale: .45, range: id === 'fire-extinguisher' ? 2.3 : 1.5, arcDegrees: 65 }
    : family === 'ground' ? { durationFrames: 360, movementScale: .5, radius: id === 'bag-of-marbles' ? 1.2 : 1.5 } : undefined;
  return { key: id, name, family, length, width, depth, material, restPose, kit: definition.kit, durability: definition.durability,
    lightMoveId: `weapon-${family}-light`, heavyMoveId: `weapon-${family}-${single ? 'light' : 'heavy'}`,
    ...(effect ? { effect } : {}), ...(family === 'spray' ? { ammo: id === 'fire-extinguisher' ? 5 : 3 } : {}) };
}
