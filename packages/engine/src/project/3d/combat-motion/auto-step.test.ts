import { expect, test } from 'bun:test';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

async function stairs(options: { blocked?: boolean; tall?: boolean; enabled?: boolean; second?: boolean; short?: boolean } = {}) {
  const base = await combatMotionFixture({ independentCombatInputs: true, movement: { separateJump: true, autoStepHeight: options.enabled === false ? 0 : 1.05, autoStepSpeedScale: .85 } });
  const scene = base.project.extensions.hyperfocus3D.scenes[0]!;scene.entities[options.second ? 0 : 1]!.position = [20, 1, 20];scene.entities[options.second ? 1 : 0]!.position = [0, 1, 0];
  for (let i = 0; i < 4; i++) scene.entities.push({ id: `step${i}`, meshId: 'mesh', materialId: 'material', position: [3 + i * (options.short ? 1 : 2), (i + 1) / (options.short ? 4 : 2), 0], scale: [options.short ? .5 : 1, (i + 1) / (options.short ? 4 : 2), 3], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } });
  if (options.tall) scene.entities[3]!.scale[1] = 4;
  if (options.blocked) scene.entities.push({ id: 'ceiling', meshId: 'mesh', materialId: 'material', position: [3, 3.5, 0], scale: [2, .25, 3], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } });
  base.project.extensions.hyperfocus3D.budgets.entities = 12;
  const runtime = await createHyperfocus3DRuntime(base.project, base.assets), game = createGameplay3D({ project: base.project, runtime, independentCombatInputs: true });
  const step = (x = 0, actions: string[] = []) => { const input = { actions: new Set(actions), direction: { x, y: 0, z: 0 } }, idle = { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } };return game.step([], options.second ? [idle, input] : [input, idle]); };
  for (let i = 0; i < 30; i++) step();
  return { runtime, game, step };
}

test('ordinary movement climbs successive city-sized risers with bounded slowdown and deterministic checkpoints', async () => {
  const f = await stairs();let slowed = false;
  for (let i = 0; i < 85; i++) { f.step(1);const body = f.runtime.physics.body('a')!;if (f.game.snapshot().combat!.motion[0]!.stepSlowFrames) { slowed = true;expect(body.velocityX).toBeLessThan(6); } }
  expect(slowed).toBe(true);expect(f.runtime.physics.body('a')!.x).toBeGreaterThan(6);expect(f.runtime.physics.body('a')!.y).toBeGreaterThan(4);
  const checkpoint = f.game.checkpoint();for (let i = 0; i < 20; i++) f.step(1);const expected = f.game.snapshot();checkpoint.restore();for (let i = 0; i < 20; i++) f.step(1);expect(f.game.snapshot()).toEqual(expected);
});

test('auto-step refuses tall walls, insufficient headroom and disabled projects', async () => {
  for (const option of [{ tall: true }, { blocked: true }, { enabled: false }]) {
    const f = await stairs(option);for (let i = 0; i < 90; i++) f.step(1);
    expect(f.runtime.physics.body('a')!.x).toBeLessThan(2);expect(f.runtime.physics.body('a')!.y).toBeLessThan(2);
  }
});


test('second fighter control uses identical stair eligibility and movement', async () => {
  const first = await stairs(), second = await stairs({ second: true });
  for (let i = 0; i < 80; i++) { first.step(1);second.step(1); }
  const a = first.runtime.physics.body('a')!, b = second.runtime.physics.body('b')!;
  expect([a.x, a.y, a.z, a.velocityX]).toEqual([b.x, b.y, b.z, b.velocityX]);
});

test('short half-metre risers do not trap spheres on an upward corner contact', async () => {
  for (const second of [false, true]) {
    const f = await stairs({ short: true, second }), id = second ? 'b' : 'a';let peak = 0;
    for (let tick = 0; tick < 90; tick++) { f.step(1);peak = Math.max(peak, f.runtime.physics.body(id)!.y); }
    expect(peak).toBeGreaterThan(2.8);expect(f.runtime.physics.body(id)!.x).toBeGreaterThan(6);
  }
});
