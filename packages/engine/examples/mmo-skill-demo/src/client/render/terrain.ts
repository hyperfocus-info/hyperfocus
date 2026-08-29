import { renderablePathCommand, renderableRecord, renderRecord, type PooledRenderCommand, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { factionZoneVisuals } from "../../data/assets.ts";
import { worldBiomeProps, worldLandmarkPlacements, type FactionVisualId } from "../../data/world-landmarks.ts";
import { getMmoSkillDemoAnchorTile } from "../../data/world.ts";
import { renderTerrainChunkToImage } from "../terrain-cache.ts";
import { hash, type ClientImages } from "../assets.ts";
import { MAP_HEIGHT, MAP_WIDTH, TILE, TILE_BANK, TILE_PATH, TILE_ROCK, TILE_WATER } from "../world.ts";
import type { Viewport } from "./types.ts";

export type TerrainPerfExperiment = "control" | "tile-call-cache" | "chunk-sprites";

const REGION_LABEL_SEEDS = [
  { label: "Oakhaven", anchorId: "oakhaven", visualId: "oakhaven" },
  { label: "Ironcrag", anchorId: "ironcrag", visualId: "ironcrag" },
  { label: "Aetheria", anchorId: "aetheria", visualId: "aetheria" },
  { label: "Port Marrow", anchorId: "port-marrow", visualId: "port-marrow" },
  { label: "Ashwood Glade", anchorId: "ashwood-glade", visualId: "ashwood-glade" },
  { label: "High-Reach Peaks", anchorId: "high-reach-peaks", visualId: "high-reach-peaks" },
  { label: "Sunken Bazaar", anchorId: "sunken-bazaar", visualId: "sunken-bazaar" },
  { label: "Obsidian Sanctum", anchorId: "obsidian-sanctum", visualId: "obsidian-sanctum" },
  { label: "Overgrown Thicket", anchorId: "overgrown-thicket", visualId: "oakhaven" },
  { label: "Deep Fissure", anchorId: "deep-fissure", visualId: "ironcrag" },
  { label: "Sunken Spire", anchorId: "sunken-spire", visualId: "sunken-bazaar" },
  { label: "Void Rift", anchorId: "void-rift", visualId: "obsidian-sanctum" }
] as const;

const TILE_RENDER_MARGIN = 2;
const REGION_LABELS: Array<{ label: string; anchorId: string; visualId: FactionVisualId; tile: { x: number; y: number } }> = [];
for (const entry of REGION_LABEL_SEEDS) {
  REGION_LABELS.push({ label: entry.label, anchorId: entry.anchorId, visualId: entry.visualId, tile: getMmoSkillDemoAnchorTile(entry.anchorId) });
}
const TERRAIN_PERF_EXPERIMENTS = new Set<TerrainPerfExperiment>(["control", "tile-call-cache", "chunk-sprites"]);
const TILE_CALL_CACHE_BY_TILES = new WeakMap<readonly number[], WeakMap<ClientImages, Map<string, readonly Renderable[]>>>();
const CHUNK_SIZE_TILES = 8;
const CHUNK_CACHE_LIMIT = 384;
type TerrainChunk = { image: CanvasImageSource; x: number; y: number; width: number; height: number };
const TERRAIN_CHUNK_CACHE_BY_TILES = new WeakMap<readonly number[], WeakMap<ClientImages, Map<string, TerrainChunk>>>();

declare global {
  var __mmoSkillDemoTerrainPerfExperiment: string | undefined;
  var __mmoSkillDemoTerrainPrewarm: { chunks: number; ms: number } | undefined;
}

function isTerrainPerfExperiment(value: unknown): value is TerrainPerfExperiment {
  return value === "control" || value === "tile-call-cache" || value === "chunk-sprites";
}

export function activeTerrainPerfExperiment(fallback: TerrainPerfExperiment = "control"): TerrainPerfExperiment {
  const value = globalThis.__mmoSkillDemoTerrainPerfExperiment;
  return isTerrainPerfExperiment(value) && TERRAIN_PERF_EXPERIMENTS.has(value) ? value : fallback;
}

function terrainExperimentEnabled(experiment: Exclude<TerrainPerfExperiment, "control">, active = activeTerrainPerfExperiment()) {
  return active === experiment;
}

function terrainTileCallCache(tiles: readonly number[], images: ClientImages) {
  let imageCaches = TILE_CALL_CACHE_BY_TILES.get(tiles);
  if (!imageCaches) {
    imageCaches = new WeakMap();
    TILE_CALL_CACHE_BY_TILES.set(tiles, imageCaches);
  }
  let cache = imageCaches.get(images);
  if (!cache) {
    cache = new Map();
    imageCaches.set(images, cache);
  }
  return cache;
}

function terrainChunkCache(tiles: readonly number[], images: ClientImages) {
  let imageCaches = TERRAIN_CHUNK_CACHE_BY_TILES.get(tiles);
  if (!imageCaches) {
    imageCaches = new WeakMap();
    TERRAIN_CHUNK_CACHE_BY_TILES.set(tiles, imageCaches);
  }
  let cache = imageCaches.get(images);
  if (!cache) {
    cache = new Map();
    imageCaches.set(images, cache);
  }
  return cache;
}

type ZoneTextureKind = "leaf" | "wild" | "ember" | "marble" | "dock" | "sand" | "void" | "sky";
type ZoneTerrainStyle = {
  ground: string;
  groundAlt: string;
  detail: string;
  detailSoft: string;
  path: string;
  pathAlt: string;
  pathEdge: string;
  pathMark: string;
  water: string;
  waterLine: string;
  texture: ZoneTextureKind;
};

const ZONE_TERRAIN_STYLES: Record<FactionVisualId, ZoneTerrainStyle> = {
  oakhaven: {
    ground: "#446f39",
    groundAlt: "#527f45",
    detail: "rgba(188, 228, 151, 0.24)",
    detailSoft: "rgba(35, 74, 38, 0.24)",
    path: "#94764d",
    pathAlt: "#aa8b57",
    pathEdge: "rgba(40, 57, 30, 0.36)",
    pathMark: "rgba(233, 204, 126, 0.24)",
    water: "#347f90",
    waterLine: "rgba(188, 237, 230, 0.35)",
    texture: "leaf"
  },
  "ashwood-glade": {
    ground: "#315f32",
    groundAlt: "#3e7840",
    detail: "rgba(126, 214, 109, 0.28)",
    detailSoft: "rgba(19, 58, 27, 0.3)",
    path: "#7d6040",
    pathAlt: "#936f43",
    pathEdge: "rgba(23, 42, 20, 0.42)",
    pathMark: "rgba(255, 139, 122, 0.2)",
    water: "#2f7486",
    waterLine: "rgba(134, 226, 201, 0.32)",
    texture: "wild"
  },
  ironcrag: {
    ground: "#554a32",
    groundAlt: "#655236",
    detail: "rgba(255, 143, 82, 0.28)",
    detailSoft: "rgba(36, 30, 25, 0.32)",
    path: "#6c5741",
    pathAlt: "#7a613e",
    pathEdge: "rgba(31, 24, 20, 0.44)",
    pathMark: "rgba(255, 179, 107, 0.24)",
    water: "#2b6172",
    waterLine: "rgba(255, 179, 107, 0.22)",
    texture: "ember"
  },
  aetheria: {
    ground: "#6f7b5b",
    groundAlt: "#818968",
    detail: "rgba(236, 241, 210, 0.28)",
    detailSoft: "rgba(91, 106, 91, 0.24)",
    path: "#9b9272",
    pathAlt: "#b3a782",
    pathEdge: "rgba(82, 78, 56, 0.36)",
    pathMark: "rgba(247, 241, 186, 0.32)",
    water: "#577f8d",
    waterLine: "rgba(207, 231, 255, 0.36)",
    texture: "marble"
  },
  "port-marrow": {
    ground: "#3d654e",
    groundAlt: "#456f5b",
    detail: "rgba(109, 226, 255, 0.24)",
    detailSoft: "rgba(29, 61, 53, 0.3)",
    path: "#756646",
    pathAlt: "#8d794e",
    pathEdge: "rgba(24, 52, 50, 0.38)",
    pathMark: "rgba(109, 226, 255, 0.23)",
    water: "#2d768f",
    waterLine: "rgba(124, 229, 255, 0.42)",
    texture: "dock"
  },
  "sunken-bazaar": {
    ground: "#6e6238",
    groundAlt: "#7f713f",
    detail: "rgba(244, 211, 107, 0.22)",
    detailSoft: "rgba(72, 53, 25, 0.24)",
    path: "#9b7449",
    pathAlt: "#b48755",
    pathEdge: "rgba(78, 54, 24, 0.42)",
    pathMark: "rgba(255, 243, 184, 0.24)",
    water: "#567d74",
    waterLine: "rgba(244, 211, 107, 0.25)",
    texture: "sand"
  },
  "obsidian-sanctum": {
    ground: "#454132",
    groundAlt: "#514737",
    detail: "rgba(201, 120, 255, 0.28)",
    detailSoft: "rgba(28, 19, 40, 0.34)",
    path: "#44394c",
    pathAlt: "#554060",
    pathEdge: "rgba(25, 15, 34, 0.48)",
    pathMark: "rgba(115, 226, 255, 0.22)",
    water: "#2c5568",
    waterLine: "rgba(201, 120, 255, 0.32)",
    texture: "void"
  },
  "high-reach-peaks": {
    ground: "#677887",
    groundAlt: "#748798",
    detail: "rgba(223, 233, 255, 0.3)",
    detailSoft: "rgba(65, 76, 96, 0.24)",
    path: "#87898d",
    pathAlt: "#9ca0a2",
    pathEdge: "rgba(57, 68, 86, 0.34)",
    pathMark: "rgba(185, 156, 255, 0.24)",
    water: "#537d9c",
    waterLine: "rgba(223, 233, 255, 0.38)",
    texture: "sky"
  }
};

function tileAt(tiles: number[], tileX: number, tileY: number) {
  if (tileX < 0 || tileY < 0 || tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) return undefined;
  return tiles[tileY * MAP_WIDTH + tileX];
}

function sameTerrain(tile: number | undefined, terrain: number) {
  if (terrain === TILE_PATH) return tile === TILE_PATH || tile === TILE_BANK;
  return tile === terrain;
}

function pushRect(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, width: number, height: number, fill: string) {
  const call = renderRecord(pool, "rect");
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  call.fill = fill;
  calls.push(renderableRecord(call));
  return call;
}

function pushText(calls: Renderable[], pool: RenderFramePool | undefined, text: string, x: number, y: number, font: string, fill: string) {
  const call = renderRecord(pool, "text");
  call.text = text;
  call.x = x;
  call.y = y;
  call.font = font;
  call.fill = fill;
  calls.push(renderableRecord(call));
  return call;
}

function pushCircle(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radius: number) {
  const call = renderRecord(pool, "circle");
  call.x = x;
  call.y = y;
  call.radius = radius;
  calls.push(renderableRecord(call));
  return call;
}

function pushEllipse(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, radiusX: number, radiusY: number, fill: string) {
  const call = renderRecord(pool, "ellipse");
  call.x = x;
  call.y = y;
  call.radiusX = radiusX;
  call.radiusY = radiusY;
  call.fill = fill;
  calls.push(renderableRecord(call));
  return call;
}

function pushLine(calls: Renderable[], pool: RenderFramePool | undefined, x1: number, y1: number, x2: number, y2: number) {
  const call = renderRecord(pool, "line");
  call.x1 = x1;
  call.y1 = y1;
  call.x2 = x2;
  call.y2 = y2;
  calls.push(renderableRecord(call));
  return call;
}

function pooledPoint(pool: RenderFramePool | undefined, x: number, y: number) {
  return pool ? pool.point(x, y) : { x, y };
}

function pushPolygon(calls: Renderable[], pool: RenderFramePool | undefined, points: Array<{ x: number; y: number }>) {
  const call = renderRecord(pool, "polygon");
  call.points = points;
  calls.push(renderableRecord(call));
  return call;
}

function isDrawableImage(image: HTMLImageElement | null | undefined): image is HTMLImageElement {
  if (!image) return false;
  const width = "naturalWidth" in image && image.naturalWidth ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image && image.naturalHeight ? image.naturalHeight : image.height;
  return width > 0 && height > 0;
}

function pushSpriteCall(
  calls: Renderable[],
  pool: RenderFramePool | undefined,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha?: number,
  shadowColor?: string
) {
  const call = renderRecord(pool, "sprite");
  call.image = image;
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  if (alpha !== undefined) call.alpha = alpha;
  if (shadowColor) {
    call.shadowColor = shadowColor;
    call.shadowBlur = 8;
  }
  calls.push(renderableRecord(call));
  return call;
}

function appendImageOrRect(calls: Renderable[], pool: RenderFramePool | undefined, image: HTMLImageElement | null | undefined, x: number, y: number, width: number, height: number, fill: string) {
  const call = renderRecord(pool, image ? "sprite" : "rect");
  if (image) call.image = image;
  call.x = x;
  call.y = y;
  call.width = width;
  call.height = height;
  if (!image) call.fill = fill;
  calls.push(renderableRecord(call));
}

function appendEdgeCalls(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, edges: { top: boolean; right: boolean; bottom: boolean; left: boolean }, color: string) {
  if (edges.top) pushRect(calls, pool, x, y, TILE, 3, color);
  if (edges.right) pushRect(calls, pool, x + TILE - 3, y, 3, TILE, color);
  if (edges.bottom) pushRect(calls, pool, x, y + TILE - 3, TILE, 3, color);
  if (edges.left) pushRect(calls, pool, x, y, 3, TILE, color);
}

function factionVisualIdForTile(tileX: number, tileY: number): FactionVisualId {
  if (tileX < 48) return "ironcrag";
  if (tileX < 192) return tileX > 136 || tileY < 32 ? "ashwood-glade" : "oakhaven";
  if (tileX < 292) return "port-marrow";
  if (tileX < 368) return "aetheria";
  if (tileX < 448) return "high-reach-peaks";
  if (tileX < 572) return "sunken-bazaar";
  return "obsidian-sanctum";
}

function terrainStyleForTile(tileX: number, tileY: number) {
  return ZONE_TERRAIN_STYLES[factionVisualIdForTile(tileX, tileY)];
}

function appendGroundMotif(calls: Renderable[], pool: RenderFramePool | undefined, style: ZoneTerrainStyle, x: number, y: number, variant: number) {
  if (style.texture === "leaf") {
    if (variant % 5 === 0) {
      const leaf = pushCircle(calls, pool, x + 8 + (variant % 14), y + 8 + ((variant >> 3) % 14), 1.8);
      leaf.fill = style.detail;
    }
    if (variant % 11 === 0) {
      const root = pushLine(calls, pool, x + 4, y + 23, x + 19, y + 17);
      root.stroke = style.detailSoft;
      root.lineWidth = 1.2;
    }
    return;
  }
  if (style.texture === "wild") {
    if (variant % 4 === 0) {
      const thorn = pushLine(calls, pool, x + 7, y + 24, x + 20, y + 12);
      thorn.stroke = style.detail;
      thorn.lineWidth = 1.2;
    }
    if (variant % 9 === 0) pushRect(calls, pool, x + 11, y + 8, 4, 2, style.detailSoft);
    return;
  }
  if (style.texture === "ember") {
    if (variant % 4 === 0) {
      const crack = pushLine(calls, pool, x + 5, y + 25, x + 25, y + 7);
      crack.stroke = style.detail;
      crack.lineWidth = 1.1;
    }
    if (variant % 13 === 0) pushRect(calls, pool, x + 13, y + 14, 4, 2, "rgba(255, 195, 94, 0.22)");
    return;
  }
  if (style.texture === "marble") {
    if (variant % 5 === 0) {
      const vein = pushLine(calls, pool, x + 3, y + 9 + (variant % 15), x + 28, y + 6 + ((variant >> 3) % 13));
      vein.stroke = style.detail;
      vein.lineWidth = 1;
    }
    return;
  }
  if (style.texture === "dock") {
    if (variant % 4 === 0) pushRect(calls, pool, x + 5, y + 9 + (variant % 14), 23, 2, style.detail);
    if (variant % 9 === 0) pushRect(calls, pool, x + 12, y + 7, 2, 20, style.detailSoft);
    return;
  }
  if (style.texture === "sand") {
    if (variant % 3 === 0) {
      const grit = pushCircle(calls, pool, x + 6 + (variant % 20), y + 6 + ((variant >> 4) % 20), 1.6);
      grit.fill = style.detail;
    }
    if (variant % 8 === 0) pushRect(calls, pool, x + 8, y + 22, 13, 1, style.detailSoft);
    return;
  }
  if (style.texture === "void") {
    if (variant % 4 === 0) {
      const rift = pushLine(calls, pool, x + 5, y + 4, x + 27, y + 26);
      rift.stroke = style.detail;
      rift.lineWidth = 1.1;
    }
    if (variant % 11 === 0) {
      const mote = pushCircle(calls, pool, x + 10 + (variant % 12), y + 9 + ((variant >> 5) % 12), 2);
      mote.fill = "rgba(115, 226, 255, 0.16)";
    }
    return;
  }
  if (variant % 4 === 0) {
    const wind = pushLine(calls, pool, x + 4, y + 12 + (variant % 12), x + 26, y + 9 + (variant % 10));
    wind.stroke = style.detail;
    wind.lineWidth = 1;
  }
}

function appendGroundTileCalls(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, tileX: number, tileY: number) {
  const style = terrainStyleForTile(tileX, tileY);
  const variant = Math.abs(hash(`ground:${tileX}:${tileY}`));
  pushRect(calls, pool, x, y, TILE, TILE, style.ground);
  if (variant % 2 === 0) {
    const alt = pushRect(calls, pool, x + 2 + (variant % 4), y + 2 + ((variant >> 3) % 4), TILE - 6, TILE - 6, style.groundAlt);
    alt.alpha = 0.26;
  }
  appendGroundMotif(calls, pool, style, x, y, variant);
}

function appendBiomeProp(calls: Renderable[], pool: RenderFramePool | undefined, images: ClientImages, visualId: FactionVisualId, tile: number, x: number, y: number, _tileX: number, _tileY: number, variant: number) {
  if (tile === TILE_PATH || tile === TILE_BANK || tile === TILE_WATER) return;
  const props = worldBiomeProps[visualId];
  if (!props?.length) return;
  const prop = props[variant % props.length];
  if (variant % prop.every !== 0) return;
  const image = images[prop.image];
  if (!isDrawableImage(image)) return;
  const offsetX = ((variant >> 5) % 9) - 4;
  const offsetY = prop.y + ((variant >> 9) % 5) - 2;
  const spriteX = x + TILE / 2 - prop.width / 2 + offsetX;
  const spriteY = y + TILE / 2 - prop.height / 2 + offsetY;
  const shadow = pushEllipse(calls, pool, x + TILE / 2 + offsetX, y + TILE - 6 + offsetY * 0.25, Math.max(8, prop.width * 0.32), Math.max(3, prop.height * 0.11), "rgba(0,0,0,0.22)");
  shadow.alpha = prop.alpha === undefined ? 0.5 : Math.min(0.5, prop.alpha + 0.08);
  pushSpriteCall(calls, pool, image, spriteX, spriteY, prop.width, prop.height, prop.alpha);
}

function appendTileFactionAccent(calls: Renderable[], pool: RenderFramePool | undefined, images: ClientImages, tile: number, x: number, y: number, tileX: number, tileY: number) {
  if (tile === TILE_WATER) return;
  const visualId = factionVisualIdForTile(tileX, tileY);
  const visual = factionZoneVisuals[visualId];
  const variant = Math.abs(hash(`faction:${visualId}:${tileX}:${tileY}`));
  const wash = pushRect(calls, pool, x, y, TILE, TILE, visual.fill);
  wash.alpha = tile === TILE_PATH || tile === TILE_BANK ? 0.16 : 0.22;
  if (visualId === "ironcrag" && variant % 5 === 0) {
    const crack = pushLine(calls, pool, x + 7, y + 25, x + 23, y + 10);
    crack.stroke = "rgba(255, 143, 82, 0.34)";
    crack.lineWidth = 1.2;
  } else if ((visualId === "oakhaven" || visualId === "ashwood-glade") && variant % 4 === 0) {
    const leaf = pushCircle(calls, pool, x + 8 + (variant % 12), y + 8 + ((variant >> 2) % 12), visualId === "ashwood-glade" ? 2.2 : 1.8);
    leaf.fill = visualId === "ashwood-glade" ? "rgba(126, 214, 109, 0.42)" : "rgba(191, 231, 163, 0.34)";
  } else if (visualId === "aetheria" && variant % 6 === 0) {
    const marble = pushLine(calls, pool, x + 4, y + 7 + (variant % 12), x + 28, y + 5 + (variant % 10));
    marble.stroke = "rgba(247, 241, 186, 0.28)";
    marble.lineWidth = 1;
  } else if (visualId === "port-marrow" && variant % 5 === 0) {
    pushRect(calls, pool, x + 5, y + 9 + (variant % 10), 22, 2, "rgba(109, 226, 255, 0.18)");
  } else if (visualId === "high-reach-peaks" && variant % 5 === 0) {
    const cloud = pushCircle(calls, pool, x + 10 + (variant % 10), y + 10 + ((variant >> 3) % 8), 3);
    cloud.fill = "rgba(223, 233, 255, 0.32)";
  } else if (visualId === "sunken-bazaar" && variant % 4 === 0) {
    pushRect(calls, pool, x + 5 + (variant % 16), y + 6 + ((variant >> 2) % 15), 3, 3, "rgba(244, 211, 107, 0.2)");
  } else if (visualId === "obsidian-sanctum" && variant % 5 === 0) {
    const crack = pushLine(calls, pool, x + 6, y + 6, x + 25, y + 24);
    crack.stroke = "rgba(201, 120, 255, 0.32)";
    crack.lineWidth = 1.2;
  }
  appendBiomeProp(calls, pool, images, visualId, tile, x, y, tileX, tileY, variant);
}

function appendPathTileCalls(calls: Renderable[], pool: RenderFramePool | undefined, tiles: number[], x: number, y: number, tileX: number, tileY: number) {
  const style = terrainStyleForTile(tileX, tileY);
  const variant = Math.abs(hash(`path:${tileX}:${tileY}`));
  const edges = {
    top: !sameTerrain(tileAt(tiles, tileX, tileY - 1), TILE_PATH),
    right: !sameTerrain(tileAt(tiles, tileX + 1, tileY), TILE_PATH),
    bottom: !sameTerrain(tileAt(tiles, tileX, tileY + 1), TILE_PATH),
    left: !sameTerrain(tileAt(tiles, tileX - 1, tileY), TILE_PATH)
  };
  pushRect(calls, pool, x, y, TILE, TILE, style.path);
  const core = pushRect(calls, pool, x + 3, y + 3, TILE - 6, TILE - 6, style.pathAlt);
  core.alpha = 0.26;
  pushRect(calls, pool, x + 5 + (variant % 5), y + 7 + (variant % 3), 12, 1, style.pathMark);
  if (variant % 2 === 0) pushRect(calls, pool, x + 17, y + 20, 7, 1, style.pathMark);
  if (variant % 5 === 0) pushRect(calls, pool, x + 9, y + 24, 10, 1, "rgba(34, 26, 18, 0.16)");
  if (style.texture === "dock" && variant % 3 === 0) pushRect(calls, pool, x + 2, y + 15, 28, 2, "rgba(23, 54, 52, 0.18)");
  if (style.texture === "marble" && variant % 4 === 0) {
    const vein = pushLine(calls, pool, x + 6, y + 8, x + 25, y + 20);
    vein.stroke = "rgba(247, 241, 186, 0.24)";
    vein.lineWidth = 1;
  }
  appendEdgeCalls(calls, pool, x, y, edges, style.pathEdge);
}

function appendWaterTileCalls(calls: Renderable[], pool: RenderFramePool | undefined, tiles: number[], x: number, y: number, tileX: number, tileY: number) {
  const style = terrainStyleForTile(tileX, tileY);
  const variant = Math.abs(hash(`water:${tileX}:${tileY}`));
  const waveY = y + 9 + (variant % 10);
  const edges = {
    top: !sameTerrain(tileAt(tiles, tileX, tileY - 1), TILE_WATER),
    right: !sameTerrain(tileAt(tiles, tileX + 1, tileY), TILE_WATER),
    bottom: !sameTerrain(tileAt(tiles, tileX, tileY + 1), TILE_WATER),
    left: !sameTerrain(tileAt(tiles, tileX - 1, tileY), TILE_WATER)
  };
  pushRect(calls, pool, x, y, TILE, TILE, style.water);
  const commands = pool ? pool.commands() : [];
  const move: PooledRenderCommand = pool?.command("moveTo") ?? { kind: "moveTo" };
  move.x = x + 5;
  move.y = waveY;
  commands.push(renderablePathCommand(move));
  const curveA: PooledRenderCommand = pool?.command("quadraticCurveTo") ?? { kind: "quadraticCurveTo" };
  curveA.cpx = x + 12;
  curveA.cpy = waveY - 3;
  curveA.x = x + 19;
  curveA.y = waveY;
  commands.push(renderablePathCommand(curveA));
  const curveB: PooledRenderCommand = pool?.command("quadraticCurveTo") ?? { kind: "quadraticCurveTo" };
  curveB.cpx = x + 24;
  curveB.cpy = waveY + 2;
  curveB.x = x + 29;
  curveB.y = waveY;
  commands.push(renderablePathCommand(curveB));
  const path = renderRecord(pool, "path");
  path.commands = commands;
  path.stroke = style.waterLine;
  path.lineWidth = 1;
  calls.push(renderableRecord(path));
  appendEdgeCalls(calls, pool, x, y, edges, style.pathEdge);
  appendEdgeCalls(calls, pool, x + 1, y + 1, edges, "rgba(10, 34, 38, 0.18)");
}

function appendTileCalls(calls: Renderable[], pool: RenderFramePool | undefined, tiles: number[], images: ClientImages, tile: number, x: number, y: number, tileX: number, tileY: number) {
  if (tile === TILE_PATH) {
    appendPathTileCalls(calls, pool, tiles, x, y, tileX, tileY);
    appendTileFactionAccent(calls, pool, images, tile, x, y, tileX, tileY);
    return;
  }
  if (tile === TILE_WATER) {
    appendWaterTileCalls(calls, pool, tiles, x, y, tileX, tileY);
    return;
  }
  if (tile === TILE_ROCK) {
    appendGroundTileCalls(calls, pool, x, y, tileX, tileY);
    appendImageOrRect(calls, pool, images.stone2, x + 2, y + 1, 28, 28, "#6b7280");
    appendTileFactionAccent(calls, pool, images, tile, x, y, tileX, tileY);
    return;
  }
  if (tile === TILE_BANK) {
    const style = terrainStyleForTile(tileX, tileY);
    pushRect(calls, pool, x, y, TILE, TILE, style.path);
    pushRect(calls, pool, x + 4, y + 4, TILE - 8, TILE - 8, style.pathAlt);
    pushRect(calls, pool, x + 9, y + 8, 14, 16, factionZoneVisuals[factionVisualIdForTile(tileX, tileY)].accent);
    appendTileFactionAccent(calls, pool, images, tile, x, y, tileX, tileY);
    return;
  }
  appendGroundTileCalls(calls, pool, x, y, tileX, tileY);
  appendTileFactionAccent(calls, pool, images, tile, x, y, tileX, tileY);
}

function cachedTileCalls(tiles: number[], images: ClientImages, tileX: number, tileY: number) {
  const tile = tiles[tileY * MAP_WIDTH + tileX];
  const key = `${tileX}:${tileY}:${tile}`;
  const cache = terrainTileCallCache(tiles, images);
  let calls = cache.get(key);
  if (!calls) {
    const next: Renderable[] = [];
    appendTileCalls(next, undefined, tiles, images, tile, tileX * TILE, tileY * TILE, tileX, tileY);
    calls = next;
    cache.set(key, calls);
  }
  return calls;
}

function renderTerrainChunk(tiles: number[], images: ClientImages, chunkX: number, chunkY: number): TerrainChunk {
  const tileStartX = chunkX * CHUNK_SIZE_TILES;
  const tileStartY = chunkY * CHUNK_SIZE_TILES;
  const tileEndX = Math.min(MAP_WIDTH - 1, tileStartX + CHUNK_SIZE_TILES - 1);
  const tileEndY = Math.min(MAP_HEIGHT - 1, tileStartY + CHUNK_SIZE_TILES - 1);
  const worldX = tileStartX * TILE;
  const worldY = tileStartY * TILE;
  const width = (tileEndX - tileStartX + 1) * TILE;
  const height = (tileEndY - tileStartY + 1) * TILE;
  const chunkCalls: Renderable[] = [];
  for (let y = tileStartY; y <= tileEndY; y += 1) {
    for (let x = tileStartX; x <= tileEndX; x += 1) {
      appendTileCalls(chunkCalls, undefined, tiles, images, tiles[y * MAP_WIDTH + x], x * TILE, y * TILE, x, y);
    }
  }
  return { image: renderTerrainChunkToImage(width, height, worldX, worldY, chunkCalls), x: worldX, y: worldY, width, height };
}

function cachedTerrainChunk(tiles: number[], images: ClientImages, chunkX: number, chunkY: number) {
  const key = `${chunkX}:${chunkY}`;
  const cache = terrainChunkCache(tiles, images);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const chunk = renderTerrainChunk(tiles, images, chunkX, chunkY);
  cache.set(key, chunk);
  while (cache.size > CHUNK_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  return chunk;
}

function appendTerrainChunkSprites(calls: Renderable[], pool: RenderFramePool | undefined, tiles: number[], images: ClientImages, minX: number, maxX: number, minY: number, maxY: number) {
  const minChunkX = Math.floor(minX / CHUNK_SIZE_TILES);
  const maxChunkX = Math.floor(maxX / CHUNK_SIZE_TILES);
  const minChunkY = Math.floor(minY / CHUNK_SIZE_TILES);
  const maxChunkY = Math.floor(maxY / CHUNK_SIZE_TILES);
  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const chunk = cachedTerrainChunk(tiles, images, chunkX, chunkY);
      const call = renderRecord(pool, "sprite");
      call.image = chunk.image;
      call.x = chunk.x;
      call.y = chunk.y;
      call.width = chunk.width;
      call.height = chunk.height;
      calls.push(renderableRecord(call));
    }
  }
}

function visibleTileBoundsForPoint(x: number, y: number, width: number, height: number, padding: number) {
  const cameraX = Math.max(0, Math.min(MAP_WIDTH * TILE - width, x - width * 0.5));
  const cameraY = Math.max(0, Math.min(MAP_HEIGHT * TILE - height, y - height * 0.5));
  const viewport = {
    x: cameraX - padding,
    y: cameraY - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
  return {
    minX: Math.max(0, Math.floor(viewport.x / TILE) - TILE_RENDER_MARGIN),
    maxX: Math.min(MAP_WIDTH - 1, Math.ceil((viewport.x + viewport.width) / TILE) + TILE_RENDER_MARGIN),
    minY: Math.max(0, Math.floor(viewport.y / TILE) - TILE_RENDER_MARGIN),
    maxY: Math.min(MAP_HEIGHT - 1, Math.ceil((viewport.y + viewport.height) / TILE) + TILE_RENDER_MARGIN)
  };
}

export function prewarmTerrainRegionChunks(tiles: number[], images: ClientImages, width: number, height: number, padding = 128, experiment = activeTerrainPerfExperiment()) {
  if (!terrainExperimentEnabled("chunk-sprites", experiment)) return 0;
  const seen = new Set<string>();
  const started = performance.now();
  for (const region of REGION_LABELS) {
    const x = (region.tile.x + 0.5) * TILE;
    const y = (region.tile.y + 0.5) * TILE;
    const bounds = visibleTileBoundsForPoint(x, y, width, height, padding);
    const minChunkX = Math.floor(bounds.minX / CHUNK_SIZE_TILES);
    const maxChunkX = Math.floor(bounds.maxX / CHUNK_SIZE_TILES);
    const minChunkY = Math.floor(bounds.minY / CHUNK_SIZE_TILES);
    const maxChunkY = Math.floor(bounds.maxY / CHUNK_SIZE_TILES);
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const key = `${chunkX}:${chunkY}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cachedTerrainChunk(tiles, images, chunkX, chunkY);
      }
    }
  }
  globalThis.__mmoSkillDemoTerrainPrewarm = {
    chunks: seen.size,
    ms: Math.round((performance.now() - started) * 1000) / 1000
  };
  return seen.size;
}

function appendRegionBadge(calls: Renderable[], pool: RenderFramePool | undefined, x: number, y: number, visualId: FactionVisualId) {
  const visual = factionZoneVisuals[visualId];
  let badge: Record<string, unknown>;
  if (visual.shape === "diamond") {
    const points = pool ? pool.points(4) : [];
    points[0] = pooledPoint(pool, x, y - 9);
    points[1] = pooledPoint(pool, x + 9, y);
    points[2] = pooledPoint(pool, x, y + 9);
    points[3] = pooledPoint(pool, x - 9, y);
    badge = pushPolygon(calls, pool, points);
  } else if (visual.shape === "square") {
    badge = pushRect(calls, pool, x - 8, y - 8, 16, 16, visual.color);
  } else if (visual.shape === "triangle") {
    const points = pool ? pool.points(3) : [];
    points[0] = pooledPoint(pool, x, y - 10);
    points[1] = pooledPoint(pool, x + 10, y + 8);
    points[2] = pooledPoint(pool, x - 10, y + 8);
    badge = pushPolygon(calls, pool, points);
  } else {
    badge = pushCircle(calls, pool, x, y, 9);
  }
  badge.fill = visual.color;
  badge.stroke = "rgba(18, 22, 18, 0.82)";
  badge.lineWidth = 1.5;
  badge.shadowColor = visual.shadow;
  badge.shadowBlur = 5;
  const glyph = pushText(calls, pool, visual.glyph, x, y + 0.5, "800 10px system-ui", "#151a11");
  glyph.align = "center";
  glyph.baseline = "middle";
}

function appendRegionLabel(calls: Renderable[], pool: RenderFramePool | undefined, label: string, visualId: FactionVisualId, x: number, y: number) {
  const visual = factionZoneVisuals[visualId];
  const width = Math.max(98, label.length * 8 + 34);
  const halo = pushCircle(calls, pool, x + 4, y + 3, 31);
  halo.fill = visual.fill;
  halo.stroke = visual.color;
  halo.lineWidth = 1.4;
  halo.shadowColor = visual.shadow;
  halo.shadowBlur = 8;
  pushRect(calls, pool, x - 10, y - 22, width, 25, "rgba(0,0,0,0.42)");
  pushRect(calls, pool, x - 10, y + 1, width, 3, visual.color);
  appendRegionBadge(calls, pool, x + 5, y - 9, visualId);
  pushText(calls, pool, label, x + 20, y - 13, "700 12px system-ui", visual.color);
}

function overlapsViewport(x: number, y: number, width: number, height: number, viewport: Viewport, padding = 160) {
  return x + width >= viewport.x - padding && x <= viewport.x + viewport.width + padding && y + height >= viewport.y - padding && y <= viewport.y + viewport.height + padding;
}

function appendWorldLandmarks(calls: Renderable[], pool: RenderFramePool | undefined, images: ClientImages, viewport: Viewport) {
  for (const landmark of worldLandmarkPlacements) {
    const tile = getMmoSkillDemoAnchorTile(landmark.anchorId);
    const x = tile.x * TILE + landmark.dx;
    const y = tile.y * TILE + landmark.dy;
    if (!overlapsViewport(x, y, landmark.width, landmark.height, viewport)) continue;
    const visual = factionZoneVisuals[landmark.visualId];
    if (landmark.platform !== "none") {
      if (landmark.platform === "rect") {
        const platform = pushRect(calls, pool, x - 8, y + landmark.height - 20, landmark.width + 16, 24, visual.fill);
        platform.alpha = 0.55;
        platform.stroke = visual.color;
        platform.lineWidth = 1;
      } else {
        const platform = pushEllipse(calls, pool, x + landmark.width / 2, y + landmark.height - 12, landmark.width * 0.48, Math.max(9, landmark.height * 0.13), visual.fill);
        platform.alpha = 0.5;
        platform.stroke = visual.color;
        platform.lineWidth = 1;
      }
    }
    const shadow = pushEllipse(calls, pool, x + landmark.width / 2, y + landmark.height - 9, landmark.width * 0.34, Math.max(7, landmark.height * 0.09), "rgba(0,0,0,0.32)");
    shadow.alpha = landmark.alpha === undefined ? 0.72 : Math.min(0.72, landmark.alpha + 0.12);
    const image = images[landmark.image];
    if (isDrawableImage(image)) {
      pushSpriteCall(calls, pool, image, x, y, landmark.width, landmark.height, landmark.alpha, landmark.shadow ?? visual.shadow);
    } else {
      const fallback = pushRect(calls, pool, x, y, landmark.width, landmark.height, visual.fill);
      fallback.alpha = landmark.alpha ?? 0.64;
      fallback.stroke = visual.color;
      fallback.lineWidth = 1.2;
      fallback.shadowColor = landmark.shadow ?? visual.shadow;
      fallback.shadowBlur = 6;
    }
    if (landmark.tint) {
      const tint = pushRect(calls, pool, x, y, landmark.width, landmark.height, landmark.tint);
      tint.alpha = landmark.tintAlpha ?? 0.18;
      tint.composite = "multiply";
    }
    if (landmark.glyph) {
      const badgeX = x + landmark.width - 10;
      const badgeY = y + landmark.height - 14;
      const badge = pushCircle(calls, pool, badgeX, badgeY, 9);
      badge.fill = "rgba(11, 14, 11, 0.78)";
      badge.stroke = visual.color;
      badge.lineWidth = 1.4;
      const glyph = pushText(calls, pool, landmark.glyph, badgeX, badgeY + 0.5, "800 9px system-ui", visual.accent);
      glyph.align = "center";
      glyph.baseline = "middle";
    }
  }
}

export function createTerrainRenderCalls(tiles: number[], images: ClientImages, viewport: Viewport, calls: Renderable[] = [], pool?: RenderFramePool, experiment = activeTerrainPerfExperiment()): Renderable[] {
  pushRect(calls, pool, 0, 0, MAP_WIDTH * TILE, MAP_HEIGHT * TILE, "#365f2c");
  const useChunkSprites = terrainExperimentEnabled("chunk-sprites", experiment);
  const useTileCallCache = terrainExperimentEnabled("tile-call-cache", experiment);
  const minX = Math.max(0, Math.floor(viewport.x / TILE) - TILE_RENDER_MARGIN);
  const maxX = Math.min(MAP_WIDTH - 1, Math.ceil((viewport.x + viewport.width) / TILE) + TILE_RENDER_MARGIN);
  const minY = Math.max(0, Math.floor(viewport.y / TILE) - TILE_RENDER_MARGIN);
  const maxY = Math.min(MAP_HEIGHT - 1, Math.ceil((viewport.y + viewport.height) / TILE) + TILE_RENDER_MARGIN);
  if (useChunkSprites) {
    appendTerrainChunkSprites(calls, pool, tiles, images, minX, maxX, minY, maxY);
  } else {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (useTileCallCache) calls.push(...cachedTileCalls(tiles, images, x, y));
        else appendTileCalls(calls, pool, tiles, images, tiles[y * MAP_WIDTH + x], x * TILE, y * TILE, x, y);
      }
    }
  }
  appendWorldLandmarks(calls, pool, images, viewport);
  for (const region of REGION_LABELS) {
    const x = region.tile.x * TILE;
    const y = region.tile.y * TILE;
    appendRegionLabel(calls, pool, region.label, region.visualId, x, y);
  }
  return calls;
}
