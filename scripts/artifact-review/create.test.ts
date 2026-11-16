import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArtifactManifest, createArtifactManifestFile } from "./create";

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function temporaryFolder() {
  const folder = mkdtempSync(join(tmpdir(), "artifact-create-test-")); folders.push(folder); return folder;
}

test("hashes exact UTF-8 text and defaults version and sections", async () => {
  const text = "Human notes — no trimming\n";
  const manifest = await createArtifactManifest({ id: "copy", title: "Copy", items: [{ id: "one", title: "One", kind: "text", text }] });
  expect(manifest.items[0]?.sha256).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  expect(manifest.items[0]?.version).toBe(1);
  expect(manifest.items[0]?.sections).toEqual([]);
  expect(manifest.items[0]?.text).toBe(text);
});

test("resolves file input media relative to input JSON and preserves explicit version", async () => {
  const folder = temporaryFolder(), media = join(folder, "sample.wav"), inputPath = join(folder, "input.json"), outputPath = join(folder, "manifest.json");
  const bytes = new Uint8Array([1, 2, 3]); await Bun.write(media, bytes);
  await Bun.write(inputPath, JSON.stringify({ id: "audio", title: "Audio", items: [{ id: "one", title: "One", kind: "audio", media: "sample.wav", version: "take-3" }] }));
  const manifest = await createArtifactManifestFile({ inputPath, outputPath });
  expect(manifest.items[0]?.media).toBe(media);
  expect(manifest.items[0]?.version).toBe("take-3");
  expect(manifest.items[0]?.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(await Bun.file(outputPath).json()).toEqual(manifest);
});

test("rejects missing media declarations and missing files", async () => {
  await expect(createArtifactManifest({ id: "bad", title: "Bad", items: [{ id: "one", title: "One", kind: "video" }] })).rejects.toThrow("content");
  await expect(createArtifactManifest({ id: "bad", title: "Bad", items: [{ id: "one", title: "One", kind: "video", media: join(temporaryFolder(), "missing.mp4") }] })).rejects.toThrow();
});

test("a curated reference hash rejects changed bytes without replacing its manifest", async () => {
  const folder = temporaryFolder(), media = join(folder, "reference.png"), inputPath = join(folder, "references.json"), outputPath = join(folder, "manifest.json");
  await Bun.write(media, "reviewed capture");
  const expectedSha256 = createHash("sha256").update("reviewed capture").digest("hex");
  await Bun.write(inputPath, JSON.stringify({ id: "references", title: "References", items: [{ id: "task", version: "capture-1", title: "Task", kind: "image", media: "reference.png", expectedSha256 }] }));
  const manifest = await createArtifactManifestFile({ inputPath, outputPath });
  expect(manifest.items[0]?.sha256).toBe(expectedSha256);
  const original = await Bun.file(outputPath).text();
  await Bun.write(media, "new capture");
  await expect(createArtifactManifestFile({ inputPath, outputPath })).rejects.toThrow("update the reference hash and version");
  expect(await Bun.file(outputPath).text()).toBe(original);
});
