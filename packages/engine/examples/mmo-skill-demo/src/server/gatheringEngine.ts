import {
  createEmptyGatheringSkillXpMap,
  gatheringSkillIds,
  isGatheringSkillId,
  levelFromXp,
  mapGatheringSkills,
  totalXpForLevel,
  type GatheringSkillId
} from "../shared/skills.ts";
import {
  getGatherableMaterialById,
  materialsBySkill,
  type GatherableMaterial
} from "../shared/materials.ts";

export const GATHERING_WORLD_UNITS_PER_METER = 32;
export const GATHERING_INTERACTION_RANGE_METERS = 2.5;
export const GATHERING_INTERACTION_RANGE = GATHERING_WORLD_UNITS_PER_METER * GATHERING_INTERACTION_RANGE_METERS;
export const GATHERING_MOVE_ABORT_DISTANCE = 3;

export type GatheringAction = "mine" | "woodcut" | "interact";

export type GatheringPlayerState = {
  id: string;
  x: number;
  y: number;
  hp: number;
  zoneId: string;
  inventory?: Record<string, number>;
  equipment?: Record<string, string>;
  miningXp?: number;
  miningLevel?: number;
  woodcuttingXp?: number;
  woodcuttingLevel?: number;
  gatheringXp?: Record<string, number>;
  gatheringLevels?: Record<string, number>;
  activeGatherNodeId?: string;
  activeGatherMaterialId?: number;
  activeGatherSkillId?: string;
  activeGatherMs?: number;
  activeGatherTotalMs?: number;
  activeGatherStartX?: number;
  activeGatherStartY?: number;
  activeGatherStartHp?: number;
};

export type GatheringNodeState = {
  id: string;
  kind?: string;
  skillId?: string;
  materialId?: number;
  x: number;
  y: number;
  zoneId: string;
  depleted?: boolean;
  hp?: number;
  maxHp?: number;
};

export type GatheringStartFailureReason =
  | "unknown-skill"
  | "unknown-material"
  | "depleted"
  | "wrong-zone"
  | "out-of-range"
  | "level-too-low"
  | "missing-tool";

export type GatheringStartResult =
  | { ok: true; started: boolean; material: GatherableMaterial; skillId: GatheringSkillId }
  | { ok: false; reason: GatheringStartFailureReason; material?: GatherableMaterial; skillId?: GatheringSkillId; requiredLevel?: number; currentLevel?: number; missingTools?: readonly string[] };

export type GatheringTickResult =
  | { status: "idle" }
  | { status: "progress"; material: GatherableMaterial; skillId: GatheringSkillId; progress: number; remainingMs: number }
  | { status: "aborted"; reason: "missing-node" | "depleted" | "wrong-zone" | "moved" | "damaged" | "out-of-range" }
  | { status: "complete"; material: GatherableMaterial; skillId: GatheringSkillId; xpAwarded: number };

export const gatheringToolRequirements = {
  lumberjacking: ["training-hatchet", "iron-hatchet"],
  mining: ["pickaxe"],
  foraging: [],
  quarrying: ["mason-chisel"],
  fishing: ["fishing-rod"],
  skinning: ["skinning-knife"],
  "crop-harvesting": ["sickle"],
  scavenging: ["prybar"],
  "essence-siphoning": ["siphon-vial"],
  apiculture: ["bee-smoker"],
  "sap-tapping": ["tap-spile"],
  "spore-hunting": ["spore-lens"],
  dredging: ["dredge-pan"],
  archaeology: ["field-trowel"],
  hunting: ["trap-kit"],
  gemology: ["gem-pick"]
} as const;

const LEGACY_SKILL_ALIASES: Record<string, GatheringSkillId> = {
  woodcut: "lumberjacking",
  woodcutting: "lumberjacking",
  tree: "lumberjacking",
  ore: "mining",
  mine: "mining",
  siphoning: "essence-siphoning"
};

function cleanWhole(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeSkillId(value: unknown): GatheringSkillId | undefined {
  if (typeof value !== "string") return undefined;
  if (isGatheringSkillId(value)) return value;
  return LEGACY_SKILL_ALIASES[value.toLowerCase()];
}

export function gatheringSkillForLegacyAction(action: GatheringAction): GatheringSkillId | undefined {
  if (action === "mine") return "mining";
  if (action === "woodcut") return "lumberjacking";
  return undefined;
}

export function createGatheringXpMap(source: Partial<Record<string, number>> = {}) {
  const xp = createEmptyGatheringSkillXpMap();
  for (const skillId of gatheringSkillIds) xp[skillId] = cleanWhole(source[skillId]);
  return xp;
}

export function createGatheringLevelMap(xpBySkill: Partial<Record<string, number>> = {}) {
  return mapGatheringSkills((skillId) => levelFromXp(cleanWhole(xpBySkill[skillId])));
}

export function ensureGatheringProgress(player: GatheringPlayerState) {
  const source = player.gatheringXp ?? {};
  const xp = createGatheringXpMap(source);
  xp.mining = Math.max(xp.mining, cleanWhole(player.miningXp));
  xp.lumberjacking = Math.max(xp.lumberjacking, cleanWhole(player.woodcuttingXp));

  player.gatheringXp = xp;
  player.gatheringLevels = createGatheringLevelMap(xp);
  player.miningXp = xp.mining;
  player.miningLevel = player.gatheringLevels.mining;
  player.woodcuttingXp = xp.lumberjacking;
  player.woodcuttingLevel = player.gatheringLevels.lumberjacking;
  return { xp, levels: player.gatheringLevels };
}

export function setGatheringLevelForDev(player: GatheringPlayerState, skillId: GatheringSkillId, level: number) {
  const clampedLevel = Math.max(1, Math.min(99, Math.floor(Number.isFinite(level) ? level : 1)));
  ensureGatheringProgress(player);
  player.gatheringXp![skillId] = totalXpForLevel(clampedLevel);
  ensureGatheringProgress(player);
}

export function awardGatheringXp(player: GatheringPlayerState, skillId: GatheringSkillId, amount: number) {
  const value = cleanWhole(amount);
  if (value <= 0) return ensureGatheringProgress(player).levels[skillId];
  ensureGatheringProgress(player);
  player.gatheringXp![skillId] = Math.min(Number.MAX_SAFE_INTEGER, cleanWhole(player.gatheringXp![skillId]) + value);
  return ensureGatheringProgress(player).levels[skillId];
}

export function materialForSkillTier(skillId: GatheringSkillId, tier: number) {
  return materialsBySkill[skillId]?.find((material) => material.tier === tier);
}

export function materialForGatheringNode(node: GatheringNodeState, fallbackSkillId?: GatheringSkillId) {
  if (typeof node.materialId === "number") return getGatherableMaterialById(node.materialId);
  const skillId = normalizeSkillId(node.skillId) ?? normalizeSkillId(node.kind) ?? fallbackSkillId;
  return skillId ? materialForSkillTier(skillId, 1) : undefined;
}

function hasItem(player: GatheringPlayerState, itemId: string) {
  return cleanWhole(player.inventory?.[itemId]) > 0 || Object.values(player.equipment ?? {}).includes(itemId);
}

export function missingGatheringTools(player: GatheringPlayerState, skillId: GatheringSkillId) {
  const tools = gatheringToolRequirements[skillId];
  if (tools.length === 0 || tools.some((toolId) => hasItem(player, toolId))) return [];
  return [...tools];
}

function withinGatheringRange(player: GatheringPlayerState, node: GatheringNodeState) {
  return Math.hypot(player.x - node.x, player.y - node.y) <= GATHERING_INTERACTION_RANGE;
}

export function canStartGathering(
  player: GatheringPlayerState,
  node: GatheringNodeState,
  options: { action?: GatheringAction; material?: GatherableMaterial } = {}
): GatheringStartResult {
  const fallbackSkillId = options.action ? gatheringSkillForLegacyAction(options.action) : undefined;
  const material = options.material ?? materialForGatheringNode(node, fallbackSkillId);
  const skillId = material ? normalizeSkillId(material.skillId) : fallbackSkillId;
  if (!skillId) return { ok: false, reason: "unknown-skill" };
  if (!material) return { ok: false, reason: "unknown-material", skillId };
  if (node.depleted) return { ok: false, reason: "depleted", skillId, material };
  if (node.zoneId !== player.zoneId) return { ok: false, reason: "wrong-zone", skillId, material };
  if (!withinGatheringRange(player, node)) return { ok: false, reason: "out-of-range", skillId, material };

  const { levels } = ensureGatheringProgress(player);
  const currentLevel = levels[skillId] ?? 1;
  if (currentLevel < material.requiredLevel) {
    return { ok: false, reason: "level-too-low", skillId, material, requiredLevel: material.requiredLevel, currentLevel };
  }

  const missingTools = missingGatheringTools(player, skillId);
  if (missingTools.length > 0) return { ok: false, reason: "missing-tool", skillId, material, missingTools };
  return { ok: true, started: false, skillId, material };
}

export function clearActiveGathering(player: GatheringPlayerState) {
  player.activeGatherNodeId = "";
  player.activeGatherMaterialId = 0;
  player.activeGatherSkillId = "";
  player.activeGatherMs = 0;
  player.activeGatherTotalMs = 0;
  player.activeGatherStartX = 0;
  player.activeGatherStartY = 0;
  player.activeGatherStartHp = 0;
}

export function startGatheringInteraction(
  player: GatheringPlayerState,
  node: GatheringNodeState,
  options: { action?: GatheringAction; material?: GatherableMaterial } = {}
): GatheringStartResult {
  const allowed = canStartGathering(player, node, options);
  if (!allowed.ok) {
    clearActiveGathering(player);
    return allowed;
  }

  if (
    player.activeGatherNodeId === node.id &&
    player.activeGatherMaterialId === allowed.material.id &&
    cleanWhole(player.activeGatherTotalMs) > 0
  ) {
    return { ...allowed, started: false };
  }

  player.activeGatherNodeId = node.id;
  player.activeGatherMaterialId = allowed.material.id;
  player.activeGatherSkillId = allowed.skillId;
  player.activeGatherMs = 0;
  player.activeGatherTotalMs = Math.max(1, Math.floor(allowed.material.gatherTimeSeconds * 1000));
  player.activeGatherStartX = player.x;
  player.activeGatherStartY = player.y;
  player.activeGatherStartHp = player.hp;
  return { ...allowed, started: true };
}

export function tickActiveGathering(
  player: GatheringPlayerState,
  node: GatheringNodeState | undefined,
  dtSeconds: number
): GatheringTickResult {
  if (!player.activeGatherNodeId || !player.activeGatherMaterialId || !player.activeGatherTotalMs) return { status: "idle" };
  if (!node || node.id !== player.activeGatherNodeId) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "missing-node" };
  }
  const material = getGatherableMaterialById(player.activeGatherMaterialId);
  const skillId = normalizeSkillId(player.activeGatherSkillId);
  if (!material || !skillId) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "missing-node" };
  }
  if (node.depleted) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "depleted" };
  }
  if (node.zoneId !== player.zoneId) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "wrong-zone" };
  }
  if (player.hp < cleanWhole(player.activeGatherStartHp)) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "damaged" };
  }
  if (Math.hypot(player.x - cleanWhole(player.activeGatherStartX), player.y - cleanWhole(player.activeGatherStartY)) > GATHERING_MOVE_ABORT_DISTANCE) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "moved" };
  }
  if (!withinGatheringRange(player, node)) {
    clearActiveGathering(player);
    return { status: "aborted", reason: "out-of-range" };
  }

  const ms = Math.max(0, Math.floor(dtSeconds * 1000));
  player.activeGatherMs = Math.min(cleanWhole(player.activeGatherTotalMs), cleanWhole(player.activeGatherMs) + ms);
  if (player.activeGatherMs >= cleanWhole(player.activeGatherTotalMs)) {
    clearActiveGathering(player);
    awardGatheringXp(player, skillId, material.xpReward);
    return { status: "complete", material, skillId, xpAwarded: material.xpReward };
  }

  return {
    status: "progress",
    material,
    skillId,
    progress: player.activeGatherMs / Math.max(1, cleanWhole(player.activeGatherTotalMs)),
    remainingMs: Math.max(0, cleanWhole(player.activeGatherTotalMs) - cleanWhole(player.activeGatherMs))
  };
}
