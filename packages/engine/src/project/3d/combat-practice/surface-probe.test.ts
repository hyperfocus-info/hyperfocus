import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { createPracticeSurfaceProbe } from './surface-probe.ts';

test('branch surface preview uses live moving colliders, ignores fighters and respects rotation', () => {
  const world = createRigidWorld3D({ capacity: 3, gravityY: 0 });
  world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: .5 }, y: 4 });
  world.addBody({ id: 'other', shape: { kind: 'sphere', radius: .5 }, y: 4 });
  world.addBody({ id: 'platform', type: 'kinematic', shape: { kind: 'box', halfX: 2, halfY: .2, halfZ: 1 }, x: 5, y: 4, rotation: [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] });
  const near = createPracticeSurfaceProbe({ world, bodyIds: ['fighter','other','platform'] });
  expect(near('fighter')).toBe(false);
  world.setPosition('platform', 2, 4, 0);
  expect(near('fighter')).toBe(true);
  world.configureBody('platform', { collisionMask: 0 });
  expect(near('fighter')).toBe(false);
  expect(near('missing')).toBe(false);
});
