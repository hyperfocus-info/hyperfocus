import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const laptopTopology = "laptop-coordinator-railway-workspaces";
const manifestSchema = z.object({ id: z.string().uuid(), topology: z.literal(laptopTopology), projectRoot: z.string(), projectId: z.string(),
  maximumUsd: z.number().positive().max(10), createdAt: z.string().datetime(), expiresAt: z.string().datetime(), requestHash: z.string() });
const settled = new Set(["AWAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "BLOCKED"]);

/** At most three attempts share one authorization and ledger, retaining separate evidence. */
export async function openHostedAttempt(options: { baseDirectory: string; attempt: number; id: string; projectRoot: string; projectId: string;
  maximumUsd: number; lifetimeMinutes: number; requestHash: string }) {
  if (![1, 2, 3].includes(options.attempt)) throw Error("At most three live attempts are authorized.");
  await mkdir(options.baseDirectory, { recursive: true });
  const lock = join(options.baseDirectory, "driver-owner.json");
  try { await writeFile(lock, JSON.stringify({ pid: process.pid, attempt: options.attempt }), { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST")
      throw Error("A driver ownership receipt already exists; concurrent attempts and automatic stale-owner recovery are forbidden.");
    throw error;
  }
  const release = () => unlink(lock);
  try {
    const file = join(options.baseDirectory, "manifest.json"); let manifest: z.infer<typeof manifestSchema>;
    try {
      manifest = manifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (manifest.id !== options.id || manifest.projectRoot !== options.projectRoot || manifest.projectId !== options.projectId || manifest.maximumUsd !== options.maximumUsd || manifest.requestHash !== options.requestHash)
        throw Error("Existing live receipt has a different request or budget; refusing to reset it.");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
      if (options.attempt !== 1) throw Error("A recovery attempt requires the original demonstration manifest.");
      manifest = manifestSchema.parse({ id: options.id, topology: laptopTopology, projectRoot: options.projectRoot, projectId: options.projectId,
        maximumUsd: options.maximumUsd, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + options.lifetimeMinutes * 60000).toISOString(), requestHash: options.requestHash });
      await writeFile(file, JSON.stringify(manifest, null, 2), { flag: "wx" });
    }
    if (Date.parse(manifest.expiresAt) <= Date.now() + 60000) throw Error("The original demonstration expiry leaves insufficient time for work and cleanup.");
    for (let previous = 1; previous < options.attempt; previous++) {
      const priorDirectory = previous === 1 ? options.baseDirectory : join(options.baseDirectory, `attempt-${previous}`);
      const prior = JSON.parse(await readFile(join(priorDirectory, "verification.json"), "utf8"));
      if (!settled.has(prior.status) || !prior.cleanup?.cleanupVerified || prior.coordinatorExitCode !== 0 || prior.bridgeExitCode !== 0)
        throw Error("A recovery attempt requires every preceding run to be terminal with confirmed coordinator, bridge and sandbox cleanup.");
    }
    const directory = options.attempt === 1 ? options.baseDirectory : join(options.baseDirectory, `attempt-${options.attempt}`);
    await mkdir(directory, { recursive: true });
    return { manifest, directory, release };
  } catch (error) { await release(); throw error; }
}
