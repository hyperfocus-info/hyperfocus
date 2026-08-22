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

/** FIFO upload scheduler for amortizing texture/buffer transfers across frames. */
export class StagedUploadQueue {
  readonly maxQueuedBytes: number;
  readonly #tasks: StagedUploadTask[] = [];
  readonly #onError: ((task: StagedUploadTask, error: unknown) => void) | undefined;
  #head = 0;
  #queuedBytes = 0;

  constructor(options: StagedUploadQueueOptions = {}) {
    this.maxQueuedBytes = bytes(options.maxQueuedBytes ?? Number.MAX_SAFE_INTEGER, "maxQueuedBytes");
    this.#onError = options.onError;
  }

  get size(): number {
    return this.#tasks.length - this.#head;
  }

  get queuedBytes(): number {
    return this.#queuedBytes;
  }

  enqueue(task: StagedUploadTask): boolean {
    if (!task || typeof task.id !== "string" || !task.id || typeof task.upload !== "function") {
      throw new TypeError("upload task requires a non-empty id and upload function.");
    }
    const taskBytes = bytes(task.byteLength, "task.byteLength");
    if (taskBytes > this.maxQueuedBytes - this.#queuedBytes) return false;
    this.#tasks.push(task);
    this.#queuedBytes += taskBytes;
    return true;
  }

  cancel(id: string): boolean {
    for (let index = this.#head; index < this.#tasks.length; index += 1) {
      if (this.#tasks[index].id !== id) continue;
      this.#queuedBytes -= this.#tasks[index].byteLength;
      this.#tasks.splice(index, 1);
      return true;
    }
    return false;
  }

  clear(): void {
    this.#tasks.length = 0;
    this.#head = 0;
    this.#queuedBytes = 0;
  }

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

    while (this.#head < this.#tasks.length && uploadedTasks + failedTasks < maxTasks) {
      const task = this.#tasks[this.#head];
      if (uploadedTasks + failedTasks > 0 && uploadedBytes + task.byteLength > maxBytes) break;
      if (uploadedTasks + failedTasks > 0 && now() - started >= maxMilliseconds) break;
      this.#head += 1;
      this.#queuedBytes -= task.byteLength;
      try {
        await task.upload();
        uploadedTasks += 1;
        uploadedBytes += task.byteLength;
      } catch (error) {
        failedTasks += 1;
        try { this.#onError?.(task, error); } catch {}
      }
    }

    if (this.#head > 64 && this.#head * 2 >= this.#tasks.length) {
      this.#tasks.splice(0, this.#head);
      this.#head = 0;
    }
    return {
      uploadedTasks,
      uploadedBytes,
      failedTasks,
      remainingTasks: this.size,
      remainingBytes: this.#queuedBytes,
      budgetExhausted: this.size > 0
    };
  }
}

export function createStagedUploadQueue(options: StagedUploadQueueOptions = {}): StagedUploadQueue {
  return new StagedUploadQueue(options);
}
