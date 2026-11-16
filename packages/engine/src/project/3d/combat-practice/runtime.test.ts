import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';

async function fixture(options: { staminaRegen?: number; cameraPosition?: number[]; obstacle?: boolean; hurtRadius?: number; gravityScale?: number; rotated?: boolean } = {}) {
  const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const entity = (id: string, x: number) => ({ id, meshId: 'mesh', materialId: 'material', position: options.rotated ? [0, 1, -x] : [x, 1, 0], scale: [.6, 1.6, .6], rotationY: 0,
    physics: { type: 'dynamic', shape: 'box', gravityScale: options.gravityScale ?? 1, continuous: true } });
  const project = { activeSceneId: "logic", scenes: [{ id: "logic", entities: [] }], extensions: { hyperfocusCombat: { version: 1, match: { difficulty: 9 }, config: { ...createTouchOfDeathPreset(), ...(options.staminaRegen === undefined ? {} : { staminaRegen: options.staminaRegen }), ...(options.hurtRadius === undefined ? {} : { hurtRadius: options.hurtRadius }) },
    movement: { speed: 6, jumpSpeed: 9, dashSpeed: 18, dashFrames: 10, dashRecoveryFrames: 16 },
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] },
    hyperfocus3D: { version: 1, activeSceneId: 'arena', budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
      meshes: [{ id: 'mesh', assetId: 'gltf', primitive: 0, buffers: [{ uri: 'mesh.bin', assetId: 'bin' }] }], textures: [],
      materials: [{ id: 'material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true }],
      scenes: [{ id: 'arena', camera: { position: options.cameraPosition ?? (options.rotated ? [7, 4, 0] : [0, 4, 7]), target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, lights: [],
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

test('defensive drills launch through ordinary inputs, accept player parry and repeat without score', async () => {
  const { game } = await fixture();game.step(['match:practice']);game.step(['practice:tech-drill']);
  let launched = false, reset = false, previous = 0;
  for (let frame = 0; frame < 360; frame++) {
    game.step();const state = game.snapshot().combat!.state;
    launched ||= state.fighters[0]!.health < 100 && state.fighters[0]!.stunKind === 'hit' && state.fighters[0]!.position.y > 1.5;
    reset ||= state.frame < previous;previous = state.frame;
  }
  expect(launched).toBe(true);expect(reset).toBe(true);
  expect(game.snapshot().combat!.match!.playerWins).toBe(0);
  game.step(['practice:parry-drill']);
  let parried = false;
  for (let frame = 0; frame < 150; frame++) {
    const opponent = game.snapshot().combat!.state.fighters[1]!;
    game.step(opponent.moveId === 'heavy' && opponent.moveFrame >= 27 && opponent.moveFrame <= 30 ? ['a:guard'] : []);
    parried ||= game.snapshot().combat!.state.fighters[0]!.followupFrames > 0;
  }
  expect(parried).toBe(true);expect(game.snapshot().combat!.state.fighters[0]!.health).toBe(100);
});

test('new free practice clears the previous lesson while reset and restore preserve the current setup', async () => {
  const { game } = await fixture();game.step(['match:practice']);game.step(['practice:combo-lesson']);
  const saved = game.snapshot();game.step(['practice:reset']);expect(game.snapshot().combat!.practice.preset).toBe('combo-lesson');
  game.step(['match:menu']);game.step(['match:practice']);expect(game.snapshot().combat!.practice.preset).toBe('neutral');
  game.restore(saved);expect(game.snapshot().combat!.practice.preset).toBe('combo-lesson');
  game.step(['match:quit']);game.step(['match:practice']);expect(game.snapshot().combat!.practice.preset).toBe('neutral');
});

test('drills respect authored fighter radius instead of pushing forever outside attack threshold', async () => {
  const { game } = await fixture({ hurtRadius: 1 });game.step(['match:practice']);game.step(['practice:parry-drill']);
  let connected = false;
  for (let frame = 0; frame < 200; frame++) { game.step();connected ||= game.snapshot().combat!.state.fighters[0]!.health < 100; }
  expect(connected).toBe(true);expect(game.snapshot().combat!.state.fighters[1]!.attackSerial).toBe(1);
});

test('player DI drill uses an ordinary launcher, preserves analog strength and saves its preset', async () => {
  const { game } = await fixture();game.step(['match:practice']);game.step(['practice:di-drill']);
  let contact = false;
  for (let frame = 0; frame < 180; frame++) {
    game.step();
    if (game.snapshot().combat!.influence.some(row => row.id === 'a')) { contact = true;break; }
  }
  expect(contact).toBe(true);
  const before = game.snapshot();
  game.step([], undefined, { x: 0, y: 0, z: .2 });
  const partial = game.snapshot().combat!.influence.find(row => row.id === 'a')!;
  expect(partial.direction.z).toBe(.2);
  game.step([], undefined, { x: 0, y: 0, z: 1 });
  const full = game.snapshot().combat!.influence.find(row => row.id === 'a')!;
  expect(Math.abs(full.applied.z)).toBeGreaterThan(Math.abs(partial.applied.z));
  game.restore(before);
  expect(game.snapshot().combat!.practice.preset).toBe('di-drill');
  expect(game.snapshot().combat!.match!.playerWins).toBe(0);
});

test('practice enters immediately, replaces level nine input policy, saves presets and resets a KO', async () => {
  const { game } = await fixture();
  game.step(['match:practice']);
  expect(game.snapshot().combat!.match!.phase).toBe('practice');
  for (let frame = 0; frame < 120; frame++) game.step();
  expect(game.snapshot().combat!.state.fighters.every(fighter => fighter.health === 100 && fighter.attackSerial === 0)).toBe(true);
  game.step(['practice:sideways']);
  const saved = game.snapshot();
  expect(saved.combat!.practice).toEqual({ preset: 'sideways' });
  game.step(['practice:escape']);
  game.restore(saved);
  expect(game.snapshot().combat!.practice).toEqual({ preset: 'sideways' });
  const dead = game.snapshot(); dead.combat!.state.fighters[1]!.health = 0;
  game.restore(dead);
  for (let frame = 0; frame < 200; frame++) game.step();
  expect(game.snapshot().combat!.match!.phase).toBe('practice');
  expect(game.snapshot().combat!.knockout).toHaveLength(1);
  game.step(['practice:reset']);
  const reset = game.snapshot().combat!;
  expect(reset.knockout).toEqual([]);
  expect(reset.state.fighters.every(fighter => fighter.health === 100 && fighter.stamina === 100 && fighter.escapeCharges === 1)).toBe(true);
  expect(reset.practice).toEqual({ preset: 'sideways' });
  expect(reset.match!.playerWins + reset.match!.opponentWins).toBe(0);
  game.step(['match:menu']);
  expect(game.snapshot().combat!.match!.phase).toBe('menu');
});

test('legacy snapshots default the optional practice preset; invalid presets reject atomically', async () => {
  const { game } = await fixture();
  const legacy = game.snapshot(); Reflect.deleteProperty(legacy.combat!, 'practice');
  game.restore(legacy);
  expect(game.snapshot().combat!.practice).toEqual({ preset: 'neutral' });
  const invalid = game.snapshot(); Reflect.set(invalid.combat!, 'practice', { preset: 'cheat' });
  const before = game.snapshot();
  expect(() => game.restore(invalid)).toThrow('practice');
  expect(game.snapshot()).toEqual(before);
});

test('the player reset binding resets practice on its fresh edge and never resets matches', async () => {
  const { game } = await fixture();
  game.step(['match:practice']); game.step(['practice:outward']);
  const damaged = game.snapshot(); damaged.combat!.state.fighters[0]!.health = 30;
  game.restore(damaged);
  game.step(['a:reset']);
  expect(game.snapshot().combat!.state.fighters[0]!.health).toBe(100);
  expect(game.snapshot().combat!.practice).toEqual({ preset: 'outward' });
  const first = game.snapshot().combat!.state.frame;
  game.step(['a:reset']);
  expect(game.snapshot().combat!.state.frame).toBe(first + 1);
  game.step(); game.step(['a:reset']);
  expect(game.snapshot().combat!.state.frame).toBe(first);
  game.step(['match:menu']); game.step(['match:start']); game.step(); game.step(['match:start']);
  for (let frame = 0; frame < 180; frame++) game.step();
  const fighting = game.snapshot(); fighting.combat!.state.fighters[0]!.health = 30;
  game.restore(fighting); game.step(['a:reset']);
  expect(game.snapshot().combat!.match!.phase).toBe('fighting');
  expect(game.snapshot().combat!.state.fighters[0]!.health).toBe(30);
});





test('loss shortcut without recorded cause enters free Practice and combo lesson observes actual launcher/reset', async () => {
  const { game } = await fixture();
  const lost = game.snapshot();lost.combat!.match = { ...lost.combat!.match!, phase: 'match-result', ticks: 0, playerWins: 0, opponentWins: 3, winner: 'opponent', held: [] };
  game.restore(lost);game.step(['match:learn-defense']);
  expect(game.snapshot().combat!.exchange).toEqual([]);
  expect(game.snapshot().combat!.practice.preset).toBe('neutral');
  expect(game.snapshot().combat!.match!.phase).toBe('practice');
  game.step(['practice:combo-lesson']);for (let i = 0; i < 8; i++) game.step();game.step(['a:heavy']);
  for (let i = 0; i < 45; i++) game.step();
  expect(game.snapshot().combat!.practice.lesson?.stage).toBe(1);
  const saved = game.snapshot();game.step(['practice:reset']);
  expect(game.snapshot().combat!.practice.lesson?.stage).toBe(0);
  game.restore(saved);expect(game.snapshot().combat!.practice.lesson?.stage).toBe(1);
  const bad = game.snapshot();bad.combat!.practice.lesson!.stage = 99;
  expect(() => game.restore(bad)).toThrow('lesson');expect(game.snapshot()).toEqual(saved);
  for (let i = 0; i < 150; i++) game.step();
  expect(game.snapshot().combat!.practice.lesson).toMatchObject({ stage: 0, retry: true });
  expect(game.presentation?.hint).toContain('Combo dropped');
  game.step(['practice:reset']);expect(game.snapshot().combat!.practice.lesson).toMatchObject({ stage: 0, retry: false });
});

test('combo lesson completes with ordinary launch, chase and aimed string inputs', async () => {
  const { game } = await fixture();game.step(['match:practice']);game.step(['practice:combo-lesson']);for (let i = 0; i < 8; i++) game.step();
  // Fix the defense seed for this upward route; live late DI now changes the
  // default seed's launch during hitstop, so a fixed right-only chase misses it.
  const saved = game.snapshot();saved.combat!.practice.random!.seed = 7;game.restore(saved);
  const start = game.snapshot().combat!.state.frame;
  let completed = false;
  for (let wall = 0; wall < 300; wall++) {
    const frame = game.snapshot().combat!.state.frame - start;
    // Chase after confirmed recovery and keep aiming/moving toward the body.
    // The second fresh Strike buffers through the first attack's active phase.
    const actions = frame >= 44 ? ['move-right'] : [];
    if (frame === 0) actions.push('a:heavy');
    if (frame === 44) actions.push('a:dash');
    if (frame === 48 || frame === 56) actions.push('a:jab');
    game.step(actions);
    completed ||= game.snapshot().combat!.practice.lesson?.stage === 3;
    if (frame >= 120) break;
  }
  expect(completed).toBe(true);
  const learned = game.snapshot().combat!.practice.lesson!.learned;const seed = game.snapshot().combat!.practice.random!.seed;
  game.step(['practice:reset']);expect(game.snapshot().combat!.practice.lesson).toMatchObject({ stage: 0, learned });
  expect(game.snapshot().combat!.practice.random!.seed).not.toBe(seed);
});

test('tech drill uses physical launcher contact and floor impact for timing, protection and directional recovery', async () => {
  // Match the shipped fighter gravity: the old gravity-one fixture outlasts
  // launcher hitstun before landing and cannot demonstrate a legal floor tech.
  const start = async () => {
    const result = await fixture({ gravityScale: 1.9 });
    result.game.step(['match:practice']);result.game.step(['practice:tech-drill']);
    return result;
  };
  const baseline = await start();
  let collisionFrame = -1, peak = 0;
  for (let wall = 0; wall < 250; wall++) {
    baseline.game.step();const combat = baseline.game.snapshot().combat!;
    peak = Math.max(peak, combat.state.fighters[0]!.position.y);
    collisionFrame = combat.defenseFeedback[0]!.bounceAt;
    if (collisionFrame >= 0) break;
  }
  expect(collisionFrame).toBeGreaterThan(0);
  expect(peak).toBeGreaterThan(3);
  const missed = baseline.game.snapshot().combat!;
  expect(missed.state.fighters[0]).toMatchObject({ health: 76, stunKind: 'hit', protectionFrames: 0, attackSerial: 0 });
  expect(missed.state.fighters[1]!.attackSerial).toBe(1);
  expect(missed.defenseFeedback[0]!.bounceNormal).toEqual({ x: 0, y: 1, z: 0 });

  for (const attempt of [
    { offset: -6, action: 'a:tech', timing: 'early' },
    { offset: -5, action: 'a:tech', timing: 'success' },
    { offset: 0, action: 'a:jump', timing: 'success' },
    { offset: 1, action: 'a:tech', timing: 'late' },
  ] as const) {
    const { game, runtime } = await start();
    const pressFrame = collisionFrame + attempt.offset;
    const endFrame = Math.max(collisionFrame, pressFrame);
    let frozenTicks = 0;
    for (let wall = 0; wall < 250; wall++) {
      const frame = game.snapshot().combat!.state.frame;
      game.step(frame === pressFrame ? [attempt.action, 'move-up'] : []);
      const after = game.snapshot().combat!.state.frame;
      if (after === frame) frozenTicks++;
      if (after > endFrame) break;
    }
    const combat = game.snapshot().combat!, fighter = combat.state.fighters[0]!;
    expect(frozenTicks).toBeGreaterThan(0);
    expect(fighter.health).toBe(76);
    expect(combat.defenseFeedback[0]!.lastAttempt).toMatchObject({ kind: 'tech', inputFrame: pressFrame, impactFrame: collisionFrame, timing: attempt.timing });
    expect(combat.defenseFeedback[0]!.cue?.contactNormal).toEqual({ x: 0, y: 1, z: 0 });
    if (attempt.timing === 'success') {
      expect(fighter.stunFrames).toBe(0);
      expect(fighter.protectionFrames).toBe(createTouchOfDeathPreset().techProtectionFrames!);
      expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeGreaterThan(1);
    } else {
      expect(fighter.stunKind).toBe('hit');
      expect(fighter.protectionFrames).toBe(0);
    }
  }
});

test('holding guard through a drill Heavy visibly costs health and guard without granting a fresh parry', async () => {
  const { game } = await fixture({ gravityScale: 1.9 });
  game.step(['match:practice']);game.step(['practice:parry-drill']);
  for (let wall = 0; wall < 150; wall++) {
    game.step(['a:guard']);
    if (game.snapshot().combat!.state.fighters[0]!.health < 100) break;
  }
  const combat = game.snapshot().combat!, fighter = combat.state.fighters[0]!;
  expect(fighter.health).toBeCloseTo(100 - 24 * createTouchOfDeathPreset().chipRatio!);
  expect(fighter).toMatchObject({ guardMeter: 62, stunKind: 'block', followupFrames: 0, guarding: true });
  expect(combat.state.fighters[1]!.attackSerial).toBe(1);
});

test('rotating the arena does not turn an open-air conversion into a sideways lesson', async () => {
  const branches: string[] = [];
  for (const rotated of [false, true]) {
    const { game } = await fixture({ rotated });
    game.step(['match:practice']);game.step(['practice:combo-lesson']);
    for (let i = 0; i < 8; i++) game.step();
    const saved = game.snapshot();saved.combat!.practice.random!.seed = 7;game.restore(saved);
    const start = game.snapshot().combat!.state.frame;
    for (let wall = 0; wall < 220; wall++) {
      const frame = game.snapshot().combat!.state.frame - start;
      const actions = frame >= 44 ? ['move-right'] : [];
      if (frame === 0) actions.push('a:heavy');
      if (frame === 44) actions.push('a:dash');
      if (frame === 48) actions.push('a:jab');
      game.step(actions);
      const combat = game.snapshot().combat!;
      if (combat.practice.lesson?.stage === 2) {
        expect(combat.state.fighters[1]!.health).toBeLessThan(76);
        branches.push(combat.practice.lesson.branch);break;
      }
    }
  }
  expect(branches).toEqual(['upward', 'upward']);
});
