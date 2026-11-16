type CaptureContext = Pick<WebGL2RenderingContext, 'getParameter' | 'isEnabled'>;
type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
const methods = ['activeTexture', 'attachShader', 'bindBuffer', 'bindBufferBase', 'bindBufferRange', 'bindFramebuffer', 'bindRenderbuffer', 'bindSampler', 'bindTexture', 'bindVertexArray',
  'blendColor', 'blendEquation', 'blendEquationSeparate', 'blendFunc', 'blendFuncSeparate', 'blitFramebuffer', 'bufferData', 'bufferSubData', 'clear', 'clearColor', 'clearDepth', 'clearStencil', 'colorMask', 'cullFace',
  'depthFunc', 'depthMask', 'depthRange', 'disable', 'drawArrays', 'drawArraysInstanced', 'drawBuffers', 'drawElements', 'drawElementsInstanced', 'enable', 'enableVertexAttribArray', 'disableVertexAttribArray',
  'framebufferRenderbuffer', 'framebufferTexture2D', 'frontFace', 'generateMipmap', 'pixelStorei', 'polygonOffset', 'renderbufferStorage', 'renderbufferStorageMultisample', 'sampleCoverage', 'scissor',
  'stencilFunc', 'stencilFuncSeparate', 'stencilMask', 'stencilMaskSeparate', 'stencilOp', 'stencilOpSeparate', 'texImage2D', 'texSubImage2D', 'texParameteri', 'texParameterf', 'texStorage2D',
  'uniform1f', 'uniform1fv', 'uniform1i', 'uniform1iv', 'uniform2f', 'uniform2fv', 'uniform3f', 'uniform3fv', 'uniform4f', 'uniform4fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
  'useProgram', 'vertexAttribDivisor', 'vertexAttribPointer', 'vertexAttribIPointer', 'vertexAttrib4f', 'viewport'] as const;
const parameters = ['CURRENT_PROGRAM', 'VERTEX_ARRAY_BINDING', 'ARRAY_BUFFER_BINDING', 'ELEMENT_ARRAY_BUFFER_BINDING', 'DRAW_FRAMEBUFFER_BINDING', 'READ_FRAMEBUFFER_BINDING',
  'ACTIVE_TEXTURE', 'TEXTURE_BINDING_2D', 'VIEWPORT', 'SCISSOR_BOX', 'COLOR_WRITEMASK', 'DEPTH_WRITEMASK', 'DEPTH_FUNC', 'DEPTH_RANGE', 'COLOR_CLEAR_VALUE', 'DEPTH_CLEAR_VALUE',
  'CULL_FACE_MODE', 'FRONT_FACE', 'BLEND_SRC_RGB', 'BLEND_DST_RGB', 'BLEND_SRC_ALPHA', 'BLEND_DST_ALPHA', 'BLEND_EQUATION_RGB', 'BLEND_EQUATION_ALPHA',
  'POLYGON_OFFSET_FACTOR', 'POLYGON_OFFSET_UNITS', 'SAMPLE_COVERAGE_VALUE', 'SAMPLE_COVERAGE_INVERT', 'SAMPLES', 'SAMPLE_BUFFERS'] as const;
const capabilities = ['BLEND', 'CULL_FACE', 'DEPTH_TEST', 'DITHER', 'POLYGON_OFFSET_FILL', 'RASTERIZER_DISCARD', 'SAMPLE_ALPHA_TO_COVERAGE', 'SAMPLE_COVERAGE', 'SCISSOR_TEST', 'STENCIL_TEST'] as const;
const hash = async (data: Uint8Array<ArrayBuffer>) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const hashJson = (value: unknown) => hash(new TextEncoder().encode(JSON.stringify(value)));

/** Manual diagnostics only. Copies arguments and queries state; never enable in a throughput window.
 * Records renderer-used entry points, not a complete WebGL replay or physical presentation proof.
 */
export function createWebGlCommandCapture(gl: CaptureContext, options: { observeInstancedDraw?: (method: string, args: unknown[]) => unknown } = {}) {
  const ids = new WeakMap<object, number>(), undo: Array<() => void> = [];
  let nextId = 0, active = false, calls: Array<{ method: string; args: Value[] }> = [], bytes = 0;
  let blobs: Uint8Array<ArrayBuffer>[] = [], initial: Record<string, Value> = {};
  let drawObservations: unknown[] = [];
  const value = (input: unknown): Value => {
    if (input === undefined) return { undefined: true };
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number') return Object.is(input, -0) ? { number: '-0' } : Number.isFinite(input) ? input : { number: String(input) };
    if (Array.isArray(input)) return input.map(value);
    if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
      const source = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      bytes += source.byteLength;if (bytes > 33554432) throw Error('WebGL command capture exceeds 32 MiB per render');
      const index = blobs.length;blobs.push(new Uint8Array(source));
      return { blob: index, byteLength: source.byteLength, type: Object.prototype.toString.call(input) };
    }
    if (typeof input === 'object') {
      let id = ids.get(input);if (id === undefined) { id = ++nextId;ids.set(input, id); }
      return { object: id, type: Object.prototype.toString.call(input) };
    }
    throw Error('Unsupported WebGL capture argument');
  };
  for (const method of methods) {
    const original = Reflect.get(gl, method);if (typeof original !== 'function') continue;
    const descriptor = Object.getOwnPropertyDescriptor(gl, method);
    Object.defineProperty(gl, method, { configurable: true, writable: true, value: (...args: unknown[]) => {
      if (active) {
        if (calls.length >= 100000) throw Error('WebGL command capture call bound exceeded');
        calls.push({ method, args: args.map(value) });
        if (options.observeInstancedDraw && (method === 'drawElementsInstanced' || method === 'drawArraysInstanced')) drawObservations.push(options.observeInstancedDraw(method, args));
      }
      return Reflect.apply(original, gl, args);
    } });
    undo.push(() => { if (descriptor) Object.defineProperty(gl, method, descriptor);else Reflect.deleteProperty(gl, method); });
  }
  return {
    begin() {
      if (active) throw Error('WebGL command capture is already active');
      calls = [];blobs = [];bytes = 0;initial = {};drawObservations = [];
      for (const key of parameters) {
        const parameter = Reflect.get(gl, key);if (typeof parameter !== 'number') continue;
        const observed = gl.getParameter(parameter);
        initial[key] = ArrayBuffer.isView(observed)
          ? { type: Object.prototype.toString.call(observed), bytes: [...new Uint8Array(observed.buffer, observed.byteOffset, observed.byteLength)] }
          : value(observed);
      }
      for (const key of capabilities) { const parameter = Reflect.get(gl, key);if (typeof parameter === 'number') initial[key] = gl.isEnabled(parameter); }
      active = true;
    },
    async end({ retainBlobs = false } = {}) {
      if (!active) throw Error('WebGL command capture is not active');active = false;
      const captured = { calls, initial, bytes, blobs, drawObservations };
      const blobHashes = await Promise.all(captured.blobs.map(hash));
      return { callCount: captured.calls.length, copiedBytes: captured.bytes, calls: captured.calls, initial: captured.initial, blobHashes,
        ...(options.observeInstancedDraw ? { drawObservations: captured.drawObservations } : {}),
        // Opt-in forensic bytes. Serialize after the synchronous draw sequence;
        // hashes alone cannot localize differing active/unused upload ranges.
        ...(retainBlobs ? { blobBase64: captured.blobs.map(blob => {
          let binary = '';for (let offset = 0; offset < blob.length; offset += 8192) binary += String.fromCharCode(...blob.subarray(offset, offset + 8192));
          return btoa(binary);
        }) } : {}),
        commandHash: await hashJson({ calls: captured.calls, blobHashes }), stateAndCommandHash: await hashJson({ initial: captured.initial, calls: captured.calls, blobHashes }) };
    },
    dispose() { active = false;for (const restore of undo.reverse()) restore();undo.length = 0;calls = [];blobs = [];drawObservations = []; },
  };
}
