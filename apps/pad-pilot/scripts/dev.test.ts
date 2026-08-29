import { describe, expect, it } from "bun:test";
import { createSerialRebuildQueue } from "./dev";

describe("createSerialRebuildQueue", () => {
  it("coalesces changes during a rebuild and never overlaps builds", async () => {
    const batches: string[][] = [];
    let active = 0;
    let maxActive = 0;
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = createSerialRebuildQueue(async (reasons) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      batches.push(reasons);
      if (batches.length === 1) {
        await firstBlocked;
      }
      active -= 1;
    });

    const running = queue.request("first");
    await Bun.sleep(5);
    queue.request("second");
    queue.request("third");
    releaseFirst?.();
    await running;
    await queue.whenIdle();

    expect(maxActive).toBe(1);
    expect(batches).toEqual([["first"], ["second", "third"]]);
  });
});
