import { createHash, randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";
import { z } from "zod";
import { createSwarmClient, createSwarmRequestSchema, swarmRunSchema, type SwarmRun } from "@hyperfocus/ai-core/swarm";
import { createSwarmSourceSnapshot, createFileSwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { inspectSwarmBilling } from "../billing";
import { readSwarmRailwayCredential, verifySwarmRailwayCredential } from "../credentials/credential";
import { liveHostEnvironment, startLiveProcess } from "./process";
import { readCommandEvidence } from "../../../cli/src/swarm/execution/command-evidence";
import { laptopTopology as topology, openHostedAttempt } from "./attempt";
import { startManagedSwarmHost } from "../browser/managed-host";
import { swarmSiteUrl } from "../site";

export const hostedVerificationOptionsSchema = z.object({
  demonstrationId: z.string().uuid(), credentialId: z.string().uuid(), projectRoot: z.string().min(1),
  projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), requestFile: z.string().min(1), railwayCli: z.string().min(1),
  nodeExecutable: z.string().min(1), allowLaunch: z.literal(true), providerSmoke: z.boolean().default(false),
  computeUsd: z.number().gt(1).max(10).default(10), runMinutes: z.number().int().min(1).max(115).default(60),
  lifetimeMinutes: z.number().int().min(10).max(120).default(120),
  attempt: z.number().int().min(1).max(3).default(1),
  monitor: z.boolean().default(false),
}).strict().refine(value => value.runMinutes < value.lifetimeMinutes, "Run duration must leave time for cleanup before bridge expiry.");
type Options = z.infer<typeof hostedVerificationOptionsSchema>;
const sourceSchema = z.object({ revision: z.string(), baseRevision: z.string(), tree: z.string(), sha256: z.string(), fileCount: z.number() });
const stopped = new Set(["AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "BLOCKED"]);

export function successfulRailwayCommands(run: SwarmRun) {
  if (run.request.backend !== "railway") return [];
  return run.messages.flatMap(message => {
    const receipt = readCommandEvidence(message);
    if (!receipt || receipt.status !== "returned" || receipt.exitCode !== 0 || receipt.timedOut || message.sourceRevision !== run.request.repository.revision) return [];
    const artifact = run.artifacts.find(value => value.id === receipt.artifactId);
    return artifact && artifact.kind === "log" && artifact.taskId === message.taskId && artifact.sourceRevision === message.sourceRevision && message.artifactIds.includes(artifact.id) ? [receipt] : [];
  });
}

export function hostedRunRequest(options: { input: unknown; demonstrationId: string; attempt?: number; projectId: string; maximumUsd: number; durationMs: number; repository: { revision: string; baseRevision: string; sourceArtifactId: string } }) {
  const input = z.record(z.unknown()).parse(options.input);
  if (input.backend !== undefined && input.backend !== "railway") throw Error("Hosted verification requires actual Railway execution.");
  if (input.projectId !== undefined && input.projectId !== options.projectId) throw Error("Request belongs to a different project.");
  const request = createSwarmRequestSchema.parse({ ...input, requestId: `live-${options.demonstrationId}${options.attempt && options.attempt > 1 ? `-attempt-${options.attempt}` : ""}`, projectId: options.projectId,
    repository: options.repository, backend: "railway", reviewPlan: true });
  if (request.budget.maxModelUsd !== 0) throw Error("Separately billed inference must remain zero.");
  if (request.budget.maxComputeUsd > Math.min(9, options.maximumUsd - 1)) throw Error("Run compute exceeds the shared ledger after its $1 reserve.");
  if (request.budget.maxDurationMs > options.durationMs) throw Error("Request duration exceeds the runner's observation ceiling.");
  if (request.maxWorkers > 3) throw Error("At most three investigation workers are authorized.");
  return request;
}

async function save(file: string, value: unknown) { await writeFile(file, JSON.stringify(value, null, 2)); }
async function jsonRequest(url: string, token: string, body?: unknown) {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", redirect: "error",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw Error(`Owned service request failed (${response.status}); inspect retained service logs.`);
  return response.json();
}

/** Explicit local authority, real Railway workspaces, one persistent aggregate ledger. */
export async function verifyHostedSwarm(raw: Options) {
  const options = hostedVerificationOptionsSchema.parse(raw), root = resolve(import.meta.dir, "../../../../..");
  const baseDirectory = resolve(root, ".local/swarm/live-hosted", options.demonstrationId), projectRoot = resolve(options.projectRoot);
  const requestInput: unknown = await Bun.file(resolve(options.requestFile)).json();
  const requestHash = createHash("sha256").update(JSON.stringify(requestInput)).digest("hex");
  const attempt = await openHostedAttempt({ baseDirectory, attempt: options.attempt, id: options.demonstrationId, projectRoot, projectId: options.projectId,
    maximumUsd: options.computeUsd, lifetimeMinutes: options.lifetimeMinutes, requestHash });
  try { return await verifyHostedAttempt({ options, root, baseDirectory, projectRoot, requestInput, ...attempt }); }
  finally { await attempt.release(); }
}

async function verifyHostedAttempt(input: { options: Options; root: string; baseDirectory: string; projectRoot: string; requestInput: unknown } & Awaited<ReturnType<typeof openHostedAttempt>>) {
  const { options, root, baseDirectory, projectRoot, requestInput, manifest, directory } = input;
  const billing = await inspectSwarmBilling({ root, railwayCli: resolve(options.railwayCli) });
  await save(join(directory, "billing-before.json"), billing);
  if (options.computeUsd > billing.includedUsage.calculatedRemainingUsd) throw Error("The shared included allowance no longer covers this authorized ledger.");
  const token = await readSwarmRailwayCredential({ root, demonstrationId: options.credentialId });
  const credential = await verifySwarmRailwayCredential({ token });
  await save(join(directory, "credential-check.json"), { verified: credential.verified, accessibleWorkspaceCount: credential.accessibleWorkspaceCount, checkedAt: new Date().toISOString() });
  const sourceFile = join(directory, "source.json"), bundleFile = join(directory, "source.bundle");
  let source: z.infer<typeof sourceSchema>;
  if (await Bun.file(sourceFile).exists()) source = sourceSchema.parse(await Bun.file(sourceFile).json());
  else {
    const snapshot = await createSwarmSourceSnapshot({ root: projectRoot });
    const { bytes, ...metadata } = snapshot; source = metadata;
    await writeFile(bundleFile, bytes, { flag: "wx" }); await save(sourceFile, source);
  }
  const bundle = await readFile(bundleFile);
  if (createHash("sha256").update(bundle).digest("hex") !== source.sha256) throw Error("Retained immutable bundle failed its hash check.");
  const initialRequest = hostedRunRequest({ input: requestInput, demonstrationId: options.demonstrationId, attempt: options.attempt, projectId: options.projectId,
    maximumUsd: options.computeUsd, durationMs: options.runMinutes * 60000, repository: { revision: source.revision, baseRevision: source.baseRevision, sourceArtifactId: "pending-upload" } });
  const bridgeDirectory = join(baseDirectory, "bridge"), coordinatorDirectory = join(baseDirectory, "coordinator");
  await mkdir(bridgeDirectory, { recursive: true }); await mkdir(coordinatorDirectory, { recursive: true });
  const buildDirectory = resolve(root, "apps/swarm-worker/.local/live-hosted", options.demonstrationId); await mkdir(buildDirectory, { recursive: true });
  const built = await Bun.build({ entrypoints: [resolve(root, "apps/swarm-worker/scripts/bridge-host.ts")], target: "node", format: "esm", external: ["railway"], outdir: buildDirectory });
  if (!built.success) throw Error("Bounded Node bridge failed to build.");
  const workerToken = randomBytes(32).toString("hex"), serviceToken = randomBytes(32).toString("hex");
  const environment = liveHostEnvironment(), common = { SWARM_DEMONSTRATION_ID: manifest.id, SWARM_DEMONSTRATION_EXPIRES_AT: manifest.expiresAt };
  const abort = new AbortController(), onSignal = () => abort.abort(Error("Live verification interrupted."));
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  let bridge: Awaited<ReturnType<typeof startLiveProcess>> | undefined, coordinator: Awaited<ReturnType<typeof startLiveProcess>> | undefined;
  let monitor: Awaited<ReturnType<typeof startManagedSwarmHost>> | undefined;
  let client: ReturnType<typeof createSwarmClient> | undefined, run: SwarmRun | undefined, failure: string | undefined;
  const report: Record<string, unknown> = { topology, demonstrationId: manifest.id, attempt: options.attempt, source, simulated: false, cloudExecutionVerified: false,
    coordinatorFailoverVerified: false, separatelyBilledInferenceUsd: 0, artifactsLocation: coordinatorDirectory, startedAt: new Date().toISOString() };
  try {
    bridge = await startLiveProcess({ cmd: [resolve(options.nodeExecutable), built.outputs[0]!.path, "--allow-provision"], root, log: join(directory, "bridge.log"), secrets: [token, workerToken],
      environment: { ...environment, ...common, RAILWAY_ENVIRONMENT_ID: "e46fa18a-61c0-4cc4-9379-45b8dfde47a6", RAILWAY_API_TOKEN: token,
        SWARM_WORKER_TOKEN: workerToken, SWARM_WORKER_DATA_DIR: bridgeDirectory, SWARM_DEMONSTRATION_MAX_USD: String(manifest.maximumUsd) } });
    report.bridge = { pid: bridge.pid, url: bridge.url, nodeVersion: bridge.nodeVersion };
    coordinator = await startLiveProcess({ cmd: [process.execPath, resolve(root, "apps/harness/scripts/swarm/live/coordinator.ts"), "--allow-launch"], root, log: join(directory, "coordinator.log"), secrets: [workerToken, serviceToken],
      environment: { ...environment, ...common, SWARM_COORDINATOR_TOPOLOGY: "laptop", SWARM_DATA_DIR: coordinatorDirectory, SWARM_BACKEND: "railway",
        SWARM_WORKER_URL: bridge.url, SWARM_WORKER_TOKEN: workerToken, SWARM_SERVICE_TOKEN: serviceToken, SWARM_PROJECT_IDS: options.projectId,
        SWARM_MAX_COMPUTE_USD: String(Math.min(9, manifest.maximumUsd - 1)), SWARM_MAX_MODEL_USD: "0",
        SWARM_CODEX_EXECUTABLE: process.env.SWARM_CODEX_EXECUTABLE ?? Bun.which("codex") ?? undefined,
        SWARM_CODEX_HOME: process.env.SWARM_CODEX_HOME ?? process.env.CODEX_HOME ?? join(homedir(), ".codex"), SWARM_MODEL_PROFILES: process.env.SWARM_MODEL_PROFILES } });
    report.coordinator = { pid: coordinator.pid, url: coordinator.url };
    client = createSwarmClient({ baseUrl: `${coordinator.url}/api/swarm/v1`, fetch: (input, init) => fetch(input, { ...init, redirect: "error",
      headers: { ...Object.fromEntries(new Headers(init?.headers)), authorization: `Bearer ${serviceToken}` }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]) }) });
    const capabilities = await client.capabilities(); await save(join(directory, "capabilities.json"), capabilities);
    if (!capabilities.available || !capabilities.backends.includes("railway") || capabilities.inference?.separatelyBilledUsd !== 0) throw Error(capabilities.reason ?? "Subscription and Railway readiness did not pass.");
    if (options.providerSmoke && !await Bun.file(join(baseDirectory, "provider-smoke-passed.json")).exists()) {
      const child = spawnBackgroundProcess({ cmd: [process.execPath, resolve(root, "apps/swarm-worker/scripts/verify-cloud.ts"), "--allow-provision"], cwd: root,
        env: { ...environment, SWARM_DATA_DIR: directory, SWARM_WORKER_URL: bridge.url, SWARM_WORKER_TOKEN: workerToken },
        stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 600000, maxBuffer: 1048576 });
      const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      const cancel = () => { void terminateProcessTree({ process: child }); }; abort.signal.addEventListener("abort", cancel, { once: true });
      try {
        const code = await child.exited, [stdout, stderr] = await output;
        await save(join(directory, "provider-smoke.json"), { exitCode: code, stdout: stdout.replaceAll(workerToken, "[redacted]"), stderr: stderr.replaceAll(workerToken, "[redacted]") });
        if (code) throw Error("Real Railway provider smoke failed; retained its report and cleanup evidence.");
        await save(join(baseDirectory, "provider-smoke-passed.json"), { at: new Date().toISOString(), cloudExecutionVerified: true });
        report.cloudExecutionVerified = true;
      } finally { abort.signal.removeEventListener("abort", cancel); if (child.exitCode === null) await terminateProcessTree({ process: child }); }
    }
    abort.signal.throwIfAborted();
    const uploaded = await fetch(`${coordinator.url}/api/swarm/v1/sources?projectId=${encodeURIComponent(options.projectId)}&revision=${source.revision}`, {
      method: "POST", headers: { authorization: `Bearer ${serviceToken}`, "x-content-sha256": source.sha256 }, body: bundle, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(180000)]) });
    if (!uploaded.ok) throw Error("Immutable source upload failed.");
    const sourceArtifact = z.object({ id: z.string(), sha256: z.literal(source.sha256) }).parse(await uploaded.json());
    const request = createSwarmRequestSchema.parse({ ...initialRequest, repository: { ...initialRequest.repository, sourceArtifactId: sourceArtifact.id } });
    await save(join(directory, "request.json"), request);
    run = await client.create(request); await save(join(directory, "run.json"), run);
    if (options.monitor) {
      monitor = await startManagedSwarmHost({ surface: "harness", root, environment: { ...environment,
        HYPERFOCUS_SWARM_URL: coordinator.url, HYPERFOCUS_SWARM_TOKEN: serviceToken,
        HYPERFOCUS_SWARM_PROJECT_ID: options.projectId, HYPERFOCUS_SWARM_PROJECT_ROOT: projectRoot,
        AI_HARNESS_TEMPLATE_HOME: join(directory, "monitor-home"), HARNESS_DB_PATH: join(directory, "monitor.sqlite") } });
      const admission = z.object({ sessionToken:z.string() }).parse(await fetch(new URL('/api/desktop/v1/status',monitor.url)).then(response=>response.json()));
      const opened = await fetch(new URL('/api/desktop/v1/open',monitor.url),{method:'POST',headers:{'content-type':'application/json','x-harness-session-token':admission.sessionToken},body:JSON.stringify({target:projectRoot})});
      if(!opened.ok)throw Error('Could not register the monitor project through the owned desktop host.');
      const receipt = { serverId: monitor.id, url: swarmSiteUrl(monitor.url, options.projectId, run.id), runId: run.id, expiresAt: manifest.expiresAt };
      report.monitor = receipt; await save(join(directory, "monitor.json"), receipt);
      console.log(JSON.stringify({ phase: "monitor-ready", ...receipt }));
    }
    if (run.status === "READY") run = await client.action(run.id, "start");
    console.log(JSON.stringify({ phase: "running", topology, runId: run.id, directory, expiresAt: manifest.expiresAt }));
    const deadline = Math.min(Date.now() + options.runMinutes * 60000, Date.parse(manifest.expiresAt) - 30000); let reported = 0;
    while (!stopped.has(run.status) || run.tasks.some(task => task.status === "RUNNING")) {
      abort.signal.throwIfAborted(); if (Date.now() >= deadline) throw Error("Live observation deadline reached; cancelling the owned run.");
      await Bun.sleep(2000); run = await client.get(run.id); await save(join(directory, "run.json"), run);
      if (Date.now() - reported >= 30000) { console.log(JSON.stringify({ runId: run.id, status: run.status, tasks: run.tasks.map(task => ({ id: task.id, status: task.status })), estimatedComputeUsd: run.metrics.computeEstimatedUsd })); reported = Date.now(); }
    }
    const artifacts = createFileSwarmArtifactStore({ directory: join(coordinatorDirectory, "artifacts"), maxBytes: 268435456 });
    for (const artifact of run.artifacts) await artifacts.read({ sha256: artifact.sha256 });
    report.artifactHashesVerified = run.artifacts.length;
  } catch (error) { failure = error instanceof Error ? error.message : "Live runner failed."; report.failure = failure; }
  finally {
    if (run && !stopped.has(run.status) && coordinator) {
      await jsonRequest(`${coordinator.url}/api/swarm/v1/runs/${run.id}/cancel`, serviceToken, {}).catch(() => undefined);
    }
    if (monitor) {
      try { await monitor.stop(); report.monitorStopped = true; }
      catch { report.monitorStopped = false; failure ??= "Owned monitor cleanup failed; inspect its managed server ID."; }
    }
    if (coordinator) {
      try { report.coordinatorExitCode = await coordinator.stop(); if (report.coordinatorExitCode !== 0) failure ??= "Coordinator exited abnormally; inspect its retained database and log."; }
      catch { report.coordinatorStopFailed = true; failure ??= "Coordinator shutdown could not be confirmed."; }
    }
    if (bridge) {
      try { report.cleanup = await jsonRequest(`${bridge.url}/v1/admin/cleanup`, workerToken, {}); }
      catch { report.cleanup = { cleanupVerified: false, receipt: join(bridgeDirectory, "cleanup.json") }; failure ??= "Railway cleanup could not be confirmed."; }
      try { report.bridgeExitCode = await bridge.stop(); if (report.bridgeExitCode !== 0) failure ??= "Bridge exited abnormally; retained cleanup evidence requires inspection."; }
      catch { report.bridgeStopFailed = true; failure ??= "Bridge shutdown could not be confirmed."; }
    }
    const artifacts = createFileSwarmArtifactStore({ directory: join(coordinatorDirectory, "artifacts"), maxBytes: 268435456 });
    const database = join(coordinatorDirectory, "swarm.sqlite");
    if (await Bun.file(database).exists()) {
      try {
        const db = new Database(database, { readonly: true, strict: true });
        try {
          // SQLite serialization includes a retained WAL after an interrupted host.
          report.archive = await artifacts.put({ name: "swarm-state.sqlite", mediaType: "application/vnd.sqlite3", bytes: new Uint8Array(db.serialize()) });
          if (run) {
            const row = db.query<{ data: string }, [string]>("SELECT data FROM swarm_runs WHERE id=?").get(run.id);
            if (row) { run = swarmRunSchema.parse(JSON.parse(row.data)); await save(join(directory, "run.json"), run); }
          }
        } finally { db.close(); }
      }
      catch { failure ??= "The final coordinator archive could not be retained."; }
    }
    if (run) {
      report.runId = run.id; report.status = run.status; report.outcome = run.outcome;
      const commands = successfulRailwayCommands(run);
      try {
        for (const command of commands) await artifacts.read({ sha256: run.artifacts.find(artifact => artifact.id === command.artifactId)!.sha256 });
        report.successfulCommandReceipts = commands;
        report.cloudExecutionVerified = commands.length > 0 || report.cloudExecutionVerified;
      } catch { failure ??= "Successful command evidence failed its retained hash check."; }
      report.compute = { runAdmissionReservedUsd: run.metrics.computeEstimatedUsd, settledRunChargesUsd: run.metrics.computeReportedUsd,
        reservationLedger: join(bridgeDirectory, "demonstration-budget.json"), reportedChargesAvailable: run.metrics.computeReportedUsd !== null,
        basis: "Run estimates and shared admission reservations are separate. Billing snapshots are shared workspace observations, not a settled run invoice." };
    }
    report.finishedAt = new Date().toISOString(); report.failure = failure;
    await save(join(directory, "verification.json"), report);
    await inspectSwarmBilling({ root, railwayCli: resolve(options.railwayCli) }).then(value => save(join(directory, "billing-after.json"), value)).catch(() => undefined);
    process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
  }
  console.log(JSON.stringify({ directory, runId: run?.id, status: run?.status, topology, cloudExecutionVerified: report.cloudExecutionVerified, failure }));
  if (failure) throw Error(failure);
  return report;
}
