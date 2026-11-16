import { expect, test } from 'bun:test';
import { hypot } from '../../math/simulation.ts';
import { createRigidWorld3D } from '../rigid-3d.ts';

test('quaternion normalization preserves signed identity components and scalar rounding', () => {
  const world = createRigidWorld3D({ capacity: 1 });
  world.addBody({ id: 'body', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 2, halfZ: 3 } });
  const inputs: [number, number, number, number][] = [
    [0, 0, 0, 1], [-0, 0, -0, 1], [0, -0, 0, -1], [-0, -0, -0, -1],
    [0, 0, 0, 2], [0, 0, 0, -2], [.3, -.5, .7, .9], [0, 1, 0, 0],
  ];
  for (const input of inputs) {
    world.setRotation('body', ...input);
    const body = world.body('body')!, length = hypot(...input);
    const actual = [body.rotationX, body.rotationY, body.rotationZ, body.rotationW];
    for (let component = 0; component < 4; component++) expect(Object.is(actual[component], input[component]! / length)).toBe(true);
    const ray = { handle: 0, id: '', distance: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };
    expect(world.raycast(-5, 0, 0, 1, 0, 0, 10, 0xffffffff, ray)).toBe(true);
  }
});

test('identity normalization keeps validation and rejects invalid rotations before mutation', () => {
  const world = createRigidWorld3D({ capacity: 1 });
  world.addBody({ id: 'body', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 } });
  const before = world.body('body');
  for (const [x, y, z, w] of [[0, 0, 0, 0], [Infinity, 0, 0, 1], [0, NaN, 0, -1], [0, 0, Infinity, 1], [0, 0, 0, Infinity], [0, 0, 0, 1e13]] as const) {
    expect(() => world.setRotation('body', x, y, z, w)).toThrow();expect(world.body('body')).toEqual(before);
  }
});
