import { fraction, number } from "mathjs";
export { mean, standardDeviation } from "./statistics";

export const FIFTHS_ORDER: readonly number[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
export const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10] as const;
export const PENTATONIC_SCALE = [0, 2, 4, 7, 9] as const;

const JUST_INTERVALS = [
  { semitone: 0, ratio: [1, 1], label: "unison" },
  { semitone: 1, ratio: [16, 15], label: "minor second" },
  { semitone: 2, ratio: [9, 8], label: "major second" },
  { semitone: 3, ratio: [6, 5], label: "minor third" },
  { semitone: 4, ratio: [5, 4], label: "major third" },
  { semitone: 5, ratio: [4, 3], label: "perfect fourth" },
  { semitone: 6, ratio: [45, 32], label: "tritone" },
  { semitone: 7, ratio: [3, 2], label: "perfect fifth" },
  { semitone: 8, ratio: [8, 5], label: "minor sixth" },
  { semitone: 9, ratio: [5, 3], label: "major sixth" },
  { semitone: 10, ratio: [9, 5], label: "minor seventh" },
  { semitone: 11, ratio: [15, 8], label: "major seventh" },
] as const;

export function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function fitToTarget(value: number, target: number, tolerance: number) {
  return clamp01(1 - Math.abs(value - target) / Math.max(0.0001, tolerance));
}

export function normalizedEntropy(values: readonly number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return 0;
  }

  let bits = 0;
  let occupied = 0;
  for (const value of values) {
    if (value <= 0) {
      continue;
    }
    occupied += 1;
    const probability = value / total;
    bits -= probability * Math.log2(probability);
  }
  return occupied > 1 ? bits / Math.log2(occupied) : 0;
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]) {
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMag += leftValue * leftValue;
    rightMag += rightValue * rightValue;
  }
  return leftMag > 0 && rightMag > 0 ? dot / Math.sqrt(leftMag * rightMag) : 0;
}

export function circularDistance(left: number, right: number, modulo = 12) {
  const raw = Math.abs((((left - right) % modulo) + modulo) % modulo);
  return Math.min(raw, modulo - raw);
}

export function ratioForSemitone(semitone: number) {
  const normalized = ((Math.round(semitone) % 12) + 12) % 12;
  const match = JUST_INTERVALS.find((interval) => interval.semitone === normalized) ?? JUST_INTERVALS[0];
  const ratio = number(fraction(match.ratio[0], match.ratio[1]));
  return { ...match, ratio };
}

export function equalTemperamentRatio(semitone: number) {
  return 2 ** ((((semitone % 12) + 12) % 12) / 12);
}

export function centsBetweenRatios(left: number, right: number) {
  if (left <= 0 || right <= 0) {
    return 1200;
  }
  return Math.abs(1200 * Math.log2(left / right));
}

export function intervalRoughness(semitone: number) {
  const normalized = ((Math.round(semitone) % 12) + 12) % 12;
  const table = [0, 0.92, 0.48, 0.2, 0.14, 0.24, 1, 0.08, 0.18, 0.16, 0.58, 0.86] as const;
  return table[normalized] ?? 0.5;
}

export function buildScaleMask(rootPitchClass: number, scale: readonly number[]) {
  const mask = Array.from({ length: 12 }, () => 0);
  for (const interval of scale) {
    mask[((rootPitchClass + interval) % 12 + 12) % 12] = 1;
  }
  return mask;
}

export function bestScaleCompliance(histogram: readonly number[], scales = [MAJOR_SCALE, NATURAL_MINOR_SCALE, PENTATONIC_SCALE]) {
  let best = { root: 0, score: 0, scaleSize: 0 };
  for (let root = 0; root < 12; root += 1) {
    for (const scale of scales) {
      const mask = buildScaleMask(root, scale);
      const score = weightedMaskCompliance(histogram, mask);
      if (score > best.score) {
        best = { root, score, scaleSize: scale.length };
      }
    }
  }
  return best;
}

export function weightedMaskCompliance(histogram: readonly number[], mask: readonly number[]) {
  const total = histogram.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return 0;
  }
  let included = 0;
  for (let index = 0; index < 12; index += 1) {
    included += Math.max(0, histogram[index] ?? 0) * (mask[index] ? 1 : 0);
  }
  return included / total;
}

export function describePercent(value: number) {
  return `${Math.round(clamp01(value) * 100)}%`;
}
