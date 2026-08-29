import { seededRandom, type TileMapAnchorSpec } from "./generator.ts";
import type { TileMapMarker, TileValue } from "./tile-map.ts";

export type RegionChunkGrid = {
  chunksWide: number;
  chunksHigh: number;
  chunkWidth: number;
  chunkHeight: number;
};

export type RegionPoint = readonly [number, number];

export type RegionAnchorConfig<TZoneId extends string = string, TKind extends string = string> = {
  id: string;
  kind: TKind;
  name: string;
  title?: string;
  purpose?: string;
  resources?: readonly string[];
  motivation?: string;
  zoneId: TZoneId;
  chunkX: number;
  chunkY: number;
  markerTile?: TileValue;
  instanceId?: string;
  contains?: string;
  metadata?: Record<string, unknown>;
};

export type ResolvedRegionAnchor<TZoneId extends string = string, TKind extends string = string> =
  RegionAnchorConfig<TZoneId, TKind> & {
    tileX: number;
    tileY: number;
  };

export type RegionNpcManifestEntry<TZoneId extends string = string> = {
  id: string;
  kind: string;
  name: string;
  role: string;
  anchorId: string;
  spawnId: string;
  dialogTreeRef?: string;
  summary?: string;
  zoneId?: TZoneId;
  offsetX?: number;
  offsetY?: number;
  metadata?: Record<string, unknown>;
};

export type ResolvedRegionNpc<TZoneId extends string = string> = RegionNpcManifestEntry<TZoneId> & {
  tileX: number;
  tileY: number;
  zoneId: TZoneId;
};

export type RegionQuestManifestEntry = {
  id: string;
  name: string;
  giverId: string;
  summary: string;
  reward: string;
  requires?: readonly string[];
  metadata?: Record<string, unknown>;
};

export type RegionTileIds = Record<string, TileValue>;

export type RegionPointGroup = {
  tile: TileValue;
  points: readonly RegionPoint[];
  overwrite?: boolean;
};

export type RegionAnchorStamp = {
  anchorId: string;
  offsets: readonly RegionPoint[];
  tile: TileValue;
  overwrite?: boolean;
};

export type RegionPortConfig<TZoneId extends string = string> = {
  anchorId: string;
  zoneId?: TZoneId;
  radiusX: number;
  radiusY: number;
  tile?: TileValue;
  connectEast?: boolean;
};

export type RegionRiverSpec = {
  tile: TileValue;
  baseX: number;
  fromY?: number;
  toY?: number;
  amplitude?: number;
  frequency?: number;
  width?: number;
};

export type RegionCoastSpec = {
  tile: TileValue;
  baseX: number;
  fromY?: number;
  toY?: number;
  amplitude?: number;
  frequency?: number;
  direction?: "east" | "west";
};

export type RegionChunkScatterContext<TZoneId extends string = string, TKind extends string = string> = {
  config: RegionConfig<TZoneId, TKind>;
  chunkX: number;
  chunkY: number;
  rng: () => number;
};

export type RegionChunkScatter<TZoneId extends string = string, TKind extends string = string> = {
  count: number | ((context: RegionChunkScatterContext<TZoneId, TKind>) => number);
  tile:
    | TileValue
    | readonly TileValue[]
    | ((context: RegionChunkScatterContext<TZoneId, TKind> & { tileX: number; tileY: number }) => TileValue | undefined | null);
  onlyWhenBase?: boolean;
};

export type RegionAnchorFootprint<TKind extends string = string> = {
  kind?: TKind;
  width: number;
  height: number;
  tile?: TileValue;
};

export type RegionTileBuildContext<TZoneId extends string = string, TKind extends string = string> = {
  config: RegionConfig<TZoneId, TKind>;
  width: number;
  height: number;
  tiles: TileValue[];
  anchors: ResolvedRegionAnchor<TZoneId, TKind>[];
  set: (x: number, y: number, tile: TileValue) => void;
  setIfBase: (x: number, y: number, tile: TileValue) => void;
  fillRect: (x: number, y: number, width: number, height: number, tile: TileValue, overwrite?: boolean) => void;
  drawPath: (fromX: number, fromY: number, toX: number, toY: number, tile?: TileValue, width?: number) => void;
  rng: () => number;
};

export type RegionTilePlan<TZoneId extends string = string, TKind extends string = string> = {
  baseTile: TileValue;
  edgeTile?: TileValue;
  routeTile?: TileValue;
  defaultAnchorTile?: TileValue;
  waterBorder?: boolean;
  port?: RegionPortConfig<TZoneId>;
  rivers?: readonly RegionRiverSpec[];
  coasts?: readonly RegionCoastSpec[];
  pointGroups?: readonly RegionPointGroup[];
  anchorStamps?: readonly RegionAnchorStamp[];
  chunkScatters?: readonly RegionChunkScatter<TZoneId, TKind>[];
  roadPairs?: readonly (readonly [string, string])[];
  anchorFootprints?: readonly RegionAnchorFootprint<TKind>[];
  afterBuild?: (context: RegionTileBuildContext<TZoneId, TKind>) => void;
};

export type RegionZoneContext<TZoneId extends string = string, TKind extends string = string> = {
  config: RegionConfig<TZoneId, TKind>;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  anchors: ResolvedRegionAnchor<TZoneId, TKind>[];
};

export type RegionZoneRule<TZoneId extends string = string, TKind extends string = string> = {
  zoneId: TZoneId;
  when: (context: RegionZoneContext<TZoneId, TKind>) => boolean;
};

export type RegionZoneConfig<TZoneId extends string = string, TKind extends string = string> = {
  defaultZoneId: TZoneId;
  port?: RegionPortConfig<TZoneId>;
  nearestAnchorDistance?: number;
  nearestAnchorZone?: (anchor: ResolvedRegionAnchor<TZoneId, TKind>, context: RegionZoneContext<TZoneId, TKind>) => TZoneId | undefined;
  rules?: readonly RegionZoneRule<TZoneId, TKind>[];
  resolve?: (context: RegionZoneContext<TZoneId, TKind>) => TZoneId;
};

export type RegionConfig<TZoneId extends string = string, TKind extends string = string> = {
  id: string;
  seed: string;
  revision: string;
  tileSize: number;
  chunkGrid: RegionChunkGrid;
  tileIds?: RegionTileIds;
  anchors: readonly RegionAnchorConfig<TZoneId, TKind>[];
  npcs?: readonly RegionNpcManifestEntry<TZoneId>[];
  quests?: readonly RegionQuestManifestEntry[];
  tiles?: RegionTilePlan<TZoneId, TKind>;
  zones?: RegionZoneConfig<TZoneId, TKind>;
  resolveNpcZone?: (
    npc: RegionNpcManifestEntry<TZoneId>,
    anchor: ResolvedRegionAnchor<TZoneId, TKind>,
    context: RegionZoneContext<TZoneId, TKind>
  ) => TZoneId;
};

const MAX_REGION_TILES = 4_194_304;

function positiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeSafeInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${label} must be a non-negative safe integer no greater than ${maximum}`);
  }
  return value;
}

function finiteNumber(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function assertRegionGrid(config: Pick<RegionConfig, "chunkGrid">) {
  const grid = config.chunkGrid;
  positiveSafeInteger(grid.chunksWide, "region chunksWide");
  positiveSafeInteger(grid.chunksHigh, "region chunksHigh");
  positiveSafeInteger(grid.chunkWidth, "region chunkWidth");
  positiveSafeInteger(grid.chunkHeight, "region chunkHeight");
  const width = grid.chunksWide * grid.chunkWidth;
  const height = grid.chunksHigh * grid.chunkHeight;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new RangeError("region dimensions exceed the safe integer range");
  }
  return { width, height };
}

function assertRegionConfigGeometry<TZoneId extends string, TKind extends string>(config: RegionConfig<TZoneId, TKind>) {
  const { width, height } = assertRegionGrid(config);
  if (!config.id) throw new Error("region id must not be empty");
  if (!Number.isFinite(config.tileSize) || config.tileSize <= 0) throw new RangeError("region tileSize must be positive and finite");
  const ids = new Set<string>();
  for (const anchor of config.anchors) {
    if (!anchor.id) throw new Error("region anchor ids must not be empty");
    if (ids.has(anchor.id)) throw new Error(`duplicate region anchor id: ${anchor.id}`);
    ids.add(anchor.id);
    nonNegativeSafeInteger(anchor.chunkX, `anchor ${anchor.id} chunkX`, config.chunkGrid.chunksWide - 1);
    nonNegativeSafeInteger(anchor.chunkY, `anchor ${anchor.id} chunkY`, config.chunkGrid.chunksHigh - 1);
  }
  return { width, height };
}

export function createRegionConfig<const TZoneId extends string = string, const TKind extends string = string>(
  config: RegionConfig<TZoneId, TKind>
): RegionConfig<TZoneId, TKind> {
  assertRegionConfigGeometry(config);
  return config;
}

export function regionMapWidth(config: Pick<RegionConfig, "chunkGrid">) {
  return assertRegionGrid(config).width;
}

export function regionMapHeight(config: Pick<RegionConfig, "chunkGrid">) {
  return assertRegionGrid(config).height;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function insetRange(size: number) {
  return size >= 3 ? { min: 1, max: size - 2 } : { min: 0, max: size - 1 };
}

function resolveAnchorTile<TZoneId extends string, TKind extends string>(
  anchor: RegionAnchorConfig<TZoneId, TKind>,
  config: RegionConfig<TZoneId, TKind>
) {
  const rng = seededRandom(`${config.seed}:anchor:${anchor.id}`);
  const { chunkWidth, chunkHeight } = config.chunkGrid;
  const minX = Math.min(chunkWidth - 1, Math.max(1, Math.floor(chunkWidth * 0.25)));
  const minY = Math.min(chunkHeight - 1, Math.max(1, Math.floor(chunkHeight * 0.25)));
  const maxX = Math.max(minX, Math.min(chunkWidth - 2, Math.ceil(chunkWidth * 0.75)));
  const maxY = Math.max(minY, Math.min(chunkHeight - 2, Math.ceil(chunkHeight * 0.75)));
  const localX = minX + Math.floor(rng() * (maxX - minX + 1));
  const localY = minY + Math.floor(rng() * (maxY - minY + 1));
  const xRange = insetRange(regionMapWidth(config));
  const yRange = insetRange(regionMapHeight(config));

  return {
    tileX: clamp(anchor.chunkX * chunkWidth + localX, xRange.min, xRange.max),
    tileY: clamp(anchor.chunkY * chunkHeight + localY, yRange.min, yRange.max)
  };
}

export function resolveRegionAnchors<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>
): ResolvedRegionAnchor<TZoneId, TKind>[] {
  assertRegionConfigGeometry(config);
  return config.anchors.map((anchor) => ({
    ...anchor,
    ...resolveAnchorTile(anchor, config)
  }));
}

export function buildRegionAnchorSpecs<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>
): TileMapAnchorSpec[] {
  return resolveRegionAnchors(config).map((anchor) => ({
    id: anchor.id,
    type: anchor.kind,
    tileX: anchor.tileX,
    tileY: anchor.tileY,
    tile: anchor.markerTile,
    metadata: {
      ...anchor.metadata,
      name: anchor.name,
      title: anchor.title,
      zoneId: anchor.zoneId,
      instanceId: anchor.instanceId,
      contains: anchor.contains,
      resources: anchor.resources ? [...anchor.resources] : undefined,
      motivation: anchor.motivation
    }
  }));
}

export function resolveRegionNpcs<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>
): ResolvedRegionNpc<TZoneId>[] {
  const anchors = new Map(resolveRegionAnchors(config).map((anchor) => [anchor.id, anchor]));
  const width = regionMapWidth(config);
  const height = regionMapHeight(config);
  const xRange = insetRange(width);
  const yRange = insetRange(height);
  return (config.npcs ?? []).map((npc) => {
    const anchor = anchors.get(npc.anchorId);
    if (!anchor) throw new Error(`Unknown anchor ${npc.anchorId} for ${npc.id}`);
    const rng = seededRandom(`${config.seed}:npc:${npc.spawnId}`);
    const offsetX = npc.offsetX ?? Math.floor(rng() * 7) - 3;
    const offsetY = npc.offsetY ?? Math.floor(rng() * 5) - 2;
    if (!Number.isSafeInteger(offsetX) || !Number.isSafeInteger(offsetY)) {
      throw new RangeError(`NPC ${npc.id} offsets must be safe integers`);
    }
    const context = {
      config,
      tileX: anchor.tileX,
      tileY: anchor.tileY,
      width,
      height,
      anchors: [...anchors.values()]
    };

    return {
      ...npc,
      tileX: clamp(anchor.tileX + offsetX, xRange.min, xRange.max),
      tileY: clamp(anchor.tileY + offsetY, yRange.min, yRange.max),
      zoneId: npc.zoneId ?? config.resolveNpcZone?.(npc, anchor, context) ?? anchor.zoneId
    };
  });
}

export function buildRegionNpcMarkers<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>,
  tileWidth = config.tileSize,
  tileHeight = config.tileSize
): TileMapMarker[] {
  return resolveRegionNpcs(config).map((npc) => ({
    type: "npc",
    tileX: npc.tileX,
    tileY: npc.tileY,
    x: npc.tileX * tileWidth + tileWidth * 0.5,
    y: npc.tileY * tileHeight + tileHeight * 0.5,
    layer: "ground",
    metadata: {
      ...npc.metadata,
      id: npc.id,
      kind: npc.kind,
      name: npc.name,
      role: npc.role,
      anchorId: npc.anchorId,
      spawnId: npc.spawnId,
      dialogTreeRef: npc.dialogTreeRef,
      zoneId: npc.zoneId
    }
  }));
}

function portBounds<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>,
  anchors: ResolvedRegionAnchor<TZoneId, TKind>[],
  port: RegionPortConfig<TZoneId>
) {
  nonNegativeSafeInteger(port.radiusX, `port ${port.anchorId} radiusX`);
  nonNegativeSafeInteger(port.radiusY, `port ${port.anchorId} radiusY`);
  const width = regionMapWidth(config);
  const height = regionMapHeight(config);
  const anchor = anchors.find((candidate) => candidate.id === port.anchorId);
  const cx = anchor?.tileX ?? Math.floor(width * 0.5);
  const cy = anchor?.tileY ?? Math.floor(height * 0.5);
  const xRange = insetRange(width);
  const yRange = insetRange(height);
  return {
    minX: clamp(cx - port.radiusX, xRange.min, xRange.max),
    maxX: clamp(cx + port.radiusX, xRange.min, xRange.max),
    minY: clamp(cy - port.radiusY, yRange.min, yRange.max),
    maxY: clamp(cy + port.radiusY, yRange.min, yRange.max)
  };
}

function resolveScatterTile<TZoneId extends string, TKind extends string>(
  scatter: RegionChunkScatter<TZoneId, TKind>,
  context: RegionChunkScatterContext<TZoneId, TKind> & { tileX: number; tileY: number }
) {
  if (typeof scatter.tile === "function") return scatter.tile(context);
  if (Array.isArray(scatter.tile)) return scatter.tile[Math.floor(context.rng() * scatter.tile.length)];
  return scatter.tile;
}

export function buildRegionTiles<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>
): TileValue[] {
  const geometry = assertRegionConfigGeometry(config);
  const plan = config.tiles;
  if (!plan) return [];

  const { width, height } = geometry;
  const tileCount = width * height;
  if (!Number.isSafeInteger(tileCount) || tileCount > MAX_REGION_TILES) {
    throw new RangeError("region dimensions exceed the supported tile count");
  }
  const tiles = new Array<TileValue>(tileCount).fill(plan.baseTile);
  const rng = seededRandom(`${config.seed}:tiles`);
  const anchors = resolveRegionAnchors(config);
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));

  const set = (x: number, y: number, tile: TileValue) => {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new RangeError("region tile coordinates must be safe integers");
    if (x >= 0 && y >= 0 && x < width && y < height) tiles[y * width + x] = tile;
  };
  const setIfBase = (x: number, y: number, tile: TileValue) => {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) throw new RangeError("region tile coordinates must be safe integers");
    if (x >= 0 && y >= 0 && x < width && y < height && tiles[y * width + x] === plan.baseTile) set(x, y, tile);
  };
  const fillRect = (x0: number, y0: number, rectWidth: number, rectHeight: number, tile: TileValue, overwrite = true) => {
    if (!Number.isSafeInteger(x0) || !Number.isSafeInteger(y0)) throw new RangeError("region rectangle coordinates must be safe integers");
    nonNegativeSafeInteger(rectWidth, "region rectangle width");
    nonNegativeSafeInteger(rectHeight, "region rectangle height");
    const startX = Math.max(0, x0);
    const startY = Math.max(0, y0);
    const endX = Math.min(width, x0 + rectWidth);
    const endY = Math.min(height, y0 + rectHeight);
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) overwrite ? set(x, y, tile) : setIfBase(x, y, tile);
    }
  };
  const drawPath = (fromX: number, fromY: number, toX: number, toY: number, tile = plan.routeTile ?? plan.baseTile, pathWidth = 3) => {
    for (const [value, label, maximum] of [
      [fromX, "path fromX", width - 1],
      [fromY, "path fromY", height - 1],
      [toX, "path toX", width - 1],
      [toY, "path toY", height - 1]
    ] as const) nonNegativeSafeInteger(value, `region ${label}`, maximum);
    positiveSafeInteger(pathWidth, "region path width");
    if (pathWidth > Math.max(width, height) * 2 + 1) throw new RangeError("region path width is too large for the map");
    let x = fromX;
    let y = fromY;
    const radius = Math.max(0, Math.floor(pathWidth / 2));
    while (x !== toX || y !== toY) {
      fillRect(x - radius, y - radius, pathWidth, pathWidth, tile);
      if (x !== toX && (y === toY || rng() > 0.32)) x += Math.sign(toX - x);
      else if (y !== toY) y += Math.sign(toY - y);
    }
    fillRect(toX - radius, toY - radius, pathWidth, pathWidth, tile);
  };

  if (plan.waterBorder && plan.edgeTile !== undefined) {
    for (let x = 0; x < width; x += 1) {
      set(x, 0, plan.edgeTile);
      set(x, height - 1, plan.edgeTile);
    }
    for (let y = 0; y < height; y += 1) {
      set(0, y, plan.edgeTile);
      set(width - 1, y, plan.edgeTile);
    }
  }

  for (const river of plan.rivers ?? []) {
    const fromY = nonNegativeSafeInteger(river.fromY ?? 2, "region river fromY");
    const toY = nonNegativeSafeInteger(river.toY ?? Math.max(0, height - 2), "region river toY");
    const riverWidth = positiveSafeInteger(river.width ?? 1, "region river width");
    const baseX = finiteNumber(river.baseX, "region river baseX");
    const frequency = finiteNumber(river.frequency ?? 0.5, "region river frequency");
    const amplitude = finiteNumber(river.amplitude ?? 0, "region river amplitude");
    for (let y = Math.min(height, fromY); y < Math.min(height, toY); y += 1) {
      const x0 = Math.round(baseX + Math.sin(y * frequency) * amplitude);
      if (Number.isSafeInteger(x0)) fillRect(x0, y, riverWidth, 1, river.tile);
    }
  }

  for (const coast of plan.coasts ?? []) {
    const fromY = nonNegativeSafeInteger(coast.fromY ?? 2, "region coast fromY");
    const toY = nonNegativeSafeInteger(coast.toY ?? Math.max(0, height - 2), "region coast toY");
    const baseX = finiteNumber(coast.baseX, "region coast baseX");
    const frequency = finiteNumber(coast.frequency ?? 0.2, "region coast frequency");
    const amplitude = finiteNumber(coast.amplitude ?? 0, "region coast amplitude");
    for (let y = Math.min(height, fromY); y < Math.min(height, toY); y += 1) {
      const edgeX = Math.round(baseX + Math.sin(y * frequency) * amplitude);
      if (!Number.isSafeInteger(edgeX)) continue;
      if ((coast.direction ?? "east") === "east") {
        fillRect(Math.max(0, edgeX), y, Math.max(0, width - 1 - Math.max(0, edgeX)), 1, coast.tile);
      } else {
        fillRect(1, y, Math.max(0, Math.min(width - 1, edgeX)), 1, coast.tile);
      }
    }
  }

  for (const group of plan.pointGroups ?? []) {
    for (const [x, y] of group.points) (group.overwrite ? set : setIfBase)(x, y, group.tile);
  }

  if (plan.port?.tile !== undefined) {
    const port = portBounds(config, anchors, plan.port);
    for (let x = port.minX + 1; x < port.maxX; x += 1) {
      set(x, port.minY + 1, plan.port.tile);
      set(x, port.maxY - 1, plan.port.tile);
    }
    for (let y = port.minY + 1; y < port.maxY; y += 1) {
      set(port.minX + 1, y, plan.port.tile);
      set(port.maxX - 1, y, plan.port.tile);
    }
    const anchor = anchorById.get(plan.port.anchorId);
    if (anchor?.markerTile !== undefined) set(anchor.tileX, anchor.tileY, anchor.markerTile);
    if (anchor && plan.port.connectEast) {
      for (let x = anchor.tileX; x < width - 2; x += 1) set(x, anchor.tileY, plan.port.tile);
    }
  }

  for (const stamp of plan.anchorStamps ?? []) {
    const anchor = anchorById.get(stamp.anchorId);
    if (!anchor) continue;
    for (const [dx, dy] of stamp.offsets) (stamp.overwrite ? set : setIfBase)(anchor.tileX + dx, anchor.tileY + dy, stamp.tile);
  }

  for (let cy = 0; cy < config.chunkGrid.chunksHigh; cy += 1) {
    for (let cx = 0; cx < config.chunkGrid.chunksWide; cx += 1) {
      const chunkRng = seededRandom(`${config.seed}:chunk:${cx}:${cy}`);
      for (const scatter of plan.chunkScatters ?? []) {
        const context = { config, chunkX: cx, chunkY: cy, rng: chunkRng };
        const count = nonNegativeSafeInteger(
          typeof scatter.count === "function" ? scatter.count(context) : scatter.count,
          "region chunk scatter count",
          config.chunkGrid.chunkWidth * config.chunkGrid.chunkHeight
        );
        for (let i = 0; i < count; i += 1) {
          const x = cx * config.chunkGrid.chunkWidth + 2 + Math.floor(chunkRng() * Math.max(1, config.chunkGrid.chunkWidth - 4));
          const y = cy * config.chunkGrid.chunkHeight + 2 + Math.floor(chunkRng() * Math.max(1, config.chunkGrid.chunkHeight - 4));
          const tile = resolveScatterTile(scatter, { ...context, tileX: x, tileY: y });
          if (tile === undefined || tile === null) continue;
          scatter.onlyWhenBase ? setIfBase(x, y, tile) : set(x, y, tile);
        }
      }
    }
  }

  for (const anchor of anchors) {
    const footprint = plan.anchorFootprints?.find((candidate) => candidate.kind === anchor.kind) ?? plan.anchorFootprints?.find((candidate) => candidate.kind === undefined);
    const tile = footprint?.tile ?? plan.routeTile;
    if (footprint && tile !== undefined) {
      fillRect(
        anchor.tileX - Math.floor(footprint.width / 2),
        anchor.tileY - Math.floor(footprint.height / 2),
        footprint.width,
        footprint.height,
        tile
      );
    }
    set(anchor.tileX, anchor.tileY, anchor.markerTile ?? plan.defaultAnchorTile ?? tile ?? plan.baseTile);
  }

  for (const [fromId, toId] of plan.roadPairs ?? []) {
    const from = anchorById.get(fromId);
    const to = anchorById.get(toId);
    if (from && to) drawPath(from.tileX, from.tileY, to.tileX, to.tileY);
  }

  for (const anchor of anchors) set(anchor.tileX, anchor.tileY, anchor.markerTile ?? plan.defaultAnchorTile ?? plan.baseTile);

  plan.afterBuild?.({ config, width, height, tiles, anchors, set, setIfBase, fillRect, drawPath, rng });

  return tiles;
}

export function zoneForRegionTile<TZoneId extends string, TKind extends string>(
  config: RegionConfig<TZoneId, TKind>,
  tileX: number,
  tileY: number
): TZoneId {
  if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) throw new RangeError("region zone coordinates must be finite");
  const width = regionMapWidth(config);
  const height = regionMapHeight(config);
  const anchors = resolveRegionAnchors(config);
  const context = { config, tileX, tileY, width, height, anchors };
  const zoneConfig = config.zones;

  if (zoneConfig?.resolve) return zoneConfig.resolve(context);

  const port = zoneConfig?.port ?? config.tiles?.port;
  if (port?.zoneId) {
    const bounds = portBounds(config, anchors, port);
    if (tileX >= bounds.minX && tileX <= bounds.maxX && tileY >= bounds.minY && tileY <= bounds.maxY) return port.zoneId;
  }

  for (const rule of zoneConfig?.rules ?? []) {
    if (rule.when(context)) return rule.zoneId;
  }

  if (zoneConfig?.nearestAnchorDistance !== undefined && zoneConfig.nearestAnchorZone) {
    const nearest = anchors
      .map((anchor) => ({ anchor, distance: Math.abs(anchor.tileX - tileX) + Math.abs(anchor.tileY - tileY) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= zoneConfig.nearestAnchorDistance) {
      const zoneId = zoneConfig.nearestAnchorZone(nearest.anchor, context);
      if (zoneId) return zoneId;
    }
  }

  if (zoneConfig?.defaultZoneId) return zoneConfig.defaultZoneId;
  const firstAnchor = anchors[0];
  if (!firstAnchor) throw new Error("Cannot resolve a region zone without a default zone or at least one anchor");
  return firstAnchor.zoneId;
}
