import { requiredUniform } from "./renderer-support.ts";

/** Compares packed values with the same signed-zero/NaN policy as material binding. */
export function materialDataChanged3D(data: Float32Array, offset: number, previous: number, start: number, length = 1): boolean {
  if (previous < 0) return true;
  for (let index = start; index < start + length; index += 1) if (!Object.is(data[offset + index], data[previous + index])) return true;
  return false;
}

export function requireMaterialUniforms3D(gl: WebGL2RenderingContext, program: WebGLProgram) {
  return {
    baseColor: requiredUniform(gl, program, "u_baseColor"), emissive: requiredUniform(gl, program, "u_emissive"),
    cutaway: requiredUniform(gl, program, "u_cutaway"),
    metallic: requiredUniform(gl, program, "u_metallic"), roughness: requiredUniform(gl, program, "u_roughness"),
    uvTransform: requiredUniform(gl, program, "u_uvTransform"), uvRotation: requiredUniform(gl, program, "u_uvRotation"), shaderStyle: requiredUniform(gl, program, "u_shaderStyle"),
    toonBands: requiredUniform(gl, program, "u_toonBands"), toonShadowColor: requiredUniform(gl, program, "u_toonShadowColor"),
    toonRimColor: requiredUniform(gl, program, "u_toonRimColor"), toonRimStrength: requiredUniform(gl, program, "u_toonRimStrength"),
    outlinePass: requiredUniform(gl, program, "u_outlinePass"), outlineWidth: requiredUniform(gl, program, "u_outlineWidth"), outlineColor: requiredUniform(gl, program, "u_outlineColor"),
    alphaCutoff: requiredUniform(gl, program, "u_alphaCutoff"), useTexture: requiredUniform(gl, program, "u_useTexture"), lit: requiredUniform(gl, program, "u_lit"),
    baseColorTexture: requiredUniform(gl, program, "u_baseColorTexture"), metallicRoughnessTexture: requiredUniform(gl, program, "u_metallicRoughnessTexture"),
    normalTexture: requiredUniform(gl, program, "u_normalTexture"), occlusionTexture: requiredUniform(gl, program, "u_occlusionTexture"),
    emissiveTexture: requiredUniform(gl, program, "u_emissiveTexture"), textureMapFlags: requiredUniform(gl, program, "u_textureMapFlags"),
  };
}

export function initializeMaterialSamplers3D(gl: WebGL2RenderingContext, uniforms: ReturnType<typeof requireMaterialUniforms3D>): void {
  gl.uniform1i(uniforms.baseColorTexture, 0); gl.uniform1i(uniforms.metallicRoughnessTexture, 2); gl.uniform1i(uniforms.normalTexture, 3);
  gl.uniform1i(uniforms.occlusionTexture, 4); gl.uniform1i(uniforms.emissiveTexture, 5);
}
