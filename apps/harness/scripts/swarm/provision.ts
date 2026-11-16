import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { createLocalExecutionProvider, createSwarmSourceSnapshot } from "@hyperfocus/ai-runtime/swarm";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { inspectSwarmBilling } from "./billing";
import { redactSensitiveString } from "../../cli/src/tool-activity-state";
import { cleanupSwarmDeploymentFromBucket } from "./cleanup-export";
import { swarmSubscriptionProfiles } from "../../cli/src/swarm/reasoning/model-profiles";

const projectId = "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", environmentId = "e46fa18a-61c0-4cc4-9379-45b8dfde47a6";
const protectedService = "b2ca89d2-a1db-4b64-b6ee-d8ef8e43e04a";
const artifactBucketId = "6d43edaa-e4e7-4030-8f49-804b03b834a1";
const projectIdsSchema = z.array(z.string().trim().min(1).max(160).regex(/^[a-zA-Z0-9_-]+$/)).min(1).max(20).transform(values => [...new Set(values)]);
const serviceSchema = z.object({ id: z.string().uuid(), name: z.string(), volumeId: z.string().uuid().optional(), volumeCapacityMB: z.number().optional() });
const stateSchema = z.object({ id: z.string().uuid(), projectId: z.literal(projectId), environmentId: z.literal(environmentId),
  hostingMode:z.enum(["temporary","service"]).default("temporary"),
  createdAt: z.string(), expiresAt: z.string(), maximumUsd: z.number().positive().max(10), sourceRevision: z.string(),
  allowedProjectIds: projectIdsSchema,
  creationOwnershipChecked: z.boolean().optional(),
  bootstrapComplete: z.boolean().optional(),
  attempt: z.number().int().nonnegative().optional(),
  pendingVolumeDeletionIds: z.array(z.string().uuid()).optional(),
  phase: z.enum(["provisioning", "uploaded", "cleaned", "cleanup-incomplete"]),
  coordinator: serviceSchema.optional(), worker: serviceSchema.optional(), url: z.string().url().optional(),
  archive: z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive() }).optional(),
});
type State = z.infer<typeof stateSchema>;

export function swarmRailwayArguments(args: string[], root: string, identityFile = process.env.SWARM_SSH_IDENTITY_FILE) {
  const delimiter = args.indexOf("--"), options = delimiter < 0 ? args : args.slice(0, delimiter);
  if (!identityFile || args[0] !== "ssh" || args[1] === "keys" || options.includes("-i") || options.includes("--identity-file")) return args;
  if (identityFile.includes("\0")) throw new Error("SSH identity path contains an invalid character.");
  return ["ssh", "--identity-file", path.resolve(root, identityFile), ...args.slice(1)];
}

function createCli(options: { executable: string; root: string }) {
  async function run(args: string[], input?: string, timeout = 120_000, allowFailure = false) {
    const child = spawnBackgroundProcess({ cmd: [options.executable, ...swarmRailwayArguments(args, options.root)], cwd: options.root,
      stdin: input === undefined ? "ignore" : new TextEncoder().encode(input), stdout: "pipe", stderr: "pipe", timeout, maxBuffer: 4_194_304 });
    const [stdout, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code && !allowFailure) throw new Error(`Railway ${args[0]} failed (${code}). Raw output suppressed to protect credentials; inspect the exact owned service in Railway.`);
    return stdout;
  }
  return { run, async api(query: string, variables: Record<string, unknown>) {
    const raw = await run(["api", query, "--variables", "@-", "--compact", "--allow-errors"], JSON.stringify(variables), 120_000, true);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw Error("Railway management API returned no valid JSON; raw output suppressed."); }
    const result = z.object({ data: z.record(z.unknown()).nullable().optional(), errors: z.array(z.object({ message: z.string() }).passthrough()).optional() }).parse(parsed);
    if (result.errors?.length || !result.data) {
      let message = result.errors?.map(error => error.message).join("; ") ?? "No result";
      const strings = (value: unknown): string[] => typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
      for (const value of strings(variables).filter(value => value.length >= 12).sort((a, b) => b.length - a.length)) message = message.replaceAll(value, "[redacted-input]");
      throw new Error(`Railway ${/\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "operation"} failed: ${redactSensitiveString(message).slice(0, 3000)}`);
    }
    if (/^\s*mutation\b/.test(query) && Object.values(result.data).some(value => value === false || value === null)) throw new Error("Railway did not acknowledge the requested deployment mutation.");
    return result.data;
  } };
}
/** Inspects bucket identity, instance availability and URL style without retrieving credential values. */
export async function inspectSwarmDeploymentBucket(options: {
  root: string; railwayCli: string; readApi?: (query: string, variables: Record<string, unknown>) => Promise<unknown>;
}) {
  const read = options.readApi ?? createCli({ executable: options.railwayCli, root: options.root }).api;
  const input = await read("query SwarmDurableBucketPreflight($projectId: String!, $bucketId: String!, $environmentId: String!) { project(id: $projectId) { id buckets { edges { node { id name deletedAt } } } } details: bucketInstanceDetails(bucketId: $bucketId, environmentId: $environmentId) { objectCount sizeBytes } metadata: bucketS3Credentials(bucketId: $bucketId, environmentId: $environmentId, projectId: $projectId) { urlStyle } }", { projectId, bucketId: artifactBucketId, environmentId });
  const result = z.object({ project: z.object({ id: z.literal(projectId), buckets: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), name: z.string(), deletedAt: z.string().nullable() }) })) }) }),
    details: z.object({ objectCount: z.number().nonnegative(), sizeBytes: z.number().nonnegative() }).nullable(),
    metadata: z.array(z.object({ urlStyle: z.string() })) }).safeParse(input);
  if (!result.success) throw Error("Durable bucket preflight returned incomplete metadata. Verify the approved bucket instance and access in the production environment before provisioning.");
  const data = result.data, bucket = data.project.buckets.edges.find(edge => edge.node.id === artifactBucketId)?.node;
  if (!bucket || bucket.name !== "hyperfocus" || bucket.deletedAt) throw Error("The approved artifact bucket is missing, renamed or deleted; deployment is blocked before service creation.");
  if (!data.details || !data.metadata.length) throw Error("The approved bucket has no usable production-environment instance. Creating or repairing it requires explicit authorization; no temporary service was created.");
  const styles = [...new Set(data.metadata.map(value => value.urlStyle))];
  if (styles.length !== 1 || !["virtual-host", "path"].includes(styles[0] ?? "")) throw Error("Artifact bucket URL-style metadata is missing, unresolved or unsupported; deployment is blocked before service creation.");
  const urlStyle = styles[0] === "virtual-host" ? "virtual-hosted" : "path";
  return { verifiedAt: new Date().toISOString(), bucketId: artifactBucketId, bucketName: bucket.name, environmentId,
    urlStyle, providerUrlStyle: styles[0], instance: data.details, credentialValuesRead: false };
}

function location(root: string, id: string) { return path.join(root, ".local", "swarm", "deployments", z.string().uuid().parse(id)); }
async function persist(directory: string, state: State) {
  await writeFile(path.join(directory, "deployment.json.next"), JSON.stringify(stateSchema.parse(state), null, 2), { mode: 0o600 });
  await rename(path.join(directory, "deployment.json.next"), path.join(directory, "deployment.json"));
}
async function reconcileProvisioningOwnership(cli: ReturnType<typeof createCli>, state: State) {
  if (!state.creationOwnershipChecked) return;
  const result = await cli.api("query SwarmRecoverProvisioningOwnership($id: String!) { project(id: $id) { services { edges { node { id name } } } volumes { edges { node { id volumeInstances { edges { node { serviceId environmentId sizeMB } } } } } } } }", { id: projectId });
  const inventory = z.object({ services: z.object({ edges: z.array(z.object({ node: serviceSchema })) }), volumes: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string().uuid(), volumeInstances: z.object({ edges: z.array(z.object({ node: z.object({ serviceId: z.string().nullable(), environmentId: z.string(), sizeMB: z.number() }) })) }) }) })) }) }).parse(result.project);
  for (const role of ["worker", "coordinator"] as const) {
    const name = `hyperfocus-swarm-${state.id.slice(0, 8)}-${role}`;
    const matches = inventory.services.edges.filter(edge => edge.node.name === name);
    if (matches.length > 1) throw new Error("Ambiguous temporary service identity; refusing automatic adoption.");
    const match = matches[0]?.node;
    if (!match) continue;
    if (match.id === protectedService || state[role] && state[role].id !== match.id) throw new Error("Temporary service identity changed during provisioning.");
    const owned = state[role] ?? match;
    state[role] = owned;
    const volumes = inventory.volumes.edges.filter(edge => edge.node.volumeInstances.edges.some(instance => instance.node.serviceId === owned.id && instance.node.environmentId === environmentId));
    if (volumes.length > 1) throw new Error("Multiple volumes attached to the temporary service; manual review required.");
    const volume = volumes[0]?.node;
    if (volume) {
      if (owned.volumeId && owned.volumeId !== volume.id) throw new Error("Temporary volume identity changed during provisioning.");
      owned.volumeId = volume.id;
      owned.volumeCapacityMB = volume.volumeInstances.edges.find(edge => edge.node.environmentId === environmentId)?.node.sizeMB;
    }
  }
}
function authCommand(state: State) {
  return ["bun", "run", "connections", "--deployment", state.id, "--project", state.allowedProjectIds[0]!, "--agent", "connections-owner"];
}
async function waitForDeploymentHealth(cli: ReturnType<typeof createCli>, state: State) {
  if (!state.url || !state.worker || !state.coordinator) throw new Error("Cannot check incomplete deployment readiness.");
  const deadline = state.hostingMode==="service"?Date.now()+600_000:Math.min(Date.now() + 600_000, Date.parse(state.expiresAt) - 60_000);
  while (Date.now() < deadline) {
    let deployed = true;
    for (const service of [state.worker, state.coordinator]) {
      const data = await cli.api("query SwarmBootstrapReadiness($input: DeploymentListInput!) { deployments(input: $input, first: 1) { edges { node { status } } } }", { input: { projectId, environmentId, serviceId: service.id } });
      const latest = z.object({ edges: z.array(z.object({ node: z.object({ status: z.string() }) })) }).parse(data.deployments).edges[0]?.node;
      if (latest && ["FAILED", "CRASHED", "REMOVED", "SKIPPED"].includes(latest.status)) throw new Error(`Temporary ${service.name} deployment failed before readiness.`);
      if (latest?.status !== "SUCCESS") deployed = false;
    }
    if (deployed) {
      const response = await fetch(new URL("/health", state.url), { redirect: "error", signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      if (response?.ok) return;
    }
    await Bun.sleep(3000);
  }
  throw new Error("Temporary services did not become healthy within the ten-minute bootstrap window.");
}

/** Retry only a proven empty bootstrap; its approval identity and deadline are immutable. */
export function prepareSwarmBootstrapRetry(options: {
  previous: z.input<typeof stateSchema>; inventory: unknown; projectIds: string[]; maximumUsd: number; now?: number;
}) {
  const previous = stateSchema.parse(options.previous), now = options.now ?? Date.now();
  if (previous.bootstrapComplete !== false || previous.phase !== "cleaned") throw new Error("Bootstrap retry requires a failed, empty bootstrap with verified cleanup.");
  if (!Number.isFinite(Date.parse(previous.expiresAt)) || now >= Date.parse(previous.expiresAt)) throw new Error("The approved demonstration has expired; retry cannot extend its deadline.");
  if (previous.maximumUsd !== options.maximumUsd) throw new Error("Bootstrap retry cannot change the approved spending ceiling.");
  const projects = projectIdsSchema.parse(options.projectIds);
  if (projects.length !== previous.allowedProjectIds.length || projects.some(id => !previous.allowedProjectIds.includes(id))) throw new Error("Bootstrap retry cannot change the approved project allowlist.");
  const inventory = z.object({ id: z.literal(projectId), services: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), name: z.string() }) })) }),
    volumes: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), name: z.string(), volumeInstances: z.object({ edges: z.array(z.object({ node: z.object({ isPendingDeletion: z.boolean() }) })) }) }) })) }) }).parse(options.inventory);
  for (const role of ["worker", "coordinator"] as const) {
    const owned = previous[role], name = `hyperfocus-swarm-${previous.id.slice(0, 8)}-${role}`;
    if (inventory.services.edges.some(edge => edge.node.id === owned?.id || edge.node.name === name)) throw new Error("An earlier bootstrap service still exists; retry refused.");
    for (const { node: volume } of inventory.volumes.edges) if (volume.id === owned?.volumeId || volume.name === `${name}-volume`) {
      if (!volume.volumeInstances.edges.length || !volume.volumeInstances.edges.every(edge => edge.node.isPendingDeletion)) throw new Error("An earlier bootstrap volume is not pending deletion; retry refused.");
    }
  }
  return stateSchema.parse({ id: previous.id, projectId: previous.projectId, environmentId: previous.environmentId,
    createdAt: previous.createdAt, expiresAt: previous.expiresAt, maximumUsd: previous.maximumUsd,
    sourceRevision: previous.sourceRevision, allowedProjectIds: previous.allowedProjectIds,
    bootstrapComplete: false, phase: "provisioning", attempt: (previous.attempt ?? 0) + 1 });
}

export async function archiveSwarmBootstrapAttempt(options: { directory: string; previousReceipt: string; attempt: number }) {
  const attempt = z.number().int().positive().parse(options.attempt);
  const attempts = path.join(options.directory, "attempts"); await mkdir(attempts, { recursive: true });
  const file = path.join(attempts, `attempt-${attempt - 1}.json`);
  // Exclusive creation also prevents concurrent invocations reusing one attempt.
  await writeFile(file, options.previousReceipt, { mode: 0o600, flag: "wx" });
  return file;
}

/** Every remote mutation is behind allowProvision; secrets go through stdin, never command arguments. */
export async function provisionSwarmDeployment(options: {
  root: string; railwayCli: string; allowProvision: boolean; allowIncrementalCharges?: boolean;
  maximumUsd?: number; lifetimeMinutes?: number; projectIds?: string[]; demonstrationId?: string; retryBootstrap?: boolean; publicOrigin?: string;
  hostingMode?:"temporary"|"service";allowPersistentHosting?:boolean;
}) {
  if (!options.allowProvision) throw new Error("Provisioning requires --allow-provision and prior user authorization for this deployment.");
  const hostingMode=options.hostingMode??"temporary";
  if(hostingMode==="service"&&!options.allowPersistentHosting)throw Error("Persistent control hosting needs --allow-persistent-hosting covering its ongoing service/storage charges separately from the bounded worker budget.");
  if(hostingMode==="service"&&options.retryBootstrap)throw Error("Persistent service bootstrap retry requires inspection of the retained deployment; temporary retry cannot change its hosting policy.");
  const allowedProjectIds = projectIdsSchema.parse(options.projectIds);
  const publicOrigin = options.publicOrigin === undefined ? undefined : z.string().url().refine(value => {
    const url = new URL(value); return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
  }, "Public origin must be an exact HTTPS origin without a path or credentials.").parse(options.publicOrigin);
  const maximumUsd = z.number().gt(1).max(10).parse(options.maximumUsd ?? 10);
  const lifetimeMinutes = z.number().int().min(10).max(120).parse(options.lifetimeMinutes ?? 120);
  if (options.retryBootstrap && !options.demonstrationId) throw new Error("--retry-bootstrap requires the original explicit --demonstration-id.");
  const id = z.string().uuid().parse(options.demonstrationId ?? randomUUID()), directory = location(options.root, id), suffix = id.slice(0, 8);
  const railwayToken = process.env.SWARM_RAILWAY_API_TOKEN ?? process.env.RAILWAY_API_TOKEN;
  if (!railwayToken) throw new Error("Set SWARM_RAILWAY_API_TOKEN to an explicitly authorized sandbox/API-capable token. This command never copies your CLI credential store.");
  if (process.env.RAILWAY_TOKEN) throw new Error("Unset RAILWAY_TOKEN: project-token precedence can select a different management identity than the authorized workspace API token.");
  const cli = createCli({ executable: options.railwayCli, root: options.root });
  let retried: State | undefined, previousReceipt: string | undefined;
  if (options.retryBootstrap) {
    previousReceipt = await readFile(path.join(directory, "deployment.json"), "utf8");
    const previous = stateSchema.parse(JSON.parse(previousReceipt));
    if (previous.id !== id) throw new Error("Bootstrap receipt identity differs from the approved demonstration.");
    const remote = await cli.api("query SwarmBootstrapRetryOwnership($id: String!) { project(id: $id) { id services { edges { node { id name } } } volumes { edges { node { id name volumeInstances { edges { node { isPendingDeletion } } } } } } } }", { id: projectId });
    retried = prepareSwarmBootstrapRetry({ previous, inventory: remote.project, projectIds: allowedProjectIds, maximumUsd });
  }
  const artifactStorage = await inspectSwarmDeploymentBucket({ root: options.root, railwayCli: options.railwayCli, readApi: cli.api });
  const billing = await inspectSwarmBilling({ root: options.root, railwayCli: options.railwayCli });
  if (!options.allowIncrementalCharges && maximumUsd > billing.includedUsage.calculatedRemainingUsd) throw new Error("Requested demonstration budget exceeds remaining shared included usage. Reduce --max-usd or obtain authorization before --allow-incremental-charges.");
  // Snapshot validation precedes any cloud mutation. It excludes local/ignored state and refuses credential paths.
  const snapshot = await createSwarmSourceSnapshot({ root: options.root });
  await mkdir(path.dirname(directory), { recursive: true });
  // A new identity is exclusive; an explicit failed-bootstrap retry retains its
  // original approval and archives the prior attempt before replacing the receipt.
  if (!retried) await mkdir(directory);
  const state: State = retried ? { ...retried, sourceRevision: snapshot.revision } : { id, projectId, environmentId, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + lifetimeMinutes * 60_000).toISOString(), maximumUsd,
    sourceRevision: snapshot.revision, hostingMode, allowedProjectIds, bootstrapComplete: false, phase: "provisioning", attempt: 0 };
  const secrets = retried ? z.object({ coordinator: z.string().min(32), worker: z.string().min(32) }).parse(JSON.parse(await readFile(path.join(directory, "secrets.json"), "utf8")))
    : { coordinator: randomBytes(32).toString("hex"), worker: randomBytes(32).toString("hex") };
  if (retried && previousReceipt) {
    await archiveSwarmBootstrapAttempt({ directory, previousReceipt, attempt: retried.attempt ?? 1 });
  }
  await writeFile(path.join(directory, retried ? `billing-attempt-${state.attempt}.json` : "billing-before.json"), JSON.stringify(billing, null, 2), { flag: "wx" });
  await writeFile(path.join(directory, retried ? `bucket-attempt-${state.attempt}.json` : "bucket-before.json"), JSON.stringify(artifactStorage, null, 2), { flag: "wx" });
  if (!retried) await writeFile(path.join(directory, "secrets.json"), JSON.stringify(secrets), { mode: 0o600, flag: "wx" });
  await persist(directory, state);
  const local = createLocalExecutionProvider({ directory: path.join(directory, "build-source") });
  const workspace = await local.createWorkspace({ swarmId: id, taskId: "deploy-source", lane: "investigation",
    resources: { cpu: 1, memoryGB: 1 }, source: { revision: snapshot.revision,
      bundle: { sha256: snapshot.sha256, bytesBase64: Buffer.from(snapshot.bytes).toString("base64") } } });
  try {
    const before = await cli.api("query SwarmCheckUnusedIdentity($id: String!) { project(id: $id) { services { edges { node { name } } } } }", { id: projectId });
    const existing = z.object({ services: z.object({ edges: z.array(z.object({ node: z.object({ name: z.string() }) })) }) }).parse(before.project);
    if (existing.services.edges.some(edge => ["worker", "coordinator"].some(role => edge.node.name === `hyperfocus-swarm-${suffix}-${role}`))) throw new Error("The proposed temporary service name already exists; choose a new demonstration identity.");
    state.creationOwnershipChecked = true; await persist(directory, state);
    for (const role of ["worker", "coordinator"] as const) {
      const created = await cli.api("mutation SwarmCreateTemporaryService($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }", { input: { projectId, environmentId, name: `hyperfocus-swarm-${suffix}-${role}` } });
      const owned = serviceSchema.parse(created.serviceCreate);
      if (owned.id === protectedService) throw new Error("Provider returned the protected existing service; refusing changes.");
      state[role] = owned; await persist(directory, state);
      const volume = await cli.api("mutation SwarmCreateTemporaryVolume($input: VolumeCreateInput!) { volumeCreate(input: $input) { id volumeInstances { edges { node { environmentId sizeMB } } } } }", { input: { projectId, environmentId, serviceId: owned.id, mountPath: "/data" } });
      const createdVolume = z.object({ id: z.string().uuid(), volumeInstances: z.object({ edges: z.array(z.object({ node: z.object({ environmentId: z.string(), sizeMB: z.number() }) })) }) }).parse(volume.volumeCreate);
      owned.volumeId = createdVolume.id; owned.volumeCapacityMB = createdVolume.volumeInstances.edges.find(edge => edge.node.environmentId === environmentId)?.node.sizeMB; await persist(directory, state);
      await cli.api("mutation SwarmConfigureService($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }", {
        serviceId: owned.id, environmentId, input: { dockerfilePath: role === "worker" ? "apps/swarm-worker/Dockerfile" : "apps/harness/swarm.Dockerfile",
          numReplicas: 1, restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5, healthcheckPath: "/health" },
      });
      await cli.api("mutation SwarmLimitTemporaryService($input: ServiceInstanceLimitsUpdateInput!) { serviceInstanceLimitsUpdate(input: $input) }", { input: { serviceId: owned.id, environmentId, memoryGB: 4, vCPUs: 1 } });
    }
    const worker = state.worker!, coordinator = state.coordinator!;
    const domain = await cli.api("mutation SwarmCreateAuthenticatedDomain($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }", { input: { serviceId: coordinator.id, environmentId, targetPort: 8080 } });
    state.url = `https://${z.object({ domain: z.string() }).parse(domain.serviceDomainCreate).domain}`;
    await persist(directory, state);
    const demonstration = { id, projectId, environmentId, worker, coordinator,
      coordinatorUrl: `http://${coordinator.name}.railway.internal:8080` };
    const shared:Record<string,string> = { PORT: "8080", SWARM_WORKER_TOKEN: secrets.worker,
      ...(hostingMode==="service"?{SWARM_HOSTING_MODE:"service",SWARM_CONTROL_ID:id,SWARM_CONTROL_MAX_COMPUTE_USD:String(maximumUsd)}
        :{SWARM_DEMONSTRATION_ID:id,SWARM_DEMONSTRATION_EXPIRES_AT:state.expiresAt,SWARM_DEMONSTRATION_MAX_USD:String(maximumUsd)}) };
    const variables = {
      worker: { ...shared, SWARM_WORKER_DATA_DIR: "/data", RAILWAY_API_TOKEN: railwayToken,
        SWARM_COORDINATOR_TOKEN: secrets.coordinator, ...(hostingMode==="temporary"?{SWARM_TEMPORARY_DEPLOYMENT:JSON.stringify(demonstration)}:{}), SWARM_ALLOWED_REPOSITORIES: "" },
      coordinator: { ...shared, SWARM_DATA_DIR: "/data", SWARM_BACKEND: "railway", CODEX_HOME: "/data/codex",
        SWARM_PUBLIC_ORIGIN: publicOrigin ?? state.url,
        SWARM_SERVICE_TOKEN: secrets.coordinator, SWARM_WORKER_URL: `http://${worker.name}.railway.internal:8080`,
        SWARM_PROJECT_IDS: allowedProjectIds.join(","), SWARM_MAX_COMPUTE_USD: String(maximumUsd - 1), SWARM_MAX_MODEL_USD: "0",
        SWARM_MODEL_PROFILES: JSON.stringify(swarmSubscriptionProfiles()),
        SWARM_S3_BUCKET: "${{hyperfocus.BUCKET}}", SWARM_S3_ENDPOINT: "${{hyperfocus.ENDPOINT}}",
        SWARM_S3_ACCESS_KEY_ID: "${{hyperfocus.ACCESS_KEY_ID}}", SWARM_S3_SECRET_ACCESS_KEY: "${{hyperfocus.SECRET_ACCESS_KEY}}", SWARM_S3_REGION: "${{hyperfocus.REGION}}", SWARM_S3_URL_STYLE: artifactStorage.urlStyle },
    };
    for (const role of ["worker", "coordinator"] as const) await cli.api("mutation SwarmConfigureVariables($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }", { input: { projectId, environmentId, serviceId: state[role]!.id, skipDeploys: true, variables: variables[role] } });
    for (const role of ["worker", "coordinator"] as const) {
      await cli.run(["up", workspace.root, "--path-as-root", "--project", projectId, "--environment", environmentId,
        "--service", state[role]!.id, "--detach", "--json", "--message", `Hyperfocus temporary swarm ${id}`], undefined, 600_000);
    }
    await waitForDeploymentHealth(cli, state);
    state.bootstrapComplete = true; state.phase = "uploaded"; await persist(directory, state);
    return { ...state, receipt: path.join(directory, "deployment.json"), secretsFile: path.join(directory, "secrets.json"),
      authenticationCommand: authCommand(state),
      next: "Both deployments report healthy. Perform device login on the coordinator, then --ready for the subscription check before cloud verification. Healthy does not mean cloud execution verified." };
  } catch (error) {
    // A successful create can lose its response. Reconcile only the exact names
    // proven absent before this invocation, so cleanup still owns those resources.
    await reconcileProvisioningOwnership(cli, state).catch(() => undefined);
    await persist(directory, state);
    // No caller has received the service endpoint and no Codex login has occurred.
    // Empty bootstrap resources can be removed without discarding engineering work.
    const rollback = await cleanupSwarmDeployment({ root: options.root, id, railwayCli: options.railwayCli, allowCleanup: true }).catch(() => undefined);
    throw new Error(`Temporary provisioning stopped; rollback ${rollback?.phase ?? "unverified"}. Retained exact owned IDs at ${path.join(directory, "deployment.json")}; run --cleanup ${id} --allow-cleanup if incomplete. ${error instanceof Error ? error.message : "Provider error."}`);
  } finally { await local.destroyWorkspace({ workspaceId: workspace.id }); }
}

export async function inspectSwarmDeployment(options: { root: string; id: string; railwayCli: string }) {
  const directory = location(options.root, options.id);
  const state = stateSchema.parse(JSON.parse(await readFile(path.join(directory, "deployment.json"), "utf8")));
  return { ...state, authenticationCommand: authCommand(state),
    ...state.hostingMode==="service"?{hostingLifetime:"Persistent control service; worker compute is cleaned independently. The recorded expiry is the initial bootstrap deadline.",cleanupCommand:["bun","run","swarm","cleanup"]}:
    {cleanupCommand: ["bun", "apps/harness/scripts/swarm/deploy.ts", "--cleanup", state.id, "--allow-cleanup", "--railway-cli", options.railwayCli]} };
}

/** Update only receipt-owned services. Durable volumes, account limits and authentication stay in place. */
export async function updateSwarmDeployment(options:{root:string;id:string;railwayCli:string;allowProvision:boolean;coordinatorOnly?:boolean;projectIds?:string[]}){
  if(!options.allowProvision)throw Error("Deployment update requires authorization and --allow-provision.");
  const directory=location(options.root,options.id),state=stateSchema.parse(JSON.parse(await readFile(path.join(directory,"deployment.json"),"utf8")));
  if(state.hostingMode!=="service"||state.phase==="cleaned"||!state.coordinator||!state.worker)throw Error("A retained persistent deployment receipt is required.");
  const cli=createCli({executable:options.railwayCli,root:options.root});
  const data=await cli.api("query SwarmUpdateOwnership($id:String!){project(id:$id){services{edges{node{id name}}}}}",{id:projectId});
  const services=z.object({services:z.object({edges:z.array(z.object({node:serviceSchema}))})}).parse(data.project).services.edges;
  for(const owned of [state.coordinator,state.worker])if(owned.id===protectedService||!services.some(value=>value.node.id===owned.id&&value.node.name===owned.name))throw Error("Deployment ownership no longer matches its receipt.");
  const snapshot=await createSwarmSourceSnapshot({root:options.root});
  const allowedProjectIds=options.projectIds?projectIdsSchema.parse(options.projectIds):state.allowedProjectIds;
  const local=createLocalExecutionProvider({directory:path.join(directory,"update-source")});
  const workspace=await local.createWorkspace({swarmId:state.id,taskId:"update-control",lane:"investigation",resources:{cpu:1,memoryGB:1},
    source:{revision:snapshot.revision,bundle:{sha256:snapshot.sha256,bytesBase64:Buffer.from(snapshot.bytes).toString("base64")}}});
  try{
    if(options.projectIds){
      const result=await cli.api("mutation SwarmUpdateProjectAllowlist($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}",{input:{projectId,environmentId,serviceId:state.coordinator.id,skipDeploys:true,variables:{SWARM_PROJECT_IDS:allowedProjectIds.join(",")}}});
      if(result.variableCollectionUpsert!==true)throw Error("Coordinator project allowlist update was not confirmed.");
    }
    for(const role of options.coordinatorOnly?["coordinator"] as const:["worker","coordinator"] as const){
      await cli.run(["up",workspace.root,"--path-as-root","--project",projectId,"--environment",environmentId,"--service",state[role]!.id,"--detach","--json","--message",`Hyperfocus persistent control ${state.id}`],undefined,600000);
    }
    await waitForDeploymentHealth(cli,state);
    state.sourceRevision=snapshot.revision;state.allowedProjectIds=allowedProjectIds;state.bootstrapComplete=true;state.phase="uploaded";await persist(directory,state);
    const receipt={deploymentId:state.id,updatedAt:new Date().toISOString(),sourceRevision:snapshot.revision,allowedProjectIds,roles:options.coordinatorOnly?["coordinator"]:["worker","coordinator"],volumeReplacements:0,credentialCopies:0};
    await writeFile(path.join(directory,`update-${Date.now()}.json`),JSON.stringify(receipt,null,2));return {...receipt,url:state.url};
  }finally{await local.destroyWorkspace({workspaceId:workspace.id});}
}

/** This may use the existing subscription for a tiny readiness probe; it never creates a sandbox. */
export async function verifySwarmDeploymentReady(options: { root: string; id: string }) {
  const directory = location(options.root, options.id);
  const state = stateSchema.parse(JSON.parse(await readFile(path.join(directory, "deployment.json"), "utf8")));
  if (state.phase !== "uploaded" || !state.url || state.hostingMode!=="service"&&Date.now() >= Date.parse(state.expiresAt)) throw new Error("Deployment is not uploaded and within its authorized lifetime.");
  const secrets = z.object({ coordinator: z.string().min(32) }).parse(JSON.parse(await readFile(path.join(directory, "secrets.json"), "utf8")));
  const response = await fetch(new URL("/api/swarm/v1/capabilities", state.url), {
    headers: { authorization: `Bearer ${secrets.coordinator}` }, redirect: "error", signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Coordinator readiness failed (${response.status}).`);
  const capabilities = z.object({ available: z.boolean(), reason: z.string().optional(),
    backends: z.array(z.string()), projects: z.array(z.object({ id: z.string() })),
    inference: z.object({ provider: z.literal("Codex"), separatelyBilledUsd: z.literal(0) }) }).parse(await response.json());
  if (!capabilities.available || !capabilities.backends.includes("railway")) throw new Error(capabilities.reason ?? "Railway/Codex subscription readiness failed.");
  if (state.allowedProjectIds.length !== capabilities.projects.length || state.allowedProjectIds.some(id => !capabilities.projects.some(project => project.id === id))) throw new Error("Coordinator project allowlist does not match this deployment receipt.");
  const result = { demonstrationId: state.id, checkedAt: new Date().toISOString(), ready: true,
    allowedProjectIds: state.allowedProjectIds, separatelyBilledInferenceUsd: 0, sandboxCreated: false,
    next: "Run the authorized cloud provider probe on the coordinator, then submit through Harness or Editor." };
  await writeFile(path.join(directory, "readiness.json"), JSON.stringify(result, null, 2));
  return result;
}

export async function cleanupSwarmDeployment(options: { root: string; id: string; railwayCli: string; allowCleanup: boolean }) {
  if (!options.allowCleanup) throw new Error("Cleanup requires --allow-cleanup covering only the recorded temporary service IDs.");
  const directory = location(options.root, options.id);
  const state = stateSchema.parse(JSON.parse(await readFile(path.join(directory, "deployment.json"), "utf8")));
  if(state.hostingMode==="service"&&state.bootstrapComplete)throw Error("Temporary deployment cleanup cannot delete a persistent control service. Cancel campaigns and use swarm cleanup for workers; control-service decommission requires explicit reviewed export and service removal.");
  const cli = createCli({ executable: options.railwayCli, root: options.root });
  if (!state.bootstrapComplete) { await reconcileProvisioningOwnership(cli, state); await persist(directory, state); }
  for (const service of [state.coordinator, state.worker]) if (service && (service.id === protectedService || service.name !== `hyperfocus-swarm-${state.id.slice(0, 8)}-${service === state.worker ? "worker" : "coordinator"}`)) throw new Error("Cleanup ownership does not match the recorded deployment.");
  const before = await cli.api("query SwarmVerifyCleanupOwnership($id: String!) { project(id: $id) { services { edges { node { id name } } } volumes { edges { node { id volumeInstances { edges { node { serviceId environmentId } } } } } } } }", { id: projectId });
  const ownership = z.object({ services: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), name: z.string() }) })) }),
    volumes: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), volumeInstances: z.object({ edges: z.array(z.object({ node: z.object({ serviceId: z.string().nullable(), environmentId: z.string() }) })) }) }) })) }) }).parse(before.project);
  for (const owned of [state.coordinator, state.worker]) if (owned) {
    const actual = ownership.services.edges.find(edge => edge.node.id === owned.id)?.node;
    if (actual && actual.name !== owned.name) throw new Error("Remote service ownership differs from the local receipt; cleanup refused.");
    const volume = ownership.volumes.edges.find(edge => edge.node.id === owned.volumeId)?.node;
    if (volume?.volumeInstances.edges.some(edge => edge.node.environmentId !== environmentId || edge.node.serviceId !== null && edge.node.serviceId !== owned.id)) throw new Error("Recorded volume is attached outside this deployment; cleanup refused.");
  }
  if (!state.bootstrapComplete) {
    // No public endpoint was issued. Stop/remove only resources this invocation recorded.
    for (const owned of [state.coordinator, state.worker]) if (owned) {
      if (ownership.services.edges.some(edge => edge.node.id === owned.id)) {
        const removed = await cli.api("mutation SwarmDeletePartialService($id: String!, $environmentId: String!) { serviceDelete(id: $id, environmentId: $environmentId) }", { id: owned.id, environmentId });
        if (removed.serviceDelete !== true) throw new Error("Railway did not confirm the owned temporary service deletion.");
      }
      if (owned.volumeId && ownership.volumes.edges.some(edge => edge.node.id === owned.volumeId)) {
        const removed = await cli.api("mutation SwarmDeletePartialVolume($id: String!) { volumeDelete(volumeId: $id) }", { id: owned.volumeId });
        if (removed.volumeDelete !== true) throw new Error("Railway did not confirm the owned temporary volume deletion.");
      }
    }
  } else {
    if (!state.worker || !state.url) throw new Error("Deployment receipt is incomplete; refusing broad cleanup.");
    const secrets = z.object({ coordinator: z.string().min(32) }).parse(JSON.parse(await readFile(path.join(directory, "secrets.json"), "utf8")));
    try {
      const budgetCommand = "fetch('http://127.0.0.1:8080/v1/admin/budget',{method:'POST',headers:{authorization:'Bearer '+process.env.SWARM_WORKER_TOKEN,'content-type':'application/json'},body:'{}'}).then(async r=>{if(!r.ok)throw Error('budget failed');console.log(await r.text())}).catch(()=>process.exitCode=1)";
      const budget = JSON.parse(await cli.run(["ssh", "--project", projectId, "--environment", environmentId, "--service", state.worker.id, "--", "node", "--input-type=module", "-e", budgetCommand]));
      const exported = await fetch(new URL("/api/swarm/v1/admin/export", state.url), { method: "POST", redirect: "error", headers: { authorization: `Bearer ${secrets.coordinator}`, "content-type": "application/json" }, body: JSON.stringify({ demonstration: { id: state.id, expiresAt: state.expiresAt, budget, workspaces: [] } }), signal: AbortSignal.timeout(120_000) });
      if (exported.ok) {
        const result = z.object({ archive: stateSchema.shape.archive.unwrap() }).parse(await exported.json());
        const response = await fetch(new URL(`/api/swarm/v1/admin/artifacts/${result.archive.sha256}`, state.url), { redirect: "error", headers: { authorization: `Bearer ${secrets.coordinator}` }, signal: AbortSignal.timeout(60_000) });
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!response.ok || bytes.length !== result.archive.bytes || createHash("sha256").update(bytes).digest("hex") !== result.archive.sha256) throw new Error("Export hash mismatch.");
        await writeFile(path.join(directory, "swarm.sqlite"), bytes, { mode: 0o600 });
        state.archive = result.archive; await persist(directory, state);
      }
    } catch { /* Remote cleanup repeats export; failed export retains evidence volumes. */ }
    const command = "fetch('http://127.0.0.1:8080/v1/admin/cleanup',{method:'POST',headers:{authorization:'Bearer '+process.env.SWARM_WORKER_TOKEN,'content-type':'application/json'},body:'{}'}).then(async r=>{if(!r.ok)throw Error('cleanup failed');console.log(await r.text())}).catch(()=>process.exitCode=1)";
    try { await cli.run(["ssh", "--project", projectId, "--environment", environmentId, "--service", state.worker.id, "--", "node", "--input-type=module", "-e", command], undefined, 240_000); }
    catch { /* Self-deletion can close SSH. Authoritative inventory decides completion. */ }
    const fallback=await cleanupSwarmDeploymentFromBucket({state,directory,api:cli.api});
    state.archive=fallback.archive;await persist(directory,state);
  }
  const data = await cli.api("query SwarmCleanupVerify($id: String!) { project(id: $id) { services { edges { node { id } } } volumes { edges { node { id volumeInstances { edges { node { serviceId environmentId isPendingDeletion } } } } } } } }", { id: projectId });
  const inventory = z.object({ services: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string() }) })) }), volumes: z.object({ edges: z.array(z.object({ node: z.object({ id: z.string(), volumeInstances: z.object({ edges: z.array(z.object({ node: z.object({ serviceId: z.string().nullable(), environmentId: z.string(), isPendingDeletion: z.boolean() }) })) }) }) })) }) }).parse(data.project);
  const owned = [state.coordinator, state.worker].filter(value => value !== undefined);
  const remainingServiceIds = owned.filter(service => inventory.services.edges.some(edge => edge.node.id === service.id)).map(service => service.id);
  const pendingVolumeDeletionIds: string[] = [], remainingVolumeIds: string[] = [];
  for (const service of owned) {
    const volume = inventory.volumes.edges.find(edge => edge.node.id === service.volumeId)?.node;
    if (!volume) continue;
    const queued = volume.volumeInstances.edges.length > 0 && volume.volumeInstances.edges.every(edge => edge.node.environmentId === environmentId && edge.node.serviceId === null && edge.node.isPendingDeletion);
    (queued ? pendingVolumeDeletionIds : remainingVolumeIds).push(volume.id);
  }
  state.pendingVolumeDeletionIds = pendingVolumeDeletionIds;
  state.phase = remainingServiceIds.length || remainingVolumeIds.length ? "cleanup-incomplete" : "cleaned";
  await persist(directory, state);
  const billing = await inspectSwarmBilling({ root: options.root, railwayCli: options.railwayCli });
  await writeFile(path.join(directory, "billing-after.json"), JSON.stringify(billing, null, 2));
  return { phase: state.phase, remainingServiceIds, remainingVolumeIds, pendingVolumeDeletionIds, archive: state.archive,
    message: state.phase === "cleaned" ? "Recorded temporary services removed. Volumes are absent or queued for Railway's 48-hour recoverable deletion; artifact bucket retained." : "Cleanup needs attention. Evidence volumes may be retained because export failed; inspect the exact recorded IDs." };
}
