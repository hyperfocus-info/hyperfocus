import { expect, test } from "bun:test";
import { createRigidWorld3D } from "./rigid-3d.ts";

test("controlled 1,000-body rigid-world performance gate", () => {
  const world = createRigidWorld3D({
    capacity: 1_000,
    maxContacts: 8_000,
    maxCandidatePairs: 32_000,
    gravityY: -9.81,
    velocityIterations: 2,
    positionIterations: 1,
  });
  for (let index = 0; index < 1_000; index += 1) {
    const x = index % 20;
    const z = Math.floor(index / 20) % 20;
    const y = Math.floor(index / 400) * 3 + 1;
    world.addBody({
      id: `body-${index}`,
      type: index < 400 ? "static" : "dynamic",
      shape: index % 2 === 0 ? { kind: "box", halfX: 0.4, halfY: 0.4, halfZ: 0.4 } : { kind: "sphere", radius: 0.4 },
      x: x * 0.75,
      y,
      z: z * 0.75,
    });
  }
  for (let warmup = 0; warmup < 5; warmup += 1) world.step(0.016666666666666666);
  const started = performance.now();
  for (let step = 0; step < 30; step += 1) world.step(0.016666666666666666);
  const elapsedMs = performance.now() - started;
  expect(world.diagnostics.bodies).toBe(1_000);
  expect(world.diagnostics.candidateOverflows).toBe(0);
  expect(world.diagnostics.contactOverflows).toBe(0);
  expect(elapsedMs).toBeLessThan(1_000);
});
