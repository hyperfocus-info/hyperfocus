export interface EncodedVideoChunkLike {
  readonly byteLength: number;
  readonly timestamp: number;
  readonly type?: "key" | "delta";
  copyTo?(destination: AllowSharedBufferSource): void;
}

export interface ReplayEncoderLike<Frame> {
  readonly encodeQueueSize: number;
  configure(config: Readonly<Record<string, unknown>>): void;
  encode(frame: Frame, options?: { keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

export interface EncodedReplaySink {
  write(chunk: EncodedVideoChunkLike, metadata?: unknown): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface WebCodecsReplayOptions<Frame> {
  config: Readonly<Record<string, unknown>>;
  sink: EncodedReplaySink;
  createEncoder(callbacks: {
    output(chunk: EncodedVideoChunkLike, metadata?: unknown): void;
    error(error: unknown): void;
  }): ReplayEncoderLike<Frame>;
  maxEncodeQueue?: number;
  keyFrameInterval?: number;
  onError?: (error: unknown) => void;
}

export interface EncodedReplayStats {
  submittedFrames: number;
  droppedFrames: number;
  encodedChunks: number;
  encodedBytes: number;
  sinkErrors: number;
}

/**
 * Streams encoded WebCodecs chunks to a sink. It intentionally does not claim
 * MP4/WebM muxing; the sink receives elementary codec chunks and metadata.
 */
export class WebCodecsReplayStream<Frame> {
  readonly container = "none" as const;
  readonly stats: EncodedReplayStats = { submittedFrames: 0, droppedFrames: 0, encodedChunks: 0, encodedBytes: 0, sinkErrors: 0 };
  readonly #sink: EncodedReplaySink;
  readonly #encoder: ReplayEncoderLike<Frame>;
  readonly #maxEncodeQueue: number;
  readonly #keyFrameInterval: number;
  readonly #onError: ((error: unknown) => void) | undefined;
  #closed = false;
  #sinkTail = Promise.resolve();

  constructor(options: WebCodecsReplayOptions<Frame>) {
    this.#maxEncodeQueue = options.maxEncodeQueue ?? 4;
    this.#keyFrameInterval = options.keyFrameInterval ?? 120;
    if (!Number.isSafeInteger(this.#maxEncodeQueue) || this.#maxEncodeQueue <= 0) throw new RangeError("maxEncodeQueue must be positive.");
    if (!Number.isSafeInteger(this.#keyFrameInterval) || this.#keyFrameInterval <= 0) throw new RangeError("keyFrameInterval must be positive.");
    this.#sink = options.sink;
    this.#onError = options.onError;
    this.#encoder = options.createEncoder({
      output: (chunk, metadata) => this.#write(chunk, metadata),
      error: (error) => this.#report(error)
    });
    this.#encoder.configure(options.config);
  }

  encode(frame: Frame): boolean {
    if (this.#closed) throw new Error("encoded replay stream is closed.");
    if (this.#encoder.encodeQueueSize >= this.#maxEncodeQueue) {
      this.stats.droppedFrames += 1;
      return false;
    }
    const keyFrame = this.stats.submittedFrames % this.#keyFrameInterval === 0;
    this.#encoder.encode(frame, { keyFrame });
    this.stats.submittedFrames += 1;
    return true;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#encoder.flush();
    await this.#sinkTail;
    await this.#sink.close?.();
    this.#encoder.close();
  }

  #write(chunk: EncodedVideoChunkLike, metadata?: unknown): void {
    this.stats.encodedChunks += 1;
    this.stats.encodedBytes += chunk.byteLength;
    this.#sinkTail = this.#sinkTail.then(() => this.#sink.write(chunk, metadata)).catch((error) => {
      this.stats.sinkErrors += 1;
      this.#report(error);
    });
  }

  #report(error: unknown): void {
    try { this.#onError?.(error); } catch {}
  }
}

export function createWebCodecsReplayStream<Frame>(options: WebCodecsReplayOptions<Frame>): WebCodecsReplayStream<Frame> {
  return new WebCodecsReplayStream(options);
}
