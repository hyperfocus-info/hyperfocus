import { getDrawContext } from "../canvas/drawing.ts";
import type { RectLike } from "../math/collision.ts";
import type { TileLayer, TileMap } from "./tile-map.ts";
import type { TilesetImage } from "./tileset.ts";

export type RenderTileLayerOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  layer?: number | string | TileLayer;
  image?: TilesetImage;
  viewport?: RectLike;
  alpha?: number;
  scale?: number;
  instanceId?: string;
};

export type RenderTileLayerResult = {
  drawn: number;
  skipped: number;
};

function resolveLayer(map: TileMap, layer: RenderTileLayerOptions["layer"]) {
  if (!layer) return map.getLayer(0);
  if (typeof layer === "object") return layer;
  return map.getLayer(layer);
}

function matchesInstance(layer: TileLayer, instanceId: string | undefined) {
  if (instanceId === undefined) return true;
  const layerInstanceId = layer.metadata?.instanceId;
  return layerInstanceId === undefined || layerInstanceId === instanceId;
}

export function renderTileLayer(map: TileMap, options: RenderTileLayerOptions = {}): RenderTileLayerResult {
  const layer = resolveLayer(map, options.layer);
  const image = options.image ?? map.tileset.image;
  if (!layer || !layer.visible || !matchesInstance(layer, options.instanceId) || !image) return { drawn: 0, skipped: layer ? layer.tiles.length : 0 };

  const ctx = getDrawContext(options);
  const scale = options.scale ?? 1;
  const alpha = options.alpha ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Tile render scale must be a positive finite number");
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("Tile render alpha must be between 0 and 1");
  const viewport = options.viewport;
  if (viewport && ![viewport.x, viewport.y, viewport.w, viewport.h].every(Number.isFinite)) {
    throw new RangeError("Tile render viewport must contain finite values");
  }
  const minX = viewport ? Math.max(0, Math.floor((viewport.x - layer.offsetX) / map.tileWidth) - 1) : 0;
  const minY = viewport ? Math.max(0, Math.floor((viewport.y - layer.offsetY) / map.tileHeight) - 1) : 0;
  const maxX = viewport ? Math.min(layer.width - 1, Math.ceil((viewport.x + viewport.w - layer.offsetX) / map.tileWidth) + 1) : layer.width - 1;
  const maxY = viewport ? Math.min(layer.height - 1, Math.ceil((viewport.y + viewport.h - layer.offsetY) / map.tileHeight) + 1) : layer.height - 1;
  let drawn = 0;
  let skipped = 0;

  ctx.save();
  try {
    ctx.globalAlpha *= layer.opacity * alpha;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cell = map.getTileAt(x, y, layer.id);
        if (!cell?.tile) {
          skipped += 1;
          continue;
        }
        const source = cell.tile.source;
        ctx.drawImage(
          image,
          source.x,
          source.y,
          source.w,
          source.h,
          layer.offsetX + x * map.tileWidth * scale,
          layer.offsetY + y * map.tileHeight * scale,
          map.tileWidth * scale,
          map.tileHeight * scale
        );
        drawn += 1;
      }
    }
  } finally {
    ctx.restore();
  }

  return { drawn, skipped };
}
