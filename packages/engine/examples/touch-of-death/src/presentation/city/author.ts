import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

import { authorCityDetails } from './details.ts';
import { authorCityArchitecture } from './architecture.ts';
import { cityTrimOwner } from './occlusion.ts';
import { applyInstalledCityModels } from './models.ts';
import { authorCityFrontage } from './frontage.ts';
import { authorCityLift } from './lift.ts';
import { authorCityExpansion, authorCityMatchLayouts } from './expansion.ts';
import { authorCityTools } from './tools.ts';
import { authorCityDangerCues } from './danger-cues.ts';
import { authorCombatObstructions } from '../obstructions.ts';
import { authorCityActivity } from './traffic.ts';
import { authorCityMachineStop } from './machinery/author.ts';
import { authorCityVehicleWrecks } from './vehicles/wrecks.ts';
import { authorCityProps } from './props.ts';
import { authorCityDistricts } from './districts.ts';
import { authorCityHazards } from './hazards/author.ts';
import { authorCityUnderground } from './underground/author.ts';
import { authorCityResidents } from './crowds/author.ts';
import { applyCityStyle } from './style/palette.ts';
import { authorCityNeighborhood } from './neighborhood/author.ts';
import { readCityGenerationSettings, type CityGenerationSettings } from './generation/settings.ts';
import { finishCityGeneration } from './generation/finish.ts';
import { retainCityInventory } from './generation/preserve.ts';
import { authorCityOverhaul } from './overhaul/author.ts';
import { authorCityFinishes } from './finishings/author.ts';
import { authorCityWeaponLayouts } from './weapons/layouts.ts';
import { validateCityPresentation } from './generation/presentation.ts';
import { finishServiceEntrance } from './service-entrance.ts';

type Vec3 = [number, number, number];
const prefix = 'tod:city:';
const oldArena = /^(tod:(arena|back-wall|wall-stripe|prop-left|prop-right|gate-top)$|tod:(boundary|platform|gate|seam-x|seam-z|edge):)/;

/** Replaces only the owned arena; fighter rigs, wardrobe, assets and user objects survive. */
export function applyTouchOfDeathCity(options: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; settings?: Partial<CityGenerationSettings>; previousSettings?: Partial<CityGenerationSettings> }) {
  const settings = readCityGenerationSettings(options.settings);
  const declaration = structuredClone(options.declaration), combat = structuredClone(options.combat);
  const hadInventory = Boolean(combat.weaponLayouts);
  const inventory = retainCityInventory(declaration, combat, options.previousSettings?.districtSize === 'compact');
  buildCity({ declaration, combat, settings, restoreInventory: inventory.restore });
  authorCityOverhaul({ declaration, combat, seed: settings.seed });
  applyCityStyle({ declaration });
  finishServiceEntrance(declaration, combat);
  authorCityFinishes({ declaration, combat });
  applyInstalledCityModels(declaration);
  inventory.rebind();
  if (!hadInventory) authorCityWeaponLayouts({ declaration, combat });
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const weapons = new Set(combat.interactions?.weapons.map(weapon => weapon.entityId));
  authorCombatObstructions(declaration, new Set(scene.entities.filter(entity => entity.id.startsWith(prefix)
    && !weapons.has(entity.id) && !/^tod:city:(?:weapon|tool):/.test(entity.id)
    && entity.position[1] + entity.scale[1] > .4
    && (Math.max(...entity.scale) >= .5 || /(?:demolition-tip|:supply-line)$/.test(entity.id))).map(entity => entity.id)));
  finishCityGeneration({ declaration, combat, settings });
  validateCityPresentation(declaration, combat);
  // Editor command validation retains the active scene reference across macros.
  const scenes = declaration.scenes.map(scene => {
    const existing = options.declaration.scenes.find(value => value.id === scene.id);
    return existing ? Object.assign(existing, scene) : scene;
  });
  Object.assign(options.declaration, declaration, { scenes });Object.assign(options.combat, combat);
}

function buildCity(options: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D; settings: CityGenerationSettings; restoreInventory: () => void }) {
  const { declaration, combat } = options;
  const scene = declaration.scenes.find(item => item.id === declaration.activeSceneId);
  if (!scene || !declaration.meshes.some(mesh => mesh.id === 'tod:box')) throw new Error('Set up Touch of Death before adding its moving city.');
  scene.entities = scene.entities.filter(entity => !oldArena.test(entity.id) && !entity.id.startsWith(prefix));
  const previousMaterials = new Map(declaration.materials.map(material => [material.id, material]));
  declaration.materials = declaration.materials.filter(material => !material.id.startsWith(prefix));
  const colors: Array<[string, [number, number, number, number]]> = [
    ['asphalt', [.17, .215, .235, 1]], ['concrete', [.39, .405, .38, 1]], ['steel', [.095, .16, .185, 1]],
    ['plaster', [.61, .60, .53, 1]], ['warning', [.96, .48, .065, 1]], ['chalk', [.79, .77, .65, 1]],
    ['concrete-dark', [.19, .255, .275, 1]], ['concrete-light', [.56, .56, .49, 1]], ['rust', [.43, .245, .14, 1]], ['fracture', [.035, .055, .06, 1]],
    ['train', [.24, .39, .4, 1]], ['window', [.045, .12, .16, 1]], ['lamp', [.72, .91, .87, 1]],
    ['brick', [.36, .235, .19, 1]], ['paint', [.19, .32, .33, 1]], ['glass-lit', [.7, .6, .38, 1]],
    ['tool-wood', [.79, .34, .085, 1]], ['tool-metal', [.47, .51, .57, 1]],
    ['screen-glass', [.25, .43, .49, .2]], ['skyline', [.19, .255, .29, 1]], ['skyline-light', [.3, .35, .36, 1]],
  ];
  for (const [id, baseColor] of colors) {
    const material: Hyperfocus3DDeclaration['materials'][number] = { id: prefix + id, shading: 'lit', baseColor, metallic: id === 'steel' || id === 'train' ? .6 : 0, roughness: id === 'window' ? .28 : id === 'train' ? .5 : .9, doubleSided: false };
    const previous = previousMaterials.get(material.id);
    if (previous?.textureId) material.textureId = previous.textureId;
    if (previous?.textureIds) material.textureIds = structuredClone(previous.textureIds);
    if (previous?.uv) material.uv = structuredClone(previous.uv);
    if (id === 'lamp') material.emissive = [.2, .4, .35];
    if (id === 'glass-lit') material.emissive = [.08, .045, .012];
    if (id === 'screen-glass') { material.alphaMode = 'blend'; material.doubleSided = true; material.roughness = .25; }
    declaration.materials.push(material);
  }
  const box = (id: string, material: string, position: Vec3, halfExtents: Vec3, solid = true) => {
    const entity: typeof scene.entities[number] = { id: prefix + id, meshId: 'tod:box', materialId: prefix + material, position, scale: halfExtents, rotationY: 0,
      ...(solid ? { physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } as const } : {}) };
    scene.entities.push(entity); return entity;
  };
  // A street loop and the shorter exposed room route connect the same ends.
  box('street', 'asphalt', [0, -.3, 0], [16, .3, 12]);
  for (const side of [-1, 1]) {
    box(`retaining-x:${side}`, 'concrete', [side * 16.8, 11, 0], [1, 11, 12]);
    box(`retaining-z:${side}`, 'concrete', [0, side < 0 ? 1.5 : 11, side * 12.8], [17.8, side < 0 ? 1.5 : 11, 1]);
    // Visible neighboring facades enclose the site; no invisible ceiling or walls.
    for (let floor = 0; floor < 6; floor++) {
      box(`facade-x:${side}:${floor}`, 'window', [side * 15.79, 3 + floor * 3, 0], [.015, .55, 10], false);
      if (side > 0) box(`facade-z:${side}:${floor}`, 'window', [0, 3 + floor * 3, side * 11.79], [14, .55, .015], false);
    }
    for (const z of [-6, 4]) box(`door-jamb:${side}:${z}`, 'plaster', [side * 4, 3, z], [2, 3, .2]);
    box(`door-lintel:${side}`, 'steel', [0, 5.3, side < 0 ? -6 : 4], [2, .7, .2]);
  }
  // Open rail frontage: actual closely spaced steel bars retain launched bodies
  // while exposing the moving train through the industrial safety screen.
  for (let i = -11; i <= 11; i++) box(`rail-screen:${i}`, 'screen-glass', [i * 1.5, 12.5, -12.8], [.09, 9.5, .09]);
  box('rail-screen-top', 'steel', [0, 22, -12.8], [17, .1, .1]);
  box('west-wall', 'concrete', [-6, 3, -1], [.2, 3, 5]);
  box('east-wall-north', 'concrete', [6, 3, -4], [.2, 3, 2]);
  box('east-wall-south', 'concrete', [6, 3, 3], [.2, 3, 1]);
  box('weak-wall', 'plaster', [6, 3, 0], [.2, 3, 2]);
  // Cracks are shallow visible geometry, not a hidden durability indicator.
  const cracks: string[] = [];
  // The detail pass adds branching fractures on both faces.
  box('roof-west', 'concrete', [-3, 5.8, -1], [3, .2, 5]);
  box('roof-north', 'concrete', [3, 5.8, -5], [3, .2, 1]);
  box('demolition-floor', 'concrete', [3, 5.8, 0], [3, .2, 4]);
  // Six broad landings are a deliberate jumping route from street to roof.
  for (let i = 0; i < 12; i++) box(`stair:${i}`, 'concrete', [-8, (i + 1) / 4, 5.5 - i], [1.5, (i + 1) / 4, .5]);
  box('roof-bridge', 'steel', [-6.5, 5.8, -5], [.5, .2, 1]);
  const warnings: string[] = [];
  for (let i = 0; i < 6; i++) {
    const marking = box(`demolition-stripe:${i}`, 'warning', [i % 2 ? 5.55 : .45, 6.025, -2.8 + Math.floor(i / 2) * 2.8], [.3, .025, .08], false);
    marking.rotationY = i % 2 ? -.55 : .55; warnings.push(marking.id);
  }
  const warningLamp = box('demolition-lamp', 'warning', [5.7, 6.6, 3.7], [.15, .15, .15], false);
  // Recessed monitoring equipment is visible only after the weak exterior opens.
  const reveals = [box('observation-cabinet', 'steel', [5.45, 5.05, -1.75], [.27, .18, .22], false), box('observation-lens', 'window', [5.76, 5.05, -1.75], [.055, .1, .1], false), box('observation-indicator', 'lamp', [5.74, 5.14, -1.61], [.025, .025, .025], false)];
  reveals.push(box('observation-mount', 'steel', [5.45, 5.05, -2.02], [.06, .06, .3], false));
  reveals.push(box('observation-backing', 'concrete-dark', [5.57, 5.05, -2.3], [.24, .2, .035], false));
  reveals[1]!.meshId = 'tod:sphere';
  // A tracked demolition rig sits beyond the street retaining wall. Its gantry
  // suspends a cutter over the marked slab: the announced collapse has a cause.
  box('demolition-base', 'warning', [18.5, 1.2, 0], [2, .6, 2.4], false);
  for (const side of [-1, 1]) box(`demolition-track:${side}`, 'steel', [18.5, .5, side * 1.8], [2.4, .5, .45], false);
  box('demolition-cab', 'window', [19, 2.5, -1], [.8, .7, .9], false);
  box('demolition-mast', 'warning', [18, 5.8, 0], [.4, 4.2, .4], false);
  box('demolition-boom', 'warning', [10.5, 10, 0], [7.9, .35, .4], false);
  box('demolition-cable', 'steel', [3, 8.9, 0], [.055, 1.1, .055], false);
  box('demolition-tool', 'warning', [3, 7.4, 0], [.35, .7, .35], false);
  box('demolition-tip', 'steel', [3, 6.5, 0], [.12, .25, .12], false);
  // Elevated rail is outside the fight boundary; the train never interrupts combat.
  box('rail-deck', 'steel', [0, 7, -16], [27, .35, 1.7], false);
  for (const x of [-20, -10, 0, 10, 20]) box(`rail-pier:${x}`, 'concrete', [x, 3.5, -16], [.6, 3.5, .6], false);
  for (let i = 0; i < 3; i++) {
    const train = box(`train:${i}`, 'train', [-30 - i * 6, 8.7, -16], [2.8, 1.3, 1.25], false);
    train.animation = { kind: 'ping-pong', offset: [72, 0, 0], periodSeconds: 36, phase: 0 };
    for (const side of [-1, 1]) {
      const window = box(`train-window:${i}:${side}`, 'window', [-30 - i * 6, 9.1, -16 + side * 1.26], [2.2, .4, .015], false);
      window.animation = { ...train.animation, offset: [...train.animation.offset] };
    }
  }
  const details = authorCityDetails({ scene, box });
  authorCityArchitecture({ box });
  authorCityFrontage({ scene, box });
  authorCityLift({ box });
  const expandedSurfaces = authorCityExpansion({ scene, box });
  cracks.push(...details.wallDetails); warnings.push(...details.roofDetails);
  combat.environment = { surfaces: [
    { entityId: prefix + 'weak-wall', trigger: { kind: 'impact', minSpeed: 4 }, revealIds: reveals.map(entity => entity.id), debrisIds: details.wallDebris, hideIds: cracks },
    { entityId: prefix + 'demolition-floor', trigger: { kind: 'scheduled', warningFrame: 780, removeFrame: 1080 }, debrisIds: details.floorDebris, hideIds: warnings, warningIds: [warningLamp.id], toolIds: [prefix + 'demolition-tool', prefix + 'demolition-tip'] },
  ] };
  combat.environment.surfaces.push(...expandedSurfaces);
  authorCityTools({ declaration, combat });
  authorCityMatchLayouts({ combat });
  authorCityActivity({ declaration, combat });
  authorCityVehicleWrecks({ declaration, combat });
  authorCityMachineStop({ declaration, combat });
  authorCityDistricts({ declaration, combat });
  authorCityUnderground({ declaration, combat });
  authorCityResidents({ declaration });
  authorCityHazards({ declaration, combat, frequency: options.settings.hazardFrequency });
  authorCityProps({ declaration, combat });
  // Furniture must clear the retained inventory as well as newly authored stock.
  options.restoreInventory();
  authorCityNeighborhood({ declaration, combat, seed: options.settings.seed, density: options.settings.density });
  authorCityDangerCues({ declaration, combat });
  for (const [index, fighter] of combat.fighters.entries()) {
    const entity = scene.entities.find(entity => entity.id === fighter.entityId);
    if (entity) entity.position = [index === 0 ? -2 : 2, 1, 8];
  }
  scene.clearColor = [.09, .135, .17, 1];
  const sun = scene.lights.find(light => light.id === 'tod:key');
  if (sun) { sun.direction = [-.18, -1, -.12];sun.color = [1, .88, .74];sun.intensity = 2; }
  const ambient = scene.lights.find(light => light.id === 'tod:ambient');
  if (ambient) { ambient.color = [.65, .73, .82];ambient.intensity = .75; }
  declaration.save = { ...declaration.save, restoreOnBoot: false, maxBytes: Math.max(declaration.save.maxBytes, 1048576) };
  authorCombatObstructions(declaration, new Set(scene.entities.filter(entity => entity.id.startsWith(prefix) && entity.id !== prefix + 'street' && !entity.id.startsWith(prefix + 'rail-screen') && (entity.physics || entity.id.startsWith(prefix + 'facade-'))).map(entity => entity.id)));
  // Cosmetic trims need the same sightline fade as their supporting architecture.
  // Their individual colors remain while attached pieces follow a solid's fade.
  const materials = new Map(declaration.materials.map(material => [material.id, material]));
  for (const entity of scene.entities) {
    if (!(entity.id.startsWith(prefix + 'architecture:') || entity.id.startsWith(prefix + 'detail:') || entity.id.includes(':infill:') && entity.id.includes(':crack:')) || entity.animation || entity.position[1] + entity.scale[1] < .1) continue;
    const material = materials.get(entity.materialId);
    if (!material) continue;
    const owner = cityTrimOwner(entity.id);
    const id = owner ? `${owner}:occlusion-follow:${entity.id}` : entity.id + ':occlusion';
    declaration.materials.push({ ...structuredClone(material), id, alphaMode: 'blend' });
    entity.materialId = id;
  }
  applyInstalledCityModels(declaration);
  applyCityStyle({ declaration });
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
