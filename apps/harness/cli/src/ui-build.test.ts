import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildUiBundle, createUiAssetManager, enrichUiBuildFileSystemError, prepareUiOutDir } from "./ui-build";

test("preparing a rebuild retains the last served page", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "harness-rebuild-retention-"));
  try {
    writeFileSync(path.join(dir, "index.html"), "last working page");
    await prepareUiOutDir({ outputDir: dir });
    expect(readFileSync(path.join(dir, "index.html"), "utf8")).toBe("last working page");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("native UI watcher ignores reads and access-time changes but rebuilds edited source", async () => {
  const source = mkdtempSync(path.join(os.tmpdir(), "harness-watch-read-")), file = path.join(source, "main.tsx");
  writeFileSync(file, "original");
  const baseline = new Date("2020-01-01T00:00:00Z");
  utimesSync(file, baseline, baseline);
  let builds = 0;
  const manager = createUiAssetManager({ assetRoot: source, buildWhenMissing: false, watchedSourceDirs: [source],
    isTrackedFile: () => true, buildUiBundle: async () => { builds++; } });
  try {
    manager.startWatching();
    readFileSync(file); utimesSync(file, new Date(), baseline);
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(builds).toBe(0);
    writeFileSync(file, "edited source");
    const deadline = Date.now() + 2000;
    while (!builds && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(builds).toBe(1);
  } finally { manager.dispose(); rmSync(source, { recursive: true, force: true }); }
});

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
  const builtUiDir = mkdtempSync(path.join(os.tmpdir(), "harness-ui-build-"));
  afterAll(() => rmSync(builtUiDir, { recursive: true, force: true }));
  test("refreshes existing source assets once at startup and watches shared UI changes", async () => {
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "harness-stale-ui-"));
    writeFileSync(path.join(assetRoot, "index.html"), "stale source build");
    const clock = createFakeClock();
    const listeners = new Map<string, (changedPath?: string) => void>();
    let builds = 0;
    const manager = createUiAssetManager({
      assetRoot,
      timerApi: clock,
      async buildUiBundle() { builds += 1; },
      watchSourceDir(directory, listener) { listeners.set(directory, listener); return { close() {} }; },
    });
    try {
      await manager.ensureBuilt();
      await manager.ensureBuilt();
      expect(builds).toBe(1);
      manager.startWatching();
      expect([...listeners.keys()].every(existsSync)).toBe(true);
      const sharedUi = path.resolve(process.cwd(), "packages/ui/src");
      expect(listeners.has(sharedUi)).toBe(true);
      listeners.get(sharedUi)?.(path.join(sharedUi, "workbench/panel-group.tsx"));
      clock.advanceBy(1);
      await flushMicrotasks();
      expect(builds).toBe(2);
    } finally { manager.dispose(); rmSync(assetRoot, { recursive: true, force: true }); }
  });

  test("rebuilds when dist ui directory already exists", async () => {
    const uiOutDir = builtUiDir;
    mkdirSync(uiOutDir, { recursive: true });

    await buildUiBundle({ outputDir: uiOutDir });

    expect(existsSync(path.join(uiOutDir, "index.html"))).toBe(true);
    expect(createUiAssetManager({ assetRoot: uiOutDir }).resolveAsset("/ide")).toBe(path.join(uiOutDir, "index.html"));
    expect(createUiAssetManager({ assetRoot: uiOutDir }).resolveAsset("/swarm")).toBe(path.join(uiOutDir, "index.html"));
  });

  test("emits external source maps in development build", async () => {
    await buildUiBundle({ outputDir: builtUiDir });

    const uiOutDir = builtUiDir;
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");
    const sourceMapSources = readdirSync(uiOutDir).filter(file => file.endsWith(".js.map"))
      .flatMap(file => parseSourceMapSources(readFileSync(path.join(uiOutDir, file), "utf8")));

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(true);
    expect(readFileSync(jsPath, "utf8")).toContain("//# sourceMappingURL=main.js.map");
    expect(sourceMapSources.some((source) => source.replaceAll("\\", "/").includes("harness/ui/src/app.tsx"))).toBe(true);
  });

  test("omits source maps in production build", async () => {
    await buildUiBundle({ minify: true, outputDir: builtUiDir });

    const uiOutDir = builtUiDir;
    const jsPath = path.join(uiOutDir, "main.js");
    const mapPath = path.join(uiOutDir, "main.js.map");

    expect(existsSync(jsPath)).toBe(true);
    expect(existsSync(mapPath)).toBe(false);
    expect(readFileSync(jsPath, "utf8")).not.toContain("sourceMappingURL");
    expect(readFileSync(path.join(uiOutDir, "index.html"), "utf8")).toContain("<title>Hyperfocus Harness</title>");
    expect(readFileSync(path.join(uiOutDir, "index.html"), "utf8")).toContain('rel="icon" type="image/svg+xml" href="./brand/favicon.svg"');
    expect(readFileSync(path.join(uiOutDir, "brand", "favicon.svg"), "utf8")).toContain("<svg");
    expect(existsSync(path.join(uiOutDir, "brand", "site.webmanifest"))).toBe(true);
    expect(readFileSync(path.join(uiOutDir, "index.html"), "utf8")).toContain('<script type="module"');
    const chunks = readdirSync(uiOutDir).filter(file => /^(ide-workbench|terminal-drawer|swarm-page|xterm-renderer)-.*\.js$/.test(file));
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    const manager = createUiAssetManager({ assetRoot: uiOutDir, buildWhenMissing: false });
    for (const chunk of chunks) expect(manager.resolveAsset(`/${chunk}`)).toBe(path.join(uiOutDir, chunk));
    expect(manager.resolveAsset("/../private.js")).toBeUndefined();
    manager.dispose();
  });

  test("adds cleanup guidance to out-of-space build failures", () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
    const enriched = enrichUiBuildFileSystemError(error);

    expect(enriched).toBeInstanceOf(Error);
    if (!(enriched instanceof Error)) throw new Error("Expected enriched UI build failure to be an Error");
    expect(enriched.message).toContain("filesystem is out of space");
    expect(enriched.message).toContain(".local/branchfs");
  });

  test("serves a supplied packaged asset root without invoking the source build", async () => {
    const assetRoot = mkdtempSync(path.join(os.tmpdir(), "harness-packaged-ui-"));
    const indexPath = path.join(assetRoot, "index.html");
    writeFileSync(indexPath, "<title>Packaged Harness</title>");
    let buildCalled = false;
    try {
      const manager = createUiAssetManager({
        assetRoot,
        buildWhenMissing: false,
        async buildUiBundle() {
          buildCalled = true;
        }
      });

      await manager.ensureBuilt();

      expect(manager.resolveAsset("/")).toBe(indexPath);
      expect(buildCalled).toBe(false);
      manager.dispose();
    } finally {
      rmSync(assetRoot, { recursive: true, force: true });
    }
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
