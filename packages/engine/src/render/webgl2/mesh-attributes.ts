/** The mesh upload owns buffer allocation and rollback; this only binds its data. */
export function uploadFloatMeshAttribute3D(gl: WebGL2RenderingContext, buffer: WebGLBuffer, values: Float32Array, location: number, components: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, components, gl.FLOAT, false, components * Float32Array.BYTES_PER_ELEMENT, 0);
}
import type { MeshGpuRecord3D } from "./renderer-support.ts";


/** Releases the upload's resources in allocation-owner order, including rollback. */
export function deleteMeshResources3D(gl: WebGL2RenderingContext, mesh: Pick<MeshGpuRecord3D, "vao" | "positionBuffer" | "edgeBuffer" | "indexBuffer" | "normalBuffer" | "uvBuffer" | "jointBuffer" | "weightBuffer" | "morphBuffers">): void {
  gl.deleteVertexArray(mesh.vao);
  gl.deleteBuffer(mesh.positionBuffer);
  if (mesh.edgeBuffer) gl.deleteBuffer(mesh.edgeBuffer);
  if (mesh.indexBuffer) gl.deleteBuffer(mesh.indexBuffer);
  if (mesh.normalBuffer) gl.deleteBuffer(mesh.normalBuffer);
  if (mesh.uvBuffer) gl.deleteBuffer(mesh.uvBuffer);
  if (mesh.jointBuffer) gl.deleteBuffer(mesh.jointBuffer);
  if (mesh.weightBuffer) gl.deleteBuffer(mesh.weightBuffer);
  for (const buffer of mesh.morphBuffers ?? []) gl.deleteBuffer(buffer);
}
