import type { ArtFixture } from './fixture.ts';
import { cookFighterProfile } from '../fighter-profile.ts';
import { cookCityFacets } from '../city/mesh-cooking.ts';
import { type WeaponFace } from '../city/weapons/geometry.ts';

/** Local finish only. Body proportions, forearms, pivots and motion remain unchanged. */
export function finishFighterDetails(fixture: ArtFixture, id: string) {
  const part = (name: string) => fixture.scene.entities.find(entity => entity.id === `${id}:${name}`)!;
  const head = [
    [1.73,.044,.055,.024], [1.765,.068,.075,.024], [1.80,.083,.091,.019],
    [1.835,.102,.096,.008], [1.863,.098,.094,.005], [1.884,.103,.100,.004],
    [1.925,.099,.101,-.005], [1.956,.078,.087,-.013], [1.98,.01,.01,-.01],
  ] as const;
  part('head').meshId = fixture.model(`${id}:finished-head`, cookFighterProfile('Defined cheek, eye socket and jaw', head.map(([y,w,d,z]) => [y-1.855,w,d,z])));
  part('hair').meshId = fixture.model(`${id}:finished-hair`, cookFighterProfile('Close cropped sides and swept crown', [
    [1.893,.091,.079,-.033], [1.926,.106,.108,-.022], [1.96,.097,.106,-.028],
    [1.992,.055,.083,-.043], [2.01,.002,.002,-.045],
  ], 'hair'));
  part('nose').meshId = fixture.model(`${id}:finished-nose`, cookFighterProfile('Restrained bridge and nose tip', [
    [-.029,.011,.006,0],[-.021,.019,.015,.004],[-.008,.014,.019,.003],[.030,.004,.003,-.002],
  ]));
  part('nose').position = [0,1.85,.105];
  part('mouth').scale = [.022,.002,.0015];part('mouth').position = [0,1.794,.111];
  part('mouth').meshId=fixture.model(`${id}:finished-mouth`,cookFighterProfile('Soft lip opening',[[-1,.25,.5,0],[-.7,.8,.8,0],[0,1,1,0],[.7,.8,.8,0],[1,.25,.5,0]]));
  for (const sign of [-1,1]) {
    part(`eye:${sign}`).position = [sign*.049,1.869,.092];
    part(`eye-light:${sign}`).position = [sign*.046,1.870,.094];
    const ear = fixture.model(`${id}:ear-${sign}`, cookFighterProfile('Ear plane behind jaw hinge', [[-.027,.005,.011,0],[-.018,.013,.015,0],[.016,.015,.014,-.002],[.033,.006,.009,-.004]]));
    fixture.add(`${id}:head-ear:${sign}`, ear, 'skin', [sign*.105,1.859,-.012]);
  }
  const finishMaterial = 'cosmetic-boot-wear';
  if (!fixture.declaration.materials.some(material => material.id === finishMaterial)) fixture.declaration.materials.push({ id: finishMaterial, shading: 'lit', baseColor: [.16,.18,.175,1], roughness: .84, metallic: 0, doubleSided: false });
  for (const side of ['left','right']) {
    const profile = [
      [.041,.075,.140,.031],[.072,.078,.144,.031],[.099,.074,.133,.034],
      [.118,.065,.099,.009],[.157,.058,.072,-.012],[.23,.055,.063,-.014],[.26,.054,.061,-.015],
    ] as const;
    part(`${side}-shoe`).meshId = fixture.model(`${id}:${side}-finished-boot`, cookFighterProfile('Squared safety toe, instep and fitted ankle', profile, 'hand'));
    part(`${side}-sole`).meshId = fixture.model(`${id}:${side}-finished-sole`, cookFighterProfile('Work boot welt and planted outsole', [
      [.012,.079,.145,.031],[.029,.080,.147,.031],[.040,.078,.145,.031],
    ], 'hand'));
    const faces: WeaponFace[] = [];
    // Fit the actual superellipse, not a flat guess that disappears inside it.
    const surface = (x:number,y:number): [number,number,number] => {
      const row=Math.max(1,profile.findIndex(ring=>ring[0]>=y)),a=profile[row-1]!,b=profile[row]!;
      const t=(y-a[0])/(b[0]-a[0]),width=a[1]+(b[1]-a[1])*t,depth=a[2]+(b[2]-a[2])*t,center=a[3]+(b[3]-a[3])*t;
      return [x,y,center+depth*Math.max(0,1-(Math.abs(x)/width)**4.166666666666667)**.24+.003];
    };
    for (const y of [.117,.133,.149]) for(let i=0;i<4;i++) {
      const x=-.027+i*.0135;
      faces.push([surface(x,y),surface(x+.0135,y),surface(x+.0135,y+.003),surface(x,y+.003)]);
    }
    faces.push([surface(-.045,.061),surface(-.011,.064),surface(-.009,.069),surface(-.041,.066)]);
    faces.push([surface(.028,.072),surface(.057,.077),surface(.053,.081),surface(.026,.075)]);
    fixture.add(`${id}:${side}-boot-detail`, fixture.model(`${id}:${side}-boot-detail-model`, cookCityFacets('Laces and localized toe abrasion', faces)), finishMaterial, [0,0,0]);
  }
}
