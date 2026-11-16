import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import { refineSphereBoxSweep } from '../../../physics/rigid/sphere-box-sweep.ts';
import { combatObstacleBounds, combatSegmentMayMeetBox } from './obstacle-bounds.ts';

test('route broadphase retains exact sphere contacts with tilted, thin, and overlapping boxes', () => {
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'box', type: 'static', shape: { kind: 'box', halfX: 2, halfY: 3, halfZ: .15 }, x: 3, y: 1, z: -2 });
  let seed = 651;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
  let contacts = 0, rejections = 0;
  for (let rotation = 0; rotation < 30; rotation++) {
    world.setRotation('box', random() - .5, random() - .5, random() - .5, random() - .5);
    const body = world.body('box')!, bounds = combatObstacleBounds(body);
    const x = -body.rotationX, y = -body.rotationY, z = -body.rotationZ, w = body.rotationW;
    const local = (dx: number, dy: number, dz: number) => {
      const tx = 2 * (y * dz - z * dy), ty = 2 * (z * dx - x * dz), tz = 2 * (x * dy - y * dx);
      return [dx + w * tx + y * tz - z * ty, dy + w * ty + z * tx - x * tz, dz + w * tz + x * ty - y * tx];
    };
    for (let sample = 0; sample < 100; sample++) {
      const ax = random() * 20 - 7, az = random() * 20 - 12, bx = random() * 20 - 7, bz = random() * 20 - 12;
      const height = random() * 8 - 3, radius = random();
      const origin = local(ax - body.x, height - body.y, az - body.z), delta = local(bx - ax, 0, bz - az);
      const hit = { time: 0, normalX: 0, normalY: 0, normalZ: 0 };
      const exact = refineSphereBoxSweep(origin, delta, 2, 3, .15, radius, hit);
      const inside = Math.abs(origin[0]!) <= 2 && Math.abs(origin[1]!) <= 3 && Math.abs(origin[2]!) <= .15;
      const possible = combatSegmentMayMeetBox(ax, az, bx, bz, radius, bounds);
      if (exact || inside) { contacts++; expect(possible).toBe(true); }
      if (!possible) rejections++;
    }
  }
  expect(contacts).toBeGreaterThan(300);
  expect(rejections).toBeGreaterThan(1000);
});

test('route broadphase preserves grazing and zero-length contact, rejects remote city geometry', () => {
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'box', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 2, halfZ: 1 } });
  const bounds = combatObstacleBounds(world.body('box')!);
  expect(combatSegmentMayMeetBox(-4, 1.5, 4, 1.5, .5, bounds)).toBe(true);
  expect(combatSegmentMayMeetBox(1.5, 0, 1.5, 0, .5, bounds)).toBe(true);
  expect(combatSegmentMayMeetBox(0, 0, 0, 0, .5, bounds)).toBe(true);
  expect(combatSegmentMayMeetBox(-4, 1.51, 4, 1.51, .5, bounds)).toBe(false);
  let exactSweepCandidates = 0;
  for (let i = 0; i < 88; i++) {
    world.setPosition('box', 40 + i * 4, 0, 40);
    if (combatSegmentMayMeetBox(-12, -12, 12, 12, .5, combatObstacleBounds(world.body('box')!))) exactSweepCandidates++;
  }
  expect(exactSweepCandidates).toBe(0);
});
