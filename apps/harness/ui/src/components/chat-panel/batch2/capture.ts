import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system", `batch2-harness-${phase}`);
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
  for (const scenario of [{ name: "desktop", width: 1280, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "narrow-text-200", width: 390, scale: 2 }]) {
    for (const surface of ["question", "attachments", "lookup", "experiment", "run", "events", "setup"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 } });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(path.join(directory, "dist/index.html")).href + `?surface=${surface}`);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      if (phase === "after") {
        if (surface === "question") {
          const answer = page.getByRole("button", { name: "Choose planner answer: Preserve the current workspace and retry verification", exact: true });
          await answer.click();
          assert.equal(await page.getByLabel("Fixture action").textContent(), "preserve");
          await answer.focus(); await page.keyboard.press("Enter");
          const second = page.getByRole("button", { name: "Choose planner answer: Inspect the failure before deciding", exact: true });
          await second.click();
          await page.screenshot({ path: path.join(directory, `question-last-answer-${scenario.name}.png`), fullPage: true });
          assert.equal(await page.getByLabel("Fixture action").textContent(), "inspect");
        } else if (surface === "attachments") {
          const remove = page.getByRole("button", { name: /^Remove Customer/ });
          await remove.click({ trial: true });
          await remove.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByLabel("Fixture action").textContent(), "removed");
        } else if (surface === "lookup") {
          const option = page.getByRole("option");
          await option.click(); await option.focus(); await page.keyboard.press("Enter");
          assert.match(await page.getByLabel("Fixture action").textContent() ?? "", /^@src/);
        } else if (surface === "experiment") {
          const file = page.getByRole("button", { name: /src\/recovery.test.ts/ });
          await file.click(); await file.focus(); await page.keyboard.press("Enter");
          assert.equal(await file.getAttribute("aria-pressed"), "true");
          await page.locator("pre").last().scrollIntoViewIfNeeded();
          const copy = page.getByRole("button", { name: "Copy code block", exact: true });
          await copy.click({ trial: true });
          assert.equal(await copy.evaluate(element => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (node.textContent?.trim() === "Copy") {
                const range = document.createRange(); range.selectNodeContents(node);
                return range.getClientRects().length;
              }
            }
            return 0;
          }), 1, "Code-toolbar Copy label must remain on one line");
          await page.mouse.move(1, 1);
          await page.screenshot({ path: path.join(directory, `experiment-selected-${scenario.name}.png`), fullPage: true });
          await page.keyboard.press("Escape");
          assert.equal(await page.getByRole("dialog").count(), 0);
        } else if (surface === "run") {
          const schedule = page.getByRole("button", { name: "Promote latest run into scheduled task", exact: true });
          await schedule.click(); await schedule.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByLabel("Fixture action").textContent(), "schedule");
          const details = page.locator("summary").filter({ hasText: "Run state" });
          await details.click();
          assert.equal(await page.locator("details[open]").count(), 1);
          await details.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.locator("details[open]").count(), 0);
          await page.getByText("Outcome", { exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `run-outcome-${scenario.name}.png`), fullPage: true });
        } else if (surface === "setup") {
          await page.getByText(/^Initialize Git creates a repository/).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `setup-consequences-${scenario.name}.png`), fullPage: true });
          const cancel = page.getByRole("button", { name: "Cancel this run", exact: true });
          await cancel.click({ trial: true }); await cancel.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByRole("dialog").count(), 0);
          assert.equal(await page.getByLabel("Fixture action").textContent(), "cancel");
        }
      }
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (phase === "after") assert.ok(geometry.scrollWidth <= geometry.width, `${surface} ${scenario.name}: ${JSON.stringify(geometry)}`);
      results.push({ surface, ...scenario, geometry });
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ results, errors, scope: "Actual task components, isolated typed state, blocked HTTP and intercepted commands. No provider or project writes." }, null, 2));
} finally { await owned.close(); }
