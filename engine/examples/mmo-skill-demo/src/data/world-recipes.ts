import type { WorldFactionId } from "./world-factions.ts";
import type { WorldCraftingMaterialId } from "./world-materials.ts";
import { groupByKey, indexUniqueBy } from "./indexing.ts";

export type ExistingGameplayItemId =
  | "ash-logs"
  | "cinder-ale"
  | "glade-berries"
  | "iron-chest"
  | "iron-ore"
  | "leather-boots"
  | "pickaxe"
  | "ring-focus"
  | "silk-thread"
  | "speed-potion"
  | "void-resistant-cloak";

export type FutureCraftedItemId =
  | "aether-brass-sigil"
  | "brambleguard-bulwark"
  | "coin-scent-charm"
  | "feral-blood-salve"
  | "gale-feather-wraps";

export type WorldRecipeItemId = ExistingGameplayItemId | FutureCraftedItemId | WorldCraftingMaterialId;

export type WorldRecipeStack = {
  itemId: WorldRecipeItemId;
  amount: number;
};

export type WorldCraftingStation =
  | "alchemist-lab"
  | "arbor-loom"
  | "bazaar-vault"
  | "field-kitchen"
  | "forge"
  | "harbor-still"
  | "holy-archive"
  | "hunting-camp"
  | "mountain-shrine"
  | "void-crucible";

export type WorldCraftingRecipe = {
  id: string;
  station: WorldCraftingStation;
  factionId: WorldFactionId;
  inputs: readonly WorldRecipeStack[];
  outputs: readonly WorldRecipeStack[];
  summary: string;
};

export const worldCraftingRecipes = [
  {
    id: "oakhaven-glade-berry-tonic",
    station: "field-kitchen",
    factionId: "oakhaven",
    inputs: [
      { itemId: "bright-clover-flower", amount: 2 },
      { itemId: "oak-sap-extract", amount: 1 },
      { itemId: "miller-coarse-flour", amount: 1 }
    ],
    outputs: [{ itemId: "glade-berries", amount: 3 }],
    summary: "Sylvan provision blend that turns forest remedies and mill stores into combat healing food."
  },
  {
    id: "oakhaven-softstep-boots",
    station: "arbor-loom",
    factionId: "oakhaven",
    inputs: [
      { itemId: "wolf-hide-strip", amount: 2 },
      { itemId: "soft-pine-bark", amount: 1 },
      { itemId: "scout-route-marker", amount: 1 }
    ],
    outputs: [{ itemId: "leather-boots", amount: 1 }],
    summary: "Quiet trail boots that convert beast hide and route lore into early movement gear."
  },
  {
    id: "ironcrag-prospectors-pickaxe",
    station: "forge",
    factionId: "ironcrag",
    inputs: [
      { itemId: "ash-logs", amount: 3 },
      { itemId: "iron-ore", amount: 4 },
      { itemId: "guild-copper-token", amount: 1 }
    ],
    outputs: [{ itemId: "pickaxe", amount: 1 }],
    summary: "Guild-stamped mining tool that turns common wood and ore into progression-critical extraction access."
  },
  {
    id: "ironcrag-iron-chestplate",
    station: "forge",
    factionId: "ironcrag",
    inputs: [
      { itemId: "refined-iron-ingot", amount: 3 },
      { itemId: "steel-plate-plate", amount: 2 },
      { itemId: "soot-forge-coke", amount: 1 }
    ],
    outputs: [{ itemId: "iron-chest", amount: 1 }],
    summary: "Durable Vulcan torso armor using refined ingots, steel plate, and high-grade forge fuel."
  },
  {
    id: "ironcrag-cinder-ale-cask",
    station: "forge",
    factionId: "ironcrag",
    inputs: [
      { itemId: "wild-oats-bundle", amount: 2 },
      { itemId: "fine-coal-lump", amount: 1 },
      { itemId: "zinc-clinker", amount: 1 }
    ],
    outputs: [{ itemId: "cinder-ale", amount: 2 }],
    summary: "Heat-fermented ration drink that converts grain and furnace catalysts into mana supplies."
  },
  {
    id: "aetheria-ring-focus",
    station: "holy-archive",
    factionId: "aetheria",
    inputs: [
      { itemId: "silk-thread", amount: 3 },
      { itemId: "tumbled-quartz", amount: 2 },
      { itemId: "ancient-script-scroll", amount: 1 }
    ],
    outputs: [{ itemId: "ring-focus", amount: 1 }],
    summary: "Archive-bound focus ring that channels silk, crystal, and old formulas into cooldown gear."
  },
  {
    id: "aetheria-aether-brass-sigil",
    station: "holy-archive",
    factionId: "aetheria",
    inputs: [
      { itemId: "aether-brass-ingot", amount: 2 },
      { itemId: "solos-emblem", amount: 1 },
      { itemId: "inquisition-sealing-wax", amount: 1 }
    ],
    outputs: [{ itemId: "aether-brass-sigil", amount: 1 }],
    summary: "Radiant future upgrade component for law-bound holy damage and archive progression."
  },
  {
    id: "port-marrow-speed-potion",
    station: "harbor-still",
    factionId: "port-marrow",
    inputs: [
      { itemId: "marrow-cove-brine", amount: 1 },
      { itemId: "sassafras-leaves", amount: 2 },
      { itemId: "captain-smuggled-rum", amount: 1 }
    ],
    outputs: [{ itemId: "speed-potion", amount: 2 }],
    summary: "Cove stimulant that turns sea brine and smuggled spirits into short mobility bursts."
  },
  {
    id: "port-marrow-void-cloak-lining",
    station: "alchemist-lab",
    factionId: "port-marrow",
    inputs: [
      { itemId: "abyssal-eel-hide", amount: 1 },
      { itemId: "tide-stalker-scale", amount: 2 },
      { itemId: "marrow-cove-brine", amount: 1 }
    ],
    outputs: [{ itemId: "void-resistant-cloak", amount: 1 }],
    summary: "Maritime alchemy route for a Void-resistant cloak using deep-sea insulation and preserving brine."
  },
  {
    id: "sunken-bazaar-coin-scent-charm",
    station: "bazaar-vault",
    factionId: "sunken-bazaar",
    inputs: [
      { itemId: "dust-syndicate-stamp", amount: 1 },
      { itemId: "syndicate-debt-note", amount: 2 },
      { itemId: "bazaar-glass-bottle", amount: 1 }
    ],
    outputs: [{ itemId: "coin-scent-charm", amount: 1 }],
    summary: "Merchant charm for future gold-drop tuning, bound through contracts, debt, and sealed antiques."
  },
  {
    id: "obsidian-sanctum-void-resistant-cloak",
    station: "void-crucible",
    factionId: "obsidian-sanctum",
    inputs: [
      { itemId: "void-forged-plate", amount: 1 },
      { itemId: "pure-void-tear", amount: 1 },
      { itemId: "nihil-ash-sludge", amount: 2 }
    ],
    outputs: [{ itemId: "void-resistant-cloak", amount: 1 }],
    summary: "Dangerous Nihil route for Void-entry gear, trading purity for direct exposure to rift matter."
  },
  {
    id: "ashwood-glade-brambleguard-bulwark",
    station: "hunting-camp",
    factionId: "ashwood-glade",
    inputs: [
      { itemId: "bramble-thorn-vine", amount: 3 },
      { itemId: "scythe-seed-claws", amount: 2 },
      { itemId: "outcast-hunt-skull", amount: 1 }
    ],
    outputs: [{ itemId: "brambleguard-bulwark", amount: 1 }],
    summary: "Primal future shield component that turns predator trophies and living thorns into retaliation gear."
  },
  {
    id: "ashwood-glade-feral-blood-salve",
    station: "hunting-camp",
    factionId: "ashwood-glade",
    inputs: [
      { itemId: "feral-blood-vial", amount: 1 },
      { itemId: "bitter-root-herb", amount: 2 },
      { itemId: "spore-dust-cloud", amount: 1 }
    ],
    outputs: [{ itemId: "feral-blood-salve", amount: 1 }],
    summary: "Outcast combat salve for future low-health burst effects and wild aggression rewards."
  },
  {
    id: "high-reach-gale-feather-wraps",
    station: "mountain-shrine",
    factionId: "high-reach-peaks",
    inputs: [
      { itemId: "high-peak-feather", amount: 3 },
      { itemId: "wind-weave-sigil", amount: 1 },
      { itemId: "monastic-sage-tea", amount: 1 }
    ],
    outputs: [{ itemId: "gale-feather-wraps", amount: 1 }],
    summary: "Ascetic future movement wraps that combine feather guidance, wind sigils, and clarity rites."
  }
] as const satisfies readonly WorldCraftingRecipe[];

export type WorldCraftingRecipeId = (typeof worldCraftingRecipes)[number]["id"];

export const worldCraftingRecipeMap: Record<WorldCraftingRecipeId, WorldCraftingRecipe> = indexUniqueBy(worldCraftingRecipes, (recipe) => recipe.id);

export const worldCraftingRecipesByFaction: Record<WorldFactionId, readonly WorldCraftingRecipe[]> = groupByKey(worldCraftingRecipes, (recipe) => recipe.factionId);

export const worldCraftingRecipesByStation = Object.fromEntries(
  worldCraftingRecipes.map((recipe) => recipe.station).map((station) => [
    station,
    worldCraftingRecipes.filter((recipe) => recipe.station === station)
  ])
) as Partial<Record<WorldCraftingStation, readonly WorldCraftingRecipe[]>>;

export function getWorldCraftingRecipe(id: WorldCraftingRecipeId) {
  return worldCraftingRecipeMap[id];
}
