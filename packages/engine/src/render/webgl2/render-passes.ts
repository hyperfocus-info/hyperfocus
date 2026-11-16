import {
  MATERIAL_FLAG_SHADER_TOON_3D,
  MATERIAL_FLAG_ALPHA_BLEND_3D,
  MATERIAL_FLOAT_STRIDE_3D,
  RENDER_COMMAND_FLAG_SKINNED_3D,
  type BoundedScene3D,
  type MeshGeometry3D,
  type RenderCommandBuffer3D,
} from "../3d-scene.ts";
import { finiteComponent, type MainGpuResources3D, type MeshGpuRecord3D, type ShadowGpuResources3D, type WebGl2FrameStats3D } from "./renderer-support.ts";

export type WebGl2RenderPassHost3D = {
  gl: WebGL2RenderingContext;
  scene: BoundedScene3D;
  stats: WebGl2FrameStats3D;
  shadowMapSize: number;
  boundMaterial: number;
  boundSkeleton: number;
  requireMainResources(): MainGpuResources3D;
  requireShadowResources(): ShadowGpuResources3D;
  requireMesh(handle: number, command: number): MeshGeometry3D;
  meshRecord(handle: number, mesh: MeshGeometry3D): MeshGpuRecord3D;
  bindInstanceRange(firstInstance: number, mesh: MeshGpuRecord3D): void;
  bindMaterial(handle: number, meshHandle: number, mesh: MeshGeometry3D): void;
  bindMorphWeights(mesh: MeshGeometry3D): void;
  bindSkinning(commands: RenderCommandBuffer3D, command: number, meshHandle: number, mesh: MeshGeometry3D, materialHandle: number): void;
};

export function renderDirectionalShadowPass3D(host: WebGl2RenderPassHost3D, commands: RenderCommandBuffer3D, viewProjection: Float32Array): void {
  const gl = host.gl, resources = host.requireShadowResources(), mainResources = host.requireMainResources();
  gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer); gl.viewport(0, 0, host.shadowMapSize, host.shadowMapSize);
  gl.colorMask(false, false, false, false); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.useProgram(resources.program);
  gl.uniformMatrix4fv(resources.viewProjection, false, viewProjection);
  // Steep receivers need a slope-scaled depth offset; a large constant sampling
  // bias would instead detach contact shadows from horizontal floors.
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2);
  let boundSkeleton = -2;
  try {
  for (let command = 0; command < commands.commandCount; command += 1) {
    const count = commands.commandInstanceCounts[command]; if (count === 0) continue;
    const opacity = host.scene.materialData[commands.commandMaterialHandles[command]! * MATERIAL_FLOAT_STRIDE_3D + 3]!;
    if (opacity <= 0) continue;
    gl.uniform1f(resources.opacity, opacity);
    const meshHandle = commands.commandMeshHandles[command], mesh = host.requireMesh(meshHandle, command), weights = mesh.morphWeights;
    gl.uniform4f(resources.morphWeights, finiteComponent(weights, 0, 0, "morphWeights"), finiteComponent(weights, 1, 0, "morphWeights"), finiteComponent(weights, 2, 0, "morphWeights"), finiteComponent(weights, 3, 0, "morphWeights"));
    const skeleton = commands.commandSkeletonHandles[command];
    if ((commands.commandFlags[command] & RENDER_COMMAND_FLAG_SKINNED_3D) !== 0) {
      gl.uniform1i(resources.skinningEnabled, 1);
      if (boundSkeleton !== skeleton) { const jointCount = host.scene.skeletonJointCounts[skeleton]; gl.uniformMatrix4fv(resources.jointPalette, false, host.scene.skeletonMatrices, host.scene.skeletonMatrixOffset(skeleton), jointCount * 16); boundSkeleton = skeleton; }
    } else { gl.uniform1i(resources.skinningEnabled, 0); boundSkeleton = -1; }
    const gpu = host.meshRecord(meshHandle, mesh); gl.bindVertexArray(gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, mainResources.instanceBuffer); host.bindInstanceRange(commands.commandFirstInstances[command], gpu);
    if (gpu.indexBuffer) gl.drawElementsInstanced(gpu.mode, gpu.indexCount, gpu.indexType, 0, count); else gl.drawArraysInstanced(gpu.mode, 0, gpu.vertexCount, count);
    host.stats.shadowDrawCalls += 1;
  }
  } finally { gl.disable(gl.POLYGON_OFFSET_FILL); }
}

export function renderToonOutlinePass3D(host: WebGl2RenderPassHost3D, commands: RenderCommandBuffer3D): void {
  const gl = host.gl, resources = host.requireMainResources();
  gl.uniform1i(resources.outlinePass, 1); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.disable(gl.BLEND); gl.depthMask(true);
  host.boundMaterial = -1; host.boundSkeleton = -2;
  for (let command = 0; command < commands.commandCount; command += 1) {
    const count = commands.commandInstanceCounts[command]; if (count === 0) continue;
    const material = commands.commandMaterialHandles[command], offset = material * MATERIAL_FLOAT_STRIDE_3D;
    if ((host.scene.materialFlags[material] & MATERIAL_FLAG_SHADER_TOON_3D) === 0 || host.scene.materialData[offset + 23] <= 0) continue;
    // An inverted hull writes the whole back face, not just its visible rim.
    // Transparent surfaces must not install an opaque depth mask before drawing
    // the scene behind them. Authored line geometry can retain collision edges.
    if (host.scene.materialFlags[material] & MATERIAL_FLAG_ALPHA_BLEND_3D) continue;
    const meshHandle = commands.commandMeshHandles[command], mesh = host.requireMesh(meshHandle, command);
    if (!mesh.normals) throw new Error(`outlined toon material ${material} requires normals on mesh ${meshHandle}${mesh.label ? ` (${mesh.label})` : ""}.`);
    host.bindMaterial(material, meshHandle, mesh); gl.uniform1i(resources.outlinePass, 1); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.disable(gl.BLEND); gl.depthMask(true);
    host.bindMorphWeights(mesh); host.bindSkinning(commands, command, meshHandle, mesh, material);
    const gpu = host.meshRecord(meshHandle, mesh); if (gpu.mode === gl.LINES) continue;
    gl.bindVertexArray(gpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, resources.instanceBuffer); host.bindInstanceRange(commands.commandFirstInstances[command], gpu);
    if (gpu.indexBuffer) gl.drawElementsInstanced(gpu.mode, gpu.indexCount, gpu.indexType, 0, count); else gl.drawArraysInstanced(gpu.mode, 0, gpu.vertexCount, count);
    host.stats.outlineDrawCalls += 1; host.stats.drawCalls += 1; host.stats.instances += count;
    host.stats.triangles += (gpu.indexBuffer ? gpu.indexCount : gpu.vertexCount) / 3 * count;
  }
}
