import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatAudio3D } from '../combat-audio.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

test('weapon material cues replace generic wear thuds and preserve rewind without doubling tech', async () => {
  const { runtime, game } = await combatMotionFixture(), state = game.snapshot().combat!.state;
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], interactions: { weapons: [
    { entityId: 'wood', material: 'wood', durability: 30, length: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' },
    { entityId: 'metal', material: 'metal', durability: 60, length: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' },
  ] }, audio: { cues: { block: 'thud', guardBreak: 'guard', weaponWood: 'knock', weaponMetal: 'clang', weaponWoodBreak: 'splinter', weaponMetalBreak: 'fracture', tech: 'tech' } } } });
  const input = { before: state, after: state, events: [], grounded: new Set<string>(), motion: [], interactions: [
    { kind: 'weapon-wear', actor: 'surface', target: 'wood' }, { kind: 'weapon-wear', actor: 'surface', target: 'metal' },
    { kind: 'weapon-shortened', actor: 'surface', target: 'wood' }, { kind: 'weapon-broken', actor: 'surface', target: 'metal' },
    { kind: 'grapple-tech', actor: 'a', target: 'b' },
  ] };
  const saved = audio.capture();audio.step(input);const heard = audio.drain();
  expect(heard.map(cue => cue.assetId)).toEqual(['knock', 'clang', 'splinter', 'fracture']);
  audio.restore(saved);audio.step(input);expect(audio.drain()).toEqual(heard);
  const after = structuredClone(state), actor = after.fighters[0]!;
  actor.moveId = 'jab';actor.attackSerial++;
  audio.step({ ...input, after, interactions: [{ kind: 'weapon-wear', actor: actor.id, target: 'wood' }] });
  expect(audio.drain().some(cue => cue.assetId === 'knock' || cue.assetId === 'thud')).toBe(false);
});

test('environment cues have distinct assignments, preserve legacy fallback and rewind without duplicate pending sound', async () => {
  const { runtime, game } = await combatMotionFixture();
  const state = game.snapshot().combat!.state;
  for (const dedicated of [false, true]) {
    const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { cues: {
      countdown: 'countdown', guardBreak: 'guard-break', ...(dedicated ? { environmentWarning: 'worksite-alarm', environmentBreak: 'concrete-collapse' } : {}),
    } } } });
    const initial = audio.capture();
    const input = { before: state, after: state, events: [], grounded: new Set<string>(), motion: [], interactions: [{ kind: 'environment-warning', actor: 'a' }, { kind: 'environment-removed', actor: 'a' }] };
    audio.step(input);
    const cues = audio.drain();
    expect(cues.map(cue => cue.assetId)).toEqual(dedicated ? ['worksite-alarm', 'concrete-collapse'] : ['countdown', 'guard-break']);
    expect(audio.drain()).toEqual([]);
    audio.restore(initial);audio.step(input);expect(audio.drain()).toEqual(cues);
  }
});

test('a missed grab swooshes and direct wall chips thud rather than sounding the city alarm', async () => {
  const { runtime, game } = await combatMotionFixture(), state = game.snapshot().combat!.state;
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { cues: { swingHeavy: 'grab-reach', block: 'wall-thud', environmentWarning: 'alarm' } } } });
  audio.step({ before: state, after: state, events: [], grounded: new Set(), motion: [], interactions: [{ kind: 'grapple-whiff', actor: 'actor' }, { kind: 'environment-strike', actor: 'floor' }] });
  expect(audio.drain().map(cue => cue.assetId)).toEqual(['grab-reach', 'wall-thud']);
});

test('audio checkpoints rewind voice cooldown and pending cues without restarting music', async () => {
  const { runtime } = await combatMotionFixture();
  const config = createTouchOfDeathPreset();
  const simulation = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: 0, y: 1, z: 0 } },
    { id: 'b', position: { x: 1, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config, fighters: [],
    audio: { music: 'music', cues: { swing: 'swing', swingHeavy: 'heavy-swing', hit: 'hit', hitHeavy: 'heavy-hit' }, voices: { a: { attack: 'attack' }, b: { hurt: 'hurt' } } },
  } });
  audio.phase();
  const initial = audio.capture();
  expect(audio.drain().map(cue => cue.assetId)).toEqual(['music']);
  audio.restore(initial);
  expect(audio.drain().map(cue => cue.assetId)).toEqual(['music']);
  audio.phase();
  expect(audio.drain()).toEqual([]);
  const soundStart = audio.capture(), combatStart = simulation.capture();
  const run = () => {
    const heard: string[] = [];
    for (let frame = 0; frame < 30; frame++) {
      const before = simulation.capture();
      const events = simulation.step({ inputs: frame === 0 ? [{ fighterId: 'a', pressed: ['jab'] }] : [] });
      audio.step({ before, after: simulation.capture(), events, grounded: new Set(['a', 'b']), motion: [] });
      heard.push(...audio.drain().map(cue => cue.assetId));
    }
    return heard;
  };
  const first = run();
  expect(first).toContain('attack');
  expect(first).toContain('hit');
  expect(first).toContain('hurt');
  const final = audio.capture();
  simulation.restore({ snapshot: combatStart });audio.restore(soundStart);
  expect(run()).toEqual(first);
  expect(audio.capture()).toEqual(final);
  // Repeated restoration owns copies: later playback cannot mutate its source.
  audio.restore(soundStart);audio.reset();audio.restore(soundStart);
  expect(audio.capture()).toEqual(soundStart);
  expect(soundStart.memories).toEqual([]);
});

test('wall jump emits one takeoff cue and rewinds its presentation checkpoint', async () => {
  const { runtime, game } = await combatMotionFixture();
  const audio = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { cues: { jump: 'wall-takeoff' } } } });
  const state = game.snapshot().combat!.state;
  const input = { before: state, after: state, events: [], grounded: new Set<string>(), motion: [{ id: 'a', dash: 0, dashCueKind: 5, dashCue: 12 }] };
  const before = audio.capture();
  audio.step(input); expect(audio.drain().map(cue => cue.assetId)).toEqual(['wall-takeoff']);
  audio.step(input); expect(audio.drain()).toEqual([]);
  audio.restore(before); audio.step(input); expect(audio.drain().map(cue => cue.assetId)).toEqual(['wall-takeoff']);
});
