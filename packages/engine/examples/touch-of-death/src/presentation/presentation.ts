import type { EditorProject } from '@hyperfocus/engine/project';
import { readCombatProject3D, type Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { DEFAULT_TOON_LOOK_3D } from '@hyperfocus/engine/render/3d-material-presets';
import { readMutableHyperfocus3DDeclaration as readEditor3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { encloseTouchOfDeathArena } from './arena.ts';
import { articulateTouchOfDeathFighters } from './rig.ts';

type Vec3 = [number, number, number];
type Material = Hyperfocus3DDeclaration['materials'][number];

/** Invoked inside the setup command's single history transaction after binary assets are prepared. */
export function applyTouchOfDeathPresentation(options: {
  project: EditorProject;
  fighterIds: readonly [string, string];
  assets: { fighter: string; box: string; sphere: string; impact?: string };
}) {
  const declaration = readEditor3DDeclaration(options.project);
  const scene = declaration?.scenes.find(item => item.id === declaration.activeSceneId);
  if (!declaration || !scene) throw new Error('Open a 3D scene to build the Touch of Death arena.');
  const fighters = options.fighterIds.map(id => scene.entities.find(entity => entity.id === id));
  if (fighters.some(item => !item)) throw new Error('Both Touch of Death fighters must exist.');
  if (declaration.meshes.some(item => item.id.startsWith('tod:'))) throw new Error('Touch of Death presentation is already configured.');
  for (const [kind, assetId] of Object.entries(options.assets)) {
    if (!options.project.assets.some(asset => asset.id === assetId)) throw new Error(`Missing Touch of Death ${kind} model asset.`);
  }
  const combat = readCombatProject3D(options.project.extensions?.hyperfocusCombat);
  if (combat) {
    combat.config.hurtRadius = 1;
    options.project.extensions!.hyperfocusCombat = combat;
  }
  for (const [kind, assetId] of Object.entries(options.assets)) declaration.meshes.push({ id: kind === 'impact' ? 'tod:impact-shard' : `tod:${kind}`, assetId, primitive: 0, buffers: [] });
  const material = (id: string, color: Material['baseColor'], emissive?: Material['emissive']) => {
    declaration.materials.push({ id: `tod:${id}`, shading: 'lit', shader: 'toon', baseColor: color, metallic: 0, roughness: .85, doubleSided: false,
      toon: { ...DEFAULT_TOON_LOOK_3D, outlineColor: [...DEFAULT_TOON_LOOK_3D.outlineColor], bands: 3, shadowColor: [.19, .21, .35], rimColor: [.7, .88, 1], rimStrength: .3, outlineWidth: .003 },
      ...(emissive ? { emissive } : {}), ...(color[3] < 1 ? { alphaMode: 'blend' as const } : {}) });
  };
  material('cyan', [.1, .72, .8, 1]); material('coral', [.9, .22, .19, 1]);
  material('skin', [.96, .69, .47, 1]); material('ink', [.035, .045, .085, 1]);
  material('stone', [.25, .29, .39, 1]); material('edge', [.13, .16, .24, 1]);
  material('ivory', [.83, .81, .72, 1]); material('gold', [1, .68, .16, 1], [.25, .12, .01]);
  material('guard', [.3, .85, 1, .2], [.1, .3, .4]);
  material('impact', [1, .96, .65, 1], [1, .8, .3]);
  const add = (id: string, mesh: string, mat: string, position: Vec3, scale: Vec3, solid = false) => {
    const entity: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = { id, meshId: `tod:${mesh}`, materialId: `tod:${mat}`, position, scale: mesh === 'box' ? [scale[0] / 2, scale[1] / 2, scale[2] / 2] : scale, rotationY: 0,
      ...(solid ? { physics: { type: 'static' as const, shape: 'box' as const, gravityScale: 0, continuous: false } } : {}) };
    scene.entities.push(entity);
    return entity;
  };
  // Keep the user's existing objects. The demo platform sits above the starter floor.
  add('tod:arena', 'box', 'stone', [0, -.22, 0], [18, .4, 14], true);
  add('tod:back-wall', 'box', 'edge', [0, 1.5, -6], [14, 3, .55], true);
  add('tod:wall-stripe', 'box', 'gold', [0, 1.48, -5.7], [14, .1, .04]);
  add('tod:prop-left', 'box', 'stone', [-6, .7, -2.5], [1.3, 1.4, 1.3], true);
  add('tod:prop-right', 'box', 'stone', [6, .7, -2.5], [1.3, 1.4, 1.3], true);
  for (let index = -3; index <= 3; index++) {
    add(`tod:seam-x:${index}`, 'box', 'edge', [index * 2.4, -.008, 0], [.018, .015, 13.5]);
    add(`tod:seam-z:${index}`, 'box', 'edge', [0, -.008, index * 1.9], [17.5, .015, .018]);
  }
  for (const side of [-1, 1]) {
    add(`tod:edge:${side}`, 'box', 'ivory', [side * 8.5, .008, 0], [.07, .025, 13.4]);
    add(`tod:gate:${side}`, 'box', 'ivory', [side * 5.5, 3, -6.4], [.4, 6, .4]);
  }
  add('tod:gate-top', 'box', 'coral', [0, 5.9, -6.4], [12.2, .4, .6]);
  for (let index = 0; index < fighters.length; index++) {
    const fighter = fighters[index]!;
    const x = index === 0 ? -1.6 : 1.6;
    fighter.meshId = 'tod:fighter'; fighter.materialId = index === 0 ? 'tod:cyan' : 'tod:coral';
    fighter.position = [x, 1, 0]; fighter.scale = [1, 1, 1]; fighter.rotationY = index === 0 ? Math.PI / 2 : -Math.PI / 2;
    fighter.physics = { type: 'dynamic', shape: 'sphere', gravityScale: 1.9, continuous: true };
    delete fighter.animation; delete fighter.skeleton;
    for (const [side, offset] of [['left', -.45], ['right', .45]] as const) add(`${fighter.id}:${side}-hand`, 'sphere', 'skin', [x + offset, 1.25, .35], [.145, .145, .145]);
    add(`${fighter.id}:face`, 'box', 'skin', [x, 1.76, .2], [.32, .21, .08]);
    add(`${fighter.id}:belt`, 'box', 'ink', [x, .83, 0], [.59, .12, .44]);
    add(`${fighter.id}:guard-shell`, 'sphere', 'guard', [x, 1, 0], [0, 0, 0]);
    add(`${fighter.id}:impact`, 'sphere', 'impact', [x, 1.35, .6], [0, 0, 0]);
    add(`${fighter.id}:armor`, 'sphere', 'gold', [x, 2.5, 0], [.14, .14, .14]);
    add(`${fighter.id}:guard-meter`, 'box', 'guard', [x, 2.35, 0], [1, .06, .06]);
  }
  scene.clearColor = [.07, .085, .14, 1];
  scene.camera = { position: [0, 7.5, 12.5], target: [0, 1.0, -.4], up: [0, 1, 0], fovYRadians: .85, near: .1, far: 100 };
  scene.lights = [
    { id: 'tod:ambient', kind: 'ambient', color: [.6, .7, .9], intensity: .85 },
    { id: 'tod:key', kind: 'directional', color: [1, .84, .65], intensity: 1.8, direction: [-.5, -1, -.4] },
    { id: 'tod:rim', kind: 'directional', color: [.25, .7, 1], intensity: .7, direction: [.7, -.3, .6] },
  ];
  declaration.budgets = { ...declaration.budgets,
    meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length),
    materials: Math.max(declaration.budgets.materials, declaration.materials.length),
    vertices: Math.max(declaration.budgets.vertices, 30_000),
    indices: Math.max(declaration.budgets.indices, 120_000),
    entities: Math.max(declaration.budgets.entities, scene.entities.length),
  };
  encloseTouchOfDeathArena(declaration);
  articulateTouchOfDeathFighters({ declaration, fighterIds: options.fighterIds });
}
