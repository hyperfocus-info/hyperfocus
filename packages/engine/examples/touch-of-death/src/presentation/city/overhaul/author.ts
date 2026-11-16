import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorCombatObstructions } from '../../obstructions.ts';
import { createDistrictKit } from './kit.ts';
import { authorConstruction } from './construction.ts';
import { authorMarket } from './market.ts';
import { authorResidential } from './residential.ts';
import { authorDepot } from './depot.ts';
import { authorUtility } from './utility.ts';
import { authorDistrictExperiment } from './experiment.ts';
import { authorResidentialBoiler } from './encounters.ts';
import { authorDistrictFurniture } from './furniture.ts';
import { attachResidentialDivider } from './residential-divider.ts';

const prefix = 'tod:city:overhaul:';

/** Replace duplicated court dressing with independently selected physical neighborhoods. */
export function authorCityOverhaul({ declaration, combat, seed }: {
  declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; seed: number;
}) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const removed = new Set(scene.entities.filter(entity => {
    const id = entity.id;
    if (id.startsWith(prefix)) return true;
    if (/^tod:city:expanded:court:[1-4]:(back-left|back-right|side|header|lamp|seam:)/.test(id)) return true;
    if (/^tod:city:expanded:court:[1-4]:roof$/.test(id)) return true;
    if (/^tod:city:expanded:court:[124]:(weak-back|crack:|debris:)/.test(id)) return true;
    if (/^tod:city:district:(market|depot):/.test(id)) return true;
    if (id.startsWith('tod:city:district:utility:') && !id.includes(':hidden-')) return true;
    if (id.startsWith('tod:city:district:residential:') && !/:(divider|crack:|debris:)/.test(id)) return true;
    if (/^tod:city:neighborhood:(market|residential|utility):/.test(id)) return true;
    // Loose benches/statues repeated across every block obscured district identity.
    if (id.startsWith('tod:city:prop:')) return true;
    return false;
  }).map(entity => entity.id));
  scene.entities = scene.entities.filter(entity => !removed.has(entity.id));
  // Rebuilding owner-follow art must replace its materials as well as its entities.
  declaration.materials = declaration.materials.filter(material => !material.id.startsWith(prefix));
  if (combat.environment) {
    combat.environment.surfaces = combat.environment.surfaces.filter(surface => !removed.has(surface.entityId));
    for (const surface of combat.environment.surfaces) for (const field of ['hideIds', 'revealIds', 'debrisIds', 'warningIds', 'toolIds'] as const) {
      if (surface[field]) surface[field] = surface[field]!.filter(id => !removed.has(id));
    }
  }
  const districts: Array<{ id: string; names: [string, string, string]; author: typeof authorConstruction }> = [
    { id: 'construction', names: ['Scaffold yard', 'Cross-site office', 'North extension'], author: authorConstruction },
    { id: 'market', names: ['Morning aisles', 'Delivery court', 'Night market'], author: authorMarket },
    { id: 'residential', names: ['Courtyard', 'Through apartments', 'Balcony court'], author: authorResidential },
    { id: 'depot', names: ['West loading', 'Split platforms', 'East interchange'], author: authorDepot },
    { id: 'utility', names: ['Compressor court', 'Bypass court', 'Split service yard'], author: authorUtility },
  ];
  combat.arenaLayouts = districts.map((district, index) => {
    const { kit, layout } = createDistrictKit({ declaration, combat, id: district.id, names: district.names, seed: seed + index });
    district.author({ kit });
    authorDistrictExperiment({ kit, layout, seed: seed + index, district: district.id, number: index + 1 });
    authorDistrictFurniture({ declaration, combat, kit, district: district.id });
    return layout;
  });
  attachResidentialDivider({ declaration, combat });
  authorResidentialBoiler({ declaration, combat });
  // Complete owner cleanup after replacing walls removes unused fading materials.
  const used = new Set(declaration.scenes.flatMap(scene => scene.entities.map(entity => entity.materialId)));
  declaration.materials = declaration.materials.filter(material => !material.id.includes(':occlusion') && !material.id.startsWith('tod:city:prop:') || used.has(material.id));
  authorCombatObstructions(declaration, new Set(scene.entities.filter(entity => entity.id.startsWith(prefix) && entity.physics).map(entity => entity.id)));
}
