import { requireText } from "@hyperfocus/utilities/text";
import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import { validateAppearanceTextures3D } from './texture-targets.ts';

export type AppearanceColor3D = [number, number, number, 1];
export type AppearancePose3D = { phase: 'intro' | 'victory'; style: 'default' | 'bow' | 'salute' | 'fists-up' };
export type ResolvedAppearancePose3D = AppearancePose3D & { actorId: string };
export const appearanceStyleChoices = { movement: ['classic', 'loose', 'compact'], hit: ['classic', 'snap', 'reel'], particles: ['classic', 'ribbons', 'embers', 'relay'], card: ['classic', 'sunrise', 'night'], recovery: ['stand-up', 'roll-up', 'kip-up', 'materialize'] } as const;
export const appearanceRarities = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type AppearanceRarity3D = typeof appearanceRarities[number];
export type AppearanceStyle3D = { channel: keyof typeof appearanceStyleChoices; style: string };
export type AppearanceOption3D = { id: string; label: string; rarity?: AppearanceRarity3D; variants?: Array<{ entitySuffix: string; variantId: string }>; colors?: Array<{ materialSuffix: string; baseColor: AppearanceColor3D }>; poses?: AppearancePose3D[]; styles?: AppearanceStyle3D[] };
export type AppearanceTextureSlot3D = { id: string; label: string; materialSuffix: string; textureSuffix: string };
export type AppearanceCatalog3D = { version: 1; actors: Array<{ entityId: string }>; slots: Array<{ id: string; label: string; defaultOptionId: string; options: AppearanceOption3D[] }>; textureSlots?: AppearanceTextureSlot3D[] };
export type ResolvedAppearance3D = { variants: Array<{ entityId: string; variantId: string }>; colors: Array<{ materialId: string; baseColor: AppearanceColor3D }>; poses?: ResolvedAppearancePose3D[]; styles?: Array<AppearanceStyle3D & { actorId: string }> };

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Invalid appearance object.');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Invalid appearance data field.');
    result[key] = descriptor.value;
  }
  return result;
}
function text(value: unknown, maximum = 128, empty = false): string { return requireText(value, { max: maximum, nonBlank: !empty, message: "Invalid appearance text." }); }
function list(value: unknown, maximum: number, minimum = 1): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Invalid appearance list bound.');
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Invalid appearance list data.');
    result.push(descriptor.value);
  }
  return result;
}
function identity(value: unknown) { const id = text(value);if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Reserved appearance identity.');return id; }
function unique(values: readonly string[]) { if (new Set(values).size !== values.length) throw new Error('Duplicate appearance target or identity.'); }
function suffix(value: unknown, root = false) { const result = text(value, 128, root);if (result !== '' && !result.startsWith(':')) throw new Error('Appearance suffix must start with a colon.');return result; }
function option(value: unknown): AppearanceOption3D {
  const item = object(value, ['id', 'label', 'rarity', 'variants', 'colors', 'poses', 'styles']);
  const rarity = appearanceRarities.find(rarity => rarity === item.rarity);
  if (item.rarity !== undefined && rarity === undefined) throw new Error('Invalid appearance rarity.');
  const styles = item.styles === undefined ? [] : list(item.styles, 5, 0).map((value): AppearanceStyle3D => {
    const patch = object(value, ['channel', 'style']);
    const channel = patch.channel;
    if (channel !== 'movement' && channel !== 'hit' && channel !== 'particles' && channel !== 'card' && channel !== 'recovery') throw new Error('Invalid appearance style channel.');
    if (typeof patch.style !== 'string' || !appearanceStyleChoices[channel].some(style => style === patch.style)) throw new Error('Invalid appearance style.');
    return { channel, style: patch.style };
  });
  const poses = item.poses === undefined ? [] : list(item.poses, 2, 0).map((value): AppearancePose3D => {
    const patch = object(value, ['phase', 'style']);
    const style = (['default', 'bow', 'salute', 'fists-up'] as const).find(style => style === patch.style);
    if (patch.phase !== 'intro' && patch.phase !== 'victory' || style === undefined) throw new Error('Invalid appearance pose phase or style.');
    return { phase: patch.phase, style };
  });
  const variants = item.variants === undefined ? [] : list(item.variants, 32, 0).map(value => {
    const patch = object(value, ['entitySuffix', 'variantId']);return { entitySuffix: suffix(patch.entitySuffix, true), variantId: text(patch.variantId) };
  });
  const colors = item.colors === undefined ? [] : list(item.colors, 32, 0).map(value => {
    const patch = object(value, ['materialSuffix', 'baseColor']), color = list(patch.baseColor, 4, 4);
    if (!color.every((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) || color[3] !== 1) throw new Error('Appearance colors must be opaque normalized RGBA.');
    const baseColor: AppearanceColor3D = [color[0]!, color[1]!, color[2]!, color[3]];
    return { materialSuffix: suffix(patch.materialSuffix), baseColor };
  });
  if (variants.length + colors.length + poses.length + styles.length === 0 || variants.length + colors.length + poses.length + styles.length > 32) throw new Error('Appearance option needs one to 32 patches.');
  unique(styles.map(patch => patch.channel));
  unique(poses.map(patch => patch.phase));
  unique(variants.map(patch => patch.entitySuffix));unique(colors.map(patch => patch.materialSuffix));
  return { id: identity(item.id), label: text(item.label, 64), ...(item.rarity ? { rarity } : {}), ...(variants.length ? { variants } : {}), ...(colors.length ? { colors } : {}), ...(poses.length ? { poses } : {}), ...(styles.length ? { styles } : {}) };
}

/** Strict portable authoring boundary. References are checked against the active scene when supplied. */
export function readAppearanceCatalog3D(value: unknown, declaration?: Hyperfocus3DDeclaration): AppearanceCatalog3D | undefined {
  if (value === undefined) return undefined;
  const input = object(value, ['version', 'actors', 'slots', 'textureSlots']);
  if (input.version !== 1) throw new Error('Unsupported appearance catalog version.');
  const actors = list(input.actors, 4).map(value => ({ entityId: text(object(value, ['entityId']).entityId) }));unique(actors.map(actor => actor.entityId));
  if (actors.some(a => actors.some(b => a !== b && a.entityId.startsWith(`${b.entityId}:`)))) throw new Error('Appearance actor prefixes overlap.');
  const occupied = new Set<string>();
  const slots = list(input.slots, 24).map(value => {
    const slot = object(value, ['id', 'label', 'defaultOptionId', 'options']), options = list(slot.options, 32).map(option);
    unique(options.map(option => option.id));const defaultOptionId = text(slot.defaultOptionId);
    if (!options.some(option => option.id === defaultOptionId)) throw new Error('Appearance default option is missing.');
    const targets = (option: AppearanceOption3D) => [...(option.variants ?? []).map(p => `variant${p.entitySuffix}`), ...(option.colors ?? []).map(p => `color${p.materialSuffix}`), ...(option.poses ?? []).map(p => `pose:${p.phase}`), ...(option.styles ?? []).map(p => `style:${p.channel}`)].sort();
    const expected = targets(options[0]!);
    if (options.some(option => JSON.stringify(targets(option)) !== JSON.stringify(expected))) throw new Error('Appearance options must replace the same slot targets.');
    for (const target of expected) { if (occupied.has(target)) throw new Error('Appearance slots have conflicting targets.');occupied.add(target); }
    return { id: identity(slot.id), label: text(slot.label, 64), defaultOptionId, options };
  });
  const textureSlots = input.textureSlots === undefined ? undefined : list(input.textureSlots, 4, 0).map(value => {
    const slot = object(value, ['id', 'label', 'materialSuffix', 'textureSuffix']);
    return { id: identity(slot.id), label: text(slot.label, 64), materialSuffix: suffix(slot.materialSuffix), textureSuffix: suffix(slot.textureSuffix) };
  });
  unique([...slots, ...(textureSlots ?? [])].map(slot => slot.id));
  unique((textureSlots ?? []).map(slot => slot.materialSuffix));unique((textureSlots ?? []).map(slot => slot.textureSuffix));
  const catalog: AppearanceCatalog3D = { version: 1, actors, slots, ...(textureSlots === undefined ? {} : { textureSlots }) };
  if (declaration) validateReferences(catalog, declaration);
  if (declaration) validateAppearanceTextures3D(catalog, declaration);
  return catalog;
}

function validateReferences(catalog: AppearanceCatalog3D, declaration: Hyperfocus3DDeclaration) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw new Error('Appearance needs an active scene.');
  for (const actor of catalog.actors) {
    if (!scene.entities.some(entity => entity.id === actor.entityId)) throw new Error('Appearance actor is missing.');
    const belongs = (id: string) => id === actor.entityId || id.startsWith(`${actor.entityId}:`);
    for (const slot of catalog.slots) for (const option of slot.options) {
      for (const patch of option.variants ?? []) {
        const entity = scene.entities.find(entity => entity.id === actor.entityId + patch.entitySuffix);
        const variant = entity?.variants?.find(variant => variant.id === patch.variantId);
        if (!variant) throw new Error('Appearance entity or authored variant is missing.');
        const material = declaration.materials.find(material => material.id === variant.materialId);
        if (!material || material.baseColor[3] !== 1 || material.alphaMode && material.alphaMode !== 'opaque') throw new Error('Appearance variant requires an opaque material.');
      }
      for (const patch of option.colors ?? []) {
        const id = actor.entityId + patch.materialSuffix, material = declaration.materials.find(material => material.id === id);
        if (!material || material.baseColor[3] !== 1 || material.alphaMode && material.alphaMode !== 'opaque') throw new Error('Appearance requires an opaque actor material.');
        if (scene.entities.some(entity => !belongs(entity.id) && (entity.materialId === id || entity.variants?.some(variant => variant.materialId === id)))) throw new Error('Appearance material is shared outside its actor.');
      }
    }
  }
}

/** Resolve once when selection changes; unknown actors, slots and options are rejected. */
export function resolveAppearance3D(options: { catalog: AppearanceCatalog3D; actorId: string; selections?: Readonly<Record<string, string>> }): ResolvedAppearance3D {
  const { catalog, actorId } = options, selections = object(options.selections === undefined ? {} : options.selections, catalog.slots.map(slot => slot.id));
  if (!catalog.actors.some(actor => actor.entityId === actorId)) throw new Error('Unknown appearance actor.');
  const resolved: ResolvedAppearance3D = { variants: [], colors: [] };
  for (const slot of catalog.slots) {
    const id = Object.hasOwn(selections, slot.id) ? selections[slot.id] : slot.defaultOptionId;
    const option = slot.options.find(option => option.id === id);
    if (!option) throw new Error('Unknown appearance option.');
    for (const patch of option.variants ?? []) resolved.variants.push({ entityId: actorId + patch.entitySuffix, variantId: patch.variantId });
    for (const patch of option.colors ?? []) resolved.colors.push({ materialId: actorId + patch.materialSuffix, baseColor: [...patch.baseColor] });
    for (const patch of option.poses ?? []) (resolved.poses ??= []).push({ actorId, phase: patch.phase, style: patch.style });
    for (const patch of option.styles ?? []) (resolved.styles ??= []).push({ actorId, ...patch });
  }
  return resolved;
}
