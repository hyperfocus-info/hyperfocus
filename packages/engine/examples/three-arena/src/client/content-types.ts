import { ARENA_DATA } from "../arena-data.ts";

export type StringCategories = Record<string, string>;

export type ProgressionBonus = {
  level?: number;
  badge?: string;
  stateLabel?: string;
  category?: string;
  damage?: number;
  pierce?: number;
  projectiles?: number;
  orbitals?: number;
  summons?: number;
  pulseCount?: number;
  cooldownMultiplier?: number;
  projectileSpeedMultiplier?: number;
  spreadDegrees?: number;
  knockback?: number;
  eliteDamageMultiplier?: number;
  radius?: number;
  poolRadius?: number;
  bleedDamagePerSecond?: number;
  burnDamagePerSecond?: number;
  rotationSpeedMultiplier?: number;
  orbitalSize?: number;
  poolSeconds?: number;
  tickRateMultiplier?: number;
  returnSpeedMultiplier?: number;
  width?: number;
  summonSeconds?: number;
  biteCooldownMultiplier?: number;
  staggerSeconds?: number;
  pulseDelaySeconds?: number;
  arcDegrees?: number;
  executeHealthRatio?: number;
  auraRadiusMultiplier?: number;
  auraDamageMultiplier?: number;
  silverDamageMultiplier?: number;
  fireDamageMultiplier?: number;
  plagueDamageMultiplier?: number;
  bleedDamageMultiplier?: number;
  moveSpeedMultiplier?: number;
  contactGraceSecondsFlat?: number;
  knockbackResistFlat?: number;
  effectDurationMultiplier?: number;
  pickupLifetimeMultiplier?: number;
  armorFlat?: number;
  contactThornsDamage?: number;
  knockbackForceMultiplier?: number;
  pickupRadiusFlat?: number;
  projectileCountFlat?: number;
  projectileSizeMultiplier?: number;
  damageMultiplier?: number;
  jumpHeightMultiplier?: number;
  gravityMultiplier?: number;
  maxJumpsFlat?: number;
  splashDamageFlat?: number;
  xpMultiplier?: number;
  curseMultiplier?: number;
  luckMultiplier?: number;
  critChanceFlat?: number;
  critMultiplier?: number;
  maxHpFlat?: number;
  maxHpMultiplier?: number;
  regenFlat?: number;
  healMultiplier?: number;
};

export type PassiveTeamworkEffect = {
  id: string;
  title: string;
  badge: string;
  color: string;
  category: string;
  bonus: ProgressionBonus;
  description: string;
};

export type LevelChoiceBase = {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  color: string;
  category: string;
  targetLevel?: number;
  owned?: boolean;
  bonus?: ProgressionBonus;
  amount?: number | null;
  effect?: PassiveTeamworkEffect | null;
};
export type WeaponLevelChoice = LevelChoiceBase & { kind: "weapon"; targetLevel: number; owned: boolean };
export type PassiveLevelChoice = LevelChoiceBase & { kind: "passive"; targetLevel: number; owned: boolean };
export type EvolutionLevelChoice = LevelChoiceBase & { kind: "evolution" };
export type StatLevelChoice = LevelChoiceBase & { kind: "stat"; bonus: ProgressionBonus; amount: number | null };
export type HealLevelChoice = LevelChoiceBase & { kind: "heal" };
export type LevelChoice = WeaponLevelChoice | PassiveLevelChoice | EvolutionLevelChoice | StatLevelChoice | HealLevelChoice;

export type WeaponEvolution = {
  requires: string;
  resultId: string;
  name: string;
  tierBadge?: string;
  stateLabel?: string;
  categories?: StringCategories;
  color?: string;
  timerHint?: string;
  change?: string;
};

export type RawWeaponBase = {
  damage?: number;
  damageType?: string;
  cooldown?: number;
  projectiles?: number;
  arcs?: number;
  pulseCount?: number;
  orbitals?: number;
  summons?: number;
  projectileSpeed?: number;
  lifetime?: number;
  pierce?: number;
  knockback?: number;
  spreadDegrees?: number;
};

export type RawWeaponDefinition = {
  id: string;
  name: string;
  fantasy?: string;
  tierBadge?: string;
  stateLabel?: string;
  tags?: string[];
  categories?: StringCategories;
  maxLevel?: number;
  base?: RawWeaponBase;
  levels?: ProgressionBonus[];
  evolution?: WeaponEvolution;
  visual?: { color?: string };
};

export type WeaponDefinition = {
  id: string;
  name: string;
  label: string;
  fantasy: string;
  tierBadge: string;
  stateLabel: string;
  tags: string[];
  categories: StringCategories;
  maxLevel: number;
  levels: ProgressionBonus[];
  evolution: WeaponEvolution | null;
  damageType: string;
  cooldown: number;
  damage: number;
  speed: number;
  range: number;
  pellets: number;
  spread: number;
  pierce: number;
  knockback: number;
  color: string;
};

export type WeaponRuntime = WeaponDefinition & {
  level: number;
  evolved: boolean;
  eliteDamageMultiplier: number;
  critChance: number;
  critMultiplier: number;
  projectileSizeMultiplier: number;
  splashDamageMultiplier: number;
  splashRadius: number;
  specialRadius?: number;
  orbitSpeed?: number;
  orbitalSize?: number;
  poolRadius?: number;
  poolSeconds?: number;
  tickInterval?: number;
  arcHeight?: number;
  returnSpeed?: number;
  width?: number;
  summonSpeed?: number;
  summonSeconds?: number;
  biteCooldown?: number;
  pulseRadius?: number;
  waveSpeed?: number;
  staggerSeconds?: number;
  pulseDelaySeconds?: number;
  sweepRadius?: number;
  sweepArc?: number;
  executeRatio?: number;
};

export type DamageWeapon = Pick<WeaponRuntime,
  "color" | "damage" | "knockback" | "eliteDamageMultiplier" | "critChance" | "critMultiplier"
> & {
  id?: string;
  damageType?: string;
};

export type EnemyDefinition = {
  name: string;
  hp: number;
  speed: number;
  touch: number;
  radius: number;
  score: number;
  texture: string;
};

export type RawEnemyDefinition = {
  name: string;
  health?: number;
  speed?: number;
  contactDamage?: number;
  radius?: number;
  xp?: number;
};

export type WaveDefinition = {
  id: string;
  at: number;
  name: string;
  mix: Array<[string, number]>;
  rate: number;
  cap: number;
  eliteId: string | null;
  bossAtSecond?: number;
};

export type RawWaveDefinition = {
  id?: string;
  label?: string;
  startSecond?: number;
  spawnIntervalSeconds?: number;
  spawnCap?: number;
  eliteId?: string | null;
  bossAtSecond?: number;
  squads?: Array<{ enemyId: string; weight?: number }>;
};

export type HazardDefinition = {
  id: string;
  kind: string;
  x: number;
  z: number;
  radius: number;
  dps: number;
};

export type RawHazardDefinition = {
  id: string;
  radius?: number;
  damagePerSecond?: number;
  damage?: number;
};

export type ArenaPropDefinition = {
  id?: string;
  model: string;
  x: number;
  z: number;
  rot?: number;
  scale?: number;
};

export type PassiveDefinition = {
  id: string;
  name: string;
  maxLevel: number;
  tierBadge?: string;
  stateLabel?: string;
  tags?: string[];
  categories?: StringCategories;
  visual?: { color?: string; timerHint?: string };
  bonuses?: ProgressionBonus[];
};

export type ClassUnlock = { level: number; id: string };
export type PlayerClassDefinition = {
  id: string;
  name: string;
  role: string;
  color: string;
  starterWeapon: string;
  starterPassives: string[];
  progression?: { weapons: ClassUnlock[]; passives: ClassUnlock[] };
  passiveBias: string[];
  stats: ProgressionBonus;
  perk: string;
};

export type ArenaData = {
  balance: typeof ARENA_DATA.balance;
  arena: { radius: number; softRadius: number; spawnRadius: number; worldSize: number; baseRadius: number };
  player: {
    startHealth: number;
    healthRegenPerSecond: number;
    moveSpeed: number;
    pickupRadius: number;
    maxWeaponSlots: number;
    maxPassiveSlots: number;
  };
  progression: {
    startLevel: number;
    xpCurveBase: number;
    xpCurvePower: number;
    xpCurveLinear: number;
    levelChoiceCount: number;
    rerollsStart: number;
    banishesStart: number;
    evolutionLevel: number;
    passiveEvolutionLevel: number;
  };
  passiveItems: PassiveDefinition[];
  playerClasses: PlayerClassDefinition[];
  levelUpPools: typeof ARENA_DATA.levelUpPools;
  pickups: typeof ARENA_DATA.pickups;
  weapons: WeaponDefinition[];
  enemies: Record<string, EnemyDefinition>;
  waves: WaveDefinition[];
  hazards: HazardDefinition[];
  props: ArenaPropDefinition[];
  objectives: string[];
  pickupChances: { heal: number; magnet: number };
};
