import { clamp01 } from "../skill-math";

export const HOP_SIZE = 512;

type AudioTimelinePoint = {
  readonly timeSeconds: number;
  readonly value: number;
};

export function buildTimeline(values: readonly number[], sampleRate: number) {
  if (values.length === 0) {
    return Object.freeze([]);
  }
  const step = Math.max(1, Math.ceil(values.length / 1_200));
  const points: AudioTimelinePoint[] = [];
  for (let index = 0; index < values.length; index += step) {
    points.push(Object.freeze({
      timeSeconds: index * HOP_SIZE / sampleRate,
      value: Number.isFinite(values[index]) ? values[index]! : 0,
    }));
  }
  return Object.freeze(points);
}

export function normalizeRange(values: readonly number[]) {
  const maximum = Math.max(0, ...values);
  return maximum > 0 ? values.map((value) => clamp01(value / maximum)) : values.map(() => 0);
}

export function buildSectionScoreValues(
  rmsValues: readonly number[],
  fluxValues: readonly number[],
  tensionValues: readonly number[],
  grooveValues: readonly number[],
  sampleRate: number,
) {
  const frameCount = Math.min(rmsValues.length, fluxValues.length, tensionValues.length, grooveValues.length);
  if (frameCount === 0) return [];
  const normalizedRms = normalizeRange(rmsValues);
  const normalizedFlux = normalizeRange(fluxValues);
  const framesPerSection = Math.max(1, Math.round(8 * sampleRate / HOP_SIZE));
  const result = Array.from({ length: frameCount }, () => 0);
  for (let start = 0; start < frameCount; start += framesPerSection) {
    const end = Math.min(frameCount, start + framesPerSection);
    let total = 0;
    for (let index = start; index < end; index += 1) {
      total += normalizedRms[index]! * 0.2
        + normalizedFlux[index]! * 0.2
        + (1 - tensionValues[index]!) * 0.25
        + grooveValues[index]! * 0.35;
    }
    const score = clamp01(total / Math.max(1, end - start));
    for (let index = start; index < end; index += 1) result[index] = score;
  }
  return result;
}

export function amplitudeToDb(value: number) {
  return 20 * Math.log10(Math.max(1e-12, Math.abs(value)));
}

export function powerToDb(value: number) {
  return 10 * Math.log10(Math.max(1e-24, value));
}

export function percentile(values: readonly number[], quantile: number) {
  if (values.length === 0) {
    return -120;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const position = clamp01(quantile) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  return sorted[lower]! * (1 - mix) + sorted[upper]! * mix;
}

export function zeroCrossingRate(frame: Float32Array) {
  let crossings = 0;
  for (let index = 1; index < frame.length; index += 1) {
    if ((frame[index - 1] ?? 0) * (frame[index] ?? 0) < 0) {
      crossings += 1;
    }
  }
  return crossings / Math.max(1, frame.length - 1);
}

export function rms(frame: Float32Array) {
  let sum = 0;
  for (const sample of frame) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, frame.length));
}

export function maxIndex(values: readonly number[]) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] ?? 0) > (values[best] ?? 0)) {
      best = index;
    }
  }
  return best;
}
