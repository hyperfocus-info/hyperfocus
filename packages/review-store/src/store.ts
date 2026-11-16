import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import { asset, feedback, identity, initialize } from "./schema";
import { encodeStorageValue, normalizeValue } from "@hyperfocus/serialization";
import type { AssetIdentity, AssetRow, FeedbackFilter, FeedbackRow, JsonValue } from "./schema";

/** The host owns connection lifecycle, authentication, and domain payload validation. */
export function createReviewStore({ database, encoding = "json" }: { database: Database; encoding?: "json" | "protobuf" }) {
  initialize(database, encoding);
  const encode = (value: unknown) => encodeStorageValue(normalizeValue(value), { encoding });

  function readAsset(options: AssetIdentity) {
    const row = database.query<AssetRow, [string, string, string]>(
      "SELECT * FROM hf_review_assets WHERE namespace=? AND asset_id=? AND version=?",
    ).get(...identity(options));
    return row ? asset(row) : null;
  }

  function hasAsset(options: AssetIdentity) {
    return database.query<{ present: number }, [string, string, string]>(
      "SELECT 1 AS present FROM hf_review_assets WHERE namespace=? AND asset_id=? AND version=?",
    ).get(...identity(options)) !== null;
  }

  function registerAsset(options: AssetIdentity & {
    contentHash: string; metadata: JsonValue; content?: Uint8Array;
  }) {
    const key = identity(options);
    if (!options.contentHash.trim()) throw new Error("An asset content hash is required");
    if (options.content && createHash("sha256").update(options.content).digest("hex") !== options.contentHash) {
      throw new Error("Asset bytes do not match their SHA-256 content hash");
    }
    const metadata = encode(options.metadata);
    return database.transaction(() => {
      const existing = readAsset(options);
      if (existing) {
        const sameContent = options.content === undefined
          ? existing.content === null
          : existing.content !== null && Buffer.from(existing.content).equals(options.content);
        if (existing.contentHash !== options.contentHash || !Buffer.from(encode(existing.metadata)).equals(Buffer.from(metadata)) || !sameContent) {
          throw new Error("Asset versions are immutable; register a new version");
        }
        return existing;
      }
      database.query(`INSERT INTO hf_review_assets
        (namespace, asset_id, version, content_hash, metadata, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(...key, options.contentHash, metadata, options.content ?? null, new Date().toISOString());
      const created = readAsset(options);
      if (!created) throw new Error("Asset registration failed");
      return created;
    }).immediate();
  }

  function listVersions({ namespace, assetId }: { namespace: string; assetId?: string }) {
    return database.query<AssetRow, [string, string | null, string | null]>(
      "SELECT * FROM hf_review_assets WHERE namespace=? AND (? IS NULL OR asset_id=?) ORDER BY created_at, rowid",
    ).all(namespace, assetId ?? null, assetId ?? null).map(asset);
  }

  function readFeedback(options: AssetIdentity & { reviewerId?: string }) {
    const row = database.query<FeedbackRow, [string, string, string, string]>(`
      SELECT * FROM hf_review_feedback WHERE namespace=? AND asset_id=? AND version=? AND reviewer_id=?
      ORDER BY revision DESC LIMIT 1`).get(...identity(options), options.reviewerId ?? "owner");
    return row ? feedback(row) : null;
  }

  function saveFeedback(options: AssetIdentity & {
    reviewerId?: string; expectedRevision: number; payload: JsonValue;
  }) {
    const key = identity(options);
    const reviewer = options.reviewerId ?? "owner";
    if (!reviewer.trim()) throw new Error("A reviewer identity is required");
    if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0) {
      throw new Error("expectedRevision must be a nonnegative integer");
    }
    const payload = encode(options.payload);
    return database.transaction(() => {
      if (!hasAsset(options)) throw new Error("Register the asset version before saving feedback");
      const current = readFeedback(options);
      if ((current?.revision ?? 0) !== options.expectedRevision) {
        return { status: "conflict" as const, feedback: current };
      }
      database.query(`INSERT INTO hf_review_feedback
        (namespace, asset_id, version, reviewer_id, revision, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(...key, reviewer, options.expectedRevision + 1, payload, new Date().toISOString());
      const saved = readFeedback(options);
      if (!saved) throw new Error("Feedback save failed");
      return { status: "saved" as const, feedback: saved };
    }).immediate();
  }

  function history(options: FeedbackFilter) {
    return database.query<FeedbackRow, [string, string | null, string | null, string | null, string | null, string | null, string | null]>(`
      SELECT * FROM hf_review_feedback WHERE namespace=?
      AND (? IS NULL OR asset_id=?) AND (? IS NULL OR version=?) AND (? IS NULL OR reviewer_id=?)
      ORDER BY rowid`).all(options.namespace, options.assetId ?? null, options.assetId ?? null,
        options.version ?? null, options.version ?? null, options.reviewerId ?? null, options.reviewerId ?? null).map(feedback);
  }

  function listFeedback(options: FeedbackFilter) {
    const latest = new Map<string, ReturnType<typeof feedback>>();
    for (const item of history(options)) latest.set(JSON.stringify([item.assetId, item.version, item.reviewerId]), item);
    return [...latest.values()];
  }

  return { registerAsset, readAsset, hasAsset, listVersions, saveFeedback, readFeedback, listFeedback, history };
}

export type ReviewStore = ReturnType<typeof createReviewStore>;
export type AssetVersion = NonNullable<ReturnType<ReviewStore["readAsset"]>>;
export type FeedbackRevision = NonNullable<ReturnType<ReviewStore["readFeedback"]>>;
