import { createServer } from "node:http";
import { resolve } from "node:path";
import { createWorkerHttpHandler } from "./http";
import { createWorkspaceRegistry } from "./registry";
import { createRailwayWorkerService } from "./service";
import { createDemonstrationBudget } from "./budget";
import { createTemporaryDeploymentCleanup, temporaryDeploymentSchema } from "./deployment-cleanup";

if (Number(process.versions.node.split(".")[0]) < 24 || "bun" in process.versions) throw new Error("The Railway SDK bridge requires Node.js 24+ on its dedicated Node host.");
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required service setting: ${name}`);
  return value;
}
const token = required("SWARM_WORKER_TOKEN"), apiToken = required("RAILWAY_API_TOKEN");
const directory = resolve(required("SWARM_WORKER_DATA_DIR"));
if (process.env.RAILWAY_PROJECT_ID && resolve(required("RAILWAY_VOLUME_MOUNT_PATH")) !== directory) throw new Error("Railway worker registry requires its dedicated persistent volume.");
const environmentId = required("RAILWAY_ENVIRONMENT_ID");
const registry = await createWorkspaceRegistry({ file: resolve(directory, "workspaces.json") });
const demonstration = process.env.SWARM_DEMONSTRATION_ID;
const control=process.env.SWARM_HOSTING_MODE==="service"?required("SWARM_CONTROL_ID"):undefined;
if(demonstration&&control)throw Error("Control-service and temporary deployment identities cannot be combined.");
if (process.env.RAILWAY_PROJECT_ID && !demonstration&&!control) throw new Error("Cloud bridge requires an authorized admission ledger identity.");
const budget = demonstration||control ? await createDemonstrationBudget({ file: resolve(directory, control?"control-budget.json":"demonstration-budget.json"),
  id: (control??demonstration)!, expiresAt: control?null:required("SWARM_DEMONSTRATION_EXPIRES_AT"), maximumUsd: Number(required(control?"SWARM_CONTROL_MAX_COMPUTE_USD":"SWARM_DEMONSTRATION_MAX_USD")) }) : undefined;
const service = createRailwayWorkerService({ registry, environmentId, token: apiToken, allowedRepositories: (process.env.SWARM_ALLOWED_REPOSITORIES ?? "").split(",").map(value => value.trim()).filter(Boolean), maxWorkspaces: 4, budget });
const deployment = demonstration&&budget ? temporaryDeploymentSchema.parse(JSON.parse(required("SWARM_TEMPORARY_DEPLOYMENT"))) : undefined;
if (deployment && (deployment.id !== demonstration || deployment.environmentId !== environmentId || deployment.worker.id !== process.env.RAILWAY_SERVICE_ID || deployment.projectId !== process.env.RAILWAY_PROJECT_ID)) throw new Error("Temporary cleanup ownership does not match this Railway service.");
const cleanup = deployment && budget ? createTemporaryDeploymentCleanup({ deployment, budget, service,
  token: apiToken, coordinatorToken: required("SWARM_COORDINATOR_TOKEN"), receiptFile: resolve(directory, "cleanup-receipt.json") }) : undefined;
const server = createServer(createWorkerHttpHandler({ service, token, secrets: [apiToken, process.env.SWARM_COORDINATOR_TOKEN ?? ""], cleanupDeployment: cleanup?.cleanup, budget: budget?.snapshot }));
server.requestTimeout = 3_700_000;
server.headersTimeout = 30_000;
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? "::", () => console.log("Hyperfocus Railway execution bridge ready."));
const reaper = setInterval(() => {
  if (budget?.expired() && cleanup) { void cleanup.cleanup().catch(() => console.error("Expired deployment cleanup failed; retrying with retained ownership records.")); return; }
  void service.reapExpired(3_600_000).then(result => {
  if (result.attempted) console.log(JSON.stringify({ event: "expired-workspace-cleanup", ...result }));
}).catch(() => console.error("Workspace reaper failed; cleanup will retry.")); }, 60_000);
async function shutdown() {
  clearInterval(reaper);
  // Reconnectable durable sessions survive a bridge restart. Idle/max-age policy and
  // persisted coordinator ownership, rather than service shutdown, decide teardown.
  server.close();
  server.closeAllConnections();
}
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
