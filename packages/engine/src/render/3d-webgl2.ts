import type { InternalWebGl2Renderer3D, WebGl2RendererFields3D } from './webgl2/renderer-state.ts';
import { sortTransparentInstances3D } from './webgl2/transparency.ts';
import { createCommandViews3D } from './webgl2/command-views.ts';
import { cutawayMesh3D, uploadCutawayEdges3D } from './webgl2/cutaway-mesh.ts';
import { deleteMeshResources3D, uploadFloatMeshAttribute3D } from './webgl2/mesh-attributes.ts';
import {
  BoundedScene3D,
  MATERIAL_FLAG_ALPHA_MASK_3D,
  MATERIAL_FLAG_ALPHA_BLEND_3D,
  MATERIAL_FLAG_ADDITIVE_3D,
  MATERIAL_FLAG_CUTAWAY_3D,
  MATERIAL_FLAG_DOUBLE_SIDED_3D,
  MATERIAL_FLAG_EMISSIVE_TEXTURED_3D,
  MATERIAL_FLAG_LIT_3D,
  MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D,
  MATERIAL_FLAG_NORMAL_TEXTURED_3D,
  MATERIAL_FLAG_OCCLUSION_TEXTURED_3D,
  MATERIAL_FLAG_SHADER_HOLOGRAM_3D,
  MATERIAL_FLAG_SHADER_RETRO_3D,
  MATERIAL_FLAG_SHADER_TOON_3D,
  MATERIAL_FLAG_SKINNED_3D,
  MATERIAL_FLAG_TEXTURED_3D,
  MATERIAL_FLOAT_STRIDE_3D,
  MATERIAL_TEXTURE_STRIDE_3D,
  RENDER_COMMAND_FLAG_SKINNED_3D,
  RenderCommandBuffer3D,
  type MeshGeometry3D,
  type TextureResource3D
} from "./3d-scene.ts";
import { isWebGl2Context } from "./webgl2/context-capabilities.ts";
import { bindInstanceAppearance3D, uploadInstanceAppearance3D } from './webgl2/instance-appearance.ts';
import {
  colorComponent,
  createFallbackTexture3D,
  createWebGl2FrameStats3D,
  finiteComponent,
  matrixData,
  numberSource,
  positiveFinite,
  positiveInteger,
  requiredUniform,
  validateCommands,
  uploadInstanceMatrices3D,
  type MainGpuResources3D,
  type MeshGpuRecord3D,
  type ShadowGpuResources3D,
  type TextureGpuRecord3D,
  type WebGl2FrameStats3D,
} from "./webgl2/renderer-support.ts";
export type { WebGl2FrameStats3D } from "./webgl2/renderer-support.ts";
import {
  FRAGMENT_SHADER_SOURCE,
  SHADOW_FRAGMENT_SHADER_SOURCE,
  shadowVertexShaderSource,
  vertexShaderSource,
} from "./webgl2/shaders.ts";
import { initializeMaterialSamplers3D, materialDataChanged3D, requireMaterialUniforms3D } from "./webgl2/material-uniforms.ts";
import { renderDirectionalShadowPass3D, renderToonOutlinePass3D } from "./webgl2/render-passes.ts";
import { createFrameLighting, requirePointLightUniforms } from './webgl2/lighting.ts';
export type WebGl2DiagnosticLevel3D = "info" | "warning" | "error";
export interface WebGl2Diagnostic3D {
  level: WebGl2DiagnosticLevel3D;
  code: "context-lost" | "context-restored" | "restore-failed" | "shader-compile" | "program-link";
  message: string;
}
export interface WebGl2Canvas3D {
  width: number;
  height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  getContext(contextId: string, options?: WebGLContextAttributes): unknown;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}
export interface WebGl2ContextCapability3D {
  drawArraysInstanced(...args: never[]): unknown;
}
export interface WebGl2RendererOptions3D {
  canvas: WebGl2Canvas3D;
  scene: BoundedScene3D;
  maxInstances: number; // Explicit upper bound for matrices uploaded each frame.
  contextAttributes?: WebGLContextAttributes;
  context?: WebGl2ContextCapability3D; // Injection boundary for tests or an already-created context.
  clearColor?: ArrayLike<number>;
  pixelRatio?: number | (() => number);
  maxDevicePixelRatio?: number;
  maxDrawingBufferWidth?: number;
  maxDrawingBufferHeight?: number;
  maxTextureSize?: number; // Additional software cap, clamped to the driver MAX_TEXTURE_SIZE.
  maxJointsPerSkeleton?: number; // Shader palette capacity. Defaults to the scene jointsPerSkeleton stride.
  validateGlErrors?: boolean; // Slow driver error checks for acceptance/debug builds.
  /** Opt-in stable camera culling keeps full shadow work and resource validation.
   * Measure the full loop: mostly visible or unsupported/deforming packets add overhead. */
  cameraCulling?: boolean;
  directionalShadowMapSize?: number; // Enables a bounded directional depth map. Omit to allocate no shadow resources.
  onDiagnostic?: (diagnostic: WebGl2Diagnostic3D) => void;
}
export interface WebGl2ResizeOptions3D { cssWidth?: number; cssHeight?: number; pixelRatio?: number; }
export interface WebGl2RenderOptions3D extends WebGl2ResizeOptions3D {
  /** Per-submission diagnostic ablations; omitted flags retain normal rendering. */
  features?: { scene?: boolean; shadows?: boolean; outlines?: boolean; lighting?: boolean; materialFeatures?: boolean; shadowSampling?: boolean; cameraCulling?: boolean };
  clear?: boolean;
  cameraPosition?: ArrayLike<number>; // World-space eye used by metallic-roughness specular lighting.
  shadowViewProjection?: ArrayLike<number>; // Directional-light view-projection matrix. Requires shadow resources.
  shadowCommands?: RenderCommandBuffer3D; // Independently culled casters, including those outside the camera view.
  shadowBias?: number;
}
export type WebGl2Renderer3D = {
  readonly canvas: WebGl2Canvas3D;
  readonly scene: BoundedScene3D;
  readonly maxInstances: number;
  readonly maxJointsPerSkeleton: number;
  readonly stats: WebGl2FrameStats3D;
  resize(options?: WebGl2ResizeOptions3D): boolean;
  render(commands: RenderCommandBuffer3D, viewProjection: ArrayLike<number>, options?: WebGl2RenderOptions3D): WebGl2FrameStats3D;
  dispose(): void;
  isContextLost(): boolean;
  isDisposed(): boolean;
};
type WebGl2Renderer3DFactory = {
  (options: WebGl2RendererOptions3D): WebGl2Renderer3D;
  new(options: WebGl2RendererOptions3D): WebGl2Renderer3D;
  readonly prototype: object;
};
const webGl2PublicMethods = {
resize(this: InternalWebGl2Renderer3D, options: WebGl2ResizeOptions3D = {}): boolean {
    this.assertUsable();
    const priorCssWidth = this.width > 0 ? this.width / this.pixelRatio : this.canvas.width || 1;
    const priorCssHeight = this.height > 0 ? this.height / this.pixelRatio : this.canvas.height || 1;
    const cssWidth = positiveFinite(options.cssWidth ?? (this.canvas.clientWidth || priorCssWidth), "cssWidth");
    const cssHeight = positiveFinite(options.cssHeight ?? (this.canvas.clientHeight || priorCssHeight), "cssHeight");
    const requestedRatio = positiveFinite(options.pixelRatio ?? this.readPixelRatio(), "pixelRatio");
    const cappedRatio = Math.min(requestedRatio, this.maxDevicePixelRatio);
    const rawWidth = Math.max(1, Math.round(cssWidth * cappedRatio));
    const rawHeight = Math.max(1, Math.round(cssHeight * cappedRatio));
    const limitScale = Math.min(1, this.maxWidth / rawWidth, this.maxHeight / rawHeight);
    const width = Math.max(1, Math.floor(rawWidth * limitScale));
    const height = Math.max(1, Math.floor(rawHeight * limitScale));
    this.pixelRatio = Math.min(width / cssWidth, height / cssHeight);
    const changed = width !== this.width || height !== this.height;
    if (changed) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.width = width;
      this.height = height;
      if (!this.contextLost) this.gl.viewport(0, 0, width, height);
    }
    this.stats.width = width;
    this.stats.height = height;
    this.stats.pixelRatio = this.pixelRatio;
    return changed;
  },
render(this: InternalWebGl2Renderer3D, commands: RenderCommandBuffer3D, viewProjection: ArrayLike<number>, options: WebGl2RenderOptions3D = {}): WebGl2FrameStats3D {
    this.features = options.features;
    this.assertUsable();
    if (viewProjection.length < 16) throw new RangeError("viewProjection needs at least 16 elements.");
    this.resize(options);
    this.resetFrameStats();
    if (this.contextLost || this.gl.isContextLost?.()) {
      this.stats.contextLost = true;
      this.stats.skipped = true;
      return this.stats;
    }
    validateCommands(commands, this.maxInstances);
    if (options.shadowCommands) {
      if (!options.shadowViewProjection) throw new Error('shadowCommands requires shadowViewProjection.');
      validateCommands(options.shadowCommands, this.maxInstances);
    }
    commands = sortTransparentInstances3D(this.scene, commands, viewProjection);
    const fullCommands = commands;
    if (options.features?.cameraCulling ?? this.cameraCulling) {
      this.commandViews ??= createCommandViews3D(this.scene, commands, this.maxInstances, { maxTextureSize: this.maxTextureSize });
      commands = this.commandViews(commands, viewProjection).commands;
    }
    // Camera visibility never changes the shadow caster stream or its ordering.
    const shadowCommands = options.shadowCommands ?? (options.shadowViewProjection && commands !== fullCommands ? fullCommands : undefined);
    // Revoked/replaced images may no longer be drawn. Release their GPU copies anyway.
    for (const [handle, cached] of this.textureCache) {
      if (!this.scene.isTextureActive(handle) || this.scene.getTexture(handle) !== cached.source) {
        this.deleteTexture(cached);this.textureCache.delete(handle);
      }
    }
    const gl = this.gl;
    const resources = this.requireMainResources();
    const program = resources.program;
    const instanceBuffer = resources.instanceBuffer;
    const viewMatrix = matrixData(viewProjection);
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], this.clearColor[3]);
    gl.clearDepth(1);
    if (options.clear !== false) gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (options.features?.scene === false) return this.stats;
    gl.uniformMatrix4fv(resources.viewProjection, false, viewMatrix);
    const camera = options.cameraPosition;
    const cameraX = finiteComponent(camera, 0, 0, "cameraPosition");
    const cameraY = finiteComponent(camera, 1, 0, "cameraPosition");
    const cameraZ = finiteComponent(camera, 2, 0, "cameraPosition");
    gl.uniform3f(resources.cameraPosition, cameraX, cameraY, cameraZ);
    this.bindFrameLights(commands);
    this.boundMaterial = -1;
    this.boundSkeleton = -2;
    this.checkGlError("frame setup");
    if (!shadowCommands) {
      this.stats.uploadedBytes += uploadInstanceMatrices3D(gl, instanceBuffer, commands);
    }
    this.stats.uploadedBytes += uploadInstanceAppearance3D(gl, resources, commands);
    const shadowMatrix = options.features?.shadows === false ? undefined : options.shadowViewProjection;
    if (shadowMatrix && this.shadowMapSize === 0) throw new Error("shadowViewProjection requires directionalShadowMapSize at renderer creation.");
    if (shadowMatrix) {
      if (shadowMatrix.length < 16) throw new RangeError("shadowViewProjection needs at least 16 elements.");
      const shadowMatrixData = matrixData(shadowMatrix);
      const shadowResources = this.requireShadowResources();
      if (shadowCommands) this.stats.uploadedBytes += uploadInstanceMatrices3D(gl, instanceBuffer, shadowCommands);
      this.renderShadowPass(shadowCommands ?? commands, shadowMatrixData);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.stats.width, this.stats.height); gl.colorMask(true, true, true, true);
      gl.useProgram(program); gl.uniformMatrix4fv(resources.viewProjection, false, viewMatrix);
      gl.uniformMatrix4fv(resources.shadowViewProjection, false, shadowMatrixData);
      const shadowBias = finiteComponent([options.shadowBias ?? 0.001], 0, 0.001, "shadowBias");
      if (shadowBias < 0 || shadowBias > 0.05) throw new RangeError(`shadowBias must be from 0 through 0.05; received ${shadowBias}.`);
      gl.uniform1i(resources.shadowEnabled, options.features?.shadowSampling === false ? 0 : 1); gl.uniform1f(resources.shadowBias, shadowBias);
      gl.activeTexture(gl.TEXTURE0 + 1); gl.bindTexture(gl.TEXTURE_2D, shadowResources.texture); gl.activeTexture(gl.TEXTURE0);
      gl.uniform3f(resources.cameraPosition, cameraX, cameraY, cameraZ); this.bindFrameLights(commands);
      this.boundMaterial = -1; this.boundSkeleton = -2;
    } else {
      gl.uniform1i(resources.shadowEnabled, 0);
      gl.uniformMatrix4fv(resources.shadowViewProjection, false, viewMatrix);
    }

    if (shadowCommands) this.stats.uploadedBytes += uploadInstanceMatrices3D(gl, instanceBuffer, commands);

    gl.uniform1i(resources.instanceAppearanceEnabled, 0);
    // All samplers stay complete. Unused maps need no per-material rebinding;
    // their uniforms disable sampling, including after textured draws.
    for (const unit of [0, 2, 3, 4, 5]) { gl.activeTexture(gl.TEXTURE0 + unit);gl.bindTexture(gl.TEXTURE_2D, resources.fallbackTexture);this.stats.textureBindings++; }
    gl.activeTexture(gl.TEXTURE0);
    if (options.features?.outlines !== false) this.renderOutlinePass(commands);
    gl.uniform1i(resources.instanceAppearanceEnabled, commands.instanceAppearance ? 1 : 0);
    gl.uniform1i(resources.outlinePass, 0); gl.cullFace(gl.BACK);
    this.boundMaterial = -1; this.boundSkeleton = -2;
    // Opaque first: later-authored scenery must not erase blended FX, which do not write depth. Keep each pass stable.
    for (let transparentPass = 0; transparentPass < 2; transparentPass += 1) {
      for (let command = 0; command < commands.commandCount; command += 1) {
        const instanceCount = commands.commandInstanceCounts[command];
        if (instanceCount === 0) continue;
        const meshHandle = commands.commandMeshHandles[command], materialHandle = commands.commandMaterialHandles[command];
        const transparent = (this.scene.materialFlags[materialHandle] & MATERIAL_FLAG_ALPHA_BLEND_3D) !== 0;
        if (transparent !== (transparentPass === 1)) continue;
        const mesh = this.requireMesh(meshHandle, command);
        this.bindMaterial(materialHandle, meshHandle, mesh);
        this.bindMorphWeights(mesh);
        this.checkGlError(`command ${command} material bind`);
        this.bindSkinning(commands, command, meshHandle, mesh, materialHandle);
        this.checkGlError(`command ${command} skeleton bind`);
        const cutaway = options.features?.materialFeatures !== false && transparent && (this.scene.materialFlags[materialHandle]! & MATERIAL_FLAG_CUTAWAY_3D) !== 0 && mesh.topology !== 'line-list';
        const gpuMesh = this.meshRecord(cutaway ? -meshHandle - 1 : meshHandle, cutaway ? cutawayMesh3D(mesh) : mesh);
        this.checkGlError(`command ${command} mesh bind`);
        gl.bindVertexArray(gpuMesh.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        this.bindInstanceRange(commands.commandFirstInstances[command], gpuMesh);
        bindInstanceAppearance3D(gl, resources.appearanceBuffer, commands.commandFirstInstances[command], Boolean(commands.instanceAppearance));
        if (gpuMesh.indexBuffer) {
          gl.drawElementsInstanced(gpuMesh.mode, gpuMesh.indexCount, gpuMesh.indexType, 0, instanceCount);
        } else {
          gl.drawArraysInstanced(gpuMesh.mode, 0, gpuMesh.vertexCount, instanceCount);
        }
        this.checkGlError(`command ${command} draw`);
        this.stats.drawCalls += 1;
        this.stats.instances += instanceCount;
        if ((commands.commandFlags[command] & RENDER_COMMAND_FLAG_SKINNED_3D) !== 0) {
          this.stats.skinnedDrawCalls += 1;
          this.stats.skinnedInstances += instanceCount;
        }
        const primitives = (gpuMesh.indexBuffer ? gpuMesh.indexCount : gpuMesh.vertexCount) / (gpuMesh.mode === gl.LINES ? 2 : 3) * instanceCount;
        if (gpuMesh.mode === gl.LINES) this.stats.lines += primitives;
        else this.stats.triangles += primitives;
      }
    }
    gl.bindVertexArray(null);
    this.stats.contextGeneration = this.generation;
    return this.stats;
  },
dispose(this: InternalWebGl2Renderer3D): void {
    if (this.disposed) return;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    if (!this.contextLost) this.deleteGpuResources();
    else this.abandonGpuResources();
    this.disposed = true;
  },
isContextLost(this: InternalWebGl2Renderer3D): boolean { return this.contextLost; },
isDisposed(this: InternalWebGl2Renderer3D): boolean { return this.disposed; },
};
const webGl2GpuMethods = {
  renderShadowPass(this: InternalWebGl2Renderer3D, commands: RenderCommandBuffer3D, viewProjection: Float32Array): void {
    renderDirectionalShadowPass3D(this, commands, viewProjection);
  },

  renderOutlinePass(this: InternalWebGl2Renderer3D, commands: RenderCommandBuffer3D): void {
    renderToonOutlinePass3D(this, commands);
  },

initializeGpuResources(this: InternalWebGl2Renderer3D): void {
    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource(this.maxJointsPerSkeleton), "vertex");
    let fragmentShader: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    let instanceBuffer: WebGLBuffer | undefined;
    let fallbackTexture: WebGLTexture | undefined;
    try {
      fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE, "fragment");
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("WebGL2 failed to allocate the basic material shader program.");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program)?.trim() || "No driver program log was provided.";
        const message = `WebGL2 basic material program link failed: ${log}`;
        this.emit("error", "program-link", message);
        throw new Error(message);
      }
      instanceBuffer = gl.createBuffer() ?? undefined;
      if (!instanceBuffer) throw new Error("WebGL2 failed to allocate the bounded instance matrix buffer.");
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.maxInstances * MATRIX_BYTE_STRIDE, gl.DYNAMIC_DRAW);
      const viewProjection = requiredUniform(gl, program, "u_viewProjection");
      const materialUniforms = requireMaterialUniforms3D(gl, program);
      const ambientColor = requiredUniform(gl, program, "u_ambientColor");
      const directionalDirection0 = requiredUniform(gl, program, "u_directionalDirection0");
      const directionalColor0 = requiredUniform(gl, program, "u_directionalColor0");
      const directionalDirection1 = requiredUniform(gl, program, "u_directionalDirection1");
      const directionalColor1 = requiredUniform(gl, program, "u_directionalColor1");
      const directionalCount = requiredUniform(gl, program, "u_directionalCount");
      const cameraPosition = requiredUniform(gl, program, "u_cameraPosition");
      const skinningEnabled = requiredUniform(gl, program, "u_skinningEnabled");
      const jointPalette = requiredUniform(gl, program, "u_jointPalette[0]");
      const morphWeights = requiredUniform(gl, program, "u_morphWeights");
      const shadowEnabled = requiredUniform(gl, program, "u_shadowEnabled");
      const shadowViewProjection = requiredUniform(gl, program, "u_shadowViewProjection");
      const shadowMap = requiredUniform(gl, program, "u_shadowMap");
      const shadowBias = requiredUniform(gl, program, "u_shadowBias");
      fallbackTexture = createFallbackTexture3D(gl);
      gl.useProgram(program);
      initializeMaterialSamplers3D(gl, materialUniforms);
      gl.uniform1i(skinningEnabled, 0);
      gl.uniform4f(morphWeights, 0, 0, 0, 0);
      gl.uniform1i(materialUniforms.outlinePass, 0);
      gl.uniform1i(shadowEnabled, 0); gl.uniform1i(shadowMap, 1); gl.uniform1f(shadowBias, 0.001);
      // A disabled integer attribute must still have an integer generic value.
      // Leaving JOINTS_0 at WebGL's float generic default makes static VAOs
      // incompatible with the shader's uvec4 input and draw calls fail with
      // INVALID_OPERATION on conforming drivers.
      gl.disableVertexAttribArray(7);
      gl.vertexAttribI4ui(7, 0, 0, 0, 0);
      const shadowResources = this.shadowMapSize > 0 ? this.initializeShadowResources() : undefined;
      this.mainResources = {
        program,
        instanceBuffer,
        instanceAppearanceEnabled: requiredUniform(gl, program, 'u_instanceAppearanceEnabled'),
        fallbackTexture,
        viewProjection,
        ...materialUniforms,
        ambientColor,
        directionalDirection0,
        directionalColor0,
        directionalDirection1,
        directionalColor1,
        directionalCount,
        ...requirePointLightUniforms(gl, program),
        cameraPosition,
        skinningEnabled,
        jointPalette,
        morphWeights,
        shadowEnabled,
        shadowViewProjection,
        shadowBias,
        shadowMap,
      };
      this.shadowResources = shadowResources;
      this.meshCache.clear();
      this.textureCache.clear();
      this.generation += 1;
      this.width = -1;
      this.height = -1;
    } catch (error) {
      if (instanceBuffer) gl.deleteBuffer(instanceBuffer);
      if (fallbackTexture) gl.deleteTexture(fallbackTexture);
      if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    }
  },

compileShader(this: InternalWebGl2Renderer3D, type: number, source: string, label: "vertex" | "fragment"): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`WebGL2 failed to allocate the ${label} shader.`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)?.trim() || "No driver shader log was provided.";
      const message = `WebGL2 ${label} shader compile failed: ${log}\n${numberSource(source)}`;
      this.emit("error", "shader-compile", message);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  },

initializeShadowResources(this: InternalWebGl2Renderer3D): ShadowGpuResources3D {
    const gl = this.gl;
    const vertex = this.compileShader(gl.VERTEX_SHADER, shadowVertexShaderSource(this.maxJointsPerSkeleton), "vertex");
    const fragment = this.compileShader(gl.FRAGMENT_SHADER, SHADOW_FRAGMENT_SHADER_SOURCE, "fragment");
    let program: WebGLProgram | null = null, texture: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null;
    try {
      program = gl.createProgram(); if (!program) throw new Error("WebGL2 failed to allocate the shadow program.");
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`WebGL2 shadow program link failed: ${gl.getProgramInfoLog(program)?.trim() || "no driver log"}.`);
      texture = gl.createTexture(); framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) throw new Error("WebGL2 failed to allocate directional shadow resources.");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowMapSize, this.shadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("WebGL2 directional shadow framebuffer is incomplete.");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return {
        program,
        texture,
        framebuffer,
        viewProjection: requiredUniform(gl, program, "u_shadowViewProjection"),
        opacity: requiredUniform(gl, program, 'u_shadowOpacity'),
        skinningEnabled: requiredUniform(gl, program, "u_skinningEnabled"),
        jointPalette: requiredUniform(gl, program, "u_jointPalette[0]"),
        morphWeights: requiredUniform(gl, program, "u_morphWeights"),
      };
    } catch (cause) {
      if (framebuffer) gl.deleteFramebuffer(framebuffer); if (texture) gl.deleteTexture(texture); if (program) gl.deleteProgram(program); throw cause;
    } finally { gl.deleteShader(vertex); gl.deleteShader(fragment); }
  },

meshRecord(this: InternalWebGl2Renderer3D, handle: number, mesh: MeshGeometry3D): MeshGpuRecord3D {
    const cached = this.meshCache.get(handle);
    if (cached?.source === mesh) return cached;
    if (cached) {
      this.deleteMesh(cached);
      this.meshCache.delete(handle);
    }
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    if (!vao || !positionBuffer) {
      if (vao) gl.deleteVertexArray(vao);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      throw new Error(`WebGL2 failed to allocate GPU resources for mesh ${handle}.`);
    }
    let indexBuffer: WebGLBuffer | undefined;
    let edgeBuffer: WebGLBuffer | undefined;
    let normalBuffer: WebGLBuffer | undefined;
    let uvBuffer: WebGLBuffer | undefined;
    let jointBuffer: WebGLBuffer | undefined;
    let weightBuffer: WebGLBuffer | undefined;
    const morphBuffers: WebGLBuffer[] = [];
    try {
      gl.bindVertexArray(vao);
      for (let location = 1; location <= 4; location++) { gl.enableVertexAttribArray(location);gl.vertexAttribDivisor(location, 1); }
      uploadFloatMeshAttribute3D(gl, positionBuffer, mesh.positions, 0, 3);
      edgeBuffer = uploadCutawayEdges3D(gl, mesh);
      if (mesh.indices) {
        indexBuffer = gl.createBuffer() ?? undefined;
        if (!indexBuffer) throw new Error(`WebGL2 failed to allocate the index buffer for mesh ${handle}.`);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      }
      if (mesh.normals) {
        normalBuffer = gl.createBuffer() ?? undefined;
        if (!normalBuffer) throw new Error(`WebGL2 failed to allocate the normal buffer for mesh ${handle}.`);
        uploadFloatMeshAttribute3D(gl, normalBuffer, mesh.normals, 5, 3);
      }
      if (mesh.uvs) {
        uvBuffer = gl.createBuffer() ?? undefined;
        if (!uvBuffer) throw new Error(`WebGL2 failed to allocate the UV buffer for mesh ${handle}.`);
        uploadFloatMeshAttribute3D(gl, uvBuffer, mesh.uvs, 6, 2);
      }
      if (mesh.joints && mesh.weights) {
        jointBuffer = gl.createBuffer() ?? undefined;
        weightBuffer = gl.createBuffer() ?? undefined;
        if (!jointBuffer || !weightBuffer) throw new Error(`WebGL2 failed to allocate skinning buffers for mesh ${handle}.`);
        gl.bindBuffer(gl.ARRAY_BUFFER, jointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.joints, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(7);
        gl.vertexAttribIPointer(7, 4, mesh.joints instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE, 0, 0);
        uploadFloatMeshAttribute3D(gl, weightBuffer, mesh.weights, 8, 4);
      }
      for (const [target, values] of (mesh.morphPositions ?? []).entries()) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error(`WebGL2 failed to allocate morph target ${target} for mesh ${handle}.`);
        morphBuffers.push(buffer);
        uploadFloatMeshAttribute3D(gl, buffer, values, 9 + target, 3);
      }
      const record: MeshGpuRecord3D = {
        source: mesh, vao, positionBuffer, indexBuffer, normalBuffer, uvBuffer, jointBuffer, weightBuffer, morphBuffers, edgeBuffer,
        vertexCount: mesh.positions.length / 3,
        indexCount: mesh.indices?.length ?? 0,
        indexType: mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        mode: mesh.topology === "line-list" ? gl.LINES : gl.TRIANGLES,
        byteLength: (edgeBuffer ? mesh.positions.byteLength : 0) + mesh.positions.byteLength + (mesh.indices?.byteLength ?? 0) + (mesh.normals?.byteLength ?? 0)
          + (mesh.uvs?.byteLength ?? 0) + (mesh.joints?.byteLength ?? 0) + (mesh.weights?.byteLength ?? 0)
          + (mesh.morphPositions?.reduce((total, values) => total + values.byteLength, 0) ?? 0)
      };
      this.meshCache.set(handle, record);
      this.stats.meshUploads += 1;
      this.stats.uploadedBytes += record.byteLength;
      return record;
    } catch (error) {
      deleteMeshResources3D(gl, { vao, positionBuffer, edgeBuffer, indexBuffer, normalBuffer, uvBuffer, jointBuffer, weightBuffer, morphBuffers });
      throw error;
    }
  },
};

const webGl2BindingMethods = {
bindInstanceRange(this: InternalWebGl2Renderer3D, firstInstance: number, mesh: MeshGpuRecord3D): void {
    if (mesh.firstInstance === firstInstance) return;
    const gl = this.gl, byteOffset = firstInstance * MATRIX_BYTE_STRIDE;
    for (let column = 0; column < 4; column += 1) {
      const location = column + 1;
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, MATRIX_BYTE_STRIDE, byteOffset + column * 16);
    }
    mesh.firstInstance = firstInstance;
  },
bindMaterial(this: InternalWebGl2Renderer3D, handle: number, meshHandle: number, mesh: MeshGeometry3D): void {
    const offset = handle * MATERIAL_FLOAT_STRIDE_3D;
    if (!this.scene.isMaterialActive(handle) || offset + MATERIAL_FLOAT_STRIDE_3D > this.scene.materialData.length) {
      throw new RangeError(`render command references inactive material handle ${handle}.`);
    }
    const sourceFlags = this.scene.materialFlags[handle];
    const featureMask = MATERIAL_FLAG_CUTAWAY_3D | MATERIAL_FLAG_NORMAL_TEXTURED_3D | MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D | MATERIAL_FLAG_OCCLUSION_TEXTURED_3D | MATERIAL_FLAG_EMISSIVE_TEXTURED_3D;
    const flags = sourceFlags & (this.features?.lighting === false ? ~MATERIAL_FLAG_LIT_3D : -1) & (this.features?.materialFeatures === false ? ~featureMask : -1);
    if ((flags & MATERIAL_FLAG_LIT_3D) !== 0 && !mesh.normals) {
      throw new Error(`lit material ${handle} requires normals on mesh ${meshHandle}${mesh.label ? ` (${mesh.label})` : ""}.`);
    }
    if ((flags & (MATERIAL_FLAG_TEXTURED_3D | MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D | MATERIAL_FLAG_NORMAL_TEXTURED_3D | MATERIAL_FLAG_OCCLUSION_TEXTURED_3D | MATERIAL_FLAG_EMISSIVE_TEXTURED_3D)) !== 0 && !mesh.uvs) {
      throw new Error(`textured material ${handle} requires UVs on mesh ${meshHandle}${mesh.label ? ` (${mesh.label})` : ""}.`);
    }
    if (handle === this.boundMaterial) return;
    const data = this.scene.materialData, previous = this.boundMaterial < 0 ? -1 : this.boundMaterial * MATERIAL_FLOAT_STRIDE_3D;
    const previousFlags = this.boundMaterial < 0 ? -1 : this.scene.materialFlags[this.boundMaterial]!;
    const flagsChanged = (mask: number) => previous < 0 || (previousFlags & mask) !== (flags & mask);
    const resources = this.requireMainResources();
    const uniform = (location: WebGLUniformLocation, index: number, components = 1) => {
      if (!materialDataChanged3D(data, offset, previous, index, components)) return;
      const start = offset + index, gl = this.gl;
      if (components === 1) gl.uniform1f(location, data[start]);
      else if (components === 3) gl.uniform3f(location, data[start], data[start + 1], data[start + 2]);
      else gl.uniform4f(location, data[start], data[start + 1], data[start + 2], data[start + 3]);
    };
    if (flagsChanged(MATERIAL_FLAG_CUTAWAY_3D)) this.gl.uniform1i(resources.cutaway, flags & MATERIAL_FLAG_CUTAWAY_3D ? 1 : 0);
    uniform(resources.baseColor, 0, 4);
    uniform(resources.emissive, 4, 3);
    uniform(resources.metallic, 7);
    uniform(resources.roughness, 8);
    uniform(resources.uvTransform, 10, 4);
    uniform(resources.uvRotation, 14);
    if (flagsChanged(MATERIAL_FLAG_SHADER_HOLOGRAM_3D | MATERIAL_FLAG_SHADER_RETRO_3D | MATERIAL_FLAG_SHADER_TOON_3D)) this.gl.uniform1i(resources.shaderStyle, flags & MATERIAL_FLAG_SHADER_HOLOGRAM_3D ? 3 : flags & MATERIAL_FLAG_SHADER_RETRO_3D ? 2 : flags & MATERIAL_FLAG_SHADER_TOON_3D ? 1 : 0);
    uniform(resources.toonBands, 15);
    uniform(resources.toonShadowColor, 16, 3);
    uniform(resources.toonRimColor, 19, 3);
    uniform(resources.toonRimStrength, 22);
    uniform(resources.outlineWidth, 23);
    uniform(resources.outlineColor, 24, 4);
    if (materialDataChanged3D(data, offset, previous, 9) || flagsChanged(MATERIAL_FLAG_ALPHA_MASK_3D)) this.gl.uniform1f(resources.alphaCutoff, flags & MATERIAL_FLAG_ALPHA_MASK_3D ? data[offset + 9] : -1);
    if (flagsChanged(MATERIAL_FLAG_LIT_3D)) this.gl.uniform1i(resources.lit, flags & MATERIAL_FLAG_LIT_3D ? 1 : 0);
    const textureOffset = handle * MATERIAL_TEXTURE_STRIDE_3D;
    const textureHandle = this.scene.materialTextureHandles[textureOffset];
    const textured = (flags & MATERIAL_FLAG_TEXTURED_3D) !== 0;
    if (flagsChanged(MATERIAL_FLAG_TEXTURED_3D)) this.gl.uniform1i(resources.useTexture, textured ? 1 : 0);
    if (textured) {
      this.gl.activeTexture(this.gl.TEXTURE0);
      const texture = this.requireTexture(textureHandle, handle);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureRecord(textureHandle, texture).texture);
      this.stats.textureBindings += 1;
    }
    const mapFlags = [MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D, MATERIAL_FLAG_NORMAL_TEXTURED_3D, MATERIAL_FLAG_OCCLUSION_TEXTURED_3D, MATERIAL_FLAG_EMISSIVE_TEXTURED_3D] as const;
    if (flagsChanged(MATERIAL_FLAG_METALLIC_ROUGHNESS_TEXTURED_3D | MATERIAL_FLAG_NORMAL_TEXTURED_3D | MATERIAL_FLAG_OCCLUSION_TEXTURED_3D | MATERIAL_FLAG_EMISSIVE_TEXTURED_3D)) this.gl.uniform4f(resources.textureMapFlags, flags & mapFlags[0] ? 1 : 0, flags & mapFlags[1] ? 1 : 0, flags & mapFlags[2] ? 1 : 0, flags & mapFlags[3] ? 1 : 0);
    for (let slot = 1; slot < MATERIAL_TEXTURE_STRIDE_3D; slot += 1) {
      const mapHandle = this.scene.materialTextureHandles[textureOffset + slot];
      if (mapHandle === -1) continue;
      this.gl.activeTexture(this.gl.TEXTURE0 + slot + 1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureRecord(mapHandle, this.requireTexture(mapHandle, handle)).texture);
      this.stats.textureBindings += 1;
    }
    this.gl.activeTexture(this.gl.TEXTURE0);
    // A cutaway must retain its edges when the camera crosses inside the solid.
    if (flags & (MATERIAL_FLAG_DOUBLE_SIDED_3D | MATERIAL_FLAG_CUTAWAY_3D)) this.gl.disable(this.gl.CULL_FACE);
    else this.gl.enable(this.gl.CULL_FACE);
    if (flags & MATERIAL_FLAG_ALPHA_BLEND_3D) {
      const gl = this.gl, additive = (flags & MATERIAL_FLAG_ADDITIVE_3D) !== 0;
      gl.enable(gl.BLEND);
      // Source-over coverage is As + Ad * (1 - As). Multiplying As by
      // itself makes an opaque canvas translucent behind blended geometry.
      // Retain the existing additive convention and both RGB equations.
      gl.blendFuncSeparate(gl.SRC_ALPHA, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA,
        additive ? gl.SRC_ALPHA : gl.ONE, additive ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    else { this.gl.disable(this.gl.BLEND); this.gl.depthMask(true); }
    this.boundMaterial = handle;
    this.stats.materialBindings += 1;
  },

bindMorphWeights(this: InternalWebGl2Renderer3D, mesh: MeshGeometry3D): void {
    const weights = mesh.morphWeights;
    this.gl.uniform4f(this.requireMainResources().morphWeights,
      finiteComponent(weights, 0, 0, "morphWeights"), finiteComponent(weights, 1, 0, "morphWeights"),
      finiteComponent(weights, 2, 0, "morphWeights"), finiteComponent(weights, 3, 0, "morphWeights"));
  },

bindFrameLights(this: InternalWebGl2Renderer3D, commands: RenderCommandBuffer3D): void {
    this.frameLighting.bind(this.gl, this.requireMainResources(), commands, this.stats);
  },

bindSkinning(this: InternalWebGl2Renderer3D,
    commands: RenderCommandBuffer3D,
    command: number,
    meshHandle: number,
    mesh: MeshGeometry3D,
    materialHandle: number
  ): void {
    const commandSkinned = (commands.commandFlags[command] & RENDER_COMMAND_FLAG_SKINNED_3D) !== 0;
    const materialSkinned = (this.scene.materialFlags[materialHandle] & MATERIAL_FLAG_SKINNED_3D) !== 0;
    const meshSkinned = mesh.joints !== undefined && mesh.weights !== undefined;
    if (commandSkinned !== materialSkinned || commandSkinned !== meshSkinned) {
      throw new Error(`render command ${command} skinning flags disagree for mesh ${meshHandle}, material ${materialHandle}, and command state.`);
    }
    if (!commandSkinned) {
      if (this.boundSkeleton !== -1) this.gl.uniform1i(this.requireMainResources().skinningEnabled, 0);
      this.boundSkeleton = -1;
      return;
    }
    const skeleton = commands.commandSkeletonHandles[command];
    if (!this.scene.isSkeletonActive(skeleton)) throw new Error(`render command ${command} references inactive skeleton ${skeleton}.`);
    const jointCount = this.scene.skeletonJointCounts[skeleton];
    if (jointCount > this.maxJointsPerSkeleton) {
      throw new RangeError(`skeleton ${skeleton} jointCount ${jointCount} exceeds WebGL2 palette capacity ${this.maxJointsPerSkeleton}.`);
    }
    const resources = this.requireMainResources();
    this.gl.uniform1i(resources.skinningEnabled, 1);
    if (this.boundSkeleton === skeleton) return;
    this.gl.uniformMatrix4fv(
      resources.jointPalette,
      false,
      this.scene.skeletonMatrices,
      this.scene.skeletonMatrixOffset(skeleton),
      jointCount * 16
    );
    this.boundSkeleton = skeleton;
    this.stats.paletteUploads += 1;
    this.stats.paletteMatrices += jointCount;
    this.stats.uploadedBytes += jointCount * 16 * Float32Array.BYTES_PER_ELEMENT;
  },
};

const webGl2LifecycleMethods = {
requireTexture(this: InternalWebGl2Renderer3D, handle: number, material: number): TextureResource3D {
    try { return this.scene.getTexture(handle); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`material ${material} references unavailable texture ${handle}: ${detail}`);
    }
  },

textureRecord(this: InternalWebGl2Renderer3D, handle: number, source: TextureResource3D): TextureGpuRecord3D {
    const cached = this.textureCache.get(handle);
    if (cached?.source === source) return cached;
    if (cached) {
      this.deleteTexture(cached);
      this.textureCache.delete(handle);
    }
    if (source.width > this.maxTextureSize || source.height > this.maxTextureSize) {
      throw new RangeError(`texture ${handle} dimensions ${source.width}x${source.height} exceed WebGL2 limit ${this.maxTextureSize}.`);
    }
    const gl = this.gl, texture = gl.createTexture();
    if (!texture) throw new Error(`WebGL2 failed to allocate texture ${handle}.`);
    try {
      // bindMaterial selected this map's sampler unit; uploading must preserve it.
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, source.flipY === false ? 0 : 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.pixels);
      const filter = source.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, source.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, source.wrapU === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, source.wrapV === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (source.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
      const record = { source, texture, byteLength: source.pixels.byteLength };
      this.textureCache.set(handle, record);
      this.stats.textureUploads += 1;
      this.stats.uploadedBytes += source.pixels.byteLength;
      return record;
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  },

requireMesh(this: InternalWebGl2Renderer3D, handle: number, command: number): MeshGeometry3D {
    try {
      return this.scene.getMesh(handle);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`render command ${command} references unavailable mesh ${handle}: ${detail}`);
    }
  },

readPixelRatio(this: InternalWebGl2Renderer3D): number {
    if (typeof this.pixelRatioSource === "function") return this.pixelRatioSource();
    if (typeof this.pixelRatioSource === "number") return this.pixelRatioSource;
    return 1;
  },

resetFrameStats(this: InternalWebGl2Renderer3D): void {
    this.stats.drawCalls = 0; this.stats.instances = 0; this.stats.triangles = 0; this.stats.lines = 0;
    this.stats.meshUploads = 0; this.stats.materialBindings = 0; this.stats.textureUploads = 0; this.stats.textureBindings = 0;
    this.stats.ambientLightsUsed = 0; this.stats.directionalLightsUsed = 0; this.stats.pointLightsUsed = 0; this.stats.unsupportedLights = 0;
    this.stats.paletteUploads = 0; this.stats.paletteMatrices = 0;
    this.stats.skinnedDrawCalls = 0; this.stats.skinnedInstances = 0;
    this.stats.shadowDrawCalls = 0; this.stats.outlineDrawCalls = 0;
    this.stats.uploadedBytes = 0; this.stats.contextGeneration = this.generation;
    this.stats.contextLost = this.contextLost; this.stats.skipped = false;
  },

deleteMesh(this: InternalWebGl2Renderer3D, mesh: MeshGpuRecord3D): void {
    deleteMeshResources3D(this.gl, mesh);
  },

deleteTexture(this: InternalWebGl2Renderer3D, texture: TextureGpuRecord3D): void { this.gl.deleteTexture(texture.texture); },
deleteGpuResources(this: InternalWebGl2Renderer3D): void {
    for (const mesh of this.meshCache.values()) this.deleteMesh(mesh);
    this.meshCache.clear();
    for (const texture of this.textureCache.values()) this.deleteTexture(texture);
    this.textureCache.clear();
    const main = this.mainResources;
    if (main) {
      this.gl.deleteBuffer(main.instanceBuffer);
      if (main.appearanceBuffer) this.gl.deleteBuffer(main.appearanceBuffer);
      this.gl.deleteProgram(main.program);
      this.gl.deleteTexture(main.fallbackTexture);
    }
    const shadow = this.shadowResources;
    if (shadow) {
      this.gl.deleteProgram(shadow.program);
      this.gl.deleteFramebuffer(shadow.framebuffer);
      this.gl.deleteTexture(shadow.texture);
    }
    this.mainResources = undefined;
    this.shadowResources = undefined;
  },

abandonGpuResources(this: InternalWebGl2Renderer3D): void {
    this.meshCache.clear();
    this.textureCache.clear();
    this.mainResources = undefined;
    this.shadowResources = undefined;
  },

requireMainResources(this: InternalWebGl2Renderer3D): MainGpuResources3D {
    if (!this.mainResources) throw new Error("WebGL2 main resources are unavailable.");
    return this.mainResources;
  },

requireShadowResources(this: InternalWebGl2Renderer3D): ShadowGpuResources3D {
    if (!this.shadowResources) throw new Error("WebGL2 shadow resources are unavailable.");
    return this.shadowResources;
  },

assertUsable(this: InternalWebGl2Renderer3D): void {
    if (this.disposed) throw new Error("WebGL2 renderer is disposed.");
  },

checkGlError(this: InternalWebGl2Renderer3D, stage: string): void {
    if (!this.validateGlErrors) return;
    const code = this.gl.getError();
    if (code !== this.gl.NO_ERROR) throw new Error(`WebGL2 error 0x${code.toString(16)} after ${stage}.`);
  },

emit(this: InternalWebGl2Renderer3D, level: WebGl2DiagnosticLevel3D, code: WebGl2Diagnostic3D["code"], message: string): void {
    this.onDiagnostic?.({ level, code, message });
  },
};

const webGl2RendererPrototype = Object.assign({}, webGl2PublicMethods, webGl2GpuMethods, webGl2BindingMethods, webGl2LifecycleMethods);
const webGl2RendererMethodNames = ["resize", "render", "dispose", "renderShadowPass", "renderOutlinePass", "isContextLost", "isDisposed", "initializeGpuResources", "compileShader", "initializeShadowResources", "meshRecord", "bindInstanceRange", "bindMaterial", "bindMorphWeights", "bindFrameLights", "bindSkinning", "requireTexture", "textureRecord", "requireMesh", "readPixelRatio", "resetFrameStats", "deleteMesh", "deleteTexture", "deleteGpuResources", "abandonGpuResources", "requireMainResources", "requireShadowResources", "assertUsable", "checkGlError", "emit"];

function isInternalWebGl2Renderer(value: unknown): value is InternalWebGl2Renderer3D {
  return typeof value === "object" && value !== null
    && webGl2RendererMethodNames.every((name) => typeof Reflect.get(value, name) === "function");
}

function createWebGl2RendererInstance(options: WebGl2RendererOptions3D): WebGl2Renderer3D {
  const maxInstances = positiveInteger(options.maxInstances, "maxInstances");
  const maxDevicePixelRatio = positiveFinite(options.maxDevicePixelRatio ?? 2, "maxDevicePixelRatio");
  const maxWidth = positiveInteger(options.maxDrawingBufferWidth ?? 8_192, "maxDrawingBufferWidth");
  const maxHeight = positiveInteger(options.maxDrawingBufferHeight ?? 8_192, "maxDrawingBufferHeight");
  const clearColor = new Float32Array([
    colorComponent(options.clearColor, 0, 0.035),
    colorComponent(options.clearColor, 1, 0.045),
    colorComponent(options.clearColor, 2, 0.06),
    colorComponent(options.clearColor, 3, 1),
  ]);
  const context = options.context ?? options.canvas.getContext("webgl2", options.contextAttributes);
  if (!isWebGl2Context(context)) {
    throw new Error("WebGL2 is unavailable. This renderer requires a WebGL2RenderingContext with instancing support.");
  }
  const hardwareTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
  if (!Number.isSafeInteger(hardwareTextureSize) || hardwareTextureSize <= 0) throw new Error(`WebGL2 reported invalid MAX_TEXTURE_SIZE ${hardwareTextureSize}.`);
  const maxTextureSize = Math.min(hardwareTextureSize, positiveInteger(options.maxTextureSize ?? hardwareTextureSize, "maxTextureSize"));
  const shadowMapSize = options.directionalShadowMapSize === undefined ? 0 : positiveInteger(options.directionalShadowMapSize, "directionalShadowMapSize");
  if (shadowMapSize > hardwareTextureSize) throw new RangeError(`directionalShadowMapSize ${shadowMapSize} exceeds MAX_TEXTURE_SIZE ${hardwareTextureSize}.`);
  const vertexUniformVectors = Number(context.getParameter(context.MAX_VERTEX_UNIFORM_VECTORS));
  if (!Number.isSafeInteger(vertexUniformVectors) || vertexUniformVectors <= 5) {
    throw new Error(`WebGL2 reported invalid MAX_VERTEX_UNIFORM_VECTORS ${vertexUniformVectors}.`);
  }
  const hardwareJointLimit = Math.floor((vertexUniformVectors - 5) / 4);
  const maxJointsPerSkeleton = positiveInteger(options.maxJointsPerSkeleton ?? Math.max(1, options.scene.jointsPerSkeleton), "maxJointsPerSkeleton");
  if (maxJointsPerSkeleton > hardwareJointLimit) {
    throw new RangeError(`maxJointsPerSkeleton ${maxJointsPerSkeleton} requires ${maxJointsPerSkeleton * 4 + 5} vertex uniform vectors, but WebGL2 reports ${vertexUniformVectors} (maximum palette ${hardwareJointLimit}).`);
  }
  let renderer: InternalWebGl2Renderer3D | undefined;
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    const active = renderer;
    if (!active || active.disposed || active.contextLost) return;
    active.contextLost = true;
    active.abandonGpuResources();
    active.emit("warning", "context-lost", "WebGL2 context lost; rendering is paused until restoration.");
  };
  const handleContextRestored = () => {
    const active = renderer;
    if (!active || active.disposed) return;
    try {
      active.initializeGpuResources();
      active.contextLost = false;
      active.emit("info", "context-restored", `WebGL2 context restored; GPU resources will be uploaded again (generation ${active.generation}).`);
    } catch (error) {
      active.contextLost = true;
      active.emit("error", "restore-failed", error instanceof Error ? error.message : String(error));
    }
  };
  const fields: WebGl2RendererFields3D = {
    canvas: options.canvas,
    scene: options.scene,
    maxInstances,
    maxJointsPerSkeleton,
    stats: createWebGl2FrameStats3D(),
    gl: context,
    clearColor,
    frameLighting: createFrameLighting(),
    pixelRatioSource: options.pixelRatio,
    maxDevicePixelRatio,
    maxWidth,
    maxHeight,
    maxTextureSize,
    shadowMapSize,
    onDiagnostic: options.onDiagnostic,
    validateGlErrors: options.validateGlErrors === true,
    cameraCulling: options.cameraCulling === true,
    features: undefined,
    commandViews: undefined,
    meshCache: new Map(),
    textureCache: new Map(),
    mainResources: undefined,
    shadowResources: undefined,
    contextLost: false,
    disposed: false,
    generation: 0,
    width: -1,
    height: -1,
    pixelRatio: 1,
    boundMaterial: -1,
    boundSkeleton: -2,
    handleContextLost,
    handleContextRestored,
  };
  Object.setPrototypeOf(fields, webGl2RendererPrototype);
  if (!isInternalWebGl2Renderer(fields)) throw new Error("WebGL2 renderer factory produced an invalid instance");
  renderer = fields;
  renderer.initializeGpuResources();
  renderer.checkGlError("initialization");
  renderer.canvas.addEventListener("webglcontextlost", renderer.handleContextLost);
  renderer.canvas.addEventListener("webglcontextrestored", renderer.handleContextRestored);
  return renderer;
}

function webGl2Renderer3DFactory(options: WebGl2RendererOptions3D): WebGl2Renderer3D {
  return createWebGl2RendererInstance(options);
}

function isWebGl2Renderer3DFactory(value: unknown): value is WebGl2Renderer3DFactory {
  if (typeof value !== "function") return false;
  try {
    Reflect.construct(Object, [], value);
    return true;
  } catch {
    return false;
  }
}

function requireWebGl2Renderer3DFactory(value: unknown): WebGl2Renderer3DFactory {
  if (!isWebGl2Renderer3DFactory(value)) throw new Error("WebGL2 renderer factory must be constructable");
  return value;
}

Object.defineProperty(webGl2Renderer3DFactory, "prototype", { value: webGl2RendererPrototype });
export const WebGl2Renderer3D = requireWebGl2Renderer3DFactory(webGl2Renderer3DFactory);
const MATRIX_BYTE_STRIDE = 16 * Float32Array.BYTES_PER_ELEMENT;
export function createWebGl2Renderer3D(options: WebGl2RendererOptions3D): WebGl2Renderer3D {
  return createWebGl2RendererInstance(options);
}

export function supportsWebGl2Renderer3D(canvas?: WebGl2Canvas3D): boolean {
  if (canvas) return isWebGl2Context(canvas.getContext("webgl2"));
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas");
  return Boolean(probe.getContext("webgl2"));
}
