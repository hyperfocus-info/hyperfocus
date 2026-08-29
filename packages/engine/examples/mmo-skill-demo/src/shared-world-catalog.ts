import { mmoSkillDemoRegionConfig } from "./data/world.ts";
import { bestiaryDefinitions } from "./data/bestiary.ts";
import { worldCreatureDefinitions } from "./data/world-creatures.ts";
import { worldFactions, type WorldFactionId } from "./data/world-factions.ts";
import { type WorldGatherableNodeKind } from "./data/world-gatherables.ts";
import { worldCraftingMaterials } from "./data/world-materials.ts";
import { worldReputationRewards } from "./data/world-reputation.ts";
import { PLAYER_SIZE } from "./data/entity-sizes.ts";
import {  type ZoneId } from "./shared-contracts.ts";

const TILE = mmoSkillDemoRegionConfig.tileSize;

const MAP_WIDTH = mmoSkillDemoRegionConfig.chunkGrid.chunksWide * mmoSkillDemoRegionConfig.chunkGrid.chunkWidth;

const MAP_HEIGHT = mmoSkillDemoRegionConfig.chunkGrid.chunksHigh * mmoSkillDemoRegionConfig.chunkGrid.chunkHeight;

const PLAYER_RADIUS = PLAYER_SIZE.radius;

const PUMMEL_MAX_CHARGE_MS = 2400;

const WHIRLWIND_RADIUS = 101;

const RUSH_DURATION_MS = 5000;

const RUSH_BRAKE_MS = 500;

const BOW_RANGE_SCALE = 0.5;

const BOW_QUICK_RANGE = 700 * BOW_RANGE_SCALE;

const BOW_PRECISION_RANGE = 1300 * BOW_RANGE_SCALE;

const BOW_VOLLEY_RANGE = 700 * BOW_RANGE_SCALE;

const BOW_BOLAS_RANGE = 700 * BOW_RANGE_SCALE;

const BOW_BOLAS_LINK_RANGE = 300 * BOW_RANGE_SCALE;

const BOW_FLURRY_RANGE = 900 * BOW_RANGE_SCALE;

const BOW_FLURRY_VISUAL_STRIDE = 3;

const BOW_ARROW_STORM_RADIUS = 400 * BOW_RANGE_SCALE;

const BOW_DECOY_TAUNT_RANGE = 500 * BOW_RANGE_SCALE;

const BOW_VAULT_RADIUS = 200 * BOW_RANGE_SCALE;

const CALTROPS_MIN_MAX_RANGE = 500 * BOW_RANGE_SCALE;

const CALTROPS_FULL_MAX_RANGE = 1000 * BOW_RANGE_SCALE;

const CALTROPS_HALF_ANGLE = (35 * Math.PI) / 180;

const MAP_REVISION = mmoSkillDemoRegionConfig.revision;

const LEGACY_WORLD_ZONE_IDS = new Set<ZoneId>(["ashwood", "crags", "bazaar", "port-marrow"]);

const FACTION_CATALOG_ZONE_IDS: Record<WorldFactionId, ZoneId> = {
  oakhaven: "ashwood",
  ironcrag: "crags",
  aetheria: "holy-reach",
  "port-marrow": "port-marrow",
  "sunken-bazaar": "canaan-desert",
  "obsidian-sanctum": "void-rift",
  "ashwood-glade": "ashwood-wilderness",
  "high-reach-peaks": "whisperwind-ascent"
};

function catalogZoneForLocation(location: string): ZoneId {
  const key = location.toLowerCase();
  if (key.includes("iron") || key.includes("fissure") || key.includes("vulcan") || key.includes("geode")) return "crags";
  if (key.includes("whisperwind") || key.includes("high-peak") || key.includes("high peak") || key.includes("peak")) return "whisperwind-ascent";
  if (key.includes("aether") || key.includes("holy") || key.includes("reach") || key.includes("cathedral")) return "holy-reach";
  if (key.includes("marrow") || key.includes("reef") || key.includes("sea") || key.includes("dock") || key.includes("graveyard")) return "port-marrow";
  if (key.includes("void") || key.includes("rift") || key.includes("obsidian")) return "void-rift";
  if (key.includes("bazaar") || key.includes("canaan") || key.includes("desert") || key.includes("vault")) return "canaan-desert";
  if (key.includes("dungeon") || key.includes("mirror")) return "dungeon";
  if (key.includes("wilderness") || key.includes("primeval")) return "ashwood-wilderness";
  return "ashwood";
}

function catalogZoneForMaterial(id: string): ZoneId {
  if (id.includes("ironcrag") || id.includes("vulcan") || id.includes("soot") || id.includes("sapper") || id.includes("geologist") || id.includes("fissure")) return "crags";
  if (id.includes("aether") || id.includes("solos") || id.includes("order") || id.includes("inquisition") || id.includes("anointed")) return "holy-reach";
  if (id.includes("marrow") || id.includes("cove") || id.includes("tide") || id.includes("eel") || id.includes("captain")) return "port-marrow";
  if (id.includes("void") || id.includes("nihil") || id.includes("obsidian") || id.includes("abyssal")) return "void-rift";
  if (id.includes("bazaar") || id.includes("dust") || id.includes("syndicate") || id.includes("appraiser") || id.includes("debt")) return "canaan-desert";
  if (id.includes("high-peak") || id.includes("wind") || id.includes("ascetic") || id.includes("monastic") || id.includes("moss")) return "whisperwind-ascent";
  if (id.includes("dungeon") || id.includes("mirror")) return "dungeon";
  if (id.includes("outcast") || id.includes("feral") || id.includes("bramble") || id.includes("timber-goliath")) return "ashwood-wilderness";
  return "ashwood";
}

export const mmoCatalog = {
  zones: [
    { id: "oakhaven", name: "Oakhaven", zoneId: "ashwood", role: "breadbasket", summary: "Southwest starter breadbasket where tool use and first combat open the safe road onward." },
    { id: "ironcrag", name: "Ironcrag", zoneId: "crags", role: "forge", summary: "Northwest mining colony where pickaxes, ore banking, and mountain pressure gate progress." },
    { id: "aetheria", name: "Aetheria", zoneId: "holy-reach", role: "lighthouse", summary: "Eastern holy citadel converting relics, routes, and resources into Void readiness." },
    { id: "overgrown-thicket", name: "The Overgrown Thicket", zoneId: "dungeon", role: "instance", summary: "Oakhaven-side dungeon holding the Nature Core and source of wolf pressure." },
    { id: "deep-fissure", name: "The Deep Fissure", zoneId: "dungeon", role: "instance", summary: "Ironcrag-side dungeon holding Prism Shards for shaft stabilization." },
    { id: "sunken-spire", name: "The Sunken Spire", zoneId: "dungeon", role: "instance", summary: "Aetheria-side flooded library holding Ancient Scripts for Void prep." },
    { id: "void-rift", name: "The Void Rift", zoneId: "void-rift", role: "endgame", summary: "Far northeast world-edge anomaly and elite pressure target." },
    { id: "ashwood", name: "Ashwood Glade", zoneId: "ashwood", role: "starter", summary: "Starter hub edge with tool tutorials, Ash trees, wolves, and basic combat." },
    { id: "ashwood-wilderness", name: "Ashwood Wilderness", zoneId: "ashwood-wilderness", role: "primal", summary: "Primeval Verdant Outcast forest with stronger beasts and strained Oakhaven kinship." },
    { id: "crags", name: "Iron Crags", zoneId: "crags", role: "mining", summary: "Vertical rocky terrain with ore routes, bats, crawlers, and Space-bar movement checks." },
    { id: "holy-reach", name: "Holy Reach", zoneId: "holy-reach", role: "law", summary: "Aetherian white-stone order zone with radiant guards, archives, and Void-prep services." },
    { id: "canaan-desert", name: "Canaan Desert", zoneId: "canaan-desert", role: "trade-ruin", summary: "Dust Syndicate desert approach around the Sunken Bazaar and relic vaults." },
    { id: "whisperwind-ascent", name: "Whisperwind Ascent", zoneId: "whisperwind-ascent", role: "monastery", summary: "High-Reach mountain approach for ascetic training and wind-path traversal." },
    { id: "bazaar", name: "The Sunken Bazaar", zoneId: "bazaar", role: "legacy-elite", summary: "Legacy high-risk zone id preserved for older saves and route compatibility." },
    { id: "port-marrow", name: "Port Marrow", zoneId: "port-marrow", role: "peace", summary: "No-combat hub for trading, banking, quest board, trainers, and travel." },
    { id: "dungeon", name: "Dungeons", zoneId: "dungeon", role: "party-instance", summary: "Temporary room template for boss fights with high-cost, high-reward objectives." },
    { id: "cottage", name: "Player Cottages", zoneId: "cottage", role: "private-instance", summary: "Small private tile-map instance for storage, recovery, and social staging." }
  ],
  worldEvents: [
    { id: "ashwood-pack", name: "Ashwood Pack Rally", zoneId: "ashwood", role: "public-event", summary: "Shared starter event fed by wolf kills and Ash tree cuts." },
    { id: "outcast-hunt", name: "Outcast Hunt", zoneId: "ashwood-wilderness", role: "public-event", summary: "Primeval forest event fed by primal beast kills and Outcast boundary defense." },
    { id: "crag-supply", name: "Crag Supply Rush", zoneId: "crags", role: "public-event", summary: "Mining-route event fed by ore extraction and Crags patrol kills." },
    { id: "holy-purge", name: "Holy Purge", zoneId: "holy-reach", role: "public-event", summary: "Aetherian event fed by automaton, crusader, and radiant-threat control." },
    { id: "bazaar-breach", name: "Bazaar Breach", zoneId: "canaan-desert", role: "public-event", summary: "Elite-zone event fed by survival pressure and high-risk monster kills." },
    { id: "rift-containment", name: "Rift Containment", zoneId: "void-rift", role: "public-event", summary: "Void event fed by rift creature kills and Nihil pressure containment." },
    { id: "wind-trial", name: "Wind Trial", zoneId: "whisperwind-ascent", role: "public-event", summary: "High-Reach event fed by mountain threat clears and movement mastery." },
    { id: "dungeon-surge", name: "Dungeon Surge", zoneId: "dungeon", role: "public-event", summary: "Party-instance event fed by power node and boss progress." },
    { id: "cottage-restock", name: "Cottage Restock", zoneId: "cottage", role: "private-event", summary: "Private-instance event fed by storage and home upkeep interactions." }
  ],
  abilities: [
    { id: "mace-pummel", name: "Pummel", zoneId: "ashwood", role: "LMB", summary: "Starting Mace hold-to-charge cone attack with charge-scaled damage and wall-stun KBM." },
    { id: "mace-crushing-leap", name: "Slam", zoneId: "ashwood", role: "RMB", summary: "Starting Mace i-frame leap into a stunning slam and slowing crater impact." },
    { id: "space-rush", name: "Rush", zoneId: "ashwood", role: "Space", summary: "Universal movement charge with distance-scaled collision damage and KBM." },
    { id: "q-berserk", name: "Berserk", zoneId: "bazaar", role: "Q", summary: "Universal parry stance that negates damage, heals, generates Energy, and triggers Berserk." },
    { id: "mace-rock-smash", name: "Rock Smash", zoneId: "crags", role: "E", summary: "Starting Mace charge projectile that upgrades from one boulder into a recoil-heavy shotgun spread." },
    { id: "mace-whirlwind", name: "Whirlwind", zoneId: "dungeon", role: "R", summary: "Starting Mace Energy ultimate that channels mobile AoE damage through enemy packs." },
    { id: "bow-quick-shot", name: "Quick Shot", zoneId: "ashwood", role: "LMB", summary: "Bow basic arrow for mild first-target damage at mid range." },
    { id: "bow-precision", name: "Precision Shot", zoneId: "ashwood", role: "RMB", summary: "Bow long-range piercing arrow with high damage and strong knockback." },
    { id: "bow-volley", name: "Volley", zoneId: "ashwood", role: "RMB", summary: "Bow fan of seven arrows across a wide arc with repeated-hit falloff." },
    { id: "bow-reposition", name: "Reposition", zoneId: "ashwood", role: "Space", summary: "Bow i-frame dash that empowers the next three Quick Shots." },
    { id: "bow-vault", name: "Vault", zoneId: "ashwood", role: "Space", summary: "Bow backstep i-frame with a 200-range impact burst." },
    { id: "bow-stealth", name: "Stealth", zoneId: "ashwood", role: "Q", summary: "Bow stealth window with decaying movement speed." },
    { id: "bow-decoy", name: "Decoy", zoneId: "ashwood", role: "Q", summary: "Bow dummy that pulls nearby enemies and explodes." },
    { id: "bow-bolas", name: "Bolas", zoneId: "ashwood", role: "E", summary: "Bow bola that slows on single hit or stuns and weakens linked targets." },
    { id: "bow-caltrops", name: "Caltrops", zoneId: "ashwood", role: "E", summary: "Bow charged scatter trap that slows and chips enemies." },
    { id: "bow-flurry", name: "Flurry", zoneId: "ashwood", role: "R", summary: "Bow channel that fires thirty low-knockback long-range arrows." },
    { id: "bow-arrowstorm", name: "Arrow Storm", zoneId: "ashwood", role: "R", summary: "Bow cursor-centered storm that ticks damage and slow." },
    { id: "staff-arcane-bolt", name: "Arcane Bolt", zoneId: "ashwood", role: "LMB", summary: "Staff line bolt with quick cast and first-target impact." },
    { id: "staff-siphon-beam", name: "Siphon Beam", zoneId: "ashwood", role: "LMB", summary: "Staff held tether that ticks damage and self-heal." },
    { id: "staff-meteor", name: "Meteor", zoneId: "ashwood", role: "RMB", summary: "Staff delayed aimed impact with lingering burn ticks." },
    { id: "staff-healing-pulse", name: "Healing Pulse", zoneId: "ashwood", role: "RMB", summary: "Staff aimed burst heal for nearby allies." },
    { id: "staff-frost-chain", name: "Frost Chain", zoneId: "ashwood", role: "RMB", summary: "Staff chained projectile that slows each bounced target." },
    { id: "staff-astral-walk", name: "Astral Walk", zoneId: "ashwood", role: "Space", summary: "Staff teleport that leaves a delayed arcane burst." },
    { id: "staff-zephyr", name: "Zephyr", zoneId: "ashwood", role: "Space", summary: "Staff self wind aura with speed boost and enemy pushback." },
    { id: "staff-ice-wall", name: "Ice Wall", zoneId: "ashwood", role: "Q", summary: "Staff aimed wall visual that blocks hostile projectile hazards and slows crossings." },
    { id: "staff-arcane-bubble", name: "Arcane Bubble", zoneId: "ashwood", role: "Q", summary: "Staff dome that reduces incoming damage during its short active window." },
    { id: "staff-petrify", name: "Petrify", zoneId: "ashwood", role: "Q", summary: "Staff frontal cone shockwave with short stun." },
    { id: "staff-gravity-well", name: "Gravity Well", zoneId: "ashwood", role: "E", summary: "Staff aimed vortex that pulls and ticks damage." },
    { id: "staff-consecration", name: "Consecration", zoneId: "ashwood", role: "E", summary: "Staff aimed sigil that heals allies and damages hostiles." },
    { id: "staff-dispel-nova", name: "Dispel Nova", zoneId: "ashwood", role: "E", summary: "Staff self nova that clears nearby ally debuffs and hostile buffs." },
    { id: "staff-maelstrom", name: "Maelstrom", zoneId: "ashwood", role: "R", summary: "Staff Energy ultimate that channels aimed storm damage." },
    { id: "staff-tranquility", name: "Tranquility", zoneId: "ashwood", role: "R", summary: "Staff Energy ultimate that channels large-area healing." },
    { id: "wand-magic-missile", name: "Magic Missile", zoneId: "ashwood", role: "LMB", summary: "Wand homing dart that favors the aimed target." },
    { id: "wand-hex", name: "Hex", zoneId: "ashwood", role: "LMB", summary: "Wand shadow hit that stacks a short curse for Rupture." },
    { id: "wand-mending-spark", name: "Mending Spark", zoneId: "ashwood", role: "LMB", summary: "Wand hostile spark that bounces into a small ally heal." },
    { id: "wand-focused-ray", name: "Focused Ray", zoneId: "ashwood", role: "RMB", summary: "Wand piercing laser burst." },
    { id: "wand-soul-bind", name: "Soul Bind", zoneId: "ashwood", role: "RMB", summary: "Wand tether that shares damage between two linked hostiles." },
    { id: "wand-flash-heal", name: "Flash Heal", zoneId: "ashwood", role: "RMB", summary: "Wand targeted ally heal with a brief speed bump." },
    { id: "wand-blink", name: "Blink", zoneId: "ashwood", role: "Space", summary: "Wand short teleport." },
    { id: "wand-phase-shift", name: "Phase Shift", zoneId: "ashwood", role: "Space", summary: "Wand short untargetable speed window." },
    { id: "wand-rewind", name: "Rewind", zoneId: "ashwood", role: "Space", summary: "Wand time snap to recent stored position and lost health." },
    { id: "wand-mirror-shield", name: "Mirror Shield", zoneId: "ashwood", role: "Q", summary: "Wand shield that absorbs the next hit and reflects damage." },
    { id: "wand-nightmare", name: "Nightmare", zoneId: "ashwood", role: "Q", summary: "Wand fear cone that pushes and slows targets." },
    { id: "wand-rupture", name: "Rupture", zoneId: "ashwood", role: "E", summary: "Wand curse burst that consumes Hex stacks for bonus damage." },
    { id: "wand-enfeeble", name: "Enfeeble", zoneId: "ashwood", role: "E", summary: "Wand charged pool that weakens hostile outgoing damage." },
    { id: "wand-chaos-volley", name: "Chaos Volley", zoneId: "ashwood", role: "R", summary: "Wand Energy ultimate that fires rapid seeking bolts in a forward arc." },
    { id: "wand-apotheosis", name: "Apotheosis", zoneId: "ashwood", role: "R", summary: "Wand Energy ultimate that buffs an ally with speed and lifesteal." },
    { id: "twin-strike", name: "Twin Strike", zoneId: "ashwood", role: "LMB", summary: "Twin Blades quick double-hit cone basic." },
    { id: "twin-toxic-slash", name: "Toxic Slash", zoneId: "ashwood", role: "LMB", summary: "Twin Blades cone basic that stacks poison." },
    { id: "twin-throwing-dirk", name: "Throwing Dirk", zoneId: "ashwood", role: "LMB", summary: "Twin Blades short line throw that slows the first target." },
    { id: "twin-shadow-lunge", name: "Shadow Lunge", zoneId: "ashwood", role: "RMB", summary: "Twin Blades short dash strike with burst on crossed targets." },
    { id: "twin-exsanguinate", name: "Exsanguinate", zoneId: "ashwood", role: "RMB", summary: "Twin Blades cone finisher that consumes poison stacks for bonus damage." },
    { id: "twin-fan-of-knives", name: "Fan of Knives", zoneId: "ashwood", role: "RMB", summary: "Twin Blades spread throw that marks targets against healing." },
    { id: "twin-swift-step", name: "Swift Step", zoneId: "ashwood", role: "Space", summary: "Twin Blades fast dash that briefly accelerates attacks." },
    { id: "twin-smoke-bomb", name: "Smoke Bomb", zoneId: "ashwood", role: "Space", summary: "Twin Blades smoke burst that grants stealth and blinds nearby enemies." },
    { id: "twin-bloodlust", name: "Bloodlust", zoneId: "ashwood", role: "Space", summary: "Twin Blades self burst for high move and attack speed." },
    { id: "twin-blur", name: "Blur", zoneId: "ashwood", role: "Q", summary: "Twin Blades short invulnerability reset." },
    { id: "twin-vanish", name: "Vanish", zoneId: "ashwood", role: "Q", summary: "Twin Blades true stealth with bonus damage on the next hit." },
    { id: "twin-noxious-flask", name: "Noxious Flask", zoneId: "ashwood", role: "E", summary: "Twin Blades thrown poison pool." },
    { id: "twin-deaths-mark", name: "Death's Mark", zoneId: "ashwood", role: "E", summary: "Twin Blades targeted mark that amplifies incoming damage." },
    { id: "twin-blade-dance", name: "Blade Dance", zoneId: "ashwood", role: "R", summary: "Twin Blades Energy ultimate with mobile AoE slashes and dodge." },
    { id: "twin-assassinate", name: "Assassinate", zoneId: "ashwood", role: "R", summary: "Twin Blades Energy ultimate blink strike with kill refund." },
    { id: "blade-cleave", name: "Cleave", zoneId: "ashwood", role: "LMB", summary: "Blade wide cone basic." },
    { id: "blade-sever", name: "Sever", zoneId: "ashwood", role: "LMB", summary: "Blade cone basic that applies Mortal Wound." },
    { id: "blade-sunder", name: "Sunder", zoneId: "ashwood", role: "LMB", summary: "Blade cone basic that fractures armor." },
    { id: "blade-brutal-strike", name: "Brutal Strike", zoneId: "ashwood", role: "RMB", summary: "Blade heavy cone interrupt." },
    { id: "blade-thrust", name: "Thrust", zoneId: "ashwood", role: "RMB", summary: "Blade fast piercing line stab." },
    { id: "blade-bloodthirst", name: "Bloodthirst", zoneId: "ashwood", role: "RMB", summary: "Blade cone strike that heals from damage dealt." },
    { id: "blade-combat-roll", name: "Combat Roll", zoneId: "ashwood", role: "Space", summary: "Blade invulnerable movement roll." },
    { id: "blade-leap-attack", name: "Leap Attack", zoneId: "ashwood", role: "Space", summary: "Blade leap into landing AoE." },
    { id: "blade-juggernaut", name: "Juggernaut", zoneId: "ashwood", role: "Space", summary: "Blade sprint with slow and root immunity." },
    { id: "blade-riposte", name: "Riposte", zoneId: "ashwood", role: "Q", summary: "Blade parry window with stun counter." },
    { id: "blade-iron-will", name: "Iron Will", zoneId: "ashwood", role: "Q", summary: "Blade control break and short damage reduction." },
    { id: "blade-intimidating-shout", name: "Intimidating Shout", zoneId: "ashwood", role: "E", summary: "Blade shout that weakens nearby enemy outgoing damage." },
    { id: "blade-razor-wind", name: "Razor Wind", zoneId: "ashwood", role: "E", summary: "Blade charged crescent projectile with full-charge slow." },
    { id: "blade-omnislash", name: "Omnislash", zoneId: "ashwood", role: "R", summary: "Blade Energy ultimate that chains invulnerable seeking strikes." },
    { id: "blade-duelists-trance", name: "Duelist's Trance", zoneId: "ashwood", role: "R", summary: "Blade Energy ultimate that accelerates basic cooldown recovery and heals basics." }
  ],
  items: [
    { id: "training-hatchet", name: "Training Hatchet", zoneId: "ashwood", role: "tool", summary: "Starter tool for first Ash tree cuts." },
    { id: "iron-hatchet", name: "Iron Hatchet", zoneId: "ashwood", role: "tool", summary: "Non-stackable tool reward from The First Cut." },
    { id: "pickaxe", name: "Pickaxe", zoneId: "crags", role: "tool", summary: "Foreman purchase required for efficient ore extraction." },
    { id: "glade-berry", name: "Glade Berry", zoneId: "ashwood", role: "consumable", summary: "Stackable heal used automatically when wounded." },
    { id: "cinder-ale", name: "Cinder Ale", zoneId: "port-marrow", role: "consumable", summary: "Stackable mana refill sold by merchants and dungeon drops." },
    { id: "speed-potion", name: "Speed Potion", zoneId: "port-marrow", role: "consumable", summary: "Short burst reward and merchant stock." },
    { id: "leather-boots", name: "Leather Boots", zoneId: "ashwood", role: "gear", summary: "Non-stackable speed gear from starter progression." },
    { id: "mining-boots", name: "Mining Boots", zoneId: "crags", role: "gear", summary: "Non-stackable Heavy Lifting reward for faster movement." },
    { id: "iron-chest", name: "Iron Chest", zoneId: "crags", role: "gear", summary: "Non-stackable damage reduction gear crafted by the blacksmith." },
    { id: "ring-focus", name: "Ring of Focus", zoneId: "bazaar", role: "gear", summary: "Non-stackable cooldown reduction gear from elite farming." },
    { id: "ash-logs", name: "Ash Logs", zoneId: "ashwood", role: "resource", summary: "Stackable crafting and quest resource." },
    { id: "iron-ore", name: "Iron Ore", zoneId: "crags", role: "resource", summary: "Stackable crafting and Foreman quest resource." },
    { id: "silk-thread", name: "Silk Thread", zoneId: "bazaar", role: "resource", summary: "Stackable high-tier crafting drop." },
    { id: "captains-map", name: "The Captain's Map", zoneId: "port-marrow", role: "quest-item", summary: "Non-tradable route unlock from Lost Compass." },
    { id: "cursed-idol", name: "Cursed Idol", zoneId: "bazaar", role: "quest-item", summary: "Non-tradable high-risk quest item from the hidden statue." },
    { id: "broken-hilt", name: "Broken Hilt", zoneId: "dungeon", role: "quest-item", summary: "Non-tradable dungeon component for elite weapon upgrades." },
    { id: "nature-core", name: "Nature Core", zoneId: "dungeon", role: "town-relic", summary: "Oakhaven relic taken from the Overgrown Thicket." },
    { id: "prism-shards", name: "Prism Shards", zoneId: "dungeon", role: "town-relic", summary: "Ironcrag relic extracted from the Deep Fissure." },
    { id: "ancient-scripts", name: "Ancient Scripts", zoneId: "dungeon", role: "town-relic", summary: "Aetheria relic recovered from the Sunken Spire." },
    { id: "void-resistant-cloak", name: "Void-Resistant Cloak", zoneId: "port-marrow", role: "gear", summary: "Alchemist gear for entering the Void Rift." }
  ],
  mobs: [
    { id: "prowling-wolf", name: "Prowling Wolf", zoneId: "ashwood", role: "common", summary: "Fast lunging melee threat." },
    { id: "iron-eye-bat", name: "Iron-Eye Bat", zoneId: "crags", role: "common", summary: "Flying projectile threat that ignores rocky ground checks." },
    { id: "stone-crawler", name: "Stone-Crawler", zoneId: "crags", role: "common", summary: "Slow high-defense melee pressure." },
    { id: "crystal-beetle", name: "Crystal Beetle", zoneId: "crags", role: "common", summary: "Armored charge enemy that asks players to sidestep lanes." },
    { id: "crag-sapper", name: "Crag Sapper", zoneId: "crags", role: "common", summary: "Keeps pressure with delayed blast traps around ore routes." },
    { id: "sand-wraith", name: "Sand-Wraith", zoneId: "bazaar", role: "common", summary: "Disappears while moving and reappears behind players." },
    { id: "cursed-archer", name: "Cursed Archer", zoneId: "bazaar", role: "common", summary: "Persistent ranged kiter." },
    { id: "mire-bomber", name: "Mire Bomber", zoneId: "bazaar", role: "common", summary: "Keeps distance and drops delayed AOE traps." },
    { id: "rune-priest", name: "Rune Priest", zoneId: "bazaar", role: "support", summary: "Heals nearby monsters unless pressured first." },
    { id: "ash-bramble-stalker", name: "Ash Bramble Stalker", zoneId: "ashwood", role: "common", summary: "Ambushes starter paths with root bursts after a short windup." },
    { id: "veil-oracle", name: "Veil Oracle", zoneId: "bazaar", role: "support", summary: "Buffs elite threats and fires thin ruin beams when ignored." },
    { id: "ember-acolyte", name: "Ember Acolyte", zoneId: "dungeon", role: "support", summary: "Dungeon support add that feeds boss pressure." },
    { id: "dungeon-revenant", name: "Dungeon Revenant", zoneId: "dungeon", role: "elite", summary: "Phase-shifting elite add with invulnerability and enraged line attacks." },
    { id: "aggro-tree", name: "Aggro-Tree", zoneId: "ashwood", role: "common", summary: "Immobile AOE slam hazard." },
    { id: "alpha-timberwolf", name: "Alpha Timberwolf", zoneId: "ashwood", role: "elite", summary: "Mini-boss that summons two wolves." },
    { id: "crag-gargoyle", name: "Crag-Gargoyle", zoneId: "crags", role: "elite", summary: "Mini-boss that turns invulnerable on a cycle." },
    { id: "void-sent-sentinel", name: "Void-Sent Sentinel", zoneId: "bazaar", role: "elite", summary: "Mini-boss with a movement-slowing tether." },
    { id: "bazaar-guard", name: "Bazaar Guard", zoneId: "bazaar", role: "elite", summary: "Shielded elite that blocks frontal projectiles." },
    { id: "great-ash-lord", name: "The Great Ash-Lord", zoneId: "dungeon", role: "boss", summary: "Dungeon boss with large AOE burn waves." },
    { id: "iron-core-golem", name: "Iron-Core Golem", zoneId: "dungeon", role: "boss", summary: "Dungeon boss vulnerable only after Power Nodes break." },
    { id: "mirror-king", name: "The Mirror-King", zoneId: "dungeon", role: "boss", summary: "Dungeon boss that clones player abilities." }
  ],
  bestiary: bestiaryDefinitions.map((entry) => ({
    id: entry.id,
    name: entry.name,
    zoneId: entry.zoneId,
    role: entry.role,
    summary: `${entry.personality}: ${entry.mechanics}`
  })),
  npcs: [
    { id: "elder-rowan", name: "Elder Rowan", zoneId: "ashwood", role: "quest", summary: "Starter quest giver and LMB/RMB teacher." },
    { id: "blacksmith-silas", name: "Blacksmith Silas", zoneId: "ashwood", role: "crafting", summary: "Oakhaven smith needing Ironcrag ore for tools." },
    { id: "miller-finn", name: "Miller Finn", zoneId: "ashwood", role: "quest", summary: "Food-supply owner worried about Nature Core corruption." },
    { id: "scout-elara", name: "Scout Elara", zoneId: "ashwood", role: "quest", summary: "Frontier scout tracking the source of wolf pressure." },
    { id: "overseer-bale", name: "Overseer Bale", zoneId: "crags", role: "quest", summary: "Ironcrag leader trading ore output against food shortages." },
    { id: "geologist-mira", name: "Geologist Mira", zoneId: "crags", role: "quest", summary: "Researcher seeking Prism Shards to stabilize shafts." },
    { id: "runner-kael", name: "Runner Kael", zoneId: "crags", role: "travel", summary: "Courier running the dangerous Ironcrag to Aetheria pass." },
    { id: "high-arcanist-vael", name: "High Arcanist Vael", zoneId: "port-marrow", role: "quest", summary: "Aetheria researcher obsessed with historic Void Rift closures." },
    { id: "navigator-kai", name: "Navigator Kai", zoneId: "port-marrow", role: "travel", summary: "Sailor tracking tides caused by the Sunken Spire." },
    { id: "alchemist-zora", name: "Alchemist Zora", zoneId: "port-marrow", role: "merchant", summary: "Essence refiner making Void-resistant gear." },
    { id: "foreman-iron-will", name: "Foreman Iron-Will", zoneId: "crags", role: "trainer", summary: "Sells pickaxes and owns mining quests." },
    { id: "banker-valerius", name: "Banker Valerius", zoneId: "port-marrow", role: "bank", summary: "Global storage access." },
    { id: "merchant-kaya", name: "Merchant Kaya", zoneId: "port-marrow", role: "merchant", summary: "General goods buyer and seller." },
    { id: "master-kael", name: "Master Kael", zoneId: "bazaar", role: "trainer", summary: "Advanced Q-slot trainer." },
    { id: "captain-marrow", name: "Captain Marrow", zoneId: "port-marrow", role: "travel", summary: "Zone-travel and instance-routing NPC." },
    { id: "blacksmith", name: "The Blacksmith", zoneId: "port-marrow", role: "crafting", summary: "Gear upgrades for gold and resources." },
    { id: "apprentice-jinn", name: "Apprentice Jinn", zoneId: "ashwood", role: "merchant", summary: "Basic potion seller." },
    { id: "cursed-statue", name: "Cursed Statue", zoneId: "bazaar", role: "hidden", summary: "Hidden high-risk, high-reward quest source." },
    { id: "innkeeper-martha", name: "Innkeeper Martha", zoneId: "port-marrow", role: "home", summary: "Sets home respawn location." },
    { id: "contract-board", name: "Contract Board", zoneId: "port-marrow", role: "contract", summary: "Repeatable slayer writs for renown, gold, and long-run mastery." }
  ],
  quests: [
    { id: "wolf-pelt-quota", name: "Wolf-Pelt Quota", zoneId: "ashwood", role: "combat", summary: "Collect 10 pelts from the Oakhaven perimeter. Reward: Basic armor." },
    { id: "ironcrag-logistics", name: "Ironcrag Logistics", zoneId: "ashwood", role: "escort", summary: "Escort Oakhaven grain to Ironcrag. Reward: Trusted status." },
    { id: "root-of-the-problem", name: "Root of the Problem", zoneId: "dungeon", role: "boss", summary: "Slay the Thicket Heart in the Overgrown Thicket. Reward: Nature Core." },
    { id: "great-starvation", name: "The Great Starvation", zoneId: "crags", role: "recovery", summary: "Reclaim a hijacked mountain-pass food caravan. Reward: Mining Pick." },
    { id: "luminous-depths", name: "Luminous Depths", zoneId: "dungeon", role: "extraction", summary: "Extract 5 Prism Shards from the Deep Fissure. Reward: Socketed Gem." },
    { id: "coastal-draught", name: "The Coastal Draught", zoneId: "port-marrow", role: "retrieval", summary: "Recover 3 weather charts from the Sunken Spire. Reward: World Map expansion." },
    { id: "forbidden-scripts", name: "Forbidden Scripts", zoneId: "dungeon", role: "retrieval", summary: "Find the Tome of Rifts in the Sunken Spire. Reward: Teleportation access." },
    { id: "void-resistance", name: "Void Resistance", zoneId: "port-marrow", role: "crafting", summary: "Deliver Magic Essence and Salt. Reward: Void-Resistant Cloak." },
    { id: "silent-signal", name: "The Silent Signal", zoneId: "crags", role: "delivery", summary: "Deliver a distress flare to the Oakhaven lighthouse. Reward: Gold." },
    { id: "seal-the-rift", name: "Seal the Rift", zoneId: "dungeon", role: "global", summary: "Collapse the Void Rift after earning all three town relics." },
    { id: "first-cut", name: "The First Cut", zoneId: "ashwood", role: "woodcutting", summary: "Cut 5 Ash trees. Reward: Iron Hatchet." },
    { id: "second-cut", name: "The Second Cut", zoneId: "ashwood", role: "woodcutting", summary: "Stockpile 12 Ash Logs after the first lesson. Reward: Renown and woodcutting XP." },
    { id: "wolf-culling", name: "Wolf Culling", zoneId: "ashwood", role: "combat", summary: "Kill 10 Wolves. Reward: Space Jump." },
    { id: "final-cut", name: "The Final Cut", zoneId: "ashwood", role: "route", summary: "Return after securing Ashwood to earn Captain Marrow's route registration." },
    { id: "hidden-vein", name: "The Hidden Vein", zoneId: "crags", role: "exploration", summary: "Find a secret cave marker for gold." },
    { id: "heavy-lifting", name: "Heavy Lifting", zoneId: "crags", role: "mining", summary: "Deliver 50 Iron Ore. Reward: Mining Boots." },
    { id: "lost-compass", name: "Lost Compass", zoneId: "port-marrow", role: "retrieval", summary: "Retrieve the compass from a wolf den. Reward: World Map." },
    { id: "silent-sands", name: "The Silent Sands", zoneId: "bazaar", role: "survival", summary: "Survive 2 minutes in danger. Reward: Q Stun." },
    { id: "ghostly-trade", name: "Ghostly Trade", zoneId: "bazaar", role: "escort", summary: "Escort an NPC through the ruins. Reward: XP and gold." },
    { id: "breaking-golem", name: "Breaking the Golem", zoneId: "dungeon", role: "boss", summary: "Defeat the Iron-Core Golem. Reward: Elite Weapon." },
    { id: "feathered-pests", name: "Feathered Pests", zoneId: "port-marrow", role: "combat", summary: "Kill 15 Bats near the docks. Reward: Speed Potion x5." },
    { id: "kings-foil", name: "The King's Foil", zoneId: "dungeon", role: "global", summary: "Kill The Mirror-King. Reward: Prestige Title and unique cape." },
    { id: "guild-contracts", name: "Guild Contracts", zoneId: "port-marrow", role: "repeatable", summary: "Repeatable zone contracts that build renown and mastery over long sessions." }
  ],
  factions: worldFactions.map((faction) => ({
    id: faction.id,
    name: `${faction.townName} (${faction.factionName})`,
    zoneId: FACTION_CATALOG_ZONE_IDS[faction.id],
    role: "faction",
    summary: `${faction.ideology} Good means ${faction.definitionOfGood}`
  })),
  expandedCreatures: worldCreatureDefinitions.map((creature) => ({
    id: creature.id,
    name: creature.name,
    zoneId: catalogZoneForLocation(creature.location),
    role: "ecology",
    summary: `${creature.location}: ${creature.ecologyTags.join(", ")}. ${creature.ecologicalNiche} Idle: ${creature.idleBehavior}`
  })),
  reputationRewards: worldReputationRewards.map((reward) => ({
    id: reward.id,
    name: reward.name,
    zoneId: FACTION_CATALOG_ZONE_IDS[reward.factionId],
    role: reward.tier.toLowerCase(),
    summary: `${reward.tier} ${reward.tierLevel} ${reward.factionId}: ${reward.effectSummary}`
  })),
  craftingMaterials: worldCraftingMaterials.map((material) => ({
    id: material.id,
    name: material.name,
    zoneId: catalogZoneForMaterial(material.id),
    role: material.category,
    summary: material.summary
  }))
};

const RESOURCE_HP = {
  tree: 3,
  ore: 4
} as const;

function resourceHpForKind(kind: WorldGatherableNodeKind, tier = 1) {
  if (kind === "tree" || kind === "ore") return RESOURCE_HP[kind];
  return Math.max(2, Math.min(8, 1 + tier));
}

export {
  BOW_ARROW_STORM_RADIUS,
  BOW_BOLAS_LINK_RANGE,
  BOW_BOLAS_RANGE,
  BOW_DECOY_TAUNT_RANGE,
  BOW_FLURRY_RANGE,
  BOW_FLURRY_VISUAL_STRIDE,
  BOW_PRECISION_RANGE,
  BOW_QUICK_RANGE,
  BOW_RANGE_SCALE,
  BOW_VAULT_RADIUS,
  BOW_VOLLEY_RANGE,
  CALTROPS_FULL_MAX_RANGE,
  CALTROPS_HALF_ANGLE,
  CALTROPS_MIN_MAX_RANGE,
  FACTION_CATALOG_ZONE_IDS,
  LEGACY_WORLD_ZONE_IDS,
  MAP_HEIGHT,
  MAP_REVISION,
  MAP_WIDTH,
  PLAYER_RADIUS,
  PUMMEL_MAX_CHARGE_MS,
  RESOURCE_HP,
  RUSH_BRAKE_MS,
  RUSH_DURATION_MS,
  TILE,
  WHIRLWIND_RADIUS,
  catalogZoneForLocation,
  catalogZoneForMaterial,
  resourceHpForKind
};
