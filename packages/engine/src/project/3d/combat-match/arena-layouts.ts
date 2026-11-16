import type { CombatProject3D } from '../combat-declaration.ts';
import type { Hyperfocus3DDeclaration } from '../declaration.ts';

type Placement = { entityId: string; position: [number, number, number] };
export type CombatArenaLayouts = Array<{ id: string; variants: Array<{ id: string; props: Placement[] }> }>;

/** Match index is saved state: selection needs no mutable random generator. */
export function combatArenaLayout(definition: CombatProject3D, index: number) {
  if (!definition.arenaLayouts) return undefined;
  const selected = definition.arenaLayouts.map((district, slot) => {
    const count = district.variants.length;
    const offset = index + (count > 2 ? Math.floor(index / count ** (slot + 1)) : 0) + slot;
    return { districtId: district.id, variant: district.variants[offset % count]! };
  });
  return { props: selected.flatMap(item => item.variant.props), selected: selected.map(item => ({ districtId: item.districtId, variantId: item.variant.id })) };
}

export function readCombatArenaLayouts(value: unknown, reservedIds: readonly string[] = []): CombatArenaLayouts | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error('Arena layouts support up to 8 districts.');
  if (!value.length) return undefined;
  const districtIds = new Set<string>(), owners = new Map<string, string>(), reserved = new Set(reservedIds);
  return value.map(district => {
    if (!district || typeof district !== 'object' || !('id' in district) || !('variants' in district) || !Array.isArray(district.variants) || !district.variants.length || district.variants.length > 8) throw new Error('Arena districts need between 1 and 8 variants.');
    fields(district, ['id', 'variants']);
    const id = name(district.id, districtIds), variantIds = new Set<string>();
    let expected: Set<string> | undefined;
    const variants = district.variants.map((variant: unknown) => {
      if (!variant || typeof variant !== 'object' || !('id' in variant) || !('props' in variant) || !Array.isArray(variant.props) || variant.props.length > 512) throw new Error('Arena variants support up to 512 placements.');
      fields(variant, ['id', 'props']);
      const variantId = name(variant.id, variantIds), ids = new Set<string>();
      const props = variant.props.map((prop: unknown): Placement => {
        if (!prop || typeof prop !== 'object' || !('entityId' in prop) || !('position' in prop)) throw new Error('Arena placements need an entity and position.');
        fields(prop, ['entityId', 'position']);
        const entityId = name(prop.entityId, ids);
        if (reserved.has(entityId) || owners.has(entityId) && owners.get(entityId) !== id) throw new Error('Arena objects must belong to one district and cannot also be fighters, weapons or starting-location props.');
        owners.set(entityId, id);
        const position = prop.position;
        if (!Array.isArray(position) || position.length !== 3 || position.some(component => typeof component !== 'number' || !Number.isFinite(component) || Math.abs(component) > 100000)) throw new Error('Arena layout positions need three finite coordinates.');
        return { entityId, position: [position[0], position[1], position[2]] };
      });
      if (expected && (expected.size !== ids.size || [...expected].some(entityId => !ids.has(entityId)))) throw new Error('Every variant in an arena district must place the same objects.');
      expected = ids;
      return { id: variantId, props };
    });
    return { id, variants };
  });
}

/** Editor preflight and runtime enforce the same active-scene ownership. */
export function validateArenaLayoutReferences(options: { definition: CombatProject3D; declaration: Readonly<Hyperfocus3DDeclaration> }) {
  const scene = options.declaration.scenes.find(scene => scene.id === options.declaration.activeSceneId);
  const entities = new Map(scene?.entities.map(entity => [entity.id, entity]));
  for (const district of options.definition.arenaLayouts ?? []) for (const prop of district.variants[0]!.props) {
    const entity = entities.get(prop.entityId);
    if (!entity || entity.animation) throw new Error(`Arena layout object ${prop.entityId} must be an existing non-animated object in the active scene.`);
  }
}

function name(value: unknown, ids: Set<string>) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160 || ids.has(value)) throw new Error('Arena layout names and object IDs must be unique and nonempty.');
  ids.add(value);return value;
}

function fields(value: object, keys: readonly string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unknown arena layout field.');
}
