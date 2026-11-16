import { imageBlendMeshSchema, type ImageBlendMesh } from "./model.ts";
import { signedArea, type Point } from "./geometry.ts";

export const MAX_BLEND_PIXELS = 4_194_304;
const MAX_TRIANGLE_VISITS = 67_108_864;

/** Both images use the same authored output grid; hosts own decoding and resizing. */
export function blendRgbaImages(options: {
  from: { width: number; height: number; data: Uint8ClampedArray };
  to: { width: number; height: number; data: Uint8ClampedArray };
  amount: number;
  mode: "dissolve" | "mesh";
  mesh?: ImageBlendMesh;
  smoothing?: boolean;
}) {
  const { from, to, amount, mode } = options;
  for (const input of [from, to]) {
    if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width < 1 || input.height < 1 || input.width * input.height > MAX_BLEND_PIXELS)
      throw new Error(`Image blend exceeds its ${MAX_BLEND_PIXELS} pixel budget or has invalid dimensions`);
    if (!(input.data instanceof Uint8ClampedArray) || input.data.length !== input.width * input.height * 4)
      throw new Error("Image blend requires complete RGBA8 pixel buffers");
  }
  if (from.width !== to.width || from.height !== to.height) throw new Error("Image blend endpoints must use the same output grid");
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw new Error("Image blend amount must be between 0 and 1");
  if (mode !== "mesh" && mode !== "dissolve") throw new Error("Unknown image blend mode");
  if (mode === "dissolve" && options.mesh) throw new Error("Dissolve mode does not use a correspondence mesh");
  const mesh = mode === "mesh" ? imageBlendMeshSchema.parse(options.mesh) : undefined;
  const { width, height } = from;
  // Including invisible RGB: endpoint sampling never re-premultiplies original bytes.
  if (amount === 0 || amount === 1) return { width, height, data: new Uint8ClampedArray(amount === 0 ? from.data : to.data) };
  const data = new Uint8ClampedArray(from.data.length), inverse = 1 - amount;
  if (!mesh) {
    for (let i = 0; i < data.length; i += 4) {
      const a = from.data[i + 3]! * inverse, b = to.data[i + 3]! * amount, alpha = a + b;
      for (let channel = 0; channel < 3; channel++) data[i + channel] = alpha === 0 ? 0 : (from.data[i + channel]! * a + to.data[i + channel]! * b) / alpha;
      data[i + 3] = alpha;
    }
    return { width, height, data };
  }
  const points = mesh.vertices.map((v): Point => [v.from[0] * inverse + v.to[0] * amount, v.from[1] * inverse + v.to[1] * amount]);
  const regions = mesh.triangles.map(tri => {
    const a = points[tri[0]]!, b = points[tri[1]]!, c = points[tri[2]]!;
    return { tri, a, b, c, area: signedArea(a, b, c),
      left: Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) * width - 0.5)),
      right: Math.min(width - 1, Math.floor(Math.max(a[0], b[0], c[0]) * width - 0.5)),
      top: Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) * height - 0.5)),
      bottom: Math.min(height - 1, Math.floor(Math.max(a[1], b[1], c[1]) * height - 0.5)),
    };
  });
  if (regions.reduce((sum, r) => sum + Math.max(0, r.right - r.left + 1) * Math.max(0, r.bottom - r.top + 1), 0) > MAX_TRIANGLE_VISITS)
    throw new Error("Image blend mesh exceeds its raster work budget; reduce resolution or use more local triangles");
  const sampled = new Float64Array(8);
  for (const r of regions) {
    const va = mesh.vertices[r.tri[0]]!, vb = mesh.vertices[r.tri[1]]!, vc = mesh.vertices[r.tri[2]]!;
    for (let y = r.top; y <= r.bottom; y++) for (let x = r.left; x <= r.right; x++) {
      const px = (x + 0.5) / width, py = (y + 0.5) / height;
      const wa = ((r.b[0] - px) * (r.c[1] - py) - (r.b[1] - py) * (r.c[0] - px)) / r.area;
      const wb = ((r.c[0] - px) * (r.a[1] - py) - (r.c[1] - py) * (r.a[0] - px)) / r.area;
      const wc = 1 - wa - wb;
      if (wa < -1e-10 || wb < -1e-10 || wc < -1e-10) continue;
      readPixel(from, va.from[0] * wa + vb.from[0] * wb + vc.from[0] * wc, va.from[1] * wa + vb.from[1] * wb + vc.from[1] * wc, options.smoothing !== false, sampled, 0);
      readPixel(to, va.to[0] * wa + vb.to[0] * wb + vc.to[0] * wc, va.to[1] * wa + vb.to[1] * wb + vc.to[1] * wc, options.smoothing !== false, sampled, 4);
      const alpha = sampled[3]! * inverse + sampled[7]! * amount, index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) data[index + channel] = alpha === 0 ? 0 : (sampled[channel]! * inverse + sampled[channel + 4]! * amount) / alpha;
      data[index + 3] = alpha;
    }
  }
  return { width, height, data };
}
export type RgbaImage = Parameters<typeof blendRgbaImages>[0]["from"];
export type ImageBlendRasterOptions = Parameters<typeof blendRgbaImages>[0];

/** Bilinear interpolation in premultiplied alpha avoids dark transparent fringes. */
function readPixel(image: RgbaImage, u: number, v: number, smoothing: boolean, out: Float64Array, offset: number) {
  const x = Math.max(0, Math.min(image.width - 1, u * image.width - 0.5));
  const y = Math.max(0, Math.min(image.height - 1, v * image.height - 0.5));
  if (!smoothing) {
    const index = (Math.round(y) * image.width + Math.round(x)) * 4, alpha = image.data[index + 3]!;
    out[offset + 3] = alpha;
    for (let c = 0; c < 3; c++) out[offset + c] = image.data[index + c]! * alpha;
    return;
  }
  const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0;
  const x1 = Math.min(x0 + 1, image.width - 1), y1 = Math.min(y0 + 1, image.height - 1);
  const a = (y0 * image.width + x0) * 4, b = (y0 * image.width + x1) * 4;
  const c = (y1 * image.width + x0) * 4, d = (y1 * image.width + x1) * 4;
  const aa = image.data[a + 3]! * (1 - dx) * (1 - dy), ab = image.data[b + 3]! * dx * (1 - dy);
  const ac = image.data[c + 3]! * (1 - dx) * dy, ad = image.data[d + 3]! * dx * dy;
  out[offset + 3] = aa + ab + ac + ad;
  for (let channel = 0; channel < 3; channel++)
    out[offset + channel] = image.data[a + channel]! * aa + image.data[b + channel]! * ab + image.data[c + channel]! * ac + image.data[d + channel]! * ad;
}
