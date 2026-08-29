import { bankQty, equippedWeaponForPlayer, hasInventoryItem, hasQuestFlag, itemQty, selectedAbilityForSlot } from "../shared-loadout.ts";
import { playerAbilityMetadata } from "../shared-ability-catalog.ts";
import { type MmoCatalogDef, type MmoSkillDemoState, type PlayerEntity } from "../shared-contracts.ts";
import { itemLabels } from "../data/assets.ts";
import { equipmentSlots, keyItemOrder } from "../data/ui.ts";
import type { WorldCraftingRecipe } from "../data/world-recipes.ts";
import { mainQuestGoalText } from "./quest-guide.ts";
import type { CombatSlot } from "./combat-view.ts";

export const SLOT_NAMES: Record<CombatSlot, string> = {
  LMB: "Pummel",
  RMB: "Slam",
  Space: "Rush",
  Q: "Berserk",
  E: "Boulder",
  R: "Whirlwind"
};

export function abilityNameForSlot(player: PlayerEntity | undefined, slot: CombatSlot) {
  const abilityId = selectedAbilityForSlot(player, slot);
  return playerAbilityMetadata[abilityId]?.name ?? SLOT_NAMES[slot];
}

export type FieldSlotReveal = {
  unlocked: boolean;
  status: string;
  hint: string;
};

export function fieldSlotReveal(player: PlayerEntity | undefined, slot: CombatSlot): FieldSlotReveal {
  if (!player) return { unlocked: true, status: "Ready", hint: "" };
  switch (slot) {
    case "LMB":
      return { unlocked: true, status: "Rowan's first lesson", hint: "Ashwood training" };
    case "RMB":
      return hasQuestFlag(player, "first-cut")
        ? { unlocked: true, status: "First Cut proof", hint: "First Cut" }
        : { unlocked: false, status: "First Cut", hint: "Bring Rowan 5 Ash Logs." };
    case "Space":
      return hasQuestFlag(player, "wolf-culling")
        ? { unlocked: true, status: "Road drill", hint: "Wolf Culling" }
        : { unlocked: false, status: "Wolf Culling", hint: "Secure the Ashwood road for Rowan." };
    case "Q":
      return hasQuestFlag(player, "silent-sands")
        ? { unlocked: true, status: "Silent Sands", hint: "Master Kael" }
        : { unlocked: false, status: "Silent Sands", hint: "Survive the Bazaar trial with Master Kael." };
    case "E":
      return hasQuestFlag(player, "root-of-the-problem") || player.dungeonBossKills > 0
        ? { unlocked: true, status: "Deep root proof", hint: "Overgrown Thicket" }
        : { unlocked: false, status: "Deep Root", hint: "Return with a dungeon relic." };
    case "R":
      return player.masteryRank >= 2 || hasQuestFlag(player, "breaking-golem") || hasQuestFlag(player, "kings-foil")
        ? { unlocked: true, status: "Mastery channel", hint: "Renown" }
        : { unlocked: false, status: "Mastery 2", hint: "Earn renown from quests and contracts." };
  }
}

export function labelize(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function worldEventLine(state: MmoSkillDemoState) {
  const seconds = Math.max(0, Math.ceil(state.worldEventTimerMs / 1000));
  if (state.worldEventPhase === "active") {
    return `${state.worldEventName}: ${Math.min(state.worldEventGoal, state.worldEventProgress)}/${state.worldEventGoal} (${seconds}s)`;
  }
  return `${labelize(state.worldEventPhase)}: ${state.worldEventReward} (${seconds}s)`;
}

export function nextGoal(player: PlayerEntity) {
  return mainQuestGoalText(player);
}

export const ITEM_LABELS = itemLabels;
export const KEY_ITEM_ORDER = keyItemOrder;
export const EQUIPMENT_SLOTS = equipmentSlots;

export function itemLabel(id: string) {
  return ITEM_LABELS[id] ?? labelize(id);
}

export function itemMeta(id: string, player: PlayerEntity) {
  switch (id) {
    case "training-hatchet":
      return "Starter woodcut tool";
    case "iron-hatchet":
      return "Faster Ash cuts";
    case "pickaxe":
      return "Unlocks Crags ore";
    case "mace":
      return "Melee weapon";
    case "bow":
      return "Ranged weapon";
    case "staff":
      return "Caster weapon";
    case "wand":
      return "Fast caster weapon";
    case "twin-blades":
      return "Assassin weapon";
    case "blade":
      return "Duelist weapon";
    case "leather-boots":
    case "mining-boots":
      return "Move speed gear";
    case "iron-chest":
      return "Damage reduction";
    case "ring-focus":
      return "Cooldown reduction";
    case "captains-map":
      return `Routes from ${labelize(player.zoneId)}`;
    case "cursed-idol":
      return "Risk unlock";
    case "broken-hilt":
      return "Dungeon component";
    case "elite-weapon":
      return "Combat damage bonus";
    case "unique-cape":
      return player.prestigeTitle || "Prestige reward";
    default:
      return "Owned";
  }
}

export type UiStringMap = Record<string, string>;
export type UiBooleanMap = Record<string, boolean>;

export const CATALOG_SECTIONS = [
  { id: "factions", label: "Factions", title: "Factions", groupBy: "zone" },
  { id: "expandedCreatures", label: "Bestiary", title: "Expanded Bestiary", groupBy: "zone" },
  { id: "reputationRewards", label: "Rep", title: "Reputation Rewards", groupBy: "zone" },
  { id: "craftingMaterials", label: "Mats", title: "Crafting Materials", groupBy: "role" }
] as const;

export type CatalogSectionId = (typeof CATALOG_SECTIONS)[number]["id"];
export type CatalogViewMode = "nearby" | "all";

export type FieldJournalEntry = {
  id: string;
  title: string;
  zoneId: string;
  kind: "thread" | "rumor" | "proof";
  visible: (player: PlayerEntity) => boolean;
  complete: (player: PlayerEntity) => boolean;
  summary: (player: PlayerEntity) => string;
  unlock: string;
  clue: string;
};

export const PROVING_CONTRACT_ID = "first-arms-proving";
export const PROVING_WEAPONS = ["mace", "bow", "staff", "wand", "twin-blades", "blade"] as const;
export const PROVING_LESSONS = [
  { id: "statuses", title: "Status Table", note: "Bleed, poison, slow, stun, shield, burn, and cleanse.", reward: "consumables + status field note" },
  { id: "crafting", title: "Craft Order", note: "Turn starter resources into first gear direction.", reward: "logs, ore, silk, gold" },
  { id: "buffs", title: "Buff Bench", note: "Practice food, potion, haste, regen, and safety timing.", reward: "potions + berries" },
  { id: "gathering", title: "Work Yard", note: "Try wood, ore, herb, and salvage reads.", reward: "tool voucher + common materials" },
  { id: "cities", title: "City Ledger", note: "Preview each city identity and what it unlocks.", reward: "route notes + faction intros" },
  { id: "travel", title: "Route Tickets", note: "Learn captain routes, escorts, and premium route costs.", reward: "map + travel purse" }
] as const;

export function provingSampleFlag(weaponId: string) {
  return `${PROVING_CONTRACT_ID}-sampled-${weaponId}`;
}

export function provingRewardFlag(weaponId: string) {
  return `${PROVING_CONTRACT_ID}-reward-${weaponId}`;
}

export function provingLessonFlag(lessonId: string) {
  return `first-arms-lesson-${lessonId}`;
}

export function provingSampleCount(player: PlayerEntity) {
  return PROVING_WEAPONS.filter((weaponId) => hasQuestFlag(player, provingSampleFlag(weaponId))).length;
}

export function catalogSectionById(id: CatalogSectionId) {
  return CATALOG_SECTIONS.find((section) => section.id === id) ?? CATALOG_SECTIONS[0];
}

export function catalogStoryZones(player: PlayerEntity) {
  const zones = new Set<string>(["ashwood", player.zoneId]);
  if (player.zoneId === "crags") zones.add("ironcrag");
  if (player.zoneId === "port-marrow") {
    zones.add("holy-reach");
    zones.add("whisperwind-ascent");
  }
  if (player.zoneId === "bazaar") zones.add("canaan-desert");
  if (hasQuestFlag(player, "first-cut")) zones.add("crags");
  if (hasQuestFlag(player, "wolf-culling")) zones.add("ashwood-wilderness");
  if (hasQuestFlag(player, "final-cut") || hasQuestFlag(player, "fast-travel-registered")) {
    zones.add("port-marrow");
    zones.add("holy-reach");
  }
  if (hasQuestFlag(player, "heavy-lifting")) {
    zones.add("canaan-desert");
    zones.add("bazaar");
    zones.add("whisperwind-ascent");
  }
  if (hasQuestFlag(player, "silent-sands") || hasInventoryItem(player, "void-resistant-cloak") || player.masteryRank >= 4) zones.add("void-rift");
  if (hasQuestFlag(player, "root-of-the-problem") || hasQuestFlag(player, "luminous-depths") || hasQuestFlag(player, "forbidden-scripts")) zones.add("dungeon");
  if (player.zoneId === "cottage" || hasQuestFlag(player, "lost-compass")) zones.add("cottage");
  return zones;
}

export function catalogEntryDiscovered(player: PlayerEntity, entry: MmoCatalogDef) {
  if (catalogStoryZones(player).has(entry.zoneId)) return true;
  if (entry.role === "starter" || entry.role === "tool" || entry.role === "woodcutting") return true;
  if (entry.zoneId === "dungeon") return hasQuestFlag(player, "wolf-culling") || player.dungeonBossKills > 0;
  return false;
}

export function catalogEntryHint(player: PlayerEntity, entry: MmoCatalogDef) {
  if (catalogEntryDiscovered(player, entry)) return entry.summary;
  if (entry.zoneId === "crags") return "Rowan's first proof points northwest toward ore and pickaxes.";
  if (entry.zoneId === "ashwood-wilderness") return "The wolf trail leaves the safe road after Rowan's culling work.";
  if (entry.zoneId === "port-marrow" || entry.zoneId === "holy-reach") return "Captain Marrow names this route after Ashwood is secured.";
  if (entry.zoneId === "canaan-desert" || entry.zoneId === "bazaar") return "Foreman work and dock rumors point toward desert survival trials.";
  if (entry.zoneId === "whisperwind-ascent") return "Mountain runners mention it once the Ironcrag route feels familiar.";
  if (entry.zoneId === "void-rift") return "Void work waits for cloak, relic, or mastery proof.";
  if (entry.zoneId === "dungeon") return "Dungeon names surface through Rowan, town relics, and boss trophies.";
  return "Locals will name this when its route matters.";
}

export const FIELD_JOURNAL_ENTRIES: FieldJournalEntry[] = [
  {
    id: "first-arms-proving",
    title: "First Arms Board",
    zoneId: "ashwood",
    kind: "thread",
    visible: (player) => !hasQuestFlag(player, PROVING_CONTRACT_ID),
    complete: (player) => hasQuestFlag(player, PROVING_CONTRACT_ID),
    summary: (player) => hasQuestFlag(player, `${PROVING_CONTRACT_ID}-accepted`)
      ? `Loaner trials marked: ${provingSampleCount(player)}/3 before the board pays out.`
      : "Rowan's practice board pays for optional weapon trials before normal field work.",
    unlock: "chosen weapon, starter purse, lesson contracts",
    clue: "Practice Board"
  },
  {
    id: "first-arms-lessons",
    title: "Paid Lesson Contracts",
    zoneId: "ashwood",
    kind: "proof",
    visible: (player) => hasQuestFlag(player, PROVING_CONTRACT_ID),
    complete: (player) => PROVING_LESSONS.every((lesson) => hasQuestFlag(player, provingLessonFlag(lesson.id))),
    summary: (player) => {
      const done = PROVING_LESSONS.filter((lesson) => hasQuestFlag(player, provingLessonFlag(lesson.id))).length;
      return `${done}/${PROVING_LESSONS.length} follow-up lessons paid: statuses, crafting, buffs, gathering, cities, and travel.`;
    },
    unlock: "starter resources, route notes, tools, consumables",
    clue: "Field Journal"
  },
  {
    id: "rowan-first-proof",
    title: "Soft Root Proof",
    zoneId: "ashwood",
    kind: "thread",
    visible: () => true,
    complete: (player) => hasQuestFlag(player, "first-cut"),
    summary: (player) => hasQuestFlag(player, "first-cut")
      ? "Rowan trusts your cuts and points toward heavier lessons."
      : `Rowan wants clean Ash cuts: ${Math.min(5, itemQty(player, "ash-logs") + bankQty(player, "ash-logs"))}/5.`,
    unlock: "RMB lesson, Iron Hatchet, Ironcrag rumors",
    clue: "Elder Rowan"
  },
  {
    id: "road-rush",
    title: "Road Rush Drill",
    zoneId: "ashwood",
    kind: "thread",
    visible: (player) => hasQuestFlag(player, "first-cut"),
    complete: (player) => hasQuestFlag(player, "wolf-culling"),
    summary: (player) => hasQuestFlag(player, "wolf-culling")
      ? "The road is quiet enough for Rowan's movement drill."
      : `The pack still owns the path: ${Math.min(10, player.wolfKills)}/10.`,
    unlock: "Space movement slot, Ashwood Wilderness rumors",
    clue: "Elder Rowan"
  },
  {
    id: "captain-route",
    title: "Captain's Route Pledge",
    zoneId: "port-marrow",
    kind: "thread",
    visible: (player) => hasQuestFlag(player, "wolf-culling"),
    complete: (player) => hasQuestFlag(player, "fast-travel-registered"),
    summary: (player) => hasQuestFlag(player, "fast-travel-registered")
      ? "Marrow has Ashwood on the route slate."
      : hasQuestFlag(player, "final-cut")
        ? "Find Captain Marrow; register Ashwood before chasing new dock routes."
        : "Rowan wants one last pledge before the captain opens the road.",
    unlock: "Port Marrow, route board, broader Codex",
    clue: "Captain Marrow"
  },
  {
    id: "ironcrag-forge",
    title: "Ironcrag Forge Permit",
    zoneId: "crags",
    kind: "rumor",
    visible: (player) => hasQuestFlag(player, "final-cut") || hasQuestFlag(player, "fast-travel-registered") || player.zoneId === "crags",
    complete: (player) => hasInventoryItem(player, "pickaxe") || Boolean(player.equipment?.pickaxe),
    summary: (player) => hasInventoryItem(player, "pickaxe") || Boolean(player.equipment?.pickaxe)
      ? "Foreman Iron-Will sold you a proper pick."
      : hasQuestFlag(player, "fast-travel-registered") || player.zoneId === "crags"
        ? "Buy a Pickaxe from Foreman Iron-Will before desert rumors matter."
        : "Marrow's route pledge points northwest toward ore crews and pickaxes.",
    unlock: "Pickaxe, ore banking, mining gear",
    clue: "Foreman Iron-Will"
  },
  {
    id: "silent-sands",
    title: "Silent Sands Trial",
    zoneId: "bazaar",
    kind: "rumor",
    visible: (player) => hasQuestFlag(player, "heavy-lifting") || hasQuestFlag(player, "heavy-lifting-ready") || player.zoneId === "bazaar",
    complete: (player) => hasQuestFlag(player, "silent-sands"),
    summary: (player) => hasQuestFlag(player, "silent-sands")
      ? "Master Kael's ruin lesson is marked in your stance work."
      : `Bazaar pressure held: ${Math.min(120, Math.floor(player.bazaarSurvivalMs / 1000))}/120s.`,
    unlock: "Q stance lesson, elite survival rumors",
    clue: "Master Kael"
  },
  {
    id: "void-rumor",
    title: "Black Edge Rumor",
    zoneId: "void-rift",
    kind: "rumor",
    visible: (player) => hasQuestFlag(player, "silent-sands") || player.masteryRank >= 3 || hasInventoryItem(player, "void-resistant-cloak"),
    complete: (player) => hasInventoryItem(player, "void-resistant-cloak") || hasQuestFlag(player, "seal-the-rift"),
    summary: (player) => hasInventoryItem(player, "void-resistant-cloak") || hasQuestFlag(player, "seal-the-rift")
      ? "The rift route has protection marked beside it."
      : "Dock alchemists say the black edge burns anyone without proof or protection.",
    unlock: "Void route, cloak prep, endgame faction work",
    clue: "Alchemist Zora"
  }
];

export type CraftRuntimeAction = "interact" | "trade";
export type CraftRuntimeRoute = {
  action: CraftRuntimeAction;
  npcKinds: readonly string[];
  label: string;
  note: string;
};

export const RUNTIME_CRAFT_ROUTES_BY_OUTPUT: Record<string, CraftRuntimeRoute> = {
  pickaxe: {
    action: "interact",
    npcKinds: ["foreman-iron-will"],
    label: "Foreman station",
    note: "Runtime can target the foreman, but exact recipe id is only carried as devText."
  },
  "iron-chest": {
    action: "interact",
    npcKinds: ["blacksmith-silas", "blacksmith"],
    label: "Blacksmith station",
    note: "Runtime blacksmith crafts the first available matching station recipe."
  },
  "ring-focus": {
    action: "interact",
    npcKinds: ["blacksmith-silas", "blacksmith"],
    label: "Blacksmith station",
    note: "Runtime blacksmith crafts the first available matching station recipe."
  },
  "speed-potion": {
    action: "trade",
    npcKinds: ["alchemist-zora", "merchant-kaya"],
    label: "Potion vendor",
    note: "Runtime trade uses the current alchemy or merchant craft queue."
  },
  "cinder-ale": {
    action: "trade",
    npcKinds: ["alchemist-zora", "merchant-kaya"],
    label: "Provision vendor",
    note: "Runtime trade uses the current alchemy or merchant craft queue."
  },
  "void-resistant-cloak": {
    action: "trade",
    npcKinds: ["alchemist-zora"],
    label: "Alchemist station",
    note: "Runtime alchemist can make the current Void cloak route."
  }
};

export function primaryRecipeOutput(recipe: WorldCraftingRecipe) {
  return recipe.outputs[0]?.itemId ?? "";
}

export function recordKey(record: Record<string, string | number | boolean | undefined> | undefined) {
  if (!record) return "";
  return Object.keys(record)
    .sort()
    .map((key) => `${key}:${String(record[key])}`)
    .join(",");
}

export function playerEquipment(player: PlayerEntity) {
  return player.equipment ?? {};
}

export function mutablePlayerEquipment(player: PlayerEntity) {
  return (player.equipment ??= {});
}

export function playerAbilitySlots(player: PlayerEntity) {
  return player.abilitySlots ?? {};
}

export function playerQuestFlags(player: PlayerEntity) {
  return player.questFlags ?? {};
}

export function panelRenderKey(activePanel: string, player: PlayerEntity, state: MmoSkillDemoState) {
  const equipment = recordKey(player.equipment);
  const inventory = recordKey(player.inventory);
  const bank = recordKey(player.bank);
  const abilitySlots = recordKey(player.abilitySlots);
  const questFlags = recordKey(player.questFlags);
  switch (activePanel) {
    case "quest":
      return [
        activePanel,
        player.zoneId,
        player.activeQuestId,
        player.dailyQuestDate,
        player.dailyQuestStep,
        player.dailyQuestProgress,
        player.dailyQuestCompleted,
        player.dailyQuestResult,
        player.contractId,
        player.contractKills,
        player.contractCooldownMs > 0 ? Math.ceil(player.contractCooldownMs / 1000) : 0,
        player.wolfKills,
        Math.floor(player.bazaarSurvivalMs / 1000),
        inventory,
        bank,
        questFlags
      ].join("|");
    case "event":
      return [
        activePanel,
        state.worldEventId,
        state.worldEventName,
        state.worldEventPhase,
        state.worldEventProgress,
        state.worldEventGoal,
        Math.ceil(state.worldEventTimerMs / 1000),
        state.worldEventReward,
        state.worldEventObjective
      ].join("|");
    case "bag":
      return [activePanel, player.zoneId, player.gold, player.renown, player.masteryRank, inventory, bank, equipment, player.prestigeTitle].join("|");
    case "gear":
    case "skills":
      return [activePanel, equipment, inventory, abilitySlots, questFlags, player.masteryRank, player.dungeonBossKills, player.wolfKills].join("|");
    case "stats":
      return [
        activePanel,
        player.hp,
        player.maxHp,
        player.mana,
        player.maxMana,
        player.combatLevel,
        player.combatXp,
        player.miningLevel,
        player.miningXp,
        player.woodcuttingLevel,
        player.woodcuttingXp,
        player.masteryRank,
        player.renown,
        equippedWeaponForPlayer(player),
        equipment,
        abilitySlots,
        Object.keys(state.entities).length
      ].join("|");
    case "catalog":
      return [activePanel, player.zoneId, player.masteryRank, player.dungeonBossKills, inventory, bank, questFlags].join("|");
    case "journal":
      return [
        activePanel,
        player.zoneId,
        player.activeQuestId,
        player.wolfKills,
        Math.floor(player.bazaarSurvivalMs / 1000),
        player.masteryRank,
        player.dungeonBossKills,
        inventory,
        bank,
        questFlags
      ].join("|");
    case "craft":
      return [
        activePanel,
        player.zoneId,
        Math.floor(player.x / 24),
        Math.floor(player.y / 24),
        player.gold,
        inventory,
        questFlags,
        Object.values(state.npcs).filter((npc) => npc.zoneId === player.zoneId && npc.hp > 0).map((npc) => `${npc.kind}:${Math.floor(npc.x / 24)}:${Math.floor(npc.y / 24)}`).sort().join(",")
      ].join("|");
    default:
      return activePanel;
  }
}
