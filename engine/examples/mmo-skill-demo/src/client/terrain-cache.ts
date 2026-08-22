import { drawRenderable, type RenderDrawContext, type Renderable } from "@hyperfocus/engine/render";

const CHUNK_DRAW_STATE: RenderDrawContext = {
  camera: {},
  layer: "terrain-cache",
  layerOptions: { sort: "none", ignoreCamera: false, order: 0, cullRect: undefined },
  order: 0,
  drawDataCaches: true
};

function createFallbackCanvasContext(width: number, height: number) {
  const gradient = { addColorStop() {} };
  return {
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
  } as unknown as CanvasRenderingContext2D;
}

function createChunkCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const doc = (globalThis as unknown as { document?: Document }).document;
  if (doc?.createElement) {
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  const context = createFallbackCanvasContext(width, height);
  return {
    width,
    height,
    getContext: () => context
  } as unknown as HTMLCanvasElement;
}

export function renderTerrainChunkToImage(width: number, height: number, worldX: number, worldY: number, calls: readonly Renderable[]) {
  const canvas = createChunkCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return canvas as unknown as CanvasImageSource;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(-worldX, -worldY);
  for (let i = 0; i < calls.length; i += 1) {
    CHUNK_DRAW_STATE.order = i;
    drawRenderable(context as CanvasRenderingContext2D, calls[i]!, CHUNK_DRAW_STATE);
  }
  context.restore();
  return canvas as unknown as CanvasImageSource;
}
