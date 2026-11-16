// Shared GPU-call fixture for native tests and installed-package consumers.
export function createFakeWebGl2() {
  const VERTEX_SHADER = 0x8b31;
  const MAX_TEXTURE_SIZE = 0x0d33;
  const MAX_VERTEX_UNIFORM_VECTORS = 0x8dfb;
  const FRAMEBUFFER_COMPLETE = 0x8cd5;
  let failVertexCompile = false;
  let failFragmentCompile = false;
  let failLink = false;
  let contextLost = false;
  let maxVertexUniformVectors = 256;
  let nextId = 1;
  let boundVertexArray: unknown;
  const matrixAttributes: Array<{ vao: unknown; kind: string; args: number[] }> = [];
  const drawArraysCalls: unknown[][] = [];
  const drawElementsCalls: unknown[][] = [];
  const bufferDataCalls: Array<{ target: number; bytes: number; usage: number }> = [];
  const bufferSubDataCalls: unknown[][] = [];
  const viewportCalls: unknown[][] = [];
  const enabled: number[] = [];
  const disabled: number[] = [];
  const polygonOffsets: number[][] = [], drawPolygonOffsets: boolean[] = [];
  let polygonOffsetEnabled = false;
  const deletedBuffers: unknown[] = [];
  const deletedPrograms: unknown[] = [];
  const deletedVertexArrays: unknown[] = [];
  const deletedTextures: unknown[] = [];
  const framebufferBinds: unknown[][] = [];
  const textureUploads: unknown[][] = [];
  const textureParameters: unknown[][] = [];
  const uniform1iCalls: unknown[][] = [];
  const uniform1fCalls: unknown[][] = [];
  const uniform3fCalls: unknown[][] = [];
  const uniform4fCalls: unknown[][] = [];
  const uniformMatrixCalls: unknown[][] = [];
  const vertexAttribIPointerCalls: unknown[][] = [];
  const shaderTypes = new Map<object, number>();
  let blendFactors = [1, 0, 1, 0];
  return {
    ZERO: 0, ONE: 1, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
    get blendFactors() { return blendFactors; },
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4, DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406, UNSIGNED_SHORT: 0x1403, UNSIGNED_INT: 0x1405, TRIANGLES: 0x0004, LINES: 0x0001,
    VERTEX_SHADER, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    DEPTH_TEST: 0x0b71, LEQUAL: 0x0203, BLEND: 0x0be2, CULL_FACE: 0x0b44, FRONT: 0x0404, BACK: 0x0405, CCW: 0x0901,
    POLYGON_OFFSET_FILL: 0x8037,
    COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100, NO_ERROR: 0,
    MAX_TEXTURE_SIZE, MAX_VERTEX_UNIFORM_VECTORS, TEXTURE0: 0x84c0, TEXTURE_2D: 0x0de1,
    RGBA8: 0x8058, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, NEAREST: 0x2600, LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, REPEAT: 0x2901, CLAMP_TO_EDGE: 0x812f,
    UNPACK_ALIGNMENT: 0x0cf5, UNPACK_FLIP_Y_WEBGL: 0x9240, FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE, DEPTH_ATTACHMENT: 0x8d00, DEPTH_COMPONENT24: 0x81a6, DEPTH_COMPONENT: 0x1902,
    NONE: 0, TEXTURE_COMPARE_MODE: 0x884c, TEXTURE_COMPARE_FUNC: 0x884d, COMPARE_REF_TO_TEXTURE: 0x884e,
    get failVertexCompile() { return failVertexCompile; }, set failVertexCompile(value: boolean) { failVertexCompile = value; },
    get failFragmentCompile() { return failFragmentCompile; }, set failFragmentCompile(value: boolean) { failFragmentCompile = value; },
    get failLink() { return failLink; }, set failLink(value: boolean) { failLink = value; },
    get contextLost() { return contextLost; }, set contextLost(value: boolean) { contextLost = value; },
    get maxVertexUniformVectors() { return maxVertexUniformVectors; },
    set maxVertexUniformVectors(value: number) { maxVertexUniformVectors = value; },
    drawArraysCalls, drawElementsCalls, bufferDataCalls, bufferSubDataCalls, viewportCalls, enabled, disabled,
    polygonOffsets, drawPolygonOffsets,
    deletedBuffers, deletedPrograms, deletedVertexArrays, deletedTextures, framebufferBinds, textureUploads, textureParameters,
    uniform1iCalls, uniform1fCalls, uniform3fCalls, uniform4fCalls, uniformMatrixCalls, vertexAttribIPointerCalls, matrixAttributes,
    createShader(type: number) { const value = { id: nextId++ }; shaderTypes.set(value, type); return value; },
    shaderSource() {}, compileShader() {},
    getShaderParameter(shader: object) { return shaderTypes.get(shader) === VERTEX_SHADER ? !failVertexCompile : !failFragmentCompile; },
    getShaderInfoLog(shader: object) { return shaderTypes.get(shader) === VERTEX_SHADER ? "vertex driver log" : "fragment driver log"; },
    deleteShader() {}, createProgram() { return { id: nextId++ }; }, attachShader() {}, linkProgram() {},
    getProgramParameter() { return !failLink; }, getProgramInfoLog() { return "link driver log"; },
    deleteProgram(program: unknown) { deletedPrograms.push(program); },
    getUniformLocation(_program: unknown, name: string) { return { name }; },
    getParameter(parameter: number) {
      if (parameter === MAX_TEXTURE_SIZE) return 4_096;
      if (parameter === MAX_VERTEX_UNIFORM_VECTORS) return maxVertexUniformVectors;
      return 0;
    },
    createBuffer() { return { id: nextId++ }; }, deleteBuffer(buffer: unknown) { deletedBuffers.push(buffer); }, bindBuffer() {},
    bufferData(target: number, sourceOrSize: ArrayBufferView | number, usage: number) {
      bufferDataCalls.push({ target, bytes: typeof sourceOrSize === "number" ? sourceOrSize : sourceOrSize.byteLength, usage });
    },
    bufferSubData(...args: unknown[]) { bufferSubDataCalls.push(args); },
    createVertexArray() { return { id: nextId++ }; }, deleteVertexArray(vao: unknown) { deletedVertexArrays.push(vao); },
    bindVertexArray(vao: unknown) { boundVertexArray = vao; },
    enableVertexAttribArray(location: number) { if (location >= 1 && location <= 4) matrixAttributes.push({ vao: boundVertexArray, kind: 'enable', args: [location] }); },
    disableVertexAttribArray() {},
    vertexAttribPointer(location: number, size: number, type: number, normalized: boolean, stride: number, offset: number) { if (location >= 1 && location <= 4) matrixAttributes.push({ vao: boundVertexArray, kind: 'pointer', args: [location, size, type, Number(normalized), stride, offset] }); },
    vertexAttribIPointer(...args: unknown[]) { vertexAttribIPointerCalls.push(args); }, vertexAttribI4ui() {},
    vertexAttribDivisor(location: number, divisor: number) { if (location >= 1 && location <= 4) matrixAttributes.push({ vao: boundVertexArray, kind: 'divisor', args: [location, divisor] }); }, useProgram() {},
    enable(value: number) { enabled.push(value); if (value === 0x8037) polygonOffsetEnabled = true; }, disable(value: number) { disabled.push(value); if (value === 0x8037) polygonOffsetEnabled = false; },
    polygonOffset(factor: number, units: number) { polygonOffsets.push([factor, units]); },
    depthFunc() {}, depthMask() {}, blendFunc(source: number, destination: number) { blendFactors = [source, destination, source, destination]; },
    blendFuncSeparate(...factors: number[]) { blendFactors = factors; }, cullFace() {}, frontFace() {}, clearColor() {}, clearDepth() {}, clear() {},
    uniformMatrix4fv(...args: unknown[]) { uniformMatrixCalls.push(args); }, uniform4f(...args: unknown[]) { uniform4fCalls.push(args); },
    uniform1f(...args: unknown[]) { uniform1fCalls.push(args); }, uniform1i(...args: unknown[]) { uniform1iCalls.push(args); },
    uniform3f(...args: unknown[]) { uniform3fCalls.push(args); }, uniform3fv(..._args: unknown[]) {}, uniform4fv(..._args: unknown[]) {}, createTexture() { return { id: nextId++ }; },
    deleteTexture(texture: unknown) { deletedTextures.push(texture); }, activeTexture(_unit: number) {}, bindTexture(_target: number, _texture: unknown) {}, pixelStorei() {},
    texImage2D(...args: unknown[]) { textureUploads.push(args); }, texParameteri(...args: unknown[]) { textureParameters.push(args); }, generateMipmap() {},
    createFramebuffer() { return { id: nextId++ }; }, deleteFramebuffer() {}, bindFramebuffer(...args: unknown[]) { framebufferBinds.push(args); },
    framebufferTexture2D() {}, drawBuffers() {}, readBuffer() {}, checkFramebufferStatus() { return FRAMEBUFFER_COMPLETE; }, colorMask() {},
    drawArraysInstanced(...args: unknown[]) { drawArraysCalls.push(args); drawPolygonOffsets.push(polygonOffsetEnabled); }, drawElementsInstanced(...args: unknown[]) { drawElementsCalls.push(args); drawPolygonOffsets.push(polygonOffsetEnabled); },
    viewport(...args: unknown[]) { viewportCalls.push(args); }, isContextLost() { return contextLost; }, getError() { return 0; },
  };
}

export function createFakeCanvas(gl: FakeWebGl2) {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  return {
    width: 1,
    height: 1,
    clientWidth: 100,
    clientHeight: 50,
    gl,
    listeners,
    getContext(kind: string) { return kind === "webgl2" ? gl : null; },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      let scoped = listeners.get(type);
      if (!scoped) { scoped = new Set(); listeners.set(type, scoped); }
      scoped.add(listener);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { listeners.get(type)?.delete(listener); },
    dispatch(type: string) {
      const event = new Event(type, { cancelable: true });
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
      return event.defaultPrevented;
    },
  };
}

type FakeWebGl2 = ReturnType<typeof createFakeWebGl2>;
