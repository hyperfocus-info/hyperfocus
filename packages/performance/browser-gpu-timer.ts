type TimerContext = Pick<WebGL2RenderingContext, 'isContextLost' | 'getParameter'
  | 'beginQuery' | 'endQuery' | 'createQuery' | 'deleteQuery' | 'getQueryParameter'> & {
  QUERY_RESULT: number; QUERY_RESULT_AVAILABLE: number;
  getExtension(name: 'EXT_disjoint_timer_query_webgl2'): { GPU_DISJOINT_EXT: number; TIME_ELAPSED_EXT: number } | null;
};

// Reading GPU_DISJOINT_EXT consumes the context-wide event. Independent timers
// must still invalidate their pending queries after another timer observes it.
const disjointGenerations = new WeakMap<TimerContext, number>();

/** Diagnostic only: asynchronous renderer GPU duration; no finish(), readback or busy wait. */
export function createGpuTimer(canvas: { getContext(name: 'webgl2'): TimerContext | null }) {
  const gl = canvas.getContext('webgl2'), extension = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending: { query: WebGLQuery; row: Record<string, unknown> }[] = [];
  let active: WebGLQuery | undefined;
  let skipped = 'unsupported', nextId = 0;
  let observedGeneration = gl ? disjointGenerations.get(gl) ?? 0 : 0;
  const counts: Record<string, number> = {};
  const count = (status: string) => counts[status] = (counts[status] ?? 0) + 1;
  function clear(status: string) {
    if (active && gl && extension) { if (!gl.isContextLost()) gl.endQuery(extension.TIME_ELAPSED_EXT);gl.deleteQuery(active);active = undefined; }
    for (const item of pending) { item.row.gpuQueryStatus = status;delete item.row.gpuDrawMs;count(status);gl!.deleteQuery(item.query); }pending.length = 0;
  }
  return {
    supported: !!extension,
    begin() {
      if (active) throw Error('GPU timer cannot overlap its own query');
      skipped = 'unsupported';
      if (!extension || !gl) return;
      if (gl.isContextLost()) { clear('context-lost');skipped = 'context-lost';return; }
      const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
      if (disjoint) disjointGenerations.set(gl, (disjointGenerations.get(gl) ?? 0) + 1);
      const generation = disjointGenerations.get(gl) ?? 0;
      if (disjoint || generation !== observedGeneration) { observedGeneration = generation;clear('disjoint');skipped = 'disjoint';return; }
      while (pending.length && gl.getQueryParameter(pending[0]!.query, gl.QUERY_RESULT_AVAILABLE)) {
        const item = pending.shift()!;const elapsed = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
        const valid = Number.isFinite(elapsed) && elapsed >= 0;
        item.row.gpuQueryStatus = valid ? 'valid' : 'invalid-result';if (valid) item.row.gpuDrawMs = elapsed;count(String(item.row.gpuQueryStatus));gl.deleteQuery(item.query);
      }
      if (pending.length >= 8) { skipped = 'queue-full';return; }
      active = gl.createQuery() ?? undefined;if (active) gl.beginQuery(extension.TIME_ELAPSED_EXT, active);else skipped = 'allocation-failed';
    },
    end(row: Record<string, unknown>) {
      if (!active || !gl || !extension) { row.gpuQueryStatus = skipped;count(skipped);return; }
      if (gl.isContextLost()) { clear('context-lost');row.gpuQueryStatus = 'context-lost';count('context-lost');return; }
      gl.endQuery(extension.TIME_ELAPSED_EXT);row.gpuQueryStatus = 'pending';row.gpuQueryId = ++nextId;pending.push({ query: active, row });active = undefined;
    },
    statistics() { return { supported: !!extension, pending: pending.length, active: !!active, completed: { ...counts } }; },
    dispose() { clear('disposed'); },
  };
}
