const canvasContextMethods = [
  "arc",
  "beginPath",
  "bezierCurveTo",
  "clearRect",
  "closePath",
  "createLinearGradient",
  "createRadialGradient",
  "drawImage",
  "ellipse",
  "fill",
  "fillRect",
  "fillText",
  "lineTo",
  "measureText",
  "moveTo",
  "quadraticCurveTo",
  "restore",
  "rotate",
  "save",
  "scale",
  "setLineDash",
  "stroke",
  "strokeRect",
  "strokeText",
  "translate",
];

function isCanvasContextFixture(value: unknown): value is CanvasRenderingContext2D {
  return typeof value === "object" && value !== null
    && canvasContextMethods.every((name) => typeof Reflect.get(value, name) === "function");
}

export function requireCanvasContextFixture<T extends object>(value: T): T & CanvasRenderingContext2D {
  if (!isCanvasContextFixture(value)) throw new Error("Canvas context fixture is missing a required drawing operation");
  return value;
}

const unusedCanvasOperation = () => {};

export function createCanvasContextFixture<T extends object>(overrides: T): T & CanvasRenderingContext2D {
  return requireCanvasContextFixture(Object.assign({
    arc: unusedCanvasOperation,
    beginPath: unusedCanvasOperation,
    bezierCurveTo: unusedCanvasOperation,
    clearRect: unusedCanvasOperation,
    closePath: unusedCanvasOperation,
    createLinearGradient: unusedCanvasOperation,
    createRadialGradient: unusedCanvasOperation,
    drawImage: unusedCanvasOperation,
    ellipse: unusedCanvasOperation,
    fill: unusedCanvasOperation,
    fillRect: unusedCanvasOperation,
    fillText: unusedCanvasOperation,
    lineTo: unusedCanvasOperation,
    measureText: unusedCanvasOperation,
    moveTo: unusedCanvasOperation,
    quadraticCurveTo: unusedCanvasOperation,
    restore: unusedCanvasOperation,
    rotate: unusedCanvasOperation,
    save: unusedCanvasOperation,
    scale: unusedCanvasOperation,
    setLineDash: unusedCanvasOperation,
    stroke: unusedCanvasOperation,
    strokeRect: unusedCanvasOperation,
    strokeText: unusedCanvasOperation,
    translate: unusedCanvasOperation,
  }, overrides));
}

function isCanvasGradientFixture(value: unknown): value is CanvasGradient {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "addColorStop") === "function";
}

export function createCanvasGradientFixture(): CanvasGradient {
  const gradient = { addColorStop() {} };
  if (!isCanvasGradientFixture(gradient)) throw new Error("Canvas gradient fixture is missing addColorStop");
  return gradient;
}

export function createTextMetricsFixture(width: number): TextMetrics {
  return {
    actualBoundingBoxAscent: 0,
    actualBoundingBoxDescent: 0,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: 0,
    alphabeticBaseline: 0,
    emHeightAscent: 0,
    emHeightDescent: 0,
    fontBoundingBoxAscent: 0,
    fontBoundingBoxDescent: 0,
    hangingBaseline: 0,
    ideographicBaseline: 0,
    width,
  };
}

function isCanvasImageSourceFixture(value: unknown): value is CanvasImageSource {
  if (typeof value !== "object" || value === null) return false;
  const width = Reflect.get(value, "width");
  const height = Reflect.get(value, "height");
  return typeof width === "number" && Number.isFinite(width) && width >= 0
    && typeof height === "number" && Number.isFinite(height) && height >= 0;
}

export function createCanvasImageSourceFixture(width: number, height: number): CanvasImageSource {
  const image = { width, height };
  if (!isCanvasImageSourceFixture(image)) throw new Error("Canvas image fixture dimensions must be finite and non-negative");
  return image;
}
