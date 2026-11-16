import { assertIntegerRange, assertText } from "./timeline/validation.ts";

import { modulo } from "@hyperfocus/utilities/math";
import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";

import type { PlayableEntitySnapshot, PlayableWorldSnapshot } from "./runtime2d/runtime-2d-contracts.ts";
import { validateTimelineEffectPlacement2D } from './metadata/index.ts';
import { assertTimelineFinite as assertFinite, assertTimelineRange as assertRange } from './metadata/numeric.ts';
export { validateTimelineEffectPlacement2D } from './metadata/index.ts';
import { PARTICLE_PRESETS_2D, isParticlePresetId2D, isTransitionPresetId2D } from "../effects/creative-presets.ts";

const MAX_TRACKS = 2_048;
const MAX_KEYFRAMES_PER_TRACK = 100_000;
const MAX_TOTAL_KEYFRAMES = 1_000_000;
const MAX_AUDIO_TRACKS = 256;
const MAX_EVENTS = 100_000;
const MAX_EVENT_OCCURRENCES_PER_ADVANCE = 4_096;
const MAX_ADVANCE_SECONDS = 60;
const EPSILON = 1e-9;

export type TimelineEasing2D = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bounce" | "hold";
export type TimelineProperty2D = "x" | "y" | "scale" | "rotation" | "opacity" | "camera";
export type TimelineEventKind2D = "audio" | "logic" | "camera" | "marker";

export type TimelineKeyframe2D = {
  id: string;
  frame: number;
  value: number;
  easing: TimelineEasing2D;
};

export type TimelineTrack2D = {
  id: string;
  targetId: string;
  label: string;
  property: TimelineProperty2D;
  muted: boolean;
  locked: boolean;
  keyframes: readonly TimelineKeyframe2D[];
};

export type TimelineClipKeyframe2D = {
  id: string;
  frame: number;
  clipId: string;
};

export type TimelineClipTrack2D = {
  id: string;
  targetId: string;
  label: string;
  muted: boolean;
  locked: boolean;
  keyframes: readonly TimelineClipKeyframe2D[];
};

export type TimelineAudioTrack2D = {
  id: string;
  name: string;
  assetId?: string;
  startFrame: number;
  durationFrames: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  loopStart: number;
  loopEnd: number;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
};

export type TimelineEvent2D = {
  id: string;
  frame: number;
  label: string;
  kind: TimelineEventKind2D;
};

export type TimelineEffectKind2D = "camera-shake" | "particle-burst" | "hit-flash" | "screen-transition";

export type TimelineEffect2D = {
  id: string;
  frame: number;
  durationFrames: number;
  label: string;
  kind: TimelineEffectKind2D;
  targetId?: string;
  intensity: number;
  color?: string;
  particleCount?: number;
  preset?: string;
  /** Foreground is the default; background particles sit behind scene subjects. */
  layer?: "foreground" | "background";
  /** Weather defaults to screen space, even when older cues carry a target. */
  space?: "screen" | "target";
  /** Normalized viewport coverage, with each start strictly before its end. */
  region?: { fromX: number; fromY: number; toX: number; toY: number };
};

export type SampledTimelineEffect2D = TimelineEffect2D & {
  progress: number;
  envelope: number;
};

export type TimelineDeclaration2D = {
  fps: number;
  durationFrames: number;
  loopStart: number;
  loopEnd: number;
  playbackSpeed: number;
  tracks: readonly TimelineTrack2D[];
  clipTracks?: readonly TimelineClipTrack2D[];
  audioTracks: readonly TimelineAudioTrack2D[];
  events: readonly TimelineEvent2D[];
  effects?: readonly TimelineEffect2D[];
};

export type PlayableTimelineProject2D = {
  timeline?: TimelineDeclaration2D;
  scenes?: ReadonlyArray<{ id: string; entities: ReadonlyArray<{ id: string }> }>;
  assets?: ReadonlyArray<{ id: string; mimeType?: string }>;
  atlas?: { clips?: ReadonlyArray<{ id: string; sequence?: readonly string[]; fps?: number; loop?: boolean }> };
};

export type TimelineDiagnosticCode2D =
  | "timeline-camera-track-unsupported"
  | "timeline-track-target-missing"
  | "timeline-track-empty"
  | "timeline-track-conflict"
  | "timeline-clip-track-empty"
  | "timeline-clip-track-target-missing"
  | "timeline-clip-track-clip-missing"
  | "timeline-clip-track-conflict"
  | "timeline-audio-track-unsupported"
  | "timeline-event-unsupported"
  | "timeline-effect-target-missing";

export type TimelineDiagnostic2D = {
  severity: "warning";
  code: TimelineDiagnosticCode2D;
  message: string;
  trackId?: string;
  eventId?: string;
  effectId?: string;
  targetId?: string;
};

export type TimelinePropertyOverride2D = {
  trackId: string;
  targetId: string;
  property: Exclude<TimelineProperty2D, "camera">;
  value: number;
};

export type TimelineClipOverride2D = {
  trackId: string;
  targetId: string;
  clipId: string;
  /** The selected cue's timeline frame; clip playback begins at zero here. */
  startFrame?: number;
};

export type TimelineEventOccurrence2D = {
  eventId: string;
  frame: number;
  label: string;
  kind: TimelineEventKind2D;
  loop: number;
};

export type TimelinePlaybackSnapshot2D = {
  frame: number;
  loop: number;
  finished: boolean;
  overrides: readonly TimelinePropertyOverride2D[];
  clipOverrides: readonly TimelineClipOverride2D[];
};

export type TimelineAdvanceResult2D = TimelinePlaybackSnapshot2D & {
  previousFrame: number;
  events: readonly TimelineEventOccurrence2D[];
  droppedEventOccurrences: number;
};

export type TimelineEntitySnapshot2D = PlayableEntitySnapshot & {
  /** Radians, clockwise in the Canvas 2D coordinate system. */
  rotation?: number;
  /** Rendering alpha. Standalone rendering clamps the authored value to [0, 1]. */
  opacity?: number;
};

export type TimelineWorldSnapshot2D = Omit<PlayableWorldSnapshot, "entities"> & {
  entities: TimelineEntitySnapshot2D[];
};

type NormalizedTrack = Omit<TimelineTrack2D, "keyframes"> & { keyframes: readonly TimelineKeyframe2D[] };
type NormalizedClipTrack = Omit<TimelineClipTrack2D, "keyframes"> & { keyframes: readonly TimelineClipKeyframe2D[] };
type IndexedEvent = TimelineEvent2D & { sourceIndex: number };

/**
 * Reports authored timeline features that the deterministic 2D playback adapter cannot execute.
 * Unsupported events remain observable from `advance`; the adapter simply performs no implicit action for them.
 */
export function auditPlayableTimeline2D(project: PlayableTimelineProject2D): TimelineDiagnostic2D[] {
  const timeline = project.timeline;
  if (!timeline) return [];
  validateTimelineDeclaration(timeline);
  const diagnostics: TimelineDiagnostic2D[] = [];
  const entityIds = new Set(project.scenes?.flatMap((scene) => scene.entities.map((entity) => entity.id)) ?? []);
  const winners = new Map<string, string>();
  for (const track of timeline.tracks) {
    if (track.muted) continue;
    if (!track.keyframes.length) {
      diagnostics.push({ severity: "warning", code: "timeline-track-empty", trackId: track.id, targetId: track.targetId, message: `Timeline track ${track.label} (${track.id}) has no keyframes and produces no runtime value.` });
      continue;
    }
    if (track.property === "camera") {
      diagnostics.push({ severity: "warning", code: "timeline-camera-track-unsupported", trackId: track.id, targetId: track.targetId, message: `Timeline camera track ${track.label} (${track.id}) is authored but the 2D standalone runtime does not execute camera blends.` });
      continue;
    }
    if (entityIds.size && !entityIds.has(track.targetId) && track.targetId !== TIMELINE_CAMERA_TARGET_2D) {
      diagnostics.push({ severity: "warning", code: "timeline-track-target-missing", trackId: track.id, targetId: track.targetId, message: `Timeline track ${track.label} (${track.id}) targets missing 2D entity ${track.targetId}.` });
    }
    const key = `${track.targetId}\u0000${track.property}`;
    const previous = winners.get(key);
    if (previous) {
      diagnostics.push({ severity: "warning", code: "timeline-track-conflict", trackId: track.id, targetId: track.targetId, message: `Timeline tracks ${previous} and ${track.id} both drive ${track.targetId}.${track.property}; the later authored track ${track.id} wins deterministically.` });
    }
    winners.set(key, track.id);
  }
  const clipIds = new Set(project.atlas?.clips?.map((clip) => clip.id) ?? []);
  const hasClipCatalog = project.atlas?.clips !== undefined;
  const clipWinners = new Map<string, string>();
  for (const track of timeline.clipTracks ?? []) {
    if (track.muted) continue;
    if (!track.keyframes.length) {
      diagnostics.push({ severity: "warning", code: "timeline-clip-track-empty", trackId: track.id, targetId: track.targetId, message: `Timeline clip track ${track.label} (${track.id}) has no cues and produces no animation state.` });
      continue;
    }
    if (entityIds.size && !entityIds.has(track.targetId)) diagnostics.push({ severity: "warning", code: "timeline-clip-track-target-missing", trackId: track.id, targetId: track.targetId, message: `Timeline clip track ${track.label} (${track.id}) targets missing 2D entity ${track.targetId}.` });
    for (const key of track.keyframes) {
      if (hasClipCatalog && !clipIds.has(key.clipId)) diagnostics.push({ severity: "warning", code: "timeline-clip-track-clip-missing", trackId: track.id, targetId: track.targetId, message: `Timeline clip cue ${key.id} references missing atlas clip ${key.clipId}.` });
    }
    const previous = clipWinners.get(track.targetId);
    if (previous) diagnostics.push({ severity: "warning", code: "timeline-clip-track-conflict", trackId: track.id, targetId: track.targetId, message: `Timeline clip tracks ${previous} and ${track.id} both drive ${track.targetId}; the later authored track ${track.id} wins deterministically.` });
    clipWinners.set(track.targetId, track.id);
  }
  for (const track of timeline.audioTracks) {
    if (track.muted) continue;
    diagnostics.push({
      severity: "warning",
      code: "timeline-audio-track-unsupported",
      trackId: track.id,
      message: `Timeline audio clip ${track.name} (${track.id}) is not scheduled by the 2D standalone runtime because trim, fade, and loop regions cannot yet be represented by its audio command controller. Entity audio components remain supported.`,
    });
  }
  for (const event of timeline.events) {
    if (event.kind === "marker") continue;
    diagnostics.push({
      severity: "warning",
      code: "timeline-event-unsupported",
      eventId: event.id,
      message: `Timeline ${event.kind} event ${event.label} (${event.id}) is exposed to the host when crossed, but the 2D standalone runtime performs no implicit ${event.kind} action.`,
    });
  }
  for (const effect of timeline.effects ?? []) {
    if (effect.kind !== "hit-flash") continue;
    if (!effect.targetId || entityIds.size && !entityIds.has(effect.targetId)) diagnostics.push({
      severity: "warning",
      code: "timeline-effect-target-missing",
      effectId: effect.id,
      targetId: effect.targetId,
      message: `Timeline effect ${effect.label} (${effect.id}) requires an existing target entity and will not render without one.`,
    });
  }
  return diagnostics;
}

/** Uses the destination keyframe's easing, matching the editor's authored interpolation contract. */
export function evaluateTimelineTrack2D(track: TimelineTrack2D, frame: number): number | undefined {
  if (track.muted) return undefined;
  assertFinite(frame, "timeline evaluation frame");
  const keys = normalizeKeyframes(track.keyframes);
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return undefined;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  const rightIndex = upperBoundFrame(keys, frame);
  const right = keys[rightIndex];
  const left = keys[rightIndex - 1];
  if (!right || !left) throw new Error("timeline keyframe search produced an invalid interval");
  const duration = right.frame - left.frame;
  const progress = applyTimelineEasing2D((frame - left.frame) / duration, right.easing);
  return left.value + (right.value - left.value) * progress;
}

/** Reserved target for portable scene-camera x/y/zoom tracks; it is not a world entity. */
export const TIMELINE_CAMERA_TARGET_2D = "@scene-camera";

export function sampleTimelineCamera2D(options: { timeline: { tracks: readonly TimelineTrack2D[] } | undefined; frame: number; viewport?: { width: number; height: number } }) {
  if (options.viewport && (!Number.isFinite(options.viewport.width) || options.viewport.width <= 0 || !Number.isFinite(options.viewport.height) || options.viewport.height <= 0)) throw new Error("Camera viewport dimensions must be positive finite numbers.");
  let active = false;
  const camera = { x: (options.viewport?.width ?? 760) / 2, y: (options.viewport?.height ?? 480) / 2, zoom: 1 };
  for (const track of options.timeline?.tracks ?? []) {
    if (track.targetId !== TIMELINE_CAMERA_TARGET_2D || track.muted || !track.keyframes.length) continue;
    if (track.property !== "x" && track.property !== "y" && track.property !== "scale") continue;
    const value = evaluateTimelineTrack2D(track, options.frame);
    if (value === undefined) continue;
    active = true;
    if (track.property === "scale") camera.zoom = Math.max(.01, value);
    else camera[track.property] = value;
  }
  return active ? camera : undefined;
}

/** Samples a stepped animation state. Before the first cue, the sprite component's default clip remains active. */
export function evaluateTimelineClipTrack2D(track: TimelineClipTrack2D, frame: number): string | undefined {
  return evaluateTimelineClipCue2D({ track, frame })?.clipId;
}

/** Samples the winning cue and its start time, so late non-looping clips start at their first pose. */
export function evaluateTimelineClipCue2D(options: { track: TimelineClipTrack2D; frame: number }): TimelineClipKeyframe2D | undefined {
  const { track, frame } = options;
  if (track.muted) return undefined;
  assertFinite(frame, "timeline clip evaluation frame");
  const keys = normalizeClipKeyframes(track.keyframes);
  if (!keys.length || frame < keys[0]!.frame) return undefined;
  return keys[Math.max(0, upperBoundFrame(keys, frame) - 1)];
}

export function applyTimelineEasing2D(value: number, easing: TimelineEasing2D) {
  const progress = clamp(value, 0, 1);
  if (easing === "hold") return progress < 1 ? 0 : 1;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return 1 - (1 - progress) * (1 - progress);
  if (easing === "ease-in-out") return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  if (easing === "bounce") return Math.min(1, 1 - Math.abs(Math.cos(progress * Math.PI * 3)) * (1 - progress));
  return progress;
}

/**
 * Samples authored impact accents without retaining renderer state. This keeps scrubbing,
 * video export, and standalone playback pixel-stable at the same project frame.
 */
export function sampleTimelineEffects2D(timeline: TimelineDeclaration2D | undefined, frame: number): SampledTimelineEffect2D[] {
  assertFinite(frame, "timeline effect frame");
  if (!timeline?.effects?.length) return [];
  return timeline.effects.flatMap((effect) => {
    const progress = (frame - effect.frame) / effect.durationFrames;
    if (progress < 0 || progress > 1) return [];
    const envelope = effect.kind === "screen-transition" && effect.durationFrames === 1
      ? frame === effect.frame ? 1 : 0
      : effect.kind === "particle-burst"
        ? isParticlePresetId2D(effect.preset) && PARTICLE_PRESETS_2D[effect.preset].placement !== "burst" ? 1 : 1 - progress
        : Math.sin(Math.PI * Math.pow(progress, effect.kind === "camera-shake" ? 0.42 : 0.7));
    return [{ ...effect, progress: clamp(progress, 0, 1), envelope: clamp(envelope, 0, 1) }];
  });
}




/**
 * Applies evaluated values to a transient world snapshot. The source snapshot, world, and canonical project remain untouched.
 */
export function applyTimelineOverrides2D(snapshot: PlayableWorldSnapshot, overrides: readonly TimelinePropertyOverride2D[]): TimelineWorldSnapshot2D {
  const byTarget = new Map<string, TimelinePropertyOverride2D[]>();
  for (const override of overrides) {
    let values = byTarget.get(override.targetId);
    if (!values) byTarget.set(override.targetId, values = []);
    values.push(override);
  }
  return {
    ...snapshot,
    entities: snapshot.entities.map((source) => {
      const values = byTarget.get(source.id);
      if (!values?.length) return { ...source };
      const entity: TimelineEntitySnapshot2D = { ...source };
      for (const override of values) {
        const value = override.property === "scale" ? Math.max(0.01, override.value)
          : override.property === "opacity" ? clamp(override.value, 0, 1)
          : override.value;
        entity[override.property] = value;
      }
      return entity;
    }),
  };
}

export type PlayableTimeline2D = {
  readonly diagnostics: readonly TimelineDiagnostic2D[];
  snapshot(): TimelinePlaybackSnapshot2D;
  reset(frame?: number): TimelinePlaybackSnapshot2D;
  advance(deltaSeconds: number): TimelineAdvanceResult2D;
};

type PlayableTimeline2DFactory = {
  (project: PlayableTimelineProject2D): PlayableTimeline2D;
  new(project: PlayableTimelineProject2D): PlayableTimeline2D;
  readonly prototype: object;
};

const playableTimeline2DPrototype = {};

export function createPlayableTimeline2D(project: PlayableTimelineProject2D): PlayableTimeline2D {
  if (project.timeline) validateTimelineDeclaration(project.timeline);
  const diagnostics = auditPlayableTimeline2D(project);
  const timeline = project.timeline ? {
    ...project.timeline,
    tracks: project.timeline.tracks.map((track) => ({ ...track, keyframes: track.keyframes.map((key) => ({ ...key })) })),
    clipTracks: project.timeline.clipTracks?.map((track) => ({ ...track, keyframes: track.keyframes.map((key) => ({ ...key })) })),
    audioTracks: project.timeline.audioTracks.map((track) => ({ ...track })),
    events: project.timeline.events.map((event) => ({ ...event })),
  } : undefined;
  const tracks = timeline?.tracks.map((track) => ({ ...track, keyframes: normalizeKeyframes(track.keyframes) })) ?? [];
  const clipTracks: NormalizedClipTrack[] = timeline?.clipTracks?.map((track) => ({ ...track, keyframes: normalizeClipKeyframes(track.keyframes) })) ?? [];
  const events = timeline?.events.map((event, sourceIndex) => ({ ...event, sourceIndex }))
    .sort((left, right) => left.frame - right.frame || left.sourceIndex - right.sourceIndex) ?? [];
  let frame = 0;
  let loop = 0;
  let finished = false;
  let initialBoundaryPending = true;

  const evaluate = (): TimelinePropertyOverride2D[] => {
    const winners = new Map<string, TimelinePropertyOverride2D>();
    for (const track of tracks) {
      if (track.muted || track.property === "camera") continue;
      const value = evaluateNormalizedTrack(track, frame);
      if (value === undefined) continue;
      winners.set(`${track.targetId}\u0000${track.property}`, { trackId: track.id, targetId: track.targetId, property: track.property, value });
    }
    return [...winners.values()];
  };
  const evaluateClips = (): TimelineClipOverride2D[] => {
    const winners = new Map<string, TimelineClipOverride2D>();
    for (const track of clipTracks) {
      if (track.muted) continue;
      const cue = evaluateNormalizedClipTrack(track, frame);
      if (cue === undefined) continue;
      winners.set(track.targetId, { trackId: track.id, targetId: track.targetId, clipId: cue.clipId, startFrame: cue.frame });
    }
    return [...winners.values()];
  };
  const snapshot = (): TimelinePlaybackSnapshot2D => ({ frame, loop, finished, overrides: evaluate(), clipOverrides: evaluateClips() });
  const appendEvents = (
    target: TimelineEventOccurrence2D[], start: number, end: number, includeStart: boolean, includeEnd: boolean
  ): number => {
    const first = includeStart ? lowerBoundEvent(events, start) : upperBoundFrame(events, start);
    const last = includeEnd ? upperBoundFrame(events, end) : lowerBoundEvent(events, end);
    const count = Math.max(0, last - first);
    const available = Math.max(0, MAX_EVENT_OCCURRENCES_PER_ADVANCE - target.length);
    const appended = Math.min(count, available);
    for (let index = first; index < first + appended; index += 1) {
      const event = events[index];
      if (!event) throw new Error("timeline event search produced an invalid interval");
      target.push({ eventId: event.id, frame: event.frame, label: event.label, kind: event.kind, loop });
    }
    return count - appended;
  };

  const runtime: PlayableTimeline2D = {
    diagnostics,
    snapshot,
    reset(nextFrame = 0) {
      assertFinite(nextFrame, "timeline reset frame");
      frame = timeline ? clamp(nextFrame, 0, timeline.durationFrames) : 0;
      if (timeline && hasLoop(timeline) && frame >= timeline.loopEnd) {
        frame = timeline.loopStart + modulo(frame - timeline.loopStart, timeline.loopEnd - timeline.loopStart);
      }
      loop = 0;
      finished = false;
      initialBoundaryPending = true;
      return snapshot();
    },
    advance(deltaSeconds) {
      assertFinite(deltaSeconds, "timeline deltaSeconds");
      if (deltaSeconds < 0) throw new RangeError("timeline deltaSeconds must be non-negative");
      if (deltaSeconds > MAX_ADVANCE_SECONDS) throw new RangeError(`timeline deltaSeconds must not exceed ${MAX_ADVANCE_SECONDS}; hosts should advance bounded slices`);
      const previousFrame = frame;
      const occurrences: TimelineEventOccurrence2D[] = [];
      let droppedEventOccurrences = 0;
      if (!timeline || finished || deltaSeconds === 0) return { ...snapshot(), previousFrame, events: occurrences, droppedEventOccurrences };

      let remaining = deltaSeconds * timeline.fps * timeline.playbackSpeed;
      const looping = hasLoop(timeline);
      let includeStart = initialBoundaryPending;
      initialBoundaryPending = false;
      while (remaining > EPSILON && !finished) {
        const boundary = looping ? timeline.loopEnd : timeline.durationFrames;
        const distance = Math.max(0, boundary - frame);
        if (remaining < distance - EPSILON) {
          const end = frame + remaining;
          droppedEventOccurrences += appendEvents(occurrences, frame, end, includeStart, true);
          frame = end;
          remaining = 0;
          includeStart = false;
          continue;
        }
        droppedEventOccurrences += appendEvents(occurrences, frame, boundary, includeStart, !looping);
        remaining = Math.max(0, remaining - distance);
        includeStart = false;
        if (!looping) {
          frame = timeline.durationFrames;
          finished = true;
          break;
        }
        frame = timeline.loopStart;
        loop += 1;
        droppedEventOccurrences += appendEvents(occurrences, frame, frame, true, true);
        if (distance <= EPSILON && timeline.loopEnd - timeline.loopStart <= EPSILON) break;
      }
      return { ...snapshot(), previousFrame, events: occurrences, droppedEventOccurrences };
    }
  };
  Object.setPrototypeOf(runtime, playableTimeline2DPrototype);
  return runtime;
}

function playableTimeline2DFactory(project: PlayableTimelineProject2D): PlayableTimeline2D {
  return createPlayableTimeline2D(project);
}

function isPlayableTimeline2DFactory(value: unknown): value is PlayableTimeline2DFactory {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function requirePlayableTimeline2DFactory(value: unknown): PlayableTimeline2DFactory {
  if (!isPlayableTimeline2DFactory(value)) throw new Error("Playable timeline factory must be constructable");
  return value;
}

Object.defineProperty(playableTimeline2DFactory, "prototype", { value: playableTimeline2DPrototype });
export const PlayableTimeline2D = requirePlayableTimeline2DFactory(playableTimeline2DFactory);

function evaluateNormalizedTrack(track: NormalizedTrack, frame: number) {
  const keys = track.keyframes;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) return undefined;
  if (frame <= first.frame) return first.value;
  if (frame >= last.frame) return last.value;
  const rightIndex = upperBoundFrame(keys, frame);
  const right = keys[rightIndex];
  const left = keys[rightIndex - 1];
  if (!right || !left) throw new Error("timeline keyframe search produced an invalid interval");
  const progress = applyTimelineEasing2D((frame - left.frame) / (right.frame - left.frame), right.easing);
  return left.value + (right.value - left.value) * progress;
}

function normalizeKeyframes(source: readonly TimelineKeyframe2D[]) {
  const ordered = source.map((key, index) => ({ key: { ...key }, index })).sort((left, right) => left.key.frame - right.key.frame || left.index - right.index);
  const result: TimelineKeyframe2D[] = [];
  for (const entry of ordered) {
    if (result[result.length - 1]?.frame === entry.key.frame) result[result.length - 1] = entry.key;
    else result.push(entry.key);
  }
  return result;
}

function evaluateNormalizedClipTrack(track: NormalizedClipTrack, frame: number) {
  if (!track.keyframes.length || frame < track.keyframes[0]!.frame) return undefined;
  return track.keyframes[Math.max(0, upperBoundFrame(track.keyframes, frame) - 1)];
}

function normalizeClipKeyframes(source: readonly TimelineClipKeyframe2D[]) {
  const ordered = source.map((key, index) => ({ key: { ...key }, index })).sort((left, right) => left.key.frame - right.key.frame || left.index - right.index);
  const result: TimelineClipKeyframe2D[] = [];
  for (const entry of ordered) {
    if (result[result.length - 1]?.frame === entry.key.frame) result[result.length - 1] = entry.key;
    else result.push(entry.key);
  }
  return result;
}

function validateTimelineDeclaration(timeline: TimelineDeclaration2D) {
  assertRange(timeline.fps, "timeline fps", 1, 240);
  assertIntegerRange(timeline.durationFrames, "timeline durationFrames", 1, 1_000_000);
  assertIntegerRange(timeline.loopStart, "timeline loopStart", 0, timeline.durationFrames);
  assertIntegerRange(timeline.loopEnd, "timeline loopEnd", timeline.loopStart, timeline.durationFrames);
  assertRange(timeline.playbackSpeed, "timeline playbackSpeed", 0.05, 8);
  if (!Array.isArray(timeline.tracks) || timeline.tracks.length > MAX_TRACKS) throw new RangeError(`timeline tracks must contain at most ${MAX_TRACKS} entries`);
  if (timeline.clipTracks !== undefined && (!Array.isArray(timeline.clipTracks) || timeline.clipTracks.length > MAX_TRACKS)) throw new RangeError(`timeline clipTracks must contain at most ${MAX_TRACKS} entries`);
  if (timeline.tracks.length + (timeline.clipTracks?.length ?? 0) > MAX_TRACKS) throw new RangeError(`timeline numeric and clip tracks must contain at most ${MAX_TRACKS} combined entries`);
  if (!Array.isArray(timeline.audioTracks) || timeline.audioTracks.length > MAX_AUDIO_TRACKS) throw new RangeError(`timeline audioTracks must contain at most ${MAX_AUDIO_TRACKS} entries`);
  if (!Array.isArray(timeline.events) || timeline.events.length > MAX_EVENTS) throw new RangeError(`timeline events must contain at most ${MAX_EVENTS} entries`);
  let totalKeyframes = 0;
  for (const track of timeline.tracks) {
    assertText(track.id, "timeline track id");
    assertText(track.targetId, `timeline track ${track.id} targetId`);
    assertText(track.label, `timeline track ${track.id} label`);
    if (!["x", "y", "scale", "rotation", "opacity", "camera"].includes(track.property)) throw new Error(`timeline track ${track.id} property is unsupported`);
    if (typeof track.muted !== "boolean" || typeof track.locked !== "boolean") throw new Error(`timeline track ${track.id} flags are invalid`);
    if (!Array.isArray(track.keyframes) || track.keyframes.length > MAX_KEYFRAMES_PER_TRACK) throw new RangeError(`timeline track ${track.id} must contain at most ${MAX_KEYFRAMES_PER_TRACK} keyframes`);
    totalKeyframes += track.keyframes.length;
    if (totalKeyframes > MAX_TOTAL_KEYFRAMES) throw new RangeError(`timeline tracks must contain at most ${MAX_TOTAL_KEYFRAMES} total keyframes`);
    for (const key of track.keyframes) {
      assertText(key.id, `timeline track ${track.id} keyframe id`);
      assertIntegerRange(key.frame, `timeline keyframe ${key.id} frame`, 0, timeline.durationFrames);
      assertFinite(key.value, `timeline keyframe ${key.id} value`);
      if (!["linear", "ease-in", "ease-out", "ease-in-out", "bounce", "hold"].includes(key.easing)) throw new Error(`timeline keyframe ${key.id} easing is unsupported`);
    }
  }
  for (const track of timeline.clipTracks ?? []) {
    assertText(track.id, "timeline clip track id");
    assertText(track.targetId, `timeline clip track ${track.id} targetId`);
    assertText(track.label, `timeline clip track ${track.id} label`);
    if (typeof track.muted !== "boolean" || typeof track.locked !== "boolean") throw new Error(`timeline clip track ${track.id} flags are invalid`);
    if (!Array.isArray(track.keyframes) || track.keyframes.length > MAX_KEYFRAMES_PER_TRACK) throw new RangeError(`timeline clip track ${track.id} must contain at most ${MAX_KEYFRAMES_PER_TRACK} keyframes`);
    totalKeyframes += track.keyframes.length;
    if (totalKeyframes > MAX_TOTAL_KEYFRAMES) throw new RangeError(`timeline tracks must contain at most ${MAX_TOTAL_KEYFRAMES} total keyframes`);
    for (const key of track.keyframes) {
      assertText(key.id, `timeline clip track ${track.id} keyframe id`);
      assertIntegerRange(key.frame, `timeline clip keyframe ${key.id} frame`, 0, timeline.durationFrames);
      assertText(key.clipId, `timeline clip keyframe ${key.id} clipId`);
    }
  }
  for (const track of timeline.audioTracks) {
    assertText(track.id, "timeline audio track id");
    assertText(track.name, `timeline audio track ${track.id} name`);
    if (track.assetId !== undefined) assertText(track.assetId, `timeline audio track ${track.id} assetId`);
    for (const field of ["startFrame", "durationFrames", "trimStart", "trimEnd", "fadeIn", "fadeOut", "loopStart", "loopEnd"] as const) {
      assertRange(track[field], `timeline audio track ${track.id} ${field}`, 0, timeline.durationFrames);
    }
    assertRange(track.volume, `timeline audio track ${track.id} volume`, 0, 2);
    assertRange(track.pan, `timeline audio track ${track.id} pan`, -1, 1);
    if (typeof track.muted !== "boolean" || typeof track.solo !== "boolean") throw new Error(`timeline audio track ${track.id} flags are invalid`);
  }
  for (const event of timeline.events) {
    assertText(event.id, "timeline event id");
    assertText(event.label, `timeline event ${event.id} label`);
    assertIntegerRange(event.frame, `timeline event ${event.id} frame`, 0, timeline.durationFrames);
    if (!["audio", "logic", "camera", "marker"].includes(event.kind)) throw new Error(`timeline event ${event.id} kind is unsupported`);
  }
  if (timeline.effects !== undefined) {
    if (!Array.isArray(timeline.effects) || timeline.effects.length > MAX_EVENTS) throw new RangeError(`timeline effects must contain at most ${MAX_EVENTS} entries`);
    const effectIds = new Set<string>();
    for (const effect of timeline.effects) {
      validateTimelineEffectPlacement2D(effect);
      assertText(effect.id, "timeline effect id");
      assertText(effect.label, `timeline effect ${effect.id} label`);
      assertIntegerRange(effect.frame, `timeline effect ${effect.id} frame`, 0, timeline.durationFrames);
      assertIntegerRange(effect.durationFrames, `timeline effect ${effect.id} durationFrames`, 1, timeline.durationFrames);
      assertRange(effect.intensity, `timeline effect ${effect.id} intensity`, 0, 100);
      if (!(["camera-shake", "particle-burst", "hit-flash", "screen-transition"] as const).includes(effect.kind)) throw new Error(`timeline effect ${effect.id} kind is unsupported`);
      if (effect.targetId !== undefined) assertText(effect.targetId, `timeline effect ${effect.id} targetId`);
      if (effect.color !== undefined && !/^#[0-9a-f]{6}$/i.test(effect.color)) throw new Error(`timeline effect ${effect.id} color is unsupported`);
      if (effect.particleCount !== undefined) assertIntegerRange(effect.particleCount, `timeline effect ${effect.id} particleCount`, 1, 128);
      if (effect.preset !== undefined) assertText(effect.preset, `timeline effect ${effect.id} preset`);
      if (effect.preset !== undefined && effect.kind === "particle-burst" && !isParticlePresetId2D(effect.preset)) throw new Error(`timeline effect ${effect.id} particle preset is unsupported`);
      if (effect.preset !== undefined && effect.kind === "screen-transition" && !isTransitionPresetId2D(effect.preset)) throw new Error(`timeline effect ${effect.id} transition preset is unsupported`);
      if (effectIds.has(effect.id)) throw new Error(`duplicate timeline effect id ${effect.id}`);
      effectIds.add(effect.id);
    }
  }
}

function hasLoop(timeline: TimelineDeclaration2D) {
  return timeline.loopEnd > timeline.loopStart;
}

function lowerBoundEvent(events: readonly IndexedEvent[], frame: number) {
  let low = 0, high = events.length;
  while (low < high) { const middle = (low + high) >>> 1; if (events[middle]!.frame < frame) low = middle + 1; else high = middle; }
  return low;
}

function upperBoundFrame(events: ReadonlyArray<{ frame: number }>, frame: number) {
  let low = 0, high = events.length;
  while (low < high) { const middle = (low + high) >>> 1; if (events[middle]!.frame <= frame) low = middle + 1; else high = middle; }
  return low;
}









export { timelineEffectNoise2D } from "./timeline/effect-noise.ts";
