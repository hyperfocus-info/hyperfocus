import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatAudioEmitter } from './emitter.ts';
import { createCombatEnvironmentAudio } from './environment.ts';
import { movementSurface } from './surface.ts';
import { createCombatAudio3D } from '../combat-audio.ts';
import type { CombatProject3D } from '../combat-declaration.ts';

test('surface audio follows the actual support collider and flood footprint rather than floors under a roof', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true }), scene = runtime.declaration.scenes[0]!;
  const wood = { ...runtime.declaration.materials[0]!, id: 'wood-roof' }, metal = { ...wood, id: 'steel-floor', metallic: 1 };
  runtime.declaration.materials.push(wood, metal);
  scene.entities.find(entity => entity.id === 'floor')!.materialId = metal.id;
  scene.entities.find(entity => entity.id === 'obstacle')!.materialId = wood.id;
  const definition: CombatProject3D = { version: 1, config: createTouchOfDeathPreset(), fighters: [], environment: { surfaces: [], hazards: [{ entityId: 'wet', kind: 'flood', groundSpeedScale: .65 }] } };
  expect(movementSurface(runtime, definition, 'a', [])).toBe('metal');
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [-1.2, 9.6, 0] }] });runtime.physics.setVelocity('a', 0, 0, 0);
  for (let i = 0; i < 30; i++) game.step([]);
  expect(runtime.physics.body('a')!.y).toBeGreaterThan(9.5);
  expect(movementSurface(runtime, definition, 'a', [])).toBe('wood');
  scene.entities.push({ id: 'wet', meshId: 'mesh', materialId: metal.id, position: [-1.2, .1, 0], scale: [3, .3, 3], rotationY: 0 });
  expect(movementSurface(runtime, definition, 'a', ['wet'])).toBe('wood');
  const wet = scene.entities.pop()!;
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [0, 1.85, 0] }] });runtime.physics.setVelocity('a', 0, 0, 0);
  for (let i = 0; i < 10; i++) game.step([]);
  scene.entities.push(wet);
  expect(movementSurface(runtime, definition, 'a', ['wet'])).toBe('wet');
  expect(movementSurface(runtime, definition, 'a', [])).toBe('metal');
});

test('surface steps and wall motion are separate authored cues with one wall/air availability transition', async () => {
  const { runtime, game } = await combatMotionFixture(), state = game.combatState()!;
  runtime.declaration.materials[0]!.metallic = 1;
  const sound = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [], audio: { cues: { step: 'legacy', stepMetal: 'metal', wallStep: 'wall', wallSlide: 'slide', airDashReady: 'ready', airDashUnavailable: 'unavailable' } } } });
  const input = { before: state, after: state, events: [], grounded: new Set(['a']), motion: [{ id: 'a', dash: 0 }] };
  sound.step(input);sound.drain();runtime.physics.setVelocity('a', 2, 0, 0);
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [1, .8, 0] }] });sound.step(input);
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [2, .8, 0] }] });sound.step(input);
  expect(sound.drain().map(sound => sound.assetId)).toEqual(['metal']);
  const wall = { ...input, grounded: new Set<string>(), motion: [{ id: 'a', dash: 0, wallRunning: true, wallSliding: true, dashCueKind: 3, dashCue: 14 }] };
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [3, .8, 0] }] });sound.step(wall);
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [4, .8, 0] }] });sound.step(wall);
  const heard = sound.drain().map(sound => sound.assetId);expect(heard).toContain('wall');expect(heard.filter(id => id === 'slide')).toHaveLength(1);expect(heard.filter(id => id === 'ready')).toHaveLength(1);
  sound.step({ ...wall, motion: [{ ...wall.motion[0]!, dashCueKind: 2, dashCue: 12 }] });expect(sound.drain().map(sound => sound.assetId)).toEqual(['unavailable']);
});

test('nearby traffic grains and machinery are capped, quiet, checkpointed and silent outside live play', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true }), state = game.combatState()!;
  const obstacle = runtime.declaration.scenes[0]!.entities.find(entity => entity.id === 'obstacle')!;
  obstacle.animation = { kind: 'ping-pong', offset: [1, 0, 0], periodSeconds: 2, phase: 0 };
  const definition: CombatProject3D = { version: 1, config: createTouchOfDeathPreset(), fighters: [], environment: { surfaces: [{ entityId: 'obstacle', stopMotionIds: ['motor-part'], trigger: { kind: 'impact', minSpeed: 4 } }], traffic: [{ entityId: 'floor', moveId: 'heavy', minSpeed: 3 }] }, audio: { sfxGain: 1, cues: { trafficPass: 'pass', trafficBrake: 'brake', machinery: 'machine', cityBed: 'city' } } };
  const emitter = createCombatAudioEmitter({ runtime, audio: definition.audio }), audio = createCombatEnvironmentAudio({ runtime, definition, emitter });
  const at = (frame: number, x: number, phase = 'fighting') => { state.frame = frame;runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'floor', position: [x, -.25, 0] }, { type: 'teleport', entityId: 'obstacle', position: [x, 5, 0] }] });audio.step(state, phase);return emitter.drain(); };
  expect(at(59, 0)).toEqual([]);const initial = audio.capture(), emitterInitial = emitter.capture();
  const live = at(60, .1);expect(live).toHaveLength(2);expect(live.every(sound => sound.loop === false && sound.bus === 'ambient' && sound.priority === 5 && sound.gain! <= .35)).toBe(true);
  expect(at(60, .1)).toEqual([]);expect(at(61, .1).map(sound => sound.assetId)).toEqual(['brake']);expect(at(62, .1)).toEqual([]);
  audio.restore(initial);emitter.restore(emitterInitial);expect(at(60, .1)).toEqual(live);
  expect(at(120, 1, 'round-result')).toEqual([]);expect(at(180, 2, 'match-result')).toEqual([]);
  state.fighters[0]!.position.x = 100;expect(at(240, 3)).toEqual([]);
});

test('only declared powered roots sound, with 3D near/far/height falloff and silence after motion stops or destruction', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true }), state = game.combatState()!;
  const obstacle = runtime.declaration.scenes[0]!.entities.find(entity => entity.id === 'obstacle')!;
  obstacle.animation = { kind: 'ping-pong', offset: [1, 0, 0], periodSeconds: 2, phase: 0 };
  const definition: CombatProject3D = { version: 1, config: createTouchOfDeathPreset(), fighters: [], environment: { surfaces: [] }, audio: { sfxGain: 1, cues: { machinery: 'machine', cityBed: 'global-tone' } } };
  const emitter = createCombatAudioEmitter({ runtime, audio: definition.audio });
  const unrelated = createCombatEnvironmentAudio({ runtime, definition, emitter });
  state.frame = 60;unrelated.step(state, 'fighting');expect(emitter.drain()).toEqual([]);
  definition.environment!.surfaces.push({ entityId: 'obstacle', stopMotionIds: ['linked-motor'], trigger: { kind: 'impact', minSpeed: 4 } });
  let stopped = false;
  const audio = createCombatEnvironmentAudio({ runtime, definition, emitter, inactive: () => stopped });
  const at = (frame: number, x: number, y = 1) => { state.frame = frame;runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'obstacle', position: [x, y, 0] }] });audio.step(state, 'fighting');return emitter.drain(); };
  expect(at(59, 0)).toEqual([]);const near = at(60, .1);expect(near[0]?.assetId).toBe('machine');
  at(119, 5);const farther = at(120, 5.1);expect(farther[0]!.gain!).toBeLessThan(near[0]!.gain!);
  at(179, 0, 20);expect(at(180, .1, 20)).toEqual([]);
  at(239, 20);expect(at(240, 20.1)).toEqual([]);
  at(299, 0);expect(at(300, 0)).toEqual([]);
  stopped = true;at(359, 0);expect(at(360, .1)).toEqual([]);
  stopped = false;runtime.physics.configureBody('obstacle', { collisionMask: 0 });at(419, 0);expect(at(420, .1)).toEqual([]);
});

test('traffic uses vertical distance and selecting another listener keeps nearby machine feedback local to that fighter', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true }), state = game.combatState()!;
  const obstacle = runtime.declaration.scenes[0]!.entities.find(entity => entity.id === 'obstacle')!;
  obstacle.animation = { kind: 'ping-pong', offset: [1, 0, 0], periodSeconds: 2, phase: 0 };
  const definition: CombatProject3D = { version: 1, config: createTouchOfDeathPreset(), fighters: [], environment: { surfaces: [{ entityId: 'obstacle', stopMotionIds: ['linked'], trigger: { kind: 'impact', minSpeed: 4 } }], traffic: [{ entityId: 'floor', moveId: 'heavy', minSpeed: 3 }] }, audio: { cues: { machinery: 'machine', trafficPass: 'pass', cityBed: 'city' } } };
  const emitter = createCombatAudioEmitter({ runtime, audio: definition.audio }), audio = createCombatEnvironmentAudio({ runtime, definition, emitter });
  state.fighters[0]!.position = { x: 0, y: 1, z: 0 };state.fighters[1]!.position = { x: 100, y: 1, z: 0 };
  const at = (frame: number, x: number) => { state.frame = frame;runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'floor', position: [x, 30, 0] }, { type: 'teleport', entityId: 'obstacle', position: [100 + x, 1, 0] }] });audio.step(state, 'fighting');return emitter.drain(); };
  at(59, 0);expect(at(60, .1)).toEqual([]);
  emitter.setListener(state.fighters[1]!.id);const heard = at(120, .2);expect(heard.map(sound => sound.assetId)).toEqual(['machine']);
  emitter.setListener();expect(at(180, .3)).toEqual([]);
  expect(() => game.setAudioListener({ fighterId: 'unknown' })).toThrow();expect(() => game.setAudioListener({ fighterId: state.fighters[1]!.id })).not.toThrow();
});

test('world one-shots fade in 3D while personal combat remains clear, and checkpoints preserve host listener ownership', async () => {
  const { runtime } = await combatMotionFixture();
  const emitter = createCombatAudioEmitter({ runtime, listenerId: 'a', audio: { sfxGain: 1, cues: { environmentBreak: 'break', hit: 'hit' } } });
  const at = (x: number, y = 1) => { runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'floor', position: [x, y, 0] }] });emitter.worldCue('environmentBreak', 'floor');return emitter.drain(); };
  const near = at(1), farther = at(8);expect(farther[0]!.gain!).toBeLessThan(near[0]!.gain!);
  expect(at(20)).toEqual([]);expect(at(0, 20)).toEqual([]);
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'b', position: [100, 1, 0] }] });
  emitter.cue('hit', 'b');expect(emitter.drain()[0]?.gain).toBe(1);
  const saved = emitter.capture();emitter.setListener('b');emitter.restore(saved);
  expect(at(100)[0]?.assetId).toBe('break');emitter.setListener();expect(at(100)).toEqual([]);
});

test('three nearby moving sources admit only two finite ambient voices', async () => {
  const { runtime, game } = await combatMotionFixture({ obstacle: true }), state = game.combatState()!;
  const ids = ['floor', 'obstacle', 'b'];
  const definition: CombatProject3D = { version: 1, config: createTouchOfDeathPreset(), fighters: [], environment: { surfaces: [], traffic: ids.map(entityId => ({ entityId, moveId: 'heavy', minSpeed: 3 })) }, audio: { cues: { trafficPass: 'pass', cityBed: 'global-tone' } } };
  const emitter = createCombatAudioEmitter({ runtime, audio: definition.audio }), audio = createCombatEnvironmentAudio({ runtime, definition, emitter });
  const at = (frame: number, offset: number) => { state.frame = frame;runtime.applyCommands({ commands: ids.map((entityId, index) => { const position: [number, number, number] = [index + offset, 1, 0];return { type: 'teleport' as const, entityId, position }; }) });audio.step(state, 'fighting');return emitter.drain(); };
  at(59, 0);const heard = at(60, .1);
  expect(heard).toHaveLength(2);expect(heard.every(sound => sound.assetId === 'pass' && !sound.loop && Number.isFinite(sound.gain))).toBe(true);
});

test('fire grains use the same switched fighter listener as city sources', async () => {
  const { runtime, game } = await combatMotionFixture(), state = game.combatState()!;
  runtime.declaration.scenes[0]!.entities.push({ id: 'fire', meshId: 'mesh', materialId: 'material', position: [100, 1, 0], scale: [1, 1, 1], rotationY: 0 });
  state.fighters[1]!.position = { x: 100, y: 1, z: 0 };
  const sound = createCombatAudio3D({ runtime, definition: { version: 1, config: createTouchOfDeathPreset(), fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }], environment: { surfaces: [], hazards: [{ entityId: 'fire', kind: 'fire', damage: 1, intervalFrames: 30 }] }, audio: { cues: { hazardFire: 'fire' } } }, hazards: () => ({ state: { frame: state.frame, contacts: [], trace: [] }, activeIds: ['fire'] }) });
  const input = { before: state, after: state, events: [], grounded: new Set<string>(), motion: [] };
  state.frame = 24;sound.step(input);expect(sound.drain()).toEqual([]);
  sound.setListener('b');state.frame = 48;sound.step(input);expect(sound.drain().map(event => event.assetId)).toEqual(['fire']);
  sound.setListener();state.frame = 72;sound.step(input);expect(sound.drain()).toEqual([]);
});
