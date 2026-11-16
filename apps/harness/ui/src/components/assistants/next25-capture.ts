import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system", `next25-harness-${phase}`);
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [];
const errors: string[] = [];
try {
  if (process.platform === "win32") {
    const result = spawnBackgroundProcessSync({ cmd: [process.execPath, path.join(root, "scripts/process-policy/windows-inspection.ts"), String(owned.pid)], cwd: root });
    await Bun.write(path.join(directory, "windows.json"), result.stdout);
    assert.equal(result.exitCode, 0, result.stderr.toString());
    const inspection = JSON.parse(result.stdout.toString());
    assert.ok(Array.isArray(inspection.visibleWindows));
    assert.equal(inspection.visibleWindows.length, 0, "Owned browser must create no visible windows");
  }
  for (const scenario of [{ name: "desktop", width: 1280, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "text-200", width: 1280, scale: 2 }, ...(phase === "after" ? [{ name: "narrow-text-200", width: 390, scale: 2 }] : [])]) {
    const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(directory, "dist/index.html")).href);
    await page.locator('[data-test-fixture-ready="1"]').waitFor();
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
    for (const tab of ["Questions", "Jobs", "Config"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click({ force: phase === "before" });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(directory, `${tab.toLowerCase()}-${scenario.name}.png`), fullPage: true });
      if (tab === "Config") {
        const model = page.getByText(/^Execution model:/);
        await model.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(directory, `config-routing-${scenario.name}.png`), fullPage: true });
        if (phase === "after") assert.ok(await model.evaluate(element => element.scrollWidth <= element.clientWidth + 1), "Routing text must wrap inside its actual pane");
      }
      if (tab === "Jobs") {
        const run = page.getByRole("listitem", { name: "Assistant run Customer workspace verification requires approval before retrying" });
        await run.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(directory, `runs-${scenario.name}.png`), fullPage: true });
        if (phase === "after") await run.getByRole("button").click({ trial: true });
      }
      if (phase === "after" && tab === "Questions") {
        const answer = page.getByRole("textbox", { name: /^Answer:/ });
        const send = page.getByRole("button", { name: "Send answer to assistant", exact: true });
        assert.equal(await send.isEnabled(), false);
        await answer.fill("Preserve the current workspace and retry its verification.");
        assert.equal(await send.isEnabled(), true);
        await answer.evaluate(element => element.scrollIntoView({ block: "center" }));
        await send.scrollIntoViewIfNeeded();
        await send.click({ trial: true });
        assert.ok(await answer.evaluate(element => {
          const list = element.closest('[data-test-virtual-list]');
          return !list || list.scrollWidth <= list.clientWidth + 1;
        }), "Answer collection must not require horizontal scrolling");
        if (scenario.name === "narrow-text-200") {
          const bounds = await answer.boundingBox();
          assert.ok(bounds && bounds.width >= 240, `Narrow scaled answer needs reading width, got ${bounds?.width}`);
          assert.equal(await answer.evaluate(element => Boolean(element.closest('[data-test-virtual-list]'))), false, "Small question collections share the detail scroll owner");
        }
        await page.mouse.move(1, 1);
        await page.screenshot({ path: path.join(directory, `question-answer-${scenario.name}.png`), fullPage: true });
      }
      if (phase === "after") assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      results.push({ tab, ...scenario, geometry: await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })) });
    }
    await page.getByRole("button", { name: "Inspect failure", exact: true }).click();
    await page.screenshot({ path: path.join(directory, `recovery-${scenario.name}.png`), fullPage: true });
    await page.getByRole("button", { name: "Retry", exact: true }).click({ trial: true });
    if (phase === "after") {
      assert.equal(await page.locator("details[open]").count(), 0);
      await page.locator("summary").filter({ hasText: "Assistant state" }).click();
      assert.equal(await page.locator("details[open]").count(), 1);
    }
    await page.keyboard.press("Escape");
    await page.close();
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ results, errors, scope: "Isolated real assistant UI; seeded data; no provider sends or persisted commands" }, null, 2));
} finally { await owned.close(); }
