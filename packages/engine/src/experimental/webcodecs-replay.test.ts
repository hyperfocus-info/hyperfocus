import { expect, test } from "bun:test";
import { createWebCodecsReplayStream, type ReplayEncoderLike } from "./webcodecs-replay.ts";

test("encoded replay streams elementary chunks in order with backpressure", async () => {
  let callbacks!: { output(chunk: { byteLength: number; timestamp: number }, metadata?: unknown): void; error(error: unknown): void };
  const encoded: { frame: number; keyFrame: boolean }[] = [];
  const writes: number[] = [];
  let queueSize = 0;
  const encoder: ReplayEncoderLike<number> = {
    get encodeQueueSize() { return queueSize; }, configure() {},
    encode(frame, options) { encoded.push({ frame, keyFrame: Boolean(options?.keyFrame) }); },
    async flush() {}, close() {}
  };
  const replay = createWebCodecsReplayStream({
    config: { codec: "vp8", width: 320, height: 180 },
    sink: { async write(chunk) { writes.push(chunk.timestamp); } },
    keyFrameInterval: 2, maxEncodeQueue: 1,
    createEncoder(created) { callbacks = created; return encoder; }
  });
  expect(replay.container).toBe("none");
  expect(replay.encode(10)).toBe(true);
  queueSize = 1;
  expect(replay.encode(11)).toBe(false);
  queueSize = 0;
  expect(replay.encode(12)).toBe(true);
  callbacks.output({ byteLength: 5, timestamp: 10 });
  callbacks.output({ byteLength: 7, timestamp: 12 });
  await replay.close();
  expect(encoded).toEqual([{ frame: 10, keyFrame: true }, { frame: 12, keyFrame: false }]);
  expect(writes).toEqual([10, 12]);
  expect(replay.stats).toMatchObject({ submittedFrames: 2, droppedFrames: 1, encodedChunks: 2, encodedBytes: 12 });
});
