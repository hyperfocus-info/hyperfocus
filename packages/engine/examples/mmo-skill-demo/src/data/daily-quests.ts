import { worldFactionIds, worldFactions, type WorldFactionId } from "./world-factions.ts";
import { worldCraftingMaterials, type WorldCraftingMaterialId } from "./world-materials.ts";
import { worldFactionQuestlines, type WorldFactionQuestStep, type WorldProgressionBand } from "./world-quests.ts";
import type { RegionZoneId } from "./world.ts";

export const dailyObjectiveTypes = [
  "ESCORT",
  "EXTRACT",
  "INFILTRATION",
  "DECOY",
  "PLATFORMING",
  "TAXI",
  "GUARD_DEFENSE",
  "SIGNAL_TOWER",
  "COMBAT_ELITE",
  "ARTIFACT_RETRIEVAL",
  "TRAP_BOMBING",
  "PURGE",
  "ASSASSINATION",
  "DELIVERY",
  "SABOTAGE",
  "RECONNAISSANCE",
  "NEGOTIATION",
  "CORRUPTION_SEAL",
  "HEALING_SUPPORT",
  "FORAGING",
  "SMUGGLING",
  "BAITING",
  "CALIBRATION",
  "VAULT_CRACKING",
  "TITHE_COLLECTION"
] as const;

export type DailyObjectiveType = (typeof dailyObjectiveTypes)[number];

export type DailyQuestChoice = {
  id: string;
  text: string;
  alignsWith: WorldFactionId;
  reputationImpacts: Partial<Record<WorldFactionId, number>>;
  resultingText: string;
};

export type DailyQuestStep = {
  stepIndex: number;
  title: string;
  objectiveType: DailyObjectiveType;
  instructions: string;
  targetCount: number;
  targetZone: RegionZoneId;
  anchorId: string;
  progressionBand?: WorldProgressionBand;
  masteryGate?: string;
  progressionPayoff?: string;
  rewardMaterialId: WorldCraftingMaterialId;
  targetCreatureId?: string;
  targetMaterialId?: WorldCraftingMaterialId;
  choices: readonly [DailyQuestChoice, DailyQuestChoice, DailyQuestChoice];
};

export type DailyQuestArc = {
  dateString: string;
  title: string;
  primaryFaction: WorldFactionId;
  rivalFaction: WorldFactionId;
  steps: readonly [DailyQuestStep, DailyQuestStep, DailyQuestStep, ...DailyQuestStep[]];
};

type Prng = () => number;
type Questline = (typeof worldFactionQuestlines)[number];
type QuestStep = WorldFactionQuestStep;
type QuestObjective = QuestStep["objectives"][number];

const journeyLabels = ["Call", "Crossing", "Trial", "Abyss", "Return"] as const;
const materialIds: WorldCraftingMaterialId[] = worldCraftingMaterials.map((material) => material.id);
const factionById = Object.fromEntries(worldFactions.map((faction) => [faction.id, faction]));

export function currentUtcDateString(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hashDateSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createDailyQuestPrng(seed: string): Prng {
  let state = hashDateSeed(seed) || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick<T>(items: readonly T[], prng: Prng) {
  return items[Math.floor(prng() * items.length) % items.length]!;
}

function factionLabel(factionId: WorldFactionId) {
  const faction = factionById[factionId];
  return faction?.townName ?? factionId;
}

function factionQuestline(factionId: WorldFactionId) {
  return worldFactionQuestlines.find((questline) => questline.factionId === factionId) ?? worldFactionQuestlines[0]!;
}

function rivalFactionFor(primary: WorldFactionId, prng: Prng) {
  const faction = factionById[primary];
  const enemies = faction?.enemies.map((relation) => relation.id) ?? [];
  const pool = enemies.length ? enemies : worldFactionIds.filter((id) => id !== primary);
  return pick(pool, prng);
}

function objectiveTypeFor(objective: QuestObjective | undefined, stepIndex: number, prng: Prng): DailyObjectiveType {
  if (!objective) return pick(dailyObjectiveTypes, prng);
  if (objective.kind === "talk") return stepIndex === 0 ? "NEGOTIATION" : pick(["NEGOTIATION", "TITHE_COLLECTION", "HEALING_SUPPORT"], prng);
  if (objective.kind === "scout") return pick(["RECONNAISSANCE", "INFILTRATION", "SIGNAL_TOWER", "SABOTAGE"], prng);
  if (objective.kind === "gather") return pick(["FORAGING", "EXTRACT", "ARTIFACT_RETRIEVAL"], prng);
  if (objective.kind === "defeat") return objective.amount <= 1 ? pick(["COMBAT_ELITE", "ASSASSINATION"], prng) : pick(["PURGE", "BAITING", "TRAP_BOMBING"], prng);
  if (objective.kind === "deliver") return pick(["DELIVERY", "SMUGGLING", "TAXI"], prng);
  if (objective.kind === "craft") return pick(["CALIBRATION", "VAULT_CRACKING"], prng);
  if (objective.kind === "survive") return pick(["GUARD_DEFENSE", "DECOY"], prng);
  return "CORRUPTION_SEAL";
}

function objectiveTargetCount(objectiveType: DailyObjectiveType, objective: QuestObjective | undefined, prng: Prng) {
  if (objective?.kind === "gather" || objective?.kind === "defeat" || objective?.kind === "deliver" || objective?.kind === "craft") {
    return Math.max(1, Math.min(8, objective.amount));
  }
  if (objectiveType === "PLATFORMING") return 3 + Math.floor(prng() * 4);
  if (["RECONNAISSANCE", "INFILTRATION", "SIGNAL_TOWER", "GUARD_DEFENSE", "DECOY", "SABOTAGE", "CORRUPTION_SEAL"].includes(objectiveType)) {
    return 8 + Math.floor(prng() * 8);
  }
  return 2 + Math.floor(prng() * 4);
}

function objectiveMaterial(objective: QuestObjective | undefined) {
  if (!objective) return undefined;
  if (objective.kind === "gather" || objective.kind === "deliver" || objective.kind === "craft" || objective.kind === "attune") return objective.materialId;
  return undefined;
}

function objectiveCreature(objective: QuestObjective | undefined) {
  return objective?.kind === "defeat" ? objective.creatureId : undefined;
}

function stepInstruction(_primary: WorldFactionId, rival: WorldFactionId, source: QuestStep, objective: QuestObjective | undefined, rewardMaterialId: WorldCraftingMaterialId) {
  const note = objective?.note || source.summary;
  const material = worldCraftingMaterials.find((entry) => entry.id === rewardMaterialId);
  return `${note} Bring back ${material?.name ?? rewardMaterialId} proof before ${factionLabel(rival)} can claim the outcome.`;
}

function payoffText(source: QuestStep) {
  return source.progressionPayoff ? ` Payoff: ${source.progressionPayoff}` : "";
}

function choicesFor(primary: WorldFactionId, rival: WorldFactionId, source: QuestStep, stepIndex: number): readonly [DailyQuestChoice, DailyQuestChoice, DailyQuestChoice] {
  const primaryName = factionLabel(primary);
  const rivalName = factionLabel(rival);
  const payoff = payoffText(source);
  return [
    {
      id: `step-${stepIndex}-primary`,
      text: `Back ${primaryName}`,
      alignsWith: primary,
      reputationImpacts: { [primary]: 140, [rival]: -70 },
      resultingText: `${source.title}: ${primaryName} proof secured.${payoff}`
    },
    {
      id: `step-${stepIndex}-rival`,
      text: `Bargain with ${rivalName}`,
      alignsWith: rival,
      reputationImpacts: { [rival]: 120, [primary]: -60 },
      resultingText: `${source.title}: ${rivalName} counterclaim secured.${payoff}`
    },
    {
      id: `step-${stepIndex}-compact`,
      text: "Force a compact",
      alignsWith: primary,
      reputationImpacts: { [primary]: 70, [rival]: 70 },
      resultingText: `${source.title}: compact secured.${payoff}`
    }
  ];
}

function buildStep(dateString: string, questline: Questline, primary: WorldFactionId, rival: WorldFactionId, stepIndex: number, prng: Prng): DailyQuestStep {
  const source: QuestStep = questline.steps[stepIndex % questline.steps.length]!;
  const objective = source.objectives[Math.floor(prng() * source.objectives.length)] ?? source.objectives[0];
  const objectiveType = stepIndex === 1 && prng() > 0.65 ? "PLATFORMING" : objectiveTypeFor(objective, stepIndex, prng);
  const rewardMaterialId = materialIds[(hashDateSeed(`${dateString}:${stepIndex}:${source.id}`) + Math.floor(prng() * materialIds.length)) % materialIds.length]!;
  return {
    stepIndex,
    title: `${journeyLabels[Math.min(stepIndex, journeyLabels.length - 1)]}: ${source.title}`,
    objectiveType,
    instructions: stepInstruction(primary, rival, source, objective, rewardMaterialId),
    targetCount: objectiveTargetCount(objectiveType, objective, prng),
    targetZone: source.zoneId,
    anchorId: source.anchorId,
    progressionBand: source.progressionBand,
    masteryGate: source.masteryGate,
    progressionPayoff: source.progressionPayoff,
    rewardMaterialId,
    targetCreatureId: objectiveCreature(objective),
    targetMaterialId: objectiveMaterial(objective),
    choices: choicesFor(primary, rival, source, stepIndex)
  };
}

const dailyQuestCache = new Map<string, DailyQuestArc>();

function hasAtLeastThreeSteps(steps: DailyQuestStep[]): steps is [DailyQuestStep, DailyQuestStep, DailyQuestStep, ...DailyQuestStep[]] {
  return steps.length >= 3;
}

export function dailyQuestArcForDate(dateString: string): DailyQuestArc {
  let cached = dailyQuestCache.get(dateString);
  if (cached) return cached;

  const prng = createDailyQuestPrng(dateString);
  const primaryFaction = pick(worldFactionIds, prng);
  const rivalFaction = rivalFactionFor(primaryFaction, prng);
  const questline = factionQuestline(primaryFaction);
  const stepCount = 3 + Math.floor(prng() * 3);
  const steps = Array.from({ length: stepCount }, (_, index) => buildStep(dateString, questline, primaryFaction, rivalFaction, index, prng));
  if (!hasAtLeastThreeSteps(steps)) throw new Error(`Daily quest arc requires at least three steps, received ${steps.length}.`);

  cached = {
    dateString,
    title: `${factionLabel(primaryFaction)}: ${questline.title}`,
    primaryFaction,
    rivalFaction,
    steps
  };
  dailyQuestCache.set(dateString, cached);
  return cached;
}

export function dailyQuestStepChoice(arc: DailyQuestArc, stepIndex: number, choiceId: string) {
  return arc.steps[stepIndex]?.choices.find((choice) => choice.id === choiceId);
}
