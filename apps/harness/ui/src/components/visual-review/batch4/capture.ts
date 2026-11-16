import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system/evidence/next25-batch4-harness", phase);
const build = path.join(root, ".local/design-system", `batch4-harness-${phase}/dist/index.html`);
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
  for (const scenario of [{ name: "desktop", width: 1440, scale: 1 }, { name: "tablet", width: 820, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "scaled", width: 390, scale: 2 }]) {
    for (const surface of ["log", "search", "edit", "conflict", "usage", "reset", "import", "keys"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 } });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(build).href + `?surface=${surface}`);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      const observations: Record<string, unknown> = {};
      if (surface === "log") {
        observations.readingWidth = await page.locator("article").locator("div").nth(1).evaluate(element => element.getBoundingClientRect().width);
        const details = page.getByRole("button", { name: /^Show details for/ });
        await details.click();
        await page.getByRole("dialog").waitFor();
        await page.keyboard.press("Escape");
        if (phase === "after") assert.equal(await details.evaluate(element => document.activeElement === element), true);
      } else if (surface === "search") {
        await page.getByRole("textbox", { name: "Search keybindings" }).fill("no-matching-command-zz");
        observations.remainingRows = await page.locator("[data-test-keybind-row]").count();
        if (phase === "after") assert.equal(observations.remainingRows, 0);
      } else if (surface === "edit") {
        const field = page.getByRole("textbox", { name: "Project switcher hotkey", exact: true }).first();
        await field.focus();
        await page.keyboard.press("Tab");
        observations.tabEscapes = await field.evaluate(element => document.activeElement !== element && document.activeElement !== document.body);
        if (phase === "after") {
          assert.equal(observations.tabEscapes, true);
          await field.fill("Control");
          assert.equal(await field.getAttribute("aria-invalid"), "true");
          assert.ok((await field.boundingBox())!.width >= 64 * scenario.scale, "Invalid shortcut lost its editing width");
          await field.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `edit-invalid-${scenario.name}.png`) });
          await page.keyboard.press("Escape");
          assert.equal(await field.getAttribute("aria-invalid"), null);
        }
      } else if (surface === "conflict") {
        const field = page.getByRole("textbox", { name: "Projects hotkey", exact: true });
        await field.focus(); await page.keyboard.press("Control+2");
        observations.conflictDialog = await page.getByRole("dialog").count();
        if (phase === "after") assert.equal(observations.conflictDialog, 1);
      } else if (surface === "reset") {
        await page.getByRole("button", { name: "Reset token usage", exact: true }).click();
        await page.getByRole("dialog").waitFor();
      } else if (surface === "import") {
        await page.locator('input[type="file"]').setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
        await page.waitForTimeout(100);
        observations.inlineError = await page.getByRole("alert").count();
        if (phase === "after") assert.equal(observations.inlineError, 1);
      } else if (surface === "keys") {
        await page.getByRole("button", { name: "Developer & Advanced", exact: true }).click();
        await page.getByRole("button", { name: "Clear all provider keys", exact: true }).last().click();
        observations.confirmation = await page.getByRole("dialog").count();
        observations.commands = await page.getByRole("status").count();
        if (phase === "after") assert.equal(observations.confirmation, 1);
      }
      await page.screenshot({ path: path.join(directory, `${surface}-task-${scenario.name}.png`), fullPage: true });
      if (phase === "after") {
        assert.ok(geometry.scrollWidth <= geometry.width, `${surface}: document overflow`);
        if (surface === "log") assert.ok(Number(observations.readingWidth) >= 240, "Execution log has no useful reading column");
        if (surface === "search") {
          await page.getByRole("textbox", { name: "Search keybindings" }).fill("Project switcher");
          assert.equal(await page.locator("[data-test-keybind-row]").count(), 1);
        }
        if (surface === "edit") {
          const field = page.getByRole("textbox", { name: "Project switcher hotkey", exact: true }).first();
          await field.focus(); await page.keyboard.press("Control+Alt+9");
          assert.equal(await field.evaluate(element => document.activeElement === element), true);
          assert.match(await page.locator('output').textContent() ?? "", /preferences.save/);
        }
        if (surface === "conflict") {
          await page.getByRole("button", { name: "Cancel duplicate keybind save", exact: true }).click();
          assert.equal(await page.getByRole("dialog").count(), 0);
          assert.equal(await page.getByRole("textbox", { name: "Projects hotkey", exact: true }).inputValue(), "Ctrl + 1");
        }
        if (surface === "reset") {
          assert.match(await page.getByRole("dialog").textContent() ?? "", /Current session: 0 tokens/);
          await page.getByRole("button", { name: "Cancel token usage reset", exact: true }).click();
          assert.equal(await page.getByRole("dialog").count(), 0);
          await page.getByRole("button", { name: "Reset token usage", exact: true }).click();
          await page.getByRole("button", { name: "Confirm token usage reset", exact: true }).click();
          assert.equal(await page.getByRole("dialog").count(), 0);
        }
        if (surface === "import") {
          await page.locator('input[type="file"]').setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from('{"debugEnabled":true}') });
          await page.getByText("Preferences imported. Local defaults updated; provider keys were not imported.", { exact: true }).waitFor();
          assert.equal(await page.getByRole("alert").count(), 0);
        }
        if (surface === "keys") {
          assert.doesNotMatch(await page.locator('output').textContent() ?? "", /clearApiKey/);
          await page.getByRole("button", { name: "Keep provider keys", exact: true }).click();
          assert.equal(await page.getByRole("dialog").count(), 0);
          await page.getByRole("button", { name: "Clear all provider keys", exact: true }).last().click();
          await page.getByRole("button", { name: "Remove all saved provider keys", exact: true }).click();
          assert.match(await page.locator('output').textContent() ?? "", /preferences.clearApiKey/);
        }
        await page.screenshot({ path: path.join(directory, `${surface}-recovery-${scenario.name}.png`) });
      }
      results.push({ surface, ...scenario, geometry, observations });
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ completed: true, results, errors }, null, 2));
} finally {
  await owned.close();
}
