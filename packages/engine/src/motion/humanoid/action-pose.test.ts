import { expect, test } from "bun:test";
import { createHumanoidActionPoseRecipe, inferHumanoidActionPoseEffector, resolveHumanoidActionPoseBones, sampleHumanoidActionPoseLobeWeight } from "./action-pose.ts";

test("canonical action pose is deterministic, smooth, and returns to ready", () => {
  const first = createHumanoidActionPoseRecipe({ style: "straight", effector: "right-hand", power: 1.2 });
  const second = createHumanoidActionPoseRecipe({ style: "straight", effector: "right-hand", power: 1.2 });
  expect(first).toEqual(second);
  const contact = first.lobes.find((lobe) => lobe.semantic === "chest" && lobe.peakPhase === .62)!;
  expect(sampleHumanoidActionPoseLobeWeight(contact, 0)).toBe(0);
  expect(sampleHumanoidActionPoseLobeWeight(contact, contact.peakPhase)).toBe(1);
  expect(sampleHumanoidActionPoseLobeWeight(contact, 1)).toBe(0);
  expect(sampleHumanoidActionPoseLobeWeight(contact, .5)).toBeGreaterThan(0);
});

test("left and right effectors mirror body torque", () => {
  const left = createHumanoidActionPoseRecipe({ style: "hook", effector: "left-hand" });
  const right = createHumanoidActionPoseRecipe({ style: "hook", effector: "right-hand" });
  const leftContact = left.lobes.find((lobe) => lobe.semantic === "chest" && lobe.peakPhase === .62)!;
  const rightContact = right.lobes.find((lobe) => lobe.semantic === "chest" && lobe.peakPhase === .62)!;
  expect(leftContact.rotationEulerDegrees[1]).toBe(-rightContact.rotationEulerDegrees[1]);
  expect(leftContact.rotationEulerDegrees[2]).toBe(-rightContact.rotationEulerDegrees[2]);
});

test("straight punches sequence the guarded torso and grounded kinetic chain", () => {
  const recipe = createHumanoidActionPoseRecipe({ style: "straight", effector: "right-hand" });
  const at = (semantic: (typeof recipe.lobes)[number]["semantic"], phase: number) => recipe.lobes.find((lobe) => lobe.semantic === semantic && lobe.peakPhase === phase);
  const chainYaw = (phase: number) => (["hips", "spine", "chest", "upperChest"] as const).reduce((sum, semantic) => sum + at(semantic, phase)!.rotationEulerDegrees[1], 0);
  expect(chainYaw(.25)).toBeCloseTo(24);
  expect(chainYaw(.62)).toBeCloseTo(55);
  expect(chainYaw(.82)).toBeCloseTo(50);
  expect(at("hips", .62)!.rotationEulerDegrees[1]).toBeLessThan(at("upperChest", .62)!.rotationEulerDegrees[1]);
  expect(at("leftUpperArm", .62)!.rotationEulerDegrees[1]).toBeGreaterThan(0);
  expect(at("rightUpperLeg", .62)!.rotationEulerDegrees[1]).toBeGreaterThan(0);
  expect(at("rightLowerLeg", .62)!.rotationEulerDegrees[0]).toBeGreaterThan(0);
  expect(at("rightFoot", .62)!.rotationEulerDegrees[1]).toBeGreaterThan(0);
  expect(at("rightFoot", .62)!.rotationEulerDegrees[0]).toBeGreaterThan(at("rightUpperLeg", .62)!.rotationEulerDegrees[0]);
  expect(at("rightFoot", .82)!.rotationEulerDegrees[1]).toBeGreaterThan(0);
});

test("portable bone resolution diagnoses unsupported body recipes", () => {
  const complete = resolveHumanoidActionPoseBones(["mixamorig:Hips", "Spine", "Chest", "LeftShoulder", "RightShoulder", "Head"]);
  expect(complete.supported).toBe(true);
  expect(complete.bones.hips).toBe("mixamorig:Hips");
  const incomplete = resolveHumanoidActionPoseBones(["Root", "Hand.R"]);
  expect(incomplete.supported).toBe(false);
  expect(incomplete.missing).toEqual(["hips", "spine", "chest"]);
  expect(inferHumanoidActionPoseEffector("mixamorig:RightHand")).toBe("right-hand");
});

test("action pose rejects non-finite or unreasonable power", () => {
  expect(() => createHumanoidActionPoseRecipe({ style: "straight", effector: "right-hand", power: Number.NaN })).toThrow("finite");
  expect(() => createHumanoidActionPoseRecipe({ style: "straight", effector: "right-hand", power: 3 })).toThrow("0.1 through 2");
});
