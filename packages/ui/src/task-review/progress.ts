export type TaskProgress = {
  status: 'waiting' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
  label: string; detail?: string; completed?: number | null; total?: number | null;
  updatedAt?: string; staleAfterMs?: number;
};

/** Progress is measured work in the current phase, never elapsed-time optimism. */
export function describeTaskProgress(options: { task: TaskProgress; now?: number }) {
  const task = options.task;
  const age = task.updatedAt ? (options.now ?? Date.now()) - Date.parse(task.updatedAt) : 0;
  const stale = task.status === 'running' && Number.isFinite(age) && age > (task.staleAfterMs ?? 45_000);
  const status = stale ? 'interrupted' : task.status;
  const tones = { waiting: 'neutral', queued: 'info', running: 'info', succeeded: 'success', failed: 'danger', cancelled: 'neutral', interrupted: 'warning' } as const;
  const measured = task.completed != null && task.total != null && Number.isFinite(task.completed) && Number.isFinite(task.total) && task.total > 0 && task.completed >= 0;
  return { status, tone: tones[status], label: stale ? 'Progress unavailable' : task.label,
    detail: stale ? 'Worker heartbeat stopped. Check the worker before retrying.' : task.detail,
    percentage: measured ? Math.min(status === 'succeeded' ? 100 : 99, Math.round(task.completed! / task.total! * 100)) : null,
    active: status === 'running', stale };
}
