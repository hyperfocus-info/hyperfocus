import type { MeshGeometry3D, RenderCommandBuffer3D, TextureResource3D } from "../3d-scene.ts";

export interface WebGl2FrameStats3D {
  drawCalls: number;
  instances: number;
  triangles: number;
  lines: number;
  meshUploads: number;
  materialBindings: number;
  textureUploads: number;
  textureBindings: number;
  ambientLightsUsed: number;
  directionalLightsUsed: number;
  unsupportedLights: number;
  paletteUploads: number;
  paletteMatrices: number;
  skinnedDrawCalls: number;
  skinnedInstances: number;
  shadowDrawCalls: number;
  uploadedBytes: number;
  width: number;
  height: number;
  pixelRatio: number;
  contextGeneration: number;
  contextLost: boolean;
  skipped: boolean;
}

export function createWebGl2FrameStats3D(): WebGl2FrameStats3D {
  return {
    drawCalls: 0, instances: 0, triangles: 0, lines: 0, meshUploads: 0, materialBindings: 0,
    textureUploads: 0, textureBindings: 0, ambientLightsUsed: 0, directionalLightsUsed: 0, unsupportedLights: 0, uploadedBytes: 0,
    paletteUploads: 0, paletteMatrices: 0, skinnedDrawCalls: 0, skinnedInstances: 0, shadowDrawCalls: 0,
    width: 0, height: 0, pixelRatio: 1, contextGeneration: 0, contextLost: false, skipped: false,
  };
}

export interface MeshGpuRecord3D {
  source: MeshGeometry3D;
  vao: WebGLVertexArrayObject;
  positionBuffer: WebGLBuffer;
  indexBuffer?: WebGLBuffer;
  normalBuffer?: WebGLBuffer;
  uvBuffer?: WebGLBuffer;
  jointBuffer?: WebGLBuffer;
  weightBuffer?: WebGLBuffer;
  morphBuffers?: WebGLBuffer[];
  vertexCount: number;
  indexCount: number;
  indexType: number;
  mode: number;
  byteLength: number;
}

export interface TextureGpuRecord3D {
  source: TextureResource3D;
  texture: WebGLTexture;
  byteLength: number;
}

export interface MainGpuResources3D {
  program: WebGLProgram;
  instanceBuffer: WebGLBuffer;
  fallbackTexture: WebGLTexture;
  viewProjection: WebGLUniformLocation;
  baseColor: WebGLUniformLocation;
  emissive: WebGLUniformLocation;
  metallic: WebGLUniformLocation;
  roughness: WebGLUniformLocation;
  alphaCutoff: WebGLUniformLocation;
  useTexture: WebGLUniformLocation;
  lit: WebGLUniformLocation;
  ambientColor: WebGLUniformLocation;
  directionalDirection: WebGLUniformLocation;
  directionalColor: WebGLUniformLocation;
  cameraPosition: WebGLUniformLocation;
  skinningEnabled: WebGLUniformLocation;
  jointPalette: WebGLUniformLocation;
  morphWeights: WebGLUniformLocation;
  shadowEnabled: WebGLUniformLocation;
  shadowViewProjection: WebGLUniformLocation;
  shadowBias: WebGLUniformLocation;
}

export interface ShadowGpuResources3D {
  program: WebGLProgram;
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  viewProjection: WebGLUniformLocation;
  skinningEnabled: WebGLUniformLocation;
  jointPalette: WebGLUniformLocation;
  morphWeights: WebGLUniformLocation;
}

export function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer; received ${value}.`);
  return value;
}

export function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number; received ${value}.`);
  return value;
}

export function colorComponent(color: ArrayLike<number> | undefined, index: number, fallback: number): number {
  const value = color?.[index] ?? fallback;
  if (!Number.isFinite(value)) throw new RangeError(`clearColor[${index}] must be finite; received ${value}.`);
  return value;
}

export function finiteComponent(value: ArrayLike<number> | undefined, index: number, fallback: number, label: string): number {
  const component = value?.[index] ?? fallback;
  if (!Number.isFinite(component)) throw new RangeError(`${label}[${index}] must be finite; received ${component}.`);
  return component;
}

export function matrixData(value: ArrayLike<number>): Float32Array {
  return value instanceof Float32Array ? value : Float32Array.from(value);
}

export function numberSource(source: string): string {
  return source.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
}

export function requiredUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`WebGL2 basic material program is missing required uniform ${name}.`);
  return location;
}

export function validateCommands(commands: RenderCommandBuffer3D, maxInstances: number): void {
  if (!Number.isInteger(commands.commandCount) || commands.commandCount < 0 || commands.commandCount > commands.commandMeshHandles.length) {
    throw new RangeError(`commandCount ${commands.commandCount} exceeds the command buffer capacity.`);
  }
  if (!Number.isInteger(commands.instanceCount) || commands.instanceCount < 0 || commands.instanceCount > commands.instanceSceneHandles.length) {
    throw new RangeError(`instanceCount ${commands.instanceCount} exceeds the command buffer capacity.`);
  }
  if (commands.instanceCount > maxInstances) {
    throw new RangeError(`instanceCount ${commands.instanceCount} exceeds WebGL2 renderer maxInstances ${maxInstances}.`);
  }
  for (let command = 0; command < commands.commandCount; command += 1) {
    const first = commands.commandFirstInstances[command], count = commands.commandInstanceCounts[command];
    if (first > commands.instanceCount || count > commands.instanceCount - first) {
      throw new RangeError(`render command ${command} instance range ${first}..${first + count} exceeds instanceCount ${commands.instanceCount}.`);
    }
  }
}
