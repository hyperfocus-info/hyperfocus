import { z } from "zod/v4";

export const MEDIA_IMPORT_LIMITS = {
  frames: 480,
  bytes: 134217728,
  pixels: 64_000_000,
  seconds: 75,
} as const;

export const videoPlanSchema = z.object({
  kind: z.literal("sampled-images-v1"),
  sourceBytes: z.number().int().nonnegative().max(MEDIA_IMPORT_LIMITS.bytes),
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  sourceFirst: z.number().finite(),
  sourceEnd: z.number().finite(),
  start: z.number().nonnegative(),
  seconds: z.number().positive().max(MEDIA_IMPORT_LIMITS.seconds),
  requestedFps: z.number().min(1).max(60),
  requestedWidth: z.number().min(64).max(1280),
  fps: z.number().min(1).max(60),
  width: z.number().int().positive().max(1280),
  height: z.number().int().positive(),
  count: z.number().int().positive().max(MEDIA_IMPORT_LIMITS.frames),
  decodedPixels: z.number().int().positive().max(MEDIA_IMPORT_LIMITS.pixels),
  rgbaBytes: z.number().int().positive().max(MEDIA_IMPORT_LIMITS.bytes),
}).strict();
export type VideoPlan = z.infer<typeof videoPlanSchema>;
export type VideoRequest = {
  start: number;
  seconds: number;
  fps: number;
  width: number;
  adaptive?: boolean;
};

export function validateVideoRequest(options: VideoRequest, bytes: number) {
  if (![options.start, options.seconds, options.fps, options.width, bytes].every(Number.isFinite) ||
      options.start < 0 || options.seconds <= 0 || options.seconds > MEDIA_IMPORT_LIMITS.seconds ||
      options.fps < 1 || options.fps > 60 || options.width < 64 || options.width > 1280)
    throw new Error("Use a 0–75 second range, 1–60 fps and width 64–1280");
  // SHA-256 currently reads the original into memory before sampling. Bound that
  // allocation too; this is deliberately not advertised as streaming ingestion.
  if (bytes > MEDIA_IMPORT_LIMITS.bytes || bytes < 0)
    throw new Error("Original video exceeds the 128 MiB input budget; use a smaller copy and preserve the original");
}

/** Plan before allocating canvases. Frame count wins first, then spatial size.
 * RGBA is a conservative retained-image budget, not a bound on browser RSS. */
export function planMediaVideo(options: VideoRequest & {
  sourceBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceFirst: number;
  sourceEnd: number;
}): VideoPlan {
  validateVideoRequest(options, options.sourceBytes);
  const { sourceWidth, sourceHeight, sourceFirst, sourceEnd } = options;
  if (![sourceWidth, sourceHeight, sourceFirst, sourceEnd].every(Number.isFinite) ||
      sourceWidth <= 0 || sourceHeight <= 0 || sourceEnd <= sourceFirst)
    throw new Error("Video has invalid dimensions or timestamps");
  if (options.start < sourceFirst || options.start + options.seconds > sourceEnd + 1e-6)
    throw new Error(`Choose a source interval inside ${sourceFirst.toFixed(3)}–${sourceEnd.toFixed(3)} seconds`);
  let fps = options.fps;
  if (options.adaptive) fps = Math.min(fps, Math.floor(MEDIA_IMPORT_LIMITS.frames / options.seconds));
  const count = Math.ceil(options.seconds * fps);
  if (count > MEDIA_IMPORT_LIMITS.frames)
    throw new Error("Video import supports 480 samples; enable adaptive sampling or reduce duration/fps");
  const ratio = sourceHeight / sourceWidth;
  let width = Math.floor(Math.min(options.width, sourceWidth));
  if (options.adaptive) {
    const pixelsPerFrame = Math.min(MEDIA_IMPORT_LIMITS.pixels, MEDIA_IMPORT_LIMITS.bytes / 4) / count;
    width = Math.min(width, Math.floor(Math.sqrt(pixelsPerFrame / ratio)));
  }
  const height = Math.max(1, Math.floor(width * ratio));
  if (width < Math.min(64, sourceWidth))
    throw new Error("This aspect ratio needs a lower sampling fps or shorter range to retain a usable width");
  const decodedPixels = width * height * count, rgbaBytes = decodedPixels * 4;
  if (decodedPixels > MEDIA_IMPORT_LIMITS.pixels || rgbaBytes > MEDIA_IMPORT_LIMITS.bytes)
    throw new Error("Video exceeds the 64 megapixel / 128 MiB image budget; enable adaptive sampling or reduce width/fps");
  return videoPlanSchema.parse({
    kind: "sampled-images-v1", sourceBytes: options.sourceBytes,
    sourceWidth, sourceHeight, sourceFirst, sourceEnd,
    start: options.start, seconds: options.seconds,
    requestedFps: options.fps, requestedWidth: options.width,
    fps, width, height, count, decodedPixels, rgbaBytes,
  });
}

export function describeVideoPlan(plan: VideoPlan) {
  return `${plan.seconds}s at ${plan.width} × ${plan.height}, ${plan.fps} fps (${plan.count} images; ${(plan.rgbaBytes / 1048576).toFixed(1)} MiB RGBA). Requested ${plan.requestedWidth}px / ${plan.requestedFps} fps. Preview and export use these sampled images; larger exports upscale them. No audio, streaming or original-resolution relink. Keep the original video. Encoded images are checked against 128 MiB during decoding.`;
}
