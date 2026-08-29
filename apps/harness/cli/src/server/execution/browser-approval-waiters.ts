import type { PendingBrowserApproval } from "../core/contracts";

const runtimeRecoveryQueues = new WeakMap<object, Map<string, () => void>>();
const waiterOwnerIndexes = new WeakMap<Map<string, PendingBrowserApproval>, Map<string, Set<string>>>();

export function registerBrowserApprovalWaiter(
  waiters: Map<string, PendingBrowserApproval>, key: string, abortSignal?: AbortSignal,
) {
  if (waiters.has(key)) return Promise.reject(new Error("Browser approval is already pending"));
  return new Promise<{ approved: boolean }>((resolve, reject) => {
    const waiter: PendingBrowserApproval = { resolve: (approved) => resolve({ approved }), reject };
    waiters.set(key, waiter); indexWaiter(waiters, key);
    abortSignal?.addEventListener("abort", () => {
      if (waiters.get(key) !== waiter) return;
      waiters.delete(key); unindexWaiter(waiters, key); reject(new Error("Browser approval aborted"));
    }, { once: true });
  });
}

export function resolveBrowserApprovalWaiter(
  waiters: Map<string, PendingBrowserApproval>, key: string, approved: boolean,
) {
  const waiter = waiters.get(key);
  if (!waiter || waiters.get(key) !== waiter) return false;
  waiters.delete(key); unindexWaiter(waiters, key); waiter.resolve(approved); return true;
}

export function claimBrowserApprovalWaiter(waiters: Map<string, PendingBrowserApproval>, key: string) {
  const waiter = waiters.get(key); if (!waiter) return undefined;
  waiters.delete(key); unindexWaiter(waiters, key); return waiter;
}

export function restoreBrowserApprovalWaiter(
  waiters: Map<string, PendingBrowserApproval>, key: string, waiter: PendingBrowserApproval,
) {
  if (waiters.has(key)) return false; waiters.set(key, waiter); indexWaiter(waiters, key); return true;
}

export function claimBrowserApprovalWaitersForRun(waiters: Map<string, PendingBrowserApproval>,
  projectId: string, runId: string) {
  const owner = JSON.stringify([projectId, runId]), keys = [...(waiterOwnerIndexes.get(waiters)?.get(owner) ?? [])];
  return keys.flatMap((key) => { const waiter = claimBrowserApprovalWaiter(waiters, key); return waiter ? [waiter] : []; });
}

function indexWaiter(waiters: Map<string, PendingBrowserApproval>, key: string) {
  const owner = waiterOwnerKey(key); if (!owner) return;
  const index = waiterOwnerIndexes.get(waiters) ?? new Map<string, Set<string>>(), keys = index.get(owner) ?? new Set<string>();
  keys.add(key); index.set(owner, keys); waiterOwnerIndexes.set(waiters, index);
}
function unindexWaiter(waiters: Map<string, PendingBrowserApproval>, key: string) {
  const owner = waiterOwnerKey(key), index = waiterOwnerIndexes.get(waiters); if (!owner || !index) return;
  const keys = index.get(owner); keys?.delete(key); if (keys?.size === 0) index.delete(owner);
  if (index.size === 0) waiterOwnerIndexes.delete(waiters);
}
function waiterOwnerKey(key: string) {
  try { const tuple: unknown = JSON.parse(key); return Array.isArray(tuple) && tuple.length === 4
    && typeof tuple[0] === "string" && typeof tuple[1] === "string" ? JSON.stringify(tuple.slice(0, 2)) : undefined; }
  catch { return undefined; }
}

export function settleBrowserApprovalAfterCommit(
  waiter: PendingBrowserApproval, approved: boolean, steps: ReadonlyArray<{ name: string; run: () => void }>,
  onStepError: (name: string, error: unknown) => void,
) {
  waiter.resolve(approved); runBrowserApprovalPostCommitSteps(steps, onStepError);
}

export function runBrowserApprovalPostCommitSteps(steps: ReadonlyArray<{ name: string; run: () => void }>,
  onStepError: (name: string, error: unknown) => void) {
  for (const step of steps) {
    try { step.run(); } catch (error) { onStepError(step.name, error); }
  }
}

export function retryBrowserApprovalRuntimeConvergence(converge: () => void) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { converge(); return; } catch (error) { if (attempt === 2) throw error; }
  }
}

export function queueBrowserApprovalRuntimeRecovery(owner: object, projectId: string, converge: () => void) {
  const queue = runtimeRecoveryQueues.get(owner) ?? new Map<string, () => void>();
  queue.set(projectId, converge); runtimeRecoveryQueues.set(owner, queue);
}

export function drainBrowserApprovalRuntimeRecovery(owner: object, projectId?: string) {
  const queue = runtimeRecoveryQueues.get(owner); if (!queue) return;
  const entries = projectId ? [[projectId, queue.get(projectId)] as const] : [...queue.entries()];
  for (const [queuedProjectId, converge] of entries) {
    if (!converge) continue;
    retryBrowserApprovalRuntimeConvergence(converge); queue.delete(queuedProjectId);
  }
  if (queue.size === 0) runtimeRecoveryQueues.delete(owner);
}
