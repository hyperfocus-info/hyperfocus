import type { Page } from "playwright";
import { fixtureJobs, type installJobsFixture } from "./jobs-fixture";

export async function checkJobs(options: { page: Page; output: string; fixture: Awaited<ReturnType<typeof installJobsFixture>> }) {
  const { page, output, fixture } = options;
  const results: unknown[] = [];
  const roster = page.locator('[data-panel-group-panel="navigation"] [data-test-background-jobs-panel]');
  const details = page.locator('[data-panel-group-panel="work"] [data-test-background-jobs-panel]');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const search = page.getByLabel("Search jobs", { exact: true });
  await search.fill("zzzzzz-no-match");
  await roster.getByText(/No .*match/).waitFor();
  await page.screenshot({ path: `${output}/search-empty.png` });
  await search.fill("Refresh dependency");
  const row = roster.locator('[data-test-job-id="design-job-1"]');
  await row.waitFor();
  await row.getByRole("button", { name: "Select Refresh dependency inventory", exact: true }).focus();
  await page.keyboard.press("Enter");
  await details.getByRole("heading", { name: "Refresh dependency inventory", exact: true }).waitFor();
  if (await row.locator('[aria-current="true"]').count() !== 1) throw new Error("Selected job does not expose aria-current.");
  const menu = row.getByRole("button", { name: "Actions for Refresh dependency inventory", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  const run = page.getByRole("menuitem", { name: "Run now", exact: true });
  if (await run.getAttribute("aria-disabled") !== "true" && !await run.isDisabled()) throw new Error("Execution pause is not represented in the job menu.");
  await page.keyboard.press("Escape");
  if (!await menu.evaluate(element => document.activeElement === element)) throw new Error("Job action menu did not restore keyboard focus.");
  await row.getByRole("button", { name: "Add Refresh dependency inventory to bulk selection", exact: true }).click();
  if (await row.getByRole("button", { name: "Remove Refresh dependency inventory from bulk selection", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("Bulk selection is not exposed as pressed.");
  await row.getByRole("button", { name: "Remove Refresh dependency inventory from bulk selection", exact: true }).click();
  results.push({ keyboardSelection: true, searchMatchesDetail: true });
  await search.fill("");
  const list = roster.locator("[data-test-virtual-list]");
  const initialMounted = await roster.locator("[data-test-job-id]").count();
  for (let index = 0; index < 8; index++) {
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const endMounted = await roster.locator("[data-test-job-id]").count();
  const endIds = await roster.locator("[data-test-job-id]").evaluateAll(elements => elements.map(element => element.getAttribute("data-test-job-id")));
  if (initialMounted > 50 || endMounted > 50 || !endIds.includes("design-job-119")) throw new Error(`Virtualized roster did not reach the end with bounded rows: ${JSON.stringify({ initialMounted, endMounted, endIds })}`);
  results.push({ virtualizedJobs: 120, initialMounted, endMounted, reachesFinalJob: true });
  await page.screenshot({ path: `${output}/large-list-end.png` });
  await list.evaluate(element => { element.scrollTop = 0; });
  await search.fill("overnight");
  await roster.getByRole("button", { name: "Select Review overnight build failures", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-panel-group-mode="navigation"]').click();
  await page.getByRole("button", { name: "Filter and sort jobs", exact: true }).click();
  await page.screenshot({ path: `${output}/mobile-filters.png` });
  await page.keyboard.press("Escape");
  await search.fill("");
  fixture.update([{ ...fixtureJobs[0]!, consecutiveFailureCount: 2, backoffUntil: "2099-09-20T10:00:00.000Z", lastFailureCategory: "controller-lost", schedulerStatus: "blocked", schedulerDetail: "The previous worker disconnected. Automatic retry is delayed." }]);
  await roster.getByText(/failures|backoff|retry/i).first().waitFor();
  results.push(await inspectJobsGeometry(page, "blocked-job"));
  await page.screenshot({ path: `${output}/mobile-blocked.png` });
  fixture.update([{ ...fixtureJobs[0]!, name: "Arbeitsbereichsüberprüfungsauftrag".repeat(6), description: "Very long localization-like report summary. ".repeat(15) }]);
  await roster.getByRole("button", { name: /^Select Arbeitsbereich/ }).waitFor();
  await roster.getByRole("button", { name: /^Select Arbeitsbereich/ }).click();
  results.push(await inspectJobsGeometry(page, "long-name"));
  await page.screenshot({ path: `${output}/mobile-long-name.png` });
  await page.locator('[data-panel-group-mode="work"]').click();
  results.push(await inspectJobsGeometry(page, "long-detail"));
  await page.screenshot({ path: `${output}/mobile-long-detail.png` });
  const finalSection = details.getByText("Execution log", { exact: true });
  await finalSection.scrollIntoViewIfNeeded();
  const finalSectionReachable = await finalSection.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return bounds.top >= 0 && bounds.bottom <= innerHeight && !!hit && (element.contains(hit) || hit.contains(element));
  });
  if (!finalSectionReachable) throw new Error("The final execution-log section cannot be reached in the long mobile detail.");
  results.push({ longDetailFinalSectionReachable: true });
  await page.screenshot({ path: `${output}/mobile-long-detail-end.png` });
  fixture.clear();
  await page.locator('[data-panel-group-mode="navigation"]').click();
  await roster.getByText(/No scheduled|No jobs/).first().waitFor();
  await page.screenshot({ path: `${output}/empty.png` });
  results.push({ emptyFixture: true, longLocalizedText: true, realMutations: false });
  fixture.update();
  return results;
}

export async function inspectJobsGeometry(page: Page, name: string) {
  const panels = await page.locator("[data-test-background-jobs-panel]").evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
    const rect = element.getBoundingClientRect();
    return { width: element.clientWidth, scrollWidth: element.scrollWidth, left: rect.left, right: rect.right, bottom: rect.bottom };
  }));
  const viewport = page.viewportSize()!;
  if (panels.some(panel => panel.scrollWidth > panel.width + 1 || panel.left < 0 || panel.right > viewport.width + 1 || panel.bottom > viewport.height + 1)) throw new Error(`${name}: jobs panel overflow ${JSON.stringify(panels)}`);
  return { name, viewport, panels };
}
