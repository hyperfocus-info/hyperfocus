import { z } from "zod/v4";
import { videoPlanSchema } from "./video-plan.ts";
import { imageBlendSchema, sampleImageBlendAmount } from "../blend/model.ts";
import { MAX_BLEND_PIXELS } from "../blend/raster.ts";

export const MEDIA_KEY = "hyperfocusMedia2D";
const id = z.string().trim().min(1).max(128);
const frame = z.number().int().min(0).max(1_000_000);
export const mediaSourceSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(256),
    fps: z.number().min(1).max(120),
    // Exact final partial exposure for sampled video; absent on legacy drawings.
    durationSeconds: z.number().positive().max(25_920_000).optional(),
    frames: z
      .array(
        z
          .object({
            assetId: id,
            hold: z.number().int().min(1).max(3600),
            crop: z
              .object({
                x: frame,
                y: frame,
                width: z.number().int().positive().max(8192),
                height: z.number().int().positive().max(8192),
              })
              .strict()
              .optional(),
            label: z.string().max(128).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(7200),
    provenance: z.string().min(1).max(2048),
    sampling: z
      .object({
        sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        plan: videoPlanSchema.optional(),
        frames: z
          .array(
            z
              .object({
                requested: z.number().finite(),
                decoded: z.number().finite(),
                duration: z.number().nonnegative(),
              })
              .strict(),
          )
          .max(480),
      })
      .strict()
      .optional(),
  })
  .strict();
export const mediaClipSchema = z
  .object({
    id,
    entityId: id,
    sourceId: id,
    label: z.string().max(128).optional(),
    startFrame: frame,
    durationFrames: z.number().int().min(1).max(1_000_000),
    sourceInFrame: frame.default(0),
    speed: z.number().min(0.05).max(8).default(1),
    timeRemap: z.array(z.object({
      frame,
      sourceSeconds: z.number().min(0).max(25_920_000),
      interpolation: z.enum(["linear", "hold", "ease-in", "ease-out", "ease-in-out"]).default("linear"),
    }).strict()).min(1).max(256).optional(),
    loop: z.boolean().default(false),
    blend: z.enum(["normal", "screen", "multiply", "add"]).default("normal"),
    matteSourceId: id.optional(),
    matteInFrame: frame.default(0),
    smoothing: z.boolean().default(true),
    imageBlend: imageBlendSchema.optional(),
    holdFrameIndex: z.number().int().min(0).max(7199).optional(),
  })
  .strict()
  .superRefine((clip, context) => {
    if (clip.imageBlend) {
      if (clip.holdFrameIndex !== undefined) context.addIssue({ code: "custom", path: ["holdFrameIndex"], message: "Choose either image blending or a held primary drawing" });
      if (clip.sourceId !== clip.imageBlend.from.sourceId) context.addIssue({ code: "custom", path: ["sourceId"], message: "Clip source must match its image blend From source" });
      for (const [index, key] of clip.imageBlend.keys.entries()) if (key.frame >= clip.durationFrames)
        context.addIssue({ code: "custom", path: ["imageBlend", "keys", index, "frame"], message: "Blend progress keys must stay inside the clip's exclusive end" });
    }
    if (!clip.timeRemap) return;
    if (clip.loop) context.addIssue({ code: "custom", message: "Turn off Loop when using source-time keys", path: ["loop"] });
    for (const [index, key] of clip.timeRemap.entries()) {
      if ((index === 0 && key.frame !== 0) || key.frame >= clip.durationFrames || (index > 0 && key.frame <= clip.timeRemap[index - 1]!.frame))
        context.addIssue({ code: "custom", message: "Source-time keys must start at clip frame 0, increase strictly, and stay inside the clip", path: ["timeRemap", index, "frame"] });
    }
  });
export const mediaDocumentSchema = z
  .object({
    version: z.literal(1),
    layers: z.array(id).max(2048).default([]),
    sources: z.array(mediaSourceSchema).max(256),
    clips: z.array(mediaClipSchema).max(2048),
  })
  .strict();
export type MediaSource = z.infer<typeof mediaSourceSchema>;
export type MediaClip = z.infer<typeof mediaClipSchema>;
export type MediaDocument = z.infer<typeof mediaDocumentSchema>;

export function readMedia(project: {
  extensions?: Record<string, unknown>;
}): MediaDocument {
  const data = project.extensions?.[MEDIA_KEY];
  return data === undefined
    ? { version: 1, layers: [], sources: [], clips: [] }
    : mediaDocumentSchema.parse(data);
}

export function sourceDuration(source: MediaSource) {
  const frames = source.frames.reduce((sum, item) => sum + item.hold, 0);
  // Use the same conversion for the exclusive end and sampled position. Otherwise
  // a rational end such as 31/30 seconds can become a tiny extra exposure.
  return Math.min(frames, source.durationSeconds === undefined ? frames : secondsToFrame(source.durationSeconds, source.fps));
}

/** Source seconds relative to the imported source, independent of seek history.
 * Interpolation belongs to the outgoing key. The last key holds to clip end. */
export function remapSourceSeconds(clip: MediaClip, offset: number) {
  const keys = clip.timeRemap;
  if (!keys) return undefined;
  let left = keys[0]!;
  for (let i = 1; i < keys.length; i++) {
    const right = keys[i]!;
    if (offset < right.frame) {
      let t = Math.max(0, (offset - left.frame) / (right.frame - left.frame));
      if (left.interpolation === "hold") t = 0;
      else if (left.interpolation === "ease-in") t *= t;
      else if (left.interpolation === "ease-out") t = 1 - (1 - t) ** 2;
      else if (left.interpolation === "ease-in-out") t = t * t * (3 - 2 * t);
      return left.sourceSeconds + (right.sourceSeconds - left.sourceSeconds) * t;
    }
    left = right;
  }
  return left.sourceSeconds;
}

/** Pure random-access sampling; held drawings are intentional repeated source frames. */
export function sampleSource(
  source: MediaSource,
  sourceFrame: number,
  loop = false,
) {
  const duration = sourceDuration(source);
  if (
    !Number.isFinite(sourceFrame) ||
    sourceFrame < 0 ||
    (!loop && sourceFrame >= duration)
  )
    return undefined;
  // Do not round up: even the instant immediately before a boundary still holds.
  let cursor = sourceFrame % duration;
  for (const [index, item] of source.frames.entries()) {
    if (cursor < item.hold) return { ...item, index };
    cursor -= item.hold;
  }
  return undefined;
}

export function sampleMedia(
  document: MediaDocument,
  entityId: string,
  frame: number,
  timelineFps: number,
) {
  const clip = document.clips.find(
    (c) =>
      c.entityId === entityId &&
      frame >= c.startFrame &&
      frame < c.startFrame + c.durationFrames,
  );
  if (!clip) return undefined;
  const source = document.sources.find((s) => s.id === clip.sourceId);
  if (!source) throw new Error(`Missing media source ${clip.sourceId}`);
  const remapped = remapSourceSeconds(clip, frame - clip.startFrame);
  const seconds = remapped ?? ((frame - clip.startFrame) / timelineFps) * clip.speed;
  const fixed = clip.imageBlend?.from ?? (clip.holdFrameIndex === undefined ? undefined : { sourceId: clip.sourceId, frameIndex: clip.holdFrameIndex });
  const image = fixed ? sampleDrawing(document, fixed) : sampleTimedSource(
    source,
    seconds,
    remapped === undefined ? clip.sourceInFrame : 0,
    clip.loop,
  );
  const matteSource = document.sources.find((s) => s.id === clip.matteSourceId);
  const matte =
    matteSource &&
    sampleTimedSource(
      matteSource,
      seconds,
      clip.matteInFrame,
      clip.loop,
    );
  const imageBlend = clip.imageBlend && {
    to: sampleDrawing(document, clip.imageBlend.to),
    amount: sampleImageBlendAmount(clip.imageBlend, frame - clip.startFrame),
    mode: clip.imageBlend.mode,
    mesh: clip.imageBlend.mesh,
  };
  return { clip, image, matte, imageBlend };
}

function sampleDrawing(document: MediaDocument, endpoint: { sourceId: string; frameIndex: number }) {
  const frame = document.sources.find(source => source.id === endpoint.sourceId)?.frames[endpoint.frameIndex];
  if (!frame) throw new Error(`Missing media drawing ${endpoint.sourceId}[${endpoint.frameIndex}]`);
  return { ...frame, index: endpoint.frameIndex };
}

/** Recover rational exposure onsets lost by seconds × fps, within one scaled ULP.
 * Keep sampleSource's direct frame comparison exact; real pre-boundary times hold. */
function secondsToFrame(seconds: number, fps: number) {
  return snapBoundary(seconds * fps);
}

function snapBoundary(value: number, magnitude = value) {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(magnitude)) ? nearest : value;
}

function sampleTimedSource(source: MediaSource, seconds: number, offset: number, loop: boolean) {
  const frame = offset + secondsToFrame(seconds, source.fps);
  if (!loop) return sampleSource(source, frame);
  // Partial exposures can produce a fractional loop period. Recover exact cycle
  // boundaries before modulo, which can otherwise yield the last image instead
  // of zero. This conversion policy does not alter the raw-frame sampler.
  const duration = sourceDuration(source), cycles = frame / duration;
  if (Number.isInteger(snapBoundary(cycles, cycles * 2))) return sampleSource(source, 0);
  const cursor = frame % duration;
  // Division/modulo combines position and duration rounding. Two scaled ULPs
  // bound that compounded error, including later onsets in a fractional cycle.
  const exposure = snapBoundary(cursor, frame * 2);
  return sampleSource(source, exposure < duration ? exposure : cursor);
}

export function validateMedia(
  document: MediaDocument,
  project: {
    assets: readonly { id: string; kind: string }[];
    scenes: readonly { entities: readonly { id: string; width?: number; height?: number }[] }[];
    timeline: { durationFrames: number; fps: number };
  },
) {
  const ids = new Set<string>();
  for (const source of document.sources) {
    if (ids.has(source.id))
      throw new Error(`Duplicate media source ${source.id}`);
    ids.add(source.id);
    if (source.durationSeconds !== undefined && source.durationSeconds * source.fps > source.frames.reduce((sum, item) => sum + item.hold, 0) + 1e-7)
      throw new Error(`Source ${source.name} duration exceeds its drawing exposures`);
    for (const item of source.frames)
      if (
        !project.assets.some((a) => a.id === item.assetId && a.kind === "image")
      )
        throw new Error(`Missing image asset ${item.assetId}`);
  }
  const clipIds = new Set<string>();
  for (const clip of document.clips) {
    if (clipIds.has(clip.id))
      throw new Error(`Duplicate media clip ${clip.id}`);
    clipIds.add(clip.id);
    const layer = project.scenes.find(scene => scene.entities.some(entity => entity.id === clip.entityId))?.entities.find(entity => entity.id === clip.entityId);
    if (!layer) throw new Error(`Missing media layer ${clip.entityId}`);
    if (clip.startFrame + clip.durationFrames > project.timeline.durationFrames)
      throw new Error("Media clip ends beyond the timeline");
    if (clip.imageBlend) {
      const { width, height } = layer;
      if (typeof width !== "number" || typeof height !== "number" || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || Math.ceil(width) * Math.ceil(height) > MAX_BLEND_PIXELS)
        throw new Error(`Image blend layer ${clip.entityId} exceeds the ${MAX_BLEND_PIXELS} pixel render budget or has invalid dimensions`);
      sampleDrawing(document, clip.imageBlend.from);
      sampleDrawing(document, clip.imageBlend.to);
    }
    if (clip.holdFrameIndex !== undefined) sampleDrawing(document, { sourceId: clip.sourceId, frameIndex: clip.holdFrameIndex });
    for (const [sourceId, sourceIn, isMatte] of [
      [clip.sourceId, clip.sourceInFrame, false],
      [clip.matteSourceId, clip.matteInFrame, true],
    ] as const) {
      if (!sourceId) continue;
      if ((clip.imageBlend || clip.holdFrameIndex !== undefined) && !isMatte) continue; // Fixed references replace only primary playback timing.
      const source = document.sources.find((s) => s.id === sourceId);
      if (!source) throw new Error(`Missing media source ${sourceId}`);
      if (clip.timeRemap) {
        const offset = isMatte ? sourceIn : 0;
        if (clip.timeRemap.some((key) => offset + secondsToFrame(key.sourceSeconds, source.fps) >= sourceDuration(source)))
          throw new Error(`Source-time key is outside source ${source.name}; its end is exclusive`);
        continue;
      }
      const last =
        sourceIn +
        secondsToFrame(((clip.durationFrames - 1) / project.timeline.fps) * clip.speed, source.fps);
      if (
        sourceIn >= sourceDuration(source) ||
        (!clip.loop && last >= sourceDuration(source))
      )
        throw new Error(
          `Source ${source.name} is too short for this trim and duration; shorten the clip or enable Loop`,
        );
    }
    if (
      document.clips.some(
        (other) =>
          other.id !== clip.id &&
          other.entityId === clip.entityId &&
          other.startFrame < clip.startFrame + clip.durationFrames &&
          clip.startFrame < other.startFrame + other.durationFrames,
      )
    )
      throw new Error(`Overlapping clips on media layer ${clip.entityId}`);
  }
}
