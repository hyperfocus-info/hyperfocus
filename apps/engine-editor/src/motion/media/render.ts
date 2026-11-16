import type { MediaDocument } from "./model.ts";
import { sampleMedia, readMedia, MEDIA_KEY } from "./model.ts";
import { renderImageBlend, resetImageBlendCache } from "../blend/canvas.ts";
import { MAX_BLEND_PIXELS } from "../blend/raster.ts";

const surfaces = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>();
let documents = new WeakMap<object, MediaDocument>();
/** Hosts call this when applying a revision; JSON patch can mutate an extension in place. */
export function resetMediaRenderCache() {
  documents = new WeakMap();
  resetImageBlendCache();
}
/** Standalone snapshots are immutable; the editor invalidates on every applied revision. */
export function mediaRenderCall(
  project:
    | { extensions?: Record<string, unknown>; timeline?: { fps: number } }
    | undefined,
  images: ReadonlyMap<string, HTMLImageElement>,
  entity: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    rotation?: number;
    opacity?: number;
  },
  frame: number,
  selected = false,
  allowPending = false,
) {
  const raw = project?.extensions?.[MEDIA_KEY];
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid media document");
  let media = documents.get(raw);
  if (!media) {
    media = readMedia(project!);
    documents.set(raw, media);
  }
  if (
    !media.layers.includes(entity.id) &&
    !media.clips.some((c) => c.entityId === entity.id)
  )
    return undefined;
  const current = media;
  return (context: CanvasRenderingContext2D) => {
    context.save();
    try {
      context.translate(entity.x, entity.y);
      context.rotate(entity.rotation ?? 0);
      context.globalAlpha *= Math.max(0, Math.min(1, entity.opacity ?? 1));
      context.scale(entity.scale, entity.scale);
      const width = entity.width,
        height = entity.height;
      drawMediaLayer({
        context,
        media: current,
        entityId: entity.id,
        frame,
        fps: project?.timeline?.fps ?? 30,
        width,
        height,
        images,
        allowPending,
      });
      if (selected) {
        context.strokeStyle = "#7ffff3";
        context.lineWidth = 2;
        context.strokeRect(-width / 2, -height / 2, width, height);
      }
    } finally {
      context.restore();
    }
  };
}
/** Called in entity-local coordinates by both the editor and standalone renderer. */
export function drawMediaLayer(options: {
  context: CanvasRenderingContext2D;
  media: MediaDocument;
  entityId: string;
  frame: number;
  fps: number;
  width: number;
  height: number;
  images: ReadonlyMap<string, HTMLImageElement>;
  allowPending?: boolean;
}) {
  if (!options.media.clips.some((c) => c.entityId === options.entityId))
    return false;
  const sample = sampleMedia(
    options.media,
    options.entityId,
    options.frame,
    options.fps,
  );
  if (!sample?.image) return true; // An authored layer is transparent outside its clips.
  const image = options.images.get(sample.image.assetId);
  if (!image) {
    if (options.allowPending) return true;
    throw new Error(
      `Media frame image is not hydrated: ${sample.image.assetId}`,
    );
  }
  const { context: ctx, width, height } = options;
  const imageCrop = sample.image.crop;
  let blended: HTMLCanvasElement | undefined;
  let endpoint: { image: HTMLImageElement; crop: typeof imageCrop } | undefined;
  if (sample.imageBlend) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || Math.ceil(width) * Math.ceil(height) > MAX_BLEND_PIXELS)
      throw new Error(`Image blend layer exceeds the ${MAX_BLEND_PIXELS} pixel render budget`);
    const to = options.images.get(sample.imageBlend.to.assetId);
    if (!to || !to.complete || !image.complete || !to.naturalWidth || !image.naturalWidth) {
      if (options.allowPending) return true;
      throw new Error(`Image blend endpoint is not hydrated or decoded: ${sample.imageBlend.to.assetId}`);
    }
    // Exact endpoints use the same crop/scale path as ordinary media, avoiding
    // any readback/putImageData quantization of semitransparent source pixels.
    if (sample.imageBlend.amount === 1) endpoint = { image: to, crop: sample.imageBlend.to.crop };
    else if (sample.imageBlend.amount !== 0) blended = renderImageBlend({ from: image, to, fromCrop: sample.image.crop, toCrop: sample.imageBlend.to.crop,
      width, height, amount: sample.imageBlend.amount, mode: sample.imageBlend.mode, mesh: sample.imageBlend.mesh, smoothing: sample.clip.smoothing });
  }
  const draw = (
    target: CanvasRenderingContext2D,
    asset: HTMLImageElement,
    crop: typeof sample.image.crop,
  ) => {
    if (crop) {
      if (
        crop.x + crop.width > asset.naturalWidth ||
        crop.y + crop.height > asset.naturalHeight
      )
        throw new Error("Media crop exceeds image dimensions");
      target.drawImage(
        asset,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        width,
        height,
      );
    } else target.drawImage(asset, 0, 0, width, height);
  };
  const drawPicture = (target: CanvasRenderingContext2D) => {
    if (blended) target.drawImage(blended, 0, 0, width, height);
    else if (endpoint) draw(target, endpoint.image, endpoint.crop);
    else draw(target, image, imageCrop);
  };
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = sample.clip.smoothing;
    ctx.globalCompositeOperation =
      sample.clip.blend === "normal"
        ? "source-over"
        : sample.clip.blend === "add"
          ? "lighter"
          : sample.clip.blend;
    ctx.translate(-width / 2, -height / 2);
    if (sample.clip.matteSourceId) {
      if (!sample.matte)
        throw new Error("Matte source does not cover the current frame");
      const matte = options.images.get(sample.matte.assetId);
      if (!matte) {
        if (options.allowPending) return true;
        throw new Error(`Matte image is not hydrated: ${sample.matte.assetId}`);
      }
      if (width < 1 || height < 1 || width * height > 16_777_216)
        throw new Error("Matte layer exceeds the 16 megapixel render budget");
      let surface = surfaces.get(ctx);
      if (!surface) {
        surface = document.createElement("canvas");
        surfaces.set(ctx, surface);
      }
      surface.width = Math.max(1, Math.ceil(width));
      surface.height = Math.max(1, Math.ceil(height));
      const off = surface.getContext("2d")!;
      off.imageSmoothingEnabled = sample.clip.smoothing;
      drawPicture(off);
      off.globalCompositeOperation = "destination-in";
      draw(off, matte, sample.matte.crop);
      ctx.drawImage(surface, 0, 0, width, height);
    } else drawPicture(ctx);
  } finally {
    ctx.restore();
  }
  return true;
}
