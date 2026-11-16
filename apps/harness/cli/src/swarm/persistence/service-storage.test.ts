import { afterEach, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createSwarmRequestSchema } from "@hyperfocus/ai-core/swarm";
import { createSwarmServiceStorage } from "./service-storage";
import { createSwarmService } from "../service";
import { until } from "../test-fixtures";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function directory() {
  const parent = path.resolve(import.meta.dir, "../../../../.local/swarm-storage-tests");
  await mkdir(parent, { recursive: true });
  const value = await mkdtemp(path.join(parent, "owned-")); directories.push(value); return value;
}

test("cloud artifact storage fails closed for absent, blank, partial, and unresolved bucket settings", async () => {
  for (const environment of [{}, { SWARM_S3_BUCKET: " " }, { SWARM_S3_BUCKET: "fixture" }, { SWARM_S3_BUCKET: "${{hyperfocus.BUCKET}}" }]) {
    const storage = createSwarmServiceStorage({ backend: "railway", directory: await directory(), environment });
    expect(await storage.ready()).toMatchObject({ available: false });
    expect((await storage.ready()).reason).toContain("bucket has an instance in this Railway environment");
    await expect(storage.artifacts.put({ name: "must-not-persist", mediaType: "text/plain", bytes: new Uint8Array([1]) })).rejects.toThrow("Durable artifact storage");
    await expect(storage.artifacts.read({ sha256: "a".repeat(64) })).rejects.toThrow("Durable artifact storage");
  }
});

test("explicit local execution retains its durable local file store", async () => {
  const storage = createSwarmServiceStorage({ backend: "local", directory: await directory(), environment: {} });
  expect(await storage.ready()).toEqual({ available: true });
  const bytes = new TextEncoder().encode("local artifact"), ref = await storage.artifacts.put({ name: "report.txt", mediaType: "text/plain", bytes });
  expect(await storage.artifacts.read({ sha256: ref.sha256 })).toEqual(bytes);
  expect(storage.bucket).toBeUndefined();
});

test("explicit laptop coordination retains cloud worker evidence locally but cannot bypass deployed storage", async () => {
  const root = await directory();
  const environment = { SWARM_COORDINATOR_TOPOLOGY: "laptop" };
  const storage = createSwarmServiceStorage({ backend: "railway", directory: root, environment });
  expect(await storage.ready()).toEqual({ available: true });
  const bytes = new TextEncoder().encode("Railway worker evidence survives worker destruction");
  const artifact = await storage.artifacts.put({ name: "evidence.txt", mediaType: "text/plain", bytes });
  const reopened = createSwarmServiceStorage({ backend: "railway", directory: root, environment });
  expect(await reopened.artifacts.read({ sha256: artifact.sha256 })).toEqual(bytes);
  const deployed = createSwarmServiceStorage({ backend: "railway", directory: root, environment: { ...environment, RAILWAY_PROJECT_ID: "deployed" } });
  expect((await deployed.ready()).available).toBe(false);
});

test("cloud storage readiness verifies content, suppresses credential errors, and caches only successful probes", async () => {
  const storage = createSwarmServiceStorage({ backend: "railway", directory: await directory(), environment: {
    SWARM_S3_BUCKET: "fixture", SWARM_S3_ENDPOINT: "https://storage.example.invalid", SWARM_S3_ACCESS_KEY_ID: "fixture-access",
    SWARM_S3_SECRET_ACCESS_KEY: "fixture-secret-never-expose", SWARM_S3_URL_STYLE: "path", SWARM_S3_REGION: "auto",
  } });
  let stored = new Uint8Array(), failing = true, corrupted = false;
  const put = spyOn(storage.artifacts, "put").mockImplementation(async input => {
    if (failing) throw Error("fixture-secret-never-expose");
    stored = new Uint8Array(input.bytes);
    return { sha256: createHash("sha256").update(stored).digest("hex"), bytes: stored.length, name: input.name, mediaType: input.mediaType, key: "fixture" };
  });
  const read = spyOn(storage.artifacts, "read").mockImplementation(async () => corrupted ? new Uint8Array([0]) : stored);
  try {
    const failed = await storage.ready();
    expect(failed.available).toBe(false);
    expect(failed.reason).not.toContain("fixture-secret-never-expose");
    failing = false; corrupted = true;
    expect((await storage.ready()).available).toBe(false);
    corrupted = false;
    expect(await Promise.all([storage.ready(), storage.ready()])).toEqual([{ available: true }, { available: true }]);
    expect(await storage.ready()).toEqual({ available: true });
    expect(put).toHaveBeenCalledTimes(3);
    expect(read).toHaveBeenCalledTimes(2);
  } finally { put.mockRestore(); read.mockRestore(); }
});

test("deployed coordinator capabilities, upload and restarted task dispatch block before inference when bucket references rendered empty", async () => {
  const saved = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("SWARM_") || key.startsWith("RAILWAY_")));
  for (const key of Object.keys(saved)) delete process.env[key];
  const root = await directory(), token = "storage-fixture-service-secret-1234567890";
  Object.assign(process.env, { SWARM_DATA_DIR: root, SWARM_BACKEND: "railway", SWARM_SERVICE_TOKEN: token,
    SWARM_WORKER_URL: "http://127.0.0.1:1", SWARM_WORKER_TOKEN: "storage-fixture-worker-secret-1234567890", SWARM_CODEX_EXECUTABLE: "must-never-execute",
    SWARM_PROJECT_IDS: "storage-fixture", RAILWAY_PROJECT_ID: "fixture-project", RAILWAY_VOLUME_MOUNT_PATH: root,
    SWARM_S3_BUCKET: "", SWARM_S3_ENDPOINT: "", SWARM_S3_ACCESS_KEY_ID: "", SWARM_S3_SECRET_ACCESS_KEY: "" });
  let service: Awaited<ReturnType<typeof createSwarmService>> | undefined;
  try {
    service = await createSwarmService();
    const headers = { authorization: `Bearer ${token}` };
    const operation=service.operations.create({projectId:"storage-fixture",recipientId:"operation-agent",requestId:"auth-request",kind:"connection.connect",subject:{type:"connection",id:"codex-account"},summary:"Fixture authorization",deadlineAt:Date.now()+60000});
    service.operations.update(operation.id,{state:"succeeded",summary:"Fixture connection completed"});
    const eventUrl="http://localhost/api/agent-events/v1/resume",body=JSON.stringify({projectId:"storage-fixture",recipientId:"operation-agent"});
    expect((await service.handler(new Request(eventUrl,{method:"POST",body}))).status).toBe(401);
    expect((await service.handler(new Request(eventUrl,{method:"POST",headers:{...headers,origin:"https://foreign.example"},body}))).status).toBe(403);
    const events=await service.handler(new Request(eventUrl,{method:"POST",headers,body}));
    expect(events.status).toBe(200);expect(await events.json()).toMatchObject({events:expect.arrayContaining([expect.objectContaining({kind:"operation.succeeded",subject:{type:"operation",id:operation.id}})])});
    const response = await service.handler(new Request("http://localhost/api/swarm/v1/capabilities", { headers }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: false, reason: expect.stringContaining("Durable artifact storage") });
    const request = createSwarmRequestSchema.parse({ requestId: crypto.randomUUID(), projectId: "storage-fixture", goal: "Verify cloud storage boundary", backend: "railway",
      repository: { revision: "a".repeat(40) }, budget: { maxModelUsd: 0 }, reviewPlan: true });
    const submit = await service.handler(new Request("http://localhost/api/swarm/v1/runs", { method: "POST", headers, body: JSON.stringify(request) }));
    expect(submit.status).toBe(400);
    expect(await submit.text()).toContain("Durable artifact storage");
    const bytes = new TextEncoder().encode("# v2 git bundle\nfixture"), hash = createHash("sha256").update(bytes).digest("hex");
    const upload = await service.handler(new Request(`http://localhost/api/swarm/v1/sources?projectId=storage-fixture&revision=${"a".repeat(40)}`, {
      method: "POST", headers: { ...headers, "x-content-sha256": hash }, body: bytes }));
    expect(upload.status).toBe(400);
    expect(await upload.text()).toContain("Durable artifact storage");
    const restored = service.coordinator.create(request); service.coordinator.start(restored.id);
    await until(() => service?.store.get(restored.id)?.status === "BLOCKED");
    expect(service.store.get(restored.id)?.status).toBe("BLOCKED");
    expect(service.store.get(restored.id)?.tasks.every(task => task.attempt === 0)).toBe(true);
    expect(service.store.workspaces()).toEqual([]);
  } finally {
    await service?.close();
    for (const key of Object.keys(process.env).filter(key => key.startsWith("SWARM_") || key.startsWith("RAILWAY_"))) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
