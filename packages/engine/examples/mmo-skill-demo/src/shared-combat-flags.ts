import { addMmoStatus, hasMmoStatus, mmoStatusStacks, removeMmoStatus, setMmoStatusStacks } from "@hyperfocus/engine/mmo";
import type { NpcEntity, PlayerEntity } from "./shared-contracts.ts";
import { u16Ms } from "./shared-replication-values.ts";

export function addCombatFlag(npc: NpcEntity, flag: string) {
  npc.combatFlags = addMmoStatus(npc.combatFlags, flag, { maxLength: 96 });
}

export function hasCombatFlag(npc: NpcEntity, flag: string) {
  return hasMmoStatus(npc.combatFlags, flag);
}

export function removeCombatFlag(npc: NpcEntity, flag: string) {
  npc.combatFlags = removeMmoStatus(npc.combatFlags, flag, { maxLength: 96 });
}

export function combatFlagParts(npc: NpcEntity) {
  return (npc.combatFlags || "").split("|").filter(Boolean);
}

export function combatFlagValue(npc: NpcEntity, prefix: string) {
  const needle = `${prefix}:`;
  return combatFlagParts(npc).find((part) => part.startsWith(needle))?.slice(needle.length) ?? "";
}

export function npcFlagStacks(npc: NpcEntity, prefix: string) {
  return mmoStatusStacks(npc.combatFlags, prefix);
}

export function setNpcFlagStacks(npc: NpcEntity, prefix: string, stacks: number) {
  npc.combatFlags = setMmoStatusStacks(npc.combatFlags, prefix, stacks, { maxLength: 96, maxEntries: 8 });
}

export function addTimedNpcFlag(npc: NpcEntity, flag: string, durationMs: number) {
  addCombatFlag(npc, flag);
  npc.damageAmpMs = Math.max(npc.damageAmpMs, durationMs);
}

export function applyNpcPoison(npc: NpcEntity, stacks = 1, durationMs = 4000) {
  setNpcFlagStacks(npc, "poison", Math.min(3, npcFlagStacks(npc, "poison") + Math.max(1, Math.floor(stacks))));
  npc.damageAmpMs = Math.max(npc.damageAmpMs, durationMs);
}

export function consumeNpcPoison(npc: NpcEntity) {
  const stacks = npcFlagStacks(npc, "poison");
  setNpcFlagStacks(npc, "poison", 0);
  return stacks;
}

export function hasPlayerCombatFlag(player: PlayerEntity, flag: string) {
  return hasMmoStatus(player.combatFlags, flag);
}

export function addPlayerCombatFlag(player: PlayerEntity, flag: string) {
  player.combatFlags = addMmoStatus(player.combatFlags, flag, { maxLength: 96 });
}

export function removePlayerCombatFlag(player: PlayerEntity, flag: string) {
  player.combatFlags = removeMmoStatus(player.combatFlags, flag, { maxLength: 96 });
}

export function playerCombatFlagParts(player: PlayerEntity) {
  return (player.combatFlags || "").split("|").filter(Boolean);
}

export function playerFlagStacks(player: PlayerEntity, prefix: string) {
  return mmoStatusStacks(player.combatFlags, prefix);
}

export function setPlayerFlagStacks(player: PlayerEntity, prefix: string, stacks: number) {
  player.combatFlags = setMmoStatusStacks(player.combatFlags, prefix, stacks, { maxLength: 96, maxEntries: 8 });
}

export function hasTimedPlayerFlag(player: PlayerEntity, flag: string) {
  return hasPlayerCombatFlag(player, flag) && player.damageAmpMs > 0;
}

export function addTimedPlayerFlag(player: PlayerEntity, flag: string, durationMs: number) {
  addPlayerCombatFlag(player, flag);
  player.damageAmpMs = Math.max(player.damageAmpMs, durationMs);
}

export function addPlayerMsFlag(player: PlayerEntity, prefix: string, durationMs: number) {
  setPlayerFlagStacks(player, prefix, Math.max(playerFlagStacks(player, prefix), u16Ms(durationMs)));
}

export function tickPlayerMsFlag(player: PlayerEntity, prefix: string, ms: number) {
  const remainingMs = playerFlagStacks(player, prefix);
  if (remainingMs <= 0) return;
  setPlayerFlagStacks(player, prefix, u16Ms(remainingMs - ms));
}

export function consumePlayerFlagStack(player: PlayerEntity, prefix: string) {
  const stacks = playerFlagStacks(player, prefix);
  if (stacks <= 0) return false;
  setPlayerFlagStacks(player, prefix, stacks - 1);
  return true;
}
