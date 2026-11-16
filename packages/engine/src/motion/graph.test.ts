import { expect, test } from "bun:test";
import {
  compileMotionGraph,
  isMotionGraphCompileError,
  type CompileMotionGraphOptions,
} from "./compiler.ts";
import { createMotionCustomNodeRegistry, type MotionCustomNodeDefinition } from "./custom-node.ts";
import type { MotionConnectionJson, MotionGraphJson, MotionNodeJson } from "./graph-types.ts";
import { createMotionGraphRuntime } from "./runtime.ts";
import {
  createMotionConnectionId,
  createMotionNodeId,
  hashMotionGraph,
  serializeMotionGraph,
} from "./serialization.ts";
import type { CompiledSemanticRig } from "./rig.ts";

function createTestRig(): CompiledSemanticRig {
  const totalCount = 3;
  const referenceRotations = new Float32Array(totalCount * 4);
  const referenceScales = new Float32Array(totalCount * 3).fill(1);
  for (let index = 0; index < totalCount; index += 1) referenceRotations[index * 4 + 3] = 1;
  return {
    deformCount: totalCount,
    totalCount,
    motionRootIndex: 0,
    sourceParents: new Int32Array([-1, 0, 0]),
    semanticParents: new Int32Array([-1, 0, 0]),
    evaluationOrder: new Uint32Array([0, 1, 2]),
    referenceRotations,
    referenceTranslations: new Float32Array(totalCount * 3),
    referenceScales,
    sourceReferenceRotations: referenceRotations.slice(),
    sourceReferenceTranslations: new Float32Array(totalCount * 3),
    sourceReferenceScales: referenceScales.slice(),
    semanticIndices: new Int32Array([0, 1, 2]),
    tags: new Map([
      ["All", new Uint32Array([0, 1, 2])],
      ["Head", new Uint32Array([0])],
      ["LeftArm", new Uint32Array([1])],
      ["RightArm", new Uint32Array([2])],
    ]),
    capabilities: {
      baseLocomotion: false,
      aim: false,
      leftArm: false,
      rightArm: false,
      leftLeg: false,
      rightLeg: false,
      leftReach: false,
      rightReach: false,
      leftFootPlant: false,
      rightFootPlant: false,
    },
    diagnostics: [],
    validated: true,
  };
}

function poseEdge(id: string, fromNode: string, fromPort: string, toNode: string, toPort: string, blendMode: "override" | "additive" = "override"): MotionConnectionJson {
  return { id, from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort }, blendMode };
}

function graph(nodes: MotionNodeJson[], connections: MotionConnectionJson[], outputNode: string, outputPort = "pose"): MotionGraphJson {
  return { schemaVersion: 1, id: "test.graph", nodes, connections, output: { node: outputNode, port: outputPort } };
}

function compileOptions(definitions: MotionCustomNodeDefinition[] = [], development = false): CompileMotionGraphOptions {
  return { rig: createTestRig(), customNodes: createMotionCustomNodeRegistry(definitions), development };
}

const passthroughDefinition: MotionCustomNodeDefinition = {
  implementation: "test.passthrough",
  ports: { inputs: { pose: { type: "pose" } }, outputs: { pose: { type: "pose" } } },
  evaluate() {},
};

const sourceDefinition: MotionCustomNodeDefinition = {
  implementation: "test.source",
  ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
  evaluate() {},
};

function diagnosticCodes(error: unknown) {
  return isMotionGraphCompileError(error) ? error.diagnostics.map((diagnostic) => diagnostic.code) : [];
}

test("compiler reports concrete same-frame cycles and delay nodes cut feedback edges", () => {
  const cycleNodes: MotionNodeJson[] = [
    { id: "a", kind: "custom", implementation: "test.passthrough", pass: "state-layer", writes: { tags: [] } },
    { id: "b", kind: "custom", implementation: "test.passthrough", pass: "state-layer", writes: { tags: [] } },
  ];
  const cycleGraph = graph(cycleNodes, [
    poseEdge("a-to-b", "a", "pose", "b", "pose"),
    poseEdge("b-to-a", "b", "pose", "a", "pose"),
  ], "a");
  try {
    compileMotionGraph(cycleGraph, compileOptions([passthroughDefinition]));
    throw new Error("expected cycle failure");
  } catch (error) {
    expect(diagnosticCodes(error)).toContain("graph-cycle");
    if (!isMotionGraphCompileError(error)) throw error;
    const diagnostic = error.diagnostics.find((value) => value.code === "graph-cycle");
    expect(diagnostic?.cycle?.[0]).toBe(diagnostic?.cycle?.at(-1));
  }

  const delayed = graph([
    { id: "delay", kind: "delay", valueType: "pose", pass: "state-layer" },
    { id: "step", kind: "custom", implementation: "test.passthrough", pass: "state-layer", writes: { tags: [] } },
  ], [
    poseEdge("delayed-value", "delay", "output", "step", "pose"),
    poseEdge("next-value", "step", "pose", "delay", "input"),
  ], "step");
  const compiled = compileMotionGraph(delayed, compileOptions([passthroughDefinition]));
  expect(compiled.schedule.map((node) => node.id)).toEqual(["delay", "step"]);
});

test("compiler rejects typed port mismatches and backward pass edges", () => {
  const mismatch = graph([
    { id: "ref", kind: "reference-pose" },
    { id: "grounded", kind: "signal", signal: "isGrounded" },
    { id: "blend", kind: "blend", pass: "state-layer" },
  ], [
    poseEdge("a", "ref", "pose", "blend", "a"),
    poseEdge("b", "ref", "pose", "blend", "b"),
    { id: "weight", from: { node: "grounded", port: "value" }, to: { node: "blend", port: "weight" } },
  ], "blend");
  try {
    compileMotionGraph(mismatch, compileOptions());
  } catch (error) {
    expect(diagnosticCodes(error)).toContain("port-type-mismatch");
  }

  const backwards = graph([
    { id: "late", kind: "custom", implementation: "test.source", pass: "recoil", writes: { tags: [] } },
    { id: "early", kind: "custom", implementation: "test.passthrough", pass: "base-locomotion", writes: { tags: [] } },
  ], [poseEdge("back", "late", "pose", "early", "pose")], "early");
  expect(() => compileMotionGraph(backwards, compileOptions([sourceDefinition, passthroughDefinition]))).toThrow("moves backward");
});

test("topological scheduling and canonical serialization are stable across source order", () => {
  const nodes: MotionNodeJson[] = [
    { id: "z-ref", kind: "reference-pose" },
    { id: "a-ref", kind: "reference-pose" },
    { id: "blend", kind: "blend", pass: "state-layer" },
    { id: "weight", kind: "signal", signal: "actionPhase" },
  ];
  const connections = [
    poseEdge("z", "z-ref", "pose", "blend", "b"),
    poseEdge("a", "a-ref", "pose", "blend", "a"),
    { id: "w", from: { node: "weight", port: "value" }, to: { node: "blend", port: "weight" } },
  ];
  const first = graph(nodes, connections, "blend");
  const second = graph([...nodes].reverse(), [...connections].reverse(), "blend");
  expect(compileMotionGraph(first, compileOptions()).schedule.map((node) => node.id)).toEqual(
    compileMotionGraph(second, compileOptions()).schedule.map((node) => node.id),
  );
  expect(hashMotionGraph(first)).toBe(hashMotionGraph(second));
  expect(serializeMotionGraph(first)).toBe(serializeMotionGraph(second));
});

test("writer masks reject unresolved overlaps, allow disjoint writes, and Blend resolves branches", () => {
  const overlapping = graph([
    { id: "source", kind: "custom", implementation: "test.source", pass: "base-locomotion", writes: { tags: ["LeftArm"], components: ["rotation"] } },
    { id: "next", kind: "custom", implementation: "test.passthrough", pass: "state-layer", writes: { tags: ["LeftArm"], components: ["rotation"] } },
  ], [poseEdge("chain", "source", "pose", "next", "pose")], "next");
  try {
    compileMotionGraph(overlapping, compileOptions([sourceDefinition, passthroughDefinition]));
  } catch (error) {
    expect(diagnosticCodes(error)).toContain("unresolved-writer-conflict");
  }

  const disjoint = structuredClone(overlapping);
  const disjointNode = disjoint.nodes[1];
  if (disjointNode.kind !== "custom") throw new Error("Expected a custom motion node in the fixture");
  disjointNode.writes = { tags: ["RightArm"], components: ["rotation"] };
  expect(compileMotionGraph(disjoint, compileOptions([sourceDefinition, passthroughDefinition])).output.kind).toBe("pose");

  const resolved = graph([
    { id: "left", kind: "custom", implementation: "test.source", pass: "base-locomotion", writes: { tags: ["LeftArm"] } },
    { id: "right", kind: "custom", implementation: "test.source", pass: "base-locomotion", writes: { tags: ["LeftArm"] } },
    { id: "weight", kind: "signal", signal: "actionPhase" },
    { id: "blend", kind: "blend", pass: "state-layer" },
  ], [
    poseEdge("left-in", "left", "pose", "blend", "a"),
    poseEdge("right-in", "right", "pose", "blend", "b"),
    { id: "weight-in", from: { node: "weight", port: "value" }, to: { node: "blend", port: "weight" } },
  ], "blend");
  expect(compileMotionGraph(resolved, compileOptions([sourceDefinition])).output.kind).toBe("pose");
});

test("additive Layer connections require an explicit reference pose", () => {
  const nodes: MotionNodeJson[] = [
    { id: "ref", kind: "reference-pose" },
    { id: "delta", kind: "custom", implementation: "test.source", pass: "masked-additive", writes: { tags: ["LeftArm"] } },
    { id: "layer", kind: "layer", pass: "masked-additive", mask: { tags: ["LeftArm"] } },
  ];
  const connections = [
    poseEdge("base", "ref", "pose", "layer", "base"),
    poseEdge("delta", "delta", "pose", "layer", "layer", "additive"),
  ];
  const missing = graph(nodes, connections, "layer");
  try {
    compileMotionGraph(missing, compileOptions([sourceDefinition]));
  } catch (error) {
    expect(diagnosticCodes(error)).toContain("additive-reference-required");
  }
  connections.push(poseEdge("reference", "ref", "pose", "layer", "reference"));
  expect(compileMotionGraph(graph(nodes, connections, "layer"), compileOptions([sourceDefinition])).output.kind).toBe("pose");
});

test("additive Layer applies target times inverse-reference before the base rotation", () => {
  const halfSqrt = Math.SQRT1_2;
  const baseSource: MotionCustomNodeDefinition = {
    implementation: "test.base-y",
    ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
    evaluate(context) {
      context.outputPose!.rotations.set([0, halfSqrt, 0, halfSqrt], 4);
    },
  };
  const additiveSource: MotionCustomNodeDefinition = {
    implementation: "test.add-x",
    ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
    evaluate(context) {
      context.outputPose!.rotations.set([halfSqrt, 0, 0, halfSqrt], 4);
    },
  };
  const motion = graph([
    { id: "ref", kind: "reference-pose" },
    { id: "base", kind: "custom", implementation: baseSource.implementation, pass: "base-locomotion", writes: { tags: ["LeftArm"], components: ["rotation"] } },
    { id: "add", kind: "custom", implementation: additiveSource.implementation, pass: "masked-additive", writes: { tags: ["LeftArm"], components: ["rotation"] } },
    { id: "layer", kind: "layer", pass: "masked-additive", mask: { tags: ["LeftArm"], components: ["rotation"] } },
  ], [
    poseEdge("base-in", "base", "pose", "layer", "base"),
    poseEdge("add-in", "add", "pose", "layer", "layer", "additive"),
    poseEdge("ref-in", "ref", "pose", "layer", "reference"),
  ], "layer");
  const runtime = createMotionGraphRuntime(compileMotionGraph(motion, compileOptions([baseSource, additiveSource])));
  runtime.evaluate(0.016666666666666666);
  for (let component = 0; component < 4; component += 1) {
    expect(runtime.pose.rotations[4 + component]).toBeCloseTo(0.5, 5);
  }
});

test("development custom-node validation rejects undeclared writes and NaNs", () => {
  const badWrite: MotionCustomNodeDefinition = {
    implementation: "test.bad-write",
    ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
    evaluate(context) {
      context.outputPose!.translations[3] = 1;
    },
  };
  const badNan: MotionCustomNodeDefinition = {
    implementation: "test.bad-nan",
    ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
    evaluate(context) {
      context.outputPose!.translations[0] = Number.NaN;
    },
  };
  const outOfBounds: MotionCustomNodeDefinition = {
    implementation: "test.out-of-bounds",
    ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
    evaluate(context) {
      const outputPose = context.outputPose;
      if (!outputPose) throw new Error("Expected a motion output pose");
      outputPose.translations[outputPose.translations.length] = 1;
    },
  };
  for (const definition of [badWrite, badNan, outOfBounds]) {
    const source = graph([
      { id: "bad", kind: "custom", implementation: definition.implementation, pass: "base-locomotion", writes: { tags: ["Head"], components: ["translation"] } },
    ], [], "bad");
    const runtime = createMotionGraphRuntime(compileMotionGraph(source, compileOptions([definition], true)));
    expect(() => runtime.evaluate(0.016666666666666666)).toThrow();
  }
});

test("inertialization preserves transition continuity and converges to the new target", () => {
  const movingSource: MotionCustomNodeDefinition = {
    implementation: "test.moving-source",
    ports: { inputs: {}, outputs: { pose: { type: "pose" } } },
    evaluate(context) {
      const outputPose = context.outputPose;
      const actionPhase = context.signals.get("actionPhase");
      if (!outputPose || typeof actionPhase !== "number") throw new Error("Expected pose output and numeric action phase");
      outputPose.translations[0] = actionPhase;
    },
  };
  const motion = graph([
    { id: "source", kind: "custom", implementation: movingSource.implementation, pass: "base-locomotion", writes: { tags: ["Head"], components: ["translation"] } },
    { id: "action", kind: "signal", signal: "actionId" },
    { id: "smooth", kind: "inertialize", pass: "state-layer", halfLifeSeconds: 0.05, mask: { tags: ["Head"], components: ["translation"] } },
  ], [
    poseEdge("pose", "source", "pose", "smooth", "pose"),
    { id: "trigger", from: { node: "action", port: "value" }, to: { node: "smooth", port: "trigger" } },
  ], "smooth");
  const runtime = createMotionGraphRuntime(compileMotionGraph(motion, compileOptions([movingSource])));
  runtime.signals.set("actionPhase", 0);
  runtime.evaluate(0.016666666666666666);
  runtime.signals.setMany({ actionId: "jump", actionPhase: 10 });
  expect(runtime.evaluate(0.016666666666666666).translations[0]).toBeLessThan(5);
  for (let index = 0; index < 40; index += 1) runtime.evaluate(0.016666666666666666);
  expect(runtime.pose.translations[0]).toBeGreaterThan(9.5);
});

test("notify timelines cross normalized phase wraps using an explicit cycle", () => {
  const motion = graph([
    { id: "ref", kind: "reference-pose" },
    { id: "phase", kind: "signal", signal: "gaitPhase" },
    { id: "cycle", kind: "signal", signal: "gaitCycle" },
    { id: "notify", kind: "notify", pass: "state-layer", events: [{ id: "step", name: "footstep", phase: 0.05 }] },
  ], [
    { id: "phase-in", from: { node: "phase", port: "value" }, to: { node: "notify", port: "phase" } },
    { id: "cycle-in", from: { node: "cycle", port: "value" }, to: { node: "notify", port: "cycle" } },
  ], "ref");
  const runtime = createMotionGraphRuntime(compileMotionGraph(motion, compileOptions()));
  runtime.signals.setMany({ gaitCycle: 0, gaitPhase: 0.9 });
  runtime.evaluate(0.016666666666666666);
  runtime.signals.setMany({ gaitCycle: 1, gaitPhase: 0.1 });
  runtime.evaluate(0.016666666666666666);
  expect(runtime.notifyCount).toBe(1);
  expect(runtime.getNotify(0)).toMatchObject({ id: "step", name: "footstep", cycle: 1 });
});

test("warm repeated evaluation reuses the pose arena", () => {
  const motion = graph([{ id: "ref", kind: "reference-pose" }], [], "ref");
  const runtime = createMotionGraphRuntime(compileMotionGraph(motion, compileOptions()));
  const pose = runtime.pose;
  const rotations = pose.rotations;
  for (let index = 0; index < 2_000; index += 1) runtime.evaluate(0.016666666666666666);
  expect(runtime.pose).toBe(pose);
  expect(runtime.pose.rotations).toBe(rotations);
  expect(runtime.pose.rotations.every(Number.isFinite)).toBe(true);
});

test("authoring helpers generate deterministic hash keys independent of array order", () => {
  const locomotion = createMotionNodeId("custom", "player/base-locomotion");
  const repeated = createMotionNodeId("custom", "player/base-locomotion");
  const aim = createMotionNodeId("custom", "player/aim");
  expect(locomotion).toBe(repeated);
  expect(locomotion).not.toBe(aim);
  expect(locomotion).toMatch(/^node:custom:[0-9a-f]{8}$/);

  const override = createMotionConnectionId(locomotion, "pose", aim, "base", "override");
  const additive = createMotionConnectionId(locomotion, "pose", aim, "base", "additive");
  expect(override).toBe(createMotionConnectionId(locomotion, "pose", aim, "base", "override"));
  expect(override).not.toBe(additive);
  expect(override).toMatch(/^connection:[0-9a-f]{8}$/);
  expect(() => createMotionNodeId("blend", "")).toThrow("non-empty");
});

test("graph pose registers can live directly in one WebAssembly memory", () => {
  const motion = graph([{ id: "ref", kind: "reference-pose" }], [], "ref");
  const memory = new WebAssembly.Memory({ initial: 1 });
  const runtime = createMotionGraphRuntime(compileMotionGraph(motion, compileOptions()), {
    memory: memory.buffer,
    byteOffset: 128,
  });

  expect(runtime.pose.buffer).toBe(memory.buffer);
  expect(runtime.pose.byteOffset).toBe(128);
  expect(runtime.evaluate(0.016666666666666666).rotations.buffer).toBe(memory.buffer);
});
