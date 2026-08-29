export interface StagedUploadTask {
  readonly id: string;
  readonly byteLength: number;
  upload(): void | Promise<void>;
}

export interface StagedUploadBudget {
  /** Soft limit. The first queued task may exceed it to prevent starvation. */
  maxBytes: number;
  maxTasks?: number;
  maxMilliseconds?: number;
  now?: () => number;
}

export interface StagedUploadFrameResult {
  uploadedTasks: number;
  uploadedBytes: number;
  failedTasks: number;
  remainingTasks: number;
  remainingBytes: number;
  budgetExhausted: boolean;
}

export interface StagedUploadQueueOptions {
  maxQueuedBytes?: number;
  onError?: (task: StagedUploadTask, error: unknown) => void;
}

function bytes(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`);
  return value;
}

/** Creates a FIFO scheduler for amortizing texture/buffer transfers across frames. */
export function createStagedUploadQueue(options: StagedUploadQueueOptions = {}) {
  const maxQueuedBytes = bytes(options.maxQueuedBytes ?? Number.MAX_SAFE_INTEGER, "maxQueuedBytes");
  const tasks: StagedUploadTask[] = [];
  let head = 0;
  let queuedBytes = 0;
  return Object.freeze({
    maxQueuedBytes,
    get size() { return tasks.length - head; },
    get queuedBytes() { return queuedBytes; },
    enqueue(task: StagedUploadTask) {
      if (!task || typeof task.id !== "string" || !task.id || typeof task.upload !== "function") {
        throw new TypeError("upload task requires a non-empty id and upload function.");
      }
      const taskBytes = bytes(task.byteLength, "task.byteLength");
      if (taskBytes > maxQueuedBytes - queuedBytes) return false;
      tasks.push(task);
      queuedBytes += taskBytes;
      return true;
    },
    cancel(id: string) {
      for (let index = head; index < tasks.length; index += 1) {
        if (tasks[index].id !== id) continue;
        queuedBytes -= tasks[index].byteLength;
        tasks.splice(index, 1);
        return true;
      }
      return false;
    },
    clear() {
      tasks.length = 0;
      head = 0;
      queuedBytes = 0;
    },
    async processFrame(budget: StagedUploadBudget): Promise<StagedUploadFrameResult> {
      const maxBytes = bytes(budget.maxBytes, "maxBytes");
      const maxTasks = budget.maxTasks ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(maxTasks) || maxTasks <= 0) throw new RangeError("maxTasks must be a positive safe integer.");
      const maxMilliseconds = budget.maxMilliseconds ?? Infinity;
      if (!(maxMilliseconds > 0)) throw new RangeError("maxMilliseconds must be positive.");
      const now = budget.now ?? (typeof performance === "object" ? performance.now.bind(performance) : Date.now);
      const started = now();
      let uploadedTasks = 0;
      let uploadedBytes = 0;
      let failedTasks = 0;

      while (head < tasks.length && uploadedTasks + failedTasks < maxTasks) {
        const task = tasks[head];
        if (uploadedTasks + failedTasks > 0 && uploadedBytes + task.byteLength > maxBytes) break;
        if (uploadedTasks + failedTasks > 0 && now() - started >= maxMilliseconds) break;
        head += 1;
        queuedBytes -= task.byteLength;
        try {
          await task.upload();
          uploadedTasks += 1;
          uploadedBytes += task.byteLength;
        } catch (error) {
          failedTasks += 1;
          try { options.onError?.(task, error); } catch {}
        }
      }

      if (head > 64 && head * 2 >= tasks.length) {
        tasks.splice(0, head);
        head = 0;
      }
      const size = tasks.length - head;
      return {
        uploadedTasks,
        uploadedBytes,
        failedTasks,
        remainingTasks: size,
        remainingBytes: queuedBytes,
        budgetExhausted: size > 0
      };
    },
  });
}

export type StagedUploadQueue = ReturnType<typeof createStagedUploadQueue>;
