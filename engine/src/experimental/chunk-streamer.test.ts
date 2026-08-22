import { expect, test } from "bun:test";
import { createBoundedChunkStreamer } from "./chunk-streamer.ts";

test("bounded chunk streamer deduplicates loads and limits concurrency", async () => {
  const releases: (() => void)[] = [];
  let active = 0, peak = 0;
  const streamer = createBoundedChunkStreamer({
    maxCachedChunks: 2, maxConcurrentLoads: 1,
    async load({ x, y }) {
      active += 1; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return `${x}:${y}`;
    }
  });
  const first = streamer.request(0, 0);
  expect(streamer.request(0, 0)).toBe(first);
  const second = streamer.request(1, 0);
  expect(streamer.stats()).toMatchObject({ active: 1, pending: 2, loads: 1 });
  releases.shift()!();
  expect(await first).toBe("0:0");
  await Promise.resolve();
  releases.shift()!();
  expect(await second).toBe("1:0");
  expect(peak).toBe(1);
});

test("bounded chunk streamer retains viewport chunks and evicts LRU overflow", async () => {
  const streamer = createBoundedChunkStreamer({ maxCachedChunks: 2, async load({ x, y }) { return x + y * 10; } });
  expect(await streamer.loadRegion({ minX: 0, minY: 0, maxX: 1, maxY: 0 })).toEqual([0, 1]);
  expect(await streamer.request(2, 0)).toBe(2);
  expect(streamer.stats()).toMatchObject({ cached: 2, evictions: 1 });
  expect(() => streamer.loadRegion({ minX: 0, minY: 0, maxX: 2, maxY: 0 })).toThrow("cache capacity");
});
