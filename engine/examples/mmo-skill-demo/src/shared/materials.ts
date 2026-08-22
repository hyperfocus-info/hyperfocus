import {
  BaseXP,
  gatheringSkillIds,
  isGatheringSkillId,
  isValidMaterialTier,
  type GatheringSkillId,
  type MaterialTier
} from "./skills.ts";

export interface GatherableMaterial {
  id: number;
  skillId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  name: string;
  requiredLevel: number;
  gatherTimeSeconds: number;
  spawnZones: string[];
  xpReward: number;
  hazardChance: number;
  factionAligned: string;
  whyLore: string;
}

type MaterialSeed = {
  name: string;
  spawnZones: readonly [string, ...string[]];
  factionAligned: string;
  placement: string;
  conflict: string;
  synergy: string;
};

type MaterialSkillRow = {
  skillId: GatheringSkillId;
  tiers: readonly [MaterialSeed, MaterialSeed, MaterialSeed, MaterialSeed, MaterialSeed];
};

export type MaterialCatalogValidationResult = {
  valid: boolean;
  errors: string[];
};

export const requiredLevelByMaterialTier = {
  1: 1,
  2: 20,
  3: 40,
  4: 60,
  5: 80
} as const satisfies Record<MaterialTier, number>;

export const gatherTimeSecondsByMaterialTier = {
  1: 4,
  2: 7,
  3: 11,
  4: 16,
  5: 24
} as const satisfies Record<MaterialTier, number>;

export const hazardChanceByMaterialTier = {
  1: 0.02,
  2: 0.05,
  3: 0.12,
  4: 0.22,
  5: 0.38
} as const satisfies Record<MaterialTier, number>;

const materialRows = [
  {
    skillId: "lumberjacking",
    tiers: [
      {
        name: "Pine Wood",
        spawnZones: ["ashwood", "oakhaven"],
        factionAligned: "The Sylvan Concord vs The Vulcan Guild",
        placement: "Pine Wood grows along ashwood edges where thin soil lets young conifers reclaim burned clearings.",
        conflict: "The Sylvan Concord replants it as a living buffer, while the Vulcan Guild cuts it for starter tool hafts.",
        synergy: "It pairs with Copper Dust and Honeycomb for beginner axes, field splints, and sealed campsite kits."
      },
      {
        name: "Elder Birch",
        spawnZones: ["ashwood", "ashwood-wilderness"],
        factionAligned: "The Sylvan Concord vs The Archon Order",
        placement: "Elder Birch roots beside old shrine paths where clean water carries memory-rich minerals.",
        conflict: "The Sylvan Concord treats each stand as ancestry, while the Archon Order strips bark for purity scrolls.",
        synergy: "It pairs with Rusted Seal and Brood Wax to bind oath tablets and mid-tier ward charms."
      },
      {
        name: "Sylvan Oak",
        spawnZones: ["oakhaven", "ashwood-wilderness"],
        factionAligned: "The Sylvan Concord vs The Verdant Outcasts",
        placement: "Sylvan Oak thickens in groves where beast trails circle the same canopy for generations.",
        conflict: "The Sylvan Concord trains wardens around it, while the Verdant Outcasts claim its acorns as war-rights.",
        synergy: "It pairs with Dire Leather and Moonlily for durable bows, druid harnesses, and grove focus staves."
      },
      {
        name: "Ghostwood",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Sylvan Concord",
        placement: "Ghostwood rises from dead roots where void mist bleaches trunks without breaking their grain.",
        conflict: "The Nihil Sect farms the pallor for decay rites, while the Sylvan Concord burns infected groves clean.",
        synergy: "It pairs with Voidbloom and Shadow Pelt for void-resistant cloaks and silent ritual bows."
      },
      {
        name: "Heart of World-Tree",
        spawnZones: ["oakhaven", "whisperwind-ascent"],
        factionAligned: "The Sylvan Concord vs The Nihil Sect",
        placement: "Heart of World-Tree appears only in storm-felled roots that still pulse with continental sap.",
        conflict: "The Sylvan Concord guards it as sacred renewal, while the Nihil Sect seeks to dissolve its life core.",
        synergy: "It pairs with Yggdrasil Elixir and Prism Geode Crystal for legendary regrowth engines and arch staves."
      }
    ]
  },
  {
    skillId: "mining",
    tiers: [
      {
        name: "Copper Dust",
        spawnZones: ["crags", "canaan-desert"],
        factionAligned: "The Vulcan Guild vs The Dust Syndicate",
        placement: "Copper Dust gathers in shallow crag seams where dry wind sands exposed ore faces.",
        conflict: "The Vulcan Guild wants steady tool metal, while the Dust Syndicate hoards it for coinage control.",
        synergy: "It pairs with Pine Wood and River Clay for practice picks, kiln molds, and starter spear fittings."
      },
      {
        name: "Coal Shell",
        spawnZones: ["crags", "dungeon"],
        factionAligned: "The Vulcan Guild vs The Ascetics of Sky",
        placement: "Coal Shell forms around vent pockets where old forests compressed against volcanic heat.",
        conflict: "The Vulcan Guild burns it for forge quotas, while the Ascetics of Sky condemn its choking smoke.",
        synergy: "It pairs with Granite Slab and Sweet Resin for furnace bricks and heat-stable workshop frames."
      },
      {
        name: "True Silver",
        spawnZones: ["holy-reach", "crags"],
        factionAligned: "The Archon Order vs The Vulcan Guild",
        placement: "True Silver threads through pale stone where radiant groundwater rejects common tarnish.",
        conflict: "The Archon Order mints holy seals from it, while the Vulcan Guild prizes its precise conductivity.",
        synergy: "It pairs with White Marble and Royal Jelly for sanctified blades, lenses, and anti-rot reliquaries."
      },
      {
        name: "Void Shard Ore",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Archon Order",
        placement: "Void Shard Ore grows in fractured seams where gravity stutters and ordinary metal decays inward.",
        conflict: "The Nihil Sect refines it into entropy tools, while the Archon Order destroys it on contact.",
        synergy: "It pairs with Void Diamond and Void Pitch for phase blades, rift locks, and forbidden anchors."
      },
      {
        name: "Astral Iron",
        spawnZones: ["whisperwind-ascent", "crags"],
        factionAligned: "The Vulcan Guild vs The Ascetics of Sky",
        placement: "Astral Iron condenses in meteor scars along high peaks and cools under constant star exposure.",
        conflict: "The Vulcan Guild wants sky-forged armor, while the Ascetics reserve it for disciplined pilgrim trials.",
        synergy: "It pairs with Prism Geode Crystal and Yggdrasil Elixir for prismatic siege blades and living armor ribs."
      }
    ]
  },
  {
    skillId: "foraging",
    tiers: [
      {
        name: "Bloodrose",
        spawnZones: ["ashwood", "ashwood-wilderness"],
        factionAligned: "The Verdant Outcasts vs The Archon Order",
        placement: "Bloodrose blooms where predator kills enrich thorn beds at the forest floor.",
        conflict: "The Verdant Outcasts use it in blood rites, while the Archon Order burns it as savage evidence.",
        synergy: "It pairs with Game Meat and Honeycomb for battle salves and morale feasts."
      },
      {
        name: "Earthroot",
        spawnZones: ["oakhaven", "cottage"],
        factionAligned: "The Sylvan Concord vs The Dust Syndicate",
        placement: "Earthroot hides below tilled forest gardens where damp loam stores steady mineral sweetness.",
        conflict: "The Sylvan Concord rotates harvests gently, while the Dust Syndicate overbuys it for tonic monopolies.",
        synergy: "It pairs with Rye Grain and Sweet Resin for stamina bread and field-medic poultices."
      },
      {
        name: "Moonlily",
        spawnZones: ["holy-reach", "whisperwind-ascent"],
        factionAligned: "The Archon Order vs The Ascetics of Sky",
        placement: "Moonlily opens on white pools that mirror night skies without wind ripple.",
        conflict: "The Archon Order claims it as a purity sign, while the Ascetics protect it for meditation draughts.",
        synergy: "It pairs with Sylvan Oak and Blue Sapphire for focus staves and calm-water amulets."
      },
      {
        name: "Voidbloom",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Sylvan Concord",
        placement: "Voidbloom flowers in black soil where failed portals leak cold pollen into root systems.",
        conflict: "The Nihil Sect cultivates it for rot immunity, while the Sylvan Concord uproots it to halt spread.",
        synergy: "It pairs with Shadow Pelt and Astral Tear for void resistance cloaks and rift-mender wraps."
      },
      {
        name: "Eternity Leaf",
        spawnZones: ["oakhaven", "whisperwind-ascent"],
        factionAligned: "The Sylvan Concord vs The Archon Order",
        placement: "Eternity Leaf grows on branches that survived plague, fire, frost, and a full century of pruning.",
        conflict: "The Sylvan Concord treats it as proof of patient ecology, while the Archon Order seeks immortal law ink.",
        synergy: "It pairs with Seal of the Archon and Cosmic Shard for renewal codices and resurrection-grade inks."
      }
    ]
  },
  {
    skillId: "quarrying",
    tiers: [
      {
        name: "Sandstone",
        spawnZones: ["canaan-desert", "bazaar"],
        factionAligned: "The Dust Syndicate vs The Archon Order",
        placement: "Sandstone layers settle around desert ruins where old roads trap windblown mineral sheets.",
        conflict: "The Dust Syndicate sells it as cheap masonry, while the Archon Order taxes it for road shrines.",
        synergy: "It pairs with River Clay and Wild Flax for plaster, simple kilns, and beginner shelter blocks."
      },
      {
        name: "Granite Slab",
        spawnZones: ["crags", "holy-reach"],
        factionAligned: "The Vulcan Guild vs The Archon Order",
        placement: "Granite Slab breaks from mountain shelves pressed by old magma and glacial weight.",
        conflict: "The Vulcan Guild needs it for machine beds, while the Archon Order demands it for fortress foundations.",
        synergy: "It pairs with Coal Shell and Brass Gear for heavy presses and stable forge platforms."
      },
      {
        name: "White Marble",
        spawnZones: ["holy-reach", "whisperwind-ascent"],
        factionAligned: "The Archon Order vs The Dust Syndicate",
        placement: "White Marble appears where limestone purified under radiant aquifers and slow peak pressure.",
        conflict: "The Archon Order reserves it for citadels, while the Dust Syndicate smuggles slabs to status buyers.",
        synergy: "It pairs with True Silver and Royal Jelly for purifier altars and polished healing vessels."
      },
      {
        name: "Dark Basalt",
        spawnZones: ["crags", "void-rift"],
        factionAligned: "The Vulcan Guild vs The Nihil Sect",
        placement: "Dark Basalt cools at lava vents where void ash hardens the outer crust.",
        conflict: "The Vulcan Guild values its heat resistance, while the Nihil Sect etches it into entropy pylons.",
        synergy: "It pairs with Brimstone Mud and Void Mote for warded furnaces and rift-safe bridge stones."
      },
      {
        name: "Null-Geode Block",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Ascetics of Sky",
        placement: "Null-Geode Block grows in hollow chambers that cancel nearby song, spell, and compass pull.",
        conflict: "The Nihil Sect builds silence vaults from it, while the Ascetics fear it erases disciplined inner focus.",
        synergy: "It pairs with Mycelium Void-Cord and Void Diamond for null prisons and anti-magic siege cores."
      }
    ]
  },
  {
    skillId: "fishing",
    tiers: [
      {
        name: "Bitter-Tail",
        spawnZones: ["port-marrow", "ashwood"],
        factionAligned: "The Free Cove vs The Sylvan Concord",
        placement: "Bitter-Tail schools in brackish river mouths where tannin-rich forest water meets harbor salt.",
        conflict: "The Free Cove nets it as cheap rations, while the Sylvan Concord limits catches to protect spawning.",
        synergy: "It pairs with Wild Flax and Honeycomb for trail meals and waterproof bait wraps."
      },
      {
        name: "Silver-Gill",
        spawnZones: ["port-marrow", "holy-reach"],
        factionAligned: "The Free Cove vs The Archon Order",
        placement: "Silver-Gill flashes around clear docks where moonlit pilings shelter clean-water fry.",
        conflict: "The Free Cove sells it freely, while the Archon Order regulates it as temple fasting food.",
        synergy: "It pairs with Moonlily and Sweet Resin for clarity tonics and lacquered ceremonial hooks."
      },
      {
        name: "Tide-Eel",
        spawnZones: ["port-marrow", "dungeon"],
        factionAligned: "The Free Cove vs The Dust Syndicate",
        placement: "Tide-Eel nests in submerged wreck gaps where current pulses through broken cargo ribs.",
        conflict: "The Free Cove harvests it for oil, while the Dust Syndicate cages it to power hidden traps.",
        synergy: "It pairs with Brass Gear and Guard Venom for shock snares and flexible cable armor."
      },
      {
        name: "Abyssal Stalker",
        spawnZones: ["port-marrow", "void-rift"],
        factionAligned: "The Free Cove vs The Nihil Sect",
        placement: "Abyssal Stalker hunts below lightless trenches where void silt changes pressure and scent.",
        conflict: "The Free Cove respects it as a captain's trial, while the Nihil Sect mutates it into rift guardians.",
        synergy: "It pairs with Shadow Pelt and Void Pitch for stealth diving suits and abyssal hunter blades."
      },
      {
        name: "Leviathan Scale-Fish",
        spawnZones: ["port-marrow", "whisperwind-ascent"],
        factionAligned: "The Free Cove vs The Archon Order",
        placement: "Leviathan Scale-Fish follows ancient migration lines between storm seas and sky-fed waterfalls.",
        conflict: "The Free Cove claims it by daring, while the Archon Order declares its scales royal naval property.",
        synergy: "It pairs with Behemoth Hide and Astral Iron for leviathan bulwarks and wave-splitting helms."
      }
    ]
  },
  {
    skillId: "skinning",
    tiers: [
      {
        name: "Raw Pelt",
        spawnZones: ["ashwood", "cottage"],
        factionAligned: "The Verdant Outcasts vs The Sylvan Concord",
        placement: "Raw Pelt comes from common forest beasts that graze along village edges and berry paths.",
        conflict: "The Verdant Outcasts wear it as proof of survival, while the Sylvan Concord restricts needless kills.",
        synergy: "It pairs with Pine Amber and Wild Flax for starter cloaks and soft quiver linings."
      },
      {
        name: "Crag Hide",
        spawnZones: ["crags", "canaan-desert"],
        factionAligned: "The Vulcan Guild vs The Verdant Outcasts",
        placement: "Crag Hide toughens on cliff grazers exposed to ash winds and sharp volcanic scree.",
        conflict: "The Vulcan Guild buys it for heat aprons, while the Verdant Outcasts keep hunting rights by blood rite.",
        synergy: "It pairs with Coal Shell and Granite Slab for forge gloves and impact-resistant harness pads."
      },
      {
        name: "Dire Leather",
        spawnZones: ["ashwood-wilderness", "dungeon"],
        factionAligned: "The Verdant Outcasts vs The Archon Order",
        placement: "Dire Leather is taken from alpha cave predators that den near bone piles and cold springs.",
        conflict: "The Verdant Outcasts prize it for war gear, while the Archon Order brands its use as primal rebellion.",
        synergy: "It pairs with Sylvan Oak and Horn Core for ranger bows, bracers, and trap rigs."
      },
      {
        name: "Shadow Pelt",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Verdant Outcasts",
        placement: "Shadow Pelt grows on beasts that hunt through rift fog until their coats drink ambient darkness.",
        conflict: "The Nihil Sect harvests it for stealth acolytes, while the Verdant Outcasts kill carriers before packs turn.",
        synergy: "It pairs with Voidbloom and Astral Tear for void resistance cloaks and silent ambush wraps."
      },
      {
        name: "Behemoth Hide",
        spawnZones: ["ashwood-wilderness", "crags"],
        factionAligned: "The Verdant Outcasts vs The Vulcan Guild",
        placement: "Behemoth Hide comes from ancient migratory giants that scrape bark and stone from every territory.",
        conflict: "The Verdant Outcasts treat the hunt as succession, while the Vulcan Guild wants the hide for shock plating.",
        synergy: "It pairs with Leviathan Scale-Fish and Astral Iron for colossal shields and siege harnesses."
      }
    ]
  },
  {
    skillId: "crop-harvesting",
    tiers: [
      {
        name: "Wild Flax",
        spawnZones: ["ashwood", "cottage"],
        factionAligned: "The Sylvan Concord vs The Dust Syndicate",
        placement: "Wild Flax spreads through sunny field margins where forest gardens meet footpaths.",
        conflict: "The Sylvan Concord weaves it locally, while the Dust Syndicate bulk-buys it to control cloth prices.",
        synergy: "It pairs with Raw Pelt and River Clay for simple armor pads, bandages, and field packs."
      },
      {
        name: "Rye Grain",
        spawnZones: ["holy-reach", "cottage"],
        factionAligned: "The Archon Order vs The Free Cove",
        placement: "Rye Grain thrives in disciplined holy fields where cool wind dries stalks before rot.",
        conflict: "The Archon Order counts every sheaf for tithe, while the Free Cove smuggles grain past temple levies.",
        synergy: "It pairs with Earthroot and Honeycomb for stamina bread and ration crates."
      },
      {
        name: "Gossypium Cotton",
        spawnZones: ["canaan-desert", "bazaar"],
        factionAligned: "The Dust Syndicate vs The Archon Order",
        placement: "Gossypium Cotton ripens in irrigated desert plots fed by hidden bazaar wells.",
        conflict: "The Dust Syndicate controls the wells, while the Archon Order demands cloth tribute for uniforms.",
        synergy: "It pairs with Royal Jelly and True Silver for healer wraps and polished officer padding."
      },
      {
        name: "Twilight Sky-Oats",
        spawnZones: ["whisperwind-ascent", "holy-reach"],
        factionAligned: "The Ascetics of Sky vs The Archon Order",
        placement: "Twilight Sky-Oats grow on terraces that catch last light and cold cloud dew.",
        conflict: "The Ascetics grow them for breath control, while the Archon Order requisitions them for elite cavalry feed.",
        synergy: "It pairs with Blue Sapphire and Aether Drift for focus meals and altitude talismans."
      },
      {
        name: "Sun-Thread Fiber",
        spawnZones: ["holy-reach", "whisperwind-ascent"],
        factionAligned: "The Archon Order vs The Ascetics of Sky",
        placement: "Sun-Thread Fiber forms in rare golden stalks that track solstice light across peak fields.",
        conflict: "The Archon Order claims it for divine banners, while the Ascetics reserve it for vow robes.",
        synergy: "It pairs with Golden Nectar and Eternity Leaf for radiant vestments and rebirth sutures."
      }
    ]
  },
  {
    skillId: "scavenging",
    tiers: [
      {
        name: "Scrap Iron",
        spawnZones: ["crags", "bazaar"],
        factionAligned: "The Vulcan Guild vs The Dust Syndicate",
        placement: "Scrap Iron collects around failed carts, broken anvils, and dry trade-route wrecks.",
        conflict: "The Vulcan Guild recycles it into tools, while the Dust Syndicate flips it through repair markets.",
        synergy: "It pairs with Copper Dust and Pine Wood for repair kits and crude trap jaws."
      },
      {
        name: "Driftwood",
        spawnZones: ["port-marrow", "ashwood"],
        factionAligned: "The Free Cove vs The Sylvan Concord",
        placement: "Driftwood washes into coves after river storms tear branches from upstream sanctuaries.",
        conflict: "The Free Cove patches docks with it, while the Sylvan Concord tracks it as evidence of flood damage.",
        synergy: "It pairs with Bitter-Tail and Sweet Resin for floating bait crates and small skiff ribs."
      },
      {
        name: "Brass Gear",
        spawnZones: ["bazaar", "crags"],
        factionAligned: "The Dust Syndicate vs The Vulcan Guild",
        placement: "Brass Gear turns up in abandoned counting machines and collapsed lift housings.",
        conflict: "The Dust Syndicate hides ledgers inside gearboxes, while the Vulcan Guild wants the parts for automation.",
        synergy: "It pairs with Tide-Eel and Guard Venom for sprung traps and charged clockwork lures."
      },
      {
        name: "Airship Rib",
        spawnZones: ["whisperwind-ascent", "canaan-desert"],
        factionAligned: "The Ascetics of Sky vs The Dust Syndicate",
        placement: "Airship Rib falls along high routes where thin wind breaks overloaded merchant hulls.",
        conflict: "The Ascetics mark wrecks as caution shrines, while the Dust Syndicate strips them before debts surface.",
        synergy: "It pairs with Twilight Sky-Oats and Aether Drift for glider frames and sky caravan repairs."
      },
      {
        name: "Sunken Engine Core",
        spawnZones: ["port-marrow", "void-rift"],
        factionAligned: "The Free Cove vs The Nihil Sect",
        placement: "Sunken Engine Core rests in deep wrecks where pressure, salt, and void current fused machinery shut.",
        conflict: "The Free Cove wants salvage rights, while the Nihil Sect uses cores as anchors for drowned portals.",
        synergy: "It pairs with Deep Abyssal Clay and Cosmic Shard for abyss engines and mobile rift seals."
      }
    ]
  },
  {
    skillId: "essence-siphoning",
    tiers: [
      {
        name: "Ley-Sparks",
        spawnZones: ["ashwood", "holy-reach"],
        factionAligned: "The Sylvan Concord vs The Archon Order",
        placement: "Ley-Sparks flicker where root networks cross old shrine stones and expose harmless current.",
        conflict: "The Sylvan Concord vents them back into soil, while the Archon Order bottles them for law lamps.",
        synergy: "It pairs with Raw Quartz and Honeycomb for novice focus charms and glow seals."
      },
      {
        name: "Aether Drift",
        spawnZones: ["whisperwind-ascent", "holy-reach"],
        factionAligned: "The Ascetics of Sky vs The Archon Order",
        placement: "Aether Drift pools in still high air after dawn light warms cloudwater over temple cliffs.",
        conflict: "The Ascetics breathe through it in training, while the Archon Order channels it into command beacons.",
        synergy: "It pairs with Twilight Sky-Oats and Rose Garnet for altitude tonics and flight-stable rings."
      },
      {
        name: "Void Mote",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Vulcan Guild",
        placement: "Void Mote leaks from hairline cracks in reality and clings to metal dust and cave fungus.",
        conflict: "The Nihil Sect cultivates motes as communion seeds, while the Vulcan Guild seals them away from machinery.",
        synergy: "It pairs with Dark Basalt and Glow-Spore for rift lanterns and anti-corrosion furnace wards."
      },
      {
        name: "Astral Tear",
        spawnZones: ["whisperwind-ascent", "void-rift"],
        factionAligned: "The Ascetics of Sky vs The Nihil Sect",
        placement: "Astral Tear condenses during meteor showers where star light crosses void vapor.",
        conflict: "The Ascetics collect it for disciplined visions, while the Nihil Sect corrupts it into collapse rituals.",
        synergy: "It pairs with Voidbloom and Shadow Pelt for void resistance cloaks and star-thread veils."
      },
      {
        name: "Cosmic Shard",
        spawnZones: ["void-rift", "whisperwind-ascent"],
        factionAligned: "The Nihil Sect vs The Ascetics of Sky",
        placement: "Cosmic Shard crystallizes at the boundary where rift gravity meets peak silence.",
        conflict: "The Nihil Sect treats it as end-state matter, while the Ascetics lock it behind mastery vows.",
        synergy: "It pairs with Eternity Leaf and Sunken Engine Core for renewal engines and cosmic navigation cores."
      }
    ]
  },
  {
    skillId: "apiculture",
    tiers: [
      {
        name: "Honeycomb",
        spawnZones: ["ashwood", "cottage"],
        factionAligned: "The Sylvan Concord vs The Dust Syndicate",
        placement: "Honeycomb fills low tree hollows beside flower fields and warm village walls.",
        conflict: "The Sylvan Concord harvests without breaking queens, while the Dust Syndicate raids hives for sweet trade.",
        synergy: "It pairs with Rye Grain and Pine Wood for rations, sealants, and beginner field kits."
      },
      {
        name: "Brood Wax",
        spawnZones: ["oakhaven", "ashwood-wilderness"],
        factionAligned: "The Sylvan Concord vs The Verdant Outcasts",
        placement: "Brood Wax forms around active larvae in guarded wild hives under heavy canopy.",
        conflict: "The Sylvan Concord protects hive cycles, while the Verdant Outcasts prize wax for blood-mask bindings.",
        synergy: "It pairs with Elder Birch and Rusted Seal for oath tablets and living-map candles."
      },
      {
        name: "Guard Venom",
        spawnZones: ["ashwood-wilderness", "canaan-desert"],
        factionAligned: "The Verdant Outcasts vs The Dust Syndicate",
        placement: "Guard Venom concentrates in soldier bees defending dry cliff nests and thorn corridors.",
        conflict: "The Verdant Outcasts use it to test hunters, while the Dust Syndicate bottles it for trap contracts.",
        synergy: "It pairs with Brass Gear and Tide-Eel for clockwork stingers and shock snares."
      },
      {
        name: "Royal Jelly",
        spawnZones: ["holy-reach", "oakhaven"],
        factionAligned: "The Archon Order vs The Sylvan Concord",
        placement: "Royal Jelly appears in queen chambers fed by pristine blossoms and radiant stone warmth.",
        conflict: "The Archon Order claims it for sanctioned healing, while the Sylvan Concord refuses queen disruption.",
        synergy: "It pairs with White Marble and Seal of the Archon for purity flasks and restoration altars."
      },
      {
        name: "Golden Nectar",
        spawnZones: ["whisperwind-ascent", "holy-reach"],
        factionAligned: "The Ascetics of Sky vs The Archon Order",
        placement: "Golden Nectar is made by peak bees visiting sun-thread fields during clear solstice dawns.",
        conflict: "The Ascetics share it only after trials, while the Archon Order redirects it to divine regalia.",
        synergy: "It pairs with Sun-Thread Fiber and Eternity Leaf for radiant vestments and immortal salves."
      }
    ]
  },
  {
    skillId: "sap-tapping",
    tiers: [
      {
        name: "Pine Amber",
        spawnZones: ["ashwood", "oakhaven"],
        factionAligned: "The Sylvan Concord vs The Vulcan Guild",
        placement: "Pine Amber beads on young conifers after beetle damage and spring thaw.",
        conflict: "The Sylvan Concord taps sparingly to heal bark, while the Vulcan Guild buys it as cheap adhesive.",
        synergy: "It pairs with Raw Pelt and Wild Flax for cloak seams and starter bow grips."
      },
      {
        name: "Sweet Resin",
        spawnZones: ["oakhaven", "cottage"],
        factionAligned: "The Sylvan Concord vs The Free Cove",
        placement: "Sweet Resin runs from orchard trunks fed by composted river reeds and pollinator paths.",
        conflict: "The Sylvan Concord uses it for communal repair, while the Free Cove smuggles it as ship caulk.",
        synergy: "It pairs with Driftwood and Silver-Gill for skiff repair kits and water-sealed tackle."
      },
      {
        name: "Corrupted Tar",
        spawnZones: ["void-rift", "ashwood-wilderness"],
        factionAligned: "The Nihil Sect vs The Verdant Outcasts",
        placement: "Corrupted Tar seeps from trees whose roots drink void runoff and predator blood.",
        conflict: "The Nihil Sect distills it into mutation paste, while the Verdant Outcasts burn infected trunks.",
        synergy: "It pairs with Death Cap and Dark Basalt for poison bombs and sealed rift braziers."
      },
      {
        name: "Void Pitch",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Free Cove",
        placement: "Void Pitch drips from dead timbers suspended inside low-gravity wreck chambers.",
        conflict: "The Nihil Sect paints gates with it, while the Free Cove wants it for unsinkable black hulls.",
        synergy: "It pairs with Void Shard Ore and Abyssal Stalker for phase anchors and stealth diving gear."
      },
      {
        name: "Yggdrasil Elixir",
        spawnZones: ["oakhaven", "whisperwind-ascent"],
        factionAligned: "The Sylvan Concord vs The Nihil Sect",
        placement: "Yggdrasil Elixir wells from ancient roots only when sky rain and deep earth pulses align.",
        conflict: "The Sylvan Concord guards it as world medicine, while the Nihil Sect wants to invert it into decay fuel.",
        synergy: "It pairs with Astral Iron and Heart of World-Tree for prismatic siege blades and living citadel cores."
      }
    ]
  },
  {
    skillId: "spore-hunting",
    tiers: [
      {
        name: "Puffball Cap",
        spawnZones: ["ashwood", "dungeon"],
        factionAligned: "The Sylvan Concord vs The Verdant Outcasts",
        placement: "Puffball Cap grows on damp logs where shade stays steady and hoof traffic is light.",
        conflict: "The Sylvan Concord spreads it for soil health, while the Verdant Outcasts harvest it for smoke screens.",
        synergy: "It pairs with Bloodrose and Honeycomb for wound dust and simple diversion bombs."
      },
      {
        name: "Phosphor Fungi",
        spawnZones: ["dungeon", "crags"],
        factionAligned: "The Vulcan Guild vs The Ascetics of Sky",
        placement: "Phosphor Fungi clings to cave ceilings warmed by vents and fed by mineral drip.",
        conflict: "The Vulcan Guild mines it for cold light, while the Ascetics preserve it as a pilgrim guide.",
        synergy: "It pairs with Coal Shell and Raw Quartz for miner lamps and glow-inset focus beads."
      },
      {
        name: "Glow-Spore",
        spawnZones: ["dungeon", "holy-reach"],
        factionAligned: "The Archon Order vs The Nihil Sect",
        placement: "Glow-Spore floats through crypt vents where clean bones and old incense feed pale colonies.",
        conflict: "The Archon Order sanctifies it for healing light, while the Nihil Sect darkens it into rot clouds.",
        synergy: "It pairs with Royal Jelly and Ancient Scroll for archon purity flasks and memory lanterns."
      },
      {
        name: "Death Cap",
        spawnZones: ["ashwood-wilderness", "void-rift"],
        factionAligned: "The Verdant Outcasts vs The Archon Order",
        placement: "Death Cap grows under predator dens where iron-rich blood and void damp make soil lethal.",
        conflict: "The Verdant Outcasts brew trial poisons, while the Archon Order purges every patch as heresy.",
        synergy: "It pairs with Corrupted Tar and Alpha Canine for assassination venoms and fear totems."
      },
      {
        name: "Mycelium Void-Cord",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Ascetics of Sky",
        placement: "Mycelium Void-Cord braids through underground rift faults and pulses when spells are cast nearby.",
        conflict: "The Nihil Sect uses it as living conduit, while the Ascetics sever it before it binds thought.",
        synergy: "It pairs with Null-Geode Block and Cosmic Shard for anti-magic cages and void relay lattices."
      }
    ]
  },
  {
    skillId: "dredging",
    tiers: [
      {
        name: "River Clay",
        spawnZones: ["ashwood", "cottage"],
        factionAligned: "The Sylvan Concord vs The Archon Order",
        placement: "River Clay settles in slow bends where forest roots filter silt into workable beds.",
        conflict: "The Sylvan Concord shapes it into communal ware, while the Archon Order taxes bricks for shrines.",
        synergy: "It pairs with Sandstone and Wild Flax for plaster blocks and beginner kiln linings."
      },
      {
        name: "Deep Canal Silt",
        spawnZones: ["port-marrow", "bazaar"],
        factionAligned: "The Free Cove vs The Dust Syndicate",
        placement: "Deep Canal Silt collects below trade canals where cargo dust and sea minerals sink together.",
        conflict: "The Free Cove dredges it to keep ships moving, while the Dust Syndicate pans it for lost valuables.",
        synergy: "It pairs with Driftwood and Brass Gear for canal gates and weighted salvage nets."
      },
      {
        name: "Brimstone Mud",
        spawnZones: ["crags", "canaan-desert"],
        factionAligned: "The Vulcan Guild vs The Dust Syndicate",
        placement: "Brimstone Mud bubbles in hot flats where sulfur vents leak through old riverbeds.",
        conflict: "The Vulcan Guild refines it for heat compounds, while the Dust Syndicate sells volatile mud bombs.",
        synergy: "It pairs with Dark Basalt and Guard Venom for scorcher traps and fireproof mortar."
      },
      {
        name: "Volcanic Slag",
        spawnZones: ["crags", "void-rift"],
        factionAligned: "The Vulcan Guild vs The Nihil Sect",
        placement: "Volcanic Slag sinks near cooled lava channels and catches void ash in glassy pockets.",
        conflict: "The Vulcan Guild recycles it into furnace flux, while the Nihil Sect seeds it into corrupt foundries.",
        synergy: "It pairs with Void Shard Ore and Corrupted Tar for unstable blast charges and sealed hazard anchors."
      },
      {
        name: "Deep Abyssal Clay",
        spawnZones: ["port-marrow", "void-rift"],
        factionAligned: "The Free Cove vs The Nihil Sect",
        placement: "Deep Abyssal Clay compacts below trenches where cold pressure preserves ancient organic residue.",
        conflict: "The Free Cove needs it for pressure hulls, while the Nihil Sect molds it into drowned idol shells.",
        synergy: "It pairs with Sunken Engine Core and Leviathan Scale-Fish for abyss engines and pressure armor."
      }
    ]
  },
  {
    skillId: "archaeology",
    tiers: [
      {
        name: "Fossil Chunk",
        spawnZones: ["canaan-desert", "dungeon"],
        factionAligned: "The Dust Syndicate vs The Ascetics of Sky",
        placement: "Fossil Chunk surfaces where desert wind cuts old lake beds and exposes giant bone layers.",
        conflict: "The Dust Syndicate auctions fossils, while the Ascetics study them as humility records.",
        synergy: "It pairs with Raw Quartz and River Clay for bone charms and museum-grade casts."
      },
      {
        name: "Rusted Seal",
        spawnZones: ["holy-reach", "dungeon"],
        factionAligned: "The Archon Order vs The Dust Syndicate",
        placement: "Rusted Seal lies in collapsed clerk vaults where damp stone ate old administrative locks.",
        conflict: "The Archon Order wants old authority restored, while the Dust Syndicate sells seals as forged titles.",
        synergy: "It pairs with Elder Birch and Brood Wax for oath tablets and contract wards."
      },
      {
        name: "Crypt Plate",
        spawnZones: ["dungeon", "holy-reach"],
        factionAligned: "The Archon Order vs The Nihil Sect",
        placement: "Crypt Plate covers noble tomb floors where old names were carved over hidden sanctums.",
        conflict: "The Archon Order protects lineage claims, while the Nihil Sect scrapes plates for death sigils.",
        synergy: "It pairs with White Marble and Glow-Spore for memory lanterns and sanctum gate keys."
      },
      {
        name: "Ancient Scroll",
        spawnZones: ["dungeon", "whisperwind-ascent"],
        factionAligned: "The Ascetics of Sky vs The Archon Order",
        placement: "Ancient Scroll survives in dry high archives and sealed crypt boxes away from mold and law revisions.",
        conflict: "The Ascetics preserve original teachings, while the Archon Order censors passages that weaken doctrine.",
        synergy: "It pairs with Glow-Spore and Twilight Sky-Oats for recall incense and disciplined spell manuals."
      },
      {
        name: "Seal of the Archon",
        spawnZones: ["holy-reach", "dungeon"],
        factionAligned: "The Archon Order vs The Nihil Sect",
        placement: "Seal of the Archon rests beneath first-citadel vaults where radiant law was carved into gold stone.",
        conflict: "The Archon Order treats it as sovereign proof, while the Nihil Sect wants to crack its binding law.",
        synergy: "It pairs with Royal Jelly and Eternity Leaf for archon purity flasks and immortal decree inks."
      }
    ]
  },
  {
    skillId: "hunting",
    tiers: [
      {
        name: "Game Meat",
        spawnZones: ["ashwood", "cottage"],
        factionAligned: "The Verdant Outcasts vs The Sylvan Concord",
        placement: "Game Meat comes from common deer and boar moving between berry clearings and farm edges.",
        conflict: "The Verdant Outcasts hunt for strength, while the Sylvan Concord limits take to herd balance.",
        synergy: "It pairs with Bloodrose and Rye Grain for morale stews and training camp meals."
      },
      {
        name: "Musk Gland",
        spawnZones: ["ashwood-wilderness", "crags"],
        factionAligned: "The Verdant Outcasts vs The Dust Syndicate",
        placement: "Musk Gland is trapped from territorial beasts that mark cliff passes and dark forest borders.",
        conflict: "The Verdant Outcasts use it for tracking rites, while the Dust Syndicate sells it as rare perfume base.",
        synergy: "It pairs with Rose Garnet and Sweet Resin for lure charms and scent-sealed courier cases."
      },
      {
        name: "Horn Core",
        spawnZones: ["crags", "ashwood-wilderness"],
        factionAligned: "The Vulcan Guild vs The Verdant Outcasts",
        placement: "Horn Core forms in mountain chargers whose horns grind mineral salt and basalt dust.",
        conflict: "The Vulcan Guild wants it for drill tips, while the Verdant Outcasts claim trophies from fair hunts.",
        synergy: "It pairs with Dire Leather and Sylvan Oak for trap rigs, recurve bows, and ram-headed picks."
      },
      {
        name: "Alpha Canine",
        spawnZones: ["ashwood-wilderness", "void-rift"],
        factionAligned: "The Verdant Outcasts vs The Nihil Sect",
        placement: "Alpha Canine is taken from pack leaders that survive void-tainted prey and territorial wars.",
        conflict: "The Verdant Outcasts wear it as command proof, while the Nihil Sect uses it to bind corrupted packs.",
        synergy: "It pairs with Death Cap and Shadow Pelt for fear totems and predator-stalker knives."
      },
      {
        name: "Primal Heart",
        spawnZones: ["ashwood-wilderness", "whisperwind-ascent"],
        factionAligned: "The Verdant Outcasts vs The Ascetics of Sky",
        placement: "Primal Heart comes from legendary beasts that migrate from deep forest to high storm caves.",
        conflict: "The Verdant Outcasts crown leaders through the hunt, while the Ascetics test restraint by sparing them.",
        synergy: "It pairs with Behemoth Hide and Cosmic Shard for primal regalia and heart-bound guardian idols."
      }
    ]
  },
  {
    skillId: "gemology",
    tiers: [
      {
        name: "Raw Quartz",
        spawnZones: ["crags", "ashwood"],
        factionAligned: "The Vulcan Guild vs The Ascetics of Sky",
        placement: "Raw Quartz chips from shallow seams where clear water cooled simple crystal veins.",
        conflict: "The Vulcan Guild cuts it for gauges, while the Ascetics teach novices to focus through its flaws.",
        synergy: "It pairs with Ley-Sparks and Fossil Chunk for novice focus charms and bone-set lenses."
      },
      {
        name: "Rose Garnet",
        spawnZones: ["canaan-desert", "crags"],
        factionAligned: "The Dust Syndicate vs The Verdant Outcasts",
        placement: "Rose Garnet appears in dry red gravel where heat and pressure stained crystal with iron.",
        conflict: "The Dust Syndicate grades it for luxury trade, while the Verdant Outcasts see it as blood-earth proof.",
        synergy: "It pairs with Musk Gland and Aether Drift for lure charms and warm-channel rings."
      },
      {
        name: "Blue Sapphire",
        spawnZones: ["whisperwind-ascent", "holy-reach"],
        factionAligned: "The Ascetics of Sky vs The Archon Order",
        placement: "Blue Sapphire grows in high cold seams washed by cloudwater and radiant mineral traces.",
        conflict: "The Ascetics use it for calm vision, while the Archon Order sets it into command crowns.",
        synergy: "It pairs with Moonlily and Twilight Sky-Oats for focus staves and altitude talismans."
      },
      {
        name: "Void Diamond",
        spawnZones: ["void-rift", "dungeon"],
        factionAligned: "The Nihil Sect vs The Vulcan Guild",
        placement: "Void Diamond forms when deep carbon is crushed by rift gravity and stripped of normal reflection.",
        conflict: "The Nihil Sect cuts it into entropy mirrors, while the Vulcan Guild locks it away from engines.",
        synergy: "It pairs with Void Shard Ore and Null-Geode Block for phase blades and anti-magic prison cores."
      },
      {
        name: "Prism Geode Crystal",
        spawnZones: ["crags", "whisperwind-ascent"],
        factionAligned: "The Vulcan Guild vs The Ascetics of Sky",
        placement: "Prism Geode Crystal grows where meteor metals, mountain water, and cave pressure meet for centuries.",
        conflict: "The Vulcan Guild wants its optical power, while the Ascetics permit only masters to chip it.",
        synergy: "It pairs with Astral Iron and Yggdrasil Elixir for prismatic siege blades and living star engines."
      }
    ]
  }
] as const satisfies readonly MaterialSkillRow[];

export const gatherableMaterials = materialRows.flatMap((row, rowIndex) =>
  row.tiers.map((seed, tierIndex) => {
    const tier = (tierIndex + 1) as MaterialTier;
    return {
      id: rowIndex * 5 + tierIndex + 1,
      skillId: row.skillId,
      tier,
      name: seed.name,
      requiredLevel: requiredLevelByMaterialTier[tier],
      gatherTimeSeconds: gatherTimeSecondsByMaterialTier[tier],
      spawnZones: [...seed.spawnZones],
      xpReward: BaseXP(tier),
      hazardChance: hazardChanceByMaterialTier[tier],
      factionAligned: seed.factionAligned,
      whyLore: `Placement: ${seed.placement} Faction conflict: ${seed.conflict} Synergy: ${seed.synergy}`
    } satisfies GatherableMaterial;
  })
) as readonly GatherableMaterial[];

const materialById = new Map(gatherableMaterials.map((material) => [material.id, material] as const));
const materialByName = new Map(gatherableMaterials.map((material) => [material.name, material] as const));
const materialByNormalizedName = new Map(
  gatherableMaterials.map((material) => [material.name.trim().toLowerCase(), material] as const)
);

export const materialsBySkill = gatheringSkillIds.reduce((bySkill, skillId) => {
  bySkill[skillId] = gatherableMaterials.filter((material) => material.skillId === skillId);
  return bySkill;
}, {} as Record<GatheringSkillId, readonly GatherableMaterial[]>);

export function getGatherableMaterialById(id: number): GatherableMaterial | undefined {
  return materialById.get(id);
}

export function getGatherableMaterialByName(name: string): GatherableMaterial | undefined {
  return materialByName.get(name) ?? materialByNormalizedName.get(name.trim().toLowerCase());
}

export function validateMaterialCatalog(
  catalog: readonly GatherableMaterial[] = gatherableMaterials
): MaterialCatalogValidationResult {
  const errors: string[] = [];
  const ids = new Set<number>();
  const names = new Set<string>();
  const skillTierKeys = new Set<string>();

  if (catalog.length !== 80) {
    errors.push(`Expected exactly 80 gatherable materials, found ${catalog.length}.`);
  }

  for (const material of catalog) {
    if (!Number.isInteger(material.id) || material.id < 1 || material.id > 80) {
      errors.push(`${material.name} has invalid id ${material.id}.`);
    }
    if (ids.has(material.id)) {
      errors.push(`${material.name} duplicates material id ${material.id}.`);
    }
    ids.add(material.id);

    if (names.has(material.name)) {
      errors.push(`${material.name} duplicates material name.`);
    }
    names.add(material.name);

    if (!isGatheringSkillId(material.skillId)) {
      errors.push(`${material.name} has unknown skill id ${material.skillId}.`);
      continue;
    }

    if (!isValidMaterialTier(material.tier)) {
      errors.push(`${material.name} has invalid tier ${material.tier}.`);
      continue;
    }

    const skillTierKey = `${material.skillId}:${material.tier}`;
    if (skillTierKeys.has(skillTierKey)) {
      errors.push(`${material.name} duplicates ${skillTierKey}.`);
    }
    skillTierKeys.add(skillTierKey);

    if (material.requiredLevel !== requiredLevelByMaterialTier[material.tier]) {
      errors.push(`${material.name} required level ${material.requiredLevel} does not match tier ${material.tier}.`);
    }
    if (material.xpReward !== BaseXP(material.tier)) {
      errors.push(`${material.name} xpReward ${material.xpReward} does not match BaseXP(${material.tier}).`);
    }
    if (!Number.isFinite(material.gatherTimeSeconds) || material.gatherTimeSeconds <= 0) {
      errors.push(`${material.name} has invalid gather time ${material.gatherTimeSeconds}.`);
    }
    if (!Number.isFinite(material.hazardChance) || material.hazardChance < 0 || material.hazardChance > 1) {
      errors.push(`${material.name} has invalid hazard chance ${material.hazardChance}.`);
    }
    if (material.spawnZones.length === 0 || material.spawnZones.some((zone) => zone.trim().length === 0)) {
      errors.push(`${material.name} must have at least one spawn zone.`);
    }
    if (material.factionAligned.trim().length === 0) {
      errors.push(`${material.name} must have a faction alignment.`);
    }
    if (material.whyLore.trim().length < 120) {
      errors.push(`${material.name} whyLore is too short to cover placement, conflict, and synergy.`);
    }
  }

  for (const skillId of gatheringSkillIds) {
    const entries = catalog.filter((material) => material.skillId === skillId);
    if (entries.length !== 5) {
      errors.push(`${skillId} expected 5 materials, found ${entries.length}.`);
    }
    for (let tier = 1; tier <= 5; tier += 1) {
      if (!entries.some((material) => material.tier === tier)) {
        errors.push(`${skillId} is missing tier ${tier}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
