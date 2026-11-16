import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system/evidence/next25-batch7-harness", phase);
const build = path.join(root, ".local/design-system", `batch7-harness-${phase}/dist/index.html`);
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
    for (const surface of ["timeout", "arguments", "environment", "template", "close", "project", "mode"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 }, hasTouch: scenario.width === 390 });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(build).href);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      // External events happen before opening so the fixture controls remain outside the dialog.
      if (surface === "project") await page.getByRole("button", { name: "Remove project", exact: true }).click();
      if (surface === "mode") await page.getByRole("button", { name: "Remove mode", exact: true }).click();
      await page.getByRole("button", { name: surface === "mode" ? "Open AI task" : "Open shell task", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).waitFor();
      await page.waitForTimeout(350);
      if (surface === "timeout") await page.getByLabel("Timeout seconds", { exact: true }).fill("0");
      if (surface === "arguments") await page.getByLabel("Args, one per line", { exact: true }).fill("--message\n  retain surrounding spaces  ");
      if (surface === "environment") await page.getByLabel("Env refs, one per line", { exact: true }).fill(Array.from({ length: 33 }, (_, index) => `VARIABLE_${index}`).join("\n"));
      if (surface === "template") {
        await page.getByLabel("Args, one per line", { exact: true }).fill("run\ncustomer-checks");
        await page.getByText("Advanced task settings", { exact: true }).click();
        await page.getByRole("button", { name: "Select background job template", exact: true }).click();
        await page.getByRole("option", { name: /Build checks/ }).click();
      }
      if (surface === "close") {
        await page.getByLabel("Name", { exact: true }).fill("Unsaved customer checks");
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      if (surface === "mode") await page.getByText("AI execution settings", { exact: true }).click();
      if (phase === "after" && surface === "template") {
        await page.getByRole("dialog", { name: "Replace task details?", exact: true }).waitFor();
        assert.equal(await page.getByRole("dialog", { name: "Replace task details?", exact: true }).evaluate(element => element.contains(document.activeElement)), true);
        assert.equal(await page.getByRole("tooltip").count(), 0);
      }
      if (["timeout", "arguments", "environment"].includes(surface)) await page.getByLabel(surface === "timeout" ? "Timeout seconds" : surface === "arguments" ? "Args, one per line" : "Env refs, one per line", { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      const saveButton = page.getByRole("button", { name: "Save task", exact: true });
      const saveDisabled = await saveButton.count() ? await saveButton.isDisabled() : null;
      if (phase === "after") {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${surface}: overflow`);
        assert.equal(await page.locator("[data-test-dialog-content]").evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1)), true, `${surface}: dialog content overflow`);
        if (["timeout", "environment", "arguments"].includes(surface)) {
          const height = await page.getByLabel("Timeout seconds", { exact: true }).evaluate(element => element.getBoundingClientRect().height);
          assert.ok(height <= 64 * scenario.scale, `${surface}: single-line input stretched to ${height}px`);
        }
        if (["timeout", "environment", "project", "mode"].includes(surface)) assert.equal(saveDisabled, true, `${surface}: invalid task can save`);
        if (surface === "timeout") { assert.equal(await page.getByLabel("Timeout seconds", { exact: true }).inputValue(), "0"); await page.getByLabel("Timeout seconds", { exact: true }).fill("30"); }
        if (surface === "environment") await page.getByLabel("Env refs, one per line", { exact: true }).fill("BUILD_TOKEN");
        if (["template", "close"].includes(surface)) {
          await page.getByRole("button", { name: "Keep editing", exact: true }).focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByLabel(surface === "template" ? "Args, one per line" : "Name", { exact: true }).inputValue(), surface === "template" ? "run\ncustomer-checks" : "Unsaved customer checks");
          if (surface === "template") {
            await page.getByRole("button", { name: "Select background job template", exact: true }).click();
            await page.getByRole("option", { name: /Build checks/ }).click();
            await page.getByRole("button", { name: "Apply template", exact: true }).click();
            assert.equal(await page.getByLabel("Args, one per line", { exact: true }).inputValue(), "run\nbuild");
          } else {
            await page.keyboard.press("Escape");
            await page.getByRole("dialog", { name: "Discard task changes?", exact: true }).waitFor();
            await page.keyboard.press("Escape");
            assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Unsaved customer checks");
          }
        }
        if (surface === "project") {
          await page.evaluate(() => window.dispatchEvent(new Event("fixture-project-arrived")));
          await page.getByRole("button", { name: "Select background job project", exact: true }).click();
          await page.getByRole("option", { name: /Replacement workspace/ }).click();
          assert.equal(await page.getByRole("button", { name: "Select background job project", exact: true }).getAttribute("aria-invalid"), null);
        }
        if (surface === "mode") {
          await page.getByRole("button", { name: "Select background job mode", exact: true }).click();
          await page.getByRole("option", { name: /Project default/ }).click();
          assert.equal(await page.getByRole("button", { name: "Select background job mode", exact: true }).getAttribute("aria-invalid"), null);
        }
        if (surface === "arguments") { await page.getByRole("button", { name: "Save task", exact: true }).click(); assert.match(await page.locator("[data-test-commands]").textContent() ?? "", /  retain surrounding spaces  /); }
        await page.screenshot({ path: path.join(directory, `${surface}-recovery-${scenario.name}.png`), fullPage: true });
      }
      results.push({ surface, ...scenario, saveDisabled });
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ completed: true, fixtureBoundary: "Production scheduled-task dialog with disposable store, deterministic schedule responses and intercepted save. No real execution or persistence.", results, errors }, null, 2));
} finally { await owned.close(); }
