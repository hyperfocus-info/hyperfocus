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

/** Stateful, allocation-free PCM generator for deterministic ambient beds. */
export class DeterministicSoundscape {
  readonly sampleRate: number;
  readonly channels: number;
  readonly windGain: number;
  readonly rainGain: number;
  readonly rainDensity: number;
  readonly machineryGain: number;
  readonly machineryHz: number;
  readonly #initialSeed: number;
  #randomState: number;
  #wind = 0;
  #rain = 0;
  #phase = 0;

  constructor(options: DeterministicSoundscapeOptions) {
    this.sampleRate = positiveFinite(options.sampleRate ?? 48_000, "sampleRate");
    this.channels = positiveInteger(options.channels ?? 2, "channels");
    this.windGain = gain(options.windGain ?? 0.18, "windGain");
    this.rainGain = gain(options.rainGain ?? 0.12, "rainGain");
    this.rainDensity = gain(options.rainDensity ?? 0.015, "rainDensity");
    this.machineryGain = gain(options.machineryGain ?? 0.08, "machineryGain");
    this.machineryHz = positiveFinite(options.machineryHz ?? 55, "machineryHz");
    this.#initialSeed = hashSeed(options.seed) || 0x6d2b79f5;
    this.#randomState = this.#initialSeed;
  }

  fill(output: Float32Array, frameCount = Math.floor(output.length / this.channels), sampleOffset = 0): Float32Array {
    if (!(output instanceof Float32Array)) throw new TypeError("soundscape output must be a Float32Array.");
    if (!Number.isSafeInteger(frameCount) || frameCount < 0) throw new RangeError("frameCount must be non-negative.");
    if (!Number.isSafeInteger(sampleOffset) || sampleOffset < 0 || sampleOffset + frameCount * this.channels > output.length) {
      throw new RangeError("soundscape output range is invalid.");
    }
    const phaseStep = Math.PI * 2 * this.machineryHz / this.sampleRate;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const white = this.#random() * 2 - 1;
      this.#wind += (white - this.#wind) * 0.012;
      if (this.#random() < this.rainDensity) this.#rain += 0.35 + this.#random() * 0.65;
      const rainSample = this.#rain * (this.#random() * 2 - 1);
      this.#rain *= 0.91;
      const machinery = Math.sin(this.#phase) + Math.sin(this.#phase * 0.503) * 0.25;
      this.#phase += phaseStep;
      if (this.#phase > Math.PI * 4) this.#phase -= Math.PI * 4;
      const sample = clamp(this.#wind * this.windGain + rainSample * this.rainGain + machinery * this.machineryGain);
      const offset = sampleOffset + frame * this.channels;
      for (let channel = 0; channel < this.channels; channel += 1) output[offset + channel] = sample;
    }
    return output;
  }

  reset(): void {
    this.#randomState = this.#initialSeed;
    this.#wind = 0;
    this.#rain = 0;
    this.#phase = 0;
  }

  #random(): number {
    let value = this.#randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.#randomState = value >>> 0;
    return this.#randomState / 4_294_967_296;
  }
}

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

function clamp(value: number): number { return Math.max(-1, Math.min(1, value)); }

export function createDeterministicSoundscape(options: DeterministicSoundscapeOptions): DeterministicSoundscape {
  return new DeterministicSoundscape(options);
}
