import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import { createCombatAudio3D } from '../combat-audio.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import type { CombatAudio3D } from '../combat-audio-config.ts';
import type { CombatProject3D } from '../combat-declaration.ts';

async function fixture(audio: CombatAudio3D) {
  const { runtime, game } = await combatMotionFixture(), state = game.snapshot().combat!.state;
  const scene = runtime.declaration.scenes[0]!, source = scene.entities.find(entity => entity.id === 'floor')!;
  scene.entities.push({ ...source, id: 'wood', physics: undefined, position: [0, 1, 0] });
  const config = createTouchOfDeathPreset(), definition: CombatProject3D = { version: 1, config, fighters: [], audio, interactions: { weapons: [{ entityId: 'wood', material: 'wood', durability: 30, length: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' }] } };
  const sound = createCombatAudio3D({ runtime, definition });
  const events: CombatEvent[] = [];
  const input = { before: state, after: state, events, grounded: new Set<string>(), motion: [] };
  return { sound, input, definition, runtime };
}

test('drop audio uses the actual impact position for near/far/height and the selected listener', async () => {
  const { sound, input, definition, runtime } = await fixture({ sfxGain: 1, cues: { weaponGlassDrop: 'drop', weaponPickup: 'pickup', weaponThrow: 'throw', hit: 'hit' } });
  definition.interactions!.weapons[0]!.acousticProfile = 'glass';
  const at = (x: number, y = 1) => { sound.step({ ...input, interactions: [{ kind: 'weapon-dropped', actor: 'wood', target: 'wood', position: { x, y, z: 0 } }] });return sound.drain(); };
  const near = at(1), farther = at(8);expect(near[0]?.assetId).toBe('drop');expect(farther[0]!.gain!).toBeLessThan(near[0]!.gain!);expect(near[0]!.pan).toBeGreaterThan(0);
  expect(at(100)).toEqual([]);expect(at(0, 20)).toEqual([]);
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'b', position: [100, 1, 0] }] });
  sound.setListener('b');expect(at(100)[0]?.gain).toBe(1);expect(at(1)).toEqual([]);
  sound.step({ ...input, interactions: [{ kind: 'weapon-picked-up', actor: 'a', target: 'wood' }, { kind: 'weapon-thrown', actor: 'a', target: 'wood' }], events: [{ id: 'hit', frame: 1, attackerId: 'b', targetId: 'a', kind: 'hit', moveId: '', damage: 1, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(sound.drain().map(event => [event.assetId, event.gain])).toEqual([['pickup', 1], ['throw', 1], ['hit', 1]]);
});

test('air jump has one accepted takeoff including legacy jump fallback and exact replay', async () => {
  for (const dedicated of [false, true]) {
    const { sound, input } = await fixture({ cues: { jump: 'jump', ...(dedicated ? { airJump: 'air' } : {}) } });
    const saved = sound.capture(), step = { ...input, motion: [{ id: 'a', dash: 0, dashCueKind: 4, dashCue: 12 }] };
    sound.step(step);const heard = sound.drain();expect(heard.map(sound => sound.assetId)).toEqual([dedicated ? 'air' : 'jump']);
    sound.step(step);expect(sound.drain()).toEqual([]);
    sound.restore(saved);sound.step(step);expect(sound.drain()).toEqual(heard);
  }
});

test('a floor bounce or tech replaces only the same fighter ordinary landing and preserves grounded memory', async () => {
  for (const [kind, targetId, normalY, expected] of [
    ['bounce', 'a', 1, ['bounce']], ['tech', 'a', 1, ['tech']],
    ['bounce', 'a', 0, ['land', 'bounce']], ['bounce', 'a', .5, ['land', 'bounce']],
    ['bounce', 'b', 1, ['land', 'bounce']],
  ] as const) {
    const { sound, input, runtime } = await fixture({ cues: { land: 'land', bounce: 'bounce', tech: 'tech' } });
    const saved = sound.capture(), body = runtime.physics.body('a')!;
    saved.memories.push({ id: 'a', x: body.x, z: body.z, grounded: false, vy: -4, distance: 0, dash: 0, motionCue: 0, motionKind: 0, sliding: false, alternate: false });
    sound.restore(saved);
    const event: CombatEvent = { id: 'surface', frame: input.after.frame, attackerId: targetId, targetId, kind, moveId: '', damage: 0,
      contactNormal: { x: normalY === 0 ? 1 : 0, y: normalY, z: 0 }, impulse: { x: 0, y: 3, z: 0 } };
    const step = { ...input, grounded: new Set(['a']), events: [event] };
    sound.step(step);const heard = sound.drain();expect(heard.map(sound => sound.assetId)).toEqual([...expected]);
    expect(sound.capture().memories.find(memory => memory.id === 'a')!.grounded).toBe(true);
    sound.step({ ...step, events: [] });expect(sound.drain()).toEqual([]);
    sound.restore(saved);sound.step(step);expect(sound.drain()).toEqual(heard);
  }
});

test('generated weapon whiff never emits wear contact and low-health heavy finisher keeps authored impact weight', async () => {
  const { sound, input, definition } = await fixture({ cues: { weaponWood: 'wood-knock', block: 'block', hit: 'light', hitHeavy: 'heavy' } });
  const template = definition.config.moves.find(move => move.id === 'jab')!;
  definition.config.moves.push({ ...template, id: 'generated', weaponBaseMoveId: 'jab' });
  const after = structuredClone(input.after);after.fighters[0]!.moveId = 'generated';after.fighters[0]!.attackSerial++;
  sound.step({ ...input, after, interactions: [{ kind: 'weapon-wear', actor: 'a', target: 'wood' }] });expect(sound.drain()).toEqual([]);
  after.fighters[1]!.health = 0;
  sound.step({ ...input, after, events: [{ id: 'finish', frame: after.frame, attackerId: 'a', targetId: 'b', kind: 'hit', moveId: definition.config.moves.find(move => move.damage >= 24)!.id, damage: 2, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(sound.drain().map(sound => sound.assetId)).toEqual(['heavy']);
});

test('dedicated grab, counter and utility sounds replace legacy interaction stand-ins', async () => {
  const { sound, input } = await fixture({ cues: { grabConnect: 'grip', grabMiss: 'miss', counter: 'counter', weaponPickup: 'pickup', weaponThrow: 'throw', weaponWoodDrop: 'drop', weaponSpray: 'spray', weaponDeploy: 'deploy', weaponConsume: 'consume', swingHeavy: 'old-grab', step: 'old-pickup', swing: 'old-throw', guardBreak: 'old-counter' } });
  sound.step({ ...input, interactions: ['grapple-start', 'grapple-whiff', 'weapon-picked-up', 'weapon-thrown', 'weapon-dropped', 'weapon-sprayed', 'weapon-deployed', 'weapon-consumed'].map(kind => ({ kind, actor: 'a', target: 'wood' })), events: [{ id: 'counter', frame: input.after.frame, attackerId: 'b', targetId: 'a', kind: 'hit', moveId: '', damage: 1, counter: true, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(sound.drain().map(sound => sound.assetId)).toEqual(['grip', 'miss', 'pickup', 'throw', 'drop', 'spray', 'deploy', 'consume', 'counter']);
});

test('banks avoid adjacent repeats and rewind take selection and hurt preempts same-frame attack effort', async () => {
  const { sound, input } = await fixture({ cues: { hit: 'single' }, variants: { hit: ['one', 'two', 'three'] }, voices: { a: { attack: 'attack', effort: 'effort', hurt: 'hurt' } } });
  const saved = sound.capture();
  const run = () => {
    const heard: string[] = [];
    for (let frame = 0; frame < 15; frame++) {
      const after = structuredClone(input.after);after.frame = frame + 1;
      sound.step({ ...input, after, events: [{ id: String(frame), frame: after.frame, attackerId: 'b', targetId: 'a', kind: 'hit', moveId: '', damage: 1, impulse: { x: 0, y: 0, z: 0 } }] });
      heard.push(...sound.drain().filter(sound => sound.bus === 'sfx' && sound.category !== 'voice').map(sound => sound.assetId));
    }
    return heard;
  };
  const first = run();expect(new Set(first).size).toBeGreaterThan(1);expect(first.every((take, index) => !index || take !== first[index - 1])).toBe(true);
  const final = sound.capture();sound.restore(saved);expect(run()).toEqual(first);expect(sound.capture()).toEqual(final);
  sound.restore(saved);
  const after = structuredClone(input.after);after.frame++;after.fighters[0]!.moveId = 'jab';after.fighters[0]!.attackSerial++;
  sound.step({ ...input, after, motion: [{ id: 'a', dash: 10 }], events: [{ id: 'hurt', frame: after.frame, attackerId: 'b', targetId: 'a', kind: 'hit', moveId: '', damage: 1, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(sound.drain().filter(sound => sound.category === 'voice')).toEqual([expect.objectContaining({ assetId: 'hurt', bus: 'sfx', priority: 80 })]);
});

test('music phases update existing track gains once and result track/accent checkpoint exactly', async () => {
  const { sound } = await fixture({ music: 'battle', musicResult: 'result', cues: { roundWin: 'round', matchWin: 'match' } });
  const match = { version: 1 as const, phase: 'fighting' as const, difficulty: 1, ticks: 0, playerWins: 0, opponentWins: 0, winner: 'player' as const, held: [] };
  sound.phase(match);expect(sound.drain()).toEqual([{ assetId: 'battle', bus: 'music', gain: .22, pan: 0, loop: true }]);
  const saved = sound.capture();
  sound.phase({ ...match, phase: 'round-result' });const round = sound.drain();expect(round.map(sound => sound.assetId)).toEqual(['battle', 'round']);expect(round[0]!.gain).toBeCloseTo(.143);expect(round[0]!.fadeSeconds).toBe(.4);
  sound.phase({ ...match, phase: 'round-result' });expect(sound.drain()).toEqual([]);
  sound.phase({ ...match, phase: 'match-result' });expect(sound.drain().map(sound => sound.assetId)).toEqual(['result', 'match']);
  sound.restore(saved);sound.phase({ ...match, phase: 'round-result' });expect(sound.drain()).toEqual(round);
});

test('hitstun controls bounded gain and pitch without reading stale state, lethal damage or parry chip', async () => {
  const { sound, input } = await fixture({ cues: { hit: 'hit', hitHeavy: 'heavy', parry: 'parry' } });
  input.after.fighters[0]!.stunFrames = 500;
  const event: CombatEvent = { id: 'contact', frame: 1, attackerId: 'b', targetId: 'a', kind: 'hit', moveId: '', damage: 1, impulse: { x: 0, y: 0, z: 0 }, hitstunFrames: 27 };
  sound.step({ ...input, events: [event] });const light = sound.drain()[0]!;
  sound.step({ ...input, events: [{ ...event, hitstunFrames: 180 }] });const strong = sound.drain()[0]!;
  sound.step({ ...input, events: [{ ...event, hitstunFrames: 10000 }] });expect(sound.drain()[0]).toEqual(strong);
  expect(light.gain!).toBeLessThan(strong.gain!);expect(light.playbackRate!).toBeGreaterThan(strong.playbackRate!);
  expect(strong.playbackRate).toBeCloseTo(.86);expect(strong.impactStrength).toBe(1);
  sound.step({ ...input, events: [{ ...event, kind: 'parry', hitstunFrames: undefined }] });const parry = sound.drain()[0]!;expect(parry.assetId).toBe('parry');expect(parry.playbackRate).toBeUndefined();expect(parry.impactStrength).toBeUndefined();
});

test('damaging armor contact has a distinct cue and no normal impact, blood or counter layers', async () => {
  const { sound, input } = await fixture({ cues: { armor: 'armor', hit: 'hit', hitHeavy: 'heavy', blood: 'blood', counter: 'counter' }, voices: { a: { hurt: 'hurt' } } });
  sound.step({ ...input, events: [{ id: 'armor', frame: 1, attackerId: 'b', targetId: 'a', kind: 'hit', moveId: 'heavy', damage: 24, counter: true, armored: true, hitstunFrames: 0, impulse: { x: 0, y: 0, z: 0 } }] });
  expect(sound.drain().map(sound => sound.assetId)).toEqual(['armor', 'hurt']);
});

test('acoustic profiles distinguish glass, ceramic and ground props with legacy fallback and exact checkpoints', async () => {
  const { sound, input, definition } = await fixture({ cues: { weaponWood: 'wood', weaponWoodDrop: 'wood-drop', weaponGlass: 'glass', weaponGlassBreak: 'shards', weaponGlassDrop: 'glass-drop', weaponCeramicDrop: 'ceramic-drop', weaponLiquidDeploy: 'pour', weaponScatterDeploy: 'scatter' } });
  const weapon = definition.interactions!.weapons[0]!;weapon.acousticProfile = 'glass';
  const saved = sound.capture(), transitions = ['weapon-wear', 'weapon-broken', 'weapon-dropped'].map(kind => ({ kind, actor: 'a', target: 'wood' }));
  sound.step({ ...input, interactions: transitions });const first = sound.drain();expect(first.map(sound => sound.assetId)).toEqual(['glass', 'shards', 'glass-drop']);
  sound.restore(saved);sound.step({ ...input, interactions: transitions });expect(sound.drain()).toEqual(first);
  weapon.acousticProfile = 'ceramic';sound.step({ ...input, interactions: [transitions[0]!, transitions[2]!] });expect(sound.drain().map(sound => sound.assetId)).toEqual(['wood', 'ceramic-drop']);
  for (const profile of ['liquid', 'scatter'] as const) { weapon.acousticProfile = profile;sound.step({ ...input, interactions: [{ kind: 'weapon-deployed', actor: 'a', target: 'wood' }] });expect(sound.drain()[0]?.assetId).toBe(profile === 'liquid' ? 'pour' : 'scatter'); }
  expect(weapon.material).toBe('wood');
});

test('causal fire activation and motor stop are distinct from surface fracture and traffic crash', async () => {
  const { sound, input, definition, runtime } = await fixture({ cues: { environmentMasonryBreak: 'masonry', environmentBreak: 'break', hazardIgnition: 'ignite', motorShutdown: 'motor', trafficCrash: 'crash' } });
  definition.environment = { surfaces: [
    { entityId: 'supply', acousticProfile: 'masonry', trigger: { kind: 'impact', minSpeed: 4 } },
    { entityId: 'motor', stopMotionIds: ['rotor'], trigger: { kind: 'impact', minSpeed: 4 } },
    { entityId: 'car', stopMotionIds: ['wheel'], trigger: { kind: 'impact', minSpeed: 4 } },
  ], traffic: [{ entityId: 'car', moveId: 'heavy', minSpeed: 3 }], hazards: [{ entityId: 'fire', activationSurfaceId: 'supply', kind: 'fire', damage: 1, intervalFrames: 30 }] };
  const scene = runtime.declaration.scenes[0]!, source = scene.entities.find(entity => entity.id === 'floor')!;
  for (const id of ['supply', 'motor', 'car']) scene.entities.push({ ...source, id, physics: undefined, position: [0, 1, 0] });
  sound.step({ ...input, interactions: ['supply', 'motor', 'car'].map(actor => ({ kind: 'environment-removed', actor })) });
  expect(sound.drain().map(sound => sound.assetId)).toEqual(['masonry', 'ignite', 'motor', 'crash']);
  sound.step(input);expect(sound.drain()).toEqual([]);
});
