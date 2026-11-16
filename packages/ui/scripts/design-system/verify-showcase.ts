import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium, type Page } from "playwright";
import { buildShowcase, showcaseDirectory } from "./build-showcase";

const repositoryRoot = path.resolve(import.meta.dir, "../../../..");
const url = pathToFileURL(await buildShowcase()).href;
const owned = await connectHeadlessBrowser({
  executable: chromium.executablePath(),
  connect: (endpoint) => chromium.connectOverCDP(endpoint),
});
const cases: object[] = [];
const errors: string[] = [];
const report = { cases, windows: "not applicable", errors };
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({
      cmd: [process.execPath, path.join(repositoryRoot, "scripts/process-policy/windows-inspection.ts"), String(owned.pid)],
      cwd: repositoryRoot,
    });
    await Bun.write(path.join(showcaseDirectory, "windows-processes.json"), inspection.stdout);
    assert.equal(inspection.exitCode, 0, `Browser window inspection failed: ${inspection.stderr}`);
    report.windows = "No visible windows in owned browser process tree";
  }
  for (const width of [1440, 820, 390]) {
    const context = await owned.browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width === 390 });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    try {
      await page.goto(url);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await assertNoOverflow(page);
      const primary = page.locator("#primary-action");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.equal(await primary.evaluate((node) => document.activeElement === node), true, "Primary action follows theme control in keyboard order");
      const outline = await primary.evaluate((node) => getComputedStyle(node).outlineWidth);
      assert.equal(outline, "2px", "Keyboard focus is visible");
      await page.screenshot({ path: path.join(showcaseDirectory, `dark-${width}-focus.png`), fullPage: true });
      await primary.hover();
      await page.screenshot({ path: path.join(showcaseDirectory, `dark-${width}-hover.png`), fullPage: true });
      await page.mouse.down();
      await page.screenshot({ path: path.join(showcaseDirectory, `dark-${width}-active.png`), fullPage: true });
      await page.mouse.up();
      await primary.dispatchEvent("blur");

      const touchHeight = await primary.evaluate((node) => node.getBoundingClientRect().height);
      assert.ok(touchHeight >= (width === 390 ? 44 : 36), `Primary control target height ${touchHeight}`);
      assert.equal(await page.getByRole("button", { name: "Unavailable", exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("button", { name: "Creating project…" }).getAttribute("aria-busy"), "true");
      const errorInput = page.getByRole("textbox", { name: "Project location" });
      assert.equal(await errorInput.getAttribute("aria-describedby"), "location-error");
      const errorBorder = await errorInput.evaluate((node) => getComputedStyle(node).borderTopColor);
      const errorText = await page.locator("#location-error").evaluate((node) => getComputedStyle(node).color);
      assert.equal(errorBorder, errorText, "Explicit invalid state receives the semantic error color");

      const select = page.getByRole("button", { name: "Workspace", exact: true });
      await select.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("option", { name: "Shared workspace Projects shared with your team" }).waitFor();
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(showcaseDirectory, `dark-${width}-select.png`), fullPage: true });
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#selection-status").textContent(), "Selected: shared");
      assert.equal(await select.evaluate((node) => node === document.activeElement), true, "Selection restores trigger focus");

      const menu = page.getByRole("button", { name: "More actions", exact: true });
      await menu.click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      assert.equal(await page.getByRole("status").textContent(), "Project archived");
      assert.equal(await menu.evaluate((node) => node === document.activeElement), true, "Menu restores trigger focus");

      await page.getByRole("button", { name: "Search project list", exact: true }).click();
      const search = page.getByRole("searchbox");
      await search.fill("Project 40");
      assert.equal(await page.getByRole("option").count(), 1, "Large choice set filters immediately");
      await search.fill("No matching project");
      assert.equal(await page.getByRole("option").count(), 0, "Empty search hides stale choices");
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Use light theme" }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await assertNoOverflow(page);
      const lightErrorText = await page.locator("#location-error").evaluate((node) => getComputedStyle(node).color);
      const lightErrorToken = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--hf-color-danger").trim());
      assert.notEqual(lightErrorText, errorText, "Error foreground adapts with the theme");
      await page.screenshot({ path: path.join(showcaseDirectory, `light-${width}.png`), fullPage: true });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const reducedDuration = await primary.evaluate((node) => getComputedStyle(node).transitionDuration);
      assert.ok(reducedDuration.split(",").every((value) => parseFloat(value) <= 0.001), "Reduced motion disables transitions");
      await page.evaluate(async () => {
        document.documentElement.style.fontSize = "200%";
        // The reduced-motion reset uses 1ms transitions; sample settled rem geometry.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      const checkbox = page.getByRole('checkbox', { name: /Require confirmation/ });
      const checkboxGeometry = await checkbox.evaluate(node => ({ width: node.getBoundingClientRect().width, css: getComputedStyle(node).width, root: getComputedStyle(document.documentElement).fontSize, transition: getComputedStyle(node).transition, zoom: getComputedStyle(node).zoom }));
      assert.equal(checkboxGeometry.width, 32, `Native checkbox scales with 200% root text: ${JSON.stringify(checkboxGeometry)}`);
      await checkbox.focus();
      await page.keyboard.press('Space');
      assert.equal(await checkbox.isChecked(), true);
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(showcaseDirectory, `light-${width}-text200.png`), fullPage: true });
      report.cases.push({ width, primaryHeight: touchHeight, focusOutline: outline, errorBorder, lightErrorText, lightErrorToken, reducedDuration,
        checks: ["no horizontal overflow", "keyboard focus", "disabled/loading", "error association/color", "select/menu keyboard and focus return", "large-list/empty search", "light theme", "200% text"] });
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, [], "No browser runtime errors");
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await Bun.write(path.join(showcaseDirectory, "../showcase-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  try { await owned.browser.close(); } finally { await owned.close(); }
}
console.log(JSON.stringify(report, null, 2));

async function assertNoOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert.ok(sizes.content <= sizes.width + 1, `Horizontal overflow ${sizes.content} > ${sizes.width}`);
}
