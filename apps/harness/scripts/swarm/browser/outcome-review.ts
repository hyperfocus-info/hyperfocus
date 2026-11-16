import { join } from "node:path";
import type { Page } from "playwright";

/** Uses the real managed host; the coordinator workload is explicitly simulated. */
export async function verifyOutcomeReview(options: { page: Page; surface: string; output: string }) {
  const { page, surface, output } = options;
  const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
  const outcome = dialog.locator("[data-test-task-review-outcome]");
  const summary = dialog.locator("summary").filter({ hasText: /^Outcome analysis$/ });
  await summary.focus(); await page.keyboard.press("Enter");
  await outcome.waitFor({ state: "visible" });
  await page.keyboard.press("Tab");
  if (await page.evaluate(() => document.activeElement?.textContent) !== "Interpretation and acceptance (3)") throw new Error("Keyboard navigation skipped the outcome interpretation disclosure.");
  await page.keyboard.press("Enter");
  await outcome.getByText("Observed problem and scope", { exact: true }).waitFor();
  await page.keyboard.press("Enter");
  const methods = outcome.locator("summary").filter({ hasText: /^Methods \(/ });
  await methods.click();
  await outcome.locator('[data-outcome-section="methods"]').getByText("Disposable fixture inspection", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.waitForFunction(() => { const picker = document.querySelector<HTMLButtonElement>('button[aria-label="Task run"]'); return picker && !picker.disabled; });
  await outcome.locator('[data-outcome-section="methods"]').getByText("Disposable fixture inspection", { exact: true }).waitFor();
  await summary.evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: join(output, `${surface}-outcome-desktop.png`), fullPage: true });
  await methods.click();
  const hypotheses = outcome.locator("summary").filter({ hasText: /^Hypotheses \(/ });
  await hypotheses.click();
  for (const status of ["supported", "contradicted", "inconclusive"]) await outcome.locator('[data-outcome-section="hypotheses"]').getByText(status, { exact: true }).waitFor();
  await hypotheses.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, `${surface}-outcome-hypotheses.png`), fullPage: true });
  await hypotheses.click();
  const experiments = outcome.locator("summary").filter({ hasText: /^Experiments \(/ });
  await experiments.click();
  const receipt = outcome.locator('[data-outcome-section="experiments"] button').first();
  await receipt.click();
  const preview = dialog.locator("[data-test-task-review-artifact] pre");
  await preview.waitFor();
  if (!(await preview.innerText()).includes("SIMULATED TEST WORKLOAD")) throw new Error("Outcome evidence did not reach the verified host artifact preview.");
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, `${surface}-outcome-evidence.png`), fullPage: true });
  await experiments.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, `${surface}-outcome-experiment.png`), fullPage: true });
  await experiments.click();
  const evaluations = outcome.locator("summary").filter({ hasText: /^Independent evaluations \(/ });
  await evaluations.click();
  await outcome.locator('[data-outcome-section="evaluations"]').getByText("failed", { exact: true }).waitFor();
  await evaluations.click();
  const learning = outcome.locator("summary").filter({ hasText: /^Learning \(/ });
  await learning.click();
  await outcome.getByText("This simulated review run", { exact: true }).waitFor();
  await learning.click();
  const decisions = outcome.locator("summary").filter({ hasText: /^Decision and limits \(/ });
  await decisions.click();
  const layouts = [];
  for (const layout of [{ name: "intermediate", width: 820, height: 900, text: 16 }, { name: "narrow", width: 390, height: 844, text: 16 }, { name: "narrow-enlarged", width: 390, height: 844, text: 32 }]) {
    await page.setViewportSize({ width: layout.width, height: layout.height });
    await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, layout.text);
    await summary.evaluate(element => element.scrollIntoView({ block: "start" }));
    const measured = await dialog.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const content = element.querySelector<HTMLElement>("[data-test-dialog-content]")!;
      const close = element.querySelector<HTMLElement>('button[aria-label="Close dialog"]')!.getBoundingClientRect();
      const review = element.querySelector<HTMLElement>("[data-test-task-review-outcome]")!;
      return { x: bounds.x, right: bounds.right, y: bounds.y, bottom: bounds.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: content.scrollWidth, contentWidth: content.clientWidth, closeBottom: close.bottom, headingSize: getComputedStyle(review.querySelector("p")!).fontSize, summaries: [...review.querySelectorAll("summary")].map(summary => summary.getBoundingClientRect().height) };
    });
    if (measured.x < 0 || measured.right > measured.viewportWidth + 1 || measured.y < 0 || measured.bottom > measured.viewportHeight + 1 || measured.closeBottom > measured.viewportHeight || measured.scrollWidth > measured.contentWidth + 1 || measured.summaries.some(height => height < 44)) throw new Error(`Outcome review overflows or loses its controls: ${JSON.stringify(measured)}`);
    layouts.push({ ...layout, measured });
    await page.screenshot({ path: join(output, `${surface}-outcome-${layout.name}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.removeProperty("font-size"); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await summary.focus(); await page.keyboard.press("Enter");
  await outcome.waitFor({ state: "hidden" });
  const touch = await verifyTouchOutcome(options);
  return { simulated: true, keyboardDisclosure: true, expandedAfterRefresh: true, hypothesesInspected: 3, independentEvaluations: true, runLocalLearning: true, verifiedEvidencePreview: true, layouts, touch };
}

async function verifyTouchOutcome(options: { page: Page; surface: string; output: string }) {
  const { page, surface, output } = options;
  const browser = page.context().browser();
  if (!browser) throw new Error("Outcome touch verification requires the owned browser.");
  const runLabel = await page.getByRole("button", { name: "Task run", exact: true }).innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, storageState: await page.context().storageState() });
  try {
    const touch = await context.newPage();
    await touch.goto(page.url(), { waitUntil: "domcontentloaded" });
    if (surface === "editor") {
      const center = touch.getByRole("button", { name: "Close project center", exact: true });
      if (await center.isVisible()) await center.click();
      await touch.getByRole("button", { name: "Open AI project actions", exact: true }).click();
    }
    await touch.locator(`[data-test-${surface}-run-with-swarm]`).tap();
    const dialog = touch.getByRole("dialog", { name: "Run with Swarm", exact: true });
    await dialog.getByRole("button", { name: "Task run", exact: true }).tap();
    await touch.getByRole("option").filter({ hasText: runLabel }).tap();
    await dialog.locator("summary").filter({ hasText: /^Outcome analysis$/ }).tap();
    const outcome = dialog.locator("[data-test-task-review-outcome]");
    await outcome.locator("summary").filter({ hasText: /^Decision and limits \(/ }).tap();
    const measured = await outcome.evaluate(element => ({ coarse: matchMedia("(pointer: coarse)").matches, summaries: [...element.querySelectorAll("summary")].map(summary => summary.getBoundingClientRect().height), pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }));
    if (!measured.coarse || measured.summaries.some(height => height < 44) || measured.pageWidth > measured.viewportWidth + 1) throw new Error(`Outcome touch targets or bounds failed: ${JSON.stringify(measured)}`);
    await dialog.locator("summary").filter({ hasText: /^Outcome analysis$/ }).evaluate(element => element.scrollIntoView({ block: "start" }));
    await touch.screenshot({ path: join(output, `${surface}-outcome-touch.png`), fullPage: true });
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).tap();
    await dialog.waitFor({ state: "hidden" });
    return measured;
  } finally { await context.close(); }
}
