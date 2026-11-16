export interface TextureTranscodeWorkerLike {
  postMessage(message: unknown, transfer?: readonly Transferable[]): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export interface TextureTranscodeRequest {
  readonly source: ArrayBuffer;
  readonly container: "basis" | "ktx2";
  readonly preferredFormats: readonly string[];
  readonly transferSource?: boolean;
}

export interface TranscodedTexture {
  readonly data: ArrayBuffer;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly levels: number;
}

export interface TextureTranscodeSchedulerOptions {
  worker: TextureTranscodeWorkerLike;
  maxInFlight?: number;
  maxQueuedJobs?: number;
  maxQueuedBytes?: number;
}

interface PendingJob {
  readonly id: number;
  readonly request: TextureTranscodeRequest;
  readonly resolve: (texture: TranscodedTexture) => void;
  readonly reject: (error: unknown) => void;
}

type ResultMessage = {
  type: "texture-transcode-result";
  id: number;
  ok: boolean;
  data?: ArrayBuffer;
  format?: string;
  width?: number;
  height?: number;
  levels?: number;
  error?: string;
};

/** Creates a bounded request scheduler for an injected Basis/KTX2 worker. */
export function createTextureTranscodeScheduler(options: TextureTranscodeSchedulerOptions) {
  const maxInFlight = positiveInteger(options.maxInFlight ?? 2, "maxInFlight");
  const maxQueuedJobs = positiveInteger(options.maxQueuedJobs ?? 32, "maxQueuedJobs");
  const maxQueuedBytes = nonNegativeInteger(options.maxQueuedBytes ?? 67108864, "maxQueuedBytes");
  const queued: PendingJob[] = [];
  const running = new Map<number, PendingJob>();
  let head = 0;
  let queuedBytes = 0;
  let nextId = 1;
  let disposed = false;
  const dispatch = () => {
    while (!disposed && running.size < maxInFlight && head < queued.length) {
      const job = queued[head++];
      queuedBytes -= job.request.source.byteLength;
      running.set(job.id, job);
      try {
        const message = {
          type: "texture-transcode",
          id: job.id,
          source: job.request.source,
          container: job.request.container,
          preferredFormats: [...job.request.preferredFormats]
        };
        options.worker.postMessage(message, job.request.transferSource === false ? [] : [job.request.source]);
      } catch (error) {
        running.delete(job.id);
        job.reject(error);
      }
    }
    if (head > 64 && head * 2 >= queued.length) {
      queued.splice(0, head);
      head = 0;
    }
  };
  const receive = (value: unknown) => {
    if (!isResult(value)) return;
    const job = running.get(value.id);
    if (!job) return;
    running.delete(value.id);
    if (value.ok && value.data instanceof ArrayBuffer && typeof value.format === "string"
      && positiveResultDimension(value.width) && positiveResultDimension(value.height) && positiveResultDimension(value.levels)) {
      job.resolve({ data: value.data, format: value.format, width: value.width, height: value.height, levels: value.levels });
    } else {
      job.reject(new Error(value.error || "texture transcoder returned an invalid result."));
    }
    dispatch();
  };
  const listener = (event: { data: unknown }) => receive(event.data);
  options.worker.addEventListener("message", listener);
  return Object.freeze({
    get queuedJobs() { return queued.length - head; },
    get queuedBytes() { return queuedBytes; },
    get inFlight() { return running.size; },
    transcode(request: TextureTranscodeRequest): Promise<TranscodedTexture> {
    if (disposed) return Promise.reject(new Error("texture transcode scheduler is disposed."));
    if (!(request.source instanceof ArrayBuffer)) return Promise.reject(new TypeError("texture source must be an ArrayBuffer."));
    if (!request.preferredFormats.length) return Promise.reject(new Error("at least one preferred texture format is required."));
    if (queued.length - head >= maxQueuedJobs || request.source.byteLength > maxQueuedBytes - queuedBytes) {
      return Promise.reject(new Error("texture transcode queue capacity exceeded."));
    }
    return new Promise<TranscodedTexture>((resolve, reject) => {
      queued.push({ id: nextId++, request, resolve, reject });
      queuedBytes += request.source.byteLength;
      dispatch();
    });
    },

    dispose(reason: unknown = new Error("texture transcode scheduler disposed.")): void {
      if (disposed) return;
      disposed = true;
      options.worker.removeEventListener("message", listener);
      for (let index = head; index < queued.length; index += 1) queued[index].reject(reason);
      for (const job of running.values()) job.reject(reason);
      queued.length = 0;
      head = 0;
      queuedBytes = 0;
      running.clear();
    },
  });
}

export type TextureTranscodeScheduler = ReturnType<typeof createTextureTranscodeScheduler>;

function isResult(value: unknown): value is ResultMessage {
  return typeof value === "object" && value !== null && "type" in value && "id" in value && "ok" in value
    && value.type === "texture-transcode-result" && typeof value.id === "number"
    && Number.isSafeInteger(value.id) && typeof value.ok === "boolean";
}

function positiveResultDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`);
  return value;
}
