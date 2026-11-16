import { afterEach, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { archiveSwarmBootstrapAttempt, inspectSwarmDeployment, inspectSwarmDeploymentBucket, prepareSwarmBootstrapRetry, provisionSwarmDeployment, swarmRailwayArguments, verifySwarmDeploymentReady } from "./provision";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

test("explicit SSH identity supports owned keys outside ~/.ssh without changing API or key-management commands", () => {
  const root = resolve(import.meta.dir, "../../../.."), identity = ".local/swarm/credentials/key with spaces";
  const remote = ["ssh", "--service", "service-id", "--", "node", "-e", "console.log('remote')"];
  expect(swarmRailwayArguments(remote, root, identity)).toEqual(["ssh", "--identity-file", resolve(root, identity), ...remote.slice(1)]);
  expect(swarmRailwayArguments(remote, root, "")).toEqual(remote);
  expect(swarmRailwayArguments(["api", "query"], root, identity)).toEqual(["api", "query"]);
  expect(swarmRailwayArguments(["ssh", "keys", "list"], root, identity)).toEqual(["ssh", "keys", "list"]);
  expect(swarmRailwayArguments(["ssh", "-i", "explicit", "--", "true"], root, identity)).toEqual(["ssh", "-i", "explicit", "--", "true"]);
  expect(swarmRailwayArguments(["ssh", "--", "grep", "-i", "text"], root, identity)).toEqual(["ssh", "--identity-file", resolve(root, identity), "--", "grep", "-i", "text"]);
});

async function fixture() {
  const parent = resolve(import.meta.dir, "../../.local/swarm/provision-tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "readiness-")); directories.push(root);
  const id = randomUUID(), project = randomUUID(), token = randomUUID() + randomUUID();
  const directory = join(root, ".local/swarm/deployments", id); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "deployment.json"), JSON.stringify({ id,
    projectId: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", environmentId: "e46fa18a-61c0-4cc4-9379-45b8dfde47a6",
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    maximumUsd: 10, sourceRevision: "a".repeat(40), allowedProjectIds: [project, "editor-workspace"], phase: "uploaded", url: "https://swarm.example.test" }));
  await writeFile(join(directory, "secrets.json"), JSON.stringify({ coordinator: token }));
  return { root, id, project, token, directory };
}

test("deployment sign-in uses shared Connections without invoking or requesting SSH",async()=>{
  const value=await fixture();
  const result=await inspectSwarmDeployment({...value,railwayCli:"unused"});
  expect(result.authenticationCommand).toEqual(["bun","run","connections","--deployment",value.id,"--project",value.project,"--agent","connections-owner"]);
});

test("deployment readiness authenticates and proves the real project allowlist before recommending cloud execution", async () => {
  const value = await fixture();
  const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ available: true, backends: ["railway"], projects: [{ id: value.project }, { id: "editor-workspace" }], inference: { provider: "Codex", separatelyBilledUsd: 0 } }));
  try {
    const result = await verifySwarmDeploymentReady(value);
    expect(result).toMatchObject({ ready: true, sandboxCreated: false, separatelyBilledInferenceUsd: 0 });
    expect(result.allowedProjectIds).toEqual([value.project, "editor-workspace"]);
    expect(await readFile(join(value.directory, "readiness.json"), "utf8")).not.toContain(value.token);
    expect(request).toHaveBeenCalledTimes(1);
    const call = request.mock.calls[0];
    expect(String(call?.[0])).toBe("https://swarm.example.test/api/swarm/v1/capabilities");
    expect(new Headers(call?.[1]?.headers).get("authorization")).toBe(`Bearer ${value.token}`);
  } finally { request.mockRestore(); }
});

test("deployment readiness rejects absent subscription auth, a missing host project, and paid inference", async () => {
  const value = await fixture();
  const base = { available: true, backends: ["railway"], projects: [{ id: value.project }, { id: "editor-workspace" }], inference: { provider: "Codex", separatelyBilledUsd: 0 } };
  for (const response of [{ ...base, available: false, reason: "Authenticate Codex" }, { ...base, projects: [{ id: "touch-of-death" }] }, { ...base, inference: { provider: "Codex", separatelyBilledUsd: 1 } }]) {
    const request = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));
    try { await expect(verifySwarmDeploymentReady(value)).rejects.toThrow(); }
    finally { request.mockRestore(); }
  }
});

test("provisioning fails before provider access without explicit authorization and host project IDs", async () => {
  const options = { root: resolve(import.meta.dir, "../../../.."), railwayCli: "unused", allowProvision: false };
  await expect(provisionSwarmDeployment(options)).rejects.toThrow("prior user authorization");
  await expect(provisionSwarmDeployment({ ...options, allowProvision: true })).rejects.toThrow();
  await expect(provisionSwarmDeployment({ ...options, allowProvision: true, projectIds: ["project-1"], publicOrigin: "https://token@swarm.example.test/path" })).rejects.toThrow("exact HTTPS origin");
});

function bucketFixture() {
  return { project: { id: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", buckets: { edges: [{ node: {
    id: "6d43edaa-e4e7-4030-8f49-804b03b834a1", name: "hyperfocus", deletedAt: null,
  } }] } }, details: { objectCount: 0, sizeBytes: 0 }, metadata: [{ urlStyle: "virtual-host" }] };
}

test("bucket preflight verifies the approved environment and maps URL metadata without requesting secret values", async () => {
  const value = bucketFixture();
  const readApi = async (query: string, variables: Record<string, unknown>) => {
    expect(query.startsWith("query ")).toBe(true);
    expect(query).toContain("bucketS3Credentials(bucketId: $bucketId, environmentId: $environmentId, projectId: $projectId) { urlStyle }");
    expect(query).not.toMatch(/accessKey|secretAccessKey|secretKey|endpoint/);
    expect(variables).toEqual({ projectId: value.project.id, bucketId: value.project.buckets.edges[0]?.node.id, environmentId: "e46fa18a-61c0-4cc4-9379-45b8dfde47a6" });
    return value;
  };
  const result = await inspectSwarmDeploymentBucket({ root: "unused", railwayCli: "unused", readApi });
  expect(result).toMatchObject({ bucketName: "hyperfocus", providerUrlStyle: "virtual-host", urlStyle: "virtual-hosted", credentialValuesRead: false });
  expect((await inspectSwarmDeploymentBucket({ root: "unused", railwayCli: "unused", readApi: async () => ({ ...value, metadata: [{ urlStyle: "path" }] }) })).urlStyle).toBe("path");
});

test("bucket preflight blocks absent instances, unresolved metadata and changed bucket identity before provisioning", async () => {
  const value = bucketFixture();
  const cases = [
    { ...value, details: null }, { ...value, metadata: [] }, { ...value, metadata: [{ urlStyle: "" }] },
    { ...value, metadata: [{ urlStyle: "${{hyperfocus.URL_STYLE}}" }] },
    { ...value, metadata: [{ urlStyle: "virtual-host" }, { urlStyle: "path" }] },
    { ...value, project: { ...value.project, buckets: { edges: [] } } },
    { ...value, project: { ...value.project, buckets: { edges: [{ node: { ...value.project.buckets.edges[0]?.node, name: "renamed" } }] } } },
    { ...value, project: { ...value.project, buckets: { edges: [{ node: { ...value.project.buckets.edges[0]?.node, deletedAt: new Date().toISOString() } }] } } },
  ];
  for (const input of cases) await expect(inspectSwarmDeploymentBucket({ root: "unused", railwayCli: "unused", readApi: async () => input })).rejects.toThrow();
});

function retryFixture() {
  const now = Date.now(), id = randomUUID(), workerId = randomUUID(), volumeId = randomUUID();
  const previous = { id, projectId: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5" as const,
    environmentId: "e46fa18a-61c0-4cc4-9379-45b8dfde47a6" as const,
    createdAt: new Date(now - 600_000).toISOString(), expiresAt: new Date(now + 6_600_000).toISOString(), maximumUsd: 10,
    allowedProjectIds: ["real-project", "editor-workspace"], sourceRevision: "b".repeat(40),
    bootstrapComplete: false, phase: "cleaned" as const,
    worker: { id: workerId, name: `hyperfocus-swarm-${id.slice(0, 8)}-worker`, volumeId },
  };
  const pending = { id: volumeId, name: `${previous.worker.name}-volume`, volumeInstances: { edges: [{ node: { isPendingDeletion: true } }] } };
  return { previous, pending, now, inventory: { id: previous.projectId, services: { edges: [] }, volumes: { edges: [{ node: pending }] } }, projectIds: previous.allowedProjectIds, maximumUsd: 10 };
}

test("empty bootstrap retry retains approved identity, original lifetime and ceiling when old volume is soft deleted", () => {
  const value = retryFixture(), next = prepareSwarmBootstrapRetry(value);
  expect(next).toMatchObject({ id: value.previous.id, createdAt: value.previous.createdAt, expiresAt: value.previous.expiresAt,
    maximumUsd: 10, allowedProjectIds: value.projectIds, attempt: 1, phase: "provisioning", bootstrapComplete: false });
  expect(next.worker).toBeUndefined();
  expect(value.previous.worker.volumeId).toBe(value.pending.id);
  expect(prepareSwarmBootstrapRetry({ ...value, previous: { ...value.previous, attempt: 1 } }).attempt).toBe(2);
});

test("retry refuses successful, incomplete, expired, or differently scoped prior approval", () => {
  const value = retryFixture();
  expect(() => prepareSwarmBootstrapRetry({ ...value, previous: { ...value.previous, bootstrapComplete: true } })).toThrow("verified cleanup");
  expect(() => prepareSwarmBootstrapRetry({ ...value, previous: { ...value.previous, phase: "cleanup-incomplete" } })).toThrow("verified cleanup");
  expect(() => prepareSwarmBootstrapRetry({ ...value, now: Date.parse(value.previous.expiresAt) })).toThrow("expired");
  expect(() => prepareSwarmBootstrapRetry({ ...value, maximumUsd: 9 })).toThrow("ceiling");
  expect(() => prepareSwarmBootstrapRetry({ ...value, projectIds: ["foreign-project"] })).toThrow("allowlist");
});

test("retry rejects any surviving owned service, reused name or volume not entirely pending deletion", () => {
  const value = retryFixture();
  for (const node of [{ id: value.previous.worker.id, name: "renamed" }, { id: randomUUID(), name: value.previous.worker.name }]) {
    expect(() => prepareSwarmBootstrapRetry({ ...value, inventory: { ...value.inventory, services: { edges: [{ node }] } } })).toThrow("service still exists");
  }
  for (const edges of [[], [{ node: { isPendingDeletion: false } }], [{ node: { isPendingDeletion: true } }, { node: { isPendingDeletion: false } }]]) {
    expect(() => prepareSwarmBootstrapRetry({ ...value, inventory: { ...value.inventory, volumes: { edges: [{ node: { ...value.pending, volumeInstances: { edges } } }] } } })).toThrow("volume is not pending deletion");
  }
  expect(prepareSwarmBootstrapRetry({ ...value, inventory: { ...value.inventory, volumes: { edges: [] } } }).attempt).toBe(1);
});

test("retry archives the full failed attempt including pending volume evidence and cannot overwrite it", async () => {
  const value = retryFixture(), temporary = await fixture();
  const previousReceipt = JSON.stringify({ ...value.previous, pendingVolumeDeletionIds: [value.pending.id], cleanupInventory: value.inventory });
  const file = await archiveSwarmBootstrapAttempt({ directory: temporary.directory, previousReceipt, attempt: 1 });
  expect(await readFile(file, "utf8")).toBe(previousReceipt);
  await expect(archiveSwarmBootstrapAttempt({ directory: temporary.directory, previousReceipt: "different history", attempt: 1 })).rejects.toThrow();
  expect(await readFile(file, "utf8")).toBe(previousReceipt);
});
