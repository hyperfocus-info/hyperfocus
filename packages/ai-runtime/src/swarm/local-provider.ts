import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { executionTaskSchema, executionWorkspaceSchema, workspaceSpecSchema } from "@hyperfocus/ai-core/swarm";
import type { CapturedArtifact, ExecutionOutput, ExecutionProvider, ExecutionResult, ExecutionWorkspace } from "@hyperfocus/ai-core/swarm";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function environment(extra?: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "Path", "SystemRoot", "COMSPEC", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE"]) if (process.env[key]) env[key] = process.env[key]!;
  return { ...env, ...extra, GIT_TERMINAL_PROMPT: "0" };
}
async function runCommand(options: { cmd: string[]; cwd: string; timeoutMs: number; env?: Record<string, string>; signal?: AbortSignal; onOutput?: (output: ExecutionOutput) => void }): Promise<ExecutionResult> {
  options.signal?.throwIfAborted();
  const start = Date.now(), timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error("Local execution timed out.")), options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  let truncated = false;
  const child = spawnBackgroundProcess({ cmd: options.cmd, cwd: options.cwd, env: environment(options.env), signal, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  async function drain(stream: ReadableStream<Uint8Array>, kind: ExecutionOutput["stream"]) {
    const reader = stream.getReader(), decoder = new TextDecoder();
    let text = "";
    try {
      while (true) {
        const result = await reader.read(); if (result.done) break;
        const value = decoder.decode(result.value, { stream: true }); options.onOutput?.({ stream: kind, text: value });
        if (text.length + value.length > 1_048_576) truncated = true;
        text += value.slice(0, Math.max(0, 1_048_576 - text.length));
      }
      text += decoder.decode(); return text;
    } finally { reader.releaseLock(); }
  }
  try {
    const [stdout, stderr, exitCode] = await Promise.all([drain(child.stdout, "stdout"), drain(child.stderr, "stderr"), child.exited]);
    options.signal?.throwIfAborted();
    return { stdout, stderr, exitCode, truncated, timedOut: timeout.signal.aborted, durationMs: Date.now() - start };
  } finally { clearTimeout(timer); await terminateProcessTree({ process: child }); }
}

/** Explicit developer-owned fallback. It isolates working files, not host privileges or physical resources. */
export function createLocalExecutionProvider(options: { directory: string; shell?: string[] }): ExecutionProvider {
  const directory = resolve(options.directory), busy = new Set<string>();
  const executions = new Map<string, { controller: AbortController; operation: Promise<ExecutionResult> }>();
  const shell = options.shell ?? (process.platform === "win32" ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command"] : ["/bin/sh", "-c"]);
  function ownedPath(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid local workspace id.");
    const path = resolve(directory, id);
    if (!path.startsWith(directory + sep)) throw new Error("Workspace escapes its owned directory.");
    return path;
  }
  async function owned(id: string) {
    const workspace = executionWorkspaceSchema.parse(JSON.parse(await readFile(join(ownedPath(id), "workspace.json"), "utf8")));
    if (workspace.id !== id || workspace.provider !== "local" || workspace.root !== join(ownedPath(id), "repo")) throw new Error("Invalid local workspace ownership.");
    return workspace;
  }
  async function git(root: string, args: string[], signal?: AbortSignal, env?: Record<string, string>) {
    const result = await runCommand({ cmd: ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.autocrlf=false", ...args], cwd: root, timeoutMs: 300_000, signal, env });
    if (result.exitCode !== 0 || result.timedOut || result.truncated) throw new Error(`Disposable Git operation failed or exceeded its output limit: ${result.stderr.slice(0, 1000)}`);
    return result.stdout;
  }
  const provider: ExecutionProvider = {
    kind: "local",
    async createWorkspace({ signal, ...input }) {
      const spec = workspaceSpecSchema.parse(input);
      if (spec.checkpoint) throw new Error("The local backend does not support Railway checkpoints.");
      const id = randomUUID(), root = ownedPath(id);
      await mkdir(root, { recursive: true });
      const workspace: ExecutionWorkspace = { id, provider: "local", swarmId: spec.swarmId, taskId: spec.taskId, sourceRevision: spec.source.revision, root: join(root, "repo"), lane: spec.lane, resources: spec.resources, createdAt: new Date().toISOString() };
      await writeFile(join(root, "workspace.json"), JSON.stringify(workspace), { flag: "wx" });
      try {
        let source = spec.source.repositoryUrl!;
        if (spec.source.bundle) {
          const bytes = Buffer.from(spec.source.bundle.bytesBase64, "base64");
          if (bytes.length > 268_435_456 || hash(bytes) !== spec.source.bundle.sha256) throw new Error("Source bundle integrity check failed.");
          source = join(root, "source.bundle"); await writeFile(source, bytes);
        } else {
          const url = new URL(source);
          if (url.protocol !== "https:" || url.username || url.password) throw new Error("Local backend repository URLs must be credential-free HTTPS.");
        }
        await git(root, ["clone", "--no-checkout", "--", source, workspace.root], signal);
        if (spec.source.bundle) await git(workspace.root, ["fetch", "--no-tags", source, "+refs/*:refs/hyperfocus/source/*"], signal);
        await git(workspace.root, ["checkout", "--detach", spec.source.revision], signal);
        if ((await git(workspace.root, ["rev-parse", "HEAD"], signal)).trim() !== spec.source.revision) throw new Error("Source revision mismatch.");
        await git(workspace.root, ["remote", "remove", "origin"], signal);
        if (spec.preparation) {
          const result = await provider.execute({ workspace, task: { id: "prepare", ...spec.preparation }, signal });
          if (result.exitCode !== 0 || result.timedOut) throw new Error("Dependency preparation failed.");
        }
        return workspace;
      } catch (error) { await provider.destroyWorkspace({ workspaceId: id }); throw error; }
    },
    async forkWorkspace({ workspace: input, taskId, signal }) {
      const workspace = await owned(input.id); signal?.throwIfAborted();
      if (busy.has(workspace.id)) throw new Error("Cannot fork an executing local workspace.");
      const id = randomUUID(), root = ownedPath(id), fork = { ...workspace, id, taskId, root: join(root, "repo"), createdAt: new Date().toISOString() };
      await mkdir(root, { recursive: true });
      await writeFile(join(root, "workspace.json"), JSON.stringify(fork), { flag: "wx" });
      try { await cp(workspace.root, fork.root, { recursive: true, verbatimSymlinks: true }); signal?.throwIfAborted(); return fork; }
      catch (error) { await provider.destroyWorkspace({ workspaceId: id }); throw error; }
    },
    async execute({ workspace: input, task: raw, signal, onOutput }) {
      const workspace = await owned(input.id), task = executionTaskSchema.parse(raw);
      if (task.sessionId) throw new Error("Local commands cannot be reattached after host restart.");
      if (busy.has(workspace.id)) throw new Error("Local workspace already has an execution lease.");
      const cwd = task.cwd ? resolve(workspace.root, task.cwd) : workspace.root;
      if (cwd !== workspace.root && !cwd.startsWith(workspace.root + sep)) throw new Error("Command directory escapes its workspace.");
      const physical = await realpath(cwd), physicalRoot = await realpath(workspace.root);
      if (physical !== physicalRoot && !physical.startsWith(physicalRoot + sep)) throw new Error("Command directory escapes its workspace through a symbolic link.");
      busy.add(workspace.id);
      const controller = new AbortController();
      const operation = runCommand({ cmd: [...shell, task.command], cwd, timeoutMs: task.timeoutMs, signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal, onOutput, env: task.environment });
      executions.set(workspace.id, { controller, operation });
      try { return await operation; }
      finally { busy.delete(workspace.id); executions.delete(workspace.id); }
    },
    async captureArtifacts({ workspace: input, paths = [], signal }) {
      if (paths.length > 32) throw new Error("Too many artifact paths.");
      const workspace = await owned(input.id);
      if (busy.has(workspace.id)) throw new Error("Cannot capture an executing local workspace.");
      const index = join(ownedPath(workspace.id), "artifact-index");
      const env = { GIT_INDEX_FILE: index };
      await rm(index, { force: true });
      await git(workspace.root, ["read-tree", workspace.sourceRevision], signal, env);
      await git(workspace.root, ["add", "-A"], signal, env);
      const patch = await git(workspace.root, ["diff", "--cached", "--binary", "--no-ext-diff", workspace.sourceRevision], signal, env);
      await rm(index, { force: true });
      const patchBytes = new TextEncoder().encode(patch);
      const result: CapturedArtifact[] = [{ name: "candidate.patch", mediaType: "text/x-diff", sha256: hash(patchBytes), bytes: patchBytes }];
      for (const path of paths) {
        const full = resolve(workspace.root, path);
        if (!full.startsWith(workspace.root + sep)) throw new Error("Artifact path escapes its workspace.");
        const physical = await realpath(full), physicalRoot = await realpath(workspace.root);
        if (!physical.startsWith(physicalRoot + sep)) throw new Error("Artifact symbolic link escapes its workspace.");
        const info = await stat(physical);
        if (!info.isFile() || info.size > 67_108_864) throw new Error("Artifact exceeds its size limit or is not a regular file.");
        const bytes = new Uint8Array(await readFile(physical));
        if (bytes.length !== info.size) throw new Error("Artifact changed during capture.");
        result.push({ name: path, mediaType: "application/octet-stream", sha256: hash(bytes), bytes });
      }
      return result;
    },
    async destroyWorkspace({ workspaceId }) {
      await owned(workspaceId);
      const active = executions.get(workspaceId);
      if (active) { active.controller.abort(new Error("Workspace destroyed.")); await active.operation.catch(() => undefined); }
      await rm(ownedPath(workspaceId), { recursive: true, force: true });
    },
    async listWorkspaces() {
      await mkdir(directory, { recursive: true });
      const entries = await readdir(directory, { withFileTypes: true }), workspaces = [];
      for (const entry of entries) if (entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) workspaces.push(await owned(entry.name));
      return workspaces;
    },
  };
  return provider;
}
