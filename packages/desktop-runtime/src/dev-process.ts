import { statSync, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { createDevHmrBatcher } from "./dev-server";
import { createDevWatchState } from "./dev-watch-state";
export { createDevWatchState } from "./dev-watch-state";
import { spawnBackgroundProcess } from "./process/spawn";
import { terminateProcessTree, type OwnedProcess } from "./process/terminate";

export type DevProcessWatchPath = string | { path: string; recursive?: boolean };
export type RunDevProcessOptions = {
  cmd: readonly string[];
  cwd: string;
  watchPaths: readonly DevProcessWatchPath[];
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  debounceScheduleMs?: readonly number[];
  isWatchPath?: (changedPath: string) => boolean;
};

/** Run an owned backend with scoped watches and ordered process replacement. */
export async function runDevProcess(options: RunDevProcessOptions): Promise<number> {
  if (options.watchPaths.length > 0 && (options.cmd.includes("--hot") || options.cmd.includes("--watch"))) {
    throw new Error("runDevProcess owns watching; remove --hot/--watch from cmd.");
  }
  if (options.signal?.aborted) return 0;
  let child: OwnedProcess | undefined;
  let stopping = false;
  let replacing = false;
  let pending = Promise.resolve();
  let resolveExit!: (code: number) => void;
  let rejectExit!: (error: unknown) => void;
  const exited = new Promise<number>((resolve, reject) => { resolveExit = resolve; rejectExit = reject; });
  const watchers: FSWatcher[] = [];
  const launch = () => {
    const next = spawnBackgroundProcess({
      cmd: options.cmd, cwd: options.cwd, env: options.env,
      stdin: "ignore", stdout: "inherit", stderr: "inherit",
    });
    child = next;
    void next.exited.then((code) => {
      if (child !== next || replacing || stopping) return;
      if (code === 0 || options.watchPaths.length === 0) resolveExit(code);
      else console.error(`[dev-process] Backend exited with code ${code}; waiting for a source edit to restart.`);
    }, rejectExit);
  };
  const restart = (reasons: readonly string[]) => {
    pending = pending.then(async () => {
      if (stopping) return;
      console.info(`[dev-process] Restarting after source changes: ${reasons.join(", ")}`);
      replacing = true;
      if (child) await terminateProcessTree({ process: child });
      child = undefined;
      replacing = false;
      if (!stopping) launch();
    });
    return pending;
  };
  const batcher = createDevHmrBatcher({
    scheduleMs: options.debounceScheduleMs,
    reload: restart,
    onError: rejectExit,
  });
  const stop = () => {
    stopping = true;
    batcher.cancel();
    watchers.forEach((watcher) => watcher.close());
    void pending.then(async () => {
      if (child) await terminateProcessTree({ process: child });
      resolveExit(0);
    }, rejectExit).catch(rejectExit);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  options.signal?.addEventListener("abort", stop, { once: true });
  try {
    const uniquePaths = new Set<string>();
    for (const entry of options.watchPaths) {
      const source = path.resolve(options.cwd, typeof entry === "string" ? entry : entry.path);
      const directory = statSync(source).isDirectory();
      const recursive = directory && (typeof entry === "string" ? true : entry.recursive ?? true);
      const key = `${source}:${recursive}`;
      if (uniquePaths.has(key)) continue;
      uniquePaths.add(key);
      // Snapshot all eligible source metadata before consulting dependency filters:
      // a filter may reject directories or read files to refresh its import graph.
      const accepts = (file: string) => !isGeneratedDevPath(directory ? path.relative(source, file) : path.basename(file));
      const state = createDevWatchState({ source, recursive, accepts });
      const watcher = watch(source, { recursive }, (_event, filename) => {
        const changedPath = directory ? path.resolve(source, filename?.toString() ?? "") : source;
        const relativePath = directory ? path.relative(source, changedPath) : path.basename(source);
        if (isGeneratedDevPath(relativePath)) return;
        try {
          for (const file of state.changes(changedPath)) {
            if (options.isWatchPath?.(file) !== false) batcher.request(file);
          }
        }
        catch (error) { rejectExit(error); }
      });
      watcher.on("error", rejectExit);
      watchers.push(watcher);
    }
    if (!stopping) launch();
    return await exited;
  } finally {
    stopping = true;
    batcher.cancel();
    watchers.forEach((watcher) => watcher.close());
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    options.signal?.removeEventListener("abort", stop);
    await pending.catch(() => undefined);
    if (child) await terminateProcessTree({ process: child });
  }
}

function isGeneratedDevPath(filePath: string) {
  return /(?:^|[/\\])(?:\.local|\.git|node_modules|dist|\.bun)(?:[/\\]|$)/.test(filePath)
    || /\.(?:test|spec)\.[cm]?[tj]sx?$/.test(filePath)
    || filePath.endsWith(".tsbuildinfo");
}
