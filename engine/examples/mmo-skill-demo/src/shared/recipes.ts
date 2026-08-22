export type GatheringSkillId =
  | "lumberjacking"
  | "mining"
  | "foraging"
  | "quarrying"
  | "fishing"
  | "skinning"
  | "crop-harvesting"
  | "scavenging"
  | "essence-siphoning"
  | "apiculture"
  | "sap-tapping"
  | "spore-hunting"
  | "dredging"
  | "archaeology"
  | "hunting"
  | "gemology";

export type MaterialTier = 1 | 2 | 3 | 4 | 5;

export type CraftingRecipeTier = 3 | 4 | 5;

export type CraftingRecipeCategory =
  | "armor"
  | "weapon"
  | "tool"
  | "consumable"
  | "trinket"
  | "structure"
  | "vessel"
  | "ritual";

export type CraftingStation =
  | "alchemist-lab"
  | "apiary-press"
  | "archaeology-table"
  | "arbor-loom"
  | "dredge-kiln"
  | "field-kitchen"
  | "forge"
  | "gemcutters-bench"
  | "harbor-still"
  | "hunter-camp"
  | "siege-yard"
  | "spore-lab"
  | "tannery"
  | "void-crucible";

export type CraftingRecipeInput = {
  materialId?: string | number;
  materialName: string;
  skillId: GatheringSkillId;
  tier: MaterialTier;
  quantity: number;
};

export type CraftingRecipeEffect = {
  id: string;
  description: string;
};

export type CraftingRecipe = {
  id: string;
  outputId: string;
  outputName: string;
  outputCategory: CraftingRecipeCategory;
  outputTier: CraftingRecipeTier;
  outputQuantity?: number;
  inputs: readonly CraftingRecipeInput[];
  station: CraftingStation;
  whySynergy: string;
  lore: string;
  effects?: readonly CraftingRecipeEffect[];
};

export type MaterialCatalogEntry = {
  id?: string | number;
  name: string;
};

export type MaterialResolver = {
  hasMaterialId?: (id: string | number) => boolean;
  hasMaterialName?: (name: string) => boolean;
};

export type RecipeValidationIssue = {
  recipeId: string;
  code: "duplicate-id" | "empty-inputs" | "invalid-quantity" | "single-skill-inputs" | "unresolved-material";
  message: string;
};

export type RecipeValidationResult = {
  valid: boolean;
  issues: readonly RecipeValidationIssue[];
};

const materialAliases = {
  pineWood: ["Pine Wood", "lumberjacking", 1],
  elderBirch: ["Elder Birch", "lumberjacking", 2],
  sylvanOak: ["Sylvan Oak", "lumberjacking", 3],
  ghostwood: ["Ghostwood", "lumberjacking", 4],
  worldTreeHeart: ["Heart of World-Tree", "lumberjacking", 5],
  copperDust: ["Copper Dust", "mining", 1],
  coalShell: ["Coal Shell", "mining", 2],
  trueSilver: ["True Silver", "mining", 3],
  voidShardOre: ["Void Shard Ore", "mining", 4],
  astralIron: ["Astral Iron", "mining", 5],
  bloodrose: ["Bloodrose", "foraging", 1],
  earthroot: ["Earthroot", "foraging", 2],
  moonlily: ["Moonlily", "foraging", 3],
  voidbloom: ["Voidbloom", "foraging", 4],
  eternityLeaf: ["Eternity Leaf", "foraging", 5],
  sandstone: ["Sandstone", "quarrying", 1],
  graniteSlab: ["Granite Slab", "quarrying", 2],
  whiteMarble: ["White Marble", "quarrying", 3],
  darkBasalt: ["Dark Basalt", "quarrying", 4],
  nullGeodeBlock: ["Null-Geode Block", "quarrying", 5],
  bitterTail: ["Bitter-Tail", "fishing", 1],
  silverGill: ["Silver-Gill", "fishing", 2],
  tideEel: ["Tide-Eel", "fishing", 3],
  abyssalStalker: ["Abyssal Stalker", "fishing", 4],
  leviathanScaleFish: ["Leviathan Scale-Fish", "fishing", 5],
  rawPelt: ["Raw Pelt", "skinning", 1],
  cragHide: ["Crag Hide", "skinning", 2],
  direLeather: ["Dire Leather", "skinning", 3],
  shadowPelt: ["Shadow Pelt", "skinning", 4],
  behemothHide: ["Behemoth Hide", "skinning", 5],
  wildFlax: ["Wild Flax", "crop-harvesting", 1],
  ryeGrain: ["Rye Grain", "crop-harvesting", 2],
  gossypiumCotton: ["Gossypium Cotton", "crop-harvesting", 3],
  twilightSkyOats: ["Twilight Sky-Oats", "crop-harvesting", 4],
  sunThreadFiber: ["Sun-Thread Fiber", "crop-harvesting", 5],
  scrapIron: ["Scrap Iron", "scavenging", 1],
  driftwood: ["Driftwood", "scavenging", 2],
  brassGear: ["Brass Gear", "scavenging", 3],
  airshipRib: ["Airship Rib", "scavenging", 4],
  sunkenEngineCore: ["Sunken Engine Core", "scavenging", 5],
  leySparks: ["Ley-Sparks", "essence-siphoning", 1],
  aetherDrift: ["Aether Drift", "essence-siphoning", 2],
  voidMote: ["Void Mote", "essence-siphoning", 3],
  astralTear: ["Astral Tear", "essence-siphoning", 4],
  cosmicShard: ["Cosmic Shard", "essence-siphoning", 5],
  honeycomb: ["Honeycomb", "apiculture", 1],
  broodWax: ["Brood Wax", "apiculture", 2],
  guardVenom: ["Guard Venom", "apiculture", 3],
  royalJelly: ["Royal Jelly", "apiculture", 4],
  goldenNectar: ["Golden Nectar", "apiculture", 5],
  pineAmber: ["Pine Amber", "sap-tapping", 1],
  sweetResin: ["Sweet Resin", "sap-tapping", 2],
  corruptedTar: ["Corrupted Tar", "sap-tapping", 3],
  voidPitch: ["Void Pitch", "sap-tapping", 4],
  yggdrasilElixir: ["Yggdrasil Elixir", "sap-tapping", 5],
  puffballCap: ["Puffball Cap", "spore-hunting", 1],
  phosphorFungi: ["Phosphor Fungi", "spore-hunting", 2],
  glowSpore: ["Glow-Spore", "spore-hunting", 3],
  deathCap: ["Death Cap", "spore-hunting", 4],
  myceliumVoidCord: ["Mycelium Void-Cord", "spore-hunting", 5],
  riverClay: ["River Clay", "dredging", 1],
  deepCanalSilt: ["Deep Canal Silt", "dredging", 2],
  brimstoneMud: ["Brimstone Mud", "dredging", 3],
  volcanicSlag: ["Volcanic Slag", "dredging", 4],
  deepAbyssalClay: ["Deep Abyssal Clay", "dredging", 5],
  fossilChunk: ["Fossil Chunk", "archaeology", 1],
  rustedSeal: ["Rusted Seal", "archaeology", 2],
  cryptPlate: ["Crypt Plate", "archaeology", 3],
  ancientScroll: ["Ancient Scroll", "archaeology", 4],
  sealOfArchon: ["Seal of the Archon", "archaeology", 5],
  gameMeat: ["Game Meat", "hunting", 1],
  muskGland: ["Musk Gland", "hunting", 2],
  hornCore: ["Horn Core", "hunting", 3],
  alphaCanine: ["Alpha Canine", "hunting", 4],
  primalHeart: ["Primal Heart", "hunting", 5],
  rawQuartz: ["Raw Quartz", "gemology", 1],
  roseGarnet: ["Rose Garnet", "gemology", 2],
  blueSapphire: ["Blue Sapphire", "gemology", 3],
  voidDiamond: ["Void Diamond", "gemology", 4],
  prismGeodeCrystal: ["Prism Geode Crystal", "gemology", 5]
} as const satisfies Record<string, readonly [string, GatheringSkillId, MaterialTier]>;

type MaterialAlias = keyof typeof materialAliases;

function input(alias: MaterialAlias, quantity: number): CraftingRecipeInput {
  const [materialName, skillId, tier] = materialAliases[alias];
  return { materialName, skillId, tier, quantity };
}

function effect(id: string, description: string): CraftingRecipeEffect {
  return { id, description };
}

function recipe(definition: CraftingRecipe): CraftingRecipe {
  return definition;
}

export const craftingRecipes = [
  recipe({
    id: "moonlit-ranger-hood",
    outputId: "moonlit-ranger-hood",
    outputName: "Moonlit Ranger Hood",
    outputCategory: "armor",
    outputTier: 3,
    inputs: [input("moonlily", 2), input("direLeather", 2), input("glowSpore", 1)],
    station: "tannery",
    whySynergy: "Moonlily calms night vision, Dire Leather holds shape, Glow-Spore marks safe trails in caves.",
    lore: "Ashwood scouts wear this hood when border paths cross spore vents and moonlit ambush routes.",
    effects: [effect("low-light-readability", "Improves dark-area target contrast.")]
  }),
  recipe({
    id: "silver-sapper-pick",
    outputId: "silver-sapper-pick",
    outputName: "Silver Sapper Pick",
    outputCategory: "tool",
    outputTier: 3,
    inputs: [input("trueSilver", 2), input("brassGear", 2), input("graniteSlab", 1)],
    station: "forge",
    whySynergy: "True Silver bites enchanted ore, Brass Gear regulates strike rhythm, Granite Slab anchors the head.",
    lore: "Mine crews issue these to crack seams that attract mechanical scavenger guilds.",
    effects: [effect("seam-pressure", "Improves stability during ore extraction.")]
  }),
  recipe({
    id: "tide-eel-filament-rod",
    outputId: "tide-eel-filament-rod",
    outputName: "Tide-Eel Filament Rod",
    outputCategory: "tool",
    outputTier: 3,
    inputs: [input("tideEel", 2), input("sylvanOak", 1), input("sweetResin", 2)],
    station: "harbor-still",
    whySynergy: "Tide-Eel nerves flex under current, Sylvan Oak resists snapping, Sweet Resin seals the line.",
    lore: "Port fishers built it after reef storms began pulling ordinary hooks into deep trenches.",
    effects: [effect("reef-pull", "Reduces fishing break risk in reef zones.")]
  }),
  recipe({
    id: "marble-hive-censer",
    outputId: "marble-hive-censer",
    outputName: "Marble Hive Censer",
    outputCategory: "trinket",
    outputTier: 3,
    inputs: [input("whiteMarble", 2), input("broodWax", 3), input("aetherDrift", 1)],
    station: "apiary-press",
    whySynergy: "White Marble stays cool, Brood Wax burns slow, Aether Drift spreads calming scent through hives.",
    lore: "Apiarists use this censer to harvest active comb without collapsing faction-protected colonies.",
    effects: [effect("hive-calm", "Softens low-tier hive hazard rolls.")]
  }),
  recipe({
    id: "crag-hide-quarry-gloves",
    outputId: "crag-hide-quarry-gloves",
    outputName: "Crag-Hide Quarry Gloves",
    outputCategory: "armor",
    outputTier: 3,
    inputs: [input("cragHide", 2), input("whiteMarble", 1), input("brimstoneMud", 1)],
    station: "dredge-kiln",
    whySynergy: "Crag Hide protects knuckles, White Marble dust reduces chip friction, Brimstone Mud hardens seams.",
    lore: "Stonewrights wear them where quarry blocks still vent old volcanic heat.",
    effects: [effect("chip-control", "Improves quarrying control on brittle blocks.")]
  }),
  recipe({
    id: "sky-oat-battle-bread",
    outputId: "sky-oat-battle-bread",
    outputName: "Sky-Oat Battle Bread",
    outputCategory: "consumable",
    outputTier: 4,
    outputQuantity: 3,
    inputs: [input("twilightSkyOats", 3), input("goldenNectar", 1), input("gameMeat", 2)],
    station: "field-kitchen",
    whySynergy: "Twilight oats provide slow energy, Golden Nectar seals spoilage, Game Meat adds field protein.",
    lore: "High-Reach patrols bake this for long climbs where supply wagons cannot follow.",
    effects: [effect("stamina-ration", "Restores stamina over time.")]
  }),
  recipe({
    id: "brimstone-canal-charge",
    outputId: "brimstone-canal-charge",
    outputName: "Brimstone Canal Charge",
    outputCategory: "tool",
    outputTier: 3,
    inputs: [input("brimstoneMud", 2), input("coalShell", 2), input("scrapIron", 3)],
    station: "siege-yard",
    whySynergy: "Brimstone Mud burns hot, Coal Shell sustains ignition, Scrap Iron directs pressure into blocked canals.",
    lore: "Dredgers use these charges to open silted routes before rival ports tax the passage.",
    effects: [effect("controlled-blast", "Clears light obstruction nodes.")]
  }),
  recipe({
    id: "crypt-plate-lantern",
    outputId: "crypt-plate-lantern",
    outputName: "Crypt Plate Lantern",
    outputCategory: "trinket",
    outputTier: 3,
    inputs: [input("cryptPlate", 1), input("glowSpore", 2), input("rawQuartz", 2)],
    station: "archaeology-table",
    whySynergy: "Crypt Plate shields the flame, Glow-Spore creates soft light, Raw Quartz focuses inscriptions.",
    lore: "Archaeologists favor it because tomb seals punish open fire but tolerate fungus light.",
    effects: [effect("relic-light", "Reveals nearby archaeology interactables.")]
  }),
  recipe({
    id: "guard-venom-barb-trap",
    outputId: "guard-venom-barb-trap",
    outputName: "Guard-Venom Barb Trap",
    outputCategory: "tool",
    outputTier: 3,
    inputs: [input("guardVenom", 2), input("hornCore", 2), input("brassGear", 1)],
    station: "hunter-camp",
    whySynergy: "Guard Venom weakens prey, Horn Core forms the barb, Brass Gear times the snap.",
    lore: "Hunters set these around contested hives where beasts learned to avoid simple snares.",
    effects: [effect("snare-venom", "Applies short slow on trap trigger.")]
  }),
  recipe({
    id: "rose-garnet-resin-ring",
    outputId: "rose-garnet-resin-ring",
    outputName: "Rose Garnet Resin Ring",
    outputCategory: "trinket",
    outputTier: 3,
    inputs: [input("roseGarnet", 2), input("sweetResin", 2), input("moonlily", 1)],
    station: "gemcutters-bench",
    whySynergy: "Rose Garnet stores warmth, Sweet Resin binds without metal, Moonlily steadies pulse magic.",
    lore: "Field medics trade for this ring because it works even when metal tools draw lightning.",
    effects: [effect("pulse-steadiness", "Improves minor healing-channel reliability.")]
  }),
  recipe({
    id: "sylvan-loom-bow",
    outputId: "sylvan-loom-bow",
    outputName: "Sylvan Loom Bow",
    outputCategory: "weapon",
    outputTier: 3,
    inputs: [input("sylvanOak", 2), input("gossypiumCotton", 3), input("direLeather", 1)],
    station: "arbor-loom",
    whySynergy: "Sylvan Oak bends cleanly, Cotton twists into string, Dire Leather protects the grip.",
    lore: "Border rangers call it proof that farms and forests can arm the same militia.",
    effects: [effect("steady-draw", "Improves bow draw stability.")]
  }),
  recipe({
    id: "void-mote-ink-scroll",
    outputId: "void-mote-ink-scroll",
    outputName: "Void-Mote Ink Scroll",
    outputCategory: "ritual",
    outputTier: 3,
    inputs: [input("voidMote", 1), input("ancientScroll", 1), input("corruptedTar", 1)],
    station: "void-crucible",
    whySynergy: "Void Mote charges script, Ancient Scroll gives grammar, Corrupted Tar fixes unstable glyphs.",
    lore: "Archivists hate it, but smugglers need these scrolls to mark rift-safe cargo.",
    effects: [effect("rift-script", "Marks void-sensitive map notes.")]
  }),
  recipe({
    id: "basalt-shadow-greaves",
    outputId: "basalt-shadow-greaves",
    outputName: "Basalt Shadow Greaves",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("darkBasalt", 2), input("shadowPelt", 2), input("voidPitch", 1)],
    station: "tannery",
    whySynergy: "Dark Basalt turns blows aside, Shadow Pelt muffles steps, Void Pitch bonds both in cold air.",
    lore: "Rift scouts wear them when silent movement matters more than parade armor.",
    effects: [effect("quiet-footing", "Reduces noise from movement near hostile patrols.")]
  }),
  recipe({
    id: "airship-rib-sawframe",
    outputId: "airship-rib-sawframe",
    outputName: "Airship Rib Sawframe",
    outputCategory: "tool",
    outputTier: 4,
    inputs: [input("airshipRib", 2), input("ghostwood", 2), input("trueSilver", 1)],
    station: "forge",
    whySynergy: "Airship Rib keeps tension, Ghostwood survives haunted groves, True Silver teeth bite cursed grain.",
    lore: "Lumber crews use this saw only when trees fight back through their own dead branches.",
    effects: [effect("cursed-grain-cut", "Improves high-tier lumberjacking efficiency.")]
  }),
  recipe({
    id: "abyssal-brine-waders",
    outputId: "abyssal-brine-waders",
    outputName: "Abyssal Brine Waders",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("abyssalStalker", 1), input("volcanicSlag", 2), input("shadowPelt", 1)],
    station: "harbor-still",
    whySynergy: "Abyssal hide repels pressure, Volcanic Slag weights the boots, Shadow Pelt softens the lining.",
    lore: "Dredgers made them after deep mud began pulling workers under during night tides.",
    effects: [effect("mud-footing", "Improves movement in heavy silt.")]
  }),
  recipe({
    id: "royal-jelly-antidote",
    outputId: "royal-jelly-antidote",
    outputName: "Royal Jelly Antidote",
    outputCategory: "consumable",
    outputTier: 4,
    outputQuantity: 2,
    inputs: [input("royalJelly", 1), input("deathCap", 1), input("earthroot", 2)],
    station: "alchemist-lab",
    whySynergy: "Royal Jelly repairs tissue, Death Cap teaches the antidote what to fight, Earthroot stabilizes dose.",
    lore: "Hivekeepers sell this to mushroom hunters who trespass through bee-protected hollows.",
    effects: [effect("toxin-purge", "Cleanses one poison or spore debuff.")]
  }),
  recipe({
    id: "astral-sapphire-focus",
    outputId: "astral-sapphire-focus",
    outputName: "Astral Sapphire Focus",
    outputCategory: "trinket",
    outputTier: 4,
    inputs: [input("astralTear", 1), input("blueSapphire", 2), input("ancientScroll", 1)],
    station: "gemcutters-bench",
    whySynergy: "Astral Tear supplies sky current, Blue Sapphire refracts it, Ancient Scroll constrains the cast.",
    lore: "High arcanists issue it to apprentices before they are trusted near Cosmic Shards.",
    effects: [effect("stable-channel", "Improves spell focus stability.")]
  }),
  recipe({
    id: "alpha-canine-hide-pauldron",
    outputId: "alpha-canine-hide-pauldron",
    outputName: "Alpha Canine Hide Pauldron",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("alphaCanine", 2), input("direLeather", 2), input("whiteMarble", 1)],
    station: "hunter-camp",
    whySynergy: "Alpha Canine marks dominance, Dire Leather absorbs bite force, White Marble spreads impact.",
    lore: "Outcast champions use the pauldron to show they survived the hunt instead of buying rank.",
    effects: [effect("predator-readback", "Improves threat intimidation checks.")]
  }),
  recipe({
    id: "twilight-field-salve",
    outputId: "twilight-field-salve",
    outputName: "Twilight Field Salve",
    outputCategory: "consumable",
    outputTier: 4,
    outputQuantity: 3,
    inputs: [input("twilightSkyOats", 2), input("voidbloom", 1), input("pineAmber", 2)],
    station: "field-kitchen",
    whySynergy: "Sky-Oats carry slow medicine, Voidbloom numbs rot, Pine Amber seals wounds.",
    lore: "Farm militias brew it at dusk when fields and rifts share the same wind.",
    effects: [effect("rot-buffer", "Adds short resistance to void rot.")]
  }),
  recipe({
    id: "null-basalt-gatekey",
    outputId: "null-basalt-gatekey",
    outputName: "Null Basalt Gatekey",
    outputCategory: "ritual",
    outputTier: 4,
    inputs: [input("darkBasalt", 2), input("voidShardOre", 2), input("rustedSeal", 1)],
    station: "archaeology-table",
    whySynergy: "Dark Basalt resists rupture, Void Shard Ore opens the seam, Rusted Seal remembers gate law.",
    lore: "Expeditions craft it to open ruined vaults without breaking every ward in the wall.",
    effects: [effect("sealed-entry", "Can unlock controlled void-ruin gates.")]
  }),
  recipe({
    id: "corrupted-tar-bolas",
    outputId: "corrupted-tar-bolas",
    outputName: "Corrupted Tar Bolas",
    outputCategory: "weapon",
    outputTier: 3,
    outputQuantity: 2,
    inputs: [input("corruptedTar", 2), input("hornCore", 1), input("gossypiumCotton", 2)],
    station: "hunter-camp",
    whySynergy: "Corrupted Tar sticks to armor, Horn Core adds weight, Cotton cord keeps the throw recoverable.",
    lore: "Hunters use it on machine scavengers that ignore blood scent and normal snares.",
    effects: [effect("sticky-snare", "Applies a brief root on hit.")]
  }),
  recipe({
    id: "phosphor-canal-mask",
    outputId: "phosphor-canal-mask",
    outputName: "Phosphor Canal Mask",
    outputCategory: "armor",
    outputTier: 3,
    inputs: [input("phosphorFungi", 2), input("deepCanalSilt", 2), input("rawPelt", 1)],
    station: "spore-lab",
    whySynergy: "Phosphor Fungi lights filters, Canal Silt captures fumes, Raw Pelt forms a close seal.",
    lore: "Canal crews trust it because it shows when poison gas is trapped instead of hidden.",
    effects: [effect("fume-filter", "Reduces dredging fume damage.")]
  }),
  recipe({
    id: "coal-shell-warhammer",
    outputId: "coal-shell-warhammer",
    outputName: "Coal-Shell Warhammer",
    outputCategory: "weapon",
    outputTier: 3,
    inputs: [input("coalShell", 3), input("graniteSlab", 2), input("pineWood", 2)],
    station: "forge",
    whySynergy: "Coal Shell stores heat, Granite Slab adds striking mass, Pine Wood keeps the handle replaceable.",
    lore: "Forge guards carry it where molten sentinels make steel handles too hot to grip.",
    effects: [effect("heat-slam", "Adds minor fire impact to heavy strikes.")]
  }),
  recipe({
    id: "elder-birch-bee-frame",
    outputId: "elder-birch-bee-frame",
    outputName: "Elder Birch Bee Frame",
    outputCategory: "structure",
    outputTier: 3,
    inputs: [input("elderBirch", 3), input("honeycomb", 3), input("sweetResin", 1)],
    station: "apiary-press",
    whySynergy: "Elder Birch breathes with hive heat, Honeycomb preserves scent, Sweet Resin repairs cracks.",
    lore: "Protected hives accept this frame because it expands the colony without stealing brood space.",
    effects: [effect("apiary-yield", "Improves low-tier wax collection.")]
  }),
  recipe({
    id: "granite-relic-mortar",
    outputId: "granite-relic-mortar",
    outputName: "Granite Relic Mortar",
    outputCategory: "tool",
    outputTier: 3,
    inputs: [input("graniteSlab", 2), input("fossilChunk", 2), input("riverClay", 2)],
    station: "archaeology-table",
    whySynergy: "Granite Slab provides pressure, Fossil Chunk seasons the bowl, River Clay cushions relic dust.",
    lore: "Excavators grind samples here to avoid mixing fresh stone with ancient bone.",
    effects: [effect("sample-purity", "Improves archaeology sample quality.")]
  }),
  recipe({
    id: "silver-gill-scout-chowder",
    outputId: "silver-gill-scout-chowder",
    outputName: "Silver-Gill Scout Chowder",
    outputCategory: "consumable",
    outputTier: 3,
    outputQuantity: 3,
    inputs: [input("silverGill", 2), input("ryeGrain", 2), input("earthroot", 1)],
    station: "field-kitchen",
    whySynergy: "Silver-Gill keeps salt balance, Rye Grain adds bulk, Earthroot steadies tired stomachs.",
    lore: "Port quartermasters serve it to scouts before cross-zone courier routes.",
    effects: [effect("travel-ration", "Restores light health and stamina.")]
  }),
  recipe({
    id: "blue-sapphire-dredge-lens",
    outputId: "blue-sapphire-dredge-lens",
    outputName: "Blue Sapphire Dredge Lens",
    outputCategory: "tool",
    outputTier: 3,
    inputs: [input("blueSapphire", 2), input("deepCanalSilt", 2), input("brassGear", 1)],
    station: "gemcutters-bench",
    whySynergy: "Blue Sapphire sees under murk, Canal Silt tunes the tint, Brass Gear adjusts focus.",
    lore: "Dredgers rent these from gemcutters before diving wreck beds.",
    effects: [effect("murk-sight", "Reveals submerged resource glints.")]
  }),
  recipe({
    id: "ghostwood-void-torch",
    outputId: "ghostwood-void-torch",
    outputName: "Ghostwood Void Torch",
    outputCategory: "tool",
    outputTier: 4,
    inputs: [input("ghostwood", 2), input("voidPitch", 2), input("astralTear", 1)],
    station: "void-crucible",
    whySynergy: "Ghostwood burns in spirit air, Void Pitch holds black flame, Astral Tear keeps the light directional.",
    lore: "Rift delvers use it because ordinary flame points toward exits, not toward truth.",
    effects: [effect("rift-light", "Highlights active rift hazards.")]
  }),
  recipe({
    id: "void-resistance-cloak",
    outputId: "void-resistance-cloak",
    outputName: "Void Resistance Cloak",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("voidbloom", 2), input("shadowPelt", 2), input("astralTear", 1)],
    station: "void-crucible",
    whySynergy: "Voidbloom neutralizes rot, Shadow Pelt hides body heat, Astral Tear keeps the ward anchored.",
    lore: "Port-Marrow smugglers and Aetherian wardens both need it, but disagree over who may cross the rift.",
    effects: [effect("void-rot-guard", "Prevents one void rot debuff application.")]
  }),
  recipe({
    id: "royal-archive-sealant",
    outputId: "royal-archive-sealant",
    outputName: "Royal Archive Sealant",
    outputCategory: "ritual",
    outputTier: 4,
    inputs: [input("royalJelly", 1), input("ancientScroll", 2), input("voidPitch", 1)],
    station: "archaeology-table",
    whySynergy: "Royal Jelly preserves fibers, Ancient Scroll supplies lawful script, Void Pitch seals hostile gaps.",
    lore: "Archives use it when sealing records that factions keep trying to alter.",
    effects: [effect("document-ward", "Protects lore items from corruption.")]
  }),
  recipe({
    id: "volcanic-slag-hive-shield",
    outputId: "volcanic-slag-hive-shield",
    outputName: "Volcanic Slag Hive Shield",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("volcanicSlag", 2), input("guardVenom", 1), input("airshipRib", 1)],
    station: "forge",
    whySynergy: "Volcanic Slag absorbs heat, Guard Venom punishes attackers, Airship Rib keeps the shield light.",
    lore: "Apiary militias carry it when Vulcan crews burn hive groves for fuel.",
    effects: [effect("venom-rim", "Adds minor retaliation poison to blocks.")]
  }),
  recipe({
    id: "dark-basalt-siege-ward",
    outputId: "dark-basalt-siege-ward",
    outputName: "Dark Basalt Siege Ward",
    outputCategory: "structure",
    outputTier: 4,
    inputs: [input("darkBasalt", 3), input("voidShardOre", 1), input("blueSapphire", 1)],
    station: "siege-yard",
    whySynergy: "Dark Basalt absorbs impact, Void Shard Ore bends force, Blue Sapphire reveals cracks.",
    lore: "City engineers place it where siege fire and rift pressure strike the same wall.",
    effects: [effect("breach-warning", "Warns before a structure takes heavy siege damage.")]
  }),
  recipe({
    id: "airship-rib-harpoon",
    outputId: "airship-rib-harpoon",
    outputName: "Airship Rib Harpoon",
    outputCategory: "weapon",
    outputTier: 4,
    inputs: [input("airshipRib", 2), input("tideEel", 2), input("voidShardOre", 1)],
    station: "harbor-still",
    whySynergy: "Airship Rib gives reach, Tide-Eel tissue flexes with recoil, Void Shard Ore pierces abyss armor.",
    lore: "Marrow crews built it to drag Stalkers away from dock chains before they nest.",
    effects: [effect("deep-hook", "Improves pull against large aquatic enemies.")]
  }),
  recipe({
    id: "death-cap-silence-vial",
    outputId: "death-cap-silence-vial",
    outputName: "Death Cap Silence Vial",
    outputCategory: "consumable",
    outputTier: 4,
    outputQuantity: 2,
    inputs: [input("deathCap", 2), input("guardVenom", 1), input("voidMote", 1)],
    station: "spore-lab",
    whySynergy: "Death Cap attacks breath, Guard Venom slows reaction, Void Mote muffles the spell spark.",
    lore: "Used by anti-mage hunters when capture matters more than trophies.",
    effects: [effect("short-silence", "Can interrupt a minor cast.")]
  }),
  recipe({
    id: "astral-tear-navigation-charm",
    outputId: "astral-tear-navigation-charm",
    outputName: "Astral Tear Navigation Charm",
    outputCategory: "trinket",
    outputTier: 4,
    inputs: [input("astralTear", 1), input("airshipRib", 1), input("roseGarnet", 2)],
    station: "gemcutters-bench",
    whySynergy: "Astral Tear tracks sky lines, Airship Rib remembers flight stress, Rose Garnet warms when off course.",
    lore: "Pilots prize it because maps become lies when rift weather moves landmarks.",
    effects: [effect("route-memory", "Improves navigation through unstable routes.")]
  }),
  recipe({
    id: "void-pitch-honey-bomb",
    outputId: "void-pitch-honey-bomb",
    outputName: "Void-Pitch Honey Bomb",
    outputCategory: "weapon",
    outputTier: 4,
    outputQuantity: 2,
    inputs: [input("voidPitch", 2), input("honeycomb", 3), input("brimstoneMud", 1)],
    station: "apiary-press",
    whySynergy: "Void Pitch sticks to armor, Honeycomb carries scent, Brimstone Mud ignites the trap.",
    lore: "Hive defenders throw it at machines that cannot be scared by stings.",
    effects: [effect("sticky-burn", "Creates a short burning slow zone.")]
  }),
  recipe({
    id: "ancient-scroll-gear-clock",
    outputId: "ancient-scroll-gear-clock",
    outputName: "Ancient Scroll Gear Clock",
    outputCategory: "trinket",
    outputTier: 4,
    inputs: [input("ancientScroll", 1), input("brassGear", 3), input("aetherDrift", 1)],
    station: "archaeology-table",
    whySynergy: "Ancient Scroll defines cycles, Brass Gear moves them, Aether Drift powers clean rotation.",
    lore: "Scholars use the clock to time tomb doors that punish impatient hands.",
    effects: [effect("timed-seal", "Improves success on timed relic interactions.")]
  }),
  recipe({
    id: "shadow-pelt-sky-cloak",
    outputId: "shadow-pelt-sky-cloak",
    outputName: "Shadow Pelt Sky Cloak",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("shadowPelt", 2), input("twilightSkyOats", 2), input("moonlily", 1)],
    station: "arbor-loom",
    whySynergy: "Shadow Pelt hides movement, Sky-Oats thread holds altitude chill, Moonlily reduces panic.",
    lore: "High-Reach messengers wear it when crossing cliffs under moonlit patrol routes.",
    effects: [effect("cold-stealth", "Reduces detection in cold night zones.")]
  }),
  recipe({
    id: "white-marble-venom-altar",
    outputId: "white-marble-venom-altar",
    outputName: "White Marble Venom Altar",
    outputCategory: "ritual",
    outputTier: 3,
    inputs: [input("whiteMarble", 2), input("guardVenom", 1), input("bloodrose", 2)],
    station: "alchemist-lab",
    whySynergy: "White Marble keeps ritual lines clean, Guard Venom enforces oath pain, Bloodrose marks the pact.",
    lore: "Faction envoys use it for truces that only hold while everyone fears betrayal.",
    effects: [effect("oath-marker", "Marks a faction pact objective.")]
  }),
  recipe({
    id: "moonlily-cotton-bandage",
    outputId: "moonlily-cotton-bandage",
    outputName: "Moonlily Cotton Bandage",
    outputCategory: "consumable",
    outputTier: 3,
    outputQuantity: 4,
    inputs: [input("moonlily", 2), input("gossypiumCotton", 3), input("broodWax", 1)],
    station: "field-kitchen",
    whySynergy: "Moonlily calms fever, Cotton absorbs blood, Brood Wax seals the wrap.",
    lore: "Village medics make it because the materials come from farms, hives, and wild glades.",
    effects: [effect("field-heal", "Restores light health after a delay.")]
  }),
  recipe({
    id: "true-silver-relic-blade",
    outputId: "true-silver-relic-blade",
    outputName: "True Silver Relic Blade",
    outputCategory: "weapon",
    outputTier: 3,
    inputs: [input("trueSilver", 3), input("cryptPlate", 1), input("pineAmber", 2)],
    station: "forge",
    whySynergy: "True Silver cuts spirits, Crypt Plate remembers the dead, Pine Amber binds the hilt cleanly.",
    lore: "Temple guards carry it when tomb disputes become literal hauntings.",
    effects: [effect("spirit-edge", "Adds minor bonus against undead enemies.")]
  }),
  recipe({
    id: "deep-silt-fungal-brick",
    outputId: "deep-silt-fungal-brick",
    outputName: "Deep-Silt Fungal Brick",
    outputCategory: "structure",
    outputTier: 3,
    outputQuantity: 2,
    inputs: [input("deepCanalSilt", 3), input("phosphorFungi", 2), input("graniteSlab", 1)],
    station: "dredge-kiln",
    whySynergy: "Canal Silt molds dense, Phosphor Fungi signals cracks, Granite Slab provides mineral bite.",
    lore: "Harbor masons use it for dock pilings that must be inspected in darkness.",
    effects: [effect("glow-crack", "Damaged blocks glow along fracture lines.")]
  }),
  recipe({
    id: "horn-core-sapphire-spear",
    outputId: "horn-core-sapphire-spear",
    outputName: "Horn-Core Sapphire Spear",
    outputCategory: "weapon",
    outputTier: 3,
    inputs: [input("hornCore", 2), input("blueSapphire", 1), input("elderBirch", 2)],
    station: "hunter-camp",
    whySynergy: "Horn Core forms the point, Blue Sapphire steadies aim, Elder Birch keeps the shaft springy.",
    lore: "Hunters trade these to river guards who need reach without heavy metal.",
    effects: [effect("steady-thrust", "Improves spear accuracy against charging beasts.")]
  }),
  recipe({
    id: "sylvan-oak-spore-raft",
    outputId: "sylvan-oak-spore-raft",
    outputName: "Sylvan Oak Spore Raft",
    outputCategory: "vessel",
    outputTier: 3,
    inputs: [input("sylvanOak", 3), input("puffballCap", 3), input("riverClay", 2)],
    station: "arbor-loom",
    whySynergy: "Sylvan Oak floats strong, Puffball Cap pads impacts, River Clay seals underside cracks.",
    lore: "Foragers use it to cross flooded mushroom caves without crushing colonies.",
    effects: [effect("soft-landing", "Improves safe travel over shallow marsh water.")]
  }),
  recipe({
    id: "void-shard-glass-cuirass",
    outputId: "void-shard-glass-cuirass",
    outputName: "Void-Shard Glass Cuirass",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("voidShardOre", 2), input("voidDiamond", 1), input("cragHide", 2)],
    station: "forge",
    whySynergy: "Void Shard Ore spreads impact into nothing, Void Diamond refracts magic, Crag Hide protects ribs.",
    lore: "Expensive armor made for soldiers stationed where arrows and rift sparks arrive together.",
    effects: [effect("magic-refraction", "Reduces one incoming magic burst.")]
  }),
  recipe({
    id: "basalt-deathcap-smoke-pot",
    outputId: "basalt-deathcap-smoke-pot",
    outputName: "Basalt Deathcap Smoke Pot",
    outputCategory: "consumable",
    outputTier: 4,
    outputQuantity: 2,
    inputs: [input("darkBasalt", 1), input("deathCap", 2), input("corruptedTar", 1)],
    station: "spore-lab",
    whySynergy: "Dark Basalt contains heat, Death Cap loads toxic fog, Corrupted Tar controls burn speed.",
    lore: "Siege scouts carry it only when evacuation routes are already clear.",
    effects: [effect("toxic-screen", "Creates a short obscuring poison cloud.")]
  }),
  recipe({
    id: "abyssal-stalker-scale-mail",
    outputId: "abyssal-stalker-scale-mail",
    outputName: "Abyssal Stalker Scale Mail",
    outputCategory: "armor",
    outputTier: 4,
    inputs: [input("abyssalStalker", 2), input("tideEel", 2), input("trueSilver", 1)],
    station: "tannery",
    whySynergy: "Abyssal plates resist pressure, Tide-Eel membrane flexes, True Silver pins resist corrosion.",
    lore: "Maritime duelists wear it when boarding parties fight under storm surge.",
    effects: [effect("pressure-guard", "Improves survival in deep-water combat.")]
  }),
  recipe({
    id: "sun-thread-sentinel-banner",
    outputId: "sun-thread-sentinel-banner",
    outputName: "Sun-Thread Sentinel Banner",
    outputCategory: "structure",
    outputTier: 5,
    inputs: [input("sunThreadFiber", 3), input("astralIron", 1), input("goldenNectar", 1)],
    station: "arbor-loom",
    whySynergy: "Sun-Thread holds morale light, Astral Iron anchors it, Golden Nectar keeps the weave from fraying.",
    lore: "Aetherian commanders raise it where crop tribute, forge law, and hive wealth meet.",
    effects: [effect("morale-anchor", "Buffs allied resolve near the banner.")]
  }),
  recipe({
    id: "prismatic-siege-blade",
    outputId: "prismatic-siege-blade",
    outputName: "Prismatic Siege Blade",
    outputCategory: "weapon",
    outputTier: 5,
    inputs: [input("astralIron", 2), input("prismGeodeCrystal", 1), input("yggdrasilElixir", 1)],
    station: "forge",
    whySynergy: "Astral Iron gives star-metal mass, Prism Geode Crystal splits warding, Yggdrasil Elixir lets the edge heal from recoil.",
    lore: "Only siege captains with faction backing can fund a blade that harms walls and seals alike.",
    effects: [effect("prismatic-breach", "Deals bonus damage to warded structures.")]
  }),
  recipe({
    id: "archon-purity-flask",
    outputId: "archon-purity-flask",
    outputName: "Archon Purity Flask",
    outputCategory: "consumable",
    outputTier: 5,
    outputQuantity: 2,
    inputs: [input("royalJelly", 1), input("sealOfArchon", 1), input("glowSpore", 2)],
    station: "alchemist-lab",
    whySynergy: "Royal Jelly repairs corruption, Seal of the Archon authorizes the purge, Glow-Spore reveals infected tissue.",
    lore: "The flask is contraband in places where leaders profit from slow corruption.",
    effects: [effect("purity-cleanse", "Removes severe void rot and poison effects.")]
  }),
  recipe({
    id: "world-tree-behemoth-bulwark",
    outputId: "world-tree-behemoth-bulwark",
    outputName: "World-Tree Behemoth Bulwark",
    outputCategory: "armor",
    outputTier: 5,
    inputs: [input("worldTreeHeart", 1), input("behemothHide", 2), input("nullGeodeBlock", 1)],
    station: "siege-yard",
    whySynergy: "World-Tree heartwood absorbs shock, Behemoth Hide spreads force, Null-Geode Block cancels spell impact.",
    lore: "Built for gate defenders who stand between sacred forests and industrial siege lines.",
    effects: [effect("anchor-guard", "Greatly improves knockback resistance.")]
  }),
  recipe({
    id: "cosmic-leviathan-compass",
    outputId: "cosmic-leviathan-compass",
    outputName: "Cosmic Leviathan Compass",
    outputCategory: "trinket",
    outputTier: 5,
    inputs: [input("cosmicShard", 1), input("leviathanScaleFish", 1), input("sunkenEngineCore", 1)],
    station: "harbor-still",
    whySynergy: "Cosmic Shard reads star drift, Leviathan scale reads deep current, Sunken Engine Core remembers wreck routes.",
    lore: "Captains use it to cross waters that exist on maps for only one tide.",
    effects: [effect("impossible-route", "Reveals unstable sea routes.")]
  }),
  recipe({
    id: "eternity-leaf-crown",
    outputId: "eternity-leaf-crown",
    outputName: "Eternity Leaf Crown",
    outputCategory: "trinket",
    outputTier: 5,
    inputs: [input("eternityLeaf", 2), input("goldenNectar", 1), input("prismGeodeCrystal", 1)],
    station: "apiary-press",
    whySynergy: "Eternity Leaf refuses decay, Golden Nectar preserves living tissue, Prism Geode Crystal refracts life force.",
    lore: "Kings covet it, druids guard it, and merchants price it as if immortality were legal tender.",
    effects: [effect("decay-delay", "Slows severe damage-over-time effects.")]
  }),
  recipe({
    id: "void-diamond-null-lance",
    outputId: "void-diamond-null-lance",
    outputName: "Void Diamond Null Lance",
    outputCategory: "weapon",
    outputTier: 5,
    inputs: [input("voidDiamond", 2), input("nullGeodeBlock", 1), input("myceliumVoidCord", 1)],
    station: "gemcutters-bench",
    whySynergy: "Void Diamond pierces wards, Null-Geode Block suppresses backlash, Mycelium Void-Cord conducts rot safely.",
    lore: "Sanctum duelists treat it as a weapon; archivists classify it as a disaster with a handle.",
    effects: [effect("ward-pierce", "Pierces a portion of magical barriers.")]
  }),
  recipe({
    id: "primal-heart-war-drum",
    outputId: "primal-heart-war-drum",
    outputName: "Primal Heart War Drum",
    outputCategory: "ritual",
    outputTier: 5,
    inputs: [input("primalHeart", 1), input("behemothHide", 1), input("worldTreeHeart", 1)],
    station: "hunter-camp",
    whySynergy: "Primal Heart beats with predator memory, Behemoth Hide carries thunder, World-Tree Heartwood makes it heard by roots.",
    lore: "Outcast warbands use it to declare that wilderness law outranks city treaties.",
    effects: [effect("predator-rally", "Increases nearby ally aggression briefly.")]
  }),
  recipe({
    id: "yggdrasil-astral-vial",
    outputId: "yggdrasil-astral-vial",
    outputName: "Yggdrasil Astral Vial",
    outputCategory: "consumable",
    outputTier: 5,
    outputQuantity: 2,
    inputs: [input("yggdrasilElixir", 1), input("astralTear", 2), input("eternityLeaf", 1)],
    station: "alchemist-lab",
    whySynergy: "Yggdrasil Elixir repairs life channels, Astral Tear guides the dose, Eternity Leaf prevents decay.",
    lore: "Healers reserve it for wounds that are partly physical and partly political.",
    effects: [effect("major-restoration", "Restores heavy health and clears fatigue.")]
  }),
  recipe({
    id: "seal-of-archon-codex",
    outputId: "seal-of-archon-codex",
    outputName: "Seal of Archon Codex",
    outputCategory: "ritual",
    outputTier: 5,
    inputs: [input("sealOfArchon", 1), input("cosmicShard", 1), input("ancientScroll", 3)],
    station: "archaeology-table",
    whySynergy: "Archon seal grants authority, Cosmic Shard supplies reach, Ancient Scrolls provide legal memory.",
    lore: "The codex can settle old borders, so every faction wants its interpretation accepted first.",
    effects: [effect("lawful-attunement", "Unlocks high-order relic attunement.")]
  }),
  recipe({
    id: "deep-abyssal-hull-plate",
    outputId: "deep-abyssal-hull-plate",
    outputName: "Deep Abyssal Hull Plate",
    outputCategory: "vessel",
    outputTier: 5,
    inputs: [input("deepAbyssalClay", 3), input("sunkenEngineCore", 1), input("leviathanScaleFish", 1)],
    station: "dredge-kiln",
    whySynergy: "Abyssal Clay seals pressure, Engine Core powers pumps, Leviathan scale sheds impossible currents.",
    lore: "Shipwrights craft it for vessels sent where ordinary hulls return as splinters.",
    effects: [effect("abyss-hull", "Improves vessel survival in abyssal waters.")]
  }),
  recipe({
    id: "golden-nectar-sun-thread-robe",
    outputId: "golden-nectar-sun-thread-robe",
    outputName: "Golden Nectar Sun-Thread Robe",
    outputCategory: "armor",
    outputTier: 5,
    inputs: [input("goldenNectar", 2), input("sunThreadFiber", 3), input("eternityLeaf", 1)],
    station: "arbor-loom",
    whySynergy: "Golden Nectar preserves the weave, Sun-Thread carries radiance, Eternity Leaf blocks decay.",
    lore: "Priests wear it when blessing harvests that rival factions would rather tax or burn.",
    effects: [effect("radiant-preservation", "Improves resistance to decay and fear.")]
  }),
  recipe({
    id: "mycelium-void-cord-net",
    outputId: "mycelium-void-cord-net",
    outputName: "Mycelium Void-Cord Net",
    outputCategory: "tool",
    outputTier: 5,
    inputs: [input("myceliumVoidCord", 2), input("voidPitch", 2), input("alphaCanine", 1)],
    station: "spore-lab",
    whySynergy: "Void-Cord tracks rift organisms, Void Pitch prevents escape, Alpha Canine teeth weight the corners.",
    lore: "Rift hunters cast it only when killing the quarry would make the region worse.",
    effects: [effect("rift-snare", "Can root a rift creature briefly.")]
  }),
  recipe({
    id: "astral-iron-engine-heart",
    outputId: "astral-iron-engine-heart",
    outputName: "Astral Iron Engine Heart",
    outputCategory: "structure",
    outputTier: 5,
    inputs: [input("astralIron", 2), input("sunkenEngineCore", 1), input("cosmicShard", 1)],
    station: "forge",
    whySynergy: "Astral Iron tolerates heat and star stress, Engine Core gives motion, Cosmic Shard aligns power cycles.",
    lore: "Airship guilds fight over it because one heart can power a fleet route.",
    effects: [effect("star-engine", "Powers high-tier travel machinery.")]
  }),
  recipe({
    id: "behemoth-hide-leviathan-saddle",
    outputId: "behemoth-hide-leviathan-saddle",
    outputName: "Behemoth Hide Leviathan Saddle",
    outputCategory: "vessel",
    outputTier: 5,
    inputs: [input("behemothHide", 2), input("leviathanScaleFish", 1), input("sunThreadFiber", 2)],
    station: "tannery",
    whySynergy: "Behemoth Hide survives strain, Leviathan scales reject water shear, Sun-Thread keeps riders visible.",
    lore: "The saddle is half transport gear and half diplomatic insult to every port authority.",
    effects: [effect("giant-mount-tack", "Enables handling of extreme beast mounts.")]
  }),
  recipe({
    id: "null-geode-world-root-pylon",
    outputId: "null-geode-world-root-pylon",
    outputName: "Null-Geode World-Root Pylon",
    outputCategory: "structure",
    outputTier: 5,
    inputs: [input("nullGeodeBlock", 2), input("worldTreeHeart", 1), input("cosmicShard", 1)],
    station: "siege-yard",
    whySynergy: "Null-Geode Block suppresses wild magic, World-Tree heartwood roots the pylon, Cosmic Shard tunes its range.",
    lore: "Border factions argue whether it protects sacred groves or turns them into infrastructure.",
    effects: [effect("rift-stabilizer", "Stabilizes local rift pressure.")]
  }),
  recipe({
    id: "prism-geode-truth-mirror",
    outputId: "prism-geode-truth-mirror",
    outputName: "Prism Geode Truth Mirror",
    outputCategory: "trinket",
    outputTier: 5,
    inputs: [input("prismGeodeCrystal", 2), input("sealOfArchon", 1), input("royalJelly", 1)],
    station: "gemcutters-bench",
    whySynergy: "Prism Geode Crystal splits false light, Archon seal binds testimony, Royal Jelly keeps the surface alive.",
    lore: "Courts fear it because truth that cannot be priced breaks half their treaties.",
    effects: [effect("illusion-reveal", "Reveals disguised entities and false relic marks.")]
  }),
  recipe({
    id: "golden-nectar-primal-feast",
    outputId: "golden-nectar-primal-feast",
    outputName: "Golden Nectar Primal Feast",
    outputCategory: "consumable",
    outputTier: 5,
    outputQuantity: 3,
    inputs: [input("goldenNectar", 1), input("primalHeart", 1), input("leviathanScaleFish", 1)],
    station: "field-kitchen",
    whySynergy: "Golden Nectar preserves power, Primal Heart adds predator drive, Leviathan flesh feeds long recovery.",
    lore: "Served before battles where retreat routes are symbolic, not practical.",
    effects: [effect("major-combat-ration", "Improves health recovery and aggression briefly.")]
  }),
  recipe({
    id: "cosmic-shard-void-bloom-orb",
    outputId: "cosmic-shard-void-bloom-orb",
    outputName: "Cosmic Shard Voidbloom Orb",
    outputCategory: "ritual",
    outputTier: 5,
    inputs: [input("cosmicShard", 1), input("voidbloom", 3), input("voidDiamond", 1)],
    station: "void-crucible",
    whySynergy: "Cosmic Shard supplies scale, Voidbloom absorbs rot, Void Diamond contains pressure.",
    lore: "Rift priests claim it heals reality; miners call it a portable collapse risk.",
    effects: [effect("void-containment", "Contains a severe rift pulse briefly.")]
  }),
  recipe({
    id: "archon-leviathan-treaty-tablet",
    outputId: "archon-leviathan-treaty-tablet",
    outputName: "Archon Leviathan Treaty Tablet",
    outputCategory: "ritual",
    outputTier: 5,
    inputs: [input("sealOfArchon", 1), input("leviathanScaleFish", 1), input("deepAbyssalClay", 2)],
    station: "archaeology-table",
    whySynergy: "Archon seal legitimizes the pact, Leviathan scale marks sea sovereignty, Abyssal Clay preserves the terms.",
    lore: "Port factions use it to claim that even monsters recognize their shipping rights.",
    effects: [effect("sea-pact", "Improves faction standing during maritime negotiations.")]
  }),
  recipe({
    id: "yggdrasil-horn-core-staff",
    outputId: "yggdrasil-horn-core-staff",
    outputName: "Yggdrasil Horn-Core Staff",
    outputCategory: "weapon",
    outputTier: 5,
    inputs: [input("yggdrasilElixir", 1), input("hornCore", 3), input("worldTreeHeart", 1)],
    station: "arbor-loom",
    whySynergy: "Yggdrasil Elixir keeps the staff alive, Horn Core directs force, World-Tree Heartwood anchors growth.",
    lore: "Druids and hunters both claim it, arguing whether command over nature is care or conquest.",
    effects: [effect("living-cast", "Improves nature spell control.")]
  }),
  recipe({
    id: "sunken-engine-void-keel",
    outputId: "sunken-engine-void-keel",
    outputName: "Sunken Engine Void Keel",
    outputCategory: "vessel",
    outputTier: 5,
    inputs: [input("sunkenEngineCore", 1), input("voidShardOre", 3), input("deepAbyssalClay", 2)],
    station: "harbor-still",
    whySynergy: "Engine Core drives motion, Void Shard Ore cuts bad currents, Abyssal Clay keeps the hull sealed.",
    lore: "Smugglers use it to pass under blockades that assume ships need ordinary water.",
    effects: [effect("rift-keel", "Enables vessel travel through unstable channels.")]
  })
] as const satisfies readonly CraftingRecipe[];

export type CraftingRecipeId = (typeof craftingRecipes)[number]["id"];

export const craftingRecipeById = Object.fromEntries(
  craftingRecipes.map((entry) => [entry.id, entry])
) as Record<CraftingRecipeId, CraftingRecipe>;

export const craftingRecipesByStation = craftingRecipes.reduce(
  (byStation, entry) => {
    byStation[entry.station] ??= [];
    byStation[entry.station]!.push(entry);
    return byStation;
  },
  {} as Partial<Record<CraftingStation, CraftingRecipe[]>>
);

export const craftingRecipesByTier = craftingRecipes.reduce(
  (byTier, entry) => {
    byTier[entry.outputTier] ??= [];
    byTier[entry.outputTier]!.push(entry);
    return byTier;
  },
  {} as Partial<Record<CraftingRecipeTier, CraftingRecipe[]>>
);

export function getCraftingRecipe(id: string) {
  return craftingRecipeById[id as CraftingRecipeId];
}

export function findCraftingRecipesByInput(materialNameOrId: string | number) {
  const target = String(materialNameOrId).toLowerCase();
  return craftingRecipes.filter((entry) =>
    entry.inputs.some((craftingInput) =>
      craftingInput.materialName.toLowerCase() === target ||
      (craftingInput.materialId !== undefined && String(craftingInput.materialId).toLowerCase() === target)
    )
  );
}

export function createMaterialResolver(catalog: readonly MaterialCatalogEntry[] | undefined): MaterialResolver | undefined {
  if (!catalog) return undefined;
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const material of catalog) {
    if (material.id !== undefined) ids.add(String(material.id).toLowerCase());
    names.add(material.name.toLowerCase());
  }
  return {
    hasMaterialId: (id) => ids.has(String(id).toLowerCase()),
    hasMaterialName: (name) => names.has(name.toLowerCase())
  };
}

export function validateCraftingRecipes(
  recipes: readonly CraftingRecipe[] = craftingRecipes,
  options: { materials?: readonly MaterialCatalogEntry[]; resolver?: MaterialResolver } = {}
): RecipeValidationResult {
  const issues: RecipeValidationIssue[] = [];
  const seenIds = new Set<string>();
  const resolver = options.resolver ?? createMaterialResolver(options.materials);

  for (const entry of recipes) {
    if (seenIds.has(entry.id)) {
      issues.push({ recipeId: entry.id, code: "duplicate-id", message: `Duplicate crafting recipe id: ${entry.id}` });
    }
    seenIds.add(entry.id);

    if (entry.inputs.length === 0) {
      issues.push({ recipeId: entry.id, code: "empty-inputs", message: "Recipe has no material inputs." });
    }

    const skillIds = new Set<GatheringSkillId>();
    for (const craftingInput of entry.inputs) {
      skillIds.add(craftingInput.skillId);
      if (!Number.isInteger(craftingInput.quantity) || craftingInput.quantity <= 0) {
        issues.push({
          recipeId: entry.id,
          code: "invalid-quantity",
          message: `${craftingInput.materialName} must have a positive integer quantity.`
        });
      }

      if (resolver) {
        const hasId = craftingInput.materialId !== undefined && resolver.hasMaterialId?.(craftingInput.materialId);
        const hasName = resolver.hasMaterialName?.(craftingInput.materialName);
        if (!hasId && !hasName) {
          issues.push({
            recipeId: entry.id,
            code: "unresolved-material",
            message: `${craftingInput.materialName} did not resolve in provided material catalog.`
          });
        }
      }
    }

    if (entry.inputs.length > 0 && skillIds.size < 2) {
      issues.push({ recipeId: entry.id, code: "single-skill-inputs", message: "Recipe must combine materials from at least two skills." });
    }
  }

  return { valid: issues.length === 0, issues };
}

export const craftingRecipeValidation = validateCraftingRecipes();
