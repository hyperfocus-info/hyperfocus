import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMarketingReview } from "./marketing";

test("marketing queue includes rendered videos and excludes concepts and standalone audio", async () => {
  const directory = await mkdtemp(join(tmpdir(), "marketing-selection-"));
  try {
    const sourcePath = join(directory, "review.json");
    const candidate = { id: "video", version: 1, sha256: "a".repeat(64), title: "Click it.", description: "Harness", evidence: "App replay", limitation: "Saved versions", video: "cut.mp4" };
    await Bun.write(sourcePath, JSON.stringify({ candidates: [candidate, { ...candidate, id: "audio", video: "song.mp3" }], catalogue: [{ id: "concept", hook: "Not made yet" }] }));
    const review = await createMarketingReview({ sourcePath });
    expect(review.items.map(item => item.id)).toEqual(["video"]);
    expect(review.items[0]?.kind).toBe("video");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
