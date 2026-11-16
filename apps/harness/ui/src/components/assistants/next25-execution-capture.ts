import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
const root = path.resolve(import.meta.dir, "../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system", `next25-execution-${process.argv[3] ?? phase}`);
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [];
const errors: string[] = [];
try {
  if (process.platform === "win32") {
    const result = spawnBackgroundProcessSync({ cmd: [process.execPath, path.join(root, "scripts/process-policy/windows-inspection.ts"), String(owned.pid)], cwd: root });
    await Bun.write(path.join(directory, "windows.json"), result.stdout);
    assert.equal(result.exitCode, 0, result.stderr.toString());
    assert.equal(JSON.parse(result.stdout.toString()).visibleWindows.length, 0);
  }
  for (const scenario of [{ name: "desktop", width: 1280, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "text-200", width: 1280, scale: 2 }, ...(phase === "after" ? [{ name: "narrow-text-200", width: 390, scale: 2 }] : [])]) {
    for (const surface of ["tools", "approval"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 } });
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(directory, "dist/index.html")).href + `?surface=${surface}`);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      if (surface === "tools") {
        if (scenario.name === "narrow-text-200") {
          await page.getByRole("button", { name: "Show all tool calls", exact: true }).click();
          await page.screenshot({ path: path.join(directory, `tools-expanded-${scenario.name}.png`), fullPage: true });
        }
        await page.getByRole("button", { name: "Show details for shell tool-1", exact: true }).click();
        await page.getByRole("button", { name: "Copy tool call details", exact: true }).click({ trial: true });
        await page.mouse.move(1, 1);
        await page.screenshot({ path: path.join(directory, `tool-details-${scenario.name}.png`), fullPage: true });
        await page.keyboard.press("Escape");
      } else {
        await page.getByRole("button", { name: "Approve this browser step", exact: true }).click({ trial: true });
        await page.goto(pathToFileURL(path.join(directory, "dist/index.html")).href + "?surface=approval&paused=1");
        await page.locator('[data-test-fixture-ready="1"]').waitFor();
        await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
        await page.getByRole("button", { name: "Reject this browser step", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(directory, `approval-paused-${scenario.name}.png`), fullPage: true });
        if (phase === "after") {
          assert.equal(await page.getByText("Global execution pause is active", { exact: true }).isVisible(), true);
          assert.equal(await page.getByRole("button", { name: "Approve this browser step", exact: true }).isEnabled(), false);
          await page.getByRole("button", { name: "Reject this browser step", exact: true }).click({ trial: true });
        }
      }
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (phase === "after") assert.ok(geometry.scrollWidth <= geometry.width, `${surface} ${scenario.name} overflow ${JSON.stringify(geometry)}`);
      results.push({ surface, ...scenario, geometry });
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ results, errors, scope: "Real components, intercepted commands, no provider execution" }, null, 2));
} finally { await owned.close(); }
