import { expect, test } from "bun:test";
import { GLTF_ANIMATION_INTERPOLATION_LINEAR, GLTF_ANIMATION_PATH_TRANSLATION, type CookedGltfRig } from "../../assets/gltf-skin-animation.ts";
import { analyzeGltfHumanoidGaitClip, analyzeHumanoidGaitContacts, inferHumanoidFootBoneIds } from "./clip-gait-analysis.ts";

function gaitPositions(samples: number, sampleRate: number, initialPhase: number, offset: number) {
  const positions = new Float32Array(samples * 3);
  for (let sample = 0; sample < samples; sample += 1) {
    const phase = (initialPhase + offset + sample / sampleRate) % 1, swing = phase < .6 ? 0 : Math.sin((phase - .6) / .4 * Math.PI) * .2;
    positions[sample * 3] = sample / sampleRate;
    positions[sample * 3 + 1] = swing;
  }
  return positions;
}

test("foot-contact analysis recovers compact deterministic cadence, phase, and stance", () => {
  const left = gaitPositions(120, 60, .2, 0), right = gaitPositions(120, 60, .2, .5), input = { durationSeconds: 2, sampleRate: 60, leftFootBoneId: "LeftFoot", rightFootBoneId: "RightFoot", leftFootPositions: left, rightFootPositions: right } as const;
  const first = analyzeHumanoidGaitContacts(input), second = analyzeHumanoidGaitContacts(input);
  expect(first).toEqual(second); expect(first.ok).toBe(true);
  expect(first.analysis).toEqual(expect.objectContaining({ version: 1, cycleSeconds: 1, leftFootBoneId: "LeftFoot", rightFootBoneId: "RightFoot", sampleRate: 60 }));
  expect(first.analysis!.initialPhase).toBeCloseTo(.2, 1); expect(first.analysis!.stanceRatio).toBeCloseTo(.6, 1); expect(first.analysis!.confidence).toBeGreaterThan(.85);
});

test("foot-contact analysis rejects static and non-finite motion instead of inventing a gait", () => {
  const still = new Float32Array(24);
  expect(analyzeHumanoidGaitContacts({ durationSeconds: 1, sampleRate: 8, leftFootBoneId: "left", rightFootBoneId: "right", leftFootPositions: still, rightFootPositions: still }).diagnostics[0]?.code).toBe("insufficient-foot-motion");
  still[1] = Number.NaN;
  expect(analyzeHumanoidGaitContacts({ durationSeconds: 1, sampleRate: 8, leftFootBoneId: "left", rightFootBoneId: "right", leftFootPositions: still, rightFootPositions: new Float32Array(24) }).diagnostics[0]?.code).toBe("invalid-samples");
});

test("cooked glTF analysis uses stable foot identities and the canonical pose evaluator", () => {
  const sampleRate = 60, samples = sampleRate, times = Float32Array.from({ length: samples }, (_, index) => index / sampleRate), left = gaitPositions(samples, sampleRate, 0, 0), right = gaitPositions(samples, sampleRate, 0, .5), values = new Float32Array(left.length + right.length); values.set(left); values.set(right, left.length);
  const rig: CookedGltfRig = {
    nodeCount: 3, nodeIds: ["Hips", "mixamorig:LeftFoot", "mixamorig:RightFoot"], nodeParents: new Int32Array([-1, 0, 0]), nodeTopologicalOrder: new Uint32Array([0, 1, 2]),
    nodeTranslations: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]), nodeRotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), nodeScales: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]), nodeMatrices: new Float32Array(48), nodeMatrixFlags: new Uint8Array(3), skeletons: [], skinBindings: [], meshes: [],
    clips: [{ animationIndex: 7, label: "Walk", duration: 1, channelTargetNodes: new Uint32Array([1, 2]), channelPaths: new Uint8Array([GLTF_ANIMATION_PATH_TRANSLATION, GLTF_ANIMATION_PATH_TRANSLATION]), channelInterpolations: new Uint8Array([GLTF_ANIMATION_INTERPOLATION_LINEAR, GLTF_ANIMATION_INTERPOLATION_LINEAR]), channelKeyOffsets: new Uint32Array([0, samples]), channelKeyCounts: new Uint32Array([samples, samples]), channelValueOffsets: new Uint32Array([0, left.length]), keyframeTimes: new Float32Array([...times, ...times]), keyframeValues: values }],
  };
  expect(inferHumanoidFootBoneIds(rig.nodeIds)).toEqual({ leftFootBoneId: "mixamorig:LeftFoot", rightFootBoneId: "mixamorig:RightFoot" });
  const result = analyzeGltfHumanoidGaitClip(rig, { animation: 7 });
  expect(result.ok).toBe(true); expect(result.analysis).toEqual(expect.objectContaining({ cycleSeconds: 1, leftFootBoneId: "mixamorig:LeftFoot", rightFootBoneId: "mixamorig:RightFoot" }));
  expect(analyzeGltfHumanoidGaitClip(rig, { animation: 99 }).diagnostics[0]?.code).toBe("missing-clip");
});
