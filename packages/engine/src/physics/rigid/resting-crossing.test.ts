import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../rigid-3d.ts';

test('resting overlap cannot cross a thin wall into a far-side overlapping endpoint', () => {
  for (const radius of [.5, 1]) for (const side of [-1, 1]) for (const rotation of [0, .65]) {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    const c = Math.cos(rotation), s = Math.sin(rotation);
    world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .1, halfY: 5, halfZ: 5 } });
    world.setRotation('wall', 0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2));
    world.addBody({ id: 'actor', shape: { kind: 'sphere', radius }, x: side * (radius + .1 - .00001) * c, z: -side * (radius + .1 - .00001) * s, continuous: true, friction: 0 });
    world.setVelocity('actor', -side * radius * 120 * c, 0, side * radius * 120 * s);
    world.step(0.016666666666666666);
    const body = world.body('actor')!;
    expect(side * (body.x * c - body.z * s)).toBeGreaterThan(radius + .099);
    expect(world.contactCount()).toBeGreaterThan(0);
  }
});

test('a grounded downward impulse cannot cross a thin floor while still overlapping it', () => {
  for (const shape of [{ kind: 'sphere' as const, radius: 1 }, { kind: 'box' as const, halfX: .6, halfY: 1, halfZ: .6 }]) {
    for (const speed of [72, 100, 120]) {
      const world = createRigidWorld3D({ capacity: 2 });
      world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 20, halfY: .1, halfZ: 20 }, y: -.1 });
      world.addBody({ id: 'actor', shape, y: .99999, continuous: true, friction: 0 });
      world.setVelocity('actor', 0, -speed, 0);
      for (let tick = 0; tick < 60; tick++) {
        world.step(0.016666666666666666);
        expect(world.body('actor')!.y).toBeGreaterThan(.99);
      }
    }
  }
});
