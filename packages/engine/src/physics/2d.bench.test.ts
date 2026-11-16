import { expect, test } from "bun:test";
import { createPhysicsWorld2D } from "./2d.ts";

test("2D physics keeps 2,000 bounded bodies under the broadphase frame gate", () => {
  const bodyCount = 2_000;
  const world = createPhysicsWorld2D({ capacity: bodyCount, maxContacts: bodyCount * 2, maxJoints: 0, gravityY: 0 });
  for (let index = 0; index < bodyCount; index += 1) {
    const shape = index % 2
      ? { kind: "circle" as const, radius: 0.25 }
      : { kind: "box" as const, halfWidth: 0.25, halfHeight: 0.25 };
    world.addBody({
      id: `body-${index}`,
      shape,
      x: index * 2,
      y: index % 7,
      velocityX: (index % 3 - 1) * 0.1,
    });
  }
  for (let frame = 0; frame < 30; frame += 1) world.step(0.016666666666666666);
  const samples: number[] = [];
  for (let frame = 0; frame < 240; frame += 1) {
    const start = performance.now();
    world.step(0.016666666666666666);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  // Deliberately generous across CI hardware; typical desktop measurements are
  // below 1 ms. This catches accidental quadratic/allocation-heavy regressions.
  expect(p95).toBeLessThan(8);
  // 462,024 existing bytes plus four generation bytes for each of 2,000 bodies.
  expect(world.numericStorageBytes).toBeLessThanOrEqual(470_024);
  expect(world.diagnostics.steps).toBe(270);
});
