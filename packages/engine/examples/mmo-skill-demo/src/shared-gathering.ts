import { type CollisionKernel } from "@hyperfocus/engine";
import { type WorldFactionId } from "./data/world-factions.ts";
import { spawnTransientEffect } from "@hyperfocus/engine/server";
import { clearActiveGathering, ensureGatheringProgress, gatheringSkillForLegacyAction, materialForGatheringNode, startGatheringInteraction, tickActiveGathering, type GatheringAction } from "./server/gatheringEngine.ts";
import { resolveGatheringHazard, spawnGatheringHazard } from "./server/hazardEngine.ts";
import { type GatheringSkillId } from "./shared/skills.ts";
import { type GatherableMaterial } from "./shared/materials.ts";
import { HAZARD_SIZE } from "./data/entity-sizes.ts";
import { ACTION_COOLDOWN_MS, GATHER_BASE_COOLDOWN_MS, GATHER_FASTEST_COOLDOWN_MS, GATHER_MAX_LEVEL, GATHER_MIN_LEVEL } from "./shared-ability-catalog.ts";
import { findNearest, setCooldown } from "./shared-combat-state.ts";
import { type MmoSkillDemoState, type PlayerEntity, type ResourceEntity } from "./shared-contracts.ts";
import { grantFactionRep } from "./shared-economy.ts";
import { entitiesOfType } from "./shared-entity-registry.ts";
import { addItem, syncLegacyCooldown } from "./shared-loadout.ts";
import { contributeWorldEvent, progressDailyQuest } from "./shared-progression.ts";
import { grantGatherMaterial, refreshQuestProgress } from "./shared-quests.ts";
import { clamp, cleanItemId, u16Ms, u32Ms } from "./shared-replication-projection.ts";
import { rectAround } from "./shared-world-physics.ts";

function gatherCooldownMsForLevel(level: number) {
  const cappedLevel = clamp(Math.floor(level || GATHER_MIN_LEVEL), GATHER_MIN_LEVEL, GATHER_MAX_LEVEL);
  const progress = (cappedLevel - GATHER_MIN_LEVEL) / (GATHER_MAX_LEVEL - GATHER_MIN_LEVEL);
  return Math.round(GATHER_BASE_COOLDOWN_MS - (GATHER_BASE_COOLDOWN_MS - GATHER_FASTEST_COOLDOWN_MS) * progress);
}

function readableGatheringToken(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableGatheringTools(tools: readonly string[] = []) {
  const toolSet = new Set(tools);
  if (toolSet.has("training-hatchet") && toolSet.has("iron-hatchet")) return "Hatchet";
  return tools.map(readableGatheringToken).join(" / ") || "Tool";
}

function gatheringStartFailureText(reason: string, details: { missingTools?: readonly string[] } = {}) {
  switch (reason) {
    case "level-too-low":
      return "Too low level";
    case "missing-tool":
      return `Need ${readableGatheringTools(details.missingTools)}`;
    case "depleted":
      return "Depleted";
    case "wrong-zone":
      return "Wrong zone";
    case "out-of-range":
      return "Too far";
    case "unknown-material":
      return "Unknown material";
    case "unknown-skill":
      return "Unknown skill";
    case "wrong-node":
      return "Wrong node";
    case "missing-node":
      return "No node";
    default:
      return "Cannot gather";
  }
}

function gatheringAbortFailureText(reason: string) {
  switch (reason) {
    case "missing-node":
      return "Node gone";
    case "depleted":
      return "Depleted";
    case "wrong-zone":
      return "Wrong zone";
    case "moved":
      return "Moved";
    case "damaged":
      return "Interrupted";
    case "out-of-range":
      return "Too far";
    default:
      return "Gather stopped";
  }
}

function spawnGatheringFailureText(state: MmoSkillDemoState, target: { zoneId: string; x: number; y: number }, text: string) {
  spawnTransientEffect(
    state.effects,
    {
      id: `gather-fail-${state.tick}-${state.effects.length}`.slice(0, 32),
      kind: "aoe",
      zoneId: target.zoneId,
      x: target.x,
      y: target.y - 24,
      toX: target.x,
      toY: target.y - 24,
      radius: HAZARD_SIZE.combatTextRadius,
      lifetimeMs: 720,
      effectKind: "damage",
      text,
      pulse: 1,
      priority: 74
    },
    256
  );
}

function setGatheringFailureCooldown(player: PlayerEntity, cooldownAction: keyof typeof ACTION_COOLDOWN_MS) {
  setCooldown(player, cooldownAction);
  player.cooldowns[cooldownAction] = u16Ms(Math.min(500, ACTION_COOLDOWN_MS[cooldownAction]));
  syncLegacyCooldown(player);
}

function gatherResource(
  state: MmoSkillDemoState,
  kernel: CollisionKernel,
  player: PlayerEntity,
  action: GatheringAction,
  targetId: string,
  cooldownAction: keyof typeof ACTION_COOLDOWN_MS = action === "interact" ? "interact" : action
) {
  const wantedKind = action === "mine" ? "ore" : action === "woodcut" ? "tree" : undefined;
  const fallbackSkill = gatheringSkillForLegacyAction(action);
  const target = targetId
    ? state.resources[targetId]
    : findNearest(
      player,
      entitiesOfType(state, "resource"),
      (node) => !node.depleted && (!wantedKind || node.kind === wantedKind),
      58
    );
  if (!target) {
    clearActiveGathering(player);
    if (targetId || action !== "interact") {
      spawnGatheringFailureText(state, player, gatheringStartFailureText("missing-node"));
      setGatheringFailureCooldown(player, cooldownAction);
    }
    return false;
  }
  if (wantedKind && target.kind !== wantedKind) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("wrong-node"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  if (target.depleted) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("depleted"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  if (target.zoneId !== player.zoneId) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("wrong-zone"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  const targetRect = rectAround(target, 30, 30);
  if (!kernel.testCircleRectOverlap(player.x, player.y, 80, targetRect.x, targetRect.y, targetRect.w, targetRect.h)) {
    clearActiveGathering(player);
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText("out-of-range"));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }

  const material = materialForGatheringNode(target, fallbackSkill);
  const started = startGatheringInteraction(player, target, { action, material });
  if (!started.ok) {
    player.targetId = target.id;
    spawnGatheringFailureText(state, target, gatheringStartFailureText(started.reason, { missingTools: started.missingTools }));
    setGatheringFailureCooldown(player, cooldownAction);
    return false;
  }
  player.momentumX = 0;
  player.momentumY = 0;
  player.action = target.kind === "ore" ? "mine" : "woodcut";
  player.targetId = target.id;
  setCooldown(player, cooldownAction);
  const level = player.gatheringLevels?.[started.skillId] ?? 1;
  player.cooldowns[cooldownAction] = u16Ms(Math.min(500, gatherCooldownMsForLevel(level)));
  syncLegacyCooldown(player);
  return true;
}

function itemIdForGatherableMaterial(material: Pick<GatherableMaterial, "name">) {
  return cleanItemId(material.name);
}

function factionForGatheringSkill(skillId: GatheringSkillId, fallback: WorldFactionId = "port-marrow"): WorldFactionId {
  switch (skillId) {
    case "lumberjacking":
    case "foraging":
    case "sap-tapping":
      return "oakhaven";
    case "mining":
    case "quarrying":
    case "gemology":
      return "ironcrag";
    case "fishing":
    case "scavenging":
    case "dredging":
      return "port-marrow";
    case "essence-siphoning":
    case "spore-hunting":
      return "obsidian-sanctum";
    case "apiculture":
    case "crop-harvesting":
    case "archaeology":
      return "aetheria";
    case "skinning":
    case "hunting":
      return "ashwood-glade";
    default:
      return fallback;
  }
}

function completeGatheringResource(state: MmoSkillDemoState, player: PlayerEntity, target: ResourceEntity, material: GatherableMaterial, skillId: GatheringSkillId) {
  const level = player.gatheringLevels?.[skillId] ?? 1;
  const yieldAmount = 1 + Math.floor(level / 25);
  target.hp = 0;
  target.depleted = true;
  target.respawnMs = u32Ms(9000 + material.tier * 2200);
  if (target.kind === "ore") addItem(player, "iron-ore", yieldAmount);
  else if (target.kind === "tree") addItem(player, "ash-logs", yieldAmount);
  addItem(player, itemIdForGatherableMaterial(material), yieldAmount);
  grantGatherMaterial(state, player, target, yieldAmount);
  grantFactionRep(player, factionForGatheringSkill(skillId), Math.max(1, material.tier));
  contributeWorldEvent(state, player, Math.max(1, material.tier));
  refreshQuestProgress(player);
  progressDailyQuest(player, { kind: "gather", amount: yieldAmount, resourceKind: target.kind });

  const hazard = resolveGatheringHazard(material, { player, node: target, tick: state.tick });
  if (hazard.triggered) {
    spawnGatheringHazard(state, hazard);
    for (const cue of hazard.soundCues) {
      spawnTransientEffect(
        state.effects,
        {
          id: `gather-cue-${state.tick}-${cue.id}`.slice(0, 32),
          kind: "aoe",
          zoneId: player.zoneId,
          x: cue.x,
          y: cue.y,
          toX: cue.x,
          toY: cue.y,
          radius: u16Ms(cue.radius),
          lifetimeMs: 1400,
          effectKind: cue.id.slice(0, 16),
          text: hazard.message.slice(0, 64),
          pulse: 1,
          priority: cue.priority
        },
        256
      );
    }
  }
}

function updateGatheringInteractions(state: MmoSkillDemoState, dt: number) {
  for (const player of entitiesOfType(state, "player")) {
    ensureGatheringProgress(player);
    const node = player.activeGatherNodeId ? state.resources[player.activeGatherNodeId] : undefined;
    const result = tickActiveGathering(player, node, dt);
    if (result.status === "aborted") spawnGatheringFailureText(state, node ?? player, gatheringAbortFailureText(result.reason));
    if (result.status === "complete" && node) completeGatheringResource(state, player, node, result.material, result.skillId);
  }
}

export {
  completeGatheringResource,
  factionForGatheringSkill,
  gatherCooldownMsForLevel,
  gatherResource,
  gatheringAbortFailureText,
  gatheringStartFailureText,
  itemIdForGatherableMaterial,
  readableGatheringToken,
  readableGatheringTools,
  setGatheringFailureCooldown,
  spawnGatheringFailureText,
  updateGatheringInteractions
};
