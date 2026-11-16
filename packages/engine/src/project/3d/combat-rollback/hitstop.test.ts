import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createCombatHitstop3D } from '../combat-hitstop.ts';
import type { CombatEvent } from '../../../combat/state.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';

test('scaled contact pauses preserve buffered guard and restore the same number of frozen ticks', () => {
  for (const [kind, damage, expected] of [['hit', 8, 3], ['hit', 24, 11], ['block', 8, 3], ['parry', 0, 14], ['guard-break', 8, 14]] as const) {
    const pause = createCombatHitstop3D({ scale: .8 });
    pause.contact([{ id: 'contact', frame: 1, attackerId: 'a', targetId: 'b', moveId: 'jab', kind, damage, impulse: { x: 1, y: 0, z: 0 } }]);
    expect(pause.capture().remaining).toBe(expected);
    pause.begin(new Set(['b:guard']));
    const restored = createCombatHitstop3D({ scale: .8 });restored.restore(restored.validate(JSON.parse(JSON.stringify(pause.capture()))));
    for (let tick = 1; tick < expected; tick++) {
      expect(restored.begin(new Set(['b:guard']))).toBe(true);
      pause.begin(new Set(['b:guard']));expect(restored.capture()).toEqual(pause.capture());
    }
    expect(restored.begin(new Set(['b:guard']))).toBe(false);
    expect(restored.resume(new Set()).has('b:guard')).toBe(true);
  }
});

test('mixed local and world-direction hitstop samples remain valid JSON save data', () => {
  const pause = createCombatHitstop3D();
  pause.contact([{ id: 'hit', frame: 0, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 8, impulse: { x: 0, y: 0, z: 0 } }]);
  pause.begin(new Set(['a:guard']));
  pause.begin(new Set(['a:guard']), { x: 1, y: 0, z: 0 });
  const saved = pause.capture();
  expect(saved.directions).toEqual([null, { x: 1, y: 0, z: 0 }]);
  const restored = createCombatHitstop3D();
  restored.restore(restored.validate(JSON.parse(JSON.stringify(saved))));
  expect(restored.capture()).toEqual(saved);
  expect(() => restored.validate({ ...saved, directions: [{ x: 2, y: 0, z: 0 }] })).toThrow();
});

test('a completed short jump survives saved hitstop and fresh movement without replaying old attacks', () => {
  const pause = createCombatHitstop3D();
  pause.restore({ remaining: 3, buffered: [], previous: [] });
  pause.begin(new Set(['a:jump', 'move-up', 'a:jab']));
  pause.begin(new Set(['move-up']));
  pause.begin(new Set(['move-up']));
  const restored = createCombatHitstop3D();
  restored.restore(restored.validate(JSON.parse(JSON.stringify(pause.capture()))));
  expect(restored.begin(new Set(['move-right']))).toBe(false);
  expect([...restored.resume(new Set(['move-right']))]).toEqual(['move-right', 'a:jump-release', 'a:jump-release/move-up']);
  expect([...restored.resume(new Set(['move-right']))]).toEqual(['move-right']);
  expect(() => restored.validate({ ...pause.capture(), jumpPresses: [{ action: 'a:jump', frames: 17 }] })).toThrow();
  expect(() => restored.validate({ ...pause.capture(), jumpTaps: ['a:jab'] })).toThrow();
});

test('preheld Cross and a full fifteen-tick hold are not converted into short jumps', () => {
  for (const preheld of [true, false]) {
    const pause = createCombatHitstop3D();
    pause.restore({ remaining: 16, buffered: [], previous: preheld ? ['a:jump'] : [] });
    for (let tick = 0; tick < 15; tick++) pause.begin(new Set(['a:jump', 'move-up']));
    pause.begin(new Set(['move-up']));
    pause.begin(new Set(['move-right']));
    expect([...pause.resume(new Set(['move-right']))]).toEqual(['move-right']);
  }
});

test('a lethal hit pauses nineteen ticks but corpse contacts do not replay knockout emphasis', () => {
  const state = createCombatSimulation({ fighters: [{ id: 'b', position: { x: 0, y: 0, z: 0 } }] }).capture();
  state.fighters[0]!.health = 0;
  const event: CombatEvent = { id: 'ko', frame: 0, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 5, impulse: { x: 0, y: 0, z: 0 } };
  const pause = createCombatHitstop3D();pause.contact([event], state);
  expect(pause.capture().remaining).toBe(19);
  pause.reset();pause.contact([{ ...event, damage: 0 }], state);
  expect(pause.capture().remaining).toBe(4);
});

test('fresh live input supersedes frozen samples instead of inheriting their latency', () => {
  const pause = createCombatHitstop3D();
  pause.contact([{ id: 'hit', frame: 0, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', damage: 8, impulse: { x: 0, y: 0, z: 0 } }]);
  for (const actions of [['a:jab'], [], [], ['a:heavy']]) expect(pause.begin(new Set(actions))).toBe(true);
  const live = new Set(['a:guard']);
  expect(pause.begin(live)).toBe(false);
  expect([...pause.resume(live)]).toEqual(['a:guard']);
  expect(pause.capture().buffered).toEqual([]);
});

async function fixture(options: { staminaRegen?: number; cameraPosition?: number[]; obstacle?: boolean } = {}) {
  const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const entity = (id: string, x: number) => ({ id, meshId: 'mesh', materialId: 'material', position: [x, 1, 0], scale: [.6, 1.6, .6], rotationY: 0,
    physics: { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: true } });
  const project = { activeSceneId: "logic", scenes: [{ id: "logic", entities: [] }], extensions: { hyperfocusCombat: { version: 1, config: { ...createTouchOfDeathPreset(), ...(options.staminaRegen === undefined ? {} : { staminaRegen: options.staminaRegen }) },
    movement: { speed: 6, jumpSpeed: 9, dashSpeed: 18, dashFrames: 10, dashRecoveryFrames: 16 },
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] },
    hyperfocus3D: { version: 1, activeSceneId: 'arena', budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
      meshes: [{ id: 'mesh', assetId: 'gltf', primitive: 0, buffers: [{ uri: 'mesh.bin', assetId: 'bin' }] }], textures: [],
      materials: [{ id: 'material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true }],
      scenes: [{ id: 'arena', camera: { position: options.cameraPosition ?? [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, lights: [],
        entities: [entity('a', 0), entity('b', 1.4), ...(options.obstacle ? [{ id: 'obstacle', meshId: 'mesh', materialId: 'material', position: [-1.2, 4, 0], scale: [.5, 4, 20], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] : []), { id: 'floor', meshId: 'mesh', materialId: 'material', position: [0, -.25, 0], scale: [100, .5, 100], rotationY: 0,
          physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] }],
      audio: { policy: 'gesture-unlock', cues: [] }, save: { restoreOnBoot: true, slot: 'auto', maxBytes: 65536 } } } };
  const assets = [{ id: 'gltf', mimeType: 'model/gltf+json', bytes: new TextEncoder().encode(JSON.stringify(gltf)) },
    { id: 'bin', mimeType: 'application/octet-stream', bytes: new Uint8Array(positions.buffer) }];
  const runtime = await createHyperfocus3DRuntime(project, assets);
  const game = createGameplay3D({ project, runtime });
  for (let i = 0; i < 30; i++) game.step();
  return { game, runtime };
}

test('contact pauses combat and world together, buffers released input, and restores the pause', async () => {
  const { game, runtime } = await fixture();
  game.step(['a:heavy']);
  for (let i = 0; i < 60 && game.snapshot().combat!.state.fighters[1]!.health === 100; i++) game.step();
  const contact = game.snapshot();
  expect(contact.combat!.hitstop.remaining).toBe(14);
  expect(runtime.physics.body('b')!.velocityY).toBeGreaterThan(8);
  game.step(['a:evade', 'move-left']);
  game.step();
  const saved = game.snapshot();
  expect(saved.tick).toBe(contact.tick);
  expect(saved.entities).toEqual(contact.entities);
  expect(saved.combat!.state).toEqual(contact.combat!.state);
  expect(saved.combat!.hitstop.buffered).toEqual([['a:evade', 'move-left'], []]);
  function resume() {
    for (let i = 0; i < saved.combat!.hitstop.remaining; i++) game.step();
    expect(game.snapshot().combat!.state.frame).toBe(contact.combat!.state.frame);
    game.step();
    expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('heavy');
    return game.snapshot();
  }
  const expected = resume();
  game.restore(JSON.parse(JSON.stringify(saved)));
  const actual = resume();
  expect(actual.combat).toEqual(expected.combat);
  expect(actual.entities).toEqual(expected.entities);
  // Portable saves restore velocities; full solver warm-start rollback uses checkpoints.
  for (let i = 0; i < actual.gameplay!.velocities.length; i++) for (let axis = 0; axis < 3; axis++) {
    expect(actual.gameplay!.velocities[i]!.value[axis]!).toBeCloseTo(expected.gameplay!.velocities[i]!.value[axis]!, 2);
  }
  expect(actual.tick).toBe(contact.tick + 1);
  game.reset();
  expect(game.snapshot().combat!.hitstop.remaining).toBe(0);
  expect(game.snapshot().combat!.hitstop.buffered).toEqual([]);
});

test('contact weight changes freeze duration and saved input queues are validated', () => {
  const pause = createCombatHitstop3D();
  for (const [kind, damage, expected] of [['block', 0, 4], ['hit', 8, 4], ['hit', 24, 14], ['parry', 0, 17], ['guard-break', 0, 17], ['bounce', 0, 0]] as const) {
    pause.reset();
    const event: CombatEvent = { id: 'contact', frame: 0, attackerId: 'a', targetId: 'b', moveId: 'jab', kind, damage, impulse: { x: 0, y: 0, z: 0 } };
    pause.contact([event]);
    for (let i = 0; i < expected; i++) expect(pause.begin(new Set())).toBe(true);
    expect(pause.begin(new Set())).toBe(false);
  }
  expect(() => pause.validate({ remaining: 20, buffered: [], previous: [] })).toThrow();
  expect(pause.validate({ remaining: 19, buffered: [], previous: [] }).remaining).toBe(19);
  expect(() => pause.validate({ remaining: 3, buffered: [[42]], previous: [] })).toThrow();
  expect(() => pause.validate({ remaining: 3, buffered: [], previous: [42] })).toThrow();
});

test('counter hits have fourteen ticks of emphasis even for light attacks', () => {
  for (const [damage, expected] of [[8, 14], [24, 14]] as const) {
    const pause = createCombatHitstop3D();
    pause.contact([{ id: 'counter', frame: 0, attackerId: 'a', targetId: 'b', moveId: 'jab', kind: 'hit', counter: true, damage, impulse: { x: 0, y: 0, z: 0 } }]);
    for (let tick = 0; tick < expected; tick++) expect(pause.begin(new Set())).toBe(true);
    expect(pause.begin(new Set())).toBe(false);
  }
});



test('held shield on resume supersedes earlier frozen offense without waiting behind its input queue', () => {
  const pause=createCombatHitstop3D();
  pause.contact([{id:'impact',frame:0,attackerId:'a',targetId:'b',moveId:'jab',kind:'hit',damage:8,impulse:{x:0,y:0,z:0}}]);
  for(const sample of [['b:jab'],[],[],['b:guard']])expect(pause.begin(new Set(sample))).toBe(true);
  const live=new Set(['b:guard']);expect(pause.begin(live)).toBe(false);
  expect([...pause.resume(live)]).toEqual(['b:guard']);
});


test('shield prioritization preserves subsequent release and repress edges and the other fighter input', () => {
  const pause=createCombatHitstop3D();
  pause.contact([{id:'impact',frame:0,attackerId:'a',targetId:'b',moveId:'heavy',kind:'hit',damage:24,impulse:{x:0,y:0,z:0}}]);
  const samples=[['b:jab','a:heavy'],['b:guard'],[],['b:guard']];
  for(let i=0, remaining=pause.capture().remaining;i<remaining;i++)pause.begin(new Set(samples[Math.min(i,3)]));
  const live=new Set(['b:guard']);const restored=createCombatHitstop3D();restored.restore(restored.validate(pause.capture()));
  for(const controller of [pause,restored]) {
    controller.begin(live);expect([...controller.resume(live)]).toEqual(['a:heavy','b:guard']);
    controller.begin(live);expect([...controller.resume(live)]).toEqual(['b:guard']);
    controller.begin(live);expect([...controller.resume(live)]).toEqual([]);
    controller.begin(live);expect([...controller.resume(live)]).toEqual(['b:guard']);
  }
});
