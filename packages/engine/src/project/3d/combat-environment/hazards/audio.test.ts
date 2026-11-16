import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import { createCombatPreset } from '../../../../combat/config.ts';
import { createHazardAudio } from './audio.ts';
import type { HazardState } from './session.ts';

function fixture(gain = 1) {
  const state = createCombatSimulation({ config: createCombatPreset(), fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const hazards = ['one', 'two', 'three'].map(entityId => ({ entityId, kind: 'fire' as const, damage: 2, intervalFrames: 30 }));
  const audio = createHazardAudio({ hazards: [...hazards, { entityId: 'water', kind: 'flood', groundSpeedScale: .65 }], entities: hazards.map((hazard, index) => ({ id: hazard.entityId, meshId: 'mesh', materialId: 'material', position: [index * 2 + 2, .5, 0], scale: [1, .5, 1], rotationY: 0 })), audio: { sfxGain: gain, cues: { hazardFire: 'fire-grain', hazardWater: 'water-entry' } }, listenerId: 'a' });
  const environment: HazardState = { frame: 0, contacts: [], trace: [] };
  const input = { state: environment, activeIds: hazards.map(hazard => hazard.entityId) };
  return { state, audio, input };
}

test('fire audio uses at most two nearby non-looping grains, attenuates and pauses with live combat', () => {
  const { state, audio, input } = fixture();state.frame = 24;
  const first = audio.step(state, input, 'fighting', 1, 0);
  expect(first).toHaveLength(2);expect(first.every(sound => sound.loop === false && sound.gain! <= .35 && sound.bus === 'sfx')).toBe(true);
  expect(first[0]!.gain!).toBeGreaterThan(first[1]!.gain!);expect(first[0]!.pan!).toBeGreaterThan(0);
  expect(audio.step(state, input, 'fighting', 1, 0)).toEqual([]);
  for (const frame of [25, 26, 47]) { state.frame = frame;expect(audio.step(state, input, 'fighting', 1, 0)).toEqual([]); }
  state.frame = 48;expect(audio.step(state, input, 'round-result', 1, 0)).toEqual([]);expect(audio.step(state, input, 'menu', 1, 0)).toEqual([]);
  expect(audio.step(state, { ...input, activeIds: [] }, 'fighting', 1, 0)).toEqual([]);
  state.frame = 72;state.fighters[0]!.position.x = 100;expect(audio.step(state, input, 'fighting', 1, 0)).toEqual([]);
  const muted = fixture(0);muted.state.frame = 24;expect(muted.audio.step(muted.state, muted.input, 'fighting', 1, 0)).toEqual([]);
});

test('water entry debounces boundary tapping and local audio rollback does not duplicate cues', () => {
  const { state, audio, input } = fixture();
  const entry = (frame: number) => { state.frame = frame;input.state.trace = [{ entityId: 'water', fighterId: 'a', frame, kind: 'enter', damage: 0 }]; };
  entry(1);const before = audio.capture(), first = audio.step(state, input, 'fighting', 1, 0);expect(first.map(sound => sound.assetId)).toEqual(['water-entry']);
  audio.restore(before);expect(audio.step(state, input, 'fighting', 1, 0)).toEqual(first);
  entry(2);expect(audio.step(state, input, 'fighting', 1, 0)).toEqual([]);
  entry(19);expect(audio.step(state, input, 'fighting', 1, 0).map(sound => sound.assetId)).toEqual(['water-entry']);
});
