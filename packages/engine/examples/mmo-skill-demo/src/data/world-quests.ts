import type { WorldCreatureId } from "./world-creatures.ts";
import type { WorldFactionId } from "./world-factions.ts";
import type { WorldCraftingMaterialId } from "./world-materials.ts";
import type { WorldReputationRewardId } from "./world-reputation.ts";
import type { RegionZoneId } from "./world.ts";
import { indexUniqueBy } from "./indexing.ts";

export type WorldQuestZoneId = RegionZoneId;
export type WorldQuestPace = "intro" | "field" | "dungeon" | "capstone";
export type WorldProgressionBand = "10s" | "10m" | "10h" | "100h";

export type WorldQuestObjective =
  | { kind: "talk"; npcId: string; note: string }
  | { kind: "scout"; zoneId: WorldQuestZoneId; anchorId: string; note: string }
  | { kind: "gather"; materialId: WorldCraftingMaterialId; amount: number; note: string }
  | { kind: "defeat"; creatureId: WorldCreatureId; amount: number; note: string }
  | { kind: "deliver"; materialId: WorldCraftingMaterialId; amount: number; recipientNpcId: string; note: string }
  | { kind: "craft"; materialId: WorldCraftingMaterialId; amount: number; station: string; note: string }
  | { kind: "survive"; zoneId: WorldQuestZoneId; durationSeconds: number; note: string }
  | { kind: "attune"; anchorId: string; materialId?: WorldCraftingMaterialId; note: string };

export type WorldQuestCreatureEcology = {
  creatureId: WorldCreatureId;
  relationship: string;
};

export type WorldQuestReward =
  | { kind: "reputation"; factionId: WorldFactionId; amount: number }
  | { kind: "material"; materialId: WorldCraftingMaterialId; amount: number }
  | { kind: "unlock"; rewardId: WorldReputationRewardId; note: string };

export type WorldFactionQuestStep = {
  id: string;
  title: string;
  pace: WorldQuestPace;
  zoneId: WorldQuestZoneId;
  anchorId: string;
  npcId: string;
  summary: string;
  progressionBand?: WorldProgressionBand;
  masteryGate?: string;
  progressionPayoff?: string;
  objectives: readonly WorldQuestObjective[];
  creatureEcology: readonly WorldQuestCreatureEcology[];
  rewards: readonly WorldQuestReward[];
};

export type WorldFactionQuestline = {
  id: string;
  factionId: WorldFactionId;
  title: string;
  startsAtNpcId: string;
  arcSummary: string;
  steps: readonly [WorldFactionQuestStep, WorldFactionQuestStep, WorldFactionQuestStep, ...WorldFactionQuestStep[]];
};

export const worldFactionQuestlines = [
  {
    id: "oakhaven-footprint-neutrality",
    factionId: "oakhaven",
    title: "Footprint Neutrality",
    startsAtNpcId: "oakhaven.elder-rowan",
    arcSummary: "Restore low-impact life around Oakhaven by reading corruption lines, feeding the mill, and persuading the forest guardians back into balance.",
    steps: [
      {
        id: "oakhaven-read-the-soft-root",
        title: "Read the Soft Root",
        pace: "intro",
        zoneId: "ashwood",
        anchorId: "oakhaven",
        npcId: "oakhaven.elder-rowan",
        summary: "Elder Rowan teaches the player to gather without stripping the living floor.",
        progressionBand: "10s",
        masteryGate: "Gather marked plants, avoid stressed vents, and see a clean reward readback.",
        progressionPayoff: "First field work teaches neutral impact before contracts and recipes compete for attention.",
        objectives: [
          { kind: "talk", npcId: "oakhaven.elder-rowan", note: "Receive the Elder Council's rule for neutral impact." },
          { kind: "gather", materialId: "oak-sap-extract", amount: 3, note: "Draw sap only from marked trees that can seal themselves." },
          { kind: "gather", materialId: "bright-clover-flower", amount: 2, note: "Collect clover growing outside spore-pod vents." }
        ],
        creatureEcology: [
          { creatureId: "spore-pod", relationship: "Filters corrupted air, but its spores mark trees under stress." },
          { creatureId: "gloom-weaver-spider", relationship: "Canopy webs reveal which paths still carry healthy insect traffic." }
        ],
        rewards: [
          { kind: "reputation", factionId: "oakhaven", amount: 25 },
          { kind: "material", materialId: "concord-oak-leaf", amount: 1 },
          { kind: "material", materialId: "oakhaven-softwood", amount: 2 }
        ]
      },
      {
        id: "oakhaven-mill-without-scars",
        title: "Mill Without Scars",
        pace: "field",
        zoneId: "ashwood",
        anchorId: "oakhaven",
        npcId: "oakhaven.miller-finn",
        summary: "Miller Finn needs winter stores without turning the riverbank into dead mud.",
        progressionBand: "10m",
        masteryGate: "Gather cleanly, protect the mill channel, and return before route planning expands.",
        progressionPayoff: "Rootway errands become safe border work instead of town busywork.",
        objectives: [
          { kind: "talk", npcId: "oakhaven.miller-finn", note: "Inspect the water-driven grain mill and ration ledger." },
          { kind: "deliver", materialId: "wild-oats-bundle", amount: 4, recipientNpcId: "oakhaven.miller-finn", note: "Restock the mill with gathered oats instead of cleared farmland." },
          { kind: "defeat", creatureId: "gloom-weaver-spider", amount: 3, note: "Drive overgrown bridge-weavers away from the mill channel without burning the webbed canopy." }
        ],
        creatureEcology: [
          { creatureId: "gloom-weaver-spider", relationship: "Controls insects, but hungry colonies can seal mill channels with sticky bridges." },
          { creatureId: "spore-pod", relationship: "Its spore bursts show where river air has started to sour." }
        ],
        rewards: [
          { kind: "reputation", factionId: "oakhaven", amount: 50 },
          { kind: "material", materialId: "miller-coarse-flour", amount: 2 },
          { kind: "unlock", rewardId: "oakhaven-druid-guild-entry", note: "The council marks the player as safe enough for inner grove work." }
        ]
      },
      {
        id: "oakhaven-thicket-truce",
        title: "Thicket Truce",
        pace: "capstone",
        zoneId: "ashwood",
        anchorId: "overgrown-thicket",
        npcId: "oakhaven.scout-elara",
        summary: "Scout Elara asks the player to steer predators and living trees away from Oakhaven before the forest hardens into war.",
        progressionBand: "10h",
        masteryGate: "Scout safe bends, redirect the alpha claim, and plant an offering without turning the thicket into a kill field.",
        progressionPayoff: "Oakhaven trust becomes route stewardship and forest diplomacy.",
        objectives: [
          { kind: "scout", zoneId: "ashwood", anchorId: "overgrown-thicket", note: "Mark safe bends where villagers can pass without crushing seedlings." },
          { kind: "defeat", creatureId: "ashwood-alpha", amount: 1, note: "Break the pack leader's claim without killing the whole wolf line." },
          { kind: "attune", anchorId: "overgrown-thicket", materialId: "druidic-seed-pod", note: "Plant a seed-pod offering at the thicket heart." }
        ],
        creatureEcology: [
          { creatureId: "ashwood-alpha", relationship: "Controls hunting bounds and can be redirected if its claim is challenged cleanly." },
          { creatureId: "timber-goliath", relationship: "Ancient seed-spreader whose migration confirms whether the truce holds." }
        ],
        rewards: [
          { kind: "reputation", factionId: "oakhaven", amount: 100 },
          { kind: "material", materialId: "elderwood-ash", amount: 1 },
          { kind: "material", materialId: "druidic-seed-pod", amount: 1 }
        ]
      }
    ]
  },
  {
    id: "ironcrag-frozen-forge",
    factionId: "ironcrag",
    title: "The Frozen Forge Problem",
    startsAtNpcId: "ironcrag.overseer-bale",
    arcSummary: "Keep Ironcrag productive by stabilizing food logistics, clearing slag ecology, and proving that geothermal extraction can continue without collapse.",
    steps: [
      {
        id: "ironcrag-quota-ledger",
        title: "Quota Ledger",
        pace: "intro",
        zoneId: "crags",
        anchorId: "ironcrag",
        npcId: "ironcrag.overseer-bale",
        summary: "Overseer Bale turns the player into a measured part of the Guild supply chain.",
        progressionBand: "10m",
        masteryGate: "Accept a work order, gather clean fuel, and prove food logistics before the forge asks for harder output.",
        progressionPayoff: "Guild trust begins as readable labor rhythm instead of raw quota pressure.",
        objectives: [
          { kind: "talk", npcId: "ironcrag.overseer-bale", note: "Accept a wage-stamped work order and risk ledger." },
          { kind: "gather", materialId: "fine-coal-lump", amount: 5, note: "Collect clean fuel before low-grade smoke chokes the lower tunnels." },
          { kind: "deliver", materialId: "wild-oats-bundle", amount: 3, recipientNpcId: "ironcrag.overseer-bale", note: "Convert food logistics into stable labor output." }
        ],
        creatureEcology: [
          { creatureId: "soot-crab", relationship: "Consumes hot slag and reveals which furnace piles are still useful." },
          { creatureId: "rust-biter", relationship: "Marks weak metal storage before a full cart failure occurs." }
        ],
        rewards: [
          { kind: "reputation", factionId: "ironcrag", amount: 25 },
          { kind: "material", materialId: "guild-copper-token", amount: 1 },
          { kind: "material", materialId: "soot-forge-coke", amount: 1 }
        ]
      },
      {
        id: "ironcrag-slag-cleaners",
        title: "Slag Cleaners",
        pace: "field",
        zoneId: "crags",
        anchorId: "ironcrag",
        npcId: "ironcrag.blacksmith-silas",
        summary: "Blacksmith Silas needs slag-feeding creatures managed instead of exterminated.",
        progressionBand: "10m",
        masteryGate: "Separate useful cleaner ecology from cart-destroying infestation before the forge permit expands.",
        progressionPayoff: "Smelter access reads as earned heat discipline, not a generic crafting unlock.",
        objectives: [
          { kind: "defeat", creatureId: "rust-biter", amount: 4, note: "Remove parasites chewing load-bearing ore carts." },
          { kind: "defeat", creatureId: "soot-crab", amount: 2, note: "Push slag crabs back to hot dumps, away from forge intakes." },
          { kind: "gather", materialId: "soot-crab-carapace", amount: 2, note: "Recover heatproof shell sections for worker guards." }
        ],
        creatureEcology: [
          { creatureId: "rust-biter", relationship: "Useful as a warning sign, catastrophic when it nests in carts." },
          { creatureId: "soot-crab", relationship: "A tolerated cleaner when penned near molten waste." }
        ],
        rewards: [
          { kind: "reputation", factionId: "ironcrag", amount: 50 },
          { kind: "material", materialId: "vulcan-core-spark", amount: 1 },
          { kind: "unlock", rewardId: "ironcrag-smelter-permit", note: "Silas stamps the player for high-heat furnace access." }
        ]
      },
      {
        id: "ironcrag-prism-seam",
        title: "Prism Seam",
        pace: "dungeon",
        zoneId: "crags",
        anchorId: "deep-fissure",
        npcId: "ironcrag.geologist-mira",
        summary: "Geologist Mira maps prism deposits before the Guild drills into a light-bearing pressure fault.",
        progressionBand: "10h",
        masteryGate: "Read fissure stress, interrupt a prism guardian, and bank mapped shards before deeper drills.",
        progressionPayoff: "Deep Fissure becomes dungeon-prep knowledge, not a bigger ore quota.",
        objectives: [
          { kind: "scout", zoneId: "crags", anchorId: "deep-fissure", note: "Chart the stress seam around the deep fissure." },
          { kind: "defeat", creatureId: "prism-golem", amount: 1, note: "Interrupt the golem's light circuit long enough to copy its pathing." },
          { kind: "deliver", materialId: "prism-crystal-shards", amount: 3, recipientNpcId: "ironcrag.geologist-mira", note: "Give Mira enough shards to model the seam." }
        ],
        creatureEcology: [
          { creatureId: "fissure-skitterer", relationship: "Cleans tunnels and leaves debris lines that point to pressure leaks." },
          { creatureId: "prism-golem", relationship: "Refracts light into safe tunnel paths, but attacks drill crews that overmine." }
        ],
        rewards: [
          { kind: "reputation", factionId: "ironcrag", amount: 100 },
          { kind: "material", materialId: "geologist-scale-map", amount: 1 },
          { kind: "material", materialId: "prism-shard-ingot", amount: 1 }
        ]
      }
    ]
  },
  {
    id: "aetheria-radiant-code",
    factionId: "aetheria",
    title: "Radiant Code Enforcement",
    startsAtNpcId: "aetheria.high-arcanist-vael",
    arcSummary: "Serve Aetheria by proving that law, archive purity, and radiant fire can hold against drift, piracy, and Void contamination.",
    steps: [
      {
        id: "aetheria-written-light",
        title: "Written Light",
        pace: "intro",
        zoneId: "holy-reach",
        anchorId: "aetheria",
        npcId: "aetheria.high-arcanist-vael",
        summary: "High Arcanist Vael admits the player to outer archive work under strict law.",
        progressionBand: "10m",
        masteryGate: "Handle one scroll, one seal, and one obedience rule before holy combat drills open.",
        progressionPayoff: "Aetherian trust begins as readable archive discipline instead of abstract law math.",
        objectives: [
          { kind: "talk", npcId: "aetheria.high-arcanist-vael", note: "Swear temporary obedience to archive handling rules." },
          { kind: "gather", materialId: "ancient-script-scroll", amount: 1, note: "Recover a crumbling formula from a controlled archive shelf." },
          { kind: "deliver", materialId: "inquisition-sealing-wax", amount: 1, recipientNpcId: "aetheria.high-arcanist-vael", note: "Seal the scroll before outside air corrupts the ink." }
        ],
        creatureEcology: [
          { creatureId: "spire-sentinel", relationship: "Maintains timed archive patrols and tests whether the player respects clean routes." },
          { creatureId: "aether-drifter", relationship: "Burns atmospheric ash above the citadel to preserve radiant clarity." }
        ],
        rewards: [
          { kind: "reputation", factionId: "aetheria", amount: 25 },
          { kind: "material", materialId: "solos-emblem", amount: 1 },
          { kind: "material", materialId: "order-wheat-bundle", amount: 2 }
        ]
      },
      {
        id: "aetheria-courtyard-drill",
        title: "Courtyard Drill",
        pace: "field",
        zoneId: "holy-reach",
        anchorId: "aetheria",
        npcId: "aetheria.high-arcanist-vael",
        summary: "The Order measures the player's discipline against its holy guards and sentinels.",
        progressionBand: "10m",
        masteryGate: "Hold formation, disable mis-timed sentinels, and recover candle cores without breaking drill law.",
        progressionPayoff: "Holy combat trust reads as disciplined movement before broader radiant powers unlock.",
        objectives: [
          { kind: "defeat", creatureId: "anointed-crusader", amount: 3, note: "Win sanctioned sparring rounds without breaking formation law." },
          { kind: "defeat", creatureId: "spire-sentinel", amount: 2, note: "Disable mis-timed sentinels and return their cores intact." },
          { kind: "gather", materialId: "anointed-candle-core", amount: 2, note: "Recover candle cores used to inspect shield discipline." }
        ],
        creatureEcology: [
          { creatureId: "anointed-crusader", relationship: "Embodies defense drilling and punishes erratic movement." },
          { creatureId: "spire-sentinel", relationship: "A mechanical proof that law can continue without emotion." }
        ],
        rewards: [
          { kind: "reputation", factionId: "aetheria", amount: 50 },
          { kind: "material", materialId: "aether-brass-ingot", amount: 1 },
          { kind: "unlock", rewardId: "aetheria-sanctuary-access", note: "Vael records the player as a lawful archive actor." }
        ]
      },
      {
        id: "aetheria-shadow-purge",
        title: "Shadow Purge",
        pace: "capstone",
        zoneId: "void-rift",
        anchorId: "void-rift",
        npcId: "aetheria.alchemist-zora",
        summary: "Aetheria sends the player to test radiant counters against Void border organisms.",
        progressionBand: "10h",
        masteryGate: "Mark failed ward lines, break a gate watcher, and bind one radiant crest at the border.",
        progressionPayoff: "Radiant resistance reads as earned anti-Void preparation, not passive defense math.",
        objectives: [
          { kind: "scout", zoneId: "void-rift", anchorId: "void-rift", note: "Mark where radiant wards fail near the rift edge." },
          { kind: "defeat", creatureId: "void-gargoyle", amount: 1, note: "Crack a gate watcher without letting temporal dust cross the ward line." },
          { kind: "attune", anchorId: "void-rift", materialId: "solos-emblem", note: "Bind a radiant crest to the border cairn." }
        ],
        creatureEcology: [
          { creatureId: "void-gargoyle", relationship: "Guards rift pillars and reveals weak places in linear holy defenses." },
          { creatureId: "rift-leech", relationship: "Feeds on leakage that the Order wants measured before it spreads." }
        ],
        rewards: [
          { kind: "reputation", factionId: "aetheria", amount: 100 },
          { kind: "material", materialId: "ancient-script-scroll", amount: 2 },
          { kind: "material", materialId: "gargoyle-heart-core", amount: 1 }
        ]
      }
    ]
  },
  {
    id: "port-marrow-free-keel",
    factionId: "port-marrow",
    title: "Free Keel Compact",
    startsAtNpcId: "port-marrow.captain-marrow",
    arcSummary: "Earn Port Marrow trust through salvage, reef survival, and oath-keeping that proves liberty can still hold a route together.",
    steps: [
      {
        id: "port-marrow-oath-and-bill",
        title: "Oath and Bill",
        pace: "intro",
        zoneId: "port-marrow",
        anchorId: "port-marrow",
        npcId: "port-marrow.captain-marrow",
        summary: "Captain Marrow offers work that starts with personal debt instead of law.",
        progressionBand: "10m",
        masteryGate: "Pay attention to oath, bill, dock repair, and waste pressure before route services expand.",
        progressionPayoff: "Free Cove trust starts as personal accountability instead of lawless fast travel.",
        objectives: [
          { kind: "talk", npcId: "port-marrow.captain-marrow", note: "Accept the harbor rule: pay your bill and keep your oath." },
          { kind: "gather", materialId: "washed-sea-shell", amount: 4, note: "Collect lime shells for dock repairs." },
          { kind: "defeat", creatureId: "marrow-cove-rat", amount: 5, note: "Clear garbage runners before they chew sailcloth stores." }
        ],
        creatureEcology: [
          { creatureId: "marrow-cove-rat", relationship: "Clears refuse, but overbreeds when smugglers dump fish waste under docks." },
          { creatureId: "grave-stalker", relationship: "Keeps rocky bays clean and hints where bodies or contraband drift ashore." }
        ],
        rewards: [
          { kind: "reputation", factionId: "port-marrow", amount: 25 },
          { kind: "material", materialId: "cove-salvage-box", amount: 1 },
          { kind: "material", materialId: "captain-smuggled-rum", amount: 1 }
        ]
      },
      {
        id: "port-marrow-reef-ledger",
        title: "Reef Ledger",
        pace: "field",
        zoneId: "port-marrow",
        anchorId: "port-marrow",
        npcId: "port-marrow.navigator-kai",
        summary: "Navigator Kai needs living reef threats charted before the next smuggling tide.",
        progressionBand: "10m",
        masteryGate: "Map tide cuts, drive ambush predators below the boards, and return scale proof.",
        progressionPayoff: "Private dock trust reads as route knowledge and oath-kept salvage work.",
        objectives: [
          { kind: "scout", zoneId: "port-marrow", anchorId: "port-marrow", note: "Map safe dock shadows and tide cuts." },
          { kind: "defeat", creatureId: "tide-stalker", amount: 3, note: "Drive ambush predators below the outer boards." },
          { kind: "gather", materialId: "tide-stalker-scale", amount: 2, note: "Recover scale plates that shed seawater cleanly." }
        ],
        creatureEcology: [
          { creatureId: "tide-stalker", relationship: "Ambushes from below dock planks and defines unsafe shore lanes." },
          { creatureId: "abyssal-eel", relationship: "Hunts deeper fissures that Kai uses as current landmarks." }
        ],
        rewards: [
          { kind: "reputation", factionId: "port-marrow", amount: 50 },
          { kind: "material", materialId: "marrow-cove-brine", amount: 1 },
          { kind: "unlock", rewardId: "port-marrow-private-dock", note: "The harbor grants storage without municipal fees." }
        ]
      },
      {
        id: "port-marrow-black-current",
        title: "Black Current",
        pace: "capstone",
        zoneId: "port-marrow",
        anchorId: "port-marrow",
        npcId: "port-marrow.navigator-kai",
        summary: "The Free Cove tests whether the player can cross a deep route without calling for state protection.",
        progressionBand: "10h",
        masteryGate: "Survive the black current, break the eel claim, and return route proof without outside law.",
        progressionPayoff: "Port mastery turns freedom into owned route responsibility.",
        objectives: [
          { kind: "survive", zoneId: "port-marrow", durationSeconds: 90, note: "Ride the black current during a predator bloom." },
          { kind: "defeat", creatureId: "abyssal-eel", amount: 1, note: "Break a fissure eel's claim so salvage crews can pass." },
          { kind: "deliver", materialId: "abyssal-eel-hide", amount: 1, recipientNpcId: "port-marrow.captain-marrow", note: "Bring proof that the route is open." }
        ],
        creatureEcology: [
          { creatureId: "abyssal-eel", relationship: "Top predator in dark reef cracks and natural test of sea-route control." },
          { creatureId: "grave-stalker", relationship: "Appears after failed crossings and marks where the current kills." }
        ],
        rewards: [
          { kind: "reputation", factionId: "port-marrow", amount: 100 },
          { kind: "material", materialId: "marrow-cove-brine", amount: 2 },
          { kind: "material", materialId: "cove-salvage-box", amount: 2 }
        ]
      }
    ]
  },
  {
    id: "sunken-bazaar-golden-scales",
    factionId: "sunken-bazaar",
    title: "Golden Scales Arbitration",
    startsAtNpcId: "sunken-bazaar.merchant-kaya",
    arcSummary: "Prove value to the Dust Syndicate by restoring contracts, reading relic markets, and keeping desert trade from freezing under Void rot.",
    steps: [
      {
        id: "sunken-bazaar-open-ledger",
        title: "Open Ledger",
        pace: "intro",
        zoneId: "canaan-desert",
        anchorId: "sunken-bazaar",
        npcId: "sunken-bazaar.merchant-kaya",
        summary: "Merchant Kaya starts the player with a debt that must return more value than it costs.",
        progressionBand: "10m",
        masteryGate: "Accept a market writ, gather caravan water, and return debt proof before interest becomes pressure.",
        progressionPayoff: "Bazaar trust begins as readable contract discipline before rare relic trading expands.",
        objectives: [
          { kind: "talk", npcId: "sunken-bazaar.merchant-kaya", note: "Accept a limited market writ under the Golden Scales." },
          { kind: "gather", materialId: "desert-cactus-pulp", amount: 3, note: "Secure water-rich pulp for caravans waiting below the vaults." },
          { kind: "deliver", materialId: "syndicate-debt-note", amount: 1, recipientNpcId: "sunken-bazaar.merchant-kaya", note: "Return the first assigned debt note before interest compounds." }
        ],
        creatureEcology: [
          { creatureId: "scavenger-jackal", relationship: "Tracks travelers at a distance and exposes weak caravan routes." },
          { creatureId: "void-leper", relationship: "Marks where Void rot has started turning people into unsellable risk." }
        ],
        rewards: [
          { kind: "reputation", factionId: "sunken-bazaar", amount: 25 },
          { kind: "material", materialId: "bazaar-glass-bottle", amount: 1 },
          { kind: "material", materialId: "dust-syndicate-stamp", amount: 1 }
        ]
      },
      {
        id: "sunken-bazaar-vault-echo",
        title: "Vault Echo",
        pace: "field",
        zoneId: "canaan-desert",
        anchorId: "sunken-bazaar",
        npcId: "sunken-bazaar.merchant-kaya",
        summary: "The Syndicate wants greedy echoes cleared without damaging the assets that birthed them.",
        progressionBand: "10m",
        masteryGate: "Clear value-haunted ruins without damaging assets the market still needs.",
        progressionPayoff: "Backroom access reads as earned appraisal trust and route leverage.",
        objectives: [
          { kind: "defeat", creatureId: "tallow-wraith", amount: 3, note: "Disperse vault echoes while leaving coin piles intact." },
          { kind: "defeat", creatureId: "ruins-archer", amount: 3, note: "Clear skeletal watchmen from the old gate approach." },
          { kind: "gather", materialId: "tallow-wraith-wax", amount: 2, note: "Collect ghost-wax for price-sealing candles." }
        ],
        creatureEcology: [
          { creatureId: "tallow-wraith", relationship: "Greed echo that proves wealth has psychological as well as material residue." },
          { creatureId: "ruins-archer", relationship: "Old security still enforcing dead contracts on living merchants." }
        ],
        rewards: [
          { kind: "reputation", factionId: "sunken-bazaar", amount: 50 },
          { kind: "material", materialId: "appraiser-eye-glass", amount: 1 },
          { kind: "unlock", rewardId: "sunken-bazaar-backroom-access", note: "Kaya opens rare relic trades to the player." }
        ]
      },
      {
        id: "sunken-bazaar-void-discount",
        title: "Void Discount",
        pace: "capstone",
        zoneId: "canaan-desert",
        anchorId: "void-rift",
        npcId: "sunken-bazaar.merchant-kaya",
        summary: "A price anomaly near the Rift threatens to make all contracts meaningless.",
        progressionBand: "10h",
        masteryGate: "Scout value distortion, contain contract rot, and stamp a restored exchange rate before deeper trade opens.",
        progressionPayoff: "Bazaar capstone mastery turns money into a readable anti-Void tool.",
        objectives: [
          { kind: "scout", zoneId: "void-rift", anchorId: "void-rift", note: "Mark trade stones where currency value begins to distort." },
          { kind: "defeat", creatureId: "void-leper", amount: 3, note: "Contain pariahs scrawling contract-breaking runes on vault walls." },
          { kind: "attune", anchorId: "sunken-bazaar", materialId: "dust-syndicate-stamp", note: "Stamp the restored exchange rate onto the vault scale." }
        ],
        creatureEcology: [
          { creatureId: "void-leper", relationship: "Human cost of Void rot and direct threat to contract legibility." },
          { creatureId: "scavenger-jackal", relationship: "Circles failing caravans and gives early warning of route collapse." }
        ],
        rewards: [
          { kind: "reputation", factionId: "sunken-bazaar", amount: 100 },
          { kind: "material", materialId: "syndicate-debt-note", amount: 3 },
          { kind: "material", materialId: "bazaar-glass-bottle", amount: 2 }
        ]
      }
    ]
  },
  {
    id: "obsidian-sanctum-convergence",
    factionId: "obsidian-sanctum",
    title: "Convergence Doctrine",
    startsAtNpcId: "obsidian-sanctum.alchemist-zora",
    arcSummary: "Follow the Nihil Sect into controlled decay by sampling rift organisms, bargaining with the monolith, and proving that identity can be treated as raw material.",
    steps: [
      {
        id: "obsidian-sanctum-first-decay",
        title: "First Decay",
        pace: "intro",
        zoneId: "void-rift",
        anchorId: "obsidian-sanctum",
        npcId: "obsidian-sanctum.alchemist-zora",
        summary: "Alchemist Zora starts with a small exposure test at the edge of the Rift.",
        progressionBand: "10m",
        masteryGate: "Take one sealed sample, collect decay safely, and harvest leeches before larger bargains appear.",
        progressionPayoff: "Void work begins as controlled exposure instead of sudden endgame punishment.",
        objectives: [
          { kind: "talk", npcId: "obsidian-sanctum.alchemist-zora", note: "Accept a sealed sample vial and a warning that purity is temporary." },
          { kind: "gather", materialId: "nihil-ash-sludge", amount: 2, note: "Collect condensed decay before it evaporates into rift air." },
          { kind: "defeat", creatureId: "rift-leech", amount: 3, note: "Harvest leeches bloated with fresh leakage." }
        ],
        creatureEcology: [
          { creatureId: "rift-leech", relationship: "Feeds directly on Void leakage and provides the safest first sample." },
          { creatureId: "cursed-oracle", relationship: "Whispers old failed futures around black pools." }
        ],
        rewards: [
          { kind: "reputation", factionId: "obsidian-sanctum", amount: 25 },
          { kind: "material", materialId: "void-seed-shell", amount: 1 },
          { kind: "material", materialId: "pure-void-tear", amount: 1 }
        ]
      },
      {
        id: "obsidian-sanctum-bargain-weight",
        title: "Bargain Weight",
        pace: "field",
        zoneId: "void-rift",
        anchorId: "obsidian-sanctum",
        npcId: "obsidian-sanctum.cursed-statue",
        summary: "The Cursed Statue prices the player's life force against knowledge that no town will admit owning.",
        progressionBand: "10h",
        masteryGate: "Accept a life-force bargain, pay with Void seed proof, and silence bargain-breaking oracles.",
        progressionPayoff: "Dark portal access reads as a known cost before premium Void movement expands.",
        objectives: [
          { kind: "talk", npcId: "obsidian-sanctum.cursed-statue", note: "Hear the monolith's exchange rate for pain, memory, and power." },
          { kind: "deliver", materialId: "void-seed-shell", amount: 1, recipientNpcId: "obsidian-sanctum.cursed-statue", note: "Offer dormant reality skin as proof of serious intent." },
          { kind: "defeat", creatureId: "cursed-oracle", amount: 2, note: "Silence failed prophets whose muttering disrupts the bargain." }
        ],
        creatureEcology: [
          { creatureId: "cursed-oracle", relationship: "Degenerate mage ecology formed around secrets leaking into sludge." },
          { creatureId: "void-gargoyle", relationship: "Stone watcher that orients its mouth toward timeline pressure." }
        ],
        rewards: [
          { kind: "reputation", factionId: "obsidian-sanctum", amount: 50 },
          { kind: "material", materialId: "void-portal-key", amount: 1 },
          { kind: "unlock", rewardId: "obsidian-sanctum-abyssal-shift", note: "The Sect permits limited dark-matter portal use." }
        ]
      },
      {
        id: "obsidian-sanctum-amalgam-proof",
        title: "Amalgam Proof",
        pace: "capstone",
        zoneId: "void-rift",
        anchorId: "void-rift",
        npcId: "obsidian-sanctum.alchemist-zora",
        summary: "Zora requires proof that the player can survive matter that refuses stable form.",
        progressionBand: "100h",
        masteryGate: "Survive rift pressure, split unstable matter, and return cutting proof from soft reality.",
        progressionPayoff: "Far Void travel becomes shelter, pull, and rot-study mastery.",
        objectives: [
          { kind: "survive", zoneId: "void-rift", durationSeconds: 75, note: "Stay inside rift pressure while the sample destabilizes." },
          { kind: "defeat", creatureId: "void-amalgam", amount: 1, note: "Separate a shifting mass from its stone shadow long enough to sample it." },
          { kind: "deliver", materialId: "void-crawler-mandible", amount: 2, recipientNpcId: "obsidian-sanctum.alchemist-zora", note: "Bring cutting tools grown by abyssal tunnelers." }
        ],
        creatureEcology: [
          { creatureId: "void-amalgam", relationship: "Matter and shadow merging into the Sect's desired post-biological state." },
          { creatureId: "void-crawler", relationship: "Expands rift nesting tunnels and exposes where reality is soft enough to cut." }
        ],
        rewards: [
          { kind: "reputation", factionId: "obsidian-sanctum", amount: 100 },
          { kind: "material", materialId: "nihil-ash-sludge", amount: 3 },
          { kind: "material", materialId: "pure-void-tear", amount: 1 }
        ]
      }
    ]
  },
  {
    id: "ashwood-glade-primal-claim",
    factionId: "ashwood-glade",
    title: "Primal Claim",
    startsAtNpcId: "ashwood-glade.scout-elara",
    arcSummary: "Win Outcast respect by proving strength in living territory, reading predator signs, and forcing the wild to recognize the player without civilizing it.",
    steps: [
      {
        id: "ashwood-glade-blood-boundary",
        title: "Blood Boundary",
        pace: "intro",
        zoneId: "ashwood-wilderness",
        anchorId: "ashwood-glade",
        npcId: "ashwood-glade.scout-elara",
        summary: "The Outcasts test whether the player can read a hunting boundary before crossing it.",
        progressionBand: "10m",
        masteryGate: "Scout claw marks, cut living vine safely, and expose brush predators before pack work opens.",
        progressionPayoff: "Outcast trust begins as territory reading instead of random wilderness violence.",
        objectives: [
          { kind: "scout", zoneId: "ashwood-wilderness", anchorId: "ashwood-glade", note: "Mark clawed trees and bone piles around the Outcast perimeter." },
          { kind: "gather", materialId: "bramble-thorn-vine", amount: 3, note: "Cut living vine only after it tightens around the wrist." },
          { kind: "defeat", creatureId: "bramble-beast", amount: 2, note: "Expose root predators hiding as brush." }
        ],
        creatureEcology: [
          { creatureId: "bramble-beast", relationship: "Apex root predator that proves the forest can stalk like an animal." },
          { creatureId: "ashwood-alpha", relationship: "Pack leader whose markings define the first true Outcast boundary." }
        ],
        rewards: [
          { kind: "reputation", factionId: "ashwood-glade", amount: 25 },
          { kind: "material", materialId: "outcast-hunt-skull", amount: 1 },
          { kind: "material", materialId: "feral-blood-vial", amount: 1 }
        ]
      },
      {
        id: "ashwood-glade-pack-law",
        title: "Pack Law",
        pace: "field",
        zoneId: "ashwood-wilderness",
        anchorId: "ashwood-glade",
        npcId: "ashwood-glade.scout-elara",
        summary: "The player learns that Outcast diplomacy is conducted through pressure, scent, and scars.",
        progressionBand: "10h",
        masteryGate: "Challenge the alpha, mask scent with spore dust, and craft blood-salve before hunter pathing expands.",
        progressionPayoff: "Pack law turns pain and pressure into readable route control.",
        objectives: [
          { kind: "defeat", creatureId: "ashwood-alpha", amount: 1, note: "Challenge the alpha and take a route marker from its claimed tree." },
          { kind: "gather", materialId: "spore-dust-cloud", amount: 2, note: "Collect disorienting dust for salve masking." },
          { kind: "craft", materialId: "feral-blood-vial", amount: 1, station: "hunting-camp", note: "Prepare blood-salve that proves the player can use pain as information." }
        ],
        creatureEcology: [
          { creatureId: "ashwood-alpha", relationship: "Maintains pack hierarchy and respects force that does not waste the pack." },
          { creatureId: "spore-pod", relationship: "Masks scent trails when its dust is handled by trained hunters." }
        ],
        rewards: [
          { kind: "reputation", factionId: "ashwood-glade", amount: 50 },
          { kind: "material", materialId: "scout-route-marker", amount: 1 },
          { kind: "unlock", rewardId: "ashwood-glade-hunter-pathing", note: "Outcasts mark specialized tracking lines on the player's route map." }
        ]
      },
      {
        id: "ashwood-glade-goliath-wake",
        title: "Goliath Wake",
        pace: "capstone",
        zoneId: "ashwood-wilderness",
        anchorId: "overgrown-thicket",
        npcId: "ashwood-glade.scout-elara",
        summary: "The Outcasts send the player into a treant migration path to prove they can be wild without being swallowed.",
        progressionBand: "100h",
        masteryGate: "Survive moving seedfall, turn the goliath, and keep the ancient spreader alive enough to matter.",
        progressionPayoff: "Outcast mastery becomes controlled primal force instead of raw damage escalation.",
        objectives: [
          { kind: "survive", zoneId: "ashwood-wilderness", durationSeconds: 80, note: "Hold ground in a moving seedfall without damaging saplings." },
          { kind: "defeat", creatureId: "timber-goliath", amount: 1, note: "Turn the goliath from Oakhaven paths without killing the ancient seed-spreader." },
          { kind: "deliver", materialId: "timber-goliath-sapwood", amount: 1, recipientNpcId: "ashwood-glade.scout-elara", note: "Bring shock-absorbing bark shed during the wake." }
        ],
        creatureEcology: [
          { creatureId: "timber-goliath", relationship: "Ancient seed-spreader and living proof that the forest moves by its own law." },
          { creatureId: "bramble-beast", relationship: "Follows goliath seedfall to ambush scavengers and weak travelers." }
        ],
        rewards: [
          { kind: "reputation", factionId: "ashwood-glade", amount: 100 },
          { kind: "material", materialId: "ashwood-heartwood", amount: 1 },
          { kind: "material", materialId: "outcast-hunt-skull", amount: 2 }
        ]
      }
    ]
  },
  {
    id: "high-reach-peaks-sky-discipline",
    factionId: "high-reach-peaks",
    title: "Sky Discipline",
    startsAtNpcId: "high-reach-peaks.master-kael",
    arcSummary: "Train under the Ascetics of Sky by turning altitude, hunger, fear, and motion into controlled practice rather than conquest.",
    steps: [
      {
        id: "high-reach-first-breath",
        title: "First Breath",
        pace: "intro",
        zoneId: "whisperwind-ascent",
        anchorId: "high-reach-peaks",
        npcId: "high-reach-peaks.master-kael",
        summary: "Master Kael teaches the player to move slower internally before moving faster externally.",
        progressionBand: "10m",
        masteryGate: "Accept the breath rule, gather warm moss, and attune jade before wind paths ask for speed.",
        progressionPayoff: "High-Reach trust starts as calm preparation before vertical movement mastery.",
        objectives: [
          { kind: "talk", npcId: "high-reach-peaks.master-kael", note: "Accept a breathing form and a silence rule." },
          { kind: "gather", materialId: "dried-mountain-moss", amount: 3, note: "Collect moss that holds warmth without heavy gear." },
          { kind: "attune", anchorId: "high-reach-peaks", materialId: "ascetic-jade-stone", note: "Set a jade focus at the first wind shrine." }
        ],
        creatureEcology: [
          { creatureId: "high-peak-eagle", relationship: "Rides thermals that reveal invisible climbing lanes." },
          { creatureId: "moss-grizzly", relationship: "Cultivates slope moss and shows where the mountain stores warmth." }
        ],
        rewards: [
          { kind: "reputation", factionId: "high-reach-peaks", amount: 25 },
          { kind: "material", materialId: "monastic-sage-tea", amount: 1 },
          { kind: "material", materialId: "ascetic-jade-stone", amount: 1 }
        ]
      },
      {
        id: "high-reach-thermal-line",
        title: "Thermal Line",
        pace: "field",
        zoneId: "whisperwind-ascent",
        anchorId: "high-reach-peaks",
        npcId: "high-reach-peaks.master-kael",
        summary: "The player studies birds and bears to see motion without emotional chase.",
        progressionBand: "10h",
        masteryGate: "Trace eagle thermals, spar without panic, and gather feathers without raiding nests.",
        progressionPayoff: "Glider aery travel reads as earned motion discipline.",
        objectives: [
          { kind: "scout", zoneId: "whisperwind-ascent", anchorId: "high-reach-peaks", note: "Trace updrafts by watching eagle turns instead of map markings." },
          { kind: "defeat", creatureId: "high-peak-eagle", amount: 2, note: "Spar with territorial eagles and recover feathers shed in the dive." },
          { kind: "gather", materialId: "high-peak-feather", amount: 3, note: "Gather stabilizing feathers without raiding nests." }
        ],
        creatureEcology: [
          { creatureId: "high-peak-eagle", relationship: "Highest hunter and living map of safe vertical routes." },
          { creatureId: "aether-drifter", relationship: "Burns sky ash above holy reach and shows where air becomes too thin." }
        ],
        rewards: [
          { kind: "reputation", factionId: "high-reach-peaks", amount: 50 },
          { kind: "material", materialId: "wind-weave-sigil", amount: 1 },
          { kind: "unlock", rewardId: "high-reach-peaks-wind-leap", note: "Kael permits the player to use controlled updraft paths." }
        ]
      },
      {
        id: "high-reach-mirror-step",
        title: "Mirror Step",
        pace: "capstone",
        zoneId: "dungeon",
        anchorId: "sunken-spire",
        npcId: "high-reach-peaks.master-kael",
        summary: "The final exercise sends the player into reflected fear so discipline can be tested away from the mountain.",
        progressionBand: "100h",
        masteryGate: "Trace reflection paths, defeat mirror keepers cleanly, and return a shard without chasing panic.",
        progressionPayoff: "High-Reach mastery becomes portable self-control under dungeon pressure.",
        objectives: [
          { kind: "scout", zoneId: "dungeon", anchorId: "sunken-spire", note: "Trace reflection paths without chasing the false self." },
          { kind: "defeat", creatureId: "crystalline-strider", amount: 2, note: "Still the mirror keepers without shattering the whole corridor." },
          { kind: "deliver", materialId: "mirror-shatter-shard", amount: 1, recipientNpcId: "high-reach-peaks.master-kael", note: "Return a shard that shows the player's controlled reflection." }
        ],
        creatureEcology: [
          { creatureId: "crystalline-strider", relationship: "Keeps mirrors clean and punishes frantic movement with reflected threats." },
          { creatureId: "moss-grizzly", relationship: "The earlier mountain lesson: strength can maintain growth without panic." }
        ],
        rewards: [
          { kind: "reputation", factionId: "high-reach-peaks", amount: 100 },
          { kind: "material", materialId: "monastic-sage-tea", amount: 2 },
          { kind: "material", materialId: "wind-weave-sigil", amount: 1 }
        ]
      }
    ]
  }
] as const;

export type WorldFactionQuestlineId = (typeof worldFactionQuestlines)[number]["id"];
export type WorldFactionQuestStepId = (typeof worldFactionQuestlines)[number]["steps"][number]["id"];

export const worldFactionQuestlineMap: Record<WorldFactionQuestlineId, WorldFactionQuestline> = indexUniqueBy(worldFactionQuestlines, (questline) => questline.id);

export const worldFactionQuestlinesByFaction: Record<WorldFactionId, WorldFactionQuestline> = indexUniqueBy(worldFactionQuestlines, (questline) => questline.factionId);

export type WorldFactionQuestStepRecord = WorldFactionQuestStep & {
  questlineId: WorldFactionQuestline["id"];
  factionId: WorldFactionId;
};

export const worldFactionQuestSteps: readonly WorldFactionQuestStepRecord[] = worldFactionQuestlines.flatMap((questline) =>
  questline.steps.map((step) => ({
    ...step,
    questlineId: questline.id,
    factionId: questline.factionId
  }))
);

export function getWorldFactionQuestline(id: WorldFactionQuestlineId): WorldFactionQuestline {
  return worldFactionQuestlineMap[id];
}

export function getWorldFactionQuestlineForFaction(factionId: WorldFactionId): WorldFactionQuestline {
  return worldFactionQuestlinesByFaction[factionId];
}
