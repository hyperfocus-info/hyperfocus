import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { installHarnessDebtFixture } from "./fixture";

const output = process.env.DESIGN_EVIDENCE_DIR ?? ".local/design-system/evidence/harness-debt/after";
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [];
const results: unknown[] = [];
let completed = false;
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../../scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
    if (inspection.exitCode !== 0) throw new Error(inspection.stderr.toString());
    const windows = JSON.parse(inspection.stdout.toString());
    if (windows.visibleWindows.length) throw new Error("Owned browser exposed a visible window.");
    results.push({ visibleWindows: windows.visibleWindows });
  }
  for (const [size, width, height, scale] of [["desktop", 1440, 1000, ""], ["mobile", 320, 740, ""], ["tablet200", 820, 1000, "200%"]] as const) {
    const page = await owned.browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(15_000);
    page.on("pageerror", error => errors.push(error.message));
    const fixture = await installHarnessDebtFixture(page);
    await page.goto(process.env.HARNESS_URL ?? "http://127.0.0.1:8787");
    await fixture.ready;
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
    const navigation = page.locator('[data-panel-group-mode="navigation"]');
    if (width <= 820) await navigation.waitFor({ state: "visible" });
    if (await navigation.isVisible()) await navigation.click();
    await page.getByRole("tablist", { name: "Workspace panels", exact: true }).getByRole("tab", { name: "Jobs", exact: true }).click();
    const work = page.locator('[data-panel-group-mode="work"]');
    if (await work.isVisible()) await work.click();
    await page.getByRole("button", { name: "Inspect scheduler health and recent run reliability", exact: true }).click();
    const metrics = page.getByLabel("Scheduler metrics");
    await metrics.waitFor();
    const geometry = await metrics.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const rows = [...element.children].map(row => {
        const label = row.querySelector("dt")!.getBoundingClientRect();
        const value = row.querySelector("dd")!.getBoundingClientRect();
        return { overlap: label.right > value.left + 1, outside: value.right > bounds.right + 1 };
      });
      return { tag: element.tagName, rows, width: bounds.width, viewport: innerWidth, diagnosisFirst: element.previousElementSibling?.textContent?.includes("Dominant background failure") };
    });
    if (geometry.tag !== "DL" || geometry.rows.length !== 5 || !geometry.diagnosisFirst || geometry.width > width || geometry.rows.some(row => row.overlap || row.outside)) throw new Error(`${size}: invalid metric layout ${JSON.stringify(geometry)}`);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${output}/${size}-health.png` });
    results.push({ size, geometry });
    await page.close();
  }
  completed = true;
} finally {
  await Bun.write(`${output}/health-report.json`, JSON.stringify({ completed, errors, results }, null, 2));
  await owned.close();
}
if (errors.length) throw new Error(errors.join("\n"));
