import type { ArtFixture } from './fixture.ts';
import { cookFighterProfile } from '../fighter-profile.ts';
import { cookCityFacets } from '../city/mesh-cooking.ts';

export type ServiceTreatment = 'utility' | 'canvas' | 'technical';

/** Common workwear: integrated collar, shoulder yoke and usable pocket construction. */
export function finishServiceJacket(fixture: ArtFixture, id: string, treatment: ServiceTreatment, preserveWardrobe = false) {
  const part = (name: string) => fixture.scene.entities.find(entity => entity.id === `${id}:${name}`)!;
  for (const name of preserveWardrobe ? ['collar', 'closure', 'zip-pull', 'pocket', 'pocket-flap'] : []) {
    const original = structuredClone(part(name));
    original.id = `${id}:legacy-workwear-${name}`;
    fixture.scene.entities.push(original);
  }
  const colors = { utility: [.095, .16, .18], canvas: [.27, .25, .20], technical: [.06, .105, .13] } as const;
  const materialId = `service-yoke-${treatment}`;
  if (!fixture.declaration.materials.some(material => material.id === materialId)) fixture.declaration.materials.push({
    id: materialId, shading: 'lit', shader: 'toon', baseColor: [...colors[treatment], 1], roughness: .9, metallic: 0, doubleSided: true,
    toon: { bands: 3, shadowColor: [.36, .40, .43], rimColor: [.65,.76,.83], rimStrength: .035, outlineColor: [.035,.045,.055,1], outlineWidth: 0 },
  });
  part('torso').meshId = fixture.model(`${id}:service-jacket`, cookFighterProfile('Cropped jacket with a shaped waist and shoulder seam', [
    [1.045, .179, .134, 0], [1.085, .184, .141, 0], [1.14, .184, .141, 0],
    [1.22, .185, .139, 0], [1.38, .237, .163, 0], [1.51, .271, .161, -.002],
    [1.60, .280, .143, -.005], [1.65, .177, .108, 0], [1.68, .084, .074, 0],
  ]));
  const yoke = fixture.model(`${id}:service-yoke`, cookFighterProfile('Continuous reinforced shoulder yoke', [
    [1.50, .272, .164, -.002], [1.60, .283, .146, -.005], [1.65, .180, .111, 0], [1.679, .087, .077, 0],
  ]));
  fixture.add(`${id}:service-yoke`, yoke, materialId, [0, 0, 0]);
  // Folded collar leaves an open V at the throat rather than a closed tube.
  const collar = fixture.model(`${id}:service-collar`, cookCityFacets('Folded workwear collar', [-1, 1].flatMap(side => {
    const a = (x: number, y: number, z: number): [number, number, number] => [side * x, y, z];
    return [[a(.022,1.65,.125),a(.08,1.73,.076),a(.145,1.65,.108),a(.083,1.585,.157)],
      [a(.022,1.65,.125),a(.083,1.585,.157),a(.083,1.581,.148),a(.024,1.646,.116)]];
  })));
  part('collar').meshId = collar;part('collar').position = [0,0,0];part('collar').materialId = materialId;
  part('closure').position = [.008,1.315,.169];part('closure').scale = [.005,.225,.005];
  part('zip-pull').position = [.009,1.52,.179];part('zip-pull').scale = [.008,.018,.005];
  const surface=(x:number,y:number,offset:number):[number,number,number]=>[x,y,Math.sqrt(Math.max(.01,1-(x/.255)**2))*.164+offset];
  for(const [name,bottom,top,offset] of [['pocket',1.322,1.450,.012],['pocket-flap',1.439,1.469,.023]] as const) {
    const faces:[number,number,number][][]=[];
    for(let i=0;i<4;i++){const a=-.193+i*.029,b=a+.029;faces.push([surface(a,bottom,offset),surface(b,bottom,offset),surface(b,top,offset),surface(a,top,offset)]);}
    part(name).meshId=fixture.model(`${id}:service-${name}`,cookCityFacets('Curved sewn work pocket',faces));part(name).position=[0,0,0];part(name).scale=[1,1,1];
  }
  part('pocket').materialId = materialId;
  const add = (name: string, material: string, p: [number,number,number], s: [number,number,number]) => fixture.add(`${id}:service-${name}`, 'box', material, p, s);
  add('pocket-button','wrap',[-.137,1.451,.164],[.006,.006,.003]);
  add('stock-tab','wrap',[.127,1.545,.148],[.029,.012,.003]);
  add('tab-mark',materialId,[.117,1.545,.152],[.005,.008,.002]);
  // Two short reinforced entry seams, rather than a field of decorative stitching.
  for (const side of [-1,1]) add(`welt-${side}`,materialId,[side*.09,1.145,.128],[.021,.005,.003]);
  // Faded folded edges tell a use story without filling the cloth with grain.
  const wearMaterial='cosmetic-jacket-wear';
  if(!fixture.declaration.materials.some(material=>material.id===wearMaterial))fixture.declaration.materials.push({id:wearMaterial,shading:'lit',baseColor:[.19,.29,.30,1],roughness:1,metallic:0,doubleSided:true});
  const wear:[number,number,number][][]=[];
  for(const [start,end] of [[-.73,-.24],[.31,.68]])for(let i=0;i<4;i++) {
    const a=start!+(end!-start!)*i/4,b=start!+(end!-start!)*(i+1)/4;
    const p=(angle:number,y:number):[number,number,number]=>[Math.sin(angle)*.184,y,Math.cos(angle)*.143+.001];
    wear.push([p(a,1.077),p(b,1.077),p(b,1.081),p(a,1.081)]);
  }
  fixture.add(`${id}:service-hem-wear`,fixture.model(`${id}:service-hem-wear-model`,cookCityFacets('Localized jacket hem abrasion',wear)),wearMaterial,[0,0,0]);
  const sleeveLength = Math.hypot(.105,.255,.035);
  for (const side of ['left','right']) part(`${side}-sleeve`).meshId = fixture.model(`${id}:${side}-service-sleeve`, cookFighterProfile('Set-in work sleeve with rounded shoulder cap', [
    [-sleeveLength/2,.057,.053,0],[-sleeveLength*.40,.061,.057,0],[-sleeveLength*.28,.068,.061,0],
    [sleeveLength*.16,.090,.080,0],[sleeveLength*.42,.094,.083,-.003],[sleeveLength*.53,.082,.072,-.004],[sleeveLength*.58,.038,.037,-.004],
  ]));
}
