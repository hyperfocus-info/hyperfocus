import type { AudioEngine, AudioPlayResult, PlayBufferOptions } from "./index.ts";
import {
  SFX_PRESET_NAMES,
  SFX_PRESET_STYLES,
  sfxPresetDefinition,
  type SfxPresetName,
  type SfxPresetStyle,
} from "./sfx-style-renderers.ts";

export { SFX_PRESET_NAMES, SFX_PRESET_STYLES };
export type { SfxPresetName, SfxPresetStyle };

export type RenderSfxPresetOptions = {
  preset: SfxPresetName;
  style?: SfxPresetStyle;
  sampleRate?: number;
  seed?: number;
};
export type RenderedSfxPreset = {
  preset: SfxPresetName;
  style: SfxPresetStyle;
  sampleRate: number;
  durationSeconds: number;
  samples: Float32Array;
  wav: Uint8Array;
};
export type PlaySfxPresetOptions = Omit<PlayBufferOptions, "bus"> & {
  preset: SfxPresetName;
  bus?: string;
};
export type SfxPresetBankOptions = {
  audio: Pick<AudioEngine, "decode" | "playBuffer">;
  presets?: readonly SfxPresetName[];
  style?: SfxPresetStyle;
  idPrefix?: string;
  sampleRate?: number;
  seed?: number;
};
export type SfxPresetBank = {
  readonly presets: readonly SfxPresetName[];
  readonly style: SfxPresetStyle;
  assetId(preset: SfxPresetName): string;
  load(): Promise<void>;
  play(options: PlaySfxPresetOptions): AudioPlayResult;
};

function randomGenerator(seed: number) {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state = Math.imul(state ^ state >>> 15, state | 1);
    state ^= state + Math.imul(state ^ state >>> 7, state | 61);
    return ((state ^ state >>> 14) >>> 0) / 4_294_967_296;
  };
}

function presetSeed(style: SfxPresetStyle, preset: SfxPresetName, seed: number) {
  let value = seed >>> 0;
  const key = `${style}:${preset}`;
  for (let index = 0; index < key.length; index += 1) value = Math.imul(value ^ key.charCodeAt(index), 16_777_619);
  return value >>> 0;
}

function normalizedSampleRate(value = 44_100) {
  if (!Number.isSafeInteger(value) || value < 8_000 || value > 96_000) throw new RangeError("SFX sampleRate must be a safe integer from 8000 through 96000.");
  return value;
}

function normalizePeak(samples: Float32Array) {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak <= 0.92 || peak === 0) return;
  const gain = 0.92 / peak;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= gain;
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index); };
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, samples[index])) * 32_767), true);
  return bytes;
}

/** Renders one deterministic, dependency-free mono SFX preset as PCM and WAV. */
export function renderSfxPreset(options: RenderSfxPresetOptions): RenderedSfxPreset {
  if (!SFX_PRESET_NAMES.includes(options.preset)) throw new Error(`Unknown SFX preset: ${String(options.preset)}`);
  const style = options.style ?? "retro-arcade";
  if (!SFX_PRESET_STYLES.includes(style)) throw new Error(`Unknown SFX preset style: ${String(style)}`);
  const definition = sfxPresetDefinition(style, options.preset);
  const sampleRate = normalizedSampleRate(options.sampleRate);
  const sampleCount = Math.max(1, Math.round(definition.duration * sampleRate));
  const samples = new Float32Array(sampleCount);
  const renderer = definition.render(randomGenerator(presetSeed(style, options.preset, options.seed ?? 0)));
  for (let index = 0; index < sampleCount; index += 1) samples[index] = renderer(index / sampleRate, index / sampleCount);
  normalizePeak(samples);
  return { preset: options.preset, style, sampleRate, durationSeconds: sampleCount / sampleRate, samples, wav: encodePcm16Wav(samples, sampleRate) };
}

/** Decodes a reusable procedural SFX set into an existing first-party audio engine. */
export async function createSfxPresetBank(options: SfxPresetBankOptions): Promise<SfxPresetBank> {
  const presets = [...new Set(options.presets ?? SFX_PRESET_NAMES)];
  const style = options.style ?? "retro-arcade";
  if (!presets.length) throw new Error("SFX preset bank requires at least one preset.");
  const prefix = options.idPrefix ?? "sfx:preset:";
  if (!prefix || prefix.length > 480) throw new Error("SFX preset idPrefix must be 1-480 characters.");
  const ids = new Map(presets.map((preset) => [preset, `${prefix}${style}:${preset}`]));
  const load = async () => {
    for (const preset of presets) {
      const rendered = renderSfxPreset({ preset, style, sampleRate: options.sampleRate, seed: options.seed });
      await options.audio.decode(ids.get(preset)!, rendered.wav);
    }
  };
  const assetId = (preset: SfxPresetName) => {
    const id = ids.get(preset);
    if (!id) throw new Error(`SFX preset is not loaded in this bank: ${preset}`);
    return id;
  };
  await load();
  return {
    presets,
    style,
    assetId,
    load,
    play({ preset, bus = "sfx", ...playOptions }) { return options.audio.playBuffer(assetId(preset), { ...playOptions, bus }); },
  };
}
