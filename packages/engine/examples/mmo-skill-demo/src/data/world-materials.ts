export type WorldCraftingMaterialCategory =
  | "weapon-armor-essential"
  | "enhanced-upgrade"
  | "gathering"
  | "monster-drop"
  | "faction-quest-rare";

export type WorldCraftingMaterial = {
  id: string;
  name: string;
  category: WorldCraftingMaterialCategory;
  summary: string;
};

export const worldCraftingMaterialCategories = [
  "weapon-armor-essential",
  "enhanced-upgrade",
  "gathering",
  "monster-drop",
  "faction-quest-rare"
] as const;

export const weaponArmorEssentialMaterials = [
  {
    id: "dull-tin-flake",
    name: "Dull Tin Flake",
    category: "weapon-armor-essential",
    summary: "Common ore scrap; basic blade binding."
  },
  {
    id: "oakhaven-softwood",
    name: "Oakhaven Softwood",
    category: "weapon-armor-essential",
    summary: "Supple timber; excellent for early practice bows."
  },
  {
    id: "ironcrag-slate",
    name: "Ironcrag Slate",
    category: "weapon-armor-essential",
    summary: "Flat heavy stone; perfect training-shield layers."
  },
  {
    id: "tumbled-quartz",
    name: "Tumbled Quartz",
    category: "weapon-armor-essential",
    summary: "Rigid crystal; basic staff focusing core."
  },
  {
    id: "wolf-hide-strip",
    name: "Wolf Hide Strip",
    category: "weapon-armor-essential",
    summary: "Treated wolf skin; bow grips and tunic straps."
  },
  {
    id: "refined-iron-ingot",
    name: "Refined Iron Ingot",
    category: "weapon-armor-essential",
    summary: "Hardened metal; base of heavy combat swords."
  },
  {
    id: "ashwood-heartwood",
    name: "Ashwood Heartwood",
    category: "weapon-armor-essential",
    summary: "Inner dense grain; high-tensile recurve bow timber."
  },
  {
    id: "obsidian-fragment",
    name: "Obsidian Fragment",
    category: "weapon-armor-essential",
    summary: "Glass-sharp shard; high armor-piercing arrows."
  },
  {
    id: "spun-spider-silk",
    name: "Spun Spider Silk",
    category: "weapon-armor-essential",
    summary: "Elastic cord; high-tier stringing source."
  },
  {
    id: "steel-plate-plate",
    name: "Steel Plate Plate",
    category: "weapon-armor-essential",
    summary: "Tempered heavy metal; breastplates and bulwarks."
  },
  {
    id: "grave-bone-plate",
    name: "Grave-Bone Plate",
    category: "weapon-armor-essential",
    summary: "Hard calcium deposit; reinforcing pauldrons."
  },
  {
    id: "sun-seared-leather",
    name: "Sun-Seared Leather",
    category: "weapon-armor-essential",
    summary: "Toughened steer hide; strong brigandine backings."
  },
  {
    id: "prism-shard-ingot",
    name: "Prism Shard Ingot",
    category: "weapon-armor-essential",
    summary: "Translucent heavy metal alloy; elemental blade bases."
  },
  {
    id: "bramble-thorn-vine",
    name: "Bramble-Thorn Vine",
    category: "weapon-armor-essential",
    summary: "Thick defensive root; used to whip shield rims."
  },
  {
    id: "soot-crab-carapace",
    name: "Soot-Crab Carapace",
    category: "weapon-armor-essential",
    summary: "Molten fireproof plating; heat resistant leg guards."
  },
  {
    id: "silver-steel-ingot",
    name: "Silver-Steel Ingot",
    category: "weapon-armor-essential",
    summary: "Shiny heavy metal; fine balance rapier steel."
  },
  {
    id: "calamity-sinew",
    name: "Calamity Sinew",
    category: "weapon-armor-essential",
    summary: "Dynamic internal cord; heavy ballista tension cords."
  },
  {
    id: "aether-brass-ingot",
    name: "Aether-Brass Ingot",
    category: "weapon-armor-essential",
    summary: "Divine alloy; handles magical channeling weaponry."
  },
  {
    id: "void-forged-plate",
    name: "Void-Forged Plate",
    category: "weapon-armor-essential",
    summary: "Black-iron compound; absolute void-barrier armor plates."
  },
  {
    id: "timber-goliath-sapwood",
    name: "Timber-Goliath Sapwood",
    category: "weapon-armor-essential",
    summary: "Flexible wood armor backing; high shock absorption."
  },
  {
    id: "tide-stalker-scale",
    name: "Tide-Stalker Scale",
    category: "weapon-armor-essential",
    summary: "Water-shedding coating; perfect aquatic light mail."
  },
  {
    id: "abyssal-eel-hide",
    name: "Abyssal Eel Hide",
    category: "weapon-armor-essential",
    summary: "Impermeable slippery skin; ideal rogue armor linings."
  },
  {
    id: "high-peak-feather",
    name: "High-Peak Feather",
    category: "weapon-armor-essential",
    summary: "Flight guides; stabilizing high-tier fletching."
  },
  {
    id: "moss-bear-claws",
    name: "Moss-Bear Claws",
    category: "weapon-armor-essential",
    summary: "Heavy bone tips; perfect gauntlet knuckle spikes."
  },
  {
    id: "lava-spit-core",
    name: "Lava-Spit Core",
    category: "weapon-armor-essential",
    summary: "Extremely hot igneous node; base of volcanic warhammers."
  }
] as const;

export const enhancedUpgradeMaterials = [
  {
    id: "solos-emblem",
    name: "Solos Emblem",
    category: "enhanced-upgrade",
    summary: "Radiant Aetherian crest; seals positive light damage to weapons."
  },
  {
    id: "pure-void-tear",
    name: "Pure Void Tear",
    category: "enhanced-upgrade",
    summary: "Shimmering dark bubble; infuses attacks with chaotic critical rot."
  },
  {
    id: "druidic-seed-pod",
    name: "Druidic Seed-Pod",
    category: "enhanced-upgrade",
    summary: "Swelling root cluster; triggers restorative self-heals when armor breaks."
  },
  {
    id: "vulcan-core-spark",
    name: "Vulcan Core-Spark",
    category: "enhanced-upgrade",
    summary: "Concentrated heat cell; adds explosion hazard on hit."
  },
  {
    id: "marrow-cove-brine",
    name: "Marrow-Cove Brine",
    category: "enhanced-upgrade",
    summary: "Preservative marine oil; increases speed-boost durations."
  },
  {
    id: "wind-weave-sigil",
    name: "Wind-Weave Sigil",
    category: "enhanced-upgrade",
    summary: "High mountain sky token; drastically reduces cooldown of jumps."
  },
  {
    id: "dust-syndicate-stamp",
    name: "Dust-Syndicate Stamp",
    category: "enhanced-upgrade",
    summary: "Mercenary contract wax; triggers bonus coin drops when using abilities."
  },
  {
    id: "ancient-script-scroll",
    name: "Ancient Script Scroll",
    category: "enhanced-upgrade",
    summary: "Crumbling magic formulas; upgrades active magical spell power."
  },
  {
    id: "gargoyle-heart-core",
    name: "Gargoyle Heart-Core",
    category: "enhanced-upgrade",
    summary: "Dense fossil energy; grants temporary defense armor on stun."
  },
  {
    id: "mirror-shatter-shard",
    name: "Mirror-Shatter Shard",
    category: "enhanced-upgrade",
    summary: "Illusion-laced glass; grants dynamic dodge chance clone."
  }
] as const;

export const gatheringMaterials = [
  {
    id: "copper-dust",
    name: "Copper Dust",
    category: "gathering",
    summary: "Raw metal sanding."
  },
  {
    id: "zinc-clinker",
    name: "Zinc Clinker",
    category: "gathering",
    summary: "Brittle furnace ignition catalyst."
  },
  {
    id: "fine-coal-lump",
    name: "Fine Coal Lump",
    category: "gathering",
    summary: "Standard smelting fuel."
  },
  {
    id: "porous-sandstone",
    name: "Porous Sandstone",
    category: "gathering",
    summary: "Grinding stone block used for sharpening."
  },
  {
    id: "soft-pine-bark",
    name: "Soft Pine Bark",
    category: "gathering",
    summary: "Common fire starter."
  },
  {
    id: "oak-sap-extract",
    name: "Oak Sap Extract",
    category: "gathering",
    summary: "Sticky adhesive."
  },
  {
    id: "dry-bramble-branch",
    name: "Dry Bramble Branch",
    category: "gathering",
    summary: "Brittle forest kindling."
  },
  {
    id: "desert-cactus-pulp",
    name: "Desert Cactus Pulp",
    category: "gathering",
    summary: "Water-rich cooling salve."
  },
  {
    id: "washed-sea-shell",
    name: "Washed Sea Shell",
    category: "gathering",
    summary: "Calcium-rich lime material."
  },
  {
    id: "deep-geode-cluster",
    name: "Deep Geode Cluster",
    category: "gathering",
    summary: "Unrefined base gems."
  },
  {
    id: "sulphur-flake",
    name: "Sulphur Flake",
    category: "gathering",
    summary: "Reactive volcanic powder."
  },
  {
    id: "coarse-silt-clay",
    name: "Coarse Silt Clay",
    category: "gathering",
    summary: "Basic pottery molding block."
  },
  {
    id: "river-pebble",
    name: "River Pebble",
    category: "gathering",
    summary: "Common sling ammo."
  },
  {
    id: "wild-oats-bundle",
    name: "Wild Oats Bundle",
    category: "gathering",
    summary: "Common brewing ingredient."
  },
  {
    id: "dried-mountain-moss",
    name: "Dried Mountain Moss",
    category: "gathering",
    summary: "Insulating cushion padding."
  },
  {
    id: "bitter-root-herb",
    name: "Bitter-Root Herb",
    category: "gathering",
    summary: "Alchemical stabilizer."
  },
  {
    id: "bright-clover-flower",
    name: "Bright Clover Flower",
    category: "gathering",
    summary: "Health remedy supplement."
  },
  {
    id: "deadly-nightshade",
    name: "Deadly Nightshade",
    category: "gathering",
    summary: "Rare lethal poison base."
  },
  {
    id: "sassafras-leaves",
    name: "Sassafras Leaves",
    category: "gathering",
    summary: "Wild herbal beverage oil."
  },
  {
    id: "phosphorescent-mushroom",
    name: "Phosphorescent Mushroom",
    category: "gathering",
    summary: "Subterranean low-light lantern source."
  }
] as const;

export const monsterDropMaterials = [
  {
    id: "wolf-tooth",
    name: "Wolf Tooth",
    category: "monster-drop",
    summary: "Basic carving point."
  },
  {
    id: "bat-wing-membrane",
    name: "Bat Wing Membrane",
    category: "monster-drop",
    summary: "Fine leather patches."
  },
  {
    id: "crawler-chitin-block",
    name: "Crawler Chitin Block",
    category: "monster-drop",
    summary: "Lightweight defensive plate."
  },
  {
    id: "grave-dust-pile",
    name: "Grave Dust Pile",
    category: "monster-drop",
    summary: "Necromantic focal material."
  },
  {
    id: "wraith-essence-residue",
    name: "Wraith Essence Residue",
    category: "monster-drop",
    summary: "Shimmering chill vapor."
  },
  {
    id: "scavenger-bone-shard",
    name: "Scavenger Bone Shard",
    category: "monster-drop",
    summary: "Sharp fragile structural point."
  },
  {
    id: "eel-venom-sac",
    name: "Eel Venom Sac",
    category: "monster-drop",
    summary: "Paralyzing weapon ointment."
  },
  {
    id: "crab-claw-husk",
    name: "Crab Claw Husk",
    category: "monster-drop",
    summary: "Solid crushing tools."
  },
  {
    id: "eagle-beak-chunk",
    name: "Eagle Beak Chunk",
    category: "monster-drop",
    summary: "Heavy piercing punch point."
  },
  {
    id: "fissure-bug-jelly",
    name: "Fissure Bug Jelly",
    category: "monster-drop",
    summary: "Glow-in-the-dark liquid adhesive."
  },
  {
    id: "gargoyle-dust-pile",
    name: "Gargoyle Dust Pile",
    category: "monster-drop",
    summary: "Heavy-duty mortar component."
  },
  {
    id: "tallow-wraith-wax",
    name: "Tallow-Wraith Wax",
    category: "monster-drop",
    summary: "Ghostly candle burning substance."
  },
  {
    id: "scythe-seed-claws",
    name: "Scythe Seed Claws",
    category: "monster-drop",
    summary: "Retracting forest thorns."
  },
  {
    id: "rust-biter-acid",
    name: "Rust-Biter Acid",
    category: "monster-drop",
    summary: "Highly corrosive digestive agent."
  },
  {
    id: "calamity-talon",
    name: "Calamity Talon",
    category: "monster-drop",
    summary: "Pointed bone projectile hook."
  },
  {
    id: "spore-dust-cloud",
    name: "Spore Dust Cloud",
    category: "monster-drop",
    summary: "Powder causing disorientation."
  },
  {
    id: "cursed-oracle-tongue",
    name: "Cursed Oracle Tongue",
    category: "monster-drop",
    summary: "Decayed organ used in strange rituals."
  },
  {
    id: "abyssal-teeth",
    name: "Abyssal Teeth",
    category: "monster-drop",
    summary: "Jagged marine serrated teeth."
  },
  {
    id: "prism-crystal-shards",
    name: "Prism Crystal Shards",
    category: "monster-drop",
    summary: "Fragmented multi-colored quartz."
  },
  {
    id: "void-crawler-mandible",
    name: "Void Crawler Mandible",
    category: "monster-drop",
    summary: "Strong scissor-jaw tools."
  }
] as const;

export const factionQuestRareMaterials = [
  {
    id: "concord-oak-leaf",
    name: "Concord Oak Leaf",
    category: "faction-quest-rare",
    summary: "Sylvan merit medal."
  },
  {
    id: "guild-copper-token",
    name: "Guild Copper Token",
    category: "faction-quest-rare",
    summary: "Vulcan wage receipt."
  },
  {
    id: "order-wheat-bundle",
    name: "Order Wheat Bundle",
    category: "faction-quest-rare",
    summary: "Archon tax share allocation."
  },
  {
    id: "cove-salvage-box",
    name: "Cove Salvage Box",
    category: "faction-quest-rare",
    summary: "Unopened shipwreck scrap cargo."
  },
  {
    id: "bazaar-glass-bottle",
    name: "Bazaar Glass Bottle",
    category: "faction-quest-rare",
    summary: "Sealed antique perfume relic."
  },
  {
    id: "nihil-ash-sludge",
    name: "Nihil Ash Sludge",
    category: "faction-quest-rare",
    summary: "Condensed physical residue of cosmic decay."
  },
  {
    id: "outcast-hunt-skull",
    name: "Outcast Hunt Skull",
    category: "faction-quest-rare",
    summary: "Animal skull showing tribal martial pride."
  },
  {
    id: "ascetic-jade-stone",
    name: "Ascetic Jade Stone",
    category: "faction-quest-rare",
    summary: "Calm meditation carving."
  },
  {
    id: "elderwood-ash",
    name: "Elderwood Ash",
    category: "faction-quest-rare",
    summary: "Holy fertilizer from deep forest sanctums."
  },
  {
    id: "soot-forge-coke",
    name: "Soot-Forge Coke",
    category: "faction-quest-rare",
    summary: "Extremely clean concentrated coal fuel."
  },
  {
    id: "inquisition-sealing-wax",
    name: "Inquisition Sealing Wax",
    category: "faction-quest-rare",
    summary: "Keeps messages tightly confidential."
  },
  {
    id: "captain-smuggled-rum",
    name: "Captain Smuggled Rum",
    category: "faction-quest-rare",
    summary: "High-density sea stimulant."
  },
  {
    id: "syndicate-debt-note",
    name: "Syndicate Debt Note",
    category: "faction-quest-rare",
    summary: "Promise of trade value."
  },
  {
    id: "void-portal-key",
    name: "Void Portal Key",
    category: "faction-quest-rare",
    summary: "Fractured spatial link string."
  },
  {
    id: "feral-blood-vial",
    name: "Feral Blood Vial",
    category: "faction-quest-rare",
    summary: "High-concentration wild adrenaline."
  },
  {
    id: "monastic-sage-tea",
    name: "Monastic Sage Tea",
    category: "faction-quest-rare",
    summary: "Clears brain-fog; improves memory."
  },
  {
    id: "dungeon-lock-grate",
    name: "Dungeon Lock Grate",
    category: "faction-quest-rare",
    summary: "Rusted lock-and-key fragment."
  },
  {
    id: "mirror-mirror-segment",
    name: "Mirror Mirror Segment",
    category: "faction-quest-rare",
    summary: "Silvered flat glass piece."
  },
  {
    id: "anointed-candle-core",
    name: "Anointed Candle Core",
    category: "faction-quest-rare",
    summary: "Unrefined high-grade beeswax tallow."
  },
  {
    id: "sapper-dynamite-fuse",
    name: "Sapper Dynamite Fuse",
    category: "faction-quest-rare",
    summary: "Water-resistant igniter."
  },
  {
    id: "geologist-scale-map",
    name: "Geologist Scale Map",
    category: "faction-quest-rare",
    summary: "Precise underground seam map."
  },
  {
    id: "scout-route-marker",
    name: "Scout Route Marker",
    category: "faction-quest-rare",
    summary: "Painted stone pointing safe trails."
  },
  {
    id: "miller-coarse-flour",
    name: "Miller Coarse Flour",
    category: "faction-quest-rare",
    summary: "Ground crop bag."
  },
  {
    id: "appraiser-eye-glass",
    name: "Appraiser Eye Glass",
    category: "faction-quest-rare",
    summary: "Focuses thin natural rays."
  },
  {
    id: "void-seed-shell",
    name: "Void Seed Shell",
    category: "faction-quest-rare",
    summary: "Dormant outer skin of reality cracks."
  }
] as const;

export const worldCraftingMaterials = [
  ...weaponArmorEssentialMaterials,
  ...enhancedUpgradeMaterials,
  ...gatheringMaterials,
  ...monsterDropMaterials,
  ...factionQuestRareMaterials
] as const;

export type WorldCraftingMaterialId = (typeof worldCraftingMaterials)[number]["id"];

export const worldCraftingMaterialsById: Record<WorldCraftingMaterialId, WorldCraftingMaterial> = indexUniqueBy(worldCraftingMaterials, (material) => material.id);

export const worldCraftingMaterialsByCategory: Record<WorldCraftingMaterialCategory, readonly WorldCraftingMaterial[]> = groupByKey(worldCraftingMaterials, (material) => material.category);

export function getWorldCraftingMaterial(id: WorldCraftingMaterialId) {
  return worldCraftingMaterialsById[id];
}
import { groupByKey, indexUniqueBy } from "./indexing.ts";
