export const worldFactionIds = [
  "oakhaven",
  "ironcrag",
  "aetheria",
  "port-marrow",
  "sunken-bazaar",
  "obsidian-sanctum",
  "ashwood-glade",
  "high-reach-peaks"
] as const;

export type WorldFactionId = (typeof worldFactionIds)[number];

export type WorldFactionKeyNpc = {
  name: string;
  role: string;
};

export type WorldFactionRelation = {
  id: WorldFactionId;
  note: string;
};

export type WorldFactionLore = {
  id: WorldFactionId;
  townName: string;
  factionName: string;
  zoneName: string;
  ideology: string;
  survivalWay: string;
  governance: string;
  definitionOfGood: string;
  greatestFear: string;
  keyNpcs: readonly WorldFactionKeyNpc[];
  allies: readonly WorldFactionRelation[];
  enemies: readonly WorldFactionRelation[];
};

export const worldFactions = [
  {
    id: "oakhaven",
    townName: "Oakhaven",
    factionName: "The Sylvan Concord",
    zoneName: "Starter Forest (Ashwood Glade)",
    ideology: "Primal preservation and ecological symbiosis. Technology, mechanization, and extraction are systemic infections that sever the life-blood of the World Tree.",
    survivalWay: "Lives in self-woven arbor-homes. Food comes from symbiotic agroforestry, persuaded fruiting trees, and domesticated forest flora.",
    governance: "Governed by the Elder Council. Religion is animistic pantheism centered on the local forest mind, the Nature Core, as an active deity.",
    definitionOfGood: "Complete neutrality of impact: leaving no physical footprint on the forest floor.",
    greatestFear: "The absolute petrification of the living wild into sterile, mechanical stone.",
    keyNpcs: [
      { name: "Elder Rowan", role: "Overseer of Oakhaven; handles spiritual integrity." },
      { name: "Miller Finn", role: "Operator of the organic, water-driven grain mill; manages winter provisions." },
      { name: "Scout Elara", role: "Elite tactical defender tracking the corruption lines." }
    ],
    allies: [
      { id: "ashwood-glade", note: "Strained tactical alliance with shared biological roots." },
      { id: "high-reach-peaks", note: "Shared preference for peace, restraint, and non-extractive living." }
    ],
    enemies: [
      { id: "ironcrag", note: "Active conflict over woodcutting, mining, and extraction." },
      { id: "aetheria", note: "Distrusts authoritarian expansion and forced order." }
    ]
  },
  {
    id: "ironcrag",
    townName: "Ironcrag",
    factionName: "The Vulcan Guild",
    zoneName: "Volcanic Quarry (Iron Crags)",
    ideology: "Techno-industrial utilitarianism. The world is a dormant machine waiting to be fueled, hammered, and structured by sapient hands.",
    survivalWay: "Lives in brick-and-mortar blast-furnace fortresses. Deep geothermal extraction supports intensive mining and metal smelting. Food is imported through strategic logistics in exchange for metalware and tools.",
    governance: "Technocratic oligarchy led by foremen. Rejects mysticism in favor of measurable physical kinetic force.",
    definitionOfGood: "Hard output, thermal efficiency, design durability, and productive labor.",
    greatestFear: "Structural stagnation: a frozen forge that starves progress.",
    keyNpcs: [
      { name: "Overseer Bale", role: "Head of mining operations and guild production quotas." },
      { name: "Blacksmith Silas", role: "Master of steel and mechanical armor fabrication." },
      { name: "Geologist Mira", role: "Scholar mapping underground seismology and prism deposits." }
    ],
    allies: [
      { id: "aetheria", note: "Infrastructure development and defense pact." },
      { id: "sunken-bazaar", note: "Equipment trade through pragmatic merchant channels." }
    ],
    enemies: [
      { id: "oakhaven", note: "War over raw timber and excavations." },
      { id: "ashwood-glade", note: "Opposed by primal defenders of the wild." },
      { id: "obsidian-sanctum", note: "Opposes the destruction of valuable matter." }
    ]
  },
  {
    id: "aetheria",
    townName: "Aetheria",
    factionName: "The Archon Order",
    zoneName: "White Stone Citadel (Holy Reach)",
    ideology: "Absolute authoritarian theocracy. Divine structure, eternal law, and radiant purity define civilization; individual chaos, drift, or biological mutability are crimes.",
    survivalWay: "Lives in massive, pristine marble towers. Relies on precise, law-bound wheat farms run by indentured labor and tithes from satellite settlements.",
    governance: "Theocratic council of High Arcanists enforcing the Radiant Code.",
    definitionOfGood: "Complete obedience to written law, structural purity, and the purging of shadow.",
    greatestFear: "Internal heresy leading to structural chaos.",
    keyNpcs: [
      { name: "High Arcanist Vael", role: "Sovereign ruler and wielder of the Solar Star." },
      { name: "Inquisitor Joran", role: "Keeper of spiritual discipline and judge of dissidents." },
      { name: "Purifier Sarah", role: "Frontline commander purging tainted zones." }
    ],
    allies: [
      { id: "ironcrag", note: "Mutual infrastructure development and law enforcement." }
    ],
    enemies: [
      { id: "port-marrow", note: "Total ideological warfare against lawless pirates." },
      { id: "obsidian-sanctum", note: "Opposes Void decay and anti-structure doctrine." },
      { id: "ashwood-glade", note: "Opposes primal autonomy outside the Radiant Code." }
    ]
  },
  {
    id: "port-marrow",
    townName: "Port Marrow",
    factionName: "The Free Cove",
    zoneName: "Deepwater Port (Port Marrow)",
    ideology: "Radical libertarian individualism and maritime meritocracy. Laws are cages; survival belongs to those with swift blades, strong sails, and quick wits.",
    survivalWay: "Built on sprawling wooden walkways, salvaged hulls, and ocean docks. Survives through naval trading, reef salvage, smuggling, and deep-sea whaling.",
    governance: "Shifting Captain's Council, resolved by dueling or purse weight. Deities are unpredictable sea gods.",
    definitionOfGood: "Fulfilling personal oaths, maintaining individual liberty, and paying bills in gold.",
    greatestFear: "Institutional capture, high-tax execution, and chains.",
    keyNpcs: [
      { name: "Captain Marrow", role: "Unofficial voice of the council and harbor warden." },
      { name: "Navigator Kai", role: "Mapmaker charting anomalies and oceanic currents." },
      { name: "Runner Kael", role: "Swift smuggler coordinating land routes." }
    ],
    allies: [
      { id: "sunken-bazaar", note: "Joint smuggling, trade operations, and flexible contracts." }
    ],
    enemies: [
      { id: "aetheria", note: "Active naval war against authoritarian law." }
    ]
  },
  {
    id: "sunken-bazaar",
    townName: "The Sunken Bazaar",
    factionName: "The Dust Syndicate",
    zoneName: "Arid Ruins (Canaan Desert)",
    ideology: "Unfettered mercantile pragmatism. Beliefs are assets to be traded; order stabilizes transactions, while chaos opens windows for liquidation.",
    survivalWay: "Lives beneath grand subterranean vaults and tents carved from desert canyon walls. Deep water wells provide hydration, while trade routes supply exotic meats.",
    governance: "Managed by the Merchant Cartel. The Golden Scales is their patron god of fair trade and wealth.",
    definitionOfGood: "Net profit, liquid asset growth, and honor in contract terms.",
    greatestFear: "Complete economic freeze, trade route blockades, or currency devaluation.",
    keyNpcs: [
      { name: "Broker Rex", role: "Arch-trader holding the ledger of all debts." },
      { name: "Merchant Lynd", role: "Supplier of exotic armor plates and mounts." },
      { name: "Appraiser Chloe", role: "Master of historical relic evaluation." }
    ],
    allies: [
      { id: "port-marrow", note: "Joint smuggling and maritime trade operations." },
      { id: "ironcrag", note: "Equipment trades and industrial supply." }
    ],
    enemies: [
      { id: "obsidian-sanctum", note: "Opposes the dissolution of material value." },
      { id: "high-reach-peaks", note: "Rejected by ascetics for material greed." }
    ]
  },
  {
    id: "obsidian-sanctum",
    townName: "Obsidian Sanctum",
    factionName: "The Nihil Sect",
    zoneName: "The Void Rift",
    ideology: "Philosophical accelerationism, decay, and transformation. Growth can only happen out of the void, so mortal matter must dissolve and be remade into immortal cosmic forms.",
    survivalWay: "Lives in black obsidian geometries hovering around a gravity well. Survives by extracting ambient void essence and transmuting decay into sustenance.",
    governance: "The Hive Collective, overseen by Void Scholars whispering to the Rift.",
    definitionOfGood: "Accelerated convergence toward the end of existence and the shedding of biological individuality.",
    greatestFear: "Eternal equilibrium: structural stagnation where nothing changes or rots.",
    keyNpcs: [
      { name: "Alchemist Zora", role: "Researcher synthesizing mutated elixirs." },
      { name: "The Cursed Statue", role: "Sentient ancient monolith exchanging power for life force." },
      { name: "Acolyte Lyros", role: "Youthful zealot guarding the Rift gateway." }
    ],
    allies: [],
    enemies: [
      { id: "oakhaven", note: "Views living ecology as matter waiting to be processed." },
      { id: "ironcrag", note: "Seeks to dissolve durable industry and valuable matter." },
      { id: "aetheria", note: "Opposes radiant law and structural purity." },
      { id: "port-marrow", note: "Views personal liberty as temporary biological noise." },
      { id: "sunken-bazaar", note: "Dissolves market value and material contracts." },
      { id: "ashwood-glade", note: "Treats primal life as raw transitional matter." },
      { id: "high-reach-peaks", note: "Opposes spiritual mastery with cosmic decay." }
    ]
  },
  {
    id: "ashwood-glade",
    townName: "Ashwood Glade",
    factionName: "The Verdant Outcasts",
    zoneName: "Deep Primeval Forest (Ashwood Wilderness)",
    ideology: "Radical eco-primal dominance. Oakhaven is too weak and civilized; nature should devour the flesh of weak urban populations.",
    survivalWay: "Nomadic hunter-gatherers living under dynamic leather tents. They hunt massive creatures, consume raw forest meats, and dress in bone armor.",
    governance: "Led by shamanistic elders who interpret planetary calls.",
    definitionOfGood: "Personal physical strength, wild instincts, and successful reclaiming of territory.",
    greatestFear: "Becoming soft, domesticated, and civilly tamed.",
    keyNpcs: [
      { name: "Shaman Corvus", role: "Keeper of natural blood rites." },
      { name: "Hunter Keera", role: "Beast master of the pack." },
      { name: "Thorne the Wild", role: "Berserker defending hunting boundaries." }
    ],
    allies: [
      { id: "oakhaven", note: "Strained biological kinship and tactical alliance." }
    ],
    enemies: [
      { id: "ironcrag", note: "Opposes extraction, forges, and industrial expansion." },
      { id: "aetheria", note: "Opposes civil control and religious authority." }
    ]
  },
  {
    id: "high-reach-peaks",
    townName: "High-Reach Peaks",
    factionName: "The Ascetics of Sky",
    zoneName: "Cloud Peaks (Whisperwind Ascent)",
    ideology: "Non-duality, self-mastery, and spiritual detachment. The physical world is a mirror; conquer the self, and you conquer the universe.",
    survivalWay: "Lives in high mountain temples accessible only by flight or dangerous climbing. Survives on condensed clouds, high-altitude mosses, and solar rays.",
    governance: "Strict meritocracy guided by enlightened masters.",
    definitionOfGood: "Mental control, emotional balance, and physical excellence.",
    greatestFear: "Yielding to baseline emotional instincts and base desires.",
    keyNpcs: [
      { name: "Master Kael", role: "Spiritual trainer of advanced motion." },
      { name: "Monastic Scholar Jin", role: "Guardian of ancient global archives." },
      { name: "Guardian Tariq", role: "Protector of the high steps from invaders." }
    ],
    allies: [
      { id: "oakhaven", note: "Shared restraint and low-impact doctrine." }
    ],
    enemies: [
      { id: "sunken-bazaar", note: "Abhors material greed." },
      { id: "obsidian-sanctum", note: "Abhors spiritual decay and Void dissolution." }
    ]
  }
] as const;

export const worldFactionById: Record<WorldFactionId, WorldFactionLore> = indexUniqueBy(worldFactions, (faction) => faction.id);
import { indexUniqueBy } from "./indexing.ts";
