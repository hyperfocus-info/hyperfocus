import { expect, test } from "bun:test";
import { createMat4 } from "./3d-core.ts";
import { createBoundedScene3D, createRenderCommandBuffer3D } from "./3d-scene.ts";
import { createWebGl2Renderer3D, supportsWebGl2Renderer3D, WebGl2Renderer3D } from "./3d-webgl2.ts";

// GPU plumbing fixtures below explicitly opt out: several intentionally submit
// geometry beyond an identity camera. Default camera behavior is tested separately.



test('bounded point lights upload world position, finite range and intensity without retaining old lights', () => {
  const gl = createFakeWebGl2(), scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, instances: 1, lights: 9 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) });
  scene.createInstance({ mesh, material: scene.createMaterial(), transform: scene.transforms.create() });
  const lights = Array.from({ length: 9 }, (_, index) => scene.createLight({ kind: 'point', position: [index, 9, 8], color: [1, .5, .25], intensity: 2, range: 18 }));
  const arrays = new Map<string, number[]>();
  const record = (location: unknown, data: unknown) => {
    if (!location || typeof location !== 'object' || !(data instanceof Float32Array)) throw Error('Invalid light upload.');
    const name = Reflect.get(location, 'name');
    if (typeof name !== 'string') throw Error('Missing uniform name.');
    arrays.set(name, Array.from(data));
  };
  gl.uniform4fv = record;
  gl.uniform3fv = record;
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 9 });scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1 });
  const stats = renderer.render(commands, createMat4());expect(stats.pointLightsUsed).toBe(8);expect(stats.unsupportedLights).toBe(1);
  expect(arrays.get('u_pointPositions[0]')!.slice(0, 4)).toEqual([0, 9, 8, 18]);expect(arrays.get('u_pointColors[0]')!.slice(0, 3)).toEqual([2, 1, .5]);
  for (const light of lights) scene.destroyLight(light);scene.compile(commands);renderer.render(commands, createMat4());
  expect(stats.pointLightsUsed).toBe(0);expect(stats.unsupportedLights).toBe(0);expect(arrays.get('u_pointPositions[0]')!.every(value => value === 0)).toBe(true);
  renderer.dispose();
});

test('shadow coverage follows blended opacity and invisible surfaces cast no opaque shadow', () => {
  const gl = createFakeWebGl2(), scene = createBoundedScene3D({ transforms: 3, meshes: 1, materials: 3, instances: 3, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) });
  for (const opacity of [1, .25, 0]) scene.createInstance({ mesh, material: scene.createMaterial({ baseColor: [1, 1, 1, opacity], alphaMode: opacity < 1 ? 'blend' : 'opaque' }), transform: scene.transforms.create() });
  const commands = createRenderCommandBuffer3D({ commands: 3, instances: 3, lights: 0 });scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 3, directionalShadowMapSize: 128 });
  const stats = renderer.render(commands, createMat4(), { shadowViewProjection: createMat4() });
  expect(stats.shadowDrawCalls).toBe(2);
  expect(gl.uniform1fCalls.filter(call => uniformName(call) === 'u_shadowOpacity').map(call => call[1])).toEqual([1, .25]);
  renderer.dispose();
});

test('new and replaced material maps preserve their sampler units on the first draw', () => {
  const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl);
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, instances: 1, lights: 0, textures: 5, textureBytes: 20 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), uvs: new Float32Array([0, 0, 1, 0, 0, 1]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) });
  const textures = Array.from({ length: 5 }, (_, index) => scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array([index + 1, 0, 0, 255]) }));
  const material = scene.createMaterial({ baseColorTexture: textures[0], metallicRoughnessTexture: textures[1], normalTexture: textures[2], occlusionTexture: textures[3], emissiveTexture: textures[4] });
  scene.createInstance({ mesh, material, transform: scene.transforms.create() });
  const units = new Map<number, unknown>(), uploaded = new Map<number, unknown>();
  const draws: unknown[][] = [];
  let activeUnit = 0;
  gl.activeTexture = (unit: number) => { activeUnit = unit - gl.TEXTURE0; };
  gl.bindTexture = (_target: number, texture: unknown) => { units.set(activeUnit, texture); };
  const upload = gl.texImage2D;
  gl.texImage2D = (...args: unknown[]) => { upload(...args); const pixels = args.at(-1); if (pixels instanceof Uint8Array) uploaded.set(pixels[0]!, units.get(activeUnit)); };
  gl.drawArraysInstanced = () => { draws.push([0, 2, 3, 4, 5].map(unit => units.get(unit))); };
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 });scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 1 });
  renderer.render(commands, createMat4());
  const first = textures.map((_, index) => uploaded.get(index + 1));
  expect(draws[0]).toEqual(first);
  renderer.render(commands, createMat4());
  expect(draws[1]).toEqual(first);
  scene.replaceTexture({ handle: textures[2]!, width: 1, height: 1, pixels: new Uint8Array([99, 0, 0, 255]) });
  renderer.render(commands, createMat4());
  expect(draws[2]).toEqual([first[0], first[1], uploaded.get(99), first[3], first[4]]);
  renderer.dispose();
});

test('many plain materials retain distinct colors with constant unused texture and common uniform work', () => {
  const gl = createFakeWebGl2(), scene = createBoundedScene3D({ transforms: 20, meshes: 1, materials: 20, instances: 20, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) });
  for (let index = 0; index < 20; index++) scene.createInstance({ mesh, material: scene.createMaterial({ baseColor: [index / 20, 0, 0, 1], roughness: .5 }), transform: scene.transforms.create() });
  const commands = createRenderCommandBuffer3D({ commands: 20, instances: 20, lights: 0 });scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 20 });
  for (let frame = 0; frame < 2; frame++) {
    gl.uniform1fCalls.length = 0;gl.uniform4fCalls.length = 0;
    const stats = renderer.render(commands, createMat4());expect(stats.drawCalls).toBe(20);expect(stats.textureBindings).toBe(5);
    expect(gl.uniform1fCalls.filter(call => uniformName(call) === 'u_roughness')).toHaveLength(1);
    expect(gl.uniform4fCalls.filter(call => uniformName(call) === 'u_baseColor').map(call => call[1])).toEqual(Array.from({ length: 20 }, (_, index) => Math.fround(index / 20)));
  }
  renderer.dispose();
});

test("opaque scenery draws before earlier-authored blended feedback with depth writes disabled only for feedback", () => {
  const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl);
  const scene = createBoundedScene3D({ transforms: 4, meshes: 1, materials: 4, instances: 4, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) });
  for (const [index, alphaMode] of (["blend", "opaque", "blend", "mask"] as const).entries()) {
    const material = scene.createMaterial({ alphaMode, baseColor: [index / 4, 0, 0, 0.8] });
    scene.createInstance({ mesh, material, transform: scene.transforms.create() });
  }
  const draws: { color: number; depthWrite: boolean }[] = [];
  let color = -1, depthWrite = true;
  const originalUniform = gl.uniform4f;
  gl.uniform4f = (...args: unknown[]) => { originalUniform(...args); if (uniformName(args) === "u_baseColor") { const value = args[1];if (typeof value !== 'number') throw Error('Invalid uniform color.');color = value; } };
  gl.depthMask = (...args: unknown[]) => { const value = args[0];if (typeof value !== 'boolean') throw Error('Invalid depth mask.');depthWrite = value; };
  gl.drawArraysInstanced = () => { draws.push({ color, depthWrite }); };
  const commands = createRenderCommandBuffer3D({ commands: 4, instances: 4, lights: 0 });scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 4 });
  renderer.render(commands, createMat4());
  expect(draws).toEqual([{ color: .25, depthWrite: true }, { color: .75, depthWrite: true }, { color: 0, depthWrite: false }, { color: .5, depthWrite: false }]);
  renderer.dispose();
});


function uniformName(call: readonly unknown[]): string | undefined {
  const location = call[0];
  if (location === null || typeof location !== "object") return undefined;
  const name = Reflect.get(location, "name");
  return typeof name === "string" ? name : undefined;
}

function fixture(indexed = true) {
  const scene = createBoundedScene3D({ transforms: 4, meshes: 2, materials: 2, lights: 0, instances: 4 });
  const mesh = scene.registerMesh({
    positions: new Float32Array([-0.6, -0.5, 0, 0.6, -0.5, 0, 0, 0.6, 0]),
    indices: indexed ? new Uint16Array([0, 1, 2]) : undefined
  });
  const material = scene.createMaterial({ baseColor: [0.2, 0.7, 1, 1] });
  const transform = scene.transforms.create();
  scene.transforms.setPosition(transform, 0, 0, -2);
  const instance = scene.createInstance({ mesh, material, transform });
  const commands = createRenderCommandBuffer3D({ commands: 2, instances: 4, lights: 0 });
  scene.compile(commands);
  return { scene, mesh, material, transform, instance, commands };
}

test('matrix VAO bindings retain unchanged ranges, rebind moved ranges, and reset after context restoration', () => {
  const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl), { scene, commands } = fixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 4 });
  const pointers = () => gl.matrixAttributes.filter(call => call.kind === 'pointer');
  const enables = () => gl.matrixAttributes.filter(call => call.kind === 'enable');
  renderer.render(commands, createMat4());
  expect(pointers().map(call => call.args[5])).toEqual([0, 16, 32, 48]);
  expect(enables()).toHaveLength(4);
  renderer.render(commands, createMat4());
  expect(pointers()).toHaveLength(4);expect(enables()).toHaveLength(4);
  // A different live instance range must update all four column offsets even with the same mesh.
  commands.instanceCount = 2;commands.commandFirstInstances[0] = 1;
  renderer.render(commands, createMat4());
  expect(pointers().slice(-4).map(call => call.args[5])).toEqual([64, 80, 96, 112]);
  expect(enables()).toHaveLength(4);
  const previousVao = pointers()[0]!.vao;
  canvas.dispatch('webglcontextlost');canvas.dispatch('webglcontextrestored');
  renderer.render(commands, createMat4());
  expect(pointers()).toHaveLength(12);expect(enables()).toHaveLength(8);
  expect(pointers().at(-1)!.vao).not.toBe(previousVao);
  renderer.dispose();
});

function litFixture() {
  const scene = createBoundedScene3D({
    transforms: 2, meshes: 1, materials: 1, lights: 4, instances: 2, textures: 1, textureBytes: 16
  });
  const mesh = scene.registerMesh({
    label: "lit triangle",
    positions: new Float32Array([-0.6, -0.5, 0, 0.6, -0.5, 0, 0, 0.6, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0.5, 1]),
    indices: new Uint16Array([0, 1, 2])
  });
  const texture = scene.registerTexture({
    width: 2,
    height: 2,
    pixels: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]),
    filter: "nearest",
    mipmaps: true
  });
  const material = scene.createMaterial({
    shading: "lit",
    baseColorTexture: texture,
    alphaMode: "mask",
    alphaCutoff: 0.25,
    emissive: [0.05, 0.1, 0.2],
    metallic: 0.75,
    roughness: 0.35,
  });
  const transform = scene.transforms.create();
  scene.transforms.setPosition(transform, 0, 0, -2);
  scene.createInstance({ mesh, material, transform });
  scene.createLight({ kind: "ambient", color: [0.2, 0.4, 0.6], intensity: 0.5 });
  scene.createLight({ kind: "directional", direction: [0, 0, -1], color: [0.5, 0.5, 0.5], intensity: 2 });
  scene.createLight({ kind: "directional", direction: [1, -1, 0], color: [0.1, 0.2, 0.4], intensity: 3 });
  scene.createLight({ kind: "point", position: [0, 0, 1] });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 4 });
  scene.compile(commands);
  return { scene, commands, material, texture };
}

function skinnedFixture(jointType: "u8" | "u16" = "u8") {
  const scene = createBoundedScene3D({
    transforms: 2, meshes: 1, materials: 1, lights: 1, instances: 2, skeletons: 1, jointsPerSkeleton: 2
  });
  const mesh = scene.registerMesh({
    label: "skinned triangle",
    positions: new Float32Array([-0.6, -0.5, 0, 0.6, -0.5, 0, 0, 0.6, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    joints: jointType === "u16"
      ? new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0])
      : new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
    weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    indices: new Uint16Array([0, 1, 2])
  });
  const material = scene.createMaterial({ shading: "lit", skinning: true });
  const skeleton = scene.createSkeleton(2);
  const first = scene.transforms.create(), second = scene.transforms.create();
  scene.transforms.setPosition(first, -0.5, 0, -2);
  scene.transforms.setPosition(second, 0.5, 0, -2);
  scene.createInstance({ mesh, material, transform: first, skeleton });
  scene.createInstance({ mesh, material, transform: second, skeleton });
  scene.createLight({ kind: "ambient", intensity: 1 });
  const commands = createRenderCommandBuffer3D({ commands: 2, instances: 2, lights: 1 });
  scene.compile(commands);
  return { scene, commands, skeleton };
}

test("skinned indexed instances sharing a palette batch and upload bounded joint matrices", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = skinnedFixture("u16");
  const renderer = createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 2,
    maxJointsPerSkeleton: 2
  });
  const stats = renderer.render(commands, createMat4());
  expect(commands.commandCount).toBe(1);
  expect(commands.commandInstanceCounts[0]).toBe(2);
  expect(gl.drawElementsCalls[0]?.at(-1)).toBe(2);
  expect(stats.paletteUploads).toBe(1);
  expect(stats.paletteMatrices).toBe(2);
  expect(stats.skinnedDrawCalls).toBe(1);
  expect(stats.skinnedInstances).toBe(2);
  expect(stats.uploadedBytes).toBe(406);
  expect(gl.vertexAttribIPointerCalls).toContainEqual([7, 4, gl.UNSIGNED_SHORT, 0, 0]);
  expect(gl.uniformMatrixCalls.filter((call) => call.length === 5)).toHaveLength(1);
  renderer.render(commands, createMat4());
  expect(stats.paletteUploads).toBe(1);
});

test("position morph targets upload as bounded streams and bind live weights", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, lights: 0, instances: 1 });
  const weights = new Float32Array([0.25, 0.75]);
  const mesh = scene.registerMesh({
    positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
    morphPositions: [new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0]), new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 0])],
    morphWeights: weights,
  });
  const material = scene.createMaterial(); const transform = scene.transforms.create();
  scene.createInstance({ mesh, material, transform });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 }); scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 1 });
  renderer.render(commands, createMat4());
  expect(gl.bufferDataCalls.filter((call) => call.bytes === 36)).toHaveLength(3);
  expect(gl.uniform4fCalls).toContainEqual([{ name: "u_morphWeights" }, 0.25, 0.75, 0, 0]);
  weights[0] = 1; renderer.render(commands, createMat4());
  expect(gl.uniform4fCalls).toContainEqual([{ name: "u_morphWeights" }, 1, 0.75, 0, 0]);
});

test('separate shadow commands upload caster matrices before restoring the camera matrices', () => {
  const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl), { scene, commands } = litFixture();
  const shadowCommands = { ...commands, instanceMatrices: commands.instanceMatrices.slice() };
  shadowCommands.instanceMatrices[12] = 100;
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 1, directionalShadowMapSize: 64 });
  expect(() => renderer.render(commands, createMat4(), { shadowCommands })).toThrow('shadowViewProjection');
  const stats = renderer.render(commands, createMat4(), { shadowCommands, shadowViewProjection: createMat4() });
  const uploads = gl.bufferSubDataCalls.filter(call => call[2] === commands.instanceMatrices || call[2] === shadowCommands.instanceMatrices);
  expect(uploads).toHaveLength(2);expect(uploads[0]![2]).toBe(shadowCommands.instanceMatrices);expect(uploads[1]![2]).toBe(commands.instanceMatrices);
  expect(stats.shadowDrawCalls).toBe(1);expect(stats.drawCalls).toBe(1);
  expect(renderer.render(commands, createMat4(), { shadowCommands, shadowViewProjection: createMat4() }).uploadedBytes).toBe(128);
  const empty = { ...commands, commandCount: 0, instanceCount: 0 };
  expect(renderer.render(empty, createMat4(), { shadowCommands, shadowViewProjection: createMat4() }).shadowDrawCalls).toBe(1);
  expect(renderer.stats.drawCalls).toBe(0);
});

test('one command packet can retain shadow batching while its camera pass sorts transparency', () => {
  const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl);
  const scene = createBoundedScene3D({ transforms: 3, meshes: 1, materials: 2, instances: 3, lights: 0 });
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) });
  const materials = [scene.createMaterial({ alphaMode: 'blend', baseColor: [1, 0, 0, .5] }), scene.createMaterial({ alphaMode: 'blend', baseColor: [0, 1, 0, .5] })];
  for (let index = 0; index < 3; index++) {
    const transform = scene.transforms.create();scene.transforms.setPosition(transform, 0, 0, 3 - index);
    scene.createInstance({ mesh, transform, material: materials[index % 2]! });
  }
  const commands = scene.compile(createRenderCommandBuffer3D({ commands: 3, instances: 3, lights: 0 }));
  const before = commands.instanceMatrices.slice();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 3, directionalShadowMapSize: 64 });
  const stats = renderer.render(commands, createMat4(), { shadowViewProjection: createMat4(), shadowCommands: commands });
  expect(stats.shadowDrawCalls).toBe(2);expect(stats.drawCalls).toBe(3);
  expect(commands.instanceMatrices).toEqual(before);expect(commands.commandCount).toBe(2);
});

test("directional shadow mapping renders a bounded depth pass and samples it in the lit pass", () => {
  const gl = createFakeWebGl2(); const canvas = createFakeCanvas(gl); const { scene, commands } = litFixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 1, directionalShadowMapSize: 64 });
  const stats = renderer.render(commands, createMat4(), { cameraPosition: [0, 0, 2], shadowViewProjection: createMat4(), shadowBias: 0.002 });
  expect(stats.shadowDrawCalls).toBe(1);
  expect(gl.drawElementsCalls).toHaveLength(2);
  expect(gl.framebufferBinds.some((call) => call[1] !== null)).toBe(true);
  expect(gl.uniform1iCalls).toContainEqual([{ name: "u_shadowEnabled" }, 1]);
  expect(gl.uniform1fCalls).toContainEqual([{ name: "u_shadowBias" }, 0.002]);
  expect(gl.polygonOffsets).toEqual([[1.5, 2]]);
  expect(gl.drawPolygonOffsets).toEqual([true, false]);
  expect(gl.textureParameters).toContainEqual([gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR]);
  expect(gl.textureParameters).toContainEqual([gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR]);
  expect(gl.textureParameters).toContainEqual([gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE]);
});

test("hardware and configured uniform palette limits fail with precise diagnostics", () => {
  const gl = createFakeWebGl2();
  gl.maxVertexUniformVectors = 13;
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = skinnedFixture();
  expect(() => createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 2,
    maxJointsPerSkeleton: 3
  })).toThrow("requires 17 vertex uniform vectors");
  const renderer = createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 2,
    maxJointsPerSkeleton: 1
  });
  expect(() => renderer.render(commands, createMat4())).toThrow("jointCount 2 exceeds WebGL2 palette capacity 1");
});

test("skinned palettes resume uploading after context restoration", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = skinnedFixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 2 });
  renderer.render(commands, createMat4());
  canvas.dispatch("webglcontextlost");
  canvas.dispatch("webglcontextrestored");
  const stats = renderer.render(commands, createMat4());
  expect(stats.contextGeneration).toBe(2);
  expect(stats.paletteUploads).toBe(1);
  expect(stats.paletteMatrices).toBe(2);
});

test("lit textured path uploads normals, UVs, RGBA8 pixels, and consumes bounded lights", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = litFixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 1 });
  const stats = renderer.render(commands, createMat4(), { cameraPosition: [1, 2, 3] });
  expect(stats.meshUploads).toBe(1);
  expect(stats.textureUploads).toBe(1);
  expect(stats.textureBindings).toBe(6);
  expect(stats.ambientLightsUsed).toBe(1);
  expect(stats.directionalLightsUsed).toBe(2);
  expect(stats.unsupportedLights).toBe(0);
  expect(stats.pointLightsUsed).toBe(1);
  expect(stats.uploadedBytes).toBe(182);
  expect(gl.textureUploads).toHaveLength(2);
  expect(gl.uniform3fCalls.some((call) => call.slice(1).every((value, index) => Math.abs(Number(value) - [0.1, 0.2, 0.3][index]) < 1e-6))).toBe(true);
  expect(gl.uniform3fCalls).toContainEqual([{ name: "u_directionalColor1" }, 0.30000001192092896, 0.6000000238418579, 1.2000000476837158]);
  expect(gl.uniform3fCalls.some((call) => uniformName(call) === "u_emissive"
    && call.slice(1).every((value, index) => Math.abs(Number(value) - [0.05, 0.1, 0.2][index]) < 1e-6))).toBe(true);
  expect(gl.uniform3fCalls).toContainEqual([{ name: "u_cameraPosition" }, 1, 2, 3]);
  expect(gl.uniform1fCalls).toContainEqual([{ name: "u_metallic" }, 0.75]);
  expect(gl.uniform1fCalls.some((call) => uniformName(call) === "u_roughness" && Math.abs(Number(call[1]) - 0.35) < 1e-6)).toBe(true);
  renderer.render(commands, createMat4());
  expect(stats.meshUploads).toBe(0);
  expect(stats.textureUploads).toBe(0);
  expect(stats.uploadedBytes).toBe(64);
});

test("graphic-cel materials bind portable bands, tint, rim, and a silhouette outline pass", () => {
  const gl = createFakeWebGl2(); const canvas = createFakeCanvas(gl);
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, lights: 1, instances: 1 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) });
  const material = scene.createMaterial({ shading: "lit", shader: "toon", toon: { bands: 4, shadowColor: [0.1, 0.2, 0.3], rimColor: [0.4, 0.5, 0.6], rimStrength: 0.7, outlineColor: [0.01, 0.02, 0.03, 0.9], outlineWidth: 0.006 } });
  const transform = scene.transforms.create(); scene.createInstance({ mesh, material, transform }); scene.createLight({ kind: "ambient", intensity: 1 });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 1 }); scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 1 }); const stats = renderer.render(commands, createMat4());
  expect(stats.outlineDrawCalls).toBe(1); expect(stats.drawCalls).toBe(2); expect(gl.drawArraysCalls).toHaveLength(2);
  expect(gl.uniform1fCalls).toContainEqual([{ name: "u_toonBands" }, 4]);
  expect(gl.uniform1fCalls.some((call) => uniformName(call) === "u_toonRimStrength" && Math.abs(Number(call[1]) - 0.7) < 1e-6)).toBe(true);
  expect(gl.uniform1fCalls.some((call) => uniformName(call) === "u_outlineWidth" && Math.abs(Number(call[1]) - 0.006) < 1e-6)).toBe(true);
  expect(gl.uniform3fCalls.some((call) => uniformName(call) === "u_toonShadowColor" && call.slice(1).every((value, index) => Math.abs(Number(value) - [0.1, 0.2, 0.3][index]!) < 1e-6))).toBe(true);
  expect(gl.uniform3fCalls.some((call) => uniformName(call) === "u_toonRimColor" && call.slice(1).every((value, index) => Math.abs(Number(value) - [0.4, 0.5, 0.6][index]!) < 1e-6))).toBe(true);
  expect(gl.uniform1iCalls.filter((call) => uniformName(call) === "u_outlinePass").map((call) => call[1])).toEqual(expect.arrayContaining([0, 1]));
});

test('failed mesh replacement retires each GPU allocation once and permits retry', () => {
  const gl = createFakeWebGl2(), { scene, mesh, instance, material, transform, commands } = fixture();
  const buffers: unknown[] = [], allocate = gl.createBuffer, upload = gl.bufferData;
  gl.createBuffer = () => { const buffer = allocate(); buffers.push(buffer); return buffer; };
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1 });
  renderer.render(commands, createMat4());
  scene.destroyInstance(instance); scene.destroyMesh(mesh);
  const replacement = scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) });
  expect(replacement).toBe(mesh);
  scene.createInstance({ mesh: replacement, material, transform }); scene.compile(commands);
  gl.bufferData = (target, source, usage) => {
    if (usage === gl.STATIC_DRAW) throw new Error('mesh upload failed');
    upload(target, source, usage);
  };
  for (let attempt = 0; attempt < 2; attempt++) expect(() => renderer.render(commands, createMat4())).toThrow('mesh upload failed');
  gl.bufferData = upload;
  expect(renderer.render(commands, createMat4()).meshUploads).toBe(1);
  expect(renderer.render(commands, createMat4()).meshUploads).toBe(0);
  renderer.dispose(); renderer.dispose();
  expect(gl.deletedBuffers).toHaveLength(buffers.length);
  expect(new Set(gl.deletedBuffers)).toEqual(new Set(buffers));
  expect(new Set(gl.deletedVertexArrays).size).toBe(gl.deletedVertexArrays.length);
});

test('failed fallback texture initialization releases the texture and program', () => {
  const gl = createFakeWebGl2(), { scene } = fixture();
  const textures: unknown[] = [], allocate = gl.createTexture;
  gl.createTexture = () => { const texture = allocate(); textures.push(texture); return texture; };
  gl.texImage2D = () => { throw new Error('texture upload failed'); };
  expect(() => createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1 })).toThrow('texture upload failed');
  expect(gl.deletedTextures).toEqual(textures);
  expect(gl.deletedBuffers).toHaveLength(1);
  expect(gl.deletedPrograms).toHaveLength(1);
});

test("texture cache invalidates when a bounded scene texture handle is reused", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands, material, texture } = litFixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 1 });
  renderer.render(commands, createMat4());
  scene.updateMaterial(material, { shading: "lit" });
  scene.destroyTexture(texture);
  const reused = scene.registerTexture({ width: 2, height: 2, pixels: new Uint8Array(16).fill(180) });
  expect(reused).toBe(texture);
  scene.updateMaterial(material, { shading: "lit", baseColorTexture: reused });
  const deletedBefore = gl.deletedTextures.length;
  const stats = renderer.render(commands, createMat4());
  expect(stats.textureUploads).toBe(1);
  expect(gl.deletedTextures.length).toBe(deletedBefore + 1);
});

test('replacing referenced texture pixels refreshes each renderer once and releases its previous GPU resource', () => {
  const { scene, commands, texture } = litFixture();
  const renderers = [0, 1].map(() => { const gl = createFakeWebGl2();return { gl, renderer: createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1 }) }; });
  for (const { renderer } of renderers) renderer.render(commands, createMat4());
  scene.replaceTexture({ handle: texture, width: 2, height: 2, pixels: new Uint8Array(16).fill(180) });
  for (const { renderer, gl } of renderers) {
    const deleted = gl.deletedTextures.length;expect(renderer.render(commands, createMat4()).textureUploads).toBe(1);
    expect(gl.deletedTextures.length).toBe(deleted + 1);expect(renderer.render(commands, createMat4()).textureUploads).toBe(0);renderer.dispose();
  }
});

test('hidden replaced and destroyed textures release obsolete GPU images on each renderer next frame without uploading unused pixels', () => {
  const { scene, commands, texture, material } = litFixture();
  const renderers = [0, 1].map(() => { const gl = createFakeWebGl2();return { gl, renderer: createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1 }) }; });
  for (const { renderer } of renderers) renderer.render(commands, createMat4());
  scene.replaceTexture({ handle: texture, width: 1, height: 1, pixels: new Uint8Array([255, 255, 255, 255]) });
  scene.updateMaterial(material, { shading: 'lit' });
  for (const { renderer, gl } of renderers) {
    const deleted = gl.deletedTextures.length;expect(renderer.render(commands, createMat4()).textureUploads).toBe(0);
    expect(gl.deletedTextures.length).toBe(deleted + 1);renderer.render(commands, createMat4());expect(gl.deletedTextures.length).toBe(deleted + 1);
  }
  scene.updateMaterial(material, { shading: 'lit', baseColorTexture: texture });
  for (const { renderer, gl } of renderers) {
    const deleted = gl.deletedTextures.length;expect(renderer.render(commands, createMat4()).textureUploads).toBe(1);
    expect(renderer.render(commands, createMat4()).textureUploads).toBe(0);expect(gl.deletedTextures.length).toBe(deleted);
  }
  scene.updateMaterial(material, { shading: 'lit' });scene.destroyTexture(texture);
  for (const { renderer, gl } of renderers) {
    const deleted = gl.deletedTextures.length;expect(renderer.render(commands, createMat4()).textureUploads).toBe(0);expect(gl.deletedTextures.length).toBe(deleted + 1);renderer.dispose();
  }
});

test("lit and textured materials precisely diagnose missing attributes and texture limits", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = litFixture();
  const mesh = scene.getMesh(commands.commandMeshHandles[0]);
  const normals = mesh.normals;
  mesh.normals = undefined;
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 1 });
  expect(() => renderer.render(commands, createMat4())).toThrow("requires normals");
  mesh.normals = normals;
  const uvs = mesh.uvs;
  mesh.uvs = undefined;
  expect(() => renderer.render(commands, createMat4())).toThrow("requires UVs");
  mesh.uvs = uvs;
  const limited = createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 1,
    maxTextureSize: 1
  });
  expect(() => limited.render(commands, createMat4())).toThrow("dimensions 2x2");
});

test("WebGL2 renderer uploads, depth-tests, resizes for DPR, and reuses mesh resources", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = fixture(true);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 4,
    pixelRatio: 3,
    maxDevicePixelRatio: 2
  });
  const stats = renderer.render(commands, createMat4());
  expect(canvas.width).toBe(200);
  expect(canvas.height).toBe(100);
  expect(gl.viewportCalls.at(-1)).toEqual([0, 0, 200, 100]);
  expect(gl.enabled).toContain(gl.DEPTH_TEST);
  expect(gl.drawElementsCalls).toHaveLength(1);
  expect(stats.drawCalls).toBe(1);
  expect(stats.instances).toBe(1);
  expect(stats.triangles).toBe(1);
  expect(stats.meshUploads).toBe(1);
  expect(stats.materialBindings).toBe(1);
  expect(stats.uploadedBytes).toBe(106);

  const positionUploads = gl.bufferDataCalls.length;
  expect(renderer.render(commands, createMat4())).toBe(stats);
  expect(stats.meshUploads).toBe(0);
  expect(stats.uploadedBytes).toBe(64);
  expect(gl.bufferDataCalls).toHaveLength(positionUploads);
  expect(gl.bufferSubDataCalls).toHaveLength(2);
});

test("WebGL2 renderer invalidates a cached mesh when a handle is reused", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, mesh, material, transform, instance, commands } = fixture(false);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 4 });
  renderer.render(commands, createMat4());
  scene.destroyInstance(instance);
  scene.destroyMesh(mesh);
  const reusedMesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) });
  expect(reusedMesh).toBe(mesh);
  scene.createInstance({ mesh: reusedMesh, material, transform });
  scene.compile(commands);
  const deletedBefore = gl.deletedBuffers.length;
  const stats = renderer.render(commands, createMat4());
  expect(stats.meshUploads).toBe(1);
  expect(gl.deletedBuffers.length).toBeGreaterThan(deletedBefore);
  expect(gl.drawArraysCalls).toHaveLength(2);
});

test("context loss pauses rendering and restoration lazily reuploads resources", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = litFixture();
  const diagnostics: string[] = [];
  const renderer = createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 4,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code)
  });
  renderer.render(commands, createMat4());
  expect(canvas.dispatch("webglcontextlost")).toBe(true);
  const drawsBefore = gl.drawElementsCalls.length;
  const lost = renderer.render(commands, createMat4());
  expect(lost.skipped).toBe(true);
  expect(lost.contextLost).toBe(true);
  expect(gl.drawElementsCalls).toHaveLength(drawsBefore);
  canvas.dispatch("webglcontextrestored");
  const restored = renderer.render(commands, createMat4());
  expect(restored.skipped).toBe(false);
  expect(restored.contextGeneration).toBe(2);
  expect(restored.meshUploads).toBe(1);
  expect(restored.textureUploads).toBe(1);
  expect(diagnostics).toEqual(["context-lost", "context-restored"]);
});

test("shader diagnostics include the driver log and numbered source", () => {
  const gl = createFakeWebGl2();
  gl.failVertexCompile = true;
  const canvas = createFakeCanvas(gl);
  const { scene } = fixture();
  const diagnostics: string[] = [];
  expect(() => createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 1,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.message)
  })).toThrow("vertex driver log");
  expect(diagnostics[0]).toContain("1: #version 300 es");
  expect(canvas.listeners.size).toBe(0);
});

test("program link diagnostics preserve the driver log", () => {
  const gl = createFakeWebGl2();
  gl.failLink = true;
  const canvas = createFakeCanvas(gl);
  const { scene } = fixture();
  const codes: string[] = [];
  expect(() => createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 1,
    onDiagnostic: (diagnostic) => codes.push(diagnostic.code)
  })).toThrow("link driver log");
  expect(codes).toEqual(["program-link"]);
  expect(gl.deletedPrograms).toHaveLength(1);
});

test("a canvas without CSS layout dimensions does not compound DPR resizing", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  canvas.clientWidth = 0;
  canvas.clientHeight = 0;
  canvas.width = 320;
  canvas.height = 180;
  const { scene, commands } = fixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false,
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 1,
    pixelRatio: 2
  });
  renderer.render(commands, createMat4());
  expect([canvas.width, canvas.height]).toEqual([640, 360]);
  renderer.render(commands, createMat4());
  expect([canvas.width, canvas.height]).toEqual([640, 360]);
});

test("renderer validates capacities, command ranges, support, and disposal", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = fixture();
  expect(supportsWebGl2Renderer3D(canvas)).toBe(true);
  expect(() => createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 0 })).toThrow("positive");
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: canvas, context: gl, scene, maxInstances: 1 });
  expect(renderer).toBeInstanceOf(WebGl2Renderer3D);
  const legacyGl = createFakeWebGl2();
  const legacy = new WebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(legacyGl), context: legacyGl, scene, maxInstances: 1 });
  expect(legacy).toBeInstanceOf(WebGl2Renderer3D);
  legacy.dispose();
  commands.commandFirstInstances[0] = 2;
  expect(() => renderer.render(commands, createMat4())).toThrow("instance range");
  commands.commandFirstInstances[0] = 0;
  renderer.dispose();
  expect(renderer.isDisposed()).toBe(true);
  expect(canvas.listeners.get("webglcontextlost")?.size).toBe(0);
  expect(() => renderer.render(commands, createMat4())).toThrow("disposed");
});

test('source-over transparency preserves opaque coverage and accumulates partial coverage', () => {
  const gl = createFakeWebGl2(), { scene, material, commands } = fixture(false);
  scene.updateMaterial(material, { alphaMode: 'blend', baseColor: [.3, .85, 1, .2] });
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 4 });
  renderer.render(commands, createMat4());
  const factor = (value: number, alpha: number) => value === gl.ONE ? 1 : value === gl.ZERO ? 0 : value === gl.SRC_ALPHA ? alpha : value === gl.ONE_MINUS_SRC_ALPHA ? 1 - alpha : NaN;
  const blend = (source: number, destination: number, alpha: number, channel: number) => source * factor(gl.blendFactors[channel]!, alpha) + destination * factor(gl.blendFactors[channel + 1]!, alpha);
  expect(blend(.2, 1, .2, 2)).toBeCloseTo(1, 12);
  expect(blend(.2, .4, .2, 2)).toBeCloseTo(.52, 12);
  expect(blend(.3, .7, .2, 0)).toBeCloseTo(.62, 12);
  scene.updateMaterial(material, { alphaMode: 'additive' });renderer.render(commands, createMat4());
  expect(blend(.3, .7, .2, 0)).toBeCloseTo(.76, 12);
  expect(blend(.2, .1, .2, 2)).toBeCloseTo(.14, 12);
  renderer.dispose();
});

test("transparent toon material cannot write a solid outline depth mask", () => {
  const gl = createFakeWebGl2(); const canvas = createFakeCanvas(gl);
  const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, lights: 1, instances: 1 });
  const mesh = scene.registerMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) });
  const material = scene.createMaterial({ shading: "lit", shader: "toon", alphaMode: "blend", baseColor: [1, 1, 1, .12], toon: { bands: 4, shadowColor: [0.1, 0.2, 0.3], rimColor: [0.4, 0.5, 0.6], rimStrength: 0.7, outlineColor: [0.01, 0.02, 0.03, 0.9], outlineWidth: 0.006 } });
  const transform = scene.transforms.create(); scene.createInstance({ mesh, material, transform }); scene.createLight({ kind: "ambient", intensity: 1 });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 1 }); scene.compile(commands);
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 1 }); const stats = renderer.render(commands, createMat4());
  expect(stats.outlineDrawCalls).toBe(0); expect(stats.drawCalls).toBe(1); expect(gl.drawArraysCalls).toHaveLength(1);
});

test('cutaway edges reuse one expanded mesh, preserve one draw, and recover GPU resources', () => {
  const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl);
  const { scene, material, commands } = fixture(false);
  scene.updateMaterial(material, { cutaway: true, alphaMode: 'blend', baseColor: [.3, .4, .5, .035] });
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas, context: gl, scene, maxInstances: 4 });
  const first = { ...renderer.render(commands, createMat4()) };
  expect(first.drawCalls).toBe(1);expect(first.outlineDrawCalls).toBe(0);expect(first.meshUploads).toBe(1);
  expect(gl.uniform1iCalls.some(call => uniformName(call) === 'u_cutaway' && call[1] === 1)).toBe(true);
  expect(renderer.render(commands, createMat4()).meshUploads).toBe(0);
  canvas.dispatch('webglcontextlost');expect(renderer.render(commands, createMat4()).skipped).toBe(true);
  canvas.dispatch('webglcontextrestored');expect(renderer.render(commands, createMat4()).meshUploads).toBe(1);
  const deleted = gl.deletedBuffers.length;renderer.dispose();expect(gl.deletedBuffers.length).toBeGreaterThan(deleted);
});

test('cutaway edges render from inside single-sided scenery without writing depth, then restore ordinary culling', () => {
  const gl = createFakeWebGl2(), { scene, material, commands } = fixture(false);
  let culled = false, depth = true;
  const draws: Array<{ culled: boolean; depth: boolean }> = [];
  gl.enable = value => { if (value === gl.CULL_FACE) culled = true; };
  gl.disable = value => { if (value === gl.CULL_FACE) culled = false; };
  gl.depthMask = (...args: unknown[]) => { if (typeof args[0] === 'boolean') depth = args[0]; };
  gl.drawArraysInstanced = () => { draws.push({ culled, depth }); };
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 4 });
  scene.updateMaterial(material, { cutaway: true, doubleSided: false, alphaMode: 'blend', baseColor: [.3, .4, .5, .035] });
  renderer.render(commands, createMat4());
  scene.updateMaterial(material, { cutaway: false, doubleSided: false, alphaMode: 'opaque', baseColor: [.3, .4, .5, 1] });
  renderer.render(commands, createMat4());
  expect(draws).toEqual([{ culled: false, depth: false }, { culled: true, depth: true }]);
  renderer.dispose();
});


test('host pixel ratio is injected and a DOM global cannot change the renderer default', () => {
  const { scene } = litFixture(), gl = createFakeWebGl2();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 3 });
  try {
    const plain = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1 });
    plain.resize({ cssWidth: 100, cssHeight: 50 });expect(plain.stats.pixelRatio).toBe(1);plain.dispose();
    let ratio = 2;
    const hosted = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1, pixelRatio: () => ratio });
    hosted.resize({ cssWidth: 100, cssHeight: 50 });expect(hosted.stats.pixelRatio).toBe(2);
    ratio = 1;hosted.resize({ cssWidth: 100, cssHeight: 50 });expect(hosted.stats.pixelRatio).toBe(1);hosted.dispose();
  } finally {
    if (previous) Object.defineProperty(globalThis, 'devicePixelRatio', previous);
    else Reflect.deleteProperty(globalThis, 'devicePixelRatio');
  }
});

test('camera culling is selected at construction, defaults off, and uses packet matrices', () => {
  const { scene, commands } = fixture();
  commands.instanceMatrices[12] = 100;
  commands.instanceMatrices[14] = 0;
  for (const cameraCulling of [undefined, false, true]) {
    const gl = createFakeWebGl2();
    const renderer = createWebGl2Renderer3D({ canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 4, cameraCulling });
    expect(renderer.render(commands, createMat4()).instances).toBe(cameraCulling === true ? 0 : 1);
    expect(gl.drawElementsCalls.length).toBe(cameraCulling === true ? 0 : 1);
    commands.instanceMatrices[12] = 0;
    // The scene transform remains z=-2, but the authoritative packet is visible.
    expect(renderer.render(commands, createMat4()).instances).toBe(1);
    commands.instanceMatrices[12] = 100;
    renderer.dispose();
  }
});

test('camera culling preserves full shadow draws and explicit shadow packet precedence', () => {
  const gl = createFakeWebGl2(), { scene, commands, mesh, material } = fixture();
  const transform = scene.transforms.create(); scene.transforms.setPosition(transform, 20, 0, 0);
  scene.createInstance({ mesh, material, transform }); scene.compile(commands);
  commands.instanceMatrices[14] = 0;
  const renderer = createWebGl2Renderer3D({ canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 4, directionalShadowMapSize: 64, cameraCulling: true });
  const stats = { ...renderer.render(commands, createMat4(), { shadowViewProjection: createMat4() }) };
  expect(stats.instances).toBe(1); expect(stats.shadowDrawCalls).toBe(1);
  expect(gl.drawElementsCalls.map(call => call[4])).toEqual([2, 1]);
  const shadowCommands = { ...commands, commandInstanceCounts: Uint32Array.from([1, 0]), commandFirstInstances: Uint32Array.from([1, 0]) };
  gl.drawElementsCalls.length = 0;
  renderer.render(commands, createMat4(), { shadowViewProjection: createMat4(), shadowCommands });
  expect(gl.drawElementsCalls.map(call => call[4])).toEqual([1, 1]);
  renderer.dispose();
});

test('offscreen invalid resources preserve native validation errors with culling enabled', () => {
  const cases: Array<() => { scene: ReturnType<typeof createBoundedScene3D>; commands: ReturnType<typeof createRenderCommandBuffer3D>; maxTextureSize?: number }> = [
    () => { const f = fixture(); f.scene.destroyInstance(f.instance); f.scene.destroyMesh(f.mesh); return f; },
    () => { const f = fixture(); f.scene.destroyInstance(f.instance); f.scene.destroyMaterial(f.material); return f; },
    () => { const f = fixture(); f.scene.updateMaterial(f.material, { shading: 'lit' }); return f; },
    () => { const f = fixture(); f.commands.commandFlags[0] = 1; f.commands.commandSkeletonHandles[0] = 999; return f; },
    () => { const f = skinnedFixture(); f.commands.commandSkeletonHandles[0] = 999; return f; },
    () => { const f = litFixture(); f.scene.materialTextureHandles[f.material * 5] = 999; return f; },
    () => ({ ...litFixture(), maxTextureSize: 1 }),
  ];
  for (const build of cases) {
    const { scene, commands, maxTextureSize } = build(); commands.instanceMatrices[12] = 100;
    const errors: string[] = [];
    for (const cameraCulling of [false, true]) {
      const gl = createFakeWebGl2();
      const renderer = createWebGl2Renderer3D({ canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 4, cameraCulling, maxTextureSize });
      try { renderer.render(commands, createMat4()); errors.push('NO ERROR'); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      finally { renderer.dispose(); }
    }
    expect(errors[0]).not.toBe('NO ERROR'); expect(errors[1]).toBe(errors[0]);
  }
});

test('camera culling retains degenerate camera and transform inputs for the native draw path', () => {
  const { scene, commands } = fixture(); const gl = createFakeWebGl2();
  const renderer = createWebGl2Renderer3D({ canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 4, cameraCulling: true });
  expect(renderer.render(commands, new Float32Array(16)).instances).toBe(1);
  commands.instanceMatrices[15] = 2;
  expect(renderer.render(commands, createMat4()).instances).toBe(1);
  renderer.dispose();
});


test('per-frame experiments disable and restore submissions and shadows without editing authored materials', () => {
  const gl = createFakeWebGl2(), { scene, commands, material } = litFixture();
  const renderer = createWebGl2Renderer3D({ cameraCulling: false, canvas: createFakeCanvas(gl), context: gl, scene, maxInstances: 1, directionalShadowMapSize: 64 });
  const originalFlags = scene.materialFlags[material];
  const options: NonNullable<Parameters<typeof renderer.render>[2]> = { cameraPosition: [0, 0, 2], shadowViewProjection: createMat4() };
  expect(renderer.render(commands, createMat4(), options).shadowDrawCalls).toBe(1);
  expect(renderer.render(commands, createMat4(), { ...options, features: { shadows: false, lighting: false, materialFeatures: false } }).shadowDrawCalls).toBe(0);
  expect(scene.materialFlags[material]).toBe(originalFlags);
  const draws = gl.drawElementsCalls.length;
  renderer.render(commands, createMat4(), { ...options, features: { scene: false } });
  expect(gl.drawElementsCalls.length).toBe(draws);
  expect(renderer.render(commands, createMat4(), options).shadowDrawCalls).toBe(1);
  renderer.dispose();
});
import { createFakeWebGl2, createFakeCanvas } from "../test-support/webgl2.ts";
