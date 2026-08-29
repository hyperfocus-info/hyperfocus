import { expect, test } from "bun:test";
import { createStagedUploadQueue } from "./upload-queue.ts";

test("staged uploads preserve order and amortize bytes across frames", async () => {
  const calls: string[] = [];
  const queue = createStagedUploadQueue();
  for (const [id, byteLength] of [["a", 6], ["b", 6], ["c", 2]] as const) {
    queue.enqueue({ id, byteLength, upload: () => { calls.push(id); } });
  }
  expect(await queue.processFrame({ maxBytes: 10 })).toMatchObject({ uploadedTasks: 1, uploadedBytes: 6, remainingTasks: 2 });
  expect(await queue.processFrame({ maxBytes: 10 })).toMatchObject({ uploadedTasks: 2, uploadedBytes: 8, remainingTasks: 0 });
  expect(calls).toEqual(["a", "b", "c"]);
});

test("oversized first upload cannot starve and failures are delegated", async () => {
  const errors: string[] = [];
  const queue = createStagedUploadQueue({ maxQueuedBytes: 20, onError: (task) => errors.push(task.id) });
  expect(queue.enqueue({ id: "large", byteLength: 15, upload: () => {} })).toBe(true);
  expect(queue.enqueue({ id: "overflow", byteLength: 6, upload: () => {} })).toBe(false);
  expect((await queue.processFrame({ maxBytes: 5 })).uploadedBytes).toBe(15);
  queue.enqueue({ id: "bad", byteLength: 1, upload: () => { throw new Error("bad"); } });
  expect((await queue.processFrame({ maxBytes: 5 })).failedTasks).toBe(1);
  expect(errors).toEqual(["bad"]);
});
