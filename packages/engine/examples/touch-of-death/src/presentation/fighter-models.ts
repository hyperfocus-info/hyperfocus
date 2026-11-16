import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cookPrimitiveModel, type PrimitivePart } from '@hyperfocus/engine/assets/model-cooking';
import { cookFighterProfile } from './fighter-profile.ts';
import { cookTouchOfDeathWardrobeModels } from './wardrobe-models.ts';

/** Mesh-local detail fits the existing combat attachment frames, including every wardrobe pose. */
export function cookTouchOfDeathFighterDetailModels() {
  const parts: Record<string, readonly PrimitivePart[]> = {
    head: [
      ['sphere', 0, .05, -.04, .7, .73, .85, 0, 0, 0],
      ['sphere', 0, -.34, .15, .54, .39, .64, 0, 0, 0],
      ['sphere', 0, -.12, .84, .12, .22, .2, -.14, 0, 0],
      ['sphere', -.7, -.07, -.03, .11, .24, .18, 0, 0, -.1],
      ['sphere', .7, -.07, -.03, .11, .24, .18, 0, 0, .1],
      ['capsule', 0, -1.03, -.02, .74, .36, .7, 0, 0, 0],
    ],
    hair: [
      ['sphere', 0, -.62, -.08, .66, .92, .81, -.08, 0, 0],
      ['sphere', -.21, -.2, .3, .52, .72, .63, 0, 0, -.28],
      ['sphere', .34, -.4, .28, .3, .62, .57, 0, 0, -.35],
      ['sphere', -.57, -1.04, -.12, .1, 1, .58, -.12, 0, 0],
      ['sphere', .57, -1.04, -.12, .1, 1, .58, -.12, 0, 0],
      ['sphere', 0, -1.19, -.65, .55, .9, .19, -.12, 0, 0],
    ],
    hand: [
      ['sphere', 0, 0, 0, .72, .68, .71, 0, 0, 0],
      ['capsule', 0, .16, .47, .43, .54, .4, 0, 0, 1.57],
      ['sphere', -.57, -.13, .05, .29, .44, .32, 0, 0, -.35],
    ],
    sleeve: [
      ['sphere', 0, -.08, 0, .91, .9, .91, 0, 0, 0],
      ['sphere', 0, .55, 0, .95, .39, .95, 0, 0, 0],
      ['sphere', 0, -.7, 0, .76, .25, .78, 0, 0, 0],
    ],
    forearm: [
      ['sphere', 0, -.06, 0, .7, .98, .74, 0, 0, 0],
      ['sphere', 0, .4, 0, .83, .56, .84, 0, 0, 0],
    ],
    trouser: [
      ['sphere', 0, .15, 0, .92, .88, .94, 0, 0, 0],
      ['sphere', 0, -.53, .03, .76, .44, .81, 0, 0, 0],
      ['capsule', -.37, -.12, .66, .12, .65, .1, 0, 0, .08],
      ['capsule', .34, -.1, .67, .1, .7, .1, 0, 0, -.09],
    ],
    boot: [
      ['sphere', 0, -.54, .06, .82, .43, .94, 0, 0, 0],
      ['sphere', 0, -.84, .05, .84, .16, .96, 0, 0, 0],
      ['capsule', 0, -.08, -.29, 1.25, .8, .96, 0, 0, 0],
      ['capsule', 0, .04, .18, .62, .36, .18, -.25, 0, 0],
    ],
    belt: [
      ['sphere', 0, 0, 0, .96, .72, .92, 0, 0, 0],
      ['sphere', .16, 0, 1.04, .23, 1.05, .19, 0, 0, 0],
      ['capsule', .26, -1.8, 1.06, .26, 1.65, .22, 0, 0, .16],
      ['capsule', -.01, -1.2, 1.03, .24, 1.22, .2, 0, 0, -.12],
    ],
  };
  // Tighten the cranial cap and fists without changing their pose attachment frames.
  parts.hair = parts.hair!.map(([shape, x, y, z, sx, sy, sz, rx, ry, rz]) => [shape, x * .78, y - .28, z * .8, sx * .78, sy, sz * .8, rx, ry, rz]);
  parts.hand = parts.hand!.map(([shape, x, y, z, sx, sy, sz, rx, ry, rz]) => [shape, x * .85, y * .85, z * .85, sx * .85, sy * .85, sz * .85, rx, ry, rz]);
  const models = Object.fromEntries(Object.entries(parts).map(([id, model]) => [id, {
    name: `touch-of-death-detailed-${id}.glb`, bytes: cookPrimitiveModel({ label: `Touch of Death tailored ${id}`, parts: model }),
  }]));
  models.head!.bytes = cookFighterProfile('Angular adult head and neck', [
    [-1.35, .01, .01, -.03], [-1.2, .32, .32, -.03], [-.63, .32, .34, .01],
    [-.5, .37, .42, .1], [-.38, .45, .52, .085, .04], [-.3, .5, .56, .075, .045],
    [-.23, .515, .575, .06, .065], [-.18, .53, .59, .04, .11], [-.12, .54, .61, .02, .2],
    [-.035, .555, .625, -.005, .14], [.06, .56, .645, -.025, .08], [.16, .557, .66, -.035, .02],
    [.33, .54, .64, -.07], [.54, .39, .49, -.08], [.64, .01, .01, -.08],
  ], 'face');
  models.hair!.bytes = cookFighterProfile('Sculpted swept crop', [
    [-2.05, .015, .015, -.55], [-1.82, .37, .18, -.53], [-1.5, .47, .3, -.42],
    [-1.25, .51, .45, -.25], [-1.03, .535, .56, -.13], [-.8, .54, .62, -.1],
    [-.52, .515, .615, -.075], [-.25, .46, .55, -.1], [.025, .34, .43, -.12], [.19, .01, .01, -.18],
  ], 'hair');
  models.sleeve!.bytes = cookFighterProfile('Continuous tapered sleeve', [
    [-1, .01, .01, 0], [-.94, .62, .64, 0], [-.86, .68, .7, 0], [-.77, .66, .69, 0],
    [-.6, .73, .74, 0], [-.38, .79, .8, 0], [-.12, .78, .79, 0], [.15, .84, .84, 0],
    [.38, .88, .85, 0], [.65, .84, .82, 0], [.85, .63, .64, 0], [1, .01, .01, 0],
  ], 'cloth');
  models.forearm!.bytes = cookFighterProfile('Continuous forearm', [
    [-1, .01, .01, 0], [-.87, .5, .55, 0], [-.4, .63, .65, 0], [.4, .76, .74, 0], [.82, .63, .64, 0], [1, .01, .01, 0],
  ]);
  models.trouser!.bytes = cookFighterProfile('Tapered trouser panels', [
    [-1, .01, .01, 0], [-.94, .61, .65, .02], [-.84, .67, .69, .02], [-.68, .65, .71, .01],
    [-.48, .74, .78, .02], [-.26, .8, .82, .015], [-.1, .77, .81, .01],
    [.1, .85, .87, 0], [.26, .9, .9, 0], [.5, .88, .88, 0], [.73, .83, .85, 0], [1, .01, .01, 0],
  ], 'cloth');
  models.boot!.bytes = cookFighterProfile('Compact martial arts boot', [
    [-1, .01, .01, .03], [-.98, .6, .68, .04], [-.78, .62, .7, .04], [-.49, .56, .62, 0],
    [-.22, .43, .36, -.18], [.3, .4, .32, -.23], [.64, .34, .28, -.23], [.68, .01, .01, -.23],
  ]);
  // The base face must be finished too: menu/opponent presentation may use the
  // authored mesh before an appearance option is applied.
  models.face = { name: 'touch-of-death-face-features.glb', bytes: cookTouchOfDeathWardrobeModels().eyes!.bytes };
  return models;
}

/** Upgrade existing actors without changing their physical bodies, equipment or saved appearance choices. */
export function applyTouchOfDeathFighterDetailModels(options: {
  declaration: Hyperfocus3DDeclaration; fighterIds: readonly string[]; assets: Readonly<Record<string, string>>;
}) {
  const { declaration, fighterIds, assets } = options;
  const scene = declaration.scenes.find(item => item.id === declaration.activeSceneId);
  if (!scene) throw new Error('Fighter detail requires an active scene.');
  const mapping = { head: 'head', hair: 'hair', face: 'face', belt: 'belt', 'left-hand': 'hand', 'right-hand': 'hand',
    'left-arm': 'sleeve', 'right-arm': 'sleeve', 'left-forearm': 'forearm', 'right-forearm': 'forearm',
    'left-thigh': 'trouser', 'right-thigh': 'trouser', 'left-shin': 'trouser', 'right-shin': 'trouser',
    'left-boot': 'boot', 'right-boot': 'boot' };
  for (const kind of new Set(Object.values(mapping))) {
    if (!assets[kind]) throw new Error(`Missing detailed fighter asset ${kind}.`);
  }
  for (const id of fighterIds) for (const suffix of Object.keys(mapping)) {
    if (!scene.entities.some(entity => entity.id === `${id}:${suffix}`)) throw new Error(`Missing fighter attachment ${id}:${suffix}.`);
  }
  for (const kind of new Set(Object.values(mapping))) {
    const id = `tod:fighter-detail:${kind}`;
    const existing = declaration.meshes.find(mesh => mesh.id === id);
    if (existing) existing.assetId = assets[kind]!;
    else declaration.meshes.push({ id, assetId: assets[kind]!, primitive: 0, buffers: [] });
  }
  for (const id of fighterIds) for (const [suffix, kind] of Object.entries(mapping)) {
    const entity = scene.entities.find(item => item.id === `${id}:${suffix}`)!;
    const previous = entity.meshId;
    entity.meshId = `tod:fighter-detail:${kind}`;
    for (const variant of entity.variants ?? []) if (variant.meshId === previous) variant.meshId = entity.meshId;
  }
  // Subdued footwear highlights suit the smaller silhouette. The ground-facing
  // combat cue is separate; never recolor shared ink/effect materials here.
  for (const id of fighterIds) {
    const shoes = declaration.materials.find(material => material.id === `${id}:appearance:shoes`);
    if (shoes?.toon) { shoes.toon.rimStrength = .035;shoes.toon.rimColor = [.35, .4, .45]; }
  }
  declaration.budgets = { ...declaration.budgets, meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length),
    vertices: Math.max(declaration.budgets.vertices, 120_000), indices: Math.max(declaration.budgets.indices, 480_000) };
}
