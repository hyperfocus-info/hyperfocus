import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { artifactManifestSchema } from "./schema";
import { resolveArtifactReviewDatabase } from "./persistence";

/** Read-only preflight: cached availability never substitutes for valid source paths. */
export async function inspectArtifactIntegrity(options: { manifestPath: string; databasePath?: string }) {
  const manifestPath = resolve(options.manifestPath);
  const manifest = artifactManifestSchema.parse(await Bun.file(manifestPath).json());
  const databasePath = await resolveArtifactReviewDatabase({ manifestPath, databasePath: options.databasePath });
  const database = await Bun.file(databasePath).exists() ? new Database(databasePath, { readonly: true }) : undefined;
  try {
    const cache = database?.query("SELECT name FROM sqlite_master WHERE type='table' AND name='hf_review_assets'").get()
      ? database.query<{ content_hash: string; content: Uint8Array | null }, [string, string, string]>(
        "SELECT content_hash, content FROM hf_review_assets WHERE namespace=? AND asset_id=? AND version=?") : undefined;
    const items = [];
    for (const item of manifest.items) {
      const media = item.media ? resolve(dirname(manifestPath), item.media) : undefined;
      const sourceBytes = item.kind === "text" ? new TextEncoder().encode(item.text ?? "")
        : media && await Bun.file(media).exists() ? new Uint8Array(await Bun.file(media).arrayBuffer()) : undefined;
      const sourceHash = sourceBytes === undefined ? undefined : createHash("sha256").update(sourceBytes).digest("hex");
      const source = sourceHash === undefined ? "missing" : sourceHash === item.sha256 ? "valid" : "mismatch";
      const stored = cache?.get(manifest.id, item.id, String(item.version));
      const cacheHash = stored?.content ? createHash("sha256").update(stored.content).digest("hex") : undefined;
      const cached = !database ? "unavailable" : !stored ? "missing" : stored.content === null ? "metadata-only"
        : stored.content_hash === item.sha256 && cacheHash === item.sha256 ? "valid" : "mismatch";
      items.push({ id: item.id, version: item.version, sha256: item.sha256, media, source, sourceHash, cached, cacheHash });
    }
    const sourceFailures = items.filter(item => item.source !== "valid").length;
    const cacheFailures = items.filter(item => item.cached === "mismatch").length;
    return { manifestPath, databasePath, campaign: manifest.id, passed: sourceFailures === 0 && cacheFailures === 0,
      summary: { items: items.length, sourceFailures, cacheFailures,
        cachedItems: items.filter(item => item.cached === "valid").length,
        availableItems: items.filter(item => item.source === "valid" || item.cached === "valid").length }, items };
  } finally { database?.close(); }
}
