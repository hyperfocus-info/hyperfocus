import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { resolve } from "node:path";
import { inspectSwarmBilling } from "./billing";
import { parseArgs } from "node:util";
import { swarmSubscriptionProfiles } from "../../cli/src/swarm/reasoning/model-profiles";

export const swarmDeploymentPlan = {
  version: 2,
  mutation: false,
  persistentControl: {command:"--provision --service --allow-provision --allow-persistent-hosting",authorization:"Ongoing coordinator, private bridge and durable volume hosting is a separate commitment from worker compute.",lifecycle:"Control/auth/artifacts survive campaign completion. Workers retain automatic idle/max-age cleanup. The shared worker admission ledger stays capped across campaigns and restarts; it is never reset by a new run.",workerMaximumUsd:10,publicSite:"Existing coordinator /swarm; no additional dashboard service."},
  requiresAuthorization: ["Confirm temporary deployment fits remaining included usage or explicitly authorize incremental Railway charges within the $10 swarm ceiling", "Authenticate existing Codex ChatGPT subscription through remote device login only into the coordinator private /data/codex volume", "Create a temporary workspace-scoped API token at https://railway.com/account/tokens and store it only in the private SDK bridge", "Reuse the existing private bucket only under swarm/; preserve metadata before deleting temporary volumes"],
  inference: { agentId: "codex-cli", providerId: "codex-account", profiles: swarmSubscriptionProfiles(), codexVersion: "0.163.0", auth: "Shared Connections phone flow uses official Codex app-server device authorization; /data/codex private volume. No SSH or local auth copy.", separatelyBilledMaximumUsd: 0, apiFallback: false, authBakedIntoImage: false, authInSandboxes: false },
  project: { id: "13527ca6-cda6-4341-8d8a-9ab70d7bcdf5", name: "hyperfocus" },
  environment: { id: "e46fa18a-61c0-4cc4-9379-45b8dfde47a6", name: "production" },
  existingBucket: { id: "6d43edaa-e4e7-4030-8f49-804b03b834a1", name: "hyperfocus", prefix: "swarm/", preflight: "Require an existing instance in the approved environment and read its URL-style metadata before service creation; bucket creation or repair is separately authorized." },
  protectedExistingService: { id: "b2ca89d2-a1db-4b64-b6ee-d8ef8e43e04a", name: "pad-pilot", action: "none" },
  allowedProjects: { requireExplicitProjectIds: true, verifiedLocalHarnessProject: "959d56f6-7585-4e13-9eee-c8a2c6309ccc", editorProject: "editor-workspace", optionalRecipeCliAlias: "touch-of-death" },
  services: [
    { name: "hyperfocus-swarm-<demonstration-id-prefix>-coordinator", id: null, runtime: "Bun 1.4.3 + Codex 0.163.0 / Node 24.22.0", dockerfile: "apps/harness/swarm.Dockerfile", replicas: 1, cpu: 1, memoryGB: 4, volume: { providerCapacityMB: null, applicationStorageTargetGB: 1, resize: false, mount: "/data" }, publicDomain: "Temporary Railway HTTPS domain; scoped browser UI and authenticated owner API", health: "/health" },
    { name: "hyperfocus-swarm-<demonstration-id-prefix>-worker", id: null, runtime: "Node 24.22.0 + railway 3.16.0", dockerfile: "apps/swarm-worker/Dockerfile", replicas: 1, cpu: 1, memoryGB: 4, volume: { providerCapacityMB: null, applicationStorageTargetGB: 1, resize: false, mount: "/data" }, publicDomain: null, health: "/health" },
  ],
  temporaryHosting: {
    persistentIdleServices: false, proposedDeploymentMaximumHours: 2,
    status: "This plan creates no resources. The bridge enforces expiry and attempts verified evidence export before removing owned resources. Failed export stops compute and retains evidence volumes; local recovery independently verifies the bucket before cleanup. Actual deployment evidence belongs to docs/harness/swarm-live-demonstration.md.",
    cleanup: [
      "Stop new submissions, cancel remaining run tasks, and wait for owned operations to settle.",
      "Persist every artifact into existing bucket swarm/; export the run/task/message/evaluation metadata and checksum-verify the archive before destroying its only volume copy.",
      "Destroy every workspace recorded in the dedicated bridge registry; verify both registry and Railway sandbox inventory are empty for this deployment.",
      "Stop/remove deployments for the two newly created service IDs only; verify neither remains running. Never target pad-pilot.",
      "Verify Codex logout and removal of the owned auth store; retain its hashed cleanup receipt. Remove the temporary coordinator domain and only the two dedicated services/volumes after export verification. Railway may retain queued volume deletion/backups; do not claim physical erasure or server-side token revocation.",
      "Read workspace/project billing again; distinguish reported charges from estimates and confirm no orphaned execution resources remain.",
    ],
  },
  sandboxes: { maximum: 4, cpuEach: 2, memoryGBEach: 2, network: "ISOLATED", publicDomains: [], idleMinutes: 3, absoluteMaximumMinutes: 60, dedicatedPhysicalCpu: false },
  publicSite: { service: "coordinator", path: "/swarm", build: "bun apps/harness/scripts/swarm/build-site.ts", directory: "/app/apps/harness/dist/swarm-site", origin: "Generated coordinator HTTPS origin, or explicitly supplied --public-origin", authorization: "Owner CLI issues one-use run-scoped view/control links; HttpOnly cookie and CSRF protect subsequent browser operations", integrationAndSourceUpload: false, newServiceCount: 0, deploymentLifetimeExtended: false },
  cost: {
    basis: "Published Railway rates checked 2026-10-15; full-allocation estimates, not reported charges. Sandbox OS and filesystem cache count toward RAM. Egress/storage consume the same compute ceiling; Codex separately billed inference is disabled.",
    computeTargetUsd: [3, 5], maximumSwarmComputeUsd: 10,
    sharedAdmissionLedger: "Every sandbox creation/fork/probe reserves 65 minutes at full assigned CPU/RAM (60-minute lifetime plus cleanup margin); reservations persist after cleanup and restart. $1 is reserved for service hosting and egress. Admission stops at the demonstration ceiling or expiry.",
    chargeLimitCaveat: "This is an estimated hard admission limit, not a provider-enforced charge guarantee. Railway provides no configured per-sandbox egress billing cap; usage reporting can lag. No workspace-wide limit is changed.",
    maximumAllocatedSandboxUsdPerHour: 1.1111111111111112,
    maximumAllocatedServicesUsdPerHour: 0.16666666666666666,
    maximumAllocatedServicesUsdForTwoHours: 0.3333333333333333,
    volumeUsdPerGBMonth: 0.15,
    artifactUsdPerGBMonth: 0.015,
    egressUsdPerGB: 0.05,
    lastReadOnlyBillingSnapshot: { capturedAt: "2026-10-16T01:12:14.344Z", plan: "PRO", cycleEnd: "2026-10-26T01:14:49Z", includedUsageUsd: 20, workspaceUsageUsd: 3.439030359179506, calculatedRemainingUsd: 16.560969640820495, projectedExistingUsageUsd: 5.399130668557245, additionalPurchasedCreditsUsd: 0 },
    creditCaveat: "Pro upgrade verified: about $16.56 shared included usage remains, covering the $10 admission ceiling at this snapshot. Unrelated workloads continue consuming it. Refresh --billing before provisioning. Pro resource entitlements are not requested allocations; worker counts and CPU/RAM caps stay small.",
    source: ["https://docs.railway.com/sandboxes#pricing", "https://docs.railway.com/pricing/plans", "https://docs.railway.com/storage-buckets"],
  },
  settings: {
    shared: ["SWARM_DEMONSTRATION_ID=<generated UUID>", "SWARM_DEMONSTRATION_EXPIRES_AT=<absolute ISO deadline at most two hours>", "SWARM_DEMONSTRATION_MAX_USD=10"],
    publicBrowser: ["SWARM_PUBLIC_ORIGIN=<exact generated HTTPS coordinator origin or approved --public-origin>", "SWARM_SITE_DIR=/app/apps/harness/dist/swarm-site"],
    coordinator: ["SWARM_DATA_DIR=/data", "SWARM_BACKEND=railway", "CODEX_HOME=/data/codex", "SWARM_SERVICE_TOKEN=<new 32+ character secret>", "SWARM_WORKER_TOKEN=<bridge shared secret>", "SWARM_WORKER_URL=http://<generated worker service name>.railway.internal:8080", "SWARM_PROJECT_IDS=<explicit allowed project IDs>", "SWARM_MODEL_PROFILES=<verified planning/implementation/review Codex subscription profiles>", "SWARM_MAX_COMPUTE_USD=9", "SWARM_MAX_MODEL_USD=0", "SWARM_S3_BUCKET=<bucket BUCKET reference>", "SWARM_S3_ENDPOINT=<bucket ENDPOINT reference>", "SWARM_S3_ACCESS_KEY_ID=<bucket ACCESS_KEY_ID reference>", "SWARM_S3_SECRET_ACCESS_KEY=<bucket SECRET_ACCESS_KEY reference>", "SWARM_S3_REGION=<bucket REGION reference>", "SWARM_S3_URL_STYLE=<path or virtual-hosted from verified bucket metadata>"],
    worker: ["SWARM_WORKER_DATA_DIR=/data", "SWARM_WORKER_TOKEN=<same bridge shared secret>", "RAILWAY_API_TOKEN=<workspace-scoped sandbox/API token>", "RAILWAY_ENVIRONMENT_ID=<Railway injected environment>", "SWARM_COORDINATOR_TOKEN=<coordinator shared secret for durable teardown export>", "SWARM_TEMPORARY_DEPLOYMENT=<generated exact service/volume ownership manifest>", "SWARM_ALLOWED_REPOSITORIES=<exact HTTPS allowlist; empty allows authenticated uploaded bundles only>"],
    localHosts: ["HYPERFOCUS_SWARM_URL=https://<coordinator domain>", "HYPERFOCUS_SWARM_TOKEN=<coordinator shared secret>"],
  },
  accountWideLimits: "Unchanged. The user prohibited workspace-wide limit changes; the $10 ceiling belongs only to this swarm.",
  configuration: "provision.ts applies explicit Dockerfile paths, health/restart policy and CPU/RAM limits through the Railway API for only the two recorded services. New services cannot opt into legacy Config as Code. No whole-project IaC reconciliation is performed.",
} as const;

export async function swarmDeploymentPreflight(options: { railwayCli?: string; root?: string } = {}) {
  const root = options.root ?? resolve(import.meta.dir, "../../../..");
  const files = ["apps/harness/swarm.Dockerfile", "apps/harness/swarm.Dockerfile.dockerignore", "apps/harness/scripts/swarm/build-site.ts", "apps/harness/ui/src/components/swarm/main.tsx", "apps/swarm-worker/Dockerfile", "apps/swarm-worker/Dockerfile.dockerignore", "apps/swarm-worker/deployment/package-lock.json", "apps/harness/scripts/swarm/provision.ts", "bun.lock"];
  const configuration = await Promise.all(files.map(async file => ({ file, present: await Bun.file(resolve(root, file)).exists() })));
  const configured = ["SWARM_SERVICE_TOKEN", "SWARM_WORKER_TOKEN", "RAILWAY_API_TOKEN", "SWARM_MODEL_PROFILES", "CODEX_HOME"].map(name => ({ name, present: Boolean(process.env[name]) }));
  let cloud: unknown = { inspected: false };
  let artifactStorage: unknown = { inspected: false };
  const cli = options.railwayCli ?? Bun.which("railway");
  if (cli) {
    const child = spawnBackgroundProcess({ cmd: [cli, "status", "--project", swarmDeploymentPlan.project.id, "--environment", swarmDeploymentPlan.environment.id, "--json"], cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000, maxBuffer: 1_048_576 });
    const [stdout, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code) cloud = { inspected: false, error: `Read-only Railway discovery failed (${code}). Credential details suppressed.` };
    else {
      const data = JSON.parse(stdout);
      cloud = { inspected: true, projectId: data.id, projectName: data.name, environments: data.environments?.edges?.map((edge: any) => ({ id: edge.node.id, name: edge.node.name, canAccess: edge.node.canAccess })), services: data.services?.edges?.map((edge: any) => ({ id: edge.node.id, name: edge.node.name })), buckets: data.buckets?.edges?.map((edge: any) => ({ id: edge.node.id, name: edge.node.name })) };
    }
  }
  if (cli) {
    try {
      const { inspectSwarmDeploymentBucket } = await import("./provision");
      artifactStorage = { inspected: true, available: true, ...await inspectSwarmDeploymentBucket({ root, railwayCli: cli }) };
    } catch (error) { artifactStorage = { inspected: true, available: false, reason: error instanceof Error ? error.message : "Bucket preflight failed." }; }
  }
  return { configuration, configured, cloud, artifactStorage, mutationsPerformed: [], executionVerifiedByThisCheck: false };
}

if (import.meta.main) {
  const { values } = parseArgs({ args: process.argv.slice(2), strict: true, options: {
    plan: { type: "boolean" }, preflight: { type: "boolean" }, billing: { type: "boolean" },
    provision: { type: "boolean" }, "allow-provision": { type: "boolean" }, "allow-incremental-charges": { type: "boolean" },
    update:{type:"string"},"coordinator-only":{type:"boolean"},
    service:{type:"boolean"},"allow-persistent-hosting":{type:"boolean"},
    cleanup: { type: "string" }, "allow-cleanup": { type: "boolean" }, inspect: { type: "string" }, auth: { type: "string" }, ready: { type: "string" },
    "railway-cli": { type: "string" }, "credential-id": { type: "string" }, "max-usd": { type: "string" }, "lifetime-minutes": { type: "string" },
    "project-ids": { type: "string" }, "public-origin": { type: "string" },
    "demonstration-id": { type: "string" },
    "retry-bootstrap": { type: "boolean" },
    "cleanup-credentials": { type: "string" }, "allow-credential-cleanup": { type: "boolean" },
  } });
  if ([values.plan, values.preflight, values.billing, values.provision, values.update, values.cleanup, values.inspect, values.auth, values.ready, values["cleanup-credentials"]].filter(Boolean).length > 1) throw new Error("Choose one deployment operation.");
  if (values["retry-bootstrap"] && !values.provision) throw new Error("--retry-bootstrap requires --provision.");
  const root = resolve(import.meta.dir, "../../../.."), railwayCli = values["railway-cli"] ?? Bun.which("railway") ?? undefined;
  if (values["cleanup-credentials"]) {
    const { cleanupSwarmSshCredential } = await import("./credentials/credential-cleanup");
    console.log(JSON.stringify(await cleanupSwarmSshCredential({ root, demonstrationId: values["cleanup-credentials"], allowCleanup: values["allow-credential-cleanup"] ?? false }), null, 2));
  } else if (values.preflight) console.log(JSON.stringify(await swarmDeploymentPreflight({ railwayCli, root }), null, 2));
  else if (values.billing) {
    let serviceIds:string[]|undefined;
    if(values["demonstration-id"]) {
      const { z }=await import("zod");
      const id=z.string().uuid().parse(values["demonstration-id"]);
      const receipt=await Bun.file(resolve(root,".local/swarm/deployments",id,"deployment.json")).json();
      serviceIds=[receipt.coordinator?.id,receipt.worker?.id].filter(Boolean).map(value=>z.string().uuid().parse(value));
    }
    console.log(JSON.stringify(await inspectSwarmBilling({ railwayCli, root,serviceIds }), null, 2));
  }
  else if (values.ready) {
    const { verifySwarmDeploymentReady } = await import("./provision");
    console.log(JSON.stringify(await verifySwarmDeploymentReady({ root, id: values.ready }), null, 2));
  } else if(values.update){
    if(!railwayCli)throw Error("Provide --railway-cli.");
    const {updateSwarmDeployment}=await import("./provision");
    console.log(JSON.stringify(await updateSwarmDeployment({root,id:values.update,railwayCli,allowProvision:values["allow-provision"]??false,coordinatorOnly:values["coordinator-only"],projectIds:values["project-ids"]?.split(",")}),null,2));
  } else if (values.provision || values.cleanup || values.inspect || values.auth) {
    if (!railwayCli) throw new Error("Provide --railway-cli <executable>.");
    if (values["credential-id"]) {
      if (!values.provision) throw Error("--credential-id is only used for provisioning.");
      const { readSwarmRailwayCredential, verifySwarmRailwayCredential } = await import("./credentials/credential");
      const token = await readSwarmRailwayCredential({ root, demonstrationId: values["credential-id"] });
      await verifySwarmRailwayCredential({ token });
      process.env.SWARM_RAILWAY_API_TOKEN = token;
    }
    const commands = await import("./provision");
    const result = values.provision ? await commands.provisionSwarmDeployment({ root, railwayCli,
      allowProvision: values["allow-provision"] ?? false, allowIncrementalCharges: values["allow-incremental-charges"],
      hostingMode:values.service?"service":"temporary",allowPersistentHosting:values["allow-persistent-hosting"],
      projectIds: values["project-ids"]?.split(","),
      publicOrigin: values["public-origin"],
      demonstrationId: values["demonstration-id"],
      retryBootstrap: values["retry-bootstrap"],
      maximumUsd: values["max-usd"] === undefined ? undefined : Number(values["max-usd"]),
      lifetimeMinutes: values["lifetime-minutes"] === undefined ? undefined : Number(values["lifetime-minutes"]) })
      : values.cleanup ? await commands.cleanupSwarmDeployment({ root, railwayCli, id: values.cleanup, allowCleanup: values["allow-cleanup"] ?? false })
      : await commands.inspectSwarmDeployment({ root, railwayCli, id: values.inspect ?? values.auth! });
    console.log(JSON.stringify(result, null, 2));
  } else console.log(JSON.stringify(swarmDeploymentPlan, null, 2));
}
