let source = '';
declare global { var __hyperfocusRuntimeModule: string | undefined; }
/** Reuse the exported runtime in isolated workers, including offline HTML builds. */
export function prepareBulkRuntime() {
  if (typeof document === 'undefined') {
    void import('./worker.ts').then(({ installBulkWorker }) => installBulkWorker(globalThis));
    return true;
  }
  source = document.currentScript?.textContent ?? '';
  return false;
}

export function createBulkWorker() {
  if (globalThis.__hyperfocusRuntimeModule) return new Worker(globalThis.__hyperfocusRuntimeModule, { type: 'module' });
  if (!source) throw Error('Bulk training requires an exported game build with an embedded runtime.');
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { return new Worker(url); }
  finally { URL.revokeObjectURL(url); }
}
