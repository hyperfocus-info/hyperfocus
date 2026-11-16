import { readAppearanceCatalog3D, type AppearanceCatalog3D, type Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import type { EditorProject } from '@hyperfocus/engine/project';
import { directCosmeticCatalog } from './cosmetics/direction.ts';
import { clothPalette, clothColorForRole } from './cosmetics/palette.ts';
export { cookTouchOfDeathWardrobeModels } from './wardrobe-models.ts';

type Color = [number, number, number, 1];
const cloth = clothPalette;
const skin: Array<[string, string, Color]> = [
  ['umber', 'Umber', [.27, .14, .09, 1]], ['bronze', 'Bronze', [.46, .26, .15, 1]],
  ['copper', 'Copper', [.65, .38, .23, 1]], ['sand', 'Sand', [.79, .53, .34, 1]],
  ['peach', 'Peach', [.94, .68, .48, 1]], ['porcelain', 'Porcelain', [.98, .8, .67, 1]],
];

/** Curated presentation choices reused by new wardrobes and existing-project upgrades. */
export function createTouchOfDeathPoseSlots(): AppearanceCatalog3D['slots'] {
  return (['intro', 'victory'] as const).map(phase => ({
    id: `${phase}-pose`, label: phase === 'intro' ? 'Entrance' : 'Victory',
    defaultOptionId: phase === 'intro' ? 'salute' : 'fists-up',
    options: ([['bow', 'Respect bow'], ['salute', 'Salute'], ['fists-up', 'Fists up']] as const).map(([style, label]) => ({ id: style, label, poses: [{ phase, style }] })),
  }));
}

export function createTouchOfDeathStyleSlots(): AppearanceCatalog3D['slots'] {
  return ([
    { id: 'movement-style', label: 'Movement', channel: 'movement', choices: [['classic', 'Dojo'], ['loose', 'Loose elbows'], ['compact', 'Compact form']] },
    { id: 'hit-style', label: 'Hit reaction', channel: 'hit', choices: [['classic', 'Dojo'], ['snap', 'Chin tuck'], ['reel', 'Head roll']] },
    { id: 'particles', label: 'Movement particles', channel: 'particles', choices: [['classic', 'Dust'], ['ribbons', 'Ribbons'], ['embers', 'Embers']] },
    { id: 'card', label: 'Player card', channel: 'card', choices: [['classic', 'Dojo ink'], ['sunrise', 'Sunrise'], ['night', 'Night sky']] },
  ] as const).map(({ id, label, channel, choices }) => ({ id, label, defaultOptionId: 'classic', options: choices.map(([style, label]) => ({ id: style, label, styles: [{ channel, style }] })) }));
}

/** Uses the ordinary wardrobe selections and existing cosmetic reward catalog. */
export function createTouchOfDeathRecoverySlot(): AppearanceCatalog3D['slots'][number] {
  return { id: 'recovery-style', label: 'Get up', defaultOptionId: 'stand-up',
    options: ([['stand-up', 'Stand up'], ['roll-up', 'Roll to feet'], ['kip-up', 'Kip up'], ['materialize', 'Materialize']] as const)
      .map(([style, label]) => ({ id: style, label, styles: [{ channel: 'recovery', style }] })),
  };
}

/** Adds the curated wardrobe. Starter access and earned ownership are defined by the rewards owner. */
export function applyTouchOfDeathWardrobe(options: {
  project: EditorProject; declaration: Hyperfocus3DDeclaration; fighterIds: readonly string[]; assets: Readonly<Record<string, string>>;
}) {
  const { project, declaration, fighterIds, assets } = options;
  if (project.extensions?.hyperfocusAppearance) throw new Error('A wardrobe catalog is already configured.');
  const scene = declaration.scenes.find(item => item.id === declaration.activeSceneId);
  if (!scene || fighterIds.length !== 2 || new Set(fighterIds).size !== 2) throw new Error('The demo wardrobe needs two articulated fighters.');
  const printAsset = assets['top-print'];
  if (!printAsset || !project.assets.some(asset => asset.id === printAsset && asset.mimeType === 'application/octet-stream' && asset.size === 65536)) throw new Error('The demo wardrobe needs its bounded print placeholder.');
  const required = ['jacket', 'vest', 'wide-leg', 'trainers', 'crest', 'bun', 'eyes', 'brows'];
  for (const id of required) {
    const assetId = assets[id];
    if (!assetId || !project.assets.some(asset => asset.id === assetId)) throw new Error(`Missing wardrobe model ${id}.`);
    declaration.meshes.push({ id: `tod:wardrobe:${id}`, assetId, primitive: 0, buffers: [] });
  }
  const materialSlots: Record<string, string[]> = {
    top: ['', ':left-arm', ':right-arm'], bottom: [':left-thigh', ':right-thigh', ':left-shin', ':right-shin'],
    skin: [':head', ':left-forearm', ':right-forearm', ':left-hand', ':right-hand'],
    hair: [':hair'], shoes: [':left-boot', ':right-boot'], belt: [':belt'],
  };
  for (const actor of fighterIds) {
    declaration.textures.push({ id: `${actor}:appearance:top-print`, assetId: printAsset, width: 128, height: 128, filter: 'linear', wrap: 'clamp', flipY: false });
    const part = (suffix: string) => {
      const entity = scene.entities.find(item => item.id === actor + suffix);
      if (!entity) throw new Error(`Wardrobe needs articulated part ${actor + suffix}.`);
      return entity;
    };
    for (const [slot, suffixes] of Object.entries(materialSlots)) {
      const source = declaration.materials.find(item => item.id === part(suffixes[0]!).materialId);
      if (!source) throw new Error(`Missing ${slot} material for ${actor}.`);
      const id = `${actor}:appearance:${slot}`;
      declaration.materials.push({ ...structuredClone(source), id, alphaMode: 'opaque', baseColor: [source.baseColor[0], source.baseColor[1], source.baseColor[2], 1] });
      for (const suffix of suffixes) part(suffix).materialId = id;
    }
    const variants = (suffix: string, entries: Array<[string, string, string?]>) => {
      const entity = part(suffix);
      const existing = entity.variants ?? [];
      for (const [id, meshId, materialId] of entries) {
        if (existing.some(item => item.id === id)) throw new Error(`Wardrobe variant ${id} already exists on ${entity.id}.`);
        existing.push({ id, meshId, materialId: materialId ?? entity.materialId });
      }
      entity.variants = existing;
    };
    variants('', [['gi', part('').meshId], ['jacket', 'tod:wardrobe:jacket'], ['vest', 'tod:wardrobe:vest']]);
    for (const suffix of [':left-arm', ':right-arm']) variants(suffix, [['gi', part(suffix).meshId], ['jacket', part(suffix).meshId], ['vest', part(suffix).meshId, `${actor}:appearance:skin`]]);
    for (const suffix of materialSlots.bottom!) variants(suffix, [['straight', part(suffix).meshId], ['wide', 'tod:wardrobe:wide-leg']]);
    for (const suffix of materialSlots.shoes!) variants(suffix, [['boots', part(suffix).meshId], ['trainers', 'tod:wardrobe:trainers']]);
    variants(':hair', [['crop', part(':hair').meshId], ['crest', 'tod:wardrobe:crest'], ['bun', 'tod:wardrobe:bun']]);
    variants(':face', [['eyes', 'tod:wardrobe:eyes'], ['brows', 'tod:wardrobe:brows']]);
  }
  const shapes = (id: string, label: string, targets: readonly string[], choices: Array<[string, string]>) => ({
    id, label, defaultOptionId: choices[0]![0], options: choices.map(([optionId, optionLabel]) => ({ id: optionId, label: optionLabel, variants: targets.map(entitySuffix => ({ entitySuffix, variantId: optionId })) })),
  });
  const palette = (id: string, label: string, choices: typeof cloth, defaultOptionId: string) => ({
    id: `${id}-color`, label, defaultOptionId, options: choices.map(([optionId, optionLabel, baseColor]) => ({ id: optionId, label: optionLabel, colors: [{ materialSuffix: `:appearance:${id}`, baseColor: clothColorForRole(baseColor, id) }] })),
  });
  const catalog: AppearanceCatalog3D = { version: 1, actors: fighterIds.map(entityId => ({ entityId })), slots: [
    shapes('top', 'Top', materialSlots.top!, [['gi', 'Dojo gi'], ['jacket', 'Track jacket'], ['vest', 'Training vest']]),
    shapes('bottom', 'Trousers', materialSlots.bottom!, [['straight', 'Straight fit'], ['wide', 'Wide fit']]),
    shapes('shoes', 'Footwear', materialSlots.shoes!, [['boots', 'Combat boots'], ['trainers', 'Court trainers']]),
    shapes('hair', 'Hair', [':hair'], [['crop', 'Crop'], ['crest', 'Crest'], ['bun', 'High bun']]),
    shapes('face', 'Face', [':face'], [['eyes', 'Calm'], ['brows', 'Focused']]),
    palette('top', 'Top color', cloth, 'teal'), palette('bottom', 'Trouser color', cloth, 'navy'),
    palette('shoes', 'Footwear color', cloth, 'navy'), palette('belt', 'Belt color', cloth, 'gold'),
    palette('skin', 'Skin tone', skin, 'peach'),
    palette('hair', 'Hair color', [['ink', 'Ink', [.045, .035, .055, 1]], ['brown', 'Chestnut', [.25, .1, .045, 1]], ['gold', 'Honey', [.74, .47, .13, 1]], ['silver', 'Silver', [.7, .75, .8, 1]], ['violet', 'Violet', [.4, .15, .55, 1]]], 'ink'),
    ...createTouchOfDeathPoseSlots(),
    ...createTouchOfDeathStyleSlots(),
    createTouchOfDeathRecoverySlot(),
  ], textureSlots: [{ id: 'top-print', label: 'Top print', materialSuffix: ':appearance:top', textureSuffix: ':appearance:top-print' }] };
  declaration.budgets = { ...declaration.budgets, meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length), materials: Math.max(declaration.budgets.materials, declaration.materials.length), vertices: Math.max(declaration.budgets.vertices, 90_000), indices: Math.max(declaration.budgets.indices, 360_000) };
  declaration.budgets = { ...declaration.budgets, textures: Math.max(declaration.budgets.textures, declaration.textures.length),
    textureBytes: Math.max(declaration.budgets.textureBytes, declaration.textures.reduce((total, texture) => total + texture.width * texture.height * 4, 0)) };
  project.extensions ??= {};
  directCosmeticCatalog(catalog);
  project.extensions.hyperfocusAppearance = readAppearanceCatalog3D(catalog, declaration);
}
