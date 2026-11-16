/** Fixed-size manual diagnostic. Tests explicit 4x MSAA/resolve ownership in an
 * AA-off default context; not a renderer migration or a throughput option.
 */
export function createDiagnosticMultisampleTarget(gl: WebGL2RenderingContext) {
  if (gl.isContextLost() || gl.getContextAttributes()?.antialias !== false) throw Error('Explicit MSAA diagnostic requires a live AA-off default context');
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight, samples = 4;
  if (!width || !height || gl.getParameter(gl.MAX_SAMPLES) < samples) throw Error('Explicit MSAA diagnostic requires a nonempty target and four samples');
  const framebuffer = gl.createFramebuffer(), color = gl.createRenderbuffer(), depth = gl.createRenderbuffer();
  let disposed = false;
  const dispose = () => { if (disposed) return;disposed = true;gl.deleteFramebuffer(framebuffer);gl.deleteRenderbuffer(color);gl.deleteRenderbuffer(depth); };
  const previous = { draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), renderbuffer: gl.getParameter(gl.RENDERBUFFER_BINDING) };
  const restore = () => { gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previous.draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous.read);gl.bindRenderbuffer(gl.RENDERBUFFER, previous.renderbuffer); };
  try {
    if (!framebuffer || !color || !depth) throw Error('Explicit MSAA target allocation failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE || gl.getParameter(gl.SAMPLES) !== samples) throw Error('Explicit MSAA target is incomplete or has unexpected sample count');
  } catch (error) { dispose();throw error; } finally { restore(); }
  return {
    info: { width, height, samples, colorFormat: 'RGBA8', depthFormat: 'DEPTH_COMPONENT24', defaultAntialias: false, scope: 'Manual explicit multisample framebuffer with color-only resolve' },
    render<T>(draw: () => T): T {
      if (disposed || gl.isContextLost()) throw Error('Explicit MSAA target is disposed or context is lost');
      if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) throw Error('Fixed-size MSAA diagnostic does not support resize');
      const drawBefore = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), readBefore = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      const bind = gl.bindFramebuffer.bind(gl), descriptor = Object.getOwnPropertyDescriptor(gl, 'bindFramebuffer');
      // Keep shadow FBO binds intact, routing only the renderer's default target.
      Object.defineProperty(gl, 'bindFramebuffer', { configurable: true, writable: true, value: (target: number, destination: WebGLFramebuffer | null) => bind(target, destination ?? framebuffer) });
      try {
        bind(gl.FRAMEBUFFER, framebuffer);const result = draw();
        if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) throw Error('Drawing resized the fixed MSAA target');
        const scissor = gl.isEnabled(gl.SCISSOR_TEST);if (scissor) gl.disable(gl.SCISSOR_TEST);
        try {
          bind(gl.READ_FRAMEBUFFER, framebuffer);bind(gl.DRAW_FRAMEBUFFER, null);
          gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
          const error = gl.getError();if (error !== gl.NO_ERROR) throw Error(`Explicit MSAA render/resolve GL error: ${error}`);
        } finally { if (scissor) gl.enable(gl.SCISSOR_TEST); }
        return result;
      } finally {
        if (descriptor) Object.defineProperty(gl, 'bindFramebuffer', descriptor);else Reflect.deleteProperty(gl, 'bindFramebuffer');
        bind(gl.DRAW_FRAMEBUFFER, drawBefore);bind(gl.READ_FRAMEBUFFER, readBefore);
      }
    },
    dispose,
  };
}
