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

/**
 * Hysteretic dynamic-resolution controller. It only returns a scale; callers
 * decide which world render targets are resized so HUD canvases can stay crisp.
 */
export class AdaptiveResolutionController {
  readonly targetFrameMs: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly scaleStep: number;
  readonly smoothing: number;
  readonly decreaseThreshold: number;
  readonly increaseThreshold: number;
  readonly decreaseAfterFrames: number;
  readonly increaseAfterFrames: number;
  readonly cooldownLength: number;

  #scale: number;
  #smoothedFrameMs: number;
  #overBudgetFrames = 0;
  #underBudgetFrames = 0;
  #cooldownFrames = 0;
  #changed = false;

  constructor(options: AdaptiveResolutionOptions = {}) {
    this.targetFrameMs = positiveFinite(options.targetFrameMs ?? 1000 / 60, "targetFrameMs");
    this.minScale = unitInterval(options.minScale ?? 0.5, "minScale");
    this.maxScale = unitInterval(options.maxScale ?? 1, "maxScale");
    if (this.minScale > this.maxScale) throw new RangeError("minScale must not exceed maxScale.");
    this.#scale = options.initialScale ?? this.maxScale;
    if (!Number.isFinite(this.#scale) || this.#scale < this.minScale || this.#scale > this.maxScale) {
      throw new RangeError("initialScale must be between minScale and maxScale.");
    }
    this.scaleStep = positiveFinite(options.scaleStep ?? 0.05, "scaleStep");
    this.smoothing = unitInterval(options.smoothing ?? 0.2, "smoothing");
    this.decreaseThreshold = positiveFinite(options.decreaseThreshold ?? 1.08, "decreaseThreshold");
    this.increaseThreshold = positiveFinite(options.increaseThreshold ?? 0.82, "increaseThreshold");
    if (this.increaseThreshold >= this.decreaseThreshold) {
      throw new RangeError("increaseThreshold must be lower than decreaseThreshold.");
    }
    this.decreaseAfterFrames = nonNegativeInteger(options.decreaseAfterFrames ?? 4, "decreaseAfterFrames");
    this.increaseAfterFrames = nonNegativeInteger(options.increaseAfterFrames ?? 90, "increaseAfterFrames");
    this.cooldownLength = nonNegativeInteger(options.cooldownFrames ?? 30, "cooldownFrames");
    this.#smoothedFrameMs = this.targetFrameMs;
  }

  get scale(): number {
    return this.#scale;
  }

  sample(frameMs: number): number {
    positiveFinite(frameMs, "frameMs");
    this.#changed = false;
    this.#smoothedFrameMs += (frameMs - this.#smoothedFrameMs) * this.smoothing;
    if (this.#cooldownFrames > 0) {
      this.#cooldownFrames -= 1;
      this.#overBudgetFrames = 0;
      this.#underBudgetFrames = 0;
      return this.#scale;
    }

    if (this.#smoothedFrameMs > this.targetFrameMs * this.decreaseThreshold) {
      this.#overBudgetFrames += 1;
      this.#underBudgetFrames = 0;
      if (this.#overBudgetFrames >= Math.max(1, this.decreaseAfterFrames)) this.#setScale(this.#scale - this.scaleStep);
    } else if (this.#smoothedFrameMs < this.targetFrameMs * this.increaseThreshold) {
      this.#underBudgetFrames += 1;
      this.#overBudgetFrames = 0;
      if (this.#underBudgetFrames >= Math.max(1, this.increaseAfterFrames)) this.#setScale(this.#scale + this.scaleStep);
    } else {
      this.#overBudgetFrames = 0;
      this.#underBudgetFrames = 0;
    }
    return this.#scale;
  }

  reset(scale = this.maxScale): void {
    if (!Number.isFinite(scale) || scale < this.minScale || scale > this.maxScale) {
      throw new RangeError("scale must be between minScale and maxScale.");
    }
    this.#scale = scale;
    this.#smoothedFrameMs = this.targetFrameMs;
    this.#overBudgetFrames = 0;
    this.#underBudgetFrames = 0;
    this.#cooldownFrames = 0;
    this.#changed = false;
  }

  snapshot(): AdaptiveResolutionSnapshot {
    return {
      scale: this.#scale,
      smoothedFrameMs: this.#smoothedFrameMs,
      overBudgetFrames: this.#overBudgetFrames,
      underBudgetFrames: this.#underBudgetFrames,
      cooldownFrames: this.#cooldownFrames,
      changed: this.#changed
    };
  }

  #setScale(scale: number): void {
    const next = Math.max(this.minScale, Math.min(this.maxScale, scale));
    this.#overBudgetFrames = 0;
    this.#underBudgetFrames = 0;
    if (next === this.#scale) return;
    this.#scale = next;
    this.#changed = true;
    this.#cooldownFrames = this.cooldownLength;
  }
}

export function createAdaptiveResolutionController(options: AdaptiveResolutionOptions = {}): AdaptiveResolutionController {
  return new AdaptiveResolutionController(options);
}
