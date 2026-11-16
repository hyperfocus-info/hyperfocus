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
  for (let frame = 0; frame < 90; frame += 1) controller.update(0.016666666666666666);

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

test("pace intent transitions from planted walking into a longer faster sprint without transform keys", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "walk" });
  let walkStride = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    controller.update(0.016666666666666666);
    walkStride = Math.max(walkStride, Math.abs(controller.state.locomotion.left.footForward));
  }
  const walkSpeed = controller.state.motor.velocity.z;
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  let maximumSlip = 0, sprintStride = 0, sprintContactFrames = 0;
  for (let frame = 0; frame < 90; frame += 1) {
    controller.update(0.016666666666666666);
    maximumSlip = Math.max(maximumSlip, controller.state.metrics.footSlipDistance);
    sprintStride = Math.max(sprintStride, Math.abs(controller.state.locomotion.left.footForward));
    if (controller.state.leftFoot?.planted || controller.state.rightFoot?.planted) sprintContactFrames += 1;
  }
  expect(controller.state.locomotion.pace).toBe("sprint");
  expect(controller.state.motor.velocity.z).toBeGreaterThan(walkSpeed * 3);
  expect(sprintStride).toBeGreaterThan(walkStride);
  expect(sprintContactFrames).toBeGreaterThan(35);
  expect(maximumSlip).toBeLessThan(.02);
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
    controller.update(0.016666666666666666);
    evaluateWorldPose(rig, controller.state.pose, world);
    const left = world.translations[41] - world.translations[35];
    const right = world.translations[50] - world.translations[44];
    leftMinimum = Math.min(leftMinimum, left);
    leftMaximum = Math.max(leftMaximum, left);
    rightMinimum = Math.min(rightMinimum, right);
    rightMaximum = Math.max(rightMaximum, right);
  }

  expect(leftMaximum - leftMinimum).toBeGreaterThan(0.22);
  expect(rightMaximum - rightMinimum).toBeGreaterThan(0.22);
});

test("walking keeps a readable opposing arm pendulum and resumes it after a punch", () => {
  const rig = createHumanoidTestRig(), controller = createHumanoidMotionController({ rig }), world = createWorldPose(rig);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "walk" });
  const sampleSwing = (frames: number) => {
    let leftMinimum = Number.POSITIVE_INFINITY, leftMaximum = Number.NEGATIVE_INFINITY;
    let rightMinimum = Number.POSITIVE_INFINITY, rightMaximum = Number.NEGATIVE_INFINITY, opposingFrames = 0;
    let readableLimbFrames = 0, contralateralLimbFrames = 0, minimumElbowAngle = 180, maximumElbowAngle = 0;
    for (let frame = 0; frame < frames; frame += 1) {
      controller.update(0.016666666666666666); evaluateWorldPose(rig, controller.state.pose, world);
      const left = world.translations[41]! - world.translations[35]!;
      const right = world.translations[50]! - world.translations[44]!;
      leftMinimum = Math.min(leftMinimum, left); leftMaximum = Math.max(leftMaximum, left);
      rightMinimum = Math.min(rightMinimum, right); rightMaximum = Math.max(rightMaximum, right);
      if (Math.abs(left - right) > .12 && Math.sign(left) !== Math.sign(right)) opposingFrames += 1;
      for (const [hand, foot] of [[left, world.translations[23]! - world.translations[17]!], [right, world.translations[32]! - world.translations[26]!]]) {
        if (Math.abs(hand) <= .06 || Math.abs(foot) <= .06) continue;
        readableLimbFrames += 1;
        if (Math.sign(hand) !== Math.sign(foot)) contralateralLimbFrames += 1;
      }
      for (const [shoulder, elbow, hand] of [[11, 12, 13], [14, 15, 16]] as const) {
        const angle = jointAngleDegrees(world.translations, shoulder, elbow, hand);
        minimumElbowAngle = Math.min(minimumElbowAngle, angle);
        maximumElbowAngle = Math.max(maximumElbowAngle, angle);
      }
    }
    return { leftRange: leftMaximum - leftMinimum, rightRange: rightMaximum - rightMinimum, opposingFrames, readableLimbFrames, contralateralLimbFrames, minimumElbowAngle, maximumElbowAngle };
  };

  const baseline = sampleSwing(180);
  expect(baseline.leftRange).toBeGreaterThan(.3);
  expect(baseline.rightRange).toBeGreaterThan(.3);
  expect(baseline.opposingFrames).toBeGreaterThan(45);
  expect(baseline.contralateralLimbFrames / baseline.readableLimbFrames).toBeGreaterThan(.9);
  expect(baseline.minimumElbowAngle).toBeGreaterThan(130);
  expect(baseline.maximumElbowAngle).toBeLessThan(158);

  controller.punch({ target: [-.3, 1.12, .45], hand: "right", style: "straight", speedMetersPerSecond: 8 });
  for (let frame = 0; frame < 180 && (controller.state.action.active || frame === 0); frame += 1) controller.update(0.016666666666666666);
  const resumed = sampleSwing(180);
  expect(resumed.leftRange).toBeGreaterThan(.3);
  expect(resumed.rightRange).toBeGreaterThan(.3);
  expect(resumed.opposingFrames).toBeGreaterThan(45);
  expect(resumed.contralateralLimbFrames / resumed.readableLimbFrames).toBeGreaterThan(.88);
  expect(resumed.minimumElbowAngle).toBeGreaterThan(130);
});

test("a one-hand intent overrides only that arm while the free arm keeps walking", () => {
  const rig = createHumanoidTestRig(), controller = createHumanoidMotionController({ rig }), world = createWorldPose(rig);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "walk" });
  for (let frame = 0; frame < 45; frame += 1) controller.update(0.016666666666666666);
  let leftMinimum = Infinity, leftMaximum = -Infinity, maximumRightError = 0;
  for (let frame = 0; frame < 120; frame += 1) {
    const rightTarget = [-.28, 1.18, controller.state.motor.position.z + .38] as const;
    controller.setHandTargets(null, rightTarget, 1);
    controller.update(0.016666666666666666); evaluateWorldPose(rig, controller.state.pose, world);
    const left = world.translations[41]! - world.translations[35]!;
    leftMinimum = Math.min(leftMinimum, left); leftMaximum = Math.max(leftMaximum, left);
    maximumRightError = Math.max(maximumRightError, distanceAt(world.translations, 16, rightTarget));
  }
  expect(leftMaximum - leftMinimum).toBeGreaterThan(.3);
  expect(maximumRightError).toBeLessThan(.04);
});

test("sprinting keeps both elbows compact without folding either hand into its shoulder", () => {
  const rig = createHumanoidTestRig(), controller = createHumanoidMotionController({ rig }), world = createWorldPose(rig);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  let shortest = Number.POSITIVE_INFINITY, longest = 0;
  for (let frame = 0; frame < 180; frame += 1) {
    controller.update(0.016666666666666666); evaluateWorldPose(rig, controller.state.pose, world);
    // Standing-to-sprint acceleration intentionally begins with the relaxed
    // hanging arm and blends into compact drive as physical speed builds.
    if (frame < 45) continue;
    for (const [shoulder, hand] of [[11, 13], [14, 16]] as const) {
      const distance = Math.hypot(world.translations[hand * 3] - world.translations[shoulder * 3], world.translations[hand * 3 + 1] - world.translations[shoulder * 3 + 1], world.translations[hand * 3 + 2] - world.translations[shoulder * 3 + 2]);
      shortest = Math.min(shortest, distance); longest = Math.max(longest, distance);
    }
  }
  expect(shortest).toBeGreaterThan(.34); expect(longest).toBeLessThan(.53);
});

test("sprinting matches the catalog hand-height cycle and keeps both hands in anatomical lanes", () => {
  const rig = createHumanoidTestRig(), controller = createHumanoidMotionController({ rig }), world = createWorldPose(rig);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  let readableFrames = 0, minimumLaneClearance = Number.POSITIVE_INFINITY, maximumHandSeparation = 0;
  let leftElbowMinimum = Number.POSITIVE_INFINITY, leftElbowMaximum = Number.NEGATIVE_INFINITY;
  let rightElbowMinimum = Number.POSITIVE_INFINITY, rightElbowMaximum = Number.NEGATIVE_INFINITY;
  for (let frame = 0; frame < 180; frame += 1) {
    controller.update(0.016666666666666666); evaluateWorldPose(rig, controller.state.pose, world);
    const leftX = world.translations[39]!, rightX = world.translations[48]!;
    const leftY = world.translations[40]!, rightY = world.translations[49]!;
    const leftZ = world.translations[41]!, rightZ = world.translations[50]!;
    minimumLaneClearance = Math.min(minimumLaneClearance, leftX, -rightX);
    maximumHandSeparation = Math.max(maximumHandSeparation, Math.abs(leftZ - rightZ));
    const leftElbowZ = world.translations[38]! - world.translations[35]!;
    const rightElbowZ = world.translations[47]! - world.translations[44]!;
    leftElbowMinimum = Math.min(leftElbowMinimum, leftElbowZ); leftElbowMaximum = Math.max(leftElbowMaximum, leftElbowZ);
    rightElbowMinimum = Math.min(rightElbowMinimum, rightElbowZ); rightElbowMaximum = Math.max(rightElbowMaximum, rightElbowZ);
    // The first three quarters of a second deliberately blend from relaxed
    // standing into the catalog sprint. Evaluate the sprint-specific height
    // relationship only after that physical acceleration window.
    if (frame >= 45 && Math.abs(leftZ - rightZ) > .18) {
      readableFrames += 1;
      expect(Math.sign(leftY - rightY)).toBe(-Math.sign(leftZ - rightZ));
    }
  }
  expect(readableFrames).toBeGreaterThan(45);
  expect(minimumLaneClearance).toBeGreaterThan(.12);
  expect(maximumHandSeparation).toBeGreaterThan(.38);
  expect(leftElbowMaximum - leftElbowMinimum).toBeGreaterThan(.18);
  expect(rightElbowMaximum - rightElbowMinimum).toBeGreaterThan(.18);
});

test("sprint posture leans farther into travel than walking posture", () => {
  const rig = createHumanoidTestRig(), world = createWorldPose(rig);
  const maximumLean = (pace: "walk" | "sprint") => {
    const controller = createHumanoidMotionController({ rig });
    controller.setLocomotionIntent({ direction: [0, 0, 1], pace });
    let maximum = Number.NEGATIVE_INFINITY;
    for (let frame = 0; frame < 180; frame += 1) {
      controller.update(0.016666666666666666); evaluateWorldPose(rig, controller.state.pose, world);
      maximum = Math.max(maximum, world.translations[14]! - world.translations[2]!);
    }
    return maximum;
  };
  expect(maximumLean("sprint")).toBeGreaterThan(maximumLean("walk") + .055);
});

test("shared action recipe adds smooth full-body mechanics and returns to ready", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({ rig, proceduralBase: false });
  controller.setAction("strike", 0);
  controller.setActionPose({ style: "straight", effector: "right-hand" });
  controller.update(0.016666666666666666);
  const ready = [...controller.state.pose.rotations];
  controller.setActionPhase(.62);
  controller.update(0.016666666666666666);
  const contact = [...controller.state.pose.rotations];
  expect(contact.slice(0, 12)).not.toEqual(ready.slice(0, 12));
  controller.setActionPhase(1);
  controller.update(0.016666666666666666);
  const recovered = [...controller.state.pose.rotations];
  for (let index = 0; index < recovered.length; index += 1) expect(recovered[index]).toBeCloseTo(ready[index]!, 5);
});

test("one target-aware punch intent produces wind-up, exact hand contact, follow-through, and smooth recovery", () => {
  const rig = createHumanoidTestRig(), controller = createHumanoidMotionController({ rig });
  const world = createWorldPose(rig), target = [-.3, 1.12, .32] as const;
  evaluateWorldPose(rig, controller.state.pose, world);
  const readyGuardHeight = world.translations[40]!;
  controller.punch({ target, hand: "right", style: "straight", speedMetersPerSecond: 8 });
  let minimumContactError = Number.POSITIVE_INFINITY, maximumGuardHeight = readyGuardHeight, sawWindup = false, sawFollowThrough = false;
  for (let frame = 0; frame < 180 && controller.state.action.active || frame === 0; frame += 1) {
    controller.update(0.016666666666666666);
    evaluateWorldPose(rig, controller.state.pose, world);
    const error = distanceAt(world.translations, 16, target);
    minimumContactError = Math.min(minimumContactError, error);
    if (controller.state.action.phase >= .28 && controller.state.action.phase <= .78) maximumGuardHeight = Math.max(maximumGuardHeight, world.translations[40]!);
    sawWindup ||= controller.state.action.phase >= .2 && controller.state.action.phase < .28;
    sawFollowThrough ||= controller.state.action.phase > .63 && controller.state.action.phase < .78;
  }
  expect(sawWindup).toBe(true);
  expect(sawFollowThrough).toBe(true);
  expect(minimumContactError).toBeLessThan(.012);
  expect(maximumGuardHeight).toBeGreaterThan(readyGuardHeight + .05);
  expect(controller.state.action.active).toBe(false);
  expect(controller.state.action.phase).toBeCloseTo(1, 5);
  expect(controller.state.metrics.poseFinite).toBe(true);
});

test("world-space hand targets keep both hands on stable weapon grips", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({ rig });
  const world = createWorldPose(rig);
  const leftTarget = [0.3, 1.12, 0.42] as const;
  const rightTarget = [-0.3, 1.12, 0.32] as const;
  controller.setHandTargets(leftTarget, rightTarget, 1);
  controller.update(0.016666666666666666);
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
  base.rotations[20] = Math.sin(angle * 0.5);
  base.rotations[23] = Math.cos(angle * 0.5);
  const controller = createHumanoidMotionController({ rig, proceduralBase: false });
  controller.setBasePose(base);
  controller.update(0.016666666666666666);

  expect(controller.state.pose.rotations[20]).toBeCloseTo(base.rotations[20], 5);
  expect(controller.state.pose.rotations[23]).toBeCloseTo(base.rotations[23], 5);
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
    controller.update(0.016666666666666666);
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

test("crouch intent lowers the body smoothly while both feet remain ground solved", () => {
  const rig = createHumanoidTestRig(), world = createWorldPose(rig);
  const controller = createHumanoidMotionController({ rig });
  evaluateWorldPose(rig, controller.state.pose, world);
  const uprightHeadY = world.translations[13]!;
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "walk", posture: "crouch" });
  let previousHeadY = uprightHeadY, maximumHeadStep = 0, maximumFootError = 0;
  for (let frame = 0; frame < 90; frame += 1) {
    controller.update(0.016666666666666666);
    evaluateWorldPose(rig, controller.state.pose, world);
    const headY = world.translations[13]!;
    maximumHeadStep = Math.max(maximumHeadStep, Math.abs(headY - previousHeadY));
    maximumFootError = Math.max(maximumFootError, controller.state.metrics.plantedVerticalError);
    previousHeadY = headY;
  }
  expect(uprightHeadY - previousHeadY).toBeGreaterThan(.18);
  expect(maximumHeadStep).toBeLessThan(.035);
  expect(maximumFootError).toBeLessThan(.003);
  expect(controller.state.locomotion.crouchWeight).toBeGreaterThan(.99);
});

test("uneven terrain cannot introduce a one-frame leg rotation discontinuity", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({
    rig,
    heightField: {
      heightAt(_x, z) {
        return Math.max(-3, Math.min(3, Math.floor((z + .2) / .4))) * .14;
      },
    },
  });
  const world = createWorldPose(rig);
  evaluateWorldPose(rig, controller.state.pose, world);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "walk" });
  let previous = world.rotations.slice();
  let maximumStepDegrees = 0;
  let maximumArmStepDegrees = 0;
  let previousLeftCalf = directionAt(world.translations, 6, 7), previousRightCalf = directionAt(world.translations, 9, 10);
  let previousLeftUp = quaternionUp(world.rotations, 7), previousRightUp = quaternionUp(world.rotations, 10);
  let maximumCalfDirectionStep = 0, maximumFootUpStep = 0;
  let minimumKneeAngleDegrees = 180;
  for (let frame = 0; frame < 240; frame += 1) {
    if (frame === 60) controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
    if (frame === 150) controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "jog" });
    controller.update(0.016666666666666666);
    evaluateWorldPose(rig, controller.state.pose, world);
    for (const joint of frame === 0 ? [] : [5, 6, 7, 8, 9, 10]) {
      maximumStepDegrees = Math.max(maximumStepDegrees, quaternionStepDegrees(previous, world.rotations, joint));
    }
    for (const joint of frame === 0 ? [] : [11, 12, 13, 14, 15, 16]) {
      maximumArmStepDegrees = Math.max(maximumArmStepDegrees, quaternionStepDegrees(previous, world.rotations, joint));
    }
    const leftCalf = directionAt(world.translations, 6, 7), rightCalf = directionAt(world.translations, 9, 10);
    const leftUp = quaternionUp(world.rotations, 7), rightUp = quaternionUp(world.rotations, 10);
    maximumCalfDirectionStep = Math.max(maximumCalfDirectionStep, vectorAngle(previousLeftCalf, leftCalf), vectorAngle(previousRightCalf, rightCalf));
    maximumFootUpStep = Math.max(maximumFootUpStep, vectorAngle(previousLeftUp, leftUp), vectorAngle(previousRightUp, rightUp));
    if (frame > 10 && !controller.state.leftFoot?.planted) minimumKneeAngleDegrees = Math.min(minimumKneeAngleDegrees, jointAngleDegrees(world.translations, 5, 6, 7));
    if (frame > 10 && !controller.state.rightFoot?.planted) minimumKneeAngleDegrees = Math.min(minimumKneeAngleDegrees, jointAngleDegrees(world.translations, 8, 9, 10));
    previousLeftCalf = leftCalf; previousRightCalf = rightCalf; previousLeftUp = leftUp; previousRightUp = rightUp;
    previous = world.rotations.slice();
  }
  expect(maximumStepDegrees).toBeLessThan(18);
  expect(maximumArmStepDegrees).toBeLessThan(18);
  expect(maximumCalfDirectionStep * 180 / Math.PI).toBeLessThan(18);
  expect(maximumFootUpStep * 180 / Math.PI).toBeLessThan(8);
  expect(minimumKneeAngleDegrees).toBeGreaterThan(55);
});

test("sprinting legs cannot fold through themselves when terrain rises near the hips", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({
    rig,
    ground: {
      raycast(origin, _direction, _options, out) {
        const hit = out ?? {
          point: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          distance: 0,
        };
        hit.point.x = "x" in origin ? origin.x : origin[0]!;
        hit.point.y = .45;
        hit.point.z = "z" in origin ? origin.z : origin[2]!;
        hit.normal.x = 0; hit.normal.y = 1; hit.normal.z = 0;
        hit.distance = Math.max(0, ("y" in origin ? origin.y : origin[1]!) - .45);
        return hit;
      },
    },
  });
  const world = createWorldPose(rig);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  let minimumKneeAngleDegrees = 180;
  for (let frame = 0; frame < 90; frame += 1) {
    controller.updateFromPhysics({
      deltaSeconds: 0.03333333333333333,
      position: [0, -.05, frame * .125],
      velocity: [0, 0, 3.75],
      resolvedRootDelta: [0, 0, .125],
      grounded: true,
      facing: [0, 0, 1],
    });
    evaluateWorldPose(rig, controller.state.pose, world);
    if (frame >= 15) minimumKneeAngleDegrees = Math.min(
      minimumKneeAngleDegrees,
      jointAngleDegrees(world.translations, 5, 6, 7),
      jointAngleDegrees(world.translations, 8, 9, 10),
    );
  }
  // A natural sprint may close the knee deeply, but the IK chain must retain
  // enough hip-to-foot reach to avoid the sub-30-degree hairpin failure.
  expect(minimumKneeAngleDegrees).toBeGreaterThan(45);
});

test("a near-hip swing target crosses the body without flipping the knee solution", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({
    rig,
    minimumLegReachRatio: .58,
    ground: {
      raycast(origin, _direction, _options, out) {
        const x = "x" in origin ? origin.x : origin[0]!;
        const y = "y" in origin ? origin.y : origin[1]!;
        const z = "z" in origin ? origin.z : origin[2]!;
        const hit = out ?? { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, distance: 0 };
        hit.point.x = x; hit.point.y = .42; hit.point.z = z;
        hit.normal.x = 0; hit.normal.y = 1; hit.normal.z = 0;
        hit.distance = Math.max(0, y - .42);
        return hit;
      },
    },
  });
  const world = createWorldPose(rig);
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  let previousLeftCalf: readonly number[] | null = null;
  let maximumStep = 0;
  let minimumFootHeight = Number.POSITIVE_INFINITY;
  for (let frame = 0; frame < 120; frame += 1) {
    controller.updateFromPhysics({
      deltaSeconds: 0.03333333333333333,
      position: [0, 0, frame * .12],
      velocity: [0, 0, 3.6],
      resolvedRootDelta: [0, 0, .12],
      grounded: true,
      facing: [0, 0, 1],
    });
    evaluateWorldPose(rig, controller.state.pose, world);
    const leftCalf = directionAt(world.translations, 6, 7);
    if (previousLeftCalf && frame > 10) maximumStep = Math.max(maximumStep, vectorAngle(previousLeftCalf, leftCalf));
    if (frame > 10) minimumFootHeight = Math.min(minimumFootHeight, world.translations[22]!, world.translations[31]!);
    previousLeftCalf = leftCalf;
  }
  expect(maximumStep * 180 / Math.PI).toBeLessThan(28);
  expect(minimumFootHeight).toBeGreaterThanOrEqual(.419);
});

test("controller opens and resets on the same ground-solved ready pose", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  const opened = controller.state.pose.rotations.slice();

  controller.update(0);
  expect(maximumQuaternionStepDegrees(opened, controller.state.pose.rotations)).toBeLessThan(.1);

  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  for (let frame = 0; frame < 30; frame += 1) controller.update(0.016666666666666666);
  controller.reset();
  expect(maximumQuaternionStepDegrees(opened, controller.state.pose.rotations)).toBeLessThan(.1);
});

test("foot orientation eases onto a changed terrain normal without an angular snap", () => {
  let sloped = false;
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({
    rig,
    ground: {
      raycast(origin, _direction, _options, out) {
        const x = "x" in origin ? origin.x : origin[0]!;
        const y = "y" in origin ? origin.y : origin[1]!;
        const z = "z" in origin ? origin.z : origin[2]!;
        const hit = out ?? {
          point: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          distance: 0,
        };
        hit.point.x = x;
        hit.point.y = 0;
        hit.point.z = z;
        hit.normal.x = 0;
        hit.normal.y = sloped ? Math.SQRT1_2 : 1;
        hit.normal.z = sloped ? Math.SQRT1_2 : 0;
        hit.distance = Math.max(0, y);
        return hit;
      },
    },
  });
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  const world = createWorldPose(rig);
  let previousUp: readonly [number, number, number] = [0, 1, 0];
  let maximumStepRadians = 0;
  let closestPlantedSlopeRadians = Number.POSITIVE_INFINITY;
  for (let frame = 0; frame < 240; frame += 1) {
    if (frame === 60) sloped = true;
    controller.update(0.016666666666666666);
    evaluateWorldPose(rig, controller.state.pose, world);
    const up = quaternionUp(world.rotations, 7);
    maximumStepRadians = Math.max(maximumStepRadians, vectorAngle(previousUp, up));
    if (sloped && controller.state.leftFoot?.planted) {
      closestPlantedSlopeRadians = Math.min(closestPlantedSlopeRadians, vectorAngle(up, [0, Math.SQRT1_2, Math.SQRT1_2]));
    }
    previousUp = up;
  }

  expect(maximumStepRadians).toBeLessThan(Math.PI / 18);
  expect(closestPlantedSlopeRadians).toBeLessThan(.03);
});

test("jump compression cannot pitch a planted sole away from its detected terrain", () => {
  const rig = createHumanoidTestRig();
  const controller = createHumanoidMotionController({ rig });
  controller.updateFromPhysics({
    deltaSeconds: 0.03333333333333333,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    resolvedRootDelta: [0, 0, 0],
    grounded: true,
    jumpAnticipation: 1,
    groundNormal: [0, 1, 0],
    facing: [0, 0, 1],
  });
  const world = createWorldPose(rig);
  evaluateWorldPose(rig, controller.state.pose, world);

  expect(controller.state.locomotion.motionPhase).toBe("takeoff");
  expect(controller.state.leftFoot?.planted).toBe(true);
  expect(controller.state.rightFoot?.planted).toBe(true);
  expect(vectorAngle(quaternionUp(world.rotations, 7), [0, 1, 0])).toBeLessThan(.015);
  expect(vectorAngle(quaternionUp(world.rotations, 10), [0, 1, 0])).toBeLessThan(.015);
});

test("extreme aim remains thoracic and never rotates the pelvis", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  controller.setAimTarget([0, 20, 2], 1);
  controller.update(0.016666666666666666);
  const rotations = controller.state.pose.rotations;

  expect([...rotations.subarray(0, 4)]).toEqual([0, 0, 0, 1]);
  expect(Math.abs(rotations[8]) + Math.abs(rotations[9]) + Math.abs(rotations[10])).toBeGreaterThan(0.01);
  expect(controller.state.aim).not.toBeNull();
  expect(Math.abs(controller.state.aim!.pitch)).toBeLessThanOrEqual(Math.PI * 0.42 + 1e-6);
});

test("missing intermediate joints gate IK but preserve base motion and warnings", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig({ incompleteLeftLeg: true }) });
  controller.move([1.5, 0, 0]);
  for (let frame = 0; frame < 20; frame += 1) controller.update(0.016666666666666666);

  expect(controller.state.leftFoot).toBeNull();
  expect(controller.state.rightFoot).not.toBeNull();
  expect(controller.state.capabilities.leftFootPlant).toBe(false);
  expect(controller.state.diagnostics[0]?.message).toContain("disabled");
  expect(controller.state.pose.rotations[23]).not.toBe(1);
  expect(controller.state.metrics.poseFinite).toBe(true);
});

test("controller can use one caller-owned shared pose memory buffer", () => {
  const rig = createHumanoidTestRig();
  const byteLength = rig.totalCount * (10) * Float32Array.BYTES_PER_ELEMENT;
  const memory = new SharedArrayBuffer(byteLength);
  const controller = createHumanoidMotionController({ rig, memory });
  controller.update(0.016666666666666666);

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
  controller.update(0.016666666666666666);

  expect(controller.state.motor.position.x).toBeCloseTo(0.25, 6);
  const resolvedRootDelta = controller.state.signals.get("resolvedRootDelta");
  if (!(resolvedRootDelta instanceof Float32Array)) throw new Error("Expected the resolved root delta signal to be a Float32Array");
  expect(resolvedRootDelta[0]).toBeCloseTo(0.25, 6);
  expect(controller.state.pose.translations[motionRootIndex * 3]).toBeCloseTo(0.25, 6);
});

test("authoritative physics samples drive one pose evaluation without a second motor step", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "run" });
  controller.updateFromPhysics({
    deltaSeconds: 0.03333333333333333,
    position: [1.25, .18, 2.5],
    velocity: [0, .6, 3.2],
    resolvedRootDelta: [0, .02, .1],
    grounded: false,
    facing: [0, 0, 1],
  });

  expect(controller.state.motor.position).toEqual({ x: 1.25, y: .18, z: 2.5 });
  expect(controller.state.motor.velocity).toEqual({ x: 0, y: .6, z: 3.2 });
  expect(controller.state.motor.resolvedDelta).toEqual({ x: 0, y: .02, z: .1 });
  expect(controller.state.motor.grounded).toBe(false);
  expect(controller.state.locomotion.motionPhase).toBe("jump");
  expect(controller.state.leftFoot?.planted).toBe(false);
  expect(controller.state.rightFoot?.planted).toBe(false);
  expect(controller.state.pose.translations[controller.rig.motionRootIndex * 3 + 2]).toBeCloseTo(2.5, 6);
});

test("planned running flight preserves gait presentation without faking grounded foot contacts", () => {
  const controller = createHumanoidMotionController({ rig: createHumanoidTestRig() });
  controller.setLocomotionIntent({ direction: [0, 0, 1], pace: "sprint" });
  for (let frame = 0; frame < 20; frame += 1) controller.updateFromPhysics({
    deltaSeconds: 0.03333333333333333,
    position: [0, 0, frame * .1],
    velocity: [0, 0, 3],
    resolvedRootDelta: [0, 0, .1],
    grounded: true,
    facing: [0, 0, 1],
  });

  controller.updateFromPhysics({
    deltaSeconds: 0.03333333333333333,
    position: [0, .06, 2.1],
    velocity: [0, 1.1, 3],
    resolvedRootDelta: [0, .06, .1],
    grounded: false,
    plannedLocomotionFlight: true,
    facing: [0, 0, 1],
  });

  expect(controller.state.motor.grounded).toBe(false);
  expect(controller.state.locomotion.motionPhase).toBe("locomotion");
  expect(controller.state.locomotion.locomotionWeight).toBeGreaterThan(.8);
  expect(controller.state.leftFoot?.planted).toBe(false);
  expect(controller.state.leftFoot?.hit).toBe(true);
  expect(controller.state.rightFoot?.planted).toBe(false);
  expect(controller.state.rightFoot?.hit).toBe(true);

  controller.updateFromPhysics({
    deltaSeconds: 0.03333333333333333,
    position: [0, 0, 2.2],
    velocity: [0, -.4, 3],
    resolvedRootDelta: [0, -.06, .1],
    grounded: true,
    facing: [0, 0, 1],
  });
  expect(controller.state.locomotion.motionPhase).toBe("locomotion");
  expect(controller.state.locomotion.landingWeight).toBe(0);
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
  const readyRaycasts = raycasts;
  controller.move([0, 0, 1]);
  controller.update(0.016666666666666666);
  // Each foot samples both ankle and forward sole positions at the proposed
  // and horizontally filtered target so rising terrain is seen before contact.
  expect(raycasts).toBe(readyRaycasts + 8);
  let previousArmRotations = controller.state.pose.rotations.slice();
  let maximumAirborneArmStepDegrees = 0;

  grounded = false;
  controller.move([0, 4, 1]);
  controller.update(0.016666666666666666);
  for (const joint of [11, 12, 13, 14, 15, 16]) {
    maximumAirborneArmStepDegrees = Math.max(maximumAirborneArmStepDegrees, quaternionStepDegrees(previousArmRotations, controller.state.pose.rotations, joint));
  }
  previousArmRotations = controller.state.pose.rotations.slice();
  const airborneRaycasts = raycasts;
  expect(airborneRaycasts).toBe(readyRaycasts + 8);
  expect(controller.state.leftFoot?.planted).toBe(false);
  expect(controller.state.leftFoot?.hit).toBe(false);
  expect(controller.state.rightFoot?.planted).toBe(false);
  expect(controller.state.rightFoot?.hit).toBe(false);
  expect(controller.state.metrics.footSlipDistance).toBe(0);
  expect(controller.state.metrics.plantedVerticalError).toBe(0);
  expect(controller.state.locomotion.motionPhase).toBe("jump");
  const takeoffGaitPhase = controller.state.locomotion.gaitPhase;

  for (let frame = 0; frame < 8; frame += 1) {
    controller.update(0.016666666666666666);
    for (const joint of [11, 12, 13, 14, 15, 16]) {
      maximumAirborneArmStepDegrees = Math.max(maximumAirborneArmStepDegrees, quaternionStepDegrees(previousArmRotations, controller.state.pose.rotations, joint));
    }
    previousArmRotations = controller.state.pose.rotations.slice();
  }
  const airborneWorld = createWorldPose(controller.rig);
  evaluateWorldPose(controller.rig, controller.state.pose, airborneWorld);
  const chestY = airborneWorld.translations[7];
  expect(maximumAirborneArmStepDegrees).toBeLessThan(18);
  expect(controller.state.locomotion.gaitPhase).toBeCloseTo(takeoffGaitPhase, 6);
  expect(airborneWorld.translations[39]).toBeGreaterThan(airborneWorld.translations[6]);
  expect(airborneWorld.translations[48]).toBeLessThan(airborneWorld.translations[6]);
  expect(Math.min(airborneWorld.translations[40]!, airborneWorld.translations[49]!)).toBeLessThan(chestY);

  for (let frame = 0; frame < 30 && controller.state.locomotion.motionPhase !== "fall"; frame += 1) {
    controller.move([0, -2, 1]);
    controller.update(0.016666666666666666);
  }
  expect(controller.state.locomotion.motionPhase).toBe("fall");

  grounded = true;
  controller.update(0.016666666666666666);
  // Both landing feet reacquire ground. A foot whose damped airborne target is
  // already within touchdown tolerance needs one query; otherwise it also
  // resolves the pending contact against that smoothed point.
  expect(raycasts).toBeGreaterThan(airborneRaycasts);
  expect(raycasts).toBeLessThanOrEqual(airborneRaycasts + 8);
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

function quaternionStepDegrees(previous: ArrayLike<number>, current: ArrayLike<number>, joint: number) {
  const offset = joint * 4;
  const dot = Math.abs(previous[offset]! * current[offset]!
    + previous[offset + 1]! * current[offset + 1]!
    + previous[offset + 2]! * current[offset + 2]!
    + previous[offset + 3]! * current[offset + 3]!);
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
}

function maximumQuaternionStepDegrees(previous: ArrayLike<number>, current: ArrayLike<number>) {
  let maximum = 0;
  for (let joint = 0; joint < boneCount; joint += 1) {
    maximum = Math.max(maximum, quaternionStepDegrees(previous, current, joint));
  }
  return maximum;
}

function directionAt(positions: ArrayLike<number>, from: number, to: number): [number, number, number] {
  const x = positions[to * 3]! - positions[from * 3]!, y = positions[to * 3 + 1]! - positions[from * 3 + 1]!, z = positions[to * 3 + 2]! - positions[from * 3 + 2]!;
  const inverse = 1 / Math.max(1e-9, Math.hypot(x, y, z));
  return [x * inverse, y * inverse, z * inverse];
}


function quaternionUp(rotations: ArrayLike<number>, index: number): readonly [number, number, number] {
  const offset = index * 4;
  const x = rotations[offset]!, y = rotations[offset + 1]!, z = rotations[offset + 2]!, w = rotations[offset + 3]!;
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
}

function vectorAngle(a: ArrayLike<number>, b: ArrayLike<number>) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const length = Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]);
  return Math.acos(Math.max(-1, Math.min(1, dot / Math.max(1e-8, length))));
}


function jointAngleDegrees(positions: ArrayLike<number>, start: number, middle: number, end: number) {
  const startOffset = start * 3, middleOffset = middle * 3, endOffset = end * 3;
  const ax = positions[startOffset]! - positions[middleOffset]!;
  const ay = positions[startOffset + 1]! - positions[middleOffset + 1]!;
  const az = positions[startOffset + 2]! - positions[middleOffset + 2]!;
  const bx = positions[endOffset]! - positions[middleOffset]!;
  const by = positions[endOffset + 1]! - positions[middleOffset + 1]!;
  const bz = positions[endOffset + 2]! - positions[middleOffset + 2]!;
  const denominator = Math.max(1e-9, Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz));
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / denominator))) * 180 / Math.PI;
}
