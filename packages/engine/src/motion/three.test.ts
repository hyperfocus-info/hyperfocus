import { expect, test } from "bun:test";
import { Bone, Object3D, Skeleton } from "three";
import {
  compileThreeHumanoidRig,
  createThreeHumanoidMotionController,
  describeThreeSkeleton,
} from "./three.ts";

function createThreeHumanoidFixture() {
  const root = new Object3D();
  const hips = bone("Hips", 0, 0.9, 0);
  const spine = bone("Spine", 0, 0.2, 0);
  const chest = bone("Chest", 0, 0.22, 0);
  const neck = bone("Neck", 0, 0.18, 0);
  const head = bone("Head", 0, 0.18, 0);
  const leftUpperLeg = bone("LeftUpLeg", -0.14, -0.15, 0);
  const leftLowerLeg = bone("LeftLeg", 0, -0.38, 0);
  const leftFoot = bone("LeftFoot", 0, -0.38, 0.04);
  const rightUpperLeg = bone("RightUpLeg", 0.14, -0.15, 0);
  const rightLowerLeg = bone("RightLeg", 0, -0.38, 0);
  const rightFoot = bone("RightFoot", 0, -0.38, 0.04);
  const leftUpperArm = bone("LeftArm", -0.24, 0.08, 0);
  const leftLowerArm = bone("LeftForeArm", -0.32, 0, 0);
  const leftHand = bone("LeftHand", -0.3, 0, 0);
  const rightUpperArm = bone("RightArm", 0.24, 0.08, 0);
  const rightLowerArm = bone("RightForeArm", 0.32, 0, 0);
  const rightHand = bone("RightHand", 0.3, 0, 0);

  root.add(hips);
  hips.add(spine, leftUpperLeg, rightUpperLeg);
  spine.add(chest);
  chest.add(neck, leftUpperArm, rightUpperArm);
  neck.add(head);
  leftUpperLeg.add(leftLowerLeg);
  leftLowerLeg.add(leftFoot);
  rightUpperLeg.add(rightLowerLeg);
  rightLowerLeg.add(rightFoot);
  leftUpperArm.add(leftLowerArm);
  leftLowerArm.add(leftHand);
  rightUpperArm.add(rightLowerArm);
  rightLowerArm.add(rightHand);
  const bones = [
    hips,
    spine,
    chest,
    neck,
    head,
    leftUpperLeg,
    leftLowerLeg,
    leftFoot,
    rightUpperLeg,
    rightLowerLeg,
    rightFoot,
    leftUpperArm,
    leftLowerArm,
    leftHand,
    rightUpperArm,
    rightLowerArm,
    rightHand,
  ];
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  skeleton.calculateInverses();
  return { root, skeleton, bones };
}

test("Three skeleton description fingerprints names separately from stable structure", () => {
  const fixture = createThreeHumanoidFixture();
  const before = describeThreeSkeleton(fixture.skeleton);
  for (const [index, joint] of fixture.bones.entries()) joint.name = `opaque_${index}`;
  const after = describeThreeSkeleton(fixture.skeleton);

  expect(after.assetFingerprint.value).not.toBe(before.assetFingerprint.value);
  expect(after.skinFingerprint).toEqual(before.skinFingerprint);
  expect(after.bones.map((joint) => joint.skinJointOrdinal)).toEqual(before.bones.map((joint) => joint.skinJointOrdinal));
  expect(after.normalization).toEqual({
    sourceUp: "+y",
    sourceForward: "+z",
    sourceHandedness: "right",
    metersPerUnit: 1,
    sourceToCanonicalRotation: [0, 0, 0, 1],
  });
});

test("Three rig compilation auto-maps a zero-clip humanoid without mutating names", () => {
  const fixture = createThreeHumanoidFixture();
  const names = fixture.bones.map((joint) => joint.name);
  const compilation = compileThreeHumanoidRig(fixture.skeleton);

  expect(compilation.rig.validated).toBe(true);
  expect(compilation.rig.capabilities.leftFootPlant).toBe(true);
  expect(compilation.rig.capabilities.rightReach).toBe(true);
  expect(fixture.bones.map((joint) => joint.name)).toEqual(names);
  expect(compilation.document.mapperVersion).toBe("1.0.4");
  expect(compilation.document.humanoidPreset).toBe("humanoid-v1");
});

test("persisted .t3rig evidence reconciles after every Three bone is renamed", () => {
  const fixture = createThreeHumanoidFixture();
  const initial = compileThreeHumanoidRig(fixture.skeleton);
  for (const [index, joint] of fixture.bones.entries()) joint.name = `joint_${index}`;
  const reconciled = compileThreeHumanoidRig(fixture.skeleton, { t3rig: initial.document });

  expect(reconciled.reconciled).toBe(true);
  expect(reconciled.rig.validated).toBe(true);
  expect(reconciled.rig.capabilities.leftFootPlant).toBe(true);
  expect(reconciled.document.semantics.hips?.boneIndex).toBe(0);
});

test("Three beginner facade drives MotionRoot and uploads a finite semantic pose", () => {
  const fixture = createThreeHumanoidFixture();
  const player = createThreeHumanoidMotionController({ root: fixture.root, skeleton: fixture.skeleton });
  const pose = player.state.pose;
  player.move([0, 0, 2]);
  for (let frame = 0; frame < 60; frame += 1) player.update(0.016666666666666666);

  expect(player.state.pose).toBe(pose);
  expect(fixture.root.position.z).toBeGreaterThan(1.5);
  expect(fixture.root.position.z).toBeCloseTo(player.state.motor.position.z, 5);
  expect(fixture.bones.every((joint) => [
    joint.position.x,
    joint.position.y,
    joint.position.z,
    joint.quaternion.x,
    joint.quaternion.y,
    joint.quaternion.z,
    joint.quaternion.w,
  ].every(Number.isFinite))).toBe(true);
  expect(player.state.metrics.footSlipDistance).toBeLessThan(0.02);
});

function bone(name: string, x: number, y: number, z: number) {
  const joint = new Bone();
  joint.name = name;
  joint.position.set(x, y, z);
  return joint;
}
