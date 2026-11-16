import { expect, test } from 'bun:test';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../../runtime-3d.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';

async function fixture(corridor = false) {
  const source = await combatMotionFixture({ match: true }), project = source.project, scene = project.extensions.hyperfocus3D.scenes[0]!;
  const combat = project.extensions.hyperfocusCombat;
  scene.entities.find(entity => entity.id === 'b')!.position[0] = 12;
  scene.entities.push({ id: 'fire', meshId: 'mesh', materialId: 'material', position: [6, .5, 0], scale: [1.2, .5, corridor ? 3 : 1.2], rotationY: 0 });
  if (corridor) for (const z of [-3, 3]) scene.entities.push({ ...scene.entities.find(entity => entity.id === 'floor')!, id: `wall:${z}`, position: [6, 2, z], scale: [20, 2, .2] });
  project.extensions.hyperfocus3D.budgets.entities = 12;
  combat.environment = { surfaces: [], hazards: [{ entityId: 'fire', kind: 'fire', damage: 2, intervalFrames: 30 }] };
  const runtime = await createHyperfocus3DRuntime(project, source.assets), game = createGameplay3D({ project, runtime });
  game.step(['match:practice']);for (let i = 0; i < 30; i++) game.step([]);
  const saved = game.snapshot();saved.combat!.match = { ...saved.combat!.match!, phase: 'fighting', ticks: 0, held: [] };game.restore(saved);
  return { game, runtime };
}

test('AI9 takes a dry visible-fire route and reaches the opponent; checkpoint replans exactly', async () => {
  const { game, runtime } = await fixture();let lateral = 0;
  for (let i = 0; i < 40; i++) { game.step([]);lateral = Math.max(lateral, Math.abs(runtime.physics.body('b')!.z)); }
  const checkpoint = game.checkpoint();
  for (let i = 0; i < 100; i++) { game.step([]);lateral = Math.max(lateral, Math.abs(runtime.physics.body('b')!.z)); }
  const after = game.snapshot();expect(lateral).toBeGreaterThan(1.8);expect(runtime.physics.body('b')!.x).toBeLessThan(4);
  expect(after.combat!.environment!.hazards!.trace.some(event => event.fighterId === 'b' && event.kind === 'damage')).toBe(false);
  checkpoint.restore();for (let i = 0; i < 100; i++) game.step([]);expect(game.snapshot()).toEqual(after);
});

test('AI9 accepts a necessary fire crossing through a narrow corridor rather than stalling', async () => {
  const { game, runtime } = await fixture(true);
  for (let i = 0; i < 180; i++) game.step([]);
  const state = game.snapshot().combat!;
  expect(runtime.physics.body('b')!.x).toBeLessThan(4);
  expect(state.environment!.hazards!.trace.some(event => event.fighterId === 'b' && event.kind === 'damage')).toBe(true);
  expect(state.state.fighters[0]!.health).toBeLessThan(100);
});
