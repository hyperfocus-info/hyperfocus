import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cityStationTemplates } from '../neighborhood/stations.ts';
import type { DistrictKit, Vec3 } from './kit.ts';

/** Dress the existing station colliders; stock and furniture positions stay inventory-owned. */
export function authorDistrictFurniture({ declaration, combat, kit, district }: {
  declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; kit: DistrictKit; district: string;
}) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  const entities = new Map(scene.entities.map(entity => [entity.id, entity]));
  for (const station of cityStationTemplates.filter(station => station.district === district)) {
    const owner = entities.get(`tod:city:neighborhood:station:${station.id}`);
    if (!owner) continue;
    const rootMaterial = materials.get(owner.materialId)!;
    const bodyRole = district === 'construction' ? 'concrete-light' : district === 'market' ? 'plaster'
      : district === 'residential' ? 'style:residential' : district === 'depot' ? 'style:transit' : 'style:utility';
    const body = materials.get(`tod:city:${bodyRole}`)!;
    rootMaterial.baseColor = [...body.baseColor];rootMaterial.metallic = body.metallic;rootMaterial.roughness = body.roughness;
    delete rootMaterial.emissive;
    const dress = (suffix: string, role: string) => {
      const part = entities.get(`${owner.id}:${suffix}`);
      if (!part) return;
      const source = materials.get(`tod:city:${role}`)!;
      const id = `${owner.id}:occlusion-follow:tod:city:${role}`;
      if (!materials.has(id)) {
        const material = { ...structuredClone(source), id, alphaMode: 'blend' as const };
        declaration.materials.push(material);materials.set(id, material);
      }
      part.materialId = id;
      return part;
    };
    dress('top', district === 'market' || district === 'residential' ? 'concrete-light' : 'steel');
    const label = dress('label', 'style:public-paint');
    if (label) label.scale = [.13, .035, .012];
    if (district === 'utility') {
      const indicator = dress('rack-light', 'style:active-blue');
      if (indicator) indicator.scale = [.06, .035, .012];
    }
    if (district === 'construction' || district === 'market' || district === 'depot') {
      const add = (name: string, role: string, offset: Vec3, scale: Vec3) => {
        const id = kit.box(`furniture:${station.id}:${name}`, role,
          [owner.position[0] + offset[0], owner.position[1] + offset[1], owner.position[2] + offset[2]], scale, false, owner.id);
        const surface = combat.environment?.surfaces.find(surface => surface.entityId === owner.id);
        if (surface) surface.hideIds = [...surface.hideIds ?? [], id];
      };
      if (district === 'construction') {
        for (const y of [-.15, .15]) add(`stack-seam:${y}`, 'steel', [0, y, .567], [1.27, .018, .012]);
      } else if (district === 'market' && station.id.includes('delivery')) {
        for (const x of [-1.1, 1.1]) add(`case-strap:${x}`, 'steel', [x, 0, .567], [.035, .4, .012]);
      } else if (district === 'market') {
        add('serving-recess', 'concrete-dark', [0, -.08, .567], [1.08, .24, .012]);
        add('serving-shelf', 'concrete-light', [0, -.31, .59], [1.12, .025, .04]);
      } else {
        for (const x of [-.98, .98]) add(`cart-wheel:${x}`, 'steel', [x, -.3, .57], [.14, .14, .025]);
      }
    }
  }
  // Existing trims and kit additions use the same owner/source key. Retain one
  // material for that batch when a pre-existing station already supplied it.
  const followers = new Map<string, Hyperfocus3DDeclaration['materials'][number]>();
  declaration.materials = declaration.materials.filter(material => {
    if (!material.id.startsWith('tod:city:neighborhood:station:') || !material.id.includes(':occlusion-follow:')) return true;
    if (!followers.has(material.id)) followers.set(material.id, material);
    return false;
  });
  declaration.materials.push(...[...followers.values()].sort((a, b) => a.id.localeCompare(b.id)));
}
