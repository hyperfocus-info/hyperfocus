import { Sandbox } from "railway";
import { executionTaskSchema, workspaceSpecSchema } from "@hyperfocus/ai-core/swarm";
import type { ExecutionOutput, ExecutionWorkspace, WorkspaceSpec } from "@hyperfocus/ai-core/swarm";
import type { WorkspaceRegistry } from "./registry";
import { captureWorkspaceArtifacts, commandDirectory, digest, shellQuote } from "./files";
import type { DemonstrationBudget } from "./budget";

const runtimeCheck = "node --version && bun --version";

export function createRailwayWorkerService(options: {
  registry: WorkspaceRegistry; environmentId: string; token: string;
  allowedRepositories: string[]; maxWorkspaces?: number; sdk?: typeof Sandbox; budget?: DemonstrationBudget;
}) {
  const sdk = options.sdk ?? Sandbox, registry = options.registry;
  const config = { token: options.token, environmentId: options.environmentId };
  const pending = new Map<string, { fingerprint: string; promise: Promise<ExecutionWorkspace> }>();
  const busy = new Set<string>();
  const forkReaders = new Map<string, number>();
  const sandboxOptions = (resources: ExecutionWorkspace["resources"]) => ({ ...config, resources, idleTimeoutMinutes: 3, networkIsolation: "ISOLATED" as const, domains: [] });
  const template = () => sdk.template().withPackages("git", "curl", "unzip", "ca-certificates", "ripgrep")
    .run("test \"$(node --version)\" = v24.22.0")
    .run("curl -fsSL https://bun.sh/install | bash -s -- bun-v1.4.3")
    .run("ln -sf /root/.bun/bin/bun /usr/local/bin/bun && bun --version");
  async function connect(id: string) { registry.get(id); return sdk.connect(id, config); }
  async function verifyToolchain(sandbox: Awaited<ReturnType<typeof sdk.connect>>, signal?: AbortSignal) {
    const result = await sandbox.exec(runtimeCheck, { timeoutSec: 10, maxOutputBytes: 1024, signal });
    if (result.exitCode !== 0 || result.timedOut || result.stdout.trim() !== "v24.22.0\n1.4.3") throw Error("Sandbox toolchain does not resolve the required Node 24.22.0 and Bun 1.4.3 runtimes.");
  }
  function fingerprint(spec: WorkspaceSpec) { return digest(JSON.stringify({ ...spec, source: { revision: spec.source.revision, repositoryUrl: spec.source.repositoryUrl, bundleHash: spec.source.bundle?.sha256 } })); }
  const workspaceKey = (workspace: Pick<ExecutionWorkspace, "swarmId" | "taskId">) => `${workspace.swarmId}/${workspace.taskId}`;
  function capacity(replacingId?: string) {
    const workspaces = registry.list(), recorded = new Set(workspaces.map(workspaceKey));
    const unrecorded = [...pending.keys()].filter(key => !recorded.has(key)).length;
    if (workspaces.filter(workspace => workspace.id !== replacingId).length + unrecorded >= (options.maxWorkspaces ?? 4)) throw new Error("Cloud worker capacity exhausted.");
  }
  function inFlight(key: string, fingerprint: string) {
    const active = pending.get(key);
    if (active && active.fingerprint !== fingerprint) throw new Error("Idempotency conflict: workspace specification changed.");
    return active?.promise;
  }
  async function destroy(workspaceId: string) {
    registry.get(workspaceId);
    try { await (await sdk.connect(workspaceId, config)).destroy(); }
    catch (error) { if (!(error instanceof Error) || error.name !== "SandboxNotFoundError") throw error; }
    await registry.remove(workspaceId);
  }
  async function prepare(spec: WorkspaceSpec, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (spec.resources.cpu > 2 || spec.resources.memoryGB > 2 || spec.resources.cpu < 1 || spec.resources.memoryGB < 1) throw new Error("Workspace resources must stay within this bridge's authorized 1–2 vCPU / 1–2 GB range.");
    if (spec.source.repositoryUrl) {
      const url = new URL(spec.source.repositoryUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !options.allowedRepositories.includes(url.href)) throw new Error("Repository is not in this bridge's configured project allowlist.");
    }
    if (spec.checkpoint && !spec.checkpoint.startsWith(`hf-${spec.source.revision}-`)) throw new Error("Checkpoint must be anchored to the immutable source revision.");
    const bundle = spec.source.bundle ? Buffer.from(spec.source.bundle.bytesBase64, "base64") : undefined;
    if (bundle && (bundle.length > 268_435_456 || digest(bundle) !== spec.source.bundle?.sha256)) throw new Error("Source bundle failed its size or integrity check.");
    await options.budget?.reserve(spec.resources);
    const createdAt = new Date().toISOString();
    const sandbox = spec.checkpoint ? await sdk.create(spec.checkpoint, sandboxOptions(spec.resources)) : await sdk.create(template(), sandboxOptions(spec.resources));
    const workspace: ExecutionWorkspace = { id: sandbox.id, provider: "railway", swarmId: spec.swarmId, taskId: spec.taskId, sourceRevision: spec.source.revision, root: "/workspace/repo", resources: spec.resources, lane: spec.lane, createdAt };
    try {
      // Record ownership before repository work so a restarted coordinator can reap it.
      await registry.add(workspace, fingerprint(spec));
      signal?.throwIfAborted();
      await verifyToolchain(sandbox, signal);
      if (!spec.checkpoint) {
        let source = spec.source.repositoryUrl!;
        if (bundle) {
          source = "/tmp/hyperfocus-source.bundle";
          await sandbox.files.write(source, bundle);
        }
        const fetchBundle = spec.source.bundle ? `git -c core.hooksPath=/dev/null fetch --no-tags -- ${shellQuote(source)} '+refs/*:refs/hyperfocus/source/*'; ` : "";
        const clone = `set -eu; mkdir -p /workspace; git -c core.hooksPath=/dev/null clone --no-checkout -- ${shellQuote(source)} ${shellQuote(workspace.root)}; cd ${shellQuote(workspace.root)}; ${fetchBundle}git -c core.hooksPath=/dev/null checkout --detach ${shellQuote(spec.source.revision)}; test "$(git rev-parse HEAD)" = ${shellQuote(spec.source.revision)}; git remote remove origin; rm -f /tmp/hyperfocus-source.bundle`;
        const result = await sandbox.exec(clone, { timeoutSec: 300, signal, maxOutputBytes: 16_384 });
        if (result.exitCode !== 0) throw new Error("Immutable repository preparation failed.");
        if (spec.preparation) {
          const installed = await sandbox.exec(spec.preparation.command, { cwd: workspace.root, timeoutSec: spec.preparation.timeoutMs / 1000, signal, maxOutputBytes: 16_384 });
          if (installed.exitCode !== 0 || installed.timedOut) throw new Error("Dependency preparation failed or timed out.");
        }
      }
      const verified = await sandbox.exec("git rev-parse HEAD", { cwd: workspace.root, timeoutSec: 10, signal });
      if (verified.stdout.trim() !== workspace.sourceRevision || verified.exitCode !== 0) throw new Error("Prepared workspace does not match the requested immutable revision.");
      signal?.throwIfAborted();
      await registry.markReady(workspace.id);
      return workspace;
    } catch (error) {
      try { await sandbox.destroy(); await registry.remove(sandbox.id); }
      catch { throw new Error("Workspace preparation failed and cleanup needs retry; retained in the bridge registry."); }
      throw error;
    }
  }
  return {
    list: () => registry.list(),
    async drain() {
      options.budget?.drain();
      const deadline = Date.now() + 120_000;
      while (pending.size) {
        if (Date.now() >= deadline) throw new Error("Workspace provisioning is still settling; cleanup must retry.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    },
    async heartbeat(workspaceId: string) { options.budget?.assertActive(); await (await connect(workspaceId)).heartbeat(); },
    async create(input: unknown, signal?: AbortSignal) {
      const spec = workspaceSpecSchema.parse(input), key = workspaceKey(spec), inputFingerprint = fingerprint(spec);
      options.budget?.assertActive();
      signal?.throwIfAborted();
      const active = inFlight(key, inputFingerprint);
      if (active) return active;
      const existing = registry.list().find(entry => entry.swarmId === spec.swarmId && entry.taskId === spec.taskId);
      if (existing) {
        if (existing.sourceRevision !== spec.source.revision || registry.fingerprint(existing.id) !== inputFingerprint) throw new Error("Idempotency conflict: workspace specification changed.");
        if (registry.ready(existing.id)) return existing;
      }
      capacity(existing?.id);
      const operation = (async () => {
        // Register the retry before awaiting cleanup so concurrent retries share it.
        if (existing) await destroy(existing.id);
        return prepare(spec, signal);
      })();
      pending.set(key, { fingerprint: inputFingerprint, promise: operation });
      try { return await operation; } finally { pending.delete(key); }
    },
    async fork(workspaceId: string, taskId: string, signal?: AbortSignal) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(taskId)) throw new Error("Invalid task id.");
      const original = registry.get(workspaceId);
      options.budget?.assertActive(); signal?.throwIfAborted();
      const key = workspaceKey({ swarmId: original.swarmId, taskId }), inputFingerprint = `fork:${workspaceId}`;
      const active = inFlight(key, inputFingerprint);
      if (active) return active;
      const existing = registry.list().find(entry => workspaceKey(entry) === key);
      if (existing) {
        if (registry.fingerprint(existing.id) !== inputFingerprint) throw new Error("Idempotency conflict: fork source changed.");
        if (registry.ready(existing.id)) return existing;
      }
      if (!registry.ready(workspaceId)) throw new Error("Cannot fork an incompletely prepared workspace.");
      if (busy.has(workspaceId)) throw new Error("Cannot fork a workspace during execution.");
      capacity(existing?.id); signal?.throwIfAborted();
      forkReaders.set(workspaceId, (forkReaders.get(workspaceId) ?? 0) + 1);
      const operation = (async () => {
        if (existing) await destroy(existing.id);
        await options.budget?.reserve(original.resources);
        const createdAt = new Date().toISOString();
        const child = await (await connect(workspaceId)).fork(sandboxOptions(original.resources));
        const workspace = { ...original, id: child.id, taskId, createdAt };
        try { await registry.add(workspace, inputFingerprint); signal?.throwIfAborted(); await verifyToolchain(child, signal); await registry.markReady(workspace.id); return workspace; }
        catch (error) { await child.destroy(); await registry.remove(child.id); throw error; }
      })();
      pending.set(key, { fingerprint: inputFingerprint, promise: operation });
      try { return await operation; }
      finally { pending.delete(key); const count = (forkReaders.get(workspaceId) ?? 1) - 1; if (count) forkReaders.set(workspaceId, count); else forkReaders.delete(workspaceId); }
    },
    async execute(workspaceId: string, input: unknown, signal: AbortSignal, emit: (event: unknown) => void) {
      options.budget?.assertActive();
      const workspace = registry.get(workspaceId), task = executionTaskSchema.parse(input);
      if (!registry.ready(workspaceId)) throw new Error("Workspace preparation has not completed.");
      if (busy.has(workspaceId) || forkReaders.has(workspaceId)) throw new Error("Workspace already has an active execution or snapshot lease.");
      for (const [key, value] of Object.entries(task.environment ?? {})) {
        if (/TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL|DATABASE_URL|RAILWAY/i.test(key) || value.includes("${{")) throw new Error("Credential-bearing environment variables cannot enter untrusted execution.");
      }
      const taskFingerprint = digest(JSON.stringify({ ...task, sessionId: undefined })), previous = registry.session(workspaceId, task.id);
      if (previous && previous.fingerprint !== taskFingerprint) throw new Error("Idempotency conflict: command changed.");
      if (previous?.result) { emit({ type: "session", sessionId: previous.sessionId }); emit({ type: "result", result: previous.result }); return; }
      busy.add(workspaceId);
      const start = Date.now();
      try {
        const sandbox = await connect(workspaceId);
        const onOutput = (output: ExecutionOutput) => {
          for (let offset = 0; offset < output.text.length; offset += 16_384) emit({ type: "output", stream: output.stream, text: output.text.slice(offset, offset + 16_384) });
        };
        const execOptions = { timeoutSec: task.timeoutMs / 1000, signal, maxOutputBytes: 262_144, onStdout: (text: string) => onOutput({ stream: "stdout", text }), onStderr: (text: string) => onOutput({ stream: "stderr", text }) };
        const resumeSession = previous?.sessionId ?? task.sessionId;
        const handle = resumeSession ? sandbox.exec({ sessionName: resumeSession }, execOptions) : sandbox.exec(task.command, { ...execOptions, cwd: commandDirectory(workspace.root, task.cwd), env: task.environment });
        // Observe early command rejection while persisting the session identity.
        void Promise.resolve(handle).catch(() => undefined);
        const sessionId = await handle.sessionName;
        if (!previous) await registry.recordSession(workspaceId, { taskId: task.id, fingerprint: taskFingerprint, sessionId });
        emit({ type: "session", sessionId });
        const result = await handle;
        const receipt = { ...result, durationMs: Date.now() - start, sessionId };
        await registry.completeSession(workspaceId, task.id, receipt);
        emit({ type: "result", result: receipt });
      } finally { busy.delete(workspaceId); }
    },
    async artifacts(workspaceId: string, paths: string[], signal?: AbortSignal) {
      if (busy.has(workspaceId)) throw new Error("Cannot capture changing artifacts during execution.");
      return captureWorkspaceArtifacts({ sandbox: await connect(workspaceId), workspace: registry.get(workspaceId), paths, signal });
    },
    async checkpoint(workspaceId: string) {
      if (busy.has(workspaceId)) throw new Error("Cannot checkpoint an executing workspace.");
      const workspace = registry.get(workspaceId), key = `hf-${workspace.sourceRevision}-${digest(JSON.stringify(workspace.resources)).slice(0, 12)}`;
      await (await connect(workspaceId)).checkpoint(key);
      return { checkpoint: key };
    },
    destroy,
    async reapExpired(maxAgeMs: number) {
      const expired = registry.list().filter(workspace => Date.now() - Date.parse(workspace.createdAt) > maxAgeMs);
      const results = await Promise.allSettled(expired.map(workspace => destroy(workspace.id)));
      return { attempted: results.length, failed: results.filter(result => result.status === "rejected").length };
    },
  };
}
