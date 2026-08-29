import type { PlayerEntity } from "./shared-contracts.ts";
import { unlockAbility, unlockSlot } from "./shared-loadout-state.ts";
import { clamp } from "./shared-replication-projection.ts";

export function rankForRenown(renown: number) {
  return clamp(1 + Math.floor(Math.max(0, renown) / 140), 1, 99);
}

export function syncRenownRewards(player: PlayerEntity) {
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
