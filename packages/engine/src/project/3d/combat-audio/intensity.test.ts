import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import { createCombatMusicIntensity, combatMusicIntensityGain } from './intensity.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatAudio3D } from '../combat-audio.ts';
import { readGameplayAudio3D } from '../gameplay-contracts.ts';

function fixture() {
  const config = createTouchOfDeathPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 0, z: 0 } }, { id: 'b', position: { x: 10, y: 0, z: 0 } }] }).capture();
  const signal = createCombatMusicIntensity({ maxHealth: config.maxHealth });
  const hit = (frame: number): CombatEvent => ({ id: String(frame), frame, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 8, impulse: { x: 0, y: 0, z: 0 } });
  return { signal, state, hit };
}

test('low health raises presentation urgency while healthy distance remains calm', () => {
  const calm = fixture(), danger = fixture();danger.state.fighters[0]!.health = 20;
  for (let frame = 1; frame <= 120; frame++) { calm.state.frame = frame;danger.state.frame = frame;calm.signal.step(calm.state, []);danger.signal.step(danger.state, []); }
  expect(calm.signal.value()).toBe(.15);expect(danger.signal.value()).toBeGreaterThan(.4);
  expect(combatMusicIntensityGain(danger.signal.value())).toBeLessThan(1);expect(combatMusicIntensityGain(1)).toBeGreaterThan(.85);
});

test('close attack pressure and repeated combo hits build intensity that releases gradually', () => {
  const { signal, state, hit } = fixture();state.fighters[1]!.position.x = 1;state.fighters[0]!.moveId = 'jab';
  for (let frame = 1; frame <= 90; frame++) { state.frame = frame;signal.step(state, frame % 6 === 0 ? [hit(frame)] : []); }
  const peak = signal.value();expect(peak).toBeGreaterThan(.5);
  state.fighters[1]!.position.x = 10;state.fighters[0]!.moveId = '';
  state.frame++;signal.step(state, []);expect(signal.value()).toBe(peak);
  for (let frame = 92; frame <= 390; frame++) { state.frame = frame;signal.step(state, []); }
  expect(signal.value()).toBeLessThan(.3);expect(signal.value()).toBeLessThan(peak);
});

test('publication cooldown and hysteresis bound commands even during a hit every tick', () => {
  const { signal, state, hit } = fixture(), emitted: number[] = [];
  for (let frame = 1; frame <= 180; frame++) {
    state.frame = frame;const value = signal.step(state, [hit(frame)]);if (value !== undefined) emitted.push(frame);
    expect(signal.step(state, [hit(frame)])).toBeUndefined();
  }
  expect(emitted.length).toBeGreaterThan(0);expect(emitted.length).toBeLessThanOrEqual(6);
  expect(emitted.every((frame, index) => !index || frame - emitted[index - 1]! >= 30)).toBe(true);
  const count = emitted.length;
  for (let frame = 181; frame <= 360; frame++) { state.frame = frame;if (signal.step(state, [hit(frame)]) !== undefined) emitted.push(frame); }
  expect(emitted.length).toBe(count);
});

test('intensity cooldown, smoothing and combo memories rewind exactly without changing combat data', () => {
  const { signal, state, hit } = fixture(), saved = signal.capture();
  const run = () => {
    const heard: Array<{ frame: number; value: number }> = [];
    for (let frame = 1; frame <= 180; frame++) {
      state.frame = frame;state.fighters[0]!.health = frame < 100 ? 30 : 100;
      const events = frame < 100 && frame % 8 === 0 ? [hit(frame)] : [], before = structuredClone({ state, events });
      const value = signal.step(state, events);if (value !== undefined) heard.push({ frame, value });
      expect({ state, events }).toEqual(before);
    }
    return heard;
  };
  const heard = run(), final = signal.capture();signal.restore(saved);expect(run()).toEqual(heard);expect(signal.capture()).toEqual(final);
  signal.reset();expect(signal.capture()).toEqual(saved);expect(saved.published).toBe(.15);
});

test('combat music commands carry bounded intensity on the existing queue and checkpoint exact replay', async () => {
  const { runtime, game } = await combatMotionFixture(), config = createTouchOfDeathPreset();
  const sound = createCombatAudio3D({ runtime, definition: { version: 1, config, fighters: [], audio: { musicGain: .3, playlists: { lobby: [{ assetId: 'lobby' }], gameplay: [{ assetId: 'game' }] } } } });
  const match = { version: 1 as const, phase: 'fighting' as const, difficulty: 1, ticks: 0, playerWins: 0, opponentWins: 0, winner: '' as const, held: [] };
  sound.phase(match);expect(sound.drain()).toMatchObject([{ playlist: 'gameplay', musicIntensity: .15, gain: .3 }]);
  const saved = sound.capture(), base = game.snapshot().combat!.state;
  const run = () => {
    const heard = [];
    for (let frame = 1; frame <= 150; frame++) {
      const before = structuredClone(base), after = structuredClone(base);before.frame = frame - 1;after.frame = frame;after.fighters[0]!.health = 15;
      const events: CombatEvent[] = frame % 6 === 0 ? [{ id: String(frame), frame, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 8, impulse: { x: 0, y: 0, z: 0 } }] : [];
      sound.phase(match);sound.step({ before, after, events, grounded: new Set<string>(), motion: [] });
      for (const event of sound.drain().filter(event => event.bus === 'music')) heard.push({ frame, event });
    }
    return heard;
  };
  const heard = run(), final = sound.capture();expect(heard.length).toBeGreaterThan(0);expect(heard.length).toBeLessThanOrEqual(5);
  expect(heard.every(({ event }) => event.playlist === 'gameplay' && event.assetId === 'game' && event.musicIntensity! > .15 && event.musicIntensity! <= 1 && event.gain! <= .3 && event.gain! > .25)).toBe(true);
  expect(heard.every(({ frame }, index) => !index || frame - heard[index - 1]!.frame >= 30)).toBe(true);
  sound.restore(saved);expect(run()).toEqual(heard);expect(sound.capture()).toEqual(final);
  sound.phase({ ...match, phase: 'menu' });const lobby = sound.drain();expect(lobby).toMatchObject([{ playlist: 'lobby' }]);expect(lobby[0]?.musicIntensity).toBeUndefined();
});

test('portable urgency accepts bounded music values and rejects non-music or nonfinite values', () => {
  const assets = new Set(['track']);
  for (const musicIntensity of [0, .6, 1]) expect(readGameplayAudio3D([{ assetId: 'track', bus: 'music', musicIntensity }], assets)[0]!.musicIntensity).toBe(musicIntensity);
  for (const musicIntensity of [-.1, 1.1, Infinity, NaN, 'high', null]) expect(() => readGameplayAudio3D([{ assetId: 'track', bus: 'music', musicIntensity }], assets)).toThrow();
  for (const bus of [undefined, 'sfx', 'voice', 'ambient']) expect(() => readGameplayAudio3D([{ assetId: 'track', bus, musicIntensity: .5 }], assets)).toThrow();
});
