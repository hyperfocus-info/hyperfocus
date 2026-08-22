export const MIN_SKILL_LEVEL = 1;
export const MAX_SKILL_LEVEL = 99;
export const MIN_MATERIAL_TIER = 1;
export const MAX_MATERIAL_TIER = 5;
export const BASE_GATHER_XP = 25;

export const gatheringSkillIds = [
  "lumberjacking",
  "mining",
  "foraging",
  "quarrying",
  "fishing",
  "skinning",
  "crop-harvesting",
  "scavenging",
  "essence-siphoning",
  "apiculture",
  "sap-tapping",
  "spore-hunting",
  "dredging",
  "archaeology",
  "hunting",
  "gemology"
] as const;

export type GatheringSkillId = (typeof gatheringSkillIds)[number];
export type SkillLevel = number;
export type MaterialTier = 1 | 2 | 3 | 4 | 5;

export interface GatheringSkillDefinition {
  id: GatheringSkillId;
  name: string;
  description: string;
}

export interface GatheringSkillProgress {
  xp: number;
  level: SkillLevel;
}

export type GatheringSkillXpMap = Record<GatheringSkillId, number>;
export type GatheringSkillProgressMap = Record<GatheringSkillId, GatheringSkillProgress>;

export const gatheringSkills = [
  {
    id: "lumberjacking",
    name: "Lumberjacking",
    description: "Harvesting rigid wooden structures."
  },
  {
    id: "mining",
    name: "Mining",
    description: "Harvesting metal rock deposits."
  },
  {
    id: "foraging",
    name: "Foraging",
    description: "Collecting delicate woodland plants and berries."
  },
  {
    id: "quarrying",
    name: "Quarrying",
    description: "Chiseling architectural slate and blocks."
  },
  {
    id: "fishing",
    name: "Fishing",
    description: "Hooking aquatic sea-life and reefs."
  },
  {
    id: "skinning",
    name: "Skinning",
    description: "Shedding hides from defeated beasts."
  },
  {
    id: "crop-harvesting",
    name: "Crop Harvesting",
    description: "Reaping agricultural field crops."
  },
  {
    id: "scavenging",
    name: "Scavenging",
    description: "Dredging mechanical debris and wrecks."
  },
  {
    id: "essence-siphoning",
    name: "Essence Siphoning",
    description: "Filtering raw magical and environmental currents."
  },
  {
    id: "apiculture",
    name: "Apiculture",
    description: "Extracting active hives and beeswax."
  },
  {
    id: "sap-tapping",
    name: "Sap-Tapping",
    description: "Extracting viscous plant resins and gums."
  },
  {
    id: "spore-hunting",
    name: "Spore-Hunting",
    description: "Deciphering subterranean mold colonies."
  },
  {
    id: "dredging",
    name: "Dredging",
    description: "Sieving heavy clay, silt, and sea bed floor."
  },
  {
    id: "archaeology",
    name: "Archaeology",
    description: "Excavating lost fossils, historical seals, and relics."
  },
  {
    id: "hunting",
    name: "Hunting",
    description: "Setting tactical snap-traps for animal glands."
  },
  {
    id: "gemology",
    name: "Gemology",
    description: "Chipping crystals and geodes out of deep seams."
  }
] as const satisfies readonly GatheringSkillDefinition[];

export const gatheringSkillById = Object.fromEntries(
  gatheringSkills.map((skill) => [skill.id, skill])
) as Record<GatheringSkillId, GatheringSkillDefinition>;

const gatheringSkillIdSet = new Set<string>(gatheringSkillIds);

export function isGatheringSkillId(value: string): value is GatheringSkillId {
  return gatheringSkillIdSet.has(value);
}

export function assertGatheringSkillId(value: string): asserts value is GatheringSkillId {
  if (!isGatheringSkillId(value)) {
    throw new RangeError(`Unknown gathering skill id: ${value}`);
  }
}

export function isValidSkillLevel(level: number): level is SkillLevel {
  return Number.isInteger(level) && level >= MIN_SKILL_LEVEL && level <= MAX_SKILL_LEVEL;
}

export function assertValidSkillLevel(level: number): asserts level is SkillLevel {
  if (!isValidSkillLevel(level)) {
    throw new RangeError(`Skill level must be an integer from ${MIN_SKILL_LEVEL} to ${MAX_SKILL_LEVEL}.`);
  }
}

export function isValidMaterialTier(tier: number): tier is MaterialTier {
  return Number.isInteger(tier) && tier >= MIN_MATERIAL_TIER && tier <= MAX_MATERIAL_TIER;
}

export function assertValidMaterialTier(tier: number): asserts tier is MaterialTier {
  if (!isValidMaterialTier(tier)) {
    throw new RangeError(`Material tier must be an integer from ${MIN_MATERIAL_TIER} to ${MAX_MATERIAL_TIER}.`);
  }
}

function assertSafeFiniteInteger(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} must be a safe finite non-negative integer.`);
  }
}

function safeFloor(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} produced an unsafe finite value.`);
  }
  return Math.floor(value);
}

function safeAdd(left: number, right: number, label: string) {
  const total = left + right;
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} exceeded safe integer range.`);
  }
  return total;
}

const xpForNextLevelTable = Array.from({ length: MAX_SKILL_LEVEL }, (_, index) => {
  const level = index + 1;
  return safeFloor(100 * Math.pow(1.12, level - 1), `XPForLevel(${level})`);
});

const totalXpForLevelTable = xpForNextLevelTable.reduce<number[]>((table, xpForNext, index) => {
  if (index === 0) {
    table.push(0);
    return table;
  }
  table.push(safeAdd(table[index - 1], xpForNextLevelTable[index - 1], `total XP for level ${index + 1}`));
  return table;
}, []);

export function XPForLevel(level: number): number {
  assertValidSkillLevel(level);
  return xpForNextLevelTable[level - 1];
}

export function xpForLevel(level: number): number {
  return XPForLevel(level);
}

export function BaseXP(tier: number): number {
  assertValidMaterialTier(tier);
  return safeFloor(BASE_GATHER_XP * Math.pow(1.55, tier - 1), `BaseXP(${tier})`);
}

export function baseXpForMaterialTier(tier: number): number {
  return BaseXP(tier);
}

export function totalXpForLevel(level: number): number {
  assertValidSkillLevel(level);
  return totalXpForLevelTable[level - 1];
}

export function totalXpToReachLevel(level: number): number {
  return totalXpForLevel(level);
}

export function totalXpToMaxLevel(): number {
  return totalXpForLevel(MAX_SKILL_LEVEL);
}

export function levelFromXp(xp: number): SkillLevel {
  assertSafeFiniteInteger(xp, "XP");

  let resolvedLevel: SkillLevel = MIN_SKILL_LEVEL;
  for (let nextLevel = MIN_SKILL_LEVEL + 1; nextLevel <= MAX_SKILL_LEVEL; nextLevel += 1) {
    if (xp < totalXpForLevelTable[nextLevel - 1]) {
      break;
    }
    resolvedLevel = nextLevel;
  }

  return resolvedLevel;
}

export function createEmptyGatheringSkillXpMap(): GatheringSkillXpMap {
  return Object.fromEntries(gatheringSkillIds.map((skillId) => [skillId, 0])) as GatheringSkillXpMap;
}

export function resolveGatheringSkillProgress(xpBySkill: Partial<Record<GatheringSkillId, number>>): GatheringSkillProgressMap {
  return Object.fromEntries(
    gatheringSkillIds.map((skillId) => {
      const xp = xpBySkill[skillId] ?? 0;
      assertSafeFiniteInteger(xp, `${skillId} XP`);
      return [skillId, { xp, level: levelFromXp(xp) }];
    })
  ) as GatheringSkillProgressMap;
}
