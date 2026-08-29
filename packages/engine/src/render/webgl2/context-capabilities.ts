const REQUIRED_WEBGL2_METHODS = [
  "activeTexture", "attachShader", "bindBuffer", "bindFramebuffer", "bindTexture", "bindVertexArray", "bufferData", "bufferSubData",
  "checkFramebufferStatus", "clear", "clearColor", "clearDepth", "colorMask", "compileShader", "createBuffer", "createFramebuffer",
  "createProgram", "createShader", "createTexture", "createVertexArray", "cullFace", "deleteBuffer", "deleteFramebuffer", "deleteProgram",
  "deleteShader", "deleteTexture", "deleteVertexArray", "depthFunc", "depthMask", "disable", "disableVertexAttribArray", "drawArraysInstanced",
  "drawBuffers", "drawElementsInstanced", "enable", "enableVertexAttribArray", "framebufferTexture2D", "frontFace", "generateMipmap", "getError",
  "getParameter", "getProgramInfoLog", "getProgramParameter", "getShaderInfoLog", "getShaderParameter", "getUniformLocation", "isContextLost",
  "linkProgram", "pixelStorei", "readBuffer", "shaderSource", "texImage2D", "texParameteri", "uniform1f", "uniform1i", "uniform3f",
  "uniform4f", "uniformMatrix4fv", "useProgram", "vertexAttribDivisor", "vertexAttribI4ui", "vertexAttribIPointer", "vertexAttribPointer", "viewport",
] as const;

const REQUIRED_WEBGL2_CONSTANTS = [
  "ARRAY_BUFFER", "BACK", "BLEND", "CCW", "CLAMP_TO_EDGE", "COLOR_BUFFER_BIT", "COMPARE_REF_TO_TEXTURE", "COMPILE_STATUS", "CULL_FACE",
  "DEPTH_ATTACHMENT", "DEPTH_BUFFER_BIT", "DEPTH_COMPONENT", "DEPTH_COMPONENT24", "DEPTH_TEST", "DYNAMIC_DRAW", "ELEMENT_ARRAY_BUFFER", "FLOAT",
  "FRAGMENT_SHADER", "FRAMEBUFFER", "FRAMEBUFFER_COMPLETE", "LEQUAL", "LINEAR", "LINEAR_MIPMAP_LINEAR", "LINES", "LINK_STATUS", "MAX_TEXTURE_SIZE",
  "MAX_VERTEX_UNIFORM_VECTORS", "NEAREST", "NONE", "NO_ERROR", "REPEAT", "RGBA", "RGBA8", "STATIC_DRAW", "TEXTURE_2D",
  "TEXTURE_COMPARE_FUNC", "TEXTURE_COMPARE_MODE", "TEXTURE_MAG_FILTER", "TEXTURE_MIN_FILTER", "TEXTURE_WRAP_S", "TEXTURE_WRAP_T", "TEXTURE0",
  "TRIANGLES", "UNPACK_ALIGNMENT", "UNPACK_FLIP_Y_WEBGL", "UNSIGNED_BYTE", "UNSIGNED_INT", "UNSIGNED_SHORT", "VERTEX_SHADER",
] as const;

export function isWebGl2Context(value: unknown): value is WebGL2RenderingContext {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false;
  for (const name of REQUIRED_WEBGL2_METHODS) if (typeof Reflect.get(value, name) !== "function") return false;
  for (const name of REQUIRED_WEBGL2_CONSTANTS) if (typeof Reflect.get(value, name) !== "number") return false;
  return true;
}
