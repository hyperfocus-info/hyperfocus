import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { CITY_WEAPONS, type CityWeaponKey } from './catalogue.ts';
import { bindWrenchSurfaces } from './service-wrench.ts';
import { bindHammerSurfaces } from './sledgehammer.ts';

// Solid local color separates recognizable household materials without texture noise.
const colors: Record<CityWeaponKey, readonly [number, number, number]> = {
  sword: [.65, .68, .67], machete: [.53, .57, .53], dagger: [.56, .59, .58], 'kitchen-knife': [.73, .74, .69],
  screwdriver: [.72, .4, .17], baton: [.23, .25, .23], wrench: [.7, .72, .67], 'short-pipe': [.65, .68, .63],
  nunchaku: [.45, .29, .16], broom: [.62, .48, .27], 'long-pipe': [.63, .67, .63], rebar: [.45, .32, .22],
  sledgehammer: [.57, .6, .55], shovel: [.65, .67, .57], 'folding-chair': [.4, .45, .39],
  'wine-glass': [.65, .68, .63], 'wine-bottle': [.16, .32, .19], 'ceramic-mug': [.82, .76, .61],
  plate: [.86, .81, .69], 'takeout-noodles': [.76, .59, .4], 'takeaway-drink': [.56, .28, .2], 'flour-bag': [.72, .66, .47],
  'fire-extinguisher': [.67, .14, .095], 'pepper-spray': [.25, .24, .2], 'serving-tray': [.58, .61, .56],
  'bin-lid': [.39, .45, .38], briefcase: [.35, .24, .18], 'oil-bottle': [.48, .36, .13],
  'detergent-bottle': [.48, .56, .31], 'bag-of-marbles': [.51, .36, .3],
};

/** Refresh only the generated catalogue materials, including their isolated pickup copies. */
export function authorCityWeaponMaterials(declaration: Hyperfocus3DDeclaration) {
  for (const [key, , , , , , substance] of CITY_WEAPONS) {
    const id = `tod:city:weapon-material:${key}`;
    const polished = ['sword', 'dagger', 'kitchen-knife', 'serving-tray', 'wine-glass', 'wine-bottle', 'oil-bottle', 'ceramic-mug', 'plate'].includes(key);
    const painted = ['screwdriver', 'baton', 'folding-chair', 'fire-extinguisher', 'pepper-spray', 'bin-lid'].includes(key);
    const exposedSteel = ['wrench', 'short-pipe', 'long-pipe', 'sledgehammer', 'shovel'].includes(key);
    const baseColor: [number, number, number, number] = [...colors[key], 1];
    // Broad diffuse steel faces stay readable on charcoal counters in shadow;
    // a strong metallic response otherwise leaves only the pickup edge visible.
    const look = { baseColor, metallic: exposedSteel ? .25 : substance === 'metal' && !painted ? .55 : 0, roughness: polished ? .3 : exposedSteel ? .46 : painted ? .62 : .83 };
    const existing = declaration.materials.find(material => material.id === id);
    if (existing) Object.assign(existing, look);
    else declaration.materials.push({ id, shading: 'lit', ...look, doubleSided: false });
    const outlined = declaration.materials.find(material => material.id === `${id}:pickup-outline`);
    if (outlined) Object.assign(outlined, look);
  }
  bindHammerSurfaces(declaration);
  bindWrenchSurfaces(declaration);
}
