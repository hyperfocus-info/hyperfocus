import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { swarmRunSchema } from "@hyperfocus/ai-core/swarm";
import { createFileSwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";
import { createSwarmStore } from "./persistence/store";
import { openSwarmArchive } from "./archive";

test("archived owner authenticates scoped snapshots and verified artifacts, denies every mutation and leaves source bytes unchanged", async () => {
  const parent = resolve(import.meta.dir, "../../../.local/swarm-archive-tests");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "run-"));
  const db = new Database(join(directory, "source.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  const artifacts = createFileSwarmArtifactStore({ directory });
  const store = createSwarmStore({ db });
  const token = "archive-only-token-".repeat(3);
  let close = () => {};
  try {
    const bytes = new TextEncoder().encode("real preserved bytes in a disposable transport test");
    const ref = await artifacts.put({ name: "receipt.json", mediaType: "application/json", bytes });
    const run = swarmRunSchema.parse({ id: "run-1", request: { requestId: "request-1", projectId: "project-1", goal: "Review retained evidence", repository: { revision: "a".repeat(40) } }, status: "AWAITING_APPROVAL", createdAt: 1, updatedAt: 1,
      tasks: [], candidates: [], messages: [], metrics: {}, artifacts: [{ sha256: ref.sha256, bytes: ref.bytes, name: ref.name, mediaType: ref.mediaType, id: "artifact-1", swarmId: "run-1", taskId: "task-1", agentId: "agent-1", sourceRevision: "a".repeat(40), createdAt: 1, kind: "report" }] });
    store.create(run);
    store.create({ ...run, id: "foreign-run", request: { ...run.request, projectId: "foreign" }, artifacts: [] });
    const snapshot = new Uint8Array(db.serialize());
    expect(snapshot[18]).toBe(2); expect(snapshot[19]).toBe(2);
    const sha256 = createHash("sha256").update(snapshot).digest("hex");
    const options = { bytes: snapshot, sha256, token, artifacts: { read: artifacts.read }, projects: new Map([["project-1", { name: "Preserved project" }]]) };
    expect(() => openSwarmArchive({ ...options, sha256: "0".repeat(64) })).toThrow("hash mismatch");
    const archive = openSwarmArchive(options); close = archive.close;
    const request = (route: string, method = "GET", authorized = true) => archive.handler(new Request(`http://127.0.0.1/api/swarm/v1${route}`, { method, headers: authorized ? { authorization: `Bearer ${token}` } : {} }));
    expect((await request("/runs", "GET", false)).status).toBe(401);
    const capabilities = await (await request("/capabilities")).json();
    expect(capabilities).toMatchObject({ available: false, archive: { sha256 }, backends: [], maxWorkers: 0 });
    expect((await (await request("/runs")).json()).map((value: { id: string }) => value.id)).toEqual([run.id]);
    expect(await (await request("/runs/run-1")).json()).toEqual(store.get(run.id));
    expect((await request("/runs/foreign-run")).status).toBe(400);
    expect((await request("/runs?projectId=foreign")).status).toBe(400);
    expect((await (await request("/context?projectId=project-1")).json()).repository.revision).toBe(run.request.repository.revision);
    expect(new Uint8Array(await (await request("/runs/run-1/artifacts/artifact-1")).arrayBuffer())).toEqual(bytes);
    expect((await request("/runs/run-1/artifacts/unknown")).status).toBe(400);
    expect((await request(`/admin/artifacts/${ref.sha256}`)).status).toBe(404);
    expect((await request("/runs/run-1/events")).status).toBe(404);
    for (const route of ["/runs", "/sources", "/cleanup", "/admin/export", "/admin/browser-access", ...["start", "cancel", "reject", "approve", "integration", "steer", "follow-up"].map(action => `/runs/run-1/${action}`)])
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) expect((await request(route, method)).status).toBe(403);
    expect(createHash("sha256").update(snapshot).digest("hex")).toBe(sha256);
    expect(store.get(run.id)?.status).toBe("AWAITING_APPROVAL");
    await writeFile(join(directory, ref.key), "corrupted");
    expect((await request("/runs/run-1/artifacts/artifact-1")).status).toBe(400);
  } finally {
    close(); db.close();
    if (!resolve(directory).startsWith(parent + sep)) throw Error("Archive fixture cleanup escaped its owner.");
    await rm(directory, { recursive: true, force: true });
  }
});
