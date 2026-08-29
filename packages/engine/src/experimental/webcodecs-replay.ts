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
export function createWebCodecsReplayStream<Frame>(options: WebCodecsReplayOptions<Frame>) {
  const maxEncodeQueue = options.maxEncodeQueue ?? 4;
  const keyFrameInterval = options.keyFrameInterval ?? 120;
  if (!Number.isSafeInteger(maxEncodeQueue) || maxEncodeQueue <= 0) throw new RangeError("maxEncodeQueue must be positive.");
  if (!Number.isSafeInteger(keyFrameInterval) || keyFrameInterval <= 0) throw new RangeError("keyFrameInterval must be positive.");
  const stats: EncodedReplayStats = { submittedFrames: 0, droppedFrames: 0, encodedChunks: 0, encodedBytes: 0, sinkErrors: 0 };
  let closed = false;
  let sinkTail = Promise.resolve();
  const report = (error: unknown) => { try { options.onError?.(error); } catch {} };
  const write = (chunk: EncodedVideoChunkLike, metadata?: unknown) => {
    stats.encodedChunks += 1;
    stats.encodedBytes += chunk.byteLength;
    sinkTail = sinkTail.then(() => options.sink.write(chunk, metadata)).catch((error) => {
      stats.sinkErrors += 1;
      report(error);
    });
  };
  const encoder = options.createEncoder({ output: write, error: report });
  encoder.configure(options.config);
  return Object.freeze({
    container: "none" as const,
    stats,
    encode(frame: Frame): boolean {
    if (closed) throw new Error("encoded replay stream is closed.");
    if (encoder.encodeQueueSize >= maxEncodeQueue) {
      stats.droppedFrames += 1;
      return false;
    }
    const keyFrame = stats.submittedFrames % keyFrameInterval === 0;
    encoder.encode(frame, { keyFrame });
    stats.submittedFrames += 1;
    return true;
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await encoder.flush();
      await sinkTail;
      await options.sink.close?.();
      encoder.close();
    },
  });
}

export type WebCodecsReplayStream<Frame> = ReturnType<typeof createWebCodecsReplayStream<Frame>>;
