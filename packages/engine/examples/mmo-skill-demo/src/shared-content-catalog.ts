import { type WorldFactionId } from "./data/world-factions.ts";
import { type SkillName, type ZoneId } from "./shared-contracts.ts";
import { type WorldCraftRecipe } from "./shared-economy.ts";

const NPC_ROLES: Record<string, string> = {
  "elder-rowan": "quest",
  "blacksmith-silas": "crafting",
  "miller-finn": "quest",
  "scout-elara": "quest",
  "overseer-bale": "quest",
  "geologist-mira": "quest",
  "runner-kael": "travel",
  "high-arcanist-vael": "quest",
  "navigator-kai": "travel",
  "alchemist-zora": "merchant",
  "foreman-iron-will": "trainer",
  "banker-valerius": "bank",
  "merchant-kaya": "merchant",
  "broker-rex": "merchant",
  "merchant-lynd": "merchant",
  "appraiser-chloe": "merchant",
  "master-kael": "trainer",
  "inquisitor-joran": "quest",
  "purifier-sarah": "quest",
  "shaman-corvus": "quest",
  "hunter-keera": "quest",
  "thorne-the-wild": "trainer",
  "monastic-scholar-jin": "quest",
  "guardian-tariq": "trainer",
  "acolyte-lyros": "quest",
  "captain-marrow": "travel",
  "contract-board": "contract",
  blacksmith: "crafting",
  "apprentice-jinn": "merchant",
  "cursed-statue": "hidden",
  "innkeeper-martha": "home",
  "power-node": "boss-node",
  "spore-pod": "boss-node",
  "glass-clone": "boss-node",
  "prowling-wolf": "mob",
  "iron-eye-bat": "mob",
  "stone-crawler": "mob",
  "crystal-beetle": "mob",
  "crag-sapper": "mob",
  "sand-wraith": "mob",
  "cursed-archer": "mob",
  "mire-bomber": "mob",
  "rune-priest": "mob",
  "ash-bramble-stalker": "mob",
  "veil-oracle": "mob",
  "ember-acolyte": "mob",
  "dungeon-revenant": "elite",
  "aggro-tree": "mob",
  "alpha-timberwolf": "elite",
  "crag-gargoyle": "elite",
  "void-sent-sentinel": "elite",
  "bazaar-guard": "elite",
  "great-ash-lord": "boss",
  "iron-core-golem": "boss",
  "mirror-king": "boss"
};

const PEACE_NPC_ROLES = new Set<string>(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);

type ContractDef = {
  id: string;
  name: string;
  minRank: number;
  targetKills: number;
  targetKinds: readonly string[];
  gold: number;
  renown: number;
  combatXp: number;
  supplies?: Record<string, number>;
};

type WorldEventDef = {
  id: string;
  name: string;
  zoneId: ZoneId;
  goal: number;
  durationMs: number;
  restMs: number;
  objective: string;
  rewardText: string;
  gold: number;
  renown: number;
  xpSkill: SkillName;
  xp: number;
  supplies?: Record<string, number>;
};

type LootDropDef = {
  itemId: string;
  amount: number;
  chance?: number;
};

type LootTableDef = {
  base: readonly LootDropDef[];
  bonus?: readonly LootDropDef[];
};

const CONTRACTS = [
  {
    id: "ashwood-hunt",
    name: "Ashwood Hunt",
    minRank: 1,
    targetKills: 12,
    targetKinds: ["prowling-wolf", "alpha-timberwolf", "aggro-tree", "ash-bramble-stalker"],
    gold: 42,
    renown: 55,
    combatXp: 72,
    supplies: { gladeBerries: 2 }
  },
  {
    id: "crag-patrol",
    name: "Crag Patrol",
    minRank: 2,
    targetKills: 10,
    targetKinds: ["iron-eye-bat", "stone-crawler", "crystal-beetle", "crag-sapper", "crag-gargoyle"],
    gold: 58,
    renown: 80,
    combatXp: 96,
    supplies: { ironOre: 4 }
  },
  {
    id: "bazaar-sweep",
    name: "Bazaar Sweep",
    minRank: 3,
    targetKills: 9,
    targetKinds: ["sand-wraith", "cursed-archer", "mire-bomber", "rune-priest", "veil-oracle", "void-sent-sentinel", "bazaar-guard"],
    gold: 86,
    renown: 120,
    combatXp: 140,
    supplies: { silkThread: 2, cinderAle: 1 }
  },
  {
    id: "dungeon-writ",
    name: "Dungeon Writ",
    minRank: 4,
    targetKills: 1,
    targetKinds: ["great-ash-lord", "iron-core-golem", "mirror-king", "dungeon-revenant"],
    gold: 160,
    renown: 210,
    combatXp: 220,
    supplies: { cinderAle: 2, speedPotions: 2 }
  }
] as const;

const NPC_LOOT_TABLES: Record<string, LootTableDef> = {
  "prowling-wolf": {
    base: [
      { itemId: "gold", amount: 3 },
      { itemId: "glade-berry", amount: 1, chance: 0.35 }
    ]
  },
  "ash-bramble-stalker": {
    base: [
      { itemId: "gold", amount: 5 },
      { itemId: "ash-logs", amount: 2 },
      { itemId: "glade-berry", amount: 1, chance: 0.5 }
    ]
  },
  "aggro-tree": {
    base: [
      { itemId: "gold", amount: 4 },
      { itemId: "ash-logs", amount: 3 }
    ]
  },
  "alpha-timberwolf": {
    base: [
      { itemId: "gold", amount: 18 },
      { itemId: "glade-berry", amount: 3 }
    ],
    bonus: [{ itemId: "leather-boots", amount: 1 }]
  },
  "iron-eye-bat": {
    base: [
      { itemId: "gold", amount: 4 },
      { itemId: "speed-potion", amount: 1, chance: 0.25 }
    ]
  },
  "stone-crawler": {
    base: [
      { itemId: "gold", amount: 5 },
      { itemId: "iron-ore", amount: 2 }
    ]
  },
  "crystal-beetle": {
    base: [
      { itemId: "gold", amount: 6 },
      { itemId: "iron-ore", amount: 3 }
    ]
  },
  "crag-sapper": {
    base: [
      { itemId: "gold", amount: 7 },
      { itemId: "iron-ore", amount: 2 },
      { itemId: "speed-potion", amount: 1, chance: 0.5 }
    ]
  },
  "crag-gargoyle": {
    base: [
      { itemId: "gold", amount: 22 },
      { itemId: "iron-ore", amount: 6 }
    ],
    bonus: [{ itemId: "iron-chest", amount: 1 }]
  },
  "sand-wraith": {
    base: [
      { itemId: "gold", amount: 8 },
      { itemId: "silk-thread", amount: 1 }
    ]
  },
  "cursed-archer": {
    base: [
      { itemId: "gold", amount: 8 },
      { itemId: "silk-thread", amount: 1 }
    ]
  },
  "mire-bomber": {
    base: [
      { itemId: "gold", amount: 9 },
      { itemId: "speed-potion", amount: 1 }
    ]
  },
  "rune-priest": {
    base: [
      { itemId: "gold", amount: 10 },
      { itemId: "cinder-ale", amount: 1 }
    ]
  },
  "veil-oracle": {
    base: [
      { itemId: "gold", amount: 12 },
      { itemId: "silk-thread", amount: 2 },
      { itemId: "cinder-ale", amount: 1, chance: 0.5 }
    ]
  },
  "void-sent-sentinel": {
    base: [
      { itemId: "gold", amount: 26 },
      { itemId: "silk-thread", amount: 3 }
    ],
    bonus: [{ itemId: "ring-focus", amount: 1 }]
  },
  "bazaar-guard": {
    base: [
      { itemId: "gold", amount: 24 },
      { itemId: "silk-thread", amount: 2 }
    ],
    bonus: [{ itemId: "ring-focus", amount: 1 }]
  },
  "ember-acolyte": {
    base: [
      { itemId: "gold", amount: 12 },
      { itemId: "cinder-ale", amount: 1 }
    ]
  },
  "dungeon-revenant": {
    base: [
      { itemId: "gold", amount: 28 },
      { itemId: "cinder-ale", amount: 1 },
      { itemId: "broken-hilt", amount: 1, chance: 0.25 }
    ]
  },
  "great-ash-lord": {
    base: [
      { itemId: "gold", amount: 80 },
      { itemId: "cinder-ale", amount: 2 }
    ]
  },
  "iron-core-golem": {
    base: [
      { itemId: "gold", amount: 92 },
      { itemId: "iron-ore", amount: 10 }
    ],
    bonus: [
      { itemId: "broken-hilt", amount: 1 },
      { itemId: "elite-weapon", amount: 1 }
    ]
  },
  "mirror-king": {
    base: [
      { itemId: "gold", amount: 110 },
      { itemId: "silk-thread", amount: 4 }
    ],
    bonus: [{ itemId: "unique-cape", amount: 1 }]
  }
};

const WORLD_EVENTS = [
  {
    id: "ashwood-pack",
    name: "Ashwood Pack Rally",
    zoneId: "ashwood",
    goal: 12,
    durationMs: 180000,
    restMs: 14000,
    objective: "Cull wolves or finish Ashwood cuts before the pack regroups.",
    rewardText: "+18 gold +28 renown +combat XP",
    gold: 18,
    renown: 28,
    xpSkill: "combat",
    xp: 34,
    supplies: { gladeBerries: 1 }
  },
  {
    id: "outcast-hunt",
    name: "Outcast Hunt",
    zoneId: "ashwood",
    goal: 8,
    durationMs: 170000,
    restMs: 14000,
    objective: "Cull primeval beasts before the Verdant Outcasts lose the hunting line.",
    rewardText: "+22 gold +34 renown +combat XP",
    gold: 22,
    renown: 34,
    xpSkill: "combat",
    xp: 44,
    supplies: { "outcast-hunt-skull": 1 }
  },
  {
    id: "crag-supply",
    name: "Crag Supply Rush",
    zoneId: "crags",
    goal: 10,
    durationMs: 180000,
    restMs: 14000,
    objective: "Mine ore or clear Crag threats to open a safe supply route.",
    rewardText: "+24 gold +36 renown +mining XP",
    gold: 24,
    renown: 36,
    xpSkill: "mining",
    xp: 42,
    supplies: { ironOre: 2 }
  },
  {
    id: "holy-purge",
    name: "Holy Purge",
    zoneId: "port-marrow",
    goal: 8,
    durationMs: 170000,
    restMs: 15000,
    objective: "Break rogue radiant patrols and recover sealed script fragments.",
    rewardText: "+28 gold +42 renown +combat XP",
    gold: 28,
    renown: 42,
    xpSkill: "combat",
    xp: 54,
    supplies: { "ancient-script-scroll": 1 }
  },
  {
    id: "bazaar-breach",
    name: "Bazaar Breach",
    zoneId: "canaan-desert",
    goal: 8,
    durationMs: 160000,
    restMs: 16000,
    objective: "Defeat Bazaar elites or survive the ruins while pressure is high.",
    rewardText: "+38 gold +52 renown +combat XP",
    gold: 38,
    renown: 52,
    xpSkill: "combat",
    xp: 62,
    supplies: { cinderAle: 1, silkThread: 1 }
  },
  {
    id: "rift-containment",
    name: "Rift Containment",
    zoneId: "bazaar",
    goal: 6,
    durationMs: 150000,
    restMs: 18000,
    objective: "Clear Void creatures before the rift pressure spills into the trade roads.",
    rewardText: "+42 gold +58 renown +combat XP",
    gold: 42,
    renown: 58,
    xpSkill: "combat",
    xp: 70,
    supplies: { "nihil-ash-sludge": 1, "void-seed-shell": 1 }
  },
  {
    id: "wind-trial",
    name: "Wind Trial",
    zoneId: "port-marrow",
    goal: 7,
    durationMs: 170000,
    restMs: 15000,
    objective: "Clear the high paths and prove steady motion through mountain pressure.",
    rewardText: "+26 gold +44 renown +combat XP",
    gold: 26,
    renown: 44,
    xpSkill: "combat",
    xp: 52,
    supplies: { "ascetic-jade-stone": 1 }
  },
  {
    id: "dungeon-surge",
    name: "Dungeon Surge",
    zoneId: "dungeon",
    goal: 3,
    durationMs: 240000,
    restMs: 18000,
    objective: "Break power nodes and defeat bosses before the instance stabilizes.",
    rewardText: "+70 gold +90 renown +combat XP",
    gold: 70,
    renown: 90,
    xpSkill: "combat",
    xp: 110,
    supplies: { cinderAle: 2, speedPotions: 1 }
  },
  {
    id: "cottage-restock",
    name: "Cottage Restock",
    zoneId: "cottage",
    goal: 3,
    durationMs: 180000,
    restMs: 12000,
    objective: "Use cottage storage or home services to restock the private instance.",
    rewardText: "+10 gold +14 renown +wood XP",
    gold: 10,
    renown: 14,
    xpSkill: "woodcutting",
    xp: 20,
    supplies: { gladeBerries: 2 }
  }
] as const;

const CONTRACT_FACTION_REWARDS: Record<string, { factionId: WorldFactionId; rep: number; supplies?: Record<string, number> }> = {
  "ashwood-hunt": { factionId: "oakhaven", rep: 12, supplies: { "concord-oak-leaf": 1, "wolf-hide-strip": 1 } },
  "crag-patrol": { factionId: "ironcrag", rep: 14, supplies: { "guild-copper-token": 1, "fine-coal-lump": 1 } },
  "bazaar-sweep": { factionId: "sunken-bazaar", rep: 16, supplies: { "syndicate-debt-note": 1, "bazaar-glass-bottle": 1 } },
  "dungeon-writ": { factionId: "aetheria", rep: 20, supplies: { "ancient-script-scroll": 1, "dungeon-lock-grate": 1 } }
};

const WORLD_EVENT_FACTION_REWARDS: Record<string, { factionId: WorldFactionId; rep: number; supplies?: Record<string, number> }> = {
  "ashwood-pack": { factionId: "oakhaven", rep: 8, supplies: { "concord-oak-leaf": 1, "oakhaven-softwood": 1 } },
  "outcast-hunt": { factionId: "ashwood-glade", rep: 10, supplies: { "outcast-hunt-skull": 1, "feral-blood-vial": 1 } },
  "crag-supply": { factionId: "ironcrag", rep: 10, supplies: { "guild-copper-token": 1, "dull-tin-flake": 1 } },
  "holy-purge": { factionId: "aetheria", rep: 12, supplies: { "inquisition-sealing-wax": 1, "ancient-script-scroll": 1 } },
  "bazaar-breach": { factionId: "sunken-bazaar", rep: 12, supplies: { "syndicate-debt-note": 1, "spun-spider-silk": 1 } },
  "rift-containment": { factionId: "obsidian-sanctum", rep: 13, supplies: { "nihil-ash-sludge": 1, "void-seed-shell": 1 } },
  "wind-trial": { factionId: "high-reach-peaks", rep: 11, supplies: { "ascetic-jade-stone": 1, "monastic-sage-tea": 1 } },
  "dungeon-surge": { factionId: "aetheria", rep: 14, supplies: { "ancient-script-scroll": 1, "mirror-mirror-segment": 1 } },
  "cottage-restock": { factionId: "port-marrow", rep: 6, supplies: { "cove-salvage-box": 1 } }
};

const NPC_MATERIAL_REWARDS: Record<string, { factionId: WorldFactionId; rep: number; drops: readonly LootDropDef[] }> = {
  "prowling-wolf": { factionId: "oakhaven", rep: 1, drops: [{ itemId: "wolf-tooth", amount: 1 }, { itemId: "wolf-hide-strip", amount: 1, chance: 0.35 }] },
  "ash-bramble-stalker": { factionId: "ashwood-glade", rep: 2, drops: [{ itemId: "bramble-thorn-vine", amount: 1 }, { itemId: "scythe-seed-claws", amount: 1, chance: 0.45 }] },
  "aggro-tree": { factionId: "oakhaven", rep: 1, drops: [{ itemId: "ashwood-heartwood", amount: 1 }, { itemId: "dry-bramble-branch", amount: 1 }] },
  "alpha-timberwolf": { factionId: "ashwood-glade", rep: 6, drops: [{ itemId: "wolf-hide-strip", amount: 2 }, { itemId: "outcast-hunt-skull", amount: 1 }] },
  "iron-eye-bat": { factionId: "ironcrag", rep: 1, drops: [{ itemId: "bat-wing-membrane", amount: 1 }, { itemId: "calamity-talon", amount: 1, chance: 0.2 }] },
  "stone-crawler": { factionId: "ironcrag", rep: 2, drops: [{ itemId: "crawler-chitin-block", amount: 1 }, { itemId: "ironcrag-slate", amount: 1, chance: 0.5 }] },
  "crystal-beetle": { factionId: "ironcrag", rep: 2, drops: [{ itemId: "prism-crystal-shards", amount: 1 }, { itemId: "deep-geode-cluster", amount: 1, chance: 0.4 }] },
  "crag-sapper": { factionId: "ironcrag", rep: 2, drops: [{ itemId: "sapper-dynamite-fuse", amount: 1 }, { itemId: "sulphur-flake", amount: 1 }] },
  "crag-gargoyle": { factionId: "ironcrag", rep: 7, drops: [{ itemId: "gargoyle-heart-core", amount: 1 }, { itemId: "gargoyle-dust-pile", amount: 2 }] },
  "sand-wraith": { factionId: "sunken-bazaar", rep: 2, drops: [{ itemId: "wraith-essence-residue", amount: 1 }, { itemId: "spun-spider-silk", amount: 1, chance: 0.3 }] },
  "cursed-archer": { factionId: "sunken-bazaar", rep: 2, drops: [{ itemId: "grave-bone-plate", amount: 1 }, { itemId: "spun-spider-silk", amount: 1, chance: 0.4 }] },
  "mire-bomber": { factionId: "sunken-bazaar", rep: 2, drops: [{ itemId: "desert-cactus-pulp", amount: 1 }, { itemId: "bazaar-glass-bottle", amount: 1, chance: 0.25 }] },
  "rune-priest": { factionId: "aetheria", rep: 2, drops: [{ itemId: "anointed-candle-core", amount: 1 }, { itemId: "ancient-script-scroll", amount: 1, chance: 0.25 }] },
  "veil-oracle": { factionId: "obsidian-sanctum", rep: 3, drops: [{ itemId: "cursed-oracle-tongue", amount: 1 }, { itemId: "nihil-ash-sludge", amount: 1, chance: 0.35 }] },
  "void-sent-sentinel": { factionId: "obsidian-sanctum", rep: 8, drops: [{ itemId: "pure-void-tear", amount: 1 }, { itemId: "void-seed-shell", amount: 1 }] },
  "bazaar-guard": { factionId: "sunken-bazaar", rep: 6, drops: [{ itemId: "syndicate-debt-note", amount: 1 }, { itemId: "sun-seared-leather", amount: 1 }] },
  "ember-acolyte": { factionId: "aetheria", rep: 2, drops: [{ itemId: "solos-emblem", amount: 1, chance: 0.25 }, { itemId: "anointed-candle-core", amount: 1 }] },
  "dungeon-revenant": { factionId: "obsidian-sanctum", rep: 8, drops: [{ itemId: "dungeon-lock-grate", amount: 1 }, { itemId: "nihil-ash-sludge", amount: 1 }] },
  "great-ash-lord": { factionId: "oakhaven", rep: 14, drops: [{ itemId: "druidic-seed-pod", amount: 1 }, { itemId: "timber-goliath-sapwood", amount: 1 }] },
  "iron-core-golem": { factionId: "ironcrag", rep: 16, drops: [{ itemId: "vulcan-core-spark", amount: 1 }, { itemId: "prism-shard-ingot", amount: 1 }] },
  "mirror-king": { factionId: "aetheria", rep: 16, drops: [{ itemId: "mirror-shatter-shard", amount: 1 }, { itemId: "ancient-script-scroll", amount: 1 }] }
};

const TREE_GATHER_MATERIALS = ["oakhaven-softwood", "soft-pine-bark", "oak-sap-extract", "dry-bramble-branch", "bright-clover-flower", "wild-oats-bundle", "bitter-root-herb"] as const;

const ORE_GATHER_MATERIALS = ["dull-tin-flake", "copper-dust", "fine-coal-lump", "porous-sandstone", "ironcrag-slate", "deep-geode-cluster"] as const;

const EXPANDED_CREATURE_SIGNATURE_DROPS: Record<string, LootDropDef> = {
  "gloom-weaver-spider": { itemId: "spun-spider-silk", amount: 1 },
  "soot-crab": { itemId: "soot-crab-carapace", amount: 1 },
  "void-leper": { itemId: "nihil-ash-sludge", amount: 1 },
  "grave-stalker": { itemId: "grave-dust-pile", amount: 1 },
  "rift-leech": { itemId: "void-seed-shell", amount: 1 },
  "spire-sentinel": { itemId: "aether-brass-ingot", amount: 1 },
  "bramble-beast": { itemId: "bramble-thorn-vine", amount: 1 },
  "fissure-skitterer": { itemId: "crawler-chitin-block", amount: 1 },
  "rust-biter": { itemId: "rust-biter-acid", amount: 1 },
  "tallow-wraith": { itemId: "tallow-wraith-wax", amount: 1 },
  "tide-stalker": { itemId: "tide-stalker-scale", amount: 1 },
  "calamity-bat": { itemId: "calamity-talon", amount: 1 },
  "timber-goliath": { itemId: "timber-goliath-sapwood", amount: 1 },
  "crystalline-strider": { itemId: "mirror-mirror-segment", amount: 1 },
  "aether-drifter": { itemId: "solos-emblem", amount: 1 },
  "void-gargoyle": { itemId: "gargoyle-heart-core", amount: 1 },
  "ashwood-alpha": { itemId: "outcast-hunt-skull", amount: 1 },
  "sapper-goblin": { itemId: "sapper-dynamite-fuse", amount: 1 },
  "ruins-archer": { itemId: "grave-bone-plate", amount: 1 },
  "marrow-cove-rat": { itemId: "scavenger-bone-shard", amount: 1 },
  "void-crawler": { itemId: "void-crawler-mandible", amount: 1 },
  "anointed-crusader": { itemId: "anointed-candle-core", amount: 1 },
  "prism-golem": { itemId: "prism-crystal-shards", amount: 2 },
  "abyssal-eel": { itemId: "eel-venom-sac", amount: 1 },
  "spore-pod": { itemId: "spore-dust-cloud", amount: 1 },
  "cursed-oracle": { itemId: "cursed-oracle-tongue", amount: 1 },
  "dungeon-harvester": { itemId: "dungeon-lock-grate", amount: 1 },
  "high-peak-eagle": { itemId: "high-peak-feather", amount: 1 },
  "moss-grizzly": { itemId: "moss-bear-claws", amount: 1 },
  "scavenger-jackal": { itemId: "scavenger-bone-shard", amount: 1 },
  "lava-spit-slime": { itemId: "lava-spit-core", amount: 1 },
  "void-amalgam": { itemId: "pure-void-tear", amount: 1 }
};

const EXPANDED_CREATURE_ZONE_REWARDS: Partial<Record<ZoneId, { factionId: WorldFactionId; drops: readonly LootDropDef[] }>> = {
  ashwood: { factionId: "oakhaven", drops: [{ itemId: "oakhaven-softwood", amount: 1 }, { itemId: "bright-clover-flower", amount: 1, chance: 0.25 }] },
  "ashwood-wilderness": { factionId: "ashwood-glade", drops: [{ itemId: "feral-blood-vial", amount: 1, chance: 0.35 }, { itemId: "outcast-hunt-skull", amount: 1, chance: 0.2 }] },
  crags: { factionId: "ironcrag", drops: [{ itemId: "ironcrag-slate", amount: 1 }, { itemId: "sulphur-flake", amount: 1, chance: 0.3 }] },
  "holy-reach": { factionId: "aetheria", drops: [{ itemId: "anointed-candle-core", amount: 1 }, { itemId: "inquisition-sealing-wax", amount: 1, chance: 0.25 }] },
  "port-marrow": { factionId: "port-marrow", drops: [{ itemId: "washed-sea-shell", amount: 1 }, { itemId: "cove-salvage-box", amount: 1, chance: 0.2 }] },
  "canaan-desert": { factionId: "sunken-bazaar", drops: [{ itemId: "desert-cactus-pulp", amount: 1 }, { itemId: "syndicate-debt-note", amount: 1, chance: 0.25 }] },
  "void-rift": { factionId: "obsidian-sanctum", drops: [{ itemId: "nihil-ash-sludge", amount: 1 }, { itemId: "void-seed-shell", amount: 1, chance: 0.35 }] },
  "whisperwind-ascent": { factionId: "high-reach-peaks", drops: [{ itemId: "ascetic-jade-stone", amount: 1, chance: 0.3 }, { itemId: "monastic-sage-tea", amount: 1, chance: 0.2 }] },
  dungeon: { factionId: "aetheria", drops: [{ itemId: "dungeon-lock-grate", amount: 1 }, { itemId: "mirror-mirror-segment", amount: 1, chance: 0.25 }] }
};

const FOREMAN_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "smelt-refined-iron", costs: { "iron-ore": 4, "fine-coal-lump": 1 }, goldCost: 2, outputItemId: "refined-iron-ingot", factionId: "ironcrag", rep: 2 },
  { id: "press-prism-ingot", costs: { "prism-crystal-shards": 3, "refined-iron-ingot": 1 }, goldCost: 6, outputItemId: "prism-shard-ingot", factionId: "ironcrag", rep: 3 }
];

const BLACKSMITH_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "forge-iron-chest", costs: { "refined-iron-ingot": 2, "crawler-chitin-block": 1 }, goldCost: 12, outputItemId: "iron-chest", equip: true, unique: true, factionId: "ironcrag", rep: 5 },
  { id: "set-ring-focus", costs: { "prism-crystal-shards": 2, "ancient-script-scroll": 1 }, goldCost: 18, outputItemId: "ring-focus", equip: true, unique: true, factionId: "aetheria", rep: 4 },
  { id: "rebuild-elite-weapon", costs: { "broken-hilt": 1, "prism-shard-ingot": 1, "vulcan-core-spark": 1 }, goldCost: 35, outputItemId: "elite-weapon", unique: true, factionId: "ironcrag", rep: 8 }
];

const ALCHEMIST_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "brew-speed-potions", costs: { "bright-clover-flower": 1, "desert-cactus-pulp": 1 }, goldCost: 2, outputItemId: "speed-potion", outputAmount: 2, factionId: "port-marrow", rep: 2 },
  { id: "brew-cinder-ale", costs: { "wild-oats-bundle": 1, "bitter-root-herb": 1 }, goldCost: 2, outputItemId: "cinder-ale", outputAmount: 2, factionId: "port-marrow", rep: 2 },
  { id: "weave-void-cloak", costs: { "spun-spider-silk": 1, "pure-void-tear": 1, "nihil-ash-sludge": 1 }, goldCost: 12, outputItemId: "void-resistant-cloak", unique: true, factionId: "obsidian-sanctum", rep: 6, questFlag: "void-resistance" }
];

const MERCHANT_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "cash-syndicate-note", costs: { "syndicate-debt-note": 1 }, goldReward: 24, factionId: "sunken-bazaar", rep: 3 },
  { id: "appraise-bazaar-glass", costs: { "bazaar-glass-bottle": 1 }, goldReward: 18, outputItemId: "speed-potion", outputAmount: 1, factionId: "sunken-bazaar", rep: 3 },
  { id: "open-cove-salvage", costs: { "cove-salvage-box": 1 }, goldReward: 8, outputItemId: "cinder-ale", outputAmount: 1, factionId: "port-marrow", rep: 2 }
];

const CURSED_STATUE_CRAFT_RECIPES: readonly WorldCraftRecipe[] = [
  { id: "distill-void-tear", costs: { "nihil-ash-sludge": 1, "void-seed-shell": 1 }, goldCost: 5, hpCost: 20, outputItemId: "pure-void-tear", factionId: "obsidian-sanctum", rep: 7 },
  { id: "bind-cursed-idol", costs: { "pure-void-tear": 1 }, goldCost: 15, hpCost: 20, outputItemId: "cursed-idol", unique: true, factionId: "obsidian-sanctum", rep: 8, questFlag: "cursed-statue" }
];

export type MarketTradeItem = {
  itemId: string;
  price: number;
  sellPrice: number;
  unique?: boolean;
};

export const MARKET_TRADE_ITEMS: Record<string, MarketTradeItem> = {
  "glade-berries": { itemId: "glade-berries", price: 6, sellPrice: 2 },
  "cinder-ale": { itemId: "cinder-ale", price: 8, sellPrice: 3 },
  "speed-potion": { itemId: "speed-potion", price: 14, sellPrice: 5 },
  pickaxe: { itemId: "pickaxe", price: 12, sellPrice: 5, unique: true },
  "iron-ore": { itemId: "iron-ore", price: 5, sellPrice: 2 },
  "ash-logs": { itemId: "ash-logs", price: 4, sellPrice: 1 },
  "silk-thread": { itemId: "silk-thread", price: 16, sellPrice: 6 },
  "ring-focus": { itemId: "ring-focus", price: 70, sellPrice: 22, unique: true },
  "iron-chest": { itemId: "iron-chest", price: 55, sellPrice: 18, unique: true },
  "void-resistant-cloak": { itemId: "void-resistant-cloak", price: 85, sellPrice: 28, unique: true }
};

export {
  ALCHEMIST_CRAFT_RECIPES,
  BLACKSMITH_CRAFT_RECIPES,
  CONTRACTS,
  CONTRACT_FACTION_REWARDS,
  CURSED_STATUE_CRAFT_RECIPES,
  EXPANDED_CREATURE_SIGNATURE_DROPS,
  EXPANDED_CREATURE_ZONE_REWARDS,
  FOREMAN_CRAFT_RECIPES,
  MERCHANT_CRAFT_RECIPES,
  NPC_LOOT_TABLES,
  NPC_MATERIAL_REWARDS,
  NPC_ROLES,
  ORE_GATHER_MATERIALS,
  PEACE_NPC_ROLES,
  TREE_GATHER_MATERIALS,
  WORLD_EVENTS,
  WORLD_EVENT_FACTION_REWARDS
};

export type {
  ContractDef,
  LootDropDef,
  LootTableDef,
  WorldEventDef
};
