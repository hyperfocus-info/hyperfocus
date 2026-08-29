export interface AdaptiveResolutionOptions {
  targetFrameMs?: number;
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
  scaleStep?: number;
  smoothing?: number;
  decreaseThreshold?: number;
  increaseThreshold?: number;
  decreaseAfterFrames?: number;
  increaseAfterFrames?: number;
  cooldownFrames?: number;
}

export interface AdaptiveResolutionSnapshot {
  readonly scale: number;
  readonly smoothedFrameMs: number;
  readonly overBudgetFrames: number;
  readonly underBudgetFrames: number;
  readonly cooldownFrames: number;
  readonly changed: boolean;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`);
  return value;
}

function unitInterval(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new RangeError(`${label} must be in (0, 1].`);
  return value;
}

/** Creates hysteretic dynamic-resolution policy without owning render targets. */
export function createAdaptiveResolutionController(options: AdaptiveResolutionOptions = {}) {
  const targetFrameMs = positiveFinite(options.targetFrameMs ?? 1000 / 60, "targetFrameMs");
  const minScale = unitInterval(options.minScale ?? 0.5, "minScale");
  const maxScale = unitInterval(options.maxScale ?? 1, "maxScale");
  if (minScale > maxScale) throw new RangeError("minScale must not exceed maxScale.");
  const scaleStep = positiveFinite(options.scaleStep ?? 0.05, "scaleStep");
  const smoothing = unitInterval(options.smoothing ?? 0.2, "smoothing");
  const decreaseThreshold = positiveFinite(options.decreaseThreshold ?? 1.08, "decreaseThreshold");
  const increaseThreshold = positiveFinite(options.increaseThreshold ?? 0.82, "increaseThreshold");
  if (increaseThreshold >= decreaseThreshold) throw new RangeError("increaseThreshold must be lower than decreaseThreshold.");
  const decreaseAfterFrames = nonNegativeInteger(options.decreaseAfterFrames ?? 4, "decreaseAfterFrames");
  const increaseAfterFrames = nonNegativeInteger(options.increaseAfterFrames ?? 90, "increaseAfterFrames");
  const cooldownLength = nonNegativeInteger(options.cooldownFrames ?? 30, "cooldownFrames");
  let scale = options.initialScale ?? maxScale;
  if (!Number.isFinite(scale) || scale < minScale || scale > maxScale) throw new RangeError("initialScale must be between minScale and maxScale.");
  let smoothedFrameMs = targetFrameMs;
  let overBudgetFrames = 0;
  let underBudgetFrames = 0;
  let cooldownFrames = 0;
  let changed = false;
  const setScale = (value: number) => {
    const next = Math.max(minScale, Math.min(maxScale, value));
    overBudgetFrames = 0;
    underBudgetFrames = 0;
    if (next === scale) return;
    scale = next;
    changed = true;
    cooldownFrames = cooldownLength;
  };
  return Object.freeze({
    targetFrameMs, minScale, maxScale, scaleStep, smoothing, decreaseThreshold, increaseThreshold, decreaseAfterFrames, increaseAfterFrames, cooldownLength,
    get scale() { return scale; },
    sample(frameMs: number) {
      positiveFinite(frameMs, "frameMs");
      changed = false;
      smoothedFrameMs += (frameMs - smoothedFrameMs) * smoothing;
      if (cooldownFrames > 0) {
        cooldownFrames -= 1;
        overBudgetFrames = 0;
        underBudgetFrames = 0;
        return scale;
      }
      if (smoothedFrameMs > targetFrameMs * decreaseThreshold) {
        overBudgetFrames += 1;
        underBudgetFrames = 0;
        if (overBudgetFrames >= Math.max(1, decreaseAfterFrames)) setScale(scale - scaleStep);
      } else if (smoothedFrameMs < targetFrameMs * increaseThreshold) {
        underBudgetFrames += 1;
        overBudgetFrames = 0;
        if (underBudgetFrames >= Math.max(1, increaseAfterFrames)) setScale(scale + scaleStep);
      } else {
        overBudgetFrames = 0;
        underBudgetFrames = 0;
      }
      return scale;
    },
    reset(value = maxScale) {
      if (!Number.isFinite(value) || value < minScale || value > maxScale) throw new RangeError("scale must be between minScale and maxScale.");
      scale = value;
      smoothedFrameMs = targetFrameMs;
      overBudgetFrames = 0;
      underBudgetFrames = 0;
      cooldownFrames = 0;
      changed = false;
    },
    snapshot: (): AdaptiveResolutionSnapshot => ({ scale, smoothedFrameMs, overBudgetFrames, underBudgetFrames, cooldownFrames, changed }),
  });
}

export type AdaptiveResolutionController = ReturnType<typeof createAdaptiveResolutionController>;
