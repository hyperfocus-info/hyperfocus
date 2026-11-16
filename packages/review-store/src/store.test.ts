import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReviewStore } from "./store";
import { initialize } from "./schema";

const key = { namespace: "marketing", assetId: "clip", version: "v1" };
const bytes = new TextEncoder().encode("original media");
const original = { ...key, content: bytes, contentHash: createHash("sha256").update(bytes).digest("hex"), metadata: { title: "Original" } };

test("legacy JSON rows migrate atomically to protobuf blobs without changing history", () => {
  const db = new Database(":memory:");
  try {
    initialize(db);
    db.query("INSERT INTO hf_review_assets VALUES (?, ?, ?, ?, ?, ?, ?)").run("test", "asset", "v1", "hash", '{"title":"legacy"}', null, "then");
    db.query("INSERT INTO hf_review_feedback VALUES (?, ?, ?, ?, ?, ?, ?)").run("test", "asset", "v1", "owner", 1, "invalid", "then");
    expect(() => createReviewStore({ database: db, encoding: "protobuf" })).toThrow();
    expect(db.query("SELECT typeof(metadata) AS kind FROM hf_review_assets").get()).toEqual({ kind: "text" });
    db.query("UPDATE hf_review_feedback SET payload=?").run('{"grade":"B"}');
    const store = createReviewStore({ database: db, encoding: "protobuf" });
    expect(db.query("SELECT typeof(metadata) AS kind FROM hf_review_assets").get()).toEqual({ kind: "blob" });
    expect(db.query("SELECT typeof(payload) AS kind FROM hf_review_feedback").get()).toEqual({ kind: "blob" });
    expect(store.history({ namespace: "test" })).toMatchObject([{ revision: 1, createdAt: "then", payload: { grade: "B" } }]);
    expect(store.registerAsset({ namespace: "test", assetId: "asset", version: "v1", contentHash: "hash", metadata: { title: "legacy" } }).metadata).toEqual({ title: "legacy" });
  } finally { db.close(); }
});

test("feedback revisions and annotations remain attached to immutable media versions", () => {
  const database = new Database(":memory:");
  try {
    const store = createReviewStore({ database });
    expect(store.hasAsset(key)).toBe(false);
    store.registerAsset(original);
    expect(database.query("SELECT typeof(metadata) AS kind FROM hf_review_assets").get()).toEqual({ kind: "text" });
    expect(store.hasAsset(key)).toBe(true);
    expect(store.hasAsset({ ...key, version: "missing" })).toBe(false);
    expect(store.hasAsset({ ...key, namespace: "other" })).toBe(false);
    const first = store.saveFeedback({ ...key, expectedRevision: 0, payload: { grade: "C", notes: [{ start: 2, end: 5, text: "Too slow" }] } });
    expect(first.status).toBe("saved");
    store.saveFeedback({ ...key, expectedRevision: 1, payload: { grade: "D", notes: [] } });
    store.registerAsset({ ...original, version: "v2" });
    expect(store.readFeedback({ ...key, version: "v2" })).toBeNull();
    expect(store.history({ namespace: key.namespace })).toHaveLength(2);
    expect(store.history({ namespace: key.namespace })[0]?.payload).toEqual({ grade: "C", notes: [{ start: 2, end: 5, text: "Too slow" }] });
    expect(store.listFeedback({ namespace: key.namespace })).toHaveLength(1);
    expect(store.readFeedback(key)?.revision).toBe(2);
    expect(() => store.registerAsset({ ...original, metadata: { title: "Changed" } })).toThrow("immutable");
    expect(() => store.registerAsset({ ...original, content: new Uint8Array([1]) })).toThrow("hash");
    const changed = new TextEncoder().encode("different media");
    expect(() => store.registerAsset({ ...original, content: changed, contentHash: createHash("sha256").update(changed).digest("hex") })).toThrow("immutable");
    expect(() => store.registerAsset({ ...original, content: undefined })).toThrow("immutable");
    expect(store.registerAsset(original).content).toEqual(bytes);
  } finally { database.close(); }
});

test("separate connections reject stale writes and retain all data after reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "hf-review-"));
  const filename = join(directory, "reviews.sqlite");
  const firstDb = new Database(filename);
  const secondDb = new Database(filename);
  try {
    const first = createReviewStore({ database: firstDb });
    const second = createReviewStore({ database: secondDb });
    first.registerAsset(original);
    expect(first.saveFeedback({ ...key, expectedRevision: 0, payload: "first" }).status).toBe("saved");
    expect(second.saveFeedback({ ...key, expectedRevision: 0, payload: "stale" })).toMatchObject({ status: "conflict", feedback: { payload: "first", revision: 1 } });
    expect(second.saveFeedback({ ...key, expectedRevision: 1, payload: "second" }).status).toBe("saved");
  } finally { firstDb.close(); secondDb.close(); }
  const reopenedDb = new Database(filename);
  try {
    const reopened = createReviewStore({ database: reopenedDb });
    expect(reopened.readAsset(key)?.content).toEqual(bytes);
    expect(reopened.readFeedback(key)?.payload).toBe("second");
    expect(reopened.history({ namespace: key.namespace }).map((item) => item.revision)).toEqual([1, 2]);
  } finally {
    reopenedDb.close();
    rmSync(directory, { recursive: true });
  }
});

test("namespaces and reviewers are isolated; unknown versions and invalid payloads cannot save", () => {
  const database = new Database(":memory:");
  try {
    const store = createReviewStore({ database });
    expect(() => store.saveFeedback({ ...key, expectedRevision: 0, payload: {} })).toThrow("Register");
    store.registerAsset(original);
    store.registerAsset({ ...original, namespace: "evaluator" });
    store.saveFeedback({ ...key, expectedRevision: 0, payload: null });
    store.saveFeedback({ ...key, reviewerId: "second", expectedRevision: 0, payload: [] });
    expect(store.readFeedback({ ...key, namespace: "evaluator" })).toBeNull();
    expect(store.listFeedback({ namespace: key.namespace })).toHaveLength(2);
    expect(() => store.saveFeedback({ ...key, expectedRevision: -1, payload: {} })).toThrow("expectedRevision");
    expect(() => store.saveFeedback({ ...key, expectedRevision: 1, payload: NaN })).toThrow("finite JSON");
    expect(store.history({ namespace: key.namespace, reviewerId: "owner" })).toHaveLength(1);
  } finally { database.close(); }
});

test("host transaction can atomically roll back asset and feedback registration", () => {
  const database = new Database(":memory:");
  try {
    const store = createReviewStore({ database });
    expect(() => database.transaction(() => {
      store.registerAsset(original);
      store.saveFeedback({ ...key, expectedRevision: 0, payload: "atomic" });
      throw new Error("host rollback");
    })()).toThrow("host rollback");
    expect(store.listVersions({ namespace: key.namespace })).toEqual([]);
    expect(store.history({ namespace: key.namespace })).toEqual([]);
  } finally { database.close(); }
});
