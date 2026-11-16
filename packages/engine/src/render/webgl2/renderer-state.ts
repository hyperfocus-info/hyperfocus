import type { BoundedScene3D, MeshGeometry3D, RenderCommandBuffer3D, TextureResource3D } from '../3d-scene.ts';
import type { WebGl2Canvas3D, WebGl2Diagnostic3D, WebGl2DiagnosticLevel3D, WebGl2Renderer3D, WebGl2RenderOptions3D } from '../3d-webgl2.ts';
import type { createCommandViews3D } from './command-views.ts';
import type { createFrameLighting } from './lighting.ts';
import type { MainGpuResources3D, MeshGpuRecord3D, ShadowGpuResources3D, TextureGpuRecord3D, WebGl2FrameStats3D } from './renderer-support.ts';

export type WebGl2RendererFields3D = {
  canvas: WebGl2Canvas3D;
  scene: BoundedScene3D;
  maxInstances: number;
  maxJointsPerSkeleton: number;
  stats: WebGl2FrameStats3D;
  gl: WebGL2RenderingContext;
  clearColor: Float32Array;
  frameLighting: ReturnType<typeof createFrameLighting>;
  pixelRatioSource: number | (() => number) | undefined;
  maxDevicePixelRatio: number;
  maxWidth: number;
  maxHeight: number;
  maxTextureSize: number;
  shadowMapSize: number;
  onDiagnostic: ((diagnostic: WebGl2Diagnostic3D) => void) | undefined;
  validateGlErrors: boolean;
  cameraCulling: boolean;
  features: WebGl2RenderOptions3D['features'];
  commandViews: ReturnType<typeof createCommandViews3D> | undefined;
  meshCache: Map<number, MeshGpuRecord3D>;
  textureCache: Map<number, TextureGpuRecord3D>;
  mainResources: MainGpuResources3D | undefined;
  shadowResources: ShadowGpuResources3D | undefined;
  contextLost: boolean;
  disposed: boolean;
  generation: number;
  width: number;
  height: number;
  pixelRatio: number;
  boundMaterial: number;
  boundSkeleton: number;
  handleContextLost(event: Event): void;
  handleContextRestored(): void;
};
type WebGl2RendererPrivateMethods3D = {
  renderShadowPass(commands: RenderCommandBuffer3D, viewProjection: Float32Array): void;
  renderOutlinePass(commands: RenderCommandBuffer3D): void;
  initializeGpuResources(): void;
  compileShader(type: number, source: string, label: "vertex" | "fragment"): WebGLShader;
  initializeShadowResources(): ShadowGpuResources3D;
  meshRecord(handle: number, mesh: MeshGeometry3D): MeshGpuRecord3D;
  bindInstanceRange(firstInstance: number, mesh: MeshGpuRecord3D): void;
  bindMaterial(handle: number, meshHandle: number, mesh: MeshGeometry3D): void;
  bindMorphWeights(mesh: MeshGeometry3D): void;
  bindFrameLights(commands: RenderCommandBuffer3D): void;
  bindSkinning(
    commands: RenderCommandBuffer3D,
    command: number,
    meshHandle: number,
    mesh: MeshGeometry3D,
    materialHandle: number
  ): void;
  requireTexture(handle: number, material: number): TextureResource3D;
  textureRecord(handle: number, source: TextureResource3D): TextureGpuRecord3D;
  requireMesh(handle: number, command: number): MeshGeometry3D;
  readPixelRatio(): number;
  resetFrameStats(): void;
  deleteMesh(mesh: MeshGpuRecord3D): void;
  deleteTexture(texture: TextureGpuRecord3D): void;
  deleteGpuResources(): void;
  abandonGpuResources(): void;
  requireMainResources(): MainGpuResources3D;
  requireShadowResources(): ShadowGpuResources3D;
  assertUsable(): void;
  checkGlError(stage: string): void;
  emit(level: WebGl2DiagnosticLevel3D, code: WebGl2Diagnostic3D["code"], message: string): void;
};
export type InternalWebGl2Renderer3D = WebGl2Renderer3D & WebGl2RendererFields3D & WebGl2RendererPrivateMethods3D;
