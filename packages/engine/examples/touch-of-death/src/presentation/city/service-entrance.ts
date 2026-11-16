import type { CombatProject3D, Hyperfocus3DDeclaration, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { retainRecordOrder } from './generation/refresh-order.ts';

export const serviceRoof = 'tod:city:overhaul:construction:site-office:roof';
const prefix = 'tod:city:service-court:';
export const bridgeCourtSolids = [serviceRoof,...[-1,1].map(side=>serviceRoof.replace(':roof',`:wall:${side}`)),...[-1.1,1.1].map(z=>`${prefix}bridge-rail:${z}`)];
type Point = [number,number,number];
type BridgeShape = {id:string;x:number;y:number;scale:Point};

/** Explicit, idempotent migration of the three solids that form the chosen court.
 * The floor and both open ends remain traversable; the overhead deck is real. */
export function shapeBridgeCourt(declaration:Hyperfocus3DDeclaration,combat:CombatProject3D) {
  const scene=declaration.scenes.find(scene=>scene.id===declaration.activeSceneId)!;
  const roof=scene.entities.find(entity=>entity.id===serviceRoof);if(!roof)return;
  const shapes:BridgeShape[]=[{id:serviceRoof,x:0,y:5,scale:[3.9,.20,1.15]},
    ...[-1,1].map((side):BridgeShape=>({id:serviceRoof.replace(':roof',`:wall:${side}`),x:side*3.6,y:side<0?3.3:2.9,scale:[.46,side<0?3.3:2.9,2.4]}))];
  for(const shape of shapes) {
    const entity=scene.entities.find(entity=>entity.id===shape.id)!;
    entity.position=[roof.position[0]+shape.x,shape.y,roof.position[2]];entity.scale=[...shape.scale];
    for(const layout of combat.arenaLayouts??[])for(const variant of layout.variants) {
      const anchor=variant.props.find(prop=>prop.entityId===serviceRoof),prop=variant.props.find(prop=>prop.entityId===shape.id);
      if(anchor&&prop)prop.position=[anchor.position[0]+shape.x,shape.y,anchor.position[2]];
    }
  }
}

/** An inhabited bridge court. Geometry, layouts and camera cutaways share ownership. */
export function finishServiceEntrance(declaration: Hyperfocus3DDeclaration, combat: CombatProject3D) {
  const scene = declaration.scenes.find(scene=>scene.id===declaration.activeSceneId)!;
  const roof = scene.entities.find(entity=>entity.id===serviceRoof);if(!roof)return;
  const entityOrder = retainRecordOrder(scene.entities, entity => entity.id);
  const variants = (combat.arenaLayouts ?? []).flatMap(layout => layout.variants);
  const propOrders = variants.map(variant => retainRecordOrder(variant.props, prop => prop.entityId));
  shapeBridgeCourt(declaration,combat);
  const origin:Point = [roof.position[0],0,roof.position[2]];
  scene.entities=scene.entities.filter(entity=>!entity.id.startsWith(prefix));
  for(const layout of combat.arenaLayouts??[])for(const variant of layout.variants)variant.props=variant.props.filter(prop=>!prop.entityId.startsWith(prefix));
  const colors = { frame:[.14,.19,.21], plaster:[.43,.44,.40], paint:[.23,.30,.29], metal:[.32,.37,.37], recess:[.065,.085,.09], lamp:[.78,.68,.48], paper:[.55,.52,.43], blue:[.22,.365,.447] } as const;
  for(const [role,color] of Object.entries(colors)) {
    const id=`${serviceRoof}:occlusion-follow:tod:service:${role}`;
    const material:Hyperfocus3DDeclaration['materials'][number]={id,shading:'lit',baseColor:[...color,1],roughness:role==='metal'?.48:.88,metallic:role==='metal'?.45:0,doubleSided:false,alphaMode:'blend',...(role==='lamp'?{emissive:[.24,.17,.075]}:{})};
    const index=declaration.materials.findIndex(value=>value.id===id);if(index<0)declaration.materials.push(material);else declaration.materials[index]=material;
  }
  let materialOwner=serviceRoof;
  const add=(name:string,role:keyof typeof colors,p:Point,s:Point,solid=false)=>{
    const id=prefix+name,position:Point=[origin[0]+p[0],p[1],origin[2]+p[2]];
    const materialId=`${materialOwner}:occlusion-follow:tod:service:${role}`;
    if(!declaration.materials.some(material=>material.id===materialId))declaration.materials.push({...structuredClone(declaration.materials.find(material=>material.id===`${serviceRoof}:occlusion-follow:tod:service:${role}`)!),id:materialId});
    scene.entities.push({id,meshId:'tod:box',materialId,position,scale:s,rotationY:0,...(solid?{physics:{type:'static' as const,shape:'box' as const,gravityScale:0,continuous:false}}:{})});
    for(const layout of combat.arenaLayouts??[])for(const variant of layout.variants){const anchor=variant.props.find(prop=>prop.entityId===serviceRoof);if(anchor)variant.props.push({entityId:id,position:[anchor.position[0]+p[0],p[1],anchor.position[2]+p[2]]});}
  };
  // The recessed doorway remains fully open. Material changes articulate its depth.
  for(const side of [-1,1]) {
    materialOwner=serviceRoof.replace(':roof',`:wall:${side}`);
    // Large flanking masses and one high horizontal deck organize the whole court.
    // All cladding remains inside the corresponding collision face.
    add(`upper-wall:${side}`,'plaster',[side*3.135,side<0?4.55:4.15,0],[.006,side<0?1.85:1.45,2.34]);
    add(`outer-wall:${side}`,'plaster',[side*4.065,side<0?3.35:2.95,0],[.006,side<0?3.22:2.82,2.34]);
    add(`front-pier:${side}`,'paint',[side*3.6,side<0?3.3:2.9,2.405],[.45,side<0?3.3:2.9,.006]);
    for(const y of side<0?[3.55,5.55]:[3.55]) {
      add(`upper-recess:${side}:${y}`,'recess',[side*3.124,y,-.20],[.008,.53,1.37]);
      add(`upper-sill:${side}:${y}`,'metal',[side*3.10,y-.56,-.20],[.045,.025,1.43]);
      for(const z of [-.89,.49])add(`upper-mullion:${side}:${y}:${z}`,'metal',[side*3.10,y,z],[.025,.53,.025]);
    }
    // Broad wall fields and a darker plinth organize the opening before detail.
    // They sit on the existing walls, outside the unchanged through route.
    add(`wall-field:${side}`,'plaster',[side*3.14,1.76,-.05],[.028,1.04,2.14]);
    add(`jamb:${side}`,'plaster',[side*3.10,1.40,2.38],[.14,1.4,.19]);
    add(`jamb-foot:${side}`,'paint',[side*3.10,.29,2.59],[.15,.29,.04]);
    add(`shutter-rail:${side}`,'metal',[side*2.93,1.40,2.30],[.035,1.4,.065]);
    add(`wall-base:${side}`,'paint',[side*3.12,.37,-.05],[.045,.37,2.14]);
    add(`window-frame:${side}`,'metal',[side*3.105,1.90,-.1],[.025,.63,1.42]);
    add(`window-pane:${side}`,'recess',[side*3.07,1.90,-.1],[.012,.56,1.34]);
    add(`window-divider:${side}`,'metal',[side*3.05,1.90,-.1],[.016,.56,.022]);
  }
  materialOwner=serviceRoof;
  add('bridge-fascia','paint',[0,4.99,1.16],[3.88,.19,.012]);
  add('bridge-soffit','plaster',[0,4.795,0],[3.12,.005,1.13]);
  for(const z of [-1.1,1.1]) {
    add(`bridge-rail:${z}`,'metal',[0,6.02,z],[3.13,.032,.033],true);
    add(`bridge-kickplate:${z}`,'frame',[0,5.30,z],[3.13,.08,.025]);
    for(const x of [-3,-1.5,0,1.5,3])add(`bridge-post:${z}:${x}`,'metal',[x,5.66,z],[.024,.36,.025]);
  }
  add('lintel-face','plaster',[0,2.87,2.42],[3.24,.12,.19]);
  add('rolled-shutter','paint',[0,2.66,2.12],[2.9,.14,.16]);
  for(const y of [2.57,2.66,2.75])add(`shutter-fold:${y}`,'metal',[0,y,2.285],[2.85,.009,.005]);
  add('threshold','metal',[0,.012,2.40],[2.93,.012,.15]);
  add('canopy','frame',[0,2.99,2.88],[3.40,.07,.55]);
  add('canopy-fascia','metal',[0,2.975,3.43],[3.39,.035,.012]);
  // One offset service bay breaks the repeated-box rhythm without filling the floor.
  add('service-bay','paint',[-3.09,1.45,-1.78],[.026,.68,.36]);
  add('service-bay-recess','recess',[-3.055,1.45,-1.78],[.009,.56,.25]);
  add('service-bay-door','metal',[-3.042,1.45,-1.80],[.009,.52,.20]);
  add('lamp-housing','frame',[0,2.86,2.80],[.68,.06,.12]);
  add('lamp-diffuser','lamp',[0,2.80,2.80],[.58,.012,.07]);
  add('drain','recess',[0,.009,3.65],[2.7,.009,.075]);
  for(const x of [-2,-1,0,1,2])add(`drain-bar:${x}`,'metal',[x,.012,3.65],[.018,.008,.075]);
  add('notice-board','frame',[-2.68,1.70,2.32],[.18,.25,.035]);
  add('work-notice','paper',[-2.68,1.70,2.36],[.145,.20,.008]);
  for(const y of [1.80,1.73,1.66])add(`notice-line:${y}`,'paint',[-2.68,y,2.371],[.105,.008,.002]);
  // One repeated, recessed lens is the institutional inconsistency, below ordinary signage.
  add('concealed-lens','blue',[2.72,2.62,2.295],[.046,.026,.014]);
  entityOrder(scene.entities);
  variants.forEach((variant, index) => propOrders[index]!(variant.props));
  declaration.budgets={...declaration.budgets,entities:Math.max(declaration.budgets.entities,scene.entities.length),materials:Math.max(declaration.budgets.materials,declaration.materials.length)};
}

/** Check the actual dressed level in every placement; fails before persistence. */
export function validateBridgeCourt(declaration:Hyperfocus3DDeclaration,combat:CombatProject3D) {
  const scene=declaration.scenes.find(scene=>scene.id===declaration.activeSceneId)!;
  const roof=scene.entities.find(entity=>entity.id===serviceRoof);if(!roof)return {placements:0};
  for(const id of bridgeCourtSolids)if(!scene.entities.find(entity=>entity.id===id)?.physics)throw Error(`Bridge surface has no collider: ${id}`);
  const variants=(combat.arenaLayouts??[]).flatMap(layout=>layout.variants).filter(variant=>variant.props.some(prop=>prop.entityId===serviceRoof));
  for(const variant of variants) {
    const positions=new Map(variant.props.map(prop=>[prop.entityId,prop.position]));
    const origin=positions.get(serviceRoof)!;
    for(const id of bridgeCourtSolids)if(!positions.has(id))throw Error(`Bridge collision missing in ${variant.id}: ${id}`);
    for(const z of [-3.5,-2,0,2,3.5,4.8])for(const x of [-1.5,0,1.5]) {
      const point=[origin[0]+x,1,origin[2]+z];
      for(const id of bridgeCourtSolids) {
        const entity=scene.entities.find(entity=>entity.id===id)!,at=positions.get(id)!;
        if(point.every((value,axis)=>Math.abs(value-at[axis]!)<entity.scale[axis]!+.99))throw Error(`Bridge blocks central route in ${variant.id}: ${id}`);
      }
    }
  }
  return {placements:variants.length,solids:bridgeCourtSolids.length,checkedSweptWidth:4.98};
}

/** Local presentation only: the city and combat camera retain their native behavior outside this court. */
export function presentServiceCourt(frame: Hyperfocus3DEvaluatedFrame) {
  const roof=frame.entities.find(entity=>entity.id===serviceRoof);
  if(!roof||!frame.entities.some(entity=>entity.id===prefix+'threshold'))return;
  const fighters=['actor','actor-copy'].map(id=>frame.entities.find(entity=>entity.id===id));
  if(fighters.some(entity=>!entity))return;
  const distance=Math.max(...fighters.map(entity=>Math.hypot((entity!.position[0]-roof.position[0])/7,(entity!.position[2]-roof.position[2]-5)/9)));
  const weight=Math.max(0,Math.min(1,(1.3-distance)/.4));if(!weight)return;
  for(const light of frame.lights) {
    if(light.id==='tod:ambient')light.intensity*=1-.22*weight;
    if(light.id==='tod:key')light.intensity*=1+.12*weight;
  }
  // Close exchanges deserve screen space; native framing resumes as separation grows.
  const separation=Math.hypot(...fighters[0]!.position.map((value,axis)=>value-fighters[1]!.position[axis]!));
  const close=weight*Math.max(0,Math.min(1,(5-separation)/3));
  // Tighten the lens without moving the camera through foreground structures.
  frame.camera.fovYRadians*=1-.12*close;
}
