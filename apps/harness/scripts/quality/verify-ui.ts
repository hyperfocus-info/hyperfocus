import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { inspectBrowserWindows } from "@hyperfocus/desktop-runtime/automation/windows-inspection";
import { chromium, type Page, type Locator } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fixturePath, installQualityUiFixture } from "./ui-fixture";
import { BUILT_IN_THEMES } from "../../ui/src/theme/theme-model";
import { getRelativeLuminance } from "@hyperfocus/ui/theme/contrast";

const url = process.env.HARNESS_URL;
if (!url) throw new Error("Set HARNESS_URL to the managed supervisor's returned URL");
const output = resolve(process.env.UI_EVIDENCE_OUTPUT ?? ".local/design-system/foundation-repair/harness");
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: object[] = [], errors: string[] = [];
let passed = false;
let activePage: Page | undefined;
let browserWindows: ReturnType<typeof inspectBrowserWindows> | undefined;
async function settle(page: Page) { await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))); }
async function contrast(locator: Locator) {
  const colors = await locator.evaluate(element => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Missing color evaluator");
    const ancestors: Element[] = []; for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, 1, 1);
    for (const ancestor of ancestors) { context.fillStyle = getComputedStyle(ancestor).backgroundColor; context.fillRect(0, 0, 1, 1); }
    const background = context.getImageData(0, 0, 1, 1).data;
    const style = getComputedStyle(element); context.fillStyle = style.color; context.fillRect(0, 0, 1, 1);
    const foreground = context.getImageData(0, 0, 1, 1).data;
    return { foreground: { r: foreground[0], g: foreground[1], b: foreground[2] }, background: { r: background[0], g: background[1], b: background[2] }, fontSize: style.fontSize, fontFamily: style.fontFamily };
  });
  const a = getRelativeLuminance(colors.foreground), b = getRelativeLuminance(colors.background);
  return { ...colors, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
}
try {
  browserWindows = inspectBrowserWindows({ pid: owned.pid });
  await Bun.write(`${output}/windows.json`, JSON.stringify(browserWindows, null, 2));
  if (browserWindows.visibleWindows.length) throw new Error("Owned browser exposed a visible window");
  for (const [size, width, height, scale] of [["desktop", 1440, 1000, ""], ["tablet", 820, 1000, ""], ["mobile", 390, 844, ""], ["scaled", 390, 1000, "200%"]] as const) {
    if (process.env.UI_EVIDENCE_SIZE && process.env.UI_EVIDENCE_SIZE !== size) continue;
    const page = await owned.browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" }); activePage = page;
    page.setDefaultTimeout(15_000); page.on("pageerror", error => errors.push(error.message));
    const fixture = await installQualityUiFixture(page);
    await page.goto(url); await page.locator("[data-test-empty-project]").waitFor();
    if (size === "desktop") {
      for (const theme of BUILT_IN_THEMES) for (const mode of ["light", "dark"] as const) {
        await page.evaluate(preference => localStorage.setItem("pi-harness:theme-preference:v1", JSON.stringify(preference)), { themeId: theme.id, mode });
        await page.reload(); await page.locator("[data-test-empty-project]").waitFor(); await settle(page);
        const primary = page.locator("[data-test-empty-project]").getByRole("button", { name: "Open project switcher", exact: true });
        await page.mouse.move(0, 0); const normal = await contrast(primary);
        await primary.hover(); const hover = await contrast(primary);
        const muted = await contrast(page.getByRole("tab", { name: "Jobs", exact: true }).filter({ visible: true }));
        const status = await contrast(page.getByRole("button", { name: "Pause new executions", exact: true }));
        if (normal.ratio < 4.5 || hover.ratio < 4.5 || muted.ratio < 4.5 || status.ratio < 4.5) throw new Error(`${theme.id}/${mode}: rendered contrast failed ${JSON.stringify({ normal, hover, muted, status })}`);
        results.push({ theme: theme.id, mode, normal, hover, muted, status });
      }
      await page.evaluate(() => localStorage.setItem("pi-harness:theme-preference:v1", JSON.stringify({ themeId: "harness", mode: "light" })));
      await page.reload(); await page.locator("[data-test-empty-project]").waitFor();
    }
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, scale); await settle(page);
    const empty = page.locator("[data-test-empty-project]");
    const open = empty.getByRole("button", { name: "Open project switcher", exact: true });
    const emptyGeometry = await open.boundingBox();
    if (!emptyGeometry || emptyGeometry.y + emptyGeometry.height > height || emptyGeometry.x < 0 || emptyGeometry.x + emptyGeometry.width > width) throw new Error(`${size}: first action is outside viewport`);
    if (await page.locator('[data-test-main-panel-grid] [data-panel-group-panel="navigation"]').count()) throw new Error(`${size}: empty navigation rail remains`);
    await page.screenshot({ path: `${output}/${size}-first-run.png` });
    await open.hover(); const tooltip = page.getByRole("tooltip").filter({ hasText: "Open project switcher" });
    await tooltip.waitFor(); await tooltip.hover(); await page.waitForTimeout(200);
    if (!await tooltip.isVisible()) throw new Error(`${size}: tooltip vanished when hovered`);
    await page.keyboard.press("Escape"); await tooltip.waitFor({ state: "hidden" });
    await open.click();
    const search = page.getByRole("textbox", { name: "Search projects or enter a folder path" });
    await search.fill(fixturePath);
    await page.getByRole("button", { name: `Create/open folder ${fixturePath}`, exact: true }).click();
    await page.locator("[data-test-empty-project]").waitFor({ state: "hidden" });
    await page.getByRole("textbox").filter({ visible: true }).last().waitFor(); await settle(page);
    if (!fixture.commands.some(command => command.type === "project.create")) throw new Error(`${size}: Open project did not reach the command boundary`);
    const effort = page.locator("[data-test-effort-trigger]").filter({ visible: true });
    const settings = await effort.count() ? effort : page.getByRole("button", { name: "More task settings", exact: true });
    await settings.click();
    const high = page.getByRole("button", { name: /^High/ }).filter({ visible: true });
    const popover = page.locator("[data-test-popover-content]").filter({ visible: true });
    await high.waitFor(); await settle(page);
    const overlay = await popover.boundingBox();
    if (!overlay || overlay.x < 0 || overlay.y < 0 || overlay.x + overlay.width > width + 1 || overlay.y + overlay.height > height + 1) throw new Error(`${size}: effort overlay escapes viewport: ${JSON.stringify(overlay)}`);
    await page.getByRole("button", { name: /^Medium/ }).filter({ visible: true }).click();
    if (await high.getAttribute("aria-pressed") === "true") throw new Error(`${size}: Medium selection did not replace High`);
    await high.click();
    if (await high.getAttribute("aria-pressed") !== "true") throw new Error(`${size}: effort selection did not persist`);
    const sizes = await high.evaluate(button => ({ option: getComputedStyle(button).fontSize, description: getComputedStyle(button.querySelector("span span:last-child") ?? button).fontSize,
      focused: button === document.activeElement }));
    const minimumText = scale ? 24 : 12;
    if (parseFloat(sizes.option) < minimumText || parseFloat(sizes.description) < minimumText || !sizes.focused) throw new Error(`${size}: effort option has unreadable type or lost focus`);
    await page.getByRole("button", { name: /^On/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: /^Off/ }).filter({ visible: true }).click();
    const scroll = await popover.evaluate(element => ({ top: element.scrollTop, height: element.clientHeight, content: element.scrollHeight }));
    if (scroll.content > scroll.height + 1) {
      await page.mouse.move(overlay.x + overlay.width / 2, overlay.y + Math.min(200, overlay.height / 2));
      await page.mouse.wheel(0, -3000); await page.waitForTimeout(150);
      if (await popover.evaluate(element => element.scrollTop) > 1) throw new Error(`${size}: effort choices cannot be reached by wheel`);
    }
    await page.screenshot({ path: `${output}/${size}-effort.png` });
    const activeTooltips = page.getByRole("tooltip").filter({ visible: true });
    if (await activeTooltips.count()) {
      await page.keyboard.press("Escape"); await activeTooltips.first().waitFor({ state: "hidden" });
      if (!await popover.isVisible()) throw new Error(`${size}: tooltip Escape also closed its popover`);
    }
    await page.keyboard.press("Escape");
    await popover.waitFor({ state: "hidden" });
    if (!await settings.evaluate(element => element === document.activeElement)) throw new Error(`${size}: effort Escape lost trigger focus`);
    const composer = page.locator("textarea").filter({ visible: true }).first();
    await composer.fill("Verify the navigation change without running a model.");
    await page.getByRole("button", { name: "Send task to Pi", exact: true }).click();
    await page.waitForTimeout(100);
    const sent = fixture.commands.find(command => command.type === "chat.send");
    if (sent?.type !== "chat.send" || sent.payload.reasoningStrength !== "high" || sent.payload.fastMode !== false) throw new Error(`${size}: composer selection did not reach send payload`);
    const details = page.locator('[data-panel-group-mode="run-details"]');
    if (await details.isVisible()) await details.click();
    const quality = page.getByRole("region", { name: "Quality verification", exact: true });
    await quality.locator("summary").first().click();
    await quality.locator("[data-quality-next-step]").waitFor();
    const pending = quality.locator("[data-quality-pending]");
    if (!(await pending.innerText()).includes("Keyboard focus returns correctly")) throw new Error(`${size}: pending quality requirements missing`);
    const failedRule = pending.locator('[data-quality-requirement="ui.interaction.focus-restoration"]');
    const qualityText = { heading: await contrast(failedRule.locator("h4")), reason: await contrast(failedRule.locator(":scope > p").first()) };
    if (qualityText.heading.ratio < 4.5 || qualityText.reason.ratio < 4.5) throw new Error(`${size}: populated quality contrast failed ${JSON.stringify(qualityText)}`);
    const passedDisclosure = quality.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Passed checks/ }) }).last();
    if (await passedDisclosure.getAttribute("open") !== null) throw new Error(`${size}: passed checks compete with unresolved work`);
    if (!await pending.evaluate(element => {
      const passed = [...element.parentElement!.querySelectorAll("details")].find(detail => detail.querySelector(":scope > summary")?.textContent?.startsWith("Passed checks"));
      return !!passed && !!(element.compareDocumentPosition(passed) & Node.DOCUMENT_POSITION_FOLLOWING);
    })) throw new Error(`${size}: pending requirements do not precede passed checks`);
    if ((await quality.innerText()).includes("foundation-task") || (await quality.innerText()).includes("ui.interaction")) throw new Error(`${size}: technical IDs visible before disclosure`);
    await pending.locator("li").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${size}-quality.png` });
    await pending.getByText("Technical evidence", { exact: true }).first().click();
    if (!(await pending.innerText()).includes("ui.interaction.focus-restoration")) throw new Error(`${size}: evidence is unavailable`);
    const navigation = page.locator('[data-panel-group-mode="navigation"]');
    if (await navigation.isVisible()) await navigation.click();
    if (!await page.getByRole("tab", { name: "Projects", exact: true }).filter({ visible: true }).count()) throw new Error(`${size}: project navigation disappeared`);
    const work = page.locator('[data-panel-group-mode="work"]');
    if (await work.isVisible()) await work.click();
    await composer.waitFor();
    const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    if (geometry.scrollWidth > geometry.width + 1) throw new Error(`${size}: page overflows horizontally`);
    results.push({ size, emptyGeometry, overlay, scroll, sizes, geometry, qualityText, commands: fixture.commands.map(command => command.type) });
    await page.close(); activePage = undefined;
  }
  if (errors.length) throw new Error(errors.join("; "));
  passed = true;
} catch (error) { errors.push(String(error)); if (activePage) { await activePage.screenshot({ path: `${output}/failure.png` }); await Bun.write(`${output}/failure.html`, await activePage.content()); } throw error; }
finally {
  try { await owned.browser.close(); } finally { await owned.close(); }
  if (browserWindows?.applicable) {
    const cleanup = inspectBrowserWindows({ pid: owned.pid, expectedProcesses: browserWindows.processes });
    await Bun.write(`${output}/cleanup.json`, JSON.stringify(cleanup, null, 2));
    if (cleanup.processes.length || cleanup.visibleWindows.length) { passed = false; errors.push("Owned browser remained after cleanup"); }
  }
  await Bun.write(`${output}/report.json`, JSON.stringify({ passed, url, results, errors,
    scope: "Real managed Harness UI with intercepted disposable workspace and command transport; no live model or filesystem mutation.",
    baseline: "before/desktop.png preserves the previously served compiled first-run state with this fixture. Other before states use historical audit captures; no exact quality/effort baseline was captured." }, null, 2));
  if (errors.length) throw new Error(errors.join("; "));
}
