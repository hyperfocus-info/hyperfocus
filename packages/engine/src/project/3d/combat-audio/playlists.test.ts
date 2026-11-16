import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatAudio3D } from '../combat-audio.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readGameplayAudio3D } from '../gameplay-contracts.ts';
import type { CombatMatchSnapshot3D } from '../combat-match/index.ts';

const match = (phase: CombatMatchSnapshot3D['phase']): CombatMatchSnapshot3D => ({ version: 1, phase, difficulty: 1, ticks: phase === 'countdown' ? 180 : 0, playerWins: 0, opponentWins: 0, winner: '', held: [] });

test('phase music switches playlist buckets and updates gain without changing the queue identity', async () => {
  const { runtime } = await combatMotionFixture();
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: {
    music: 'legacy', musicResult: 'legacy-result', musicGain: .5,
    playlists: { lobby: [{ assetId: 'shared' }, { assetId: 'lobby-next' }], gameplay: [{ assetId: 'shared' }, { assetId: 'game-next' }] },
  } } });
  const step = (phase: CombatMatchSnapshot3D['phase']) => { audio.phase(match(phase));return audio.drain(); };
  expect(step('menu')).toEqual([{ assetId: 'shared', bus: 'music', gain: .35, pan: 0, loop: true, playlist: 'lobby' }]);
  expect(step('menu')).toEqual([]);
  expect(step('intro')).toMatchObject([{ assetId: 'shared', playlist: 'gameplay', gain: .425, fadeSeconds: .4 }]);
  expect(step('countdown')).toMatchObject([{ assetId: 'shared', playlist: 'gameplay', gain: .475 }]);
  expect(step('fighting')).toMatchObject([{ assetId: 'shared', playlist: 'gameplay', gain: .5 }]);
  expect(step('practice')).toEqual([]);
  expect(step('round-result')).toMatchObject([{ assetId: 'shared', playlist: 'gameplay', gain: .325 }]);
  const result = step('match-result');expect(result).toMatchObject([{ assetId: 'shared', playlist: 'lobby', gain: .4 }]);expect(result[0]?.musicIntensity).toBeUndefined();
  expect(step('menu')).toMatchObject([{ assetId: 'shared', playlist: 'lobby', gain: .35 }]);
});

test('a bucket change emits even when its anchor and phase gain equal the prior intent', async () => {
  const { runtime } = await combatMotionFixture();
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: {
    musicGain: 0, playlists: { lobby: [{ assetId: 'shared' }], gameplay: [{ assetId: 'shared' }] },
  } } });
  audio.phase(match('menu'));expect(audio.drain()).toMatchObject([{ playlist: 'lobby', gain: 0 }]);
  audio.phase(match('fighting'));expect(audio.drain()).toMatchObject([{ playlist: 'gameplay', gain: 0 }]);
  audio.phase(match('fighting'));expect(audio.drain()).toEqual([]);
});

test('playlist checkpoints restore pending intents and resets preserve or restart the selected bucket', async () => {
  const { runtime } = await combatMotionFixture();
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { playlists: { lobby: [{ assetId: 'lobby' }], gameplay: [{ assetId: 'game' }] } } } });
  audio.phase(match('menu'));const saved = audio.capture(), initial = audio.drain();
  audio.phase(match('fighting'));audio.drain();audio.restore(saved);
  expect(audio.drain()).toEqual(initial);audio.phase(match('menu'));expect(audio.drain()).toEqual([]);
  audio.reset(false);audio.phase(match('menu'));expect(audio.drain()).toEqual([]);
  audio.phase(match('fighting'));expect(audio.drain()).toMatchObject([{ playlist: 'gameplay' }]);
  audio.reset();audio.phase(match('fighting'));expect(audio.drain()).toMatchObject([{ playlist: 'gameplay' }]);
});

test('missing and empty playlist buckets preserve legacy music and result music', async () => {
  const { runtime } = await combatMotionFixture();
  for (const playlists of [undefined, {}, { lobby: [], gameplay: [] }]) {
    const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { music: 'legacy', musicResult: 'result', playlists } } });
    audio.phase(match('menu'));expect(audio.drain()).toMatchObject([{ assetId: 'legacy', gain: .154 }]);
    audio.phase(match('match-result'));const heard = audio.drain();expect(heard).toMatchObject([{ assetId: 'result' }]);expect(heard[0]!.gain).toBeCloseTo(.176);expect(heard[0]!.playlist).toBeUndefined();
  }
});

test('portable playlist intents retain their identity and reject non-music or unbounded identifiers', () => {
  const assets = new Set(['anchor']);
  expect(readGameplayAudio3D([{ assetId: 'anchor', bus: 'music', playlist: 'gameplay' }], assets)[0]).toMatchObject({ assetId: 'anchor', bus: 'music', playlist: 'gameplay' });
  expect(readGameplayAudio3D([{ assetId: 'anchor', bus: 'music', playlist: 'x'.repeat(64) }], assets)[0]!.playlist).toHaveLength(64);
  for (const playlist of ['', ' ', 'x'.repeat(65), 4, null]) expect(() => readGameplayAudio3D([{ assetId: 'anchor', bus: 'music', playlist }], assets)).toThrow();
  for (const bus of [undefined, 'sfx', 'voice', 'ambient']) expect(() => readGameplayAudio3D([{ assetId: 'anchor', bus, playlist: 'gameplay' }], assets)).toThrow();
});
