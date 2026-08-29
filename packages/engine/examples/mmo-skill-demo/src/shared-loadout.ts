import { worldFactionIds, type WorldFactionId } from "./data/world-factions.ts";
import { ABILITY_SLOTS, ACTION_COOLDOWN_MS, type AbilitySlot, BLADE_WEAPON_ID, BOW_WEAPON_ID, MACE_WEAPON_ID, PLAYER_ABILITY_DEFS, STAFF_WEAPON_ID, TWIN_BLADES_WEAPON_ID, WAND_WEAPON_ID, WEAPON_LOADOUTS } from "./shared-ability-catalog.ts";
import { clearActiveAbility } from "./shared-active-ability-state.ts";
import { hasTimedPlayerFlag } from "./shared-combat-flags.ts";
import { type PlayerEntity } from "./shared-contracts.ts";
import { setDailyQuestResult } from "./shared-daily-quest-state.ts";
import { grantFactionRep, grantLootItem } from "./shared-economy.ts";
import {
  ABILITY_SLOT_BY_ID,
  DEFAULT_MACE_ABILITY_ENTRIES,
  DEFAULT_MACE_ABILITY_SET,
  ITEM_ALIASES,
  abilitySet,
  acceptQuest,
  addBankItem,
  addItem,
  addQuestBit,
  bankQty,
  canonicalItemId,
  defaultMaceAbilitySet,
  depositInventoryItem,
  ensurePlayerCombatLoadout,
  ensureStartingEquipment,
  equipItem,
  grantItem,
  hasAbility,
  hasFlag,
  hasGear,
  hasInventoryItem,
  hasQuestFlag,
  itemQty,
  mmoInventory,
  setItemQty,
  slotForAbility,
  spendItem,
  unlockAbility,
  unlockSlot
} from "./shared-loadout-state.ts";
import { nextStarterQuest, refreshQuestProgress } from "./shared-quest-progress.ts";
import { syncRenownRewards } from "./shared-renown-state.ts";
import { EMPTY_STRING_MAP, cleanInputText, u16Ms } from "./shared-replication-projection.ts";

const PROVING_CONTRACT_ID = "first-arms-proving";

const PROVING_WEAPON_IDS = [MACE_WEAPON_ID, BOW_WEAPON_ID, STAFF_WEAPON_ID, WAND_WEAPON_ID, TWIN_BLADES_WEAPON_ID, BLADE_WEAPON_ID] as const;

type ProvingWeaponId = (typeof PROVING_WEAPON_IDS)[number];
type WeaponId = keyof typeof WEAPON_LOADOUTS;
type AbilityId = keyof typeof PLAYER_ABILITY_DEFS;

const PROVING_WEAPON_ID_SET = new Set<string>(PROVING_WEAPON_IDS);

type ProvingLesson = {
  flag: string;
  title: string;
  gold: number;
  renown: number;
  supplies: Record<string, number>;
  reps?: Partial<Record<WorldFactionId, number>>;
};

const PROVING_LESSONS: Record<string, ProvingLesson> = {
  statuses: {
    flag: "first-arms-lesson-statuses",
    title: "Status Table",
    gold: 18,
    renown: 8,
    supplies: { "speed-potion": 3, "cinder-ale": 2, "glade-berries": 4 }
  },
  crafting: {
    flag: "first-arms-lesson-crafting",
    title: "Craft Order",
    gold: 22,
    renown: 8,
    supplies: { "ash-logs": 12, "iron-ore": 10, "silk-thread": 3 }
  },
  buffs: {
    flag: "first-arms-lesson-buffs",
    title: "Buff Bench",
    gold: 16,
    renown: 6,
    supplies: { "speed-potion": 4, "cinder-ale": 4, "glade-berries": 6 }
  },
  gathering: {
    flag: "first-arms-lesson-gathering",
    title: "Work Yard",
    gold: 24,
    renown: 8,
    supplies: { "training-hatchet": 1, pickaxe: 1, "ash-logs": 16, "iron-ore": 16 }
  },
  cities: {
    flag: "first-arms-lesson-cities",
    title: "City Ledger",
    gold: 20,
    renown: 10,
    supplies: { "captains-map": 1, "silk-thread": 2 },
    reps: { oakhaven: 8, ironcrag: 6, "port-marrow": 6, "sunken-bazaar": 6, aetheria: 6, "high-reach-peaks": 6, "ashwood-glade": 6, "obsidian-sanctum": 4 }
  },
  travel: {
    flag: "first-arms-lesson-travel",
    title: "Route Tickets",
    gold: 28,
    renown: 10,
    supplies: { "captains-map": 1, "speed-potion": 2, "cinder-ale": 2 },
    reps: { "port-marrow": 8, "sunken-bazaar": 6, "high-reach-peaks": 4 }
  }
};

function isProvingWeaponId(value: string): value is ProvingWeaponId {
  return PROVING_WEAPON_ID_SET.has(value);
}

function isWorldFactionId(value: string): value is WorldFactionId {
  return worldFactionIds.some((factionId) => factionId === value);
}

function isWeaponId(value: string): value is WeaponId {
  return Object.hasOwn(WEAPON_LOADOUTS, value);
}

function isAbilityId(value: string): value is AbilityId {
  return Object.hasOwn(PLAYER_ABILITY_DEFS, value);
}

function isAbilitySlot(value: string): value is AbilitySlot {
  return ABILITY_SLOTS.some((slot) => slot === value);
}

function provingSampleFlag(weaponId: ProvingWeaponId) {
  return `${PROVING_CONTRACT_ID}-sampled-${weaponId}`;
}

function provingRewardFlag(weaponId: ProvingWeaponId) {
  return `${PROVING_CONTRACT_ID}-reward-${weaponId}`;
}

function provingSampleCount(player: PlayerEntity) {
  return PROVING_WEAPON_IDS.filter((weaponId) => hasQuestFlag(player, provingSampleFlag(weaponId))).length;
}

function setPlayerWeapon(player: PlayerEntity, weaponId: ProvingWeaponId) {
  player.equipment = ensureStartingEquipment(player.equipment);
  player.equipment.weapon = weaponId;
  player.equippedWeaponId = weaponId;
  if (player.activeAbility) clearActiveAbility(player);
}

function grantProvingSupplies(player: PlayerEntity, supplies: Record<string, number>) {
  for (const [itemId, amount] of Object.entries(supplies)) grantLootItem(player, itemId, amount);
}

function grantProvingWeapon(player: PlayerEntity, weaponId: ProvingWeaponId) {
  if (weaponId !== MACE_WEAPON_ID) grantLootItem(player, weaponId, 1);
  player.equipment[weaponId] = weaponId;
  setPlayerWeapon(player, weaponId);
}

function acceptProvingContract(player: PlayerEntity) {
  if (hasQuestFlag(player, PROVING_CONTRACT_ID)) return false;
  const firstAccept = !hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`);
  acceptQuest(player, PROVING_CONTRACT_ID);
  if (firstAccept) {
    player.gold += 8;
    grantProvingSupplies(player, { "glade-berries": 3, "cinder-ale": 1 });
  }
  setDailyQuestResult(player, "Rowan's board opens a paid proving contract: try loaner arms, then keep one.");
  return true;
}

function sampleProvingWeapon(player: PlayerEntity, weaponId: ProvingWeaponId) {
  if (hasQuestFlag(player, PROVING_CONTRACT_ID)) return false;
  acceptProvingContract(player);
  const flag = provingSampleFlag(weaponId);
  const firstSample = !hasQuestFlag(player, flag);
  if (firstSample) {
    addQuestBit(player, flag);
    player.gold += 3;
  }
  setPlayerWeapon(player, weaponId);
  setDailyQuestResult(player, `${WEAPON_LOADOUTS[weaponId].name} loaner ready. Try the feel, then choose one weapon to keep.`);
  return true;
}

function completeProvingContract(player: PlayerEntity, weaponId: ProvingWeaponId) {
  if (hasQuestFlag(player, PROVING_CONTRACT_ID)) return false;
  acceptProvingContract(player);
  if (!hasQuestFlag(player, provingSampleFlag(weaponId))) sampleProvingWeapon(player, weaponId);
  if (provingSampleCount(player) < 3) {
    setDailyQuestResult(player, "The board wants three loaner trials before it pays out a kept weapon.");
    return false;
  }
  addQuestBit(player, PROVING_CONTRACT_ID);
  addQuestBit(player, provingRewardFlag(weaponId));
  grantProvingWeapon(player, weaponId);
  player.gold += 60;
  player.renown += 24;
  grantProvingSupplies(player, {
    "ash-logs": 18,
    "iron-ore": 14,
    "silk-thread": 3,
    "glade-berries": 8,
    "cinder-ale": 4,
    "speed-potion": 3
  });
  syncRenownRewards(player);
  if (player.activeQuestId === PROVING_CONTRACT_ID) player.activeQuestId = nextStarterQuest(player) || "first-cut";
  setDailyQuestResult(player, `${WEAPON_LOADOUTS[weaponId].name} chosen. Starter purse paid. Next field action: ${nextStarterQuest(player) === "first-cut" ? "cut Ash tree" : "follow the main quest trail"}.`);
  refreshQuestProgress(player);
  return true;
}

function completeProvingLesson(player: PlayerEntity, lessonId: string) {
  if (!hasQuestFlag(player, PROVING_CONTRACT_ID)) {
    setDailyQuestResult(player, "Finish the First Arms payout before taking lesson contracts.");
    return false;
  }
  const lesson = PROVING_LESSONS[lessonId];
  if (!lesson || hasQuestFlag(player, lesson.flag)) return false;
  addQuestBit(player, lesson.flag);
  player.gold += lesson.gold;
  player.renown += lesson.renown;
  grantProvingSupplies(player, lesson.supplies);
  for (const [factionId, amount] of Object.entries(lesson.reps ?? {})) {
    if (isWorldFactionId(factionId) && amount !== undefined) grantFactionRep(player, factionId, amount);
  }
  syncRenownRewards(player);
  setDailyQuestResult(player, `${lesson.title} paid out. Its field note now stays in the journal.`);
  refreshQuestProgress(player);
  return true;
}

function applyProvingCommand(player: PlayerEntity, command: string) {
  const clean = cleanInputText(command, 64);
  if (clean === "accept") return acceptProvingContract(player);
  if (clean.startsWith("sample:")) {
    const weaponId = clean.slice("sample:".length);
    return isProvingWeaponId(weaponId) ? sampleProvingWeapon(player, weaponId) : false;
  }
  if (clean.startsWith("choose:")) {
    const weaponId = clean.slice("choose:".length);
    return isProvingWeaponId(weaponId) ? completeProvingContract(player, weaponId) : false;
  }
  if (clean.startsWith("lesson:")) return completeProvingLesson(player, clean.slice("lesson:".length));
  return false;
}

export function hasSlot(player: PlayerEntity, slot: string) {
  if (slot === "Space" || slot === "Q" || slot === "R") return true;
  const abilitySlots = player.abilitySlots ?? EMPTY_STRING_MAP;
  if (abilitySlots[slot]) return true;
  for (const key in abilitySlots) {
    if (Object.prototype.hasOwnProperty.call(abilitySlots, key) && abilitySlots[key] === slot) return true;
  }
  return false;
}

function equippedWeapon(player: PlayerEntity) {
  ensurePlayerCombatLoadout(player);
  return isWeaponId(player.equippedWeaponId) ? WEAPON_LOADOUTS[player.equippedWeaponId] : WEAPON_LOADOUTS.mace;
}

function abilityIdForSlot(player: PlayerEntity, slot: AbilitySlot) {
  const weapon = equippedWeapon(player);
  const configured = player.equipment[`ability:${slot}`];
  const options: readonly AbilityId[] = weapon.options[slot] ?? [];
  if (!isAbilityId(configured)) return weapon.slots[slot] ?? "";
  if (configured && options.includes(configured) && hasAbility(player, configured)) return configured;
  return weapon.slots[slot] ?? "";
}

function abilityDefForSlot(player: PlayerEntity, slot: AbilitySlot) {
  const id = abilityIdForSlot(player, slot);
  return isAbilityId(id) ? PLAYER_ABILITY_DEFS[id] : undefined;
}

export function equippedWeaponForPlayer(player: PlayerEntity | undefined) {
  if (!player) return MACE_WEAPON_ID;
  const weaponId = (player.equipment?.weapon || MACE_WEAPON_ID).slice(0, 32);
  return isWeaponId(weaponId) ? WEAPON_LOADOUTS[weaponId].id : MACE_WEAPON_ID;
}

export function selectedAbilityForSlot(player: PlayerEntity | undefined, slot: AbilitySlot) {
  if (!player) return "";
  const weaponId = equippedWeaponForPlayer(player);
  const weapon = isWeaponId(weaponId) ? WEAPON_LOADOUTS[weaponId] : WEAPON_LOADOUTS.mace;
  const configured = player.equipment?.[`ability:${slot}`];
  const options: readonly AbilityId[] = weapon.options[slot] ?? [];
  if (!configured || !isAbilityId(configured)) return weapon.slots[slot] ?? "";
  if (configured && options.includes(configured) && hasFlag(player.abilitySlots, configured)) return configured;
  return weapon.slots[slot] ?? "";
}

export function abilityOptionsForSlot(weaponId: string, slot: AbilitySlot) {
  const weapon = isWeaponId(weaponId) ? WEAPON_LOADOUTS[weaponId] : WEAPON_LOADOUTS.mace;
  return [...(weapon.options[slot] ?? [])];
}

function configureAbilitySlot(player: PlayerEntity, slot: string, abilityId: string) {
  ensurePlayerCombatLoadout(player);
  if (!isAbilitySlot(slot)) return false;
  const typedSlot = slot;
  const weapon = equippedWeapon(player);
  if (!isAbilityId(abilityId)) return false;
  const id = abilityId;
  const options: readonly AbilityId[] = weapon.options[typedSlot] ?? [];
  if (!options.includes(id)) return false;
  if (!hasAbility(player, abilityId)) return false;
  player.equipment[`ability:${typedSlot}`] = abilityId.slice(0, 32);
  return true;
}

function configureWeapon(player: PlayerEntity, weaponId: string) {
  ensurePlayerCombatLoadout(player);
  if (!(weaponId in WEAPON_LOADOUTS)) return false;
  if (weaponId !== MACE_WEAPON_ID && !hasInventoryItem(player, weaponId) && !hasGear(player, weaponId)) return false;
  player.equipment.weapon = weaponId;
  player.equippedWeaponId = weaponId;
  if (player.activeAbility) clearActiveAbility(player);
  return true;
}

function cooldownForSlot(player: PlayerEntity, slot: AbilitySlot) {
  ensurePlayerCombatLoadout(player);
  if (player.cooldownMs <= 0) return 0;
  return Math.max(0, Math.floor(player.cooldowns[slot] ?? 0));
}

function isSlotReady(player: PlayerEntity, slot: AbilitySlot) {
  return cooldownForSlot(player, slot) <= 0;
}

function syncLegacyCooldown(player: PlayerEntity) {
  ensurePlayerCombatLoadout(player);
  player.cooldownMs = u16Ms(Math.max(0, ...Object.values(player.cooldowns).map((value) => Math.floor(value || 0))));
}

function setSlotCooldown(player: PlayerEntity, slot: AbilitySlot, cooldownMs: number) {
  ensurePlayerCombatLoadout(player);
  const focus = hasGear(player, "ring-focus") ? 0.82 : 1;
  const mastery = 1 - Math.min(0.14, Math.max(0, player.masteryRank - 1) * 0.012);
  player.cooldowns[slot] = u16Ms(cooldownMs * focus * mastery);
  syncLegacyCooldown(player);
}

function setUtilityCooldown(player: PlayerEntity, action: keyof typeof ACTION_COOLDOWN_MS) {
  ensurePlayerCombatLoadout(player);
  player.cooldowns[action] = u16Ms(ACTION_COOLDOWN_MS[action]);
  syncLegacyCooldown(player);
}

function utilityCooldownReady(player: PlayerEntity, action: keyof typeof ACTION_COOLDOWN_MS) {
  ensurePlayerCombatLoadout(player);
  if (player.cooldownMs <= 0) return true;
  return (player.cooldowns[action] ?? 0) <= 0;
}

function decayPlayerCooldowns(player: PlayerEntity, dt: number) {
  ensurePlayerCombatLoadout(player);
  if (player.cooldownMs <= 0 && Object.values(player.cooldowns).some((value) => value > 0)) {
    player.cooldowns = {};
    syncLegacyCooldown(player);
    return;
  }
  const ms = Math.max(0, Math.floor(dt * 1000));
  let any = false;
  for (const key of Object.keys(player.cooldowns)) {
    const recoverScale = hasTimedPlayerFlag(player, "trance") && key !== "R" ? 1.5 : 1;
    const next = u16Ms((player.cooldowns[key] || 0) - Math.floor(ms * recoverScale));
    player.cooldowns[key] = next;
    if (next > 0) any = true;
  }
  if (!any) {
    for (const key of Object.keys(player.cooldowns)) if (player.cooldowns[key] <= 0) delete player.cooldowns[key];
  }
  syncLegacyCooldown(player);
}

export {
  ABILITY_SLOT_BY_ID,
  DEFAULT_MACE_ABILITY_ENTRIES,
  DEFAULT_MACE_ABILITY_SET,
  ITEM_ALIASES,
  PROVING_CONTRACT_ID,
  PROVING_LESSONS,
  PROVING_WEAPON_IDS,
  PROVING_WEAPON_ID_SET,
  abilityDefForSlot,
  abilityIdForSlot,
  abilitySet,
  acceptProvingContract,
  acceptQuest,
  addBankItem,
  addItem,
  addQuestBit,
  applyProvingCommand,
  canonicalItemId,
  completeProvingContract,
  completeProvingLesson,
  configureAbilitySlot,
  configureWeapon,
  cooldownForSlot,
  decayPlayerCooldowns,
  defaultMaceAbilitySet,
  depositInventoryItem,
  ensurePlayerCombatLoadout,
  ensureStartingEquipment,
  equipItem,
  equippedWeapon,
  grantItem,
  grantProvingSupplies,
  grantProvingWeapon,
  hasFlag,
  hasInventoryItem,
  hasQuestFlag,
  itemQty,
  bankQty,
  isProvingWeaponId,
  isAbilityId,
  isAbilitySlot,
  isSlotReady,
  mmoInventory,
  provingRewardFlag,
  provingSampleCount,
  provingSampleFlag,
  sampleProvingWeapon,
  setPlayerWeapon,
  setItemQty,
  setSlotCooldown,
  setUtilityCooldown,
  slotForAbility,
  spendItem,
  syncLegacyCooldown,
  unlockAbility,
  unlockSlot,
  utilityCooldownReady
};

export type {
  ProvingLesson,
  ProvingWeaponId
};
