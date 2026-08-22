import {
  BoundedScene3D,
  LIGHT_KIND_AMBIENT_3D,
  LIGHT_KIND_DIRECTIONAL_3D,
  MATERIAL_FLAG_ALPHA_MASK_3D,
  MATERIAL_FLAG_DOUBLE_SIDED_3D,
  MATERIAL_FLAG_LIT_3D,
  MATERIAL_FLAG_SKINNED_3D,
  MATERIAL_FLAG_TEXTURED_3D,
  MATERIAL_FLOAT_STRIDE_3D,
  RENDER_COMMAND_FLAG_SKINNED_3D,
  RenderCommandBuffer3D,
  type MeshGeometry3D,
  type TextureResource3D
} from "./3d-scene.ts";

export type WebGl2DiagnosticLevel3D = "info" | "warning" | "error";

export interface WebGl2Diagnostic3D {
  level: WebGl2DiagnosticLevel3D;
  code: "context-lost" | "context-restored" | "restore-failed" | "shader-compile" | "program-link";
  message: string;
}

export interface WebGl2RendererOptions3D {
  canvas: HTMLCanvasElement;
  scene: BoundedScene3D;
  /** Explicit upper bound for matrices uploaded each frame. */
  maxInstances: number;
  contextAttributes?: WebGLContextAttributes;
  /** Injection boundary for tests or an already-created context. */
  context?: WebGL2RenderingContext;
  clearColor?: ArrayLike<number>;
  pixelRatio?: number | (() => number);
  maxDevicePixelRatio?: number;
  maxDrawingBufferWidth?: number;
  maxDrawingBufferHeight?: number;
  /** Additional software cap, clamped to the driver MAX_TEXTURE_SIZE. */
  maxTextureSize?: number;
  /** Shader palette capacity. Defaults to the scene jointsPerSkeleton stride. */
  maxJointsPerSkeleton?: number;
  /** Slow driver error checks for acceptance/debug builds. */
  validateGlErrors?: boolean;
  /** Enables a bounded directional depth map. Omit to allocate no shadow resources. */
  directionalShadowMapSize?: number;
  onDiagnostic?: (diagnostic: WebGl2Diagnostic3D) => void;
}

export interface WebGl2ResizeOptions3D {
  cssWidth?: number;
  cssHeight?: number;
  pixelRatio?: number;
}

export interface WebGl2RenderOptions3D extends WebGl2ResizeOptions3D {
  clear?: boolean;
  /** World-space eye used by metallic-roughness specular lighting. */
  cameraPosition?: ArrayLike<number>;
  /** Directional-light view-projection matrix. Requires directionalShadowMapSize at creation. */
  shadowViewProjection?: ArrayLike<number>;
  shadowBias?: number;
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

interface MeshGpuRecord3D {
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

interface TextureGpuRecord3D {
  source: TextureResource3D;
  texture: WebGLTexture;
  byteLength: number;
}

function vertexShaderSource(maxJoints: number): string { return `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_model0;
layout(location = 2) in vec4 a_model1;
layout(location = 3) in vec4 a_model2;
layout(location = 4) in vec4 a_model3;
layout(location = 5) in vec3 a_normal;
layout(location = 6) in vec2 a_uv;
layout(location = 7) in uvec4 a_joints;
layout(location = 8) in vec4 a_weights;
layout(location = 9) in vec3 a_morph0;
layout(location = 10) in vec3 a_morph1;
layout(location = 11) in vec3 a_morph2;
layout(location = 12) in vec3 a_morph3;

uniform mat4 u_viewProjection;
uniform mat4 u_shadowViewProjection;
uniform bool u_skinningEnabled;
uniform mat4 u_jointPalette[${maxJoints}];
uniform vec4 u_morphWeights;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec2 v_uv;
out vec4 v_shadowPosition;

void main() {
  mat4 model = mat4(a_model0, a_model1, a_model2, a_model3);
  vec3 morphedPosition = a_position + a_morph0 * u_morphWeights.x + a_morph1 * u_morphWeights.y + a_morph2 * u_morphWeights.z + a_morph3 * u_morphWeights.w;
  vec4 localPosition = vec4(morphedPosition, 1.0);
  vec3 localNormal = a_normal;
  if (u_skinningEnabled) {
    mat4 skin = a_weights.x * u_jointPalette[int(a_joints.x)]
      + a_weights.y * u_jointPalette[int(a_joints.y)]
      + a_weights.z * u_jointPalette[int(a_joints.z)]
      + a_weights.w * u_jointPalette[int(a_joints.w)];
    localPosition = skin * localPosition;
    localNormal = mat3(skin) * localNormal;
  }
  vec4 worldPosition = model * localPosition;
  v_normal = transpose(inverse(mat3(model))) * localNormal;
  v_worldPosition = worldPosition.xyz;
  v_uv = a_uv;
  v_shadowPosition = u_shadowViewProjection * worldPosition;
  gl_Position = u_viewProjection * worldPosition;
}`; }

function shadowVertexShaderSource(maxJoints: number): string { return `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 a_position;
layout(location=1) in vec4 a_model0; layout(location=2) in vec4 a_model1; layout(location=3) in vec4 a_model2; layout(location=4) in vec4 a_model3;
layout(location=7) in uvec4 a_joints; layout(location=8) in vec4 a_weights;
layout(location=9) in vec3 a_morph0; layout(location=10) in vec3 a_morph1; layout(location=11) in vec3 a_morph2; layout(location=12) in vec3 a_morph3;
uniform mat4 u_shadowViewProjection; uniform bool u_skinningEnabled; uniform mat4 u_jointPalette[${maxJoints}]; uniform vec4 u_morphWeights;
void main(){
  mat4 model=mat4(a_model0,a_model1,a_model2,a_model3);
  vec4 local=vec4(a_position+a_morph0*u_morphWeights.x+a_morph1*u_morphWeights.y+a_morph2*u_morphWeights.z+a_morph3*u_morphWeights.w,1.0);
  if(u_skinningEnabled){mat4 skin=a_weights.x*u_jointPalette[int(a_joints.x)]+a_weights.y*u_jointPalette[int(a_joints.y)]+a_weights.z*u_jointPalette[int(a_joints.z)]+a_weights.w*u_jointPalette[int(a_joints.w)];local=skin*local;}
  gl_Position=u_shadowViewProjection*model*local;
}`; }
const SHADOW_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
void main(){}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp sampler2DShadow;

uniform vec4 u_baseColor;
uniform vec3 u_emissive;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_alphaCutoff;
uniform bool u_useTexture;
uniform bool u_lit;
uniform sampler2D u_baseColorTexture;
uniform vec3 u_ambientColor;
uniform vec3 u_directionalDirection;
uniform vec3 u_directionalColor;
uniform vec3 u_cameraPosition;
uniform bool u_shadowEnabled;
uniform mat4 u_shadowViewProjection;
uniform sampler2DShadow u_shadowMap;
uniform float u_shadowBias;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec2 v_uv;
in vec4 v_shadowPosition;
out vec4 outColor;

void main() {
  vec4 surface = u_baseColor;
  if (u_useTexture) surface *= texture(u_baseColorTexture, v_uv);
  if (u_alphaCutoff >= 0.0 && surface.a < u_alphaCutoff) discard;
  vec3 color = surface.rgb;
  if (u_lit) {
    const float PI = 3.14159265359;
    vec3 normal = length(v_normal) > 0.00001 ? normalize(v_normal) : vec3(0.0, 1.0, 0.0);
    vec3 viewDelta = u_cameraPosition - v_worldPosition;
    vec3 viewDirection = length(viewDelta) > 0.00001 ? normalize(viewDelta) : vec3(0.0, 0.0, 1.0);
    vec3 lightDirection = length(u_directionalDirection) > 0.00001 ? normalize(-u_directionalDirection) : vec3(0.0, 1.0, 0.0);
    vec3 halfwayDelta = viewDirection + lightDirection;
    vec3 halfway = length(halfwayDelta) > 0.00001 ? normalize(halfwayDelta) : normal;
    float nDotL = max(dot(normal, lightDirection), 0.0);
    float nDotV = max(dot(normal, viewDirection), 0.0001);
    float nDotH = max(dot(normal, halfway), 0.0);
    float vDotH = max(dot(viewDirection, halfway), 0.0);
    float roughness = clamp(u_roughness, 0.045, 1.0);
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float denominator = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
    float distribution = alpha2 / max(PI * denominator * denominator, 0.0001);
    float geometryK = (roughness + 1.0) * (roughness + 1.0) / 8.0;
    float geometryV = nDotV / (nDotV * (1.0 - geometryK) + geometryK);
    float geometryL = nDotL / (nDotL * (1.0 - geometryK) + geometryK);
    vec3 f0 = mix(vec3(0.04), surface.rgb, u_metallic);
    vec3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
    vec3 specular = distribution * geometryV * geometryL * fresnel / max(4.0 * nDotV * max(nDotL, 0.0001), 0.0001);
    vec3 diffuse = (1.0 - fresnel) * (1.0 - u_metallic) * surface.rgb / PI;
    float visibility = 1.0;
    if (u_shadowEnabled) {
      vec3 projected = v_shadowPosition.xyz / max(v_shadowPosition.w, 0.00001) * 0.5 + 0.5;
      if (projected.x >= 0.0 && projected.x <= 1.0 && projected.y >= 0.0 && projected.y <= 1.0 && projected.z >= 0.0 && projected.z <= 1.0) visibility = texture(u_shadowMap, vec3(projected.xy, projected.z - u_shadowBias));
    }
    color = surface.rgb * u_ambientColor + (diffuse + specular) * u_directionalColor * nDotL * visibility;
  }
  outColor = vec4(color + u_emissive, surface.a);
}`;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer; received ${value}.`);
  return value;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number; received ${value}.`);
  return value;
}

function colorComponent(color: ArrayLike<number> | undefined, index: number, fallback: number): number {
  const value = color?.[index] ?? fallback;
  if (!Number.isFinite(value)) throw new RangeError(`clearColor[${index}] must be finite; received ${value}.`);
  return value;
}

function finiteComponent(value: ArrayLike<number> | undefined, index: number, fallback: number, label: string): number {
  const component = value?.[index] ?? fallback;
  if (!Number.isFinite(component)) throw new RangeError(`${label}[${index}] must be finite; received ${component}.`);
  return component;
}

function numberSource(source: string): string {
  return source.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
}

export class WebGl2Renderer3D {
  readonly canvas: HTMLCanvasElement;
  readonly scene: BoundedScene3D;
  readonly maxInstances: number;
  readonly maxJointsPerSkeleton: number;
  readonly stats: WebGl2FrameStats3D;

  readonly #gl: WebGL2RenderingContext;
  readonly #clearColor: Float32Array;
  readonly #pixelRatioSource: number | (() => number) | undefined;
  readonly #maxDevicePixelRatio: number;
  readonly #maxWidth: number;
  readonly #maxHeight: number;
  readonly #maxTextureSize: number;
  readonly #shadowMapSize: number;
  readonly #onDiagnostic: ((diagnostic: WebGl2Diagnostic3D) => void) | undefined;
  readonly #validateGlErrors: boolean;
  readonly #meshCache = new Map<number, MeshGpuRecord3D>();
  readonly #textureCache = new Map<number, TextureGpuRecord3D>();
  #program: WebGLProgram | undefined;
  #instanceBuffer: WebGLBuffer | undefined;
  #viewProjectionLocation: WebGLUniformLocation | undefined;
  #baseColorLocation: WebGLUniformLocation | undefined;
  #emissiveLocation: WebGLUniformLocation | undefined;
  #metallicLocation: WebGLUniformLocation | undefined;
  #roughnessLocation: WebGLUniformLocation | undefined;
  #alphaCutoffLocation: WebGLUniformLocation | undefined;
  #useTextureLocation: WebGLUniformLocation | undefined;
  #litLocation: WebGLUniformLocation | undefined;
  #ambientColorLocation: WebGLUniformLocation | undefined;
  #directionalDirectionLocation: WebGLUniformLocation | undefined;
  #directionalColorLocation: WebGLUniformLocation | undefined;
  #cameraPositionLocation: WebGLUniformLocation | undefined;
  #baseColorTextureLocation: WebGLUniformLocation | undefined;
  #skinningEnabledLocation: WebGLUniformLocation | undefined;
  #jointPaletteLocation: WebGLUniformLocation | undefined;
  #morphWeightsLocation: WebGLUniformLocation | undefined;
  #shadowEnabledLocation: WebGLUniformLocation | undefined;
  #shadowViewProjectionLocation: WebGLUniformLocation | undefined;
  #shadowMapLocation: WebGLUniformLocation | undefined;
  #shadowBiasLocation: WebGLUniformLocation | undefined;
  #shadowProgram: WebGLProgram | undefined;
  #shadowProgramViewProjection: WebGLUniformLocation | undefined;
  #shadowProgramSkinning: WebGLUniformLocation | undefined;
  #shadowProgramPalette: WebGLUniformLocation | undefined;
  #shadowProgramMorphWeights: WebGLUniformLocation | undefined;
  #shadowFramebuffer: WebGLFramebuffer | undefined;
  #shadowTexture: WebGLTexture | undefined;
  #fallbackTexture: WebGLTexture | undefined;
  #contextLost = false;
  #disposed = false;
  #generation = 0;
  #width = -1;
  #height = -1;
  #pixelRatio = 1;
  #boundMaterial = -1;
  #boundSkeleton = -2;

  readonly #handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.#disposed || this.#contextLost) return;
    this.#contextLost = true;
    this.#abandonGpuResources();
    this.#emit("warning", "context-lost", "WebGL2 context lost; rendering is paused until restoration.");
  };

  readonly #handleContextRestored = (): void => {
    if (this.#disposed) return;
    try {
      this.#initializeGpuResources();
      this.#contextLost = false;
      this.#emit("info", "context-restored", `WebGL2 context restored; GPU resources will be uploaded again (generation ${this.#generation}).`);
    } catch (error) {
      this.#contextLost = true;
      this.#emit("error", "restore-failed", error instanceof Error ? error.message : String(error));
    }
  };

  constructor(options: WebGl2RendererOptions3D) {
    this.canvas = options.canvas;
    this.scene = options.scene;
    this.maxInstances = positiveInteger(options.maxInstances, "maxInstances");
    this.#maxDevicePixelRatio = positiveFinite(options.maxDevicePixelRatio ?? 2, "maxDevicePixelRatio");
    this.#maxWidth = positiveInteger(options.maxDrawingBufferWidth ?? 8_192, "maxDrawingBufferWidth");
    this.#maxHeight = positiveInteger(options.maxDrawingBufferHeight ?? 8_192, "maxDrawingBufferHeight");
    this.#pixelRatioSource = options.pixelRatio;
    this.#onDiagnostic = options.onDiagnostic;
    this.#validateGlErrors = options.validateGlErrors === true;
    this.#clearColor = new Float32Array([
      colorComponent(options.clearColor, 0, 0.035),
      colorComponent(options.clearColor, 1, 0.045),
      colorComponent(options.clearColor, 2, 0.06),
      colorComponent(options.clearColor, 3, 1)
    ]);
    const context = options.context ?? options.canvas.getContext("webgl2", options.contextAttributes);
    if (!context || typeof (context as WebGL2RenderingContext).drawArraysInstanced !== "function") {
      throw new Error("WebGL2 is unavailable. This renderer requires a WebGL2RenderingContext with instancing support.");
    }
    this.#gl = context as WebGL2RenderingContext;
    const hardwareTextureSize = Number(this.#gl.getParameter(this.#gl.MAX_TEXTURE_SIZE));
    if (!Number.isSafeInteger(hardwareTextureSize) || hardwareTextureSize <= 0) throw new Error(`WebGL2 reported invalid MAX_TEXTURE_SIZE ${hardwareTextureSize}.`);
    this.#maxTextureSize = Math.min(hardwareTextureSize, positiveInteger(options.maxTextureSize ?? hardwareTextureSize, "maxTextureSize"));
    this.#shadowMapSize = options.directionalShadowMapSize === undefined ? 0 : positiveInteger(options.directionalShadowMapSize, "directionalShadowMapSize");
    if (this.#shadowMapSize > hardwareTextureSize) throw new RangeError(`directionalShadowMapSize ${this.#shadowMapSize} exceeds MAX_TEXTURE_SIZE ${hardwareTextureSize}.`);
    const vertexUniformVectors = Number(this.#gl.getParameter(this.#gl.MAX_VERTEX_UNIFORM_VECTORS));
    if (!Number.isSafeInteger(vertexUniformVectors) || vertexUniformVectors <= 5) {
      throw new Error(`WebGL2 reported invalid MAX_VERTEX_UNIFORM_VECTORS ${vertexUniformVectors}.`);
    }
    const hardwareJointLimit = Math.floor((vertexUniformVectors - 5) / 4);
    const requestedJoints = positiveInteger(options.maxJointsPerSkeleton ?? Math.max(1, this.scene.jointsPerSkeleton), "maxJointsPerSkeleton");
    if (requestedJoints > hardwareJointLimit) {
      throw new RangeError(`maxJointsPerSkeleton ${requestedJoints} requires ${requestedJoints * 4 + 5} vertex uniform vectors, but WebGL2 reports ${vertexUniformVectors} (maximum palette ${hardwareJointLimit}).`);
    }
    this.maxJointsPerSkeleton = requestedJoints;
    this.stats = {
      drawCalls: 0, instances: 0, triangles: 0, lines: 0, meshUploads: 0, materialBindings: 0,
      textureUploads: 0, textureBindings: 0, ambientLightsUsed: 0, directionalLightsUsed: 0, unsupportedLights: 0, uploadedBytes: 0,
      paletteUploads: 0, paletteMatrices: 0,
      skinnedDrawCalls: 0, skinnedInstances: 0,
      shadowDrawCalls: 0,
      width: 0, height: 0, pixelRatio: 1, contextGeneration: 0, contextLost: false, skipped: false
    };
    this.#initializeGpuResources();
    this.#checkGlError("initialization");
    this.canvas.addEventListener("webglcontextlost", this.#handleContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.#handleContextRestored);
  }

  resize(options: WebGl2ResizeOptions3D = {}): boolean {
    this.#assertUsable();
    const priorCssWidth = this.#width > 0 ? this.#width / this.#pixelRatio : this.canvas.width || 1;
    const priorCssHeight = this.#height > 0 ? this.#height / this.#pixelRatio : this.canvas.height || 1;
    const cssWidth = positiveFinite(options.cssWidth ?? (this.canvas.clientWidth || priorCssWidth), "cssWidth");
    const cssHeight = positiveFinite(options.cssHeight ?? (this.canvas.clientHeight || priorCssHeight), "cssHeight");
    const requestedRatio = positiveFinite(options.pixelRatio ?? this.#readPixelRatio(), "pixelRatio");
    const cappedRatio = Math.min(requestedRatio, this.#maxDevicePixelRatio);
    const rawWidth = Math.max(1, Math.round(cssWidth * cappedRatio));
    const rawHeight = Math.max(1, Math.round(cssHeight * cappedRatio));
    const limitScale = Math.min(1, this.#maxWidth / rawWidth, this.#maxHeight / rawHeight);
    const width = Math.max(1, Math.floor(rawWidth * limitScale));
    const height = Math.max(1, Math.floor(rawHeight * limitScale));
    this.#pixelRatio = Math.min(width / cssWidth, height / cssHeight);
    const changed = width !== this.#width || height !== this.#height;
    if (changed) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.#width = width;
      this.#height = height;
      if (!this.#contextLost) this.#gl.viewport(0, 0, width, height);
    }
    this.stats.width = width;
    this.stats.height = height;
    this.stats.pixelRatio = this.#pixelRatio;
    return changed;
  }

  render(commands: RenderCommandBuffer3D, viewProjection: ArrayLike<number>, options: WebGl2RenderOptions3D = {}): WebGl2FrameStats3D {
    this.#assertUsable();
    if (viewProjection.length < 16) throw new RangeError("viewProjection needs at least 16 elements.");
    this.resize(options);
    this.#resetFrameStats();
    if (this.#contextLost || this.#gl.isContextLost?.()) {
      this.stats.contextLost = true;
      this.stats.skipped = true;
      return this.stats;
    }
    validateCommands(commands, this.maxInstances);
    const gl = this.#gl;
    const program = this.#program as WebGLProgram;
    const instanceBuffer = this.#instanceBuffer as WebGLBuffer;
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(this.#clearColor[0], this.#clearColor[1], this.#clearColor[2], this.#clearColor[3]);
    gl.clearDepth(1);
    if (options.clear !== false) gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(this.#viewProjectionLocation as WebGLUniformLocation, false, viewProjection as Float32List);
    const camera = options.cameraPosition;
    const cameraX = finiteComponent(camera, 0, 0, "cameraPosition");
    const cameraY = finiteComponent(camera, 1, 0, "cameraPosition");
    const cameraZ = finiteComponent(camera, 2, 0, "cameraPosition");
    gl.uniform3f(this.#cameraPositionLocation as WebGLUniformLocation, cameraX, cameraY, cameraZ);
    this.#bindFrameLights(commands);
    this.#boundMaterial = -1;
    this.#boundSkeleton = -2;
    this.#checkGlError("frame setup");
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    if (commands.instanceCount > 0) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, commands.instanceMatrices, 0, commands.instanceCount * 16);
      this.stats.uploadedBytes += commands.instanceCount * 16 * Float32Array.BYTES_PER_ELEMENT;
    }
    const shadowMatrix = options.shadowViewProjection;
    if (shadowMatrix && this.#shadowMapSize === 0) throw new Error("shadowViewProjection requires directionalShadowMapSize at renderer creation.");
    if (shadowMatrix) {
      if (shadowMatrix.length < 16) throw new RangeError("shadowViewProjection needs at least 16 elements.");
      this.#renderShadowPass(commands, shadowMatrix);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.stats.width, this.stats.height); gl.colorMask(true, true, true, true);
      gl.useProgram(program); gl.uniformMatrix4fv(this.#viewProjectionLocation as WebGLUniformLocation, false, viewProjection as Float32List);
      gl.uniformMatrix4fv(this.#shadowViewProjectionLocation as WebGLUniformLocation, false, shadowMatrix as Float32List);
      const shadowBias = finiteComponent([options.shadowBias ?? 0.001], 0, 0.001, "shadowBias");
      if (shadowBias < 0 || shadowBias > 0.05) throw new RangeError(`shadowBias must be from 0 through 0.05; received ${shadowBias}.`);
      gl.uniform1i(this.#shadowEnabledLocation as WebGLUniformLocation, 1); gl.uniform1f(this.#shadowBiasLocation as WebGLUniformLocation, shadowBias);
      gl.activeTexture(gl.TEXTURE0 + 1); gl.bindTexture(gl.TEXTURE_2D, this.#shadowTexture as WebGLTexture); gl.activeTexture(gl.TEXTURE0);
      gl.uniform3f(this.#cameraPositionLocation as WebGLUniformLocation, cameraX, cameraY, cameraZ); this.#bindFrameLights(commands);
      this.#boundMaterial = -1; this.#boundSkeleton = -2;
    } else {
      gl.uniform1i(this.#shadowEnabledLocation as WebGLUniformLocation, 0);
      gl.uniformMatrix4fv(this.#shadowViewProjectionLocation as WebGLUniformLocation, false, viewProjection as Float32List);
    }

    for (let command = 0; command < commands.commandCount; command += 1) {
      const instanceCount = commands.commandInstanceCounts[command];
      if (instanceCount === 0) continue;
      const meshHandle = commands.commandMeshHandles[command];
      const materialHandle = commands.commandMaterialHandles[command];
      const mesh = this.#requireMesh(meshHandle, command);
      this.#bindMaterial(materialHandle, meshHandle, mesh);
      this.#bindMorphWeights(mesh);
      this.#checkGlError(`command ${command} material bind`);
      this.#bindSkinning(commands, command, meshHandle, mesh, materialHandle);
      this.#checkGlError(`command ${command} skeleton bind`);
      const gpuMesh = this.#meshRecord(meshHandle, mesh);
      this.#checkGlError(`command ${command} mesh bind`);
      gl.bindVertexArray(gpuMesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      this.#bindInstanceRange(commands.commandFirstInstances[command]);
      if (gpuMesh.indexBuffer) {
        gl.drawElementsInstanced(gpuMesh.mode, gpuMesh.indexCount, gpuMesh.indexType, 0, instanceCount);
      } else {
        gl.drawArraysInstanced(gpuMesh.mode, 0, gpuMesh.vertexCount, instanceCount);
      }
      this.#checkGlError(`command ${command} draw`);
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
    gl.bindVertexArray(null);
    this.stats.contextGeneration = this.#generation;
    return this.stats;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.canvas.removeEventListener("webglcontextlost", this.#handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.#handleContextRestored);
    if (!this.#contextLost) this.#deleteGpuResources();
    else this.#abandonGpuResources();
    this.#disposed = true;
  }

  #renderShadowPass(commands: RenderCommandBuffer3D, viewProjection: ArrayLike<number>): void {
    const gl = this.#gl, program = this.#shadowProgram as WebGLProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#shadowFramebuffer as WebGLFramebuffer); gl.viewport(0, 0, this.#shadowMapSize, this.#shadowMapSize);
    gl.colorMask(false, false, false, false); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.useProgram(program);
    gl.uniformMatrix4fv(this.#shadowProgramViewProjection as WebGLUniformLocation, false, viewProjection as Float32List);
    let boundSkeleton = -2;
    for (let command = 0; command < commands.commandCount; command += 1) {
      const count = commands.commandInstanceCounts[command]; if (count === 0) continue;
      const meshHandle = commands.commandMeshHandles[command], mesh = this.#requireMesh(meshHandle, command);
      const weights = mesh.morphWeights;
      gl.uniform4f(this.#shadowProgramMorphWeights as WebGLUniformLocation, finiteComponent(weights, 0, 0, "morphWeights"), finiteComponent(weights, 1, 0, "morphWeights"), finiteComponent(weights, 2, 0, "morphWeights"), finiteComponent(weights, 3, 0, "morphWeights"));
      const skeleton = commands.commandSkeletonHandles[command];
      if ((commands.commandFlags[command] & RENDER_COMMAND_FLAG_SKINNED_3D) !== 0) {
        gl.uniform1i(this.#shadowProgramSkinning as WebGLUniformLocation, 1);
        if (boundSkeleton !== skeleton) {
          const jointCount = this.scene.skeletonJointCounts[skeleton];
          gl.uniformMatrix4fv(this.#shadowProgramPalette as WebGLUniformLocation, false, this.scene.skeletonMatrices, this.scene.skeletonMatrixOffset(skeleton), jointCount * 16); boundSkeleton = skeleton;
        }
      } else { gl.uniform1i(this.#shadowProgramSkinning as WebGLUniformLocation, 0); boundSkeleton = -1; }
      const gpu = this.#meshRecord(meshHandle, mesh); gl.bindVertexArray(gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.#instanceBuffer as WebGLBuffer);
      this.#bindInstanceRange(commands.commandFirstInstances[command]);
      if (gpu.indexBuffer) gl.drawElementsInstanced(gpu.mode, gpu.indexCount, gpu.indexType, 0, count); else gl.drawArraysInstanced(gpu.mode, 0, gpu.vertexCount, count);
      this.stats.shadowDrawCalls += 1;
    }
  }

  isContextLost(): boolean { return this.#contextLost; }
  isDisposed(): boolean { return this.#disposed; }

  #initializeGpuResources(): void {
    const gl = this.#gl;
    const vertexShader = this.#compileShader(gl.VERTEX_SHADER, vertexShaderSource(this.maxJointsPerSkeleton), "vertex");
    let fragmentShader: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    let instanceBuffer: WebGLBuffer | undefined;
    let fallbackTexture: WebGLTexture | undefined;
    try {
      fragmentShader = this.#compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE, "fragment");
      program = gl.createProgram() ?? undefined;
      if (!program) throw new Error("WebGL2 failed to allocate the basic material shader program.");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program)?.trim() || "No driver program log was provided.";
        const message = `WebGL2 basic material program link failed: ${log}`;
        this.#emit("error", "program-link", message);
        throw new Error(message);
      }
      instanceBuffer = gl.createBuffer() ?? undefined;
      if (!instanceBuffer) throw new Error("WebGL2 failed to allocate the bounded instance matrix buffer.");
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.maxInstances * MATRIX_BYTE_STRIDE, gl.DYNAMIC_DRAW);
      const viewProjection = requiredUniform(gl, program, "u_viewProjection");
      const baseColor = requiredUniform(gl, program, "u_baseColor");
      const emissive = requiredUniform(gl, program, "u_emissive");
      const metallic = requiredUniform(gl, program, "u_metallic");
      const roughness = requiredUniform(gl, program, "u_roughness");
      const alphaCutoff = requiredUniform(gl, program, "u_alphaCutoff");
      const useTexture = requiredUniform(gl, program, "u_useTexture");
      const lit = requiredUniform(gl, program, "u_lit");
      const ambientColor = requiredUniform(gl, program, "u_ambientColor");
      const directionalDirection = requiredUniform(gl, program, "u_directionalDirection");
      const directionalColor = requiredUniform(gl, program, "u_directionalColor");
      const cameraPosition = requiredUniform(gl, program, "u_cameraPosition");
      const baseColorTexture = requiredUniform(gl, program, "u_baseColorTexture");
      const skinningEnabled = requiredUniform(gl, program, "u_skinningEnabled");
      const jointPalette = requiredUniform(gl, program, "u_jointPalette[0]");
      const morphWeights = requiredUniform(gl, program, "u_morphWeights");
      const shadowEnabled = requiredUniform(gl, program, "u_shadowEnabled");
      const shadowViewProjection = requiredUniform(gl, program, "u_shadowViewProjection");
      const shadowMap = requiredUniform(gl, program, "u_shadowMap");
      const shadowBias = requiredUniform(gl, program, "u_shadowBias");
      fallbackTexture = this.#createFallbackTexture();
      this.#program = program;
      this.#instanceBuffer = instanceBuffer;
      this.#viewProjectionLocation = viewProjection;
      this.#baseColorLocation = baseColor;
      this.#emissiveLocation = emissive;
      this.#metallicLocation = metallic;
      this.#roughnessLocation = roughness;
      this.#alphaCutoffLocation = alphaCutoff;
      this.#useTextureLocation = useTexture;
      this.#litLocation = lit;
      this.#ambientColorLocation = ambientColor;
      this.#directionalDirectionLocation = directionalDirection;
      this.#directionalColorLocation = directionalColor;
      this.#cameraPositionLocation = cameraPosition;
      this.#baseColorTextureLocation = baseColorTexture;
      this.#skinningEnabledLocation = skinningEnabled;
      this.#jointPaletteLocation = jointPalette;
      this.#morphWeightsLocation = morphWeights;
      this.#shadowEnabledLocation = shadowEnabled; this.#shadowViewProjectionLocation = shadowViewProjection;
      this.#shadowMapLocation = shadowMap; this.#shadowBiasLocation = shadowBias;
      this.#fallbackTexture = fallbackTexture;
      gl.useProgram(program);
      gl.uniform1i(baseColorTexture, 0);
      gl.uniform1i(skinningEnabled, 0);
      gl.uniform4f(morphWeights, 0, 0, 0, 0);
      gl.uniform1i(shadowEnabled, 0); gl.uniform1i(shadowMap, 1); gl.uniform1f(shadowBias, 0.001);
      // A disabled integer attribute must still have an integer generic value.
      // Leaving JOINTS_0 at WebGL's float generic default makes static VAOs
      // incompatible with the shader's uvec4 input and draw calls fail with
      // INVALID_OPERATION on conforming drivers.
      gl.disableVertexAttribArray(7);
      gl.vertexAttribI4ui(7, 0, 0, 0, 0);
      if (this.#shadowMapSize > 0) this.#initializeShadowResources();
      this.#meshCache.clear();
      this.#textureCache.clear();
      this.#generation += 1;
      this.#width = -1;
      this.#height = -1;
    } catch (error) {
      if (instanceBuffer) gl.deleteBuffer(instanceBuffer);
      if (fallbackTexture) gl.deleteTexture(fallbackTexture);
      if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    }
  }

  #compileShader(type: number, source: string, label: "vertex" | "fragment"): WebGLShader {
    const gl = this.#gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`WebGL2 failed to allocate the ${label} shader.`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)?.trim() || "No driver shader log was provided.";
      const message = `WebGL2 ${label} shader compile failed: ${log}\n${numberSource(source)}`;
      this.#emit("error", "shader-compile", message);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  #initializeShadowResources(): void {
    const gl = this.#gl;
    const vertex = this.#compileShader(gl.VERTEX_SHADER, shadowVertexShaderSource(this.maxJointsPerSkeleton), "vertex");
    const fragment = this.#compileShader(gl.FRAGMENT_SHADER, SHADOW_FRAGMENT_SHADER_SOURCE, "fragment");
    let program: WebGLProgram | null = null, texture: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null;
    try {
      program = gl.createProgram(); if (!program) throw new Error("WebGL2 failed to allocate the shadow program.");
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`WebGL2 shadow program link failed: ${gl.getProgramInfoLog(program)?.trim() || "no driver log"}.`);
      texture = gl.createTexture(); framebuffer = gl.createFramebuffer();
      if (!texture || !framebuffer) throw new Error("WebGL2 failed to allocate directional shadow resources.");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.#shadowMapSize, this.#shadowMapSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("WebGL2 directional shadow framebuffer is incomplete.");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.#shadowProgram = program; this.#shadowTexture = texture; this.#shadowFramebuffer = framebuffer;
      this.#shadowProgramViewProjection = requiredUniform(gl, program, "u_shadowViewProjection");
      this.#shadowProgramSkinning = requiredUniform(gl, program, "u_skinningEnabled");
      this.#shadowProgramPalette = requiredUniform(gl, program, "u_jointPalette[0]");
      this.#shadowProgramMorphWeights = requiredUniform(gl, program, "u_morphWeights");
    } catch (cause) {
      if (framebuffer) gl.deleteFramebuffer(framebuffer); if (texture) gl.deleteTexture(texture); if (program) gl.deleteProgram(program); throw cause;
    } finally { gl.deleteShader(vertex); gl.deleteShader(fragment); }
  }

  #meshRecord(handle: number, mesh: MeshGeometry3D): MeshGpuRecord3D {
    const cached = this.#meshCache.get(handle);
    if (cached?.source === mesh) return cached;
    if (cached) this.#deleteMesh(cached);
    const gl = this.#gl;
    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    if (!vao || !positionBuffer) {
      if (vao) gl.deleteVertexArray(vao);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      throw new Error(`WebGL2 failed to allocate GPU resources for mesh ${handle}.`);
    }
    let indexBuffer: WebGLBuffer | undefined;
    let normalBuffer: WebGLBuffer | undefined;
    let uvBuffer: WebGLBuffer | undefined;
    let jointBuffer: WebGLBuffer | undefined;
    let weightBuffer: WebGLBuffer | undefined;
    const morphBuffers: WebGLBuffer[] = [];
    try {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      if (mesh.indices) {
        indexBuffer = gl.createBuffer() ?? undefined;
        if (!indexBuffer) throw new Error(`WebGL2 failed to allocate the index buffer for mesh ${handle}.`);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      }
      if (mesh.normals) {
        normalBuffer = gl.createBuffer() ?? undefined;
        if (!normalBuffer) throw new Error(`WebGL2 failed to allocate the normal buffer for mesh ${handle}.`);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(5);
        gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 12, 0);
      }
      if (mesh.uvs) {
        uvBuffer = gl.createBuffer() ?? undefined;
        if (!uvBuffer) throw new Error(`WebGL2 failed to allocate the UV buffer for mesh ${handle}.`);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 8, 0);
      }
      if (mesh.joints && mesh.weights) {
        jointBuffer = gl.createBuffer() ?? undefined;
        weightBuffer = gl.createBuffer() ?? undefined;
        if (!jointBuffer || !weightBuffer) throw new Error(`WebGL2 failed to allocate skinning buffers for mesh ${handle}.`);
        gl.bindBuffer(gl.ARRAY_BUFFER, jointBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.joints, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(7);
        gl.vertexAttribIPointer(7, 4, mesh.joints instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, weightBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.weights, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(8);
        gl.vertexAttribPointer(8, 4, gl.FLOAT, false, 16, 0);
      }
      for (const [target, values] of (mesh.morphPositions ?? []).entries()) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error(`WebGL2 failed to allocate morph target ${target} for mesh ${handle}.`);
        morphBuffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(9 + target);
        gl.vertexAttribPointer(9 + target, 3, gl.FLOAT, false, 12, 0);
      }
      const record: MeshGpuRecord3D = {
        source: mesh, vao, positionBuffer, indexBuffer, normalBuffer, uvBuffer, jointBuffer, weightBuffer, morphBuffers,
        vertexCount: mesh.positions.length / 3,
        indexCount: mesh.indices?.length ?? 0,
        indexType: mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        mode: mesh.topology === "line-list" ? gl.LINES : gl.TRIANGLES,
        byteLength: mesh.positions.byteLength + (mesh.indices?.byteLength ?? 0) + (mesh.normals?.byteLength ?? 0)
          + (mesh.uvs?.byteLength ?? 0) + (mesh.joints?.byteLength ?? 0) + (mesh.weights?.byteLength ?? 0)
          + (mesh.morphPositions?.reduce((total, values) => total + values.byteLength, 0) ?? 0)
      };
      this.#meshCache.set(handle, record);
      this.stats.meshUploads += 1;
      this.stats.uploadedBytes += record.byteLength;
      return record;
    } catch (error) {
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(positionBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      if (normalBuffer) gl.deleteBuffer(normalBuffer);
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      if (jointBuffer) gl.deleteBuffer(jointBuffer);
      if (weightBuffer) gl.deleteBuffer(weightBuffer);
      for (const buffer of morphBuffers) gl.deleteBuffer(buffer);
      throw error;
    }
  }

  #bindInstanceRange(firstInstance: number): void {
    const gl = this.#gl;
    const byteOffset = firstInstance * MATRIX_BYTE_STRIDE;
    for (let column = 0; column < 4; column += 1) {
      const location = column + 1;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, MATRIX_BYTE_STRIDE, byteOffset + column * 16);
      gl.vertexAttribDivisor(location, 1);
    }
  }

  #bindMaterial(handle: number, meshHandle: number, mesh: MeshGeometry3D): void {
    const offset = handle * MATERIAL_FLOAT_STRIDE_3D;
    if (!this.scene.isMaterialActive(handle) || offset + MATERIAL_FLOAT_STRIDE_3D > this.scene.materialData.length) {
      throw new RangeError(`render command references inactive material handle ${handle}.`);
    }
    const flags = this.scene.materialFlags[handle];
    if ((flags & MATERIAL_FLAG_LIT_3D) !== 0 && !mesh.normals) {
      throw new Error(`lit material ${handle} requires normals on mesh ${meshHandle}${mesh.label ? ` (${mesh.label})` : ""}.`);
    }
    if ((flags & MATERIAL_FLAG_TEXTURED_3D) !== 0 && !mesh.uvs) {
      throw new Error(`textured material ${handle} requires UVs on mesh ${meshHandle}${mesh.label ? ` (${mesh.label})` : ""}.`);
    }
    if (handle === this.#boundMaterial) return;
    const data = this.scene.materialData;
    this.#gl.uniform4f(this.#baseColorLocation as WebGLUniformLocation, data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    this.#gl.uniform3f(this.#emissiveLocation as WebGLUniformLocation, data[offset + 4], data[offset + 5], data[offset + 6]);
    this.#gl.uniform1f(this.#metallicLocation as WebGLUniformLocation, data[offset + 7]);
    this.#gl.uniform1f(this.#roughnessLocation as WebGLUniformLocation, data[offset + 8]);
    this.#gl.uniform1f(this.#alphaCutoffLocation as WebGLUniformLocation, flags & MATERIAL_FLAG_ALPHA_MASK_3D ? data[offset + 9] : -1);
    this.#gl.uniform1i(this.#litLocation as WebGLUniformLocation, flags & MATERIAL_FLAG_LIT_3D ? 1 : 0);
    const textureHandle = this.scene.materialTextureHandles[handle];
    const textured = (flags & MATERIAL_FLAG_TEXTURED_3D) !== 0;
    this.#gl.uniform1i(this.#useTextureLocation as WebGLUniformLocation, textured ? 1 : 0);
    this.#gl.activeTexture(this.#gl.TEXTURE0);
    if (textured) {
      const texture = this.#requireTexture(textureHandle, handle);
      this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#textureRecord(textureHandle, texture).texture);
    } else this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.#fallbackTexture as WebGLTexture);
    this.stats.textureBindings += 1;
    if (flags & MATERIAL_FLAG_DOUBLE_SIDED_3D) this.#gl.disable(this.#gl.CULL_FACE);
    else this.#gl.enable(this.#gl.CULL_FACE);
    this.#boundMaterial = handle;
    this.stats.materialBindings += 1;
  }

  #bindMorphWeights(mesh: MeshGeometry3D): void {
    const weights = mesh.morphWeights;
    this.#gl.uniform4f(this.#morphWeightsLocation as WebGLUniformLocation,
      finiteComponent(weights, 0, 0, "morphWeights"), finiteComponent(weights, 1, 0, "morphWeights"),
      finiteComponent(weights, 2, 0, "morphWeights"), finiteComponent(weights, 3, 0, "morphWeights"));
  }

  #bindFrameLights(commands: RenderCommandBuffer3D): void {
    let ambientR = 0, ambientG = 0, ambientB = 0;
    let directionX = 0, directionY = -1, directionZ = 0;
    let directionalR = 0, directionalG = 0, directionalB = 0;
    let hasDirectional = false;
    for (let light = 0; light < commands.lightCount; light += 1) {
      const offset = light * 16, type = commands.lightTypes[light], intensity = commands.lightData[offset + 11];
      if (type === LIGHT_KIND_AMBIENT_3D) {
        ambientR += commands.lightData[offset + 8] * intensity;
        ambientG += commands.lightData[offset + 9] * intensity;
        ambientB += commands.lightData[offset + 10] * intensity;
        this.stats.ambientLightsUsed += 1;
      } else if (type === LIGHT_KIND_DIRECTIONAL_3D && !hasDirectional) {
        directionX = commands.lightData[offset + 4]; directionY = commands.lightData[offset + 5]; directionZ = commands.lightData[offset + 6];
        directionalR = commands.lightData[offset + 8] * intensity;
        directionalG = commands.lightData[offset + 9] * intensity;
        directionalB = commands.lightData[offset + 10] * intensity;
        hasDirectional = true;
        this.stats.directionalLightsUsed = 1;
      } else this.stats.unsupportedLights += 1;
    }
    const gl = this.#gl;
    gl.uniform3f(this.#ambientColorLocation as WebGLUniformLocation, ambientR, ambientG, ambientB);
    gl.uniform3f(this.#directionalDirectionLocation as WebGLUniformLocation, directionX, directionY, directionZ);
    gl.uniform3f(this.#directionalColorLocation as WebGLUniformLocation, directionalR, directionalG, directionalB);
  }

  #bindSkinning(
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
      if (this.#boundSkeleton !== -1) this.#gl.uniform1i(this.#skinningEnabledLocation as WebGLUniformLocation, 0);
      this.#boundSkeleton = -1;
      return;
    }
    const skeleton = commands.commandSkeletonHandles[command];
    if (!this.scene.isSkeletonActive(skeleton)) throw new Error(`render command ${command} references inactive skeleton ${skeleton}.`);
    const jointCount = this.scene.skeletonJointCounts[skeleton];
    if (jointCount > this.maxJointsPerSkeleton) {
      throw new RangeError(`skeleton ${skeleton} jointCount ${jointCount} exceeds WebGL2 palette capacity ${this.maxJointsPerSkeleton}.`);
    }
    this.#gl.uniform1i(this.#skinningEnabledLocation as WebGLUniformLocation, 1);
    if (this.#boundSkeleton === skeleton) return;
    this.#gl.uniformMatrix4fv(
      this.#jointPaletteLocation as WebGLUniformLocation,
      false,
      this.scene.skeletonMatrices,
      this.scene.skeletonMatrixOffset(skeleton),
      jointCount * 16
    );
    this.#boundSkeleton = skeleton;
    this.stats.paletteUploads += 1;
    this.stats.paletteMatrices += jointCount;
    this.stats.uploadedBytes += jointCount * 16 * Float32Array.BYTES_PER_ELEMENT;
  }

  #requireTexture(handle: number, material: number): TextureResource3D {
    try { return this.scene.getTexture(handle); }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`material ${material} references unavailable texture ${handle}: ${detail}`);
    }
  }

  #textureRecord(handle: number, source: TextureResource3D): TextureGpuRecord3D {
    const cached = this.#textureCache.get(handle);
    if (cached?.source === source) return cached;
    if (cached) this.#deleteTexture(cached);
    if (source.width > this.#maxTextureSize || source.height > this.#maxTextureSize) {
      throw new RangeError(`texture ${handle} dimensions ${source.width}x${source.height} exceed WebGL2 limit ${this.#maxTextureSize}.`);
    }
    const gl = this.#gl, texture = gl.createTexture();
    if (!texture) throw new Error(`WebGL2 failed to allocate texture ${handle}.`);
    try {
      gl.activeTexture(gl.TEXTURE0);
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
      this.#textureCache.set(handle, record);
      this.stats.textureUploads += 1;
      this.stats.uploadedBytes += source.pixels.byteLength;
      return record;
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
  }

  #createFallbackTexture(): WebGLTexture {
    const gl = this.#gl, texture = gl.createTexture();
    if (!texture) throw new Error("WebGL2 failed to allocate the fallback white texture.");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  }

  #requireMesh(handle: number, command: number): MeshGeometry3D {
    try {
      return this.scene.getMesh(handle);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`render command ${command} references unavailable mesh ${handle}: ${detail}`);
    }
  }

  #readPixelRatio(): number {
    if (typeof this.#pixelRatioSource === "function") return this.#pixelRatioSource();
    if (typeof this.#pixelRatioSource === "number") return this.#pixelRatioSource;
    return typeof globalThis.devicePixelRatio === "number" ? globalThis.devicePixelRatio : 1;
  }

  #resetFrameStats(): void {
    this.stats.drawCalls = 0; this.stats.instances = 0; this.stats.triangles = 0; this.stats.lines = 0;
    this.stats.meshUploads = 0; this.stats.materialBindings = 0; this.stats.textureUploads = 0; this.stats.textureBindings = 0;
    this.stats.ambientLightsUsed = 0; this.stats.directionalLightsUsed = 0; this.stats.unsupportedLights = 0;
    this.stats.paletteUploads = 0; this.stats.paletteMatrices = 0;
    this.stats.skinnedDrawCalls = 0; this.stats.skinnedInstances = 0;
    this.stats.shadowDrawCalls = 0;
    this.stats.uploadedBytes = 0; this.stats.contextGeneration = this.#generation;
    this.stats.contextLost = this.#contextLost; this.stats.skipped = false;
  }

  #deleteMesh(mesh: MeshGpuRecord3D): void {
    this.#gl.deleteVertexArray(mesh.vao);
    this.#gl.deleteBuffer(mesh.positionBuffer);
    if (mesh.indexBuffer) this.#gl.deleteBuffer(mesh.indexBuffer);
    if (mesh.normalBuffer) this.#gl.deleteBuffer(mesh.normalBuffer);
    if (mesh.uvBuffer) this.#gl.deleteBuffer(mesh.uvBuffer);
    if (mesh.jointBuffer) this.#gl.deleteBuffer(mesh.jointBuffer);
    if (mesh.weightBuffer) this.#gl.deleteBuffer(mesh.weightBuffer);
    for (const buffer of mesh.morphBuffers ?? []) this.#gl.deleteBuffer(buffer);
  }

  #deleteTexture(texture: TextureGpuRecord3D): void { this.#gl.deleteTexture(texture.texture); }

  #deleteGpuResources(): void {
    for (const mesh of this.#meshCache.values()) this.#deleteMesh(mesh);
    this.#meshCache.clear();
    for (const texture of this.#textureCache.values()) this.#deleteTexture(texture);
    this.#textureCache.clear();
    if (this.#instanceBuffer) this.#gl.deleteBuffer(this.#instanceBuffer);
    if (this.#program) this.#gl.deleteProgram(this.#program);
    if (this.#shadowProgram) this.#gl.deleteProgram(this.#shadowProgram);
    if (this.#shadowFramebuffer) this.#gl.deleteFramebuffer(this.#shadowFramebuffer);
    if (this.#shadowTexture) this.#gl.deleteTexture(this.#shadowTexture);
    if (this.#fallbackTexture) this.#gl.deleteTexture(this.#fallbackTexture);
    this.#program = undefined; this.#instanceBuffer = undefined;
    this.#shadowProgram = undefined; this.#shadowFramebuffer = undefined; this.#shadowTexture = undefined;
  }

  #abandonGpuResources(): void {
    this.#meshCache.clear();
    this.#textureCache.clear();
    this.#program = undefined; this.#instanceBuffer = undefined;
    this.#fallbackTexture = undefined;
    this.#shadowProgram = undefined; this.#shadowFramebuffer = undefined; this.#shadowTexture = undefined;
    this.#viewProjectionLocation = undefined; this.#baseColorLocation = undefined; this.#alphaCutoffLocation = undefined;
    this.#useTextureLocation = undefined; this.#litLocation = undefined; this.#ambientColorLocation = undefined;
    this.#directionalDirectionLocation = undefined; this.#directionalColorLocation = undefined; this.#baseColorTextureLocation = undefined;
    this.#skinningEnabledLocation = undefined; this.#jointPaletteLocation = undefined; this.#morphWeightsLocation = undefined;
    this.#shadowEnabledLocation = undefined; this.#shadowViewProjectionLocation = undefined; this.#shadowMapLocation = undefined; this.#shadowBiasLocation = undefined;
    this.#shadowProgramViewProjection = undefined; this.#shadowProgramSkinning = undefined; this.#shadowProgramPalette = undefined; this.#shadowProgramMorphWeights = undefined;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("WebGL2 renderer is disposed.");
  }

  #checkGlError(stage: string): void {
    if (!this.#validateGlErrors) return;
    const code = this.#gl.getError();
    if (code !== this.#gl.NO_ERROR) throw new Error(`WebGL2 error 0x${code.toString(16)} after ${stage}.`);
  }

  #emit(level: WebGl2DiagnosticLevel3D, code: WebGl2Diagnostic3D["code"], message: string): void {
    this.#onDiagnostic?.({ level, code, message });
  }
}

const MATRIX_BYTE_STRIDE = 16 * Float32Array.BYTES_PER_ELEMENT;

export function createWebGl2Renderer3D(options: WebGl2RendererOptions3D): WebGl2Renderer3D {
  return new WebGl2Renderer3D(options);
}

export function supportsWebGl2Renderer3D(canvas?: HTMLCanvasElement): boolean {
  if (canvas) return Boolean(canvas.getContext("webgl2"));
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas");
  return Boolean(probe.getContext("webgl2"));
}

function requiredUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (location === null) throw new Error(`WebGL2 basic material program is missing required uniform ${name}.`);
  return location;
}

function validateCommands(commands: RenderCommandBuffer3D, maxInstances: number): void {
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
