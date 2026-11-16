import { maximumSupportStep } from "../../test-support/physical-root.ts";
import { expect, test } from "bun:test";

import { samplePhysicalPresentationRoot3D } from "./presentation-root-3d.ts";

test("ready presentation roots stay on terrain while preserving deterministic flight height", () => {
  const stride = 13;
  const states = new Float32Array(6 * stride);
  for (const [frame, y] of [1, .7, .8, 1.4, .3, .65].entries()) {
    states[frame * stride] = frame;
    states[frame * stride + 1] = y;
  }
  const source: Parameters<typeof samplePhysicalPresentationRoot3D>[0]["source"] = {
    frameStride: stride,
    states,
    characterStateEvents: [
      { ragdollId: "runner", frame: 0, simulationTick: 1, subframe: 1, locomotion: "grounded", authority: "ready" },
      { ragdollId: "runner", frame: 2, simulationTick: 9, subframe: 1, locomotion: "airborne", authority: "ready" },
      { ragdollId: "runner", frame: 3, simulationTick: 12, subframe: .4, locomotion: "grounded", authority: "ready" },
      { ragdollId: "runner", frame: 3, simulationTick: 12, subframe: .8, locomotion: "airborne", authority: "ready" },
      { ragdollId: "runner", frame: 5, simulationTick: 21, subframe: 1, locomotion: "grounded", authority: "ready" },
    ],
  };
  const bodies = [{ id: "floor", type: "static" as const, shape: { kind: "box" as const, halfX: 20, halfY: .1, halfZ: 20 }, y: -.1 }];
  const sample = (frame: number) => {
    const physicalRootPosition: [number, number, number] = [states[frame * stride]!, states[frame * stride + 1]!, 0];
    return samplePhysicalPresentationRoot3D({ bodies, source, ragdollId: "runner", rootReferenceIndex: 0, frame, physicalRootPosition, rawEntityPosition: [physicalRootPosition[0], physicalRootPosition[1] - 1, 0] });
  };

  expect(sample(1)).toEqual([1, 0, 0]);
  expect(sample(2)).toEqual([2, 0, 0]);
  expect(sample(3)[0]).toBe(3);
  expect(sample(3)[1]).toBeCloseTo(.6, 6);
  expect(sample(3)[2]).toBe(0);
  expect(sample(4)).toEqual([4, 0, 0]);
  expect(sample(5)).toEqual([5, 0, 0]);
  expect(sample(3)).toEqual(sample(3));
});

test("ready terrain support transients do not become visible jumps", () => {
  const stride = 13;
  const states = new Float32Array(3 * stride);
  states[stride] = 1; states[stride + 1] = .65;
  states[stride * 2] = 2; states[stride * 2 + 1] = 1.05;
  const source: Parameters<typeof samplePhysicalPresentationRoot3D>[0]["source"] = {
    frameStride: stride,
    states,
    characterStateEvents: [
      { ragdollId: "runner", frame: 0, simulationTick: 1, subframe: 1, locomotion: "grounded", authority: "ready" },
      { ragdollId: "runner", frame: 2, simulationTick: 9, subframe: 1, locomotion: "airborne", authority: "ready" },
    ],
  };
  const bodies = [{ id: "floor", type: "static" as const, shape: { kind: "box" as const, halfX: 20, halfY: .1, halfZ: 20 }, y: -.1 }];
  const physicalRootPosition: [number, number, number] = [2, 1.05, 0];

  expect(samplePhysicalPresentationRoot3D({
    bodies,
    source,
    ragdollId: "runner",
    rootReferenceIndex: 0,
    frame: 2,
    physicalRootPosition,
    rawEntityPosition: [2, .05, 0],
    supportAirborne: true,
  })).toEqual([2, 0, 0]);
});

test("ready support height anticipates sharp rises with a bounded deterministic envelope", () => {
  const stride = 13, frameRate = 30, frameCount = 12;
  const states = new Float32Array(frameCount * stride);
  for (let frame = 0; frame < frameCount; frame += 1) {
    states[frame * stride] = frame < 6 ? -.15 : .15;
    states[frame * stride + 1] = .5;
  }
  const source: Parameters<typeof samplePhysicalPresentationRoot3D>[0]["source"] = {
    frameRate,
    durationFrames: frameCount,
    frameStride: stride,
    states,
    ensureFrame(frame) { return frame; },
    characterStateEvents: [
      { ragdollId: "runner", frame: 0, simulationTick: 1, subframe: 1, locomotion: "grounded", authority: "ready" },
    ],
  };
  const bodies = [
    { id: "low", type: "static" as const, shape: { kind: "box" as const, halfX: .15, halfY: .1, halfZ: 2 }, x: -.15, y: -.1 },
    { id: "high", type: "static" as const, shape: { kind: "box" as const, halfX: .15, halfY: .1, halfZ: 2 }, x: .15, y: .2 },
  ];
  const sample = (frame: number) => {
    const x = states[frame * stride]!;
    return samplePhysicalPresentationRoot3D({ bodies, source, ragdollId: "runner", rootReferenceIndex: 0, frame, physicalRootPosition: [x, .5, 0], rawEntityPosition: [x, 0, 0] });
  };

  const heights = Array.from({ length: frameCount }, (_, frame) => sample(frame)[1]);
  expect(heights[6]).toBeCloseTo(.3, 6);
  expect(Math.max(...heights.slice(1).map((height, index) => Math.abs(height - heights[index]!)))).toBeLessThanOrEqual(maximumSupportStep(frameRate));
  expect(sample(5)).toEqual(sample(5));
});
