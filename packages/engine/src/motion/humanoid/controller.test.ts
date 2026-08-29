import { expect, test } from "bun:test";
import { createCharacterMotor3D } from "../../physics/3d.ts";
import { createPoseBuffer, createPoseBufferLayout } from "../pose-buffer.ts";
import { humanoidSemantics, type CompiledSemanticRig, type HumanoidSemantic } from "../rig.ts";
import { createWorldPose, evaluateWorldPose } from "../solvers/world-pose.ts";
import { createHumanoidMotionController } from "./controller.ts";

const boneCount = 17;
const motionRootIndex = boneCount;
const totalCount = boneCount + 1;

function createHumanoidTestRig(options: { incompleteLeftLeg?: boolean } = {}): CompiledSemanticRig {
  const parents = new Int32Array([
    -1, // hips
    0, // spine
    1, // chest
    2, // neck
    3, // head
    0, 5, 6, // left leg
    0, 8, 9, // right leg
    2, 11, 12, // left arm
    2, 14, 15, // right arm
  ]);
  const semanticParents = new Int32Array(totalCount);
  semanticParents.set(parents);
  semanticParents[0] = motionRootIndex;
  semanticParents[motionRootIndex] = -1;
  const evaluationOrder = new Uint32Array([17, 0, 1, 5, 8, 2, 6, 9, 3, 11, 14, 7, 10, 4, 12, 15, 13, 16]);
  const rotations = new Float32Array(totalCount * 4);
  for (let index = 0; index < totalCount; index += 1) rotations[index * 4 + 3] = 1;
  const translations = new Float32Array(totalCount * 3);
  setTranslation(translations, 0, 0, 0.9, 0);
  setTranslation(translations, 1, 0, 0.2, 0);
  setTranslation(translations, 2, 0, 0.22, 0);
  setTranslation(translations, 3, 0, 0.18, 0);
  setTranslation(translations, 4, 0, 0.18, 0);
  setTranslation(translations, 5, 0.14, -0.15, 0);
  setTranslation(translations, 6, 0, -0.38, 0);
  setTranslation(translations, 7, 0, -0.38, 0.04);
  setTranslation(translations, 8, -0.14, -0.15, 0);
  setTranslation(translations, 9, 0, -0.38, 0);
  setTranslation(translations, 10, 0, -0.38, 0.04);
  setTranslation(translations, 11, 0.24, 0.08, 0);
  setTranslation(translations, 12, 0.32, 0, 0);
  setTranslation(translations, 13, 0.3, 0, 0);
  setTranslation(translations, 14, -0.24, 0.08, 0);
  setTranslation(translations, 15, -0.32, 0, 0);
  setTranslation(translations, 16, -0.3, 0, 0);
  const semanticIndices = new Int32Array(humanoidSemantics.length);
  semanticIndices.fill(-1);
  const mapped: Partial<Record<HumanoidSemantic, number>> = {
    hips: 0,
    spine: 1,
    chest: 2,
    neck: 3,
    head: 4,
    leftUpperLeg: 5,
    leftLowerLeg: options.incompleteLeftLeg ? undefined : 6,
    leftFoot: 7,
    rightUpperLeg: 8,
    rightLowerLeg: 9,
    rightFoot: 10,
    leftUpperArm: 11,
    leftLowerArm: 12,
    leftHand: 13,
    rightUpperArm: 14,
    rightLowerArm: 15,
    rightHand: 16,
  };
  for (const [semantic, index] of Object.entries(mapped)) {
    if (index !== undefined) semanticIndices[humanoidSemantics.findIndex((candidate) => candidate === semantic)] = index;
  }
  const scales = new Float32Array(totalCount * 3).fill(1);
  const completeLeftLeg = !options.incompleteLeftLeg;
  return {
    deformCount: boneCount,
    totalCount,
    motionRootIndex,
    sourceParents: parents,
    semanticParents,
    evaluationOrder,
    referenceRotations: rotations,
    referenceTranslations: translations,
    referenceScales: scales,
    sourceReferenceRotations: rotations.slice(0, boneCount * 4),
    sourceReferenceTranslations: translations.slice(0, boneCount * 3),
    sourceReferenceScales: scales.slice(0, boneCount * 3),
    semanticIndices,
    tags: new Map(),
    capabilities: {
      baseLocomotion: true,
      aim: true,
      leftArm: true,
      rightArm: true,
      leftLeg: completeLeftLeg,
      rightLeg: true,
      leftReach: true,
      rightReach: true,
      leftFootPlant: completeLeftLeg,
      rightFootPlant: true,
    },
    diagnostics: completeLeftLeg ? [] : [{
      code: "capability-disabled",
      message: "Left foot-planting is disabled because the leg chain is incomplete",
      severity: "warning",
      feature: "leftFootPlant",
    }],
    validated: completeLeftLeg,
  };
}

test("beginner controller turns player.move(m/s) into planted procedural locomotion", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  const pose = controller.state.pose;
  controller.move([0, 0, 2]);
  for (let frame = 0; frame < 90; frame += 1) controller.update(1 / 60);

  expect(controller.state.pose).toBe(pose);
  expect(controller.state.motor.position.z).toBeGreaterThan(2.5);
  expect(controller.state.motor.velocity.z).toBeCloseTo(2, 4);
  expect(controller.state.locomotion.gaitCycle).toBeGreaterThan(1);
  expect(controller.state.metrics.poseFinite).toBe(true);
  expect(controller.state.metrics.footSlipDistance).toBeLessThan(0.02);
  expect(controller.state.metrics.plantedVerticalError).toBeLessThan(0.002);
  expect(controller.state.pose.translations[motionRootIndex * 3 + 2]).toBeCloseTo(controller.state.motor.position.z, 5);
  const velocity = controller.state.signals.get("velocity");
  if (!(velocity instanceof Float32Array)) throw new Error("Expected the controller velocity signal to be a Float32Array");
  expect(velocity[2]).toBeCloseTo(2, 4);
});

test("running produces a clear opposing arm swing instead of pinning the hands beside the hips", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({ rig });
  const world = createWorldPose(rig);
  let leftMinimum = Number.POSITIVE_INFINITY;
  let leftMaximum = Number.NEGATIVE_INFINITY;
  let rightMinimum = Number.POSITIVE_INFINITY;
  let rightMaximum = Number.NEGATIVE_INFINITY;
  controller.move([0, 0, 2]);

  for (let frame = 0; frame < 180; frame += 1) {
    controller.update(1 / 60);
    evaluateWorldPose(rig, controller.state.pose, world);
    const left = world.translations[13 * 3 + 2] - world.translations[11 * 3 + 2];
    const right = world.translations[16 * 3 + 2] - world.translations[14 * 3 + 2];
    leftMinimum = Math.min(leftMinimum, left);
    leftMaximum = Math.max(leftMaximum, left);
    rightMinimum = Math.min(rightMinimum, right);
    rightMaximum = Math.max(rightMaximum, right);
  }

  expect(leftMaximum - leftMinimum).toBeGreaterThan(0.22);
  expect(rightMaximum - rightMinimum).toBeGreaterThan(0.22);
});

test("world-space hand targets keep both hands on stable weapon grips", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({ rig });
  const world = createWorldPose(rig);
  const leftTarget = [0.3, 1.12, 0.42] as const;
  const rightTarget = [-0.3, 1.12, 0.32] as const;
  controller.setHandTargets(leftTarget, rightTarget, 1);
  controller.update(1 / 60);
  evaluateWorldPose(rig, controller.state.pose, world);

  expect(distanceAt(world.translations, 13, leftTarget)).toBeLessThan(0.01);
  expect(distanceAt(world.translations, 16, rightTarget)).toBeLessThan(0.01);
});

test("authored base poses preserve clip locomotion underneath semantic constraints", () => {
  const rig = createHumanoidTestRig();
  const base = createPoseBuffer(createPoseBufferLayout(rig.deformCount, rig.totalCount, { includeScales: true }));
  base.rotations.set(rig.referenceRotations);
  base.translations.set(rig.referenceTranslations);
  base.scales?.set(rig.referenceScales);
  const angle = 0.34;
  base.rotations[5 * 4] = Math.sin(angle * 0.5);
  base.rotations[5 * 4 + 3] = Math.cos(angle * 0.5);
  const controller = createHumanoidMotionController({ rig, proceduralBase: false });
  controller.setBasePose(base);
  controller.update(1 / 60);

  expect(controller.state.pose.rotations[5 * 4]).toBeCloseTo(base.rotations[5 * 4], 5);
  expect(controller.state.pose.rotations[5 * 4 + 3]).toBeCloseTo(base.rotations[5 * 4 + 3], 5);
});

test("planted feet stay within the acceptance gate while climbing stairs", () => {
  const tread = 0.4;
  const rise = 0.12;
  const controller = createHumanoidMotionController({
    rig: createHumanoidTestRig(),
    heightField: {
      heightAt(_x, z) {
        return Math.max(-5, Math.min(5, Math.floor((z + tread * 0.5) / tread))) * rise;
      },
    },
  });
  controller.move([0, 0, 1.632]);
  let maximumFootSlip = 0;
  let maximumPlantedVerticalError = 0;
  for (let frame = 0; frame < 180; frame += 1) {
    controller.update(1 / 60);
    maximumFootSlip = Math.max(maximumFootSlip, controller.state.metrics.footSlipDistance);
    maximumPlantedVerticalError = Math.max(
      maximumPlantedVerticalError,
      controller.state.metrics.plantedVerticalError,
    );
  }

  expect(maximumFootSlip).toBeLessThan(0.02);
  expect(maximumPlantedVerticalError).toBeLessThan(0.002);
  expect(controller.state.metrics.poseFinite).toBe(true);
});

test("extreme aim remains thoracic and never rotates the pelvis", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  controller.setAimTarget([0, 20, 2], 1);
  controller.update(1 / 60);
  const rotations = controller.state.pose.rotations;

  expect([...rotations.subarray(0, 4)]).toEqual([0, 0, 0, 1]);
  expect(Math.abs(rotations[2 * 4]) + Math.abs(rotations[2 * 4 + 1]) + Math.abs(rotations[2 * 4 + 2])).toBeGreaterThan(0.01);
  expect(controller.state.aim).not.toBeNull();
  expect(Math.abs(controller.state.aim!.pitch)).toBeLessThanOrEqual(Math.PI * 0.42 + 1e-6);
});

test("missing intermediate joints gate IK but preserve base motion and warnings", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig({ incompleteLeftLeg: true }) });
  controller.move([1.5, 0, 0]);
  for (let frame = 0; frame < 20; frame += 1) controller.update(1 / 60);

  expect(controller.state.leftFoot).toBeNull();
  expect(controller.state.rightFoot).not.toBeNull();
  expect(controller.state.capabilities.leftFootPlant).toBe(false);
  expect(controller.state.diagnostics[0]?.message).toContain("disabled");
  expect(controller.state.pose.rotations[5 * 4 + 3]).not.toBe(1);
  expect(controller.state.metrics.poseFinite).toBe(true);
});

test("controller can use one caller-owned shared pose memory buffer", () => {
  const rig = createHumanoidTestRig();
  const byteLength = rig.totalCount * (4 + 3 + 3) * Float32Array.BYTES_PER_ELEMENT;
  const memory = new SharedArrayBuffer(byteLength);
  const controller = createHumanoidMotionController({ rig, memory });
  controller.update(1 / 60);

  expect(controller.state.pose.buffer).toBe(memory);
  expect(controller.state.pose.rotations.buffer).toBe(memory);
  expect(controller.state.pose.translations.buffer).toBe(memory);
  expect(controller.state.pose.scales?.buffer).toBe(memory);
});

test("resolved root motion feeds the accepted collision delta back into signals", () => {
  const motor = createCharacterMotor3D({
    resolveDisplacement(query) {
      return {
        delta: [Math.min(0.25, query.requestedDelta.x), query.requestedDelta.y, query.requestedDelta.z],
        grounded: true,
      };
    },
  });
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig(), motor });
  controller.requestRootMotion([2, 0, 0]);
  controller.update(1 / 60);

  expect(controller.state.motor.position.x).toBeCloseTo(0.25, 6);
  const resolvedRootDelta = controller.state.signals.get("resolvedRootDelta");
  if (!(resolvedRootDelta instanceof Float32Array)) throw new Error("Expected the resolved root delta signal to be a Float32Array");
  expect(resolvedRootDelta[0]).toBeCloseTo(0.25, 6);
  expect(controller.state.pose.translations[motionRootIndex * 3]).toBeCloseTo(0.25, 6);
});

test("airborne controller frames skip terrain constraints and reacquire them after landing", () => {
  let grounded = true;
  let raycasts = 0;
  const motor = createCharacterMotor3D({
    resolveDisplacement(query) {
      return { delta: query.requestedDelta, grounded };
    },
  });
  const controller = createHumanoidMotionController({
    rig: createHumanoidTestRig(),
    motor,
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
  });
  controller.move([0, 0, 1]);
  controller.update(1 / 60);
  expect(raycasts).toBe(2);

  grounded = false;
  controller.move([0, 4, 1]);
  controller.update(1 / 60);
  expect(raycasts).toBe(2);
  expect(controller.state.leftFoot?.planted).toBe(false);
  expect(controller.state.leftFoot?.hit).toBe(false);
  expect(controller.state.rightFoot?.planted).toBe(false);
  expect(controller.state.rightFoot?.hit).toBe(false);
  expect(controller.state.metrics.footSlipDistance).toBe(0);
  expect(controller.state.metrics.plantedVerticalError).toBe(0);
  expect(controller.state.locomotion.motionPhase).toBe("jump");

  controller.move([0, -2, 1]);
  controller.update(1 / 60);
  expect(controller.state.locomotion.motionPhase).toBe("fall");

  grounded = true;
  controller.update(1 / 60);
  expect(raycasts).toBe(4);
  expect(controller.state.locomotion.motionPhase).toBe("land");
  expect(controller.state.locomotion.landingWeight).toBeGreaterThan(0);
});

function setTranslation(buffer: Float32Array, index: number, x: number, y: number, z: number) {
  buffer[index * 3] = x;
  buffer[index * 3 + 1] = y;
  buffer[index * 3 + 2] = z;
}

function distanceAt(positions: ArrayLike<number>, index: number, target: ArrayLike<number>) {
  const offset = index * 3;
  return Math.hypot(
    positions[offset] - target[0],
    positions[offset + 1] - target[1],
    positions[offset + 2] - target[2],
  );
}
