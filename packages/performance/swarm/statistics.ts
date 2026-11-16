export function sampleDistribution(values: readonly number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Benchmark samples must be positive finite numbers.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (fraction: number) => {
    const index = fraction * (sorted.length - 1), lower = Math.floor(index);
    return sorted[lower]! + (sorted[Math.ceil(index)]! - sorted[lower]!) * (index - lower);
  };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.length > 1 ? sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (sorted.length - 1) : 0;
  return {
    sampleCount: sorted.length, median: quantile(0.5),
    p95: sorted.length >= 20 ? quantile(0.95) : null,
    p99: sorted.length >= 100 ? quantile(0.99) : null,
    minimum: sorted[0]!, maximum: sorted.at(-1)!, mean, standardDeviation: Math.sqrt(variance),
    relativeSpreadPercent: 100 * (sorted.at(-1)! - sorted[0]!) / quantile(0.5),
  };
}

/** pairedEffect reports speedup (baseline/candidate - 1) for latency.
 * A latency allowance instead bounds candidate/baseline - 1. */
export function latencyRegressesBeyond(speedupPercent: number, maximumIncreasePercent: number) {
  if (!Number.isFinite(speedupPercent) || speedupPercent < -100 || !Number.isFinite(maximumIncreasePercent) || maximumIncreasePercent < 0) {
    throw new RangeError('Latency comparison needs a valid speedup and nonnegative finite allowance.');
  }
  const speedupRatio = 1 + speedupPercent / 100;
  const maximumLatencyRatio = 1 + maximumIncreasePercent / 100;
  // Permit roundoff at an exact boundary after log/exp inference, not extra latency.
  return speedupRatio * maximumLatencyRatio < 1 - 8 * Number.EPSILON;
}

// Two-sided 95% Student t critical values, df=1..30. Above 30 use df=30
// conservatively instead of silently treating small cohorts as Gaussian.
const student95 = [12.706205, 4.302653, 3.182446, 2.776445, 2.570582, 2.446912, 2.364624, 2.306004, 2.262157, 2.228139,
  2.200985, 2.178813, 2.160369, 2.144787, 2.13145, 2.119905, 2.109816, 2.100922, 2.093024, 2.085963,
  2.079614, 2.073873, 2.068658, 2.063899, 2.059539, 2.055529, 2.051831, 2.048407, 2.04523, 2.042272];

/** Frame samples are reduced per trial before paired inference (no frame pseudoreplication). */
export function pairedEffect(options: { pairs: readonly { baseline: number; candidate: number }[]; higherIsBetter: boolean }) {
  if (options.pairs.length < 2 || options.pairs.some(pair => ![pair.baseline, pair.candidate].every(value => Number.isFinite(value) && value > 0))) {
    throw new Error('Paired inference needs at least two positive finite baseline/candidate pairs.');
  }
  const logs = options.pairs.map(pair => Math.log(options.higherIsBetter ? pair.candidate / pair.baseline : pair.baseline / pair.candidate));
  const mean = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const variance = logs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logs.length - 1);
  const radius = student95[Math.min(29, logs.length - 2)]! * Math.sqrt(variance / logs.length);
  return {
    pairCount: logs.length,
    improvementPercent: 100 * Math.expm1(mean),
    lower95Percent: 100 * Math.expm1(mean - radius),
    upper95Percent: 100 * Math.expm1(mean + radius),
    method: '95% paired log-ratio Student t interval on trial medians; requires independent approximately normal pair effects. Shared hardware and temporal correlation remain possible.',
  };
}
