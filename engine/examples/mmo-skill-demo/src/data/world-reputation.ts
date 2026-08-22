import type { WorldFactionId } from "./world-factions.ts";
import { groupByKey, indexUniqueBy } from "./indexing.ts";

export const worldReputationTiers = ["Neutral", "Recognized", "Trusted", "Respected", "Exalted"] as const;
export const worldReputationRewardTiers = ["Recognized", "Trusted", "Respected", "Exalted"] as const;

export type WorldReputationTier = (typeof worldReputationTiers)[number];
export type WorldReputationRewardTier = (typeof worldReputationRewardTiers)[number];
export type WorldReputationRewardLevel = 1 | 2 | 3 | 4;
export type WorldReputationFactionId = WorldFactionId;

export type WorldReputationFaction = {
  id: WorldReputationFactionId;
  townName: string;
  factionName: string;
};

export type WorldReputationReward = {
  id: string;
  factionId: WorldReputationFactionId;
  tier: WorldReputationRewardTier;
  tierLevel: WorldReputationRewardLevel;
  name: string;
  effectSummary: string;
};

export const worldReputationTierOrder = {
  Neutral: 0,
  Recognized: 1,
  Trusted: 2,
  Respected: 3,
  Exalted: 4
} as const satisfies Record<WorldReputationTier, number>;

export const worldReputationFactions = [
  { id: "oakhaven", townName: "Oakhaven", factionName: "The Sylvan Concord" },
  { id: "ironcrag", townName: "Ironcrag", factionName: "The Vulcan Guild" },
  { id: "aetheria", townName: "Aetheria", factionName: "The Archon Order" },
  { id: "port-marrow", townName: "Port Marrow", factionName: "The Free Cove" },
  { id: "sunken-bazaar", townName: "The Sunken Bazaar", factionName: "The Dust Syndicate" },
  { id: "obsidian-sanctum", townName: "Obsidian Sanctum", factionName: "The Nihil Sect" },
  { id: "ashwood-glade", townName: "Ashwood Glade", factionName: "The Verdant Outcasts" },
  { id: "high-reach-peaks", townName: "High-Reach Peaks", factionName: "The Ascetics of Sky" }
] as const satisfies readonly WorldReputationFaction[];

export const worldReputationRewards = [
  {
    id: "oakhaven-druid-guild-entry",
    factionId: "oakhaven",
    tier: "Recognized",
    tierLevel: 1,
    name: "Druid Guild Entry",
    effectSummary: "Access secret inner groves containing premium elderwood."
  },
  {
    id: "oakhaven-forest-step",
    factionId: "oakhaven",
    tier: "Trusted",
    tierLevel: 2,
    name: "Forest Step",
    effectSummary: "Gain 10% movement velocity while moving off-road on any grass tile."
  },
  {
    id: "oakhaven-barkskin-infusion",
    factionId: "oakhaven",
    tier: "Respected",
    tierLevel: 3,
    name: "Barkskin Infusion",
    effectSummary: "Regenerate 2 HP per second while in forest zones."
  },
  {
    id: "oakhaven-natures-alliance",
    factionId: "oakhaven",
    tier: "Exalted",
    tierLevel: 4,
    name: "Nature's Alliance",
    effectSummary: "Non-boss beast units will not aggro unless attacked first."
  },
  {
    id: "ironcrag-smelter-permit",
    factionId: "ironcrag",
    tier: "Recognized",
    tierLevel: 1,
    name: "Smelter Permit",
    effectSummary: "Access high-heat furnaces yielding 10% more refined ingots."
  },
  {
    id: "ironcrag-fuel-efficiency",
    factionId: "ironcrag",
    tier: "Trusted",
    tierLevel: 2,
    name: "Fuel Efficiency",
    effectSummary: "Reduce crafting fuel costs by 15% across all recipes."
  },
  {
    id: "ironcrag-blast-plated-boots",
    factionId: "ironcrag",
    tier: "Respected",
    tierLevel: 3,
    name: "Blast-Plated Boots",
    effectSummary: "Gain immunity to lava and fire path ground damage tiles."
  },
  {
    id: "ironcrag-heavy-strike",
    factionId: "ironcrag",
    tier: "Exalted",
    tierLevel: 4,
    name: "Heavy Strike",
    effectSummary: "Ground attacks gain 5 armor penetration points."
  },
  {
    id: "aetheria-sanctuary-access",
    factionId: "aetheria",
    tier: "Recognized",
    tierLevel: 1,
    name: "Sanctuary Access",
    effectSummary: "Enter the holy archive library of ancient runes."
  },
  {
    id: "aetheria-radiant-ward",
    factionId: "aetheria",
    tier: "Trusted",
    tierLevel: 2,
    name: "Radiant Ward",
    effectSummary: "Reduce damage taken from Void and Dark attacks by 15%."
  },
  {
    id: "aetheria-tithe-discount",
    factionId: "aetheria",
    tier: "Respected",
    tierLevel: 3,
    name: "Tithe Discount",
    effectSummary: "Gain a 15% price discount at certified holy merchants."
  },
  {
    id: "aetheria-smite-rune",
    factionId: "aetheria",
    tier: "Exalted",
    tierLevel: 4,
    name: "Smite Rune",
    effectSummary: "Basic attacks have a 5% chance to call down an instant divine fire bolt."
  },
  {
    id: "port-marrow-private-dock",
    factionId: "port-marrow",
    tier: "Recognized",
    tierLevel: 1,
    name: "Private Dock",
    effectSummary: "Gain safe housing access with no municipal storage fees."
  },
  {
    id: "port-marrow-wind-walker",
    factionId: "port-marrow",
    tier: "Trusted",
    tierLevel: 2,
    name: "Wind-Walker",
    effectSummary: "Gain 15% movement speed while aboard ships or along shorelines."
  },
  {
    id: "port-marrow-black-market-broker",
    factionId: "port-marrow",
    tier: "Respected",
    tierLevel: 3,
    name: "Black-Market Broker",
    effectSummary: "Sell stolen or forbidden goods at face value."
  },
  {
    id: "port-marrow-crimson-tide",
    factionId: "port-marrow",
    tier: "Exalted",
    tierLevel: 4,
    name: "Crimson Tide",
    effectSummary: "Critical strikes steal health equal to 5% of damage dealt."
  },
  {
    id: "sunken-bazaar-backroom-access",
    factionId: "sunken-bazaar",
    tier: "Recognized",
    tierLevel: 1,
    name: "Backroom Access",
    effectSummary: "Trade rare antiques and historical relics."
  },
  {
    id: "sunken-bazaar-fee-cut",
    factionId: "sunken-bazaar",
    tier: "Trusted",
    tierLevel: 2,
    name: "Fee Cut",
    effectSummary: "Reduce auction and broker house transaction tax from 5% to 1%."
  },
  {
    id: "sunken-bazaar-barter-language",
    factionId: "sunken-bazaar",
    tier: "Respected",
    tierLevel: 3,
    name: "Barter Language",
    effectSummary: "Increase merchant sale value of your items by 10%."
  },
  {
    id: "sunken-bazaar-coin-scent",
    factionId: "sunken-bazaar",
    tier: "Exalted",
    tierLevel: 4,
    name: "Coin Scent",
    effectSummary: "Increase raw gold drops from defeated monsters by 20%."
  },
  {
    id: "obsidian-sanctum-abyssal-shift",
    factionId: "obsidian-sanctum",
    tier: "Recognized",
    tierLevel: 1,
    name: "Abyssal Shift",
    effectSummary: "Access dark-matter portals that bypass long desert hikes."
  },
  {
    id: "obsidian-sanctum-void-born",
    factionId: "obsidian-sanctum",
    tier: "Trusted",
    tierLevel: 2,
    name: "Void-Born",
    effectSummary: "Reduce void-rot atmospheric status effects inside rifts by 50%."
  },
  {
    id: "obsidian-sanctum-chaos-catalyst",
    factionId: "obsidian-sanctum",
    tier: "Respected",
    tierLevel: 3,
    name: "Chaos Catalyst",
    effectSummary: "Increase magical spell critical rating by 8%."
  },
  {
    id: "obsidian-sanctum-soul-siphon",
    factionId: "obsidian-sanctum",
    tier: "Exalted",
    tierLevel: 4,
    name: "Soul Siphon",
    effectSummary: "Killing an enemy grants immediate cooldown recovery."
  },
  {
    id: "ashwood-glade-hunter-pathing",
    factionId: "ashwood-glade",
    tier: "Recognized",
    tierLevel: 1,
    name: "Hunter Pathing",
    effectSummary: "Unlock specialized tracking marks on the mini-map."
  },
  {
    id: "ashwood-glade-gland-salve",
    factionId: "ashwood-glade",
    tier: "Trusted",
    tierLevel: 2,
    name: "Gland Salve",
    effectSummary: "Reduce aggro detection distance of elite monstrous wolves by 30%."
  },
  {
    id: "ashwood-glade-primal-thorns",
    factionId: "ashwood-glade",
    tier: "Respected",
    tierLevel: 3,
    name: "Primal Thorns",
    effectSummary: "Melee attackers take 4% of their damage back as physical damage."
  },
  {
    id: "ashwood-glade-feral-rage",
    factionId: "ashwood-glade",
    tier: "Exalted",
    tierLevel: 4,
    name: "Feral Rage",
    effectSummary: "When health drops below 25%, gain 20% attack speed."
  },
  {
    id: "high-reach-peaks-wind-leap",
    factionId: "high-reach-peaks",
    tier: "Recognized",
    tierLevel: 1,
    name: "Wind Leap",
    effectSummary: "Access vertical updraft wind paths in high mountain areas."
  },
  {
    id: "high-reach-peaks-weightless",
    factionId: "high-reach-peaks",
    tier: "Trusted",
    tierLevel: 2,
    name: "Weightless",
    effectSummary: "Reduce fall damage by 80%."
  },
  {
    id: "high-reach-peaks-clear-mind",
    factionId: "high-reach-peaks",
    tier: "Respected",
    tierLevel: 3,
    name: "Clear Mind",
    effectSummary: "Reduce active mana consumption costs by 10%."
  },
  {
    id: "high-reach-peaks-nirvanic-breath",
    factionId: "high-reach-peaks",
    tier: "Exalted",
    tierLevel: 4,
    name: "Nirvanic Breath",
    effectSummary: "Add a double-jump action trigger to standard jumps."
  }
] as const satisfies readonly WorldReputationReward[];

export type WorldReputationRewardId = (typeof worldReputationRewards)[number]["id"];

export const worldReputationFactionMap: Record<WorldReputationFactionId, WorldReputationFaction> = indexUniqueBy(worldReputationFactions, (faction) => faction.id);

export const worldReputationRewardMap: Record<WorldReputationRewardId, WorldReputationReward> = indexUniqueBy(worldReputationRewards, (reward) => reward.id);

export const worldReputationRewardsByFaction: Record<WorldReputationFactionId, readonly WorldReputationReward[]> = groupByKey(worldReputationRewards, (reward) => reward.factionId);

export const worldReputationRewardsByTier: Record<WorldReputationRewardTier, readonly WorldReputationReward[]> = groupByKey(worldReputationRewards, (reward) => reward.tier);
