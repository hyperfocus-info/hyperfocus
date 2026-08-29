import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  processDeadlines,
  waitForProcessWithDeadline,
} from "./process-runner";
import { withProcessLock } from "./directory-transaction";

export function createSerialRebuildQueue(runRebuild: (reasons: string[]) => Promise<void>) {
  const pending = new Set<string>();
  let running: Promise<void> | null = null;

  const drain = async () => {
    while (pending.size > 0) {
      const reasons = [...pending];
      pending.clear();
      await runRebuild(reasons);
    }
  };

  const request = (reason: string) => {
    pending.add(reason);
    if (!running) {
      running = drain().finally(() => {
        running = null;
      });
    }
    return running;
  };

  const whenIdle = async () => {
    while (running) {
      await running;
    }
  };

  return { request, whenIdle };
}

function marketplaceOrigin() {
  const raw = process.env.PADPILOT_PUBLIC_ORIGIN
    ?? `http://localhost:${process.env.PADPILOT_MARKETPLACE_PORT ?? "3000"}`;
  const url = new URL(raw);
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PADPILOT_PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

async function writeDevRegistry(registryPath: string, startedAt: number) {
  const temporary = `${registryPath}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ pid: process.pid, startedAt, version: 1 }), { flag: "wx" });
    await rename(temporary, registryPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function runDevServer(projectRoot: string) {
  const uiDirectory = path.join(projectRoot, "ui");
  const origin = marketplaceOrigin();
  const registryPath = path.join(projectRoot, `.padpilot-dev-process-${randomUUID()}.json`);
  const inheritedStartedAt = Number(process.env.PADPILOT_DEV_STARTED_AT);
  const startedAt = Number.isSafeInteger(inheritedStartedAt) && inheritedStartedAt > 0
    ? inheritedStartedAt
    : Date.now();
  process.env.PADPILOT_DEV_STARTED_AT = String(startedAt);
  const watchTargets = [
    { path: path.join(uiDirectory, "src"), recursive: true },
    { path: path.join(uiDirectory, "public"), recursive: true },
    { path: path.join(uiDirectory, "index.html"), recursive: false },
  ];
  const ignoredPatterns = [
    /^node_modules[\\/]/,
    /^src[\\/]proto/,
    /manifest\.ts$/,
    /bun\.lockb?$/,
    /test\.tsx?$/,
  ];
  let activeUiBuild: ReturnType<typeof Bun.spawn> | null = null;

  const publishReload = async () => {
    try {
      await fetch(`${origin}/api/dev/reload`, {
        method: "POST",
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      // The marketplace server may not be ready yet during startup.
    }
  };

  const rebuildQueue = createSerialRebuildQueue(async (reasons) => {
    const reason = reasons.join(", ");
    const build = Bun.spawn([process.execPath, "run", "build:ui"], {
      cwd: projectRoot,
      stderr: "inherit",
      stdout: "inherit",
    });
    activeUiBuild = build;
    try {
      const exitCode = await waitForProcessWithDeadline(build, processDeadlines.script, "Development UI build");
      if (exitCode !== 0) {
        throw new Error(`UI build exited with code ${exitCode}.`);
      }
      console.log(`[dev] UI assets written to ${path.join(uiDirectory, "dist")} (${reason})`);
      await publishReload();
    } catch (error) {
      console.error(`[dev] UI build failed (${reason})`);
      console.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (activeUiBuild === build) {
        activeUiBuild = null;
      }
    }
  });

  console.log(`[dev] Starting marketplace server on ${origin}`);
  const marketplace = Bun.spawn([process.execPath, "--hot", "run", "./src/server.ts"], {
    cwd: path.resolve(projectRoot, "..", "pad-pilot-marketplace"),
    env: { ...process.env, NODE_ENV: "development" },
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let signalRequested = false;
  let shutdownPromise: Promise<void> | null = null;
  const watchers: FSWatcher[] = [];

  const shutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        if (timeout) {
          clearTimeout(timeout);
        }
        for (const watcher of watchers) {
          watcher.close();
        }
        activeUiBuild?.kill();
        marketplace.kill();
        await Promise.allSettled([
          rebuildQueue.whenIdle(),
          waitForProcessWithDeadline(marketplace, 10_000, "Marketplace dev-server shutdown"),
        ]);
      })();
    }
    return shutdownPromise;
  };

  const onSignal = () => {
    signalRequested = true;
    shutdown().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  };

  try {
    await writeDevRegistry(registryPath, startedAt);
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    await rebuildQueue.request("startup");
    if (shutdownPromise) {
      return;
    }

    for (const target of watchTargets) {
      watchers.push(watch(target.path, { recursive: target.recursive }, (_event, filename) => {
        const relativeName = (filename ?? target.path).toString().replace(/\\/g, "/");
        if (ignoredPatterns.some((pattern) => pattern.test(relativeName))) {
          return;
        }
        if (timeout) {
          clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
          rebuildQueue.request(relativeName).catch((error) => {
            console.error(error instanceof Error ? error.message : error);
          });
        }, 250);
      }));
    }

    const marketplaceExitCode = await marketplace.exited;
    if (!signalRequested && marketplaceExitCode !== 0) {
      process.exitCode = marketplaceExitCode;
    }
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await shutdown();
    await rm(registryPath, { force: true });
  }
}

if (import.meta.main) {
  const projectRoot = path.resolve(import.meta.dir, "..");
  try {
    await withProcessLock(
      path.join(projectRoot, ".padpilot-dev-process.lock"),
      () => runDevServer(projectRoot),
      1_000,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
