import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../../..");
const directory = path.join(root, ".local/design-system/evidence/next25-batch4-harness/trace");
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, path.join(root, "scripts/process-policy/windows-inspection.ts"), String(owned.pid)], cwd: root });
    await Bun.write(path.join(directory, "windows.json"), inspection.stdout);
    assert.equal(inspection.exitCode, 0);
    assert.equal(JSON.parse(inspection.stdout.toString()).visibleWindows.length, 0);
  }
  const page = await owned.browser.newPage({ viewport: { width: 390, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(/^https?:/, route => route.abort());
  await page.goto(pathToFileURL(path.join(root, ".local/design-system/batch4-trace/dist/index.html")).href + "?surface=plan");
  await page.locator('[data-test-fixture-ready="1"]').waitFor();
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  const log = page.locator("[data-test-execution-log]");
  const details = log.getByRole("button", { name: /^Show details for/ }).first();
  await details.scrollIntoViewIfNeeded();
  const geometry = await log.evaluate(element => {
    const row = element.querySelector("article")!;
    const copy = row.firstElementChild!.firstElementChild!;
    return { readingWidth: copy.getBoundingClientRect().width, viewportHeight: element.getBoundingClientRect().height, width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  assert.ok(geometry.readingWidth >= 160, JSON.stringify(geometry));
  assert.ok(geometry.viewportHeight >= 160, JSON.stringify(geometry));
  assert.equal(geometry.width, geometry.scrollWidth);
  await page.screenshot({ path: path.join(directory, "row-scaled.png") });
  await details.click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: path.join(directory, "details-scaled.png") });
  await page.keyboard.press("Escape");
  assert.equal(await details.evaluate(element => document.activeElement === element), true);
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ completed: true, geometry, errors }, null, 2));
} finally { await owned.close(); }
