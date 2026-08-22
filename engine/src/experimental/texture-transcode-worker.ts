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

/** Bounded request scheduler for an injected Basis/KTX2 transcoding worker. */
export class TextureTranscodeScheduler {
  readonly #worker: TextureTranscodeWorkerLike;
  readonly #maxInFlight: number;
  readonly #maxQueuedJobs: number;
  readonly #maxQueuedBytes: number;
  readonly #queued: PendingJob[] = [];
  readonly #running = new Map<number, PendingJob>();
  readonly #listener: (event: { data: unknown }) => void;
  #head = 0;
  #queuedBytes = 0;
  #nextId = 1;
  #disposed = false;

  constructor(options: TextureTranscodeSchedulerOptions) {
    this.#worker = options.worker;
    this.#maxInFlight = positiveInteger(options.maxInFlight ?? 2, "maxInFlight");
    this.#maxQueuedJobs = positiveInteger(options.maxQueuedJobs ?? 32, "maxQueuedJobs");
    this.#maxQueuedBytes = nonNegativeInteger(options.maxQueuedBytes ?? 64 * 1024 * 1024, "maxQueuedBytes");
    this.#listener = (event) => this.#receive(event.data);
    this.#worker.addEventListener("message", this.#listener);
  }

  get queuedJobs(): number { return this.#queued.length - this.#head; }
  get queuedBytes(): number { return this.#queuedBytes; }
  get inFlight(): number { return this.#running.size; }

  transcode(request: TextureTranscodeRequest): Promise<TranscodedTexture> {
    if (this.#disposed) return Promise.reject(new Error("texture transcode scheduler is disposed."));
    if (!(request.source instanceof ArrayBuffer)) return Promise.reject(new TypeError("texture source must be an ArrayBuffer."));
    if (!request.preferredFormats.length) return Promise.reject(new Error("at least one preferred texture format is required."));
    if (this.queuedJobs >= this.#maxQueuedJobs || request.source.byteLength > this.#maxQueuedBytes - this.#queuedBytes) {
      return Promise.reject(new Error("texture transcode queue capacity exceeded."));
    }
    return new Promise<TranscodedTexture>((resolve, reject) => {
      this.#queued.push({ id: this.#nextId++, request, resolve, reject });
      this.#queuedBytes += request.source.byteLength;
      this.#dispatch();
    });
  }

  dispose(reason: unknown = new Error("texture transcode scheduler disposed.")): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker.removeEventListener("message", this.#listener);
    for (let index = this.#head; index < this.#queued.length; index += 1) this.#queued[index].reject(reason);
    for (const job of this.#running.values()) job.reject(reason);
    this.#queued.length = 0;
    this.#head = 0;
    this.#queuedBytes = 0;
    this.#running.clear();
  }

  #dispatch(): void {
    while (!this.#disposed && this.#running.size < this.#maxInFlight && this.#head < this.#queued.length) {
      const job = this.#queued[this.#head++];
      this.#queuedBytes -= job.request.source.byteLength;
      this.#running.set(job.id, job);
      try {
        const message = {
          type: "texture-transcode",
          id: job.id,
          source: job.request.source,
          container: job.request.container,
          preferredFormats: [...job.request.preferredFormats]
        };
        this.#worker.postMessage(message, job.request.transferSource === false ? [] : [job.request.source]);
      } catch (error) {
        this.#running.delete(job.id);
        job.reject(error);
      }
    }
    if (this.#head > 64 && this.#head * 2 >= this.#queued.length) {
      this.#queued.splice(0, this.#head);
      this.#head = 0;
    }
  }

  #receive(value: unknown): void {
    if (!isResult(value)) return;
    const job = this.#running.get(value.id);
    if (!job) return;
    this.#running.delete(value.id);
    if (value.ok && value.data instanceof ArrayBuffer && typeof value.format === "string"
      && positiveResultDimension(value.width) && positiveResultDimension(value.height) && positiveResultDimension(value.levels)) {
      job.resolve({ data: value.data, format: value.format, width: value.width, height: value.height, levels: value.levels });
    } else {
      job.reject(new Error(value.error || "texture transcoder returned an invalid result."));
    }
    this.#dispatch();
  }
}

function isResult(value: unknown): value is ResultMessage {
  return typeof value === "object" && value !== null
    && (value as { type?: unknown }).type === "texture-transcode-result"
    && Number.isSafeInteger((value as { id?: unknown }).id);
}

function positiveResultDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`);
  return value;
}

export function createTextureTranscodeScheduler(options: TextureTranscodeSchedulerOptions): TextureTranscodeScheduler {
  return new TextureTranscodeScheduler(options);
}
