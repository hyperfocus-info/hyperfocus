import {
  defaultDrawState,
  drawRenderable,
  rectHeight,
  rectWidth,
  type RenderRectLike,
  type SpriteRenderData
} from "./draw-data.ts";
import type { RenderStage } from "./stage.ts";

export type TileRenderData = {
  id?: string | number;
  tile?: string | number;
  x?: number;
  y?: number;
  tileX?: number;
  tileY?: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  alpha?: number;
};

export type TileCacheRendererConfig<TTile extends TileRenderData = TileRenderData> = {
  image?: CanvasImageSource;
  tileWidth: number;
  tileHeight: number;
  columns?: number;
  margin?: number;
  spacing?: number;
  sources?: Record<string, RenderRectLike>;
  getId?: (tile: TTile) => string | number | undefined;
  getSource?: (tile: TTile, id: string | number | undefined) => RenderRectLike | undefined;
  /** Inset source texels on every edge to avoid linear-filter atlas bleeding. */
  sourceInset?: number;
  /** Snap destination edges to device pixels so adjacent tiles share exact boundaries. */
  pixelSnap?: boolean;
};

export type TileRenderOptions = {
  image?: CanvasImageSource;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  viewport?: RenderRectLike;
  sourceInset?: number;
  pixelSnap?: boolean;
  pixelRatio?: number;
};

function intersects(a: RenderRectLike, b: RenderRectLike) {
  const aw = rectWidth(a);
  const ah = rectHeight(a);
  const bw = rectWidth(b);
  const bh = rectHeight(b);
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

export function createTileCacheRenderer<TTile extends TileRenderData = TileRenderData>(config: TileCacheRendererConfig<TTile>) {
  const sourceCache = new Map<string, RenderRectLike>();
  const defaultInset = nonNegativeFinite(config.sourceInset ?? 0, "tile sourceInset");

  function sourceFor(tile: TTile) {
    const id = config.getId?.(tile) ?? tile.id ?? tile.tile;
    const key = id === undefined ? undefined : String(id);
    if (key !== undefined && sourceCache.has(key)) return sourceCache.get(key);
    const custom = config.getSource?.(tile, id) ?? (key ? config.sources?.[key] : undefined);
    if (custom) {
      if (key !== undefined) sourceCache.set(key, custom);
      return custom;
    }
    if (tile.sourceX !== undefined && tile.sourceY !== undefined) {
      const explicit = {
        x: tile.sourceX,
        y: tile.sourceY,
        width: tile.sourceWidth ?? config.tileWidth,
        height: tile.sourceHeight ?? config.tileHeight
      };
      if (key !== undefined) sourceCache.set(key, explicit);
      return explicit;
    }
    if (typeof id === "number" && config.columns) {
      const margin = config.margin ?? 0;
      const spacing = config.spacing ?? 0;
      const zeroBased = Math.max(0, id);
      const generated = {
        x: margin + (zeroBased % config.columns) * (config.tileWidth + spacing),
        y: margin + Math.floor(zeroBased / config.columns) * (config.tileHeight + spacing),
        width: config.tileWidth,
        height: config.tileHeight
      };
      if (key !== undefined) sourceCache.set(key, generated);
      return generated;
    }
    return undefined;
  }

  function toDrawCall(tile: TTile, options: TileRenderOptions = {}): SpriteRenderData | undefined {
    if (tile.visible === false) return undefined;
    const image = options.image ?? config.image;
    const source = sourceFor(tile);
    if (!image || !source) return undefined;
    const scale = options.scale ?? 1;
    let x = (options.offsetX ?? 0) + (tile.x ?? (tile.tileX ?? 0) * config.tileWidth) * scale;
    let y = (options.offsetY ?? 0) + (tile.y ?? (tile.tileY ?? 0) * config.tileHeight) * scale;
    let width = (tile.width ?? config.tileWidth) * scale;
    let height = (tile.height ?? config.tileHeight) * scale;
    if (options.pixelSnap ?? config.pixelSnap ?? false) {
      const ratio = positiveFinite(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, "tile pixelRatio");
      const right = Math.round((x + width) * ratio) / ratio;
      const bottom = Math.round((y + height) * ratio) / ratio;
      x = Math.round(x * ratio) / ratio;
      y = Math.round(y * ratio) / ratio;
      width = right - x;
      height = bottom - y;
    }
    const sourceWidth = rectWidth(source) || config.tileWidth;
    const sourceHeight = rectHeight(source) || config.tileHeight;
    const inset = Math.min(options.sourceInset ?? defaultInset, sourceWidth * 0.5, sourceHeight * 0.5);
    const bounds = { x, y, width, height };
    if (options.viewport && !intersects(bounds, options.viewport)) return undefined;
    return {
      kind: "sprite",
      image,
      x,
      y,
      width,
      height,
      sourceX: source.x + inset,
      sourceY: source.y + inset,
      sourceWidth: sourceWidth - inset * 2,
      sourceHeight: sourceHeight - inset * 2,
      alpha: tile.alpha
    };
  }

  function render(ctx: CanvasRenderingContext2D, tiles: Iterable<TTile>, options: TileRenderOptions = {}) {
    let drawn = 0;
    let skipped = 0;
    for (const tile of tiles) {
      const call = toDrawCall(tile, options);
      if (!call) {
        skipped += 1;
        continue;
      }
      if (drawRenderable(ctx, call, defaultDrawState)) drawn += 1;
    }
    return { drawn, skipped };
  }

  return {
    toDrawCall,
    render,
    push(stage: Pick<RenderStage, "push">, layer: string, tiles: Iterable<TTile>, options: TileRenderOptions = {}) {
      let pushed = 0;
      for (const tile of tiles) {
        const call = toDrawCall(tile, options);
        if (!call) continue;
        stage.push(layer, call);
        pushed += 1;
      }
      return pushed;
    },
    clearCache() {
      sourceCache.clear();
    }
  };
}

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be non-negative and finite`);
  return value;
}

function positiveFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite`);
  return value;
}
