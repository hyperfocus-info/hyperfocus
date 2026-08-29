export type TileId = number;
export type TilesetImage = CanvasImageSource;

export type TileSourceRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TileMetadataInput = {
  id?: TileId;
  name?: string;
  tags?: readonly string[];
  solid?: boolean;
  collision?: boolean;
  spawn?: string | boolean;
  source?: Partial<TileSourceRect>;
  metadata?: Record<string, unknown>;
};

export type TileDefinition = {
  id: TileId;
  name?: string;
  tags: readonly string[];
  solid: boolean;
  collision: boolean;
  spawn?: string | boolean;
  source: TileSourceRect;
  metadata?: Record<string, unknown>;
};

export type TilesetOptions = {
  image?: TilesetImage;
  imageUrl?: string;
  tileSize?: number;
  tileWidth?: number;
  tileHeight?: number;
  spacing?: number;
  margin?: number;
  columns?: number;
  rows?: number;
  tileCount?: number;
  tiles?: readonly TileMetadataInput[] | Record<number, TileMetadataInput>;
};

export type Tileset = {
  image?: TilesetImage;
  imageUrl?: string;
  tileWidth: number;
  tileHeight: number;
  spacing: number;
  margin: number;
  columns: number;
  rows?: number;
  tileCount: number;
  getTile(id: TileId): TileDefinition | undefined;
  requireTile(id: TileId): TileDefinition;
  hasTile(id: TileId): boolean;
  tiles(): TileDefinition[];
  tileIdsByTag(tag: string): TileId[];
};

// Definitions are eagerly expanded into a Map, so a practical cap avoids a
// syntactically valid tileCount turning into a multi-gigabyte allocation.
const MAX_TILE_COUNT = 262_144;

function positiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number`);
  return value;
}

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function positiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
  return value;
}

function tileId(value: number, label: string) {
  const id = nonNegativeSafeInteger(value, label);
  if (id >= MAX_TILE_COUNT) throw new RangeError(`${label} exceeds the supported tile id range`);
  return id;
}

function imageSize(image: TilesetImage | undefined) {
  if (!image) return { width: 0, height: 0 };
  if ("naturalWidth" in image && image.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
  if ("videoWidth" in image && image.videoWidth) return { width: image.videoWidth, height: image.videoHeight };
  if ("width" in image && "height" in image) return { width: Number(image.width) || 0, height: Number(image.height) || 0 };
  return { width: 0, height: 0 };
}

function toMetadataEntries(tiles: TilesetOptions["tiles"]): Array<[TileId, TileMetadataInput]> {
  if (!tiles) return [];
  if (Array.isArray(tiles)) {
    return tiles.map((tile, index) => [tileId(tile.id ?? index, `tile metadata id ${index}`), tile]);
  }
  return Object.entries(tiles).map(([key, tile]) => {
    const id = tileId(Number(key), `tile metadata id ${JSON.stringify(key)}`);
    const resolvedId = tileId(tile.id ?? id, `tile metadata id ${JSON.stringify(key)}`);
    return [resolvedId, { ...tile, id: resolvedId }];
  });
}

function sourceFor(id: TileId, columns: number, tileWidth: number, tileHeight: number, spacing: number, margin: number): TileSourceRect {
  const columnCount = Math.max(1, columns);
  const column = id % columnCount;
  const row = Math.floor(id / columnCount);
  const x = margin + column * (tileWidth + spacing);
  const y = margin + row * (tileHeight + spacing);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError(`tile ${id} source coordinates exceed the finite numeric range`);
  return {
    x,
    y,
    w: tileWidth,
    h: tileHeight
  };
}

export function createTileset(options: TilesetOptions): Tileset {
  const tileWidth = positiveFinite(options.tileWidth ?? options.tileSize ?? 16, "tileset tileWidth");
  const tileHeight = positiveFinite(options.tileHeight ?? options.tileSize ?? tileWidth, "tileset tileHeight");
  const spacing = nonNegativeFinite(options.spacing ?? 0, "tileset spacing");
  const margin = nonNegativeFinite(options.margin ?? 0, "tileset margin");
  const size = imageSize(options.image);
  const inferredColumns = Math.max(1, Math.floor((size.width - margin * 2 + spacing) / (tileWidth + spacing)));
  const columns = positiveSafeInteger(options.columns ?? inferredColumns, "tileset columns");
  const inferredRows = size.height > 0 ? Math.max(1, Math.floor((size.height - margin * 2 + spacing) / (tileHeight + spacing))) : undefined;
  const metadataEntries = toMetadataEntries(options.tiles);
  const highestMetadataId = metadataEntries.reduce((highest, [id]) => Math.max(highest, id), -1);
  const rows = options.rows === undefined && inferredRows === undefined
    ? undefined
    : nonNegativeSafeInteger(options.rows ?? inferredRows ?? 0, "tileset rows");
  const inferredTileCount = rows === undefined ? highestMetadataId + 1 : columns * rows;
  const tileCount = nonNegativeSafeInteger(options.tileCount ?? inferredTileCount, "tileset tileCount");
  if (tileCount > MAX_TILE_COUNT || (rows !== undefined && !Number.isSafeInteger(columns * rows))) {
    throw new RangeError("tileset dimensions exceed the supported tile count");
  }
  const tiles = new Map<TileId, TileDefinition>();

  for (let id = 0; id < tileCount; id += 1) {
    tiles.set(id, {
      id,
      tags: [],
      solid: false,
      collision: false,
      source: sourceFor(id, columns, tileWidth, tileHeight, spacing, margin)
    });
  }

  for (const [id, metadata] of metadataEntries) {
    const base: TileDefinition = tiles.get(id) ?? {
      id,
      tags: [],
      solid: false,
      collision: false,
      source: sourceFor(id, columns, tileWidth, tileHeight, spacing, margin)
    };
    const source = metadata.source ?? {};
    const sourceX = nonNegativeFinite(source.x ?? base.source.x, `tile ${id} source.x`);
    const sourceY = nonNegativeFinite(source.y ?? base.source.y, `tile ${id} source.y`);
    const sourceWidth = positiveFinite(source.w ?? base.source.w, `tile ${id} source.w`);
    const sourceHeight = positiveFinite(source.h ?? base.source.h, `tile ${id} source.h`);
    tiles.set(id, {
      ...base,
      name: metadata.name ?? base.name,
      tags: metadata.tags ? [...metadata.tags] : base.tags,
      solid: metadata.solid ?? base.solid,
      collision: metadata.collision ?? metadata.solid ?? base.collision,
      spawn: metadata.spawn ?? base.spawn,
      metadata: metadata.metadata ?? base.metadata,
      source: {
        x: sourceX,
        y: sourceY,
        w: sourceWidth,
        h: sourceHeight
      }
    });
  }

  return {
    image: options.image,
    imageUrl: options.imageUrl,
    tileWidth,
    tileHeight,
    spacing,
    margin,
    columns,
    rows,
    tileCount: Math.max(tileCount, highestMetadataId + 1),
    getTile(id) {
      return tiles.get(id);
    },
    requireTile(id) {
      const tile = tiles.get(id);
      if (!tile) throw new Error(`Tile not found: ${id}`);
      return tile;
    },
    hasTile(id) {
      return tiles.has(id);
    },
    tiles() {
      return [...tiles.values()];
    },
    tileIdsByTag(tag) {
      return [...tiles.values()].filter((tile) => tile.tags.includes(tag)).map((tile) => tile.id);
    }
  };
}
