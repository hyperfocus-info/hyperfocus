import { expect, test } from "bun:test";
import { createMat4 } from "./3d-core.ts";
import { createBoundedScene3D, createRenderCommandBuffer3D } from "./3d-scene.ts";
import { createWebGl2Renderer3D, supportsWebGl2Renderer3D, WebGl2Renderer3D } from "./3d-webgl2.ts";

function createFakeWebGl2() {
  const VERTEX_SHADER = 0x8b31;
  const MAX_TEXTURE_SIZE = 0x0d33;
  const MAX_VERTEX_UNIFORM_VECTORS = 0x8dfb;
  const FRAMEBUFFER_COMPLETE = 0x8cd5;
  let failVertexCompile = false;
  let failFragmentCompile = false;
  let failLink = false;
  let contextLost = false;
  let maxVertexUniformVectors = 256;
  let nextId = 1;
  const drawArraysCalls: unknown[][] = [];
  const drawElementsCalls: unknown[][] = [];
  const bufferDataCalls: Array<{ target: number; bytes: number; usage: number }> = [];
  const bufferSubDataCalls: unknown[][] = [];
  const viewportCalls: unknown[][] = [];
  const enabled: number[] = [];
  const disabled: number[] = [];
  const deletedBuffers: unknown[] = [];
  const deletedPrograms: unknown[] = [];
  const deletedVertexArrays: unknown[] = [];
  const deletedTextures: unknown[] = [];
  const framebufferBinds: unknown[][] = [];
  const textureUploads: unknown[][] = [];
  const uniform1iCalls: unknown[][] = [];
  const uniform1fCalls: unknown[][] = [];
  const uniform3fCalls: unknown[][] = [];
  const uniform4fCalls: unknown[][] = [];
  const uniformMatrixCalls: unknown[][] = [];
  const vertexAttribIPointerCalls: unknown[][] = [];
  const shaderTypes = new Map<object, number>();
  return {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4, DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406, UNSIGNED_SHORT: 0x1403, UNSIGNED_INT: 0x1405, TRIANGLES: 0x0004, LINES: 0x0001,
    VERTEX_SHADER, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    DEPTH_TEST: 0x0b71, LEQUAL: 0x0203, BLEND: 0x0be2, CULL_FACE: 0x0b44, BACK: 0x0405, CCW: 0x0901,
    COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100, NO_ERROR: 0,
    MAX_TEXTURE_SIZE, MAX_VERTEX_UNIFORM_VECTORS, TEXTURE0: 0x84c0, TEXTURE_2D: 0x0de1,
    RGBA8: 0x8058, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, NEAREST: 0x2600, LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, REPEAT: 0x2901, CLAMP_TO_EDGE: 0x812f,
    UNPACK_ALIGNMENT: 0x0cf5, UNPACK_FLIP_Y_WEBGL: 0x9240, FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE, DEPTH_ATTACHMENT: 0x8d00, DEPTH_COMPONENT24: 0x81a6, DEPTH_COMPONENT: 0x1902,
    NONE: 0, TEXTURE_COMPARE_MODE: 0x884c, TEXTURE_COMPARE_FUNC: 0x884d, COMPARE_REF_TO_TEXTURE: 0x884e,
    get failVertexCompile() { return failVertexCompile; }, set failVertexCompile(value: boolean) { failVertexCompile = value; },
    get failFragmentCompile() { return failFragmentCompile; }, set failFragmentCompile(value: boolean) { failFragmentCompile = value; },
    get failLink() { return failLink; }, set failLink(value: boolean) { failLink = value; },
    get contextLost() { return contextLost; }, set contextLost(value: boolean) { contextLost = value; },
    get maxVertexUniformVectors() { return maxVertexUniformVectors; },
    set maxVertexUniformVectors(value: number) { maxVertexUniformVectors = value; },
    drawArraysCalls, drawElementsCalls, bufferDataCalls, bufferSubDataCalls, viewportCalls, enabled, disabled,
    deletedBuffers, deletedPrograms, deletedVertexArrays, deletedTextures, framebufferBinds, textureUploads,
    uniform1iCalls, uniform1fCalls, uniform3fCalls, uniform4fCalls, uniformMatrixCalls, vertexAttribIPointerCalls,
    createShader(type: number) { const value = { id: nextId++ }; shaderTypes.set(value, type); return value; },
    shaderSource() {}, compileShader() {},
    getShaderParameter(shader: object) { return shaderTypes.get(shader) === VERTEX_SHADER ? !failVertexCompile : !failFragmentCompile; },
    getShaderInfoLog(shader: object) { return shaderTypes.get(shader) === VERTEX_SHADER ? "vertex driver log" : "fragment driver log"; },
    deleteShader() {}, createProgram() { return { id: nextId++ }; }, attachShader() {}, linkProgram() {},
    getProgramParameter() { return !failLink; }, getProgramInfoLog() { return "link driver log"; },
    deleteProgram(program: unknown) { deletedPrograms.push(program); },
    getUniformLocation(_program: unknown, name: string) { return { name }; },
    getParameter(parameter: number) {
      if (parameter === MAX_TEXTURE_SIZE) return 4_096;
      if (parameter === MAX_VERTEX_UNIFORM_VECTORS) return maxVertexUniformVectors;
      return 0;
    },
    createBuffer() { return { id: nextId++ }; }, deleteBuffer(buffer: unknown) { deletedBuffers.push(buffer); }, bindBuffer() {},
    bufferData(target: number, sourceOrSize: ArrayBufferView | number, usage: number) {
      bufferDataCalls.push({ target, bytes: typeof sourceOrSize === "number" ? sourceOrSize : sourceOrSize.byteLength, usage });
    },
    bufferSubData(...args: unknown[]) { bufferSubDataCalls.push(args); },
    createVertexArray() { return { id: nextId++ }; }, deleteVertexArray(vao: unknown) { deletedVertexArrays.push(vao); },
    bindVertexArray() {}, enableVertexAttribArray() {}, disableVertexAttribArray() {}, vertexAttribPointer() {},
    vertexAttribIPointer(...args: unknown[]) { vertexAttribIPointerCalls.push(args); }, vertexAttribI4ui() {}, vertexAttribDivisor() {}, useProgram() {},
    enable(value: number) { enabled.push(value); }, disable(value: number) { disabled.push(value); },
    depthFunc() {}, depthMask() {}, cullFace() {}, frontFace() {}, clearColor() {}, clearDepth() {}, clear() {},
    uniformMatrix4fv(...args: unknown[]) { uniformMatrixCalls.push(args); }, uniform4f(...args: unknown[]) { uniform4fCalls.push(args); },
    uniform1f(...args: unknown[]) { uniform1fCalls.push(args); }, uniform1i(...args: unknown[]) { uniform1iCalls.push(args); },
    uniform3f(...args: unknown[]) { uniform3fCalls.push(args); }, createTexture() { return { id: nextId++ }; },
    deleteTexture(texture: unknown) { deletedTextures.push(texture); }, activeTexture() {}, bindTexture() {}, pixelStorei() {},
    texImage2D(...args: unknown[]) { textureUploads.push(args); }, texParameteri() {}, generateMipmap() {},
    createFramebuffer() { return { id: nextId++ }; }, deleteFramebuffer() {}, bindFramebuffer(...args: unknown[]) { framebufferBinds.push(args); },
    framebufferTexture2D() {}, drawBuffers() {}, readBuffer() {}, checkFramebufferStatus() { return FRAMEBUFFER_COMPLETE; }, colorMask() {},
    drawArraysInstanced(...args: unknown[]) { drawArraysCalls.push(args); }, drawElementsInstanced(...args: unknown[]) { drawElementsCalls.push(args); },
    viewport(...args: unknown[]) { viewportCalls.push(args); }, isContextLost() { return contextLost; }, getError() { return 0; },
  };
}

type FakeWebGl2 = ReturnType<typeof createFakeWebGl2>;

function createFakeCanvas(gl: FakeWebGl2) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    width: 1,
    height: 1,
    clientWidth: 100,
    clientHeight: 50,
    gl,
    listeners,
    getContext(kind: string) { return kind === "webgl2" ? gl : null; },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      let scoped = listeners.get(type);
      if (!scoped) { scoped = new Set(); listeners.set(type, scoped); }
      scoped.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { listeners.get(type)?.delete(listener); },
    dispatch(type: string) {
      const event = new Event(type, { cancelable: true });
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
      return event.defaultPrevented;
    },
  };
}

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

function litFixture() {
  const scene = createBoundedScene3D({
    transforms: 2, meshes: 1, materials: 1, lights: 3, instances: 2, textures: 1, textureBytes: 16
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
  scene.createLight({ kind: "point", position: [0, 0, 1] });
  const commands = createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 3 });
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
  const renderer = createWebGl2Renderer3D({
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
  expect(stats.uploadedBytes).toBe(2 * 64 + 36 + 36 + 24 + 48 + 6 + 2 * 64);
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
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 1 });
  renderer.render(commands, createMat4());
  expect(gl.bufferDataCalls.filter((call) => call.bytes === 36)).toHaveLength(3);
  expect(gl.uniform4fCalls).toContainEqual([{ name: "u_morphWeights" }, 0.25, 0.75, 0, 0]);
  weights[0] = 1; renderer.render(commands, createMat4());
  expect(gl.uniform4fCalls).toContainEqual([{ name: "u_morphWeights" }, 1, 0.75, 0, 0]);
});

test("directional shadow mapping renders a bounded depth pass and samples it in the lit pass", () => {
  const gl = createFakeWebGl2(); const canvas = createFakeCanvas(gl); const { scene, commands } = litFixture();
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 1, directionalShadowMapSize: 64 });
  const stats = renderer.render(commands, createMat4(), { cameraPosition: [0, 0, 2], shadowViewProjection: createMat4(), shadowBias: 0.002 });
  expect(stats.shadowDrawCalls).toBe(1);
  expect(gl.drawElementsCalls).toHaveLength(2);
  expect(gl.framebufferBinds.some((call) => call[1] !== null)).toBe(true);
  expect(gl.uniform1iCalls).toContainEqual([{ name: "u_shadowEnabled" }, 1]);
  expect(gl.uniform1fCalls).toContainEqual([{ name: "u_shadowBias" }, 0.002]);
});

test("hardware and configured uniform palette limits fail with precise diagnostics", () => {
  const gl = createFakeWebGl2();
  gl.maxVertexUniformVectors = 13;
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = skinnedFixture();
  expect(() => createWebGl2Renderer3D({
    canvas: canvas,
    context: gl,
    scene,
    maxInstances: 2,
    maxJointsPerSkeleton: 3
  })).toThrow("requires 17 vertex uniform vectors");
  const renderer = createWebGl2Renderer3D({
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
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 2 });
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
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 1 });
  const stats = renderer.render(commands, createMat4(), { cameraPosition: [1, 2, 3] });
  expect(stats.meshUploads).toBe(1);
  expect(stats.textureUploads).toBe(1);
  expect(stats.textureBindings).toBe(1);
  expect(stats.ambientLightsUsed).toBe(1);
  expect(stats.directionalLightsUsed).toBe(1);
  expect(stats.unsupportedLights).toBe(1);
  expect(stats.uploadedBytes).toBe(64 + 36 + 36 + 24 + 6 + 16);
  expect(gl.textureUploads).toHaveLength(2);
  expect(gl.uniform3fCalls.some((call) => call.slice(1).every((value, index) => Math.abs(Number(value) - [0.1, 0.2, 0.3][index]) < 1e-6))).toBe(true);
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

test("texture cache invalidates when a bounded scene texture handle is reused", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands, material, texture } = litFixture();
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 1 });
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

test("lit and textured materials precisely diagnose missing attributes and texture limits", () => {
  const gl = createFakeWebGl2();
  const canvas = createFakeCanvas(gl);
  const { scene, commands } = litFixture();
  const mesh = scene.getMesh(commands.commandMeshHandles[0]);
  const normals = mesh.normals;
  mesh.normals = undefined;
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 1 });
  expect(() => renderer.render(commands, createMat4())).toThrow("requires normals");
  mesh.normals = normals;
  const uvs = mesh.uvs;
  mesh.uvs = undefined;
  expect(() => renderer.render(commands, createMat4())).toThrow("requires UVs");
  mesh.uvs = uvs;
  const limited = createWebGl2Renderer3D({
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
  const renderer = createWebGl2Renderer3D({
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
  expect(stats.uploadedBytes).toBe(64 + 36 + 6);

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
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 4 });
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
  const renderer = createWebGl2Renderer3D({
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
  expect(() => createWebGl2Renderer3D({
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
  expect(() => createWebGl2Renderer3D({
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
  const renderer = createWebGl2Renderer3D({
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
  expect(() => createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 0 })).toThrow("positive");
  const renderer = createWebGl2Renderer3D({ canvas: canvas, context: gl, scene, maxInstances: 1 });
  expect(renderer).toBeInstanceOf(WebGl2Renderer3D);
  const legacyGl = createFakeWebGl2();
  const legacy = new WebGl2Renderer3D({ canvas: createFakeCanvas(legacyGl), context: legacyGl, scene, maxInstances: 1 });
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
