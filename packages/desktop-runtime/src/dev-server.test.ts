import { describe, expect, test } from "bun:test";
import { createDevHmrBatcher, DEFAULT_DEV_HMR_DEBOUNCE_SCHEDULE_MS, injectDevLiveReloadScript, normalizeDevHmrSchedule } from "./dev-server";

function createFakeClock() {
  let nextTimerId = 1;
  let nowMs = 0;
  const timers = new Map<number, { callback: () => void; runAt: number }>();
  return {
    setTimeout(callback: () => void, delayMs = 0) {
      const timerId = nextTimerId++;
      timers.set(timerId, { callback, runAt: nowMs + delayMs });
      return timerId;
    },
    clearTimeout(timerId: number) {
      timers.delete(timerId);
    },
    advanceBy(durationMs: number) {
      const targetMs = nowMs + durationMs;
      while (true) {
        const next = [...timers.entries()].sort((left, right) => left[1].runAt - right[1].runAt)[0];
        if (!next || next[1].runAt > targetMs) break;
        nowMs = next[1].runAt;
        timers.delete(next[0]);
        next[1].callback();
      }
      nowMs = targetMs;
    }
  };
}

describe("development HMR batching", () => {
  test("backs off a save storm from 2.5 seconds to a 15 second ceiling", async () => {
    const clock = createFakeClock();
    const reloads: string[][] = [];
    const batcher = createDevHmrBatcher({
      reload(reasons) { reloads.push([...reasons]); },
      timerApi: clock
    });

    expect(DEFAULT_DEV_HMR_DEBOUNCE_SCHEDULE_MS).toEqual([2_500, 5_000, 10_000, 15_000]);
    batcher.request("one.ts");
    batcher.request("two.ts");
    batcher.request("three.ts");
    batcher.request("four.ts");
    clock.advanceBy(14_999);
    expect(reloads).toEqual([]);
    clock.advanceBy(1);
    await Promise.resolve();
    expect(reloads).toEqual([["one.ts", "two.ts", "three.ts", "four.ts"]]);
    expect(batcher.getState()).toMatchObject({ pending: false, nextDelayMs: 2_500 });
  });

  test("resets after reload and normalizes invalid schedules", async () => {
    const clock = createFakeClock();
    let reloadCount = 0;
    const batcher = createDevHmrBatcher({ reload() { reloadCount += 1; }, scheduleMs: [5], timerApi: clock });
    batcher.request("first");
    clock.advanceBy(5);
    batcher.request("second");
    clock.advanceBy(5);
    await Promise.resolve();
    expect(reloadCount).toBe(2);
    expect(normalizeDevHmrSchedule([Number.NaN, -2, 4.6])).toEqual([0, 5]);
    expect(normalizeDevHmrSchedule([])).toEqual([0]);
  });

  test("injects one origin-relative polling client before the closing body", () => {
    const html = injectDevLiveReloadScript("<html><body>Editor</body></html>");
    expect(html).toContain('fetch("/__dev/reload-state"');
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("</body>"));
  });
  test("retains a pending reload while an export defers it, then reloads exactly once", async () => {
    const script = injectDevLiveReloadScript("").replace(/^<script>|<\/script>$/g, "");
    const scheduled: Array<() => Promise<void>> = [];
    const events = new EventTarget(); let busy = true, revision = "0", reloads = 0;
    events.addEventListener("hyperfocus:before-dev-reload", event => { if (busy) event.preventDefault(); });
    new Function("fetch", "setTimeout", "location", "dispatchEvent", "Event", script)(
      async () => ({ ok: true, text: async () => revision }),
      (callback: () => Promise<void>) => scheduled.push(callback),
      { reload() { reloads += 1; } }, events.dispatchEvent.bind(events), Event,
    );
    for (let i = 0; i < 5 && !scheduled.length; i++) await Promise.resolve();
    revision = "1";
    await scheduled.shift()!(); expect(reloads).toBe(0);
    await scheduled.shift()!(); expect(reloads).toBe(0);
    busy = false;
    await scheduled.shift()!(); expect(reloads).toBe(1);
    await scheduled.shift()!(); expect(reloads).toBe(1);
  });
});
