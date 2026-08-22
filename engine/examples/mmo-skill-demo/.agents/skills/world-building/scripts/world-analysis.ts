import {
  buildMmoSkillDemoRegionTiles,
  mmoSkillDemoRegionConfig,
  mmoSkillDemoTileIds,
  authoredZoneForMmoSkillDemoTile,
  resolveMmoSkillDemoNpcSpawns
} from "../../../../src/data/world.ts";
import { worldLandmarkPlacements, type WorldLandmarkKind } from "../../../../src/data/world-landmarks.ts";

export type HeatBand = "sparse" | "balanced" | "dense";
export type BandFilter = HeatBand | "all";

export type ZoneSlice = {
  id: string;
  tiles: number;
  pct: number;
};

export type NearbyAnchor = {
  id: string;
  label: string;
  zoneId: string;
  distanceTiles: number;
  direction: string;
};

export type ChunkScore = {
  index: number;
  id: string;
  chunkX: number;
  chunkY: number;
  xRange: string;
  yRange: string;
  zones: ZoneSlice[];
  anchors: string[];
  npcCount: number;
  landmarkCount: number;
  landmarkKinds: Partial<Record<WorldLandmarkKind | "unknown", number>>;
  serviceCount: number;
  resourceTiles: number;
  pathTiles: number;
  waterTiles: number;
  score: number;
  components: Record<string, number>;
  normalized: number;
  band: HeatBand;
  nearbyAnchors: NearbyAnchor[];
  why: string;
  recommendation: string;
  questHooks: string[];
  relocationTargets: string[];
};

export type WorldAnalysis = {
  generatedAt: string;
  map: {
    revision: string;
    chunksWide: number;
    chunksHigh: number;
    chunkWidth: number;
    chunkHeight: number;
  };
  thresholds: {
    sparseZ: number;
    denseZ: number;
  };
  averageScore: number;
  standardDeviation: number;
  chunks: ChunkScore[];
  totals: Record<HeatBand, number>;
};

export type AnalyzeOptions = {
  sparseZ?: number;
  denseZ?: number;
};

export type ChunkFilter = {
  band?: BandFilter;
  zone?: string;
  chunk?: string;
  top?: number;
  sort?: "chunk" | "priority";
};

export type ZoneContentCatalog = {
  additions: string[];
  spread: string[];
  questHooks: string[];
  factions: string[];
  assets: {
    image: string;
    visualId: string;
    kind: WorldLandmarkKind;
    service: string;
    glyph: string;
    width: number;
    height: number;
  }[];
  craftpixSearch: string[];
};

const config = mmoSkillDemoRegionConfig;
const grid = config.chunkGrid;
const mapWidth = grid.chunksWide * grid.chunkWidth;

export function analyzeWorld(options: AnalyzeOptions = {}): WorldAnalysis {
  const sparseZ = options.sparseZ ?? -0.75;
  const denseZ = options.denseZ ?? 0.9;
  const chunks = buildChunkScores();
  const average = averageOf(chunks.map((chunk) => chunk.score));
  const deviation = standardDeviation(chunks.map((chunk) => chunk.score), average) || 1;

  for (const chunk of chunks) {
    chunk.normalized = Number(((chunk.score - average) / deviation).toFixed(2));
    chunk.band = chunk.normalized <= sparseZ ? "sparse" : chunk.normalized >= denseZ ? "dense" : "balanced";
  }

  for (const chunk of chunks) {
    chunk.relocationTargets = relocationTargetsFor(chunk, chunks);
    chunk.why = whyFor(chunk);
    chunk.recommendation = recommendationFor(chunk);
    chunk.questHooks = questHooksFor(chunk);
  }

  return {
    generatedAt: new Date().toISOString(),
    map: {
      revision: config.revision,
      chunksWide: grid.chunksWide,
      chunksHigh: grid.chunksHigh,
      chunkWidth: grid.chunkWidth,
      chunkHeight: grid.chunkHeight
    },
    thresholds: { sparseZ, denseZ },
    averageScore: Number(average.toFixed(2)),
    standardDeviation: Number(deviation.toFixed(2)),
    chunks,
    totals: {
      sparse: chunks.filter((chunk) => chunk.band === "sparse").length,
      balanced: chunks.filter((chunk) => chunk.band === "balanced").length,
      dense: chunks.filter((chunk) => chunk.band === "dense").length
    }
  };
}

export function filterChunks(chunks: ChunkScore[], filter: ChunkFilter = {}) {
  if (filter.top !== undefined && (!Number.isInteger(filter.top) || filter.top < 1)) {
    throw new Error("--top must be a positive integer.");
  }

  const band = filter.band ?? "all";
  let selected = chunks.filter((chunk) => {
    if (band !== "all" && chunk.band !== band) return false;
    if (filter.zone && !chunk.zones.some((zone) => zone.id === filter.zone)) return false;
    if (filter.chunk && filter.chunk !== String(chunk.index) && filter.chunk !== chunk.id) return false;
    return true;
  });

  if (filter.sort === "priority") {
    selected = [...selected].sort((left, right) => Math.abs(right.normalized) - Math.abs(left.normalized));
  }

  if (filter.top !== undefined) selected = selected.slice(0, filter.top);
  return selected;
}

export function withChunks(analysis: WorldAnalysis, chunks: ChunkScore[]): WorldAnalysis {
  return { ...analysis, chunks };
}

export function primaryZone(chunk: ChunkScore) {
  return chunk.zones[0]?.id ?? "unknown";
}

export function zoneTextFor(chunk: ChunkScore) {
  return chunk.zones
    .slice(0, 3)
    .map((zone) => `${zone.id} ${Math.round(zone.pct * 100)}%`)
    .join(", ");
}

export function topComponents(chunk: ChunkScore) {
  return Object.entries(chunk.components)
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ") || "no scored authored content";
}

export function catalogFor(zone: string): ZoneContentCatalog {
  const catalog: Record<string, ZoneContentCatalog> = {
    ashwood: {
      additions: ["watering hole", "scout blind", "forage pocket", "wolf trail", "rootway marker"],
      spread: ["outskirts grove", "hidden blind", "root tunnel", "forager hut"],
      questHooks: ["Track prey to a shared watering hole and decide whether Oakhaven protects or opens it.", "Recover scout markers from a wolf trail before the Thicket pressure spreads."],
      factions: ["Sylvan Concord", "Verdant Outcasts"],
      assets: [
        { image: "worldForestLuminousTree", visualId: "oakhaven", kind: "shrine", service: "rootway marker", glyph: "R", width: 58, height: 58 },
        { image: "worldForestLivingGazebo", visualId: "oakhaven", kind: "travel", service: "scout blind", glyph: "R", width: 54, height: 54 },
        { image: "worldForestRedMushroom", visualId: "oakhaven", kind: "resource", service: "forage pocket", glyph: "F", width: 34, height: 34 }
      ],
      craftpixSearch: ["forest watering hole game asset", "fantasy forest scout camp props", "root portal forest game asset"]
    },
    "ashwood-wilderness": {
      additions: ["hunt camp", "bone boundary", "den sign", "ambush trail", "prey crossing"],
      spread: ["hunter camp", "thorn camp edge", "pack lookout", "blood-rite marker"],
      questHooks: ["Prove strength by reading hunt signs without breaking Oakhaven's fragile border truce.", "Move overgrown predator signs away from the camp center into a readable ambush trail."],
      factions: ["Verdant Outcasts", "Sylvan Concord"],
      assets: [
        { image: "worldForestWolfIdol", visualId: "ashwood-glade", kind: "danger", service: "pack lookout", glyph: "!", width: 60, height: 60 },
        { image: "worldForestDragonIdol", visualId: "ashwood-glade", kind: "shrine", service: "blood rite", glyph: "B", width: 66, height: 66 },
        { image: "worldForestEntMan", visualId: "ashwood-glade", kind: "wild", service: "timber sign", glyph: "T", width: 64, height: 64 }
      ],
      craftpixSearch: ["fantasy hunter camp game asset", "bone boundary forest props", "wolf den game asset"]
    },
    crags: {
      additions: ["ore cart stop", "heat vent", "slag pool", "quota camp", "sealed shaft"],
      spread: ["satellite work yard", "ore route", "sealed shaft", "furnace vent"],
      questHooks: ["Secure a quota camp after surplus miners leave the guild hall.", "Trace stolen powder from a work yard to a Sapper-Goblin cache."],
      factions: ["Vulcan Guild", "Dust Syndicate"],
      assets: [
        { image: "worldGuildInteriorObjects", visualId: "ironcrag", kind: "craft", service: "ore cart stop", glyph: "F", width: 82, height: 82 },
        { image: "worldGuildCracks", visualId: "ironcrag", kind: "danger", service: "heat vent", glyph: "!", width: 92, height: 72 },
        { image: "worldCrystalYellow1", visualId: "ironcrag", kind: "resource", service: "prism seam", glyph: "G", width: 42, height: 42 }
      ],
      craftpixSearch: ["volcanic mine props game asset", "ore cart station game asset", "lava vent fantasy asset"]
    },
    "holy-reach": {
      additions: ["checkpoint", "archive marker", "tithe kiosk", "purifier patrol line", "contraband inspection"],
      spread: ["gate plaza", "satellite shrine", "archive annex", "patrol line"],
      questHooks: ["Audit a checkpoint where lawful travel protects pilgrims and punishes smugglers.", "Recover an archive marker before Purifier patrols seal the wrong route."],
      factions: ["Archon Order", "Free Cove"],
      assets: [
        { image: "worldHolyStatues", visualId: "aetheria", kind: "danger", service: "purifier checkpoint", glyph: "!", width: 138, height: 33 },
        { image: "worldHolyInteriorObjects", visualId: "aetheria", kind: "archive", service: "archive annex", glyph: "R", width: 84, height: 44 },
        { image: "worldCrystalBlue1", visualId: "aetheria", kind: "shrine", service: "radiant ward", glyph: "W", width: 46, height: 46 }
      ],
      craftpixSearch: ["holy checkpoint game asset", "fantasy archive props", "white stone shrine game asset"]
    },
    "port-marrow": {
      additions: ["skiff landing", "cargo spill", "broker table", "salvage crane", "smuggler watch"],
      spread: ["dock edge", "cargo shed", "skiff landing", "smuggler route"],
      questHooks: ["Escort cargo from a crowded market to a quieter skiff landing before a Cove oath is broken.", "Use a smuggler watch to avoid Aetherian route pressure."],
      factions: ["Free Cove", "Dust Syndicate", "Archon Order"],
      assets: [
        { image: "worldPortCraneTower", visualId: "port-marrow", kind: "travel", service: "salvage crane", glyph: "C", width: 88, height: 44 },
        { image: "worldPortCargoDetail", visualId: "port-marrow", kind: "trade", service: "cargo spill", glyph: "$", width: 54, height: 45 },
        { image: "worldPortTower", visualId: "port-marrow", kind: "travel", service: "smuggler watch", glyph: "T", width: 72, height: 36 }
      ],
      craftpixSearch: ["dock skiff landing game asset", "pirate cargo props", "harbor crane tower asset"]
    },
    "whisperwind-ascent": {
      additions: ["wind gate", "cliff step", "glider aery", "moss grove", "eagle thermal"],
      spread: ["upper ledge", "aery edge", "meditation court", "wind library path"],
      questHooks: ["Follow eagle thermals to prove movement discipline before unlocking a glider route.", "Move archive clutter into a wind library path that teaches ascent flow."],
      factions: ["Ascetics of Sky"],
      assets: [
        { image: "worldRuinsWhite3", visualId: "high-reach-peaks", kind: "travel", service: "wind gate", glyph: "T", width: 74, height: 74 },
        { image: "worldRuinsBlueGray5", visualId: "high-reach-peaks", kind: "travel", service: "cliff step", glyph: "^", width: 46, height: 46 },
        { image: "worldForestWhiteTree", visualId: "high-reach-peaks", kind: "shrine", service: "moss grove", glyph: "M", width: 72, height: 72 }
      ],
      craftpixSearch: ["mountain glider aery game asset", "wind gate fantasy prop", "white ruins cliff path asset"]
    },
    "canaan-desert": {
      additions: ["well", "relic table", "debt marker", "caravan shade", "jackal trail"],
      spread: ["vault approach", "well camp", "caravan edge", "debt checkpoint"],
      questHooks: ["Settle a debt marker at a well camp where survival and contract law collide.", "Recover appraised relics from a jackal-tracked caravan edge."],
      factions: ["Dust Syndicate", "Free Cove", "Nihil Sect"],
      assets: [
        { image: "worldDesertCactusCluster", visualId: "sunken-bazaar", kind: "resource", service: "well edge", glyph: "W", width: 58, height: 54 },
        { image: "worldRuinsSand1", visualId: "sunken-bazaar", kind: "archive", service: "relic table", glyph: "A", width: 54, height: 54 },
        { image: "worldDesertScaleDecor", visualId: "sunken-bazaar", kind: "trade", service: "debt marker", glyph: "=", width: 72, height: 78 }
      ],
      craftpixSearch: ["desert well game asset", "fantasy caravan shade props", "relic appraisal table game asset"]
    },
    "void-rift": {
      additions: ["rift bloom", "failed crossing", "gravity stone", "corrupted camp", "portal waymark", "rot-safe shelter"],
      spread: ["corruption pocket", "failed-crossing edge", "portal warning line", "rot shelter"],
      questHooks: ["Investigate a failed crossing and choose whether to stabilize the route or exploit its rot.", "Plant a portal waymark so lethal empty space reads as intentional Void travel pressure."],
      factions: ["Nihil Sect"],
      assets: [
        { image: "worldVoidRafflesia", visualId: "obsidian-sanctum", kind: "danger", service: "rift bloom", glyph: "!", width: 70, height: 56 },
        { image: "worldVoidBrokenBoat", visualId: "obsidian-sanctum", kind: "danger", service: "failed crossing", glyph: "X", width: 86, height: 103 },
        { image: "worldVoidLantern", visualId: "obsidian-sanctum", kind: "travel", service: "portal waymark", glyph: "T", width: 44, height: 50 }
      ],
      craftpixSearch: ["void portal warning game asset", "dark rift camp props", "corrupted shelter fantasy asset"]
    }
  };

  return (
    catalog[zone] ?? {
      additions: ["landmark", "route marker", "service fixture"],
      spread: ["adjacent chunk", "outskirts pocket", "instanced space"],
      questHooks: ["Add one local task only after the area has a clear world reason."],
      factions: [],
      assets: [],
      craftpixSearch: ["fantasy landmark game asset"]
    }
  );
}

function buildChunkScores(): ChunkScore[] {
  const tiles = buildMmoSkillDemoRegionTiles(config);
  const anchors = resolvedAnchors();
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const npcs = resolveMmoSkillDemoNpcSpawns(config);
  const chunks: ChunkScore[] = [];

  for (let chunkY = 0; chunkY < grid.chunksHigh; chunkY += 1) {
    for (let chunkX = 0; chunkX < grid.chunksWide; chunkX += 1) {
      const index = chunkY * grid.chunksWide + chunkX;
      const startX = chunkX * grid.chunkWidth;
      const endX = startX + grid.chunkWidth - 1;
      const startY = chunkY * grid.chunkHeight;
      const endY = startY + grid.chunkHeight - 1;
      const zoneCounts = new Map<string, number>();
      let resourceTiles = 0;
      let pathTiles = 0;
      let waterTiles = 0;

      for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
          const tile = tiles[y * mapWidth + x];
          const zone = authoredZoneForMmoSkillDemoTile(x, y);
          zoneCounts.set(zone, (zoneCounts.get(zone) ?? 0) + 1);
          if (tile === mmoSkillDemoTileIds.tree || tile === mmoSkillDemoTileIds.ore || tile === mmoSkillDemoTileIds.rock) resourceTiles += 1;
          else if (tile === mmoSkillDemoTileIds.path || tile === mmoSkillDemoTileIds.bank) pathTiles += 1;
          else if (tile === mmoSkillDemoTileIds.water) waterTiles += 1;
        }
      }

      const chunkAnchors = anchors.filter((anchor) => inChunk(anchor.tileX, anchor.tileY, startX, endX, startY, endY));
      const chunkNpcs = npcs.filter((npc) => inChunk(npc.tileX, npc.tileY, startX, endX, startY, endY));
      const chunkLandmarks = worldLandmarkPlacements.filter((landmark) => {
        const anchor = anchorById.get(landmark.anchorId);
        if (!anchor) return false;
        const tileX = anchor.tileX + landmark.dx / config.tileSize;
        const tileY = anchor.tileY + landmark.dy / config.tileSize;
        return inChunk(tileX, tileY, startX, endX, startY, endY);
      });
      const landmarkKinds = countLandmarkKinds(chunkLandmarks);
      const serviceCount = chunkLandmarks.filter((landmark) => landmark.service).length;
      const components = {
        anchors: chunkAnchors.length * 14,
        npcs: chunkNpcs.length * 7,
        landmarks: chunkLandmarks.length * 3.5,
        services: serviceCount * 2,
        resources: resourceTiles * 0.35,
        paths: pathTiles * 0.12,
        water: waterTiles * 0.04
      };
      const score = Object.values(components).reduce((sum, value) => sum + value, 0);
      const totalTiles = grid.chunkWidth * grid.chunkHeight;
      const zones = [...zoneCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([id, tilesInZone]) => ({ id, tiles: tilesInZone, pct: Number((tilesInZone / totalTiles).toFixed(2)) }));

      chunks.push({
        index,
        id: `${chunkX},${chunkY}`,
        chunkX,
        chunkY,
        xRange: `${startX}-${endX}`,
        yRange: `${startY}-${endY}`,
        zones,
        anchors: chunkAnchors.map((anchor) => anchor.id),
        npcCount: chunkNpcs.length,
        landmarkCount: chunkLandmarks.length,
        landmarkKinds,
        serviceCount,
        resourceTiles,
        pathTiles,
        waterTiles,
        score: Number(score.toFixed(2)),
        components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(2))])),
        normalized: 0,
        band: "balanced",
        nearbyAnchors: nearestAnchors(startX, endX, startY, endY),
        why: "",
        recommendation: "",
        questHooks: [],
        relocationTargets: []
      });
    }
  }

  return chunks;
}

function resolvedAnchors() {
  return config.anchors.map((anchor) => ({
    id: anchor.id,
    label: anchor.label,
    tileX: anchor.tileX,
    tileY: anchor.tileY,
    zoneId: anchor.zoneId,
    kind: anchor.kind
  }));
}

function inChunk(tileX: number, tileY: number, startX: number, endX: number, startY: number, endY: number) {
  return tileX >= startX && tileX <= endX && tileY >= startY && tileY <= endY;
}

function countLandmarkKinds(landmarks: readonly (typeof worldLandmarkPlacements)[number][]) {
  const counts: Partial<Record<WorldLandmarkKind | "unknown", number>> = {};
  for (const landmark of landmarks) {
    const kind = landmark.kind ?? "unknown";
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

function nearestAnchors(startX: number, endX: number, startY: number, endY: number): NearbyAnchor[] {
  const centerX = (startX + endX) / 2;
  const centerY = (startY + endY) / 2;
  return resolvedAnchors()
    .map((anchor) => {
      const dx = anchor.tileX - centerX;
      const dy = anchor.tileY - centerY;
      return {
        id: anchor.id,
        label: anchor.label,
        zoneId: anchor.zoneId,
        distanceTiles: Number(Math.hypot(dx, dy).toFixed(1)),
        direction: directionFor(dx, dy)
      };
    })
    .sort((left, right) => left.distanceTiles - right.distanceTiles)
    .slice(0, 3);
}

function directionFor(dx: number, dy: number) {
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return "inside";
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

function averageOf(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values: number[], average: number) {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
}

function whyFor(chunk: ChunkScore) {
  const zoneText = zoneTextFor(chunk);
  const componentText = topComponents(chunk);
  const nearest = chunk.nearbyAnchors[0];
  if (chunk.band === "sparse") {
    return `Sparse ${zoneText}: ${componentText}; nearest anchor ${nearest.id} is ${nearest.distanceTiles} tiles ${nearest.direction}. Treat as intentional travel space or add a readable cause.`;
  }
  if (chunk.band === "dense") {
    const targetText = chunk.relocationTargets.length > 0 ? ` Nearby lower-density targets: ${chunk.relocationTargets.join(", ")}.` : "";
    return `Dense ${zoneText}: ${componentText}; authored reads may compete.${targetText}`;
  }
  return `Balanced ${zoneText}: ${componentText}; improve only with local visual, gameplay, or lore evidence.`;
}

function recommendationFor(chunk: ChunkScore) {
  const zone = primaryZone(chunk);
  if (chunk.band === "dense") return denseRecommendation(zone, chunk);
  if (chunk.band === "sparse") return sparseRecommendation(zone, chunk);
  return "Leave stable unless nearby docs or screenshots show weak visual, gameplay, or lore read.";
}

function sparseRecommendation(zone: string, chunk: ChunkScore) {
  const additions = catalogFor(zone).additions.slice(0, 3).join(", ");
  const nearest = chunk.nearbyAnchors[0];
  return `Use ${nearest.id} as the nearest context anchor (${nearest.distanceTiles} tiles ${nearest.direction}), then add one local cause: ${additions}. Link it to a service, route, creature behavior, or future quest note.`;
}

function denseRecommendation(zone: string, chunk: ChunkScore) {
  const spread = catalogFor(zone).spread.slice(0, 3).join(", ");
  const target = chunk.relocationTargets[0] ? ` toward chunk ${chunk.relocationTargets[0]}` : "";
  return `Spread repeated roles${target}: ${spread}. Keep the core landmark identity, move duplicate service/noise outward.`;
}

function questHooksFor(chunk: ChunkScore) {
  if (chunk.band === "balanced") return [];
  return catalogFor(primaryZone(chunk)).questHooks.slice(0, 2);
}

function relocationTargetsFor(chunk: ChunkScore, allChunks: ChunkScore[]) {
  if (chunk.band !== "dense") return [];
  return allChunks
    .filter((candidate) => candidate.index !== chunk.index)
    .map((candidate) => ({ candidate, distance: Math.abs(candidate.chunkX - chunk.chunkX) + Math.abs(candidate.chunkY - chunk.chunkY) }))
    .filter((entry) => entry.distance <= 2 && entry.candidate.score < chunk.score * 0.65)
    .sort((left, right) => left.distance - right.distance || left.candidate.score - right.candidate.score)
    .slice(0, 3)
    .map((entry) => `${entry.candidate.index} (${entry.candidate.id})`);
}
