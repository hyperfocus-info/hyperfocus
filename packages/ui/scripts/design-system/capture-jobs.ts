import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { installJobsFixture } from "./jobs-fixture";
import { checkJobs, inspectJobsGeometry } from "./jobs-checks";

const phase = process.env.DESIGN_CAPTURE_PHASE === "before" ? "before" : "after";
const output = process.env.DESIGN_EVIDENCE_DIR ?? `.local/design-system/evidence/jobs/${phase}`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [];
const results: unknown[] = [];
let completed = false;
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
    if (inspection.exitCode !== 0) throw new Error(inspection.stderr.toString());
    const snapshot = JSON.parse(inspection.stdout.toString());
    await Bun.write(`${output}/browser-windows.json`, JSON.stringify({ visibleWindows: snapshot.visibleWindows }, null, 2));
    if (snapshot.visibleWindows.length) throw new Error("Owned browser exposed a visible window.");
  }
  const page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => errors.push(error.message));
  const fixture = await installJobsFixture(page);
  await page.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
  await fixture.ready;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole("tab", { name: "Jobs", exact: true }).click();
  await page.locator("[data-test-background-jobs-panel]").getByRole("button", { name: /^Select / }).first().click();
  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1000], ["mobile", 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${output}/${name}.png` });
    results.push({ name, width, height, panels: await page.locator("[data-test-background-jobs-panel]").evaluateAll(elements => elements.map(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight }))) });
    if (width <= 820) {
      await page.locator('[data-panel-group-mode="navigation"]').click();
      await page.screenshot({ path: `${output}/${name}-roster.png` });
      if (phase === "after") results.push(await inspectJobsGeometry(page, `${name}-roster`));
      await page.locator('[data-panel-group-mode="work"]').click();
    }
    if (phase === "after") results.push(await inspectJobsGeometry(page, `${name}-detail`));
  }
  if (phase === "after") {
    for (const [name, width, height] of [["short", 390, 600], ["wide", 2560, 1440]] as const) {
      await page.setViewportSize({ width, height });
      if (width < 820) await page.locator('[data-panel-group-mode="navigation"]').click();
      results.push(await inspectJobsGeometry(page, name));
      await page.screenshot({ path: `${output}/${name}.png` });
    }
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.locator('[data-panel-group-mode="navigation"]').click();
    results.push(await inspectJobsGeometry(page, "text200"));
    await page.screenshot({ path: `${output}/text200.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    results.push(...await checkJobs({ page, output, fixture }));
    const touch = await owned.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    touch.on("pageerror", error => errors.push(error.message));
    const touchFixture = await installJobsFixture(touch);
    await touch.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
    await touchFixture.ready;
    await touch.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await touch.locator('[data-panel-group-mode="navigation"]').click();
    await touch.locator('[data-test-left-tab-nav]').getByRole("tab", { name: "Jobs", exact: true }).click();
    await touch.locator('[data-test-job-id]').first().waitFor();
    results.push(await inspectJobsGeometry(touch, "touch"));
    const targets = await touch.locator('[data-test-job-id] button').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({ label: element.getAttribute("aria-label"), height: element.getBoundingClientRect().height })));
    if (targets.some(target => target.height < 43.9)) throw new Error(`Small touch jobs targets: ${JSON.stringify(targets)}`);
    results.push({ touchTargets: targets });
    await touch.screenshot({ path: `${output}/touch.png` });
    await touch.close();
  }
  results.push({ interceptedCommandTypes: [...new Set(fixture.commands)] });
  if (errors.length) throw new Error(errors.join("; "));
  completed = true;
} catch (cause) {
  errors.push(cause instanceof Error ? cause.message : String(cause));
  throw cause;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, phase, results, errors, fixture: "Synthetic jobs through the real app; all websocket commands intercepted; no runtime mutations" }, null, 2));
  try { await owned.browser.close(); } finally { await owned.close(); }
}
