import { cookCityFacets } from '../mesh-cooking.ts';
import { block, convexPlate, type WeaponFace } from './geometry.ts';
import { bindComponentSurfaces, componentTextures } from './component-surfaces.ts';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

// Transfer of the hammer's component rules. Wear belongs to jaws and grip edges.
export const wrenchSurfaces = [
  { role: 'forged steel', color: [92, 106, 111], roughness: .53, metallic: .78 },
  { role: 'polished working jaw', color: [171, 181, 181], roughness: .34, metallic: .88 },
  { role: 'recessed handle web', color: [52, 65, 69], roughness: .68, metallic: .65 },
  { role: 'rubbed grip edge', color: [129, 143, 144], roughness: .44, metallic: .78 },
] as const;

export function cookServiceWrench() {
  const faces: WeaponFace[] = [], uvs: [number, number][] = [];
  const part = (surface: number, geometry: WeaponFace[]) => {
    faces.push(...geometry);uvs.push(...geometry.map((): [number, number] => [(surface + .5) / wrenchSurfaces.length, .5]));
  };
  // The facet cooker fan-triangulates convex faces. A single concave outline
  // crossed the open jaw and produced overlapping highlight wedges in v1.
  part(0, convexPlate([[-.23,-.97],[.23,-.97],[.28,-.84],[.23,.33],[-.23,.33],[-.28,-.84]], .44));
  part(0, convexPlate([[-.23,.29],[.23,.29],[.69,.54],[.35,.62],[-.35,.62],[-.69,.54]], .44));
  for (const side of [-1,1]) part(0, convexPlate([[side*.35,.62],[side*.69,.54],[side*.94,.94],[side*.55,.96]].map(point => [point[0]!,point[1]!] as const), .44));
  for (const side of [-1, 1]) {
    part(2, block(0, -.28, side * .445, .105, .44, .004, .18));
    part(3, convexPlate([[side*.17,-.82],[side*.23,-.79],[side*.20,-.60],[side*.175,-.61]], .447));
    part(1, convexPlate([[side*.35,.62],[side*.55,.96],[side*.61,.96],[side*.41,.60]], .445));
  }
  return cookCityFacets('Forged service wrench: open jaws, recessed web and localized wear', faces, uvs);
}

export const cookWrenchTextures = () => componentTextures('wrench', wrenchSurfaces);
export const bindWrenchSurfaces = (declaration: Hyperfocus3DDeclaration, assets?: Readonly<Record<string, string>>) => bindComponentSurfaces(declaration, 'wrench', wrenchSurfaces, assets);
