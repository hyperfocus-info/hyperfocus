import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cityVisualRole } from './roles.ts';
import { lightCityEncounters } from './lighting.ts';

type Color = [number, number, number];
type Material = Hyperfocus3DDeclaration['materials'][number];
const rgb = (hex: number): Color => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
const palette: Record<string, Color> = {
  asphalt: rgb(0x252c2e), concrete: rgb(0x56595a), 'concrete-dark': rgb(0x30383c),
  'concrete-light': rgb(0x85847f), plaster: rgb(0x756d62), steel: rgb(0x343f43),
  warning: rgb(0xf58a3d), chalk: rgb(0xd2cec0), rust: rgb(0x865c42),
  fracture: rgb(0x11171c), train: rgb(0x986a45), window: rgb(0x1a2429),
  lamp: rgb(0xd6ba8b), brick: rgb(0x605759), paint: rgb(0x45564f),
  'glass-lit': rgb(0x8c7554), 'screen-glass': rgb(0x28363d),
  skyline: rgb(0x222c32), 'skyline-light': rgb(0x354046),
  'tool-wood': rgb(0xba7744), 'tool-metal': rgb(0x899493),
  structure: rgb(0x293238), route: rgb(0xbcb8a7), canvas: rgb(0xa58a69),
  'canvas-stripe': rgb(0x36564c), residential: rgb(0x78676f), 'residential-floor': rgb(0x77766f),
  transit: rgb(0x4b5b60), utility: rgb(0x505c50), 'public-paint': rgb(0x896440),
  'test-blue': rgb(0x385d72), 'active-blue': rgb(0x64b9d0), danger: rgb(0xe75439),
  'paving-worksite': rgb(0x494b46), 'paving-market': rgb(0x55534b), 'paving-residential': rgb(0x4d484b),
  'paving-depot': rgb(0x434c50), 'paving-utility': rgb(0x414b43), 'paving-edge': rgb(0x74796f),
  'paving-joint': rgb(0x303633), paper: rgb(0xaaa592),
  'produce-green': rgb(0x7a8750), 'produce-ochre': rgb(0x95804e), 'domestic-glass': rgb(0xb69c71), 'observation-glass': rgb(0x385d72),
  'oversight-brass': rgb(0x948052),
};

/** Color describes a use, not an outline around every primitive. */
export function applyCityStyle({ declaration }: { declaration: Hyperfocus3DDeclaration }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene?.entities.some(entity => entity.id === 'tod:city:street')) return;
  const colorRoles = new Map<string, string>();
  for (const material of declaration.materials) {
    const role = material.id.replace(/^tod:city:(?:style:)?/, '');
    if (material.id.startsWith('tod:city:') && palette[role]) colorRoles.set(material.baseColor.slice(0, 3).join(','), role);
  }
  const roles = new Map<string, string>();
  for (const material of declaration.materials) {
    if (!material.id.startsWith('tod:city:')) continue;
    const direct = material.id.replace(/^tod:city:(?:style:)?/, '');
    const follower = material.id.split(':occlusion-follow:').at(-1)?.replace(/^tod:city:(?:style:)?/, '');
    const role = palette[direct] ? direct : follower && palette[follower] ? follower : colorRoles.get(material.baseColor.slice(0, 3).join(','));
    if (role) { roles.set(material.id, role);material.baseColor = [...palette[role]!, material.baseColor[3]]; }
    if (role === 'lamp') material.emissive = [.065, .045, .025];
    if (role === 'glass-lit') material.emissive = [.025, .017, .008];
    if (material.id.startsWith('tod:city:danger-cue:')) {
      roles.set(material.id, 'danger');material.baseColor = [...palette.danger!, material.baseColor[3]];material.emissive = [.5, .06, .015];
    }
    removeStockGrain(material);
  }
  for (const [role, color] of Object.entries(palette)) {
    const id = `tod:city:style:${role}`;
    if (declaration.materials.some(material => material.id === id)) continue;
    const material: Material = { id, shading: 'lit', baseColor: [...color, 1], metallic: 0, roughness: .95, doubleSided: false };
    if (role === 'observation-glass') { material.baseColor[3] = .2;material.alphaMode = 'blend';material.doubleSided = true; }
    if (role === 'active-blue') material.emissive = [.06, .19, .24];
    else if (role === 'lamp') material.emissive = [.065, .045, .025];
    else if (role === 'glass-lit') material.emissive = [.025, .017, .008];
    else if (role === 'domestic-glass') material.emissive = [.2, .12, .045];
    declaration.materials.push(material);
  }
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  for (const entity of scene.entities) {
    if (!entity.id.startsWith('tod:city:') || /^tod:city:(?:weapon|tool):/.test(entity.id)) continue;
    const role = cityVisualRole(entity.id, roles.get(entity.materialId));
    if (!role) continue;
    const source = materials.get(entity.materialId), target = materials.get(`tod:city:style:${role}`)!;
    if (!source) continue;
    if (entity.materialId.endsWith(':occlusion')) {
      source.baseColor = [target.baseColor[0], target.baseColor[1], target.baseColor[2], source.baseColor[3]];
      if (target.emissive) source.emissive = [...target.emissive];
      else delete source.emissive;
    } else if (entity.materialId.includes(':occlusion-follow:')) {
      const owner = entity.materialId.slice(0, entity.materialId.indexOf(':occlusion-follow:'));
      const id = `${owner}:occlusion-follow:tod:city:style:${role}`;
      if (!materials.has(id)) {
        const material: Material = { ...structuredClone(target), id, alphaMode: 'blend', baseColor: [target.baseColor[0], target.baseColor[1], target.baseColor[2], source.baseColor[3]] };
        if (source.textureId) material.textureId = source.textureId;
        if (source.textureIds) material.textureIds = structuredClone(source.textureIds);
        if (source.uv) material.uv = structuredClone(source.uv);
        declaration.materials.push(material);materials.set(id, material);
      }
      entity.materialId = id;
    } else entity.materialId = target.id;
  }
  const used = new Set(declaration.scenes.flatMap(scene => scene.entities.map(entity => entity.materialId)));
  declaration.materials = declaration.materials.filter(material => !material.id.includes(':occlusion-follow:') || used.has(material.id));
  lightCityEncounters(scene);
}

function removeStockGrain(material: Hyperfocus3DDeclaration['materials'][number]) {
  if (material.textureId === 'tod:city:concrete-grain') delete material.textureId;
  if (!material.textureIds) return;
  for (const channel of ['baseColor', 'normal', 'occlusion', 'metallicRoughness', 'emissive'] as const) {
    if (material.textureIds[channel] === 'tod:city:concrete-grain') delete material.textureIds[channel];
  }
  if (!Object.keys(material.textureIds).length) delete material.textureIds;
}
