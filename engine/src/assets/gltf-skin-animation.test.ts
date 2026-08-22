import { describe, expect, test } from "bun:test";
import {
  GLTF_ANIMATION_INTERPOLATION_LINEAR,
  GLTF_ANIMATION_INTERPOLATION_STEP,
  GLTF_ANIMATION_PATH_ROTATION,
  GLTF_ANIMATION_PATH_TRANSLATION,
  cookGltfSkinAnimations,
  createGltfPoseOutput,
  evaluateGltfAnimationPose,
  resolveAndCookGltfSkinAnimations,
} from "./gltf-skin-animation.ts";
import {
  MATERIAL_FLAG_SKINNED_3D,
  RENDER_COMMAND_FLAG_SKINNED_3D,
  createBoundedScene3D,
  createRenderCommandBuffer3D,
  type MeshGeometry3D,
} from "../render/3d-scene.ts";
import type { WebGl2RendererOptions3D } from "../render/3d-webgl2.ts";

async function fixture(): Promise<Record<string, any>> {
  return JSON.parse(await Bun.file(new URL("../../fixtures/gltf-skin-animation/two-joint.gltf", import.meta.url)).text()) as Record<string, any>;
}

async function cookedFixture() {
  const result = await resolveAndCookGltfSkinAnimations(await fixture());
  if (!result.rig) throw new Error(`Fixture did not cook: ${JSON.stringify(result.diagnostics)}`);
  return { result, rig: result.rig };
}

function closeArray(actual: ArrayLike<number>, expected: ArrayLike<number>, precision = 5): void {
  expect(actual.length).toBe(expected.length);
  for (let index = 0; index < actual.length; index += 1) expect(actual[index]).toBeCloseTo(expected[index], precision);
}

describe("vendor-neutral glTF skin and animation cooking", () => {
  test("decodes the independent glTF fixture into deterministic bounded buffers", async () => {
    const first = await resolveAndCookGltfSkinAnimations(await fixture());
    const second = await resolveAndCookGltfSkinAnimations(await fixture());
    expect(first.ok).toBe(true);
    expect(first.diagnostics).toEqual([]);
    expect(first).toEqual(second);
    const rig = first.rig!;
    expect(rig.nodeCount).toBe(4);
    expect([...rig.nodeParents]).toEqual([-1, 0, 1, -1]);
    expect([...rig.nodeTopologicalOrder]).toEqual([0, 3, 1, 2]);
    expect(rig.meshes).toHaveLength(1);
    expect(rig.meshes[0]).toEqual(expect.objectContaining({ meshIndex: 0, primitiveIndex: 0, vertexCount: 3 }));
    expect(rig.meshes[0]!.joints).toBeInstanceOf(Uint8Array);
    expect([...rig.meshes[0]!.joints]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
    expect([...rig.meshes[0]!.weights]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(rig.skinBindings).toEqual([{ nodeIndex: 3, meshIndex: 0, skinIndex: 0 }]);
    expect(rig.skeletons[0]).toEqual(expect.objectContaining({ skinIndex: 0, label: "TwoJoint", skeletonNode: 0 }));
    expect([...rig.skeletons[0]!.jointNodes]).toEqual([1, 2]);
    expect(rig.skeletons[0]!.inverseBindMatrices).toHaveLength(32);
    const clip = rig.clips[0]!;
    expect(clip.label).toBe("Wave");
    expect(clip.duration).toBe(1);
    expect([...clip.channelTargetNodes]).toEqual([2, 1]);
    expect([...clip.channelPaths]).toEqual([GLTF_ANIMATION_PATH_TRANSLATION, GLTF_ANIMATION_PATH_ROTATION]);
    expect([...clip.channelInterpolations]).toEqual([GLTF_ANIMATION_INTERPOLATION_LINEAR, GLTF_ANIMATION_INTERPOLATION_STEP]);
    expect(first.outputBytes).toBeGreaterThan(0);
  });

  test("evaluates LINEAR TRS and STEP rotation into caller-owned mesh-local palettes", async () => {
    const { rig } = await cookedFixture();
    const pose = createGltfPoseOutput(rig), palette = new Float32Array(32);
    const sampled = evaluateGltfAnimationPose(rig, { skeleton: 0, clip: 0, timeSeconds: 0.25, meshNode: 3 }, pose, palette);
    expect(sampled).toBe(0.25);
    expect(pose.translations[2 * 3 + 1]).toBeCloseTo(0.25);
    expect(pose.rotations[1 * 4 + 3]).toBeCloseTo(1);
    expect(palette[12]).toBeCloseTo(1);
    expect(palette[16 + 12]).toBeCloseTo(1);
    expect(palette[16 + 13]).toBeCloseTo(0.25);

    evaluateGltfAnimationPose(rig, { skeleton: 0, clip: 0, timeSeconds: 0.75, meshNode: 3 }, pose, palette);
    expect(pose.rotations[1 * 4 + 2]).toBeCloseTo(Math.SQRT1_2);
    expect(pose.rotations[1 * 4 + 3]).toBeCloseTo(Math.SQRT1_2);
    expect(palette[16 + 12]).toBeCloseTo(0.25, 4);
    expect(palette[16 + 13]).toBeCloseTo(0, 4);

    const looped = new Float32Array(32);
    expect(evaluateGltfAnimationPose(rig, { skeleton: 0, clip: 0, timeSeconds: 1.25, loop: true, meshNode: 3 }, pose, looped)).toBe(0.25);
    closeArray(looped, (() => {
      const expected = new Float32Array(32);
      evaluateGltfAnimationPose(rig, { skeleton: 0, clip: 0, timeSeconds: 0.25, meshNode: 3 }, pose, expected);
      return expected;
    })());
    expect(() => evaluateGltfAnimationPose(rig, { skeleton: 0, clip: 0, timeSeconds: 0 }, pose, pose.localMatrices.subarray(0, 32))).toThrow("must not alias");
  });

  test("evaluates scale channels and decodes Uint16 joints with normalized integer weights", async () => {
    const scaleDocument = await fixture();
    scaleDocument.animations[0].channels = [{ sampler: 0, target: { node: 2, path: "scale" } }];
    const scaleResolution = await (await import("./gltf-static.ts")).resolveGltfStaticBuffers(scaleDocument);
    const scaleView = new DataView(scaleResolution.buffers[0]!.buffer, scaleResolution.buffers[0]!.byteOffset);
    [1, 1, 1, 2, 3, 4].forEach((value, index) => scaleView.setFloat32(232 + index * 4, value, true));
    const scaleCook = cookGltfSkinAnimations(scaleDocument, scaleResolution.buffers);
    expect(scaleCook.ok).toBe(true);
    const pose = createGltfPoseOutput(scaleCook.rig!), palette = new Float32Array(32);
    evaluateGltfAnimationPose(scaleCook.rig!, { skeleton: 0, clip: 0, timeSeconds: 0.5 }, pose, palette);
    closeArray(pose.scales.subarray(6, 9), [1.5, 2, 2.5]);

    const bytes = new Uint8Array(136), view = new DataView(bytes.buffer);
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    positions.forEach((value, index) => view.setFloat32(index * 4, value, true));
    for (let index = 0; index < 12; index += 1) view.setUint16(36 + index * 2, 0, true);
    bytes.set([128, 127, 0, 0, 128, 127, 0, 0, 128, 127, 0, 0], 60);
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1].forEach((value, index) => view.setFloat32(72 + index * 4, value, true));
    const integerDocument = {
      asset: { version: "2.0" }, buffers: [{ byteLength: 136 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 },
        { buffer: 0, byteOffset: 60, byteLength: 12 }, { buffer: 0, byteOffset: 72, byteLength: 64 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" },
        { bufferView: 2, componentType: 5121, normalized: true, count: 3, type: "VEC4" },
        { bufferView: 3, componentType: 5126, count: 1, type: "MAT4" },
      ],
      nodes: [{}, { mesh: 0, skin: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
      skins: [{ inverseBindMatrices: 3, joints: [0] }],
    };
    const integerCook = cookGltfSkinAnimations(integerDocument, [bytes]);
    expect(integerCook.ok).toBe(true);
    expect(integerCook.rig!.meshes[0]!.joints).toBeInstanceOf(Uint16Array);
    closeArray(integerCook.rig!.meshes[0]!.weights.subarray(0, 4), [128 / 255, 127 / 255, 0, 0]);
  });

  test("hands cooked streams and evaluated palettes to BoundedScene3D and WebGL2 contracts without Three", async () => {
    const { rig } = await cookedFixture();
    const stream = rig.meshes[0]!;
    const geometry: MeshGeometry3D = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      joints: stream.joints,
      weights: stream.weights,
    };
    const scene = createBoundedScene3D({
      transforms: 1, meshes: 1, materials: 1, lights: 0, instances: 1,
      skeletons: 1, jointsPerSkeleton: rig.skeletons[0]!.jointNodes.length,
    });
    const mesh = scene.registerMesh(geometry);
    const material = scene.createMaterial({ shading: "lit", skinning: true });
    const skeleton = scene.createSkeleton(rig.skeletons[0]!.jointNodes.length);
    const pose = createGltfPoseOutput(rig), palette = new Float32Array(32);
    evaluateGltfAnimationPose(rig, { skeleton: 0, clip: 0, timeSeconds: 0.5, meshNode: 3 }, pose, palette);
    scene.setSkeletonMatrices(skeleton, palette);
    const transform = scene.transforms.create();
    scene.createInstance({ mesh, material, skeleton, transform });
    const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 });
    scene.compile(commands);
    expect(scene.materialFlags[material] & MATERIAL_FLAG_SKINNED_3D).toBe(MATERIAL_FLAG_SKINNED_3D);
    expect(commands.commandFlags[0]).toBe(RENDER_COMMAND_FLAG_SKINNED_3D);
    expect(commands.commandSkeletonHandles[0]).toBe(skeleton);
    expect([...scene.skeletonMatrices]).toEqual([...palette]);

    const backendContract: Pick<WebGl2RendererOptions3D, "scene" | "maxInstances" | "maxJointsPerSkeleton"> = {
      scene, maxInstances: 1, maxJointsPerSkeleton: rig.skeletons[0]!.jointNodes.length,
    };
    expect(backendContract.maxJointsPerSkeleton).toBe(2);
  });

  test("rejects cubic, morph, and extension features with exact JSON pointers", async () => {
    const cubic = await fixture();
    cubic.animations[0].samplers[0].interpolation = "CUBICSPLINE";
    expect((await resolveAndCookGltfSkinAnimations(cubic)).diagnostics[0]).toEqual(expect.objectContaining({ code: "cubic-spline-unsupported", pointer: "/animations/0/samplers/0/interpolation" }));

    const morphChannel = await fixture();
    morphChannel.animations[0].channels[0].target.path = "weights";
    expect((await resolveAndCookGltfSkinAnimations(morphChannel)).diagnostics[0]).toEqual(expect.objectContaining({ code: "morph-animation-unsupported", pointer: "/animations/0/channels/0/target/path" }));

    const morphPrimitive = await fixture();
    morphPrimitive.meshes[0].primitives[0].targets = [{ POSITION: 0 }];
    expect((await resolveAndCookGltfSkinAnimations(morphPrimitive)).diagnostics[0]).toEqual(expect.objectContaining({ code: "morph-targets-unsupported", pointer: "/meshes/0/primitives/0/targets" }));

    const extension = await fixture();
    extension.nodes[1].extensions = { EXT_vendor_rig: {} };
    expect((await resolveAndCookGltfSkinAnimations(extension)).diagnostics[0]).toEqual(expect.objectContaining({ code: "extension-unsupported", pointer: "/nodes/1/extensions/EXT_vendor_rig" }));

    const required = await fixture();
    required.extensionsRequired = ["KHR_draco_mesh_compression"];
    expect((await resolveAndCookGltfSkinAnimations(required)).diagnostics[0]).toEqual(expect.objectContaining({ code: "required-extension-unsupported", pointer: "/extensionsRequired/0" }));
  });

  test("rejects malformed hierarchies, skin streams, accessors, and configured limits", async () => {
    const cycle = await fixture();
    cycle.nodes[2].children = [0];
    expect((await resolveAndCookGltfSkinAnimations(cycle)).diagnostics[0]).toEqual(expect.objectContaining({ code: "node-cycle", pointer: "/nodes" }));

    const jointRange = await fixture();
    const resolution = await (await import("./gltf-static.ts")).resolveGltfStaticBuffers(jointRange);
    resolution.buffers[0]![44] = 2;
    expect(cookGltfSkinAnimations(jointRange, resolution.buffers).diagnostics[0]).toEqual(expect.objectContaining({ code: "joint-index-out-of-range", pointer: "/meshes/0/primitives/0/attributes/JOINTS_0" }));

    const sparse = await fixture();
    sparse.accessors[3].sparse = { count: 1 };
    expect((await resolveAndCookGltfSkinAnimations(sparse)).diagnostics[0]).toEqual(expect.objectContaining({ code: "sparse-accessor-unsupported", pointer: "/accessors/3/sparse" }));

    const matrixChannel = await fixture();
    delete matrixChannel.nodes[2].translation;
    matrixChannel.nodes[2].matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1];
    expect((await resolveAndCookGltfSkinAnimations(matrixChannel)).diagnostics[0]).toEqual(expect.objectContaining({ code: "matrix-node-animation-unsupported", pointer: "/animations/0/channels/0/target/node" }));

    const limited = await resolveAndCookGltfSkinAnimations(await fixture(), { cook: { maxJointsPerSkin: 1 } });
    expect(limited.diagnostics[0]).toEqual(expect.objectContaining({ code: "joint-count-limit", pointer: "/skins/0/joints" }));
  });
});
