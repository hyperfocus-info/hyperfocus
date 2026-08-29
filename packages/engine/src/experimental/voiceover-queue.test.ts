import { expect, test } from "bun:test";
import { createVoiceoverQueue } from "./voiceover-queue.ts";

test("voiceover queue speaks sequentially and bounds pending dialogue", async () => {
  const spoken: string[] = [];
  const releases: (() => void)[] = [];
  const queue = createVoiceoverQueue({
    maxQueued: 1,
    driver: {
      supported: true, local: true,
      async speak(text) { spoken.push(text); await new Promise<void>((resolve) => releases.push(resolve)); },
      cancel() {}
    }
  });
  expect(queue.enqueue("one")).toBe(true);
  expect(queue.enqueue("two")).toBe(true);
  expect(queue.enqueue("three")).toBe(false);
  releases.shift()!();
  for (let attempt = 0; attempt < 5 && releases.length === 0; attempt += 1) await Promise.resolve();
  expect(releases).toHaveLength(1);
  releases.shift()!();
  await queue.whenIdle();
  expect(spoken).toEqual(["one", "two"]);
});

test("voiceover queue gates drivers that cannot guarantee local synthesis", () => {
  const queue = createVoiceoverQueue({ driver: { supported: true, local: false, async speak() {}, cancel() {} } });
  expect(queue.available).toBe(false);
  expect(() => queue.enqueue("private dialogue")).toThrow("local");
});
