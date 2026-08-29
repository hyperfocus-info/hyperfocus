import { addMmoId, createMmoInventoryOps, hasMmoId } from "@hyperfocus/engine/mmo";
import { ensureGatheringProgress } from "./server/gatheringEngine.ts";
import {
  ABILITY_SLOTS,
  MACE_WEAPON_ID,
  MAX_ENERGY
} from "./shared-ability-catalog.ts";
import type { PlayerEntity } from "./shared-contracts.ts";
import {
  EMPTY_BOOLEAN_MAP,
  EMPTY_NUMBER_MAP,
  clamp,
  u16Ms
} from "./shared-replication-projection.ts";

export const ITEM_ALIASES: Record<string, string> = {
  "glade-berry": "glade-berries",
  "glade-berries": "glade-berries",
  "speed-potions": "speed-potion",
  "speed-potion": "speed-potion",
  ashLogs: "ash-logs",
  ironOre: "iron-ore",
  silkThread: "silk-thread",
  gladeBerries: "glade-berries",
  cinderAle: "cinder-ale",
  speedPotions: "speed-potion"
};

export const mmoInventory = createMmoInventoryOps({ aliases: ITEM_ALIASES, maxStack: 999999 });

export const ABILITY_SLOT_BY_ID: Record<string, string> = {
  "mace-pummel": "LMB",
  "mace-crushing-leap": "RMB",
  "mace-rock-smash": "E",
  "mace-whirlwind": "R",
  "bow-quick-shot": "LMB",
  "bow-precision": "RMB",
  "bow-volley": "RMB",
  "bow-reposition": "Space",
  "bow-vault": "Space",
  "bow-stealth": "Q",
  "bow-decoy": "Q",
  "bow-bolas": "E",
  "bow-caltrops": "E",
  "bow-flurry": "R",
  "bow-arrowstorm": "R",
  "staff-arcane-bolt": "LMB",
  "staff-siphon-beam": "LMB",
  "staff-meteor": "RMB",
  "staff-healing-pulse": "RMB",
  "staff-frost-chain": "RMB",
  "staff-astral-walk": "Space",
  "staff-zephyr": "Space",
  "staff-ice-wall": "Q",
  "staff-arcane-bubble": "Q",
  "staff-petrify": "Q",
  "staff-gravity-well": "E",
  "staff-consecration": "E",
  "staff-dispel-nova": "E",
  "staff-maelstrom": "R",
  "staff-tranquility": "R",
  "wand-magic-missile": "LMB",
  "wand-hex": "LMB",
  "wand-mending-spark": "LMB",
  "wand-focused-ray": "RMB",
  "wand-soul-bind": "RMB",
  "wand-flash-heal": "RMB",
  "wand-blink": "Space",
  "wand-phase-shift": "Space",
  "wand-rewind": "Space",
  "wand-mirror-shield": "Q",
  "wand-nightmare": "Q",
  "wand-rupture": "E",
  "wand-enfeeble": "E",
  "wand-chaos-volley": "R",
  "wand-apotheosis": "R",
  "twin-strike": "LMB",
  "twin-toxic-slash": "LMB",
  "twin-throwing-dirk": "LMB",
  "twin-shadow-lunge": "RMB",
  "twin-exsanguinate": "RMB",
  "twin-fan-of-knives": "RMB",
  "twin-swift-step": "Space",
  "twin-smoke-bomb": "Space",
  "twin-bloodlust": "Space",
  "twin-blur": "Q",
  "twin-vanish": "Q",
  "twin-noxious-flask": "E",
  "twin-deaths-mark": "E",
  "twin-blade-dance": "R",
  "twin-assassinate": "R",
  "blade-cleave": "LMB",
  "blade-sever": "LMB",
  "blade-sunder": "LMB",
  "blade-brutal-strike": "RMB",
  "blade-thrust": "RMB",
  "blade-bloodthirst": "RMB",
  "blade-combat-roll": "Space",
  "blade-leap-attack": "Space",
  "blade-juggernaut": "Space",
  "blade-riposte": "Q",
  "blade-iron-will": "Q",
  "blade-intimidating-shout": "E",
  "blade-razor-wind": "E",
  "blade-omnislash": "R",
  "blade-duelists-trance": "R",
  "lmb-strike": "LMB",
  "lmb-staff-bolt": "LMB",
  "rmb-reflect": "RMB",
  "rmb-crushing-blow": "RMB",
  "rmb-life-steal": "RMB",
  "space-jump": "Space",
  "space-rush": "Space",
  "space-dash": "Space",
  "space-ghost-walk": "Space",
  "q-stun": "Q",
  "q-berserk": "Q",
  "q-knockback": "Q",
  "e-ultimate": "E"
};

export function canonicalItemId(itemId: string) {
  return ITEM_ALIASES[itemId] ?? itemId;
}

export function hasFlag(value: string | Record<string, boolean> | Record<string, string> | undefined, flag: string) {
  if (!value) return false;
  if (typeof value === "string") {
    if (value === flag) return true;
    for (const part of value.split(",")) if (part === flag) return true;
    return false;
  }
  if (value[flag] === true || typeof value[flag] === "string") return true;
  for (const key of Object.keys(value)) if (value[key] === flag) return true;
  return false;
}

export function abilitySet(...ids: string[]) {
  const abilitySlots: Record<string, string> = {};
  for (const id of ids) {
    const slot = ABILITY_SLOT_BY_ID[id] ?? "LMB";
    abilitySlots[id] = slot;
    abilitySlots[slot] ??= "unlocked";
  }
  return abilitySlots;
}

export function defaultMaceAbilitySet() {
  return abilitySet(
    "mace-pummel", "mace-crushing-leap", "space-rush", "q-berserk", "mace-rock-smash", "mace-whirlwind",
    "bow-quick-shot", "bow-precision", "bow-volley", "bow-reposition", "bow-vault", "bow-stealth", "bow-decoy", "bow-bolas", "bow-caltrops", "bow-flurry", "bow-arrowstorm",
    "staff-arcane-bolt", "staff-siphon-beam", "staff-meteor", "staff-healing-pulse", "staff-frost-chain", "staff-astral-walk", "staff-zephyr", "staff-ice-wall", "staff-arcane-bubble", "staff-petrify", "staff-gravity-well", "staff-consecration", "staff-dispel-nova", "staff-maelstrom", "staff-tranquility",
    "wand-magic-missile", "wand-hex", "wand-mending-spark", "wand-focused-ray", "wand-soul-bind", "wand-flash-heal", "wand-blink", "wand-phase-shift", "wand-rewind", "wand-mirror-shield", "wand-nightmare", "wand-rupture", "wand-enfeeble", "wand-chaos-volley", "wand-apotheosis",
    "twin-strike", "twin-toxic-slash", "twin-throwing-dirk", "twin-shadow-lunge", "twin-exsanguinate", "twin-fan-of-knives", "twin-swift-step", "twin-smoke-bomb", "twin-bloodlust", "twin-blur", "twin-vanish", "twin-noxious-flask", "twin-deaths-mark", "twin-blade-dance", "twin-assassinate",
    "blade-cleave", "blade-sever", "blade-sunder", "blade-brutal-strike", "blade-thrust", "blade-bloodthirst", "blade-combat-roll", "blade-leap-attack", "blade-juggernaut", "blade-riposte", "blade-iron-will", "blade-intimidating-shout", "blade-razor-wind", "blade-omnislash", "blade-duelists-trance",
    "lmb-strike"
  );
}

export function ensureStartingEquipment(equipment: Record<string, string> | undefined) {
  if (!equipment) return { weapon: MACE_WEAPON_ID, [MACE_WEAPON_ID]: MACE_WEAPON_ID };
  const weapon = (equipment.weapon || equipment[MACE_WEAPON_ID] || MACE_WEAPON_ID).slice(0, 32);
  if (equipment.weapon === weapon && equipment[MACE_WEAPON_ID] === MACE_WEAPON_ID) return equipment;
  return { ...equipment, weapon, [MACE_WEAPON_ID]: MACE_WEAPON_ID };
}

export const DEFAULT_MACE_ABILITY_SET = defaultMaceAbilitySet();
export const DEFAULT_MACE_ABILITY_ENTRIES = Object.entries(DEFAULT_MACE_ABILITY_SET);

export function ensurePlayerCombatLoadout(player: PlayerEntity) {
  player.cooldowns ??= {};
  player.combatFlags ??= "";
  player.energy = clamp(Number.isFinite(player.energy) ? player.energy : 0, 0, MAX_ENERGY);
  player.maxEnergy = Math.max(1, Math.min(MAX_ENERGY, Number.isFinite(player.maxEnergy) ? player.maxEnergy : MAX_ENERGY));
  player.inventory ??= {};
  player.equipment = ensureStartingEquipment(player.equipment);
  player.equippedWeaponId = (player.equipment.weapon || MACE_WEAPON_ID).slice(0, 32);
  player.abilitySlots ??= {};
  for (const [id, slot] of DEFAULT_MACE_ABILITY_ENTRIES) player.abilitySlots[id] ??= slot;
  for (const slot of ABILITY_SLOTS) player.abilitySlots[slot] ??= "unlocked";
  player.activeAbility ??= "";
  player.activeSlot ??= "";
  player.activeMs = u16Ms(player.activeMs);
  player.activeDurationMs = u16Ms(player.activeDurationMs);
  player.chargeMs = Math.max(0, Number.isFinite(player.chargeMs) ? player.chargeMs : 0);
  player.rushDistance = u16Ms(player.rushDistance);
  player.abilityVectorX = Number.isFinite(player.abilityVectorX) ? player.abilityVectorX : 1;
  player.abilityVectorY = Number.isFinite(player.abilityVectorY) ? player.abilityVectorY : 0;
  player.abilityTickMs = Math.max(0, Number.isFinite(player.abilityTickMs) ? player.abilityTickMs : 0);
  player.abilityHits ??= "";
  ensureGatheringProgress(player);
}

export function itemQty(player: PlayerEntity, itemId: string) {
  return mmoInventory.get(player.inventory ?? EMPTY_NUMBER_MAP, canonicalItemId(itemId));
}

export function bankQty(player: PlayerEntity, itemId: string) {
  return mmoInventory.get(player.bank ?? EMPTY_NUMBER_MAP, canonicalItemId(itemId));
}

export function setItemQty(player: PlayerEntity, itemId: string, amount: number) {
  const canonicalId = canonicalItemId(itemId);
  if (amount <= 0) delete player.inventory[canonicalId];
  else player.inventory[canonicalId] = Math.max(0, Math.floor(amount));
  mmoInventory.compact(player.inventory);
}

export function addItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.add(player.inventory, canonicalItemId(itemId), amount);
}

export function spendItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.remove(player.inventory, canonicalItemId(itemId), amount);
}

export function hasInventoryItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.has(player.inventory ?? EMPTY_NUMBER_MAP, canonicalItemId(itemId), amount);
}

export function addBankItem(player: PlayerEntity, itemId: string, amount = 1) {
  return mmoInventory.add(player.bank, canonicalItemId(itemId), amount);
}

export function depositInventoryItem(player: PlayerEntity, itemId: string) {
  const amount = itemQty(player, itemId);
  if (amount <= 0) return 0;
  setItemQty(player, itemId, 0);
  addBankItem(player, itemId, amount);
  return amount;
}

export function hasQuestFlag(player: PlayerEntity, flag: string) {
  return hasMmoId(player.questFlags ?? EMPTY_BOOLEAN_MAP, flag);
}

export function addQuestBit(player: PlayerEntity, bit: string) {
  addMmoId(player.questFlags, bit);
}

export function acceptQuest(player: PlayerEntity, questId: string) {
  if (hasQuestFlag(player, questId)) return;
  addQuestBit(player, `${questId}-accepted`);
  if (!player.activeQuestId || hasQuestFlag(player, player.activeQuestId)) player.activeQuestId = questId;
}

export function slotForAbility(abilityId: string) {
  return ABILITY_SLOT_BY_ID[abilityId] ?? "";
}

export function unlockAbility(player: PlayerEntity, abilityId: string) {
  const slot = slotForAbility(abilityId);
  player.abilitySlots[abilityId] = slot || "known";
  if (slot) player.abilitySlots[slot] ??= "unlocked";
}

export function unlockSlot(player: PlayerEntity, slot: string) {
  player.abilitySlots[slot] ??= "unlocked";
}

export function hasAbility(player: PlayerEntity, abilityId: string) {
  return hasFlag(player.abilitySlots, abilityId);
}

export function hasGear(player: PlayerEntity, gearId: string) {
  return hasFlag(player.equipment, gearId);
}

export function grantItem(player: PlayerEntity, itemId: string, amount = 1) {
  addItem(player, itemId, amount);
}

export function equipItem(player: PlayerEntity, itemId: string) {
  grantItem(player, itemId);
  player.equipment[itemId] = itemId;
}
