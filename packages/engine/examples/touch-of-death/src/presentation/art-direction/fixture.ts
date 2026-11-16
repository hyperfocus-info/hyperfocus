import type { Hyperfocus3DDeclaration, PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import { createDefaultProject } from '@hyperfocus/engine/project';
import { cookPrimitiveModel } from '@hyperfocus/engine/assets/model-cooking';
import { cookFighterProfile } from '../fighter-profile.ts';
import { DEFAULT_TOON_LOOK_3D } from '@hyperfocus/engine/render/3d-material-presets';
import type { ArenaCandidate, FighterCandidate } from './candidates.ts';

type Vec3 = [number, number, number];
type Entity = Hyperfocus3DDeclaration['scenes'][number]['entities'][number];

/** Review fixture uses the production renderer and ordinary portable models. */
export function createArtFixture() {
  const project = createDefaultProject('Touch of Death art study');
  project.scenes = [{ id: 'scene-main', name: '3D Project Data', entities: [] }];
  project.activeSceneId = 'scene-main';
  project.timeline.tracks = [];project.timeline.audioTracks = [];project.timeline.events = [];
  delete project.tilemap.sourceAssetId;delete project.atlas.sourceAssetId;project.tilemap.values.fill(0);
  const declaration: Hyperfocus3DDeclaration = {
    version: 1, activeSceneId: 'level-3d',
    budgets: { meshes: 128, vertices: 150_000, indices: 600_000, textures: 1, textureBytes: 1, materials: 32, lights: 4, entities: 256 },
    meshes: [], textures: [], materials: [],
    scenes: [{ id: 'level-3d', camera: { position: [0, 1.15, 5.5], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: .43, near: .05, far: 150 }, lights: [], entities: [] }],
    audio: { policy: 'disabled', cues: [] }, save: { restoreOnBoot: false, slot: 'auto', maxBytes: 262_144 },
  };
  project.extensions = { hyperfocus3D: declaration };
  project.assets = [];
  const scene = declaration.scenes[0]!;
  scene.clearColor = [.115, .133, .15, 1];
  scene.lights = [
    { id: 'tod:ambient', kind: 'ambient', color: [.72, .80, .91], intensity: .5 },
    { id: 'tod:key', kind: 'directional', color: [1, .94, .83], intensity: 1.45, direction: [-.65, -1, -.8] },
    { id: 'tod:rim', kind: 'directional', color: [.62, .75, .85], intensity: .25, direction: [.8, -.4, .9] },
  ];
  const assets: PortableAsset3D[] = [];
  const rotations: Record<string, [number, number, number, number]> = {};
  function model(id: string, bytes: Uint8Array) {
    const assetId = `art:${id}`;
    assets.push({ id: assetId, mimeType: 'model/gltf-binary', bytes });
    project.assets.push({ id: assetId, name: `${id}.glb`, kind: 'data', mimeType: 'model/gltf-binary', size: bytes.length, lastModified: 0, source: 'generated' });
    declaration.meshes.push({ id, assetId, primitive: 0, buffers: [] });
    return id;
  }
  function material(id: string, rgb: Vec3, character = false) {
    declaration.materials.push({ id, shading: 'lit', shader: 'toon', baseColor: [...rgb, 1], metallic: 0, roughness: .84, doubleSided: false,
      toon: { ...DEFAULT_TOON_LOOK_3D, outlineColor: [.035, .045, .055, 1], shadowColor: [.24, .28, .34], rimColor: [.65, .76, .83], bands: 3, rimStrength: .08, outlineWidth: character ? .001 : 0 } });
  }
  material('cloth', [.12, .38, .43], true); material('opponent', [.56, .20, .16], true);
  material('skin', [.72, .49, .32], true); material('ink', [.055, .075, .09], true);
  material('wrap', [.69, .66, .56], true); material('trousers', [.095, .13, .16], true);
  material('concrete', [.34, .36, .35]); material('structure', [.16, .196, .22]);
  material('floor', [.23, .26, .27]); material('recess', [.075, .095, .11]);
  material('route', [.65, .64, .59]); material('orange', [.78, .39, .16]);
  material('technology', [.22, .365, .447]); material('backdrop', [.11, .145, .17]);
  model('box', cookPrimitiveModel({ label: 'Blockout mass', parts: [['box', 0, 0, 0, 1, 1, 1, 0, 0, 0]] }));
  const add = (id: string, meshId: string, materialId: string, position: Vec3, scale: Vec3 = [1, 1, 1], rotationY = 0) => {
    const entity: Entity = { id, meshId, materialId, position, scale, rotationY };
    scene.entities.push(entity); return entity;
  };
  return { project, declaration, scene, assets, rotations, model, add };
}

export type ArtFixture = ReturnType<typeof createArtFixture>;

export function addFighter(options: { fixture: ArtFixture; candidate: FighterCandidate; id: string; position?: Vec3; yaw?: number; opponent?: boolean }) {
  const { fixture, candidate: c, id, position = [0, 0, 0], yaw = 0 } = options;
  const { add, model } = fixture;
  const cloth = options.opponent ? 'opponent' : 'cloth';
  const shoulderY = c.height - c.head - .075, hipY = c.legs;
  const world = ([x, y, z]: Vec3): Vec3 => [position[0] + x * Math.cos(yaw) + z * Math.sin(yaw), position[1] + y, position[2] - x * Math.sin(yaw) + z * Math.cos(yaw)];
  const profile = (part: string, rings: Parameters<typeof cookFighterProfile>[1], mat: string, at: Vec3 = [0, 0, 0]) => {
    const mesh = model(`${id}:${part}`, cookFighterProfile(part, rings));
    return add(`${id}:${part}`, mesh, mat, world(at), [1, 1, 1], yaw);
  };
  profile('torso', [[c.hem, .03, .04, 0], [c.hem + .01, c.hip, .13, 0], [hipY + .13, c.waist, .13, 0], [shoulderY - .16, c.shoulder * .9, .17, 0], [shoulderY - .045, c.shoulder, .14, 0], [shoulderY + .025, .09, .075, 0], [shoulderY + .03, .03, .03, 0]], cloth);
  profile('pelvis', [[hipY - .16, .16, .115, 0], [hipY - .07, c.hip, .14, 0], [hipY + .04, c.waist, .125, 0]], 'trousers');
  const chin = c.height - c.head;
  profile('neck', [[shoulderY, .067, .067, 0], [chin + .035, .062, .065, 0]], 'skin');
  profile('head', [[chin, .04, .045, .035], [chin + c.head * .18, .08, .085, .022], [chin + c.head * .45, .106, .105, .012], [chin + c.head * .73, .103, .105, 0], [c.height - .035, .083, .09, -.01], [c.height, .01, .01, -.01]], 'skin');
  profile('hair', [[chin + c.head * .67, .104, .108, -.009], [c.height - .033, .106, .11, -.008], [c.height + .005, .068, .082, -.018], [c.height + .022, .001, .001, -.018]], 'ink');
  // One continuous profile per major costume mass; detail is deliberately absent.
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? 'left' : 'right';
    const limb = (part: string, a: Vec3, b: Vec3, radius: number, mat: string, taper = .8) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const mesh = model(`${id}:${part}`, cookFighterProfile(part, [[-length / 2, radius * taper, radius * taper, 0], [-length * .3, radius, radius, 0], [length * .34, radius, radius, 0], [length / 2, radius * .88, radius * .88, 0]]));
      const entity = add(`${id}:${part}`, mesh, mat, world([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]));
      const wa = world(a), wb = world(b), dx = (wa[0] - wb[0]) / length, dy = (wa[1] - wb[1]) / length, dz = (wa[2] - wb[2]) / length;
      const norm = Math.hypot(dz, -dx, 1 + dy);
      fixture.rotations[entity.id] = norm < .00001 ? [1, 0, 0, 0] : [dz / norm, 0, -dx / norm, (1 + dy) / norm];
      return entity;
    };
    const shoulder: Vec3 = [sign * c.shoulder, shoulderY - .055, 0];
    const elbow: Vec3 = [sign * (c.shoulder + .105), shoulderY - .31, .035];
    const wrist: Vec3 = [sign * (c.shoulder + .15), shoulderY - .57, .06];
    limb(`${side}-sleeve`, shoulder, elbow, c.shoulder * .31, cloth);
    limb(`${side}-forearm`, elbow, wrist, c.hand * .76, 'skin', .65);
    profile(`${side}-hand`, [[-.10, .042, .044, 0], [-.065, c.hand * .57, c.hand * .63, 0], [.045, c.hand * .62, c.hand * .70, 0], [.075, .025, .04, 0]], 'wrap', [wrist[0], wrist[1] - .07, wrist[2]]);
    const hip: Vec3 = [sign * .125, hipY, 0], knee: Vec3 = [sign * .17, hipY * .53, .02], ankle: Vec3 = [sign * .205, .14, 0];
    limb(`${side}-thigh`, hip, knee, c.trouser, 'trousers', .82);
    limb(`${side}-shin`, knee, ankle, c.trouser * .78, 'trousers', .62);
    profile(`${side}-shoe`, [[.015, .077, .14, .035], [.065, .085, .16, .045], [.12, .067, .125, .02], [.20, .052, .063, -.015]], 'ink', [ankle[0], 0, 0]);
  }
  return { height: c.height, shoulderY, hipY };
}

export function addCourtyard(options: { fixture: ArtFixture; candidate: ArenaCandidate }) {
  const { fixture: { add, scene }, candidate } = options;
  scene.clearColor = [.095, .13, .16, 1];
  scene.camera = { position: [4, 6, 18], target: [0, 2, -2], up: [0, 1, 0], fovYRadians: .68, near: .1, far: 150 };
  const box = (id: string, mat: string, position: Vec3, scale: Vec3) => add(`court:${id}`, 'box', mat, position, scale);
  box('floor', 'floor', [0, -.16, 0], [9, .16, 7]);
  box('left-wing', 'concrete', [-6.5, 4.4, -3.6], [2.2, 4.4, 3.4]);
  box('right-wing', 'concrete', [6.7, candidate.id === 'b' ? 2.3 : 3.8, -4.5], [2.1, candidate.id === 'b' ? 2.3 : 3.8, 2.5]);
  box('recess', 'recess', [0, 3.1, -7], [4.3, 3.1, .3]);
  box('back-wall', 'concrete', [0, 4.5, -7.3], [4.4, 1.4, .4]);
  box('door', 'structure', [candidate.id === 'b' ? 2.3 : 0, 1.45, -6.65], [1.05, 1.45, .1]);
  box('door-header', 'route', [candidate.id === 'b' ? 2.3 : 0, 3, -6.52], [1.12, .045, .035]);
  if (candidate.id === 'c') box('bridge', 'structure', [0, 4.8, -2.7], [4.5, .43, 1.05]);
  for (const side of [-1, 1]) {
    for (const y of side === 1 && candidate.id === 'b' ? [2.6] : [2.9, 5.7]) {
      box(`balcony:${side}:${y}`, 'structure', [side * 5.2, y, -3.4], [.65, .14, 3.15]);
      box(`parapet:${side}:${y}`, 'structure', [side * 4.7, y + .5, -3.4], [.1, .35, 3.15]);
    }
    box(`route:${side}`, 'route', [side * 3.6, .005, -.5], [.025, .008, 2.8]);
    box(`service:${side}`, 'structure', [side * 5.1, .55, -.6], [.55, .55, .8]);
    box(`handle:${side}`, 'orange', [side * 5.1, .9, .22], [.15, .04, .03]);
  }
  box('watch-window', 'technology', [-2.4, 4.5, -6.85], [.85, .30, .025]);
  for (let i = 0; i < 3; i++) box(`distance:${i}`, 'backdrop', [-10 + i * 9, 6.5 + i * 1.4, -18], [3, 6.5 + i * 1.4, 2]);
}
