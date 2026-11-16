import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { installHarnessDebtFixture } from "./fixture";

const output = process.env.DESIGN_EVIDENCE_DIR ?? ".local/design-system/evidence/harness-debt/after";
const settingsOnly = process.argv.includes("--settings-only");
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [];
const results: unknown[] = [];
let completed = false;
async function navigation(page: Page) {
  const mode = page.locator('[data-panel-group-mode="navigation"]');
  if (await mode.isVisible()) await mode.click();
}
async function settingsSection(page: Page, name: string) {
  const workspace = page.locator('[data-ui-settings-workspace]');
  const picker = workspace.getByRole('button', { name: 'Preference section', exact: true });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole('option', { name, exact: true }).click();
  } else await workspace.getByRole('button', { name, exact: true }).click();
}
async function capture(page: Page, name: string, selector: string) {
  await page.mouse.move(0, 0);
  const geometry = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth };
  });
  await page.screenshot({ path: `${output}/${name}.png` });
  const collisions = await page.locator('[data-test-app-header]').evaluate(header => {
    const context = header.querySelector('[data-test-mobile-surface-label]');
    if (!context?.getClientRects().length) return [];
    const bounds = context.getBoundingClientRect();
    if (context.scrollWidth > context.clientWidth + 1) return ['Context label exceeds its reserved width'];
    return [...header.querySelectorAll('button')].filter(button => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.left < bounds.right && rect.right > bounds.left && rect.top < bounds.bottom && rect.bottom > bounds.top;
    }).map(button => button.getAttribute('aria-label') ?? button.textContent);
  });
  if (collisions.length) throw new Error(`${name}: header actions overlap context: ${JSON.stringify(collisions)}`);
  if (geometry.width > geometry.viewport + 1 || geometry.scrollWidth > geometry.clientWidth + 1) {
    const offenders = await page.locator(selector).evaluate(element => [...element.querySelectorAll("*")].filter(child => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1).map(child => ({ tag: child.tagName, text: child.textContent?.slice(0, 100), width: child.getBoundingClientRect().width })).slice(0, 12));
    const fields = await page.locator(`${selector} textarea`).evaluateAll(elements => elements.slice(0, 1).flatMap(element => {
      const parents = []; let node: Element | null = element;
      while (node && parents.length < 8) { const style = getComputedStyle(node); parents.push({ tag: node.tagName, width: node.getBoundingClientRect().width, scroll: node.scrollWidth, box: style.boxSizing, min: style.minWidth, display: style.display, columns: style.gridTemplateColumns }); node = node.parentElement; } return parents;
    }));
    throw new Error(`${name} overflows: ${JSON.stringify({ geometry, offenders, fields })}`);
  }
  results.push({ name, geometry });
}
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../../scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
    if (inspection.exitCode !== 0) throw new Error(inspection.stderr.toString());
    const snapshot = JSON.parse(inspection.stdout.toString());
    await Bun.write(`${output}/browser-windows.json`, JSON.stringify({ visibleWindows: snapshot.visibleWindows }, null, 2));
    if (snapshot.visibleWindows.length) throw new Error("Owned browser exposed a visible window.");
  }
  const page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15_000);
  page.on("pageerror", error => errors.push(error.message));
  const fixture = await installHarnessDebtFixture(page);
  await page.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
  await fixture.ready;
  for (const [size, width, height, scale] of [["desktop", 1440, 1000, ""], ["mobile", 320, 740, ""], ["tablet200", 820, 1000, "200%"]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
    if (!await page.locator('[data-ui-settings-workspace]').isVisible()) await page.keyboard.press('Control+,');
    await page.locator('[data-ui-settings-workspace]').waitFor();
    for (const section of ["General & UI", "Keybinds", "IDE Settings", "AI & Providers", "Safety & Guardrails", "Workspace & Memory", "Usage", "Background Jobs", "Developer & Advanced"]) {
      await settingsSection(page, section);
      await page.locator('[data-test-preferences-panel] h3').first().waitFor();
      await capture(page, `${size}-preferences-${section.toLowerCase().replace(/[^a-z]+/g, "-")}`, "[data-test-preferences-panel]");
    }
    if (settingsOnly) continue;
    await navigation(page);
    await page.getByRole("tab", { name: "Jobs", exact: true }).click();
    await navigation(page);
    await page.locator("[data-test-background-jobs-panel]").getByRole("button", { name: /^Select / }).first().click();
    await capture(page, `${size}-job-detail`, "[data-test-job-detail-id]");
    const detail = page.locator("[data-test-job-detail-id]");
    const log = detail.locator("[data-test-execution-log]");
    if ((await log.boundingBox())!.height < 120) throw new Error(`${size}: execution log reading area collapsed.`);
    await log.getByRole("button", { name: /^Show details for / }).first().click();
    await capture(page, `${size}-execution-evidence`, '[role="dialog"]');
    await page.keyboard.press("Escape");
    const disclosure = detail.locator("summary");
    await disclosure.focus();
    await page.keyboard.press("Space");
    if (!await disclosure.evaluate(element => element.parentElement?.hasAttribute("open"))) throw new Error("Job details do not expand from keyboard.");
    await page.keyboard.press("Space");
    await detail.getByRole("button", { name: "Edit task", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await capture(page, `${size}-job-edit`, '[role="dialog"]');
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Review the overnight customer reports with an intentionally long localized name");
    await page.keyboard.press("Escape");
    if (!await detail.getByRole("button", { name: "Edit task", exact: true }).evaluate(element => document.activeElement === element)) throw new Error("Job dialog did not restore Edit focus.");
    await page.getByRole("button", { name: "Inspect scheduler health and recent run reliability", exact: true }).click();
    await page.getByRole("region", { name: "Backoff table" }).waitFor();
    await capture(page, `${size}-health`, '[role="dialog"]');
    const table = page.getByRole("region", { name: "Backoff table" });
    await table.focus();
    await table.scrollIntoViewIfNeeded();
    await capture(page, `${size}-health-table`, '[role="dialog"]');
    const scroll = await table.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    if (width === 320 && scroll.scroll <= scroll.width) throw new Error("Health must expose local horizontal scrolling on mobile.");
    results.push({ name: `${size}-health-scroll`, scroll });
    await page.keyboard.press("Escape");
    const traceMode = page.locator('[data-panel-group-mode="run-details"]');
    if (await traceMode.isVisible()) await traceMode.click();
    await capture(page, `${size}-trace`, "[data-test-trace-panel]");
    const reading = await page.locator("[data-test-trace-panel] [data-test-execution-log]").evaluate(element => {
      const rect = element.getBoundingClientRect();
      let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
      let ancestor = element.parentElement;
      while (ancestor) { const style = getComputedStyle(ancestor); if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { const bounds = ancestor.getBoundingClientRect(); top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); } ancestor = ancestor.parentElement; }
      const footer = document.querySelector("[data-test-trace-running-counts]")?.getBoundingClientRect();
      return { visibleHeight: Math.max(0, Math.min(bottom, footer?.top ?? bottom) - top), footerOverlap: footer ? rect.bottom - footer.top : 0 };
    });
    if (reading.visibleHeight < 120 || reading.footerOverlap > 1) throw new Error(`${size}: trace reading area is clipped: ${JSON.stringify(reading)}`);
    results.push({ name: `${size}-trace-reading`, reading });
    const workMode = page.locator('[data-panel-group-mode="work"]');
    if (await workMode.isVisible()) await workMode.click();
  }
  const workspaceActions = page.getByRole("button", { name: "Workspace actions", exact: true });
  await workspaceActions.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "Workspace actions", exact: true }).waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");
  if (!await workspaceActions.evaluate(element => element === document.activeElement)) throw new Error("Workspace menu did not restore keyboard focus.");
  results.push({ workspaceMenu: "Keyboard open, navigation, Escape and focus return pass" });
  if (!settingsOnly) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await navigation(page);
  const row = page.locator("[data-test-job-id]").first();
  const origin = row.getByRole("button", { name: /^Select / });
  await origin.focus();
  await row.click({ button: "right" });
  const menu = page.locator("[data-test-context-menu]");
  await menu.waitFor();
  await page.keyboard.press("End");
  if (!await menu.evaluate(element => element.contains(document.activeElement))) throw new Error("Context menu did not own keyboard focus.");
  await capture(page, "mobile-context-menu", "[data-test-context-menu]");
  await page.keyboard.press("Escape");
  if (!await origin.evaluate(element => element === document.activeElement)) throw new Error("Context menu lost its origin on Escape.");
  const touch = await owned.browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touchFixture = await installHarnessDebtFixture(touch);
  await touch.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
  await touchFixture.ready;
  await touch.keyboard.press('Control+,');
  await touch.locator('[data-ui-settings-workspace]').waitFor();
  await settingsSection(touch, 'General & UI');
  await capture(touch, "touch-preferences", "[data-test-preferences-panel]");
  const targets = await touch.locator("[data-test-preferences-panel] button").evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({ name: element.getAttribute("aria-label") ?? element.textContent, height: element.getBoundingClientRect().height })));
  if (targets.some(target => target.height < 43.9)) throw new Error(`Small touch targets: ${JSON.stringify(targets)}`);
  results.push({ touchTargets: targets });
  await touch.close();
  }
  results.push({ interceptedCommandTypes: [...new Set(fixture.commands)] });
  if (fixture.commands.some(type => /save|create|run-now|delete/.test(type))) throw new Error("Read-only capture attempted a mutation.");
  if (errors.length) throw new Error(errors.join("; "));
  completed = true;
} catch (cause) {
  errors.push(cause instanceof Error ? cause.message : String(cause));
  throw cause;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, capturedScope: settingsOnly ? "Settings and shell only; job/trace/health PNGs are from their earlier captures" : "Settings, jobs, trace and health", results, errors, fixture: "Synthetic jobs and diagnostics; all websocket commands intercepted; no runtime mutations" }, null, 2));
  try { await owned.browser.close(); } finally { await owned.close(); }
}
