import { getMmoSkillDemoAnchorTile } from "./data/world.ts";
import { bestiaryFor } from "./data/bestiary.ts";
import { worldFactionQuestlines } from "./data/world-quests.ts";
import { ABILITY_SLOTS } from "./shared-ability-catalog.ts";
import { addEnergy, canReachNpc, findNearest, isBazaarPressureZone, nearestNpc, playerHasTool, setCooldown, startEscort, teleportPlayer } from "./shared-combat-state.ts";
import { ALCHEMIST_CRAFT_RECIPES, BLACKSMITH_CRAFT_RECIPES, CURSED_STATUE_CRAFT_RECIPES, EXPANDED_CREATURE_SIGNATURE_DROPS, EXPANDED_CREATURE_ZONE_REWARDS, FOREMAN_CRAFT_RECIPES, type LootDropDef, type LootTableDef, MERCHANT_CRAFT_RECIPES, NPC_LOOT_TABLES, NPC_MATERIAL_REWARDS, ORE_GATHER_MATERIALS, TREE_GATHER_MATERIALS } from "./shared-content-catalog.ts";
import { type LootEntity, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type ResourceEntity, type RuntimeInput, type ZoneId } from "./shared-contracts.ts";
import { WORLD_CREATURE_BY_ID, applyFactionRewardUnlock, craftRequestedOrFirst, factionReputation, factionRewardFlag, grantFactionRep, grantLootItem, hasFactionReward } from "./shared-economy.ts";
import { acquireLootEntity, entitiesOfType, entityTypeCount, pruneEntityTypeToMax, removeMmoEntityForReuse } from "./shared-entity-registry.ts";
import { acceptQuest, addItem, addQuestBit, bankQty, depositInventoryItem, equipItem, grantItem, hasInventoryItem, hasQuestFlag, itemQty, spendItem, syncLegacyCooldown, unlockAbility, unlockSlot } from "./shared-loadout.ts";
import { activeContract, assignNextContract, awardXp, contributeWorldEvent, hasAbility, hasGear, isPeaceNpc, progressDailyQuest, recordContractKill, syncRenownRewards, turnInContract } from "./shared-progression.ts";
import { clamp, cleanInputText, u16Ms } from "./shared-replication-projection.ts";
import { PLAYER_RADIUS, catalogZoneForLocation } from "./shared-world-catalog.ts";
import { LOOT_INTERACTION_RADIUS, mmoSkillDemoMap, mmoSkillDemoNpcRespawnMs } from "./shared-world-runtime.ts";

function refreshQuestProgress(player: PlayerEntity) {
  const ashLogsTotal = itemQty(player, "ash-logs") + bankQty(player, "ash-logs");
  if (ashLogsTotal >= 5 && !hasQuestFlag(player, "first-cut")) addQuestBit(player, "first-cut-ready");
  if (hasQuestFlag(player, "first-cut") && ashLogsTotal >= 12 && !hasQuestFlag(player, "second-cut")) addQuestBit(player, "second-cut-ready");
  if (player.wolfKills >= 10 && !hasQuestFlag(player, "wolf-culling")) addQuestBit(player, "wolf-culling-ready");
  if (hasQuestFlag(player, "wolf-culling") && !hasQuestFlag(player, "final-cut")) addQuestBit(player, "final-cut-ready");
  if (itemQty(player, "iron-ore") >= 10) addQuestBit(player, "hidden-vein");
  if (bankQty(player, "iron-ore") >= 50 && !hasQuestFlag(player, "heavy-lifting")) addQuestBit(player, "heavy-lifting-ready");
  if (player.batKills >= 15 && !hasQuestFlag(player, "feathered-pests")) addQuestBit(player, "feathered-pests-ready");
  if (player.bazaarSurvivalMs >= 120000 && !hasQuestFlag(player, "silent-sands")) addQuestBit(player, "silent-sands-ready");
  ensureActiveMainQuest(player);
}

function nextStarterQuest(player: PlayerEntity) {
  if (!hasQuestFlag(player, "first-cut")) return "first-cut";
  if (!hasQuestFlag(player, "second-cut")) return "second-cut";
  if (!hasQuestFlag(player, "wolf-culling")) return "wolf-culling";
  if (!hasQuestFlag(player, "final-cut")) return "final-cut";
  return "";
}

function starterQuestSelectable(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId)) return false;
  if (questId === "first-cut") return true;
  if (questId === "second-cut") return hasQuestFlag(player, "first-cut");
  if (questId === "wolf-culling") return hasQuestFlag(player, "second-cut");
  if (questId === "final-cut") return hasQuestFlag(player, "wolf-culling");
  if (questId === "heavy-lifting") return playerHasTool(player, "pickaxe") || hasQuestFlag(player, "fast-travel-registered") || hasQuestFlag(player, "heavy-lifting-accepted");
  if (questId === "silent-sands") return hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || hasQuestFlag(player, "silent-sands-accepted") || isBazaarPressureZone(player.zoneId);
  return false;
}

function mainQuestSelectable(player: PlayerEntity, questId: string) {
  if (!questId || hasQuestFlag(player, questId)) return false;
  if (starterQuestSelectable(player, questId)) return true;
  return hasQuestFlag(player, `${questId}-accepted`);
}

function acceptedMainQuest(player: PlayerEntity) {
  for (const flag of Object.keys(player.questFlags ?? {})) {
    if (!flag.endsWith("-accepted")) continue;
    const questId = flag.slice(0, -"accepted".length - 1);
    if (mainQuestSelectable(player, questId)) return questId;
  }
  return "";
}

function defaultMainQuest(player: PlayerEntity) {
  return nextStarterQuest(player) || acceptedMainQuest(player) || "";
}

function ensureActiveMainQuest(player: PlayerEntity) {
  if (mainQuestSelectable(player, player.activeQuestId)) return;
  player.activeQuestId = defaultMainQuest(player);
  if (player.activeQuestId && !hasQuestFlag(player, `${player.activeQuestId}-accepted`) && starterQuestSelectable(player, player.activeQuestId)) {
    addQuestBit(player, `${player.activeQuestId}-accepted`);
  }
}

function selectMainQuest(player: PlayerEntity, rawQuestId: string) {
  const questId = cleanInputText(rawQuestId, 64);
  if (!mainQuestSelectable(player, questId)) return false;
  if (starterQuestSelectable(player, questId) && !hasQuestFlag(player, `${questId}-accepted`)) acceptQuest(player, questId);
  player.activeQuestId = questId;
  return true;
}

function completeQuest(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId) || !hasQuestFlag(player, `${questId}-ready`)) return false;
  acceptQuest(player, questId);
  addQuestBit(player, questId);
  switch (questId) {
    case "first-cut":
      grantItem(player, "iron-hatchet");
      unlockSlot(player, "RMB");
      unlockAbility(player, "rmb-reflect");
      unlockAbility(player, "rmb-crushing-blow");
      acceptQuest(player, "second-cut");
      if (player.activeQuestId === "first-cut") player.activeQuestId = "second-cut";
      break;
    case "second-cut":
      player.renown += 12;
      awardXp(player, "woodcutting", 34);
      syncRenownRewards(player);
      acceptQuest(player, "wolf-culling");
      if (player.activeQuestId === "second-cut") player.activeQuestId = "wolf-culling";
      break;
    case "wolf-culling":
      unlockSlot(player, "Space");
      unlockAbility(player, "space-jump");
      unlockAbility(player, "space-rush");
      acceptQuest(player, "final-cut");
      if (player.activeQuestId === "wolf-culling") player.activeQuestId = "final-cut";
      break;
    case "final-cut":
      grantItem(player, "captains-map");
      player.gold += 15;
      player.renown += 18;
      syncRenownRewards(player);
      acceptQuest(player, "lost-compass");
      if (player.activeQuestId === "final-cut") player.activeQuestId = "lost-compass";
      break;
    case "heavy-lifting":
      equipItem(player, "mining-boots");
      unlockAbility(player, "space-dash");
      break;
    case "feathered-pests":
      addItem(player, "speed-potion", 5);
      break;
    case "silent-sands":
      unlockSlot(player, "Q");
      unlockAbility(player, "q-stun");
      unlockAbility(player, "q-berserk");
      break;
  }
  player.berserkMs = Math.max(player.berserkMs, 900);
  ensureActiveMainQuest(player);
  return true;
}

type RuntimeWorldFactionQuestStep = (typeof worldFactionQuestlines)[number]["steps"][number];

type RuntimeWorldQuestObjective = RuntimeWorldFactionQuestStep["objectives"][number];

type RuntimeWorldQuestReward = RuntimeWorldFactionQuestStep["rewards"][number];

function npcKindFromQuestRef(npcId: string) {
  return npcId.split(".").pop() || npcId;
}

function questNpcMatches(npcId: string, npc: NpcEntity) {
  return npcKindFromQuestRef(npcId) === npc.kind;
}

function questZoneMatchesPlayer(zoneId: string, player: PlayerEntity) {
  if (zoneId === "ashwood-wilderness") return player.zoneId === "ashwood-wilderness" || player.zoneId === "ashwood";
  if (zoneId === "holy-reach") return player.zoneId === "holy-reach" || player.zoneId === "port-marrow";
  if (zoneId === "whisperwind-ascent") return player.zoneId === "whisperwind-ascent" || player.zoneId === "port-marrow";
  if (zoneId === "canaan-desert") return player.zoneId === "canaan-desert" || player.zoneId === "bazaar";
  if (zoneId === "void-rift") return player.zoneId === "void-rift" || player.zoneId === "bazaar";
  if (zoneId === "ashwood") return player.zoneId === "ashwood" || player.zoneId === "ashwood-wilderness";
  if (zoneId === "port-marrow") return player.zoneId === "port-marrow" || player.zoneId === "holy-reach" || player.zoneId === "whisperwind-ascent";
  if (zoneId === "bazaar") return isBazaarPressureZone(player.zoneId);
  return player.zoneId === zoneId;
}

function creatureProofCount(player: PlayerEntity, creatureId: string) {
  if (creatureId === "prowling-wolf" || creatureId === "ashwood-alpha") return player.wolfKills;
  if (creatureId === "iron-eye-bat" || creatureId === "calamity-bat") return player.batKills;
  const proof = EXPANDED_CREATURE_SIGNATURE_DROPS[creatureId]?.itemId;
  return proof ? itemQty(player, proof) + bankQty(player, proof) : 0;
}

function questObjectiveMet(player: PlayerEntity, npc: NpcEntity, objective: RuntimeWorldQuestObjective) {
  switch (objective.kind) {
    case "talk":
      return questNpcMatches(objective.npcId, npc);
    case "scout":
      return questZoneMatchesPlayer(objective.zoneId, player);
    case "gather":
    case "craft":
      return itemQty(player, objective.materialId) + bankQty(player, objective.materialId) >= objective.amount;
    case "deliver":
      return questNpcMatches(objective.recipientNpcId, npc) && itemQty(player, objective.materialId) + bankQty(player, objective.materialId) >= objective.amount;
    case "defeat":
      return creatureProofCount(player, objective.creatureId) >= objective.amount;
    case "survive":
      return questZoneMatchesPlayer(objective.zoneId, player) && (isBazaarPressureZone(player.zoneId) ? player.bazaarSurvivalMs >= objective.durationSeconds * 1000 : player.berserkMs > 0);
    case "attune":
      return !objective.materialId || itemQty(player, objective.materialId) + bankQty(player, objective.materialId) > 0;
  }
}

function applyWorldQuestReward(player: PlayerEntity, reward: RuntimeWorldQuestReward) {
  if (reward.kind === "reputation") {
    grantFactionRep(player, reward.factionId, reward.amount);
  } else if (reward.kind === "material") {
    grantLootItem(player, reward.materialId, reward.amount);
  } else if (!hasFactionReward(player, reward.rewardId)) {
    addQuestBit(player, factionRewardFlag(reward.rewardId));
    applyFactionRewardUnlock(player, reward.rewardId);
  }
}

function progressWorldFactionQuestline(player: PlayerEntity, npc: NpcEntity) {
  for (const questline of worldFactionQuestlines) {
    for (const step of questline.steps) {
      if (hasQuestFlag(player, step.id)) continue;
      const startsHere = questNpcMatches(questline.startsAtNpcId, npc);
      const resolvesHere = questNpcMatches(step.npcId, npc) || step.objectives.some((objective) => objective.kind === "talk" && questNpcMatches(objective.npcId, npc)) || step.objectives.some((objective) => objective.kind === "deliver" && questNpcMatches(objective.recipientNpcId, npc));
      if (!startsHere && !resolvesHere) continue;
      acceptQuest(player, step.id);
      if (!step.objectives.every((objective) => questObjectiveMet(player, npc, objective))) return true;
      addQuestBit(player, step.id);
      grantFactionRep(player, questline.factionId, step.pace === "capstone" ? 8 : 4);
      for (const reward of step.rewards) applyWorldQuestReward(player, reward);
      player.berserkMs = Math.max(player.berserkMs, 900);
      refreshQuestProgress(player);
      return true;
    }
  }
  return false;
}

function stableHash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function expandedCreatureReward(kind: string) {
  const creature = WORLD_CREATURE_BY_ID.get(kind);
  if (!creature) return undefined;
  const zoneId = catalogZoneForLocation(creature.location);
  const zoneReward = EXPANDED_CREATURE_ZONE_REWARDS[zoneId];
  if (!zoneReward) return undefined;
  const profile = bestiaryFor(kind).combat;
  const signature = EXPANDED_CREATURE_SIGNATURE_DROPS[kind];
  const rep = profile.class === "elite" ? 7 : profile.class === "bruiser" ? 3 : profile.class === "nimble" ? 2 : 1;
  const drops = signature ? [signature, ...zoneReward.drops] : zoneReward.drops;
  return { factionId: zoneReward.factionId, rep, drops };
}

function materialRewardForNpc(kind: string) {
  return NPC_MATERIAL_REWARDS[kind] ?? expandedCreatureReward(kind);
}

function lootTableForNpc(kind: string): LootTableDef | undefined {
  const table = NPC_LOOT_TABLES[kind];
  if (table) return table;
  const expanded = expandedCreatureReward(kind);
  if (!expanded) return undefined;
  const profile = bestiaryFor(kind).combat;
  const gold = profile.class === "elite" ? 22 : profile.class === "bruiser" ? 9 : profile.class === "nimble" ? 7 : 5;
  return {
    base: [{ itemId: "gold", amount: gold }, ...expanded.drops.map((drop) => ({ ...drop, chance: drop.chance ?? 0.45 }))],
    bonus: profile.class === "elite" ? [{ itemId: expanded.drops[0]?.itemId ?? "renown", amount: 1 }] : undefined
  };
}

function lootRoll(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity, drop: LootDropDef, index: number) {
  if (drop.chance === undefined || drop.chance >= 1) return true;
  const roll = stableHash(`${state.tick}:${player.id}:${target.id}:${drop.itemId}:${index}`) / 0xffffffff;
  return roll <= Math.max(0, drop.chance);
}

function grantNpcMaterialRewards(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  const reward = materialRewardForNpc(target.kind);
  if (!reward) return;
  const rep = target.role === "boss" ? reward.rep : target.elite ? Math.max(reward.rep, 4) : reward.rep;
  grantFactionRep(player, reward.factionId, rep);
  reward.drops.forEach((drop, index) => {
    if (lootRoll(state, player, target, drop, 100 + index)) grantLootItem(player, drop.itemId, drop.amount);
  });
}

function grantGatherMaterial(state: MmoSkillDemoState, player: PlayerEntity, target: ResourceEntity, amount: number) {
  const pool = target.kind === "ore" ? ORE_GATHER_MATERIALS : TREE_GATHER_MATERIALS;
  const index = stableHash(`${state.tick}:${target.id}:${player.id}:gather`) % pool.length;
  grantLootItem(player, pool[index], amount);
  grantFactionRep(player, target.kind === "ore" ? "ironcrag" : "oakhaven", target.kind === "ore" ? amount : Math.max(1, Math.floor(amount)));
  if (target.kind === "tree" && pool[index] === "dry-bramble-branch") grantFactionRep(player, "ashwood-glade", 1);
}

function spawnLootDrops(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  const table = lootTableForNpc(target.kind);
  if (!table) return;
  const drops = [...table.base, ...(target.elite || target.role === "boss" ? table.bonus ?? [] : [])];
  let placed = 0;
  drops.forEach((drop, index) => {
    if (!lootRoll(state, player, target, drop, index)) return;
    const angle = (index + 1) * 2.18 + stableHash(target.id) * 0.0001;
    const radius = 16 + (placed % 4) * 8;
    const id = `loot-${state.tick}-${entityTypeCount(state, "loot")}`.slice(0, 32);
    const loot = acquireLootEntity();
    loot.id = id;
    loot.itemId = drop.itemId;
    loot.amount = Math.max(1, Math.floor(drop.amount));
    loot.zoneId = target.zoneId;
    loot.x = clamp(target.x + Math.cos(angle) * radius, PLAYER_RADIUS, mmoSkillDemoMap.pixelWidth - PLAYER_RADIUS);
    loot.y = clamp(target.y + Math.sin(angle) * radius, PLAYER_RADIUS, mmoSkillDemoMap.pixelHeight - PLAYER_RADIUS);
    loot.ownerId = player.id;
    loot.expiresMs = target.role === "boss" ? 30000 : target.elite ? 22000 : 16000;
    loot.pickupRadius = target.role === "boss" ? 42 : 32;
    state.loots[id] = loot;
    placed += 1;
  });
  while (entityTypeCount(state, "loot") > 96) pruneEntityTypeToMax(state, "loot", 96);
}

function nearestLoot(player: PlayerEntity, state: MmoSkillDemoState, maxDistance = LOOT_INTERACTION_RADIUS) {
  return findNearest(
    player,
    entitiesOfType(state, "loot"),
    (loot) => loot.zoneId === player.zoneId && (!loot.ownerId || loot.ownerId === player.id),
    maxDistance
  );
}

function canPickupLoot(player: PlayerEntity, loot: LootEntity) {
  if (loot.zoneId !== player.zoneId) return false;
  if (loot.ownerId && loot.ownerId !== player.id) return false;
  return Math.hypot(loot.x - player.x, loot.y - player.y) <= Math.max(loot.pickupRadius, LOOT_INTERACTION_RADIUS);
}

function pickupLoot(state: MmoSkillDemoState, player: PlayerEntity, loot: LootEntity) {
  if (!canPickupLoot(player, loot)) return false;
  grantLootItem(player, loot.itemId, loot.amount);
  player.targetId = loot.id;
  removeMmoEntityForReuse(state, loot.id);
  return true;
}

function handleNpcKill(state: MmoSkillDemoState, player: PlayerEntity, target: NpcEntity) {
  target.respawnMs = mmoSkillDemoNpcRespawnMs(target);
  addEnergy(player, target.role === "boss" ? 35 : target.elite ? 20 : 10);
  recordContractKill(player, target);
  contributeWorldEvent(state, player, target.role === "boss" ? 3 : target.elite ? 2 : 1);
  grantNpcMaterialRewards(state, player, target);
  spawnLootDrops(state, player, target);
  progressDailyQuest(player, { kind: "kill", amount: target.role === "boss" ? 3 : target.elite ? 2 : 1, creatureId: target.kind, role: target.role, elite: target.elite });
  if (hasFactionReward(player, "obsidian-sanctum-soul-siphon")) {
    for (const slot of ABILITY_SLOTS) player.cooldowns[slot] = u16Ms(Math.max(0, (player.cooldowns[slot] ?? 0) - (target.role === "boss" ? 2400 : target.elite ? 1400 : 800)));
    syncLegacyCooldown(player);
  }
  if (target.kind === "prowling-wolf") player.wolfKills += 1;
  if (target.kind === "iron-eye-bat") player.batKills += 1;
  if (target.kind === "iron-core-golem") {
    addQuestBit(player, "breaking-golem");
    unlockSlot(player, "E");
    unlockAbility(player, "e-ultimate");
    player.dungeonBossKills += 1;
  }
  if (target.kind === "mirror-king") {
    addQuestBit(player, "kings-foil");
    player.prestigeTitle = "King's Foil";
    player.dungeonBossKills += 1;
  }
  refreshQuestProgress(player);
  if (state.roomKind === "dungeon-instance" && target.role === "boss") addQuestBit(player, "dungeon-clear");
}

const TRAVEL_ROUTES: Record<string, { anchorId: string; zoneId: ZoneId; requiresVoidReady?: boolean }> = {
  oakhaven: { anchorId: "oakhaven", zoneId: "ashwood" },
  ashwood: { anchorId: "oakhaven", zoneId: "ashwood" },
  "ashwood-wilderness": { anchorId: "ashwood-glade", zoneId: "ashwood" },
  "ashwood-glade": { anchorId: "ashwood-glade", zoneId: "ashwood" },
  ironcrag: { anchorId: "ironcrag", zoneId: "crags" },
  crags: { anchorId: "ironcrag", zoneId: "crags" },
  aetheria: { anchorId: "aetheria", zoneId: "port-marrow" },
  "holy-reach": { anchorId: "aetheria", zoneId: "port-marrow" },
  "port-marrow": { anchorId: "port-marrow", zoneId: "port-marrow" },
  "free-cove": { anchorId: "port-marrow", zoneId: "port-marrow" },
  bazaar: { anchorId: "sunken-bazaar", zoneId: "bazaar" },
  "sunken-bazaar": { anchorId: "sunken-bazaar", zoneId: "bazaar" },
  "canaan-desert": { anchorId: "sunken-bazaar", zoneId: "bazaar" },
  "void-rift": { anchorId: "void-rift", zoneId: "bazaar", requiresVoidReady: true },
  "obsidian-sanctum": { anchorId: "obsidian-sanctum", zoneId: "bazaar", requiresVoidReady: true },
  "high-reach-peaks": { anchorId: "high-reach-peaks", zoneId: "port-marrow" },
  "whisperwind-ascent": { anchorId: "high-reach-peaks", zoneId: "port-marrow" }
};

function routeKey(routeChoice: string) {
  return routeChoice
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

function readyForVoidRoute(player: PlayerEntity) {
  return hasInventoryItem(player, "void-resistant-cloak") || hasInventoryItem(player, "void-portal-key") || hasQuestFlag(player, "seal-the-rift") || player.masteryRank >= 4;
}

function teleportToRoute(player: PlayerEntity, route: { anchorId: string; zoneId: ZoneId; requiresVoidReady?: boolean }) {
  if (route.requiresVoidReady && !readyForVoidRoute(player)) return false;
  const anchor = getMmoSkillDemoAnchorTile(route.anchorId);
  teleportPlayer(player, anchor.x, anchor.y, route.zoneId);
  return true;
}

function defaultRouteForZone(player: PlayerEntity) {
  switch (player.zoneId) {
    case "ashwood":
      return "ironcrag";
    case "ashwood-wilderness":
      return "oakhaven";
    case "crags":
      return "holy-reach";
    case "holy-reach":
      return "port-marrow";
    case "port-marrow":
      return readyForVoidRoute(player) ? "void-rift" : "oakhaven";
    case "canaan-desert":
    case "bazaar":
      return "holy-reach";
    case "void-rift":
      return "canaan-desert";
    case "whisperwind-ascent":
      return "holy-reach";
    default:
      return "port-marrow";
  }
}

function travelWithCaptain(player: PlayerEntity, routeChoice = "") {
  const requested = routeKey(routeChoice);
  const route = requested ? TRAVEL_ROUTES[requested] : TRAVEL_ROUTES[defaultRouteForZone(player)];
  if (route && teleportToRoute(player, route)) return;
  const fallback = TRAVEL_ROUTES[defaultRouteForZone(player)] ?? TRAVEL_ROUTES["port-marrow"];
  teleportToRoute(player, fallback);
}

function interactWithRunnerKael(player: PlayerEntity, target: NpcEntity, input: RuntimeInput) {
  if (!hasQuestFlag(player, "silent-signal")) {
    acceptQuest(player, "silent-signal");
    addQuestBit(player, "silent-signal");
    player.gold += 8;
  }
  if (input.devText) {
    travelWithCaptain(player, input.devText);
    return;
  }
  const deepFissure = getMmoSkillDemoAnchorTile(player.zoneId === "ashwood-wilderness" ? "oakhaven" : "deep-fissure");
  startEscort(player, target, deepFissure.x, deepFissure.y, player.zoneId === "ashwood-wilderness" ? "ashwood" : "crags", 12000);
}

function interactWithNavigatorKai(player: PlayerEntity, target: NpcEntity, input: RuntimeInput) {
  if (!hasQuestFlag(player, "coastal-draught")) {
    acceptQuest(player, "coastal-draught");
    grantItem(player, "captains-map");
    addQuestBit(player, "coastal-draught");
  }
  if (input.devText) {
    travelWithCaptain(player, input.devText);
    return;
  }
  const route = player.zoneId === "whisperwind-ascent" ? getMmoSkillDemoAnchorTile("aetheria") : getMmoSkillDemoAnchorTile("port-marrow");
  startEscort(player, target, route.x + 2, route.y + 1, player.zoneId === "whisperwind-ascent" ? "holy-reach" : "port-marrow", 7000);
}

function interactWithNpc(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const target = input.targetId ? state.npcs[input.targetId] : nearestNpc(player, state, undefined, 78);
  if (!target || !isPeaceNpc(target) || !canReachNpc(player, target)) return false;
  player.targetId = target.id;
  progressWorldFactionQuestline(player, target);
  progressDailyQuest(player, { kind: "interact", amount: 1, npcKind: target.kind });
  switch (target.kind) {
    case "elder-rowan":
      if (!completeQuest(player, "first-cut") && !completeQuest(player, "second-cut") && !completeQuest(player, "wolf-culling") && !completeQuest(player, "final-cut")) {
        const nextQuest = nextStarterQuest(player);
        if (nextQuest) acceptQuest(player, nextQuest);
      }
      unlockAbility(player, "lmb-strike");
      break;
    case "miller-finn":
      acceptQuest(player, "wolf-pelt-quota");
      if (!hasQuestFlag(player, "wolf-pelt-quota") && player.wolfKills >= 10) {
        addQuestBit(player, "wolf-pelt-quota");
        equipItem(player, "leather-boots");
      }
      break;
    case "scout-elara":
      acceptQuest(player, "root-of-the-problem");
      if (!hasQuestFlag(player, "root-of-the-problem") && player.dungeonBossKills > 0) {
        addQuestBit(player, "root-of-the-problem");
        grantItem(player, "nature-core");
      }
      break;
    case "overseer-bale":
      acceptQuest(player, "great-starvation");
      if (!hasQuestFlag(player, "great-starvation") && bankQty(player, "ash-logs") >= 5) {
        addQuestBit(player, "great-starvation");
        grantItem(player, "pickaxe");
      }
      break;
    case "geologist-mira":
      acceptQuest(player, "luminous-depths");
      if (!hasQuestFlag(player, "luminous-depths") && (bankQty(player, "iron-ore") >= 5 || itemQty(player, "iron-ore") >= 5)) {
        addQuestBit(player, "luminous-depths");
        grantItem(player, "prism-shards");
      }
      break;
    case "runner-kael":
      interactWithRunnerKael(player, target, input);
      break;
    case "high-arcanist-vael":
      acceptQuest(player, hasQuestFlag(player, "forbidden-scripts") ? "seal-the-rift" : "forbidden-scripts");
      if (!hasQuestFlag(player, "forbidden-scripts") && hasInventoryItem(player, "ancient-scripts")) addQuestBit(player, "forbidden-scripts");
      if (!hasQuestFlag(player, "seal-the-rift") && hasInventoryItem(player, "nature-core") && hasInventoryItem(player, "prism-shards") && hasInventoryItem(player, "ancient-scripts")) {
        addQuestBit(player, "seal-the-rift");
        unlockAbility(player, "e-ultimate");
      }
      break;
    case "navigator-kai":
      interactWithNavigatorKai(player, target, input);
      break;
    case "alchemist-zora":
      acceptQuest(player, "void-resistance");
      if (craftRequestedOrFirst(player, ALCHEMIST_CRAFT_RECIPES, input.devText)) break;
      if (!hasQuestFlag(player, "void-resistance") && itemQty(player, "silk-thread") >= 3 && player.gold >= 20) {
        spendItem(player, "silk-thread", 3);
        player.gold -= 20;
        grantItem(player, "void-resistant-cloak");
        addQuestBit(player, "void-resistance");
        grantFactionRep(player, player.zoneId === "void-rift" ? "obsidian-sanctum" : "port-marrow", 4);
      }
      break;
    case "foreman-iron-will":
      if (!completeQuest(player, "heavy-lifting")) acceptQuest(player, "heavy-lifting");
      if (craftRequestedOrFirst(player, FOREMAN_CRAFT_RECIPES, input.devText)) break;
      if (!playerHasTool(player, "pickaxe") && player.gold >= 12) {
        player.gold -= 12;
        grantItem(player, "pickaxe");
        grantFactionRep(player, "ironcrag", 3);
      }
      break;
    case "banker-valerius":
      depositInventoryItem(player, "ash-logs");
      depositInventoryItem(player, "iron-ore");
      refreshQuestProgress(player);
      contributeWorldEvent(state, player, state.roomKind === "cottage-instance" ? 1 : 0);
      break;
    case "merchant-kaya":
    case "broker-rex":
    case "merchant-lynd":
    case "appraiser-chloe":
      if (craftRequestedOrFirst(player, MERCHANT_CRAFT_RECIPES, input.devText)) break;
      if (player.gold >= 10) {
        player.gold -= 10;
        addItem(player, "glade-berries", 2);
        addItem(player, "cinder-ale", 1);
        grantFactionRep(player, player.zoneId === "canaan-desert" ? "sunken-bazaar" : "port-marrow", 1);
      }
      break;
    case "apprentice-jinn":
      if (player.gold >= 6) {
        player.gold -= 6;
        addItem(player, "glade-berries", 3);
      }
      break;
    case "master-kael":
      completeQuest(player, "silent-sands");
      if (hasAbility(player, "q-stun") && player.gold >= 35) {
        player.gold -= 35;
        unlockAbility(player, "q-knockback");
      }
      break;
    case "inquisitor-joran":
    case "purifier-sarah":
      acceptQuest(player, "holy-purge");
      if (!hasQuestFlag(player, "holy-purge") && (factionReputation(player, "aetheria") >= 25 || hasInventoryItem(player, "ancient-script-scroll"))) {
        addQuestBit(player, "holy-purge");
        grantLootItem(player, "solos-emblem", 1);
        grantFactionRep(player, "aetheria", 6);
      }
      break;
    case "shaman-corvus":
    case "hunter-keera":
      acceptQuest(player, "outcast-hunt");
      if (!hasQuestFlag(player, "outcast-hunt") && (player.wolfKills >= 10 || factionReputation(player, "ashwood-glade") >= 20)) {
        addQuestBit(player, "outcast-hunt");
        grantLootItem(player, "feral-blood-vial", 1);
        grantFactionRep(player, "ashwood-glade", 6);
      }
      break;
    case "monastic-scholar-jin":
    case "guardian-tariq":
      acceptQuest(player, "wind-trial");
      if (!hasQuestFlag(player, "wind-trial") && (player.masteryRank >= 2 || factionReputation(player, "high-reach-peaks") >= 20)) {
        addQuestBit(player, "wind-trial");
        grantLootItem(player, "monastic-sage-tea", 1);
        grantFactionRep(player, "high-reach-peaks", 6);
        unlockAbility(player, "space-dash");
      }
      break;
    case "acolyte-lyros":
      acceptQuest(player, "rift-containment");
      if (!hasQuestFlag(player, "rift-containment") && (hasInventoryItem(player, "void-seed-shell") || factionReputation(player, "obsidian-sanctum") >= 20)) {
        addQuestBit(player, "rift-containment");
        grantLootItem(player, "void-portal-key", 1);
        grantFactionRep(player, "obsidian-sanctum", 7);
      }
      break;
    case "captain-marrow":
      travelWithCaptain(player, input.devText);
      if (!hasQuestFlag(player, "lost-compass")) {
        grantItem(player, "captains-map");
        addQuestBit(player, "lost-compass");
      }
      if (hasQuestFlag(player, "final-cut") && !hasQuestFlag(player, "fast-travel-registered")) {
        addQuestBit(player, "fast-travel-registered");
        acceptQuest(player, "heavy-lifting");
      }
      break;
    case "contract-board":
      if (!activeContract(player)) assignNextContract(player);
      else turnInContract(player);
      break;
    case "blacksmith-silas":
    case "blacksmith":
      if (craftRequestedOrFirst(player, BLACKSMITH_CRAFT_RECIPES, input.devText)) break;
      if (!hasGear(player, "iron-chest") && itemQty(player, "iron-ore") >= 8 && player.gold >= 25) {
        spendItem(player, "iron-ore", 8);
        player.gold -= 25;
        equipItem(player, "iron-chest");
        grantFactionRep(player, "ironcrag", 4);
      }
      if (!hasGear(player, "ring-focus") && itemQty(player, "silk-thread") >= 3 && player.gold >= 35) {
        spendItem(player, "silk-thread", 3);
        player.gold -= 35;
        equipItem(player, "ring-focus");
        grantFactionRep(player, "sunken-bazaar", 4);
      }
      break;
    case "cursed-statue":
      if (craftRequestedOrFirst(player, CURSED_STATUE_CRAFT_RECIPES, input.devText)) break;
      if (!hasInventoryItem(player, "cursed-idol") && player.hp > 40 && player.gold >= 15) {
        player.hp -= 20;
        player.gold -= 15;
        grantItem(player, "cursed-idol");
        unlockAbility(player, "space-ghost-walk");
        addQuestBit(player, "cursed-statue");
        grantFactionRep(player, "obsidian-sanctum", 5);
      }
      break;
    case "innkeeper-martha":
      player.homeZoneId = player.zoneId;
      contributeWorldEvent(state, player, state.roomKind === "cottage-instance" ? 1 : 0);
      break;
  }
  setCooldown(player, "interact");
  return true;
}

export {
  TRAVEL_ROUTES,
  acceptedMainQuest,
  applyWorldQuestReward,
  canPickupLoot,
  completeQuest,
  creatureProofCount,
  defaultMainQuest,
  defaultRouteForZone,
  ensureActiveMainQuest,
  expandedCreatureReward,
  grantGatherMaterial,
  grantNpcMaterialRewards,
  handleNpcKill,
  interactWithNpc,
  lootRoll,
  lootTableForNpc,
  mainQuestSelectable,
  materialRewardForNpc,
  nearestLoot,
  nextStarterQuest,
  npcKindFromQuestRef,
  pickupLoot,
  progressWorldFactionQuestline,
  questNpcMatches,
  questObjectiveMet,
  questZoneMatchesPlayer,
  readyForVoidRoute,
  refreshQuestProgress,
  routeKey,
  selectMainQuest,
  spawnLootDrops,
  stableHash,
  starterQuestSelectable,
  teleportToRoute,
  travelWithCaptain
};

export type {
  RuntimeWorldFactionQuestStep,
  RuntimeWorldQuestObjective,
  RuntimeWorldQuestReward
};
