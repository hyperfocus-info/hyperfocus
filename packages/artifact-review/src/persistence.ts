import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createReviewStore } from "@hyperfocus/review-store";
import { artifactReviewSchema, type ArtifactManifest } from "./schema";

/** Match the host's authority without creating or opening its database. */
export async function resolveArtifactReviewDatabase(options: { manifestPath: string; databasePath?: string }) {
  const manifestPath = path.resolve(options.manifestPath);
  if (options.databasePath) return path.resolve(options.databasePath);
  const descriptor = Bun.file(path.join(path.dirname(manifestPath), "review-descriptor.json"));
  const declared = await descriptor.exists() ? await descriptor.json() : undefined;
  return declared?.manifestPath === manifestPath && typeof declared.databasePath === "string"
    ? path.resolve(declared.databasePath) : path.join(path.dirname(manifestPath), "feedback.sqlite");
}

export async function openArtifactReviews(options: { databasePath: string; manifestPath: string; manifest: ArtifactManifest }) {
  await mkdir(path.dirname(options.databasePath), { recursive: true });
  const database = new Database(options.databasePath);
  const store = createReviewStore({ database });
  const namespace = options.manifest.id;
  try {
    for (const item of options.manifest.items) {
      const identity = { namespace, assetId: item.id, version: String(item.version) };
      const existing = store.readAsset(identity);
      const { media, ...artifact } = item;
      const file = media ? Bun.file(path.resolve(path.dirname(options.manifestPath), media)) : null;
      const metadata = JSON.parse(JSON.stringify({ artifact, mediaType: file?.type || "text/plain;charset=utf-8" }));
      if (existing) {
        store.registerAsset({ ...identity, contentHash: item.sha256, metadata, content: existing.content ?? undefined });
      } else {
        const content = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(item.text || "");
        store.registerAsset({ ...identity, contentHash: item.sha256, metadata, content });
      }
    }
    migrateLegacy(database, store, namespace);
  } catch (error) { database.close(); throw error; }
  const identity = (id: string, version: string | number) => ({ namespace, assetId: id, version: String(version) });
  return {
    store, namespace,
    asset: (id: string, version: string | number) => store.readAsset(identity(id, version)),
    read(id: string, version: string | number) {
      const saved = store.readFeedback(identity(id, version));
      return saved ? { revision: saved.revision, updatedAt: saved.createdAt, review: saved.payload } : { revision: 0, updatedAt: null, review: null };
    },
    save(id: string, version: string | number, expectedRevision: number, review: unknown) {
      return store.saveFeedback({ ...identity(id, version), expectedRevision, payload: JSON.parse(JSON.stringify(review)) });
    },
    history(id: string) {
      return store.listVersions({ namespace, assetId: id }).map(asset => ({ version: asset.version, contentHash: asset.contentHash, createdAt: asset.createdAt, available: asset.content !== null,
        feedback: store.history({ namespace, assetId: id, version: asset.version }).map(entry => ({ revision: entry.revision, createdAt: entry.createdAt, review: entry.payload })) }));
    },
    close: () => database.close(),
  };
}

function migrateLegacy(database: Database, store: ReturnType<typeof createReviewStore>, namespace: string) {
  const exists = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='review_history'").get();
  if (!exists) return;
  database.exec("CREATE TABLE IF NOT EXISTS artifact_review_imports (campaign TEXT, item TEXT, revision INTEGER, PRIMARY KEY(campaign,item,revision))");
  const rows = database.query<{ item: string; revision: number; review: string }, [string]>("SELECT item,revision,review FROM review_history WHERE campaign=? ORDER BY item,revision").all(namespace);
  const migrate = database.transaction(() => {
    for (const row of rows) {
      if (database.query("SELECT 1 FROM artifact_review_imports WHERE campaign=? AND item=? AND revision=?").get(namespace, row.item, row.revision)) continue;
      const review = artifactReviewSchema.parse(JSON.parse(row.review));
      const identity = { namespace, assetId: row.item, version: String(review.version) };
      if (!store.readAsset(identity)) store.registerAsset({ ...identity, contentHash: review.sha256, metadata: { legacy: true, note: "Historical feedback; original asset bytes were not preserved by the old review host." } });
      const previous = store.readFeedback(identity);
      const result = store.saveFeedback({ ...identity, expectedRevision: previous?.revision || 0, payload: JSON.parse(JSON.stringify(review)) });
      if (result.status !== "saved") throw Error("Legacy feedback migration conflict");
      database.query("INSERT INTO artifact_review_imports VALUES(?,?,?)").run(namespace, row.item, row.revision);
    }
  });
  migrate();
}
