export interface VisualSimilarityOptions {
  pixelStride?: number;
  luminanceOffset?: number;
  luminanceRange?: number;
}

/** Global luminance SSIM suitable for deterministic headless screenshot gates. */
export function structuralSimilarityRgba(
  actual: ArrayLike<number>,
  reference: ArrayLike<number>,
  options: VisualSimilarityOptions = {}
): number {
  if (actual.length !== reference.length || actual.length % 4 !== 0) {
    throw new RangeError("RGBA buffers must have the same length divisible by four.");
  }
  const pixelStride = options.pixelStride ?? 1;
  if (!Number.isSafeInteger(pixelStride) || pixelStride <= 0) throw new RangeError("pixelStride must be positive.");
  const offset = options.luminanceOffset ?? 0;
  const range = options.luminanceRange ?? 255;
  if (!Number.isFinite(offset) || !Number.isFinite(range) || range <= 0) throw new RangeError("luminance range must be positive.");
  let count = 0;
  let actualMean = 0;
  let referenceMean = 0;
  for (let pixel = 0; pixel < actual.length / 4; pixel += pixelStride) {
    const index = pixel * 4;
    actualMean += 0.2126 * actual[index] + 0.7152 * actual[index + 1] + 0.0722 * actual[index + 2] + offset;
    referenceMean += 0.2126 * reference[index] + 0.7152 * reference[index + 1] + 0.0722 * reference[index + 2] + offset;
    count += 1;
  }
  if (count === 0) return 1;
  actualMean /= count;
  referenceMean /= count;
  let actualVariance = 0;
  let referenceVariance = 0;
  let covariance = 0;
  for (let pixel = 0; pixel < actual.length / 4; pixel += pixelStride) {
    const index = pixel * 4;
    const actualLuma = 0.2126 * actual[index] + 0.7152 * actual[index + 1] + 0.0722 * actual[index + 2] + offset;
    const referenceLuma = 0.2126 * reference[index] + 0.7152 * reference[index + 1] + 0.0722 * reference[index + 2] + offset;
    const actualDelta = actualLuma - actualMean;
    const referenceDelta = referenceLuma - referenceMean;
    actualVariance += actualDelta * actualDelta;
    referenceVariance += referenceDelta * referenceDelta;
    covariance += actualDelta * referenceDelta;
  }
  const denominator = Math.max(1, count - 1);
  actualVariance /= denominator;
  referenceVariance /= denominator;
  covariance /= denominator;
  const c1 = (0.01 * range) ** 2;
  const c2 = (0.03 * range) ** 2;
  return ((2 * actualMean * referenceMean + c1) * (2 * covariance + c2))
    / ((actualMean ** 2 + referenceMean ** 2 + c1) * (actualVariance + referenceVariance + c2));
}
