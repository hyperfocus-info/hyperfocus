import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../rigid-3d.ts';

test('a tangent sphere sweep at a rounded corner resolves a real contact instead of freezing', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'pillar', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 4, halfZ: 1 }, friction: 0 });
  const corner = 1 + Math.SQRT1_2 * (1.0000000000001);
  world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: 1 }, x: corner, z: corner, continuous: true, friction: 0 });
  for (let frame = 0; frame < 10; frame++) { world.setVelocity('fighter', 1, 0, -1);world.step(0.016666666666666666); }
  expect(world.body('fighter')!.x).toBeGreaterThan(corner + .1);
  expect(world.body('fighter')!.z).toBeLessThan(corner - .1);
});

test('sphere movement clears the empty region beside box corners without phantom CCD contacts', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'pillar', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 4, halfZ: 1 } });
  world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: 1 }, x: -2.1, z: 1.9, continuous: true, friction: 0 });
  for (let frame = 0; frame < 10; frame++) { world.setVelocity('fighter', 3, 0, 0); world.step(0.016666666666666666); }
  expect(world.body('fighter')!.x).toBeCloseTo(-1.6, 3);
});

test('fast sphere movement still hits the rounded edge after clearing the expanded box corner', () => {
  for (const rotationY of [0, .65]) {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    world.addBody({ id: 'pillar', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 4, halfZ: 1 } });
    world.setRotation('pillar', 0, Math.sin(rotationY / 2), 0, Math.cos(rotationY / 2));
    const c = Math.cos(rotationY), s = Math.sin(rotationY);
    world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: 1 }, x: -3 * c + 1.9 * s, z: 3 * s + 1.9 * c, velocityX: 300 * c, velocityZ: -300 * s, continuous: true, friction: 0 });
    world.step(0.016666666666666666);
    const fighter = world.body('fighter')!;
    expect(fighter.x * c - fighter.z * s).toBeCloseTo(-1 - Math.sqrt(0.18999999999999995), 3);
    expect(world.contactCount()).toBeGreaterThan(0);
  }
});

test('continuous bodies can slide and jump from resting floor contact without tunneling through it', () => {
  for (const shape of [{ kind: 'sphere' as const, radius: 1 }, { kind: 'box' as const, halfX: .6, halfY: 1, halfZ: .6 }]) {
    const world = createRigidWorld3D({ capacity: 2 });
    world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 100, halfY: .1, halfZ: 100 }, y: -.1 });
    world.addBody({ id: 'fighter', shape, y: 1, continuous: true, friction: 0 });
    for (let i = 0; i < 30; i++) world.step(0.016666666666666666);
    world.setVelocity('fighter', 7, 0, 0);
    world.step(0.016666666666666666);
    expect(world.body('fighter')!.x).toBeGreaterThan(.1);
    world.setVelocity('fighter', 7, 9, 0);
    world.step(0.016666666666666666);
    expect(world.body('fighter')!.y).toBeGreaterThan(1.1);
    world.setPosition('fighter', 0, 1, 0);
    world.setVelocity('fighter', 0, -1000, 0);
    world.step(0.016666666666666666);
    expect(world.body('fighter')!.y).toBeGreaterThan(.9);
  }
});

test('thin arena floor catches fast landings across its entire visible footprint', () => {
  for (const [x, z] of [[0, 3], [7, 3], [-7, 3], [8, 5], [0, 6]]) {
    for (const velocity of [-20, -100, -500]) {
      const world = createRigidWorld3D({ capacity: 2 });
      world.addBody({ id: 'arena', type: 'static', shape: { kind: 'box', halfX: 9, halfY: .2, halfZ: 7 }, y: -.22 });
      world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: 1 }, x, z, y: 10, velocityY: velocity, continuous: true });
      for (let tick = 0; tick < 120; tick++) {
        world.step(0.016666666666666666);
        expect(world.body('fighter')!.y).toBeGreaterThan(.97);
      }
      expect(world.body('fighter')!.y).toBeCloseTo(.98, 3);
    }
  }
});

test('a falling dynamic body cannot carry a grounded collision partner through the floor', () => {
  const world = createRigidWorld3D({ capacity: 3 });
  // Keep the whole post-impact trajectory over the floor: the falling body can
  // travel more than 60 m laterally. Walking off an edge is tested separately.
  world.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 100, halfY: 1, halfZ: 12 }, y: -1.02 });
  world.addBody({ id: 'grounded', shape: { kind: 'sphere', radius: 1 }, y: .979876, continuous: true });
  world.addBody({ id: 'falling', shape: { kind: 'sphere', radius: 1 }, x: 1.9, y: 1.7, velocityY: -144, continuous: true });
  world.setVelocity('grounded', 7, 0, 0);
  for (let tick = 0; tick < 120; tick++) {
    world.step(0.016666666666666666);
    expect(world.body('grounded')!.y).toBeGreaterThan(.9);
    expect(world.body('falling')!.y).toBeGreaterThan(.9);
  }
});

test('an enclosed arena retains airborne launches and diagonal high-speed impacts', () => {
  const world = createRigidWorld3D({ capacity: 6 });
  world.addBody({ id: 'arena', type: 'static', shape: { kind: 'box', halfX: 9, halfY: .2, halfZ: 7 }, y: -.22 });
  for (const side of [-1, 1]) {
    world.addBody({ id: `x:${side}`, type: 'static', shape: { kind: 'box', halfX: .25, halfY: 6, halfZ: 7 }, x: side * 8.75, y: 6 });
    world.addBody({ id: `z:${side}`, type: 'static', shape: { kind: 'box', halfX: 9, halfY: 6, halfZ: .25 }, z: side * 6.75, y: 6 });
  }
  world.addBody({ id: 'fighter', shape: { kind: 'sphere', radius: 1 }, y: 1, continuous: true });
  for (const velocity of [16, 100, 500]) {
    for (const direction of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) {
      world.setPosition('fighter', 0, 1, 0);
      world.setVelocity('fighter', direction[0]! * velocity, 13, direction[1]! * velocity);
      for (let tick = 0; tick < 240; tick++) {
        world.step(0.016666666666666666);
        const body = world.body('fighter')!;
        expect(body.y).toBeGreaterThan(.97);
        expect(Math.abs(body.x)).toBeLessThan(7.51);
        expect(Math.abs(body.z)).toBeLessThan(5.51);
      }
    }
  }
});

test('resting CCD spheres leave a slab edge and a glancing partner instead of freezing in place', () => {
  const world = createRigidWorld3D({ capacity: 3 });
  world.addBody({ id: 'bridge', type: 'static', shape: { kind: 'box', halfX: .5, halfY: .2, halfZ: 1 }, x: -6.5, y: 5.8, z: -5 });
  world.addBody({ id: 'roof', type: 'static', shape: { kind: 'box', halfX: 3, halfY: .2, halfZ: 5 }, x: -3, y: 5.8, z: -1 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, x: -6.005062218, y: 6.999989999996, z: -4.51579755, velocityX: 10.0256, velocityZ: 11.7484, continuous: true });
  for (let tick = 0; tick < 30; tick++) { world.setVelocity('actor', 7.060884, 0, 8.260945); world.step(0.016666666666666666); }
  expect(world.body('actor')!.x).toBeGreaterThan(-5.5);
  const pair = createRigidWorld3D({ capacity: 3 });
  pair.addBody({ id: 'floor', type: 'static', shape: { kind: 'box', halfX: 30, halfY: 1, halfZ: 30 }, y: -1 });
  pair.addBody({ id: 'standing', shape: { kind: 'sphere', radius: 1 }, x: -11.9561283674, y: .9999899999, z: 5.05776155, continuous: true });
  pair.addBody({ id: 'falling', shape: { kind: 'sphere', radius: 1 }, x: -13.27663, y: 1.70788, z: 3.73297, velocityX: -14.3171893, velocityY: -53.7460223, velocityZ: -14.4190699, continuous: true });
  for (let tick = 0; tick < 30; tick++) { pair.setVelocity('standing', 0, 0, 0); pair.step(0.016666666666666666); }
  expect(pair.body('falling')!.y).toBeLessThan(1.1);
  expect(pair.body('falling')!.y).toBeGreaterThan(.9);
});

test('a resting continuous sphere can walk beyond a finite platform and fall', () => {
  const world = createRigidWorld3D({ capacity: 2 });
  world.addBody({ id: 'platform', type: 'static', shape: { kind: 'box', halfX: 2, halfY: .2, halfZ: 2 }, y: -.2 });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: 1 }, y: 1, continuous: true });
  for (let tick = 0; tick < 60; tick++) { world.setVelocity('actor', 7, world.body('actor')!.velocityY, 0); world.step(0.016666666666666666); }
  expect(world.body('actor')!.x).toBeGreaterThan(5);
  expect(world.body('actor')!.y).toBeLessThan(.5);
});

test('near-touching thin-wall sweeps cannot delegate a far-side overlapping endpoint', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .1, halfY: 5, halfZ: 5 } });
  world.addBody({ id: 'actor', shape: { kind: 'sphere', radius: .5 }, x: -.600001, velocityX: 60, continuous: true });
  world.step(0.016666666666666666);
  expect(world.body('actor')!.x).toBeLessThan(-.59);
});
