export type EntityVisualSize = Readonly<{
  width: number;
  height: number;
  scale: number;
  radius: number;
}>;

export type ResourceEntitySize = Readonly<{
  width: number;
  height: number;
  collisionRadius: number;
  interestRadius: number;
}>;

export const PLAYER_SIZE = {
  height: 35.2,
  width: 27.2,
  radius: 8.8
} as const;

export const HAZARD_SIZE = {
  lineWidth: 16,
  aoeRadius: 42,
  bossAoeRadius: 62,
  combatTextRadius: 26,
  bossCombatTextRadius: 42
} as const;

export const RESOURCE_SIZE_BY_KIND: Readonly<Record<string, ResourceEntitySize>> = {
  tree: { width: 56, height: 72, collisionRadius: 17, interestRadius: 24 },
  ore: { width: 34, height: 28, collisionRadius: 14, interestRadius: 19 },
  foraging: { width: 28, height: 28, collisionRadius: 11, interestRadius: 18 },
  quarrying: { width: 36, height: 30, collisionRadius: 14, interestRadius: 19 },
  fishing: { width: 34, height: 26, collisionRadius: 11, interestRadius: 18 },
  skinning: { width: 30, height: 26, collisionRadius: 11, interestRadius: 18 },
  "crop-harvesting": { width: 30, height: 30, collisionRadius: 11, interestRadius: 18 },
  scavenging: { width: 32, height: 30, collisionRadius: 12, interestRadius: 18 },
  "essence-siphoning": { width: 30, height: 34, collisionRadius: 11, interestRadius: 19 },
  apiculture: { width: 30, height: 34, collisionRadius: 11, interestRadius: 19 },
  "sap-tapping": { width: 30, height: 34, collisionRadius: 11, interestRadius: 19 },
  "spore-hunting": { width: 28, height: 28, collisionRadius: 11, interestRadius: 18 },
  dredging: { width: 32, height: 26, collisionRadius: 11, interestRadius: 18 },
  archaeology: { width: 34, height: 30, collisionRadius: 12, interestRadius: 18 },
  hunting: { width: 30, height: 28, collisionRadius: 11, interestRadius: 18 },
  gemology: { width: 34, height: 28, collisionRadius: 14, interestRadius: 19 },
  mining: { width: 34, height: 28, collisionRadius: 14, interestRadius: 19 },
  lumberjacking: { width: 56, height: 72, collisionRadius: 17, interestRadius: 24 },
  woodcutting: { width: 56, height: 72, collisionRadius: 17, interestRadius: 24 }
} as const;

export const NPC_DEFAULT_SIZE = { width: 34, height: 40, scale: 0.769, radius: 10 } as const;

export const NPC_SIZE_BY_ROLE: Readonly<Record<string, EntityVisualSize>> = {
  quest: { width: 27.2, height: 35.2, scale: 0.677, radius: 8.8 },
  trainer: { width: 29, height: 37, scale: 0.712, radius: 9 },
  bank: { width: 28, height: 36, scale: 0.692, radius: 9 },
  merchant: { width: 28, height: 35, scale: 0.673, radius: 9 },
  travel: { width: 29, height: 36, scale: 0.692, radius: 9 },
  contract: { width: 26, height: 34, scale: 0.654, radius: 8 },
  crafting: { width: 31, height: 38, scale: 0.731, radius: 10 },
  hidden: { width: 36, height: 48, scale: 0.923, radius: 12 },
  home: { width: 27, height: 35, scale: 0.673, radius: 9 },
  mob: NPC_DEFAULT_SIZE,
  elite: { width: 40, height: 46, scale: 0.885, radius: 14 },
  boss: { width: 74, height: 88, scale: 1.692, radius: 25 },
  "boss-node": { width: 24, height: 24, scale: 0.462, radius: 9 },
  decoy: { width: 24, height: 32, scale: 0.615, radius: 8 }
} as const;

export const NPC_SIZE_BY_KIND: Readonly<Record<string, EntityVisualSize>> = {
  "prowling-wolf": { width: 28, height: 18, scale: 0.346, radius: 7 },
  "alpha-timberwolf": { width: 36, height: 25, scale: 0.481, radius: 11 },
  "ashwood-alpha": { width: 38, height: 27, scale: 0.519, radius: 12 },
  "scavenger-jackal": { width: 24, height: 15, scale: 0.288, radius: 6 },
  "moss-grizzly": { width: 52, height: 48, scale: 0.923, radius: 16 },
  "high-peak-eagle": { width: 38, height: 16, scale: 0.308, radius: 7 },
  "iron-eye-bat": { width: 28, height: 12, scale: 0.231, radius: 6 },
  "calamity-bat": { width: 32, height: 13, scale: 0.25, radius: 6 },
  "marrow-cove-rat": { width: 14, height: 8, scale: 0.154, radius: 4 },
  "aggro-tree": { width: 56, height: 62, scale: 1.192, radius: 18 },
  "bramble-beast": { width: 44, height: 44, scale: 0.846, radius: 14 },
  "ash-bramble-stalker": { width: 34, height: 32, scale: 0.615, radius: 10 },
  "timber-goliath": { width: 76, height: 90, scale: 1.731, radius: 25 },
  "spore-pod": { width: 24, height: 24, scale: 0.462, radius: 9 },
  "gloom-weaver-spider": { width: 38, height: 27, scale: 0.519, radius: 10 },
  "crystal-beetle": { width: 38, height: 30, scale: 0.577, radius: 12 },
  "fissure-skitterer": { width: 34, height: 25, scale: 0.481, radius: 9 },
  "rust-biter": { width: 34, height: 27, scale: 0.519, radius: 11 },
  "dungeon-harvester": { width: 34, height: 28, scale: 0.538, radius: 10 },
  "soot-crab": { width: 40, height: 28, scale: 0.538, radius: 12 },
  "stone-crawler": { width: 38, height: 34, scale: 0.654, radius: 13 },
  "void-crawler": { width: 42, height: 38, scale: 0.731, radius: 13 },
  "tide-stalker": { width: 44, height: 34, scale: 0.654, radius: 12 },
  "abyssal-eel": { width: 44, height: 28, scale: 0.538, radius: 9 },
  "lava-spit-slime": { width: 26, height: 22, scale: 0.423, radius: 8 },
  "crag-sapper": { width: 26, height: 30, scale: 0.577, radius: 9 },
  "sapper-goblin": { width: 26, height: 30, scale: 0.577, radius: 9 },
  "cursed-archer": { width: 28, height: 35, scale: 0.673, radius: 9 },
  "ruins-archer": { width: 28, height: 34, scale: 0.654, radius: 9 },
  "mire-bomber": { width: 28, height: 33, scale: 0.635, radius: 9 },
  "rune-priest": { width: 29, height: 35, scale: 0.673, radius: 9 },
  "veil-oracle": { width: 30, height: 36, scale: 0.692, radius: 10 },
  "cursed-oracle": { width: 30, height: 36, scale: 0.692, radius: 10 },
  "ember-acolyte": { width: 29, height: 35, scale: 0.673, radius: 9 },
  "void-leper": { width: 28, height: 35, scale: 0.673, radius: 9 },
  "grave-stalker": { width: 34, height: 32, scale: 0.615, radius: 10 },
  "rift-leech": { width: 32, height: 26, scale: 0.5, radius: 9 },
  "sand-wraith": { width: 34, height: 40, scale: 0.769, radius: 10 },
  "tallow-wraith": { width: 36, height: 42, scale: 0.808, radius: 11 },
  "aether-drifter": { width: 32, height: 34, scale: 0.654, radius: 9 },
  "crystalline-strider": { width: 36, height: 44, scale: 0.846, radius: 12 },
  "spire-sentinel": { width: 38, height: 45, scale: 0.865, radius: 14 },
  "anointed-crusader": { width: 38, height: 44, scale: 0.846, radius: 14 },
  "bazaar-guard": { width: 36, height: 43, scale: 0.827, radius: 13 },
  "dungeon-revenant": { width: 38, height: 45, scale: 0.865, radius: 14 },
  "void-sent-sentinel": { width: 48, height: 56, scale: 1.077, radius: 17 },
  "crag-gargoyle": { width: 44, height: 48, scale: 0.923, radius: 16 },
  "void-gargoyle": { width: 48, height: 52, scale: 1, radius: 17 },
  "prism-golem": { width: 50, height: 58, scale: 1.115, radius: 18 },
  "void-amalgam": { width: 56, height: 62, scale: 1.192, radius: 19 },
  "great-ash-lord": { width: 74, height: 88, scale: 1.692, radius: 25 },
  "iron-core-golem": { width: 84, height: 96, scale: 1.846, radius: 28 },
  "mirror-king": { width: 68, height: 82, scale: 1.577, radius: 23 },
  "power-node": { width: 24, height: 24, scale: 0.462, radius: 9 },
  "glass-clone": { width: 30, height: 35, scale: 0.673, radius: 9 }
} as const;
