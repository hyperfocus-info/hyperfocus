import { describe, expect, it } from "bun:test";
import {
  BoundedStreamLimitError,
  readBoundedStreamBytes,
  readBoundedStreamText,
} from "@hyperfocus/pad-pilot/bounded-stream";

function chunkedStream(chunks: readonly Uint8Array[]) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;
      if (chunk) {
        controller.enqueue(chunk);
        return;
      }
      controller.close();
    },
  });
}

describe("bounded stream reader", () => {
  it("returns bytes and text without retaining transport chunks", async () => {
    const chunks = [new Uint8Array([65]), new Uint8Array([66, 67])];
    expect(await readBoundedStreamBytes(chunkedStream(chunks), {
      label: "fixture",
      maxBytes: 3,
    })).toEqual(new Uint8Array([65, 66, 67]));
    expect(await readBoundedStreamText(chunkedStream(chunks), {
      label: "fixture",
      maxBytes: 3,
    })).toBe("ABC");
  });

  it("rejects byte overflow and releases the reader lock", async () => {
    const stream = chunkedStream([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    await expect(readBoundedStreamBytes(stream, {
      label: "fixture",
      maxBytes: 3,
    })).rejects.toMatchObject({ kind: "bytes" });
    expect(() => stream.getReader()).not.toThrow();
  });

  it("rejects tiny-chunk floods even below the byte cap", async () => {
    const stream = chunkedStream(Array.from({ length: 5 }, () => new Uint8Array([1])));
    await expect(readBoundedStreamBytes(stream, {
      label: "fixture",
      maxBytes: 64,
      maxChunks: 4,
    })).rejects.toEqual(expect.any(BoundedStreamLimitError));
    await expect(readBoundedStreamBytes(chunkedStream([
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
      new Uint8Array([4]),
      new Uint8Array([5]),
    ]), {
      label: "fixture",
      maxBytes: 64,
      maxChunks: 4,
    })).rejects.toMatchObject({ kind: "chunks" });
  });

  it("validates limits before locking the stream", async () => {
    const stream = chunkedStream([]);
    await expect(readBoundedStreamBytes(stream, {
      label: "fixture",
      maxBytes: 0,
    })).rejects.toThrow("maxBytes must be a positive safe integer");
    expect(() => stream.getReader()).not.toThrow();
  });
});
