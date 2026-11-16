import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openArtifactReviews } from "@hyperfocus/artifact-review/persistence";
import { artifactManifestSchema } from "@hyperfocus/artifact-review/schema";

test("asset versions preserve bytes and old feedback, migrate once, and start new feedback empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-versions-"));
  const databasePath = join(dir, "feedback.sqlite"), manifestPath = join(dir, "manifest.json");
  const hash = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
  const item = { id: "idea", version: 1, kind: "text", title: "Idea", text: "first", sha256: hash("first"), sections: [] };
  const manifest = artifactManifestSchema.parse({ schemaVersion: 1, id: "campaign", title: "Review", items: [item] });
  const review = { version: 1, sha256: item.sha256, grade: "B", scores: {}, notes: "Original note", annotations: [] };
  const old = new Database(databasePath);
  old.exec("CREATE TABLE review_history(campaign TEXT,item TEXT,revision INTEGER,updated TEXT,review TEXT)");
  old.query("INSERT INTO review_history VALUES(?,?,?,?,?)").run("campaign", "idea", 1, "2026-01-01", JSON.stringify(review)); old.close();
  let host = await openArtifactReviews({ databasePath, manifestPath, manifest });
  try {
    expect(host.read("idea", 1).review).toEqual(review);
    expect(host.history("idea")[0]?.feedback).toHaveLength(1);
    host.close(); host = await openArtifactReviews({ databasePath, manifestPath, manifest });
    expect(host.history("idea")[0]?.feedback).toHaveLength(1);
    host.close();
    const updated = artifactManifestSchema.parse({ ...manifest, items: [{ ...item, version: 2, text: "second", sha256: hash("second") }] });
    host = await openArtifactReviews({ databasePath, manifestPath, manifest: updated });
    expect(host.read("idea", 2).review).toBeNull();
    expect(host.read("idea", 1).review).toEqual(review);
    expect(new TextDecoder().decode(host.asset("idea", 1)?.content!)).toBe("first");
    expect(host.save("idea", 2, 0, { ...review, version: 2, sha256: hash("second"), notes: "New note" }).status).toBe("saved");
    expect(host.history("idea")).toHaveLength(2);
    expect(host.history("idea")[0]?.feedback[0]?.review).toEqual(review);
  } finally { host.close(); await rm(dir, { recursive: true, force: true }); }
});
