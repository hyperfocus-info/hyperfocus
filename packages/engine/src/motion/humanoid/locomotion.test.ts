import { expect, test } from "bun:test";
import { createProceduralLocomotion } from "./locomotion.ts";

const baseInput = {
  deltaSeconds: 0.016666666666666666,
  resolvedRootDelta: [0, 0, 0] as const,
  velocity: [0, 0, 0] as const,
  facing: [0, 0, 1] as const,
  groundNormal: [0, 1, 0] as const,
  turnRate: 0,
  isGrounded: true,
  legLength: 1,
  hipWidth: 0.24,
};

test("gait phase follows resolved distance rather than elapsed time", () => {
  const oneStep = createProceduralLocomotion();
  const manySteps = createProceduralLocomotion();
  oneStep.update({ ...baseInput, deltaSeconds: 1, resolvedRootDelta: [0, 0, 0.675], velocity: [0, 0, 0.675] });
  for (let index = 0; index < 10; index += 1) {
    manySteps.update({ ...baseInput, deltaSeconds: 0.1, resolvedRootDelta: [0, 0, 0.0675], velocity: [0, 0, 0.675] });
  }

  expect(oneStep.frame.gaitPhase).toBeCloseTo(0.5, 6);
  expect(manySteps.frame.gaitPhase).toBeCloseTo(oneStep.frame.gaitPhase, 6);
  expect(manySteps.frame.distanceTravelled).toBeCloseTo(0.675, 6);
});

test("directional targets support strafing and backwards locomotion", () => {
  const forward = createProceduralLocomotion().update({
    ...baseInput,
    velocity: [0, 0, 2],
  });
  expect(forward.leftFootTarget[0]).toBeGreaterThan(0);
  expect(forward.rightFootTarget[0]).toBeLessThan(0);

  const locomotion = createProceduralLocomotion();
  const strafeInput = {
    ...baseInput,
    resolvedRootDelta: [0.1, 0, 0],
    velocity: [2, 0, 0],
  } as const;
  const firstStrafeX = locomotion.update(strafeInput).localTravelDirection[0]!;
  expect(firstStrafeX).toBeGreaterThan(0);
  expect(firstStrafeX).toBeLessThan(0.2);
  for (let frame = 1; frame < 120; frame += 1) locomotion.update(strafeInput);
  const strafe = locomotion.frame;
  expect(strafe.localTravelDirection[0]).toBeGreaterThan(0.999);
  expect(Math.abs(strafe.localTravelDirection[2])).toBeLessThan(0.001);
  expect(Math.abs(strafe.leftFootTarget[0] + 0.12)).toBeGreaterThan(0.01);

  const backwardsInput = {
    ...baseInput,
    resolvedRootDelta: [0, 0, -0.1],
    velocity: [0, 0, -2],
  } as const;
  for (let frame = 0; frame < 120; frame += 1) locomotion.update(backwardsInput);
  const backwards = locomotion.frame;
  expect(backwards.localTravelDirection[2]).toBeLessThan(-0.999);
  expect(Math.sign(backwards.leftFootTarget[2])).toBe(-Math.sign(backwards.left.footForward));
});

test("strafing keeps each foot in its own body-side lane", () => {
  const locomotion = createProceduralLocomotion();
  for (let frame = 0; frame < 180; frame += 1) {
    const state = locomotion.update({
      ...baseInput,
      resolvedRootDelta: [0.03333333333333333, 0, 0],
      velocity: [2, 0, 0],
    });
    expect(state.leftFootTarget[0]).toBeGreaterThan(0);
    expect(state.rightFootTarget[0]).toBeLessThan(0);
  }
});

test("idle breathing is time based while gait remains planted", () => {
  const locomotion = createProceduralLocomotion({ idleBreathsPerSecond: 0.25 });
  const frame = locomotion.update({ ...baseInput, deltaSeconds: 1 });
  expect(frame.gaitPhase).toBe(0);
  expect(frame.idlePhase).toBeCloseTo(0.25, 6);
  expect(frame.breath).toBeCloseTo(1, 6);
  expect(frame.locomotionWeight).toBe(0);
});

test("slope and turn outputs are bounded, finite, and caller-stable", () => {
  const locomotion = createProceduralLocomotion({ maxTurnRate: 4, maxTurnLean: 0.2 });
  const first = locomotion.update({
    ...baseInput,
    groundNormal: [0, Math.cos(Math.PI / 12), -Math.sin(Math.PI / 12)],
    turnRate: 40,
  });
  expect(first.slope[0]).toBeCloseTo(Math.PI / 12, 5);
  const second = locomotion.update({ ...baseInput, turnRate: -40 });

  expect(second).toBe(first);
  expect(second.turnLean).toBeCloseTo(0.2, 6);
  expect([...second.leftFootTarget, ...second.rightFootTarget, ...second.pelvisOffset].every(Number.isFinite)).toBe(true);
});

test("crouch posture uses a critically damped height transition", () => {
  const locomotion = createProceduralLocomotion({ postureResponse: 10 });
  const weights: number[] = [];
  for (let frame = 0; frame < 60; frame += 1) weights.push(locomotion.update({ ...baseInput, posture: "crouch" }).crouchWeight);
  expect(weights[0]).toBeGreaterThan(0);
  expect(weights[0]).toBeLessThan(.2);
  expect(weights.every((weight, index) => index === 0 || weight >= weights[index - 1]!)).toBe(true);
  expect(weights.at(-1)).toBeGreaterThan(.99);
  const firstRelease = locomotion.update({ ...baseInput, posture: "upright" }).crouchWeight;
  expect(firstRelease).toBeGreaterThan(.8);
  expect(firstRelease).toBeLessThan(weights.at(-1)!);
  for (let frame = 0; frame < 60; frame += 1) locomotion.update({ ...baseInput, posture: "upright" });
  expect(locomotion.frame.crouchWeight).toBeLessThan(.001);
});
