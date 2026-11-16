import { expect, test } from 'bun:test';
import { createCcdBoundsTest } from './ccd-bounds.ts';
import { createRigidWorld3D } from '../rigid-3d.ts';

function fixture() {
  const bodies = { shapeKind: new Uint8Array([0, 1]), extentX: new Float64Array([.5, 2]), extentY: new Float64Array([.5, .2]), extentZ: new Float64Array([.5, .2]),
    positionX: new Float64Array([0, 20]), positionY: new Float64Array(2), positionZ: new Float64Array(2),
    previousX: new Float64Array([0, 20]), previousY: new Float64Array(2), previousZ: new Float64Array(2) };
  return { bodies, test: createCcdBoundsTest(bodies) };
}

test('CCD bounds reject only same-side disjoint relative sweeps', () => {
  const { bodies, test: overlap } = fixture();
  expect(overlap(0, 1)).toBe(false);
  bodies.positionX[1] = -20;expect(overlap(0, 1)).toBe(true);
  bodies.previousX[0] = 0;bodies.positionX[0] = -40;expect(overlap(0, 1)).toBe(false);
  bodies.previousX[0] = -40;bodies.positionX[0] = 0;expect(overlap(0, 1)).toBe(true);
  bodies.previousX[1] = bodies.positionX[1] = 2.9;expect(overlap(0, 1)).toBe(true);
  bodies.previousY[1] = bodies.positionY[1] = 100;expect(overlap(0, 1)).toBe(false);
});

test('CCD bounds preserve long thin rotating boxes and boundary contacts', () => {
  const { bodies, test: overlap } = fixture();
  bodies.shapeKind[0] = 1;bodies.extentX[0] = 30;bodies.extentY[0] = .01;bodies.extentZ[0] = .01;
  expect(overlap(0, 1)).toBe(true);
  bodies.previousX[1] = bodies.positionX[1] = 32.420000005;
  expect(overlap(0, 1)).toBe(true);
  bodies.previousX[1] = bodies.positionX[1] = 32.421;
  expect(overlap(0, 1)).toBe(false);
});

test('distant fast traffic still collides in the same tick among distant clutter', () => {
  for (const precision of ['float32', 'float64'] as const) {
    const world = createRigidWorld3D({ capacity: 128, gravityY: 0, precision });
    world.addBody({ id: 'fighter', type: 'dynamic', shape: { kind: 'sphere', radius: .5 }, continuous: true, mass: 1 });
    world.addBody({ id: 'traffic', type: 'kinematic', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 }, x: 20, velocityX: -2400 });
    for (let index = 0; index < 100; index++) world.addBody({ id: `clutter-${index}`, type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 }, x: index * 3, z: 100 });
    world.setVelocity('fighter', .01, 0, 0);world.step(0.016666666666666666);
    expect(world.diagnostics.ccdHits).toBeGreaterThan(0);
    expect(world.body('fighter')!.x).toBeLessThan(-1);
    expect(world.diagnostics.ccdEligiblePairs).toBe(101);
    expect(world.diagnostics.ccdBoundsRejects).toBe(100);
    expect(world.diagnostics.ccdTests).toBe(1);
    const checkpoint = world.checkpoint();world.step(0.016666666666666666);const next = world.checkpoint();
    world.restoreCheckpoint(checkpoint);world.step(0.016666666666666666);expect(world.checkpoint()).toEqual(next);
  }
});
