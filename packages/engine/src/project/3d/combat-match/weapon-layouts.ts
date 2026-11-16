import type { CombatProject3D } from '../combat-declaration.ts';

type Placement = { entityId: string; position: [number, number, number] };
export type CombatWeaponLayouts = Array<{ id: string; variants: Array<{ id: string; props: Placement[] }> }>;

/** Independently varying districts share only the saved match index, never mutable RNG state. */
export function combatWeaponLayout(definition: CombatProject3D, index: number) {
  if (!definition.weaponLayouts) return undefined;
  const selected = definition.weaponLayouts.map((district, slot) => {
    const count = district.variants.length;
    // For three variants each consecutive match advances by one or two, including
    // digit boundaries. Higher digits give each district its own longer sequence.
    const variant = (index + (count > 2 ? Math.floor(index / count ** (slot + 1)) : 0) + slot) % count;
    return district.variants[variant]!;
  });
  const props = selected.flatMap(variant => variant.props);
  const pooled = new Set(definition.weaponLayouts.flatMap(district => district.variants.flatMap(variant => variant.props.map(prop => prop.entityId))));
  const active = new Set(props.map(prop => prop.entityId));
  // Unmanaged project weapons remain available; layouts own only their declared pool.
  for (const weapon of definition.interactions?.weapons ?? []) if (!pooled.has(weapon.entityId)) active.add(weapon.entityId);
  return { props, active };
}

export function readCombatWeaponLayouts(value: unknown, weaponIds: readonly string[]): CombatWeaponLayouts | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error('Weapon layouts support up to 8 districts.');
  if (!value.length) return undefined;
  const districtIds = new Set<string>(), owners = new Map<string, string>();
  const name = (value: unknown, ids: Set<string>) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 160 || ids.has(value)) throw new Error('Weapon layout names must be unique and nonempty.');
    ids.add(value);return value;
  };
  const fields = (value: object, keys: string[]) => { if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('Unknown weapon layout field.'); };
  return value.map(district => {
    if (!district || typeof district !== 'object' || !('id' in district) || !('variants' in district) || !Array.isArray(district.variants) || !district.variants.length || district.variants.length > 8) throw new Error('Weapon districts need named variants.');
    fields(district, ['id', 'variants']);const id = name(district.id, districtIds), variantIds = new Set<string>();
    const variants = district.variants.map((variant: unknown) => {
      if (!variant || typeof variant !== 'object' || !('id' in variant) || !('props' in variant) || !Array.isArray(variant.props) || variant.props.length > 64) throw new Error('Weapon variants support up to 64 placements.');
      fields(variant, ['id', 'props']);const variantId = name(variant.id, variantIds), ids = new Set<string>();
      const props = variant.props.map((prop: unknown): Placement => {
        if (!prop || typeof prop !== 'object' || !('entityId' in prop) || !('position' in prop)) throw new Error('Weapon placements need an entity and position.');
        fields(prop, ['entityId', 'position']);const entityId = name(prop.entityId, ids);
        if (!weaponIds.includes(entityId) || owners.has(entityId) && owners.get(entityId) !== id) throw new Error('Weapon layouts require existing weapons owned by only one district.');
        owners.set(entityId, id);
        const position = prop.position;
        if (!Array.isArray(position) || position.length !== 3 || position.some(component => typeof component !== 'number' || !Number.isFinite(component) || Math.abs(component) > 100000)) throw new Error('Weapon layout positions need three finite coordinates.');
        return { entityId, position: [position[0], position[1], position[2]] };
      });
      return { id: variantId, props };
    });
    return { id, variants };
  });
}
