import { createSwarmClient, createSwarmRequestSchema, swarmRunSchema, type SwarmCapabilities, type SwarmContext, type SwarmRun } from "@hyperfocus/ai-core/swarm";
import { createHarnessClient, type MemoryEntry } from "@hyperfocus/ai-core";
import { inspectWindowsProcessTrees } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { browserExecutable, connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { touchOfDeathSwarmGoal, touchOfDeathSwarmHypotheses } from "@hyperfocus/touch-of-death/swarm";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";
import { z } from "zod";
import { inspectArchivedOutcome } from "./browser/archived-outcome";

const identifier = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
const hostUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
}, "Use the loopback URL returned by the managed development supervisor.");
export const liveVerificationOptionsSchema = z.object({
  harnessUrl: hostUrl, editorUrl: hostUrl, projectId: identifier, projectRoot: z.string().min(1),
  demonstrationId: z.string().uuid(), runId: identifier.optional(), allowLaunch: z.boolean().default(false),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  startReady: z.boolean().default(false),
  rejectRun: z.boolean().default(false), waitMinutes: z.number().int().min(1).max(120).default(65),
  runMinutes: z.number().int().min(1).max(90).default(60), taskMinutes: z.number().int().min(1).max(60).default(10),
  computeUsd: z.number().finite().min(0.01).max(10).default(5),
}).strict().superRefine((value, context) => {
  if (value.archiveSha256 && (!value.runId || value.allowLaunch || value.startReady || value.rejectRun)) context.addIssue({ code: "custom", message: "Archive inspection requires one existing run and forbids every mutation." });
  if (!value.runId && !value.allowLaunch) context.addIssue({ code: "custom", message: "Launching requires --allow-launch; inspection requires --run-id." });
  if (value.runId && value.allowLaunch) context.addIssue({ code: "custom", message: "Choose an existing run or launch a new run, never both." });
  if (value.startReady && !value.runId) context.addIssue({ code: "custom", message: "--start-ready requires one existing --run-id; it never creates another run." });
});
type LiveOptions = z.infer<typeof liveVerificationOptionsSchema>;

export function assertLiveSwarmPreflight(projectId: string, hosts: Array<{ context: SwarmContext; capabilities: SwarmCapabilities }>) {
  if (hosts.length !== 2) throw new Error("Both Harness and Editor must be inspected.");
  for (const host of hosts) {
    if (host.context.projectId !== projectId) throw new Error("Harness and Editor must resolve to the same explicitly authorized project.");
    if (!host.context.provider.available || !host.capabilities.available || !host.capabilities.backends.includes("railway")) throw new Error("The actual Railway provider must be available in both hosts; local fallback is forbidden.");
    if (!host.capabilities.projects.some(project => project.id === projectId)) throw new Error("The remote coordinator has not authorized this project.");
    if (!/^codex(?:-account)?$/i.test(host.capabilities.inference?.provider ?? "") || host.capabilities.inference?.separatelyBilledUsd !== 0) throw new Error("The live demonstration requires existing Codex subscription inference with $0 separately billed API usage.");
  }
  if (hosts[0]!.context.repository.revision !== hosts[1]!.context.repository.revision) throw new Error("Harness and Editor resolve to different repository revisions.");
}

export function assertArchivedSwarmPreflight(projectId: string, sha256: string, hosts: Array<{ context: SwarmContext; capabilities: SwarmCapabilities }>) {
  if (hosts.length !== 2 || hosts.some(host => host.context.projectId !== projectId || host.capabilities.archive?.sha256 !== sha256 || host.capabilities.available || host.context.provider.available || !host.capabilities.projects.some(project => project.id === projectId))) throw Error("Both native hosts must expose the same read-only archive and project.");
}

export function touchOfDeathGoal(demonstrationId: string) {
  return `Touch of Death performance tournament (${demonstrationId}).\n${touchOfDeathSwarmGoal}`;
}

export function liveRequestTimeout(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return init?.method === "POST" && url.pathname.endsWith("/runs") ? 300_000 : 120_000;
}

export async function readSwarmProjectMemory(client: Pick<ReturnType<typeof createHarnessClient>, "onEvent" | "send">, run: SwarmRun) {
  const requestId = crypto.randomUUID();
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<MemoryEntry>((resolveEntry, reject) => {
      timer = setTimeout(() => reject(new Error("Harness project memory inspection timed out.")), 15_000);
      unsubscribe = client.onEvent(event => {
        if (!("requestId" in event) || event.requestId !== requestId) return;
        if (event.type === "command.rejected") reject(new Error(`Harness project memory inspection failed: ${event.payload.message}`));
        if (event.type !== "memory.inspected") return;
        const entry = event.payload.entry;
        if (entry.id !== `swarm-${run.id}` || entry.projectId !== run.request.projectId || entry.kind !== "task-summary"
          || !entry.summary.startsWith(`${run.status}:`) || !entry.evidence?.includes(`Run ${run.id}`)
          || !entry.evidence.includes(`Source ${run.request.repository.revision}`)
          || !entry.tags.includes("feature:swarm")) reject(new Error("Harness project memory does not match this run's source and disposition."));
        else resolveEntry(entry);
      });
      const sent = client.send({ type: "memory.inspect", requestId, payload: { memoryEntryId: `swarm-${run.id}` } });
      if (sent.status === "rejected") reject(new Error(`Harness project memory request was rejected: ${sent.reason}`));
    });
  } finally { clearTimeout(timer); unsubscribe(); }
}

const stopped = new Set(["AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "BLOCKED"]);
async function openDialog(page: Page, surface: "harness" | "editor", url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (surface === "editor") {
    const center = page.getByRole("button", { name: "Close project center", exact: true });
    if (await center.isVisible()) await center.click();
    await page.getByRole("button", { name: "Open AI project actions", exact: true }).click();
  }
  await page.locator(`[data-test-${surface}-run-with-swarm]`).click();
  const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
  await dialog.waitFor();
  await page.waitForFunction(() => {
    const picker = document.querySelector<HTMLButtonElement>('button[aria-label="Task run"]');
    return picker && !picker.disabled;
  });
  return dialog;
}

async function selectRun(page: Page, run: SwarmRun) {
  const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  const picker = dialog.getByRole("button", { name: "Task run", exact: true });
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('button[aria-label="Task run"]')?.disabled === false);
  if (await picker.getAttribute("data-select-value") !== run.id) {
    await picker.click();
    await page.locator(`[data-select-option="${run.id}"]`).click();
  }
  if (await picker.getAttribute("data-select-value") !== run.id) throw new Error("The requested run was not selected in the app.");
  return dialog;
}

/** Uses authenticated local host APIs and owned browser UI only. No cloud credentials or fixture workloads. */
export async function verifyLiveSwarm(options: LiveOptions) {
  const root = resolve(import.meta.dir, "../../../..");
  const invocationId = crypto.randomUUID();
  const evidenceRoot = resolve(root, ".local/swarm/live-ui", options.demonstrationId);
  const output = resolve(evidenceRoot, options.runId ?? "launched", invocationId);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(evidenceRoot, "latest.json"), JSON.stringify({ invocationId, output, inspectedRunId: options.runId, startedAt: new Date().toISOString() }, null, 2));
  const statusResponse = await fetch(new URL("/api/desktop/v1/status", options.harnessUrl), { signal: AbortSignal.timeout(15_000) });
  if (!statusResponse.ok) throw new Error("Harness desktop session capability is unavailable.");
  const status = z.object({ sessionToken: z.string().min(1) }).passthrough().parse(await statusResponse.json());
  const headers = { "x-harness-session-token": status.sessionToken };
  const harness = createSwarmClient({ baseUrl: new URL("/api/swarm/v1", options.harnessUrl).href, fetch: (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers }, signal: AbortSignal.timeout(liveRequestTimeout(input, init)) }) });
  const editor = createSwarmClient({ baseUrl: new URL("/api/swarm/v1", options.editorUrl).href, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(120_000) }) });
  const opened = await fetch(new URL("/api/desktop/v1/open", options.harnessUrl), { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ target: resolve(options.projectRoot) }), signal: AbortSignal.timeout(30_000) });
  const openedProject = z.object({ projectId: z.string() }).passthrough().parse(await opened.json());
  if (!opened.ok || !options.archiveSha256 && openedProject.projectId !== options.projectId) throw new Error("Harness opened a different registered project.");
  const contexts = await Promise.all([harness.context(openedProject.projectId), editor.context("editor-workspace")]);
  const capabilities = await Promise.all([harness.capabilities(), editor.capabilities()]);
  await writeFile(resolve(output, "preflight.json"), JSON.stringify({ inspectedAt: new Date().toISOString(), contexts, capabilities }, null, 2));
  const hosts = contexts.map((context, index) => ({ context, capabilities: capabilities[index]! }));
  if (options.archiveSha256) assertArchivedSwarmPreflight(options.projectId, options.archiveSha256, hosts);
  else assertLiveSwarmPreflight(options.projectId, hosts);
  const owned = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
  const browserContext = await owned.browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const harnessPage = await browserContext.newPage(), editorPage = await browserContext.newPage();
  if (process.platform === "win32") {
    const windows = inspectWindowsProcessTrees({rootPids:[process.pid]});
    await writeFile(resolve(output,"windows.json"),JSON.stringify(windows,null,2));
    if(windows.visibleWindows.length) { await browserContext.close(); await owned.close(); throw Error("Native verification opened a visible process window."); }
  }
  const pageErrors: Array<{ host: string; message: string }> = [];
  const captureErrors: Array<{ name: string; message: string }> = [];
  async function capture(page: Page, name: string) {
    try {
      // A background tab may not paint in an owned headless Chrome instance.
      // Serialize captures and activate their page before asking for pixels.
      await page.bringToFront();
      await page.screenshot({ path: resolve(output, name), fullPage: false, animations: "disabled", timeout: 10_000 });
    } catch (error) { captureErrors.push({ name, message: error instanceof Error ? error.message : String(error) }); }
  }
  harnessPage.on("pageerror", error => pageErrors.push({ host: "harness", message: error.message }));
  editorPage.on("pageerror", error => pageErrors.push({ host: "editor", message: error.message }));
  let run: SwarmRun | undefined;
  let launched = false, observationTimedOut = false;
  const inspectedHosts: Array<{ host: string; runId: string; sourceRevision: string; artifactId?: string; outcomeArtifactIds?: string[] }> = [];
  let projectMemory: { id: string; verified: boolean; error?: string } | undefined;
  async function persist() {
    if (run) await writeFile(resolve(output, "run.json"), JSON.stringify(run, null, 2));
    await writeFile(resolve(output, "verification.json"), JSON.stringify({ demonstrationId: options.demonstrationId, invocationId, runId: run?.id, simulated: false, archiveSha256: options.archiveSha256, readOnly: Boolean(options.archiveSha256), hostUrls: {harness: options.harnessUrl, editor: options.editorUrl}, requestedBackend: run?.request.backend, launchedThroughHarness: launched, observationTimedOut, updatedAt: new Date().toISOString(), pageErrors, captureErrors, inspectedHosts, projectMemory, providerInventoryConfirmationRequired: !options.archiveSha256, localRepositoryCommandsExecuted: 0, sourceRevision: run?.request.repository.revision, sourceArtifactId: run?.request.repository.sourceArtifactId, status: run?.status, workspaceIds: [...new Set(run?.tasks.flatMap(task => task.workspaceId ? [task.workspaceId] : []) ?? [])], metrics: run?.metrics }, null, 2));
  }
  try {
    const dialog = await openDialog(harnessPage, "harness", options.harnessUrl);
    if (options.runId) {
      run = await harness.get(options.runId);
      if (run.request.projectId !== options.projectId || run.request.backend !== "railway") throw new Error("The selected run is not a Railway run for this project.");
      await selectRun(harnessPage, run);
      if (options.startReady && run.status !== "READY") throw Error("Only an existing READY plan can be launched with --start-ready.");
    } else {
      run = await harness.create(createSwarmRequestSchema.parse({
        requestId: `live-${options.demonstrationId}`, projectId: options.projectId,
        goal: touchOfDeathGoal(options.demonstrationId), hypotheses: touchOfDeathSwarmHypotheses,
        repository: contexts[0]!.repository, backend: "railway", strategy: "tournament", maxWorkers: 3, reviewPlan: true,
        budget: { maxComputeUsd: options.computeUsd, maxModelUsd: 0, maxDurationMs: options.runMinutes * 60_000,
          maxTaskDurationMs: options.taskMinutes * 60_000, maxCallsPerAgent: 24, maxTokensPerAgent: 400_000, maxTotalTokens: 1_000_000, maxWeeklyQuotaPercent: 20, maxRetries: 1 },
      }));
      await persist();
      if (run.request.projectId !== options.projectId || run.request.backend !== "railway" || run.request.repository.baseRevision !== contexts[0]!.repository.revision || !run.request.repository.sourceArtifactId) throw new Error("The submitted run did not preserve its authorized project, cloud backend and immutable source.");
      await selectRun(harnessPage, run);
    }
    if (!options.runId || options.startReady) {
      await capture(harnessPage, "harness-plan.png");
      const [startResponse] = await Promise.all([
        harnessPage.waitForResponse(response => response.url().endsWith(`/runs/${run!.id}/start`) && response.request().method() === "POST", { timeout: 120_000 }),
        dialog.getByRole("button", { name: "Launch workers", exact: true }).click(),
      ]);
      if (!startResponse.ok()) throw new Error(`Starting the reviewed run failed (${startResponse.status()}).`);
      run = swarmRunSchema.parse(await startResponse.json()); launched = true; await persist();
    }
    await openDialog(editorPage, "editor", options.editorUrl);
    const editorRun = await editor.get(run.id);
    if (editorRun.request.repository.revision !== run.request.repository.revision || editorRun.request.projectId !== options.projectId) throw new Error("Editor did not retrieve the same source and project as Harness.");
    await selectRun(editorPage, editorRun);
    await capture(harnessPage, "harness-running.png"); await capture(editorPage, "editor-running.png");
    console.log(JSON.stringify({ runId: run.id, sourceRevision: run.request.repository.revision, output, phase: "observing", simulated: false }));
    const deadline = Date.now() + options.waitMinutes * 60_000;
    let reportedAt = 0;
    while (!options.archiveSha256 && (!stopped.has(run.status) || run.tasks.some(task => task.status === "RUNNING"))) {
      if (Date.now() >= deadline) { observationTimedOut = true; break; }
      await Bun.sleep(5_000); run = await harness.get(run.id); await persist();
      if (Date.now() - reportedAt >= 60_000) { console.log(JSON.stringify({ runId: run.id, status: run.status, tasks: run.tasks.map(task => ({ id: task.id, status: task.status })), computeEstimatedUsd: run.metrics.computeEstimatedUsd })); reportedAt = Date.now(); }
    }
    if (observationTimedOut && launched) { run = await harness.action(run.id, "cancel"); await persist(); }
    for (const [name, page] of [["harness", harnessPage], ["editor", editorPage]] as const) {
      const review = await selectRun(page, run);
      const outcomeArtifactIds = options.archiveSha256 ? await inspectArchivedOutcome({page, run, surface: name, capture}) : undefined;
      const patch = review.getByRole("button", { name: "Review patch", exact: true }).first();
      const reviewable = run.artifacts.filter(artifact => ["benchmark", "validation", "report", "log"].includes(artifact.kind) && artifact.bytes <= 33_554_432 && (artifact.mediaType.startsWith("text/") || artifact.mediaType.includes("json")));
      const report = reviewable.find(artifact => artifact.id === run?.outcome?.artifactId) ?? reviewable[0];
      const hasPatch = await patch.isVisible();
      let artifactId: string | undefined;
      if (hasPatch || report) {
        const inspect = async () => {
          if (hasPatch) { await patch.click(); return; }
          const disclosure = review.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Artifacts \(\d+\)$/ }) });
          if (!await disclosure.evaluate(element => element instanceof HTMLDetailsElement && element.open)) await disclosure.locator("summary").click();
          await review.getByRole("list", { name: "Preserved artifacts", exact: true }).getByRole("button", { name: report!.name, exact: true }).first().click();
        };
        const [response] = await Promise.all([
          page.waitForResponse(response => response.url().includes(`/runs/${run!.id}/artifacts/`) && response.request().method() === "GET", { timeout: 120_000 }),
          inspect(),
        ]);
        if (!response.ok()) throw new Error(`${name} artifact inspection failed (${response.status()}).`);
        artifactId = new URL(response.url()).pathname.split("/").at(-1);
        const preview = review.locator("[data-test-task-review-artifact] pre");
        await preview.waitFor({ timeout: 120_000 }); await preview.scrollIntoViewIfNeeded();
      }
      inspectedHosts.push({ host: name, runId: run.id, sourceRevision: run.request.repository.revision, artifactId, outcomeArtifactIds });
      await capture(page, `${name}-review.png`);
    }
    if (options.rejectRun && run.status === "AWAITING_APPROVAL") {
      const [response] = await Promise.all([
        harnessPage.waitForResponse(response => response.url().endsWith(`/runs/${run!.id}/reject`) && response.request().method() === "POST", { timeout: 120_000 }),
        dialog.getByRole("button", { name: "Finish without integrating", exact: true }).click(),
      ]);
      if (!response.ok()) throw new Error(`Reviewed rejection failed (${response.status()}).`);
      run = swarmRunSchema.parse(await response.json());
      await selectRun(editorPage, run);
      await capture(harnessPage, "harness-rejected.png"); await capture(editorPage, "editor-rejected.png");
    }
    if (!options.archiveSha256 && (run.status === "COMPLETED" || run.candidates.some(candidate => candidate.disposition === "rejected"))) {
      const memoryClient = createHarnessClient({ endpoint: options.harnessUrl, sessionToken: status.sessionToken, reconnect: false, readyTimeoutMs: 30_000 });
      try {
        await harness.get(run.id); // A failed disposition-note save is retried by the host on refresh.
        await memoryClient.connect();
        const entry = await readSwarmProjectMemory(memoryClient, run);
        projectMemory = { id: entry.id, verified: true };
        await writeFile(resolve(output, "project-memory.json"), JSON.stringify(entry, null, 2));
      } catch (error) { projectMemory = { id: `swarm-${run.id}`, verified: false, error: error instanceof Error ? error.message : String(error) }; }
      finally { memoryClient.disconnect(); }
    }
    await persist();
    console.log(JSON.stringify({ output, runId: run.id, status: run.status, observationTimedOut, simulated: false, pageErrors }, null, 2));
    if (observationTimedOut) throw new Error("Live observation reached its bound; a run launched by this verifier was cancelled. Evidence is preserved.");
    if (options.archiveSha256 && captureErrors.length) throw new Error("Archived review screenshot capture failed; inspect verification.json.");
    if (pageErrors.length) throw new Error("App runtime errors occurred; inspect verification.json.");
    if (projectMemory && !projectMemory.verified) throw new Error("The cloud result is preserved, but Harness project memory verification failed; inspect verification.json.");
    return run;
  } catch (error) {
    await persist();
    await writeFile(resolve(output, "failure.json"), JSON.stringify({ runId: run?.id, at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) }, null, 2));
    await capture(harnessPage, "harness-failure.png"); await capture(editorPage, "editor-failure.png");
    throw error;
  } finally { await browserContext.close(); await owned.close(); }
}

if (import.meta.main) {
  const { values } = parseArgs({ args: process.argv.slice(2), strict: true, options: {
    "topology": { type: "string" }, "credential-id": { type: "string" }, "request-file": { type: "string" }, "railway-cli": { type: "string" },
    "node-executable": { type: "string" }, "provider-smoke": { type: "boolean" }, "lifetime-minutes": { type: "string" }, "attempt": { type: "string" }, "monitor": { type: "boolean" },
    "archive-sha256": { type: "string" }, "harness-url": { type: "string" }, "editor-url": { type: "string" }, "project-id": { type: "string" }, "project-root": { type: "string" },
    "demonstration-id": { type: "string" }, "run-id": { type: "string" }, "allow-launch": { type: "boolean" }, "start-ready": { type: "boolean" }, "reject-run": { type: "boolean" },
    "wait-minutes": { type: "string" }, "run-minutes": { type: "string" }, "task-minutes": { type: "string" }, "compute-usd": { type: "string" },
  } });
  if (values.topology === "laptop") {
    const { hostedVerificationOptionsSchema, verifyHostedSwarm } = await import("./live/hosted");
    await verifyHostedSwarm(hostedVerificationOptionsSchema.parse({ demonstrationId: values["demonstration-id"], credentialId: values["credential-id"], projectId: values["project-id"], projectRoot: values["project-root"],
      requestFile: values["request-file"], railwayCli: values["railway-cli"], nodeExecutable: values["node-executable"], allowLaunch: values["allow-launch"], providerSmoke: values["provider-smoke"], monitor: values.monitor,
      computeUsd: values["compute-usd"] === undefined ? undefined : Number(values["compute-usd"]), runMinutes: values["run-minutes"] === undefined ? undefined : Number(values["run-minutes"]),
      lifetimeMinutes: values["lifetime-minutes"] === undefined ? undefined : Number(values["lifetime-minutes"]), attempt: values.attempt === undefined ? undefined : Number(values.attempt) }));
  } else {
    if (values.topology !== undefined && values.topology !== "remote") throw Error("Choose --topology laptop or remote.");
    await verifyLiveSwarm(liveVerificationOptionsSchema.parse({ archiveSha256: values["archive-sha256"], harnessUrl: values["harness-url"], editorUrl: values["editor-url"], projectId: values["project-id"], projectRoot: values["project-root"], demonstrationId: values["demonstration-id"], runId: values["run-id"], allowLaunch: values["allow-launch"], startReady: values["start-ready"], rejectRun: values["reject-run"], waitMinutes: values["wait-minutes"] === undefined ? undefined : Number(values["wait-minutes"]), runMinutes: values["run-minutes"] === undefined ? undefined : Number(values["run-minutes"]), taskMinutes: values["task-minutes"] === undefined ? undefined : Number(values["task-minutes"]), computeUsd: values["compute-usd"] === undefined ? undefined : Number(values["compute-usd"]) }));
  }
}
