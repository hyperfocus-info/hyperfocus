import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cityStationTemplates } from '../neighborhood/stations.ts';
import { createCityWeaponStaging } from './staging.ts';

type Vec3 = [number, number, number];
// Twelve pooled objects per district bound interaction snapshots at sixty items.
// Each arrangement activates six and leaves the other objects unavailable.
const districts = [
  { id: 'worksite', names: ['Lunch break', 'Tool delivery', 'Cleanup'], keys: ['wine-bottle', 'ceramic-mug', 'takeaway-drink', 'rebar', 'wrench', 'folding-chair', 'flour-bag', 'oil-bottle', 'short-pipe', 'long-pipe', 'shovel', 'sledgehammer'] },
  { id: 'residential', names: ['Doorstep meal', 'Maintenance', 'Exercise corner'], keys: ['wine-glass', 'wine-bottle', 'ceramic-mug', 'broom', 'briefcase', 'nunchaku', 'takeaway-drink', 'detergent-bottle', 'screwdriver', 'serving-tray', 'bin-lid', 'pepper-spray'] },
  { id: 'market', names: ['Meal service', 'Delivery unloading', 'Closing cleanup'], keys: ['plate', 'takeaway-drink', 'takeout-noodles', 'serving-tray', 'kitchen-knife', 'broom', 'flour-bag', 'oil-bottle', 'wine-bottle', 'machete', 'detergent-bottle', 'fire-extinguisher'] },
  { id: 'depot', names: ['Lost property', 'Service cart', 'Loading shift'], keys: ['ceramic-mug', 'takeaway-drink', 'bag-of-marbles', 'briefcase', 'bin-lid', 'baton', 'wine-bottle', 'detergent-bottle', 'short-pipe', 'wrench', 'fire-extinguisher', 'folding-chair'] },
  { id: 'utility', names: ['Maintenance station', 'Equipment inspection', 'Security shift'], keys: ['ceramic-mug', 'takeaway-drink', 'wine-bottle', 'screwdriver', 'fire-extinguisher', 'sword', 'flour-bag', 'bag-of-marbles', 'pepper-spray', 'baton', 'dagger', 'long-pipe'] },
] as const;

// Reuse inspected street pockets and ordinary roof approaches, rather than scatter
// items through arbitrary coordinates or refresh them during a fight.
const stations = districts.map((_, index) => cityStationTemplates.slice(index * 3, index * 3 + 3).map(station => station.center));
const choices = [[0, 1, 2, 3, 4, 5], [1, 6, 7, 8, 9, 10], [0, 2, 6, 4, 10, 11]] as const;
const marketChoices = [[0, 1, 2, 3, 4, 5], [6, 7, 8, 3, 9, 11], [0, 1, 10, 3, 5, 11]] as const;

function placement(district: number, variant: number, slot: number): Vec3 {
  // Three nearby props at each of two stations. The third arrangement stocks
  // an accessible roof station, leaving ground alternatives in the same district.
  const station = stations[district]![variant === 2 && slot >= 3 ? 2 : Math.floor(slot / 3)]!;
  return [station[0] + (slot % 3 - 1) * 1.1, station[1] - .15, station[2] + (variant === 1 ? .65 : 0)];
}

export const cityWeaponPool = districts.flatMap((district, index) => district.keys.map((key, slot) => ({
  entityId: `tod:city:weapon:${index}:${key}`, key,
  position: placement(index, 0, slot % 6),
})));

/** Fifteen editable arrangements select thirty active pickups in five recognizable districts. */
export function authorCityWeaponLayouts({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw new Error('City weapon layouts require an active scene.');
  const staging = scene.entities.some(entity => entity.id.startsWith('tod:city:overhaul:')) ? createCityWeaponStaging({ declaration, combat }) : undefined;
  combat.weaponLayouts = districts.map((district, index) => ({ id: district.id, variants: district.names.map((id, variant) => ({
    id, props: (index === 2 ? marketChoices : choices)[variant]!.map((choice, slot) => ({ entityId: `tod:city:weapon:${index}:${district.keys[choice]}`, position: staging?.place(index, variant, slot, district.keys[choice]!) ?? placement(index, variant, slot) })),
  })) }));
  // Legacy starting-location tool placements are superseded by district pools.
  for (const spawn of combat.spawns ?? []) spawn.props = (spawn.props ?? []).filter(prop => !prop.entityId.startsWith('tod:city:tool:') && !prop.entityId.startsWith('tod:city:weapon:'));
  const defaults = combat.weaponLayouts.flatMap((district, index) => district.variants[index % 3]!.props);
  for (const prop of defaults) { const entity = scene.entities.find(entity => entity.id === prop.entityId);if (entity) entity.position = [...prop.position]; }
}
