import { cookCityFacets } from '../mesh-cooking.ts';
import { bindComponentSurfaces, componentTextures } from './component-surfaces.ts';
import { block, vessel, type WeaponFace } from './geometry.ts';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

// These surfaces describe actual components, not rarity or independent random colors.
export const hammerSurfaces = [
  { role: 'forged head', color: [86, 99, 104], roughness: .48, metallic: .8 },
  { role: 'striking face', color: [174, 181, 176], roughness: .3, metallic: .9 },
  { role: 'ash handle', color: [139, 105, 65], roughness: .82, metallic: 0 },
  { role: 'rubber grip', color: [33, 42, 43], roughness: .93, metallic: 0 },
  { role: 'retaining collar', color: [109, 117, 112], roughness: .42, metallic: .75 },
  { role: 'grip ridges', color: [47, 56, 55], roughness: .88, metallic: 0 },
] as const;

export function cookServiceHammer() {
  const faces: WeaponFace[] = [], uvs: [number, number][] = [];
  const part = (surface: number, geometry: WeaponFace[]) => {
    faces.push(...geometry);uvs.push(...geometry.map((): [number, number] => [(surface + .5) / hammerSurfaces.length, .5]));
  };
  part(2, vessel([[-.98, .11], [-.88, .12], [-.2, .115], [.45, .105], [.92, .12]], .7, 8));
  part(3, vessel([[-.99, .135], [-.95, .155], [-.49, .145], [-.44, .125]], .8, 10));
  for (const y of [-.88, -.79, -.70, -.61, -.52]) part(5, vessel([[y-.008, .147], [y+.008, .147]], .8, 10));
  part(4, block(0, .54, 0, .17, .085, .24, .18));
  part(0, block(0, .78, 0, .79, .16, .69, .18));
  for (const side of [-1, 1]) part(1, block(side * .87, .78, 0, .10, .145, .66, .10));
  part(4, block(0, .955, 0, .10, .025, .22, .1));
  return cookCityFacets('Service sledgehammer: forged head, ash shaft and rubber grip', faces, uvs);
}

export const cookHammerTextures = () => componentTextures('sledgehammer', hammerSurfaces);

export const bindHammerSurfaces = (declaration: Hyperfocus3DDeclaration, assets?: Readonly<Record<string, string>>) => bindComponentSurfaces(declaration, 'sledgehammer', hammerSurfaces, assets);
