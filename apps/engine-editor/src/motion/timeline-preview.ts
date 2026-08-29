import type { EditorEntityData, EditorProject } from "@hyperfocus/engine/project";
import {
  evaluateTimelineClipTrack2D,
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
  let clipId: string | undefined;
  for (const track of timeline.clipTracks ?? []) {
    if (track.targetId === entityId) clipId = evaluateTimelineClipTrack2D(track, frame) ?? clipId;
  }
  return clipId;
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

export function drawTimelineEffects2D(ctx: CanvasRenderingContext2D, timeline: EditorProject["timeline"], entities: readonly PreviewEntity[], frame: number) {
  for (const effect of sampleTimelineEffects2D(timeline, frame)) {
    if (effect.kind === "camera-shake") continue;
    const target = entities.find((entity) => entity.id === effect.targetId);
    if (!target) continue;
    if (effect.kind === "hit-flash") drawHitFlash(ctx, target, effect);
    else drawParticleBurst(ctx, target, effect);
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

function drawParticleBurst(ctx: CanvasRenderingContext2D, target: PreviewEntity, effect: SampledTimelineEffect2D) {
  const count = Math.max(1, Math.min(128, effect.particleCount ?? 18));
  ctx.save();
  ctx.fillStyle = effect.color ?? target.accent;
  ctx.strokeStyle = effect.color ?? target.accent;
  ctx.globalAlpha = Math.max(0, effect.envelope);
  ctx.lineCap = "round";
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + timelineEffectNoise2D(effect.id, index) * 0.7;
    const speed = (18 + Math.abs(timelineEffectNoise2D(effect.id, index + 311)) * 68) * effect.intensity;
    const distance = speed * (1 - Math.pow(1 - effect.progress, 2));
    const gravity = effect.progress * effect.progress * 38 * effect.intensity;
    const x = target.x + Math.cos(angle) * distance;
    const y = target.y + Math.sin(angle) * distance + gravity;
    const radius = Math.max(1.2, (4.5 - effect.progress * 2.8) * (0.65 + Math.abs(timelineEffectNoise2D(effect.id, index + 619)) * 0.7));
    ctx.lineWidth = radius;
    ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * radius * 2.8, y - Math.sin(angle) * radius * 2.8); ctx.lineTo(x, y); ctx.stroke();
    if (effect.progress > 0.52 && index % 3 === 0) {
      ctx.beginPath(); ctx.ellipse(x, y + radius, radius * 1.8, radius * 0.65, angle, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
