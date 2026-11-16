import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareTranscript } from "./transcript-fixture";
import { checkTranscript } from "./transcript-checks";
import { checkTranscriptStates } from "./transcript-state-checks";

const phase = process.env.DESIGN_CAPTURE_PHASE === "before" ? "before" : "after";
const output = process.env.DESIGN_EVIDENCE_DIR ?? `.local/design-system/evidence/padpilot-suggest/after/transcript`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [];
const results: object[] = [];
let completed = false;
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
    if (inspection.exitCode !== 0) throw new Error(inspection.stderr.toString());
    const snapshot = JSON.parse(inspection.stdout.toString());
    await Bun.write(`${output}/browser-windows.json`, JSON.stringify({ visibleWindows: snapshot.visibleWindows }, null, 2));
    if (snapshot.visibleWindows.length) throw new Error("Owned browser exposed a visible window.");
  }
  for (const app of ["padpilot"] as const) {
    const page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15_000);
    page.on("pageerror", error => errors.push(`${app}: ${error.message}`));
    const fixture = await prepareTranscript(page, app);
    if (phase === "after") await fixture.panel.screenshot({ path: `${output}/${app}-empty-panel.png`, mask: [fixture.panel.locator('input[type="password"]:visible')] });
    await fixture.send("Explain a clear, readable starting point. Include the settings and a code example.");
    for (const [name, width, height] of [["desktop", 1440, 1000], ["wide", 2560, 1440], ["tablet", 820, 1000], ["mobile", 390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await fixture.transcript.evaluate(element => { element.scrollTop = 0; });
      await page.waitForTimeout(200);
      await page.mouse.move(width - 1, height - 1);
      await page.screenshot({ path: `${output}/${app}-${name}.png` });
      await fixture.panel.screenshot({ path: `${output}/${app}-${name}-panel.png`, mask: [fixture.panel.locator('input[type="password"]:visible')] });
      results.push({ app, name, geometry: await fixture.transcript.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, scrollHeight: element.scrollHeight })) });
    }
    if (phase === "after") {
      results.push(...await checkTranscript(page, fixture, app, output));
      results.push(await checkTranscriptStates(page, fixture, app, output));
      await page.setViewportSize({ width: 320, height: 600 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const shortScaled = await fixture.transcript.evaluate(element => {
        const rect = element.getBoundingClientRect();
        let top = Math.max(0, rect.top);
        let bottom = Math.min(innerHeight, rect.bottom);
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
          const bounds = parent.getBoundingClientRect();
          top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
        }
        return { height: element.clientHeight, visibleHeight: Math.max(0, bottom - top), width: element.clientWidth, scrollWidth: element.scrollWidth };
      });
      await fixture.panel.screenshot({ path: `${output}/padpilot-short-text200-panel.png`, mask: [fixture.panel.locator('input[type="password"]:visible')] });
      if (shortScaled.visibleHeight < 118 || shortScaled.scrollWidth > shortScaled.width + 1) throw new Error(`Combined short/scaled transcript lacks visible reading room: ${JSON.stringify(shortScaled)}`);
      results.push({ app, name: "short-text200", geometry: shortScaled });
      const touch = await owned.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      touch.setDefaultTimeout(15_000);
      touch.on("pageerror", error => errors.push(`${app} touch: ${error.message}`));
      const touchFixture = await prepareTranscript(touch, app);
      await touchFixture.send("Explain the next useful step.");
      await touchFixture.transcript.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
      await touch.waitForTimeout(200);
      const latest = touchFixture.panel.getByRole("button", { name: "Return to latest", exact: true });
      const target = await latest.boundingBox();
      if (!target || target.height < 43.9) throw new Error(`${app}: latest touch target is too small.`);
      await latest.tap();
      await touch.waitForTimeout(200);
      const geometry = await touchFixture.transcript.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, endGap: element.scrollHeight - element.clientHeight - element.scrollTop }));
      if (geometry.scrollWidth > geometry.width + 1 || geometry.endGap > 2) throw new Error(`${app}: touch transcript geometry ${JSON.stringify(geometry)}`);
      results.push({ app, name: "touch", geometry, latestTargetHeight: target.height });
      await touchFixture.panel.screenshot({ path: `${output}/${app}-touch-panel.png`, mask: [touchFixture.panel.locator('input[type="password"]:visible')] });
      await touch.close();
    }
    await page.close();
  }
  if (errors.length) throw new Error(errors.join("; "));
  completed = true;
} catch (error) {
  errors.push(String(error));
  throw error;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, phase, results, errors, realProviderCalls: false, nativeHost: "not exercised", projectPersistence: "Disposable browser session only" }, null, 2));
  try { await owned.browser.close(); } finally { await owned.close(); }
}
