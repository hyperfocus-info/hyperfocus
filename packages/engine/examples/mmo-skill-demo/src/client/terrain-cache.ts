import { drawRenderable, type RenderDrawContext, type Renderable } from "@hyperfocus/engine/render";

const CHUNK_DRAW_STATE: RenderDrawContext = {
  camera: {},
  layer: "terrain-cache",
  layerOptions: { sort: "none", ignoreCamera: false, order: 0, cullRect: undefined },
  order: 0,
  drawDataCaches: true
};

function hasFunction(value: object, name: string) {
  return typeof Reflect.get(value, name) === "function";
}

function isCanvas2dContext(value: unknown): value is CanvasRenderingContext2D {
  return typeof value === "object" && value !== null
    && ["clearRect", "save", "restore", "translate", "drawImage", "fillRect", "strokeRect", "beginPath", "arc",
      "ellipse", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "closePath", "fill", "stroke", "fillText",
      "strokeText", "measureText", "setLineDash", "createLinearGradient", "createRadialGradient"].every((name) => hasFunction(value, name));
}

function isHtmlCanvas(value: unknown): value is HTMLCanvasElement {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "width") === "number"
    && typeof Reflect.get(value, "height") === "number"
    && hasFunction(value, "getContext");
}

function createFallbackCanvasContext(width: number, height: number) {
  const gradient = { addColorStop() {} };
  const context = {
    canvas: { width, height },
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    scale() {},
    rotate() {},
    translate() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    drawImage() {},
    beginPath() {},
    rect() {},
    clip() {},
    arc() {},
    ellipse() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillText() {},
    strokeText() {},
    measureText(text: string) {
      return { width: text.length * 7 };
    },
    setLineDash() {},
    createLinearGradient() {
      return gradient;
    },
    createRadialGradient() {
      return gradient;
    }
  };
  if (!isCanvas2dContext(context)) throw new Error("Fallback terrain context is missing a drawing operation");
  return context;
}

function createChunkCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const doc = typeof document === "undefined" ? undefined : document;
  if (doc?.createElement) {
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  const context = createFallbackCanvasContext(width, height);
  const canvas = {
    width,
    height,
    getContext: () => context
  };
  if (!isHtmlCanvas(canvas)) throw new Error("Fallback terrain canvas is missing a rendering context");
  return canvas;
}

export function renderTerrainChunkToImage(width: number, height: number, worldX: number, worldY: number, calls: readonly Renderable[]): CanvasImageSource {
  const canvas = createChunkCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!isCanvas2dContext(context)) return canvas;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(-worldX, -worldY);
  for (const [index, call] of calls.entries()) {
    CHUNK_DRAW_STATE.order = index;
    drawRenderable(context, call, CHUNK_DRAW_STATE);
  }
  context.restore();
  return canvas;
}
