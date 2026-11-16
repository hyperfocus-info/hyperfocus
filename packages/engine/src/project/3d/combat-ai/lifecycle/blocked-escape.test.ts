import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../../physics/rigid-3d.ts';
import { createBlockedEscape } from './blocked-escape.ts';

test('blocked recovery selects a clear supported side, follows destruction, and never walks into void', () => {
  const world = createRigidWorld3D({ capacity: 6, gravityY: 0 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .5 }, y: .5 });
  world.addBody({ id: 'target', shape: { kind: 'sphere', radius: .5 }, x: 8, y: .5 });
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 10, halfY: .5, halfZ: 10 }, y: -.5 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 2, halfZ: .2 }, y: 2, z: 1 });
  const escape = createBlockedEscape({ world, bodyIds: ['actor', 'target', 'floor', 'wall'] });
  expect(escape('actor', 'target', 1)?.z).toBe(-1);
  world.configureBody('wall', { collisionMask: 0 });
  expect(escape('actor', 'target', 1)?.z).toBe(1);
  world.configureBody('floor', { collisionMask: 0 });
  expect(escape('actor', 'target', 1)).toBeUndefined();
});
