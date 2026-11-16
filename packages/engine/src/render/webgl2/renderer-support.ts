import type { MeshGeometry3D, RenderCommandBuffer3D, TextureResource3D } from "../3d-scene.ts";

/** Caller owns the texture after upload succeeds; failed setup retains no GPU resource. */
export function createFallbackTexture3D(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("WebGL2 failed to allocate the fallback white texture.");
  try {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
}

export function uploadInstanceMatrices3D(gl: WebGL2RenderingContext, buffer: WebGLBuffer, commands: RenderCommandBuffer3D): number {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  if (commands.instanceCount > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, commands.instanceMatrices, 0, commands.instanceCount * 16);
  return commands.instanceCount * 16 * Float32Array.BYTES_PER_ELEMENT;
}

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
  pointLightsUsed: number;
  unsupportedLights: number;
  paletteUploads: number;
  paletteMatrices: number;
  skinnedDrawCalls: number;
  skinnedInstances: number;
  shadowDrawCalls: number;
  outlineDrawCalls: number;
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
    textureUploads: 0, textureBindings: 0, ambientLightsUsed: 0, directionalLightsUsed: 0, pointLightsUsed: 0, unsupportedLights: 0, uploadedBytes: 0,
    paletteUploads: 0, paletteMatrices: 0, skinnedDrawCalls: 0, skinnedInstances: 0, shadowDrawCalls: 0, outlineDrawCalls: 0,
    width: 0, height: 0, pixelRatio: 1, contextGeneration: 0, contextLost: false, skipped: false,
  };
}

export interface MeshGpuRecord3D {
  /** Matrix pointers belong to this VAO; the instance buffer lives for the same GPU generation. */
  firstInstance?: number;
  source: MeshGeometry3D;
  vao: WebGLVertexArrayObject;
  positionBuffer: WebGLBuffer;
  edgeBuffer?: WebGLBuffer;
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
  appearanceBuffer?: WebGLBuffer;
  appearanceBytes?: number;
  instanceAppearanceEnabled: WebGLUniformLocation;
  fallbackTexture: WebGLTexture;
  viewProjection: WebGLUniformLocation;
  baseColor: WebGLUniformLocation;
  emissive: WebGLUniformLocation;
  metallic: WebGLUniformLocation;
  roughness: WebGLUniformLocation;
  uvTransform: WebGLUniformLocation;
  uvRotation: WebGLUniformLocation;
  shaderStyle: WebGLUniformLocation;
  cutaway: WebGLUniformLocation;
  toonBands: WebGLUniformLocation;
  toonShadowColor: WebGLUniformLocation;
  toonRimColor: WebGLUniformLocation;
  toonRimStrength: WebGLUniformLocation;
  outlinePass: WebGLUniformLocation;
  outlineWidth: WebGLUniformLocation;
  outlineColor: WebGLUniformLocation;
  alphaCutoff: WebGLUniformLocation;
  useTexture: WebGLUniformLocation;
  lit: WebGLUniformLocation;
  ambientColor: WebGLUniformLocation;
  directionalDirection0: WebGLUniformLocation;
  directionalColor0: WebGLUniformLocation;
  directionalDirection1: WebGLUniformLocation;
  directionalColor1: WebGLUniformLocation;
  directionalCount: WebGLUniformLocation;
  pointCount: WebGLUniformLocation;
  pointPositions: WebGLUniformLocation;
  pointColors: WebGLUniformLocation;
  cameraPosition: WebGLUniformLocation;
  baseColorTexture: WebGLUniformLocation;
  skinningEnabled: WebGLUniformLocation;
  jointPalette: WebGLUniformLocation;
  morphWeights: WebGLUniformLocation;
  shadowEnabled: WebGLUniformLocation;
  shadowViewProjection: WebGLUniformLocation;
  shadowBias: WebGLUniformLocation;
  shadowMap: WebGLUniformLocation;
  metallicRoughnessTexture: WebGLUniformLocation;
  normalTexture: WebGLUniformLocation;
  occlusionTexture: WebGLUniformLocation;
  emissiveTexture: WebGLUniformLocation;
  textureMapFlags: WebGLUniformLocation;
}

export interface ShadowGpuResources3D {
  opacity: WebGLUniformLocation;
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
