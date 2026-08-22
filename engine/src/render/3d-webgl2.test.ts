import { expect, test } from "bun:test";
import { createMat4 } from "./3d-core.ts";
import { createBoundedScene3D, createRenderCommandBuffer3D } from "./3d-scene.ts";
import { createWebGl2Renderer3D, supportsWebGl2Renderer3D } from "./3d-webgl2.ts";

class FakeWebGl2 {
  readonly ARRAY_BUFFER = 0x8892;
  readonly ELEMENT_ARRAY_BUFFER = 0x8893;
  readonly STATIC_DRAW = 0x88e4;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly FLOAT = 0x1406;
  readonly UNSIGNED_SHORT = 0x1403;
  readonly UNSIGNED_INT = 0x1405;
  readonly TRIANGLES = 0x0004;
  readonly LINES = 0x0001;
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly DEPTH_TEST = 0x0b71;
  readonly LEQUAL = 0x0203;
  readonly BLEND = 0x0be2;
  readonly CULL_FACE = 0x0b44;
  readonly BACK = 0x0405;
  readonly CCW = 0x0901;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly DEPTH_BUFFER_BIT = 0x0100;
  readonly NO_ERROR = 0;
  readonly MAX_TEXTURE_SIZE = 0x0d33;
  readonly MAX_VERTEX_UNIFORM_VECTORS = 0x8dfb;
  readonly TEXTURE0 = 0x84c0;
  readonly TEXTURE_2D = 0x0de1;
  readonly RGBA8 = 0x8058;
  readonly RGBA = 0x1908;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly NEAREST = 0x2600;
  readonly LINEAR = 0x2601;
  readonly LINEAR_MIPMAP_LINEAR = 0x2703;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly REPEAT = 0x2901;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly UNPACK_ALIGNMENT = 0x0cf5;
  readonly UNPACK_FLIP_Y_WEBGL = 0x9240;
  readonly FRAMEBUFFER = 0x8d40;
  readonly FRAMEBUFFER_COMPLETE = 0x8cd5;
  readonly DEPTH_ATTACHMENT = 0x8d00;
  readonly DEPTH_COMPONENT24 = 0x81a6;
  readonly DEPTH_COMPONENT = 0x1902;
  readonly NONE = 0;
  readonly TEXTURE_COMPARE_MODE = 0x884c;
  readonly TEXTURE_COMPARE_FUNC = 0x884d;
  readonly COMPARE_REF_TO_TEXTURE = 0x884e;

  failVertexCompile = false;
  failFragmentCompile = false;
  failLink = false;
  contextLost = false;
  maxVertexUniformVectors = 256;
  nextId = 1;
  drawArraysCalls: unknown[][] = [];
  drawElementsCalls: unknown[][] = [];
  bufferDataCalls: Array<{ target: number; bytes: number; usage: number }> = [];
  bufferSubDataCalls: unknown[][] = [];
  viewportCalls: unknown[][] = [];
  enabled: number[] = [];
  disabled: number[] = [];
  deletedBuffers: unknown[] = [];
  deletedPrograms: unknown[] = [];
  deletedVertexArrays: unknown[] = [];
  deletedTextures: unknown[] = [];
  framebufferBinds: unknown[][] = [];
  textureUploads: unknown[][] = [];
  uniform1iCalls: unknown[][] = [];
  uniform1fCalls: unknown[][] = [];
  uniform3fCalls: unknown[][] = [];
  uniform4fCalls: unknown[][] = [];
  uniformMatrixCalls: unknown[][] = [];
  vertexAttribIPointerCalls: unknown[][] = [];
  shaderTypes = new Map<object, number>();

  createShader(type: number) { const value = { id: this.nextId++ }; this.shaderTypes.set(value, type); return value; }
  shaderSource() {}
  compileShader() {}
  getShaderParameter(shader: object) {
    const type = this.shaderTypes.get(shader);
    return type === this.VERTEX_SHADER ? !this.failVertexCompile : !this.failFragmentCompile;
  }
  getShaderInfoLog(shader: object) { return this.shaderTypes.get(shader) === this.VERTEX_SHADER ? "vertex driver log" : "fragment driver log"; }
  deleteShader() {}
  createProgram() { return { id: this.nextId++ }; }
  attachShader() {}
  linkProgram() {}
  getProgramParameter() { return !this.failLink; }
  getProgramInfoLog() { return "link driver log"; }
  deleteProgram(program: unknown) { this.deletedPrograms.push(program); }
  getUniformLocation(_program: unknown, name: string) { return { name }; }
  getParameter(parameter: number) {
    if (parameter === this.MAX_TEXTURE_SIZE) return 4_096;
    if (parameter === this.MAX_VERTEX_UNIFORM_VECTORS) return this.maxVertexUniformVectors;
    return 0;
  }
  createBuffer() { return { id: this.nextId++ }; }
  deleteBuffer(buffer: unknown) { this.deletedBuffers.push(buffer); }
  bindBuffer() {}
  bufferData(target: number, sourceOrSize: ArrayBufferView | number, usage: number) {
    this.bufferDataCalls.push({ target, bytes: typeof sourceOrSize === "number" ? sourceOrSize : sourceOrSize.byteLength, usage });
  }
  bufferSubData(...args: unknown[]) { this.bufferSubDataCalls.push(args); }
  createVertexArray() { return { id: this.nextId++ }; }
  deleteVertexArray(vao: unknown) { this.deletedVertexArrays.push(vao); }
  bindVertexArray() {}
  enableVertexAttribArray() {}
  disableVertexAttribArray() {}
  vertexAttribPointer() {}
  vertexAttribIPointer(...args: unknown[]) { this.vertexAttribIPointerCalls.push(args); }
  vertexAttribI4ui() {}
  vertexAttribDivisor() {}
  useProgram() {}
  enable(value: number) { this.enabled.push(value); }
  disable(value: number) { this.disabled.push(value); }
  depthFunc() {}
  depthMask() {}
  cullFace() {}
  frontFace() {}
  clearColor() {}
  clearDepth() {}
  clear() {}
  uniformMatrix4fv(...args: unknown[]) { this.uniformMatrixCalls.push(args); }
  uniform4f(...args: unknown[]) { this.uniform4fCalls.push(args); }
  uniform1f(...args: unknown[]) { this.uniform1fCalls.push(args); }
  uniform1i(...args: unknown[]) { this.uniform1iCalls.push(args); }
  uniform3f(...args: unknown[]) { this.uniform3fCalls.push(args); }
  createTexture() { return { id: this.nextId++ }; }
  deleteTexture(texture: unknown) { this.deletedTextures.push(texture); }
  activeTexture() {}
  bindTexture() {}
  pixelStorei() {}
  texImage2D(...args: unknown[]) { this.textureUploads.push(args); }
  texParameteri() {}
  generateMipmap() {}
  createFramebuffer() { return { id: this.nextId++ }; }
  deleteFramebuffer() {}
  bindFramebuffer(...args: unknown[]) { this.framebufferBinds.push(args); }
  framebufferTexture2D() {}
  drawBuffers() {}
  readBuffer() {}
  checkFramebufferStatus() { return this.FRAMEBUFFER_COMPLETE; }
  colorMask() {}
  drawArraysInstanced(...args: unknown[]) { this.drawArraysCalls.push(args); }
  drawElementsInstanced(...args: unknown[]) { this.drawElementsCalls.push(args); }
  viewport(...args: unknown[]) { this.viewportCalls.push(args); }
  isContextLost() { return this.contextLost; }
  getError() { return this.NO_ERROR; }
}

class FakeCanvas {
  width = 1;
  height = 1;
  clientWidth = 100;
  clientHeight = 50;
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(readonly gl: FakeWebGl2) {}

  getContext(kind: string) { return kind === "webgl2" ? this.gl : null; }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    let listeners = this.listeners.get(type);
    if (!listeners) { listeners = new Set(); this.listeners.set(type, listeners); }
    listeners.add(listener);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
  dispatch(type: string) {
    let prevented = false;
    const event = { preventDefault() { prevented = true; } } as Event;
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return prevented;
  }
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
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = skinnedFixture("u16");
  const renderer = createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
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
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
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
  const renderer = createWebGl2Renderer3D({ canvas: canvas as never, context: gl as never, scene, maxInstances: 1 });
  renderer.render(commands, createMat4());
  expect(gl.bufferDataCalls.filter((call) => call.bytes === 36)).toHaveLength(3);
  expect(gl.uniform4fCalls).toContainEqual([{ name: "u_morphWeights" }, 0.25, 0.75, 0, 0]);
  weights[0] = 1; renderer.render(commands, createMat4());
  expect(gl.uniform4fCalls).toContainEqual([{ name: "u_morphWeights" }, 1, 0.75, 0, 0]);
});

test("directional shadow mapping renders a bounded depth pass and samples it in the lit pass", () => {
  const gl = new FakeWebGl2(); const canvas = new FakeCanvas(gl); const { scene, commands } = litFixture();
  const renderer = createWebGl2Renderer3D({ canvas: canvas as never, context: gl as never, scene, maxInstances: 1, directionalShadowMapSize: 64 });
  const stats = renderer.render(commands, createMat4(), { cameraPosition: [0, 0, 2], shadowViewProjection: createMat4(), shadowBias: 0.002 });
  expect(stats.shadowDrawCalls).toBe(1);
  expect(gl.drawElementsCalls).toHaveLength(2);
  expect(gl.framebufferBinds.some((call) => call[1] !== null)).toBe(true);
  expect(gl.uniform1iCalls).toContainEqual([{ name: "u_shadowEnabled" }, 1]);
  expect(gl.uniform1fCalls).toContainEqual([{ name: "u_shadowBias" }, 0.002]);
});

test("hardware and configured uniform palette limits fail with precise diagnostics", () => {
  const gl = new FakeWebGl2();
  gl.maxVertexUniformVectors = 13;
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = skinnedFixture();
  expect(() => createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
    scene,
    maxInstances: 2,
    maxJointsPerSkeleton: 3
  })).toThrow("requires 17 vertex uniform vectors");
  const renderer = createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
    scene,
    maxInstances: 2,
    maxJointsPerSkeleton: 1
  });
  expect(() => renderer.render(commands, createMat4())).toThrow("jointCount 2 exceeds WebGL2 palette capacity 1");
});

test("skinned palettes resume uploading after context restoration", () => {
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = skinnedFixture();
  const renderer = createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 2 });
  renderer.render(commands, createMat4());
  canvas.dispatch("webglcontextlost");
  canvas.dispatch("webglcontextrestored");
  const stats = renderer.render(commands, createMat4());
  expect(stats.contextGeneration).toBe(2);
  expect(stats.paletteUploads).toBe(1);
  expect(stats.paletteMatrices).toBe(2);
});

test("lit textured path uploads normals, UVs, RGBA8 pixels, and consumes bounded lights", () => {
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = litFixture();
  const renderer = createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 1 });
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
  expect(gl.uniform3fCalls.some((call) => (call[0] as { name?: string }).name === "u_emissive"
    && call.slice(1).every((value, index) => Math.abs(Number(value) - [0.05, 0.1, 0.2][index]) < 1e-6))).toBe(true);
  expect(gl.uniform3fCalls).toContainEqual([{ name: "u_cameraPosition" }, 1, 2, 3]);
  expect(gl.uniform1fCalls).toContainEqual([{ name: "u_metallic" }, 0.75]);
  expect(gl.uniform1fCalls.some((call) => (call[0] as { name?: string }).name === "u_roughness" && Math.abs(Number(call[1]) - 0.35) < 1e-6)).toBe(true);
  renderer.render(commands, createMat4());
  expect(stats.meshUploads).toBe(0);
  expect(stats.textureUploads).toBe(0);
  expect(stats.uploadedBytes).toBe(64);
});

test("texture cache invalidates when a bounded scene texture handle is reused", () => {
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands, material, texture } = litFixture();
  const renderer = createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 1 });
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
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = litFixture();
  const mesh = scene.getMesh(commands.commandMeshHandles[0]);
  const normals = mesh.normals;
  mesh.normals = undefined;
  const renderer = createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 1 });
  expect(() => renderer.render(commands, createMat4())).toThrow("requires normals");
  mesh.normals = normals;
  const uvs = mesh.uvs;
  mesh.uvs = undefined;
  expect(() => renderer.render(commands, createMat4())).toThrow("requires UVs");
  mesh.uvs = uvs;
  const limited = createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
    scene,
    maxInstances: 1,
    maxTextureSize: 1
  });
  expect(() => limited.render(commands, createMat4())).toThrow("dimensions 2x2");
});

test("WebGL2 renderer uploads, depth-tests, resizes for DPR, and reuses mesh resources", () => {
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = fixture(true);
  const renderer = createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
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
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, mesh, material, transform, instance, commands } = fixture(false);
  const renderer = createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 4 });
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
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = litFixture();
  const diagnostics: string[] = [];
  const renderer = createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
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
  const gl = new FakeWebGl2();
  gl.failVertexCompile = true;
  const canvas = new FakeCanvas(gl);
  const { scene } = fixture();
  const diagnostics: string[] = [];
  expect(() => createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
    scene,
    maxInstances: 1,
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.message)
  })).toThrow("vertex driver log");
  expect(diagnostics[0]).toContain("1: #version 300 es");
  expect(canvas.listeners.size).toBe(0);
});

test("program link diagnostics preserve the driver log", () => {
  const gl = new FakeWebGl2();
  gl.failLink = true;
  const canvas = new FakeCanvas(gl);
  const { scene } = fixture();
  const codes: string[] = [];
  expect(() => createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
    scene,
    maxInstances: 1,
    onDiagnostic: (diagnostic) => codes.push(diagnostic.code)
  })).toThrow("link driver log");
  expect(codes).toEqual(["program-link"]);
  expect(gl.deletedPrograms).toHaveLength(1);
});

test("a canvas without CSS layout dimensions does not compound DPR resizing", () => {
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  canvas.clientWidth = 0;
  canvas.clientHeight = 0;
  canvas.width = 320;
  canvas.height = 180;
  const { scene, commands } = fixture();
  const renderer = createWebGl2Renderer3D({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGL2RenderingContext,
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
  const gl = new FakeWebGl2();
  const canvas = new FakeCanvas(gl);
  const { scene, commands } = fixture();
  expect(supportsWebGl2Renderer3D(canvas as unknown as HTMLCanvasElement)).toBe(true);
  expect(() => createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 0 })).toThrow("positive");
  const renderer = createWebGl2Renderer3D({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, scene, maxInstances: 1 });
  commands.commandFirstInstances[0] = 2;
  expect(() => renderer.render(commands, createMat4())).toThrow("instance range");
  commands.commandFirstInstances[0] = 0;
  renderer.dispose();
  expect(renderer.isDisposed()).toBe(true);
  expect(canvas.listeners.get("webglcontextlost")?.size).toBe(0);
  expect(() => renderer.render(commands, createMat4())).toThrow("disposed");
});
