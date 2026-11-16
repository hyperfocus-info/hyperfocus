import { compileArtDirection } from '@hyperfocus/artifact-review/direction';
import type { AppearanceCatalog3D, AppearanceRarity3D } from '@hyperfocus/engine/project/runtime-3d';

/** Consumer-owned recipes. Rarity describes expression, never combat power or quality approval. */
export const particleRecipes = [
  { id: 'classic', label: 'Street dust', rarity: 'common', count: 3, lifetime: 16, reach: .32, height: .10, width: .045, length: .07, color: [.40, .39, .35], treatment: 'Low matte grit spreading from a planted foot; rapid settle', cost: 'Subtle on similarly valued floors' },
  { id: 'ribbons', label: 'Slipstream', rarity: 'uncommon', count: 3, lifetime: 14, reach: .42, height: .16, width: .018, length: .19, color: [.57, .67, .69], treatment: 'Three tapered strokes aligned with travel, low and behind the foot', cost: 'Requires motion to read; no idle ornament' },
  { id: 'embers', label: 'Forge flecks', rarity: 'rare', count: 4, lifetime: 20, reach: .38, height: .27, width: .023, length: .095, color: [.89, .52, .20], treatment: 'Sparse warm pin sparks with short rising arcs and shrinking tails', cost: 'Warm accent stays below the knees, away from impact cues' },
  { id: 'relay', label: 'Telemetry pulse', rarity: 'legendary', count: 2, lifetime: 18, reach: .01, height: 0, width: .009, length: .03, color: [.22, .365, .447], treatment: 'Arena-issued chest and back sensors pulse their inset status lamps on movement events', cost: 'Visible mounting and equipment only; no detached energy, aura or combat advantage' },
] as const;
export type ParticleStyle = typeof particleRecipes[number]['id'];
export const cosmeticLimits = { particlesPerFighter: 12, eventsPerFighter: 3, maximumLifetime: 24, maximumReach: .65, maximumHeight: .35, maximumWidth: .06, tiers: ['common', 'uncommon', 'rare', 'legendary'] } as const;

export function cosmeticDirectionPlan() {
  return compileArtDirection({ id: 'touch-of-death-cosmetics-v1', owner: 'packages/engine/examples/touch-of-death/docs/touch-of-death-cosmetics.md',
    requiredEvidence: ['neutral-clip', 'gameplay-clip', 'contact-clip', 'phase-strip', 'reduced-motion'],
    recipes: particleRecipes.map(recipe => ({ id: recipe.id, family: 'movement-particles', intent: recipe.rarity, motion: recipe.treatment, strength: `${recipe.label}: recognisable shape and timing`, weakness: recipe.cost })),
  }, particleRecipes.map(recipe => ({ id: `particles:${recipe.id}`, family: 'movement-particles', intent: recipe.rarity })));
}

export function validateCosmeticRecipes(recipes: readonly { id: string; rarity: string; count: number; lifetime: number; reach: number; height: number; width: number; length: number; color: readonly number[] }[] = particleRecipes) {
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length || !cosmeticLimits.tiers.every(tier => recipes.some(recipe => recipe.rarity === tier))) throw new Error('Cosmetics require unique identities and all four tiers.');
  for (const recipe of recipes) {
    if (![recipe.count, recipe.lifetime, recipe.reach, recipe.height, recipe.width, recipe.length, ...recipe.color].every(Number.isFinite)
      || !Number.isInteger(recipe.count) || recipe.count < 1 || recipe.count * cosmeticLimits.eventsPerFighter > cosmeticLimits.particlesPerFighter
      || recipe.lifetime < 1 || recipe.lifetime > cosmeticLimits.maximumLifetime || recipe.reach <= 0 || recipe.reach > cosmeticLimits.maximumReach
      || recipe.height < 0 || recipe.height > cosmeticLimits.maximumHeight || recipe.width <= 0 || recipe.width > cosmeticLimits.maximumWidth
      || recipe.length <= 0 || recipe.length > .25 || recipe.color.length !== 3 || recipe.color.some(value => value < 0 || value > 1)) throw new Error(`Cosmetic recipe exceeds its visual budget: ${recipe.id}`);
  }
  return cosmeticDirectionPlan();
}

/** Preserve saved IDs and identity choices. The rewards owner defines access; human features have no rarity. */
export function directCosmeticCatalog(catalog: AppearanceCatalog3D) {
  for (const slot of catalog.slots) {
    if (['skin-color', 'hair-color', 'face', 'hair'].includes(slot.id)) continue;
    for (const option of slot.options) option.rarity ??= 'common';
    if (slot.id === 'particles') slot.options = particleRecipes.map(recipe => ({ id: recipe.id, label: recipe.label, rarity: recipe.rarity, styles: [{ channel: 'particles', style: recipe.id }] }));
    if (slot.id === 'recovery-style') slot.options.forEach((option, index) => { option.rarity = cosmeticLimits.tiers[index] ?? 'common'; });
    if (slot.id === 'top') {
      const ranks: Record<string, AppearanceRarity3D> = { gi: 'common', jacket: 'uncommon', vest: 'uncommon', signature: 'rare', relay: 'legendary' };
      for (const option of slot.options) option.rarity = ranks[option.id] ?? 'common';
    }
  }
}
