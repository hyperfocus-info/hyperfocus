import { LIGHT_KIND_AMBIENT_3D, LIGHT_KIND_DIRECTIONAL_3D, LIGHT_KIND_POINT_3D, type RenderCommandBuffer3D } from '../3d-scene.ts';
import { requiredUniform, type WebGl2FrameStats3D } from './renderer-support.ts';

export const WEBGL2_POINT_LIGHT_LIMIT = 8;

export function requirePointLightUniforms(gl: WebGL2RenderingContext, program: WebGLProgram) {
  return { pointCount: requiredUniform(gl, program, 'u_pointCount'), pointPositions: requiredUniform(gl, program, 'u_pointPositions[0]'), pointColors: requiredUniform(gl, program, 'u_pointColors[0]') };
}

export function createFrameLighting() {
  const directions = new Float32Array(6), colors = new Float32Array(6);
  const points = new Float32Array(WEBGL2_POINT_LIGHT_LIMIT * 4), pointColors = new Float32Array(WEBGL2_POINT_LIGHT_LIMIT * 3);
  return { bind(gl: WebGL2RenderingContext, resources: ReturnType<typeof requirePointLightUniforms> & {
    ambientColor: WebGLUniformLocation; directionalDirection0: WebGLUniformLocation; directionalColor0: WebGLUniformLocation;
    directionalDirection1: WebGLUniformLocation; directionalColor1: WebGLUniformLocation; directionalCount: WebGLUniformLocation;
  }, commands: RenderCommandBuffer3D, stats: WebGl2FrameStats3D) {
    let ambientR = 0, ambientG = 0, ambientB = 0, directionalCount = 0, pointCount = 0;
    stats.ambientLightsUsed = 0; stats.unsupportedLights = 0;
    directions.fill(0); colors.fill(0); points.fill(0); pointColors.fill(0);
    for (let light = 0; light < commands.lightCount; light += 1) {
      const offset = light * 16, type = commands.lightTypes[light], intensity = commands.lightData[offset + 11]!;
      if (type === LIGHT_KIND_AMBIENT_3D) {
        ambientR += commands.lightData[offset + 8]! * intensity; ambientG += commands.lightData[offset + 9]! * intensity; ambientB += commands.lightData[offset + 10]! * intensity; stats.ambientLightsUsed += 1;
      } else if (type === LIGHT_KIND_DIRECTIONAL_3D && directionalCount < 2) {
        const target = directionalCount * 3;
        for (let axis = 0; axis < 3; axis++) { directions[target + axis] = commands.lightData[offset + 4 + axis]!; colors[target + axis] = commands.lightData[offset + 8 + axis]! * intensity; }
        directionalCount += 1;
      } else if (type === LIGHT_KIND_POINT_3D && pointCount < WEBGL2_POINT_LIGHT_LIMIT) {
        for (let axis = 0; axis < 3; axis++) { points[pointCount * 4 + axis] = commands.lightData[offset + axis]!; pointColors[pointCount * 3 + axis] = commands.lightData[offset + 8 + axis]! * intensity; }
        points[pointCount * 4 + 3] = commands.lightData[offset + 3]!; pointCount += 1;
      } else stats.unsupportedLights += 1;
    }
    stats.directionalLightsUsed = directionalCount; stats.pointLightsUsed = pointCount;
    gl.uniform3f(resources.ambientColor, ambientR, ambientG, ambientB);
    gl.uniform3f(resources.directionalDirection0, directions[0]!, directions[1]!, directions[2]!); gl.uniform3f(resources.directionalColor0, colors[0]!, colors[1]!, colors[2]!);
    gl.uniform3f(resources.directionalDirection1, directions[3]!, directions[4]!, directions[5]!); gl.uniform3f(resources.directionalColor1, colors[3]!, colors[4]!, colors[5]!);
    gl.uniform1i(resources.directionalCount, directionalCount); gl.uniform1i(resources.pointCount, pointCount);
    gl.uniform4fv(resources.pointPositions, points); gl.uniform3fv(resources.pointColors, pointColors);
  } };
}
