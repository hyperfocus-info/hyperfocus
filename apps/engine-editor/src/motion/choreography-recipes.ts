import type {
  EditorEntityData,
  EditorKeyframe,
  EditorTimelineEffect,
  EditorTimelineTrack,
} from "@hyperfocus/engine/project";

export type ChoreographyRecipeId = "anticipation" | "lunge" | "impact" | "bite" | "transform";

export type ChoreographyTimeline = {
  durationFrames: number;
  tracks: EditorTimelineTrack[];
  effects?: EditorTimelineEffect[];
};

export type ChoreographyRecipeResult = {
  timeline: ChoreographyTimeline;
  changedTrackIds: string[];
  effectIds: string[];
  contactFrame: number;
  endFrame: number;
};

/**
 * Expands a readable action recipe into editable transform keys and deterministic effect cues.
 * The output is ordinary timeline data: creators can retime or remove every generated detail.
 */
export function applyChoreographyRecipe2D(options: {
  timeline: ChoreographyTimeline;
  recipe: ChoreographyRecipeId;
  frame: number;
  primary: EditorEntityData;
  secondary?: EditorEntityData;
  id?: string;
}): ChoreographyRecipeResult {
  const timeline = structuredClone(options.timeline);
  timeline.effects ??= [];
  const start = clampFrame(options.frame, timeline.durationFrames);
  const id = sanitizeId(options.id ?? `${options.recipe}-${options.primary.id}-${start}`);
  const changed = new Set<string>();
  const effectIds: string[] = [];
  const direction = unitDirection(options.primary, options.secondary);
  let contactFrame = start;
  let endFrame = start;

  const key = (
    entity: EditorEntityData,
    property: EditorTimelineTrack["property"],
    frameOffset: number,
    value: number,
    easing: EditorKeyframe["easing"] = "ease-in-out",
  ) => {
    if (property === "camera") return;
    const frame = clampFrame(start + frameOffset, timeline.durationFrames);
    const track = ensureTrack(timeline, entity, property);
    const keyframe: EditorKeyframe = { id: `${id}-${entity.id}-${property}-${frameOffset}`, frame, value, easing };
    const existing = track.keyframes.findIndex((candidate) => candidate.frame === frame);
    if (existing >= 0) track.keyframes[existing] = keyframe;
    else track.keyframes.push(keyframe);
    track.keyframes.sort((left, right) => left.frame - right.frame || left.id.localeCompare(right.id));
    changed.add(track.id);
    endFrame = Math.max(endFrame, frame);
  };

  const effect = (input: Omit<EditorTimelineEffect, "id" | "frame" | "label"> & { offset: number; label: string }) => {
    const effectId = `${id}-fx-${effectIds.length + 1}`;
    const frame = clampFrame(start + input.offset, timeline.durationFrames);
    const { offset: _offset, ...fields } = input;
    void _offset;
    const cue: EditorTimelineEffect = { ...fields, id: effectId, frame };
    timeline.effects!.push(cue);
    effectIds.push(effectId);
    endFrame = Math.max(endFrame, Math.min(timeline.durationFrames, frame + cue.durationFrames));
  };

  const anticipation = (entity: EditorEntityData, strength = 1) => {
    key(entity, "x", 0, entity.x);
    key(entity, "y", 0, entity.y);
    key(entity, "scale", 0, entity.scale);
    key(entity, "rotation", 0, entity.rotation ?? 0);
    key(entity, "x", 4, entity.x - direction.x * 14 * strength, "ease-in");
    key(entity, "y", 4, entity.y - direction.y * 14 * strength, "ease-in");
    key(entity, "scale", 4, entity.scale * (1 - 0.09 * strength), "ease-in");
    key(entity, "rotation", 4, (entity.rotation ?? 0) - direction.y * 0.08 - direction.x * 0.12 * strength, "ease-in");
  };

  if (options.recipe === "anticipation") {
    anticipation(options.primary);
    key(options.primary, "x", 8, options.primary.x + direction.x * 5, "ease-out");
    key(options.primary, "y", 8, options.primary.y + direction.y * 5, "ease-out");
    key(options.primary, "scale", 8, options.primary.scale * 1.04, "ease-out");
    key(options.primary, "rotation", 8, options.primary.rotation ?? 0, "ease-out");
    key(options.primary, "x", 12, options.primary.x);
    key(options.primary, "y", 12, options.primary.y);
    key(options.primary, "scale", 12, options.primary.scale);
  }

  if (options.recipe === "lunge" || options.recipe === "bite") {
    anticipation(options.primary, 1.15);
    const travel = options.secondary
      ? Math.max(28, Math.hypot(options.secondary.x - options.primary.x, options.secondary.y - options.primary.y) - (options.primary.width + options.secondary.width) * 0.22)
      : 72;
    contactFrame = clampFrame(start + 9, timeline.durationFrames);
    key(options.primary, "x", 9, options.primary.x + direction.x * travel, "ease-out");
    key(options.primary, "y", 9, options.primary.y + direction.y * travel, "ease-out");
    key(options.primary, "scale", 9, options.primary.scale * 1.13, "ease-out");
    key(options.primary, "rotation", 9, (options.primary.rotation ?? 0) + direction.x * 0.16, "ease-out");
    key(options.primary, "x", 14, options.primary.x + direction.x * travel * 0.72, "ease-in-out");
    key(options.primary, "y", 14, options.primary.y + direction.y * travel * 0.72, "ease-in-out");
    key(options.primary, "scale", 14, options.primary.scale * 0.97, "ease-in-out");
    key(options.primary, "rotation", 14, options.primary.rotation ?? 0, "ease-in-out");
  }

  if (options.recipe === "impact" || options.recipe === "bite") {
    const target = options.recipe === "bite" ? options.secondary : options.primary;
    if (!target) throw new Error("Bite choreography needs a second entity to receive the contact.");
    const hit = options.recipe === "bite" ? 9 : 0;
    contactFrame = clampFrame(start + hit, timeline.durationFrames);
    key(target, "x", hit, target.x, "linear");
    key(target, "y", hit, target.y, "linear");
    key(target, "scale", hit, target.scale, "linear");
    key(target, "rotation", hit, target.rotation ?? 0, "linear");
    key(target, "x", hit + 2, target.x + direction.x * 18, "ease-out");
    key(target, "y", hit + 2, target.y + direction.y * 18, "ease-out");
    key(target, "scale", hit + 2, target.scale * 1.16, "ease-out");
    key(target, "rotation", hit + 2, (target.rotation ?? 0) + direction.x * 0.18, "ease-out");
    key(target, "x", hit + 7, target.x + direction.x * 7, "bounce");
    key(target, "y", hit + 7, target.y + direction.y * 7, "bounce");
    key(target, "scale", hit + 7, target.scale * 0.96, "bounce");
    key(target, "rotation", hit + 7, (target.rotation ?? 0) - direction.x * 0.06, "bounce");
    key(target, "x", hit + 12, target.x);
    key(target, "y", hit + 12, target.y);
    key(target, "scale", hit + 12, target.scale);
    key(target, "rotation", hit + 12, target.rotation ?? 0);
    effect({ offset: hit, durationFrames: 10, label: "Impact camera shake", kind: "camera-shake", intensity: 7 });
    effect({ offset: hit, durationFrames: 5, label: "Impact flash", kind: "hit-flash", targetId: target.id, intensity: 0.9, color: "#fff4dd" });
    effect({ offset: hit, durationFrames: 18, label: options.recipe === "bite" ? "Blood burst" : "Impact debris", kind: "particle-burst", targetId: target.id, intensity: 1, color: options.recipe === "bite" ? "#b3132b" : target.accent, particleCount: options.recipe === "bite" ? 28 : 16 });
  }

  if (options.recipe === "transform") {
    const entity = options.primary;
    for (const [offset, rotation, scale] of [[0, 0, 1], [3, -0.08, 0.94], [5, 0.11, 1.08], [7, -0.14, 0.98], [10, 0.18, 1.15], [14, -0.05, 1.04], [19, 0, 1]] as const) {
      key(entity, "rotation", offset, (entity.rotation ?? 0) + rotation, offset === 19 ? "ease-out" : "ease-in-out");
      key(entity, "scale", offset, entity.scale * scale, offset === 19 ? "ease-out" : "ease-in-out");
    }
    effect({ offset: 4, durationFrames: 14, label: "Transformation flash", kind: "hit-flash", targetId: entity.id, intensity: 0.75, color: "#9dff68" });
    effect({ offset: 8, durationFrames: 22, label: "Transformation particles", kind: "particle-burst", targetId: entity.id, intensity: 0.8, color: "#8bd45c", particleCount: 24 });
    effect({ offset: 8, durationFrames: 9, label: "Transformation camera tremor", kind: "camera-shake", intensity: 3.5 });
  }

  return { timeline, changedTrackIds: [...changed], effectIds, contactFrame, endFrame };
}

function ensureTrack(timeline: ChoreographyTimeline, entity: EditorEntityData, property: EditorTimelineTrack["property"]) {
  const existing = timeline.tracks.find((track) => track.targetId === entity.id && track.property === property && !track.locked);
  if (existing) return existing;
  const id = `track-${sanitizeId(entity.id)}-${property}`;
  const track: EditorTimelineTrack = {
    id: timeline.tracks.some((candidate) => candidate.id === id) ? `${id}-${timeline.tracks.length + 1}` : id,
    targetId: entity.id,
    label: `${entity.label} · ${property}`,
    property,
    color: property === "x" ? "#41d7d0" : property === "y" ? "#6ba9ff" : property === "scale" ? "#b997ff" : "#f2ad4d",
    muted: false,
    locked: false,
    keyframes: [],
  };
  timeline.tracks.push(track);
  return track;
}

function unitDirection(primary: EditorEntityData, secondary?: EditorEntityData) {
  if (!secondary) return { x: 1, y: 0 };
  const x = secondary.x - primary.x;
  const y = secondary.y - primary.y;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function clampFrame(frame: number, duration: number) {
  return Math.max(0, Math.min(duration, Math.round(frame)));
}

function sanitizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "choreography";
}
