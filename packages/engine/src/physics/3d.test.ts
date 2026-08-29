import { expect, test } from "bun:test";
import {
  applyOverTime,
  colliderVerticalRange,
  collidersOverlap3D,
  createCharacterMotor3D,
  createHeightFieldRaycast3D,
  createKinematicCharacter3D,
  isFullySubmerged,
  placeOnGround3D,
  raycastBatch3D,
  rubberBand,
  submersionRatio,
  verticalRangesOverlap
} from "./3d.ts";

test("3D colliders expose vertical ranges and overlap tests", () => {
  const player = { kind: "capsule" as const, a: [0, 0, 0] as const, b: [0, 2, 0] as const, radius: 0.5 };
  const wall = { kind: "box" as const, center: [1.1, 1, 0] as const, halfSize: [0.75, 1, 0.5] as const };
  const highPickup = { kind: "sphere" as const, center: [0, 5, 0] as const, radius: 0.25 };

  expect(colliderVerticalRange(player)).toEqual({ minY: -0.5, maxY: 2.5 });
  expect(verticalRangesOverlap(colliderVerticalRange(player), colliderVerticalRange(wall))).toBe(true);
  expect(collidersOverlap3D(player, wall)).toBe(true);
  expect(collidersOverlap3D(player, highPickup)).toBe(false);
});

test("submersion works for rising water levels", () => {
  const body = { kind: "box" as const, center: [0, 2, 0] as const, halfSize: [1, 2, 1] as const };

  expect(submersionRatio(body, 0)).toBe(0);
  expect(submersionRatio(body, 2)).toBe(0.5);
  expect(isFullySubmerged(body, 4)).toBe(true);
  expect(submersionRatio(body, { minY: 1, maxY: 3 })).toBe(0.5);
});

test("height field placement keeps terrain rules outside physics", () => {
  const placed = placeOnGround3D([4, 99, 5], { heightAt: (x, z) => x * 0.5 + z }, { yOffset: 0.25 });

  expect(placed).toEqual({ x: 4, y: 7.25, z: 5 });
});

test("applyOverTime always finishes with a complete ratio", () => {
  const calls: Array<[number, boolean]> = [];
  const task = applyOverTime(1000, (ratio, complete) => {
    calls.push([ratio, complete]);
  });

  expect(task.update(0.25)).toBe(false);
  expect(task.update(0.75)).toBe(true);
  expect(calls).toEqual([[0.25, false], [1, true]]);
});

test("applyOverTime stops early but still emits final completion", () => {
  const calls: Array<[number, boolean]> = [];
  const task = applyOverTime(1000, (ratio, complete) => {
    calls.push([ratio, complete]);
    return !complete && ratio >= 0.25;
  });

  expect(task.update(0.25)).toBe(true);
  expect(calls).toEqual([[0.25, false], [1, true]]);
});

test("rubberBand runs forward then inverse over the total duration", () => {
  const values: number[] = [];
  const task = rubberBand(1000, (ratio) => {
    values.push(Math.round(ratio * 100) / 100);
  });

  task.update(0.25);
  task.update(0.25);
  task.update(0.25);
  task.update(0.25);

  expect(values).toEqual([0.5, 1, 0.5, 0]);
  expect(task.done).toBe(true);
});

test("kinematic character supports instant and continuous damped forces", () => {
  const actor = createKinematicCharacter3D({
    gravity: 10,
    heightField: { heightAt: () => 0 },
    groundSnap: 0.05,
    position: [0, 0, 0]
  });

  const instant = actor.addForce([4, 0, 0]);
  expect(instant.active).toBe(false);
  actor.step(0.5);
  expect(actor.state.position.x).toBe(2);
  expect(actor.state.position.y).toBe(0);
  expect(actor.state.grounded).toBe(true);

  const wind = actor.addForce([2, 0, 0], { continuous: true, durationMs: 1000, damping: 10 });
  actor.step(0.5);
  expect(wind.active).toBe(true);
  expect(actor.state.velocity.x).toBeGreaterThan(4);
  actor.step(0.5);
  expect(wind.active).toBe(false);
});

test("kinematic character timers update during step", () => {
  const actor = createKinematicCharacter3D();
  const values: number[] = [];

  actor.applyOverTime(1000, (ratio) => {
    values.push(Math.round(ratio * 10) / 10);
  });
  actor.rubberBand(1000, (ratio) => {
    values.push(Math.round(ratio * 10) / 10);
  });

  actor.step(0.5);
  actor.step(0.5);

  expect(values).toEqual([0.5, 1, 1, 0]);
});

test("capsule-box overlap excludes the square-expanded corner false positive", () => {
  const box = {
    kind: "box" as const,
    center: [0, 0, 0] as const,
    halfSize: [1, 1, 1] as const
  };
  const outsideRoundedCorner = {
    kind: "capsule" as const,
    a: [1.9, 0, 1.9] as const,
    b: [1.9, 0, 1.9] as const,
    radius: 1
  };
  const touchingRoundedCorner = {
    ...outsideRoundedCorner,
    a: [1.7, 0, 1.7] as const,
    b: [1.7, 0, 1.7] as const
  };

  expect(collidersOverlap3D(outsideRoundedCorner, box)).toBe(false);
  expect(collidersOverlap3D(touchingRoundedCorner, box)).toBe(true);
});

test("height-field raycasts expose exact vertical hits and slope normals", () => {
  const rays = createHeightFieldRaycast3D({ heightAt: (x) => x * 0.5 });
  const hit = rays.raycast([2, 5, 3], [0, -2, 0], { maxDistance: 5 });

  expect(hit?.distance).toBe(4);
  expect(hit?.point).toEqual({ x: 2, y: 1, z: 3 });
  expect(hit?.normal.x).toBeCloseTo(-0.4472, 3);
  expect(hit?.normal.y).toBeCloseTo(0.8944, 3);
  expect(rays.raycast([2, 5, 3], [1, -1, 0], { maxDistance: 10 })).toBeNull();
  expect(() => rays.raycast([0, 1, 0], [0, 0, 0])).toThrow("non-zero length");
});

test("raycast batches reuse caller-owned result arrays", () => {
  const rays = createHeightFieldRaycast3D({ heightAt: () => 0, normalAt: () => [0, 1, 0] });
  const hitMask = new Uint8Array(2);
  const points = new Float32Array(6);
  const normals = new Float32Array(6);
  const distances = new Float32Array(2);
  const hits = raycastBatch3D(rays, {
    origins: new Float32Array([0, 3, 0, 1, -1, 1]),
    directions: new Float32Array([0, -1, 0, 0, -1, 0]),
    maxDistance: new Float32Array([5, 5]),
    hitMask,
    points,
    normals,
    distances,
  });

  expect(hits).toBe(1);
  expect([...hitMask]).toEqual([1, 0]);
  expect([...points.slice(0, 3)]).toEqual([0, 0, 0]);
  expect([...normals.slice(0, 3)]).toEqual([0, 1, 0]);
  expect(distances[0]).toBe(3);
  expect(distances[1]).toBe(Number.POSITIVE_INFINITY);
  expect(Number.isNaN(points[3])).toBe(true);
});

test("desired-velocity motor accelerates, clamps speed, turns, and follows ground", () => {
  const motor = createCharacterMotor3D({
    maxSpeed: 4,
    acceleration: 2,
    deceleration: 4,
    maxTurnRate: Math.PI,
    maxDeltaSeconds: 1,
    heightField: { heightAt: (x) => x * 0.25 },
  });

  motor.move([10, 0, 0]);
  expect(motor.state.desiredVelocity).toEqual({ x: 4, y: 0, z: 0 });
  motor.step(0.5);

  expect(motor.state.position.x).toBeCloseTo(0.5);
  expect(motor.state.position.y).toBeCloseTo(0.125);
  expect(motor.state.velocity.x).toBeCloseTo(1);
  expect(motor.state.grounded).toBe(true);
  expect(motor.state.facing.x).toBeCloseTo(1);
  expect(Math.abs(motor.state.turnRate)).toBeCloseTo(Math.PI);

  motor.move([0, 0, 0]);
  motor.step(0.5);
  expect(motor.state.velocity.x).toBe(0);
});

test("root-motion requests pass through authoritative displacement resolution", () => {
  const motor = createCharacterMotor3D({
    maxDeltaSeconds: 1,
    resolveDisplacement(query) {
      return {
        delta: [Math.min(0.25, query.requestedDelta.x), query.requestedDelta.y, query.requestedDelta.z],
        grounded: true,
        groundNormal: [0, 1, 0],
      };
    },
  });

  motor.requestRootMotion([2, 0, 0]);
  motor.step(0.5);
  expect(motor.state.position.x).toBe(0.25);
  expect(motor.state.resolvedDelta.x).toBe(0.25);
  expect(motor.state.grounded).toBe(true);

  motor.step(0.5);
  expect(motor.state.position.x).toBe(0.25);
});

test("character motor reset clears hidden velocity and pending root state deterministically", () => {
  const motor = createCharacterMotor3D({ maxDeltaSeconds: 1 });
  motor.move([4, 0, 0]);
  motor.requestRootMotion([1, 0, 0]);
  motor.step(0.25);
  expect(motor.state.position.x).toBeGreaterThan(1);

  motor.reset({ position: [2, 0, 3], facing: [0, 0, -1] });
  motor.step(0.25);
  expect(motor.state.position).toEqual({ x: 2, y: 0, z: 3 });
  expect(motor.state.velocity).toEqual({ x: 0, y: 0, z: 0 });
  expect(motor.state.desiredVelocity).toEqual({ x: 0, y: 0, z: 0 });
  expect(motor.state.facing.z).toBe(-1);
});
