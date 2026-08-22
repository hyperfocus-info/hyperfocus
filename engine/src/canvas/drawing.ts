type CanvasImageSourceLike = CanvasImageSource;

export type Anchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";

export type SpriteAsset = {
  image: CanvasImageSourceLike;
  width?: number;
  height?: number;
};

export type SpriteOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  width?: number;
  height?: number;
  scale?: number | { x?: number; y?: number };
  rotation?: number;
  alpha?: number;
  anchor?: Anchor | { x?: number; y?: number };
  flipX?: boolean;
  flipY?: boolean;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
};

export type SpriteSliceOptions = SpriteOptions & {
  frameWidth: number;
  frameHeight: number;
  columns?: number;
  margin?: number;
  spacing?: number;
};

export type SpriteBatchFrame = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  width?: number;
  height?: number;
};

export type SpriteBatchFrames = readonly SpriteBatchFrame[] | Record<string, SpriteBatchFrame>;

export type SpriteBatchEntry = {
  x: number;
  y: number;
  frame?: number | string;
  width?: number;
  height?: number;
  alpha?: number;
  visible?: boolean;
};

export type SpriteBatchFrameGridOptions = {
  image?: CanvasImageSourceLike | SpriteAsset;
  frameWidth: number;
  frameHeight: number;
  columns?: number;
  rows?: number;
  count?: number;
  margin?: number;
  spacing?: number;
  width?: number;
  height?: number;
};

export type SpriteBatchOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  frames: SpriteBatchFrames;
  alpha?: number;
};

export type SpriteBatchResult = {
  drawn: number;
  skipped: number;
};

export type StrokeFillOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  fill?: string | CanvasGradient | CanvasPattern;
  stroke?: string | CanvasGradient | CanvasPattern;
  lineWidth?: number;
  alpha?: number;
};

export type LineOptions = Omit<StrokeFillOptions, "fill"> & {
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
};

export type TransformOptions = {
  ctx?: CanvasRenderingContext2D;
  context?: CanvasRenderingContext2D;
  x?: number;
  y?: number;
  translateX?: number;
  translateY?: number;
  rotation?: number;
  scale?: number | { x?: number; y?: number };
  alpha?: number;
};

const spriteAssets = new Map<string, SpriteAsset>();
const transformDepth = new WeakMap<CanvasRenderingContext2D, number>();

let activeContext: CanvasRenderingContext2D | undefined;

export function getDrawContext(options?: { ctx?: CanvasRenderingContext2D; context?: CanvasRenderingContext2D }) {
  const ctx = options?.ctx ?? options?.context ?? activeContext;
  if (!ctx) throw new Error("No canvas context available. Pass { ctx } or call setDrawContext(ctx).");
  return ctx;
}

function sourceSize(image: CanvasImageSourceLike) {
  if ("naturalWidth" in image && image.naturalWidth) return { width: image.naturalWidth, height: image.naturalHeight };
  if ("videoWidth" in image && image.videoWidth) return { width: image.videoWidth, height: image.videoHeight };
  if ("width" in image && "height" in image) return { width: Number(image.width) || 0, height: Number(image.height) || 0 };
  return { width: 0, height: 0 };
}

function anchorOffset(anchor: SpriteOptions["anchor"], width: number, height: number) {
  if (!anchor) return { x: 0, y: 0 };
  if (typeof anchor === "object") return { x: (anchor.x ?? 0) * width, y: (anchor.y ?? 0) * height };
  const x = anchor.includes("right") ? width : anchor === "top" || anchor === "center" || anchor === "bottom" ? width / 2 : 0;
  const y = anchor.includes("bottom") ? height : anchor === "left" || anchor === "center" || anchor === "right" ? height / 2 : 0;
  return { x, y };
}

function scaleParts(scale: SpriteOptions["scale"]) {
  if (typeof scale === "number") return { x: scale, y: scale };
  return { x: scale?.x ?? 1, y: scale?.y ?? 1 };
}

function withState(ctx: CanvasRenderingContext2D, alpha: number | undefined, draw: () => void) {
  ctx.save();
  try {
    if (alpha !== undefined) ctx.globalAlpha *= alpha;
    draw();
  } finally {
    ctx.restore();
  }
}

function assertPositiveNumber(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function batchGridSize(image: CanvasImageSourceLike | SpriteAsset | undefined) {
  if (!image) return { width: 0, height: 0 };
  if ("image" in image) {
    const size = sourceSize(image.image);
    return { width: image.width ?? size.width, height: image.height ?? size.height };
  }
  return sourceSize(image);
}

function resolveBatchFrame(frames: SpriteBatchFrames, frame: number | string | undefined) {
  const key = frame ?? 0;
  if (Array.isArray(frames)) {
    const index = typeof key === "number" ? key : Number(key);
    return Number.isInteger(index) ? frames[index] : undefined;
  }
  return (frames as Record<string, SpriteBatchFrame>)[String(key)];
}

export function setDrawContext(ctx: CanvasRenderingContext2D | undefined) {
  activeContext = ctx;
}

export function registerSprite(id: string, image: CanvasImageSourceLike | SpriteAsset) {
  spriteAssets.set(id, "image" in image ? image : { image });
}

export function unregisterSprite(id: string) {
  spriteAssets.delete(id);
}

export function getSprite(id: string) {
  return spriteAssets.get(id);
}

export function drawSprite(id: string, x: number, y: number, options: SpriteOptions = {}) {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const ctx = getDrawContext(options);
  const size = sourceSize(asset.image);
  const sx = options.sourceX ?? 0;
  const sy = options.sourceY ?? 0;
  const sw = options.sourceWidth ?? asset.width ?? size.width;
  const sh = options.sourceHeight ?? asset.height ?? size.height;
  const dw = options.width ?? sw;
  const dh = options.height ?? sh;
  const anchor = anchorOffset(options.anchor, dw, dh);
  const scale = scaleParts(options.scale);

  withState(ctx, options.alpha, () => {
    ctx.translate(x, y);
    if (options.rotation) ctx.rotate(options.rotation);
    ctx.scale((options.flipX ? -1 : 1) * scale.x, (options.flipY ? -1 : 1) * scale.y);
    ctx.drawImage(asset.image, sx, sy, sw, sh, -anchor.x, -anchor.y, dw, dh);
  });
}

export function drawSpriteSlice(id: string, x: number, y: number, frameIndex: number, options: SpriteSliceOptions) {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const size = sourceSize(asset.image);
  const columns = options.columns ?? Math.max(1, Math.floor(size.width / options.frameWidth));
  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const frameX = frameIndex % columns;
  const frameY = Math.floor(frameIndex / columns);
  drawSprite(id, x, y, {
    ...options,
    sourceX: options.sourceX ?? margin + frameX * (options.frameWidth + spacing),
    sourceY: options.sourceY ?? margin + frameY * (options.frameHeight + spacing),
    sourceWidth: options.sourceWidth ?? options.frameWidth,
    sourceHeight: options.sourceHeight ?? options.frameHeight,
    width: options.width ?? options.frameWidth,
    height: options.height ?? options.frameHeight
  });
}

export function createSpriteBatchFrames(options: SpriteBatchFrameGridOptions) {
  assertPositiveNumber("frameWidth", options.frameWidth);
  assertPositiveNumber("frameHeight", options.frameHeight);

  const margin = options.margin ?? 0;
  const spacing = options.spacing ?? 0;
  const size = batchGridSize(options.image);
  const columns = options.columns ?? Math.max(1, Math.floor((size.width - margin * 2 + spacing) / (options.frameWidth + spacing)));
  const rows = options.rows ?? (size.height > 0 ? Math.max(1, Math.floor((size.height - margin * 2 + spacing) / (options.frameHeight + spacing))) : 1);
  const count = options.count ?? columns * rows;

  if (!Number.isInteger(columns) || columns <= 0) throw new RangeError("columns must be a positive integer");
  if (!Number.isInteger(rows) || rows <= 0) throw new RangeError("rows must be a positive integer");
  if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be a non-negative integer");

  const frames: SpriteBatchFrame[] = [];
  for (let index = 0; index < count; index += 1) {
    const frameX = index % columns;
    const frameY = Math.floor(index / columns);
    frames.push({
      sourceX: margin + frameX * (options.frameWidth + spacing),
      sourceY: margin + frameY * (options.frameHeight + spacing),
      sourceWidth: options.frameWidth,
      sourceHeight: options.frameHeight,
      width: options.width ?? options.frameWidth,
      height: options.height ?? options.frameHeight
    });
  }
  return frames;
}

export function drawSpriteBatch(id: string, entries: readonly SpriteBatchEntry[], options: SpriteBatchOptions): SpriteBatchResult {
  const asset = spriteAssets.get(id);
  if (!asset) throw new Error(`Sprite not registered: ${id}`);
  const ctx = getDrawContext(options);
  const originalAlpha = ctx.globalAlpha;
  let currentAlpha = originalAlpha;
  const batchAlpha = options.alpha ?? 1;
  let drawn = 0;
  let skipped = 0;

  try {
    for (const entry of entries) {
      if (entry.visible === false) {
        skipped += 1;
        continue;
      }

      const frame = resolveBatchFrame(options.frames, entry.frame);
      const alpha = batchAlpha * (entry.alpha ?? 1);
      if (!frame || alpha <= 0) {
        skipped += 1;
        continue;
      }

      const targetAlpha = originalAlpha * alpha;
      if (currentAlpha !== targetAlpha) {
        ctx.globalAlpha = targetAlpha;
        currentAlpha = targetAlpha;
      }
      ctx.drawImage(
        asset.image,
        frame.sourceX,
        frame.sourceY,
        frame.sourceWidth,
        frame.sourceHeight,
        entry.x,
        entry.y,
        entry.width ?? frame.width ?? frame.sourceWidth,
        entry.height ?? frame.height ?? frame.sourceHeight
      );
      drawn += 1;
    }
  } finally {
    ctx.globalAlpha = originalAlpha;
  }

  return { drawn, skipped };
}

export function drawRect(x: number, y: number, width: number, height: number, options: StrokeFillOptions = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    if (options.fill) {
      ctx.fillStyle = options.fill;
      ctx.fillRect(x, y, width, height);
    }
    if (options.stroke) {
      ctx.strokeStyle = options.stroke;
      ctx.lineWidth = options.lineWidth ?? 1;
      ctx.strokeRect(x, y, width, height);
    }
  });
}

export function drawCircle(x: number, y: number, radius: number, options: StrokeFillOptions = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    fillStroke(ctx, options);
  });
}

export function drawLine(x1: number, y1: number, x2: number, y2: number, options: LineOptions = {}) {
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.lineCap = options.cap ?? ctx.lineCap;
    ctx.lineJoin = options.join ?? ctx.lineJoin;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = options.stroke ?? "#fff";
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.stroke();
  });
}

export function drawPolygon(points: Array<{ x: number; y: number }>, options: StrokeFillOptions = {}) {
  if (points.length < 2) return;
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y);
    ctx.closePath();
    fillStroke(ctx, options);
  });
}

/** Allocation-free polygon drawing from interleaved x/y values. */
export function drawPolygonFlat(points: ArrayLike<number>, pointOffset = 0, pointCount = Math.floor(points.length / 2) - pointOffset, options: StrokeFillOptions = {}) {
  if (!Number.isSafeInteger(pointOffset) || pointOffset < 0 || !Number.isSafeInteger(pointCount) || pointCount < 0) {
    throw new RangeError("flat polygon pointOffset and pointCount must be non-negative safe integers");
  }
  const available = Math.floor(points.length / 2);
  if (pointOffset + pointCount > available) throw new RangeError("flat polygon point range exceeds the buffer");
  if (pointCount < 2) return;
  const ctx = getDrawContext(options);
  withState(ctx, options.alpha, () => {
    ctx.beginPath();
    ctx.moveTo(points[pointOffset * 2], points[pointOffset * 2 + 1]);
    for (let index = pointOffset + 1; index < pointOffset + pointCount; index += 1) ctx.lineTo(points[index * 2], points[index * 2 + 1]);
    ctx.closePath();
    fillStroke(ctx, options);
  });
}

function fillStroke(ctx: CanvasRenderingContext2D, options: StrokeFillOptions) {
  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }
  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth ?? 1;
    ctx.stroke();
  }
}

export function pushTransform(options: TransformOptions = {}) {
  const ctx = getDrawContext(options);
  ctx.save();
  transformDepth.set(ctx, (transformDepth.get(ctx) ?? 0) + 1);
  if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
  ctx.translate(options.x ?? options.translateX ?? 0, options.y ?? options.translateY ?? 0);
  if (options.rotation) ctx.rotate(options.rotation);
  const scale = scaleParts(options.scale);
  ctx.scale(scale.x, scale.y);
}

export function popTransform(options: { ctx?: CanvasRenderingContext2D; context?: CanvasRenderingContext2D } = {}) {
  const ctx = getDrawContext(options);
  const depth = transformDepth.get(ctx) ?? 0;
  if (depth <= 0) return false;
  ctx.restore();
  transformDepth.set(ctx, depth - 1);
  return true;
}
