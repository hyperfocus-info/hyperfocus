import { object } from './gameplay-contracts.ts';
import type { AudioPlaylistTrack, AudioPlaylistTransition } from '../../audio/playlist-contracts.ts';
import { AUDIO_MUSICAL_KEYS } from '../../audio/playlist-contracts.ts';
import { readCombatAudioEffects3D, readCombatAudioMix3D, type CombatAudioEffects3D, type CombatAudioMix3D } from './combat-audio/settings.ts';
export { readCombatAudioEffects3D, readCombatAudioMix3D, type CombatAudioEffects3D, type CombatAudioMix3D } from './combat-audio/settings.ts';

export type CombatMusicTrack3D = AudioPlaylistTrack;
export type CombatMusicTransition3D = AudioPlaylistTransition;

export const combatAudioCues3D = ['step', 'stepAlternate', 'sprint', 'sprintAlternate', 'jump', 'dash', 'land', 'landHeavy', 'swing', 'swingHeavy', 'hit', 'hitHeavy', 'blood', 'block', 'parry', 'guardBreak', 'tech', 'bounce', 'escape', 'ko', 'countdown', 'fight', 'environmentWarning', 'environmentBreak', 'weaponWood', 'weaponMetal', 'weaponWoodBreak', 'weaponMetalBreak', 'hazardFire', 'hazardWater',
  'airJump', 'wallJump', 'wallStep', 'wallSlide', 'airDashReady', 'airDashUnavailable', 'stepWood', 'sprintWood', 'stepMetal', 'sprintMetal', 'stepWet', 'sprintWet', 'landWood', 'landMetal', 'landWet', 'counter', 'grabConnect', 'grabMiss', 'weaponPickup', 'weaponThrow', 'weaponWoodDrop', 'weaponMetalDrop', 'weaponSpray', 'weaponDeploy', 'weaponConsume', 'trafficPass', 'trafficBrake', 'trafficCrash', 'machinery', 'cityBed', 'roundWin', 'roundLoss', 'matchWin', 'matchLoss',
  'armor', 'weaponGlass', 'weaponGlassBreak', 'weaponGlassDrop', 'weaponCeramic', 'weaponCeramicBreak', 'weaponCeramicDrop', 'weaponSoft', 'weaponSoftBreak', 'weaponSoftDrop', 'weaponLiquid', 'weaponLiquidBreak', 'weaponLiquidDrop', 'weaponScatter', 'weaponScatterBreak', 'weaponScatterDrop', 'weaponLiquidDeploy', 'weaponScatterDeploy', 'hazardIgnition', 'motorShutdown', 'environmentMasonryBreak', 'environmentWoodBreak', 'environmentMetalBreak', 'environmentGlassBreak', 'uiFocus', 'uiConfirm', 'uiBack', 'uiAdjust', 'uiDenied'] as const;
export type CombatAudioCue3D = typeof combatAudioCues3D[number];
export const combatVoiceCues3D = ['attack', 'attackHeavy', 'hurt', 'effort', 'ko'] as const;
export type CombatAudio3D = {
  music?: string; musicResult?: string; musicGain?: number; sfxGain?: number; voiceGain?: number;
  playlists?: { lobby?: AudioPlaylistTrack[]; gameplay?: AudioPlaylistTrack[] };
  musicTransition?: AudioPlaylistTransition;
  mix?: CombatAudioMix3D; effects?: CombatAudioEffects3D;
  cues?: Partial<Record<CombatAudioCue3D, string>>;
  variants?: Partial<Record<CombatAudioCue3D, string[]>>;
  voices?: Record<string, Partial<Record<typeof combatVoiceCues3D[number], string>>>;
  voiceVariants?: Record<string, Partial<Record<typeof combatVoiceCues3D[number], string[]>>>;
};

export function readCombatAudio3D(value: unknown, fighters: readonly string[]): CombatAudio3D | undefined {
  if (value === undefined) return undefined;
  const raw = object(value), result: CombatAudio3D = {};
  const known = ['music', 'musicResult', 'musicGain', 'sfxGain', 'voiceGain', 'cues', 'variants', 'voices', 'voiceVariants', 'playlists', 'musicTransition', 'mix', 'effects'];
  for (const key of Object.keys(raw)) if (!known.includes(key)) throw new Error(`Unknown combat audio field: ${key}.`);
  if (raw.music !== undefined) result.music = asset(raw.music);
  if (raw.musicResult !== undefined) result.musicResult = asset(raw.musicResult);
  if (raw.playlists !== undefined) result.playlists = readPlaylists(raw.playlists);
  if (raw.musicTransition !== undefined) result.musicTransition = readMusicTransition(raw.musicTransition);
  if (raw.mix !== undefined) result.mix = readCombatAudioMix3D(raw.mix);
  if (raw.effects !== undefined) result.effects = readCombatAudioEffects3D(raw.effects);
  for (const key of ['musicGain', 'sfxGain', 'voiceGain'] as const) if (raw[key] !== undefined) {
    const gain = raw[key];
    if (typeof gain !== 'number' || !Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error(`Combat audio ${key} must be from zero to one.`);
    result[key] = gain;
  }
  if (raw.cues !== undefined) result.cues = bindings(raw.cues, combatAudioCues3D);
  if (raw.variants !== undefined) result.variants = banks(raw.variants, combatAudioCues3D);
  if (raw.voices !== undefined) {
    result.voices = {};
    for (const [id, voice] of Object.entries(object(raw.voices))) {
      if (!fighters.includes(id)) throw new Error(`Combat voice fighter ${id} is not in this fight.`);
      result.voices[id] = bindings(voice, combatVoiceCues3D);
    }
  }
  if (raw.voiceVariants !== undefined) {
    result.voiceVariants = {};
    for (const [id, voice] of Object.entries(object(raw.voiceVariants))) {
      if (!fighters.includes(id)) throw new Error(`Combat voice fighter ${id} is not in this fight.`);
      result.voiceVariants[id] = banks(voice, combatVoiceCues3D);
    }
  }
  return result;
}

function bindings<T extends string>(value: unknown, keys: readonly T[]): Partial<Record<T, string>> {
  const raw = object(value), result: Partial<Record<T, string>> = {};
  for (const key of Object.keys(raw)) if (!keys.some(known => known === key)) throw new Error(`Unknown combat audio cue: ${key}.`);
  for (const key of keys) if (raw[key] !== undefined) result[key] = asset(raw[key]);
  return result;
}
function asset(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw new Error('Combat audio needs a valid audio asset ID.');
  return value;
}

function banks<T extends string>(value: unknown, keys: readonly T[]): Partial<Record<T, string[]>> {
  const raw = object(value), result: Partial<Record<T, string[]>> = {};
  for (const key of Object.keys(raw)) if (!keys.some(known => known === key)) throw new Error(`Unknown combat audio cue: ${key}.`);
  for (const key of keys) if (raw[key] !== undefined) {
    const bank = raw[key];
    if (!Array.isArray(bank) || !bank.length || bank.length > 8) throw new Error('Combat audio variants need one to eight takes.');
    const takes = bank.map(asset);
    if (new Set(takes).size !== takes.length) throw new Error('Combat audio variants need distinct takes.');
    result[key] = takes;
  }
  return result;
}

export function combatAudioAssetIds3D(audio: CombatAudio3D | undefined): string[] {
  return audio ? [audio.music, audio.musicResult, audio.effects?.cityImpulseAssetId, ...Object.values(audio.playlists ?? {}).flatMap(tracks => tracks.map(track => track.assetId)), ...Object.values(audio.cues ?? {}), ...Object.values(audio.variants ?? {}).flat(), ...Object.values(audio.voices ?? {}).flatMap(voice => Object.values(voice)), ...Object.values(audio.voiceVariants ?? {}).flatMap(voice => Object.values(voice).flat())].filter((id): id is string => typeof id === 'string') : [];
}

function readPlaylists(value: unknown) {
  const raw = object(value), result: NonNullable<CombatAudio3D['playlists']> = {};
  for (const key of Object.keys(raw)) if (key !== 'lobby' && key !== 'gameplay') throw new Error(`Unknown combat music playlist: ${key}.`);
  for (const key of ['lobby', 'gameplay'] as const) if (raw[key] !== undefined) {
    const queue = raw[key];
    if (!Array.isArray(queue) || queue.length > 64) throw new Error('Combat music playlists need at most 64 tracks.');
    const tracks = queue.map(readMusicTrack);
    if (new Set(tracks.map(track => track.assetId)).size !== tracks.length) throw new Error('Combat music playlists need distinct tracks.');
    result[key] = tracks;
  }
  return result;
}
function boundedMusicNumber(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Combat music ${label} must be from ${min} to ${max}.`);
  return value;
}
function readMusicTrack(value: unknown): AudioPlaylistTrack {
  const raw = object(value), track: AudioPlaylistTrack = { assetId: asset(raw.assetId) };
  for (const key of Object.keys(raw)) if (!['assetId', 'gain', 'bpm', 'startSeconds', 'endSeconds', 'beatOffsetSeconds', 'beatsPerBar', 'phraseBars', 'musicalKey', 'energy'].includes(key)) throw new Error(`Unknown combat music track field: ${key}.`);
  if (raw.gain !== undefined) track.gain = boundedMusicNumber(raw.gain, 'track gain', 0, 1);
  if (raw.bpm !== undefined) track.bpm = boundedMusicNumber(raw.bpm, 'BPM', 30, 300);
  if (raw.startSeconds !== undefined) track.startSeconds = boundedMusicNumber(raw.startSeconds, 'track start', 0, 3_600);
  if (raw.beatOffsetSeconds !== undefined) track.beatOffsetSeconds = boundedMusicNumber(raw.beatOffsetSeconds, 'first downbeat', 0, 3_600);
  if (raw.energy !== undefined) track.energy = boundedMusicNumber(raw.energy, 'track energy', 0, 1);
  for (const key of ['beatsPerBar', 'phraseBars'] as const) if (raw[key] !== undefined) {
    track[key] = boundedMusicNumber(raw[key], key, 1, key === 'beatsPerBar' ? 12 : 16);
    if (!Number.isInteger(track[key])) throw new Error(`Combat music ${key} must be an integer.`);
  }
  if (raw.musicalKey !== undefined) {
    const key = AUDIO_MUSICAL_KEYS.find(key => key === raw.musicalKey);
    if (!key) throw new Error('Combat music key must be a major or minor key.');track.musicalKey = key;
  }
  if (raw.endSeconds !== undefined) {
    track.endSeconds = boundedMusicNumber(raw.endSeconds, 'track end', 0, 3_600);
    if (track.endSeconds <= (track.startSeconds ?? 0)) throw new Error('Combat music track end must be after its start.');
  }
  return track;
}
function readMusicTransition(value: unknown): AudioPlaylistTransition {
  const raw = object(value), result: AudioPlaylistTransition = {};
  for (const key of Object.keys(raw)) if (!['style', 'durationSeconds', 'align', 'beatsPerBar'].includes(key)) throw new Error(`Unknown combat music transition field: ${key}.`);
  if (raw.style !== undefined) {
    const style = (['varied', 'crossfade', 'echo', 'flanger', 'stutter', 'filter'] as const).find(style => style === raw.style);
    if (!style) throw new Error('Invalid combat music transition style.');result.style = style;
  }
  if (raw.align !== undefined) {
    const align = (['immediate', 'beat', 'bar', 'phrase'] as const).find(align => align === raw.align);
    if (!align) throw new Error('Invalid combat music transition timing.');result.align = align;
  }
  if (raw.durationSeconds !== undefined) result.durationSeconds = boundedMusicNumber(raw.durationSeconds, 'transition duration', 0, 10);
  if (raw.beatsPerBar !== undefined) {
    result.beatsPerBar = boundedMusicNumber(raw.beatsPerBar, 'beats per bar', 1, 12);
    if (!Number.isInteger(result.beatsPerBar)) throw new Error('Combat music beats per bar must be an integer.');
  }
  return result;
}
