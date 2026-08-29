import { truncateText, wrapText } from "./text.ts";

export type RenderCamera = {
  x?: number;
  y?: number;
  scale?: number;
  zoom?: number;
  rotation?: number;
};

export type RenderLayerSort = "none" | "y-axis";

export type RenderLayerOptions = {
  sort?: RenderLayerSort;
  ignoreCamera?: boolean;
  order?: number;
  cullRect?: RenderRectLike | undefined;
};

export type ResolvedRenderLayerOptions = Required<Omit<RenderLayerOptions, "cullRect">> & {
  cullRect?: RenderRectLike | undefined;
};

export type RenderRectLike = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  w?: number;
  h?: number;
};

export type RenderDrawContext = {
  camera: RenderCamera;
  layer: string;
  layerOptions: ResolvedRenderLayerOptions;
  order: number;
  progress?: number;
  drawDataCaches?: boolean;
};

export type RenderDrawFunction = (ctx: CanvasRenderingContext2D, state: RenderDrawContext) => void;

export type RenderResolvedPaint = string | CanvasGradient | CanvasPattern;

export type RenderPaintFunction = (ctx: CanvasRenderingContext2D, state: RenderDrawContext) => RenderResolvedPaint | undefined;

export type RenderColorStop = { offset: number; color: string } | readonly [number, string];

export type RenderLinearGradientPaint = {
  kind: "linear-gradient";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stops: readonly RenderColorStop[];
};

export type RenderRadialGradientPaint = {
  kind: "radial-gradient";
  x0: number;
  y0: number;
  r0: number;
  x1: number;
  y1: number;
  r1: number;
  stops: readonly RenderColorStop[];
};

export type RenderGradientPaint = RenderLinearGradientPaint | RenderRadialGradientPaint;

export type RenderPaint = RenderResolvedPaint | RenderGradientPaint | RenderPaintFunction;

export type RenderStrokeOptions = {
  stroke?: RenderPaint;
  lineWidth?: number;
  lineDash?: readonly number[];
  dash?: readonly number[];
  lineDashOffset?: number;
  dashOffset?: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
};

export type RenderFillStrokeOptions = RenderStrokeOptions & {
  fill?: RenderPaint;
};

export type RenderAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | { x?: number; y?: number };

export type BaseRenderData = {
  id?: string;
  visible?: boolean;
  alpha?: number;
  composite?: GlobalCompositeOperation;
  blendMode?: GlobalCompositeOperation;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  x?: number;
  y?: number;
  z?: number;
  ySort?: number;
  sortY?: number;
  order?: number;
};

export type SpriteRenderData = BaseRenderData & {
  kind?: "sprite";
  image: CanvasImageSource;
  width?: number;
  height?: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  rotation?: number;
  scale?: number | { x?: number; y?: number };
  anchor?: RenderAnchor;
  flipX?: boolean;
  flipY?: boolean;
};

export type RectRenderData = BaseRenderData & {
  kind: "rect";
  width: number;
  height: number;
} & RenderFillStrokeOptions;

export type CircleRenderData = BaseRenderData & {
  kind: "circle";
  radius: number;
} & RenderFillStrokeOptions;

export type EllipseRenderData = BaseRenderData & {
  kind: "ellipse";
  radiusX: number;
  radiusY: number;
  rotation?: number;
  startAngle?: number;
  endAngle?: number;
  counterclockwise?: boolean;
} & RenderFillStrokeOptions;

export type LineRenderData = BaseRenderData & {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} & RenderStrokeOptions;

export type RenderPoint = { x: number; y: number } | readonly [number, number];
export type RenderPointBuffer = readonly RenderPoint[] | ArrayLike<number>;

export type PolylineRenderData = BaseRenderData & {
  kind: "polyline";
  points: RenderPointBuffer;
  pointOffset?: number;
  pointCount?: number;
} & RenderStrokeOptions;

export type PolygonRenderData = BaseRenderData & {
  kind: "polygon";
  points: RenderPointBuffer;
  pointOffset?: number;
  pointCount?: number;
} & RenderFillStrokeOptions;

export type PathCommand =
  | { kind: "moveTo"; x: number; y: number }
  | { kind: "lineTo"; x: number; y: number }
  | { kind: "quadraticCurveTo"; cpx: number; cpy: number; x: number; y: number }
  | { kind: "bezierCurveTo"; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { kind: "arc"; x: number; y: number; radius: number; startAngle: number; endAngle: number; counterclockwise?: boolean }
  | { kind: "ellipse"; x: number; y: number; radiusX: number; radiusY: number; rotation?: number; startAngle: number; endAngle: number; counterclockwise?: boolean }
  | { kind: "closePath" };

export type PathRenderData = BaseRenderData & {
  kind: "path";
  commands: readonly PathCommand[];
} & RenderFillStrokeOptions;

export type TextRenderData = BaseRenderData & {
  kind: "text";
  text: string;
  font?: string;
  size?: number;
  family?: string;
  weight?: string | number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  fill?: RenderPaint;
  stroke?: RenderPaint;
  lineWidth?: number;
  maxWidth?: number;
};

export type TextBlockRenderData = BaseRenderData & {
  kind: "text-block";
  text: string;
  font?: string;
  size?: number;
  family?: string;
  weight?: string | number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  fill?: RenderPaint;
  stroke?: RenderPaint;
  lineWidth?: number;
  maxWidth: number;
  lineHeight?: number;
  maxLines?: number;
  ellipsis?: string;
};

export type BarRenderData = BaseRenderData & {
  kind: "bar";
  width: number;
  height: number;
  value: number;
  max?: number;
  vertical?: boolean;
  background?: RenderPaint;
} & RenderFillStrokeOptions;

export type LabelRenderData = BaseRenderData & {
  kind: "label";
  text: string;
  font?: string;
  size?: number;
  family?: string;
  weight?: string | number;
  fill?: RenderPaint;
  stroke?: RenderPaint;
  background?: RenderPaint;
  padding?: number;
  maxWidth?: number;
};

export type InteractionOutlineRenderData = BaseRenderData & {
  kind: "outline";
  width: number;
  height: number;
  inset?: number;
  shape?: "rect" | "circle" | "ellipse";
} & RenderFillStrokeOptions;

export type GroupRenderData = BaseRenderData & {
  kind: "group";
  calls: readonly Renderable[];
};

export type CustomRenderData = BaseRenderData & {
  kind?: "custom";
  draw: RenderDrawFunction;
};

export type RenderData =
  | SpriteRenderData
  | RectRenderData
  | CircleRenderData
  | EllipseRenderData
  | LineRenderData
  | PolylineRenderData
  | PolygonRenderData
  | PathRenderData
  | TextRenderData
  | TextBlockRenderData
  | BarRenderData
  | LabelRenderData
  | InteractionOutlineRenderData
  | GroupRenderData
  | CustomRenderData;

export type Renderable = RenderDrawFunction | RenderData;

export function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function rectWidth(rect: RenderRectLike) {
  return rect.width ?? rect.w ?? 0;
}

export function rectHeight(rect: RenderRectLike) {
  return rect.height ?? rect.h ?? 0;
}

function imageSize(image: CanvasImageSource) {
  if ("naturalWidth" in image && image.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
  if ("videoWidth" in image && image.videoWidth) return { width: image.videoWidth, height: image.videoHeight };
  if ("width" in image && "height" in image) return { width: Number(image.width) || 0, height: Number(image.height) || 0 };
  return { width: 0, height: 0 };
}

function scaleParts(scale: SpriteRenderData["scale"]) {
  if (typeof scale === "number") return { x: scale, y: scale };
  return { x: scale?.x ?? 1, y: scale?.y ?? 1 };
}

function anchorOffset(anchor: RenderAnchor | undefined, width: number, height: number) {
  if (!anchor) return { x: 0, y: 0 };
  if (typeof anchor === "object") return { x: (anchor.x ?? 0) * width, y: (anchor.y ?? 0) * height };
  const x = anchor.includes("right") ? width : anchor === "top" || anchor === "center" || anchor === "bottom" ? width / 2 : 0;
  const y = anchor.includes("bottom") ? height : anchor === "left" || anchor === "center" || anchor === "right" ? height / 2 : 0;
  return { x, y };
}

function fontString(data: TextRenderData | TextBlockRenderData | LabelRenderData) {
  if (data.font) return data.font;
  return `normal ${data.weight ?? 400} ${data.size ?? 14}px ${data.family ?? "sans-serif"}`;
}

const RENDER_GRADIENT_CACHE_LIMIT = 64;
const RENDER_LINE_DASH_CACHE_LIMIT = 64;
const RENDER_TEXT_CACHE_LIMIT = 128;
const EMPTY_LINE_DASH: readonly number[] = [];

type RenderDrawCaches = {
  gradients: Map<string, CanvasGradient>;
  lineDashes: Map<string, readonly number[]>;
  textBlocks: Map<string, readonly string[]>;
  labels: Map<string, string>;
};

const drawCaches = new WeakMap<CanvasRenderingContext2D, RenderDrawCaches>();

function renderDrawCachesEnvironmentValue(): string | undefined {
  const processValue = Reflect.get(globalThis, "process");
  if (typeof processValue !== "object" || processValue === null) return undefined;
  const environment = Reflect.get(processValue, "env");
  if (typeof environment !== "object" || environment === null) return undefined;
  const value = Reflect.get(environment, "ENGINE_RENDER_DRAW_DATA_CACHES");
  return typeof value === "string" ? value : undefined;
}

function renderDrawCachesEnabled(state?: RenderDrawContext) {
  if (state?.drawDataCaches !== undefined) return state.drawDataCaches;
  const value = renderDrawCachesEnvironmentValue();
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function drawCache(ctx: CanvasRenderingContext2D) {
  let cache = drawCaches.get(ctx);
  if (!cache) {
    cache = {
      gradients: new Map(),
      lineDashes: new Map(),
      textBlocks: new Map(),
      labels: new Map()
    };
    drawCaches.set(ctx, cache);
  }
  return cache;
}

function putBounded<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  if (!cache.has(key) && cache.size >= limit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
  return value;
}

function colorStopsKey(stops: readonly RenderColorStop[]) {
  let key = "";
  for (let i = 0; i < stops.length; i += 1) {
    const { offset, color } = colorStopParts(stops[i]);
    key += `${i === 0 ? "" : "|"}${Math.max(0, Math.min(1, offset))}:${color}`;
  }
  return key;
}

function gradientKey(paint: RenderGradientPaint) {
  if (paint.kind === "linear-gradient") {
    return `l:${paint.x0},${paint.y0},${paint.x1},${paint.y1}:${colorStopsKey(paint.stops)}`;
  }
  return `r:${paint.x0},${paint.y0},${paint.r0},${paint.x1},${paint.y1},${paint.r1}:${colorStopsKey(paint.stops)}`;
}

function lineDashKey(dash: readonly number[] | undefined) {
  return dash && dash.length > 0 ? dash.join(",") : "";
}

function hasScopedRenderState(data: BaseRenderData) {
  return data.alpha !== undefined
    || Boolean(data.composite)
    || Boolean(data.blendMode)
    || Boolean(data.shadowColor)
    || data.shadowBlur !== undefined
    || data.shadowOffsetX !== undefined
    || data.shadowOffsetY !== undefined;
}

function withAlpha(ctx: CanvasRenderingContext2D, options: number | BaseRenderData | undefined, draw: () => void) {
  ctx.save();
  const data = typeof options === "object" ? options : undefined;
  const alpha = typeof options === "number" ? options : data?.alpha;
  if (alpha !== undefined) ctx.globalAlpha *= alpha;
  if (data?.composite || data?.blendMode) ctx.globalCompositeOperation = data.composite ?? data.blendMode ?? "source-over";
  if (data?.shadowColor) ctx.shadowColor = data.shadowColor;
  if (data?.shadowBlur !== undefined) ctx.shadowBlur = data.shadowBlur;
  if (data?.shadowOffsetX !== undefined) ctx.shadowOffsetX = data.shadowOffsetX;
  if (data?.shadowOffsetY !== undefined) ctx.shadowOffsetY = data.shadowOffsetY;
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

function colorStopParts(stop: RenderColorStop): { offset: number; color: string } {
  if ("offset" in stop) return stop;
  return { offset: stop[0], color: stop[1] };
}

function addColorStops(gradient: CanvasGradient, stops: readonly RenderColorStop[]) {
  for (const stop of stops) {
    const { offset, color } = colorStopParts(stop);
    gradient.addColorStop(Math.max(0, Math.min(1, offset)), color);
  }
  return gradient;
}

function resolvePaint(ctx: CanvasRenderingContext2D, paint: RenderPaint, state: RenderDrawContext): RenderResolvedPaint | undefined {
  if (typeof paint === "function") return paint(ctx, state);
  if (typeof paint === "object" && "kind" in paint) {
    if (!renderDrawCachesEnabled(state)) {
      return paint.kind === "linear-gradient"
        ? addColorStops(ctx.createLinearGradient(paint.x0, paint.y0, paint.x1, paint.y1), paint.stops)
        : addColorStops(ctx.createRadialGradient(paint.x0, paint.y0, paint.r0, paint.x1, paint.y1, paint.r1), paint.stops);
    }
    const cache = drawCache(ctx).gradients;
    const key = gradientKey(paint);
    const cached = cache.get(key);
    if (cached) return cached;
    const gradient = paint.kind === "linear-gradient"
      ? addColorStops(ctx.createLinearGradient(paint.x0, paint.y0, paint.x1, paint.y1), paint.stops)
      : addColorStops(ctx.createRadialGradient(paint.x0, paint.y0, paint.r0, paint.x1, paint.y1, paint.r1), paint.stops);
    return putBounded(cache, key, gradient, RENDER_GRADIENT_CACHE_LIMIT);
  }
  return paint;
}

function setFillStyle(ctx: CanvasRenderingContext2D, paint: RenderPaint, state: RenderDrawContext) {
  const resolved = resolvePaint(ctx, paint, state);
  if (!resolved) return false;
  ctx.fillStyle = resolved;
  return true;
}

function setStrokeStyle(ctx: CanvasRenderingContext2D, paint: RenderPaint, state: RenderDrawContext) {
  const resolved = resolvePaint(ctx, paint, state);
  if (!resolved) return false;
  ctx.strokeStyle = resolved;
  return true;
}

function applyLineStyle(ctx: CanvasRenderingContext2D, options: RenderStrokeOptions, state: RenderDrawContext) {
  ctx.lineWidth = options.lineWidth ?? 1;
  ctx.lineCap = options.cap ?? "butt";
  ctx.lineJoin = options.join ?? "miter";
  const dash = options.lineDash ?? options.dash;
  if ("setLineDash" in ctx) {
    if (!renderDrawCachesEnabled(state)) {
      ctx.setLineDash(dash ? [...dash] : []);
    } else {
      const key = lineDashKey(dash);
      const cache = drawCache(ctx).lineDashes;
      const cached = cache.get(key);
      const lineDash = cached ?? putBounded(cache, key, dash && dash.length > 0 ? [...dash] : EMPTY_LINE_DASH, RENDER_LINE_DASH_CACHE_LIMIT);
      ctx.setLineDash(lineDash);
    }
  }
  const dashOffset = options.lineDashOffset ?? options.dashOffset;
  ctx.lineDashOffset = dashOffset ?? 0;
}

function applyStrokeFill(
  ctx: CanvasRenderingContext2D,
  options: RenderFillStrokeOptions,
  state: RenderDrawContext
) {
  if (options.fill && setFillStyle(ctx, options.fill, state)) {
    ctx.fill();
  }
  if (options.stroke && setStrokeStyle(ctx, options.stroke, state)) {
    applyLineStyle(ctx, options, state);
    ctx.stroke();
  }
}

function drawSpriteData(ctx: CanvasRenderingContext2D, data: SpriteRenderData) {
  if (data.visible === false) return false;
  const size = imageSize(data.image);
  const sx = data.sourceX ?? 0;
  const sy = data.sourceY ?? 0;
  const sw = data.sourceWidth ?? size.width;
  const sh = data.sourceHeight ?? size.height;
  const dw = data.width ?? sw;
  const dh = data.height ?? sh;
  const anchor = anchorOffset(data.anchor, dw, dh);
  const scale = scaleParts(data.scale);

  withAlpha(ctx, data, () => {
    ctx.translate(data.x ?? 0, data.y ?? 0);
    if (data.rotation) ctx.rotate(data.rotation);
    ctx.scale((data.flipX ? -1 : 1) * scale.x, (data.flipY ? -1 : 1) * scale.y);
    ctx.drawImage(data.image, sx, sy, sw, sh, -anchor.x, -anchor.y, dw, dh);
  });
  return true;
}

function drawRectData(ctx: CanvasRenderingContext2D, data: RectRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  withAlpha(ctx, data, () => {
    if (data.fill && setFillStyle(ctx, data.fill, state)) {
      ctx.fillRect(data.x ?? 0, data.y ?? 0, data.width, data.height);
    }
    if (data.stroke && setStrokeStyle(ctx, data.stroke, state)) {
      applyLineStyle(ctx, data, state);
      ctx.strokeRect(data.x ?? 0, data.y ?? 0, data.width, data.height);
    }
  });
  return true;
}

function drawCircleData(ctx: CanvasRenderingContext2D, data: CircleRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  withAlpha(ctx, data, () => {
    ctx.beginPath();
    ctx.arc(data.x ?? 0, data.y ?? 0, data.radius, 0, Math.PI * 2);
    applyStrokeFill(ctx, data, state);
  });
  return true;
}

function drawEllipseData(ctx: CanvasRenderingContext2D, data: EllipseRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  withAlpha(ctx, data, () => {
    ctx.beginPath();
    ctx.ellipse(
      data.x ?? 0,
      data.y ?? 0,
      Math.max(0, data.radiusX),
      Math.max(0, data.radiusY),
      data.rotation ?? 0,
      data.startAngle ?? 0,
      data.endAngle ?? Math.PI * 2,
      data.counterclockwise ?? false
    );
    applyStrokeFill(ctx, data, state);
  });
  return true;
}

function drawLineData(ctx: CanvasRenderingContext2D, data: LineRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  withAlpha(ctx, data, () => {
    ctx.beginPath();
    ctx.moveTo(data.x1, data.y1);
    ctx.lineTo(data.x2, data.y2);
    if (setStrokeStyle(ctx, data.stroke ?? "#fff", state)) {
      applyLineStyle(ctx, data, state);
      ctx.stroke();
    }
  });
  return true;
}

function pointX(point: RenderPoint) {
  return "x" in point ? point.x : point[0];
}

function pointY(point: RenderPoint) {
  return "y" in point ? point.y : point[1];
}

function isFlatPointBuffer(points: RenderPointBuffer): points is ArrayLike<number> {
  return points.length > 0 && typeof points[0] === "number";
}

type RenderPointRange =
  | { flat: true; points: ArrayLike<number>; offset: number; count: number }
  | { flat: false; points: readonly RenderPoint[]; offset: number; count: number };

function pointRange(data: PolylineRenderData | PolygonRenderData) {
  if (isFlatPointBuffer(data.points)) {
    const available = Math.floor(data.points.length / 2);
    const offset = Math.max(0, Math.min(available, Math.floor(data.pointOffset ?? 0)));
    const count = Math.max(0, Math.min(available - offset, Math.floor(data.pointCount ?? (available - offset))));
    const range: RenderPointRange = { flat: true, points: data.points, offset, count };
    return range;
  }
  const available = data.points.length;
  const offset = Math.max(0, Math.min(available, Math.floor(data.pointOffset ?? 0)));
  const count = Math.max(0, Math.min(available - offset, Math.floor(data.pointCount ?? (available - offset))));
  const range: RenderPointRange = { flat: false, points: data.points, offset, count };
  return range;
}

function dataPointX(range: RenderPointRange, index: number) {
  if (range.flat) return range.points[index * 2];
  const point = range.points[index];
  return pointX(point);
}

function dataPointY(range: RenderPointRange, index: number) {
  if (range.flat) return range.points[index * 2 + 1];
  const point = range.points[index];
  return pointY(point);
}

function drawPolylineData(ctx: CanvasRenderingContext2D, data: PolylineRenderData, state: RenderDrawContext) {
  const range = pointRange(data);
  if (data.visible === false || range.count < 2) return false;
  withAlpha(ctx, data, () => {
    ctx.beginPath();
    ctx.moveTo(dataPointX(range, range.offset), dataPointY(range, range.offset));
    for (let i = 1; i < range.count; i += 1) {
      const index = range.offset + i;
      ctx.lineTo(dataPointX(range, index), dataPointY(range, index));
    }
    if (setStrokeStyle(ctx, data.stroke ?? "#fff", state)) {
      applyLineStyle(ctx, data, state);
      ctx.stroke();
    }
  });
  return true;
}

function drawPolygonData(ctx: CanvasRenderingContext2D, data: PolygonRenderData, state: RenderDrawContext) {
  const range = pointRange(data);
  if (data.visible === false || range.count < 3) return false;
  withAlpha(ctx, data, () => {
    ctx.beginPath();
    ctx.moveTo(dataPointX(range, range.offset), dataPointY(range, range.offset));
    for (let i = 1; i < range.count; i += 1) {
      const index = range.offset + i;
      ctx.lineTo(dataPointX(range, index), dataPointY(range, index));
    }
    ctx.closePath();
    applyStrokeFill(ctx, data, state);
  });
  return true;
}

function drawPathData(ctx: CanvasRenderingContext2D, data: PathRenderData, state: RenderDrawContext) {
  if (data.visible === false || data.commands.length === 0) return false;
  withAlpha(ctx, data, () => {
    ctx.beginPath();
    for (const command of data.commands) {
      switch (command.kind) {
        case "moveTo":
          ctx.moveTo(command.x, command.y);
          break;
        case "lineTo":
          ctx.lineTo(command.x, command.y);
          break;
        case "quadraticCurveTo":
          ctx.quadraticCurveTo(command.cpx, command.cpy, command.x, command.y);
          break;
        case "bezierCurveTo":
          ctx.bezierCurveTo(command.cp1x, command.cp1y, command.cp2x, command.cp2y, command.x, command.y);
          break;
        case "arc":
          ctx.arc(command.x, command.y, command.radius, command.startAngle, command.endAngle, command.counterclockwise ?? false);
          break;
        case "ellipse":
          ctx.ellipse(
            command.x,
            command.y,
            Math.max(0, command.radiusX),
            Math.max(0, command.radiusY),
            command.rotation ?? 0,
            command.startAngle,
            command.endAngle,
            command.counterclockwise ?? false
          );
          break;
        case "closePath":
          ctx.closePath();
          break;
      }
    }
    applyStrokeFill(ctx, data, state);
  });
  return true;
}

function drawTextData(ctx: CanvasRenderingContext2D, data: TextRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  withAlpha(ctx, data, () => {
    ctx.font = fontString(data);
    ctx.textAlign = data.align ?? "left";
    ctx.textBaseline = data.baseline ?? "alphabetic";
    if (data.lineWidth !== undefined) ctx.lineWidth = data.lineWidth;
    if (setFillStyle(ctx, data.fill ?? "#fff", state)) {
      if (data.maxWidth !== undefined) ctx.fillText(data.text, data.x ?? 0, data.y ?? 0, data.maxWidth);
      else ctx.fillText(data.text, data.x ?? 0, data.y ?? 0);
    }
    if (data.stroke && setStrokeStyle(ctx, data.stroke, state)) {
      if (data.maxWidth !== undefined) ctx.strokeText(data.text, data.x ?? 0, data.y ?? 0, data.maxWidth);
      else ctx.strokeText(data.text, data.x ?? 0, data.y ?? 0);
    }
  });
  return true;
}

function drawTextBlockData(ctx: CanvasRenderingContext2D, data: TextBlockRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  if (data.maxWidth <= 0) return false;
  const font = fontString(data);
  const lineHeight = Math.max(1, data.lineHeight ?? (data.size ?? 14) * 1.2);
  const textKey = `${font}|${data.maxWidth}|${data.maxLines ?? ""}|${data.ellipsis ?? ""}|${data.text}`;
  let lines: readonly string[];
  if (renderDrawCachesEnabled(state)) {
    const textBlockCache = drawCache(ctx).textBlocks;
    lines = textBlockCache.get(textKey) ?? putBounded(
      textBlockCache,
      textKey,
      wrapText(ctx, data.text, data.maxWidth, {
        font,
        maxLines: data.maxLines,
        ellipsis: data.ellipsis
      }),
      RENDER_TEXT_CACHE_LIMIT
    );
  } else {
    lines = wrapText(ctx, data.text, data.maxWidth, {
      font,
      maxLines: data.maxLines,
      ellipsis: data.ellipsis
    });
  }

  withAlpha(ctx, data, () => {
    ctx.font = font;
    ctx.textAlign = data.align ?? "left";
    ctx.textBaseline = data.baseline ?? "top";
    if (data.lineWidth !== undefined) ctx.lineWidth = data.lineWidth;
    const hasFill = setFillStyle(ctx, data.fill ?? "#fff", state);
    const hasStroke = data.stroke ? setStrokeStyle(ctx, data.stroke, state) : false;
    for (let i = 0; i < lines.length; i += 1) {
      const x = data.x ?? 0;
      const y = (data.y ?? 0) + i * lineHeight;
      if (hasStroke) ctx.strokeText(lines[i], x, y, data.maxWidth);
      if (hasFill) ctx.fillText(lines[i], x, y, data.maxWidth);
    }
  });
  return true;
}

function drawBarData(ctx: CanvasRenderingContext2D, data: BarRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  const max = data.max ?? 1;
  const ratio = max > 0 ? Math.max(0, Math.min(1, data.value / max)) : 0;
  withAlpha(ctx, data, () => {
    const x = data.x ?? 0;
    const y = data.y ?? 0;
    if (data.background && setFillStyle(ctx, data.background, state)) {
      ctx.fillRect(x, y, data.width, data.height);
    }
    if (data.fill && ratio > 0 && setFillStyle(ctx, data.fill, state)) {
      if (data.vertical) {
        const fillHeight = data.height * ratio;
        ctx.fillRect(x, y + data.height - fillHeight, data.width, fillHeight);
      } else {
        ctx.fillRect(x, y, data.width * ratio, data.height);
      }
    }
    if (data.stroke && setStrokeStyle(ctx, data.stroke, state)) {
      applyLineStyle(ctx, data, state);
      ctx.strokeRect(x, y, data.width, data.height);
    }
  });
  return true;
}

function drawLabelData(ctx: CanvasRenderingContext2D, data: LabelRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  const padding = data.padding ?? 4;
  const font = fontString(data);
  let text = data.text;
  if (data.maxWidth) {
    const labelKey = `${font}|${data.maxWidth}|${data.text}`;
    if (renderDrawCachesEnabled(state)) {
      const labelCache = drawCache(ctx).labels;
      text = labelCache.get(labelKey) ?? putBounded(
        labelCache,
        labelKey,
        truncateText(ctx, data.text, data.maxWidth, { font, ellipsis: "..." }),
        RENDER_TEXT_CACHE_LIMIT
      );
    } else {
      text = truncateText(ctx, data.text, data.maxWidth, { font, ellipsis: "..." });
    }
  }
  withAlpha(ctx, data, () => {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = data.maxWidth ?? ctx.measureText(text).width + padding * 2;
    const height = (data.size ?? 14) + padding * 2;
    const x = data.x ?? 0;
    const y = data.y ?? 0;
    if (data.background && setFillStyle(ctx, data.background, state)) {
      ctx.fillRect(x - width / 2, y - height / 2, width, height);
    }
    if (data.stroke && setStrokeStyle(ctx, data.stroke, state)) {
      ctx.strokeRect(x - width / 2, y - height / 2, width, height);
    }
    if (setFillStyle(ctx, data.fill ?? "#fff", state)) {
      ctx.fillText(text, x, y, Math.max(1, width - padding * 2));
    }
  });
  return true;
}

function drawOutlineData(ctx: CanvasRenderingContext2D, data: InteractionOutlineRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  const inset = data.inset ?? 0;
  const x = (data.x ?? 0) + inset;
  const y = (data.y ?? 0) + inset;
  const width = data.width - inset * 2;
  const height = data.height - inset * 2;
  withAlpha(ctx, data, () => {
    const strokeOptions = { ...data, lineWidth: data.lineWidth ?? 2 };
    if (data.shape === "circle") {
      ctx.beginPath();
      ctx.arc(x + width / 2, y + height / 2, Math.max(width, height) / 2, 0, Math.PI * 2);
      applyStrokeFill(ctx, { ...strokeOptions, fill: data.fill, stroke: data.stroke ?? (data.fill ? undefined : "#fff") }, state);
    } else if (data.shape === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, Math.max(0, width / 2), Math.max(0, height / 2), 0, 0, Math.PI * 2);
      applyStrokeFill(ctx, { ...strokeOptions, fill: data.fill, stroke: data.stroke ?? (data.fill ? undefined : "#fff") }, state);
    } else {
      if (data.fill && setFillStyle(ctx, data.fill, state)) {
        ctx.fillRect(x, y, width, height);
      }
      const stroke = data.stroke ?? (data.fill ? undefined : "#fff");
      if (stroke && setStrokeStyle(ctx, stroke, state)) {
        applyLineStyle(ctx, strokeOptions, state);
        ctx.strokeRect(x, y, width, height);
      }
    }
  });
  return true;
}

function drawGroupData(ctx: CanvasRenderingContext2D, data: GroupRenderData, state: RenderDrawContext) {
  if (data.visible === false) return false;
  let drawn = false;
  withAlpha(ctx, data, () => {
    for (const call of data.calls) {
      drawn = drawRenderable(ctx, call, state) || drawn;
    }
  });
  return drawn;
}

export function drawRenderable(ctx: CanvasRenderingContext2D, call: Renderable, state: RenderDrawContext) {
  if (typeof call === "function") {
    call(ctx, state);
    return true;
  }
  if (call.visible === false) return false;
  if ("draw" in call && typeof call.draw === "function") {
    if (hasScopedRenderState(call)) {
      withAlpha(ctx, call, () => call.draw(ctx, state));
    } else {
      call.draw(ctx, state);
    }
    return true;
  }
  if ("image" in call && call.image) return drawSpriteData(ctx, call);
  switch (call.kind) {
    case "rect":
      return drawRectData(ctx, call, state);
    case "circle":
      return drawCircleData(ctx, call, state);
    case "ellipse":
      return drawEllipseData(ctx, call, state);
    case "line":
      return drawLineData(ctx, call, state);
    case "polyline":
      return drawPolylineData(ctx, call, state);
    case "polygon":
      return drawPolygonData(ctx, call, state);
    case "path":
      return drawPathData(ctx, call, state);
    case "text":
      return drawTextData(ctx, call, state);
    case "text-block":
      return drawTextBlockData(ctx, call, state);
    case "bar":
      return drawBarData(ctx, call, state);
    case "label":
      return drawLabelData(ctx, call, state);
    case "outline":
      return drawOutlineData(ctx, call, state);
    case "group":
      return drawGroupData(ctx, call, state);
    default:
      return false;
  }
}

export function createBarDrawCall(options: Omit<BarRenderData, "kind">): BarRenderData {
  return { kind: "bar", ...options };
}

export function createLabelDrawCall(options: Omit<LabelRenderData, "kind">): LabelRenderData {
  return { kind: "label", ...options };
}

export function createInteractionOutlineDrawCall(options: Omit<InteractionOutlineRenderData, "kind">): InteractionOutlineRenderData {
  return { kind: "outline", ...options };
}

export function createTextBlockDrawCall(options: Omit<TextBlockRenderData, "kind">): TextBlockRenderData {
  return { kind: "text-block", ...options };
}

export function createLinearGradientPaint(options: Omit<RenderLinearGradientPaint, "kind">): RenderLinearGradientPaint {
  return { kind: "linear-gradient", ...options };
}

export function createRadialGradientPaint(options: Omit<RenderRadialGradientPaint, "kind">): RenderRadialGradientPaint {
  return { kind: "radial-gradient", ...options };
}

export const defaultDrawState: RenderDrawContext = {
  camera: {},
  layer: "direct",
  layerOptions: { sort: "none", ignoreCamera: true, order: 0 },
  order: 0,
  drawDataCaches: false
};
