import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hostedRunRequest, hostedVerificationOptionsSchema, successfulRailwayCommands } from "./hosted";
import { liveHostEnvironment, startLiveProcess } from "./process";
import { swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { formatCommandEvidence } from "../../../cli/src/swarm/execution/command-evidence";
import { openHostedAttempt } from "./attempt";

const root = resolve(import.meta.dir, "../../../../.."), directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
const id = "898f6410-ebd6-465a-84ca-620ba06be351";
const options = { demonstrationId: id, credentialId: id, projectRoot: ".", projectId: "touch-of-death", requestFile: "request.json", railwayCli: "railway", nodeExecutable: "node", allowLaunch: true };
const repository = { revision: "a".repeat(40), baseRevision: "b".repeat(40), sourceArtifactId: "source" };
test("laptop runs require explicit launch and preserve the shared reserve, source and zero paid inference", () => {
  expect(hostedVerificationOptionsSchema.parse(options).computeUsd).toBe(10);
  for (const patch of [{ allowLaunch: false }, { computeUsd: 11 }, { lifetimeMinutes: 121 }, { runMinutes: 120 }, { attempt: 4 }]) expect(hostedVerificationOptionsSchema.safeParse({ ...options, ...patch }).success).toBe(false);
  const input = { goal: "Check current live-state repair evidence", budget: { maxComputeUsd: 9, maxModelUsd: 0, maxDurationMs: 60000 } };
  const request = (value: unknown) => hostedRunRequest({ input: value, demonstrationId: id, projectId: options.projectId, maximumUsd: 10, durationMs: 60000, repository });
  expect(request(input)).toMatchObject({ backend: "railway", repository, reviewPlan: true });
  for (const patch of [{ backend: "local" }, { projectId: "unrelated" }, { maxWorkers: 4 }, { budget: { ...input.budget, maxComputeUsd: 10 } }, { budget: { ...input.budget, maxModelUsd: 1 } }, { budget: { ...input.budget, maxDurationMs: 60001 } }]) expect(() => request({ ...input, ...patch })).toThrow();
});

test("a second attempt preserves the shared authorization and refuses active or unclean predecessors", async () => {
  const parent = resolve(root, "apps/swarm-worker/.local/host-tests"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "attempts-")); directories.push(directory);
  const input = { baseDirectory: directory, attempt: 1, id, projectRoot: root, projectId: "touch-of-death", maximumUsd: 10, lifetimeMinutes: 10, requestHash: "immutable-request" };
  await expect(openHostedAttempt({ ...input, attempt: 2 })).rejects.toThrow("original demonstration manifest");
  const first = await openHostedAttempt(input);
  await expect(openHostedAttempt(input)).rejects.toThrow("concurrent attempts");
  await first.release();
  const lock = join(directory, "driver-owner.json"), stale = JSON.stringify({ pid: 2147483647, attempt: 1 });
  await writeFile(lock, stale);
  const denied = await Promise.allSettled([openHostedAttempt(input), openHostedAttempt(input)]);
  expect(denied.map(value => value.status)).toEqual(["rejected", "rejected"]);
  expect(await readFile(lock, "utf8")).toBe(stale);
  await unlink(lock);
  const priorFile = join(directory, "verification.json"), ledgerFile = join(directory, "demonstration-budget.json");
  await writeFile(ledgerFile, "retained aggregate reservations");
  const prior = { status: "RUNNING", cleanup: { cleanupVerified: true }, coordinatorExitCode: 0, bridgeExitCode: 0 };
  await writeFile(priorFile, JSON.stringify(prior));
  await expect(openHostedAttempt({ ...input, attempt: 2 })).rejects.toThrow("preceding run to be terminal");
  prior.status = "FAILED"; prior.cleanup.cleanupVerified = false; await writeFile(priorFile, JSON.stringify(prior));
  await expect(openHostedAttempt({ ...input, attempt: 2 })).rejects.toThrow("cleanup");
  prior.cleanup.cleanupVerified = true; await writeFile(priorFile, JSON.stringify(prior));
  const second = await openHostedAttempt({ ...input, attempt: 2, lifetimeMinutes: 120 });
  expect(second.directory).toBe(join(directory, "attempt-2"));
  expect(second.manifest.expiresAt).toBe(first.manifest.expiresAt);
  expect(second.manifest.maximumUsd).toBe(10);
  expect(await readFile(ledgerFile, "utf8")).toBe("retained aggregate reservations");
  expect(JSON.parse(await readFile(priorFile, "utf8"))).toEqual(prior);
  await second.release();
  await expect(openHostedAttempt({ ...input, attempt: 3 })).rejects.toThrow();
  await writeFile(join(second.directory, "verification.json"), JSON.stringify({ ...prior, status: "RUNNING" }));
  await expect(openHostedAttempt({ ...input, attempt: 3 })).rejects.toThrow("preceding run to be terminal");
  await writeFile(join(second.directory, "verification.json"), JSON.stringify(prior));
  const third = await openHostedAttempt({ ...input, attempt: 3, lifetimeMinutes: 120 });
  expect(third.directory).toBe(join(directory, "attempt-3")); expect(third.manifest).toEqual(first.manifest);
  await third.release();
  for (const patch of [{ maximumUsd: 9 }, { requestHash: "changed" }, { attempt: 4 }]) await expect(openHostedAttempt({ ...input, ...patch })).rejects.toThrow();
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ ...first.manifest, expiresAt: new Date(Date.now() - 1000).toISOString() }));
  await expect(openHostedAttempt({ ...input, lifetimeMinutes: 120 })).rejects.toThrow("original demonstration expiry");
});
test("owned service environments omit ambient cloud and model credentials", () => {
  expect(liveHostEnvironment({ PATH: "path", SYSTEMROOT: "windows", OPENAI_API_KEY: "paid", ANTHROPIC_API_KEY: "paid", RAILWAY_API_TOKEN: "cloud", SWARM_SERVICE_TOKEN: "private", CODEX_HOME: "auth" })).toEqual({ PATH: "path", SYSTEMROOT: "windows" });
});

test("cloud attribution requires a successful structured receipt linked to the immutable log", () => {
  const run = swarmRunSchema.parse({ id: "run", request: { requestId: "request", projectId: "touch-of-death", goal: "Check attribution", repository }, status: "FAILED", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {} });
  expect(successfulRailwayCommands(run)).toEqual([]);
  const artifact = { id: "artifact", swarmId: run.id, taskId: "task", agentId: "agent", sourceRevision: repository.revision, name: "command.log", kind: "log" as const, mediaType: "text/plain", sha256: "c".repeat(64), bytes: 3, createdAt: 1 };
  const receipt = { artifactId: artifact.id, commandSha256: "d".repeat(64), category: "preparation" as const, status: "returned" as const, exitCode: 0, timedOut: false, truncated: false, durationMs: 10 };
  run.messages.push({ id: "message", swarmId: run.id, taskId: "task", agentId: "agent", sourceRevision: repository.revision, kind: "validation", text: formatCommandEvidence(receipt), artifactIds: [artifact.id], createdAt: 1 });
  expect(successfulRailwayCommands(run)).toEqual([]); run.artifacts.push(artifact);
  expect(successfulRailwayCommands(run)).toEqual([receipt]);
  run.messages[0]!.text = formatCommandEvidence({ ...receipt, exitCode: 1 }); expect(successfulRailwayCommands(run)).toEqual([]);
  run.messages[0]!.text = formatCommandEvidence(receipt); run.request.backend = "local"; expect(successfulRailwayCommands(run)).toEqual([]);
});

const nodeExecutable = process.env.SWARM_NODE_EXECUTABLE;
test.skipIf(!nodeExecutable)("real Node bridge and Bun coordinator retain ledger/artifacts and cleanly stop without cloud allocation", async () => {
  const parent = resolve(root, "apps/swarm-worker/.local/host-tests"); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "owned-")); directories.push(directory);
  const workerToken = "fixture-worker-token-with-thirty-two-characters", serviceToken = "fixture-service-token-with-thirty-two-characters";
  const environment = { ...liveHostEnvironment(), SWARM_DEMONSTRATION_ID: id, SWARM_DEMONSTRATION_EXPIRES_AT: new Date(Date.now() + 60000).toISOString() };
  const build = await Bun.build({ entrypoints: [resolve(root, "apps/swarm-worker/scripts/bridge-host.ts")], target: "node", format: "esm", external: ["railway"], outdir: directory });
  expect(build.success).toBe(true);
  const bridgeOptions = { cmd: [nodeExecutable!, build.outputs[0]!.path, "--allow-provision"], root, log: join(directory, "bridge.log"),
    environment: { ...environment, RAILWAY_ENVIRONMENT_ID: "fixture-environment", RAILWAY_API_TOKEN: "fixture-api-never-used", SWARM_WORKER_TOKEN: workerToken,
      SWARM_WORKER_DATA_DIR: join(directory, "bridge"), SWARM_DEMONSTRATION_MAX_USD: "2" } };
  let bridge = await startLiveProcess(bridgeOptions);
  let coordinator: Awaited<ReturnType<typeof startLiveProcess>> | undefined;
  async function worker(path: string) { return (await fetch(`${bridge.url}/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${workerToken}`, "content-type": "application/json" }, body: "{}" })).json(); }
  try {
    expect((await fetch(`${bridge.url}/v1/list`, { method: "POST" })).status).toBe(401);
    expect(await worker("list")).toEqual([]); expect(await worker("admin/budget")).toMatchObject({ reservedUsd: 1, admissions: [] });
    coordinator = await startLiveProcess({ cmd: [process.execPath, resolve(root, "apps/harness/scripts/swarm/live/coordinator.ts"), "--allow-launch"], root, log: join(directory, "coordinator.log"),
      environment: { ...environment, SWARM_COORDINATOR_TOPOLOGY: "laptop", SWARM_DATA_DIR: join(directory, "coordinator"), SWARM_BACKEND: "railway",
        SWARM_WORKER_URL: bridge.url, SWARM_WORKER_TOKEN: workerToken, SWARM_SERVICE_TOKEN: serviceToken, SWARM_PROJECT_IDS: "touch-of-death", SWARM_CODEX_EXECUTABLE: "never-call-model-in-this-test" } });
    const bundle = new TextEncoder().encode("# v2 git bundle\nfixture-data"), sha256 = new Bun.CryptoHasher("sha256").update(bundle).digest("hex");
    const uploaded = await fetch(`${coordinator.url}/api/swarm/v1/sources?projectId=touch-of-death&revision=${repository.revision}`, { method: "POST", headers: { authorization: `Bearer ${serviceToken}`, "x-content-sha256": sha256 }, body: bundle });
    expect(uploaded.status).toBe(200); expect(await uploaded.json()).toMatchObject({ sha256, bytes: bundle.length });
    await coordinator.stop(); coordinator = undefined;
    const artifact = join(directory, "coordinator/artifacts/sha256", sha256.slice(0, 2), sha256);
    expect(await readFile(artifact)).toEqual(Buffer.from(bundle));
    await bridge.stop();
    const ledger = join(directory, "bridge/demonstration-budget.json"), saved = JSON.parse(await readFile(ledger, "utf8"));
    saved.admissions.push({ id: crypto.randomUUID(), reservedUsd: 0.5, createdAt: new Date().toISOString() }); await writeFile(ledger, JSON.stringify(saved));
    bridge = await startLiveProcess(bridgeOptions);
    expect(await worker("admin/budget")).toMatchObject({ reservedUsd: 1.5, admissions: [{ reservedUsd: 0.5 }] });
  } finally { await coordinator?.stop(); await bridge.stop(); }
  expect(JSON.parse(await readFile(join(directory, "bridge/cleanup.json"), "utf8"))).toMatchObject({ cleanupVerified: true, owned: [], remaining: [] });
}, 30000);
