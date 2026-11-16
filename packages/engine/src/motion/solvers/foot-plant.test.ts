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

test("an overextended stance releases instead of teleporting its anchor", () => {
  const solver = createFootPlantSolver({
    ground: createHeightFieldRaycast3D({ heightAt: () => 0 }),
    soleOffset: 0,
    maxAnchorDistance: .5,
    swingTargetResponse: 12,
  });

  solver.update({ phase: .1, proposedWorld: [0, .2, 0], deltaSeconds: 0.016666666666666666 });
  const released = solver.update({ phase: .2, proposedWorld: [.8, .2, 0], deltaSeconds: 0.016666666666666666 });
  expect(released.planted).toBe(false);
  expect([...released.anchorWorld]).toEqual([0, 0, 0]);
  expect(released.targetWorld[0]).toBeGreaterThan(0);
  expect(released.targetWorld[0]).toBeLessThan(.8);

  const sameStance = solver.update({ phase: .3, proposedWorld: [.9, .2, 0], deltaSeconds: 0.016666666666666666 });
  expect(sameStance.planted).toBe(false);
  expect([...sameStance.anchorWorld]).toEqual([0, 0, 0]);
  solver.update({ phase: .8, proposedWorld: [1, .2, 0], deltaSeconds: 0.016666666666666666 });
  expect(solver.update({ phase: .05, proposedWorld: [1.05, .2, 0], deltaSeconds: 0.016666666666666666 }).planted).toBe(true);
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

test("a planted foot keeps the normal of its captured contact while the body advances", () => {
  const solver = createFootPlantSolver({
    ground: {
      raycast(origin, _direction, _options, out) {
        const hit = out!;
        const x = "x" in origin ? origin.x : origin[0]!, y = "y" in origin ? origin.y : origin[1]!, z = "z" in origin ? origin.z : origin[2]!;
        hit.point.x = x;
        hit.point.y = 0;
        hit.point.z = z;
        hit.normal.x = x > .5 ? -.6 : 0;
        hit.normal.y = x > .5 ? .8 : 1;
        hit.normal.z = 0;
        hit.distance = y;
        return hit;
      },
    },
    soleOffset: 0,
  });
  solver.update({ phase: .1, proposedWorld: [0, .2, 0] });
  const held = solver.update({ phase: .2, proposedWorld: [.8, .2, 0] });
  expect(held.planted).toBe(true);
  expect([...held.groundNormal]).toEqual([0, 1, 0]);
  const swing = solver.update({ phase: .8, proposedWorld: [.8, .2, 0] });
  expect(swing.planted).toBe(false);
  expect([...swing.groundNormal]).toEqual([-.6000000238418579, .800000011920929, 0]);
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
  expect([...airborne.targetWorld]).toEqual([1, 2.5, 3]);
  expect([...airborne.groundNormal]).toEqual([0, 1, 0]);
});

test("swing foot accepts rising terrain immediately and damps only the descent", () => {
  let height = 0;
  const solver = createFootPlantSolver({
    ground: createHeightFieldRaycast3D({ heightAt: () => height }),
    soleOffset: 0,
    swingTargetResponse: 24,
  });
  solver.update({ phase: .7, proposedWorld: [0, .5, 0], deltaSeconds: 0.016666666666666666 });
  height = .4;
  const firstStep = solver.update({ phase: .72, proposedWorld: [.04, .5, 0], deltaSeconds: 0.016666666666666666 });
  expect(firstStep.targetWorld[1]).toBeCloseTo(.4, 6);
  height = 0;
  let previousHeight = firstStep.targetWorld[1];
  for (let frame = 0; frame < 45; frame += 1) {
    const sample = solver.update({ phase: .75, proposedWorld: [.04, .5, 0], deltaSeconds: 0.016666666666666666 });
    expect(sample.targetWorld[1]).toBeLessThanOrEqual(previousHeight + 1e-6);
    previousHeight = sample.targetWorld[1];
  }
  expect(previousHeight).toBeCloseTo(0, 4);
});

test("ankle and toe probes keep the whole foot above an approaching step", () => {
  const solver = createFootPlantSolver({
    ground: createHeightFieldRaycast3D({ heightAt: (x) => x >= .2 ? .3 : 0 }),
    soleOffset: .1,
  });

  const result = solver.update({
    phase: .75,
    proposedWorld: [0, .5, 0],
    soleForwardX: 1,
    soleForwardZ: 0,
    soleLength: .25,
  });

  expect(result.hit).toBe(true);
  expect(result.targetWorld[0]).toBeCloseTo(0);
  expect(result.targetWorld[1]).toBeCloseTo(.4);
  expect(result.targetWorld[2]).toBeCloseTo(0);
});
