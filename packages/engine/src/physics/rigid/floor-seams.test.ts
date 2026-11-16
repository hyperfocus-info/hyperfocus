import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../rigid-3d.ts';

test('grounded spheres move along coplanar floor seams as freely as a single floor', () => {
  for (const speed of [.1, 1, 5.76, 10]) for (const x of [-19.0068, -19, -18.9932]) {
    const world = floor(true);
    world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x, y: .99999, z: 39, continuous: true, gravityScale: 1.9, friction: 0 });
    const control = floor(false);
    control.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x, y: .99999, z: 39, continuous: true, gravityScale: 1.9, friction: 0 });
    for (let tick = 0; tick < 90; tick++) for (const scene of [world, control]) {
      scene.setVelocity('actor', 0, scene.body('actor')!.velocityY, -speed);scene.step(0.016666666666666666);
      expect(scene.diagnostics.ccdTests).toBeLessThanOrEqual(2);
      expect(scene.diagnostics.ccdTestOverflows).toBe(0);
    }
    expect(world.body('actor')!.z).toBeCloseTo(control.body('actor')!.z, 4);
    expect(world.body('actor')!.z).toBeCloseTo(39 - speed * 1.5, 2);
    expect(world.body('actor')!.y).toBeGreaterThan(.99);
  }
});

test('grounded movement crosses both directions of a coplanar seam without stopping', () => {
  for (const direction of [-1, 1]) {
    const world = floor(true);
    world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x: -19 - direction, y: .99999, z: 39, continuous: true, gravityScale: 1.9, friction: 0 });
    for (let tick = 0; tick < 90; tick++) { world.setVelocity('actor', direction * 1.5, world.body('actor')!.velocityY, 0);world.step(0.016666666666666666); }
    expect((world.body('actor')!.x + 19) * direction).toBeGreaterThan(1.2);
    expect(world.body('actor')!.y).toBeGreaterThan(.99);
  }
});

test('shallow diagonal wall contact slides without letting the sphere through the wall', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .1, halfY: 5, halfZ: 20 } });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x: -1.100001, z: 5, continuous: true, friction: 0 });
  for (let tick = 0; tick < 90; tick++) { world.setVelocity('actor', .3, 0, -1);world.step(0.016666666666666666); }
  expect(world.body('actor')!.x).toBeLessThan(-1.099);
  expect(world.body('actor')!.z).toBeLessThan(3.6);
});

function floor(segmented: boolean) {
  const world = createRigidWorld3D({ capacity: 3 });
  if (segmented) {
    world.addBody({ id: 'west', type: 'static', shape: { kind: 'box', halfX: 3, halfY: .3, halfZ: 26 }, x: -22, y: -.3, z: 34 });
    world.addBody({ id: 'east', type: 'static', shape: { kind: 'box', halfX: 49.5, halfY: .3, halfZ: 60 }, x: 30.5, y: -.3 });
  } else world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 80, halfY: .3, halfZ: 60 }, y: -.3 });
  return world;
}
