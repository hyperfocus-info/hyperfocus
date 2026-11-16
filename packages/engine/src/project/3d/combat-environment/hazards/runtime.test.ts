import { presentCombatHazards } from './presentation.ts';
import { expect, test } from 'bun:test';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../../runtime-3d.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { sample3DFrame } from '../../../../frame/3d.ts';

async function fixture(kind: 'fire' | 'flood', match = false) {
  const source = await combatMotionFixture({ match }), project = source.project, scene = project.extensions.hyperfocus3D.scenes[0]!;
  scene.entities.push({ id: 'zone', meshId: 'mesh', materialId: 'material', position: [0, .6, 0], scale: [8, .5, 8], rotationY: 0 });
  scene.entities.find(entity => entity.id === 'b')!.position[0] = 40;
  const definition = project.extensions.hyperfocusCombat;
  definition.environment = { surfaces: [], hazards: [kind === 'fire' ? { entityId: 'zone', kind, damage: 2, intervalFrames: 30 } : { entityId: 'zone', kind, groundSpeedScale: .65 }] };
  const runtime = await createHyperfocus3DRuntime(project, source.assets), game = createGameplay3D({ project, runtime, independentCombatInputs: true });
  const neutral = () => [0, 1].map(() => ({ actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } }));
  const step = () => game.step([], neutral());
  if (match) game.step(['match:practice'], neutral());
  return { runtime, game, step, neutral, definition };
}

test('live fire has no hitstop/DI/false punch effect and its save/checkpoint next tick is exact', async () => {
  const { game, runtime, step, definition } = await fixture('fire');
  for (let frame = 0; frame < 34; frame++) step();
  const saved = game.snapshot(), state = saved.combat!;
  expect(state.state.frame).toBe(34);expect(state.state.fighters[0]!.health).toBe(96);
  expect(state.state.fighters[0]!.stunFrames).toBe(0);expect(state.exchange.at(-1)!.reason).toBe('fire-exposure');
  const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: saved.tick, ticksPerSecond: 60 }, viewport: { width: 800, height: 600 } });
  game.presentFrame(frame);expect(frame.effects.some(effect => effect.id === 'hazard:zone')).toBe(true);
  const visuals = { frame, definition: definition.environment!, entities: runtime.declaration.scenes[0]!.entities, phases: new Map<string, string>(), state: state.environment!.hazards, effectCapacity: 5 };
  presentCombatHazards(visuals);presentCombatHazards(visuals);expect(frame.effects.filter(effect => effect.id === 'hazard:zone')).toHaveLength(1);expect(frame.effects.find(effect => effect.id === 'hazard:zone')!.particles).toHaveLength(5);
  const checkpoint = game.checkpoint();for (let i = 0; i < 35; i++) step();const expected = game.snapshot();
  checkpoint.restore();for (let i = 0; i < 35; i++) step();expect(game.snapshot()).toEqual(expected);
  game.restore(JSON.parse(JSON.stringify(saved)));for (let i = 0; i < 35; i++) step();expect(game.snapshot().combat!.environment).toEqual(expected.combat!.environment);
  expect(game.snapshot().combat!.state.fighters[0]!.health).toBe(expected.combat!.state.fighters[0]!.health);
});

test('flood slows voluntary grounded travel and checkpoint replay, jumping escapes the drag', async () => {
  const { runtime, game, step, neutral } = await fixture('flood');
  for (let i = 0; i < 45; i++) step();
  const input = neutral();input[0]!.direction = { x: 1, y: 0, z: 0 };
  game.step([], input);expect(runtime.physics.body('a')!.velocityX).toBeGreaterThan(3.7);expect(runtime.physics.body('a')!.velocityX).toBeLessThan(4);
  const checkpoint = game.checkpoint();game.step([], input);const expected = game.snapshot();
  checkpoint.restore();game.step([], input);expect(game.snapshot()).toEqual(expected);
  const position = runtime.physics.body('a')!;runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [position.x, 5, 0] }] });runtime.physics.setVelocity('a', 6, 0, 0);
  game.step([], input);expect(runtime.physics.body('a')!.velocityX).toBeGreaterThan(5.7);
});

test('fire KO resolves a real round, freezes damage in result, and recovery preserves arena and refills resources', async () => {
  const { game, step, neutral } = await fixture('fire', true);
  const saved = game.snapshot();saved.combat!.state.fighters[0]!.health = 2;
  saved.combat!.match = { ...saved.combat!.match!, phase: 'fighting', ticks: 0, held: [] };game.restore(saved);
  for (let i = 0; i < 35 && game.snapshot().combat!.match!.phase === 'fighting'; i++) step();
  const lost = game.snapshot();
  expect(lost.combat!.state.fighters[0]!.health).toBe(0);expect(lost.combat!.match!.phase).toBe('round-result');
  expect(lost.combat!.exchange.find(entry => entry.decisive)!.reason).toBe('fire-exposure');
  const contact = structuredClone(lost.combat!.environment!.hazards);
  for (let i = 0; i < 20; i++) step();expect(game.snapshot().combat!.environment!.hazards).toEqual(contact);
  const recovering = game.snapshot();recovering.combat!.match!.ticks = 2;game.restore(recovering);step();step();
  expect(game.snapshot().combat!.match!.phase).toBe('fighting');expect(game.snapshot().combat!.state.fighters.map(fighter => fighter.health)).toEqual([100, 100]);
  expect(game.snapshot().combat!.environment!.hazards!.contacts).toEqual(contact!.contacts);expect(game.snapshot().combat!.environment!.hazards!.trace).toEqual(contact!.trace);
  game.step(['match:quit'], neutral());const menu = game.snapshot();for (let i = 0; i < 20; i++) step();
  expect(game.snapshot().combat!.environment!.hazards).toEqual(menu.combat!.environment!.hazards);
});
