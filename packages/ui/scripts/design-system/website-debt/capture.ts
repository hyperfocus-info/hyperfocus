import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const phase = process.env.DESIGN_CAPTURE_PHASE ?? "after";
const output = `.local/design-system/evidence/website-debt/${phase}`;
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const page = await owned.browser.newPage();
const errors: string[] = [], results: unknown[] = [];
let completed = false;
try {
  const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve("scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
  if (inspection.exitCode || JSON.parse(inspection.stdout.toString()).visibleWindows.length) throw new Error("Visible automation windows");
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/website/api/**", route => ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort());
  await page.goto(`${process.env.EDITOR_URL ?? "http://127.0.0.1:8797"}/website/builder`);
  await page.getByRole("button", { name: "Page settings", exact: true }).waitFor();
  for (const [name, width, height, scale] of [["desktop", 1440, 1000, ""], ["tablet", 820, 1000, ""], ["mobile", 390, 844, ""], ["scaled", 390, 1000, "200%"]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
    const sections = page.getByRole("tab", { name: "Sections", exact: true });
    if (await sections.isVisible()) await sections.click();
    await page.getByRole("button", { name: "Page settings", exact: true }).click();
    const nameField = page.getByLabel("Project name", { exact: true });
    const destinationVisible = await nameField.isVisible();
    if (!destinationVisible && phase === "before") await page.getByRole("tab", { name: "Edit & AI", exact: true }).click();
    if (phase === "after" && !destinationVisible) throw new Error("Page settings selected but Inspector remains hidden");
    await page.screenshot({ path: `${output}/${name}.png` });
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    for (const [trigger, action] of [["More", "Publish local preview"], ["Files", "Export app"]]) {
      const button = page.getByRole("button", { name: trigger, exact: true });
      if (phase === "after") {
        await button.click();
        await page.getByRole("menuitem", { name: action, exact: true }).waitFor();
        await page.keyboard.press("Escape");
        if (!await button.evaluate(element => element === document.activeElement)) throw new Error(`${trigger} did not restore focus`);
      }
    }
    results.push({ name, geometry, destinationVisible });
    if (phase === "after" && geometry.scrollWidth > geometry.width + 1) throw new Error(`Website ${name} overflow`);
  }
  if (errors.length) throw new Error(errors.join("; "));
  completed = true;
} catch (error) {
  errors.push(String(error));
  throw error;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, results, errors, persistence: "Read-only capture; no Save/Publish/provider calls" }, null, 2));
  try { await owned.browser.close(); } finally { await owned.close(); }
}
