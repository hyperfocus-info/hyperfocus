// Game-local content data for the Three Arena undead survival prototype.

import { ARENA_ID, BALANCE_CONSTANTS, DAMAGE_TYPES, PASSIVE_ITEMS } from "./arena-data/core.ts";
export { ARENA_ID, BALANCE_CONSTANTS, DAMAGE_TYPES, PASSIVE_ITEMS };

import { WEAPON_DEFINITIONS } from "./arena-data/weapons.ts";
export { WEAPON_DEFINITIONS };

import { ENEMY_ARCHETYPES, WAVE_PACING } from "./arena-data/encounters.ts";
export { ENEMY_ARCHETYPES, WAVE_PACING };

import { ARENA_OBJECTIVES, PICKUP_DEFINITIONS, HAZARD_DEFINITIONS } from "./arena-data/world.ts";
export { ARENA_OBJECTIVES, PICKUP_DEFINITIONS, HAZARD_DEFINITIONS };

import { MAP_PROP_DESCRIPTORS, BIOME_PROP_SETS } from "./arena-data/props.ts";
export { MAP_PROP_DESCRIPTORS, BIOME_PROP_SETS };

import { LEVEL_UP_POOLS, PLAYER_CLASSES } from "./arena-data/progression.ts";
export { LEVEL_UP_POOLS, PLAYER_CLASSES };

export const ARENA_DATA = {
  id: ARENA_ID,
  balance: BALANCE_CONSTANTS,
  damageTypes: DAMAGE_TYPES,
  passiveItems: PASSIVE_ITEMS,
  weapons: WEAPON_DEFINITIONS,
  playerClasses: PLAYER_CLASSES,
  enemies: ENEMY_ARCHETYPES,
  waves: WAVE_PACING,
  pickups: PICKUP_DEFINITIONS,
  hazards: HAZARD_DEFINITIONS,
  mapProps: MAP_PROP_DESCRIPTORS,
  biomes: BIOME_PROP_SETS,
  levelUpPools: LEVEL_UP_POOLS,
  objectives: ARENA_OBJECTIVES
};

export default ARENA_DATA;
