import type { S3Client } from "bun";
import path from "node:path";
import { z } from "zod";
import { createFileSwarmArtifactStore, createS3SwarmArtifactStore, createSwarmS3Client, type SwarmArtifactStore } from "@hyperfocus/ai-runtime/swarm";

const requiredSettings = ["SWARM_S3_BUCKET", "SWARM_S3_ENDPOINT", "SWARM_S3_ACCESS_KEY_ID", "SWARM_S3_SECRET_ACCESS_KEY", "SWARM_S3_URL_STYLE"] as const;
const bucketSettingsSchema = z.object({ bucket: z.string().min(1), endpoint: z.string().url(), accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1),
  region: z.string().min(1), urlStyle: z.enum(["path", "virtual-hosted"]) });
const maxBytes = 268435456;
const repair = "Verify that the existing bucket has an instance in this Railway environment, repair its SWARM_S3_* references, and redeploy the coordinator. Cloud execution is disabled until durable storage is available.";

/** Deployed coordinators require cloud durability; an explicit laptop host owns durable local artifacts. */
export function createSwarmServiceStorage(options: { backend: string; directory: string; environment?: Record<string, string | undefined> }) {
  const env = options.environment ?? process.env;
  const missing = requiredSettings.filter(name => !env[name]?.trim() || env[name]?.includes("${{"));
  const laptop = env.SWARM_COORDINATOR_TOPOLOGY === "laptop" && !env.RAILWAY_PROJECT_ID;
  const cloud = options.backend === "railway" && !laptop || Boolean(env.RAILWAY_PROJECT_ID);
  const configured = requiredSettings.some(name => Boolean(env[name]?.trim()));
  let bucket: S3Client | undefined, artifacts: SwarmArtifactStore;
  let configurationError: string | undefined;
  if (missing.length && (cloud || configured)) {
    configurationError = `Durable artifact storage is not configured: ${missing.join(", ")} are missing or unresolved. ${repair}`;
  } else if (!missing.length) {
    try {
      bucket = createSwarmS3Client(bucketSettingsSchema.parse({ bucket: env.SWARM_S3_BUCKET, endpoint: env.SWARM_S3_ENDPOINT, accessKeyId: env.SWARM_S3_ACCESS_KEY_ID,
        secretAccessKey: env.SWARM_S3_SECRET_ACCESS_KEY, region: env.SWARM_S3_REGION?.trim() || "auto", urlStyle: env.SWARM_S3_URL_STYLE }));
    } catch { configurationError = `Durable artifact storage settings are invalid. ${repair}`; }
  }
  if (configurationError) {
    const reason = configurationError;
    artifacts = { async put() { throw Error(reason); }, async read() { throw Error(reason); } };
  } else {
    artifacts = bucket ? createS3SwarmArtifactStore({ client: bucket, prefix: "swarm/", maxBytes })
      : createFileSwarmArtifactStore({ directory: path.join(options.directory, "artifacts"), maxBytes });
  }
  let verifiedUntil = 0;
  let checking: Promise<{ available: boolean; reason?: string }> | undefined;
  async function ready() {
    if (configurationError) return { available: false, reason: configurationError };
    if (!bucket || Date.now() < verifiedUntil) return { available: true };
    checking ??= (async () => {
      try {
        const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, purpose: "durable-storage-preflight", demonstrationId: env.SWARM_DEMONSTRATION_ID ?? null }));
        const ref = await artifacts.put({ name: "durable-storage-preflight.json", mediaType: "application/json", bytes });
        const restored = await artifacts.read({ sha256: ref.sha256 });
        if (!Buffer.from(restored).equals(Buffer.from(bytes))) throw Error("Storage preflight content differs.");
        verifiedUntil = Date.now() + 60000;
        return { available: true };
      } catch { return { available: false, reason: `Durable artifact storage failed its write/read integrity check. ${repair}` }; }
    })().finally(() => { checking = undefined; });
    return checking;
  }
  return { bucket, artifacts, ready };
}
