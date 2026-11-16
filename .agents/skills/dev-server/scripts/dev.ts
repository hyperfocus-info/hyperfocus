import { randomUUID } from "node:crypto";
import { createWriteStream, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnBackgroundProcess, spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { waitForDevReadiness } from "./readiness";
import { openDevServerRegistry, type DevServerRegistry, type DevServerRow } from "./registry";
import { fingerprintDevError, isProcessAlive, terminateProcessTree } from "./process";
import { createDevErrorCollector, formatDevErrors } from "./diagnostics";
import { listDevSurfaces, resolveDevSurface } from "./surfaces";
import { parseDevArguments } from "./dev-arguments";
import { claimAvailableDevPort } from "./port-selection";
import { createDevServerEnvironment, devServerRuntimeDirectory } from "./server-environment";

const HELP = `Usage: bun run dev[:surface]

Repository dev-server operations:
  start [surface] [--port <port>] [--isolated] [--local-auth] [--foreground] [--json]
  status [surface|server-id] [--all] [--json]
  logs [surface|server-id] [--lines <count>]
  errors [surface|server-id] [--all] [--limit <count>] [--full] [--json]
  error <error-id> <investigated|fixed|open>
  stop <surface|server-id|--all> [--json]

Surfaces: ${listDevSurfaces().map((surface) => surface.name).join(", ")}`;

type WorkspaceIdentity = {
  worktreePath: string;
  coordinationRoot: string;
  branch: string;
  linkedWorktree: boolean;
};

async function main(argv: string[]) {
  const { command, args } = parseDevArguments({ argv });
  if (command === "--help" || command === "-h" || command === "help") {
    console.log(HELP);
    return;
  }
  const workspace = inspectWorkspace(process.cwd());
  const databasePath = path.join(workspace.coordinationRoot, ".local", "dev-servers.sqlite");
  const registry = openDevServerRegistry(databasePath);
  try {
    if (command === "_supervise") {
      const id = requiredArgument(args[0], "server id");
      await supervise(registry, id, process.env.HYPERFOCUS_DEV_MIRROR === "1");
      return;
    }
    await reconcileServers(registry);
    if (command === "start") {
      await startServer(registry, workspace, args);
    } else if (command === "status") {
      showStatus(registry, args);
    } else if (command === "logs") {
      showLogs(registry, args);
    } else if (command === "errors") {
      showErrors(registry, args);
    } else if (command === "error") {
      updateError(registry, args);
    } else if (command === "stop") {
      await stopServers(registry, args);
    } else {
      throw new Error(`Unknown dev-server command: ${command}\n\n${HELP}`);
    }
  } finally {
    registry.close();
  }
}

function inspectWorkspace(cwd: string): WorkspaceIdentity {
  const worktreePath = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const commonGitPath = path.resolve(worktreePath, runGit(worktreePath, ["rev-parse", "--git-common-dir"]));
  const coordinationRoot = path.basename(commonGitPath).toLowerCase() === ".git"
    ? path.dirname(commonGitPath)
    : worktreePath;
  const branch = runGit(worktreePath, ["branch", "--show-current"]) || "detached-head";
  return {
    worktreePath,
    coordinationRoot,
    branch,
    linkedWorktree: normalizePath(worktreePath) !== normalizePath(coordinationRoot)
  };
}

function runGit(cwd: string, args: string[]) {
  const result = spawnBackgroundProcessSync({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`Dev-server coordination requires a Git worktree: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

async function startServer(registry: DevServerRegistry, workspace: WorkspaceIdentity, args: string[]) {
  const surfaceName = firstPositional(args) ?? "harness";
  const surface = resolveDevSurface(surfaceName);
  if (!surface) throw new Error(`Unknown development surface: ${surfaceName}`);
  const requestedPort = readIntegerFlag(args, "--port");
  const isolated = args.includes("--isolated") || workspace.linkedWorktree;
  const foreground = isolated || args.includes("--foreground");
  const json = args.includes("--json");

  if (!isolated) {
    const existing = registry.findReusable(surface.name, workspace.worktreePath);
    if (existing) {
      if (requestedPort && existing.port !== requestedPort) {
        throw new Error(`${surface.name} already owns shared port ${existing.port}. Stop it first or use --isolated.`);
      }
      const reusable = await waitForReusable(registry, existing.id, existing.status === "starting" ? 65_000 : 5_000);
      if (reusable) {
        printStart(reusable, true, json);
        return;
      }
      const current = registry.getServer(existing.id);
      if (current && new Set(["starting", "running"]).has(current.status)) await stopRows(registry, [current]);
    }
  }

  const id = randomUUID();
  const startedAt = new Date().toISOString();
  const logDir = path.join(workspace.coordinationRoot, ".local", "dev-servers");
  await mkdir(logDir, { recursive: true });
  const row = await claimAvailableDevPort({
    startPort: requestedPort ?? surface.defaultPort,
    offsets: surface.portOffsets,
    claim(port, ports) {
      const candidate = {
        id,
        surface: surface.name,
        worktreePath: workspace.worktreePath,
        branch: workspace.branch,
        mode: isolated ? "isolated" as const : "shared" as const,
        host: "127.0.0.1",
        port,
        url: `http://127.0.0.1:${port}`,
        startedAt,
        heartbeatAt: startedAt,
        supervisorPid: process.pid,
        logPath: path.join(logDir, `${id}.log`),
        commandJson: JSON.stringify(surface.command(workspace.worktreePath))
      };
      registry.createServer(candidate, ports);
      return candidate;
    }
  }).catch(async error => {
    const winner = registry.findReusable(surface.name, workspace.worktreePath);
    if (!isolated && winner && (!requestedPort || winner.port === requestedPort)) {
      const reusable = await waitForReusable(registry, winner.id, 65_000);
      if (reusable) {
        printStart(reusable, true, json);
        return undefined;
      }
    }
    throw error;
  });
  if (!row) return;

  if (foreground) {
    printStart(row, false, json);
    await supervise(registry, id, true, args.includes('--local-auth'));
    return;
  }

  let supervisor: ReturnType<typeof spawnBackgroundProcess> | undefined;
  try {
    supervisor = spawnBackgroundProcess({
      cmd: [process.execPath, import.meta.path, "_supervise", id],
      cwd: workspace.worktreePath,
      detached: true,
      keepAliveAfterParentExit: true,
      env: process.env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    });
    registry.setSupervisorPid(id, supervisor.pid);
    supervisor.unref();
    const ready = await waitForRegistryReady(registry, id, 60_000);
    if (ready.status !== "running") {
      const errors = registry.listErrors({ serverId: id });
      throw new Error(errors[0]?.message ?? `Development server ${id} failed before becoming ready.`);
    }
    printStart(ready, false, json);
  } catch (error) {
    const current = registry.getServer(id);
    await terminateProcessTree(current?.childPid ?? null);
    await terminateProcessTree(supervisor?.pid ?? null);
    registry.finish(id, "failed", new Date().toISOString());
    throw error;
  }
}

async function supervise(registry: DevServerRegistry, id: string, mirror: boolean, localAuth = false) {
  const row = registry.getServer(id);
  if (!row) throw new Error(`Unknown development server: ${id}`);
  const surface = resolveDevSurface(row.surface);
  if (!surface) throw new Error(`Unknown development surface in registry: ${row.surface}`);
  const log = createWriteStream(row.logPath, { flags: "a" });
  const diagnostics = createDevErrorCollector({
    record: (error) => registry.recordError({ serverId: row.id, ...error })
  });
  const writeLog = (source: string, message: string) => {
    const line = message.replace(/\r$/, "");
    if (!line) return;
    log.write(`${new Date().toISOString()} [${source}] ${line}\n`);
    if (mirror) (source === "stderr" ? process.stderr : process.stdout).write(`${line}\n`);
    diagnostics.push({ source, message: line, at: new Date().toISOString() });
  };

  let child: ReturnType<typeof spawnBackgroundProcess> | undefined;
  let output: Promise<unknown> | undefined;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await terminateProcessTree(child?.pid ?? null);
  };
  const onSignal = () => { void stop(); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const command = surface.command(row.worktreePath);
    const env = createDevServerEnvironment({ surface, worktreePath: row.worktreePath, id: row.id, port: row.port,
      isolated: row.mode === 'isolated', localAuth, inherited: process.env });
    if (localAuth) await mkdir(devServerRuntimeDirectory({ worktreePath: row.worktreePath, id: row.id }), { recursive: true });
    writeLog("supervisor", `Starting ${surface.name} on ${row.url}: ${command.join(" ")}`);
    child = spawnBackgroundProcess({
      cmd: command,
      cwd: row.worktreePath,
      detached: true,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });
    registry.setChildPid(id, child.pid);
    if (!child.stdout || typeof child.stdout === "number" || !child.stderr || typeof child.stderr === "number") {
      throw new Error("Dev-server subprocess did not expose piped output streams.");
    }
    output = Promise.all([
      pumpOutput(child.stdout, (line) => writeLog("stdout", line)),
      pumpOutput(child.stderr, (line) => writeLog("stderr", line))
    ]);
    // The startup/exit path awaits this promise below. Observe early failures
    // immediately so a rejected stream cannot become an unhandled rejection.
    void output.catch(() => undefined);
    const heartbeat = setInterval(() => {
      const current = registry.getServer(id);
      if (current?.stopRequestedAt) void stop();
      else registry.heartbeat(id, new Date().toISOString());
    }, 1_000);
    try {
      const startup = await waitForDevReadiness({ probe: () => probeHealthy(row), timeoutMs: 60_000, exited: child.exited });
      if (startup === "timeout") {
        writeLog("supervisor", `Error: Development server did not become healthy within 60 seconds at ${row.url}${surface.healthPath}`);
        await stop();
      } else if (startup === "healthy") {
        registry.markRunning(id, new Date().toISOString());
        writeLog("supervisor", `Ready at ${row.url}`);
      }
      const exitCode = await child.exited;
      await output;
      const current = registry.getServer(id);
      const expected = stopping || Boolean(current?.stopRequestedAt);
      if (!expected && exitCode !== 0) writeLog("supervisor", `Error: Development process exited with code ${exitCode}`);
      registry.finish(id, expected || exitCode === 0 ? "stopped" : "failed", new Date().toISOString(), exitCode);
    } finally {
      clearInterval(heartbeat);
    }
  } catch (error) {
    writeLog("supervisor", `Error: ${error instanceof Error ? error.message : String(error)}`);
    registry.finish(id, "failed", new Date().toISOString());
    await stop();
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    try {
      await stop();
      await output;
    } finally {
      try { diagnostics.flush(); } finally { log.end(); }
    }
  }
}

async function pumpOutput(stream: ReadableStream<Uint8Array>, writeLine: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    pending += decoder.decode(result.value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    lines.forEach(writeLine);
  }
  pending += decoder.decode();
  if (pending) writeLine(pending);
}

async function reconcileServers(registry: DevServerRegistry) {
  for (const row of registry.listServers(true)) {
    if (isProcessAlive(row.supervisorPid)) continue;
    await terminateProcessTree(row.childPid);
    const expected = Boolean(row.stopRequestedAt);
    registry.finish(row.id, expected ? "stopped" : "failed", new Date().toISOString());
    if (!expected) {
      const message = "Dev-server supervisor disappeared; its owned process tree was closed during reconciliation.";
      registry.recordError({ serverId: row.id, category: "process", source: "supervisor",
        fingerprint: fingerprintDevError(message), message, at: new Date().toISOString() });
    }
  }
}

async function stopServers(registry: DevServerRegistry, args: string[]) {
  const target = firstPositional(args);
  const rows = args.includes("--all")
    ? registry.listServers(true)
    : resolveRows(registry, requiredArgument(target, "surface, server id, or --all"), true);
  await stopRows(registry, rows);
  const result = rows.map((row) => ({ id: row.id, surface: row.surface, stopped: true }));
  if (args.includes("--json")) console.log(JSON.stringify(result));
  else result.forEach((entry) => console.log(`Stopped ${entry.surface} (${entry.id}).`));
}

async function stopRows(registry: DevServerRegistry, rows: DevServerRow[]) {
  for (const row of rows) {
    registry.requestStop(row.id, new Date().toISOString());
    if (!isProcessAlive(row.supervisorPid)) {
      await terminateProcessTree(row.childPid);
      registry.finish(row.id, "stopped", new Date().toISOString());
      continue;
    }
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const current = registry.getServer(row.id);
      if (!current || !new Set(["starting", "running"]).has(current.status)) break;
      await Bun.sleep(100);
    }
    const current = registry.getServer(row.id);
    if (current && new Set(["starting", "running"]).has(current.status)) {
      await terminateProcessTree(current.childPid);
      await terminateProcessTree(current.supervisorPid);
      registry.finish(row.id, "stopped", new Date().toISOString());
    }
  }
}

function showStatus(registry: DevServerRegistry, args: string[]) {
  const target = firstPositional(args);
  const rows = registry.listServers(!args.includes("--all")).filter((row) => !target || row.id === target || row.surface === resolveDevSurface(target)?.name);
  if (args.includes("--json")) {
    console.log(JSON.stringify(rows));
    return;
  }
  if (rows.length === 0) {
    console.log("No development servers are running.");
    return;
  }
  for (const row of rows) {
    console.log(`${row.surface.padEnd(10)} ${row.status.padEnd(8)} ${row.url}  ${row.mode}  ${row.branch}  started ${row.startedAt}  id ${row.id}`);
  }
}

function showLogs(registry: DevServerRegistry, args: string[]) {
  const target = firstPositional(args);
  const row = target ? resolveRows(registry, target, false)[0] : registry.listServers(false)[0];
  if (!row) throw new Error("No matching development server log was found.");
  const lineCount = readIntegerFlag(args, "--lines") ?? 100;
  const lines = readFileSync(row.logPath, "utf8").split(/\r?\n/).filter(Boolean);
  console.log(lines.slice(-lineCount).join("\n"));
}

function showErrors(registry: DevServerRegistry, args: string[]) {
  const target = firstPositional(args);
  const server = target ? registry.getServer(target) : undefined;
  const surface = target && !server ? resolveDevSurface(target)?.name : undefined;
  if (target && !server && !surface) throw new Error(`Unknown surface or server id: ${target}`);
  const errors = registry.listErrors({ serverId: server?.id, surface, includeFixed: args.includes("--all") });
  const limit = readIntegerFlag(args, "--limit");
  if (args.includes("--json")) {
    console.log(JSON.stringify(limit ? errors.slice(0, limit) : errors));
    return;
  }
  console.log(formatDevErrors({ errors, limit, full: args.includes("--full") }));
}

function updateError(registry: DevServerRegistry, args: string[]) {
  const id = Number(requiredArgument(args[0], "error id"));
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Error id must be a positive integer.");
  const rawState = requiredArgument(args[1], "investigated, fixed, or open");
  const state = rawState === "investigate" ? "investigated" : rawState === "fix" ? "fixed" : rawState;
  if (state !== "investigated" && state !== "fixed" && state !== "open") {
    throw new Error("Error state must be investigated, fixed, or open.");
  }
  registry.setErrorState(id, state, new Date().toISOString());
  console.log(`Marked development error #${id} ${state}.`);
}

function resolveRows(registry: DevServerRegistry, target: string, activeOnly: boolean) {
  const byId = registry.getServer(target);
  if (byId && (!activeOnly || new Set(["starting", "running"]).has(byId.status))) return [byId];
  const surface = resolveDevSurface(target);
  if (!surface) return [];
  return registry.listServers(activeOnly).filter((row) => row.surface === surface.name);
}

async function waitForRegistryReady(registry: DevServerRegistry, id: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = registry.getServer(id);
    if (!row) throw new Error(`Development server ${id} disappeared from the registry.`);
    if (row.status === "running" || row.status === "failed" || row.status === "stopped") return row;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for development server ${id}. Inspect it with bun run dev:errors.`);
}

async function waitForReusable(registry: DevServerRegistry, id: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = registry.getServer(id);
    if (!row || row.status === "failed" || row.status === "stopped") return undefined;
    if (row.status === "running" && await probeHealthy(row)) return row;
    if (row.supervisorPid !== null && !isProcessAlive(row.supervisorPid)) return undefined;
    await Bun.sleep(100);
  }
  return undefined;
}

async function probeHealthy(row: Pick<DevServerRow, "url" | "surface">) {
  const surface = resolveDevSurface(row.surface);
  const healthPath = surface?.healthPath ?? "/";
  try {
    const response = await fetch(new URL(healthPath, row.url), { signal: AbortSignal.timeout(1_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function printStart(row: Pick<DevServerRow, "id" | "surface" | "url" | "mode" | "startedAt" | "logPath">, reused: boolean, json: boolean) {
  if (json) {
    console.log(JSON.stringify({ id: row.id, surface: row.surface, url: row.url, mode: row.mode,
      startedAt: row.startedAt, logPath: row.logPath, reused }));
    return;
  }
  console.log(`${reused ? "Reusing" : "Started"} ${row.surface} at ${row.url} (${row.mode}, id ${row.id}).`);
  console.log(`Logs: ${row.logPath}`);
  if (row.mode === "isolated") console.log("This isolated server remains attached and will be closed when this command exits.");
}

function firstPositional(args: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index]?.startsWith("--")) {
      if (args[index] === "--port" || args[index] === "--lines" || args[index] === "--limit") index += 1;
      continue;
    }
    return args[index];
  }
  return undefined;
}

function readIntegerFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = Number(requiredArgument(args[index + 1], `${flag} value`));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${flag} must be a positive integer.`);
  if (flag === "--port" && value > 65_535) throw new Error("--port must be at most 65535.");
  return value;
}

function requiredArgument(value: string | undefined, label: string) {
  if (!value) throw new Error(`Missing ${label}.\n\n${HELP}`);
  return value;
}

function normalizePath(filePath: string) {
  const normalized = path.resolve(filePath).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
