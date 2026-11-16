import { isFiniteNumber } from "@hyperfocus/utilities/math";
import { finiteOr, rectHeight, rectWidth, type Renderable, type RenderRectLike, type RenderPoint, type RenderPointBuffer } from "./draw-data.ts";

export type SpriteSheetFrameConfig = {
  width: number;
  height: number;
  timeMs?: number;
  frameWidth: number;
  frameHeight: number;
  row?: number;
  frames?: number;
  frameMs?: number;
  cropWidth?: number;
  cropHeight?: number;
  cropOffsetX?: number;
  cropOffsetY?: number;
};

export type SpriteSheetFrame = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  frame: number;
  frames: number;
};

export type TileChunkDrawDataConfig<TTile> = {
  tiles: Iterable<TTile>;
  image?: CanvasImageSource;
  tileWidth: number;
  tileHeight: number;
  columns?: number;
  out?: Renderable[];
  getTileId?: (tile: TTile) => number | string | undefined;
  getX?: (tile: TTile) => number;
  getY?: (tile: TTile) => number;
  getSource?: (tile: TTile, id: number | string | undefined) => RenderRectLike | undefined;
};

type Bounds = { x: number; y: number; width: number; height: number };

function pointX(point: RenderPoint) {
  return "x" in point ? point.x : point[0];
}

function pointY(point: RenderPoint) {
  return "y" in point ? point.y : point[1];
}

function intersects(a: RenderRectLike, b: RenderRectLike) {
  const aw = rectWidth(a);
  const ah = rectHeight(a);
  const bw = rectWidth(b);
  const bh = rectHeight(b);
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

function boundsFromPoints(points: readonly RenderPoint[], offset = 0, count = points.length - offset): Bounds | undefined {
  if (count <= 0) return undefined;
  const first = points[offset];
  if (!first) return undefined;
  let minX = pointX(first);
  let maxX = minX;
  let minY = pointY(first);
  let maxY = minY;
  for (let i = offset + 1; i < offset + count; i += 1) {
    const point = points[i];
    if (!point) return undefined;
    const x = pointX(point);
    const y = pointY(point);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function isFlatPointBuffer(points: RenderPointBuffer): points is ArrayLike<number> {
  return points.length > 0 && typeof points[0] === "number";
}

function boundsFromPointBuffer(points: RenderPointBuffer, offset = 0, count?: number): Bounds | undefined {
  if (points.length === 0) return undefined;
  if (!isFlatPointBuffer(points)) {
    const available = points.length;
    const start = Math.max(0, Math.min(available, Math.floor(offset)));
    const length = Math.max(0, Math.min(available - start, Math.floor(count ?? (available - start))));
    return boundsFromPoints(points, start, length);
  }
  const available = Math.floor(points.length / 2);
  const start = Math.max(0, Math.min(available, Math.floor(offset)));
  const length = Math.max(0, Math.min(available - start, Math.floor(count ?? (available - start))));
  if (length === 0) return undefined;
  let minX = points[start * 2];
  let maxX = minX;
  let minY = points[start * 2 + 1];
  let maxY = minY;
  for (let index = start + 1; index < start + length; index += 1) {
    const x = points[index * 2];
    const y = points[index * 2 + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function renderableY(call: Renderable, order: number) {
  if (typeof call === "function") return order;
  return finiteOr(call.ySort ?? call.sortY ?? call.y, order);
}

function renderableZ(call: Renderable) {
  return typeof call === "function" ? 0 : finiteOr(call.z, 0);
}



export function sortRenderCallsByY(calls: readonly Renderable[], getY?: (call: Renderable) => number | undefined): Renderable[] {
  return sortRenderCallsByYInto(calls, [], getY);
}

export function sortRenderCallsByYInto(calls: readonly Renderable[], out: Renderable[], getY?: (call: Renderable) => number | undefined): Renderable[] {
  out.length = 0;
  for (const call of calls) out.push(call);
  return out.sort((a, b) => finiteOr(getY?.(a), renderableY(a, 0)) - finiteOr(getY?.(b), renderableY(b, 0)) || renderableZ(a) - renderableZ(b));
}

export function getRenderCallBounds(call: Renderable): Bounds | undefined {
  if (typeof call === "function") return undefined;
  if ("draw" in call && typeof call.draw === "function") return undefined;
  if ("image" in call) return { x: call.x ?? 0, y: call.y ?? 0, width: call.width ?? call.sourceWidth ?? 0, height: call.height ?? call.sourceHeight ?? 0 };
  switch (call.kind) {
    case "rect":
    case "bar":
    case "outline":
      return { x: call.x ?? 0, y: call.y ?? 0, width: call.width, height: call.height };
    case "circle":
      return { x: (call.x ?? 0) - call.radius, y: (call.y ?? 0) - call.radius, width: call.radius * 2, height: call.radius * 2 };
    case "ellipse":
      return { x: (call.x ?? 0) - call.radiusX, y: (call.y ?? 0) - call.radiusY, width: call.radiusX * 2, height: call.radiusY * 2 };
    case "line":
      return {
        x: Math.min(call.x1, call.x2),
        y: Math.min(call.y1, call.y2),
        width: Math.abs(call.x2 - call.x1),
        height: Math.abs(call.y2 - call.y1)
      };
    case "polyline":
    case "polygon":
      return boundsFromPointBuffer(call.points, call.pointOffset, call.pointCount);
    case "path": {
      const points: RenderPoint[] = [];
      for (const command of call.commands) {
        if ("x" in command && "y" in command) points.push({ x: command.x, y: command.y });
      }
      return boundsFromPoints(points);
    }
    case "text":
    case "label":
      return { x: call.x ?? 0, y: call.y ?? 0, width: call.maxWidth ?? 1, height: call.size ?? 14 };
    case "text-block":
      return { x: call.x ?? 0, y: call.y ?? 0, width: call.maxWidth, height: (call.lineHeight ?? (call.size ?? 14) * 1.2) * (call.maxLines ?? 1) };
    case "group": {
      if (call.calls.length === 0) {
        return isFiniteNumber(call.x) && isFiniteNumber(call.y)
          ? { x: call.x, y: call.y, width: 1, height: 1 }
          : undefined;
      }
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const child of call.calls) {
        const bounds = getRenderCallBounds(child);
        // A group containing a custom/unbounded call cannot be safely culled.
        if (!bounds || !finiteBounds(bounds)) return undefined;
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    default:
      return undefined;
  }
}

export function renderCallIntersectsRect(call: Renderable, rect: RenderRectLike): boolean {
    const bounds = getRenderCallBounds(call);
    return !bounds || intersects(bounds, rect);
}

export function cullRenderCallsToRect(calls: readonly Renderable[], rect: RenderRectLike): Renderable[] {
  return cullRenderCallsToRectInto(calls, rect, []);
}

export function cullRenderCallsToRectInto(calls: readonly Renderable[], rect: RenderRectLike, out: Renderable[]): Renderable[] {
  out.length = 0;
  for (const call of calls) {
    if (renderCallIntersectsRect(call, rect)) out.push(call);
  }
  return out;
}

export function resolveSpriteSheetFrame(config: SpriteSheetFrameConfig): SpriteSheetFrame | undefined {
  const { width, height, frameWidth, frameHeight } = config;
  if (!positiveFinite(width) || !positiveFinite(height) || !positiveFinite(frameWidth) || !positiveFinite(frameHeight)) return undefined;
  if (width < frameWidth || height < frameHeight || width % frameWidth !== 0 || height % frameHeight !== 0) return undefined;
  const cols = Math.floor(width / frameWidth);
  const rows = Math.floor(height / frameHeight);
  const rawRow = config.row ?? 0;
  const rawFrames = config.frames ?? cols;
  const timeMs = config.timeMs ?? 0;
  const frameMs = config.frameMs ?? 150;
  const cropWidth = config.cropWidth ?? frameWidth;
  const cropHeight = config.cropHeight ?? frameHeight;
  const offsetX = config.cropOffsetX ?? 0;
  const offsetY = config.cropOffsetY ?? 0;
  if (!Number.isFinite(rawRow) || rawRow < 0 || !Number.isFinite(rawFrames) || rawFrames <= 0 || !Number.isFinite(timeMs) || timeMs < 0) return undefined;
  if (!positiveFinite(frameMs) || !positiveFinite(cropWidth) || !positiveFinite(cropHeight)) return undefined;
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return undefined;
  const row = Math.max(0, Math.min(rows - 1, Math.floor(rawRow)));
  const frames = Math.max(1, Math.min(Math.floor(rawFrames), cols));
  const frame = Math.floor(timeMs / frameMs) % frames;
  const sw = Math.min(cropWidth, frameWidth);
  const sh = Math.min(cropHeight, frameHeight);
  const cropX = Math.max(0, Math.min(frameWidth - sw, Math.floor((frameWidth - sw) * 0.5 + offsetX)));
  const cropY = Math.max(0, Math.min(frameHeight - sh, Math.floor((frameHeight - sh) * 0.5 + offsetY)));
  return { sx: frame * frameWidth + cropX, sy: row * frameHeight + cropY, sw, sh, frame, frames };
}

function positiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

function finiteBounds(bounds: Bounds) {
  return Number.isFinite(bounds.x)
    && Number.isFinite(bounds.y)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height);
}

export function createTileChunkDrawData<TTile>(config: TileChunkDrawDataConfig<TTile>): Renderable[] {
  const calls: Renderable[] = config.out ?? [];
  calls.length = 0;
  for (const tile of config.tiles) {
    const id = config.getTileId?.(tile);
    const source = config.getSource?.(tile, id);
    if (!config.image || !source) continue;
    calls.push({
      kind: "sprite",
      image: config.image,
      x: config.getX?.(tile) ?? 0,
      y: config.getY?.(tile) ?? 0,
      width: config.tileWidth,
      height: config.tileHeight,
      sourceX: source.x,
      sourceY: source.y,
      sourceWidth: rectWidth(source) || config.tileWidth,
      sourceHeight: rectHeight(source) || config.tileHeight
    });
  }
  return calls;
}
