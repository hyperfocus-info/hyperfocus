import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { connectHeadlessBrowser, browserExecutable } from "@hyperfocus/desktop-runtime/automation";
import { chromium, type Browser } from "playwright-core";
import { createArtifactReviewServer } from "./server";
import { inspectWindowsProcessTrees } from "../process-policy/windows-inspection";

import { verifyAlbum } from './verify-album.ts';
import { artifactManifestSchema } from '@hyperfocus/artifact-review/schema';

export async function verifyReviewBrowser(options: { videoManifest: string; audioManifest: string; output: string }) {
await mkdir(options.output, { recursive: true });
const directory = await mkdtemp(join(options.output, "fixture-"));
let host: Awaited<ReturnType<typeof createArtifactReviewServer>> | undefined;
let browser: Awaited<ReturnType<typeof connectHeadlessBrowser<Browser>>> | undefined;
try {
const source = artifactManifestSchema.parse(await Bun.file(options.videoManifest).json());
const audioFixture = artifactManifestSchema.parse(await Bun.file(options.audioManifest).json());
const video = source.items.find(item => item.kind === 'video'), audio = audioFixture.items.find(item => item.kind === 'audio');
if (!video?.media || !audio?.media) throw Error('Fixtures must contain a video and an audio item.');
const videoSection = video.sections?.[0], audioSection = audio.sections?.[0];
if (!videoSection || audioSection?.endSeconds === undefined) throw Error('Fixtures need a named video section and an audio section with an end time.');
const text = "A generated idea.\nA second section to review.";
const manifest = { ...source, id: "isolated-review-verification", items: [{ ...video, media: resolve(dirname(options.videoManifest), video.media) }, { ...audio, media: resolve(dirname(options.audioManifest), audio.media) }, { id: "text", version: 1, sha256: createHash("sha256").update(text).digest("hex"), kind: "text", title: "Text fixture", text, sections: [{ id: "idea", title: "The idea", text }] }] };
await Bun.write(join(directory, "manifest.json"), JSON.stringify(manifest));
host = await createArtifactReviewServer({ manifestPath: join(directory, "manifest.json"), port: 0 });
browser = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const report: Record<string, unknown> = {};
  const context = await browser.browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(host.server.url.toString());
  await page.waitForSelector("video");
  await page.waitForFunction(() => (document.querySelector("video")?.readyState || 0) >= 1);
  if (await page.locator('video').evaluate(video => { if (!(video instanceof HTMLVideoElement)) throw Error("Expected video fixture"); return video.duration < 7; })) throw Error('The video fixture must be at least seven seconds.');
  await page.locator("#grades button").filter({ hasText: /^B$/ }).click();
  await page.locator("#notes").fill("Browser verification only");
  await page.locator("#start").fill("2"); await page.locator("#end").fill("5");
  await page.locator("#annotation-note").fill("Cut this pause shorter"); await page.locator("#add-note").click();
  await page.locator("#start").fill("7"); await page.locator("#end").fill("6");
  await page.locator("#annotation-note").fill("Invalid range"); await page.locator("#add-note").click();
  if (!await page.locator("#annotation-error").textContent()) throw Error("Invalid range accepted");
  await page.locator("#clear-anchor").click();
  await page.locator("#sections button").filter({ hasText: videoSection.title }).click();
  await page.locator("#annotation-note").fill("Keep the disclosure"); await page.locator("#add-note").click();
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "Saved");
  const saved = await (await fetch(new URL("/api/feedback", host.server.url))).json();
  const first = saved.items[manifest.items[0].id].review;
  if (first.annotations.length !== 2 || first.annotations[0].endSeconds !== 5 || first.annotations[1].sectionId !== videoSection.id) throw Error("Annotation persistence mismatch");
  await page.locator("#annotations li").first().getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#annotation-note").fill("Edited pacing note"); await page.locator("#add-note").click();
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "Saved");
  await page.reload(); await page.waitForSelector("#annotations li");
  if (!(await page.locator("#annotations").textContent())?.includes("Edited pacing note")) throw Error("Reload lost edit");
  await page.locator("#next").click();
  if (await page.locator("#position").textContent() !== "2 / 3") throw Error("Next navigation failed");
  await page.locator("#previous").click();
  if (await page.locator("#notes").inputValue() !== "Browser verification only") throw Error("Navigation lost saved feedback");
  await page.locator("#annotations li").first().getByRole("button", { name: "Jump here" }).click();
  const time = await page.locator("video").evaluate(video => { if (!(video instanceof HTMLVideoElement)) throw Error("Expected video fixture"); return video.currentTime; });
  if (Math.abs(time - 2) > .2) throw Error("Annotation seek failed");
  await page.locator("#note-moment").click();
  if (await page.locator("#start").inputValue() !== "2.0") throw Error("Quick note lost playhead");
  await page.locator("#annotation-note").fill("Temporary annotation"); await page.locator("#add-note").click();
  await page.locator("#annotations li").last().getByRole("button", { name: "Delete", exact: true }).click();
  if (await page.locator("#annotations li").count() !== 2) throw Error("Delete failed");
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "Saved");
  await page.screenshot({ path: join(options.output, 'review-mobile.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth) > 390) throw Error("Mobile overflow");
  const secondContext = await browser.browser.newContext(), second = await secondContext.newPage();
  await second.goto(host.server.url.toString()); await second.waitForSelector("video");
  if (await second.locator("#notes").inputValue() !== "Browser verification only") throw Error("Cross-device read failed");
  await page.locator("#notes").fill("Newer device change");
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "Saved");
  await second.locator("#notes").fill("Stale device draft");
  await second.waitForFunction(() => document.getElementById("save-status")?.textContent?.includes("Another device"));
  const conflicted = await (await fetch(new URL("/api/feedback", host.server.url))).json();
  if (conflicted.items[manifest.items[0].id].review.notes !== "Newer device change") throw Error("Conflict overwrote saved feedback");
  await page.locator("#items button").filter({ hasText: "Text fixture" }).click();
  await page.locator("#sections button").click(); await page.locator("#annotation-note").fill("Text section note"); await page.locator("#add-note").click();
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "Saved");
  await page.locator("#items button").filter({ hasText: manifest.items[1].title }).click();
  await page.waitForSelector("audio"); await page.locator("#sections button").first().click();
  if (Number(await page.locator("#end").inputValue()) !== audioSection.endSeconds) throw Error("Evaluator segment not mapped");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: join(options.output, 'review-desktop.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth) > 1440) throw Error("Desktop overflow");
  if (await page.locator("#export").count()) throw Error("Export control remains");
  if (await page.evaluate(() => localStorage.length)) throw Error("Feedback written to browser storage");
  await page.waitForFunction(() => (document.getElementById("history")?.textContent || "").includes("Version"));
  report.checks = ["mobile layout", "range annotation", "named section", "edit and reload", "seek", "server persistence", "two-device conflict", "text annotation", "evaluator audio", "SQLite-only feedback", "version history"];
  report.errors = errors; if (errors.length) throw Error(errors.join("\n"));
  const visibleWindows = inspectWindowsProcessTrees({ rootPids: [browser.pid] }).visibleWindows;
  report.visibleWindows = visibleWindows;
  if (visibleWindows.length) throw Error("Visible browser window");
  await secondContext.close(); await context.close();
  await Bun.write(join(options.output, 'browser-verification.json'), JSON.stringify(report, null, 2));
  return report;
} finally {
  try { if (browser) await browser.browser.close(); }
  finally { try { await browser?.close(); } finally { host?.close(); await rm(directory, { recursive: true, force: true }); } }
}
}

if (import.meta.main) {
  const args = process.argv.slice(2), value = (flag: string) => { const index = args.indexOf(flag);return index < 0 ? undefined : args[index + 1]; };
  const output = value('--out') ?? '.local/artifact-review/browser-verification';
  const url = value('--album-url');
  if (url) {
    const count = (flag: string) => { const raw = value(flag);if (raw === undefined) return undefined;const n = Number(raw);if (!Number.isSafeInteger(n) || n < 0) throw Error('Expected a nonnegative media count.');return n; };
    console.log(await verifyAlbum({ url, images: count('--images'), videos: count('--videos'), audios: count('--audios'), output: join(output, 'album-verification.json') }));
  } else {
    const videoManifest = value('--video-manifest'), audioManifest = value('--audio-manifest');
    if (!videoManifest || !audioManifest) throw Error('Use --album-url <managed-url> [--images N] [--videos N] [--audios N], or --video-manifest <json> --audio-manifest <json>; --out selects local evidence.');
    console.log(await verifyReviewBrowser({ videoManifest, audioManifest, output }));
  }
}
