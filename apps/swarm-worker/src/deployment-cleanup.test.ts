import { afterEach, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createTemporaryDeploymentCleanup } from "./deployment-cleanup";
import { createDemonstrationBudget } from "./budget";
import { createWorkspaceRegistry } from "./registry";
import { createRailwayWorkerService } from "./service";
import { fakeRailway } from "./test-support";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function fixture(options: { exportFails?: boolean; corruptArchive?: boolean; changedOwner?: boolean; mutationResults?: Record<string, unknown>; absent?: "services" | "volumes" } = {}) {
  const root = resolve(import.meta.dir, "../.local"); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "cleanup-test-")); directories.push(directory);
  const id = randomUUID(), suffix = id.slice(0, 8);
  const deployment = { id, projectId: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5" as const,
    environmentId: "e46fa18a-61c0-4cc4-9379-45b8dfde47a6" as const,
    coordinator: { id: randomUUID(), name: `hyperfocus-swarm-${suffix}-coordinator`, volumeId: randomUUID() },
    worker: { id: randomUUID(), name: `hyperfocus-swarm-${suffix}-worker`, volumeId: randomUUID() },
    coordinatorUrl: `http://hyperfocus-swarm-${suffix}-coordinator.railway.internal:8080` };
  const budget = await createDemonstrationBudget({ file: join(directory, "budget.json"), id, maximumUsd: 10, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  const fake = fakeRailway(), registry = await createWorkspaceRegistry({ file: join(directory, "registry.json") });
  const service = createRailwayWorkerService({ registry, sdk: fake.sdk, token: "secret", environmentId: deployment.environmentId, allowedRepositories: ["https://example.com/repo.git"], budget });
  await service.create({ swarmId: id, taskId: "baseline", source: { revision: "a".repeat(40), repositoryUrl: "https://example.com/repo.git" }, resources: { cpu: 2, memoryGB: 2 }, lane: "investigation" });
  const bytes = new TextEncoder().encode("durable sqlite fixture"), sha256 = createHash("sha256").update(bytes).digest("hex");
  const mutations: Array<{ query: string; variables: Record<string, string> }> = [];
  const request = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/admin/export")) return options.exportFails ? new Response("failed", { status: 503 }) : Response.json({ archive: { sha256, bytes: bytes.length }, remainingWorkspaces: 1 });
    if (url.includes("/admin/artifacts/")) return new Response(options.corruptArchive ? "corrupted" : bytes);
    const body = JSON.parse(String(init?.body));
    if (body.query.startsWith("mutation")) { mutations.push(body); return Response.json({ data: { detach: true, volumeDelete: true, serviceDelete: true, deploymentRemove: true, ...options.mutationResults } }); }
    if (body.query.includes("SwarmCleanupOwnership")) return Response.json({ data: { project: { id: deployment.projectId,
      services: { edges: [...(options.absent === "services" ? [] : [deployment.coordinator, deployment.worker]), { id: "b2ca89d2-a1db-4b64-b6ee-d8ef8e43e04a", name: "pad-pilot" }].map(node => ({ node: options.changedOwner && node.id === deployment.worker.id ? { ...node, name: "foreign" } : node })) },
      volumes: { edges: (options.absent === "volumes" ? [] : [deployment.coordinator, deployment.worker]).map(owned => ({ node: { id: owned.volumeId, volumeInstances: { edges: [{ node: { serviceId: owned.id, environmentId: deployment.environmentId } }] } } })) } } } });
    return Response.json({ data: { deployments: { edges: [{ node: { id: `${body.variables.input.serviceId}-deployment`, status: "SUCCESS" } }] } } });
  };
  const receiptFile = join(directory, "cleanup.json");
  return { deployment, mutations, service, budget, receiptFile, cleanup: createTemporaryDeploymentCleanup({ deployment, budget, service, token: "management-secret", coordinatorToken: "coordinator-secret", receiptFile, fetch: request }) };
}
test("cleanup verifies archive bytes, destroys owned sandboxes and deletes only recorded services", async () => {
  const fixtureValue = await fixture();
  const result = await fixtureValue.cleanup.cleanup();
  expect(result).toMatchObject({ archiveVerified: true, remainingWorkspaces: 0 });
  expect(fixtureValue.service.list()).toHaveLength(0);
  expect(fixtureValue.mutations).toHaveLength(2);
  expect(fixtureValue.mutations.map(item => item.variables.serviceId)).toEqual([fixtureValue.deployment.coordinator.id, fixtureValue.deployment.worker.id]);
  expect(JSON.stringify(fixtureValue.mutations)).not.toContain("b2ca89d2-a1db-4b64-b6ee-d8ef8e43e04a");
  expect(() => fixtureValue.budget.assertActive()).toThrow("draining");
});
test("export failure or corrupt evidence stops compute and retains the only durable volume copies", async () => {
  for (const options of [{ exportFails: true }, { corruptArchive: true }]) {
    const value = await fixture(options);
    expect(await value.cleanup.cleanup()).toMatchObject({ archiveVerified: false, status: "compute-stopped-evidence-volumes-retained" });
    expect(value.mutations.every(item => item.query.includes("deploymentRemove") && !item.query.includes("serviceDelete") && !item.query.includes("volumeDelete"))).toBe(true);
  }
});
test("changed service ownership blocks cleanup mutations", async () => {
  const value = await fixture({ changedOwner: true });
  await expect(value.cleanup.cleanup()).rejects.toThrow("ownership changed");
  expect(value.mutations).toHaveLength(0);
});

test("false, missing or null deletion acknowledgements never report successful cleanup", async () => {
  for (const field of ["detach", "volumeDelete", "serviceDelete"]) for (const acknowledgement of [false, undefined, null]) {
    const value = await fixture({ mutationResults: { [field]: acknowledgement } });
    await expect(value.cleanup.cleanup()).rejects.toThrow(`did not acknowledge ${field}`);
    expect(value.service.list()).toHaveLength(0);
    expect(value.mutations).toHaveLength(1);
    expect(JSON.parse(await readFile(value.receiptFile, "utf8"))).toMatchObject({ archiveVerified: true, remainingWorkspaces: 0, status: "ready-to-delete-owned-services" });
  }
});

test("retry branches require acknowledgement when only a recorded service or volume remains", async () => {
  for (const absent of ["services", "volumes"] as const) {
    const field = absent === "services" ? "volumeDelete" : "serviceDelete";
    const value = await fixture({ absent, mutationResults: { [field]: false } });
    await expect(value.cleanup.cleanup()).rejects.toThrow(`did not acknowledge ${field}`);
    expect(value.mutations).toHaveLength(1);
    expect(value.mutations[0]!.query).not.toContain("SwarmDeleteOwnedResources");
  }
});

test("failed deployment stop cannot claim compute stopped after an export failure", async () => {
  const value = await fixture({ exportFails: true, mutationResults: { deploymentRemove: false } });
  await expect(value.cleanup.cleanup()).rejects.toThrow("did not acknowledge deploymentRemove");
  expect(value.mutations).toHaveLength(1);
  expect(value.mutations[0]!.query).toContain("deploymentRemove");
  expect(value.mutations[0]!.query).not.toContain("volumeDelete");
  expect(JSON.parse(await readFile(value.receiptFile, "utf8"))).toMatchObject({ archiveVerified: false, status: "compute-stop-pending-evidence-volumes-retained" });
});
