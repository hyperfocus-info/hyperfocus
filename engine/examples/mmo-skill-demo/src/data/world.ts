import { createTileMap, createTileset, tileToWorld, type TileMapMarker, type TileValue } from "@hyperfocus/engine";

export type LegacyRegionZoneId = "ashwood" | "crags" | "bazaar" | "port-marrow" | "dungeon" | "cottage";
export type ExpandedRegionZoneId = "holy-reach" | "canaan-desert" | "void-rift" | "ashwood-wilderness" | "whisperwind-ascent";
export type RegionZoneId = LegacyRegionZoneId | ExpandedRegionZoneId;
export type RegionAnchorKind = "town" | "resource" | "dungeon" | "endgame" | "home";
export type RegionChunkGrid = {
  chunksWide: number;
  chunksHigh: number;
  chunkWidth: number;
  chunkHeight: number;
};
export type RegionZoneConfig = {
  id: RegionZoneId;
  label: string;
  legacyZoneId: LegacyRegionZoneId;
  regionLabel: string;
  factionId?: string;
  factionLabel?: string;
  role: string;
  summary: string;
};
export type RegionAnchorConfig = {
  id: string;
  label: string;
  kind: RegionAnchorKind;
  zoneId: RegionZoneId;
  tileX: number;
  tileY: number;
  factionId?: string;
  factionLabel?: string;
  regionLabel?: string;
  instanceId?: string;
};
export type ResolvedRegionAnchor = RegionAnchorConfig & { x: number; y: number };
export type ResolvedRegionNpc = {
  id: string;
  kind: string;
  zoneId: RegionZoneId;
  authoredZoneId?: RegionZoneId;
  tileX: number;
  tileY: number;
  dialogTreeRef: string;
};
export type RegionNpcManifestEntry = Omit<ResolvedRegionNpc, "tileX" | "tileY"> & {
  anchorId: string;
  offsetX: number;
  offsetY: number;
};
export type RegionQuestManifestEntry = {
  id: string;
  anchorId: string;
  zoneId: RegionZoneId;
  summary: string;
};
export type RegionConfig = {
  id: string;
  revision: string;
  tileSize: number;
  chunkGrid: RegionChunkGrid;
  zones: readonly RegionZoneConfig[];
  anchors: readonly RegionAnchorConfig[];
  npcs: readonly RegionNpcManifestEntry[];
  quests: readonly RegionQuestManifestEntry[];
};

export const mmoSkillDemoTileIds = {
  grass: 0,
  path: 1,
  water: 2,
  tree: 3,
  ore: 4,
  rock: 5,
  bank: 6
} as const;

export const WORLD_MAP_SCALE = 2;

type TilePair = readonly [number, number];
type TileCluster = readonly TilePair[];

function scaledTile(value: number) {
  return value * WORLD_MAP_SCALE;
}

function scaledTilePairs(pairs: readonly TilePair[]): TileCluster {
  return pairs.map(([x, y]) => [scaledTile(x), scaledTile(y)] as const);
}

export const mmoSkillDemoRegionZones = [
  {
    id: "ashwood",
    label: "Ashwood Glade",
    legacyZoneId: "ashwood",
    regionLabel: "Starter Forest",
    factionId: "sylvan-concord",
    factionLabel: "The Sylvan Concord",
    role: "starter",
    summary: "Oakhaven's living forest, early tool loop, wolf pressure, and Nature Core worship."
  },
  {
    id: "crags",
    label: "Iron Crags",
    legacyZoneId: "crags",
    regionLabel: "Volcanic Quarry",
    factionId: "vulcan-guild",
    factionLabel: "The Vulcan Guild",
    role: "forge",
    summary: "Ironcrag's quarry, geothermal smelting, ore routes, and mechanical pressure."
  },
  {
    id: "port-marrow",
    label: "Port Marrow",
    legacyZoneId: "port-marrow",
    regionLabel: "Deepwater Port",
    factionId: "free-cove",
    factionLabel: "The Free Cove",
    role: "harbor",
    summary: "A free harbor of docks, salvage, smuggling routes, and oath-bound captains."
  },
  {
    id: "holy-reach",
    label: "Holy Reach",
    legacyZoneId: "port-marrow",
    regionLabel: "White Stone Citadel",
    factionId: "archon-order",
    factionLabel: "The Archon Order",
    role: "citadel",
    summary: "Aetheria's radiant citadel, law-bound farms, archives, and theocratic authority."
  },
  {
    id: "canaan-desert",
    label: "Canaan Desert",
    legacyZoneId: "bazaar",
    regionLabel: "Arid Ruins",
    factionId: "dust-syndicate",
    factionLabel: "The Dust Syndicate",
    role: "market",
    summary: "The Sunken Bazaar's canyon vaults, wells, trade routes, and relic economy."
  },
  {
    id: "void-rift",
    label: "Void Rift",
    legacyZoneId: "bazaar",
    regionLabel: "Obsidian Gate",
    factionId: "nihil-sect",
    factionLabel: "The Nihil Sect",
    role: "endgame",
    summary: "Obsidian geometry around a gravity well where void essence corrupts matter."
  },
  {
    id: "ashwood-wilderness",
    label: "Ashwood Wilderness",
    legacyZoneId: "ashwood",
    regionLabel: "Deep Primeval Forest",
    factionId: "verdant-outcasts",
    factionLabel: "The Verdant Outcasts",
    role: "wilds",
    summary: "Primeval hunting ground where the Verdant Outcasts reject tame forest symbiosis."
  },
  {
    id: "whisperwind-ascent",
    label: "Whisperwind Ascent",
    legacyZoneId: "crags",
    regionLabel: "Cloud Peaks",
    factionId: "ascetics-of-sky",
    factionLabel: "The Ascetics of Sky",
    role: "peaks",
    summary: "High mountain temples, wind paths, self-mastery trials, and archive guardians."
  },
  {
    id: "dungeon",
    label: "Dungeon Instance",
    legacyZoneId: "dungeon",
    regionLabel: "Instanced Boss Space",
    role: "instance",
    summary: "Private combat instance for bosses, support adds, power nodes, and relic checks."
  },
  {
    id: "cottage",
    label: "Cottage Instance",
    legacyZoneId: "cottage",
    regionLabel: "Private Rest Space",
    role: "home",
    summary: "Private utility instance for banking, innkeeping, and recovery."
  }
] as const satisfies readonly RegionZoneConfig[];

const mmoSkillDemoRegionZoneById = new Map<RegionZoneId, RegionZoneConfig>(mmoSkillDemoRegionZones.map((zone) => [zone.id, zone]));

export const mmoSkillDemoRegionConfig: RegionConfig = {
  id: "mmo-skill-demo-world",
  revision: "mmo-skill-demo-local-world-v4",
  tileSize: 32,
  chunkGrid: { chunksWide: 10, chunksHigh: 1, chunkWidth: scaledTile(64), chunkHeight: scaledTile(36) },
  zones: mmoSkillDemoRegionZones,
  anchors: [
    { id: "oakhaven", label: "Oakhaven (Sylvan Concord)", kind: "town", zoneId: "ashwood", tileX: scaledTile(52), tileY: scaledTile(28), factionId: "sylvan-concord", factionLabel: "The Sylvan Concord", regionLabel: "Ashwood Glade" },
    { id: "ironcrag", label: "Ironcrag (Vulcan Guild)", kind: "town", zoneId: "crags", tileX: scaledTile(12), tileY: scaledTile(7), factionId: "vulcan-guild", factionLabel: "The Vulcan Guild", regionLabel: "Iron Crags" },
    { id: "aetheria", label: "Aetheria (Archon Order)", kind: "town", zoneId: "holy-reach", tileX: scaledTile(160), tileY: scaledTile(20), factionId: "archon-order", factionLabel: "The Archon Order", regionLabel: "Holy Reach" },
    { id: "port-marrow", label: "Port Marrow (Free Cove)", kind: "town", zoneId: "port-marrow", tileX: scaledTile(126), tileY: scaledTile(27), factionId: "free-cove", factionLabel: "The Free Cove", regionLabel: "Deepwater Port" },
    { id: "ashwood-glade", label: "Ashwood Glade (Verdant Outcasts)", kind: "town", zoneId: "ashwood-wilderness", tileX: scaledTile(82), tileY: scaledTile(10), factionId: "verdant-outcasts", factionLabel: "The Verdant Outcasts", regionLabel: "Ashwood Wilderness" },
    { id: "high-reach-peaks", label: "High-Reach Peaks (Ascetics of Sky)", kind: "town", zoneId: "whisperwind-ascent", tileX: scaledTile(202), tileY: scaledTile(7), factionId: "ascetics-of-sky", factionLabel: "The Ascetics of Sky", regionLabel: "Whisperwind Ascent" },
    { id: "sunken-bazaar", label: "Sunken Bazaar (Dust Syndicate)", kind: "town", zoneId: "canaan-desert", tileX: scaledTile(230), tileY: scaledTile(27), factionId: "dust-syndicate", factionLabel: "The Dust Syndicate", regionLabel: "Canaan Desert" },
    { id: "obsidian-sanctum", label: "Obsidian Sanctum (Nihil Sect)", kind: "endgame", zoneId: "void-rift", tileX: scaledTile(316), tileY: scaledTile(15), factionId: "nihil-sect", factionLabel: "The Nihil Sect", regionLabel: "Void Rift" },
    { id: "overgrown-thicket", label: "Overgrown Thicket", kind: "dungeon", zoneId: "ashwood", tileX: scaledTile(44), tileY: scaledTile(18), factionId: "sylvan-concord", factionLabel: "The Sylvan Concord", regionLabel: "Ashwood Glade", instanceId: "overgrown-thicket" },
    { id: "deep-fissure", label: "Deep Fissure", kind: "dungeon", zoneId: "crags", tileX: scaledTile(18), tileY: scaledTile(18), factionId: "vulcan-guild", factionLabel: "The Vulcan Guild", regionLabel: "Iron Crags", instanceId: "deep-fissure" },
    { id: "sunken-spire", label: "Sunken Spire (Dust Vault)", kind: "dungeon", zoneId: "canaan-desert", tileX: scaledTile(246), tileY: scaledTile(24), factionId: "dust-syndicate", factionLabel: "The Dust Syndicate", regionLabel: "Canaan Desert", instanceId: "sunken-spire" },
    { id: "void-rift", label: "Void Rift (Obsidian Gate)", kind: "endgame", zoneId: "void-rift", tileX: scaledTile(300), tileY: scaledTile(8), factionId: "nihil-sect", factionLabel: "The Nihil Sect", regionLabel: "Void Rift", instanceId: "void-rift" }
  ],
  npcs: [
    { id: "oakhaven.elder-rowan", kind: "elder-rowan", zoneId: "ashwood", anchorId: "oakhaven", offsetX: -2, offsetY: -1, dialogTreeRef: "elder-rowan.starter" },
    { id: "oakhaven.blacksmith-silas", kind: "blacksmith-silas", zoneId: "ashwood", anchorId: "oakhaven", offsetX: 2, offsetY: 1, dialogTreeRef: "blacksmith-silas.forge" },
    { id: "oakhaven.miller-finn", kind: "miller-finn", zoneId: "ashwood", anchorId: "oakhaven", offsetX: -3, offsetY: 2, dialogTreeRef: "miller-finn.supplies" },
    { id: "oakhaven.scout-elara", kind: "scout-elara", zoneId: "ashwood", anchorId: "overgrown-thicket", offsetX: -2, offsetY: 2, dialogTreeRef: "scout-elara.thicket" },
    { id: "ashwood-glade.scout-elara", kind: "scout-elara", zoneId: "ashwood", authoredZoneId: "ashwood-wilderness", anchorId: "ashwood-glade", offsetX: -2, offsetY: 1, dialogTreeRef: "scout-elara.outcasts" },
    { id: "ironcrag.overseer-bale", kind: "overseer-bale", zoneId: "crags", anchorId: "ironcrag", offsetX: 2, offsetY: 1, dialogTreeRef: "overseer-bale.food" },
    { id: "ironcrag.blacksmith-silas", kind: "blacksmith-silas", zoneId: "crags", anchorId: "ironcrag", offsetX: -2, offsetY: -1, dialogTreeRef: "blacksmith-silas.vulcan" },
    { id: "ironcrag.geologist-mira", kind: "geologist-mira", zoneId: "crags", anchorId: "deep-fissure", offsetX: 3, offsetY: -2, dialogTreeRef: "geologist-mira.prism" },
    { id: "ironcrag.runner-kael", kind: "runner-kael", zoneId: "crags", anchorId: "ironcrag", offsetX: -2, offsetY: 2, dialogTreeRef: "runner-kael.pass" },
    { id: "aetheria.high-arcanist-vael", kind: "high-arcanist-vael", zoneId: "port-marrow", authoredZoneId: "holy-reach", anchorId: "aetheria", offsetX: -3, offsetY: -1, dialogTreeRef: "high-arcanist-vael.scripts" },
    { id: "aetheria.navigator-kai", kind: "navigator-kai", zoneId: "port-marrow", authoredZoneId: "holy-reach", anchorId: "aetheria", offsetX: 3, offsetY: -1, dialogTreeRef: "navigator-kai.tides" },
    { id: "aetheria.alchemist-zora", kind: "alchemist-zora", zoneId: "port-marrow", authoredZoneId: "holy-reach", anchorId: "aetheria", offsetX: -4, offsetY: 2, dialogTreeRef: "alchemist-zora.cloak" },
    { id: "port-marrow.captain-marrow", kind: "captain-marrow", zoneId: "port-marrow", anchorId: "port-marrow", offsetX: -1, offsetY: -2, dialogTreeRef: "captain-marrow.routes" },
    { id: "port-marrow.navigator-kai", kind: "navigator-kai", zoneId: "port-marrow", anchorId: "port-marrow", offsetX: 2, offsetY: -1, dialogTreeRef: "navigator-kai.currents" },
    { id: "sunken-bazaar.merchant-kaya", kind: "merchant-kaya", zoneId: "bazaar", authoredZoneId: "canaan-desert", anchorId: "sunken-bazaar", offsetX: -2, offsetY: -1, dialogTreeRef: "merchant-kaya.bazaar" },
    { id: "high-reach-peaks.master-kael", kind: "master-kael", zoneId: "crags", authoredZoneId: "whisperwind-ascent", anchorId: "high-reach-peaks", offsetX: -1, offsetY: 2, dialogTreeRef: "master-kael.ascetic" },
    { id: "obsidian-sanctum.alchemist-zora", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: -2, offsetY: 1, dialogTreeRef: "alchemist-zora.void" },
    { id: "obsidian-sanctum.cursed-statue", kind: "cursed-statue", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 2, offsetY: -1, dialogTreeRef: "cursed-statue.bargain" },
    { id: "oakhaven.root-gate-runner", kind: "runner-kael", zoneId: "ashwood", anchorId: "oakhaven", offsetX: 4, offsetY: -3, dialogTreeRef: "runner-kael.rootgate" },
    { id: "oakhaven.root-gate-board", kind: "contract-board", zoneId: "ashwood", anchorId: "oakhaven", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.rootgate" },
    { id: "oakhaven.root-gate-banker", kind: "banker-valerius", zoneId: "ashwood", anchorId: "oakhaven", offsetX: -4, offsetY: 3, dialogTreeRef: "banker-valerius.rootgate" },
    { id: "ironcrag.blast-wall-foreman", kind: "foreman-iron-will", zoneId: "crags", anchorId: "ironcrag", offsetX: 4, offsetY: -3, dialogTreeRef: "foreman-iron-will.blastwall" },
    { id: "ironcrag.blast-wall-board", kind: "contract-board", zoneId: "crags", anchorId: "ironcrag", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.blastwall" },
    { id: "ironcrag.blast-wall-banker", kind: "banker-valerius", zoneId: "crags", anchorId: "ironcrag", offsetX: -4, offsetY: 3, dialogTreeRef: "banker-valerius.blastwall" },
    { id: "aetheria.toll-wall-guardian", kind: "guardian-tariq", zoneId: "port-marrow", authoredZoneId: "holy-reach", anchorId: "aetheria", offsetX: 4, offsetY: -3, dialogTreeRef: "guardian-tariq.tollwall" },
    { id: "aetheria.toll-wall-board", kind: "contract-board", zoneId: "port-marrow", authoredZoneId: "holy-reach", anchorId: "aetheria", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.tollwall" },
    { id: "aetheria.toll-wall-banker", kind: "banker-valerius", zoneId: "port-marrow", authoredZoneId: "holy-reach", anchorId: "aetheria", offsetX: -4, offsetY: 3, dialogTreeRef: "banker-valerius.tollwall" },
    { id: "port-marrow.oath-gate-captain", kind: "captain-marrow", zoneId: "port-marrow", anchorId: "port-marrow", offsetX: 4, offsetY: -3, dialogTreeRef: "captain-marrow.oathgate" },
    { id: "port-marrow.oath-gate-board", kind: "contract-board", zoneId: "port-marrow", anchorId: "port-marrow", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.oathgate" },
    { id: "port-marrow.oath-gate-banker", kind: "banker-valerius", zoneId: "port-marrow", anchorId: "port-marrow", offsetX: -4, offsetY: 3, dialogTreeRef: "banker-valerius.oathgate" },
    { id: "ashwood-glade.thorn-fence-trainer", kind: "thorne-the-wild", zoneId: "ashwood", authoredZoneId: "ashwood-wilderness", anchorId: "ashwood-glade", offsetX: 4, offsetY: -3, dialogTreeRef: "thorne-the-wild.thornfence" },
    { id: "ashwood-glade.thorn-fence-board", kind: "contract-board", zoneId: "ashwood", authoredZoneId: "ashwood-wilderness", anchorId: "ashwood-glade", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.thornfence" },
    { id: "ashwood-glade.thorn-fence-runner", kind: "runner-kael", zoneId: "ashwood", authoredZoneId: "ashwood-wilderness", anchorId: "ashwood-glade", offsetX: -4, offsetY: 3, dialogTreeRef: "runner-kael.thornfence" },
    { id: "high-reach-peaks.wind-gate-guardian", kind: "guardian-tariq", zoneId: "crags", authoredZoneId: "whisperwind-ascent", anchorId: "high-reach-peaks", offsetX: 4, offsetY: -3, dialogTreeRef: "guardian-tariq.windgate" },
    { id: "high-reach-peaks.wind-gate-board", kind: "contract-board", zoneId: "crags", authoredZoneId: "whisperwind-ascent", anchorId: "high-reach-peaks", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.windgate" },
    { id: "high-reach-peaks.wind-gate-banker", kind: "banker-valerius", zoneId: "crags", authoredZoneId: "whisperwind-ascent", anchorId: "high-reach-peaks", offsetX: -4, offsetY: 3, dialogTreeRef: "banker-valerius.windgate" },
    { id: "sunken-bazaar.toll-gate-broker", kind: "broker-rex", zoneId: "bazaar", authoredZoneId: "canaan-desert", anchorId: "sunken-bazaar", offsetX: 4, offsetY: -3, dialogTreeRef: "broker-rex.tollgate" },
    { id: "sunken-bazaar.toll-gate-board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "canaan-desert", anchorId: "sunken-bazaar", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.tollgate" },
    { id: "sunken-bazaar.toll-gate-banker", kind: "banker-valerius", zoneId: "bazaar", authoredZoneId: "canaan-desert", anchorId: "sunken-bazaar", offsetX: -4, offsetY: 3, dialogTreeRef: "banker-valerius.tollgate" },
    { id: "obsidian-sanctum.pressure-wall-captain", kind: "captain-marrow", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 4, offsetY: -3, dialogTreeRef: "captain-marrow.pressurewall" },
    { id: "obsidian-sanctum.pressure-wall-board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 5, offsetY: 2, dialogTreeRef: "contract-board.pressurewall" },
    { id: "obsidian-sanctum.pressure-wall-alchemist", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: -4, offsetY: 3, dialogTreeRef: "alchemist-zora.pressurewall" },
    { id: "void-lane-5.captain", kind: "captain-marrow", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 16, offsetY: 8, dialogTreeRef: "captain-marrow.voidlane5" },
    { id: "void-lane-5.runner", kind: "runner-kael", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 40, offsetY: 16, dialogTreeRef: "runner-kael.voidlane5" },
    { id: "void-lane-5.board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 72, offsetY: 24, dialogTreeRef: "contract-board.voidlane5" },
    { id: "void-lane-5.alchemist", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 104, offsetY: 32, dialogTreeRef: "alchemist-zora.voidlane5" },
    { id: "void-lane-6.captain", kind: "captain-marrow", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 152, offsetY: -10, dialogTreeRef: "captain-marrow.voidlane6" },
    { id: "void-lane-6.runner", kind: "runner-kael", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 184, offsetY: 0, dialogTreeRef: "runner-kael.voidlane6" },
    { id: "void-lane-6.board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 216, offsetY: 12, dialogTreeRef: "contract-board.voidlane6" },
    { id: "void-lane-6.alchemist", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 248, offsetY: 24, dialogTreeRef: "alchemist-zora.voidlane6" },
    { id: "void-lane-7.captain", kind: "captain-marrow", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 280, offsetY: 8, dialogTreeRef: "captain-marrow.voidlane7" },
    { id: "void-lane-7.runner", kind: "runner-kael", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 312, offsetY: 16, dialogTreeRef: "runner-kael.voidlane7" },
    { id: "void-lane-7.board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 344, offsetY: 24, dialogTreeRef: "contract-board.voidlane7" },
    { id: "void-lane-7.alchemist", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 376, offsetY: 32, dialogTreeRef: "alchemist-zora.voidlane7" },
    { id: "void-lane-8.captain", kind: "captain-marrow", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 408, offsetY: -10, dialogTreeRef: "captain-marrow.voidlane8" },
    { id: "void-lane-8.runner", kind: "runner-kael", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 440, offsetY: 0, dialogTreeRef: "runner-kael.voidlane8" },
    { id: "void-lane-8.board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 472, offsetY: 12, dialogTreeRef: "contract-board.voidlane8" },
    { id: "void-lane-8.alchemist", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 504, offsetY: 24, dialogTreeRef: "alchemist-zora.voidlane8" },
    { id: "void-lane-9.captain", kind: "captain-marrow", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 536, offsetY: 8, dialogTreeRef: "captain-marrow.voidlane9" },
    { id: "void-lane-9.runner", kind: "runner-kael", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 568, offsetY: 16, dialogTreeRef: "runner-kael.voidlane9" },
    { id: "void-lane-9.board", kind: "contract-board", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 600, offsetY: 24, dialogTreeRef: "contract-board.voidlane9" },
    { id: "void-lane-9.alchemist", kind: "alchemist-zora", zoneId: "bazaar", authoredZoneId: "void-rift", anchorId: "obsidian-sanctum", offsetX: 632, offsetY: 32, dialogTreeRef: "alchemist-zora.voidlane9" }
  ],
  quests: [
    { id: "first-cut", anchorId: "oakhaven", zoneId: "ashwood", summary: "Cut Ash trees, return to Elder Rowan." },
    { id: "second-cut", anchorId: "oakhaven", zoneId: "ashwood", summary: "Stockpile extra Ash logs for Oakhaven." },
    { id: "wolf-culling", anchorId: "oakhaven", zoneId: "ashwood", summary: "Cull wolves near the Thicket." },
    { id: "final-cut", anchorId: "oakhaven", zoneId: "ashwood", summary: "Secure the road before registering the Captain's route." },
    { id: "heavy-lifting", anchorId: "ironcrag", zoneId: "crags", summary: "Bank Iron Ore with Valerius." },
    { id: "silent-sands", anchorId: "void-rift", zoneId: "void-rift", summary: "Survive Void Rift pressure." }
  ]
};

export const TILE = mmoSkillDemoRegionConfig.tileSize;
export const MAP_WIDTH = mmoSkillDemoRegionConfig.chunkGrid.chunksWide * mmoSkillDemoRegionConfig.chunkGrid.chunkWidth;
export const MAP_HEIGHT = mmoSkillDemoRegionConfig.chunkGrid.chunksHigh * mmoSkillDemoRegionConfig.chunkGrid.chunkHeight;

export const TILE_GRASS = mmoSkillDemoTileIds.grass;
export const TILE_PATH = mmoSkillDemoTileIds.path;
export const TILE_WATER = mmoSkillDemoTileIds.water;
export const TILE_TREE = mmoSkillDemoTileIds.tree;
export const TILE_ORE = mmoSkillDemoTileIds.ore;
export const TILE_ROCK = mmoSkillDemoTileIds.rock;
export const TILE_BANK = mmoSkillDemoTileIds.bank;

const ORE_CLUSTERS: readonly TileCluster[] = [
  scaledTilePairs([
    [11, 6],
    [13, 6],
    [12, 7],
    [15, 8],
    [13, 9],
    [10, 9]
  ]),
  scaledTilePairs([
    [17, 11],
    [19, 11],
    [18, 12],
    [20, 13],
    [16, 14],
    [19, 15]
  ]),
  scaledTilePairs([
    [6, 22],
    [8, 22],
    [7, 23],
    [10, 24],
    [5, 25],
    [8, 26]
  ]),
  scaledTilePairs([
    [14, 25],
    [16, 25],
    [15, 26],
    [18, 27],
    [13, 28],
    [17, 29]
  ]),
  scaledTilePairs([
    [326, 16],
    [328, 16],
    [327, 17],
    [330, 18],
    [325, 19],
    [329, 20]
  ]),
  scaledTilePairs([
    [364, 11],
    [366, 12],
    [365, 13],
    [368, 14],
    [363, 15],
    [367, 16]
  ]),
  scaledTilePairs([
    [396, 30],
    [398, 30],
    [397, 31],
    [400, 32],
    [395, 33],
    [399, 34]
  ]),
  scaledTilePairs([
    [428, 13],
    [430, 14],
    [429, 15],
    [432, 16],
    [427, 17],
    [431, 18]
  ]),
  scaledTilePairs([
    [486, 30],
    [488, 30],
    [487, 31],
    [490, 32],
    [485, 33],
    [489, 34]
  ]),
  scaledTilePairs([
    [534, 12],
    [536, 13],
    [535, 14],
    [538, 15],
    [533, 16],
    [537, 17]
  ]),
  scaledTilePairs([
    [588, 27],
    [590, 27],
    [589, 28],
    [592, 29],
    [587, 30],
    [591, 31]
  ])
];

const TREE_CLUSTERS: readonly TileCluster[] = [
  scaledTilePairs([
    [36, 6],
    [38, 6],
    [37, 7],
    [40, 8],
    [35, 9],
    [39, 10]
  ]),
  scaledTilePairs([
    [41, 11],
    [37, 12],
    [40, 13],
    [42, 14],
    [38, 15],
    [41, 16]
  ]),
  scaledTilePairs([
    [38, 23],
    [40, 23],
    [39, 24],
    [42, 25],
    [37, 26],
    [41, 27]
  ]),
  scaledTilePairs([
    [34, 26],
    [36, 27],
    [35, 28],
    [38, 29],
    [33, 30],
    [37, 31]
  ]),
  scaledTilePairs([
    [132, 12],
    [134, 12],
    [133, 13],
    [136, 14],
    [131, 15],
    [135, 16]
  ]),
  scaledTilePairs([
    [176, 28],
    [178, 28],
    [177, 29],
    [180, 30],
    [175, 31],
    [179, 32]
  ]),
  scaledTilePairs([
    [322, 27],
    [324, 27],
    [323, 28],
    [326, 29],
    [321, 30],
    [325, 31]
  ]),
  scaledTilePairs([
    [470, 19],
    [472, 20],
    [471, 21],
    [474, 22],
    [469, 23],
    [473, 24]
  ]),
  scaledTilePairs([
    [560, 18],
    [562, 18],
    [561, 19],
    [564, 20],
    [559, 21],
    [563, 22]
  ])
];

const ROCK_OUTCROPS: readonly TileCluster[] = [
  scaledTilePairs([
    [3, 5],
    [4, 6],
    [3, 7],
    [6, 8]
  ]),
  scaledTilePairs([
    [19, 4],
    [21, 5],
    [20, 6],
    [18, 7]
  ]),
  scaledTilePairs([
    [4, 28],
    [6, 29],
    [5, 30],
    [8, 31]
  ]),
  scaledTilePairs([
    [48, 22],
    [50, 22],
    [49, 23],
    [52, 24]
  ]),
  scaledTilePairs([
    [58, 14],
    [60, 15],
    [59, 16],
    [56, 17]
  ]),
  scaledTilePairs([
    [50, 30],
    [52, 30],
    [51, 31],
    [54, 32]
  ]),
  scaledTilePairs([
    [320, 9],
    [322, 10],
    [321, 11],
    [324, 12]
  ]),
  scaledTilePairs([
    [350, 28],
    [352, 28],
    [351, 29],
    [354, 30]
  ]),
  scaledTilePairs([
    [406, 17],
    [408, 18],
    [407, 19],
    [410, 20]
  ]),
  scaledTilePairs([
    [452, 28],
    [454, 29],
    [453, 30],
    [456, 31]
  ]),
  scaledTilePairs([
    [504, 15],
    [506, 16],
    [505, 17],
    [508, 18]
  ]),
  scaledTilePairs([
    [548, 30],
    [550, 30],
    [549, 31],
    [552, 32]
  ]),
  scaledTilePairs([
    [610, 14],
    [612, 15],
    [611, 16],
    [614, 17]
  ])
];

const SUNKEN_POOLS: readonly TilePair[] = scaledTilePairs([
  [151, 24],
  [152, 24],
  [151, 25],
  [205, 28],
  [206, 28],
  [205, 29],
  [322, 32],
  [323, 32],
  [322, 33],
  [384, 31],
  [385, 31],
  [384, 32],
  [450, 32],
  [451, 32],
  [450, 33],
  [516, 31],
  [517, 31],
  [516, 32],
  [588, 32],
  [589, 32],
  [588, 33],
  [628, 34],
  [629, 34],
  [628, 35]
]);

function indexOf(x: number, y: number) {
  return y * MAP_WIDTH + x;
}

function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

function setTile(tiles: TileValue[], x: number, y: number, tile: TileValue) {
  if (inBounds(x, y)) tiles[indexOf(x, y)] = tile;
}

function brush(tiles: TileValue[], x: number, y: number, radius: number, tile: TileValue) {
  for (let ty = y - radius; ty <= y + radius; ty += 1) {
    for (let tx = x - radius; tx <= x + radius; tx += 1) setTile(tiles, tx, ty, tile);
  }
}

function carvePath(tiles: TileValue[], from: { x: number; y: number }, to: { x: number; y: number }, radius = 1) {
  let x = from.x;
  let y = from.y;
  while (x !== to.x || y !== to.y) {
    brush(tiles, x, y, radius, TILE_PATH);
    if (x !== to.x) x += Math.sign(to.x - x);
    else y += Math.sign(to.y - y);
  }
  brush(tiles, to.x, to.y, radius, TILE_PATH);
}

export function resolveRegionAnchors(config: RegionConfig = mmoSkillDemoRegionConfig): ResolvedRegionAnchor[] {
  return config.anchors.map((anchor) => ({ ...anchor, x: anchor.tileX, y: anchor.tileY }));
}

export function getMmoSkillDemoAnchorTile(anchorId: string) {
  const anchor = resolveRegionAnchors().find((candidate) => candidate.id === anchorId);
  if (!anchor) throw new Error(`Unknown MMO Skill Demo anchor: ${anchorId}`);
  return { x: anchor.x, y: anchor.y };
}

export function buildMmoSkillDemoAnchorSpecs(config: RegionConfig = mmoSkillDemoRegionConfig) {
  return resolveRegionAnchors(config).map((anchor) => ({
    id: anchor.id,
    type: "anchor",
    tileX: anchor.x,
    tileY: anchor.y,
    tile: TILE_PATH,
    metadata: {
      legacyZoneId: mmoSkillDemoRegionZoneById.get(anchor.zoneId)?.legacyZoneId ?? anchor.zoneId,
      zoneLabel: mmoSkillDemoRegionZoneById.get(anchor.zoneId)?.label ?? anchor.zoneId,
      zoneRole: mmoSkillDemoRegionZoneById.get(anchor.zoneId)?.role,
      anchorId: anchor.id,
      label: anchor.label,
      kind: anchor.kind,
      zoneId: anchor.zoneId,
      factionId: anchor.factionId,
      factionLabel: anchor.factionLabel,
      regionLabel: anchor.regionLabel,
      instanceId: anchor.instanceId
    }
  }));
}

export function resolveMmoSkillDemoNpcSpawns(config: RegionConfig = mmoSkillDemoRegionConfig): ResolvedRegionNpc[] {
  const anchors = new Map(resolveRegionAnchors(config).map((anchor) => [anchor.id, anchor]));
  return config.npcs.map((npc) => {
    const anchor = anchors.get(npc.anchorId);
    if (!anchor) throw new Error(`Unknown NPC anchor: ${npc.anchorId}`);
    return {
      id: npc.id,
      kind: npc.kind,
      zoneId: npc.zoneId,
      authoredZoneId: npc.authoredZoneId ?? anchor.zoneId,
      tileX: anchor.x + npc.offsetX,
      tileY: anchor.y + npc.offsetY,
      dialogTreeRef: npc.dialogTreeRef
    };
  });
}

export function buildMmoSkillDemoNpcMarkers(config: RegionConfig = mmoSkillDemoRegionConfig): TileMapMarker[] {
  return resolveMmoSkillDemoNpcSpawns(config).map((npc) => ({
    type: "npc",
    tileX: npc.tileX,
    tileY: npc.tileY,
    x: npc.tileX * TILE + TILE * 0.5,
    y: npc.tileY * TILE + TILE * 0.5,
    layer: "ground",
    metadata: {
      spawnId: npc.id,
      kind: npc.kind,
      zoneId: npc.zoneId,
      legacyZoneId: mmoSkillDemoRegionZoneById.get(npc.zoneId)?.legacyZoneId ?? npc.zoneId,
      authoredZoneId: npc.authoredZoneId,
      zoneLabel: mmoSkillDemoRegionZoneById.get(npc.authoredZoneId ?? npc.zoneId)?.label ?? npc.zoneId,
      dialogTreeRef: npc.dialogTreeRef
    }
  }));
}

export function authoredZoneForMmoSkillDemoTile(tileX: number, tileY: number): RegionZoneId {
  if (tileX < scaledTile(24)) return "crags";
  if (tileX < scaledTile(72)) return "ashwood";
  if (tileX < scaledTile(96)) return tileY < scaledTile(22) ? "ashwood-wilderness" : "ashwood";
  if (tileX < scaledTile(146)) return "port-marrow";
  if (tileX < scaledTile(184)) return "holy-reach";
  if (tileX < scaledTile(224)) return "whisperwind-ascent";
  if (tileX < scaledTile(280)) return "canaan-desert";
  return "void-rift";
}

export function zoneForMmoSkillDemoTile(tileX: number, tileY: number): LegacyRegionZoneId {
  return mmoSkillDemoRegionZoneById.get(authoredZoneForMmoSkillDemoTile(tileX, tileY))?.legacyZoneId ?? "ashwood";
}

export function buildMmoSkillDemoRegionTiles(config: RegionConfig = mmoSkillDemoRegionConfig) {
  const tiles = new Array<TileValue>(MAP_WIDTH * MAP_HEIGHT).fill(TILE_GRASS);
  for (let x = 0; x < MAP_WIDTH; x += 1) {
    setTile(tiles, x, 0, TILE_WATER);
    setTile(tiles, x, MAP_HEIGHT - 1, TILE_WATER);
  }
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    setTile(tiles, 0, y, TILE_WATER);
    setTile(tiles, MAP_WIDTH - 1, y, TILE_WATER);
  }

  const anchors = resolveRegionAnchors(config);
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const pathPairs = [
    ["ironcrag", "deep-fissure"],
    ["deep-fissure", "oakhaven"],
    ["oakhaven", "overgrown-thicket"],
    ["oakhaven", "ashwood-glade"],
    ["oakhaven", "aetheria"],
    ["aetheria", "port-marrow"],
    ["aetheria", "high-reach-peaks"],
    ["port-marrow", "sunken-bazaar"],
    ["sunken-bazaar", "sunken-spire"],
    ["aetheria", "sunken-spire"],
    ["sunken-spire", "void-rift"],
    ["void-rift", "obsidian-sanctum"]
  ] as const;
  for (const [fromId, toId] of pathPairs) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (from && to) carvePath(tiles, from, to, fromId === "oakhaven" && toId === "aetheria" ? 2 : 1);
  }
  for (const anchor of anchors) brush(tiles, anchor.x, anchor.y, 2, anchor.kind === "town" ? TILE_BANK : TILE_PATH);

  for (const cluster of ORE_CLUSTERS) for (const [x, y] of cluster) setTile(tiles, x, y, TILE_ORE);
  for (const cluster of TREE_CLUSTERS) for (const [x, y] of cluster) setTile(tiles, x, y, TILE_TREE);
  for (const cluster of ROCK_OUTCROPS) for (const [x, y] of cluster) setTile(tiles, x, y, TILE_ROCK);
  for (const [x, y] of SUNKEN_POOLS) brush(tiles, x, y, 1, TILE_WATER);

  return tiles;
}

export function createMmoSkillDemoTileset() {
  return createTileset({
    tileSize: TILE,
    tileCount: 7,
    tiles: [
      { id: TILE_GRASS, name: "grass", tags: ["walkable"] },
      { id: TILE_PATH, name: "path", tags: ["walkable", "path"] },
      { id: TILE_WATER, name: "water", tags: ["solid", "water"], solid: true, collision: true },
      { id: TILE_TREE, name: "tree", tags: ["solid", "resource", "tree"], solid: true, collision: true },
      { id: TILE_ORE, name: "ore", tags: ["solid", "resource", "ore"], solid: true, collision: true },
      { id: TILE_ROCK, name: "rock", tags: ["solid", "rock"], solid: true, collision: true },
      { id: TILE_BANK, name: "bank", tags: ["walkable", "bank"] }
    ]
  });
}

export function buildMmoSkillDemoMap() {
  return createTileMap({
    tileset: createMmoSkillDemoTileset(),
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tileWidth: TILE,
    tileHeight: TILE,
    layers: [{ id: "ground", tiles: buildMmoSkillDemoRegionTiles() }],
    markers: [
      ...buildMmoSkillDemoAnchorSpecs().map<TileMapMarker>((anchor) => ({
        type: "anchor",
        tileX: anchor.tileX,
        tileY: anchor.tileY,
        x: (anchor.tileX ?? 0) * TILE + TILE * 0.5,
        y: (anchor.tileY ?? 0) * TILE + TILE * 0.5,
        layer: "ground",
        metadata: anchor.metadata
      })),
      ...buildMmoSkillDemoNpcMarkers()
    ],
    outOfBoundsTile: TILE_WATER,
    metadata: {
      revision: mmoSkillDemoRegionConfig.revision,
      players: 20,
      regionConfigId: mmoSkillDemoRegionConfig.id,
      chunkGrid: mmoSkillDemoRegionConfig.chunkGrid
    }
  });
}

export function tileCenter(tileX: number, tileY: number) {
  return tileToWorld(buildMmoSkillDemoMap(), tileX, tileY, "center");
}
