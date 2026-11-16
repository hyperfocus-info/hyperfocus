import assert from "node:assert/strict";
import type { Page } from "playwright";
import { inspectAttention } from "../../../src/attention/inspect";

/** Compiled controls complement unit semantics with real pointer travel and layout. */
export async function verifyControlContracts({ page, url, output, width, scale }: { page: Page; url: string; output: string; width: number; scale: number }) {
  await page.goto(`${url}?controls`);
  await page.evaluate(value => { document.documentElement.style.fontSize = `${value}%`; }, scale);
  const help = page.locator("#hover-help");
  await help.hover();
  const tooltip = page.getByRole("tooltip");
  await tooltip.waitFor();
  const id = await tooltip.getAttribute("id");
  assert.deepEqual((await help.getAttribute("aria-describedby"))?.split(" "), ["existing-help", id]);
  assert.equal(await tooltip.evaluate(node => getComputedStyle(node).pointerEvents), "auto");
  await tooltip.hover();
  await page.waitForTimeout(200);
  assert.equal(await tooltip.isVisible(), true, "Pointer can cross the gap and remain over help");
  const tooltipBounds = await tooltip.boundingBox();
  assert.ok(tooltipBounds && tooltipBounds.x >= 0 && tooltipBounds.x + tooltipBounds.width <= width, "Long tooltip stays within the viewport");
  await page.screenshot({ path: `${output}/controls-${width}-${scale}-hover.png`, fullPage: true });
  await page.keyboard.press("Escape");
  assert.equal(await tooltip.count(), 0);
  assert.equal(await help.getAttribute("aria-describedby"), "existing-help");
  const competing = await page.evaluate(inspectAttention, { requireBranding: false });
  assert.equal(competing.primaryCount, 2);
  assert.ok(competing.violations.some(issue => issue.rule === "primary"), "Two actual primary controls fail the rendered inspector");
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await save.click();
  const error = page.getByRole("alert");
  const errorId = await error.getAttribute("id");
  await save.blur(); await save.focus();
  await tooltip.waitFor();
  assert.ok((await save.getAttribute("aria-describedby"))?.split(" ").includes(errorId!), "Real failed-save error remains associated while tooltip opens");
  const accessibility = await page.context().newCDPSession(page);
  let saveDescription: string | undefined;
  try {
    const { root } = await accessibility.send("DOM.getDocument");
    const { nodeId } = await accessibility.send("DOM.querySelector", { nodeId: root.nodeId, selector: `button[aria-describedby~="${errorId}"]` });
    const tree = await accessibility.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    const description = tree.nodes.find(node => node.role?.value === "button")?.description?.value;
    assert.equal(typeof description, "string");
    saveDescription = String(description);
    assert.ok(saveDescription.includes("Storage is unavailable. Try again."), "The browser accessibility tree exposes the failed-save description");
  } finally { await accessibility.detach(); }
  await page.keyboard.press("Escape");
  assert.equal(await save.getAttribute("aria-describedby"), errorId);
  await page.screenshot({ path: `${output}/controls-${width}-${scale}-save-error.png`, fullPage: true });
  await page.locator("#open-tooltip-review").click();
  const dialog = page.getByRole("dialog", { name: "Review controls", exact: true });
  const scoped = await page.evaluate(inspectAttention, { requireBranding: false });
  assert.equal(scoped.primaryCount, 1);
  assert.ok(!scoped.violations.some(issue => issue.rule === "primary"), "Modal priority is independent of background actions");
  await page.locator("#nested-tooltip-help").focus();
  await tooltip.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await tooltip.count(), 0);
  assert.equal(await dialog.isVisible(), true, "Tooltip Escape preserves the containing decision");
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator("#open-tooltip-review").evaluate(node => node === document.activeElement), true);
  return { hoverable: true, descriptionsPreserved: true, failedSaveAssociation: true, saveDescription, nestedEscape: true,
    priorityNegative: competing.violations.filter(issue => issue.rule === "primary"), modalPrimaryCount: scoped.primaryCount, tooltipBounds };
}
