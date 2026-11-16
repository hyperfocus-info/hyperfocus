import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createCombatSurfaceForecast } from './surface-forecast.ts';

test('forecast observes actual raised, rotated and moving box contacts without mutating physics', () => {
  for (const kind of ['deck', 'wall', 'rotated', 'moving'] as const) {
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0 });
    const wall = kind !== 'deck';
    world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: .5 }, x: wall ? -3 : 0, y: wall ? 5 : 7, velocityX: wall ? 8 : 0, velocityY: wall ? 0 : -8, continuous: true });
    world.addBody({ id: 'surface', type: kind === 'moving' ? 'kinematic' : 'static', shape: { kind: 'box', halfX: wall ? .2 : 3, halfY: wall ? 3 : .2, halfZ: 3 }, y: 5,
      velocityX: kind === 'moving' ? -2 : 0, rotation: kind === 'rotated' ? [0, 0, Math.sin(.25), Math.cos(.25)] : [0, 0, 0, 1] });
    const forecast = createCombatSurfaceForecast({ world, bodyIds: ['fighter', 'surface'] });
    const before = world.checkpoint(), predicted = forecast('fighter', 0, 30);
    expect(world.checkpoint()).toEqual(before);
    expect(predicted).toBeGreaterThan(0); expect(predicted).toBeLessThan(30);
    let contactFrame = Infinity;
    for (let frame = 0; frame < 30; frame++) {
      const fighter = world.body('fighter')!;
      world.setVelocity('fighter', fighter.velocityX * .985, fighter.velocityY, fighter.velocityZ * .985);
      world.step(0.016666666666666666);
      if (world.contactCount()) { contactFrame = frame + 1; break; }
    }
    expect(Math.abs(contactFrame - predicted)).toBeLessThan(2);
  }
});

test('forecast ignores fighters, triggers, distant geometry and separating contacts', () => {
  const world = createRigidWorld3D({ capacity: 4, gravityY: 0 });
  world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: .5 }, y: 5, velocityX: -8 });
  world.addBody({ id: 'other', shape: { kind: 'box', halfX: 2, halfY: 2, halfZ: 2 }, x: -2, y: 5 });
  world.addBody({ id: 'trigger', type: 'static', trigger: true, shape: { kind: 'box', halfX: 2, halfY: 2, halfZ: 2 }, x: -2, y: 5 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 2, halfZ: 2 }, x: 1, y: 5 });
  expect(createCombatSurfaceForecast({ world, bodyIds: ['fighter', 'other', 'trigger', 'wall'] })('fighter', 0, 30)).toBe(Infinity);
});
