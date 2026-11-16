import type { ArtFixture } from '../art-direction/fixture.ts';
import { cookFighterProfile } from '../fighter-profile.ts';
import { cookCityFacets } from '../city/mesh-cooking.ts';
import { cookTouchOfDeathImpactModel } from '../effects-model.ts';
import { particleRecipes, validateCosmeticRecipes } from './direction.ts';

/** Fits fighter C's torso origin and reviewed shoulders; never scales the body to fit a garment. */
export function addCosmeticModels(fixture: ArtFixture) {
  validateCosmeticRecipes();
  fixture.model('cosmetic-stroke', cookTouchOfDeathImpactModel().bytes);
  fixture.model('cosmetic-grit', cookCityFacets('Asymmetric street grit', [
    [[-.9, -.3, -.6], [1, -.25, -.45], [.55, -.25, .8], [-.6, -.25, .6]],
    [[-.9, -.3, -.6], [-.6, -.25, .6], [-.1, .5, .05]], [[-.6, -.25, .6], [.55, -.25, .8], [-.1, .5, .05]],
    [[.55, -.25, .8], [1, -.25, -.45], [-.1, .5, .05]], [[1, -.25, -.45], [-.9, -.3, -.6], [-.1, .5, .05]],
  ]));
  for (const recipe of particleRecipes) fixture.declaration.materials.push({ id: `cosmetic-${recipe.id}`, shading: recipe.id === 'classic' ? 'lit' : 'unlit', baseColor: [...recipe.color, 1], roughness: .9, metallic: 0, doubleSided: recipe.id === 'relay' });
  const profiles = {
    jacket: [[1.01, .188, .135, 0], [1.10, .19, .141, 0], [1.40, .248, .17, 0], [1.58, .281, .153, 0], [1.635, .20, .12, 0], [1.69, .087, .077, 0]],
    vest: [[1.045, .175, .13, 0], [1.17, .18, .14, 0], [1.40, .23, .167, 0], [1.56, .24, .15, 0], [1.64, .17, .11, 0], [1.68, .083, .075, 0]],
    signature: [[.99, .175, .135, 0], [1.06, .184, .142, 0], [1.20, .19, .148, 0], [1.43, .25, .171, 0], [1.58, .282, .156, 0], [1.635, .20, .124, 0], [1.70, .088, .081, 0]],
    relay: [[1.015, .184, .138, 0], [1.10, .186, .143, 0], [1.35, .225, .168, 0], [1.56, .305, .156, 0], [1.635, .26, .129, 0], [1.70, .12, .089, 0], [1.74, .10, .083, 0]],
  } as const;
  for (const [id, rings] of Object.entries(profiles)) fixture.model(`cosmetic-top-${id}`, cookFighterProfile(`Fighter C ${id} tailoring`, rings));
  // Shallow panels hug the existing jacket surface. Large readable cut before hardware.
  const panelsByStyle: Record<string, Parameters<typeof cookCityFacets>[1]> = {
    gi: [[[0, 1.2, .16], [.001, 1.2, .16], [0, 1.201, .16]]],
    jacket: [[[-.21, 1.43, .12], [-.12, 1.58, .15], [.12, 1.58, .15], [.21, 1.43, .12], [.15, 1.40, .155], [-.15, 1.40, .155]]],
    vest: [[[-.08, 1.12, .15], [-.04, 1.12, .15], [.15, 1.57, .155], [.1, 1.58, .16]]],
    signature: [[[-.21, 1.4, .127], [-.16, 1.58, .15], [.19, 1.53, .147], [.16, 1.43, .162], [-.10, 1.45, .179], [-.14, 1.39, .167]], [[-.17, 1.09, .12], [.17, 1.09, .12], [.17, 1.11, .128], [-.17, 1.11, .128]]],
    relay: [[[-.10, 1.72, .10], [-.20, 1.61, .14], [.10, 1.14, .155], [.17, 1.20, .146]], [[.11, 1.72, .10], [.205, 1.61, .13], [.055, 1.37, .185], [.01, 1.44, .19]], [[-.18, 1.07, .133], [.18, 1.07, .133], [.18, 1.13, .14], [-.18, 1.13, .14]]],
  };
  const profileLookup: Readonly<Partial<Record<string, typeof profiles[keyof typeof profiles]>>> = profiles;
  for (const [id, panels] of Object.entries(panelsByStyle)) {
    const rings = profileLookup[id];
    if (!rings) { fixture.model(`cosmetic-panel-${id}`, cookCityFacets(`Tailored ${id} panel`, panels));continue; }
    // A flat chord cuts through a curved jacket, leaving disconnected diamond
    // fragments. Subdivide and drape each panel over its actual garment surface.
    const surface = ([x, y]: readonly number[]): [number, number, number] => {
      const upper = rings.findIndex(ring => ring[0] >= y!), b = rings[Math.max(0, upper < 0 ? rings.length - 1 : upper)]!, a = rings[Math.max(0, (upper < 0 ? rings.length - 1 : upper) - 1)]!;
      const t = Math.max(0, Math.min(1, (y! - a[0]) / (b[0] - a[0] || 1))), width = a[1] + (b[1] - a[1]) * t, depth = a[2] + (b[2] - a[2]) * t;
      return [x!, y!, depth * Math.sqrt(Math.max(.01, 1 - (x! / width) ** 2)) + .016];
    };
    const faces: [number, number, number][][] = [];
    for (const polygon of panels) for (let fan = 1; fan < polygon.length - 1; fan++) {
      const [a, b, c] = [polygon[0]!, polygon[fan]!, polygon[fan + 1]!], steps = 10;
      const point = (u: number, v: number) => surface([a[0]! + (b[0]! - a[0]!) * u / steps + (c[0]! - a[0]!) * v / steps, a[1]! + (b[1]! - a[1]!) * u / steps + (c[1]! - a[1]!) * v / steps]);
      for (let u = 0; u < steps; u++) for (let v = 0; v < steps - u; v++) {
        faces.push([point(u, v), point(u + 1, v), point(u, v + 1)]);
        if (u + v < steps - 1) faces.push([point(u + 1, v), point(u + 1, v + 1), point(u, v + 1)]);
      }
    }
    const normalAt=([x,y]:readonly number[]):[number,number,number]=>{
      const dx=(surface([x!+.001,y!])[2]-surface([x!-.001,y!])[2])/.002;
      const dy=(surface([x!,y!+.001])[2]-surface([x!,y!-.001])[2])/.002;
      const length=Math.hypot(dx,dy,1);return [-dx/length,-dy/length,1/length];
    };
    fixture.model(`cosmetic-panel-${id}`, cookCityFacets(`Tailored ${id} panel`, faces,undefined,normalAt));
  }
  fixture.declaration.materials.push({ id: 'cosmetic-panel', shading: 'lit', baseColor: [.68, .65, .55, 1], roughness: .78, metallic: 0, doubleSided: true });
  fixture.declaration.materials.push({ id: 'cosmetic-reflector', shading: 'lit', baseColor: [.78, .72, .57, 1], roughness: .8, metallic: 0, doubleSided: true });
}
