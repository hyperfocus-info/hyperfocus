import { expect, test } from "bun:test";
import { createFontFaceFixture, createHtmlImageElementFixture } from "../test-support/dom.ts";
import {
  createAssetLoader,
  createImageAssetTask,
  createSmoothedAssetProgress,
  hydrateFonts,
  progressFromLoadEvent,
  runAssetLoaderRafLoop
} from "./loader.ts";

test("font hydration isolates slow and failed font faces", async () => {
  const fonts = {
    load(font: string) {
      if (font.includes("Ready")) return Promise.resolve([createFontFaceFixture("Ready")]);
      if (font.includes("Broken")) return Promise.reject(new Error("bad font"));
      return new Promise<FontFace[]>(() => {});
    },
  };
  const results = await hydrateFonts([
    { font: "16px Ready" },
    { font: "16px Broken" },
    { font: "16px Slow", timeoutMs: 1 },
  ], { fonts });
  expect(results.map((result) => result.status)).toEqual(["loaded", "failed", "timed-out"]);
  await expect(hydrateFonts([{ font: "16px Broken", required: true }], { fonts })).rejects.toThrow("bad font");
});

test("asset loader keeps tasks lazy until requested", async () => {
  let started = false;
  const loader = createAssetLoader([
    {
      id: "hero",
      load() {
        started = true;
        return "ready";
      }
    }
  ]);

  expect(started).toBe(false);
  expect(loader.snapshot().status).toBe("idle");

  const result = await loader.loadAsset("hero", (value) => {
    if (typeof value !== "string") throw new TypeError("hero asset must be a string");
    return value;
  });
  expect(result).toBe("ready");
  expect(started).toBe(true);
  expect(loader.snapshot().status).toBe("loaded");
  expect(loader.snapshot().actualProgress).toBe(1);
});

test("asset scheduling starts critical audio feeds before background image work", async () => {
  const order: string[] = [];
  const loader = createAssetLoader([
    { id: "background", priority: "background", load: () => { order.push("background"); } },
    { id: "audio-feed", priority: "critical-audio", load: () => { order.push("audio-feed"); } },
    { id: "normal", load: () => { order.push("normal"); } },
  ], { concurrency: 1 });
  await loader.load();
  expect(order).toEqual(["audio-feed", "normal", "background"]);
});

test("asset loader reports weighted task progress", async () => {
  let release: (() => void) | undefined;
  const snapshots: number[] = [];
  const loader = createAssetLoader([
    {
      id: "big",
      weight: 3,
      async load(context) {
        context.reportProgress(0.5);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return "big";
      }
    },
    {
      id: "small",
      weight: 1,
      load() {
        return "small";
      }
    }
  ], {
    concurrency: 1,
    onSnapshot(snapshot) {
      snapshots.push(snapshot.actualProgress);
    }
  });

  const promise = loader.load();
  await waitMicrotask();
  expect(snapshots.some((progress) => progress > 0.35 && progress < 0.5)).toBe(true);
  release?.();
  await promise;
  expect(loader.snapshot().actualProgress).toBe(1);
});

test("smoothed asset progress stays behind actual progress", () => {
  let now = 0;
  const smoother = createSmoothedAssetProgress({
    now: () => now,
    speed: 4,
    minAdvancePerSecond: 0
  });
  const base = {
    status: "loading" as const,
    total: 1,
    started: 1,
    completed: 0,
    failed: 0,
    active: 1,
    loadedWeight: 0,
    weightedProgress: 0.8,
    totalWeight: 1,
    actualProgress: 0.8,
    visibleProgress: 0.8,
    label: "Loading",
    activeLabel: "Loading",
    startedAt: 1,
    updatedAt: 1
  };

  expect(smoother.update(base).visibleProgress).toBe(0);
  now = 50;
  const next = smoother.update(base);
  expect(next.visibleProgress).toBeGreaterThan(0);
  expect(next.visibleProgress).toBeLessThan(0.8);
});

test("image task can resolve null for optional missing images", async () => {
  const task = createImageAssetTask({
    id: "optional",
    src: "/missing.png",
    allowFailure: true,
    imageFactory: () => createHtmlImageElementFixture("error")
  });

  const result = await task.load({
    id: "optional",
    reportProgress() {}
  });

  expect(result).toBeNull();
});

test("progress event helper ignores unknown totals", () => {
  expect(progressFromLoadEvent({ loaded: 20, total: 100 })).toBe(0.2);
  expect(progressFromLoadEvent({ loaded: 20, total: 0 })).toBeUndefined();
  expect(progressFromLoadEvent({})).toBeUndefined();
});

test("asset loader isolates progress observer failures", async () => {
  const loader = createAssetLoader([{ id: "safe", load: () => "loaded" }], {
    onSnapshot() {
      throw new Error("observer failed");
    }
  });
  await expect(loader.loadAsset("safe")).resolves.toBe("loaded");
  expect(loader.snapshot().status).toBe("loaded");
  expect(() => createAssetLoader([], { concurrency: Number.NaN })).toThrow("concurrency");
});

test("image tasks reject promptly when aborted", async () => {
  const controller = new AbortController();
  const task = createImageAssetTask({
    id: "slow",
    src: "/slow.png",
    imageFactory: () => createHtmlImageElementFixture("pending")
  });
  const promise = task.load({ id: "slow", signal: controller.signal, reportProgress() {} });
  controller.abort(new Error("cancelled"));
  await expect(promise).rejects.toThrow("cancelled");
});

test("asset loader RAF loop marks itself stopped when rendering throws", () => {
  let callback: FrameRequestCallback | undefined;
  const loop = runAssetLoaderRafLoop({
    read: () => ({
      status: "loading", total: 1, started: 1, completed: 0, failed: 0, active: 1,
      loadedWeight: 0, weightedProgress: 0, totalWeight: 1, actualProgress: 0,
      visibleProgress: 0, label: "", activeLabel: "", startedAt: 0, updatedAt: 0
    }),
    render() {
      throw new Error("render failed");
    },
    requestAnimationFrame(next) {
      callback = next;
      return 1;
    },
    cancelAnimationFrame() {}
  });
  expect(loop.isRunning()).toBe(true);
  expect(() => callback?.(16)).toThrow("render failed");
  expect(loop.isRunning()).toBe(false);
});

function waitMicrotask() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}
