import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildUiBundle, createUiAssetManager, enrichUiBuildFileSystemError } from "./ui-build";

function createFakeClock() {
  let nextTimerId = 1;
  let nowMs = 0;
  const timers = new Map<number, { runAt: number; callback: () => void }>();
  function setTimeout(callback: () => void, delay?: number) {
    const timerId = nextTimerId++;
    timers.set(timerId, { runAt: nowMs + Number(delay ?? 0), callback });
    return timerId;
  }
  function clearTimeout(timerId: number) {
    timers.delete(timerId);
  }
  function advanceBy(durationMs: number) {
    const targetMs = nowMs + durationMs;
    while (true) {
      const nextTimer = [...timers.entries()].sort((left, right) => left[1].runAt - right[1].runAt)[0];
      if (!nextTimer || nextTimer[1].runAt > targetMs) {
        break;
      }

      nowMs = nextTimer[1].runAt;
      timers.delete(nextTimer[0]);
      nextTimer[1].callback();
    }

    nowMs = targetMs;
  }
  return { setTimeout, clearTimeout, advanceBy };
}

function parseSourceMapSources(text: string) {
  const value: unknown = JSON.parse(text);
  if (value === null || typeof value !== "object" || !Array.isArray(Reflect.get(value, "sources"))
    || !Reflect.get(value, "sources").every((source: unknown) => typeof source === "string")) {
    throw new Error("UI source map has invalid sources");
  }
  return [...Reflect.get(value, "sources")];
}

const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

setDefaultTimeout(15000);

describe("ui build", () => {
  test("rebuilds when dist ui directory already exists", async () => {
    const uiOutDir = path.resolve(process.cwd(), "dist/ui");
    mkdirSync(uiOutDir, { recursive: true });

    await buildUiBundle();

    expect(existsSync(path.join(uiOutDir, "index.html"))).toBe(true);
    expect(createUiAssetManager().resolveAsset("/ide")).toBe(path.join(uiOutDir, "index.html"));
  });

  test("emits external source maps in development build", async () => {
    await buildUiBundle();

    const uiOutDir = path.resolve(process.cwd(), "dist/ui");
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");
    const sourceMapSources = parseSourceMapSources(readFileSync(mapPath, "utf8"));

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(true);
    expect(readFileSync(jsPath, "utf8")).toContain("//# sourceMappingURL=main.js.map");
    expect(sourceMapSources.some((source) => source.replaceAll("\\", "/").includes("harness/ui/src/app.tsx"))).toBe(true);
  });

  test("omits source maps in production build", async () => {
    await buildUiBundle({ minify: true });

    const uiOutDir = path.resolve(process.cwd(), "dist/ui");
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(false);
    expect(readFileSync(jsPath, "utf8")).not.toContain("sourceMappingURL");
    expect(readFileSync(path.join(uiOutDir, "index.html"), "utf8")).toContain("<title>Hyperfocus Harness</title>");
    expect(readFileSync(path.join(uiOutDir, "index.html"), "utf8")).toContain('rel="icon" href="data:image/svg+xml');
  });

  test("adds cleanup guidance to out-of-space build failures", () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
    const enriched = enrichUiBuildFileSystemError(error);

    expect(enriched).toBeInstanceOf(Error);
    if (!(enriched instanceof Error)) throw new Error("Expected enriched UI build failure to be an Error");
    expect(enriched.message).toContain("filesystem is out of space");
    expect(enriched.message).toContain(".local/branchfs");
  });

  test("debounces watch storms and publishes live reload revision only after successful rebuild", async () => {
    const clock = createFakeClock();
    const buildCalls: string[] = [];
    let watcherListener: ((changedPath?: string) => void) | undefined;
    let failNextBuild = false;
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const manager = createUiAssetManager({
        debounceScheduleMs: [1000, 1500, 2000, 2500, 5000, 10000, 15000],
        timerApi: {
          setTimeout: clock.setTimeout,
          clearTimeout: clock.clearTimeout
        },
        isTrackedFile: (changedPath) => changedPath?.endsWith("app.tsx") === true,
        async buildUiBundle() {
          if (failNextBuild) {
            failNextBuild = false;
            throw new Error("broken intermediate edit");
          }

          buildCalls.push(`build-${buildCalls.length + 1}`);
        },
        watchSourceDir(_sourceDir, listener) {
          watcherListener = listener;
          return {
            close() {}
          };
        }
      });

      manager.startWatching();
      watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
      watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
      watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));

      expect(buildCalls).toEqual([]);
      expect(manager.getLiveReloadState()).toEqual({
        revision: 0,
        building: false,
        pending: true
      });

      clock.advanceBy(1999);
      await flushMicrotasks();
      expect(buildCalls).toEqual([]);

      clock.advanceBy(1);
      await flushMicrotasks();
      expect(buildCalls).toEqual(["build-1"]);
      expect(manager.getLiveReloadState()).toEqual({
        revision: 1,
        building: false,
        pending: false
      });

      failNextBuild = true;
      watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
      clock.advanceBy(1000);
      await flushMicrotasks();
      expect(buildCalls).toEqual(["build-1"]);
      expect(manager.getLiveReloadState()).toEqual({
        revision: 1,
        building: false,
        pending: false
      });
      manager.dispose();
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("uses independent backoff reset after each successful live reload build", async () => {
    const clock = createFakeClock();
    const buildCalls: string[] = [];
    let watcherListener: ((changedPath?: string) => void) | undefined;
    const manager = createUiAssetManager({
      debounceScheduleMs: [1000, 1500],
      timerApi: {
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout
      },
      isTrackedFile: (changedPath) => changedPath?.endsWith("app.tsx") === true,
      async buildUiBundle() {
        buildCalls.push(`build-${buildCalls.length + 1}`);
      },
      watchSourceDir(_sourceDir, listener) {
        watcherListener = listener;
        return {
          close() {}
        };
      }
    });

    manager.startWatching();
    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
    clock.advanceBy(1499);
    await flushMicrotasks();
    expect(buildCalls).toEqual([]);
    clock.advanceBy(1);
    await flushMicrotasks();
    expect(buildCalls).toEqual(["build-1"]);

    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
    clock.advanceBy(1000);
    await flushMicrotasks();
    expect(buildCalls).toEqual(["build-1", "build-2"]);
    manager.dispose();
  });

  test("ignores test, context, and agent metadata watch events", async () => {
    const buildCalls: string[] = [];
    let watcherListener: ((changedPath?: string) => void) | undefined;
    const manager = createUiAssetManager({
      isTrackedFile: (changedPath) => changedPath !== undefined,
      async buildUiBundle() {
        buildCalls.push(`build-${buildCalls.length + 1}`);
      },
      watchSourceDir(_sourceDir, listener) {
        watcherListener = listener;
        return {
          close() {}
        };
      }
    });

    manager.startWatching();
    watcherListener?.(path.resolve(process.cwd(), "docs/harness/notes.md"));
    watcherListener?.(path.resolve(process.cwd(), ".agent/runtime.json"));
    watcherListener?.(path.resolve(process.cwd(), ".agents/skills/caveman/SKILL.md"));
    watcherListener?.(path.resolve(process.cwd(), "AGENTS.md"));
    watcherListener?.(path.resolve(process.cwd(), "nested/agents.md"));
    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.test.tsx"));
    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/components/chat-panel.integration.test.tsx"));
    watcherListener?.(path.resolve(process.cwd(), "packages/ai-core/src/harness/mode-intent.test.ts"));
    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/utils/tests/test-harness.ts"));
    await flushMicrotasks();
    expect(buildCalls).toEqual([]);

    watcherListener?.(path.resolve(process.cwd(), "apps/harness/ui/src/app.tsx"));
    await flushMicrotasks();
    expect(buildCalls).toEqual(["build-1"]);
    manager.dispose();
  });

  test("rebuilds for untracked UI source files", async () => {
    const buildCalls: string[] = [];
    let watcherListener: ((changedPath?: string) => void) | undefined;
    const untrackedSourcePath = path.resolve(process.cwd(), "apps/harness/ui/src/.tmp-live-reload-untracked-source.ts");
    writeFileSync(untrackedSourcePath, "export const liveReloadProbe = true;\n");

    try {
      const manager = createUiAssetManager({
        async buildUiBundle() {
          buildCalls.push(`build-${buildCalls.length + 1}`);
        },
        watchSourceDir(_sourceDir, listener) {
          watcherListener = listener;
          return {
            close() {}
          };
        }
      });

      manager.startWatching();
      watcherListener?.(untrackedSourcePath);
      await flushMicrotasks();

      expect(buildCalls).toEqual(["build-1"]);
      manager.dispose();
    } finally {
      rmSync(untrackedSourcePath, { force: true });
    }
  });

  test("watches canonical AI core source as a UI dependency and ignores untracked output", async () => {
    const buildCalls: string[] = [];
    const watchedDirs: string[] = [];
    const listeners: Array<(changedPath?: string) => void> = [];
    const manager = createUiAssetManager({
      isTrackedFile: (changedPath) => changedPath?.includes(path.join("ai-core", "src", "harness")) === true,
      async buildUiBundle() {
        buildCalls.push(`build-${buildCalls.length + 1}`);
      },
      watchSourceDir(sourceDir, listener) {
        watchedDirs.push(sourceDir);
        listeners.push(listener);
        return {
          close() {}
        };
      }
    });

    manager.startWatching();
    expect(watchedDirs.some((sourceDir) => sourceDir.endsWith(path.join("harness", "ui")))).toBe(true);
    expect(watchedDirs.some((sourceDir) => sourceDir.endsWith(path.join("ai-core", "src", "harness")))).toBe(true);

    listeners.forEach((listener) => listener(path.resolve(process.cwd(), "dist/ui/main.js")));
    await flushMicrotasks();
    expect(buildCalls).toEqual([]);

    listeners.at(1)?.(path.resolve(process.cwd(), "packages/ai-core/src/harness/protocol.ts"));
    await flushMicrotasks();
    expect(buildCalls).toEqual(["build-1"]);
    manager.dispose();
  });
});
