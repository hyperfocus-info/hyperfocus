import { expect, test } from "bun:test";
import { createHeightFieldRaycast3D } from "../../physics/3d.ts";
import { createFootPlantSolver } from "./foot-plant.ts";

test("foot plant solver locks stance targets while the root advances", () => {
  const solver = createFootPlantSolver({
    ground: createHeightFieldRaycast3D({ heightAt: () => 0 }),
    soleOffset: 0,
  });

  const first = solver.update({ phase: 0.1, proposedWorld: [0, 0.2, 0] });
  expect(first.planted).toBe(true);
  expect([...first.anchorWorld]).toEqual([0, 0, 0]);

  const held = solver.update({ phase: 0.3, proposedWorld: [0.4, 0.2, 0] });
  expect(held.planted).toBe(true);
  expect([...held.targetWorld]).toEqual([0, 0, 0]);

  const swing = solver.update({ phase: 0.7, proposedWorld: [0.6, 0.2, 0], swingLift: 0.15 });
  expect(swing.planted).toBe(false);
  expect(swing.targetWorld[0]).toBeCloseTo(0.6);
  expect(swing.targetWorld[1]).toBeCloseTo(0.15);
});

test("foot plant solver follows slopes and resets without reallocating output", () => {
  const solver = createFootPlantSolver({
    ground: createHeightFieldRaycast3D({ heightAt: (x) => x * 0.25 }),
  });
  const result = solver.result;

  expect(solver.update({ phase: 0.8, proposedWorld: [2, 1, 0], swingLift: 0.1 })).toBe(result);
  expect(result.targetWorld[1]).toBeCloseTo(0.615);
  expect(result.groundNormal[0]).toBeLessThan(0);
  solver.reset();
  expect(result.planted).toBe(false);
  expect([...result.groundNormal]).toEqual([0, 1, 0]);
});

test("foot plant solver degrades gracefully when terrain has no hit", () => {
  const solver = createFootPlantSolver({
    ground: {
      raycast() {
        return null;
      },
    },
  });

  const result = solver.update({ phase: 0.1, proposedWorld: [1, 2, 3] });
  expect(result.hit).toBe(false);
  expect(result.planted).toBe(false);
  expect([...result.targetWorld]).toEqual([1, 2, 3]);
});

test("foot plant solver defers stance locking during locomotion startup", () => {
  const solver = createFootPlantSolver({
    ground: createHeightFieldRaycast3D({ heightAt: () => 0 }),
    soleOffset: 0,
  });

  const blending = solver.update({ phase: 0.1, proposedWorld: [0.2, 0.2, 0], allowPlant: false });
  expect(blending.planted).toBe(false);
  expect(blending.targetWorld[0]).toBeCloseTo(0.2);
  expect(blending.targetWorld[1]).toBe(0);
  expect(blending.targetWorld[2]).toBe(0);

  const settled = solver.update({ phase: 0.2, proposedWorld: [0.25, 0.2, 0], allowPlant: true });
  expect(settled.planted).toBe(true);
  expect(settled.anchorWorld[0]).toBeCloseTo(0.25);
  expect(settled.anchorWorld[1]).toBe(0);
  expect(settled.anchorWorld[2]).toBe(0);
});

test("foot plant solver bypasses terrain and clears anchors while airborne", () => {
  let raycasts = 0;
  const solver = createFootPlantSolver({
    ground: {
      raycast(_origin, _direction, _options, out) {
        raycasts += 1;
        const hit = out ?? {
          point: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          distance: 0,
        };
        hit.point.x = 0;
        hit.point.y = 0;
        hit.point.z = 0;
        hit.normal.x = 0;
        hit.normal.y = 1;
        hit.normal.z = 0;
        hit.distance = 0.2;
        return hit;
      },
    },
    soleOffset: 0,
  });

  expect(solver.update({ phase: 0.1, proposedWorld: [0, 0.2, 0] }).planted).toBe(true);
  expect(raycasts).toBe(1);
  const airborne = solver.update({
    phase: 0.2,
    proposedWorld: [1, 2, 3],
    swingLift: 0.5,
    grounded: false,
  });

  expect(raycasts).toBe(1);
  expect(airborne.planted).toBe(false);
  expect(airborne.hit).toBe(false);
  expect([...airborne.targetWorld]).toEqual([1, 2, 3]);
  expect([...airborne.groundNormal]).toEqual([0, 1, 0]);
});
