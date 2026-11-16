import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { stylexSolidPlugin } from "../../../build-tools/stylex-solid-plugin";

const bundle = resolve(".local/design-system/collection-controls");
const output = resolve(".local/design-system/evidence/collection-controls");
await mkdir(bundle, { recursive: true });
await mkdir(output, { recursive: true });
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "fixture.tsx")], outdir: bundle, target: "browser", format: "iife", naming: "main.[ext]", plugins: [stylexSolidPlugin({ generate: "dom", hydratable: false })] });
assert.ok(build.success, build.logs.map(String).join("\n"));
await Bun.write(`${bundle}/index.html`, '<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="main.css"><style>body{margin:0}main{padding:1rem;max-width:32rem}</style><body><div id="root"></div><script src="main.js"></script></body></html>');
const owner = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const errors: string[] = [];
const results: string[] = [];
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve("scripts/process-policy/windows-inspection.ts"), String(owner.pid)] });
    await Bun.write(`${output}/windows.json`, inspection.stdout);
    assert.equal(inspection.exitCode, 0, inspection.stderr.toString());
  }
  for (const [name, width, height, scale] of [["desktop", 1440, 900, "100%"], ["narrow", 390, 700, "100%"], ["scaled", 390, 700, "200%"]] as const) {
    const context = await owner.browser.newContext({ viewport: { width, height }, hasTouch: width === 390 });
    try {
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(pathToFileURL(`${bundle}/index.html`).href);
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale);
      const trigger = page.getByRole("button", { name: "Sound tags", exact: true });
      await trigger.click();
      const popup = page.getByRole("dialog", { name: "Sound tags", exact: true });
      await popup.waitFor();
      const bounds = await popup.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
      const search = page.getByRole("searchbox", { name: "Search sound tags" });
      await search.fill("Sound 17");
      await search.press("ArrowDown");
      await page.keyboard.press("Space");
      await page.screenshot({ path: `${output}/${name}-tags.png`, fullPage: true });
      await page.keyboard.press("Escape");
      assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
      assert.equal(await page.getByRole("button", { name: "Remove Sound 17 with a complete descriptive label", exact: true }).count(), 1);
      const selectBounds = await page.getByRole("button", { name: "Audio clip", exact: true }).boundingBox();
      const favoriteBounds = await page.getByRole("button", { name: "Favorite Sound 17 with a complete descriptive label", exact: true }).boundingBox();
      assert.ok(selectBounds && favoriteBounds && selectBounds.x + selectBounds.width <= favoriteBounds.x + 1, "Favorite action must not overlap the selection trigger");
      await page.getByRole("button", { name: "Favorite Sound 17 with a complete descriptive label", exact: true }).click();
      await page.getByRole("button", { name: "Audio clip", exact: true }).click();
      await page.getByRole("button", { name: "Favorites", exact: true }).click();
      assert.equal(await page.getByRole("option").count(), 1);
      await page.screenshot({ path: `${output}/${name}-favorites.png`, fullPage: true });
      await page.getByRole("option").click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
      results.push(name);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ results, errors }, null, 2));
  try { await owner.browser.close(); } finally { await owner.close(); }
}
