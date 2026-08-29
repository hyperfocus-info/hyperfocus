import { worldCreatureDefinitions } from "./data/world-creatures.ts";
import { worldFactions, type WorldFactionId } from "./data/world-factions.ts";
import { worldCraftingRecipes as authoredWorldCraftingRecipes } from "./data/world-recipes.ts";
import { worldReputationRewards } from "./data/world-reputation.ts";
import { craftRecipeById as craftAuthoredProgressionRecipe } from "./server/craftingEngine.ts";
import { canReachNpc, nearestNpc } from "./shared-combat-queries.ts";
import { MARKET_TRADE_ITEMS } from "./shared-content-catalog.ts";
import { type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type RuntimeInput } from "./shared-contracts.ts";
import { addItem, addQuestBit, canonicalItemId, equipItem, grantItem, hasGear, hasInventoryItem, hasQuestFlag, itemQty, setItemQty, spendItem, unlockAbility } from "./shared-loadout-state.ts";
import { refreshQuestProgress } from "./shared-quest-progress.ts";
import { syncRenownRewards } from "./shared-renown-state.ts";
import { cleanItemId } from "./shared-replication-projection.ts";

const FACTION_REPUTATION_THRESHOLDS = [0, 25, 75, 150, 300] as const;

const WORLD_FACTION_ID_SET = new Set<string>(worldFactions.map((faction) => faction.id));

const WORLD_CREATURE_BY_ID = new Map<string, (typeof worldCreatureDefinitions)[number]>(worldCreatureDefinitions.map((creature) => [creature.id, creature]));

function adjustFactionRep(player: PlayerEntity, factionId: WorldFactionId, amount: number) {
  const next = Math.max(0, factionReputation(player, factionId) + Math.floor(amount));
  setItemQty(player, factionRepItemId(factionId), next);
  syncFactionReputationRewards(player);
}

type WorldCraftRecipe = {
  id: string;
  costs?: Record<string, number>;
  goldCost?: number;
  goldReward?: number;
  hpCost?: number;
  outputItemId?: string;
  outputAmount?: number;
  equip?: boolean;
  unique?: boolean;
  questFlag?: string;
  factionId?: WorldFactionId;
  rep?: number;
};

function isWorldFactionId(value: string): value is WorldFactionId {
  return WORLD_FACTION_ID_SET.has(value);
}

function factionRepItemId(factionId: WorldFactionId) {
  return `rep-${factionId}`;
}

function factionIdForRepItem(itemId: string): WorldFactionId | undefined {
  const canonicalId = canonicalItemId(itemId);
  if (!canonicalId.startsWith("rep-")) return undefined;
  const factionId = canonicalId.slice(4);
  return isWorldFactionId(factionId) ? factionId : undefined;
}

function factionRewardFlag(rewardId: string) {
  return `reward-${rewardId}`;
}

function hasFactionReward(player: PlayerEntity, rewardId: string) {
  return hasQuestFlag(player, factionRewardFlag(rewardId));
}

function factionReputation(player: PlayerEntity, factionId: WorldFactionId) {
  return itemQty(player, factionRepItemId(factionId));
}

function factionReputationLevel(player: PlayerEntity, factionId: WorldFactionId) {
  const rep = factionReputation(player, factionId);
  let level = 0;
  for (let index = 1; index < FACTION_REPUTATION_THRESHOLDS.length; index += 1) {
    if (rep >= FACTION_REPUTATION_THRESHOLDS[index]) level = index;
  }
  return level;
}

function applyFactionRewardUnlock(player: PlayerEntity, rewardId: string) {
  switch (rewardId) {
    case "oakhaven-druid-guild-entry":
      grantItem(player, "elderwood-ash");
      break;
    case "oakhaven-barkskin-infusion":
      player.maxHp = Math.min(180, player.maxHp + 5);
      player.hp = Math.min(player.maxHp, player.hp + 12);
      break;
    case "ironcrag-smelter-permit":
      grantItem(player, "soot-forge-coke");
      break;
    case "ironcrag-blast-plated-boots":
      equipItem(player, "mining-boots");
      break;
    case "aetheria-sanctuary-access":
      grantItem(player, "ancient-script-scroll");
      break;
    case "aetheria-smite-rune":
      unlockAbility(player, "staff-consecration");
      break;
    case "port-marrow-private-dock":
      player.homeZoneId = "port-marrow";
      grantItem(player, "cove-salvage-box");
      break;
    case "sunken-bazaar-backroom-access":
      grantItem(player, "bazaar-glass-bottle");
      break;
    case "obsidian-sanctum-abyssal-shift":
      grantItem(player, "void-portal-key");
      break;
    case "obsidian-sanctum-soul-siphon":
      unlockAbility(player, "space-ghost-walk");
      break;
    case "ashwood-glade-hunter-pathing":
      grantItem(player, "outcast-hunt-skull");
      break;
    case "high-reach-peaks-wind-leap":
      grantItem(player, "ascetic-jade-stone");
      unlockAbility(player, "space-dash");
      break;
    case "high-reach-peaks-nirvanic-breath":
      unlockAbility(player, "space-dash");
      unlockAbility(player, "space-ghost-walk");
      break;
  }
}

function syncFactionReputationRewards(player: PlayerEntity) {
  let changed = false;
  for (const reward of worldReputationRewards) {
    if (factionReputationLevel(player, reward.factionId) < reward.tierLevel) continue;
    const flag = factionRewardFlag(reward.id);
    if (hasQuestFlag(player, flag)) continue;
    addQuestBit(player, flag);
    applyFactionRewardUnlock(player, reward.id);
    changed = true;
  }
  return changed;
}

function grantFactionRep(player: PlayerEntity, factionId: WorldFactionId, amount: number) {
  const value = Math.max(0, Math.floor(amount));
  if (value <= 0) return;
  adjustFactionRep(player, factionId, value);
  syncFactionReputationRewards(player);
}

function grantFactionBundle(player: PlayerEntity, factionId: WorldFactionId, rep: number, supplies?: Record<string, number>) {
  grantFactionRep(player, factionId, rep);
  for (const [itemId, amount] of Object.entries(supplies ?? {})) grantLootItem(player, itemId, amount);
}

function recipeGoldCost(player: PlayerEntity, recipe: WorldCraftRecipe) {
  const base = Math.max(0, Math.floor(recipe.goldCost ?? 0));
  if (base <= 0) return 0;
  return hasFactionReward(player, "ironcrag-fuel-efficiency") ? Math.max(0, Math.floor(base * 0.85)) : base;
}

function canCraftRecipe(player: PlayerEntity, recipe: WorldCraftRecipe) {
  if (recipe.questFlag && hasQuestFlag(player, recipe.questFlag)) return false;
  if (recipe.unique && recipe.outputItemId && (hasInventoryItem(player, recipe.outputItemId) || hasGear(player, recipe.outputItemId))) return false;
  if (player.gold < recipeGoldCost(player, recipe)) return false;
  if ((recipe.hpCost ?? 0) > 0 && player.hp - Math.floor(recipe.hpCost ?? 0) <= 1) return false;
  for (const [itemId, amount] of Object.entries(recipe.costs ?? {})) {
    if (itemQty(player, itemId) < Math.max(1, Math.floor(amount))) return false;
  }
  return true;
}

function craftRecipe(player: PlayerEntity, recipe: WorldCraftRecipe) {
  if (!canCraftRecipe(player, recipe)) return false;
  for (const [itemId, amount] of Object.entries(recipe.costs ?? {})) spendItem(player, itemId, Math.max(1, Math.floor(amount)));
  player.gold -= recipeGoldCost(player, recipe);
  if ((recipe.hpCost ?? 0) > 0) player.hp = Math.max(1, player.hp - Math.floor(recipe.hpCost ?? 0));
  if ((recipe.goldReward ?? 0) > 0) player.gold += Math.floor(recipe.goldReward ?? 0);
  if (recipe.outputItemId) {
    if (recipe.equip) equipItem(player, recipe.outputItemId);
    else grantLootItem(player, recipe.outputItemId, recipe.outputAmount ?? 1);
  }
  if (recipe.questFlag) addQuestBit(player, recipe.questFlag);
  if (recipe.factionId && (recipe.rep ?? 0) > 0) grantFactionRep(player, recipe.factionId, recipe.rep ?? 0);
  player.berserkMs = Math.max(player.berserkMs, 700);
  refreshQuestProgress(player);
  return true;
}

function craftFirstAvailable(player: PlayerEntity, recipes: readonly WorldCraftRecipe[]) {
  for (const recipe of recipes) {
    if (craftRecipe(player, recipe)) return true;
  }
  return false;
}

function authoredRecipeRuntimeMatch(recipes: readonly WorldCraftRecipe[], requestedRecipeId: string) {
  const authored = authoredWorldCraftingRecipes.find((recipe) => recipe.id === requestedRecipeId);
  const outputItemId = authored?.outputs[0]?.itemId;
  if (!outputItemId) return undefined;
  return recipes.find((recipe) => recipe.outputItemId === outputItemId && recipe.factionId === authored.factionId) ??
    recipes.find((recipe) => recipe.outputItemId === outputItemId);
}

function craftGatheringProgressionRecipe(player: PlayerEntity, requestedRecipeId: string) {
  const recipeId = cleanItemId(requestedRecipeId);
  if (!recipeId) return false;
  const result = craftAuthoredProgressionRecipe(player.inventory, recipeId, {
    inputKey: (input) => cleanItemId(input.materialName),
    outputKey: (recipe) => cleanItemId(recipe.outputId)
  });
  if (!result.ok) return false;
  refreshQuestProgress(player);
  return true;
}

function craftRequestedOrFirst(player: PlayerEntity, recipes: readonly WorldCraftRecipe[], requestedRecipeId = "") {
  const requestedId = cleanItemId(requestedRecipeId.trim());
  if (requestedId) {
    if (craftGatheringProgressionRecipe(player, requestedId)) return true;
    const requested = recipes.find((recipe) => recipe.id === requestedId) ?? authoredRecipeRuntimeMatch(recipes, requestedId);
    if (requested && craftRecipe(player, requested)) return true;
  }
  return craftFirstAvailable(player, recipes);
}

function isMarketNpc(npc: NpcEntity) {
  return npc.role === "merchant" || npc.role === "crafting" || npc.kind === "foreman-iron-will";
}

function marketStockIdsForNpc(npc: NpcEntity, player: PlayerEntity) {
  if (npc.kind === "foreman-iron-will" || npc.kind === "blacksmith-silas" || npc.kind === "blacksmith") return ["pickaxe", "iron-ore", "iron-chest", "ring-focus"];
  if (npc.kind === "alchemist-zora") return ["speed-potion", "cinder-ale", "silk-thread", "void-resistant-cloak"];
  if (npc.kind === "apprentice-jinn") return ["glade-berries", "cinder-ale", "speed-potion"];
  if (npc.zoneId === "canaan-desert" || player.zoneId === "bazaar") return ["glade-berries", "speed-potion", "silk-thread", "ring-focus"];
  return ["glade-berries", "cinder-ale", "speed-potion", "pickaxe", "iron-ore"];
}

function marketNpcForInput(state: MmoSkillDemoState, player: PlayerEntity, input: RuntimeInput) {
  const targeted = input.targetId ? state.npcs[input.targetId] : undefined;
  if (targeted && targeted.zoneId === player.zoneId && isMarketNpc(targeted) && canReachNpc(player, targeted, 84)) return targeted;
  return nearestNpc(player, state, "merchant", 84);
}

function applyMarketTransaction(player: PlayerEntity, npc: NpcEntity, mode: string, itemId: string) {
  if (mode === "inspect") return true;
  const item = MARKET_TRADE_ITEMS[canonicalItemId(itemId)];
  if (!item) return false;
  if (mode === "buy") {
    if (!marketStockIdsForNpc(npc, player).includes(item.itemId)) return false;
    if (item.unique && (hasInventoryItem(player, item.itemId) || hasGear(player, item.itemId))) return false;
    if (player.gold < item.price) return false;
    player.gold -= item.price;
    grantItem(player, item.itemId, 1);
    grantFactionRep(player, npc.zoneId === "canaan-desert" ? "sunken-bazaar" : npc.zoneId === "crags" ? "ironcrag" : "port-marrow", 1);
    refreshQuestProgress(player);
    return true;
  }
  if (mode === "sell") {
    if (item.sellPrice <= 0 || itemQty(player, item.itemId) <= 0) return false;
    if (!spendItem(player, item.itemId, 1)) return false;
    player.gold += item.sellPrice;
    grantFactionRep(player, npc.zoneId === "canaan-desert" ? "sunken-bazaar" : npc.zoneId === "crags" ? "ironcrag" : "port-marrow", 1);
    refreshQuestProgress(player);
    return true;
  }
  return false;
}

function grantLootItem(player: PlayerEntity, itemId: string, amount: number) {
  const value = Math.max(1, Math.floor(amount));
  const canonicalId = canonicalItemId(itemId);
  const factionId = factionIdForRepItem(canonicalId);
  if (factionId) {
    grantFactionRep(player, factionId, value);
    refreshQuestProgress(player);
    return;
  }
  switch (canonicalId) {
    case "gold":
      player.gold += hasFactionReward(player, "sunken-bazaar-coin-scent") ? Math.max(1, Math.floor(value * 1.2)) : value;
      break;
    case "renown":
      player.renown += value;
      syncRenownRewards(player);
      break;
    case "ash-logs":
      addItem(player, "ash-logs", value);
      break;
    case "iron-ore":
      addItem(player, "iron-ore", value);
      break;
    case "silk-thread":
      addItem(player, "silk-thread", value);
      break;
    case "glade-berry":
    case "glade-berries":
      addItem(player, "glade-berries", value);
      break;
    case "cinder-ale":
      addItem(player, "cinder-ale", value);
      break;
    case "speed-potion":
    case "speed-potions":
      addItem(player, "speed-potion", value);
      break;
    case "leather-boots":
    case "mining-boots":
    case "iron-chest":
    case "ring-focus":
      equipItem(player, canonicalId);
      break;
    default:
      grantItem(player, canonicalId, value);
      break;
  }
  refreshQuestProgress(player);
}

export {
  FACTION_REPUTATION_THRESHOLDS,
  WORLD_CREATURE_BY_ID,
  WORLD_FACTION_ID_SET,
  applyFactionRewardUnlock,
  applyMarketTransaction,
  authoredRecipeRuntimeMatch,
  canCraftRecipe,
  craftFirstAvailable,
  craftGatheringProgressionRecipe,
  craftRecipe,
  craftRequestedOrFirst,
  factionIdForRepItem,
  factionRepItemId,
  factionReputation,
  factionReputationLevel,
  factionRewardFlag,
  grantFactionBundle,
  grantFactionRep,
  grantLootItem,
  hasFactionReward,
  isMarketNpc,
  isWorldFactionId,
  marketNpcForInput,
  marketStockIdsForNpc,
  recipeGoldCost,
  syncFactionReputationRewards
};

export type {
  WorldCraftRecipe
};
