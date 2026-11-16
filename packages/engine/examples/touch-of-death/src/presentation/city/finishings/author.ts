import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { createCityFinishKit } from './kit.ts';
import { authorCityGround } from './ground.ts';
import { authorCivilianFinishes } from './civilian.ts';
import { authorInstitutionalFinishes } from './institutional.ts';
import { authorStreetLife } from './street-life.ts';
import { authorRoofStations } from './roof-stations.ts';
import { authorOversight } from './oversight.ts';
import { retainRecordOrder } from '../generation/refresh-order.ts';

/** A finite, nonphysical detail pass keeps empty-city footage from resembling a prop yard. */
export function authorCityFinishes({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const prefix = 'tod:city:finish:';
  const entityOrder = retainRecordOrder(scene.entities, entity => entity.id);
  const variants = (combat.arenaLayouts ?? []).flatMap(layout => layout.variants);
  const propOrders = variants.map(variant => retainRecordOrder(variant.props, prop => prop.entityId));
  const surfaces = combat.environment?.surfaces ?? [];
  const hideOrders = surfaces.map(surface => retainRecordOrder(surface.hideIds ?? [], id => id));
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  for (const layout of combat.arenaLayouts ?? []) for (const variant of layout.variants) variant.props = variant.props.filter(prop => !prop.entityId.startsWith(prefix));
  for (const surface of combat.environment?.surfaces ?? []) if (surface.hideIds) surface.hideIds = surface.hideIds.filter(id => !id.startsWith(prefix));
  const kit = createCityFinishKit({ declaration, combat });
  authorCityGround({ kit });
  authorCivilianFinishes({ kit });
  authorInstitutionalFinishes({ kit });
  authorStreetLife({ kit });
  authorRoofStations({ kit });
  authorOversight({ kit });
  if (kit.added.length > 256) throw Error('City finish pool exceeds its 256-piece visual budget.');
  // Refreshing an existing pass must not reshuffle the canonical content identity.
  entityOrder(scene.entities);
  variants.forEach((variant, index) => propOrders[index]!(variant.props));
  surfaces.forEach((surface, index) => { if (surface.hideIds) hideOrders[index]!(surface.hideIds); });
  const used = new Set(declaration.scenes.flatMap(scene => scene.entities.map(entity => entity.materialId)));
  declaration.materials = declaration.materials.filter(material => !material.id.includes(':occlusion-follow:') || used.has(material.id));
}
