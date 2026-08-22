import { createTileMap, type TileLayerSpec, type TileMap, type TileMapMarker, type TileValue } from "./tile-map.ts";
import type { Tileset } from "./tileset.ts";
import { SeedableRandom } from "../core/random.ts";

export type SeededRandom = () => number;

type Point = { x: number; y: number };

const MAX_PATH_BRUSH_VISITS = 67_108_864;

export type TileMapGeneratorRule =
  | { type: "fill"; layer?: string; tile?: TileValue; tag?: string }
  | { type: "border"; layer?: string; tile?: TileValue; tag?: string; thickness?: number }
  | { type: "noise"; layer?: string; tile?: TileValue; tag?: string; chance: number; emptyTile?: TileValue }
  | { type: "scatter"; layer?: string; tile?: TileValue; tag?: string; count?: number; chance?: number; avoidTags?: readonly string[] }
  | { type: "path"; layer?: string; tile?: TileValue; tag?: string; from?: Point; to?: Point; width?: number; turnChance?: number }
  | { type: "marker"; markerType: string; layer?: string; tile?: TileValue; tag?: string; count?: number; avoidTags?: readonly string[] };

export type TileMapChunkGrid = {
  chunksWide: number;
  chunksHigh: number;
  chunkWidth: number;
  chunkHeight?: number;
};

export type TileMapAnchorSpec = {
  id: string;
  type: string;
  chunkX?: number;
  chunkY?: number;
  tileX?: number;
  tileY?: number;
  layer?: string;
  tile?: TileValue;
  tag?: string;
  metadata?: Record<string, unknown>;
};

export type GenerateTileMapOptions = {
  tileset: Tileset;
  width?: number;
  height?: number;
  tileSize?: number;
  tileWidth?: number;
  tileHeight?: number;
  seed?: number | string;
  chunkGrid?: TileMapChunkGrid;
  baseTile?: TileValue;
  layers?: readonly TileLayerSpec[];
  rules?: readonly TileMapGeneratorRule[];
  anchors?: readonly TileMapAnchorSpec[];
  markers?: readonly TileMapMarker[];
  outOfBoundsTile?: TileValue;
  metadata?: Record<string, unknown>;
};

export function seededRandom(seed: number | string = 0xdecafbad): SeededRandom {
  const rng = new SeedableRandom(seed);
  return () => rng.next();
}

function choice<T>(items: readonly T[], rng: SeededRandom) {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length) % items.length];
}

function resolveTile(tileset: Tileset, rng: SeededRandom, tile: TileValue | undefined, tag: string | undefined): TileValue {
  if (tile !== undefined) return tile;
  if (!tag) return null;
  return choice(tileset.tileIdsByTag(tag), rng) ?? null;
}

function hasAvoidedTag(tileset: Tileset, tileId: TileValue, avoidTags: readonly string[] | undefined) {
  if (tileId === null || !avoidTags || avoidTags.length === 0) return false;
  const tile = tileset.getTile(tileId);
  return tile ? avoidTags.some((tag) => tile.tags.includes(tag)) : false;
}

function indexOf(x: number, y: number, width: number) {
  return y * width + x;
}

function assertPositiveInteger(value: number | undefined, label: string) {
  if (!Number.isSafeInteger(value) || value === undefined || value <= 0) throw new Error(`generateTileMap requires positive safe-integer ${label}.`);
  return value;
}

function assertNonNegativeInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`generateTileMap ${label} must be a non-negative safe integer no greater than ${maximum}.`);
  }
  return value;
}

function assertProbability(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`generateTileMap ${label} must be between 0 and 1.`);
  }
  return value;
}

function assertTilePoint(point: Point, label: string, width: number, height: number) {
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
    throw new RangeError(`generateTileMap ${label} must use safe-integer coordinates.`);
  }
  if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) {
    throw new RangeError(`generateTileMap ${label} must be inside the map.`);
  }
  return point;
}

function mapSize(options: GenerateTileMapOptions) {
  const grid = options.chunkGrid;
  const chunkHeight = grid?.chunkHeight ?? grid?.chunkWidth;
  if (grid) {
    assertPositiveInteger(grid.chunksWide, "chunkGrid.chunksWide");
    assertPositiveInteger(grid.chunksHigh, "chunkGrid.chunksHigh");
    assertPositiveInteger(grid.chunkWidth, "chunkGrid.chunkWidth");
    assertPositiveInteger(chunkHeight, "chunkGrid.chunkHeight");
    if (!Number.isSafeInteger(grid.chunksWide * grid.chunkWidth) || !Number.isSafeInteger(grid.chunksHigh * (chunkHeight as number))) {
      throw new RangeError("generateTileMap chunkGrid dimensions exceed the safe integer range.");
    }
  }
  const width = options.width ?? (grid ? grid.chunksWide * grid.chunkWidth : undefined);
  const height = options.height ?? (grid && chunkHeight ? grid.chunksHigh * chunkHeight : undefined);
  return {
    width: assertPositiveInteger(width, "width"),
    height: assertPositiveInteger(height, "height")
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolveAnchorTile(anchor: TileMapAnchorSpec, width: number, height: number, grid: TileMapChunkGrid | undefined, seed: number | string | undefined, index: number) {
  if ((anchor.tileX === undefined) !== (anchor.tileY === undefined)) {
    throw new Error(`generateTileMap anchor ${anchor.id} must provide both tileX and tileY.`);
  }
  if (anchor.tileX !== undefined && anchor.tileY !== undefined) {
    if (!Number.isFinite(anchor.tileX) || !Number.isFinite(anchor.tileY)) {
      throw new RangeError(`generateTileMap anchor ${anchor.id} tile coordinates must be finite.`);
    }
    const chunkWidth = grid?.chunkWidth ?? width;
    const chunkHeight = grid?.chunkHeight ?? grid?.chunkWidth ?? height;
    return {
      tileX: clamp(Math.floor(anchor.tileX), 0, width - 1),
      tileY: clamp(Math.floor(anchor.tileY), 0, height - 1),
      chunkX: clamp(Math.floor(anchor.tileX / Math.max(1, chunkWidth)), 0, Math.max(0, (grid?.chunksWide ?? 1) - 1)),
      chunkY: clamp(Math.floor(anchor.tileY / Math.max(1, chunkHeight)), 0, Math.max(0, (grid?.chunksHigh ?? 1) - 1))
    };
  }

  const chunkWidth = grid?.chunkWidth ?? width;
  const chunkHeight = grid?.chunkHeight ?? grid?.chunkWidth ?? height;
  const chunksWide = grid?.chunksWide ?? 1;
  const chunksHigh = grid?.chunksHigh ?? 1;
  if (anchor.chunkX !== undefined && (!Number.isSafeInteger(anchor.chunkX) || anchor.chunkX < 0 || anchor.chunkX >= chunksWide)) {
    throw new RangeError(`generateTileMap anchor ${anchor.id} chunkX is outside the chunk grid.`);
  }
  if (anchor.chunkY !== undefined && (!Number.isSafeInteger(anchor.chunkY) || anchor.chunkY < 0 || anchor.chunkY >= chunksHigh)) {
    throw new RangeError(`generateTileMap anchor ${anchor.id} chunkY is outside the chunk grid.`);
  }
  const rng = seededRandom(`${seed ?? 0xdecafbad}:anchor:${anchor.id}:${index}`);
  const chunkX = clamp(Math.floor(anchor.chunkX ?? rng() * chunksWide), 0, chunksWide - 1);
  const chunkY = clamp(Math.floor(anchor.chunkY ?? rng() * chunksHigh), 0, chunksHigh - 1);
  const localMinX = Math.min(chunkWidth - 1, Math.max(1, Math.floor(chunkWidth * 0.25)));
  const localMinY = Math.min(chunkHeight - 1, Math.max(1, Math.floor(chunkHeight * 0.25)));
  const localMaxX = Math.max(localMinX, Math.min(chunkWidth - 2, Math.ceil(chunkWidth * 0.75)));
  const localMaxY = Math.max(localMinY, Math.min(chunkHeight - 2, Math.ceil(chunkHeight * 0.75)));
  const localX = localMinX + Math.floor(rng() * (localMaxX - localMinX + 1));
  const localY = localMinY + Math.floor(rng() * (localMaxY - localMinY + 1));
  return {
    tileX: clamp(chunkX * chunkWidth + localX, 0, width - 1),
    tileY: clamp(chunkY * chunkHeight + localY, 0, height - 1),
    chunkX,
    chunkY
  };
}

function setBrush(tiles: TileValue[], width: number, height: number, x: number, y: number, brushWidth: number, tile: TileValue) {
  const minX = x - Math.floor(brushWidth / 2);
  const minY = y - Math.floor(brushWidth / 2);
  const startX = Math.max(0, minX);
  const startY = Math.max(0, minY);
  const endX = Math.min(width, minX + brushWidth);
  const endY = Math.min(height, minY + brushWidth);
  for (let ty = startY; ty < endY; ty += 1) {
    for (let tx = startX; tx < endX; tx += 1) {
      tiles[indexOf(tx, ty, width)] = tile;
    }
  }
}

export function generateTileMap(options: GenerateTileMapOptions): TileMap {
  const rng = seededRandom(options.seed);
  const { width, height } = mapSize(options);
  const cellCount = width * height;
  if (!Number.isSafeInteger(cellCount) || cellCount > 4_194_304) {
    throw new RangeError("generateTileMap dimensions exceed the supported tile count.");
  }
  const baseTile = options.baseTile ?? null;
  const initialLayerSpecs = options.layers?.length
    ? options.layers
    : [{ id: "ground", name: "ground", tiles: new Array<TileValue>(width * height).fill(baseTile) }];
  const initialMap = createTileMap({
    tileset: options.tileset,
    width,
    height,
    tileSize: options.tileSize,
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    layers: initialLayerSpecs,
    markers: options.markers,
    outOfBoundsTile: options.outOfBoundsTile,
    metadata: options.metadata
  });
  const mutableLayers = new Map<string, TileValue[]>();
  const markers: TileMapMarker[] = options.markers ? [...options.markers] : [];

  for (const layer of initialMap.layers) {
    if (layer.width !== width || layer.height !== height) {
      throw new RangeError(`generateTileMap layer ${layer.id} dimensions must match the map dimensions.`);
    }
    mutableLayers.set(layer.id, [...layer.tiles]);
  }

  const firstLayerId = initialMap.layers[0]?.id ?? "ground";
  const getLayerTiles = (id: string | undefined) => {
    const resolvedId = id ?? firstLayerId;
    const tiles = mutableLayers.get(resolvedId);
    if (!tiles) throw new Error(`generateTileMap rule references unknown layer: ${resolvedId}`);
    return tiles;
  };
  const anchorIds = new Set<string>();
  for (const anchor of options.anchors ?? []) {
    if (!anchor.id) throw new Error("generateTileMap anchor ids must not be empty.");
    if (!anchor.type) throw new Error(`generateTileMap anchor ${anchor.id} type must not be empty.`);
    if (anchorIds.has(anchor.id)) throw new Error(`generateTileMap has duplicate anchor id: ${anchor.id}`);
    anchorIds.add(anchor.id);
  }

  for (const rule of options.rules ?? []) {
    const tiles = getLayerTiles(rule.layer);
    const tile = resolveTile(options.tileset, rng, "tile" in rule ? rule.tile : undefined, "tag" in rule ? rule.tag : undefined);

    if (rule.type === "fill") {
      tiles.fill(tile);
    } else if (rule.type === "border") {
      const thickness = assertPositiveInteger(rule.thickness ?? 1, "border thickness");
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (x < thickness || y < thickness || x >= width - thickness || y >= height - thickness) {
            tiles[indexOf(x, y, width)] = tile;
          }
        }
      }
    } else if (rule.type === "noise") {
      const chance = assertProbability(rule.chance, "noise chance");
      for (let i = 0; i < tiles.length; i += 1) tiles[i] = rng() < chance ? tile : rule.emptyTile ?? tiles[i] ?? null;
    } else if (rule.type === "scatter") {
      const chance = assertProbability(rule.chance ?? 0.05, "scatter chance");
      const count = assertNonNegativeInteger(rule.count ?? Math.round(cellCount * chance), "scatter count", cellCount);
      let placed = 0;
      let attempts = 0;
      const maxAttempts = count * 20;
      while (placed < count && attempts < maxAttempts) {
        attempts += 1;
        const x = Math.floor(rng() * width);
        const y = Math.floor(rng() * height);
        const index = indexOf(x, y, width);
        if (hasAvoidedTag(options.tileset, tiles[index], rule.avoidTags)) continue;
        tiles[index] = tile;
        placed += 1;
      }
    } else if (rule.type === "path") {
      const from = assertTilePoint(rule.from ?? { x: Math.floor(width * 0.5), y: height - 1 }, "path start", width, height);
      const to = assertTilePoint(rule.to ?? { x: Math.floor(width * 0.5), y: 0 }, "path end", width, height);
      const brushWidth = assertPositiveInteger(rule.width ?? 1, "path width");
      if (brushWidth > Math.max(width, height) * 2 + 1) throw new RangeError("generateTileMap path width is too large for the map.");
      const pathSteps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + 1;
      const brushVisits = pathSteps * Math.min(brushWidth, width) * Math.min(brushWidth, height);
      if (!Number.isSafeInteger(brushVisits) || brushVisits > MAX_PATH_BRUSH_VISITS) {
        throw new RangeError(`generateTileMap path brush exceeds the supported work limit of ${MAX_PATH_BRUSH_VISITS} tile visits.`);
      }
      const turnChance = assertProbability(rule.turnChance ?? 0.28, "path turnChance");
      let x = from.x;
      let y = from.y;
      let favorX = Math.abs(to.x - x) > Math.abs(to.y - y);
      while (x !== to.x || y !== to.y) {
        setBrush(tiles, width, height, x, y, brushWidth, tile);
        if (rng() < turnChance) favorX = !favorX;
        if ((favorX && x !== to.x) || y === to.y) x += Math.sign(to.x - x);
        else y += Math.sign(to.y - y);
      }
      setBrush(tiles, width, height, to.x, to.y, brushWidth, tile);
    } else if (rule.type === "marker") {
      if (!rule.markerType) throw new Error("generateTileMap marker rule type must not be empty.");
      const count = assertNonNegativeInteger(rule.count ?? 1, "marker count", cellCount);
      let placed = 0;
      let attempts = 0;
      while (placed < count && attempts < count * 30) {
        attempts += 1;
        const x = Math.floor(rng() * width);
        const y = Math.floor(rng() * height);
        if (hasAvoidedTag(options.tileset, tiles[indexOf(x, y, width)], rule.avoidTags)) continue;
        if (tile !== null) tiles[indexOf(x, y, width)] = tile;
        markers.push({
          type: rule.markerType,
          tileX: x,
          tileY: y,
          x: x * initialMap.tileWidth + initialMap.tileWidth * 0.5,
          y: y * initialMap.tileHeight + initialMap.tileHeight * 0.5,
          layer: rule.layer ?? firstLayerId
        });
        placed += 1;
      }
    }
  }

  for (const [anchorIndex, anchor] of (options.anchors ?? []).entries()) {
    const layerId = anchor.layer ?? firstLayerId;
    const tiles = getLayerTiles(layerId);
    const placed = resolveAnchorTile(anchor, width, height, options.chunkGrid, options.seed, anchorIndex);
    const tile = resolveTile(options.tileset, seededRandom(`${options.seed ?? 0xdecafbad}:anchor-tile:${anchor.id}`), anchor.tile, anchor.tag);
    if (tiles && tile !== null) tiles[indexOf(placed.tileX, placed.tileY, width)] = tile;
    markers.push({
      type: anchor.type,
      tileX: placed.tileX,
      tileY: placed.tileY,
      x: placed.tileX * initialMap.tileWidth + initialMap.tileWidth * 0.5,
      y: placed.tileY * initialMap.tileHeight + initialMap.tileHeight * 0.5,
      layer: layerId,
      metadata: {
        ...anchor.metadata,
        anchorId: anchor.id,
        chunkX: placed.chunkX,
        chunkY: placed.chunkY
      }
    });
  }

  return createTileMap({
    tileset: options.tileset,
    width,
    height,
    tileSize: options.tileSize,
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    layers: initialMap.layers.map((layer) => ({
      ...layer,
      tiles: mutableLayers.get(layer.id) ?? []
    })),
    markers,
    outOfBoundsTile: options.outOfBoundsTile,
    metadata: options.metadata
  });
}
