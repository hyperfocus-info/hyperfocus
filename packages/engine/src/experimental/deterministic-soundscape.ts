import { clampLowerFirst } from "@hyperfocus/utilities/math";
export interface DeterministicSoundscapeOptions {
  seed: number | string;
  sampleRate?: number;
  channels?: number;
  windGain?: number;
  rainGain?: number;
  rainDensity?: number;
  machineryGain?: number;
  machineryHz?: number;
}

/** Creates a stateful, allocation-free PCM generator for deterministic ambient beds. */
export function createDeterministicSoundscape(options: DeterministicSoundscapeOptions) {
  const sampleRate = positiveFinite(options.sampleRate ?? 48_000, "sampleRate");
  const channels = positiveInteger(options.channels ?? 2, "channels");
  const windGain = gain(options.windGain ?? 0.18, "windGain");
  const rainGain = gain(options.rainGain ?? 0.12, "rainGain");
  const rainDensity = gain(options.rainDensity ?? 0.015, "rainDensity");
  const machineryGain = gain(options.machineryGain ?? 0.08, "machineryGain");
  const machineryHz = positiveFinite(options.machineryHz ?? 55, "machineryHz");
  const initialSeed = hashSeed(options.seed) || 0x6d2b79f5;
  let randomState = initialSeed;
  let wind = 0;
  let rain = 0;
  let phase = 0;
  const random = () => {
    let value = randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    randomState = value >>> 0;
    return randomState / 4_294_967_296;
  };
  return Object.freeze({
    sampleRate, channels, windGain, rainGain, rainDensity, machineryGain, machineryHz,
    fill(output: Float32Array, frameCount = Math.floor(output.length / channels), sampleOffset = 0): Float32Array {
    if (!(output instanceof Float32Array)) throw new TypeError("soundscape output must be a Float32Array.");
    if (!Number.isSafeInteger(frameCount) || frameCount < 0) throw new RangeError("frameCount must be non-negative.");
    if (!Number.isSafeInteger(sampleOffset) || sampleOffset < 0 || sampleOffset + frameCount * channels > output.length) {
      throw new RangeError("soundscape output range is invalid.");
    }
    const phaseStep = Math.PI * 2 * machineryHz / sampleRate;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const white = random() * 2 - 1;
      wind += (white - wind) * 0.012;
      if (random() < rainDensity) rain += 0.35 + random() * 0.65;
      const rainSample = rain * (random() * 2 - 1);
      rain *= 0.91;
      const machinery = Math.sin(phase) + Math.sin(phase * 0.503) * 0.25;
      phase += phaseStep;
      if (phase > Math.PI * 4) phase -= Math.PI * 4;
      const sample = clamp(wind * windGain + rainSample * rainGain + machinery * machineryGain);
      const offset = sampleOffset + frame * channels;
      for (let channel = 0; channel < channels; channel += 1) output[offset + channel] = sample;
    }
    return output;
    },

    reset(): void {
      randomState = initialSeed;
      wind = 0;
      rain = 0;
      phase = 0;
    },
  });
}

export type DeterministicSoundscape = ReturnType<typeof createDeterministicSoundscape>;

function hashSeed(seed: number | string): number {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) throw new RangeError("numeric soundscape seed must be a safe integer.");
    return seed >>> 0;
  }
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function gain(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be between zero and one.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

function clamp(value: number): number { return clampLowerFirst(value, -1, 1); }
