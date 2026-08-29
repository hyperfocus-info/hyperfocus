import type { ClientRenderTelemetry } from "../src/client/render.ts";

function isBenchmarkImage(value: unknown): value is HTMLImageElement {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "width") === "number"
    && typeof Reflect.get(value, "height") === "number"
    && typeof Reflect.get(value, "naturalWidth") === "number"
    && typeof Reflect.get(value, "naturalHeight") === "number";
}

export function createBenchmarkImage(width = 64, height = 64): HTMLImageElement {
  const image = { width, height, naturalWidth: width, naturalHeight: height };
  if (!isBenchmarkImage(image)) throw new Error("Benchmark image dimensions must be numeric");
  return image;
}

type BenchmarkContext = CanvasRenderingContext2D & { operations(): number };

function isBenchmarkContext(value: unknown): value is BenchmarkContext {
  if (typeof value !== "object" || value === null || typeof Reflect.get(value, "operations") !== "function") return false;
  return ["save", "restore", "scale", "rotate", "translate", "clearRect", "fillRect", "strokeRect", "drawImage",
    "beginPath", "rect", "clip", "arc", "ellipse", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo",
    "closePath", "fill", "stroke", "fillText", "strokeText", "measureText", "setLineDash", "createLinearGradient",
    "createRadialGradient"].every((name) => typeof Reflect.get(value, name) === "function");
}

function createBenchmarkContext(width: number, height: number, countOperations: boolean): BenchmarkContext {
  let operationCount = 0;
  const op = () => {
    if (countOperations) operationCount += 1;
  };
  const gradient = { addColorStop: op };
  const context = {
    operations: () => operationCount,
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
    save: op,
    restore: op,
    scale: op,
    rotate: op,
    translate: op,
    clearRect: op,
    fillRect: op,
    strokeRect: op,
    drawImage: op,
    beginPath: op,
    rect: op,
    clip: op,
    arc: op,
    ellipse: op,
    moveTo: op,
    lineTo: op,
    quadraticCurveTo: op,
    bezierCurveTo: op,
    closePath: op,
    fill: op,
    stroke: op,
    fillText: op,
    strokeText: op,
    measureText(text: string) {
      op();
      return { width: text.length * 7 };
    },
    setLineDash: op,
    createLinearGradient() {
      op();
      return gradient;
    },
    createRadialGradient() {
      op();
      return gradient;
    },
  };
  if (!isBenchmarkContext(context)) throw new Error("Benchmark context is missing a drawing operation");
  return context;
}

function isBenchmarkCanvas(value: unknown): value is HTMLCanvasElement {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "width") === "number"
    && typeof Reflect.get(value, "height") === "number"
    && typeof Reflect.get(value, "getContext") === "function"
    && typeof Reflect.get(value, "addEventListener") === "function"
    && typeof Reflect.get(value, "removeEventListener") === "function";
}

export function createRenderBenchSurface(width: number, height: number, countOperations = false) {
  const context = createBenchmarkContext(width, height, countOperations);
  const canvas = {
    width,
    height,
    ownerDocument: undefined,
    getContext: () => context,
    addEventListener() {},
    removeEventListener() {},
  };
  if (!isBenchmarkCanvas(canvas)) throw new Error("Benchmark canvas is missing a browser operation");
  return { canvas, context, operations: context.operations };
}

export function forceBenchmarkGc() {
  const gc = Reflect.get(Bun, "gc");
  if (typeof gc === "function") Reflect.apply(gc, Bun, [true]);
}

export function setBenchmarkGlobal(name: string, value: unknown) {
  Reflect.set(globalThis, name, value);
}

export function readClientRenderTelemetry(): ClientRenderTelemetry | undefined {
  const value = Reflect.get(globalThis, "__mmoSkillDemoTelemetry");
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "drawn") === "number"
    && typeof Reflect.get(value, "phaseMs") === "object" ? value : undefined;
}
