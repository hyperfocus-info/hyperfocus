import { realpath, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/** Remove one caller-owned direct child, retrying transient Windows handle locks. */
export async function removeOwnedDirectory({ directory, parent, timeoutMs = 5_000, retryDelayMs = 100 }: {
  directory: string; parent: string; timeoutMs?: number; retryDelayMs?: number;
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(retryDelayMs) || retryDelayMs <= 0) {
    throw new RangeError('Cleanup timeout must be nonnegative and retry delay positive.');
  }
  const target = resolve(directory);
  const boundary = resolve(parent);
  if (dirname(target) !== boundary) throw new Error(`Refusing cleanup outside the owned fixture parent: ${target}`);
  const actualParent = await realpath(boundary);
  try {
    if (dirname(await realpath(target)) !== actualParent) throw new Error(`Refusing cleanup of an escaping directory: ${target}`);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
  // Bun's rm maxRetries does not cover every EPERM/EBUSY path. Process exit and
  // endpoint protection can release handles after their exit notification.
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try { await rm(target, { recursive: true, force: true }); return; }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (Date.now() >= deadline || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(String(code))) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(retryDelayMs, Math.max(1, deadline - Date.now()))));
    }
  }
}
