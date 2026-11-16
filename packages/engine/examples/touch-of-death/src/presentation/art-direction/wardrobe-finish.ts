import type { ArtFixture } from './fixture.ts';
import { cookFighterProfile } from '../fighter-profile.ts';
import { cookCityFacets, cityLoft } from '../city/mesh-cooking.ts';
import { block, type WeaponFace } from '../city/weapons/geometry.ts';
import { trouserProfile, trouserSurface } from './trouser-profile.ts';

/** Closed hand components must face outward; inverted shells render as black holes. */
export function outwardFighterShell(faces:WeaponFace[]) {
  let volume=0;
  for(const face of faces)for(let i=1;i<face.length-1;i++) {
    const a=face[0]!,b=face[i]!,c=face[i+1]!;
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  if(!Number.isFinite(volume)||volume<=0)throw Error('Fighter finish shell is inverted or empty.');
  return faces;
}

/** Wardrobe alternatives use C's native attachment frames, not scaled legacy blobs. */
export function finishWardrobeModels(fixture: ArtFixture, id: string) {
  const model = (name: string, bytes: Uint8Array) => fixture.model(`${id}:cosmetic-native-${name}`, bytes);
  const part = (name: string) => fixture.scene.entities.find(entity => entity.id === `${id}:${name}`)!;
  const profile = (name: string, rings: Parameters<typeof cookFighterProfile>[1], detail?: Parameters<typeof cookFighterProfile>[2]) => model(name, cookFighterProfile(name, rings, detail));
  // A swept crest is one continuous cap. The tied style has a fitted cap and a
  // compact folded knot, rather than a stack of spheres intersecting the skull.
  profile('hair-crest', [
    [1.895,.093,.085,-.030],[1.925,.107,.108,-.020],[1.961,.104,.108,-.025],
    [1.995,.086,.099,-.033],[2.045,.061,.077,-.040],[2.069,.006,.018,-.052],
  ], 'hair');
  profile('hair-bun', [
    [1.891,.094,.082,-.035],[1.925,.108,.108,-.020],[1.96,.102,.107,-.026],
    [1.997,.070,.083,-.045],[2.015,.043,.054,-.077],
    [2.028,.057,.055,-.085],[2.063,.055,.052,-.091],[2.087,.025,.033,-.095],[2.091,.002,.005,-.095],
  ], 'hair');
  const trainer = profile('trainers', [
    [.043,.073,.140,.029],[.070,.076,.141,.029],[.09,.069,.128,.031],
    [.119,.058,.083,.002],[.158,.052,.061,-.015],[.177,.050,.056,-.016],
  ], 'hand');
  const sole = profile('trainer-sole', [[.012,.077,.143,.029],[.028,.079,.145,.029],[.043,.077,.142,.029]], 'hand');
  const trainerDetails: WeaponFace[] = [];
  for (const y of [.108,.121,.134]) trainerDetails.push(...block(0,y,.102-(y-.108)*1.25,.021,.0015,.002));
  for (const side of [-1,1]) {
    trainerDetails.push([[side*.073,.053,-.072],[side*.078,.053,.033],[side*.071,.073,.048],[side*.064,.113,-.016]]);
  }
  const trainerDetail = model('trainer-detail', cookCityFacets('Trainer heel counter, side facing and laces', trainerDetails));
  if (!fixture.declaration.materials.some(material => material.id === 'cosmetic-textile-reinforcement')) fixture.declaration.materials.push(
    {id:'cosmetic-textile-reinforcement',shading:'lit',baseColor:[.085,.106,.111,1],roughness:.96,metallic:0,doubleSided:true},
    {id:'cosmetic-textile-wear',shading:'lit',baseColor:[.19,.225,.227,1],roughness:1,metallic:0,doubleSided:true},
    {id:'cosmetic-trainer-facing',shading:'lit',baseColor:[.30,.32,.30,1],roughness:.91,metallic:0,doubleSided:true},
  );
  for (const side of ['left','right']) {
    const ring=(x:number,y:number,z:number,width:number,depth:number)=>Array.from({length:12},(_,i):[number,number,number]=>[x+Math.cos(i*.5235987755982988)*width,y,z+Math.sin(i*.5235987755982988)*depth]);
    const fingers: WeaponFace[]=outwardFighterShell(cityLoft([ring(0,-.041,0,.031,.022),ring(0,.010,.004,.042,.028),ring(0,.047,.002,.043,.024),ring(0,.055,.002,.031,.017)]));
    for(const [x,length] of [[-.030,.052],[-.010,.066],[.010,.064],[.030,.048]]) {
      fingers.push(...outwardFighterShell(cityLoft([ring(x!,.039,.004,.0095,.013),ring(x!,.066,0,.010,.012),ring(x!,.055+length!*.75,.001,.009,.011),ring(x!,.055+length!,.009,.0075,.008),ring(x!,.061+length!,.010,.002,.003)])));
    }
    const hand=part(`${side}-hand`);
    hand.variants=[{id:'fist',meshId:hand.meshId,materialId:hand.materialId},{id:'relaxed',meshId:model(`${side}-relaxed-hand`,cookCityFacets('Released fingers after impact',fingers)),materialId:hand.materialId}];
    part(`${side}-shoe`).variants = [{id:'boots',meshId:part(`${side}-shoe`).meshId,materialId:part(`${side}-shoe`).materialId},{id:'trainers',meshId:trainer,materialId:part(`${side}-shoe`).materialId}];
    part(`${side}-sole`).variants = [{id:'boots',meshId:part(`${side}-sole`).meshId,materialId:part(`${side}-sole`).materialId},{id:'trainers',meshId:sole,materialId:'cosmetic-trainer-facing'}];
    fixture.add(`${id}:${side}-trainer-detail`,trainerDetail,'cosmetic-trainer-facing',[0,0,0]);
    for (const segment of ['thigh','shin']) {
      const length = segment === 'thigh' ? Math.hypot(.045,.4935,.02) : Math.hypot(.035,.4165,.02);
      const base = part(`${side}-${segment}`);
      const wide = profile(`${segment}-wide`, trouserProfile(segment,'wide'));
      base.variants = [{id:'straight',meshId:base.meshId,materialId:base.materialId},{id:'wide',meshId:wide,materialId:base.materialId}];
      for (const fit of ['straight','wide']) {
        const rings=trouserProfile(segment,fit);
        const reinforcement: WeaponFace[] = [], wear: WeaponFace[] = [];
        if (segment === 'thigh') {
          // Sewn double knee: follows the bend, ends before the hinge.
          const rows=[-length*.43,...rings.map(ring=>ring[0]).filter(y=>y>-length*.43&&y<-length*.15),-length*.15];
          for (let i=0;i<8;i++) {
            const a=-.7853981633974483+i*.19634954084936207,b=a+.19634954084936207;
            const point=(angle:number,y:number)=>trouserSurface(rings,angle,y);
            for(let row=1;row<rows.length;row++)reinforcement.push([point(a,rows[row-1]!),point(b,rows[row-1]!),point(b,rows[row]!),point(a,rows[row]!)]);
            const stitch=(angle:number,y:number)=>trouserSurface(rings,angle,y,.0035);
            wear.push([stitch(a,-length*.415),stitch(b,-length*.415),stitch(b,-length*.410),stitch(a,-length*.410)]);
          }
        } else {
          // Bound hem and a few long compression creases; never all-over noise.
          for (let i=0;i<8;i++) {
            const a=i*.7853981633974483,b=a+.7853981633974483;
            const p=(angle:number,y:number)=>trouserSurface(rings,angle,y,.006);
            reinforcement.push([p(a,-length*.48),p(b,-length*.48),p(b,-length*.43),p(a,-length*.43)]);
            wear.push([p(a,-length*.482),p(b,-length*.482),p(b,-length*.48),p(a,-length*.48)]);
          }
        }
        for (const [kind,faces,material] of [['reinforcement',reinforcement,'cosmetic-textile-reinforcement'],['wear',wear,'cosmetic-textile-wear']] as const) {
          const mesh=model(`${segment}-${fit}-${kind}`,cookCityFacets(`${segment} ${fit} ${kind}`,faces));
          if(fit==='straight')fixture.add(`${id}:${side}-${segment}-${kind}`,mesh,material,[0,0,0]);
          const detail=part(`${side}-${segment}-${kind}`);detail.variants??=[];detail.variants.push({id:fit,meshId:mesh,materialId:material});
        }
      }
    }
  }
  part('hair').variants=[{id:'crop',meshId:part('hair').meshId,materialId:'ink'},{id:'crest',meshId:`${id}:cosmetic-native-hair-crest`,materialId:'ink'},{id:'bun',meshId:`${id}:cosmetic-native-hair-bun`,materialId:'ink'}];
}
