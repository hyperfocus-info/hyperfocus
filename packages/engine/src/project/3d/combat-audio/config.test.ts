import { expect, test } from 'bun:test';
import { combatAudioAssetIds3D, readCombatAudio3D } from '../combat-audio-config.ts';
import { readGameplayAudio3D } from '../gameplay-contracts.ts';
import { readCombatAudioEffects3D, readCombatAudioMix3D } from './settings.ts';
import { readCombatInteractions } from '../combat-interaction/config.ts';
import { readCombatEnvironment } from '../combat-environment/config.ts';

test('legacy bindings remain unchanged and all bounded bank/result assets are portable references', () => {
  expect(readCombatAudio3D({ music: 'music', cues: { hit: 'hit' }, voices: { a: { hurt: 'hurt' } } }, ['a'])).toEqual({ music: 'music', cues: { hit: 'hit' }, voices: { a: { hurt: 'hurt' } } });
  const audio = readCombatAudio3D({ musicResult: 'result', variants: { step: ['one', 'two'] }, voiceVariants: { a: { hurt: ['hurt-one', 'hurt-two'] } } }, ['a']);
  expect(combatAudioAssetIds3D(audio)).toEqual(['result', 'one', 'two', 'hurt-one', 'hurt-two']);
  for (const bank of [[], Array.from({ length: 9 }, (_, i) => String(i)), ['repeat', 'repeat'], [''], [7]]) expect(() => readCombatAudio3D({ variants: { hit: bank } }, ['a'])).toThrow();
  expect(() => readCombatAudio3D({ voiceVariants: { absent: { hurt: ['a'] } } }, ['a'])).toThrow();
  expect(() => readCombatAudio3D({ variants: { unknown: ['a'] } }, ['a'])).toThrow();
});

test('portable audio accepts bounded mix metadata and rejects nonfinite/invalid duck and fades', () => {
  const sound = { assetId: 'a', priority: 80, duckMusic: .4, duckSeconds: .3, fadeSeconds: .4 };
  expect(readGameplayAudio3D([sound], new Set(['a']))[0]).toMatchObject(sound);
  for (const invalid of [{ priority: NaN }, { duckMusic: -1 }, { duckMusic: 1.1 }, { duckSeconds: 11 }, { fadeSeconds: Infinity }]) expect(() => readGameplayAudio3D([{ ...sound, ...invalid }], new Set(['a']))).toThrow();
});

test('music playlists preserve optional timing metadata, bounded queues and every asset reference', () => {
  const value = { music: 'legacy', musicResult: 'result', playlists: { lobby: [{ assetId: 'lobby', gain: .8 }], gameplay: [{ assetId: 'fight', bpm: 128, startSeconds: 4, endSeconds: 120 }] }, musicTransition: { style: 'varied' as const, durationSeconds: 2.5, align: 'bar' as const, beatsPerBar: 4 } };
  const audio = readCombatAudio3D(value, []);expect(audio).toEqual(value);
  expect(combatAudioAssetIds3D(audio)).toEqual(['legacy', 'result', 'lobby', 'fight']);
  expect(readCombatAudio3D({ playlists: { lobby: [], gameplay: [{ assetId: 'unknown-tempo' }] }, musicTransition: {} }, [])).toEqual({ playlists: { lobby: [], gameplay: [{ assetId: 'unknown-tempo' }] }, musicTransition: {} });
  for (const playlists of [{ unknown: [] }, { lobby: 'track' }, { lobby: Array.from({ length: 65 }, (_, index) => ({ assetId: String(index) })) }, { lobby: [{ assetId: 'a' }, { assetId: 'a' }] }]) expect(() => readCombatAudio3D({ playlists }, [])).toThrow();
  for (const track of [{ assetId: '' }, { assetId: 'a', unknown: 1 }, { assetId: 'a', gain: NaN }, { assetId: 'a', gain: 1.1 }, { assetId: 'a', bpm: 29 }, { assetId: 'a', bpm: 301 }, { assetId: 'a', startSeconds: -1 }, { assetId: 'a', startSeconds: 5, endSeconds: 5 }, { assetId: 'a', endSeconds: 3_601 }]) expect(() => readCombatAudio3D({ playlists: { gameplay: [track] } }, [])).toThrow();
  for (const musicTransition of [{ unknown: 1 }, { style: 'unsupported' }, { align: 'later' }, { durationSeconds: 11 }, { durationSeconds: Infinity }, { beatsPerBar: 2.5 }, { beatsPerBar: 0 }, { beatsPerBar: 13 }]) expect(() => readCombatAudio3D({ musicTransition }, [])).toThrow();
});

test('musical grids and energy validate before entering the portable playback boundary', () => {
  const track = { assetId: 'song', bpm: 128, beatOffsetSeconds: .25, beatsPerBar: 3, phraseBars: 8, musicalKey: 'A minor' as const, energy: .8 };
  expect(readCombatAudio3D({ playlists: { lobby: [track] }, musicTransition: { align: 'phrase' } }, [])?.playlists?.lobby).toEqual([track]);
  for (const change of [{ beatOffsetSeconds: -1 }, { beatOffsetSeconds: Infinity }, { beatsPerBar: 2.5 }, { beatsPerBar: 13 }, { phraseBars: 0 }, { phraseBars: 17 }, { musicalKey: 'unknown' }, { energy: NaN }, { energy: 1.1 }]) {
    expect(() => readCombatAudio3D({ playlists: { lobby: [{ ...track, ...change }] } }, [])).toThrow();
  }
});

test('authored mix and optional effects resolve bounded defaults and retain the impulse asset reference', () => {
  expect(readCombatAudioMix3D()).toEqual({ master: .5, music: .5, sfx: .5, ambient: .5 });
  expect(readCombatAudioEffects3D()).toEqual({ musicCompression: true, reverbSend: .02, impactSaturation: .15, reactiveMusic: true, lowHealthCents: -35, staminaLowpassHz: 800 });
  const audio = readCombatAudio3D({ mix: { music: 0 }, effects: { cityImpulseAssetId: 'city-ir', musicCompression: false, reverbSend: 0, lowHealthCents: 0 } }, []);
  expect(audio?.mix?.music).toBe(0);expect(audio?.effects?.musicCompression).toBe(false);expect(combatAudioAssetIds3D(audio)).toEqual(['city-ir']);
  for (const mix of [{ voice: .5 }, { master: NaN }, { sfx: 1.01 }, { ambient: -.1 }]) expect(() => readCombatAudioMix3D(mix)).toThrow();
  for (const effects of [{ unknown: true }, { musicCompression: 1 }, { reactiveMusic: 'yes' }, { cityImpulseAssetId: '' }, { reverbSend: -1 }, { impactSaturation: 1.1 }, { lowHealthCents: -101 }, { lowHealthCents: 1 }, { staminaHighpassHz: 29 }, { staminaHighpassHz: Infinity }, { staminaLowpassHz: 29 }, { staminaLowpassHz: NaN }, { staminaLowpassHz: 20001 }]) expect(() => readCombatAudioEffects3D(effects)).toThrow();
});

test('legacy stamina high-pass settings validate without becoming a low-pass cutoff', () => {
  expect(readCombatAudioEffects3D({ staminaHighpassHz: 240 })).toEqual(readCombatAudioEffects3D());
  const effects = readCombatAudioEffects3D({ staminaHighpassHz: 240, staminaLowpassHz: 1200 });
  expect(effects.staminaLowpassHz).toBe(1200);expect(Object.hasOwn(effects, 'staminaHighpassHz')).toBe(false);
  expect(readCombatAudio3D({ effects: { staminaHighpassHz: 240 } }, [])?.effects).toEqual(readCombatAudioEffects3D());
  expect(() => readCombatAudioEffects3D({ staminaHighpassHz: NaN, staminaLowpassHz: 1200 })).toThrow();
  for (const staminaLowpassHz of [30, 20000]) expect(readCombatAudioEffects3D({ staminaLowpassHz }).staminaLowpassHz).toBe(staminaLowpassHz);
});

test('portable pitch, impact strength and vocal identity survive parsing and reject invalid numbers', () => {
  const sound = { assetId: 'hurt', bus: 'sfx', category: 'voice', playbackRate: .9, impactStrength: .2 };
  expect(readGameplayAudio3D([sound], new Set(['hurt']))[0]).toMatchObject(sound);
  for (const invalid of [{ category: 'unknown' }, { playbackRate: NaN }, { playbackRate: .24 }, { playbackRate: 4.1 }, { impactStrength: Infinity }, { impactStrength: -.1 }, { impactStrength: 1.1 }]) expect(() => readGameplayAudio3D([{ ...sound, ...invalid }], new Set(['hurt']))).toThrow();
});

test('acoustic identities round trip independently from mechanics and invalid profiles reject', () => {
  const weapon = { entityId: 'bottle', material: 'wood', acousticProfile: 'glass', durability: 1, length: 1, lightMoveId: 'jab', heavyMoveId: 'heavy' } as const;
  expect(readCombatInteractions({ weapons: [weapon] })?.weapons[0]).toEqual(weapon);
  expect(() => readCombatInteractions({ weapons: [{ ...weapon, acousticProfile: 'plastic' }] })).toThrow();
  const surface = { entityId: 'wall', acousticProfile: 'masonry', trigger: { kind: 'impact', minSpeed: 4 } } as const;
  expect(readCombatEnvironment({ surfaces: [surface] })?.surfaces[0]).toEqual(surface);
  expect(() => readCombatEnvironment({ surfaces: [{ ...surface, acousticProfile: 'unknown' }] })).toThrow();
});
