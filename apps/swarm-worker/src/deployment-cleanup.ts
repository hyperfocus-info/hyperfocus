import { createHash } from "node:crypto";
import { writeFile, rename, readFile } from "node:fs/promises";
import { z } from "zod";
import type { DemonstrationBudget } from "./budget";
import type { createRailwayWorkerService } from "./service";

const ownedService = z.object({ id: z.string().uuid(), name: z.string().regex(/^hyperfocus-swarm-[a-f0-9]{8}-(coordinator|worker)$/), volumeId: z.string().uuid() });
export const temporaryDeploymentSchema = z.object({ id: z.string().uuid(),
  projectId: z.literal("13527ca6-cda6-4341-8d8a-9ab70d7bcdf5"),
  environmentId: z.literal("e46fa18a-61c0-4cc4-9379-45b8dfde47a6"),
  coordinator: ownedService, worker: ownedService, coordinatorUrl: z.string().url(),
}).strict();
const archiveSchema = z.object({ archive: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(268_435_456) }), remainingWorkspaces: z.number().int().nonnegative() });

export function createTemporaryDeploymentCleanup(options: {
  deployment: z.infer<typeof temporaryDeploymentSchema>; budget: DemonstrationBudget;
  service: ReturnType<typeof createRailwayWorkerService>; token: string; coordinatorToken: string;
  receiptFile: string; fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}) {
  const deployment = temporaryDeploymentSchema.parse(options.deployment), request = options.fetch ?? fetch;
  const address = new URL(deployment.coordinatorUrl);
  if (address.protocol !== "http:" || !address.hostname.endsWith(".railway.internal") || address.username || address.password || address.search || address.hash) throw new Error("Cleanup requires the configured coordinator private-network address.");
  if (deployment.worker.id === deployment.coordinator.id || deployment.worker.volumeId === deployment.coordinator.volumeId) throw new Error("Cleanup service and volume ownership must be distinct.");
  for (const owned of [deployment.worker, deployment.coordinator]) if (!owned.name.includes(deployment.id.slice(0, 8))) throw new Error("Cleanup service name does not match its demonstration owner.");
  let running: Promise<unknown> | undefined;
  async function api(query: string, variables: Record<string, unknown>, acknowledgements: readonly string[] = []) {
    const response = await request("https://backboard.railway.com/graphql/v2", { method: "POST", redirect: "error",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000) });
    const result = z.object({ data: z.record(z.unknown()).optional(), errors: z.array(z.unknown()).optional() }).parse(await response.json());
    if (!response.ok || result.errors?.length || !result.data) throw new Error("Railway cleanup operation failed; retry from the retained deployment receipt.");
    for (const field of acknowledgements) if (result.data[field] !== true) throw new Error(`Railway cleanup did not acknowledge ${field}; retry from the retained deployment receipt.`);
    return result.data;
  }
  async function receipt(value: unknown) {
    await writeFile(options.receiptFile + ".next", JSON.stringify(value), { mode: 0o600 });
    await rename(options.receiptFile + ".next", options.receiptFile);
  }
  async function inspect() {
    const result = await api("query SwarmCleanupOwnership($id: String!) { project(id: $id) { id services { edges { node { id name } } } volumes { edges { node { id volumeInstances { edges { node { serviceId environmentId } } } } } } } }", { id: deployment.projectId });
    const project = z.object({ id: z.string(), services: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), name: z.string() }) })) }),
      volumes: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), volumeInstances: z.object({ edges: z.array(z.object({ node: z.object({ serviceId: z.string().nullable(), environmentId: z.string() }) })) }) }) })) }) }).parse(result.project);
    if (project.id !== deployment.projectId) throw new Error("Cleanup project ownership verification failed.");
    for (const owned of [deployment.coordinator, deployment.worker]) {
      const found = project.services.edges.find(edge => edge.node.id === owned.id)?.node;
      if (found && found.name !== owned.name) throw new Error("Cleanup service ownership changed; refusing deletion.");
      const volume = project.volumes.edges.find(edge => edge.node.id === owned.volumeId)?.node;
      if (volume?.volumeInstances.edges.some(edge => edge.node.environmentId !== deployment.environmentId || edge.node.serviceId !== null && edge.node.serviceId !== owned.id)) throw new Error("Cleanup volume ownership changed; refusing deletion.");
    }
    return project;
  }
  async function removeDeployments(serviceId: string) {
    const data = await api("query SwarmCleanupDeployments($input: DeploymentListInput!) { deployments(input: $input, first: 50) { edges { node { id status } } } }", { input: { projectId: deployment.projectId, environmentId: deployment.environmentId, serviceId } });
    const result = z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), status: z.string() }) })) }).parse(data.deployments);
    for (const entry of result.edges) if (!["REMOVED", "FAILED", "CRASHED", "SKIPPED"].includes(entry.node.status)) await api("mutation SwarmStopOwnedDeployment($id: String!) { deploymentRemove(id: $id) }", { id: entry.node.id }, ["deploymentRemove"]);
  }
  async function cleanup() {
    options.budget.drain();
    await options.service.drain();
    const project = await inspect();
    let archive: z.infer<typeof archiveSchema>["archive"] | undefined;
    try {
      const previous = JSON.parse(await readFile(options.receiptFile, "utf8"));
      if (previous.archiveVerified) archive = archiveSchema.shape.archive.parse(previous.archive);
    } catch { /* A missing or partial receipt must repeat export verification. */ }
    if (!archive) {
      try {
        const response = await request(new URL("/api/swarm/v1/admin/export", address), {
          method: "POST", redirect: "error", headers: { authorization: `Bearer ${options.coordinatorToken}`, "content-type": "application/json" },
          body: JSON.stringify({ demonstration: { id: deployment.id, expiresAt: options.budget.snapshot().expiresAt,
            budget: options.budget.snapshot(), workspaces: options.service.list().map(workspace => workspace.id) } }), signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error("Coordinator evidence export failed.");
        archive = archiveSchema.parse(await response.json()).archive;
        const download = await request(new URL(`/api/swarm/v1/admin/artifacts/${archive.sha256}`, address), {
          redirect: "error", headers: { authorization: `Bearer ${options.coordinatorToken}` }, signal: AbortSignal.timeout(60_000) });
        if (!download.ok) throw new Error("Coordinator archive download failed.");
        const bytes = new Uint8Array(await download.arrayBuffer());
        if (bytes.length !== archive.bytes || createHash("sha256").update(bytes).digest("hex") !== archive.sha256) throw new Error("Coordinator archive integrity failed.");
      } catch {
        archive = undefined;
      }
    }
    const destroyed = await Promise.allSettled(options.service.list().map(workspace => options.service.destroy(workspace.id)));
    const remaining = options.service.list().length;
    const saved = { demonstrationId: deployment.id, at: new Date().toISOString(), archive,
      archiveVerified: Boolean(archive), remainingWorkspaces: remaining, budget: options.budget.snapshot(),
      status: archive && !remaining ? "ready-to-delete-owned-services" : "compute-stop-pending-evidence-volumes-retained" };
    await receipt(saved);
    if (destroyed.some(result => result.status === "rejected") || remaining) {
      await removeDeployments(deployment.coordinator.id);
      throw new Error("Sandbox cleanup is incomplete; registry and cleanup worker retained for retry.");
    }
    if (!archive) {
      await removeDeployments(deployment.coordinator.id);
      // Last operation stops this worker. Volumes retain irreplaceable partial evidence.
      await removeDeployments(deployment.worker.id);
      return { ...saved, status: "compute-stopped-evidence-volumes-retained" };
    }
    for (const owned of [deployment.coordinator, deployment.worker]) {
      const hasVolume = project.volumes.edges.some(edge => edge.node.id === owned.volumeId);
      const hasService = project.services.edges.some(edge => edge.node.id === owned.id);
      // One server-side sequential mutation continues if deleting this worker's
      // mounted volume closes its client connection before the last response.
      if (hasVolume && hasService) await api("mutation SwarmDeleteOwnedResources($volumeId: String!, $serviceId: String!, $environmentId: String!) { detach: volumeInstanceUpdate(volumeId: $volumeId, environmentId: $environmentId, input: { serviceId: null }) volumeDelete(volumeId: $volumeId) serviceDelete(id: $serviceId, environmentId: $environmentId) }", { volumeId: owned.volumeId, serviceId: owned.id, environmentId: deployment.environmentId }, ["detach", "volumeDelete", "serviceDelete"]);
      else if (hasVolume) await api("mutation SwarmDeleteOwnedVolume($id: String!) { volumeDelete(volumeId: $id) }", { id: owned.volumeId }, ["volumeDelete"]);
      else if (hasService) await api("mutation SwarmDeleteOwnedService($id: String!, $environmentId: String!) { serviceDelete(id: $id, environmentId: $environmentId) }", { id: owned.id, environmentId: deployment.environmentId }, ["serviceDelete"]);
    }
    return saved;
  }
  return { cleanup() {
    if (running) return running;
    running = cleanup().finally(() => { running = undefined; });
    return running;
  } };
}
