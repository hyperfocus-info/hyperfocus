import { presentTelemetry } from '../../cosmetics/telemetry.ts';
import type { Hyperfocus3DDeclaration, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { legacyParts, type DirectedFighter } from './contract.ts';
import { readDirectedFighters } from './contract.ts';
import { recordRigFrameMap, type RigFrameLookup, type RigPreparationWork } from '../rig-preparation.ts';

/** A wardrobe added after initial fighter setup binds to the same model parts. */
export function syncDirectedWardrobe(project: { extensions?: Record<string, unknown> }, declaration: Hyperfocus3DDeclaration) {
  const art = readDirectedFighters(project, declaration);
  if (!art) return;
  const entities = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!.entities;
  for (const fighter of art.fighters) for (const [part, suffix] of Object.entries(legacyParts)) {
    const source = entities.find(entity => entity.id === fighter.entityId + suffix)!, target = entities.find(entity => entity.id === `${fighter.rigId}:${part}`)!;
    if (source.variants && !target.variants?.some(variant => variant.meshId.includes(':cosmetic-native-'))) target.variants = source.variants.map(variant => ({ ...structuredClone(variant), meshId: variant.meshId === source.meshId ? target.meshId : variant.meshId }));
    if(target.variants?.some(variant=>variant.meshId.includes(':cosmetic-native-')))for(const variant of target.variants)if(variant.materialId===target.materialId)variant.materialId=source.materialId;
    target.materialId = source.materialId;
  }
  for(const fighter of art.fighters)for(const entity of entities.filter(entity=>entity.id.startsWith(fighter.rigId+':'))) {
    const role=entity.materialId==='tod:directed:skin'?'skin':entity.materialId==='tod:directed:trousers'?'bottom':undefined;
    if(!role||!declaration.materials.some(material=>material.id===`${fighter.entityId}:appearance:${role}`))continue;
    const materialId=`${fighter.entityId}:appearance:${role}`;
    for(const variant of entity.variants??[])if(variant.materialId===entity.materialId)variant.materialId=materialId;
    entity.materialId=materialId;
  }
}

type Point = [number, number, number];
const authoredMaps = new WeakMap<Hyperfocus3DDeclaration['scenes'][number]['entities'], Map<string, Hyperfocus3DDeclaration['scenes'][number]['entities'][number]>>();
const frameMaps = new WeakMap<Hyperfocus3DEvaluatedFrame['entities'], Map<string, Hyperfocus3DEvaluatedFrame['entities'][number]>>();
function offset(entity: Hyperfocus3DEvaluatedFrame['entities'][number], local: Point) {
  const [x, y, z, w] = entity.rotation, [a, b, c] = local, tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  entity.position = [entity.position[0] + a + w * tx + y * tz - z * ty, entity.position[1] + b + w * ty + z * tx - x * tz, entity.position[2] + c + w * tz + x * ty - y * tx];
}

/** Preserve existing saved variant IDs without applying legacy unit-mesh scales to C. */
export function bridgeDirectedWardrobe(frame: Hyperfocus3DEvaluatedFrame, declaration: Hyperfocus3DDeclaration, fighter: DirectedFighter, lookup?: RigFrameLookup, work?: RigPreparationWork) {
  const sourceEntities = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!.entities;
  let authored = authoredMaps.get(sourceEntities), entities: RigFrameLookup | undefined = lookup ?? frameMaps.get(frame.entities);
  // Runtime declaration identities are fixed. Fresh evaluated arrays own their
  // borrowed mutable entities; both fighters share this frame's lookup only.
  if (!authored || authored.size !== sourceEntities.length) { authored = new Map(sourceEntities.map(entity => [entity.id, entity]));authoredMaps.set(sourceEntities, authored); }
  if (!lookup && (!entities || entities.size !== frame.entities.length)) { const built = new Map(frame.entities.map(entity => [entity.id, entity]));entities = built;frameMaps.set(frame.entities, built);recordRigFrameMap(frame.entities.length, built.size, 1, work); }
  if (!entities) throw Error('Missing directed wardrobe lookup');
  for (const [part, suffix] of Object.entries(legacyParts)) {
    const previous = entities.get(fighter.entityId + suffix), target = entities.get(`${fighter.rigId}:${part}`);
    if (!previous || !target) continue;
    const source = authored.get(previous.id)!;
    const variant = source.variants?.find(variant => variant.id === previous.variantId);
    target.variantId = previous.variantId;
    const nativeVariant = authored.get(target.id)?.variants?.find(variant => variant.id === previous.variantId);
    if (nativeVariant?.meshId.startsWith('tod:directed:cosmetic-') || nativeVariant?.meshId.includes(':cosmetic-native-')) continue;
    if (!variant || variant.meshId === source.meshId) continue;
    if (part === 'torso') {
      offset(target, [0, 1.28, 0]); target.scale = [.88, .765, .83];
      for (const detail of ['hem', 'collar', 'closure', 'zip-pull', 'pocket', 'pocket-flap']) entities.get(`${fighter.rigId}:${detail}`)!.visible = false;
    } else if (part.endsWith('-thigh') || part.endsWith('-shin')) {
      target.scale = [.105, target.scale[1] * (part.endsWith('-thigh') ? .248 : .21), .105];
    } else if (part.endsWith('-shoe')) {
      offset(target, [0, .115, .01]); target.scale = [.09, .11, .15];
      for (const suffix of ['sole', 'boot-detail']) {
        const detail = entities.get(`${fighter.rigId}:${part.replace('shoe', suffix)}`);if (detail) detail.visible = false;
      }
    } else if (part === 'hair') { offset(target, [0, 1.98, 0]); target.scale = [.145, .105, .14]; }
  }
  const face = entities.get(`${fighter.entityId}:face`);
  // Finish layers inherit the already solved segment, including native knockout.
  // They never run their own IK and never receive legacy wardrobe scaling.
  for (const side of ['left','right']) {
    const shoe=entities.get(`${fighter.rigId}:${side}-shoe`)!;
    if(!authored.get(shoe.id)?.variants?.some(variant=>variant.meshId.includes(':cosmetic-native-')))continue;
    for(const name of ['sole','boot-detail','trainer-detail']) {
      const detail=entities.get(`${fighter.rigId}:${side}-${name}`);if(!detail)continue;
      detail.position=[...shoe.position];detail.rotation=[...shoe.rotation];detail.scale=[...shoe.scale];
      if(authored.get(detail.id)?.variants?.some(variant=>variant.id===shoe.variantId))detail.variantId=shoe.variantId;
      detail.visible=name==='sole'||(name==='trainer-detail')===(shoe.variantId==='trainers');
    }
    for(const segment of ['thigh','shin'])for(const kind of ['reinforcement','wear']) {
      const owner=entities.get(`${fighter.rigId}:${side}-${segment}`)!;
      const detail=entities.get(`${fighter.rigId}:${side}-${segment}-${kind}`);if(!detail)continue;
      detail.position=[...owner.position];detail.rotation=[...owner.rotation];detail.scale=[...owner.scale];detail.variantId=owner.variantId;detail.visible=true;
    }
  }
  const top = entities.get(fighter.entityId)?.variantId ?? 'gi';
  // Common-jacket construction cannot leak through another top's silhouette.
  for (const entity of frame.entities) if (entity.id.startsWith(`${fighter.rigId}:service-`)) entity.visible = top === 'gi';
  if (frame.entities.some(entity => entity.id === `${fighter.rigId}:legacy-workwear-collar`)) {
    for (const name of ['collar', 'closure', 'zip-pull', 'pocket', 'pocket-flap']) {
      const previous = entities.get(`${fighter.rigId}:legacy-workwear-${name}`)!;
      previous.visible = top !== 'gi' && (name === 'collar' || top !== 'relay' && top !== 'signature');
      entities.get(`${fighter.rigId}:${name}`)!.visible = top === 'gi';
    }
  }
  presentTelemetry(frame, fighter.entityId, false, 0, true);
  const panel = entities.get(`${fighter.rigId}:cosmetic-panel`);
  if (panel) { panel.variantId = top;panel.visible = top !== 'gi'; }
  if (top === 'relay' || top === 'signature') for (const detail of ['closure', 'zip-pull', 'pocket', 'pocket-flap']) {
    const entity = entities.get(`${fighter.rigId}:${detail}`);if (entity) entity.visible = false;
  }
  if (face?.variantId === 'brows') for (const side of [-1, 1]) { const brow = entities.get(`${fighter.rigId}:brow:${side}`)!; brow.scale[1] *= 1.6; }
  for (const suffix of [...Object.values(legacyParts), ':face', ':belt']) { const entity = entities.get(fighter.entityId + suffix); if (entity) entity.visible = false; }
}
