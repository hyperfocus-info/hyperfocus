type StreamPumpOptions = {
  flushIntervalMs: number;
  maxBufferedBytes: number;
  maxTotalChars?: number;
  maxQueuedBytes?: number;
  onFlush: (text: string) => void | Promise<void>;
  onOverflow?: (bytes: number) => void;
  onError?: (error: unknown) => void;
};
export const DEFAULT_STREAM_MAX_QUEUED_BYTES = 262144;

export async function drainStreamPumps(pumps: Iterable<StreamPump>) {
  const results = await Promise.allSettled([...pumps].map((pump) => pump.end()));
  return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
}

export function cancelStreamPumps(pumps: Iterable<StreamPump>) {
  for (const pump of pumps) pump.close();
}

export type StreamPump = ReturnType<typeof createStreamPump>;

export function createStreamPump(options: StreamPumpOptions) {
  if (options.flushIntervalMs <= 0 || options.maxBufferedBytes <= 0 || (options.maxQueuedBytes ?? 1) <= 0) {
    throw new Error("StreamPump requires positive flush interval and byte cap");
  }

  let buffered = "";
  let bufferedBytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const encoder = new TextEncoder();
  const queuedChunks: string[] = [];
  let drainPromise: Promise<void> | undefined;
  let draining = false;
  let pendingError: unknown;
  let ended = false;
  let totalChars = 0;
  let pendingBytes = 0;
  let inFlightBytes = 0;

  function push(text: string) {
    if (!text || ended) {
      return;
    }
    if (options.maxTotalChars !== undefined && totalChars + text.length > options.maxTotalChars) {
      fail(new Error(`Stream output exceeds ${options.maxTotalChars} characters`));
      return;
    }
    const incomingBytes = encoder.encode(text).byteLength;
    if (options.maxQueuedBytes !== undefined && pendingBytes + incomingBytes > options.maxQueuedBytes) {
      options.onOverflow?.(pendingBytes + incomingBytes);
      fail(new Error(`Stream backlog exceeds ${options.maxQueuedBytes} UTF-8 bytes`));
      return;
    }
    totalChars += text.length;
    pendingBytes += incomingBytes;

    for (const character of text) {
      // for...of yields code points; lone surrogates encode as a 3-byte replacement.
      const point = character.codePointAt(0)!;
      const bytes = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bufferedBytes > 0 && bufferedBytes + bytes > options.maxBufferedBytes) {
        options.onOverflow?.(bufferedBytes + bytes);
        queueBufferedChunk();
      }
      buffered += character;
      bufferedBytes += bytes;
      if (bufferedBytes === options.maxBufferedBytes) queueBufferedChunk();
    }

    if (buffered && !timer) {
      timer = setTimeout(queueBufferedChunk, options.flushIntervalMs);
    }
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    queueBufferedChunk();
    await drainPromise;
    if (pendingError !== undefined) {
      const error = pendingError;
      pendingError = undefined;
      throw error;
    }
  }

  function close() {
    ended = true;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    buffered = "";
    bufferedBytes = 0;
    queuedChunks.length = 0;
    pendingBytes = inFlightBytes;
  }

  async function end() {
    ended = true;
    try {
      await flush();
    } finally {
      close();
    }
  }

  function queueBufferedChunk() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!buffered) return;
    queuedChunks.push(buffered);
    buffered = "";
    bufferedBytes = 0;
    if (!draining) {
      draining = true;
      const pending = drainChunks();
      // A synchronous throwing callback may finish the drain before assignment.
      if (draining) drainPromise = pending;
    }
  }

  async function drainChunks() {
    while (queuedChunks.length > 0) {
      const chunk = queuedChunks.shift();
      if (!chunk) continue;
      const chunkBytes = encoder.encode(chunk).byteLength;
      inFlightBytes = chunkBytes;
      try {
        await options.onFlush(chunk);
      } catch (error) {
        pendingError ??= error;
        options.onError?.(error);
      } finally {
        pendingBytes = Math.max(0, pendingBytes - chunkBytes);
        inFlightBytes = 0;
      }
    }
    drainPromise = undefined;
    draining = false;
  }

  function fail(error: Error) {
    pendingError ??= error;
    ended = true;
    buffered = "";
    bufferedBytes = 0;
    queuedChunks.length = 0;
    pendingBytes = inFlightBytes;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    options.onError?.(error);
  }

  return { push, flush, close, end };
}
