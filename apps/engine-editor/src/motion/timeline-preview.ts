import { PARTICLE_PRESETS_2D, isParticlePresetId2D } from "@hyperfocus/engine/effects";
import type { EditorEntityData, EditorProject } from "@hyperfocus/engine/project";
import { drawRenderable, type Renderable } from "@hyperfocus/engine/render";
import {
  evaluateTimelineClipCue2D,
  evaluateTimelineTrack2D,
  sampleTimelineEffects2D,
  timelineEffectNoise2D,
  type SampledTimelineEffect2D,
} from "@hyperfocus/engine/project/runtime-timeline-2d";

type PreviewEntity = Pick<EditorEntityData, "id" | "x" | "y" | "width" | "height" | "scale" | "rotation" | "opacity" | "accent">;
type PreviewProperty = "x" | "y" | "scale" | "rotation" | "opacity";

export function withTimelinePreviewFrame2D<T>(timeline: EditorProject["timeline"], entities: readonly PreviewEntity[], frame: number, operation: () => T): T {
  const snapshots: Array<{ entity: PreviewEntity; property: PreviewProperty; value: number | undefined }> = [];
  for (const track of timeline.tracks) {
    if (track.muted || track.property === "camera") continue;
    const entity = entities.find((candidate) => candidate.id === track.targetId);
    const value = evaluateTimelineTrack2D(track, frame);
    if (!entity || value === undefined) continue;
    snapshots.push({ entity, property: track.property, value: entity[track.property] });
    entity[track.property] = track.property === "scale" ? Math.max(0.01, value) : track.property === "opacity" ? Math.max(0, Math.min(1, value)) : value;
  }
  try { return operation(); }
  finally {
    for (const snapshot of snapshots) {
      if (snapshot.property === "rotation" || snapshot.property === "opacity") snapshot.entity[snapshot.property] = snapshot.value;
      else if (snapshot.value !== undefined) snapshot.entity[snapshot.property] = snapshot.value;
    }
  }
}

export function timelineClipAtFrame2D(timeline: EditorProject["timeline"], entityId: string, frame: number) {
  return timelineClipStateAtFrame2D(timeline, entityId, frame)?.clipId;
}

export function timelineClipStateAtFrame2D(timeline: EditorProject["timeline"], entityId: string, frame: number) {
  let cue: ReturnType<typeof evaluateTimelineClipCue2D>;
  for (const track of timeline.clipTracks ?? []) {
    if (track.targetId === entityId) cue = evaluateTimelineClipCue2D({ track, frame }) ?? cue;
  }
  return cue ? { clipId: cue.clipId, timeSeconds: (frame - cue.frame) / timeline.fps } : undefined;
}

export function timelineCameraShake2D(timeline: EditorProject["timeline"], frame: number, scale = 1, reducedMotion = false) {
  if (reducedMotion) return { x: 0, y: 0 };
  return sampleTimelineEffects2D(timeline, frame)
    .filter((effect) => effect.kind === "camera-shake")
    .reduce((offset, effect) => {
      const sample = Math.round(frame * 3 + effect.progress * 17);
      const amount = effect.intensity * effect.envelope * scale;
      offset.x += timelineEffectNoise2D(effect.id, sample) * amount;
      offset.y += timelineEffectNoise2D(effect.id, sample + 977) * amount;
      return offset;
    }, { x: 0, y: 0 });
}

export function drawTimelineEffects2D({ context: ctx, timeline, entities, frame, viewport = ctx.canvas, layer = "foreground" }: {
  context: CanvasRenderingContext2D;
  timeline: Parameters<typeof sampleTimelineEffects2D>[0];
  entities: readonly PreviewEntity[];
  frame: number;
  viewport?: { width: number; height: number };
  layer?: "foreground" | "background";
}) {
  for (const effect of sampleTimelineEffects2D(timeline, frame)) {
    if (effect.kind === "camera-shake" || (effect.layer ?? "foreground") !== layer) continue;
    if (effect.kind === "screen-transition") { drawScreenTransition(ctx, effect); continue; }
    const target = entities.find((entity) => entity.id === effect.targetId);
    const preset = isParticlePresetId2D(effect.preset) ? PARTICLE_PRESETS_2D[effect.preset] : undefined;
    const needsTarget = effect.space === "target" || (effect.space !== "screen" && effect.targetId && (!preset || preset.placement === "burst"));
    if (needsTarget && !target) continue;
    const origin = target ?? { id: "screen", x: viewport.width / 2, y: viewport.height / 2, width: viewport.width, height: viewport.height, scale: 1, accent: effect.color ?? "#ffffff" };
    if (effect.kind === "hit-flash") { if (target) drawHitFlash(ctx, target, effect); }
    else drawParticleBurst(ctx, origin, effect, viewport);
  }
}

/** Backdrop calls precede background weather; foreground weather remains below the host's HUD. */
export function drawTimelineScene2D(options: Omit<Parameters<typeof drawTimelineEffects2D>[0], "layer" | "frame"> & { frame?: number; calls: readonly Renderable[]; backgroundCallEnd: number }) {
  const { context, calls, backgroundCallEnd, frame } = options;
  for (const [order, call] of calls.entries()) {
    if (frame !== undefined && order === backgroundCallEnd) drawTimelineEffects2D({ ...options, frame, layer: "background" });
    drawRenderable(context, call, { camera: {}, layer: "main", layerOptions: { sort: "none", ignoreCamera: true, order: 0 }, order });
  }
  if (frame !== undefined) {
    if (backgroundCallEnd === calls.length) drawTimelineEffects2D({ ...options, frame, layer: "background" });
    drawTimelineEffects2D({ ...options, frame });
  }
}

function drawHitFlash(ctx: CanvasRenderingContext2D, target: PreviewEntity, effect: SampledTimelineEffect2D) {
  const radius = Math.max(target.width, target.height) * target.scale * (0.55 + effect.progress * 0.7);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = effect.envelope * Math.min(1, effect.intensity);
  const gradient = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, radius);
  gradient.addColorStop(0, effect.color ?? "#ffffff");
  gradient.addColorStop(0.34, `${effect.color ?? "#ffffff"}aa`);
  gradient.addColorStop(1, `${effect.color ?? "#ffffff"}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(target.x, target.y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = effect.color ?? "#ffffff";
  ctx.lineWidth = Math.max(1, 4 * (1 - effect.progress));
  ctx.beginPath(); ctx.arc(target.x, target.y, radius * 0.82, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawParticleBurst(ctx: CanvasRenderingContext2D, target: PreviewEntity, effect: SampledTimelineEffect2D, viewport: { width: number; height: number }) {
  const preset = isParticlePresetId2D(effect.preset) ? PARTICLE_PRESETS_2D[effect.preset] : undefined;
  const ambient = preset?.placement === "ambient" || preset?.placement === "shower";
  const screen = effect.space === "screen" || (effect.space !== "target" && (ambient || !effect.targetId));
  const count = Math.max(1, Math.min(128, effect.particleCount ?? preset?.count ?? 18));
  ctx.save();
  if (screen) ctx.setTransform(ctx.canvas.width / viewport.width, 0, 0, ctx.canvas.height / viewport.height, 0, 0);
  const width = screen ? viewport.width : target.width * target.scale;
  const height = screen ? viewport.height : target.height * target.scale;
  const region = effect.region ?? { fromX: 0, fromY: 0, toX: 1, toY: 1 };
  const bounds = {
    x: (screen ? 0 : target.x - width / 2) + region.fromX * width,
    y: (screen ? 0 : target.y - height / 2) + region.fromY * height,
    width: (region.toX - region.fromX) * width,
    height: (region.toY - region.fromY) * height,
  };
  if (ambient || effect.region) { ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip(); }
  ctx.fillStyle = effect.color ?? target.accent;
  ctx.strokeStyle = effect.color ?? target.accent;
  ctx.globalAlpha = Math.max(0, effect.envelope);
  ctx.lineCap = "round";
  for (let index = 0; index < count; index += 1) {
    if (preset?.placement === "ambient" || preset?.placement === "shower") { drawAmbientParticle(ctx, effect, index, preset.placement, bounds); continue; }
    const angle = (index / count) * Math.PI * 2 + timelineEffectNoise2D(effect.id, index) * 0.7;
    const speed = (18 + Math.abs(timelineEffectNoise2D(effect.id, index + 311)) * 68) * effect.intensity;
    const distance = speed * (1 - Math.pow(1 - effect.progress, 2));
    const gravity = effect.progress * effect.progress * 38 * effect.intensity;
    const x = bounds.x + bounds.width / 2 + Math.cos(angle) * distance;
    const y = bounds.y + bounds.height / 2 + Math.sin(angle) * distance + gravity;
    const radius = Math.max(1.2, (4.5 - effect.progress * 2.8) * (0.65 + Math.abs(timelineEffectNoise2D(effect.id, index + 619)) * 0.7));
    if (effect.preset === "hearts") { drawHeart(ctx, x, y, radius * 1.8, angle); continue; }
    if (effect.preset === "music-notes") { ctx.font = `${Math.max(10, radius * 4)}px system-ui`; ctx.fillText(index % 3 ? "♪" : "♫", x, y); continue; }
    ctx.lineWidth = radius;
    const trail = effect.preset === "speed-lines" ? radius * 9 : radius * 2.8;
    ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * trail, y - Math.sin(angle) * trail); ctx.lineTo(x, y); ctx.stroke();
    if (effect.progress > 0.52 && index % 3 === 0) {
      ctx.beginPath(); ctx.ellipse(x, y + radius, radius * 1.8, radius * 0.65, angle, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawAmbientParticle(ctx: CanvasRenderingContext2D, effect: SampledTimelineEffect2D, index: number, placement: "ambient" | "shower", bounds: { x: number; y: number; width: number; height: number }) {
  const seedX = (timelineEffectNoise2D(effect.id, index + 41) + 1) / 2;
  const seedY = (timelineEffectNoise2D(effect.id, index + 181) + 1) / 2;
  const falling = placement === "shower" || effect.preset === "rain" || effect.preset === "snow";
  const travel = effect.progress * (placement === "shower" || effect.preset === "rain" ? 1.8 : 0.75) * effect.intensity;
  const cycle = (seedY + travel) % 1;
  const drift = Math.sin(effect.progress * 8 + index) * (placement === "ambient" ? 14 : 4);
  const x = bounds.x + ((seedX * bounds.width + drift) % bounds.width + bounds.width) % bounds.width;
  const y = bounds.y + (falling ? cycle : 1 - cycle) * bounds.height;
  const size = 2 + Math.abs(timelineEffectNoise2D(effect.id, index + 701)) * 4;
  if (effect.preset === "rain") { ctx.lineWidth = Math.max(1, size * 0.45); ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 4, y + 12); ctx.stroke(); return; }
  if (effect.preset === "smoke" || effect.preset === "bubbles") { ctx.globalAlpha = effect.envelope * 0.45; ctx.beginPath(); ctx.arc(x, y, size * (1 + effect.progress * 1.8), 0, Math.PI * 2); effect.preset === "bubbles" ? ctx.stroke() : ctx.fill(); return; }
  if (effect.preset === "confetti") { ctx.save(); ctx.translate(x, y); ctx.rotate(index + effect.progress * 7); ctx.fillRect(-size, -size * 0.45, size * 2, size * 0.9); ctx.restore(); return; }
  if (effect.preset === "embers" || effect.preset === "fireflies") { ctx.save(); ctx.shadowBlur = size * 3; ctx.shadowColor = effect.color ?? "#ffffff"; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.beginPath(); ctx.moveTo(0, size * 0.8); ctx.bezierCurveTo(-size * 1.2, 0, -size * 0.85, -size, 0, -size * 0.35); ctx.bezierCurveTo(size * 0.85, -size, size * 1.2, 0, 0, size * 0.8); ctx.fill(); ctx.restore();
}

function drawScreenTransition(ctx: CanvasRenderingContext2D, effect: SampledTimelineEffect2D) {
  const preset = effect.preset ?? "dissolve";
  const amount = preset.startsWith("impact-") || preset === "flash" ? effect.envelope : 1 - Math.abs(effect.progress * 2 - 1);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = Math.min(1, amount * effect.intensity); ctx.fillStyle = effect.color ?? "#000000";
  const width = ctx.canvas.width; const height = ctx.canvas.height;
  if (preset === "wipe-left") ctx.fillRect(width * (1 - effect.progress), 0, width * effect.progress, height);
  else if (preset === "wipe-right") ctx.fillRect(0, 0, width * effect.progress, height);
  else if (preset === "wipe-up") ctx.fillRect(0, height * (1 - effect.progress), width, height * effect.progress);
  else if (preset === "wipe-down") ctx.fillRect(0, 0, width, height * effect.progress);
  else if (preset === "iris") { ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.hypot(width, height) * Math.abs(effect.progress * 2 - 1), 0, Math.PI * 2); ctx.fill(); }
  else { if (preset === "film-burn") ctx.globalCompositeOperation = "screen"; ctx.fillRect(0, 0, width, height); }
  ctx.restore();
}
