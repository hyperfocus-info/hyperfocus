import { positiveSafeInteger } from "./utils/bounded-stream-values";
const DEFAULT_MAX_STREAM_CHUNKS = 4_096;
const INITIAL_STREAM_BUFFER_BYTES = 65536;

type BoundedStreamOptions = {
  label: string;
  maxBytes: number;
  maxChunks?: number;
};

export class BoundedStreamLimitError extends Error {
  constructor(
    readonly kind: "bytes" | "chunks",
    label: string,
    limit: number,
  ) {
    super(
      kind === "bytes"
        ? `${label} exceeded ${limit} bytes.`
        : `${label} exceeded ${limit} transport chunks.`,
    );
    this.name = "BoundedStreamLimitError";
  }
}



function growBuffer(buffer: Uint8Array<ArrayBuffer>, requiredBytes: number, maxBytes: number) {
  if (requiredBytes <= buffer.byteLength) {
    return buffer;
  }
  const nextLength = Math.min(
    maxBytes,
    Math.max(requiredBytes, Math.max(1, buffer.byteLength) * 2),
  );
  const next = new Uint8Array(nextLength);
  next.set(buffer);
  return next;
}

export async function readBoundedStreamBytes(
  stream: ReadableStream<Uint8Array> | null,
  options: BoundedStreamOptions,
) {
  const maxBytes = positiveSafeInteger(options.maxBytes, "maxBytes");
  const maxChunks = positiveSafeInteger(
    options.maxChunks ?? DEFAULT_MAX_STREAM_CHUNKS,
    "maxChunks",
  );
  if (!stream) {
    return new Uint8Array();
  }

  const reader = stream.getReader();
  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(
    Math.min(maxBytes, INITIAL_STREAM_BUFFER_BYTES),
  );
  let totalBytes = 0;
  let chunkCount = 0;
  let completed = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        completed = true;
        break;
      }
      chunkCount += 1;
      const nextTotal = totalBytes + next.value.byteLength;
      const limitError = nextTotal > maxBytes
        ? new BoundedStreamLimitError("bytes", options.label, maxBytes)
        : chunkCount > maxChunks
          ? new BoundedStreamLimitError("chunks", options.label, maxChunks)
          : null;
      if (limitError) {
        try {
          await reader.cancel(limitError.message);
        } catch {
          // Limit failure remains authoritative when transport cancellation also fails.
        }
        throw limitError;
      }
      buffer = growBuffer(buffer, nextTotal, maxBytes);
      buffer.set(next.value, totalBytes);
      totalBytes = nextTotal;
    }
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // Original read or limit failure remains authoritative.
      }
    }
    reader.releaseLock();
  }
  return totalBytes === buffer.byteLength ? buffer : buffer.slice(0, totalBytes);
}

export async function readBoundedStreamText(
  stream: ReadableStream<Uint8Array> | null,
  options: BoundedStreamOptions,
) {
  return new TextDecoder().decode(await readBoundedStreamBytes(stream, options));
}
