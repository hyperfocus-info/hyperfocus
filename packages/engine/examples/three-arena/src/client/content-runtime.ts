import { ARENA_DATA } from "../arena-data.ts";
import type { PassiveTeamworkEffect, PlayerClassDefinition, ProgressionBonus } from "./content-types.ts";
import { runtimeCallback } from "./runtime-ports.ts";
const formatPercentPoints = runtimeCallback("progressionChoices", "formatPercentPoints");
const percentDelta = runtimeCallback("progressionChoices", "percentDelta");
import { normalizeArenaData } from "./arena-normalization.ts";
import { createToroidalWorld3D } from "@hyperfocus/engine/render/3d";

export const data = normalizeArenaData(ARENA_DATA);
export const WORLD_SIZE = data.arena.worldSize ?? data.arena.radius * 2;
export const WORLD_HALF_SIZE = WORLD_SIZE / 2;
export const toroidalWorld = createToroidalWorld3D({
  width: WORLD_SIZE,
  depth: WORLD_SIZE,
  origin: [-WORLD_HALF_SIZE, -WORLD_HALF_SIZE]
});
export const weaponsById = new Map(data.weapons.map((weapon) => [weapon.id, weapon]));
export const passiveItemsById = new Map((data.passiveItems ?? []).map((passive) => [passive.id, passive]));
export const playerClasses: PlayerClassDefinition[] = data.playerClasses.length ? data.playerClasses : [{
  id: "survivor",
  name: "Survivor",
  role: "Balanced",
  color: "#d7ff8d",
  starterWeapon: data.weapons[0]?.id ?? "pistol",
  starterPassives: [],
  passiveBias: ["damage", "tempo", "utility"],
  stats: {},
  perk: "Plain kit: enough speed, enough bite, no special debt."
}];
export const playerClassesById = new Map(playerClasses.map((klass) => [klass.id, klass]));
export const DEFAULT_CLASS_ID = playerClasses[0]?.id ?? "survivor";
export const CLASS_LEVEL_STORAGE_KEY = "three-arena.class-levels.v1";
export const CLASS_LOADOUT_STORAGE_KEY = "three-arena.class-loadouts.v1";
export const SETTINGS_STORAGE_KEY = "three-arena.settings.v1";
export const DEFAULT_CLASS_LEVEL = 1;
export const MAX_LOADOUT_PASSIVES = 3;
export const DEFAULT_SETTINGS = {
  mouseSensitivity: 1,
  stickSensitivity: 1,
  invertY: false,
  masterVolume: 1,
  musicVolume: 1,
  sfxVolume: 1,
  muted: false
};
export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;
export type NumericSettingKey = "mouseSensitivity" | "stickSensitivity" | "masterVolume" | "musicVolume" | "sfxVolume";
export type ClassLoadout = { weaponId?: string; passiveIds?: string[]; passiveId?: string };
export type ResolvedClassLoadout = { weaponId?: string; passiveIds: string[] };
export type ClassLoadouts = Record<string, ClassLoadout>;
export const POWERUP_DROP_MULTIPLIER = 0.05;
export const XP_DROP_CHANCE = 0.5;
export type RunStatDefinition = {
  id: string;
  title: string;
  badge: string;
  color: string;
  category: string;
  min: number;
  max: number;
  step: number;
  bonus: (value: number) => ProgressionBonus;
  description: (value: number) => string;
};
export const RUN_STAT_DEFINITIONS: RunStatDefinition[] = [
  {
    id: "critChance",
    title: "Crit Chance",
    badge: "Crit",
    color: "#fff4a6",
    category: "damage",
    min: 0.03,
    max: 0.06,
    step: 0.01,
    bonus: (value) => ({ critChanceFlat: value }),
    description: (value) => `Crit chance +${formatPercentPoints(value)}`
  },
  {
    id: "critDamage",
    title: "Crit Damage",
    badge: "Crit",
    color: "#ffd36d",
    category: "damage",
    min: 1.1,
    max: 1.22,
    step: 0.02,
    bonus: (value) => ({ critMultiplier: value }),
    description: (value) => `Crit damage +${percentDelta(value)}`
  },
  {
    id: "projectileCount",
    title: "Projectile Count",
    badge: "Shots",
    color: "#9fe8ff",
    category: "coverage",
    min: 1,
    max: 2,
    step: 1,
    bonus: (value) => ({ projectileCountFlat: value }),
    description: (value) => `Projectiles +${value}`
  },
  {
    id: "projectileSpeed",
    title: "Projectile Speed",
    badge: "Speed",
    color: "#82e9ff",
    category: "projectile",
    min: 1.08,
    max: 1.18,
    step: 0.02,
    bonus: (value) => ({ projectileSpeedMultiplier: value }),
    description: (value) => `Projectile speed +${percentDelta(value)}`
  },
  {
    id: "projectileSize",
    title: "Projectile Size",
    badge: "Size",
    color: "#d7ff8d",
    category: "coverage",
    min: 1.1,
    max: 1.24,
    step: 0.02,
    bonus: (value) => ({ projectileSizeMultiplier: value }),
    description: (value) => `Projectile size +${percentDelta(value)}`
  },
  {
    id: "damage",
    title: "Damage",
    badge: "Dmg",
    color: "#ffb36b",
    category: "damage",
    min: 1.06,
    max: 1.14,
    step: 0.02,
    bonus: (value) => ({ damageMultiplier: value }),
    description: (value) => `Damage +${percentDelta(value)}`
  },
  {
    id: "moveSpeed",
    title: "Move Speed",
    badge: "Move",
    color: "#85ff9a",
    category: "mobility",
    min: 1.05,
    max: 1.12,
    step: 0.01,
    bonus: (value) => ({ moveSpeedMultiplier: value }),
    description: (value) => `Move speed +${percentDelta(value)}`
  },
  {
    id: "jumpHeight",
    title: "Jump Height",
    badge: "Jump",
    color: "#bff7ff",
    category: "mobility",
    min: 1.1,
    max: 1.24,
    step: 0.02,
    bonus: (value) => ({ jumpHeightMultiplier: value }),
    description: (value) => `Jump height +${percentDelta(value)}`
  },
  {
    id: "gravityRate",
    title: "Gravity Rate",
    badge: "Float",
    color: "#cfd7ff",
    category: "mobility",
    min: 0.82,
    max: 0.94,
    step: 0.02,
    bonus: (value) => ({ gravityMultiplier: value }),
    description: (value) => `Gravity -${percentDelta(1 / value)}`
  },
  {
    id: "extraJump",
    title: "Extra Jump",
    badge: "Jumps",
    color: "#d8f8ff",
    category: "mobility",
    min: 1,
    max: 1,
    step: 1,
    bonus: (value) => ({ maxJumpsFlat: value }),
    description: (value) => `Jumps +${value}`
  },
  {
    id: "splashDamage",
    title: "Splash Damage",
    badge: "Splash",
    color: "#ff9de8",
    category: "area",
    min: 0.1,
    max: 0.22,
    step: 0.02,
    bonus: (value) => ({ splashDamageFlat: value }),
    description: (value) => `Splash damage +${formatPercentPoints(value)}`
  },
  {
    id: "xpGain",
    title: "XP Gain",
    badge: "XP",
    color: "#7bd6ff",
    category: "utility",
    min: 1.12,
    max: 1.28,
    step: 0.04,
    bonus: (value) => ({ xpMultiplier: value }),
    description: (value) => `XP gain +${percentDelta(value)}`
  },
  {
    id: "curse",
    title: "Curse",
    badge: "Curse",
    color: "#c88cff",
    category: "pressure",
    min: 1.08,
    max: 1.2,
    step: 0.02,
    bonus: (value) => ({ curseMultiplier: value }),
    description: (value) => `Enemy count and health +${percentDelta(value)}`
  },
  {
    id: "luck",
    title: "Luck",
    badge: "Luck",
    color: "#f3de9a",
    category: "utility",
    min: 1.25,
    max: 1.6,
    step: 0.05,
    bonus: (value) => ({ luckMultiplier: value }),
    description: (value) => `Powerup drops +${percentDelta(value)}`
  },
  {
    id: "attackSpeed",
    title: "Attack Speed",
    badge: "Atk",
    color: "#c8b784",
    category: "tempo",
    min: 0.84,
    max: 0.92,
    step: 0.02,
    bonus: (value) => ({ cooldownMultiplier: value }),
    description: (value) => `Attack speed +${percentDelta(1 / value)}`
  }
];
export const PASSIVE_TEAMWORK_EFFECTS: PassiveTeamworkEffect[] = [
  { id: "packTactics", title: "Pack Tactics", badge: "Pack", color: "#d7ff8d", category: "damage", bonus: { damageMultiplier: 1.05 }, description: "Team damage link" },
  { id: "crossfire", title: "Crossfire", badge: "Aim", color: "#fff4a6", category: "damage", bonus: { critChanceFlat: 0.03 }, description: "Shared crit lanes" },
  { id: "sharedTempo", title: "Shared Tempo", badge: "Tempo", color: "#c8b784", category: "tempo", bonus: { cooldownMultiplier: 0.95 }, description: "Team attack rhythm" },
  { id: "signalRelay", title: "Signal Relay", badge: "Relay", color: "#82e9ff", category: "projectile", bonus: { projectileSpeedMultiplier: 1.08 }, description: "Faster shared shots" },
  { id: "coverStep", title: "Cover Step", badge: "Step", color: "#85ff9a", category: "mobility", bonus: { moveSpeedMultiplier: 1.05 }, description: "Faster repositioning near allies" },
  { id: "medicRelay", title: "Medic Relay", badge: "Heal", color: "#baffb0", category: "survival", bonus: { regenFlat: 0.12, healMultiplier: 1.08 }, description: "Shared recovery pulse" },
  { id: "bulwarkLink", title: "Bulwark Link", badge: "Guard", color: "#d6c0a4", category: "defense", bonus: { armorFlat: 2 }, description: "Linked armor" },
  { id: "pickupChain", title: "Pickup Chain", badge: "Draw", color: "#7bd6ff", category: "utility", bonus: { pickupRadiusFlat: 0.6, xpMultiplier: 1.05 }, description: "Shared pickup reach" },
  { id: "luckySignal", title: "Lucky Signal", badge: "Luck", color: "#f3de9a", category: "utility", bonus: { luckMultiplier: 1.2 }, description: "Better team powerup odds" },
  { id: "blastCallout", title: "Blast Callout", badge: "Blast", color: "#ff9de8", category: "area", bonus: { splashDamageFlat: 0.08 }, description: "Splash callouts" },
  { id: "volleySync", title: "Volley Sync", badge: "Volley", color: "#9fe8ff", category: "coverage", bonus: { projectileCountFlat: 1 }, description: "Extra synchronized projectile" },
  { id: "focusLens", title: "Focus Lens", badge: "Focus", color: "#ffd36d", category: "damage", bonus: { critMultiplier: 1.08 }, description: "Harder team crits" },
  { id: "scavengerBond", title: "Scavenger Bond", badge: "XP", color: "#78b7ff", category: "utility", bonus: { xpMultiplier: 1.12 }, description: "Shared shard learning" },
  { id: "guardianPulse", title: "Guardian Pulse", badge: "Pulse", color: "#cfd7df", category: "control", bonus: { knockbackForceMultiplier: 1.08, contactGraceSecondsFlat: 0.02 }, description: "Safer close pressure" },
  { id: "wardingCircle", title: "Warding Circle", badge: "Aura", color: "#d6c0a4", category: "area", bonus: { auraRadiusMultiplier: 1.08 }, description: "Wider ally-safe aura" },
  { id: "warChant", title: "War Chant", badge: "Chant", color: "#ffb36b", category: "tempo", bonus: { damageMultiplier: 1.03, cooldownMultiplier: 0.97 }, description: "Damage and rhythm chant" },
  { id: "markedQuarry", title: "Marked Quarry", badge: "Mark", color: "#fff2b5", category: "damage", bonus: { eliteDamageMultiplier: 1.08 }, description: "Team elite mark" },
  { id: "silverSignal", title: "Silver Signal", badge: "Silver", color: "#f2f4df", category: "damage", bonus: { silverDamageMultiplier: 1.08 }, description: "Shared silver pressure" },
  { id: "fireWatch", title: "Fire Watch", badge: "Fire", color: "#ff9d4a", category: "damage", bonus: { fireDamageMultiplier: 1.08 }, description: "Shared burn pressure" },
  { id: "plagueNet", title: "Plague Net", badge: "Plague", color: "#74c96b", category: "damage", bonus: { plagueDamageMultiplier: 1.08 }, description: "Shared plague pressure" },
  { id: "bloodPact", title: "Blood Pact", badge: "Bleed", color: "#9f2635", category: "damage", bonus: { bleedDamageMultiplier: 1.08 }, description: "Shared bleed pressure" },
  { id: "rallyBoots", title: "Rally Boots", badge: "Rally", color: "#9f8d72", category: "mobility", bonus: { moveSpeedMultiplier: 1.03, knockbackResistFlat: 0.05 }, description: "Team rally footing" },
  { id: "magnetLine", title: "Magnet Line", badge: "Line", color: "#9fe8ff", category: "utility", bonus: { pickupRadiusFlat: 0.4, luckMultiplier: 1.08 }, description: "Loot line through allies" },
  { id: "lastStand", title: "Last Stand", badge: "Stand", color: "#cfd7df", category: "survival", bonus: { maxHpFlat: 8, armorFlat: 1 }, description: "Shared emergency grit" },
  { id: "overwatch", title: "Overwatch", badge: "Watch", color: "#b38cff", category: "coverage", bonus: { projectileSizeMultiplier: 1.08, splashDamageFlat: 0.05 }, description: "Bigger cover fire" }
];
