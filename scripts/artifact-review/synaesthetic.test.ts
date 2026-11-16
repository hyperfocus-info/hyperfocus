import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSynaestheticReview } from "./synaesthetic";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

test("maps detected passages and suggestions without copying machine ratings", async () => {
  const folder = mkdtempSync(join(tmpdir(), "artifact-review-test-")); folders.push(folder);
  const audioPath = join(folder, "fixture.wav"), bytes = new Uint8Array([82, 73, 70, 70]);
  await Bun.write(audioPath, bytes);
  const options = { id: "evaluation", runId: "run-2", title: "Audio", audioPath, durationSeconds: 10,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    report: { overallScore: 0.98, audioSummary: { temporal: { structure: { segments: [{ startSeconds: 0, endSeconds: 4 }, { startSeconds: 4, endSeconds: 10 }] } } }, actions: [{ id: "contrast", description: "Increase contrast" }] } };
  const manifest = await createSynaestheticReview(options), item = manifest.items[0]!;
  expect(item.sections.map(section => section.id)).toEqual(["segment-1", "segment-2", "action-1"]);
  expect(item.sections[1]?.startSeconds).toBe(4);
  expect(item.sections[2]?.text).toContain("Increase contrast");
  expect(item.dimensions?.[0]?.max).toBe(5);
  expect("scores" in item).toBe(false);
  await Bun.write(audioPath, new Uint8Array([0]));
  expect(createSynaestheticReview(options)).rejects.toThrow("changed");
});
