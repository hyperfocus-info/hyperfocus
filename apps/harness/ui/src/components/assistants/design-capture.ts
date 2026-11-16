import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dir, "../../../../../..");
const phase = process.argv[2] ?? "after";
const directory = path.join(root, ".local/design-system", `next-assistants-${phase}`);
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
  for (const scenario of [{ name: "desktop", width: 1280, scale: 1 }, { name: "narrow", width: 390, scale: 1 }, { name: "text-200", width: 1280, scale: 2 }]) {
    const page = await owned.browser.newPage({ viewport: { width: scenario.width, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(directory, "dist/index.html")).href);
    await page.locator('[data-test-fixture-ready="1"]').waitFor();
    await page.evaluate(scale => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scenario.scale);
    for (const tab of ["Chat", "Todos", "Learnings"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click({ force: phase === "before" });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(directory, `${tab.toLowerCase()}-${scenario.name}.png`), fullPage: true });
      if (phase === "after" && tab === "Chat") {
        const viewport = page.locator('[data-test-virtual-list="assistant-chat-transcript"]');
        const bounds = await viewport.boundingBox();
        assert.ok(bounds && bounds.height >= 200 && bounds.height < 1000, `Chat must retain a bounded readable transcript: ${scenario.name} ${bounds?.height}`);
        const send = page.getByRole("button", { name: "Send message to assistant", exact: true });
        await send.scrollIntoViewIfNeeded();
        await send.click({ trial: true });
        await page.screenshot({ path: path.join(directory, `chat-composer-${scenario.name}.png`), fullPage: true });
        await page.locator("summary").filter({ hasText: "Working memory" }).click();
        assert.equal(await page.locator("details[open]").count(), 1);
        await page.locator("summary").filter({ hasText: "Working memory" }).click();
      }
      if (phase === "after" && tab === "Todos") {
        await page.getByLabel("New todo", { exact: true }).fill("Draft a recovery check");
        assert.equal(await page.getByRole("button", { name: "Add todo to assistant list" }).isEnabled(), true);
        await page.getByLabel("New todo", { exact: true }).fill("");
        assert.equal(await page.getByRole("button", { name: "Add todo to assistant list" }).isEnabled(), false);
        const target = page.getByRole("textbox", { name: "Work target for Review release setup and recovery for the customer workspace" });
        await target.scrollIntoViewIfNeeded();
        await target.click({ trial: true });
        await page.screenshot({ path: path.join(directory, `todos-controls-${scenario.name}.png`), fullPage: true });
      }
      if (phase === "after" && tab === "Learnings") {
        const action = page.getByRole("button", { name: /Delete learning Preserve/ });
        await action.scrollIntoViewIfNeeded();
        await action.click({ trial: true });
      }
      if (phase === "after") assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      results.push({ tab, ...scenario, geometry: await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })) });
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await Bun.write(path.join(directory, "report.json"), JSON.stringify({ results, errors, scope: "Isolated real assistant UI; seeded data; no provider sends or persisted commands" }, null, 2));
} finally { await owned.close(); }
