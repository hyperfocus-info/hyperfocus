import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createLocalAiRuntime, createCodexCliAdapter, readCodexSubscription } from "@hyperfocus/ai-runtime";
import { createRailwayExecutionProvider, createLocalExecutionProvider } from "@hyperfocus/ai-runtime/swarm";
import { touchOfDeathSwarmRecipe, touchOfDeathTutorialSwarmRecipe, touchOfDeathLabSwarmRecipe } from "@hyperfocus/touch-of-death/swarm";
import type { SwarmRun } from "@hyperfocus/ai-core/swarm";
import { createSwarmStore, terminalSwarmStatuses } from "./persistence/store";
import { createSwarmCoordinator } from "./coordinator";
import { createSwarmTaskContext, swarmProjectRecipeSchema } from "./execution/task-context";
import { createSwarmTaskHandler } from "./execution/runner";
import { createSwarmHttpHandler, type SwarmDemonstrationExport } from "./http";
import { verifySwarmIntegration } from "./execution/integration";
import { createSwarmServiceStorage } from "./persistence/service-storage";
import { removeOwnedSwarmCodexCredentials } from "./credential-cleanup";
import { swarmSubscriptionProfiles, swarmWeeklyQuotaWindow } from "./reasoning/model-profiles";
import { swarmSubscriptionFailure } from "./reasoning/subscription-failure";
import { createSwarmBrowserAccessHandler } from "./browser/access";
import { createSwarmSiteHandler } from "./browser/site";
import { createConnectionManager,type ConnectionAdapter } from "@hyperfocus/ai-runtime/connections";
import { createCodexConnectionAdapter } from "@hyperfocus/ai-runtime/connections/codex";
import { createOperationStore } from "@hyperfocus/ai-runtime/operations";
import { createConnectionHttpHandler } from "../connections/http";
import { createSwarmConnectionGate } from "./connection-gate";
import { engineeringSwarmRecipe } from "./engineering-recipe";
function required(name: string) {
  const value = process.env[name]; if (!value)
    throw Error(`Missing required service setting: ${name}`); return value;
}
export async function createSwarmService() {
  const lifetime = new AbortController();
  const directory = path.resolve(required("SWARM_DATA_DIR"));
  if (process.env.RAILWAY_PROJECT_ID && path.resolve(required("RAILWAY_VOLUME_MOUNT_PATH")) !== directory)
    throw Error("Swarm coordination requires its dedicated persistent volume.");
  await mkdir(directory, { recursive: true });
  const backend = process.env.SWARM_BACKEND ?? "railway";
  if (!["railway", "local"].includes(backend))
    throw Error("Unknown execution backend.");
  const provider = backend === "railway" ? createRailwayExecutionProvider({ url: required("SWARM_WORKER_URL"), token: required("SWARM_WORKER_TOKEN") }) : createLocalExecutionProvider({ directory: path.join(directory, "workspaces") });
  const db = new Database(path.join(directory, "swarm.sqlite"), { create: true, strict: true });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
  const store = createSwarmStore({ db });
  const storage = createSwarmServiceStorage({ backend, directory });
  const { bucket, artifacts } = storage;
  const recipe = swarmProjectRecipeSchema.parse(touchOfDeathSwarmRecipe);
  const tutorialRecipe = swarmProjectRecipeSchema.parse(touchOfDeathTutorialSwarmRecipe);
  const labRecipe = swarmProjectRecipeSchema.parse(touchOfDeathLabSwarmRecipe);
  const engineeringRecipe = swarmProjectRecipeSchema.parse(engineeringSwarmRecipe);
  const recipes = new Map((process.env.SWARM_PROJECT_IDS ?? "touch-of-death,editor-workspace").split(",").map(id => [id.trim(), id.trim()===tutorialRecipe.id?tutorialRecipe:id.trim()===labRecipe.id?labRecipe:id.trim()===recipe.id?recipe:engineeringRecipe]));
  if (process.env.SWARM_RECIPES_FILE) {
    const configured = swarmProjectRecipeSchema.array().max(100).parse(await Bun.file(process.env.SWARM_RECIPES_FILE).json());
    for (const value of configured)
      recipes.set(value.id, value);
  }
  const executable = process.env.SWARM_CODEX_EXECUTABLE ?? Bun.which("codex") ?? undefined;
  const codexHome = process.env.SWARM_CODEX_HOME ?? process.env.CODEX_HOME ?? path.join(directory, "codex");
  const operations=createOperationStore(db,store.agentEvents);
  const ownerId=process.env.SWARM_CONTROL_ID??process.env.SWARM_DEMONSTRATION_ID??"local-host";
  const railwayConnection:ConnectionAdapter={descriptor:{id:"railway",providerId:"railway",label:"Railway",ownerId,
    capabilities:["compute","artifacts"],authorizationScope:"Existing workspace credential stays in the private execution bridge. Swarm admission limits do not change workspace-wide limits.",authentication:"host-managed",billingMode:"metered"},
    async inspect(){await provider.listWorkspaces();const durable=await storage.ready();return {state:durable.available?"ready":"unavailable",credentialSource:"environment",
      summary:durable.available?"Private bridge and durable storage reachable. Sandbox admission verifies provider access and the compute ceiling.":durable.reason??"Durable storage unavailable."};}};
  const connections=createConnectionManager({operations,adapters:[railwayConnection,...executable?[createCodexConnectionAdapter({ownerId,executable,codexHome})]:[]]});
  const modelProfiles = swarmSubscriptionProfiles(process.env.SWARM_MODEL_PROFILES);
  const profile = modelProfiles.implementation;
  const runtime = createLocalAiRuntime({ adapters: [createCodexCliAdapter({ executable, codexHome, subscriptionOnly: true, subscriptionModels: Object.values(modelProfiles).map(value => value.modelId) })] });
  const deploymentExpiresAt = process.env.SWARM_DEMONSTRATION_EXPIRES_AT ? Date.parse(process.env.SWARM_DEMONSTRATION_EXPIRES_AT) : undefined;
  if (deploymentExpiresAt !== undefined && !Number.isFinite(deploymentExpiresAt)) throw Error("Invalid deployment expiry.");
  if (Number(process.env.SWARM_MAX_MODEL_USD ?? 0) !== 0)
    throw Error("Separately billed inference must remain $0 for this deployment.");
  const context = createSwarmTaskContext({ store, provider, artifacts, recipes });
  const coordinator = createSwarmCoordinator({
    store, provider, modelProfiles, deploymentExpiresAt, executionKind:projectId=>recipes.get(projectId)?.executionKind??"performance", investigationInstruments: projectId => recipes.get(projectId)?.investigationInstruments ?? [], handleTask: createSwarmTaskHandler({ context, runtime, beforeModelCall: admitRun, maxTokenPriceUsd: Number(process.env.SWARM_MAX_TOKEN_PRICE_USD ?? 0.00003) }), beforeDispatch: admitRun,
  });
  async function admitRun(run: SwarmRun) {
      if (draining)
        return { available: false, reason: "Coordinator is draining." };
      if (deploymentExpiresAt !== undefined && Date.now() >= deploymentExpiresAt)
        return { available: false, reason: "The approved deployment lifetime has expired." };
      const durable = await storage.ready();
      if (!durable.available)
        return durable;
      if (!executable)
        return { available: false, reason: "Codex subscription runtime is unavailable." };
      try {
        const status = await subscriptionStatus();
        if (!status.available)
          return { available: false, reason: status.reason,waitingForConnection:!status.authenticated };
        const quota = store.admitWeeklyQuota(run.id, swarmWeeklyQuotaWindow(status));
        if (!quota.available) return quota;
        await ensureInference();
        return { available: true };
      }
      catch (error) {
        return { available: false, reason: swarmSubscriptionFailure(error) };
      }
  }
  let draining = false;
  let exportPromise: Promise<unknown> | undefined;
  let inferenceVerified = false;
  let inferenceProbe: Promise<void> | undefined;
  const subscriptionChecks = new Set<ReturnType<typeof readCodexSubscription>>();
  async function subscriptionStatus() {
    if (draining || !executable)
      throw Error("Coordinator authentication is unavailable while draining.");
    const pending = readCodexSubscription({ executable, codexHome });
    subscriptionChecks.add(pending);
    try { return await pending; }
    finally { subscriptionChecks.delete(pending); }
  }
  async function ensureInference() {
    if (draining)
      throw Error("Coordinator inference is unavailable while draining.");
    if (inferenceVerified)
      return;
    inferenceProbe ??= (async () => {
      const checked = new Set<string>();
      for (const profile of Object.values(modelProfiles)) {
      const key = JSON.stringify(profile);
      if (checked.has(key)) continue;
      checked.add(key);
      const response = await runtime.run({ requestId: crypto.randomUUID(), profile, messages: [{ role: "user", content: 'Return exactly {"subscriptionProbe":"ok"}. Do not use tools.' }], maxOutputTokens: 100, deadlineAt: Date.now() + 90000 });
      if (!/"subscriptionProbe"\s*:\s*"ok"/.test(response.text) || response.usage?.costUsd !== 0)
        throw Error("Codex subscription inference preflight failed.");
      await artifacts.put({ name: "subscription-preflight.json", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({ checkedAt: Date.now(), profile, location: process.env.RAILWAY_SERVICE_ID ? "railway-coordinator" : "local", usage: response.usage, inferenceVerified: true })) });
      }
      inferenceVerified = true;
    })().catch(error => { inferenceProbe = undefined; throw error; });
    await inferenceProbe;
  }
  async function exportState(receipt?: SwarmDemonstrationExport) {
    const durable = await storage.ready();
    if (!durable.available)
      throw Error(durable.reason ?? "Durable artifact storage is unavailable.");
    if (process.env.SWARM_DEMONSTRATION_ID && receipt?.demonstration.id !== process.env.SWARM_DEMONSTRATION_ID)
      throw Error("Shutdown receipt does not match this demonstration.");
    draining = true;
    lifetime.abort();
    exportPromise ??= (async () => {
      await connectionGate.close();
      await connections.close();
      for (const run of store.activeRuns())
        if (!terminalSwarmStatuses.has(run.status))
          coordinator.cancel(run.id);
      await coordinator.close();
      await Promise.allSettled([...subscriptionChecks, ...(inferenceProbe ? [inferenceProbe] : [])]);
      const archive = await artifacts.put({ name: `swarm-state-${Date.now()}.sqlite`, mediaType: "application/vnd.sqlite3", bytes: new Uint8Array(db.serialize()) });
      const deployment = await artifacts.put({ name: "demonstration-receipt.json", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({ receipt, archive, exportedAt: Date.now(), remainingWorkspaces: store.workspaces().length })) });
      await artifacts.read({ sha256: archive.sha256 });
      await artifacts.read({ sha256: deployment.sha256 });
      const result = { archive: { sha256: archive.sha256, bytes: archive.bytes }, deploymentReceipt: { sha256: deployment.sha256, bytes: deployment.bytes }, artifactsPrefix: "swarm/", remainingWorkspaces: store.workspaces().length };
      if (bucket && receipt) {
        const key = `swarm/deployments/${receipt.demonstration.id}/manifest.json`;
        const bytes = new TextEncoder().encode(JSON.stringify({
          ...result, demonstrationId: receipt.demonstration.id, runIds: store.db.query<{
            id: string;
          }, [
            ]>("SELECT id FROM swarm_runs").all().map(run => run.id)
        }));
        await bucket.file(key).write(bytes, { type: "application/json" });
        if (!Buffer.from(await bucket.file(key).arrayBuffer()).equals(Buffer.from(bytes)))
          throw Error("Durable deployment manifest verification failed.");
      }
      if (process.env.RAILWAY_PROJECT_ID && process.env.SWARM_DEMONSTRATION_ID && receipt) {
        const credentialCleanup = await removeOwnedSwarmCodexCredentials({ dataDir: directory, codexHome, executable });
        const cleanup = await artifacts.put({ name: "credential-cleanup.json", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({
          demonstrationId: receipt.demonstration.id, checkedAt: Date.now(), ...credentialCleanup,
        })) });
        await artifacts.read({ sha256: cleanup.sha256 });
        const completed = { ...result, credentialCleanup, credentialCleanupReceipt: { sha256: cleanup.sha256, bytes: cleanup.bytes } };
        if (bucket) {
          const key = `swarm/deployments/${receipt.demonstration.id}/credential-cleanup.json`;
          const bytes = new TextEncoder().encode(JSON.stringify(completed));
          await bucket.file(key).write(bytes, { type: "application/json" });
          if (!Buffer.from(await bucket.file(key).arrayBuffer()).equals(Buffer.from(bytes)))
            throw Error("Durable credential cleanup receipt verification failed.");
        }
        return completed;
      }
      return result;
    })().catch(error => { exportPromise = undefined; throw error; });
    return exportPromise;
  }
  async function providerReady(){
    try{
      if(draining)return {available:false,reason:"Coordinator is draining."};
      const durable=await storage.ready();if(!durable.available)return durable;
      const values=await connections.list();
      if(!executable||values.some(value=>value.state!=="ready"))return {available:false,reason:values.find(value=>value.state!=="ready")?.summary??"Codex is not installed."};
      await ensureInference();return {available:true};
    }catch{return {available:false,reason:"Remote connection readiness could not be verified."};}
  }
  const connectionGate=createSwarmConnectionGate({store,coordinator,connections,operations,requiredIds:executable?["codex-account","railway"]:["railway"],ready:providerReady});
  const connectionHttp=process.env.SWARM_PUBLIC_ORIGIN?createConnectionHttpHandler({db,manager:connections,operations,
    token:required("SWARM_SERVICE_TOKEN"),publicOrigin:process.env.SWARM_PUBLIC_ORIGIN,signal:lifetime.signal,
    authorizeProject:id=>{if(!recipes.has(id))throw Error("Project access denied.");}}):undefined;
  await connections.recover();
  void connectionGate.drain().catch(()=>{});
  const api = createSwarmHttpHandler({
    ...(connectionHttp?{connections:{mint:connectionHttp.mint,start:connectionGate.start}}:{}),
    executionAuthority:process.env.RAILWAY_PROJECT_ID||process.env.SWARM_COORDINATOR_TOPOLOGY==="cloud"?"cloud":"local",
    shutdownSignal: lifetime.signal,
    store, coordinator, artifacts, token: required("SWARM_SERVICE_TOKEN"), recipes, backend: provider.kind, profile, modelProfiles, deploymentExpiresAt, maxComputeUsd: Math.min(10, Number(process.env.SWARM_MAX_COMPUTE_USD ?? 10)), maxModelUsd: 0, inference: { provider: "Codex", credentialSource: "ChatGPT subscription on the trusted coordinator", separatelyBilledUsd: 0 }, exportState, verifyIntegration: input => verifySwarmIntegration({ context, ...input }), providerReady
  });
  let handler = async(request:Request)=>{
    const url=new URL(request.url),eventsPrefix="/api/agent-events/v1/";
    if(url.pathname.startsWith(eventsPrefix)){
      url.pathname="/api/swarm/v1/agent-events/"+url.pathname.slice(eventsPrefix.length);
      return api(new Request(url,request));
    }
    return await connectionHttp?.handle(request)??api(request);
  };
  if (process.env.SWARM_PUBLIC_ORIGIN) {
    handler = createSwarmBrowserAccessHandler({ store, token: required("SWARM_SERVICE_TOKEN"), publicOrigin: process.env.SWARM_PUBLIC_ORIGIN, deploymentExpiresAt,
      name: id => recipes.get(id)?.name, handler });
    if (process.env.SWARM_SITE_DIR) handler = createSwarmSiteHandler({ handler, directory: process.env.SWARM_SITE_DIR, publicOrigin: process.env.SWARM_PUBLIC_ORIGIN });
  }
  return { handler, coordinator, store, context, connections, operations, async close() { lifetime.abort(); await connectionGate.close();await connections.close();await coordinator.close(); db.close(); } };
}
if (import.meta.main) {
  const service = await createSwarmService();
  await service.coordinator.startLoop();
  const server = Bun.serve({ hostname: process.env.HOST ?? "::", port: Number(process.env.PORT ?? 8080), idleTimeout: 255, maxRequestBodySize: 269484032, fetch: service.handler });
  console.log(`Harness swarm coordinator listening on ${server.port}`);
  let stopping = false;
  const stop = async () => {
    if (stopping)
      return; stopping = true; server.stop(); await service.close();
  };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
}
