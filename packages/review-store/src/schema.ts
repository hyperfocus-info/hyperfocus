import { upgradeSqliteValues } from "@hyperfocus/serialization/sqlite";
import type { Database } from "bun:sqlite";
import { readStoredValue } from "@hyperfocus/serialization";

export function initialize(database: Database, encoding: "json" | "protobuf" = "json") {
  database.exec(`
    CREATE TABLE IF NOT EXISTS hf_review_assets (
      namespace TEXT NOT NULL, asset_id TEXT NOT NULL, version TEXT NOT NULL,
      content_hash TEXT NOT NULL, metadata TEXT NOT NULL, content BLOB,
      created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, asset_id, version)
    );
    CREATE TABLE IF NOT EXISTS hf_review_feedback (
      namespace TEXT NOT NULL, asset_id TEXT NOT NULL, version TEXT NOT NULL,
      reviewer_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
      payload TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (namespace, asset_id, version, reviewer_id, revision),
      FOREIGN KEY (namespace, asset_id, version)
        REFERENCES hf_review_assets(namespace, asset_id, version)
    );
  `);
  if (encoding === "protobuf") upgradeSqliteValues(database, [
    { table: "hf_review_assets", column: "metadata" }, { table: "hf_review_feedback", column: "payload" },
  ]);
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type AssetIdentity = { namespace: string; assetId: string; version: string };
export type FeedbackFilter = { namespace: string; assetId?: string; version?: string; reviewerId?: string };
export type AssetRow = {
  namespace: string; asset_id: string; version: string; content_hash: string;
  metadata: Uint8Array | string; content: Uint8Array | null; created_at: string;
};
export type FeedbackRow = {
  namespace: string; asset_id: string; version: string; reviewer_id: string;
  revision: number; payload: Uint8Array | string; created_at: string;
};


export function identity(value: AssetIdentity) {
  for (const part of [value.namespace, value.assetId, value.version]) {
    if (typeof part !== "string" || !part.trim()) throw new Error("Review identity fields must be nonempty strings");
  }
  return [value.namespace, value.assetId, value.version] as const;
}

export function asset(row: AssetRow) {
  return {
    namespace: row.namespace, assetId: row.asset_id, version: row.version,
    contentHash: row.content_hash, metadata: readStoredValue(row.metadata),
    content: row.content, createdAt: row.created_at,
  };
}

export function feedback(row: FeedbackRow) {
  return {
    namespace: row.namespace, assetId: row.asset_id, version: row.version,
    reviewerId: row.reviewer_id, revision: row.revision,
    payload: readStoredValue(row.payload), createdAt: row.created_at,
  };
}
