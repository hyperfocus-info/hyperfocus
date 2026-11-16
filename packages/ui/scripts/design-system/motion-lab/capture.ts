import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcess, spawnBackgroundProcessSync, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const phase = process.env.DESIGN_CAPTURE_PHASE === "before" ? "before" : "after";
const output = `.local/design-system/evidence/motion-lab/${phase}`;
await mkdir(output, { recursive: true });
const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe") });
const port = probe.port!;
await probe.stop(true);
const server = spawnBackgroundProcess({ cmd: [process.execPath, "packages/engine/examples/motion-lab/server.ts"], env: { ...process.env, MOTION_LAB_PORT: String(port) }, stdout: "pipe", stderr: "pipe" });
const owner = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const page = await owner.browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const errors: string[] = [];
const results: unknown[] = [];
let completed = false;
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../../scripts/process-policy/windows-inspection.ts"), String(owner.pid), String(server.pid)] });
    const windows = JSON.parse(inspection.stdout.toString());
    await Bun.write(`${output}/windows.json`, JSON.stringify({ visibleWindows: windows.visibleWindows }, null, 2));
    if (inspection.exitCode !== 0 || windows.visibleWindows.length) throw new Error("Visible automation window");
  }
  page.on("pageerror", error => errors.push(error.message));
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch { /* Owned server startup. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => {
    if (!("__motionLab" in window)) return false;
    const lab = window.__motionLab;
    return lab !== null && typeof lab === "object" && "ready" in lab && lab.ready === true;
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  for (const [name, width, height, scale] of [["desktop", 1440, 1000, ""], ["tablet", 820, 1000, ""], ["mobile", 390, 844, ""], ["narrow-text200", 320, 844, "200%"]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(scale => { document.documentElement.style.fontSize = scale; }, scale);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, captions: [...document.querySelectorAll("dt,.metric-note,.panel-kicker")].map(element => parseFloat(getComputedStyle(element).fontSize)) }));
    results.push({ scenario: name, ...geometry });
    if (phase === "after" && (geometry.pageWidth > width || geometry.captions.some(size => size < 12))) throw new Error(`Unreadable or overflowing ${name}: ${JSON.stringify(geometry)}`);
  }
  if (phase === "after") {
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.getByRole("button", { name: /Stairs/ }).click();
    if (await page.getByRole("button", { name: /Stairs/ }).getAttribute("aria-pressed") !== "true") throw new Error("Scenario action failed");
    await page.locator("#fixtureSelect").selectOption("incomplete");
    await page.waitForFunction(() => {
      if (!("__motionLab" in window)) return false;
      const lab = window.__motionLab;
      return lab !== null && typeof lab === "object" && "captureReady" in lab && lab.captureReady === true;
    });
    await page.locator(".warning-section").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/incomplete-fixture-warning.png`, fullPage: true });
    results.push({ task: "Actual scenario selection and incomplete fixture load remain available; live warnings shown." });
  }
  if (errors.length) throw new Error(errors.join("; "));
  completed = true;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, phase, results, errors }, null, 2));
  try { await owner.browser.close(); } finally { await owner.close(); await terminateProcessTree({ process: server }); }
}
