export interface TemporalJitterSample {
  pixelX: number;
  pixelY: number;
  clipX: number;
  clipY: number;
  historyWeight: number;
}

export interface TemporalJitterOptions {
  sequenceLength?: number;
  historyWeight?: number;
}

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  while (index > 0) {
    result += fraction * (index % base);
    index = Math.floor(index / base);
    fraction /= base;
  }
  return result;
}

/** Camera-jitter/history policy shared by Canvas 2D or GPU feedback passes. */
export class TemporalJitterController {
  readonly sequenceLength: number;
  readonly historyWeight: number;
  #frame = 0;
  #historyValid = false;

  constructor(options: TemporalJitterOptions = {}) {
    this.sequenceLength = options.sequenceLength ?? 8;
    if (!Number.isSafeInteger(this.sequenceLength) || this.sequenceLength <= 0) throw new RangeError("sequenceLength must be positive.");
    this.historyWeight = options.historyWeight ?? 0.9;
    if (!Number.isFinite(this.historyWeight) || this.historyWeight < 0 || this.historyWeight >= 1) {
      throw new RangeError("historyWeight must be in [0, 1).");
    }
  }

  sample(
    width: number,
    height: number,
    output: TemporalJitterSample = { pixelX: 0, pixelY: 0, clipX: 0, clipY: 0, historyWeight: 0 }
  ): TemporalJitterSample {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new RangeError("temporal jitter dimensions must be positive finite numbers.");
    }
    const sequenceIndex = this.#frame % this.sequenceLength + 1;
    const pixelX = halton(sequenceIndex, 2) - 0.5;
    const pixelY = halton(sequenceIndex, 3) - 0.5;
    this.#frame += 1;
    const historyWeight = this.#historyValid ? this.historyWeight : 0;
    this.#historyValid = true;
    output.pixelX = pixelX;
    output.pixelY = pixelY;
    output.clipX = pixelX * 2 / width;
    output.clipY = pixelY * 2 / height;
    output.historyWeight = historyWeight;
    return output;
  }

  invalidateHistory(): void {
    this.#historyValid = false;
  }

  reset(): void {
    this.#frame = 0;
    this.#historyValid = false;
  }
}

export function createTemporalJitterController(options: TemporalJitterOptions = {}): TemporalJitterController {
  return new TemporalJitterController(options);
}
