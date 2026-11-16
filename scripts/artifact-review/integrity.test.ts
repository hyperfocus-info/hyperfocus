import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArtifactManifest } from "@hyperfocus/artifact-review/create";
import { inspectArtifactIntegrity } from "@hyperfocus/artifact-review/integrity";
import { openArtifactReviews } from "@hyperfocus/artifact-review/persistence";

test("integrity distinguishes missing/changed sources from immutable cached bytes without writing feedback", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-integrity-"));
  try {
    const media = join(root, "capture.png"), manifestPath = join(root, "manifest.json"), databasePath = join(root, "feedback.sqlite");
    await Bun.write(media, "original capture");
    const manifest = await createArtifactManifest({ id: "audit", title: "Audit", items: [{ id: "capture", title: "Capture", kind: "image", media }] });
    await Bun.write(manifestPath, JSON.stringify(manifest));
    const uncached = await inspectArtifactIntegrity({ manifestPath });
    expect(uncached.passed).toBe(true);
    expect(uncached.items[0]?.cached).toBe("unavailable");
    expect(await Bun.file(databasePath).exists()).toBe(false);
    const host = await openArtifactReviews({ manifestPath, databasePath, manifest });
    const feedback = { grade: "B", notes: "Retain this exact capture" };
    host.save("capture", 1, 0, feedback); host.close();
    const databaseBefore = await Bun.file(databasePath).arrayBuffer();
    await unlink(media);
    const missing = await inspectArtifactIntegrity({ manifestPath });
    expect(missing.passed).toBe(false);
    expect(missing.items[0]?.source).toBe("missing");
    expect(missing.summary).toEqual({ items: 1, sourceFailures: 1, cacheFailures: 0, cachedItems: 1, availableItems: 1 });
    await Bun.write(media, "different capture");
    const changed = await inspectArtifactIntegrity({ manifestPath });
    expect(changed.items[0]?.source).toBe("mismatch");
    expect(changed.items[0]?.cached).toBe("valid");
    expect(await Bun.file(databasePath).arrayBuffer()).toEqual(databaseBefore);
    const reopened = await openArtifactReviews({ manifestPath, databasePath, manifest });
    expect(reopened.read("capture", 1).review).toEqual(feedback);
    reopened.close();
    const corrupt = new Database(databasePath);
    corrupt.query("UPDATE hf_review_assets SET content=?").run(new TextEncoder().encode("corrupt fixture")); corrupt.close();
    const badCache = await inspectArtifactIntegrity({ manifestPath });
    expect(badCache.items[0]?.cached).toBe("mismatch");
    expect(badCache.summary.availableItems).toBe(0);
    expect(badCache.summary.cacheFailures).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("integrity follows the host descriptor and explicit database authority without creating databases", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-authority-"));
  try {
    const manifestPath = join(root, "manifest.json"), databasePath = join(root, "authoritative.sqlite");
    const manifest = await createArtifactManifest({ id: "text-review", title: "Text", items: [{ id: "text", title: "Text", kind: "text", text: "Evidence" }] });
    await Bun.write(manifestPath, JSON.stringify(manifest));
    const host = await openArtifactReviews({ manifestPath, databasePath, manifest }); host.close();
    await Bun.write(join(root, "review-descriptor.json"), JSON.stringify({ manifestPath, databasePath }));
    const declared = await inspectArtifactIntegrity({ manifestPath });
    expect(declared.databasePath).toBe(databasePath);
    expect(declared.summary.cachedItems).toBe(1);
    const override = join(root, "other.sqlite");
    expect((await inspectArtifactIntegrity({ manifestPath, databasePath: override })).items[0]?.cached).toBe("unavailable");
    expect(await Bun.file(override).exists()).toBe(false);
    await Bun.write(join(root, "review-descriptor.json"), JSON.stringify({ manifestPath: join(root, "other.json"), databasePath }));
    expect((await inspectArtifactIntegrity({ manifestPath })).summary.cachedItems).toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
