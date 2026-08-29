import { clearMmoAbility, setMmoStatusStacks } from "@hyperfocus/engine/mmo";
import type { PlayerEntity } from "./shared-contracts.ts";

function clearPlayerFlagStacks(player: PlayerEntity, prefix: string) {
  player.combatFlags = setMmoStatusStacks(player.combatFlags, prefix, 0, { maxLength: 96, maxEntries: 8 });
}

export function clearActiveAbility(player: PlayerEntity) {
  clearMmoAbility(player);
  player.rushDistance = 0;
  clearPlayerFlagStacks(player, "flurry");
  clearPlayerFlagStacks(player, "chaos");
  clearPlayerFlagStacks(player, "blade");
  clearPlayerFlagStacks(player, "omni");
}
