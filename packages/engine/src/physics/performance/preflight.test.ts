import { expect, test } from "bun:test";
import { createPhysicalPerformanceRuntime3D, preflightPhysicalPerformance3D, type PhysicalPerformance3D } from "../physical-performance-3d.ts";

function performance(): PhysicalPerformance3D {
  return { frameRate: 30, durationFrames: 3, ragdolls: [{ id: "actor", rootBoneId: "root", activationFrame: 1,
    bodies: [{ boneId: "root", body: { shape: { kind: "sphere", radius: .25 }, y: 2 } }], joints: [], initialPose: { rotations: [] } }], cues: [] };
}

test("preflight resolves owned references while preserving the authored definition and delayed activation", () => {
  const definition = performance(), before = structuredClone(definition);
  const first = preflightPhysicalPerformance3D({ performance: definition });
  const second = preflightPhysicalPerformance3D({ performance: definition });
  expect(first.bodyReferences).toEqual([{ ragdollId: "actor", boneId: "root" }]);
  expect(first.bodyReferences === second.bodyReferences).toBe(false);
  expect(first.bodyReferences[0] === second.bodyReferences[0]).toBe(false);
  const runtime = createPhysicalPerformanceRuntime3D({ performance: definition });
  expect(runtime.world.body("actor:root")?.type).toBe("kinematic");
  expect(runtime.world.body("actor:root")?.collisionMask).toBe(0);
  runtime.stepFrame();
  expect(runtime.world.body("actor:root")?.y).toBe(2);
  runtime.stepFrame();
  expect(runtime.world.body("actor:root")?.type).toBe("dynamic");
  expect(definition).toEqual(before);
});

test("preflight preserves initialization quality, topology, output and cue errors", () => {
  expect(() => preflightPhysicalPerformance3D({ performance: { ...performance(), quality: { maximumPenetrationMeters: -1 } } })).toThrow("maximumPenetrationMeters must be a positive finite number.");
  const missingRoot = performance(); missingRoot.ragdolls[0]!.rootBoneId = "missing";
  expect(() => preflightPhysicalPerformance3D({ performance: missingRoot })).toThrow(/root/);
  expect(() => preflightPhysicalPerformance3D({ performance: { ...performance(), outputs: [{ bodyId: "missing" }] } })).toThrow("Physical body missing does not exist.");
  const missingCue = performance(); missingCue.cues = [{ id: "pose", kind: "pose", frame: 0, ragdollId: "missing", pose: { rotations: [] } }];
  expect(() => preflightPhysicalPerformance3D({ performance: missingCue })).toThrow(/missing/);
});
