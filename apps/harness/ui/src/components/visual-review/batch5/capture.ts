import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system/evidence/next25-batch5-harness", phase);
const build = path.join(root, ".local/design-system", `batch5-harness-${phase}/dist/index.html`);
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [];
const errors: string[] = [];
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, path.join(root, "scripts/process-policy/windows-inspection.ts"), String(owned.pid)], cwd: root });
    await Bun.write(path.join(directory, "windows.json"), inspection.stdout);
    assert.equal(inspection.exitCode, 0, inspection.stderr.toString());
    assert.equal(JSON.parse(inspection.stdout.toString()).visibleWindows.length, 0);
  }
  for (const scenario of [{ name: "desktop", width: 1440, scale: 1 }, { name: "tablet", width: 820, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "scaled", width: 390, scale: 2 }]) {
    for (const surface of ["create", "required", "collection", "policy", "delete", "partial", "unknown"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 }, hasTouch: scenario.width === 390 });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(build).href + `?surface=${surface}`);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      const observations: Record<string, unknown> = {};
      if (surface === "create" || surface === "required") {
        await page.getByRole("button", { name: "Create new workspace mode", exact: true }).click();
        observations.newLabel = await page.getByRole("textbox", { name: "Label", exact: true }).inputValue();
        if (surface === "required") {
          await page.getByRole("textbox", { name: "Label", exact: true }).fill("");
          await page.getByRole("button", { name: "Save workspace mode", exact: true }).click();
          observations.alerts = await page.getByRole("alert").count();
          if (phase === "after") {
            assert.equal(observations.alerts, 1);
            assert.equal(await page.getByRole("textbox", { name: "Label", exact: true }).getAttribute("aria-invalid"), "true");
          }
        }
        if (phase === "after") assert.equal(observations.newLabel, "");
      } else if (surface === "collection") {
        if (phase === "after") {
          const select = page.getByRole("button", { name: "Select saved mode", exact: true });
          await select.click();
          await page.getByLabel("Search Select saved mode", { exact: true }).fill("review 12");
          await page.getByRole("option").click();
          assert.match(await page.getByRole("textbox", { name: "Label", exact: true }).inputValue(), /12$/);
          assert.equal(await select.evaluate(element => document.activeElement === element), true);
        } else await page.getByRole("button", { name: "Customer application accessibility review 12", exact: true }).click();
      } else if (surface === "policy") {
        if (phase === "after") await page.locator("summary").click();
        await page.getByRole("button", { name: "Select mode plan gate", exact: true }).click();
        await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      } else if (surface === "delete") {
        await page.getByRole("button", { name: "Delete selected workspace mode", exact: true }).click();
        observations.dialogs = await page.getByRole("dialog").count();
        observations.result = await page.getByLabel("Result").textContent();
        if (phase === "after") { assert.equal(observations.dialogs, 1); assert.equal(observations.result, ""); }
      } else {
        await page.locator('input[type="file"]').setInputFiles({ name: "preferences.json", mimeType: "application/json", buffer: Buffer.from(surface === "partial" ? '{"debugEnabled":true}' : '{"unrecognized":true}') });
        await page.waitForTimeout(100);
        observations.shortcut = await page.getByLabel("Saved shortcut").textContent();
        observations.errors = await page.getByRole("alert").count();
        if (phase === "after") {
          assert.equal(observations.shortcut, "Alt+9");
          assert.equal(observations.errors, surface === "unknown" ? 1 : 0);
        }
      }
      await page.screenshot({ path: path.join(directory, `${surface}-task-${scenario.name}.png`), fullPage: true });
      if (phase === "after") {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${surface}: overflow`);
        if (surface === "create" || surface === "required") {
          for (const [name, value] of [["Label", "Review checkout"], ["Description", "Check customer checkout recovery"], ["Planner prompt", "Read the checkout requirements"], ["Execution prompt", "Inspect keyboard and error states"]]) await page.getByRole("textbox", { name, exact: true }).fill(value!);
          await page.getByRole("button", { name: "Save workspace mode", exact: true }).click();
          assert.equal(await page.getByLabel("Result").textContent(), "Saved Review checkout");
          assert.equal(await page.getByRole("alert").count(), 0);
        }
        if (surface === "delete") {
          await page.keyboard.press("Escape");
          const button = page.getByRole("button", { name: "Delete selected workspace mode", exact: true });
          assert.equal(await button.evaluate(element => document.activeElement === element), true);
          await button.click(); await page.getByRole("button", { name: "Confirm mode deletion", exact: true }).click();
          assert.equal(await page.getByLabel("Result").textContent(), "Deleted review-1");
        }
        if (surface === "unknown") {
          await page.locator('input[type="file"]').setInputFiles({ name: "preferences.json", mimeType: "application/json", buffer: Buffer.from('{"debugEnabled":false}') });
          await page.getByText("Preferences imported. Local defaults updated; provider keys were not imported.", { exact: true }).waitFor();
        }
        await page.screenshot({ path: path.join(directory, `${surface}-recovery-${scenario.name}.png`), fullPage: true });
      }
      results.push({ surface, ...scenario, observations });
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ completed: true, results, errors }, null, 2));
} finally { await owned.close(); }
