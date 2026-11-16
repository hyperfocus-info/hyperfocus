import { expect, test } from "bun:test";
import { swarmCapabilitiesSchema, swarmContextSchema } from "@hyperfocus/ai-core/swarm";
import { memoryEntrySchema, type ClientCommand, type HarnessSendResult, type ServerEvent } from "@hyperfocus/ai-core";
import { swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { assertArchivedSwarmPreflight, assertLiveSwarmPreflight, liveRequestTimeout, liveVerificationOptionsSchema, readSwarmProjectMemory, touchOfDeathGoal } from "./verify-live";

const options = { harnessUrl: "http://127.0.0.1:8787", editorUrl: "http://127.0.0.1:8796", projectId: "project-1", projectRoot: ".", demonstrationId: "898f6410-ebd6-465a-84ca-620ba06be351" };
const context = swarmContextSchema.parse({ projectId: "project-1", name: "Actual project", repository: { revision: "a".repeat(40) }, dirty: true, sourceSnapshotRequired: true, provider: { available: true } });
const capabilities = swarmCapabilitiesSchema.parse({ available: true, backends: ["railway"], maxWorkers: 3, projects: [{ id: "project-1", name: "Actual project" }], inference: { provider: "codex-account", credentialSource: "ChatGPT subscription", separatelyBilledUsd: 0 } });

test("live verification requires explicit launch or one existing run and bounded compute", () => {
  expect(liveVerificationOptionsSchema.safeParse(options).success).toBe(false);
  expect(liveVerificationOptionsSchema.parse({ ...options, allowLaunch: true }).computeUsd).toBe(5);
  expect(liveVerificationOptionsSchema.parse({ ...options, runId: "existing-run" }).allowLaunch).toBe(false);
  expect(liveVerificationOptionsSchema.parse({ ...options, runId: "existing-run", startReady: true }).startReady).toBe(true);
  expect(liveVerificationOptionsSchema.safeParse({ ...options, allowLaunch: true, startReady: true }).success).toBe(false);
  for (const patch of [{ computeUsd: 11 }, { waitMinutes: 121 }, { runId: "existing-run" }, { harnessUrl: "https://remote.example" }, { editorUrl: "http://credential@localhost:8796" }]) expect(liveVerificationOptionsSchema.safeParse({ ...options, allowLaunch: true, ...patch }).success).toBe(false);
});

test("live preflight rejects cross-project/revision mismatches, local fallback and separate inference billing", () => {
  const host = { context, capabilities };
  expect(() => assertLiveSwarmPreflight("project-1", [host, host])).not.toThrow();
  for (const other of [
    { ...host, context: { ...context, projectId: "editor-workspace" } },
    { ...host, context: { ...context, repository: { ...context.repository, revision: "b".repeat(40) } } },
    { ...host, capabilities: { ...capabilities, backends: ["local"] as const } },
    { ...host, capabilities: { ...capabilities, available: false } },
    { ...host, capabilities: { ...capabilities, projects: [] } },
    { ...host, capabilities: { ...capabilities, inference: { ...capabilities.inference!, separatelyBilledUsd: 1 } } },
  ]) expect(() => assertLiveSwarmPreflight("project-1", [host, { context: other.context, capabilities: swarmCapabilitiesSchema.parse(other.capabilities) }])).toThrow();
  expect(touchOfDeathGoal(options.demonstrationId)).toContain("A valid outcome is no improvement.");
});

test("source capture and upload receive a distinct bounded timeout", () => {
  expect(liveRequestTimeout("http://localhost/api/swarm/v1/runs", { method: "POST" })).toBe(300_000);
  expect(liveRequestTimeout("http://localhost/api/swarm/v1/runs?projectId=project-1")).toBe(120_000);
  expect(liveRequestTimeout("http://localhost/api/swarm/v1/runs/run-1/start", { method: "POST" })).toBe(120_000);
});

test("project-memory verification uses the existing protocol and rejects stale or unrelated evidence", async () => {
  const run = swarmRunSchema.parse({ id: "run-1", request: { requestId: "request-1", projectId: "project-1", goal: "Verify durable findings", repository: context.repository }, status: "COMPLETED", createdAt: 1, updatedAt: 2, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {} });
  const entry = memoryEntrySchema.parse({ id: "swarm-run-1", projectId: "project-1", kind: "task-summary", status: "active", title: "Swarm finding", summary: "COMPLETED: reviewed rejection", evidence: `Source ${context.repository.revision}\nRun run-1`, tags: ["feature:swarm"], pathGlobs: [], confidence: "medium", freshness: "fresh", pinned: false, hitCount: 0, createdAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:01:00Z" });
  for (const patch of [{}, { projectId: "other-project" }, { summary: "RUNNING: stale result" }, { evidence: "Run run-1\nSource old-revision" }]) {
    let listener: ((event: ServerEvent) => void) | undefined;
    let unsubscribed = false;
    const client = {
      onEvent(callback: (event: ServerEvent) => void) { listener = callback; return () => { listener = undefined; unsubscribed = true; return true; }; },
      send(command: ClientCommand): HarnessSendResult {
        expect(command.type).toBe("memory.inspect");
        queueMicrotask(() => listener?.({ type: "memory.inspected", requestId: command.requestId, payload: { entry: { ...entry, ...patch } } }));
        return { status: "sent" };
      },
    };
    if (Object.keys(patch).length) await expect(readSwarmProjectMemory(client, run)).rejects.toThrow("does not match");
    else expect((await readSwarmProjectMemory(client, run)).id).toBe(entry.id);
    expect(unsubscribed).toBe(true);
  }
});


test("archive verification forbids launches and requires matching immutable owner in both native hosts", () => {
  const sha256="b".repeat(64);
  const archived={context:{...context,provider:{available:false}},capabilities:{...capabilities,available:false,backends:[],archive:{sha256}}};
  expect(()=>assertArchivedSwarmPreflight("project-1",sha256,[archived,archived])).not.toThrow();
  expect(()=>assertArchivedSwarmPreflight("project-1","c".repeat(64),[archived,archived])).toThrow();
  expect(()=>assertArchivedSwarmPreflight("project-1",sha256,[archived,{context,capabilities}])).toThrow();
  expect(liveVerificationOptionsSchema.parse({...options,runId:"run-1",archiveSha256:sha256}).allowLaunch).toBe(false);
  for(const mutation of [{allowLaunch:true},{startReady:true},{rejectRun:true}])expect(liveVerificationOptionsSchema.safeParse({...options,runId:"run-1",archiveSha256:sha256,...mutation}).success).toBe(false);
});
