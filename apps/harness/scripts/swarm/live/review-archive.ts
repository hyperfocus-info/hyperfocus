import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { createFileSwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import { swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { inspectWindowsProcessTrees } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { openSwarmArchive } from "../../../cli/src/swarm/archive";
import { startManagedSwarmHost } from "../browser/managed-host";
import { liveVerificationOptionsSchema, verifyLiveSwarm } from "../verify-live";
import { liveHostEnvironment } from "./process";

const receiptSchema = z.object({
  demonstrationId: z.string().uuid(), runId: z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/), simulated: z.literal(false),
  finishedAt: z.string().datetime(), coordinatorExitCode: z.literal(0), bridgeExitCode: z.literal(0),
  cleanup: z.object({ cleanupVerified: z.literal(true) }),
  artifactsLocation: z.string().min(1), source: z.object({ revision: z.string().regex(/^[a-f0-9]{40,64}$/) }),
  archive: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() }),
});

/** Reopens completed real evidence. Never opens the live SQLite path or constructs an execution owner. */
export async function reviewSwarmArchive(options: { verification: string; projectId: string; projectRoot: string }) {
  const root = resolve(import.meta.dir, "../../../../..");
  const receipt = receiptSchema.parse(await Bun.file(resolve(options.verification)).json());
  const output = resolve(root, ".local/swarm/live-ui", receipt.demonstrationId, receipt.runId, `archive-owner-${crypto.randomUUID()}`);
  await mkdir(output, { recursive: true });
  const artifacts = createFileSwarmArtifactStore({ directory: join(receipt.artifactsLocation, "artifacts"), maxBytes: 268435456 });
  const bytes = await artifacts.read({ sha256: receipt.archive.sha256 });
  if (bytes.byteLength !== receipt.archive.bytes) throw Error("Serialized archive size does not match its final receipt.");
  const token = randomBytes(32).toString("hex");
  const archive = openSwarmArchive({ bytes, sha256: receipt.archive.sha256, token, artifacts: { read: artifacts.read }, projects: new Map([[options.projectId, { name: "Archived Swarm project" }]]) });
  const hosts: Awaited<ReturnType<typeof startManagedSwarmHost>>[] = [];
  const hostReceipts: Array<{ surface: "harness" | "editor"; id: string; url: string }> = [];
  // Bounded evidence transport; both app surfaces still use the managed development supervisor.
  const service = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: archive.handler });
  const summary: Record<string, unknown> = { simulated: false, archived: true, verification: resolve(options.verification), output, archiveSha256: receipt.archive.sha256, runId: receipt.runId, sourceRevision: receipt.source.revision, hosts: hostReceipts, startedAt: new Date().toISOString() };
  try {
    const response = await archive.handler(new Request(`http://127.0.0.1/api/swarm/v1/runs/${receipt.runId}`, { headers: { authorization: `Bearer ${token}` } }));
    const payload: unknown = await response.json();
    if (!response.ok) throw Error(`Archive read failed: ${JSON.stringify(payload)}`);
    const run = swarmRunSchema.parse(payload);
    if (!response.ok || run.request.repository.revision !== receipt.source.revision || run.request.projectId !== options.projectId) throw Error("Archive run identity does not match its final cloud receipt.");
    for (const artifact of run.artifacts) {
      const retained = await artifacts.read({ sha256: artifact.sha256 });
      if (retained.byteLength !== artifact.bytes) throw Error(`Artifact size mismatch: ${artifact.id}`);
    }
    summary.artifactHashesVerified = run.artifacts.length;
    const environment = { ...liveHostEnvironment(), HYPERFOCUS_SWARM_URL: service.url.origin, HYPERFOCUS_SWARM_TOKEN: token,
      HYPERFOCUS_SWARM_ARCHIVE: "1", HYPERFOCUS_SWARM_PROJECT_ID: options.projectId, HYPERFOCUS_SWARM_PROJECT_ROOT: resolve(options.projectRoot),
      AI_HARNESS_TEMPLATE_HOME: join(output, "harness-home"), HARNESS_DB_PATH: join(output, "harness.sqlite") };
    for (const surface of ["harness", "editor"] as const) {
      const host = await startManagedSwarmHost({ surface, root, environment }); hosts.push(host);
      hostReceipts.push({ surface, id: host.id, url: host.url });
      console.log(JSON.stringify({ phase: "archive-host-ready", surface, id: host.id, url: host.url }));
    }
    if (process.platform === "win32") {
      const windows = await inspectWindowsProcessTrees({ rootPids: [process.pid] });
      await writeFile(join(output, "windows.json"), JSON.stringify(windows, null, 2));
      if (windows.visibleWindows.length) throw Error("Archived review opened a visible process window.");
    }
    const reviewed = await verifyLiveSwarm(liveVerificationOptionsSchema.parse({ harnessUrl: hosts[0]!.url, editorUrl: hosts[1]!.url,
      projectId: options.projectId, projectRoot: resolve(options.projectRoot), demonstrationId: receipt.demonstrationId, runId: run.id, archiveSha256: receipt.archive.sha256 }));
    if (JSON.stringify(reviewed) !== JSON.stringify(run)) throw Error("Native review changed the archived run.");
    const retained = await artifacts.read({ sha256: receipt.archive.sha256 });
    summary.archiveUnchanged = createHash("sha256").update(retained).digest("hex") === receipt.archive.sha256;
    summary.nativeReviewVerified = true;
    summary.nativeReview = await Bun.file(resolve(root, ".local/swarm/live-ui", receipt.demonstrationId, "latest.json")).json();
  } catch (error) {
    summary.failure = error instanceof Error ? error.message : String(error); throw error;
  } finally {
    const cleanup = await Promise.allSettled(hosts.map(host => host.stop()));
    service.stop(true); archive.close();
    summary.hostCleanup = cleanup.map((result, index) => ({ id: hosts[index]!.id, stopped: result.status === "fulfilled", ...(result.status === "rejected" ? { error: String(result.reason) } : {}) }));
    summary.finishedAt = new Date().toISOString();
    await writeFile(join(output, "verification.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ output, runId: receipt.runId, nativeReviewVerified: summary.nativeReviewVerified, failure: summary.failure }));
    if (cleanup.some(result => result.status === "rejected")) throw Error("One owned archive-review host failed cleanup; inspect verification.json.");
  }
  return summary;
}

if (import.meta.main) {
  const { values } = parseArgs({ strict: true, options: { verification: { type: "string" }, "project-id": { type: "string" }, "project-root": { type: "string" } } });
  const options = z.object({ verification: z.string().min(1), projectId: z.string().min(1), projectRoot: z.string().min(1) }).parse({ verification: values.verification, projectId: values["project-id"], projectRoot: values["project-root"] });
  await reviewSwarmArchive(options);
}
