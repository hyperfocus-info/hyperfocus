import { Buffer } from "node:buffer";

export function createBoundedOutputBuffer(maxBytes: number) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error("Bounded output maxBytes must be positive");
  }

  const chunks: Uint8Array[] = [];
  const decoder = new TextDecoder();
  let retainedBytes = 0;
  let seenBytes = 0;
  let droppedBytes = 0;

  const trim = () => {
    while (retainedBytes > maxBytes && chunks.length > 0) {
      const overflow = retainedBytes - maxBytes;
      const first = chunks[0];
      if (first.byteLength <= overflow) {
        chunks.shift();
        retainedBytes -= first.byteLength;
        droppedBytes += first.byteLength;
        continue;
      }

      chunks[0] = first.slice(overflow);
      retainedBytes -= overflow;
      droppedBytes += overflow;
    }
  };

  const bytes = () => {
    const output = new Uint8Array(retainedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  };

  const text = () => decoder.decode(bytes());

  const snapshot = () => ({
    text: text(),
    bytesSeen: seenBytes,
    bytesDropped: droppedBytes,
    exceeded: droppedBytes > 0
  });

  const append = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    seenBytes += bytes.byteLength;
    chunks.push(bytes);
    retainedBytes += bytes.byteLength;
    trim();
    return snapshot();
  };

  return { append, text, bytes, snapshot };
}

type BoundedOutputSnapshot = ReturnType<ReturnType<typeof createBoundedOutputBuffer>["snapshot"]>;

export function formatOutputCapExceeded(label: string, snapshot: Pick<BoundedOutputSnapshot, "bytesSeen" | "bytesDropped">) {
  return `${label} output exceeded cap; retained tail after dropping ${snapshot.bytesDropped} of ${snapshot.bytesSeen} bytes.`;
}

export async function readBoundedResponseBody(
  response: Response,
  options: { maxBytes: number; label: string; signal?: AbortSignal }
) {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }
  throwIfAborted(options.signal, options.label);
  const contentLengthValue = response.headers.get("content-length");
  const contentLength = contentLengthValue !== null && /^\d+$/.test(contentLengthValue)
    ? Number(contentLengthValue)
    : undefined;
  if (contentLength !== undefined && Number.isSafeInteger(contentLength) && contentLength > options.maxBytes) {
    throw bodyTooLarge(options.label, options.maxBytes);
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > options.maxBytes) throw bodyTooLarge(options.label, options.maxBytes);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => void reader.cancel(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      throwIfAborted(options.signal, options.label);
      const result = await reader.read();
      throwIfAborted(options.signal, options.label);
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > options.maxBytes) {
        await reader.cancel();
        throw bodyTooLarge(options.label, options.maxBytes);
      }
      chunks.push(result.value);
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

function throwIfAborted(signal: AbortSignal | undefined, label: string) {
  if (signal?.aborted) throw new Error(`${label} was aborted`, { cause: signal.reason });
}

function bodyTooLarge(label: string, maxBytes: number) {
  return new RangeError(`${label} exceeded the ${maxBytes.toLocaleString("en-US")} byte response budget`);
}
