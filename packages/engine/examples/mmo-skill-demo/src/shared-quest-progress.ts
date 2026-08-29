import type { PlayerEntity } from "./shared-contracts.ts";
import {
  addQuestBit,
  bankQty,
  hasGear,
  hasInventoryItem,
  hasQuestFlag,
  itemQty
} from "./shared-loadout-state.ts";
import { isBazaarPressureZone } from "./shared-world-zone-rules.ts";

export function playerHasTool(player: PlayerEntity, toolId: string) {
  return hasInventoryItem(player, toolId) || hasGear(player, toolId);
}

export function nextStarterQuest(player: PlayerEntity) {
  if (!hasQuestFlag(player, "first-cut")) return "first-cut";
  if (!hasQuestFlag(player, "second-cut")) return "second-cut";
  if (!hasQuestFlag(player, "wolf-culling")) return "wolf-culling";
  if (!hasQuestFlag(player, "final-cut")) return "final-cut";
  return "";
}

export function starterQuestSelectable(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId)) return false;
  if (questId === "first-cut") return true;
  if (questId === "second-cut") return hasQuestFlag(player, "first-cut");
  if (questId === "wolf-culling") return hasQuestFlag(player, "second-cut");
  if (questId === "final-cut") return hasQuestFlag(player, "wolf-culling");
  if (questId === "heavy-lifting") return playerHasTool(player, "pickaxe") || hasQuestFlag(player, "fast-travel-registered") || hasQuestFlag(player, "heavy-lifting-accepted");
  if (questId === "silent-sands") return hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || hasQuestFlag(player, "silent-sands-accepted") || isBazaarPressureZone(player.zoneId);
  return false;
}

export function mainQuestSelectable(player: PlayerEntity, questId: string) {
  if (!questId || hasQuestFlag(player, questId)) return false;
  if (starterQuestSelectable(player, questId)) return true;
  return hasQuestFlag(player, `${questId}-accepted`);
}

export function acceptedMainQuest(player: PlayerEntity) {
  for (const flag of Object.keys(player.questFlags ?? {})) {
    if (!flag.endsWith("-accepted")) continue;
    const questId = flag.slice(0, -"accepted".length - 1);
    if (mainQuestSelectable(player, questId)) return questId;
  }
  return "";
}

export function defaultMainQuest(player: PlayerEntity) {
  return nextStarterQuest(player) || acceptedMainQuest(player) || "";
}

export function ensureActiveMainQuest(player: PlayerEntity) {
  if (mainQuestSelectable(player, player.activeQuestId)) return;
  player.activeQuestId = defaultMainQuest(player);
  if (player.activeQuestId && !hasQuestFlag(player, `${player.activeQuestId}-accepted`) && starterQuestSelectable(player, player.activeQuestId)) {
    addQuestBit(player, `${player.activeQuestId}-accepted`);
  }
}

export function refreshQuestProgress(player: PlayerEntity) {
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

export function questZoneMatchesPlayer(zoneId: string, player: PlayerEntity) {
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
