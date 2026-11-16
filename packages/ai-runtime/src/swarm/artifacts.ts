import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { S3Client } from "bun";

export type SwarmArtifactRef = { sha256: string; bytes: number; name: string; mediaType: string; key: string };
export type SwarmArtifactStore = {
  put(options: { name: string; mediaType: string; bytes: Uint8Array }): Promise<SwarmArtifactRef>;
  read(options: { sha256: string }): Promise<Uint8Array>;
};
const defaultMaxBytes = 67_108_864;
function keyFor(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid artifact content hash.");
  return `sha256/${hash.slice(0, 2)}/${hash}`;
}
function describe(options: { name: string; mediaType: string; bytes: Uint8Array }, maximum: number) {
  if (!options.name || options.name.length > 1024 || /[\x00-\x1f]/.test(options.name)) throw new Error("Invalid artifact name.");
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(options.mediaType)) throw new Error("Invalid artifact media type.");
  if (options.bytes.byteLength > maximum) throw new Error("Artifact exceeds the configured byte limit.");
  const sha256 = createHash("sha256").update(options.bytes).digest("hex");
  return { sha256, bytes: options.bytes.byteLength, name: options.name, mediaType: options.mediaType, key: keyFor(sha256) };
}
function verify(bytes: Uint8Array, sha256: string, maximum: number) {
  if (bytes.byteLength > maximum || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("Artifact content failed integrity verification.");
  return bytes;
}

/** The containing host owns access control and attribution in its durable run metadata. */
export function createFileSwarmArtifactStore(options: { directory: string; maxBytes?: number }): SwarmArtifactStore {
  const root = resolve(options.directory), maximum = options.maxBytes ?? defaultMaxBytes;
  return {
    async put(input) {
      const bytes = new Uint8Array(input.bytes), ref = describe({ ...input, bytes }, maximum), path = join(root, ref.key);
      // Repeated command evidence often has identical bytes. Verify an existing
      // immutable object before allocating and syncing another staging file.
      try { verify(await readFile(path), ref.sha256, maximum); return ref; }
      catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      await mkdir(join(root, "sha256", ref.sha256.slice(0, 2)), { recursive: true });
      const staging = `${path}.${randomUUID()}.partial`;
      try {
        const file = await open(staging, "wx", 0o600);
        try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
        try { await link(staging, path); }
        catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
          verify(await readFile(path), ref.sha256, maximum);
        }
      } finally {
        await rm(staging, { force: true });
      }
      return ref;
    },
    async read({ sha256 }) { return verify(await readFile(join(root, keyFor(sha256))), sha256, maximum); },
  };
}

/** Railway Buckets use Bun's existing S3 adapter; credentials remain on the trusted host. */
export function createS3SwarmArtifactStore(options: { client: S3Client; prefix?: string; maxBytes?: number }): SwarmArtifactStore {
  const prefix = options.prefix ?? "swarm/", maximum = options.maxBytes ?? defaultMaxBytes;
  if (!/^[a-zA-Z0-9/_-]*$/.test(prefix)) throw new Error("Invalid artifact bucket prefix.");
  return {
    async put(input) {
      const bytes = new Uint8Array(input.bytes), ref = describe({ ...input, bytes }, maximum), file = options.client.file(prefix + ref.key);
      try {
        if (await file.exists()) verify(new Uint8Array(await file.arrayBuffer()), ref.sha256, maximum);
        else await file.write(bytes, { type: "application/octet-stream" });
      } catch { throw new Error("Durable artifact upload failed; bucket credential details suppressed."); }
      return ref;
    },
    async read({ sha256 }) {
      const key = keyFor(sha256);
      try { return verify(new Uint8Array(await options.client.file(prefix + key).arrayBuffer()), sha256, maximum); }
      catch { throw new Error("Durable artifact read failed integrity or storage checks."); }
    },
  };
}
