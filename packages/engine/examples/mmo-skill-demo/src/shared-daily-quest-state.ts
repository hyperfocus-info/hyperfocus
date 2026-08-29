import { currentUtcDateString, dailyQuestArcForDate } from "./data/daily-quests.ts";
import type { PlayerEntity } from "./shared-contracts.ts";
import { clamp, cleanInputText, u16Ms } from "./shared-replication-projection.ts";

export function ensureDailyQuestState(player: PlayerEntity, dateString = currentUtcDateString()) {
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

export function setDailyQuestResult(player: PlayerEntity, text: string) {
  player.dailyQuestResult = cleanInputText(text, 128);
}
