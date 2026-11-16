import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { resolve } from "node:path";
import type { Page } from "playwright";
import { readBenchmarkEnvironment } from "@hyperfocus/performance";

const baseUrl = process.env.TRANSCRIPT_BROWSER_URL;
if (!baseUrl) throw new Error("TRANSCRIPT_BROWSER_URL is required.");

const { chromium } = await import("playwright");
const ownedBrowser = await connectHeadlessBrowser({
  executable: chromium.executablePath(),
  connect: (endpoint) => chromium.connectOverCDP(endpoint, { timeout: 10_000 }),
});
const browser = ownedBrowser.browser;

try {
  const visibleWindows = verifyHiddenBrowser();
  const desktopSmall = await runCase(100, { width: 900, height: 700 });
  const desktopLarge = await runCase(10_000, { width: 900, height: 700 });
  const narrowLarge = await runCase(10_000, { width: 390, height: 700 });
  const streamControl = await runCase(100, { width: 900, height: 700 }, { streamBurst: true, streamInterval: 0 });
  const streamCoalesced = await runCase(100, { width: 900, height: 700 }, { streamBurst: true, streamInterval: 32 });
  const reading = await runReadingCase();
  const retainedReading = await runRetainedReadingCase();
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
      ...readBenchmarkEnvironment({ name: "bun", version: Bun.version }),
      browser: { name: "chromium", version: browser.version(), ...browserEnvironment }
    },
    evidence: {
      visibleWindows,
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
    streamCoalesced,
    reading,
    retainedReading
  }));
} finally {
  try { await browser.close(); } finally { await ownedBrowser.close(); }
}

function verifyHiddenBrowser() {
  if (process.platform !== "win32") return [];
  const result = spawnBackgroundProcessSync({
    cmd: [process.execPath, resolve(import.meta.dir, "../../../../scripts/process-policy/windows-inspection.ts"), String(ownedBrowser.pid)]
  });
  if (result.exitCode !== 0) throw new Error(`Browser window inspection failed: ${result.stderr.toString()}`);
  const report = JSON.parse(result.stdout.toString());
  if (report.visibleWindows.length) throw new Error("Transcript browser exposed a visible window.");
  return report.visibleWindows;
}

async function runReadingCase() {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  const checks: string[] = [];
  try {
    await page.goto(`${baseUrl}?count=100`, { waitUntil: "domcontentloaded" });
    await page.locator('html[data-transcript-ready="1"]').waitFor();
    const transcript = page.locator('[data-test-chat-transcript]');
    await transcript.evaluate((element) => { element.scrollTop -= 1200; });
    await page.waitForTimeout(100);
    const before = await transcript.evaluate((element) => element.scrollTop);
    await page.evaluate(() => window.__transcriptBrowserControls?.append());
    await page.evaluate(() => window.__transcriptBrowserControls?.stream());
    await page.waitForTimeout(150);
    const after = await transcript.evaluate((element) => element.scrollTop);
    if (Math.abs(after - before) > 2) throw new Error(`Reading position moved on incoming content: ${before} -> ${after}`);
    checks.push("incoming append and stream preserve older reading position");
    const latest = page.getByRole("button", { name: "Return to latest", exact: true });
    await latest.waitFor({ state: "visible" });
    await latest.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    const returned = await transcript.evaluate((element) => ({ distance: element.scrollHeight - element.scrollTop - element.clientHeight,
      focused: document.activeElement === element }));
    if (returned.distance > 48 || !returned.focused) throw new Error(`Keyboard return failed: ${JSON.stringify(returned)}`);
    checks.push("keyboard return reaches latest and preserves focus on transcript");
    await page.evaluate(() => window.__transcriptBrowserControls?.showWideMarkdown());
    await page.waitForTimeout(150);
    const containment = await transcript.evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth,
      bodyWidth: document.documentElement.clientWidth, bodyScrollWidth: document.documentElement.scrollWidth,
      code: Boolean(element.querySelector("pre")), table: Boolean(element.querySelector("table")) }));
    if (!containment.code || !containment.table || containment.scrollWidth > containment.width + 1
      || containment.bodyScrollWidth > containment.bodyWidth + 1) throw new Error(`Markdown escapes narrow transcript: ${JSON.stringify(containment)}`);
    checks.push("wide table and unbroken code stay inside narrow transcript");
    const oldHeight = await page.locator('[data-test-chat-transcript-content]').evaluate((element) => element.getBoundingClientRect().height);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.waitForTimeout(200);
    const scaled = await page.locator('[data-test-chat-transcript-content]').evaluate((element) => ({ height: element.getBoundingClientRect().height,
      rowHeight: element.querySelector('[data-test-chat-transcript-item]')?.getBoundingClientRect().height ?? 0 }));
    if (scaled.height <= oldHeight || Math.abs(scaled.height - scaled.rowHeight) > 2) {
      throw new Error(`200% text was not remeasured: ${JSON.stringify({ oldHeight, ...scaled })}`);
    }
    checks.push("200% text remeasures virtual row height");
    return { checks, before, after, containment, scaled };
  } finally { await page.close(); }
}

async function runRetainedReadingCase() {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  try {
    await page.goto(`${baseUrl}?count=10000`, { waitUntil: "domcontentloaded" });
    await page.locator('html[data-transcript-ready="1"]').waitFor();
    const transcript = page.locator('[data-test-chat-transcript]');
    await transcript.evaluate((element) => { element.scrollTop -= 1500; });
    await page.waitForTimeout(150);
    const anchor = await transcript.evaluate((element) => {
      const top = element.getBoundingClientRect().top;
      const row = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]'))
        .find((candidate) => candidate.getBoundingClientRect().bottom > top);
      return { id: row?.dataset.messageId, offset: (row?.getBoundingClientRect().top ?? 0) - top, scrollTop: element.scrollTop };
    });
    if (!anchor.id) throw new Error("Missing retained reading anchor.");
    await page.evaluate(() => window.__transcriptBrowserControls?.append());
    await page.waitForTimeout(200);
    const current = await transcript.evaluate((element, id) => {
      const row = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find((candidate) => candidate.dataset.messageId === id);
      return row ? { offset: row.getBoundingClientRect().top - element.getBoundingClientRect().top,
        scrollTop: element.scrollTop, transform: row.parentElement?.style.transform } : null;
    }, anchor.id);
    if (current === null || Math.abs(current.offset - anchor.offset) > 2) {
      throw new Error(`Retained history shift displaced reading anchor: ${JSON.stringify({ anchor, current })}`);
    }
    return { messageId: anchor.id, offsetBefore: anchor.offset, offsetAfter: current.offset };
  } finally { await page.close(); }
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
