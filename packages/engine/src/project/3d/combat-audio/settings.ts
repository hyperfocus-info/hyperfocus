import { object } from '../gameplay-contracts.ts';

export type CombatAudioMix3D = { master?: number; music?: number; sfx?: number; ambient?: number };
export type CombatAudioEffects3D = { musicCompression?: boolean; cityImpulseAssetId?: string; reverbSend?: number; impactSaturation?: number; reactiveMusic?: boolean; lowHealthCents?: number; staminaLowpassHz?: number;
  /** @deprecated Legacy high-pass tuning is validated and ignored; use staminaLowpassHz. */
  staminaHighpassHz?: number };

const mixDefaults = { master: .5, music: .5, sfx: .5, ambient: .5 };
const effectDefaults = { musicCompression: true, reverbSend: .02, impactSaturation: .15, reactiveMusic: true, lowHealthCents: -35, staminaLowpassHz: 800 };

/** Resolve the easy authored path; host preferences remain device-local overrides. */
export function readCombatAudioMix3D(value: unknown = undefined) {
  const raw = value === undefined ? {} : object(value), result = { ...mixDefaults };
  for (const key of Object.keys(raw)) if (!Object.hasOwn(mixDefaults, key)) throw Error(`Unknown combat audio mix field: ${key}.`);
  for (const key of ['master', 'music', 'sfx', 'ambient'] as const) if (raw[key] !== undefined) result[key] = number(raw[key], key, 0, 1);
  return result;
}

export function readCombatAudioEffects3D(value: unknown = undefined) {
  const raw = value === undefined ? {} : object(value), result: typeof effectDefaults & { cityImpulseAssetId?: string } = { ...effectDefaults };
  for (const key of Object.keys(raw)) if (!Object.hasOwn(effectDefaults, key) && key !== 'cityImpulseAssetId' && key !== 'staminaHighpassHz') throw Error(`Unknown combat audio effects field: ${key}.`);
  for (const key of ['musicCompression', 'reactiveMusic'] as const) if (raw[key] !== undefined) {
    if (typeof raw[key] !== 'boolean') throw Error(`Combat audio ${key} must be boolean.`);
    result[key] = raw[key];
  }
  for (const key of ['reverbSend', 'impactSaturation'] as const) if (raw[key] !== undefined) result[key] = number(raw[key], key, 0, 1);
  if (raw.lowHealthCents !== undefined) result.lowHealthCents = number(raw.lowHealthCents, 'lowHealthCents', -100, 0);
  if (raw.staminaHighpassHz !== undefined) number(raw.staminaHighpassHz, 'staminaHighpassHz', 30, 20_000);
  if (raw.staminaLowpassHz !== undefined) result.staminaLowpassHz = number(raw.staminaLowpassHz, 'staminaLowpassHz', 30, 20_000);
  if (raw.cityImpulseAssetId !== undefined) {
    if (typeof raw.cityImpulseAssetId !== 'string' || !raw.cityImpulseAssetId.trim() || raw.cityImpulseAssetId.length > 160) throw Error('Combat city impulse needs a valid audio asset ID.');
    result.cityImpulseAssetId = raw.cityImpulseAssetId;
  }
  return result;
}

function number(value: unknown, key: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`Combat audio ${key} must be from ${min} to ${max}.`);
  return value;
}
