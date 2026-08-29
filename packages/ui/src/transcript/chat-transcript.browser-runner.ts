import type { Page } from "playwright";
import { readBenchmarkEnvironment } from "@hyperfocus/performance";

const baseUrl = process.env.TRANSCRIPT_BROWSER_URL;
if (!baseUrl) throw new Error("TRANSCRIPT_BROWSER_URL is required.");

const { chromium } = await import("playwright");
const browser = await chromium.launch({ timeout: 10_000 });

try {
  const desktopSmall = await runCase(100, { width: 900, height: 700 });
  const desktopLarge = await runCase(10_000, { width: 900, height: 700 });
  const narrowLarge = await runCase(10_000, { width: 390, height: 700 });
  const streamControl = await runCase(100, { width: 900, height: 700 }, { streamBurst: true, streamInterval: 0 });
  const streamCoalesced = await runCase(100, { width: 900, height: 700 }, { streamBurst: true, streamInterval: 32 });
  if (desktopLarge.domNodes > desktopSmall.domNodes + 160) {
    throw new Error(`Transcript DOM scaled with history: ${desktopSmall.domNodes} nodes at 100 vs ${desktopLarge.domNodes} at 10,000.`);
  }
  if (!streamControl.streamBurstFinalVisible || !streamCoalesced.streamBurstFinalVisible) {
    throw new Error("Large streamed Markdown did not flush its final content.");
  }
  if ((streamCoalesced.streamBurstMutations ?? Infinity) > (streamControl.streamBurstMutations ?? 0)
    || (streamCoalesced.streamBurstContentApplications ?? Infinity)
      >= (streamControl.streamBurstContentApplications ?? 0) * 0.5) {
    throw new Error(
      `Stream coalescing did not reduce large-Markdown work: ${JSON.stringify({ streamControl, streamCoalesced })}.`
    );
  }
  const browserEnvironment = await browser.newPage().then(async (page) => {
    try {
      return await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        logicalCpus: navigator.hardwareConcurrency
      }));
    } finally {
      await page.close();
    }
  });
  console.log(JSON.stringify({
    environment: {
      ...readBenchmarkEnvironment({ name: "node", version: process.version }),
      browser: { name: "chromium", version: browser.version(), ...browserEnvironment }
    },
    evidence: {
      timingRole: "diagnostic-only",
      structuralGates: [
        "mounted DOM remains bounded as history grows from 100 to 10,000 messages",
        "coalescing applies at most half as many large Markdown source revisions",
        "coalescing does not increase observed DOM mutations"
      ]
    },
    desktopSmall,
    desktopLarge,
    narrowLarge,
    streamControl,
    streamCoalesced
  }));
} finally {
  await browser.close().catch(() => undefined);
}

async function runCase(
  count: number,
  viewport: { width: number; height: number },
  options: { streamBurst?: boolean; streamInterval?: number } = {}
) {
  const page: Page = await browser.newPage({ viewport });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  try {
    const query = new URLSearchParams({ count: String(count) });
    if (options.streamBurst) query.set("streamBurst", "1");
    if (options.streamInterval !== undefined) query.set("streamInterval", String(options.streamInterval));
    await page.goto(`${baseUrl}?${query}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
    try {
      await page.locator('html[data-transcript-ready="1"]').waitFor({ state: "attached", timeout: 20_000 });
    } catch (error) {
      const rootHtml = await page.locator("#root").evaluate((root) => root.innerHTML.slice(0, 8_000)).catch(() => "");
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail}\nErrors: ${errors.join("; ") || "none"}\nRoot: ${rootHtml}`);
    }
    const snapshot = await page.evaluate(() => window.__transcriptBrowserSnapshot);
    if (!snapshot) throw new Error("Transcript browser fixture produced no snapshot.");
    const failures: string[] = [];
    if (errors.length) failures.push(errors.join("; "));
    if (snapshot.renderedRows < 1 || snapshot.renderedRows > 60) failures.push(`rendered rows ${snapshot.renderedRows}`);
    if (snapshot.uniqueRenderedMessages !== snapshot.renderedRows) failures.push(`duplicate rendered messages ${snapshot.uniqueRenderedMessages}/${snapshot.renderedRows}`);
    if (snapshot.domNodes > 900) failures.push(`DOM nodes ${snapshot.domNodes}`);
    if (snapshot.scrollHeight <= snapshot.clientHeight) failures.push("content does not scroll");
    if (snapshot.distanceFromEnd > 80) failures.push(`distance from end ${snapshot.distanceFromEnd}`);
    if (!snapshot.hasBlockquote || !snapshot.hasCode || !snapshot.hasTable) failures.push("visible Markdown coverage incomplete");
    if (!snapshot.streamingRowPreserved) failures.push("streaming row remounted");
    if (!snapshot.streamingMarkdownUpdated) failures.push("streaming Markdown did not update");
    if (!Number.isFinite(snapshot.appendP95Ms) || snapshot.appendP95Ms <= 0) failures.push(`append p95 ${snapshot.appendP95Ms}`);
    if (failures.length) throw new Error(`${count} messages at ${viewport.width}px failed: ${failures.join("; ")}\n${JSON.stringify(snapshot, null, 2)}`);
    return snapshot;
  } finally {
    await page.close();
  }
}
