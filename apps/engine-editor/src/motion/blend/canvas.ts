import { blendRgbaImages, MAX_BLEND_PIXELS, type RgbaImage } from "./raster.ts";
import type { ImageBlendMesh } from "./model.ts";
import type { MediaSource } from "../media/model.ts";

const PIXEL_CACHE_BYTES = 33_554_432, CANVAS_CACHE_BYTES = 16_777_216;
let imageIds = new WeakMap<HTMLImageElement, number>(), nextImageId = 0;
const pixels = new Map<string, RgbaImage>(), canvases = new Map<string, HTMLCanvasElement>();
export function resetImageBlendCache() {
  pixels.clear(); canvases.clear(); imageIds = new WeakMap(); nextImageId = 0;
}

/** Browser-only decoding adapter. Both native preview and delivery call the pure raster owner. */
export function renderImageBlend(options: {
  from: HTMLImageElement;
  to: HTMLImageElement;
  fromCrop?: MediaSource["frames"][number]["crop"];
  toCrop?: MediaSource["frames"][number]["crop"];
  width: number;
  height: number;
  amount: number;
  mode: "dissolve" | "mesh";
  mesh?: ImageBlendMesh;
  smoothing: boolean;
}) {
  const width = Math.ceil(options.width), height = Math.ceil(options.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_BLEND_PIXELS)
    throw new Error(`Image blend layer exceeds the ${MAX_BLEND_PIXELS} pixel render budget`);
  const endpointKey = (image: HTMLImageElement, crop: typeof options.fromCrop) => {
    let id = imageIds.get(image);
    if (id === undefined) { id = ++nextImageId; imageIds.set(image, id); }
    return JSON.stringify([id, image.src, image.naturalWidth, image.naturalHeight, width, height, options.smoothing, crop]);
  };
  const fromKey = endpointKey(options.from, options.fromCrop), toKey = endpointKey(options.to, options.toCrop);
  const key = JSON.stringify([fromKey, toKey, options.amount, options.mode, options.mesh]);
  const existing = touch(canvases, key);
  if (existing) return existing;
  const decode = (key: string, image: HTMLImageElement, crop: typeof options.fromCrop) => {
    const cached = touch(pixels, key);
    if (cached) return cached;
    if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error("Image blend endpoint is not decoded");
    if (crop && (crop.x + crop.width > image.naturalWidth || crop.y + crop.height > image.naturalHeight)) throw new Error("Media crop exceeds image dimensions");
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Image blend requires a 2D canvas context");
    context.imageSmoothingEnabled = options.smoothing;
    if (crop) context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    else context.drawImage(image, 0, 0, width, height);
    const result = { width, height, data: context.getImageData(0, 0, width, height).data };
    pixels.set(key, result); prune(pixels, PIXEL_CACHE_BYTES);
    return result;
  };
  const result = blendRgbaImages({ from: decode(fromKey, options.from, options.fromCrop), to: decode(toKey, options.to, options.toCrop), amount: options.amount, mode: options.mode, mesh: options.mesh, smoothing: options.smoothing });
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image blend requires a 2D canvas context");
  const output = context.createImageData(width, height); output.data.set(result.data); context.putImageData(output, 0, 0);
  canvases.set(key, canvas); prune(canvases, CANVAS_CACHE_BYTES);
  return canvas;
}

function touch<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key);
  if (value) { cache.delete(key); cache.set(key, value); }
  return value;
}
function prune<T extends { width: number; height: number }>(cache: Map<string, T>, budget: number) {
  let bytes = [...cache.values()].reduce((sum, item) => sum + item.width * item.height * 4, 0);
  for (const [key, item] of cache) {
    if (bytes <= budget && cache.size <= 16) break;
    cache.delete(key); bytes -= item.width * item.height * 4;
  }
}
