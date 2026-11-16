import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system/evidence/next25-batch6-harness", phase);
const build = path.join(root, ".local/design-system", `batch6-harness-${phase}/dist/index.html`);
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
    for (const surface of ["pending", "accepted", "rejected", "switch", "new", "discard", "refresh"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 }, hasTouch: scenario.width === 390 });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(build).href);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      const label = page.getByRole("textbox", { name: "Label", exact: true });
      await label.fill("Unsaved customer checkout accessibility review");
      if (["pending", "accepted", "rejected"].includes(surface)) {
        await page.getByRole("button", { name: "Save workspace mode", exact: true }).click();
        if (phase === "after") {
          assert.equal(await page.getByRole("button", { name: "Save workspace mode", exact: true }).isDisabled(), true);
          if (surface !== "pending") {
            await page.getByRole("button", { name: surface === "accepted" ? "Server accepts save" : "Server rejects save", exact: true }).click();
            await page.getByText(surface === "accepted" ? "Mode saved." : /Mode was not saved:/).waitFor();
          }
        }
      } else if (surface === "switch") {
        await page.getByRole("button", { name: "Select saved mode", exact: true }).click();
        await page.keyboard.press("Home"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      } else if (surface === "new") await page.getByRole("button", { name: "Create new workspace mode", exact: true }).click();
      else if (phase === "after" && surface === "discard") await page.getByRole("button", { name: "Discard changes and reload saved mode", exact: true }).click();
      else if (phase === "after" && surface === "refresh") await page.getByRole("button", { name: "Refresh saved modes", exact: true }).click();
      if (phase === "after") {
        if (["switch", "new", "discard"].includes(surface)) assert.equal(await page.getByRole("dialog").count(), 1);
        assert.equal(await label.inputValue(), "Unsaved customer checkout accessibility review");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${surface}: overflow`);
      }
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      if (phase === "after") {
        if (["switch", "new", "discard"].includes(surface)) {
          await page.keyboard.press("Escape"); assert.equal(await label.inputValue(), "Unsaved customer checkout accessibility review");
          assert.equal(await page.getByRole("button", { name: "Select saved mode", exact: true }).getAttribute("data-select-value"), "review-1");
          if (surface === "switch") {
            await page.getByRole("button", { name: "Select saved mode", exact: true }).click();
            await page.getByRole("option", { name: /Customer accessibility review 2/ }).click();
          } else await page.getByRole("button", { name: surface === "new" ? "Create new workspace mode" : "Discard changes and reload saved mode", exact: true }).click();
          await page.getByRole("button", { name: "Discard draft and continue", exact: true }).click();
          assert.equal(await label.inputValue(), surface === "new" ? "" : `Customer accessibility review ${surface === "switch" ? 2 : 1}`);
        }
        if (surface === "rejected") {
          await page.getByRole("button", { name: "Save workspace mode", exact: true }).focus(); await page.keyboard.press("Enter");
          await page.getByRole("button", { name: "Server accepts save", exact: true }).click(); await page.getByText("Mode saved.", { exact: true }).waitFor();
        }
        if (surface === "pending") { await page.getByRole("button", { name: "Server accepts save", exact: true }).click(); await page.getByText("Mode saved.", { exact: true }).waitFor(); }
        await page.screenshot({ path: path.join(directory, `${surface}-recovery-${scenario.name}.png`), fullPage: true });
      }
      results.push({ surface, ...scenario, label: await label.inputValue(), matchedBeforeTask: !["discard", "refresh"].includes(surface) });
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ completed: true, fixtureBoundary: "Before frozen batch5 callback host; after explicit production-store command responses. Discard/refresh before are entry states only.", results, errors }, null, 2));
} finally { await owned.close(); }
