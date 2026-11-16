import { z } from 'zod';

export const railwayTargetSchema = z.object({ projectId: z.string().uuid(), environmentId: z.string().uuid(), serviceId: z.string().uuid() });
const deploymentSchema = z.object({ id: z.string().uuid(), status: z.enum(['BUILDING', 'DEPLOYING', 'INITIALIZING', 'QUEUED', 'WAITING', 'SUCCESS', 'FAILED', 'CRASHED', 'REMOVED', 'REMOVING', 'SKIPPED', 'SLEEPING']) });
export type RailwayRun = (args: string[]) => Promise<string>;

export async function verifyRailwayTarget({target,run}:{target:z.infer<typeof railwayTargetSchema>;run:RailwayRun}) {
  railwayTargetSchema.parse(target);
  const nodes=z.object({edges:z.array(z.object({node:z.object({id:z.string().uuid()})}))});
  const status=z.object({id:z.string().uuid(),environments:nodes,services:nodes}).parse(JSON.parse(await run(['status','--project',target.projectId,'--environment',target.environmentId,'--json'])));
  if(status.id!==target.projectId||!status.environments.edges.some(({node})=>node.id===target.environmentId)||!status.services.edges.some(({node})=>node.id===target.serviceId))throw new Error('Railway target does not match the project, environment and service IDs.');
}

export function uploadDeploymentId(output: string) {
  const ids = new Set<string>();
  for (const line of output.trim().split(/\r?\n/)) {
    let value: unknown; try { value = JSON.parse(line); } catch { continue; }
    const result = z.object({ deploymentId: z.string().uuid() }).safeParse(value);
    if (result.success) ids.add(result.data.deploymentId);
  }
  if (ids.size !== 1) throw new Error('Upload identity is unavailable. Inspect Railway before retrying; the upload may have completed.');
  const id = [...ids][0]; if (!id) throw new Error('Missing deployment ID'); return id;
}

export async function uploadRailway({ directory, target, run, message, includeIgnoredAssets = false }: { directory: string; target: z.infer<typeof railwayTargetSchema>; run: RailwayRun; message: string; includeIgnoredAssets?: boolean }) {
  const selected = railwayTargetSchema.parse(target);
  const output = await run(['up', directory, '--path-as-root', ...(includeIgnoredAssets ? ['--no-gitignore'] : []), '--project', selected.projectId, '--environment', selected.environmentId, '--service', selected.serviceId, '--detach', '--json', '--message', message]);
  return { id: uploadDeploymentId(output), status: 'QUEUED' };
}

export async function inspectRailwayDeployment({ id, target, run }: { id: string; target: z.infer<typeof railwayTargetSchema>; run: RailwayRun }) {
  z.string().uuid().parse(id); railwayTargetSchema.parse(target);
  const rows = z.array(deploymentSchema).parse(JSON.parse(await run(['deployment', 'list', '--service', target.serviceId, '--environment', target.environmentId, '--limit', '100', '--json'])));
  const match = rows.find(row => row.id === id);
  if (!match) throw new Error('The uploaded deployment is absent from the last 100 results. Inspect its ID in Railway; do not substitute the latest deployment.');
  return match;
}

export async function waitForRailway({ id, target, run, timeoutMs = 300_000, intervalMs = 3000, signal }: {
  id: string; target: z.infer<typeof railwayTargetSchema>; run: RailwayRun; timeoutMs?: number; intervalMs?: number; signal?: AbortSignal;
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const deployment = await inspectRailwayDeployment({ id, target, run });
    if (deployment.status === 'SUCCESS') return deployment;
    if (['FAILED', 'CRASHED', 'REMOVED', 'REMOVING', 'SKIPPED'].includes(deployment.status)) throw new Error(`Deployment ${id} is ${deployment.status}.`);
    await Bun.sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`Deployment ${id} did not finish before the deadline. Inspect its status before retrying.`);
}
