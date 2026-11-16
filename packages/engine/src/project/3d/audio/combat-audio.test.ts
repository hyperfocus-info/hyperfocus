import { expect, test } from 'bun:test';
import { createCombatAudio3D } from '../combat-audio.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatPreset } from '../../../combat/config.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('attack voice precedes the active swing, whiffs have no impact and flurries sound once per strike', async () => {
  const { runtime } = await combatMotionFixture();
  const config = createCombatPreset();
  config.moves[0]!.activeFrames = 6; config.moves[0]!.strikeFrames = [0, 3];
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] });
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config, fighters: [], audio: { cues: { swing: 'whoosh', swingHeavy: 'heavy-whoosh', hit: 'impact' }, voices: { a: { attack: 'voice' } } } } });
  const heard: Array<{ frame: number; cues: string[] }> = [];
  for (let frame = 0; frame < 13; frame++) {
    const before = simulation.capture();
    const events = simulation.step({ inputs: frame === 0 ? [{ fighterId: 'a', pressed: ['jab'] }] : [] });
    const after = simulation.capture();
    audio.step({ before, after, events, grounded: new Set(['a']), motion: [] });
    heard.push({ frame, cues: audio.drain().map(cue => cue.assetId) });
  }
  expect(heard[0]!.cues).toEqual(['voice']);
  expect(heard.filter(item => item.cues.includes('whoosh')).map(item => item.frame)).toEqual([4, 7]);
  expect(heard.flatMap(item => item.cues).includes('impact')).toBe(false);

  // The same sound must not fire merely because an interrupted heavy reaches
  // its nominal active time later on the presentation clock.
  audio.reset(false);
  const interrupted = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } },
    { id: 'b', position: { x: 1, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const interruptedCues: string[] = [];
  for (let frame = 0; frame < 16; frame++) {
    const before = interrupted.capture();
    const events = interrupted.step({ inputs: frame === 0 ? [{ fighterId: 'a', pressed: ['heavy'] }, { fighterId: 'b', pressed: ['jab'] }] : [] });
    audio.step({ before, after: interrupted.capture(), events, grounded: new Set(['a']), motion: [] });
    interruptedCues.push(...audio.drain().map(cue => cue.assetId));
  }
  expect(interruptedCues).toContain('impact');
  // The opponent's two active jab strikes still emit their own swings.
  expect(interruptedCues.filter(cue => cue === 'whoosh')).toHaveLength(2);
  expect(interruptedCues).not.toContain('heavy-whoosh');
});
