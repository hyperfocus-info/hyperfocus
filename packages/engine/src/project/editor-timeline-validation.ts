import { isObject } from "@hyperfocus/utilities/records";
import type { EditorProject } from "./editor.ts";
import { validateTimelineEffectPlacement2D } from "./metadata/index.ts";
import { isParticlePresetId2D, isTransitionPresetId2D } from "../effects/creative-presets.ts";

const TIMELINE_PROPERTIES = ["x", "y", "scale", "rotation", "opacity", "camera"] as const;
const KEYFRAME_EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out", "bounce", "hold"] as const;
const TIMELINE_EVENT_KINDS = ["audio", "logic", "camera", "marker"] as const;
const TIMELINE_EFFECT_KINDS = ["camera-shake", "particle-burst", "hit-flash", "screen-transition"] as const;
const MAX_TIMELINE_TRACKS = 2_048;

export function validateEditorAtlas(project: EditorProject) {
  const atlas = project.atlas;
  assertFinite(atlas.frameWidth, "Atlas frame width", 1, 16_384);
  assertFinite(atlas.frameHeight, "Atlas frame height", 1, 16_384);
  assertFinite(atlas.playbackSpeed, "Atlas playback speed", 0.01, 100);
  if (!Array.isArray(atlas.frames) || atlas.frames.length > 10_000 || !Array.isArray(atlas.sequence)) throw new Error("Atlas frame data is invalid or too large.");
  const frameIds = new Set<string>();
  for (const frame of atlas.frames) {
    if (!isObject(frame)) throw new Error("Atlas frame data is invalid.");
    assertText(frame.id, "Atlas frame id", 128); assertText(frame.name, "Atlas frame name", 256);
    for (const key of ["x", "y", "width", "height"] as const) assertFinite(frame[key], `Atlas frame ${key}`, key === "width" || key === "height" ? 1 : 0, 1_000_000);
    assertColor(frame.color, `Atlas frame ${frame.id} color`);
    if (frameIds.has(frame.id)) throw new Error(`Duplicate atlas frame id: ${frame.id}`);
    frameIds.add(frame.id);
  }
  if (atlas.sequence.length > 100_000 || atlas.sequence.some((id) => !frameIds.has(id))) throw new Error("Atlas sequence references an unknown frame or is too large.");
  const clipIds = new Set<string>();
  if (atlas.clips !== undefined) {
    if (!Array.isArray(atlas.clips) || atlas.clips.length > 1_000) throw new Error("Atlas clips are invalid or too large.");
    for (const clip of atlas.clips) {
      if (!isObject(clip)) throw new Error("Atlas clip is invalid.");
      assertText(clip.id, "Atlas clip id", 128); assertText(clip.name, "Atlas clip name", 256); assertFinite(clip.fps, `Atlas clip ${clip.id} fps`, 0.1, 240);
      if (typeof clip.loop !== "boolean" || !Array.isArray(clip.sequence) || clip.sequence.some((id) => !frameIds.has(id))) throw new Error(`Atlas clip ${clip.id} is invalid.`);
      if (clipIds.has(clip.id)) throw new Error(`Duplicate atlas clip id: ${clip.id}`);
      clipIds.add(clip.id);
    }
    if (atlas.defaultClipId !== undefined && !clipIds.has(atlas.defaultClipId)) throw new Error("Atlas default clip does not exist.");
  }
}

export function validateEditorTimeline(project: EditorProject) {
  const timeline = project.timeline;
  assertFinite(timeline.fps, "Timeline frame rate", 1, 240);
  assertInteger(timeline.durationFrames, "Timeline duration", 1, 1_000_000);
  assertFinite(timeline.bpm, "Timeline BPM", 20, 400);
  assertInteger(timeline.beatsPerBar, "Timeline beats per bar", 1, 32);
  if (timeline.rhythm !== undefined) validateRhythmMap(timeline.rhythm, timeline.durationFrames, new Set(project.assets.map((asset) => asset.id)));
  assertInteger(timeline.loopStart, "Timeline loop start", 0, timeline.durationFrames);
  assertInteger(timeline.loopEnd, "Timeline loop end", timeline.loopStart, timeline.durationFrames);
  assertFinite(timeline.playbackSpeed, "Timeline playback speed", 0.05, 8);
  if (!Array.isArray(timeline.tracks)) throw new Error("Timeline tracks are invalid or too large.");
  if (timeline.clipTracks !== undefined && !Array.isArray(timeline.clipTracks)) throw new Error("Timeline clip tracks are invalid or too large.");
  if (timeline.tracks.length + (timeline.clipTracks?.length ?? 0) > MAX_TIMELINE_TRACKS) throw new Error("Timeline tracks are invalid or too large.");
  if (!Array.isArray(timeline.audioTracks) || timeline.audioTracks.length > 256) throw new Error("Timeline audio tracks are invalid or too large.");
  if (!Array.isArray(timeline.events) || timeline.events.length > 100_000) throw new Error("Timeline events are invalid or too large.");
  if (timeline.effects !== undefined && (!Array.isArray(timeline.effects) || timeline.effects.length > 100_000)) throw new Error("Timeline effects are invalid or too large.");

  const timelineIds = new Set<string>();
  for (const track of timeline.tracks) {
    if (!isObject(track) || !Array.isArray(track.keyframes)) throw new Error("Timeline track data is invalid.");
    assertText(track.id, "Timeline track id", 128); assertText(track.targetId, "Timeline target", 128); assertText(track.label, "Timeline track label", 256); assertColor(track.color, `Timeline track ${track.id} color`);
    if (timelineIds.has(track.id)) throw new Error(`Duplicate timeline track id: ${track.id}`); timelineIds.add(track.id);
    if (!isOneOf(track.property, TIMELINE_PROPERTIES) || typeof track.muted !== "boolean" || typeof track.locked !== "boolean") throw new Error(`Timeline track ${track.id} is invalid.`);
    for (const key of track.keyframes) {
      if (!isObject(key)) throw new Error(`Timeline track ${track.id} contains an invalid key.`);
      assertText(key.id, "Keyframe id", 128); assertInteger(key.frame, "Keyframe frame", 0, timeline.durationFrames); assertFinite(key.value, "Keyframe value", -1_000_000_000, 1_000_000_000);
      if (!isOneOf(key.easing, KEYFRAME_EASINGS)) throw new Error(`Keyframe ${key.id} has an invalid easing.`);
    }
  }

  const entityIds = new Set(project.scenes.flatMap((scene) => scene.entities.map((entity) => entity.id)));
  const atlasClipIds = new Set((project.atlas.clips ?? []).map((clip) => clip.id));
  for (const track of timeline.clipTracks ?? []) {
    if (!isObject(track) || !Array.isArray(track.keyframes) || track.keyframes.length > 100_000) throw new Error("Timeline clip track data is invalid or too large.");
    assertText(track.id, "Timeline clip track id", 128); assertText(track.targetId, "Timeline clip target", 128); assertText(track.label, "Timeline clip track label", 256);
    if (timelineIds.has(track.id)) throw new Error(`Duplicate timeline track id: ${track.id}`); timelineIds.add(track.id);
    if (typeof track.muted !== "boolean" || typeof track.locked !== "boolean") throw new Error(`Timeline clip track ${track.id} is invalid.`);
    if (!entityIds.has(track.targetId)) throw new Error(`Timeline clip track ${track.id} targets a missing entity.`);
    const keyIds = new Set<string>();
    for (const key of track.keyframes) {
      if (!isObject(key)) throw new Error(`Timeline clip track ${track.id} contains an invalid key.`);
      assertText(key.id, "Clip keyframe id", 128); assertInteger(key.frame, "Clip keyframe frame", 0, timeline.durationFrames); assertText(key.clipId, "Clip keyframe clip id", 128);
      if (!atlasClipIds.has(key.clipId)) throw new Error(`Clip keyframe ${key.id} references missing atlas clip ${key.clipId}.`);
      if (keyIds.has(key.id)) throw new Error(`Duplicate clip keyframe id: ${key.id}`);
      keyIds.add(key.id);
    }
  }
  for (const audio of timeline.audioTracks) {
    if (!isObject(audio)) throw new Error("Timeline audio track data is invalid.");
    assertText(audio.id, "Audio track id", 128); assertText(audio.name, "Audio track name", 512);
    for (const key of ["startFrame", "durationFrames", "trimStart", "trimEnd", "fadeIn", "fadeOut", "loopStart", "loopEnd"] as const) assertFinite(audio[key], `Audio track ${audio.id} ${key}`, 0, timeline.durationFrames);
    if (audio.sourceInSeconds !== undefined) assertFinite(audio.sourceInSeconds, `Audio track ${audio.id} source in`, 0, 86_400);
    if (audio.sourceOutSeconds !== undefined) assertFinite(audio.sourceOutSeconds, `Audio track ${audio.id} source out`, 0, 86_400);
    if (audio.sourceOutSeconds !== undefined && audio.sourceOutSeconds <= (audio.sourceInSeconds ?? 0)) throw new Error(`Audio track ${audio.id} source out must be after source in.`);
    assertFinite(audio.volume, `Audio track ${audio.id} volume`, 0, 2); assertFinite(audio.pan, `Audio track ${audio.id} pan`, -1, 1);
    if (typeof audio.muted !== "boolean" || typeof audio.solo !== "boolean") throw new Error(`Audio track ${audio.id} mixer state is invalid.`);
  }
  for (const event of timeline.events) {
    if (!isObject(event)) throw new Error("Timeline event data is invalid.");
    assertText(event.id, "Timeline event id", 128); assertText(event.label, "Timeline event label", 256); assertInteger(event.frame, "Timeline event frame", 0, timeline.durationFrames);
    if (!isOneOf(event.kind, TIMELINE_EVENT_KINDS)) throw new Error(`Timeline event ${event.id} has an invalid kind.`);
  }
  const effectIds = new Set<string>();
  for (const effect of timeline.effects ?? []) {
    if (!isObject(effect)) throw new Error("Timeline effect data is invalid.");
    validateTimelineEffectPlacement2D(effect);
    assertText(effect.id, "Timeline effect id", 128); assertText(effect.label, "Timeline effect label", 256);
    assertInteger(effect.frame, `Timeline effect ${effect.id} frame`, 0, timeline.durationFrames);
    assertInteger(effect.durationFrames, `Timeline effect ${effect.id} duration`, 1, timeline.durationFrames);
    assertFinite(effect.intensity, `Timeline effect ${effect.id} intensity`, 0, 100);
    if (!isOneOf(effect.kind, TIMELINE_EFFECT_KINDS)) throw new Error(`Timeline effect ${effect.id} has an invalid kind.`);
    if (effect.targetId !== undefined) assertText(effect.targetId, `Timeline effect ${effect.id} target`, 128);
    if (effect.kind === "hit-flash" && !effect.targetId) throw new Error(`Timeline effect ${effect.id} requires a target.`);
    if (effect.targetId && !entityIds.has(effect.targetId)) throw new Error(`Timeline effect ${effect.id} targets a missing entity.`);
    if (effect.color !== undefined) assertColor(effect.color, `Timeline effect ${effect.id} color`);
    if (effect.particleCount !== undefined) assertInteger(effect.particleCount, `Timeline effect ${effect.id} particle count`, 1, 128);
    if (effect.preset !== undefined) assertText(effect.preset, `Timeline effect ${effect.id} preset`, 64);
    if (effect.preset !== undefined && effect.kind === "particle-burst" && !isParticlePresetId2D(effect.preset)) throw new Error(`Timeline effect ${effect.id} has an invalid particle preset.`);
    if (effect.preset !== undefined && effect.kind === "screen-transition" && !isTransitionPresetId2D(effect.preset)) throw new Error(`Timeline effect ${effect.id} has an invalid transition preset.`);
    if (effect.preset !== undefined && effect.kind !== "particle-burst" && effect.kind !== "screen-transition") throw new Error(`Timeline effect ${effect.id} cannot use a preset.`);
    if (effectIds.has(effect.id)) throw new Error(`Duplicate timeline effect id: ${effect.id}`);
    effectIds.add(effect.id);
  }
}

function validateRhythmMap(value: NonNullable<EditorProject["timeline"]["rhythm"]>, durationFrames: number, assetIds: ReadonlySet<string>) {
  if (!isObject(value)) throw new Error("Timeline rhythm map is invalid.");
  if (value.sourceAssetId !== undefined && !assetIds.has(value.sourceAssetId)) throw new Error(`Timeline rhythm map references missing asset ${value.sourceAssetId}.`);
  assertFinite(value.bpmConfidence, "Timeline BPM confidence", 0, 1);
  assertInteger(value.downbeatFrame, "Timeline downbeat frame", 0, durationFrames);
  if (!Array.isArray(value.transientFrames) || value.transientFrames.length > 100_000) throw new Error("Timeline transient frames are invalid or too large.");
  let previousTransient = -1;
  for (const frame of value.transientFrames) {
    assertInteger(frame, "Timeline transient frame", 0, durationFrames);
    if (frame <= previousTransient) throw new Error("Timeline transient frames must be unique and sorted.");
    previousTransient = frame;
  }
  if (!Array.isArray(value.waveform) || value.waveform.length > 4_096) throw new Error("Timeline waveform summary is invalid or too large.");
  for (const sample of value.waveform) assertFinite(sample, "Timeline waveform sample", 0, 1);
  if (!Array.isArray(value.sections) || value.sections.length > 1_000) throw new Error("Timeline rhythm sections are invalid or too large.");
  const ids = new Set<string>();
  let previousSection = -1;
  for (const section of value.sections) {
    if (!isObject(section)) throw new Error("Timeline rhythm section is invalid.");
    assertText(section.id, "Timeline rhythm section id", 128);
    assertText(section.label, "Timeline rhythm section label", 160);
    assertInteger(section.frame, `Timeline rhythm section ${section.id} frame`, 0, durationFrames);
    if (!isOneOf(section.kind, ["intro", "verse", "chorus", "bridge", "drop", "outro", "custom"] as const)) throw new Error(`Timeline rhythm section ${section.id} kind is invalid.`);
    if (section.frame < previousSection) throw new Error("Timeline rhythm sections must be sorted by frame.");
    if (ids.has(section.id)) throw new Error(`Duplicate timeline rhythm section id: ${section.id}`);
    ids.add(section.id); previousSection = section.frame;
  }
}


function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T { return typeof value === "string" && options.some(option => option === value); }
function assertText(value: unknown, label: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) throw new Error(`${label} must be 1-${maxLength} characters.`);
}
function assertFinite(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
}
function assertInteger(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  assertFinite(value, label, minimum, maximum);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer.`);
}
function assertColor(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${label} must be a six-digit hex color.`);
}
