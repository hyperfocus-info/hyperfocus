import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../../runtime-3d.ts';

async function fixture(kit: 'ground' | 'spray') {
  const base = await combatMotionFixture({ independentCombatInputs: true, movement: { separateJump: true } });
  const config = base.project.extensions.hyperfocusCombat.config;
  for (const [id, source] of [['tool-light', 'jab'], ['tool-heavy', 'heavy']] as const) {
    const move = config.moves.find(move => move.id === source)!;
    config.moves.push({ ...structuredClone(move), id, command: [id], damage: kit === 'ground' ? 0 : 1, hitstunFrames: kit === 'ground' ? 0 : 5, impulse: 0, verticalImpulse: 0,
      startupFrames: 2, activeFrames: 2, recoveryFrames: 8, hitRecoveryFrames: 8, reach: kit === 'ground' ? .01 : 2.4, hitArcDegrees: kit === 'spray' && source === 'heavy' ? 60 : undefined, cancels: [] });
  }
  const declaration = base.project.extensions.hyperfocus3D;
  const project = { ...base.project, extensions: { ...base.project.extensions,
    hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat, interactions: { weapons: [{ entityId: 'tool', material: 'metal',
      kit, name: kit === 'ground' ? 'Oil bottle' : 'Extinguisher', durability: kit === 'ground' ? 1 : 30, length: .4, lightMoveId: 'tool-light', heavyMoveId: 'tool-heavy', ...(kit === 'spray' ? { ammo: 2 } : {}),
      effect: { radius: 1.2, range: 2.4, arcDegrees: 60, durationFrames: 60, movementScale: .5 } }] } },
    hyperfocus3D: { ...declaration, scenes: declaration.scenes.map(scene => ({ ...scene, entities: [
      ...scene.entities.map(entity => entity.id === 'b' ? { ...entity, position: [30, 1, 0] } : entity),
      { id: 'tool', meshId: 'mesh', materialId: 'material', position: [.5, .15, 0], scale: [.1, .2, .1], rotationY: 0 },
    ] })) },
  } };
  const runtime = await createHyperfocus3DRuntime(project, base.assets), game = createGameplay3D({ project, runtime, independentCombatInputs: true });
  const control = (actions: string[] = [], x = 0) => ({ actions: new Set(actions), direction: { x, y: 0, z: 0 } });
  const step = (actions: string[] = [], x = 0, targetActions: string[] = []) => game.step([], [control(actions, x), control(targetActions)]);
  for (let i = 0; i < 30; i++) step();
  step(['interact'], 1);step();expect(game.snapshot().combat!.interactions!.weapons[0]!.owner).toBe('a');
  return { game, runtime, step };
}

test('real gameplay saves and checkpoints preserve a consumed ground kit, active zone and held-input edges', async () => {
  const { game, step } = await fixture('ground');
  const before = game.checkpoint();
  step(['heavy']);for (let i = 0; i < 3; i++) step(['heavy']);
  const deployed = game.snapshot();
  expect(deployed.combat!.interactions!.zones).toHaveLength(1);
  expect(deployed.combat!.interactions!.weapons[0]).toMatchObject({ durability: 0, owner: 'a', spentSerial: 1 });
  expect(deployed.combat!.state.fighters[0]!.moveId).toBe('tool-light');
  before.restore();step(['heavy']);for (let i = 0; i < 3; i++) step(['heavy']);expect(game.snapshot()).toEqual(deployed);
  const activeCheckpoint = game.checkpoint();
  for (let i = 0; i < 15; i++) step(['heavy']);
  const after = game.snapshot();
  expect(after.combat!.state.fighters[0]!.moveId).toBe('');
  expect(after.combat!.interactions!.weapons[0]!.owner).toBe('');
  activeCheckpoint.restore();for (let i = 0; i < 15; i++) step(['heavy']);expect(game.snapshot()).toEqual(after);
  game.restore(deployed);for (let i = 0; i < 15; i++) step(['heavy']);
  const reloaded = game.snapshot();
  expect(reloaded.combat!.interactions!.zones).toEqual(after.combat!.interactions!.zones);
  expect(reloaded.combat!.interactions!.weapons[0]).toMatchObject({ durability: 0, owner: '', spentSerial: 1 });
  expect(reloaded.combat!.state.fighters[0]).toMatchObject({ moveId: '', attackSerial: 1 });
});

test('real spray gameplay uses ordinary hit, held block and fresh parry with deterministic checkpoints', async () => {
  for (const defense of ['hit', 'block', 'parry'] as const) {
    const { game, runtime, step } = await fixture('spray');
    const actor = game.snapshot().combat!.state.fighters[0]!;
    runtime.physics.setPosition('b', actor.position.x + 1.7, actor.position.y, actor.position.z);
    const guard = defense === 'hit' ? [] : ['guard'];
    for (let i = 0; i < (defense === 'block' ? 10 : 1); i++) step([], 0, defense === 'block' ? guard : []);
    const before = game.checkpoint();
    const attack = () => { step(['heavy'], 0, guard);for (let i = 0; i < 5; i++) step([], 0, guard);return game.snapshot(); };
    const result = attack();
    expect(result.combat!.interactions!.weapons[0]!.ammo).toBe(1);
    expect(result.combat!.interactions!.slows?.length ?? 0).toBe(defense === 'hit' ? 1 : 0);
    const defender = result.combat!.state.fighters[1]!;
    if (defense === 'parry') { expect(defender.followupFrames).toBeGreaterThan(0);expect(defender.health).toBeGreaterThan(99.8); }
    else expect(defender.health).toBeLessThan(99.8);
    before.restore();expect(attack()).toEqual(result);
  }
});
