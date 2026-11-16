import { readAppearanceCatalog3D, type Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { readDirectedFighters } from '../art-direction/integration/contract.ts';
import { directCosmeticCatalog, particleRecipes } from './direction.ts';
import { migrateCosmeticPalette } from './palette.ts';
import { authorCombatFeedback } from '../feedback/author.ts';

/** Idempotent native-rig binding, used by fresh setup, wardrobe setup and the existing rig upgrade. */
export function installDirectedCosmetics(project: { extensions?: Record<string, unknown> }, declaration: Hyperfocus3DDeclaration) {
  const definition = readDirectedFighters(project, declaration);
  if (!definition) return;
  const supportsCosmetics = declaration.meshes.some(mesh => mesh.id === 'tod:directed:cosmetic-stroke');
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  if (supportsCosmetics) for (const fighter of definition.fighters) {
    const root = scene.entities.find(entity => entity.id === fighter.entityId)!, torso = scene.entities.find(entity => entity.id === `${fighter.rigId}:torso`)!;
    const part = (name: string) => scene.entities.find(entity => entity.id === `${fighter.rigId}:${name}`)!;
    const options = ['gi', 'jacket', 'vest', 'signature', 'relay'];
    torso.variants = options.map(id => ({ id, meshId: id === 'gi' ? torso.meshId : `tod:directed:cosmetic-top-${id}`, materialId: torso.materialId }));
    if (root.variants) for (const id of ['signature', 'relay']) {
      if (!root.variants.some(variant => variant.id === id)) root.variants.push({ id, meshId: root.meshId, materialId: root.materialId });
      for (const side of ['left', 'right']) { const arm = scene.entities.find(entity => entity.id === `${fighter.entityId}:${side}-arm`)!;arm.variants ??= [];if (!arm.variants.some(variant => variant.id === id)) arm.variants.push({ id, meshId: arm.meshId, materialId: arm.materialId }); }
    }
    for (const side of ['left', 'right']) {
      const sleeve = part(`${side}-sleeve`), original = sleeve.meshId.replace('-service-sleeve', '-tapered-sleeve');
      sleeve.variants = options.map(id => ({ id, meshId: id === 'gi' ? sleeve.meshId : original, materialId: id === 'vest' ? part(`${side}-forearm`).materialId : sleeve.materialId }));
    }
    const panelId = `${fighter.rigId}:cosmetic-panel`;
    const panel: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = { id: panelId, meshId: 'tod:directed:cosmetic-panel-gi', materialId: 'tod:directed:cosmetic-panel', position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0,
      variants: options.map(id => ({ id, meshId: `tod:directed:cosmetic-panel-${id}`, materialId: id === 'relay' ? 'tod:directed:cosmetic-reflector' : 'tod:directed:cosmetic-panel' })) };
    const old = scene.entities.findIndex(entity => entity.id === panelId);if (old < 0) scene.entities.push(panel);else scene.entities[old] = panel;
    if (!fighter.rest.some(part => part.id === panelId)) fighter.rest.push({ id: panelId, position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0 });
    for (let i = 0; i < 12; i++) {
      const dust = scene.entities.find(entity => entity.id === `${fighter.entityId}:dust:${i}`);if (!dust) continue;
      dust.meshId = 'tod:directed:cosmetic-grit';dust.materialId = 'tod:directed:cosmetic-classic';
      dust.variants = particleRecipes.map(recipe => ({ id: recipe.id, meshId: `tod:directed:cosmetic-${recipe.id === 'classic' ? 'grit' : 'stroke'}`, materialId: `tod:directed:cosmetic-${recipe.id}` }));
    }
  }
  const catalog = readAppearanceCatalog3D(project.extensions?.hyperfocusAppearance);
  if (catalog && supportsCosmetics) {
    const top = catalog.slots.find(slot => slot.id === 'top');
    if (top) {
      const base = top.options.find(option => option.id === 'gi');if (base) base.label = 'Work jacket';
      const jacket = top.options.find(option => option.id === 'jacket');if (jacket) jacket.label = 'Reinforced jacket';
      for (const [id, label] of [['signature', 'Courier cut'], ['relay', 'Telemetry coat']]) {
        const existing = top.options.find(option => option.id === id);
        if (existing) existing.label = label!;
        else if (base) top.options.push({ ...structuredClone(base), id: id!, label: label!, variants: base.variants?.map(patch => ({ ...patch, variantId: id! })) });
      }
    }
    migrateCosmeticPalette(catalog);directCosmeticCatalog(catalog);project.extensions!.hyperfocusAppearance = readAppearanceCatalog3D(catalog, declaration);
  }
  // Refresh after wardrobe/cosmetic bindings, including their dynamic hit looks.
  definition.materialIds = authorCombatFeedback(declaration, definition.fighters);
  project.extensions!.hyperfocusTouchOfDeathArt = definition;
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length) };
}
