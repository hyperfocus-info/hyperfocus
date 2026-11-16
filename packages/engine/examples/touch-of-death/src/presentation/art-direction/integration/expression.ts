import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { recordRigFrameMap, type RigFrameLookup, type RigPreparationWork } from '../rig-preparation.ts';

export type FighterExpression = 'neutral' | 'exertion' | 'hurt' | 'knockout';

/** Small face-local accents applied after the accepted body/head pose is solved. */
export function presentFighterExpression(frame: Hyperfocus3DEvaluatedFrame, rigId: string, expression: FighterExpression, amount = 1, held = false, lookup?: RigFrameLookup, work?: RigPreparationWork) {
  const parts=lookup??new Map(frame.entities.filter(entity=>entity.id.startsWith(`${rigId}:`)).map(entity=>[entity.id,entity]));
  if(!lookup)recordRigFrameMap(frame.entities.length,parts.size,2,work);
  const weight=Math.max(0,Math.min(1,amount));
  const hurt=expression==='hurt',out=expression==='knockout';
  for(const side of [-1,1]) {
    const brow=parts.get(`${rigId}:brow:${side}`);
    if(brow) {
      const angle=side*(hurt?.16:out?0:expression==='exertion'?-.20:0)*weight;
      const [x,y,z,w]=brow.rotation,c=Math.cos(angle/2),s=Math.sin(angle/2);
      brow.rotation=[x*c+y*s,y*c-x*s,z*c+w*s,w*c-z*s];
    }
    const eye=parts.get(`${rigId}:eye:${side}`),light=parts.get(`${rigId}:eye-light:${side}`);
    if(eye)eye.scale[1]*=1-(out?.8:hurt?.55:expression==='exertion'?.25:0)*weight;
    if(light)light.visible=!out && !(hurt && weight>.7);
  }
  const mouth=parts.get(`${rigId}:mouth`);
  if(mouth) {
    mouth.scale[0]*=1-(hurt?.3:0)*weight;
    mouth.scale[1]*=1+(hurt?3:expression==='exertion'?1.6:out?1:0)*weight;
  }
  for(const side of ['left','right']) {
    const hand=parts.get(`${rigId}:${side}-hand`);
    const relaxed=!held&&(out||hurt&&weight>.4);
    if(hand)hand.variantId=relaxed?'relaxed':'fist';
    const folds=parts.get(`${rigId}:${side}-knuckle-folds`);if(folds)folds.visible=!relaxed;
  }
}
