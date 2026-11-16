import type { RenderCommandBuffer3D } from '../3d-scene.ts';
import type { MainGpuResources3D } from './renderer-support.ts';

export function uploadInstanceAppearance3D(gl: WebGL2RenderingContext, resources: MainGpuResources3D, commands: RenderCommandBuffer3D) {
  if (!commands.instanceAppearance) return 0;
  if (!resources.appearanceBuffer) {
    resources.appearanceBuffer = gl.createBuffer() ?? undefined;
    if (!resources.appearanceBuffer) throw new Error('Unable to allocate bounded instance appearance buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.appearanceBuffer);gl.bufferData(gl.ARRAY_BUFFER, commands.instanceAppearance.byteLength, gl.DYNAMIC_DRAW);
    resources.appearanceBytes = commands.instanceAppearance.byteLength;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.appearanceBuffer);
  if (commands.instanceAppearance.byteLength > resources.appearanceBytes!) { gl.bufferData(gl.ARRAY_BUFFER, commands.instanceAppearance.byteLength, gl.DYNAMIC_DRAW);resources.appearanceBytes = commands.instanceAppearance.byteLength; }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, commands.instanceAppearance, 0, commands.instanceCount * 8);
  return commands.instanceCount * 32;
}
export function bindInstanceAppearance3D(gl: WebGL2RenderingContext, buffer: WebGLBuffer | undefined, first: number, enabled: boolean) {
  if (buffer && enabled) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(13 + i);gl.vertexAttribPointer(13 + i, 4, gl.FLOAT, false, 32, first * 32 + i * 16);gl.vertexAttribDivisor(13 + i, 1); }
  } else { gl.disableVertexAttribArray(13);gl.disableVertexAttribArray(14); }
}
