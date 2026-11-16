import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createArtifactReviewServer } from "./server";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

// The monorepo default preload replaces HTTP globals with happy-dom. Run this
// native HTTP integration from this directory (bunfig.toml), or disable that preload.
test.skipIf(typeof window !== "undefined")("LAN review persists validated feedback, rejects stale writes and only serves allowed files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "artifact-review-test-"));
  directories.push(directory);
  const media = path.join(directory, "clip.mp4");
  await Bun.write(media, "0123456789abcdefghijklmnopqrstuvwxyz");
  const sha256 = new Bun.CryptoHasher("sha256").update(await Bun.file(media).arrayBuffer()).digest("hex");
  await Bun.write(path.join(directory, "review.ts"), "document.title = 'Fixture';");
  await Bun.write(path.join(directory, "index.html"), "<title>Fixture</title>");
  await Bun.write(path.join(directory, "secret.txt"), "not-public");
  const manifestPath = path.join(directory, "manifest.json");
  await Bun.write(manifestPath, JSON.stringify({ schemaVersion: 1, id: "fixture", title: "Fixture", items: [
    { id: "clip", version: 1, sha256, title: "Clip", kind: "video", media, sections: [], dimensions: [{ id: "pace", title: "Pace", min: 1, max: 5 }] }
  ] }));
  const options = { manifestPath, port: 0, publicDirectory: directory };
  let host = await createArtifactReviewServer(options);
  try {
    let base = host.server.url.origin;
    const manifest = await (await fetch(`${base}/api/manifest`)).json();
    expect(manifest.items[0].media).toBe("/media/clip?version=1");
    expect(JSON.stringify(manifest)).not.toContain(directory);
    expect((await fetch(`${base}/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/media/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/api/feedback`)).status).toBe(200);
    const partial = await fetch(`${base}/media/clip`, { headers: { Range: "bytes=3-8" } });
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe("345678");
    const review = { version: 1, sha256, grade: "B", scores: { pace: 4 }, notes: "Keep the action", annotations: [{ id: "a1", startSeconds: 2, endSeconds: 4, text: "Tighter here", rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.2 } }] };
    const put = (body: unknown, origin = base) => fetch(`${base}/api/feedback/clip`, { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await put({ expectedRevision: 0, review }, "https://unrelated.example")).status).toBe(403);
    expect((await put({ expectedRevision: 0, review: { ...review, sha256: "b".repeat(64) } })).status).toBe(400);
    const saved = await put({ expectedRevision: 0, review });
    expect(saved.status).toBe(200);
    expect((await saved.json()).revision).toBe(1);
    expect((await put({ expectedRevision: 0, review })).status).toBe(409);
    host.close();
    host = await createArtifactReviewServer(options);
    base = host.server.url.origin;
    const feedback = await (await fetch(`${base}/api/feedback`)).json();
    expect(feedback.items.clip.revision).toBe(1);
    expect(feedback.items.clip.review.annotations[0].text).toBe("Tighter here");
  } finally { host.close(); }
  await Bun.write(media, "changed after manifest generation");
  host = await createArtifactReviewServer(options);
  try { expect(await (await fetch(`${host.server.url.origin}/media/clip?version=1`)).text()).toBe("0123456789abcdefghijklmnopqrstuvwxyz"); }
  finally { host.close(); }
});
