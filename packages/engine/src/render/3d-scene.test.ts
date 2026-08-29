import { expect, test } from "bun:test";
import {
  createFrustumPlanes3D,
  createMat4,
  extractFrustumPlanes3D,
  lookAtViewMat4,
  multiplyMat4,
  perspectiveMat4
} from "./3d-core.ts";
import {
  LIGHT_KIND_AMBIENT_3D,
  LIGHT_KIND_POINT_3D,
  MATERIAL_FLAG_ALPHA_MASK_3D,
  MATERIAL_FLAG_DOUBLE_SIDED_3D,
  MATERIAL_FLAG_LIT_3D,
  MATERIAL_FLAG_SKINNED_3D,
  MATERIAL_FLAG_TEXTURED_3D,
  RENDER_COMMAND_FLAG_SKINNED_3D,
  createBoundedScene3D,
  createTerrainStreamer3D,
  createRenderCommandBuffer3D,
  selectLodMesh3D
} from "./3d-scene.ts";

function triangle(offset = 0) {
  return new Float32Array([
    -0.5 + offset, -0.5, 0,
    0.5 + offset, -0.5, 0,
    offset, 0.5, 0
  ]);
}

function cameraFrustum() {
  const view = createMat4(), projection = createMat4(), viewProjection = createMat4();
  lookAtViewMat4(view, [0, 0, 0], [0, 0, -1]);
  perspectiveMat4(projection, { fovYRadians: Math.PI / 2, aspect: 1, near: 1, far: 20 });
  multiplyMat4(viewProjection, projection, view);
  return extractFrustumPlanes3D(createFrustumPlanes3D(), viewProjection);
}

function sceneLimits(overrides: Partial<{
  transforms: number; meshes: number; materials: number; lights: number; instances: number; textures: number; textureBytes: number;
  skeletons: number; jointsPerSkeleton: number;
}> = {}) {
  return { transforms: 8, meshes: 4, materials: 4, lights: 4, instances: 8, ...overrides };
}

function skinnedTriangle(joint = 1) {
  return {
    positions: new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    joints: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, joint, 0, 0, 0]),
    weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
  };
}

test("skeleton palettes are fixed-capacity, lifecycle-safe, and split instancing by palette", () => {
  expect(() => createBoundedScene3D(sceneLimits({ skeletons: 1 }))).toThrow("jointsPerSkeleton");
  const scene = createBoundedScene3D(sceneLimits({ transforms: 3, skeletons: 2, jointsPerSkeleton: 2, instances: 3 }));
  const mesh = scene.registerMesh(skinnedTriangle());
  const material = scene.createMaterial({ shading: "lit", skinning: true });
  expect(scene.materialFlags[material] & MATERIAL_FLAG_SKINNED_3D).toBe(MATERIAL_FLAG_SKINNED_3D);
  const firstSkeleton = scene.createSkeleton(2);
  const secondSkeleton = scene.createSkeleton(2);
  expect(scene.skeletonMatrices[scene.skeletonMatrixOffset(firstSkeleton)]).toBe(1);
  const palette = new Float32Array(32);
  for (let joint = 0; joint < 2; joint += 1) {
    palette[joint * 16] = 1; palette[joint * 16 + 5] = 1; palette[joint * 16 + 10] = 1; palette[joint * 16 + 15] = 1;
  }
  palette[16 + 12] = 0.25;
  scene.setSkeletonMatrices(firstSkeleton, palette);
  expect(scene.skeletonMatrices[scene.skeletonMatrixOffset(firstSkeleton) + 28]).toBe(0.25);
  const transforms = [scene.transforms.create(), scene.transforms.create(), scene.transforms.create()];
  const instances = [
    scene.createInstance({ mesh, material, transform: transforms[0], skeleton: firstSkeleton }),
    scene.createInstance({ mesh, material, transform: transforms[1], skeleton: firstSkeleton }),
    scene.createInstance({ mesh, material, transform: transforms[2], skeleton: secondSkeleton })
  ];
  const output = createRenderCommandBuffer3D({ commands: 3, instances: 3, lights: 0 });
  scene.compile(output);
  expect(output.commandCount).toBe(2);
  expect(Array.from(output.commandSkeletonHandles.slice(0, 2))).toEqual([firstSkeleton, secondSkeleton]);
  expect(Array.from(output.commandInstanceCounts.slice(0, 2))).toEqual([2, 1]);
  expect(output.commandFlags[0]).toBe(RENDER_COMMAND_FLAG_SKINNED_3D);
  expect(() => scene.destroySkeleton(firstSkeleton)).toThrow("still referenced");
  expect(() => scene.updateMaterial(material, { shading: "lit" })).toThrow("skinning change");
  for (const instance of instances) scene.destroyInstance(instance);
  scene.destroySkeleton(firstSkeleton);
  expect(scene.createSkeleton(1)).toBe(firstSkeleton);
});

test("skinning validates paired streams, normalized weights, joint range, and material compatibility", () => {
  const scene = createBoundedScene3D(sceneLimits({ skeletons: 1, jointsPerSkeleton: 2 }));
  expect(() => scene.registerMesh({ ...skinnedTriangle(), weights: undefined })).toThrow("provided together");
  const badWeights = skinnedTriangle();
  badWeights.weights[0] = 0.5;
  expect(() => scene.registerMesh(badWeights)).toThrow("sum to 1");
  const mesh = scene.registerMesh(skinnedTriangle(2));
  const staticMaterial = scene.createMaterial();
  const skinnedMaterial = scene.createMaterial({ skinning: true });
  const transform = scene.transforms.create();
  const skeleton = scene.createSkeleton(2);
  expect(() => scene.createInstance({ mesh, material: staticMaterial, transform, skeleton })).toThrow("requires a material");
  expect(() => scene.createInstance({ mesh, material: skinnedMaterial, transform, skeleton })).toThrow("JOINTS_0 index 2");
  expect(() => scene.setSkeletonMatrices(skeleton, new Float32Array(16))).toThrow("exactly 32");
});

test("texture registry enforces capacity, byte ownership, references, and material flags", () => {
  expect(() => createBoundedScene3D(sceneLimits({ textures: 1 }))).toThrow("textureBytes");
  const scene = createBoundedScene3D(sceneLimits({ textures: 1, textureBytes: 16 }));
  const pixels = new Uint8Array([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 255, 0
  ]);
  const texture = scene.registerTexture({ width: 2, height: 2, pixels, filter: "nearest" });
  expect(scene.getTexture(texture).pixels).toBe(pixels);
  expect(scene.textureBytes).toBe(16);
  const material = scene.createMaterial({ shading: "lit", baseColorTexture: texture, alphaMode: "mask" });
  expect(scene.materialTextureHandles[material]).toBe(texture);
  expect(scene.materialFlags[material]).toBe(MATERIAL_FLAG_LIT_3D | MATERIAL_FLAG_TEXTURED_3D | MATERIAL_FLAG_ALPHA_MASK_3D);
  expect(() => scene.destroyTexture(texture)).toThrow("still referenced");
  scene.updateMaterial(material, { shading: "unlit" });
  expect(scene.materialTextureHandles[material]).toBe(-1);
  scene.destroyTexture(texture);
  expect(scene.textureBytes).toBe(0);
  expect(scene.registerTexture({ width: 2, height: 2, pixels })).toBe(texture);
  expect(() => scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array(4) })).toThrow("budget");
  expect(scene.textureCount).toBe(1);
});

test("ambient lights compile into the bounded light stream", () => {
  const scene = createBoundedScene3D(sceneLimits({ lights: 1 }));
  const light = scene.createLight({ kind: "ambient", color: [0.2, 0.3, 0.4], intensity: 0.5 });
  const output = createRenderCommandBuffer3D({ commands: 0, instances: 0, lights: 1 });
  scene.compile(output);
  expect(output.lightCount).toBe(1);
  expect(output.lightSceneHandles[0]).toBe(light);
  expect(output.lightTypes[0]).toBe(LIGHT_KIND_AMBIENT_3D);
  expect(Array.from(output.lightData.slice(8, 12))).toEqual([expect.closeTo(0.2), expect.closeTo(0.3), expect.closeTo(0.4), 0.5]);
});

test("mesh and material registries validate GPU-ready data and preserve borrowed buffers", () => {
  const scene = createBoundedScene3D(sceneLimits({ meshes: 1, materials: 1 }));
  const positions = triangle();
  const mesh = scene.registerMesh({ positions });
  expect(scene.getMesh(mesh).positions).toBe(positions);
  const material = scene.createMaterial({
    baseColor: [0.2, 0.4, 0.6, 0.8],
    metallic: 0.25,
    roughness: 0.75,
    alphaMode: "mask",
    doubleSided: true
  });
  expect(Array.from(scene.materialData.slice(0, 10))).toEqual([
    expect.closeTo(0.2), expect.closeTo(0.4), expect.closeTo(0.6), expect.closeTo(0.8),
    0, 0, 0, 0.25, 0.75, 0.5
  ]);
  expect(scene.materialFlags[material]).toBe(MATERIAL_FLAG_ALPHA_MASK_3D | MATERIAL_FLAG_DOUBLE_SIDED_3D);
  expect(() => scene.registerMesh({ positions: new Float32Array([0, 0]) })).toThrow("packed xyz");
  expect(scene.meshCount).toBe(1);
  expect(() => scene.registerMesh({ positions: triangle(1) })).toThrow("exhausted");
});

test("mesh registry validates bounded position morph targets", () => {
  const scene = createBoundedScene3D(sceneLimits({ meshes: 2 }));
  const positions = triangle();
  const morph = new Float32Array(positions.length);
  morph[7] = 0.5;
  const weights = new Float32Array([0.25]);
  const mesh = scene.registerMesh({ positions, morphPositions: [morph], morphWeights: weights });
  expect(scene.getMesh(mesh).morphPositions?.[0]).toBe(morph);
  expect(scene.getMesh(mesh).morphWeights).toBe(weights);
  expect(() => scene.registerMesh({ positions, morphPositions: [new Float32Array(3)] })).toThrow("must contain 9");
  expect(() => scene.registerMesh({ positions, morphWeights: [1] })).toThrow("require morphPositions");
});

test("first-party LOD selection is deterministic and safely rebinds scene instances", () => {
  const scene = createBoundedScene3D(sceneLimits({ meshes: 3, materials: 1, transforms: 1, instances: 1 }));
  const nearMesh = scene.registerMesh({ positions: triangle(), label: "near" });
  const middleMesh = scene.registerMesh({ positions: triangle(1), label: "middle" });
  const farMesh = scene.registerMesh({ positions: triangle(2), label: "far" });
  const material = scene.createMaterial();
  const transform = scene.transforms.create();
  const instance = scene.createInstance({ mesh: nearMesh, material, transform });
  const levels = [
    { maxDistance: 10, mesh: nearMesh },
    { maxDistance: 30, mesh: middleMesh },
    { maxDistance: Number.POSITIVE_INFINITY, mesh: farMesh }
  ] as const;

  expect(selectLodMesh3D(levels, 0)).toBe(nearMesh);
  expect(selectLodMesh3D(levels, 10)).toBe(nearMesh);
  expect(selectLodMesh3D(levels, 10.01)).toBe(middleMesh);
  expect(selectLodMesh3D(levels, 30)).toBe(middleMesh);
  expect(selectLodMesh3D(levels, 500)).toBe(farMesh);

  scene.setInstanceMesh(instance, selectLodMesh3D(levels, 31));
  const output = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 });
  scene.compile(output);
  expect(output.commandMeshHandles[0]).toBe(farMesh);
  expect(() => scene.setInstanceMesh(instance, 99)).toThrow();
  expect(() => selectLodMesh3D([], 1)).toThrow("at least one level");
  expect(() => selectLodMesh3D([{ maxDistance: 10, mesh: nearMesh }, { maxDistance: 5, mesh: farMesh }], 1)).toThrow("strictly increasing");
  expect(() => selectLodMesh3D(levels, Number.POSITIVE_INFINITY)).toThrow("finite");
});

test("terrain streamer loads, places, and unloads bounded first-party scene chunks", async () => {
  const scene = createBoundedScene3D(sceneLimits({ transforms: 2, meshes: 2, materials: 1, instances: 2 }));
  const material = scene.createMaterial(); const loaded: string[] = [];
  const streamer = createTerrainStreamer3D({
    scene, chunkSize: 16, radius: 0, maxLoadedChunks: 1, maxConcurrentLoads: 1,
    async load(coordinate) { loaded.push(`${coordinate.x},${coordinate.z}`); return { geometry: { positions: triangle() }, material, y: coordinate.x }; },
  });
  expect(await streamer.update(1, 1)).toMatchObject({ loaded: 1, loads: 1, unloads: 0 });
  expect(await streamer.update(17, 1)).toMatchObject({ loaded: 1, loads: 2, unloads: 1 });
  expect(loaded).toEqual(["0,0", "1,0"]);
  expect(scene.meshCount).toBe(1); expect(scene.instanceCount).toBe(1);
  streamer.dispose();
  expect(scene.meshCount).toBe(0); expect(scene.instanceCount).toBe(0);
  await expect(streamer.update(0, 0)).rejects.toThrow("disposed");
});

test("scene compilation culls and packs interleaved instances into deterministic batches", () => {
  const scene = createBoundedScene3D(sceneLimits());
  const meshA = scene.registerMesh({ positions: triangle(), label: "A" });
  const meshB = scene.registerMesh({ positions: triangle(), label: "B" });
  const materialA = scene.createMaterial({ baseColor: [1, 0, 0, 1] });
  const materialB = scene.createMaterial({ baseColor: [0, 1, 0, 1] });
  const transforms = [scene.transforms.create(), scene.transforms.create(), scene.transforms.create(), scene.transforms.create()];
  scene.transforms.setPosition(transforms[0], 0, 0, -3);
  scene.transforms.setPosition(transforms[1], 0, 0, -4);
  scene.transforms.setPosition(transforms[2], 1, 0, -5);
  scene.transforms.setPosition(transforms[3], 50, 0, -5);
  const first = scene.createInstance({ mesh: meshA, material: materialA, transform: transforms[0] });
  const second = scene.createInstance({ mesh: meshB, material: materialB, transform: transforms[1] });
  const third = scene.createInstance({ mesh: meshA, material: materialA, transform: transforms[2] });
  scene.createInstance({ mesh: meshA, material: materialA, transform: transforms[3] });

  const output = createRenderCommandBuffer3D({ commands: 2, instances: 4, lights: 0 });
  expect(scene.compile(output, { frustumPlanes: cameraFrustum() })).toBe(output);
  expect(output.commandCount).toBe(2);
  expect(Array.from(output.commandMeshHandles.slice(0, 2))).toEqual([meshA, meshB]);
  expect(Array.from(output.commandMaterialHandles.slice(0, 2))).toEqual([materialA, materialB]);
  expect(Array.from(output.commandFirstInstances.slice(0, 2))).toEqual([0, 2]);
  expect(Array.from(output.commandInstanceCounts.slice(0, 2))).toEqual([2, 1]);
  expect(Array.from(output.instanceSceneHandles.slice(0, 3))).toEqual([first, third, second]);
  expect([output.instanceMatrices[12], output.instanceMatrices[28], output.instanceMatrices[44]]).toEqual([0, 1, 0]);
  expect(output.testedInstances).toBe(4);
  expect(output.visibleInstances).toBe(3);
  expect(output.culledInstances).toBe(1);
  expect(output.instanceCount).toBe(3);
});

test("command, instance, light, and layer limits are observable without growing buffers", () => {
  const scene = createBoundedScene3D(sceneLimits());
  const meshA = scene.registerMesh({ positions: triangle() });
  const meshB = scene.registerMesh({ positions: triangle(1) });
  const materialA = scene.createMaterial();
  const materialB = scene.createMaterial();
  for (const [mesh, material] of [[meshA, materialA], [meshB, materialB], [meshA, materialA], [meshA, materialA]] as const) {
    const transform = scene.transforms.create();
    scene.transforms.setPosition(transform, 0, 0, -3);
    scene.createInstance({ mesh, material, transform });
  }
  const hiddenTransform = scene.transforms.create();
  scene.createInstance({ mesh: meshA, material: materialA, transform: hiddenTransform, layerMask: 2 });
  scene.createLight({ kind: "point", position: [1, 2, 3], color: [0.5, 0.6, 0.7], intensity: 4, range: 12 });
  scene.createLight({ kind: "directional", direction: [0, -2, 0] });
  scene.createLight({ kind: "point", layerMask: 2 });

  const output = createRenderCommandBuffer3D({ commands: 1, instances: 2, lights: 1 });
  scene.compile(output, { layerMask: 1 });
  expect(output.commandCount).toBe(1);
  expect(output.instanceCount).toBe(2);
  expect(output.visibleInstances).toBe(4);
  expect(output.commandLimitedInstances).toBe(1);
  expect(output.truncatedInstances).toBe(1);
  expect(output.filteredInstances).toBe(1);
  expect(output.matchingLights).toBe(2);
  expect(output.lightCount).toBe(1);
  expect(output.truncatedLights).toBe(1);
  expect(output.lightTypes[0]).toBe(LIGHT_KIND_POINT_3D);
  expect(Array.from(output.lightData.slice(0, 4))).toEqual([1, 2, 3, 12]);
  expect(output.instanceMatrices.byteLength).toBe(2 * 16 * Float32Array.BYTES_PER_ELEMENT);
});

test("resource lifecycle prevents dangling handles and reuses released slots", () => {
  const scene = createBoundedScene3D(sceneLimits({ transforms: 2, meshes: 1, materials: 1, instances: 1 }));
  const mesh = scene.registerMesh({ positions: triangle() });
  const material = scene.createMaterial();
  const transform = scene.transforms.create();
  expect(() => scene.createInstance({ mesh, material, transform, bounds: { x: 0, y: 0, z: 0, radius: -1 } })).toThrow("non-negative");
  expect(scene.instanceCount).toBe(0);
  const instance = scene.createInstance({ mesh, material, transform });
  expect(() => scene.destroyMesh(mesh)).toThrow("still referenced");
  expect(() => scene.destroyMaterial(material)).toThrow("still referenced");
  expect(() => scene.destroyTransform(transform)).toThrow("still referenced");
  scene.destroyInstance(instance);
  scene.destroyMesh(mesh);
  scene.destroyMaterial(material);
  scene.destroyTransform(transform);
  expect(scene.registerMesh({ positions: triangle() })).toBe(mesh);
  expect(scene.createMaterial()).toBe(material);
  expect(scene.transforms.create()).toBe(transform);
});

test("compiler diagnoses transforms destroyed outside scene lifecycle", () => {
  const scene = createBoundedScene3D(sceneLimits());
  const mesh = scene.registerMesh({ positions: triangle() });
  const material = scene.createMaterial();
  const transform = scene.transforms.create();
  scene.createInstance({ mesh, material, transform });
  scene.transforms.destroy(transform);
  const output = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 1 });
  scene.compile(output);
  expect(output.testedInstances).toBe(1);
  expect(output.invalidTransformInstances).toBe(1);
  expect(output.instanceCount).toBe(0);
});

test("repeated compilation is byte-deterministic and reuses output storage", () => {
  const scene = createBoundedScene3D(sceneLimits());
  const mesh = scene.registerMesh({ positions: triangle() });
  const material = scene.createMaterial();
  const transform = scene.transforms.create();
  scene.transforms.setPosition(transform, 2, 3, -4);
  scene.createInstance({ mesh, material, transform });
  const output = createRenderCommandBuffer3D({ commands: 2, instances: 2, lights: 2 });
  scene.compile(output);
  const firstMatrices = new Uint8Array(output.instanceMatrices.buffer.slice(0));
  const firstCommands = new Uint8Array(output.commandInstanceCounts.buffer.slice(0));
  const matrixStorage = output.instanceMatrices;
  scene.compile(output);
  expect(output.instanceMatrices).toBe(matrixStorage);
  expect(new Uint8Array(output.instanceMatrices.buffer)).toEqual(firstMatrices);
  expect(new Uint8Array(output.commandInstanceCounts.buffer)).toEqual(firstCommands);
});

test("light and output construction reject invalid finite and bounded inputs", () => {
  const scene = createBoundedScene3D(sceneLimits({ lights: 1 }));
  expect(() => scene.createLight({ kind: "spot", direction: [0, 0, 0] })).toThrow("non-zero direction");
  expect(scene.lightCount).toBe(0);
  expect(() => scene.createLight({ kind: "spot", innerConeRadians: 1, outerConeRadians: 0.5 })).toThrow("spot cones");
  expect(scene.lightCount).toBe(0);
  expect(() => createRenderCommandBuffer3D({ commands: -1, instances: 1, lights: 1 })).toThrow("non-negative");
});
