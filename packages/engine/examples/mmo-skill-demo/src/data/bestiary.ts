import { type ZoneId } from "../shared-contracts.ts";
import { indexUniqueBy } from "./indexing.ts";

export type MmoCombatClass = "fodder" | "nimble" | "bruiser" | "elite" | "boss" | "node";

export type MmoPersonality =
  | "aggressive-pack-hunter"
  | "territorial-rooted"
  | "cowardly-opportunistic"
  | "berserk-high-aggro"
  | "erratic-harasser"
  | "stoic-bruiser"
  | "stubborn-lane-defender"
  | "intelligent-skittish"
  | "defensive-guardian"
  | "predatory-ambush"
  | "intelligent-spacer"
  | "evasive-zoner"
  | "inexorable-dread"
  | "mechanical-boss"
  | "support-caster"
  | "passive";

export type MmoImpactType = "blood" | "sap" | "spark" | "dust" | "void" | "spore";

export type BestiaryCombatProfile = {
  class: MmoCombatClass;
  impactType: MmoImpactType;
  preferredRange: number;
  moveSpeed: number;
  knockbackModifier: number;
  heavyKnockbackModifier?: number;
  heavyImpact?: boolean;
  precastMs?: number;
  iframeMs?: number;
  iframePhaseMs?: number;
  armorFrontReduction?: number;
};

export type BestiaryDefinition = {
  id: string;
  name: string;
  zoneId: ZoneId;
  role: string;
  lore: string;
  personality: MmoPersonality;
  mechanics: string;
  combat: BestiaryCombatProfile;
};

export const bestiaryDefinitions = [
  {
    id: "prowling-wolf",
    name: "Prowling Wolf",
    zoneId: "ashwood",
    role: "fodder",
    lore: "Starving local wildlife driven to the fringes by the corruption.",
    personality: "aggressive-pack-hunter",
    mechanics: "Circles at mid-range, then lunges with dust trails. Low health and no i-frames.",
    combat: { class: "fodder", impactType: "blood", preferredRange: 84, moveSpeed: 74, knockbackModifier: 0.85, heavyKnockbackModifier: 1.45, precastMs: 180 }
  },
  {
    id: "aggro-tree",
    name: "Aggro-Tree",
    zoneId: "ashwood",
    role: "rooted-bruiser",
    lore: "Ancient forest sentinels warped by ash magic.",
    personality: "territorial-rooted",
    mechanics: "Rooted and neutral until attacked. Uses outward shockwaves up close and vacuuming roots at range.",
    combat: { class: "bruiser", impactType: "sap", preferredRange: 68, moveSpeed: 0, knockbackModifier: 1.8, heavyKnockbackModifier: -2.4, heavyImpact: true, precastMs: 260 }
  },
  {
    id: "ash-bramble-stalker",
    name: "Ash Bramble Stalker",
    zoneId: "ashwood",
    role: "skirmisher",
    lore: "Semi-sentient corruption blooms. Opportunistic scavengers.",
    personality: "cowardly-opportunistic",
    mechanics: "Flees, drops exploding pollen, and only flurries when cornered.",
    combat: { class: "fodder", impactType: "sap", preferredRange: 132, moveSpeed: 62, knockbackModifier: -0.7, heavyKnockbackModifier: -1.8, precastMs: 140 }
  },
  {
    id: "alpha-timberwolf",
    name: "Alpha Timberwolf",
    zoneId: "ashwood",
    role: "elite",
    lore: "A beast infused heavily with Ash-magic, commanding the packs.",
    personality: "berserk-high-aggro",
    mechanics: "Blood-Howl grants 2.5s i-frames, summons two wolves, then shoulder-checks with wall-stun force.",
    combat: { class: "elite", impactType: "blood", preferredRange: 72, moveSpeed: 86, knockbackModifier: 1.4, heavyKnockbackModifier: 3.8, heavyImpact: true, precastMs: 260, iframePhaseMs: 2500 }
  },
  {
    id: "iron-eye-bat",
    name: "Iron-Eye Bat",
    zoneId: "crags",
    role: "harasser",
    lore: "Subterranean scouts mutated by raw ore magic.",
    personality: "erratic-harasser",
    mechanics: "Ignores ground terrain, swoops, hits, and retreats.",
    combat: { class: "fodder", impactType: "blood", preferredRange: 108, moveSpeed: 92, knockbackModifier: 0.75, precastMs: 120 }
  },
  {
    id: "stone-crawler",
    name: "Stone-Crawler",
    zoneId: "crags",
    role: "bruiser",
    lore: "Elementals born from discarded mining slag.",
    personality: "stoic-bruiser",
    mechanics: "Neutral until approached, advances slowly, then telegraphs a tectonic slam with major knockback.",
    combat: { class: "bruiser", impactType: "spark", preferredRange: 48, moveSpeed: 34, knockbackModifier: 1.2, heavyKnockbackModifier: 3.1, heavyImpact: true, precastMs: 500, iframePhaseMs: 2200 }
  },
  {
    id: "crystal-beetle",
    name: "Crystal Beetle",
    zoneId: "crags",
    role: "lane-defender",
    lore: "Armored insects that feed on deep fissure crystals.",
    personality: "stubborn-lane-defender",
    mechanics: "Defends corridors, rushes forward with smoke trails, and takes 90% reduced frontal damage during charge.",
    combat: { class: "bruiser", impactType: "spark", preferredRange: 96, moveSpeed: 50, knockbackModifier: 1.1, heavyKnockbackModifier: 2.4, heavyImpact: true, precastMs: 220, armorFrontReduction: 0.9 }
  },
  {
    id: "crag-sapper",
    name: "Crag Sapper",
    zoneId: "crags",
    role: "trapper",
    lore: "Corrupted goblinoid miners using stolen blast powder.",
    personality: "intelligent-skittish",
    mechanics: "Maintains 10-unit spacing, iframe-vaults backward with blinding powder, and throws delayed blast traps.",
    combat: { class: "nimble", impactType: "blood", preferredRange: 104, moveSpeed: 57, knockbackModifier: 0.7, heavyKnockbackModifier: 1.7, precastMs: 160, iframeMs: 300 }
  },
  {
    id: "crag-gargoyle",
    name: "Crag-Gargoyle",
    zoneId: "crags",
    role: "elite",
    lore: "Magically constructed guardians of the deep veins.",
    personality: "defensive-guardian",
    mechanics: "Turns to stone for 3s i-frames while healing, then breaks out with a 360-degree rock spray.",
    combat: { class: "elite", impactType: "spark", preferredRange: 78, moveSpeed: 44, knockbackModifier: 1.5, heavyKnockbackModifier: 2.7, heavyImpact: true, precastMs: 320, iframePhaseMs: 3000 }
  },
  {
    id: "sand-wraith",
    name: "Sand-Wraith",
    zoneId: "bazaar",
    role: "ambusher",
    lore: "Echoes of greedy merchants forever looking for their lost coins.",
    personality: "predatory-ambush",
    mechanics: "Teleports into blind spots and uses a scythe sweep that vacuums victims into a follow-up.",
    combat: { class: "nimble", impactType: "void", preferredRange: 62, moveSpeed: 76, knockbackModifier: -1.5, heavyKnockbackModifier: -2.6, precastMs: 180, iframeMs: 250 }
  },
  {
    id: "cursed-archer",
    name: "Cursed Archer",
    zoneId: "bazaar",
    role: "spacer",
    lore: "Ethereal guards still performing their eternal watch.",
    personality: "intelligent-spacer",
    mechanics: "Avoids melee, iframe-vaults backward, and charges piercing arrows with particle gather.",
    combat: { class: "nimble", impactType: "void", preferredRange: 145, moveSpeed: 58, knockbackModifier: 0.8, heavyKnockbackModifier: 1.3, precastMs: 420, iframeMs: 400 }
  },
  {
    id: "mire-bomber",
    name: "Mire Bomber",
    zoneId: "bazaar",
    role: "zoner",
    lore: "Cursed alchemists endlessly brewing volatile concoctions.",
    personality: "evasive-zoner",
    mechanics: "Continuously flees while laying minefields of delayed AoEs.",
    combat: { class: "fodder", impactType: "spore", preferredRange: 136, moveSpeed: 64, knockbackModifier: 0.9, heavyKnockbackModifier: 1.6, precastMs: 120 }
  },
  {
    id: "rune-priest",
    name: "Rune Priest",
    zoneId: "bazaar",
    role: "support",
    lore: "A ruin chanter binding old warding marks into nearby allies.",
    personality: "support-caster",
    mechanics: "Stays behind stronger enemies, restores wounded allies, then casts short rune bolts if pressured.",
    combat: { class: "fodder", impactType: "spark", preferredRange: 132, moveSpeed: 42, knockbackModifier: -0.3, heavyKnockbackModifier: -1.2, precastMs: 180 }
  },
  {
    id: "veil-oracle",
    name: "Veil Oracle",
    zoneId: "bazaar",
    role: "support",
    lore: "A masked seer preserving Void champions by pulling them half out of phase.",
    personality: "support-caster",
    mechanics: "Heals allies, accelerates strong enemy phase pressure, and answers with Void bolts when isolated.",
    combat: { class: "nimble", impactType: "void", preferredRange: 142, moveSpeed: 45, knockbackModifier: -0.75, heavyKnockbackModifier: -1.9, precastMs: 220, iframeMs: 300 }
  },
  {
    id: "void-sent-sentinel",
    name: "Void-Sent Sentinel",
    zoneId: "bazaar",
    role: "elite",
    lore: "Massive suits of void-iron armor animated by unstable rifts.",
    personality: "inexorable-dread",
    mechanics: "Projects continuous negative-KBM gravity while walking players into heavy slams.",
    combat: { class: "elite", impactType: "void", preferredRange: 54, moveSpeed: 42, knockbackModifier: -0.9, heavyKnockbackModifier: 3.2, heavyImpact: true, precastMs: 360, iframePhaseMs: 2400 }
  },
  {
    id: "bazaar-guard",
    name: "Bazaar Guard",
    zoneId: "bazaar",
    role: "elite",
    lore: "Ancient market wardens still enforcing dead trade laws.",
    personality: "defensive-guardian",
    mechanics: "Holds lanes, hardens during elite phases, and fires straight-line Void orders from range.",
    combat: { class: "elite", impactType: "void", preferredRange: 78, moveSpeed: 44, knockbackModifier: 1.15, heavyKnockbackModifier: 2.8, heavyImpact: true, precastMs: 300, iframePhaseMs: 2600 }
  },
  {
    id: "gloom-weaver-spider",
    name: "Gloom-Weaver Spider",
    zoneId: "ashwood",
    role: "canopy-webber",
    lore: "High-canopy spider colonies that keep rogue insects in check, then punish anything that tears their sticky bridges.",
    personality: "predatory-ambush",
    mechanics: "Hangs outside melee reach, drops web snares, then rappels down for a quick bite when targets slow.",
    combat: { class: "nimble", impactType: "sap", preferredRange: 118, moveSpeed: 58, knockbackModifier: -0.35, heavyKnockbackModifier: -1.4, precastMs: 210, iframeMs: 220 }
  },
  {
    id: "soot-crab",
    name: "Soot-Crab",
    zoneId: "crags",
    role: "slag-bruiser",
    lore: "Molten slag feeders that polish hot iron dust into a heat-shielded shell.",
    personality: "stoic-bruiser",
    mechanics: "Sidesteps through hot ground, blocks frontal hits with its shell, and answers pressure with a short claw burst.",
    combat: { class: "bruiser", impactType: "spark", preferredRange: 46, moveSpeed: 32, knockbackModifier: 1.25, heavyKnockbackModifier: 2.5, heavyImpact: true, precastMs: 300, armorFrontReduction: 0.72 }
  },
  {
    id: "void-leper",
    name: "Void-Leper",
    zoneId: "bazaar",
    role: "rot-caster",
    lore: "Void-rotted pariahs cast out beneath the Bazaar, still writing cosmic warnings into stone.",
    personality: "evasive-zoner",
    mechanics: "Backpedals while leaving rot glyphs, then detonates a short-range void pulse if cornered.",
    combat: { class: "fodder", impactType: "void", preferredRange: 124, moveSpeed: 48, knockbackModifier: -0.55, heavyKnockbackModifier: -1.8, precastMs: 260 }
  },
  {
    id: "grave-stalker",
    name: "Grave-Stalker",
    zoneId: "port-marrow",
    role: "grave-scavenger",
    lore: "Bay scavengers that bury driftwood, bones, and bodies until hunger pulls them above the grave soil.",
    personality: "predatory-ambush",
    mechanics: "Lies still near debris piles, bursts from cover, and drags wounded targets toward shoreline hazards.",
    combat: { class: "nimble", impactType: "dust", preferredRange: 66, moveSpeed: 70, knockbackModifier: -0.85, heavyKnockbackModifier: -2.2, precastMs: 190, iframeMs: 180 }
  },
  {
    id: "rift-leech",
    name: "Rift-Leech",
    zoneId: "dungeon",
    role: "void-parasite",
    lore: "Small rift parasites that hover in stellar dust currents and swell on leaking void essence.",
    personality: "support-caster",
    mechanics: "Clings near elites, channels a draining beam, and phases away if struck during the channel.",
    combat: { class: "fodder", impactType: "void", preferredRange: 104, moveSpeed: 38, knockbackModifier: -0.65, heavyKnockbackModifier: -1.7, precastMs: 240, iframeMs: 260 }
  },
  {
    id: "spire-sentinel",
    name: "Spire-Sentinel",
    zoneId: "dungeon",
    role: "law-automaton",
    lore: "Silent cathedral security constructs built to keep sacred geometry moving on exact time.",
    personality: "defensive-guardian",
    mechanics: "Patrols straight lanes, locks facing before attacks, and gains frontal armor while executing verdict strikes.",
    combat: { class: "elite", impactType: "spark", preferredRange: 82, moveSpeed: 40, knockbackModifier: 1.1, heavyKnockbackModifier: 2.9, heavyImpact: true, precastMs: 340, armorFrontReduction: 0.78 }
  },
  {
    id: "bramble-beast",
    name: "Bramble-Beast",
    zoneId: "ashwood",
    role: "root-ambusher",
    lore: "Apex root predators that lower into bush-shapes until prey steps inside their thorn reach.",
    personality: "predatory-ambush",
    mechanics: "Starts camouflaged, roots targets in a cone, then heaves them backward with a thorn-body slam.",
    combat: { class: "bruiser", impactType: "sap", preferredRange: 58, moveSpeed: 46, knockbackModifier: 1.35, heavyKnockbackModifier: 3, heavyImpact: true, precastMs: 330 }
  },
  {
    id: "fissure-skitterer",
    name: "Fissure-Skitterer",
    zoneId: "crags",
    role: "cavern-cleaner",
    lore: "Stone-digesting cave crews that clear loose slate from mine corridors and resent noisy boots.",
    personality: "cowardly-opportunistic",
    mechanics: "Scuttles along corridor edges, spits grit to blind, and darts in only after targets whiff.",
    combat: { class: "nimble", impactType: "dust", preferredRange: 96, moveSpeed: 78, knockbackModifier: 0.45, heavyKnockbackModifier: 1.35, precastMs: 130, iframeMs: 180 }
  },
  {
    id: "rust-biter",
    name: "Rust-Biter",
    zoneId: "crags",
    role: "metal-parasite",
    lore: "Ore-cart parasites that chew steel fixtures and spit corrosive rust when pried loose.",
    personality: "stubborn-lane-defender",
    mechanics: "Anchors to mining lanes, weakens armor with acid bites, and resists knockback while feeding.",
    combat: { class: "bruiser", impactType: "spark", preferredRange: 42, moveSpeed: 36, knockbackModifier: 1.45, heavyKnockbackModifier: 2.1, heavyImpact: true, precastMs: 250, armorFrontReduction: 0.55 }
  },
  {
    id: "tallow-wraith",
    name: "Tallow-Wraith",
    zoneId: "bazaar",
    role: "greed-echo",
    lore: "Ghostly residue formed where old vault gold trapped too much hunger in too little air.",
    personality: "predatory-ambush",
    mechanics: "Fades through treasure piles, pulls targets inward with coin-rattle gravity, then slashes with waxy hands.",
    combat: { class: "nimble", impactType: "void", preferredRange: 72, moveSpeed: 68, knockbackModifier: -1.2, heavyKnockbackModifier: -2.8, precastMs: 210, iframeMs: 300 }
  },
  {
    id: "tide-stalker",
    name: "Tide-Stalker",
    zoneId: "port-marrow",
    role: "dock-ambusher",
    lore: "Reef predators that watch fish silhouettes from under Port Marrow planks until larger prey pauses.",
    personality: "predatory-ambush",
    mechanics: "Waits below dock edges, surges across shallow water, and knocks targets sideways with a fin sweep.",
    combat: { class: "nimble", impactType: "blood", preferredRange: 74, moveSpeed: 82, knockbackModifier: 1.05, heavyKnockbackModifier: 2.35, precastMs: 170, iframeMs: 160 }
  },
  {
    id: "calamity-bat",
    name: "Calamity-Bat",
    zoneId: "crags",
    role: "sonar-harasser",
    lore: "Deep-fissure bats tuned to metallic vibrations and hostile to machinery in motion.",
    personality: "erratic-harasser",
    mechanics: "Pings before swooping, circles fast targets, and chains extra dives around active mechanical hazards.",
    combat: { class: "fodder", impactType: "blood", preferredRange: 122, moveSpeed: 104, knockbackModifier: 0.6, heavyKnockbackModifier: 1.25, precastMs: 110 }
  },
  {
    id: "timber-goliath",
    name: "Timber-Goliath",
    zoneId: "ashwood",
    role: "ancient-treant",
    lore: "Massive old-growth seed carriers that shed bio-bark to feed seedlings and crush anything that threatens the grove.",
    personality: "defensive-guardian",
    mechanics: "Plants roots to resist displacement, throws bark plates, and uses slow sweeping arms with major impact.",
    combat: { class: "elite", impactType: "sap", preferredRange: 76, moveSpeed: 24, knockbackModifier: 2.1, heavyKnockbackModifier: 4.1, heavyImpact: true, precastMs: 560, armorFrontReduction: 0.65 }
  },
  {
    id: "crystalline-strider",
    name: "Crystalline Strider",
    zoneId: "dungeon",
    role: "mirror-custodian",
    lore: "Glass-clawed dungeon keepers that wipe dust from reflective walls and cut anything that clouds them.",
    personality: "intelligent-spacer",
    mechanics: "Skates along mirror lanes, reflects a narrow projectile, and fractures into a short iframe slide.",
    combat: { class: "nimble", impactType: "spark", preferredRange: 112, moveSpeed: 72, knockbackModifier: 0.55, heavyKnockbackModifier: 1.5, precastMs: 220, iframeMs: 300 }
  },
  {
    id: "aether-drifter",
    name: "Aether-Drifter",
    zoneId: "dungeon",
    role: "radiant-cleanser",
    lore: "High-sky filter spirits that burn ash from the air with measured divine fire.",
    personality: "evasive-zoner",
    mechanics: "Floats away from melee, paints a delayed radiant line, and burns lingering pollution zones.",
    combat: { class: "nimble", impactType: "spark", preferredRange: 138, moveSpeed: 54, knockbackModifier: 0.25, heavyKnockbackModifier: 1.25, precastMs: 360, iframeMs: 220 }
  },
  {
    id: "void-gargoyle",
    name: "Void-Gargoyle",
    zoneId: "dungeon",
    role: "rift-guardian",
    lore: "Obsidian gate guardians that sit like dead stone until temporal wind shifts through their open mouths.",
    personality: "defensive-guardian",
    mechanics: "Petrifies for phase safety, stores incoming force, then releases a void-rock shockwave.",
    combat: { class: "elite", impactType: "void", preferredRange: 64, moveSpeed: 34, knockbackModifier: 1.65, heavyKnockbackModifier: 3.3, heavyImpact: true, precastMs: 380, iframePhaseMs: 2600, armorFrontReduction: 0.7 }
  },
  {
    id: "ashwood-alpha",
    name: "Ashwood Alpha",
    zoneId: "ashwood",
    role: "pack-commander",
    lore: "A territorial wolf leader that marks old trees and keeps lesser packs inside strict hunting bounds.",
    personality: "aggressive-pack-hunter",
    mechanics: "Howls to call lesser wolves, marks a chase target, and gains speed while any packmate is alive.",
    combat: { class: "elite", impactType: "blood", preferredRange: 78, moveSpeed: 92, knockbackModifier: 1.25, heavyKnockbackModifier: 3.2, heavyImpact: true, precastMs: 240, iframePhaseMs: 1800 }
  },
  {
    id: "sapper-goblin",
    name: "Sapper-Goblin",
    zoneId: "crags",
    role: "powder-thief",
    lore: "Mine pests that steal blast powder, stack unstable charges, and grin whenever sparks get too close.",
    personality: "intelligent-skittish",
    mechanics: "Kites at mid-range, drops delayed powder kegs, and vaults backward through its own smoke.",
    combat: { class: "nimble", impactType: "blood", preferredRange: 112, moveSpeed: 62, knockbackModifier: 0.65, heavyKnockbackModifier: 1.7, precastMs: 150, iframeMs: 320 }
  },
  {
    id: "ruins-archer",
    name: "Ruins Archer",
    zoneId: "bazaar",
    role: "gate-spacer",
    lore: "Reanimated gate archers still checking bowstrings and guarding a market that no longer opens.",
    personality: "intelligent-spacer",
    mechanics: "Maintains long range, lines up piercing shots, and backsteps after any melee approach.",
    combat: { class: "nimble", impactType: "void", preferredRange: 152, moveSpeed: 52, knockbackModifier: 0.7, heavyKnockbackModifier: 1.35, precastMs: 390, iframeMs: 340 }
  },
  {
    id: "marrow-cove-rat",
    name: "Marrow-Cove Rat",
    zoneId: "port-marrow",
    role: "dock-swarmer",
    lore: "Fast-breeding dock rats that clear fish scraps and vanish under wet planks before boots land.",
    personality: "aggressive-pack-hunter",
    mechanics: "Attacks in short swarms, retreats after a bite, and gains confidence around wounded targets.",
    combat: { class: "fodder", impactType: "blood", preferredRange: 38, moveSpeed: 90, knockbackModifier: 0.45, heavyKnockbackModifier: 1.2, precastMs: 90 }
  },
  {
    id: "void-crawler",
    name: "Void-Crawler",
    zoneId: "dungeon",
    role: "rift-tunneler",
    lore: "Abyssal diggers that throw tainted dirt behind their claws while carving nest tunnels through reality cracks.",
    personality: "inexorable-dread",
    mechanics: "Burrows between lanes, erupts under marked ground, and pulls targets inward with unstable gravity.",
    combat: { class: "bruiser", impactType: "void", preferredRange: 70, moveSpeed: 48, knockbackModifier: -0.95, heavyKnockbackModifier: -2.6, heavyImpact: true, precastMs: 420, iframePhaseMs: 1400 }
  },
  {
    id: "anointed-crusader",
    name: "Anointed Crusader",
    zoneId: "dungeon",
    role: "holy-vanguard",
    lore: "A drilled holy guard whose sword routines have continued long after judgment became reflex.",
    personality: "defensive-guardian",
    mechanics: "Raises shield for frontal reduction, steps forward with bash pressure, and answers darkness with radiant counters.",
    combat: { class: "elite", impactType: "spark", preferredRange: 62, moveSpeed: 50, knockbackModifier: 1.35, heavyKnockbackModifier: 3.05, heavyImpact: true, precastMs: 280, armorFrontReduction: 0.8 }
  },
  {
    id: "prism-golem",
    name: "Prism-Golem",
    zoneId: "crags",
    role: "light-battery",
    lore: "Geode-born golems that absorb stray light and refract it into mine tunnels for power.",
    personality: "defensive-guardian",
    mechanics: "Stores energy while still, fires refracted beam lanes, and becomes vulnerable after overcharging.",
    combat: { class: "elite", impactType: "spark", preferredRange: 96, moveSpeed: 30, knockbackModifier: 1.8, heavyKnockbackModifier: 3.5, heavyImpact: true, precastMs: 520, iframePhaseMs: 2200, armorFrontReduction: 0.62 }
  },
  {
    id: "abyssal-eel",
    name: "Abyssal Eel",
    zoneId: "port-marrow",
    role: "reef-striker",
    lore: "Deep-sea fissure hunters that slide through reef cracks and strike from holes too narrow for armor.",
    personality: "predatory-ambush",
    mechanics: "Darts through cover, applies a brief slowing venom, and slips backward after a successful bite.",
    combat: { class: "nimble", impactType: "blood", preferredRange: 88, moveSpeed: 94, knockbackModifier: 0.35, heavyKnockbackModifier: 1.25, precastMs: 140, iframeMs: 240 }
  },
  {
    id: "cursed-oracle",
    name: "Cursed Oracle",
    zoneId: "dungeon",
    role: "void-seer",
    lore: "Decayed rift mages that whisper old history into black sludge until the sludge whispers back.",
    personality: "support-caster",
    mechanics: "Keeps distance, marks targets with delayed curses, and grants brief phase protection to nearby void allies.",
    combat: { class: "nimble", impactType: "void", preferredRange: 146, moveSpeed: 42, knockbackModifier: -0.8, heavyKnockbackModifier: -2, precastMs: 330, iframeMs: 260 }
  },
  {
    id: "dungeon-harvester",
    name: "Dungeon Harvester",
    zoneId: "dungeon",
    role: "bone-sorter",
    lore: "Mechanical insects that sort armor scraps and bones into tidy warning mounds.",
    personality: "stubborn-lane-defender",
    mechanics: "Patrols corridors, gathers loose debris into cover piles, and charges when its work is disturbed.",
    combat: { class: "fodder", impactType: "spark", preferredRange: 72, moveSpeed: 60, knockbackModifier: 0.9, heavyKnockbackModifier: 1.9, precastMs: 180, armorFrontReduction: 0.35 }
  },
  {
    id: "high-peak-eagle",
    name: "High-Peak Eagle",
    zoneId: "ashwood",
    role: "wind-hunter",
    lore: "Mountain hunters that ride thermals and correct their wing tilt faster than ground prey can turn.",
    personality: "erratic-harasser",
    mechanics: "Swoops from long range, banks away from retaliation, and chains dives when targets sprint in straight lines.",
    combat: { class: "nimble", impactType: "blood", preferredRange: 130, moveSpeed: 108, knockbackModifier: 0.7, heavyKnockbackModifier: 1.45, precastMs: 130, iframeMs: 150 }
  },
  {
    id: "moss-grizzly",
    name: "Moss-Grizzly",
    zoneId: "ashwood",
    role: "slope-bruiser",
    lore: "Earth-blended bears that cultivate moss on their backs and scrape it clean against stone.",
    personality: "territorial-rooted",
    mechanics: "Guards its patch, shrugs off light hits, then swipes in a wide cone with moss-dust impact.",
    combat: { class: "bruiser", impactType: "blood", preferredRange: 56, moveSpeed: 44, knockbackModifier: 1.65, heavyKnockbackModifier: 3.4, heavyImpact: true, precastMs: 360, armorFrontReduction: 0.45 }
  },
  {
    id: "scavenger-jackal",
    name: "Scavenger Jackal",
    zoneId: "bazaar",
    role: "desert-tracker",
    lore: "Canaan desert scavengers that follow travelers at a distance and wait for bones.",
    personality: "cowardly-opportunistic",
    mechanics: "Circles outside reach, yelps to attract nearby threats, and bites only when targets are busy.",
    combat: { class: "fodder", impactType: "blood", preferredRange: 98, moveSpeed: 82, knockbackModifier: 0.55, heavyKnockbackModifier: 1.3, precastMs: 120 }
  },
  {
    id: "lava-spit-slime",
    name: "Lava-Spit Slime",
    zoneId: "crags",
    role: "thermal-zoner",
    lore: "Slag-consuming slimes that bob in molten rivers and split when heat pressure gets high.",
    personality: "evasive-zoner",
    mechanics: "Spits slow lava globs, leaves hot puddles, and divides into smaller bodies after heavy impact.",
    combat: { class: "fodder", impactType: "spark", preferredRange: 118, moveSpeed: 28, knockbackModifier: 1.05, heavyKnockbackModifier: 1.9, precastMs: 300 }
  },
  {
    id: "void-amalgam",
    name: "Void-Amalgam",
    zoneId: "dungeon",
    role: "rift-elite",
    lore: "Temporal dark matter masses that merge with stone shadows and re-form as new limbs.",
    personality: "inexorable-dread",
    mechanics: "Shifts between pull and slam phases, hides in shadows for i-frames, and grows heavier after each hit taken.",
    combat: { class: "elite", impactType: "void", preferredRange: 74, moveSpeed: 40, knockbackModifier: -1.25, heavyKnockbackModifier: 3.6, heavyImpact: true, precastMs: 420, iframePhaseMs: 2800 }
  },
  {
    id: "great-ash-lord",
    name: "The Great Ash-Lord",
    zoneId: "dungeon",
    role: "boss",
    lore: "The ancient Ashwood heart absorbed corruption to save the forest, then went mad and now sees players as rot.",
    personality: "mechanical-boss",
    mechanics: "Massive AoEs, slow swings, spore-pod shield checks, and burning branch zones.",
    combat: { class: "boss", impactType: "sap", preferredRange: 74, moveSpeed: 42, knockbackModifier: 1.8, heavyKnockbackModifier: 4.4, heavyImpact: true, precastMs: 520, iframePhaseMs: 15000 }
  },
  {
    id: "iron-core-golem",
    name: "Iron-Core Golem",
    zoneId: "dungeon",
    role: "boss",
    lore: "A colossal lost-era mining apparatus executing an endless strip-mining protocol.",
    personality: "mechanical-boss",
    mechanics: "Linear laser sweeps, slams, bullet-hell overdrive, power nodes, and post-overload vulnerability.",
    combat: { class: "boss", impactType: "spark", preferredRange: 72, moveSpeed: 38, knockbackModifier: 1.6, heavyKnockbackModifier: 3.8, heavyImpact: true, precastMs: 500, iframePhaseMs: 45000 }
  },
  {
    id: "mirror-king",
    name: "The Mirror-King",
    zoneId: "dungeon",
    role: "boss",
    lore: "A sentient spatial anomaly born in the Sunken Bazaar, reflecting malice and magical intent.",
    personality: "mechanical-boss",
    mechanics: "Copies player attack styles, then shatters into clones while channeling a center gravity well.",
    combat: { class: "boss", impactType: "void", preferredRange: 90, moveSpeed: 46, knockbackModifier: -1.1, heavyKnockbackModifier: -4.2, heavyImpact: true, precastMs: 420, iframePhaseMs: 15000 }
  },
  {
    id: "ember-acolyte",
    name: "Ember Acolyte",
    zoneId: "dungeon",
    role: "support",
    lore: "A dungeon cultist carrying cinder rites for wounded commanders.",
    personality: "support-caster",
    mechanics: "Heals dungeon allies and throws burning cinder lines when players close in.",
    combat: { class: "fodder", impactType: "spore", preferredRange: 128, moveSpeed: 42, knockbackModifier: 0.45, heavyKnockbackModifier: 1.3, precastMs: 190 }
  },
  {
    id: "dungeon-revenant",
    name: "Dungeon Revenant",
    zoneId: "dungeon",
    role: "elite",
    lore: "A failed guardian bound to repeat one final tunnel defense.",
    personality: "inexorable-dread",
    mechanics: "Walks players down with Void pull, then chains heavy melee and line pressure during buffed phases.",
    combat: { class: "elite", impactType: "void", preferredRange: 58, moveSpeed: 50, knockbackModifier: -0.95, heavyKnockbackModifier: 3.4, heavyImpact: true, precastMs: 340 }
  },
  {
    id: "power-node",
    name: "Power Node",
    zoneId: "dungeon",
    role: "boss-node",
    lore: "A volatile conduit that can overload the Iron-Core Golem's strip-mining protocol.",
    personality: "passive",
    mechanics: "Stand on lit nodes long enough to overload them and stun the golem.",
    combat: { class: "node", impactType: "spark", preferredRange: 0, moveSpeed: 0, knockbackModifier: 0 }
  },
  {
    id: "spore-pod",
    name: "Spore Pod",
    zoneId: "dungeon",
    role: "boss-node",
    lore: "A shield organ grown by the Great Ash-Lord during rooting phases.",
    personality: "passive",
    mechanics: "Destroy all pods before hatching to break the Ash-Lord's shield.",
    combat: { class: "node", impactType: "sap", preferredRange: 0, moveSpeed: 0, knockbackModifier: 0 }
  },
  {
    id: "glass-clone",
    name: "Glass Clone",
    zoneId: "dungeon",
    role: "boss-node",
    lore: "A brittle reflection hiding the Mirror-King's true spatial anchor.",
    personality: "passive",
    mechanics: "Only the real clone breaks when struck by the opposite attack style.",
    combat: { class: "node", impactType: "void", preferredRange: 0, moveSpeed: 0, knockbackModifier: 0 }
  }
] as const;

export const bestiaryById: Record<string, BestiaryDefinition> = indexUniqueBy(bestiaryDefinitions, (entry) => entry.id);

const fallbackBestiaryById = new Map<string, BestiaryDefinition>();

export function bestiaryFor(kind: string): BestiaryDefinition {
  const known = bestiaryById[kind];
  if (known) return known;
  const cached = fallbackBestiaryById.get(kind);
  if (cached) return cached;
  const fallback: BestiaryDefinition = {
    id: kind,
    name: kind.replace(/-/g, " "),
    zoneId: "ashwood",
    role: "mob",
    lore: "Uncatalogued hostile.",
    personality: "aggressive-pack-hunter",
    mechanics: "Uses default chase and attack behavior.",
    combat: { class: "fodder", impactType: "blood", preferredRange: 62, moveSpeed: 52, knockbackModifier: 0.8 }
  };
  fallbackBestiaryById.set(kind, fallback);
  return fallback;
}

export function isBossNodeKind(kind: string) {
  return bestiaryFor(kind).combat.class === "node";
}
