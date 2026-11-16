import { buildConfiguredBrand } from '@hyperfocus/branding/config';
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { createDevWatchState } from "@hyperfocus/desktop-runtime/dev-process";
import { existsSync, watch } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDevHmrBatcher, DEFAULT_DEV_HMR_DEBOUNCE_SCHEDULE_MS } from "@hyperfocus/desktop-runtime/dev-server";
import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";
import { createTimerApi, type TimerApi } from "./server/runtime/timer-api";

const harnessRoot = path.resolve(import.meta.dir, "..", "..");
const repoRoot = path.resolve(harnessRoot, "..", "..");
const uiSourceDir = path.resolve(harnessRoot, "ui");
const aiCoreSourceDir = path.resolve(repoRoot, "packages", "ai-core", "src", "harness");
const sharedUiSourceDir = path.resolve(repoRoot, "packages", "ui", "src");
const sharedUiBuildDir = path.resolve(repoRoot, "packages", "ui", "build-tools");
const liveUiSourceDirs = [uiSourceDir, aiCoreSourceDir, sharedUiSourceDir, sharedUiBuildDir];
const uiOutDir = path.resolve(repoRoot, "dist/ui");
const uiEntryPoint = path.resolve(uiSourceDir, "src/main.tsx");
const contextSourceDir = path.resolve(repoRoot, "docs", "harness");

type UiBuildOptions = {
  minify?: boolean;
  outputDir?: string;
};

type LiveReloadState = {
  revision: number;
  building: boolean;
  pending: boolean;
};

type CreateUiAssetManagerOptions = {
  assetRoot?: string;
  buildWhenMissing?: boolean;
  debounceMs?: number;
  debounceScheduleMs?: readonly number[];
  timerApi?: TimerApi;
  buildUiBundle?: (options?: UiBuildOptions) => Promise<void>;
  isTrackedFile?: (changedPath: string | undefined) => boolean;
  watchedSourceDirs?: readonly string[];
  watchSourceDir?: (
    sourceDir: string,
    listener: (changedPath?: string) => void
  ) => {
    close: () => void;
  };
};

export async function buildUiBundle({ minify = false, outputDir = uiOutDir }: UiBuildOptions = {}) {
  const start = performance.now();

  try {
    await prepareUiOutDir({ outputDir });

    const result = await Bun.build({
      entrypoints: [uiEntryPoint],
      outdir: outputDir,
      format: "esm",
      splitting: true,
      naming: { entry: "[name].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" },
      target: "browser",
      sourcemap: minify ? "none" : "external",
      minify,
      metafile: true,
      plugins: [
        stylexSolidPlugin({
          cssOutputFile: "main.css",
          useCSSLayers: { before: ["reset"], prefix: "hyperfocus" },
          importSources: ["@stylexjs/stylex"]
        })
      ]
    });

    if (!result.success) {
      throw new AggregateError(
        result.logs.map((log) => new Error(log.message)),
        "UI build failed"
      );
    }

    if (!minify) {
      await appendDevSourceMapReference(outputDir);
    } else {
      await rm(path.join(outputDir, "main.js.map"), { force: true });
    }

    await writeFile(
      path.join(outputDir, "index.html"),
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hyperfocus Harness</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230f766e'/%3E%3Cpath d='M18 18v28M46 18v28M18 32h28' stroke='%23f8fafc' stroke-width='7' stroke-linecap='round'/%3E%3C/svg%3E" />
    <link rel="stylesheet" href="./main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`
    );
    await buildConfiguredBrand({configPath:path.join(uiSourceDir,'brand.json'),directory:path.join(outputDir,'brand'),htmlPath:path.join(outputDir,'index.html')});
  } catch (error) {
    throw enrichUiBuildFileSystemError(error);
  }

  console.log(`Bundled page in ${Math.round(performance.now() - start)}ms: ${path.join(outputDir, "index.html")}`);
}

export async function prepareUiOutDir(options: { outputDir?: string } = {}) {
  // Keep the last working page available while compilation is pending or fails.
  await mkdir(options.outputDir ?? uiOutDir, { recursive: true });
}

export function enrichUiBuildFileSystemError(error: unknown) {
  if (!hasNodeErrorCode(error, "ENOSPC")) {
    return error;
  }
  const message =
    "UI build failed because the filesystem is out of space. Free disk space or clean temporary harness artifacts such as .local/branchfs, .local/test-data, and dist/ui, then restart the harness.";
  return new Error(message, { cause: error });
}

function isNodeErrorCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  if (isNodeErrorCode(error, code)) {
    return true;
  }
  if (error instanceof AggregateError) {
    return error.errors.some((entry) => hasNodeErrorCode(entry, code));
  }
  return error instanceof Error && error.cause !== undefined && hasNodeErrorCode(error.cause, code);
}

async function appendDevSourceMapReference(outputDir: string) {
  const jsPath = path.join(outputDir, "main.js");
  const sourceMapReference = "//# sourceMappingURL=main.js.map";
  const contents = await readFile(jsPath, "utf8");

  if (contents.includes(sourceMapReference)) {
    return;
  }

  await writeFile(jsPath, `${contents.trimEnd()}\n${sourceMapReference}\n`);
}

export function createUiAssetManager(options: CreateUiAssetManagerOptions = {}) {
  const assetRoot = path.resolve(options.assetRoot ?? process.env.HARNESS_UI_OUTPUT_DIR ?? uiOutDir);
  const buildWhenMissing = options.buildWhenMissing ?? true;
  const debounceScheduleMs = options.debounceScheduleMs ?? [options.debounceMs ?? 0];
  const timerApi = options.timerApi ?? createTimerApi();
  const buildUi = options.buildUiBundle ?? ((buildOptions?: UiBuildOptions) => buildUiBundle({ ...buildOptions, outputDir: assetRoot }));
  const shouldRebuildForPath = options.isTrackedFile ?? createLiveReloadSourcePredicate();
  const watchedSourceDirs = options.watchedSourceDirs ?? liveUiSourceDirs;
  const watchSourceDir =
    options.watchSourceDir ??
    ((sourceDir: string, listener: (changedPath?: string) => void) => {
      const state = createDevWatchState({ source: sourceDir, recursive: true,
        accepts: (file) => !isIgnoredLiveReloadWatchPath(file) });
      return watch(sourceDir, { recursive: true }, (_eventType, filename) => {
        for (const changed of state.changes(resolveWatchEventPath(sourceDir, filename))) listener(changed);
      });
    });
  let buildInFlight: Promise<void> | undefined;
  let rebuildQueued = false;
  let watchers: Array<{ close(): void }> = [];
  let revision = 0;
  let initialBuildPending = buildWhenMissing;

  const runBuild = async () => {
    try {
      await buildUi();
      revision += 1;
    } catch (error) {
      console.error(error);
    } finally {
      buildInFlight = undefined;
      if (rebuildQueued) {
        rebuildQueued = false;
        queueBuild();
      }
    }
  };

  const scheduleBuild = () => {
    if (buildInFlight) {
      rebuildQueued = true;
      return buildInFlight;
    }

    buildInFlight = runBuild();
    return buildInFlight;
  };

  const rebuildBatcher = createDevHmrBatcher({
    scheduleMs: debounceScheduleMs,
    timerApi,
    reload: scheduleBuild,
    onError: (error) => console.error(error)
  });

  const queueBuild = () => {
    rebuildBatcher.request("source change");
  };

  return {
    async ensureBuilt() {
      if (initialBuildPending || !existsSync(path.join(assetRoot, "index.html"))) {
        if (!buildWhenMissing) {
          throw new Error(`Packaged Harness UI assets are missing from ${assetRoot}`);
        }
        await (buildInFlight ?? scheduleBuild());
        if (revision === 0) throw new Error("Initial Harness UI build failed; inspect the build error above.");
        initialBuildPending = false;
        return;
      }

      if (buildInFlight) {
        await buildInFlight;
      }
    },
    startWatching() {
      if (watchers.length > 0) {
        return;
      }

      watchers = watchedSourceDirs.map((sourceDir) => watchSourceDir(sourceDir, (changedPath) => {
        if (isIgnoredLiveReloadWatchPath(changedPath) || !shouldRebuildForPath(changedPath)) {
          return;
        }

        void queueBuild();
      }));
    },
    resolveAsset(pathname: string) {
      const relativePath = pathname === "/" || pathname === "/ide" || pathname === "/swarm" ? "index.html" : pathname.slice(1);
      const assetPath = path.resolve(assetRoot, relativePath);
      const relativeAssetPath = path.relative(assetRoot, assetPath);

      if (relativeAssetPath.startsWith("..") || path.isAbsolute(relativeAssetPath)) {
        return undefined;
      }

      if (!existsSync(assetPath)) {
        return undefined;
      }

      return assetPath;
    },
    getLiveReloadState(): LiveReloadState {
      return {
        revision,
        building: buildInFlight !== undefined,
        pending: rebuildBatcher.getState().pending || rebuildQueued
      };
    },
    dispose() {
      rebuildBatcher.cancel();
      watchers.forEach((watcher) => watcher.close());
      watchers = [];
    }
  };
}

export function createDevHmrDebounceSchedule() {
  return DEFAULT_DEV_HMR_DEBOUNCE_SCHEDULE_MS;
}

function resolveWatchEventPath(sourceDir: string, filename: string | Buffer | null) {
  if (!filename) {
    return undefined;
  }

  const relativePath = typeof filename === "string" ? filename : filename.toString();
  if (!relativePath) {
    return undefined;
  }

  return path.resolve(sourceDir, relativePath);
}

function isIgnoredLiveReloadWatchPath(changedPath: string | undefined) {
  if (!changedPath) {
    return false;
  }

  const resolvedPath = path.resolve(changedPath);
  // A checkout may itself live under .local (for example an isolated candidate).
  const relativeWatchPath = path.relative(repoRoot, resolvedPath);
  if (/(?:^|[/\\])(?:node_modules|dist|\.git|\.local|\.bun)(?:[/\\]|$)/.test(relativeWatchPath)) return true;
  if (isHarnessTestSourcePath(resolvedPath)) {
    return true;
  }

  if (isPathWithin(contextSourceDir, resolvedPath)) {
    return true;
  }

  const repoRelativePath = path.relative(repoRoot, resolvedPath);
  if (repoRelativePath === "" || repoRelativePath.startsWith("..") || path.isAbsolute(repoRelativePath)) {
    return false;
  }

  const segments = repoRelativePath.split(path.sep);
  const firstSegment = segments[0]?.toLowerCase();
  return firstSegment === ".agent" || firstSegment === ".agents" || path.basename(resolvedPath).toLowerCase() === "agents.md";
}

function isHarnessTestSourcePath(resolvedPath: string) {
  const repoRelativePath = path.relative(repoRoot, resolvedPath);
  if (repoRelativePath === "" || repoRelativePath.startsWith("..") || path.isAbsolute(repoRelativePath)) {
    return false;
  }

  const normalizedPath = normalizeGitPath(repoRelativePath).toLowerCase();
  const basename = path.basename(normalizedPath);
  return (
    /\.(?:test|spec)\.[cm]?[tj]sx?$/.test(basename) ||
    /\.integration\.test\.[cm]?[tj]sx?$/.test(basename) ||
    normalizedPath.includes("/test-support/") ||
    normalizedPath.includes("/utils/tests/") ||
    normalizedPath.includes("/__tests__/")
  );
}

function createLiveReloadSourcePredicate() {
  return (changedPath: string | undefined) => {
    if (!changedPath) {
      return false;
    }

    const resolvedPath = path.resolve(changedPath);
    const relativePath = normalizeRepoRelativePath(resolvedPath);
    if (!relativePath) {
      return false;
    }

    if (liveUiSourceDirs.some((directory) => isPathWithin(directory, resolvedPath))) {
      return existsSync(resolvedPath) || isGitTrackedFile(relativePath);
    }

    return isGitTrackedFile(relativePath);
  };
}

function isGitTrackedFile(relativePath: string) {
  const result = spawnBackgroundProcessSync({
    cmd: ["git", "ls-files", "--error-unmatch", "--", relativePath],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "ignore"
  });

  return result.exitCode === 0;
}

function normalizeRepoRelativePath(absolutePath: string) {
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return normalizeGitPath(relativePath);
}

function normalizeGitPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function isPathWithin(directory: string, candidatePath: string) {
  const relativePath = path.relative(directory, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
