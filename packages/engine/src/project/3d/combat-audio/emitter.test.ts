import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatAudioEmitter } from './emitter.ts';
import { createCombatAudio3D } from '../combat-audio.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';

test('defensive feedback outranks footsteps/swings and ducks music briefly below strong impacts', async () => {
  const { runtime } = await combatMotionFixture();
  const emitter = createCombatAudioEmitter({ runtime, audio: { cues: { step: 'step', swing: 'swing', parry: 'parry', tech: 'tech', hitHeavy: 'heavy', ko: 'ko' } } });
  for (const key of ['step', 'swing', 'parry', 'tech', 'hitHeavy', 'ko'] as const) emitter.cue(key);
  const sounds = emitter.drain();
  expect(sounds.map(sound => sound.priority)).toEqual([15, 15, 65, 65, 70, 100]);
  expect(sounds[0]!.duckMusic).toBeUndefined();expect(sounds[1]!.duckMusic).toBeUndefined();
  expect(sounds[2]).toMatchObject({ duckMusic: .82, duckSeconds: .12 });expect(sounds[3]).toMatchObject({ duckMusic: .82, duckSeconds: .12 });
  expect(sounds[4]!.duckMusic!).toBeLessThan(sounds[2]!.duckMusic!);
});

test('expanded menu music applies the phase gain from its first start while legacy music retains original gain', async () => {
  const { runtime } = await combatMotionFixture();
  const match = { version: 1 as const, phase: 'menu' as const, difficulty: 1, ticks: 0, playerWins: 0, opponentWins: 0, winner: '' as const, held: [] };
  for (const expanded of [false, true]) {
    const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { music: 'music', ...(expanded ? { variants: { step: ['one', 'two'] } } : {}) } } });
    audio.phase(match);expect(audio.drain()).toEqual([{ assetId: 'music', bus: 'music', gain: expanded ? .154 : .22, pan: 0, loop: true }]);
    audio.phase(match);expect(audio.drain()).toEqual([]);
  }
});
