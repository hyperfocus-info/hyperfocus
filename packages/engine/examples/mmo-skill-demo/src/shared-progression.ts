import { type WorldFactionId } from "./data/world-factions.ts";
import { currentUtcDateString, dailyQuestArcForDate, dailyQuestStepChoice, type DailyObjectiveType, type DailyQuestStep } from "./data/daily-quests.ts";
import { awardGatheringXp } from "./server/gatheringEngine.ts";
import { CONTRACTS, CONTRACT_FACTION_REWARDS, PEACE_NPC_ROLES, WORLD_EVENT_FACTION_REWARDS, type WorldEventDef } from "./shared-content-catalog.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity, type SkillName } from "./shared-contracts.ts";
import { factionRepItemId, factionReputation, grantFactionBundle, grantFactionRep, grantLootItem, isWorldFactionId, syncFactionReputationRewards } from "./shared-economy.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { addQuestBit, hasFlag, setItemQty, unlockAbility, unlockSlot } from "./shared-loadout-state.ts";
import { questZoneMatchesPlayer, refreshQuestProgress } from "./shared-quest-progress.ts";
import { clamp, cleanInputText, u16Ms } from "./shared-replication-projection.ts";
import { CONTRACT_RESTART_COOLDOWN_MS, activeWorldEvent, assignWorldEvent, nextWorldEvent } from "./shared-world-runtime.ts";

type DailyQuestProgressEvent = {
  kind: "gather" | "kill" | "space" | "escort" | "interact" | "zone";
  amount?: number;
  creatureId?: string;
  resourceKind?: ResourceEntity["kind"];
  role?: string;
  elite?: boolean;
  npcKind?: string;
};

const DAILY_GATHER_OBJECTIVES = new Set<DailyObjectiveType>(["EXTRACT", "FORAGING", "ARTIFACT_RETRIEVAL"]);

const DAILY_KILL_OBJECTIVES = new Set<DailyObjectiveType>(["COMBAT_ELITE", "ASSASSINATION", "PURGE", "TRAP_BOMBING", "BAITING"]);

const DAILY_INTERACT_OBJECTIVES = new Set<DailyObjectiveType>(["NEGOTIATION", "DELIVERY", "SMUGGLING", "TITHE_COLLECTION", "HEALING_SUPPORT", "CALIBRATION", "VAULT_CRACKING"]);

const DAILY_ESCORT_OBJECTIVES = new Set<DailyObjectiveType>(["ESCORT", "TAXI", "INFILTRATION", "DECOY"]);

const DAILY_ZONE_OBJECTIVES = new Set<DailyObjectiveType>(["RECONNAISSANCE", "SIGNAL_TOWER", "GUARD_DEFENSE", "SABOTAGE", "CORRUPTION_SEAL"]);

function adjustFactionRep(player: PlayerEntity, factionId: WorldFactionId, amount: number) {
  const next = Math.max(0, factionReputation(player, factionId) + Math.floor(amount));
  setItemQty(player, factionRepItemId(factionId), next);
  syncFactionReputationRewards(player);
}

function ensureDailyQuestState(player: PlayerEntity, dateString = currentUtcDateString()) {
  const needsReset = player.dailyQuestDate !== dateString;
  if (needsReset) {
    player.dailyQuestDate = dateString;
    player.dailyQuestStep = 0;
    player.dailyQuestProgress = 0;
    player.dailyQuestCompleted = false;
    player.dailyQuestResult = "";
  }
  const arc = dailyQuestArcForDate(player.dailyQuestDate || dateString);
  player.dailyQuestStep = clamp(Math.floor(player.dailyQuestStep || 0), 0, arc.steps.length);
  player.dailyQuestProgress = u16Ms(player.dailyQuestProgress || 0);
  player.dailyQuestCompleted = Boolean(player.dailyQuestCompleted || player.dailyQuestStep >= arc.steps.length);
  player.dailyQuestResult = cleanInputText(player.dailyQuestResult ?? "", 128);
  return arc;
}

function activeDailyQuestStep(player: PlayerEntity) {
  const arc = ensureDailyQuestState(player);
  if (player.dailyQuestCompleted) return undefined;
  return arc.steps[player.dailyQuestStep];
}

function dailyStepReady(player: PlayerEntity, step: DailyQuestStep) {
  return player.dailyQuestProgress >= step.targetCount;
}

function setDailyQuestResult(player: PlayerEntity, text: string) {
  player.dailyQuestResult = cleanInputText(text, 128);
}

function dailyQuestChoiceFlag(dateString: string, stepIndex: number, choiceId: string) {
  return `daily:${dateString}:${stepIndex}:${choiceId}`;
}

function dailyQuestEventMatches(player: PlayerEntity, step: DailyQuestStep, event: DailyQuestProgressEvent) {
  if (!questZoneMatchesPlayer(step.targetZone, player)) return false;
  switch (event.kind) {
    case "gather":
      return DAILY_GATHER_OBJECTIVES.has(step.objectiveType);
    case "kill":
      return DAILY_KILL_OBJECTIVES.has(step.objectiveType) && (!step.targetCreatureId || step.targetCreatureId === event.creatureId || event.elite === true || event.role === "boss");
    case "space":
      return step.objectiveType === "PLATFORMING";
    case "escort":
      return DAILY_ESCORT_OBJECTIVES.has(step.objectiveType);
    case "interact":
      return DAILY_INTERACT_OBJECTIVES.has(step.objectiveType);
    case "zone":
      return DAILY_ZONE_OBJECTIVES.has(step.objectiveType);
  }
}

function progressDailyQuest(player: PlayerEntity, event: DailyQuestProgressEvent) {
  const arc = ensureDailyQuestState(player);
  const step = arc.steps[player.dailyQuestStep];
  if (player.dailyQuestCompleted || !step || dailyStepReady(player, step)) return false;
  if (!dailyQuestEventMatches(player, step, event)) return false;
  const amount = Math.max(1, Math.floor(event.amount ?? 1));
  player.dailyQuestProgress = Math.min(step.targetCount, player.dailyQuestProgress + amount);
  if (dailyStepReady(player, step)) {
    setDailyQuestResult(player, "Objective secure. Choose who receives the leverage.");
  }
  return true;
}

function chooseDailyQuestBranch(player: PlayerEntity, choiceId: string) {
  const arc = ensureDailyQuestState(player);
  const step = arc.steps[player.dailyQuestStep];
  if (player.dailyQuestCompleted || !step || !dailyStepReady(player, step)) return false;
  const choice = dailyQuestStepChoice(arc, step.stepIndex, cleanInputText(choiceId, 40));
  if (!choice) return false;
  for (const [factionId, amount] of Object.entries(choice.reputationImpacts)) {
    if (isWorldFactionId(factionId)) adjustFactionRep(player, factionId, amount ?? 0);
  }
  grantLootItem(player, step.rewardMaterialId, 1);
  addQuestBit(player, dailyQuestChoiceFlag(arc.dateString, step.stepIndex, choice.id));
  setDailyQuestResult(player, choice.resultingText);
  player.dailyQuestStep = Math.min(arc.steps.length, player.dailyQuestStep + 1);
  player.dailyQuestProgress = 0;
  if (player.dailyQuestStep >= arc.steps.length) {
    player.dailyQuestCompleted = true;
    grantFactionRep(player, arc.primaryFaction, 180);
    addQuestBit(player, `daily:${arc.dateString}:complete`);
    setDailyQuestResult(player, `${arc.title} settled for today.`);
  }
  refreshQuestProgress(player);
  return true;
}

function hasAbility(player: PlayerEntity, abilityId: string) {
  return hasFlag(player.abilitySlots, abilityId);
}

function hasGear(player: PlayerEntity, gearId: string) {
  return hasFlag(player.equipment, gearId);
}

function isPeaceNpc(npc: NpcEntity) {
  return PEACE_NPC_ROLES.has(npc.role);
}

function levelForXp(xp: number) {
  return clamp(1 + Math.floor(Math.sqrt(Math.max(0, xp)) / 7), 1, 99);
}

function awardXp(player: PlayerEntity, skill: SkillName, amount: number) {
  if (skill === "combat") {
    player.combatXp += amount;
    player.combatLevel = levelForXp(player.combatXp);
  } else {
    const skillId = skill === "woodcutting" ? "lumberjacking" : skill;
    awardGatheringXp(player, skillId, amount);
  }
}

function rankForRenown(renown: number) {
  return clamp(1 + Math.floor(Math.max(0, renown) / 140), 1, 99);
}

function activeContract(player: PlayerEntity) {
  return CONTRACTS.find((contract) => contract.id === player.contractId);
}

function unlockedContracts(player: PlayerEntity) {
  const rank = Math.max(player.masteryRank, rankForRenown(player.renown));
  return CONTRACTS.filter((contract) => contract.minRank <= rank);
}

function assignNextContract(player: PlayerEntity) {
  const pool = unlockedContracts(player);
  const index = pool.length ? player.contractStreak % pool.length : 0;
  const contract = pool[index] ?? CONTRACTS[0];
  player.contractId = contract.id;
  player.contractKills = 0;
  return contract;
}

function syncRenownRewards(player: PlayerEntity) {
  const previousRank = player.masteryRank || 1;
  const nextRank = rankForRenown(player.renown);
  if (nextRank <= previousRank) return false;
  const rankGain = nextRank - previousRank;
  player.masteryRank = nextRank;
  player.maxHp = Math.min(180, player.maxHp + rankGain * 3);
  player.maxMana = Math.min(120, player.maxMana + rankGain * 2);
  player.hp = Math.min(player.maxHp, player.hp + rankGain * 8);
  player.mana = Math.min(player.maxMana, player.mana + rankGain * 6);
  if (nextRank >= 2) unlockAbility(player, "lmb-staff-bolt");
  if (nextRank >= 3) unlockAbility(player, "rmb-life-steal");
  if (nextRank >= 4) {
    unlockSlot(player, "Space");
    unlockAbility(player, "space-dash");
  }
  if (nextRank >= 5) {
    unlockSlot(player, "Q");
    unlockAbility(player, "q-knockback");
  }
  return true;
}

function recordContractKill(player: PlayerEntity, target: NpcEntity) {
  if (player.contractCooldownMs > 0) return;
  const contract = activeContract(player);
  const targetKinds: readonly string[] = contract?.targetKinds ?? [];
  if (!contract || !targetKinds.includes(target.kind)) return;
  const value = target.role === "boss" ? contract.targetKills : target.elite ? 2 : 1;
  player.contractKills = Math.min(contract.targetKills, player.contractKills + value);
}

function turnInContract(player: PlayerEntity) {
  const contract = activeContract(player) ?? assignNextContract(player);
  if (player.contractCooldownMs > 0) return false;
  if (player.contractKills < contract.targetKills) return false;
  player.gold += contract.gold + player.masteryRank * 4;
  player.renown += contract.renown;
  player.contractStreak += 1;
  awardXp(player, "combat", contract.combatXp);
  for (const [itemId, amount] of Object.entries(contract.supplies ?? {})) grantLootItem(player, itemId, amount);
  const factionReward = CONTRACT_FACTION_REWARDS[contract.id];
  if (factionReward) grantFactionBundle(player, factionReward.factionId, factionReward.rep, factionReward.supplies);
  syncRenownRewards(player);
  assignNextContract(player);
  player.contractCooldownMs = CONTRACT_RESTART_COOLDOWN_MS;
  player.berserkMs = Math.max(player.berserkMs, 1200);
  return true;
}

function applyWorldEventSupplies(player: PlayerEntity, supplies: WorldEventDef["supplies"]) {
  if (!supplies) return;
  for (const [itemId, amount] of Object.entries(supplies)) grantLootItem(player, itemId, amount);
}

function completeWorldEvent(state: MmoSkillDemoState, event: WorldEventDef) {
  const goal = Math.max(1, state.worldEventGoal || event.goal);
  state.worldEventPhase = "success";
  state.worldEventProgress = goal;
  state.worldEventGoal = goal;
  state.worldEventTimerMs = event.restMs;
  state.worldEventReward = event.rewardText;
  for (const player of entitiesOfType(state, "player")) {
    if (player.hp <= 0 || player.zoneId !== event.zoneId) continue;
    player.gold += event.gold;
    player.renown += event.renown;
    awardXp(player, event.xpSkill, event.xp);
    applyWorldEventSupplies(player, event.supplies);
    const factionReward = WORLD_EVENT_FACTION_REWARDS[event.id];
    if (factionReward) grantFactionBundle(player, factionReward.factionId, factionReward.rep, factionReward.supplies);
    syncRenownRewards(player);
    player.berserkMs = Math.max(player.berserkMs, 1500);
  }
}

function contributeWorldEvent(state: MmoSkillDemoState, player: PlayerEntity, amount: number) {
  if (amount <= 0 || state.worldEventPhase !== "active") return;
  const event = activeWorldEvent(state);
  if (player.zoneId !== event.zoneId) return;
  const goal = Math.max(1, state.worldEventGoal || event.goal);
  state.worldEventProgress = Math.min(goal, state.worldEventProgress + amount);
  if (state.worldEventProgress >= goal) completeWorldEvent(state, event);
}

function updateWorldEvent(state: MmoSkillDemoState, dt: number) {
  const event = activeWorldEvent(state);
  if (state.worldEventId !== event.id) assignWorldEvent(state, event);
  state.worldEventTimerMs = Math.max(0, state.worldEventTimerMs - Math.floor(dt * 1000));
  if (state.worldEventTimerMs > 0) return;
  if (state.worldEventPhase === "active") {
    state.worldEventPhase = "regrouping";
    state.worldEventProgress = Math.min(state.worldEventProgress, state.worldEventGoal);
    state.worldEventTimerMs = event.restMs;
    state.worldEventReward = "Event faded. Next rally soon.";
    return;
  }
  assignWorldEvent(state, nextWorldEvent(state));
}

export {
  DAILY_ESCORT_OBJECTIVES,
  DAILY_GATHER_OBJECTIVES,
  DAILY_INTERACT_OBJECTIVES,
  DAILY_KILL_OBJECTIVES,
  DAILY_ZONE_OBJECTIVES,
  activeContract,
  activeDailyQuestStep,
  adjustFactionRep,
  applyWorldEventSupplies,
  assignNextContract,
  awardXp,
  chooseDailyQuestBranch,
  completeWorldEvent,
  contributeWorldEvent,
  dailyQuestChoiceFlag,
  dailyQuestEventMatches,
  dailyStepReady,
  ensureDailyQuestState,
  hasAbility,
  hasGear,
  isPeaceNpc,
  levelForXp,
  progressDailyQuest,
  rankForRenown,
  recordContractKill,
  setDailyQuestResult,
  syncRenownRewards,
  turnInContract,
  unlockedContracts,
  updateWorldEvent
};

export type {
  DailyQuestProgressEvent
};
