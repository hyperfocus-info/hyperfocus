import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createFileSwarmArtifactStore, createS3SwarmArtifactStore, createSwarmS3Client, createRailwayExecutionProvider, createSwarmSourceSnapshot, swarmGit } from "@hyperfocus/ai-runtime/swarm";
import { z } from "zod";

/** Explicit spending opt-in. This probes real Railway isolation; it never claims a model tournament. */
async function verify() {
  if (process.argv.slice(2).join(" ") !== "--allow-provision") throw new Error("Live verification creates up to two short-lived 2 vCPU / 2 GB Railway sandboxes. Run only with authorized spending: --allow-provision.");
  const url = process.env.SWARM_WORKER_URL, token = process.env.SWARM_WORKER_TOKEN;
  if (!url || !token) throw new Error("Set SWARM_WORKER_URL and SWARM_WORKER_TOKEN for the authorized deployed bridge.");
  if (process.env.RAILWAY_PROJECT_ID && !process.env.SWARM_S3_BUCKET) throw new Error("Cloud verification requires durable bucket storage for evidence before provisioning.");
  if (process.env.RAILWAY_PROJECT_ID) {
    const coordinatorToken = process.env.SWARM_SERVICE_TOKEN;
    if (!coordinatorToken) throw new Error("Run this probe inside the authenticated coordinator after remote device login.");
    const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? "8080"}/api/swarm/v1/capabilities`, {
      headers: { authorization: `Bearer ${coordinatorToken}` }, redirect: "error", signal: AbortSignal.timeout(120_000),
    });
    const readiness = z.object({ available: z.boolean(), inference: z.object({ provider: z.literal("Codex"), separatelyBilledUsd: z.literal(0) }) }).parse(await response.json());
    if (!response.ok || !readiness.available) throw new Error("Remote Codex subscription readiness must pass before any probe sandbox is created.");
  }
  const root = process.env.SWARM_DATA_DIR ? join(process.env.SWARM_DATA_DIR, "verification") : resolve(import.meta.dir, "../../../.local/swarm"); await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(join(root, "cloud-probe-")), source = join(fixture, "source"); await mkdir(source);
  const provider = createRailwayExecutionProvider({ url, token }), store = process.env.SWARM_S3_BUCKET
    ? createS3SwarmArtifactStore({ client: createSwarmS3Client(z.object({ bucket: z.string().min(1), endpoint: z.string().url(), accessKeyId: z.string().min(1),
      secretAccessKey: z.string().min(1), region: z.string().min(1), urlStyle: z.enum(["path", "virtual-hosted"]) }).parse({ bucket: process.env.SWARM_S3_BUCKET, endpoint: process.env.SWARM_S3_ENDPOINT,
      accessKeyId: process.env.SWARM_S3_ACCESS_KEY_ID, secretAccessKey: process.env.SWARM_S3_SECRET_ACCESS_KEY, region: process.env.SWARM_S3_REGION ?? "auto", urlStyle: process.env.SWARM_S3_URL_STYLE })), prefix: "swarm/" })
    : createFileSwarmArtifactStore({ directory: join(root, "cloud-artifacts") });
  const owned: string[] = [], startedAt = Date.now(), checks: string[] = [], swarmId = `probe-${startedAt}`;
  const report: Record<string, unknown> = { kind: "real-railway-provider-verification", startedAt: new Date().toISOString(), checks,
    swarmId, workspaces: owned,
    providerProbeModelCalls: 0, subscriptionReadiness: "Coordinator checks cached readiness or performs one tiny subscription probe before sandbox creation; its own durable artifact records that usage.", inferenceCostUsd: 0 };
  try {
    await swarmGit({ root: source, args: ["init"] });
    await writeFile(join(source, "input.txt"), "baseline\n"); await writeFile(join(source, ".gitignore"), ".local/\n");
    await swarmGit({ root: source, args: ["add", "."] });
    await swarmGit({ root: source, args: ["-c", "user.name=Hyperfocus", "-c", "user.email=probe@localhost", "commit", "-m", "cloud verification fixture"] });
    const snapshot = await createSwarmSourceSnapshot({ root: source });
    report.sourceRevision = snapshot.revision;
    const workspaceSpec = { swarmId, taskId: "baseline", source: { revision: snapshot.revision, bundle: { sha256: snapshot.sha256, bytesBase64: Buffer.from(snapshot.bytes).toString("base64") } }, resources: { cpu: 2, memoryGB: 2 }, lane: "investigation" as const };
    const workspace = await provider.createWorkspace(workspaceSpec);
    owned.push(workspace.id); checks.push("create-upload-immutable-source");
    if ((await provider.createWorkspace(workspaceSpec)).id !== workspace.id) throw new Error("Repeated create allocated a different workspace.");
    checks.push("idempotent-create-retry");
    const fork = await provider.forkWorkspace({ workspace, taskId: "candidate" }); owned.push(fork.id); checks.push("fork");
    if ((await provider.forkWorkspace({ workspace, taskId: "candidate" })).id !== fork.id) throw new Error("Repeated fork allocated a different workspace.");
    checks.push("idempotent-fork-retry");
    const task = { id: "modify", command: "printf 'candidate\\n' > input.txt; printf 'new\\n' > added.txt; bun --version; node --version; uname -a", timeoutMs: 30_000 };
    const result = await provider.execute({ workspace: fork, task });
    if (result.exitCode !== 0) throw new Error("Remote execution failed."); checks.push("execute-runtime-metadata");
    const baseline = await provider.execute({ workspace, task: { id: "unchanged", command: "cat input.txt", timeoutMs: 10_000 } });
    if (baseline.stdout.trim() !== "baseline") throw new Error("Fork mutated the baseline."); checks.push("independent-filesystems");
    const artifacts = await provider.captureArtifacts({ workspace: fork });
    report.artifacts = await Promise.all(artifacts.map(artifact => store.put(artifact))); checks.push("durable-patch-capture");
    const failed = await provider.execute({ workspace: fork, task: { id: "failure", command: "exit 7", timeoutMs: 10_000 } });
    if (failed.exitCode !== 7) throw new Error("Nonzero exit was hidden."); checks.push("failure-propagation");
    const timeout = await provider.execute({ workspace: fork, task: { id: "timeout", command: "sleep 30", timeoutMs: 1000 } });
    if (!timeout.timedOut) throw new Error("Remote timeout was hidden."); checks.push("timeout");
    const controller = new AbortController();
    let cancelled = false;
    try { await provider.execute({ workspace: fork, task: { id: "cancel", command: "sleep 30", timeoutMs: 35_000 }, signal: controller.signal, onSession: () => controller.abort(new Error("Probe cancellation")) }); }
    catch { cancelled = controller.signal.aborted; }
    if (!cancelled) throw new Error("Remote cancellation was not propagated."); checks.push("cancellation");
    report.runtime = result.stdout; report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    // A create/fork response can be lost after allocation. Recover this probe's
    // exact durable ownership before teardown rather than relying on returned IDs.
    const recovered = await provider.listWorkspaces().catch(() => undefined);
    for (const workspace of recovered ?? []) if (workspace.swarmId === swarmId && !owned.includes(workspace.id)) owned.push(workspace.id);
    const cleanup = await Promise.allSettled(owned.map(workspaceId => provider.destroyWorkspace({ workspaceId })));
    report.cleanup = cleanup.map((result, index) => ({ workspaceId: owned[index], status: result.status }));
    const remaining = await provider.listWorkspaces().catch(() => undefined);
    report.orphans = remaining?.filter(workspace => owned.includes(workspace.id)).map(workspace => workspace.id) ?? "unverified";
    report.durationMs = Date.now() - startedAt;
    report.computeEstimateUsd = ((Date.now() - startedAt) / 1000) * 8 * 0.000019290123456790123;
    report.computeEstimateBasis = "Conservative two-sandbox full resource allocation for total probe wall time; actual charges and egress are not metered here.";
    const path = join(root, `cloud-verification-${startedAt}.json`), bytes = new TextEncoder().encode(JSON.stringify(report, null, 2));
    await writeFile(path, bytes); const reportArtifact = await store.put({ name: `cloud-verification-${startedAt}.json`, mediaType: "application/json", bytes });
    await rm(fixture, { recursive: true, force: true });
    console.log(JSON.stringify({ report: path, reportArtifact, status: report.status, checks, cleanup: report.cleanup, orphans: report.orphans }));
    if (cleanup.some(result => result.status === "rejected") || report.orphans === "unverified" || (Array.isArray(report.orphans) && report.orphans.length)) throw new Error("Cloud cleanup not verified; inspect the persisted report.");
  }
}
await verify();
