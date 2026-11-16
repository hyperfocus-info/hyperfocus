import { createServer } from "node:http";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkspaceRegistry } from "../src/registry";
import { createDemonstrationBudget } from "../src/budget";
import { createRailwayWorkerService } from "../src/service";
import { createWorkerHttpHandler } from "../src/http";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw Error(`Missing bounded bridge setting: ${name}`);
  return value;
}

// This entrypoint hosts only the trusted adapter locally. Every workspace is Railway.
if (process.versions.node.split(".")[0] !== "24" || "bun" in process.versions) throw Error("The local Railway bridge requires Node.js 24.");
if (process.argv.slice(2).join(" ") !== "--allow-provision") throw Error("The bounded bridge requires --allow-provision.");
const directory = resolve(required("SWARM_WORKER_DATA_DIR")), lock = resolve(directory, "bridge-owner.json");
await mkdir(directory, { recursive: true });
try {
  const previous = JSON.parse(await readFile(lock, "utf8"));
  if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw Error("Bridge ownership receipt is invalid.");
  let alive = true;
  try { process.kill(previous.pid, 0); } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") alive = false; }
  if (alive) throw Error("A bridge owner may still be active; refusing concurrent access to its ledger.");
  await unlink(lock);
} catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error; }
await writeFile(lock, JSON.stringify({ pid: process.pid }), { flag: "wx", mode: 0o600 });
const registry = await createWorkspaceRegistry({ file: resolve(directory, "workspaces.json") });
const budget = await createDemonstrationBudget({ file: resolve(directory, "demonstration-budget.json"), id: required("SWARM_DEMONSTRATION_ID"),
  expiresAt: required("SWARM_DEMONSTRATION_EXPIRES_AT"), maximumUsd: Number(required("SWARM_DEMONSTRATION_MAX_USD")) });
const token = required("SWARM_WORKER_TOKEN"), apiToken = required("RAILWAY_API_TOKEN");
const service = createRailwayWorkerService({ registry, budget, token: apiToken, environmentId: required("RAILWAY_ENVIRONMENT_ID"), allowedRepositories: [], maxWorkspaces: 4 });
let cleaning: Promise<unknown> | undefined;
async function cleanup() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    budget.drain(); await service.drain();
    const owned = service.list().map(workspace => workspace.id);
    const results = await Promise.allSettled(owned.map(id => service.destroy(id)));
    const remaining = service.list().map(workspace => workspace.id);
    const receipt = { topology: "laptop-coordinator-railway-workspaces", at: new Date().toISOString(),
      owned, destroyed: owned.filter((_, index) => results[index]?.status === "fulfilled"), remaining,
      budget: budget.snapshot(), cleanupVerified: remaining.length === 0 && results.every(result => result.status === "fulfilled") };
    const file = resolve(directory, "cleanup.json");
    await writeFile(file + ".next", JSON.stringify(receipt, null, 2)); await rename(file + ".next", file);
    if (!receipt.cleanupVerified) throw Error("Owned Railway cleanup is incomplete; retained registry permits another cleanup attempt.");
    return receipt;
  })().finally(() => { cleaning = undefined; });
  return cleaning;
}
const server = createServer(createWorkerHttpHandler({ service, token, secrets: [apiToken], budget: budget.snapshot, cleanupDeployment: cleanup }));
server.requestTimeout = 3_700_000; server.headersTimeout = 30_000;
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Bridge did not bind a loopback port.");
  console.log(JSON.stringify({ type: "ready", url: `http://127.0.0.1:${address.port}`, nodeVersion: process.versions.node, executionBackend: "railway" }));
});
let stopping: Promise<void> | undefined;
const stop = () => stopping ??= (async () => {
  clearInterval(reaper);
  server.closeAllConnections();
  server.close();
  try { await cleanup(); }
  catch { process.exitCode = 1; console.error("Bridge shutdown cleanup incomplete; retained its registry and receipt."); }
  finally { await unlink(lock).catch(() => undefined); process.stdin.destroy(); }
})();
const reaper = setInterval(() => {
  if (budget.expired()) { void stop(); return; }
  void service.reapExpired(3_600_000).catch(() => console.error("Bridge workspace reaper will retry."));
}, 10_000);
process.stdin.resume();
process.stdin.once("end", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
