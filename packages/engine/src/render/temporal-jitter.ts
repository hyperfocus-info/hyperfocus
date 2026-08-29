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

/** Creates camera-jitter/history policy shared by Canvas 2D or GPU feedback passes. */
export function createTemporalJitterController(options: TemporalJitterOptions = {}) {
  const sequenceLength = options.sequenceLength ?? 8;
  if (!Number.isSafeInteger(sequenceLength) || sequenceLength <= 0) throw new RangeError("sequenceLength must be positive.");
  const historyWeight = options.historyWeight ?? 0.9;
  if (!Number.isFinite(historyWeight) || historyWeight < 0 || historyWeight >= 1) throw new RangeError("historyWeight must be in [0, 1).");
  let frame = 0;
  let historyValid = false;
  return Object.freeze({
    sequenceLength,
    historyWeight,
    sample(width: number, height: number, output: TemporalJitterSample = { pixelX: 0, pixelY: 0, clipX: 0, clipY: 0, historyWeight: 0 }) {
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new RangeError("temporal jitter dimensions must be positive finite numbers.");
      const sequenceIndex = frame % sequenceLength + 1;
      const pixelX = halton(sequenceIndex, 2) - 0.5;
      const pixelY = halton(sequenceIndex, 3) - 0.5;
      frame += 1;
      output.pixelX = pixelX;
      output.pixelY = pixelY;
      output.clipX = pixelX * 2 / width;
      output.clipY = pixelY * 2 / height;
      output.historyWeight = historyValid ? historyWeight : 0;
      historyValid = true;
      return output;
    },
    invalidateHistory() { historyValid = false; },
    reset() { frame = 0; historyValid = false; },
  });
}

export type TemporalJitterController = ReturnType<typeof createTemporalJitterController>;
