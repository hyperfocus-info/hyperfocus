import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';

/** Arena evidence advances the 60 Hz simulation once per encoded frame by default. */
export const ARENA_CAPTURE_FPS = 60;
type Camera = Hyperfocus3DEvaluatedFrame['camera'];
export type PhotoCaptureOptions = {
  removeFighters?: boolean; freezeSimulation?: boolean; manual?: boolean; followFighters?: boolean; spectator?: boolean;
  panX?: number; panZ?: number; orbitRadians?: number; dollyScale?: number; liftY?: number; durationMilliseconds?: number;
};

export function createPhotoCapturePresentation(options: PhotoCaptureOptions, now: number) {
  const clock: { elapsedMilliseconds?: number; baseCamera?: Pick<Camera, 'position' | 'target'> } = {};
  return {
    ...clock,
    removeFighters: options.removeFighters ?? false, freezeSimulation: options.freezeSimulation ?? false,
    manual: options.manual ?? false, followFighters: options.followFighters ?? true, spectator: options.spectator ?? false,
    panX: options.panX ?? 0, panZ: options.panZ ?? 0, orbitRadians: options.orbitRadians ?? 0,
    dollyScale: options.dollyScale ?? 0, liftY: options.liftY ?? 0,
    durationMilliseconds: Math.max(1, options.durationMilliseconds ?? 1), startedAt: now,
    frameIndex: -1, fps: ARENA_CAPTURE_FPS,
  };
}
export type PhotoCapturePresentation = ReturnType<typeof createPhotoCapturePresentation>;

/** Reject skipped samples instead of disguising missing motion with duplicated output frames. */
export function advancePhotoCaptureFrame(presentation: PhotoCapturePresentation, frameIndex: number, fps = ARENA_CAPTURE_FPS) {
  if (!presentation.manual || !presentation.freezeSimulation) throw new Error('Frame capture requires manual and freezeSimulation presentation.');
  if (fps !== 30 && fps !== 60) throw new Error('Arena capture supports 30 or 60 fps.');
  if (!Number.isSafeInteger(frameIndex) || frameIndex !== presentation.frameIndex + 1) throw new Error('Capture frames must advance consecutively from zero.');
  if (presentation.frameIndex >= 0 && presentation.fps !== fps) throw new Error('Capture fps cannot change within a sequence.');
  const ticks = frameIndex === 0 ? 0 : ARENA_CAPTURE_FPS / fps;
  presentation.frameIndex = frameIndex; presentation.fps = fps; presentation.elapsedMilliseconds = frameIndex / fps * 1000;
  return ticks;
}

/** Apply before occlusion/culling so the recorded camera and visibility calculations agree. */
export function applyPhotoCaptureCamera(presentation: PhotoCapturePresentation, camera: Camera, now: number) {
  if (!presentation.panX && !presentation.panZ && !presentation.orbitRadians && !presentation.dollyScale && !presentation.liftY) return;
  if (!presentation.baseCamera || presentation.followFighters) presentation.baseCamera = { position: [...camera.position], target: [...camera.target] };
  const progress = Math.min(1, Math.max(0, (presentation.elapsedMilliseconds ?? now - presentation.startedAt) / presentation.durationMilliseconds));
  const easing = progress * progress * (3 - 2 * progress), base = presentation.baseCamera;
  const target: [number, number, number] = [base.target[0] + presentation.panX * easing, base.target[1] + presentation.liftY * easing, base.target[2] + presentation.panZ * easing];
  const x = base.position[0] - base.target[0], y = base.position[1] - base.target[1], z = base.position[2] - base.target[2];
  const angle = presentation.orbitRadians * easing, cosine = Math.cos(angle), sine = Math.sin(angle), distance = 1 + presentation.dollyScale * easing;
  camera.target = target;
  camera.position = [target[0] + (x * cosine + z * sine) * distance, target[1] + y * distance, target[2] + (z * cosine - x * sine) * distance];
}
