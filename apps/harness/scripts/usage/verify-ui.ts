import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { startManagedServer } from "@hyperfocus/desktop-runtime/automation/managed-server";
import { inspectBrowserWindows } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createWorkspaceRepository } from "../../cli/src/workspace-repository";
import { createEmptyTokenUsageTotals } from "../../cli/src/usage/token-usage";
import { recordServerTokenUsage } from "../../cli/src/server/transport/events";

// Real host, disposable persisted usage, official read-only account quota probe.
const growth = process.argv.includes("--growth");
const root = path.resolve(import.meta.dir, "../../../..");
const output = path.join(root, ".local/codex-usage/browser", crypto.randomUUID());
const projectRoot = path.join(output, "usage-project");
mkdirSync(projectRoot, { recursive: true });
const dbPath = path.join(output, "workspace.sqlite");
const repository = createWorkspaceRepository(dbPath, projectRoot);
const project = repository.addProject(projectRoot);
repository.renameThread(project.id, project.activeThreadId, "Implement usage display");
repository.setGlobalExecutionPaused(true);
const session = createEmptyTokenUsageTotals();
for (const [sourceKind, sourceLabel, inputTokens, outputTokens] of [
  ["main", "Main implementation", 12000, 3000], ["subagent", "Review usage accounting", 4000, 1000]
] as const) recordServerTokenUsage(repository, session, {
  sourceKind, sourceLabel, modelId: "openai/gpt-6.1-sol", inputTokens, totalProcessedTokens: inputTokens + outputTokens,
  cachedInputTokens: inputTokens / 2, contextWindow: 400000, updatedAt: new Date().toISOString()
}, { projectId: project.id, threadId: project.activeThreadId, runtime: "codex" });
if (growth) {
  for (let index = 0; index < 150; index++) recordServerTokenUsage(repository, session, {
    sourceKind: "main", sourceLabel: `Growth source ${index}`, modelId: "openai/gpt-6.1-sol", inputTokens: 12,
    totalProcessedTokens: 20, cachedInputTokens: 5, contextWindow: 400000, updatedAt: "2026-11-16T00:00:00Z"
  }, { projectId: project.id, threadId: `growth-thread-${index}`, runtime: "codex" });
  repository.addTokenUsageLifetime(createEmptyTokenUsageTotals({ inputTokens: 40, totalProcessedTokens: 40, totalTokensIncludingCached: 40 }));
}
repository.close();
const server = await startManagedServer({ supervisor: { command: [process.execPath, path.join(root, ".agents/skills/dev-server/scripts/dev.ts")], cwd: root },
  surface: "harness", healthPath: "/", env: { HARNESS_DB_PATH: dbPath, HARNESS_UI_OUTPUT_DIR: path.join(output, "ui-dist") } });
let owned: Awaited<ReturnType<typeof connectHeadlessBrowser<import("playwright").Browser>>> | undefined;
let page: import("playwright").Page | undefined;
const errors: string[] = [];
try {
  owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
  const windows = inspectBrowserWindows({ pid: owned.pid });
  if (windows.visibleWindows.length) throw Error("Verification browser exposed a visible window");
  page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(25000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url);
  const trigger = page.getByRole("button", { name: "Open Codex usage", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Codex usage", exact: true });
  await dialog.locator('[data-test-usage-local]').waitFor();
  await page.waitForFunction(() => { const button = document.querySelector('[aria-label="Refresh account limits from Codex"]'); return button && !button.hasAttribute("disabled"); }, undefined, { timeout: 45000 });
  const liveLimits = await dialog.locator('[data-test-usage-window]').count();
  await dialog.locator('[data-test-usage-sources] summary').click();
  await dialog.getByText("Review usage accounting", { exact: true }).waitFor();
  if (await dialog.locator('[data-test-usage-source]').count() !== (growth ? 100 : 2)) throw Error("Missing persisted source breakdown");
  if (growth) {
    await dialog.getByText(/52 additional sources are aggregated/).waitFor();
    await dialog.getByText("Unknown attribution: 40 lifetime tokens.", { exact: true }).waitFor();
  }
  await page.screenshot({ path: path.join(output, "desktop.png") });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.screenshot({ path: path.join(output, "enlarged.png") });
  const enlarged = await dialog.boundingBox();
  if (!enlarged || enlarged.x < -1 || enlarged.x + enlarged.width > 1441 || enlarged.y < -1 || enlarged.y + enlarged.height > 1001) throw Error("Enlarged usage dialog exceeds viewport");
  if (await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1)) throw Error("Enlarged usage dialog overflows");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  const limitsBefore = await dialog.locator('[data-test-usage-window]').allTextContents();
  await dialog.getByRole("button", { name: "Reset token usage", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Reset token usage", exact: true });
  await confirmation.getByText("This does not restore Codex account quota.", { exact: false }).waitFor();
  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "hidden" });
  if (!await dialog.isVisible()) throw Error("Nested Escape closed the usage modal");
  await page.setViewportSize({ width: 390, height: 844 });
  if (growth) await dialog.locator('[data-test-usage-sources] summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "phone.png") });
  const box = await dialog.boundingBox();
  if (!box || box.x < -1 || box.x + box.width > 391 || box.y < -1 || box.y + box.height > 845) throw Error("Usage dialog exceeds phone viewport");
  const overflow = await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1);
  if (overflow) throw Error("Usage dialog overflows horizontally");
  await dialog.getByRole("button", { name: "Reset token usage", exact: true }).click();
  await confirmation.getByRole("button", { name: "Confirm local counter reset; account quota is unchanged", exact: true }).click();
  await confirmation.waitFor({ state: "hidden" });
  await dialog.getByText("No attributed sources available.", { exact: false }).waitFor();
  if (JSON.stringify(await dialog.locator('[data-test-usage-window]').allTextContents()) !== JSON.stringify(limitsBefore)) throw Error("Local reset changed provider quota");
  // Focus return can open the reset button tooltip; Escape dismisses that newer overlay first.
  if (await page.getByRole("tooltip").first().isVisible()) {
    await page.keyboard.press("Escape");
    if (!await dialog.isVisible()) throw Error("Tooltip Escape closed its parent dialog");
  }
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  if (!await trigger.evaluate(element => element === document.activeElement)) throw Error("Usage close did not return focus");
  await page.reload();
  await trigger.click();
  await dialog.getByText("Last reset:", { exact: false }).waitFor();
  const stored = createWorkspaceRepository(dbPath, projectRoot);
  try {
    const totals = stored.getTokenUsageState(createEmptyTokenUsageTotals());
    if (totals.lifetime.totalProcessedTokens !== 0 || totals.sources?.length || !totals.resetAt) throw Error("Reset did not persist");
  } finally { stored.close(); }
  if (errors.length) throw Error(errors.join("\n"));
  await Bun.write(path.join(output, "receipt.json"), JSON.stringify({ passed: true, serverId: server.id, liveAccountWindows: liveLimits,
    persistedSources: growth ? 152 : 2, boundedSources: growth ? 100 : 2, aggregatedSources: growth ? 52 : 0, nestedEscape: true, focusReturned: true, phoneBounds: true, enlargedBounds: true, resetPersisted: true,
    accountQuotaPreserved: true, visibleWindows: windows.visibleWindows, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, output, liveAccountWindows: liveLimits }));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png") });
    await Bun.write(path.join(output, "failure.txt"), `${String(error)}\n${await page.locator("body").innerText()}`);
  }
  throw error;
} finally {
  await owned?.close();
  await server.close();
}
