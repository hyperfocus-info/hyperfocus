import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system/evidence/next25-batch8-harness", phase);
const build = path.join(root, ".local/design-system", `batch8-harness-${phase}/dist/index.html`);
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = []; const errors: string[] = [];
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, path.join(root, "scripts/process-policy/windows-inspection.ts"), String(owned.pid)], cwd: root });
    await Bun.write(path.join(directory, "windows.json"), inspection.stdout);
    assert.equal(inspection.exitCode, 0, inspection.stderr.toString());
    assert.equal(JSON.parse(inspection.stdout.toString()).visibleWindows.length, 0);
  }
  for (const scenario of [{ name: "desktop", width: 1440, scale: 1 }, { name: "tablet", width: 820, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "scaled", width: 390, scale: 2 }]) {
    for (const surface of ["close", "section", "project", "removed", "create", "edit", "promote"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 }, hasTouch: scenario.width === 390 });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(build).href);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      if (["create", "edit", "promote"].includes(surface)) {
        await page.getByRole("button", { name: surface === "create" ? "Create task" : surface === "edit" ? "Edit task" : "Promote run", exact: true }).click();
        await page.getByLabel("Name", { exact: true }).fill("Customer checks retained for retry");
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: "Save task", exact: true }).click();
        if (phase === "after") {
          await page.getByText("Saving task. Waiting for workspace confirmation…", { exact: true }).waitFor();
          assert.equal(await page.getByLabel("Name", { exact: true }).isDisabled(), true);
          await page.keyboard.press("Escape");
          assert.equal(await page.getByLabel("Name", { exact: true }).count(), 1);
        }
        await page.evaluate(() => window.dispatchEvent(new Event("fixture-reject")));
        if (phase === "after") { await page.getByRole("alert").filter({ hasText: "Workspace is read-only" }).waitFor(); await page.getByRole("heading", { name: /scheduled task/i }).click(); await page.getByRole("tooltip").waitFor({ state: "hidden" }); }
      } else {
        if (["close", "section"].includes(surface)) await page.getByRole("button", { name: "Open preferences", exact: true }).click();
        await page.getByRole("textbox", { name: "Label", exact: true }).fill("Unpublished customer workflow");
        if (surface === "close") { await page.getByRole("button", { name: "Close preferences", exact: true }).click(); await page.getByRole("button", { name: "Open preferences", exact: true }).click(); }
        if (surface === "section") { await page.getByRole("button", { name: "General & UI", exact: true }).click(); await page.getByRole("button", { name: "Workspace & Memory", exact: true }).click(); }
        if (surface === "project") { await page.getByRole("button", { name: "Switch project", exact: true }).click(); if (phase === "after") assert.notEqual(await page.getByRole("textbox", { name: "Label", exact: true }).inputValue(), "Unpublished customer workflow"); await page.getByRole("button", { name: "Switch project", exact: true }).click(); }
        if (surface === "removed") await page.evaluate(() => window.dispatchEvent(new Event("fixture-remove-mode")));
        await page.getByRole("textbox", { name: "Label", exact: true }).scrollIntoViewIfNeeded();
        if (phase === "after") assert.equal(await page.getByRole("textbox", { name: "Label", exact: true }).inputValue(), "Unpublished customer workflow");
      }
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      if (phase === "after" && ["create", "edit", "promote"].includes(surface)) await page.screenshot({ path: path.join(directory, `${surface}-viewport-${scenario.name}.png`), fullPage: false });
      if (phase === "after") {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${surface}: page overflow`);
        if (["create", "edit", "promote"].includes(surface)) {
          assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Customer checks retained for retry");
          await page.getByRole("button", { name: "Retry save", exact: true }).focus(); await page.keyboard.press("Enter");
          await page.evaluate(() => window.dispatchEvent(new Event("fixture-accept")));
          await page.getByRole("dialog").waitFor({ state: "hidden" });
          assert.equal(await page.locator("[data-test-command-count]").textContent(), "2");
        } else if (surface === "removed") {
          await page.getByRole("button", { name: "Recreate removed mode", exact: true }).focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByRole("textbox", { name: "Label", exact: true }).inputValue(), "Unpublished customer workflow");
        } else {
          await page.getByRole("button", { name: "Discard retained draft", exact: true }).click();
          await page.getByRole("button", { name: "Discard draft and continue", exact: true }).click();
          assert.notEqual(await page.getByRole("textbox", { name: "Label", exact: true }).inputValue(), "Unpublished customer workflow");
        }
      }
      results.push({ surface, ...scenario }); await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ completed: true, results, errors, boundary: "Production preferences and mode/task components with disposable store and deterministic command responses. Project navigation host is a fixture; text scale is not browser zoom." }, null, 2));
} finally { await owned.close(); }
