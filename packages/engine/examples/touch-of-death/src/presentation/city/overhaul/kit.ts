import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

export type Vec3 = [number, number, number];
export type Positions = Vec3 | [Vec3, Vec3, Vec3];
export type ModuleBox = (id: string, material: string, offset: Vec3, scale: Vec3, solid?: boolean, owner?: string) => string;
export type DistrictKit = {
  box: (id: string, material: string, at: Positions, scale: Vec3, solid?: boolean, owner?: string) => string;
  module: (id: string, origins: Positions, build: (box: ModuleBox) => void) => void;
  cover: (id: string, at: Positions, scale: Vec3, material?: string) => string;
};

export function districtPositions(at: Positions): [Vec3, Vec3, Vec3] {
  if (typeof at[0] === 'number' && typeof at[1] === 'number' && typeof at[2] === 'number') {
    const point: Vec3 = [at[0], at[1], at[2]];
    return [[...point], [...point], [...point]];
  }
  if (Array.isArray(at[0]) && Array.isArray(at[1]) && Array.isArray(at[2])) return [at[0], at[1], at[2]];
  throw Error('District positions must contain one point or three points.');
}

function offsetPositions(positions: [Vec3, Vec3, Vec3], offset: Vec3): [Vec3, Vec3, Vec3] {
  const shift = (p: Vec3): Vec3 => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
  return [shift(positions[0]), shift(positions[1]), shift(positions[2])];
}

/** One authored primitive pool, three real arrangements; no hidden offstage colliders. */
export function createDistrictKit({ declaration, combat, id, names, seed }: {
  declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; id: string; names: [string, string, string]; seed: number;
}) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const prefix = `tod:city:overhaul:${id}:`;
  const variants = names.map(name => {
    const props: Array<{ entityId: string; position: Vec3 }> = [];
    return { id: name, props };
  });
  const phase = (seed >>> 0) % 3;
  const ids = new Set<string>();
  const followMaterials = new Map<string, string>();
  const box: DistrictKit['box'] = (name, material, at, scale, solid = false, owner) => {
    const entityId = prefix + name;
    if (ids.has(entityId)) throw Error(`Duplicate district piece ${entityId}.`);
    ids.add(entityId);
    const positions = districtPositions(at);
    let materialId = `tod:city:${material}`;
    if (owner) {
      // Only pieces following the same solid can share its independently fading
      // material. Keep source colors distinct while batching repeated trim.
      const key = `${owner}\0${materialId}`, shared = followMaterials.get(key);
      if (shared) materialId = shared;
      else {
        const source = declaration.materials.find(item => item.id === materialId);
        if (!source) throw Error(`Unknown district material ${material}.`);
        materialId = `${owner}:occlusion-follow:${materialId}`;
        declaration.materials.push({ ...structuredClone(source), id: materialId, alphaMode: 'blend' });
        followMaterials.set(key, materialId);
      }
    }
    scene.entities.push({ id: entityId, meshId: 'tod:box', materialId, position: [...positions[phase]!], scale: [...scale], rotationY: 0,
      ...(solid ? { physics: { type: 'static' as const, shape: 'box' as const, gravityScale: 0, continuous: false } } : {}) });
    for (const [index, variant] of variants.entries()) variant.props.push({ entityId, position: [...positions[index]!] });
    return entityId;
  };
  const kit: DistrictKit = {
    box,
    module(name, origins, build) {
      const positions = districtPositions(origins);
      build((part, material, offset, scale, solid, owner) => box(`${name}:${part}`, material,
        offsetPositions(positions, offset), scale, solid, owner));
    },
    cover(name, at, scale, material = 'warning') {
      const root = box(name, material, at, scale, true), positions = districtPositions(at);
      const debrisIds = [-1, 1].map(side => box(`${name}:broken:${side}`, material,
        offsetPositions(positions, [side * scale[0] * .65, -scale[1] + .12, side * .3]),
        [scale[0] * .55, .12, Math.max(.2, scale[2] * .8)]));
      const environment = combat.environment ??= { surfaces: [] };
      environment.surfaces.push({ entityId: root, trigger: { kind: 'impact', minSpeed: 3 }, debrisIds });
      return root;
    },
  };
  return { kit, layout: { id, variants: [...variants.slice(phase), ...variants.slice(0, phase)] } };
}
