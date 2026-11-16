import { describe, expect, test } from "bun:test";
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";
import type { MotionLabFixtureEntry, MotionLabFixtureId } from "./fixture-repository.ts";
import { createMotionPreviewAdapter } from "./motion-integration.ts";
import { resolveLabSignals } from "./scenarios.ts";

type TestRig = {
  actorRoot: Group;
  canonicalJointNames: string[];
  fixture: MotionLabFixtureEntry;
  rigRoot: Group;
};

function addBone(bones: Bone[], name: string, parent: Bone | SkinnedMesh, x: number, y: number, z: number): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.set(x, y, z);
  parent.add(bone);
  bones.push(bone);
  return bone;
}

function createTestRig(completeLimbs: boolean, renameBones = false): TestRig {
  const actorRoot = new Group();
  const rigRoot = new Group();
  actorRoot.add(rigRoot);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    -0.1, 0, 0,
    0.1, 0, 0,
    0, 1.8, 0,
  ], 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ], 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([
    1, 0, 0, 0,
    1, 0, 0, 0,
    1, 0, 0, 0,
  ], 4));
  const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.name = "HumanoidMesh";
  rigRoot.add(mesh);

  const bones: Bone[] = [];
  const hips = addBone(bones, "Hips", mesh, 0, 0.95, 0);
  const spine = addBone(bones, "Spine", hips, 0, 0.23, 0);
  const chest = addBone(bones, "Chest", spine, 0, 0.22, 0);
  const upperChest = addBone(bones, "UpperChest", chest, 0, 0.18, 0);
  const neck = addBone(bones, "Neck", upperChest, 0, 0.12, 0);
  addBone(bones, "Head", neck, 0, 0.17, 0);

  const leftShoulder = addBone(bones, "LeftShoulder", upperChest, 0.13, 0.08, 0);
  const leftArm = addBone(bones, "LeftArm", leftShoulder, 0.22, 0, 0);
  const leftArmParent = completeLimbs ? addBone(bones, "LeftForeArm", leftArm, 0.25, 0, 0) : leftArm;
  addBone(bones, "LeftHand", leftArmParent, 0.22, 0, 0);

  const rightShoulder = addBone(bones, "RightShoulder", upperChest, -0.13, 0.08, 0);
  const rightArm = addBone(bones, "RightArm", rightShoulder, -0.22, 0, 0);
  const rightArmParent = completeLimbs ? addBone(bones, "RightForeArm", rightArm, -0.25, 0, 0) : rightArm;
  addBone(bones, "RightHand", rightArmParent, -0.22, 0, 0);

  const leftUpLeg = addBone(bones, "LeftUpLeg", hips, 0.09, -0.08, 0);
  const leftLegParent = completeLimbs ? addBone(bones, "LeftLeg", leftUpLeg, 0, -0.43, 0) : leftUpLeg;
  addBone(bones, "LeftFoot", leftLegParent, 0, -0.42, 0.08);
  const rightUpLeg = addBone(bones, "RightUpLeg", hips, -0.09, -0.08, 0);
  const rightLegParent = completeLimbs ? addBone(bones, "RightLeg", rightUpLeg, 0, -0.43, 0) : rightUpLeg;
  addBone(bones, "RightFoot", rightLegParent, 0, -0.42, 0.08);

  const canonicalJointNames = bones.map((bone) => bone.name);
  if (renameBones) bones.forEach((bone, index) => { bone.name = `joint_${index.toString().padStart(2, "0")}`; });
  mesh.bind(new Skeleton(bones));
  actorRoot.updateMatrixWorld(true);

  const fixture: MotionLabFixtureEntry = {
    byteLength: 1,
    expected: {
      completeArmChains: completeLimbs,
      completeLegChains: completeLimbs,
      extraBonePassthrough: false,
      nameBasedMapping: !renameBones,
    },
    file: "fixtures/test.glb",
    id: renameBones ? "renamed-bones" : completeLimbs ? "canonical" : "incomplete",
    inspection: {
      animations: 0,
      jointNames: canonicalJointNames,
      joints: bones.length,
      nodeNames: [],
    },
    sha256: "test",
    transform: "test fixture",
  };
  return { actorRoot, canonicalJointNames, fixture, rigRoot };
}

function adapterFor(rig: TestRig, fixtureId: MotionLabFixtureId) {
  return createMotionPreviewAdapter({
    actorRoot: rig.actorRoot,
    canonicalJointNames: rig.canonicalJointNames,
    fixture: rig.fixture,
    fixtureId,
    rigRoot: rig.rigRoot,
  });
}

describe("motion laboratory integration seam", () => {
  test("fixed-step procedural motion resets to the same pose checksum", () => {
    const rig = createTestRig(true);
    const adapter = adapterFor(rig, "canonical");
    const signals = resolveLabSignals("forward", { speedMetersPerSecond: 2.4 });
    for (let step = 0; step < 90; step += 1) adapter.step(0.016666666666666666, signals);
    const first = adapter.snapshot();

    adapter.reset();
    for (let step = 0; step < 90; step += 1) adapter.step(0.016666666666666666, signals);
    const second = adapter.snapshot();

    expect(first.metrics.poseChecksum).toBe(second.metrics.poseChecksum);
    expect(first.metrics.gaitPhase).toBeCloseTo(second.metrics.gaitPhase, 12);
    expect(second.metrics.gaitPhase).toBeGreaterThan(0);
    expect(second.metrics.nanCount).toBe(0);
    expect(second.metrics.footSlipMeters).toBeLessThan(0.02);
    expect(second.metrics.plantedVerticalErrorMeters).toBeLessThanOrEqual(1e-4);
    expect(second.capabilities.footPlanting).toBe(true);
    expect(second.warnings).toEqual([]);
  });

  test("incomplete intermediate joints gate IK while preserving base locomotion", () => {
    const rig = createTestRig(false);
    const adapter = adapterFor(rig, "incomplete");
    adapter.step(0.016666666666666666, resolveLabSignals("strafe"));
    const snapshot = adapter.snapshot();

    expect(snapshot.capabilities.proceduralLocomotion).toBe(true);
    expect(snapshot.capabilities.footPlanting).toBe(false);
    expect(snapshot.capabilities.armReach).toBe(false);
    expect(snapshot.metrics.footSlipMeters).toBeNull();
    expect(snapshot.metrics.plantedVerticalErrorMeters).toBeNull();
    expect(snapshot.metrics.nanCount).toBe(0);
    expect(snapshot.warnings).toHaveLength(4);
    expect(snapshot.warnings.join(" ")).toContain("foot-planting is disabled");
    expect(snapshot.warnings.join(" ")).toContain("reaching is disabled");
  });

  test("renamed joints map by stable skin ordinal and remain reviewable", () => {
    const rig = createTestRig(true, true);
    const adapter = adapterFor(rig, "renamed-bones");
    adapter.step(0.016666666666666666, resolveLabSignals("aim"));
    const snapshot = adapter.snapshot();

    expect(snapshot.capabilities.proceduralLocomotion).toBe(true);
    expect(snapshot.capabilities.aim).toBe(true);
    expect(snapshot.capabilities.mappingValidated).toBe(false);
    expect(snapshot.warnings).toHaveLength(1);
    expect(snapshot.warnings[0]).toContain("Topology-based assignments");
    expect(snapshot.metrics.nanCount).toBe(0);
  });
});
