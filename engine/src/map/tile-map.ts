import type { TileDefinition, TileId, Tileset } from "./tileset.ts";

export type TileValue = TileId | null;
export type CompactTileRow = string | readonly TileValue[];
export type CompactTileLegend = Record<string, TileValue>;
export type TileAnchor = "top-left" | "center";

export type TileMapMarker = {
  type: string;
  x: number;
  y: number;
  tileX?: number;
  tileY?: number;
  layer?: string;
  metadata?: Record<string, unknown>;
};

export type TileLayerSpec = {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  tiles?: readonly TileValue[] | readonly CompactTileRow[] | string;
  data?: readonly TileValue[] | readonly CompactTileRow[] | string;
  legend?: CompactTileLegend;
  visible?: boolean;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  parallaxX?: number;
  parallaxY?: number;
  metadata?: Record<string, unknown>;
};

export type TileLayer = {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: readonly TileValue[];
  visible: boolean;
  opacity: number;
  offsetX: number;
  offsetY: number;
  parallaxX: number;
  parallaxY: number;
  metadata?: Record<string, unknown>;
};

export type TileMapCell = {
  x: number;
  y: number;
  index: number;
  tileId: TileValue;
  tile?: TileDefinition;
  layer: TileLayer;
};

export type TileMapOptions = {
  tileset: Tileset;
  width: number;
  height: number;
  tileSize?: number;
  tileWidth?: number;
  tileHeight?: number;
  layers: readonly TileLayerSpec[];
  markers?: readonly TileMapMarker[];
  outOfBoundsTile?: TileValue;
  metadata?: Record<string, unknown>;
};

export type TileMap = {
  tileset: Tileset;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  layers: readonly TileLayer[];
  markers: readonly TileMapMarker[];
  outOfBoundsTile: TileValue;
  metadata?: Record<string, unknown>;
  getLayer(layer?: number | string): TileLayer | undefined;
  getTileAt(x: number, y: number, layer?: number | string): TileMapCell | undefined;
  worldToTile(x: number, y: number): { x: number; y: number };
  tileToWorld(x: number, y: number, anchor?: TileAnchor): { x: number; y: number };
};

// Tile maps are materialized eagerly as JavaScript arrays. Keep the aggregate
// allocation bounded instead of accepting dimensions that are legal for an
// Array but would predictably exhaust a game process.
const MAX_TILE_COUNT = 4_194_304;

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function checkedTileCount(width: number, height: number, label: string) {
  const count = width * height;
  if (!Number.isSafeInteger(count) || count > MAX_TILE_COUNT) {
    throw new RangeError(`${label} dimensions exceed the supported tile count`);
  }
  return count;
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function normalizeTileValue(value: unknown, label: string): TileValue {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be null or a non-negative safe integer`);
  }
  return value as number;
}

function decodeToken(token: string, legend?: CompactTileLegend): TileValue {
  if (legend && Object.prototype.hasOwnProperty.call(legend, token)) {
    return normalizeTileValue(legend[token], `legend entry ${JSON.stringify(token)}`);
  }
  if (token === "." || token === "_" || token === "-") return null;
  if (!/^(?:0|[1-9]\d*)$/.test(token)) return null;
  return normalizeTileValue(Number(token), `tile token ${JSON.stringify(token)}`);
}

function parseRows(rows: readonly CompactTileRow[], width: number, height: number, legend?: CompactTileLegend) {
  const expected = checkedTileCount(width, height, "tile layer");
  const tiles: TileValue[] = [];
  for (const row of rows) {
    if (tiles.length >= expected) break;
    if (typeof row === "string") {
      const trimmed = row.trim();
      const tokens = trimmed.includes(" ") ? trimmed.split(/\s+/) : [...trimmed];
      for (const token of tokens) {
        if (tiles.length >= expected) break;
        tiles.push(decodeToken(token, legend));
      }
    } else {
      for (const tile of row) {
        if (tiles.length >= expected) break;
        tiles.push(tile);
      }
    }
  }
  return normalizeTileCount(tiles, width, height);
}

function normalizeTileCount(tiles: readonly TileValue[], width: number, height: number) {
  const expected = checkedTileCount(width, height, "tile layer");
  if (tiles.length === expected) return tiles.map((tile, index) => normalizeTileValue(tile, `tile ${index}`));
  const normalized = new Array<TileValue>(expected).fill(null);
  for (let i = 0; i < Math.min(expected, tiles.length); i += 1) normalized[i] = normalizeTileValue(tiles[i], `tile ${i}`);
  return normalized;
}

function normalizeTiles(spec: TileLayerSpec, width: number, height: number) {
  const data = spec.tiles ?? spec.data ?? [];
  if (typeof data === "string") {
    return parseRows(data.split(/\r?\n/).filter((row) => row.trim().length > 0), width, height, spec.legend);
  }
  if (Array.isArray(data) && data.some((entry) => typeof entry === "string" || Array.isArray(entry))) {
    return parseRows(data as readonly CompactTileRow[], width, height, spec.legend);
  }
  return normalizeTileCount(data as readonly TileValue[], width, height);
}

function layerId(spec: TileLayerSpec, index: number) {
  return spec.id ?? spec.name ?? `layer-${index}`;
}

export function createTileMap(options: TileMapOptions): TileMap {
  const mapWidth = assertPositiveSafeInteger(options.width, "tile map width");
  const mapHeight = assertPositiveSafeInteger(options.height, "tile map height");
  checkedTileCount(mapWidth, mapHeight, "tile map");
  const tileWidth = assertFinite(options.tileWidth ?? options.tileSize ?? options.tileset.tileWidth, "tile width");
  const tileHeight = assertFinite(options.tileHeight ?? options.tileSize ?? options.tileset.tileHeight, "tile height");
  if (tileWidth <= 0 || tileHeight <= 0) throw new RangeError("tile dimensions must be positive");
  const pixelWidth = mapWidth * tileWidth;
  const pixelHeight = mapHeight * tileHeight;
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight)) throw new RangeError("tile map pixel dimensions must be finite");
  const ids = new Set<string>();
  let allocatedTiles = 0;
  const layers = options.layers.map<TileLayer>((layer, index) => {
    const width = assertPositiveSafeInteger(layer.width ?? mapWidth, `layer ${index} width`);
    const height = assertPositiveSafeInteger(layer.height ?? mapHeight, `layer ${index} height`);
    const layerTileCount = checkedTileCount(width, height, `layer ${index}`);
    allocatedTiles += layerTileCount;
    if (!Number.isSafeInteger(allocatedTiles) || allocatedTiles > MAX_TILE_COUNT) {
      throw new RangeError(`tile map layers exceed the supported aggregate tile count of ${MAX_TILE_COUNT}`);
    }
    const id = layerId(layer, index);
    if (id.length === 0) throw new Error(`layer ${index} id must not be empty`);
    if (ids.has(id)) throw new Error(`Duplicate tile layer id: ${id}`);
    ids.add(id);
    const opacity = assertFinite(layer.opacity ?? 1, `layer ${id} opacity`);
    if (opacity < 0 || opacity > 1) throw new RangeError(`layer ${id} opacity must be between 0 and 1`);
    return {
      id,
      name: layer.name ?? id,
      width,
      height,
      tiles: normalizeTiles(layer, width, height),
      visible: layer.visible ?? true,
      opacity,
      offsetX: assertFinite(layer.offsetX ?? 0, `layer ${id} offsetX`),
      offsetY: assertFinite(layer.offsetY ?? 0, `layer ${id} offsetY`),
      parallaxX: assertFinite(layer.parallaxX ?? 1, `layer ${id} parallaxX`),
      parallaxY: assertFinite(layer.parallaxY ?? 1, `layer ${id} parallaxY`),
      metadata: layer.metadata
    };
  });

  const map: TileMap = {
    tileset: options.tileset,
    width: mapWidth,
    height: mapHeight,
    tileWidth,
    tileHeight,
    pixelWidth,
    pixelHeight,
    layers,
    markers: options.markers
      ? options.markers.map((marker, index) => {
          if (!marker.type) throw new Error(`marker ${index} type must not be empty`);
          assertFinite(marker.x, `marker ${index} x`);
          assertFinite(marker.y, `marker ${index} y`);
          if (marker.tileX !== undefined && !Number.isSafeInteger(marker.tileX)) throw new RangeError(`marker ${index} tileX must be a safe integer`);
          if (marker.tileY !== undefined && !Number.isSafeInteger(marker.tileY)) throw new RangeError(`marker ${index} tileY must be a safe integer`);
          return { ...marker };
        })
      : [],
    outOfBoundsTile: normalizeTileValue(options.outOfBoundsTile, "out-of-bounds tile"),
    metadata: options.metadata,
    getLayer(layer = 0) {
      return typeof layer === "number" ? layers[layer] : layers.find((candidate) => candidate.id === layer || candidate.name === layer);
    },
    getTileAt(x, y, layer = 0) {
      return getTileAt(map, x, y, layer);
    },
    worldToTile(x, y) {
      return worldToTile(map, x, y);
    },
    tileToWorld(x, y, anchor = "top-left") {
      return tileToWorld(map, x, y, anchor);
    }
  };

  return map;
}

export function getTileAt(map: TileMap, x: number, y: number, layer: number | string = 0): TileMapCell | undefined {
  const targetLayer = map.getLayer(layer);
  if (!targetLayer) return undefined;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
  if (x < 0 || y < 0 || x >= targetLayer.width || y >= targetLayer.height) {
    if (map.outOfBoundsTile === null) return undefined;
    return {
      x,
      y,
      index: -1,
      tileId: map.outOfBoundsTile,
      tile: map.outOfBoundsTile === null ? undefined : map.tileset.getTile(map.outOfBoundsTile),
      layer: targetLayer
    };
  }
  const index = y * targetLayer.width + x;
  const tileId = targetLayer.tiles[index] ?? null;
  return {
    x,
    y,
    index,
    tileId,
    tile: tileId === null ? undefined : map.tileset.getTile(tileId),
    layer: targetLayer
  };
}

export function worldToTile(map: TileMap, x: number, y: number) {
  return {
    x: Math.floor(x / map.tileWidth),
    y: Math.floor(y / map.tileHeight)
  };
}

export function tileToWorld(map: TileMap, x: number, y: number, anchor: TileAnchor = "top-left") {
  const offsetX = anchor === "center" ? map.tileWidth * 0.5 : 0;
  const offsetY = anchor === "center" ? map.tileHeight * 0.5 : 0;
  return {
    x: x * map.tileWidth + offsetX,
    y: y * map.tileHeight + offsetY
  };
}
