import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system/evidence/next25-batch3-harness", phase);
const build = path.join(root, ".local/design-system", `batch3-harness-${phase}/dist/index.html`);
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
  for (const scenario of [{ name: "desktop", width: 1440, scale: 1 }, { name: "tablet", width: 820, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "narrow-text-200", width: 390, scale: 2 }]) {
    for (const surface of ["events", "header", "terminal", "cleanup", "help", "plan", "subtasks"]) {
      const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 } });
      page.on("pageerror", error => errors.push(error.message));
      await page.route(/^https?:/, route => route.abort());
      await page.goto(pathToFileURL(build).href + `?surface=${surface}`);
      await page.locator('[data-test-fixture-ready="1"]').waitFor();
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(directory, `${surface}-${scenario.name}.png`), fullPage: true });
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      results.push({ surface, ...scenario, geometry });
      if (phase === "after") {
        assert.ok(geometry.scrollWidth <= geometry.width, `${surface} ${scenario.name}: ${JSON.stringify(geometry)}`);
        if (surface === "header") {
          const context = page.getByRole("button", { name: "View current project and thread" });
          await context.click();
          assert.equal(await page.getByRole("dialog").getByText("Customer workspace recovery and import verification", { exact: true }).isVisible(), true);
          await page.getByRole("dialog").getByText("Verify retained customer workspace before retrying the import", { exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `header-context-${scenario.name}.png`) });
          await page.keyboard.press("Escape");
          assert.equal(await context.evaluate(element => document.activeElement === element), true);
          await page.keyboard.press("Enter"); await page.keyboard.press("Escape");
          const menu = page.getByRole("button", { name: "More thread actions", exact: true });
          await menu.click(); await page.keyboard.press("End"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("Enter");
          assert.equal(await page.getByRole("dialog").isVisible(), true);
          assert.match(await page.getByRole("dialog").textContent() ?? "", /Terminal History/i);
          await page.keyboard.press("Escape");
        } else if (surface === "terminal") {
          const open = page.getByRole("button", { name: "Focus Customer workspace import verification terminal" });
          await open.click();
          assert.equal(await page.getByRole("dialog").count(), 0);
          assert.equal(await page.getByRole("region", { name: "Selected terminal" }).isVisible(), true);
          await page.reload();
          await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
          await open.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByRole("dialog").count(), 0);
        } else if (surface === "cleanup") {
          const age = page.getByRole("textbox", { name: "Older than" });
          await age.fill("wrong");
          assert.equal(await age.getAttribute("aria-invalid"), "true");
          assert.equal(await page.getByRole("button", { name: "Archive old threads" }).isDisabled(), true);
          await age.fill("30d");
          const project = page.getByRole("checkbox", { name: "Customer workspace recovery and import verification" });
          await project.click();
          assert.equal(await page.getByText("Select at least one project.", { exact: true }).isVisible(), true);
          await project.focus(); await page.keyboard.press("Space");
          await project.evaluate(element => element.closest("label")?.scrollIntoView({ block: "center" }));
          await page.screenshot({ path: path.join(directory, `cleanup-project-${scenario.name}.png`) });
          const submit = page.getByRole("button", { name: "Archive old threads" });
          await submit.click();
          assert.equal(await page.getByRole("dialog").count(), 0);
          assert.match(await page.getByLabel("Fixture action").textContent() ?? "", /^archive:/);
        } else if (surface === "help") {
          const last = page.getByRole("button", { name: "Start Review plan and execute" });
          await last.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `help-last-walkthrough-${scenario.name}.png`) });
          await last.click();
          assert.equal(await page.getByRole("region", { name: "Selected walkthrough" }).isVisible(), true);
          assert.equal(await page.getByLabel("Fixture action").textContent(), "plan-review");
          await page.reload();
          await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
          await page.getByRole("button", { name: "Restart Open a project" }).focus(); await page.keyboard.press("Enter");
          assert.equal(await page.getByLabel("Fixture action").textContent(), "open-project");
        } else if (surface === "events") {
          const model = page.getByText(/^Model: openai/);
          await model.scrollIntoViewIfNeeded();
          assert.ok(await model.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
          await page.screenshot({ path: path.join(directory, `events-metadata-${scenario.name}.png`) });
          const details = page.locator("summary").filter({ hasText: "Event details" });
          await details.click();
          await page.getByText("Review the original selection before retrying.", { exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `events-detail-${scenario.name}.png`) });
          await details.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.locator("details[open]").count(), 0);
        } else if (surface === "plan") {
          const metadata = page.locator("summary").filter({ hasText: "Plan routing and models" });
          await metadata.click();
          const executor = page.getByText(/^Executor: openai/);
          await executor.scrollIntoViewIfNeeded();
          const bounds = await executor.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
          assert.ok(bounds.scrollWidth <= bounds.width + 1, "Plan model must wrap within its column");
          await page.screenshot({ path: path.join(directory, `plan-models-${scenario.name}.png`) });
          await metadata.focus(); await page.keyboard.press("Enter");
          await page.getByRole("button", { name: "Open the full execution plan" }).click();
          assert.equal(await page.getByRole("dialog").getByText("Summary", { exact: true }).isVisible(), true);
          await page.keyboard.press("Escape");
        } else if (surface === "subtasks") {
          const title = page.getByText("Verify retained customer workspace before retrying the interrupted import", { exact: true }).first();
          await title.scrollIntoViewIfNeeded();
          assert.ok(await title.evaluate(element => element.getBoundingClientRect().width >= 100), "Subtask identity needs a reading column, not one-letter wrapping");
          await page.getByText("Status: failed", { exact: true }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `subtasks-identity-${scenario.name}.png`) });
          const retry = page.getByRole("button", { name: "Retry this subagent" });
          await retry.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(directory, `subtasks-recovery-${scenario.name}.png`) });
          await retry.click();
          assert.equal(await page.getByLabel("Fixture action").textContent(), "run.retry");
          await retry.focus(); await page.keyboard.press("Enter");
        }
        await page.screenshot({ path: path.join(directory, `${surface}-destination-${scenario.name}.png`), fullPage: true });
      }
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ results, errors, scope: "Actual components with isolated typed state and intercepted commands; no providers, shell operations or live writes." }, null, 2));
} finally { await owned.close(); }
