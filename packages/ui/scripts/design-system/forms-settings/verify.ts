import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { stylexSolidPlugin } from "../../../build-tools/stylex-solid-plugin";
import { inspectAttention } from "../../../src/attention/inspect";
import { verifyControlContracts } from "./controls";
import { verifyContextMenu } from './context-menu';

const output = resolve(process.argv[2] ?? ".local/design-system/navigation-2026-10-26/shared");
await mkdir(output, { recursive: true });
const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "fixture.tsx")], outdir: output, target: "browser", format: "iife", naming: "main.[ext]", plugins: [stylexSolidPlugin()] });
assert.ok(built.success, built.logs.map(String).join("\n"));
await Bun.write(`${output}/index.html`, '<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shared forms and settings regression</title><link rel="stylesheet" href="main.css"><body style="margin:0"><div id="root"></div><script src="main.js"></script></body></html>');
const owner = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const evidence: object[] = [], errors: string[] = [];
try {
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({
      cmd: [process.execPath, resolve(import.meta.dir, "../../../../../scripts/process-policy/windows-inspection.ts"), String(owner.pid)],
      cwd: resolve(import.meta.dir, "../../../../.."),
    });
    await Bun.write(`${output}/windows-processes.json`, inspection.stdout);
    assert.equal(inspection.exitCode, 0, `Browser window inspection failed: ${inspection.stderr}`);
  }
  for (const [width, scale] of [[1440, 100], [820, 100], [390, 100], [390, 200]] as const) {
    const context = await owner.browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(pathToFileURL(`${output}/index.html`).href);
      await page.evaluate(value => { document.documentElement.style.fontSize = `${value}%`; }, scale);
      const layout = await page.evaluate(() => {
        const field = document.querySelector<HTMLInputElement>('[aria-label="Name"]')!;
        const select = document.querySelector<HTMLButtonElement>('[aria-label="Reporting period"]')!;
        const action = document.getElementById("report-action")!;
        const controls = [field, select, action].map(node => { const rect = node.getBoundingClientRect(); return { top: rect.top, center: rect.top + rect.height / 2, bottom: rect.bottom, height: rect.height }; });
        const file = document.querySelector<HTMLElement>('[data-ui-file-input]')!;
        const fileParts = [file, file.querySelector<HTMLElement>('[data-ui-file-button]')!, file.querySelector<HTMLElement>('[data-ui-file-name]')!].map(node => { const rect = node.getBoundingClientRect(); return rect.top + rect.height / 2; });
        const nav = document.querySelector('nav[aria-label="Preference sections"]')!;
        return { controls, fileParts, fileHeight: file.getBoundingClientRect().height, inputWeight: getComputedStyle(field).fontWeight, selectWeight: getComputedStyle(select.querySelector("span")!).fontWeight, navDisplay: getComputedStyle(nav).display, overflow: document.documentElement.scrollWidth > innerWidth + 1, settingsHeight: document.querySelector('[data-ui-settings-workspace]')!.getBoundingClientRect().height };
      });
      assert.equal(layout.overflow, false, `Page overflow at ${width}/${scale}`);
      assert.ok(layout.settingsHeight <= 900, "Settings fit the host view");
      assert.equal(layout.inputWeight, "400"); assert.equal(layout.selectWeight, "400");
      assert.ok(Math.max(...layout.fileParts) - Math.min(...layout.fileParts) <= 1, "Chooser and filename are vertically centered");
      assert.ok(layout.fileHeight >= (width === 390 ? 44 : 36), "File input retains a usable target");
      if (width === 1440) assert.ok(Math.max(...layout.controls.map(control => control.center)) - Math.min(...layout.controls.map(control => control.center)) <= 1, "Labels/help must not displace aligned control centers");
      assert.equal(layout.navDisplay, width === 390 ? "none" : "grid");
      const fileButton = page.locator('[data-ui-file-button]');
      assert.equal(await fileButton.getAttribute("aria-hidden"), "true");
      await fileButton.evaluate(node => { node.style.transform = "translateY(20px)"; });
      const badFile = await page.evaluate(inspectAttention, { requireBranding: false });
      assert.ok(badFile.violations.some(violation => violation.rule === "file-alignment"), "Inspector rejects misaligned aria-hidden file copy in compiled FileInput");
      await fileButton.evaluate(node => node.style.removeProperty("transform"));
      const restoredFile = await page.evaluate(inspectAttention, { requireBranding: false });
      assert.ok(!restoredFile.violations.some(violation => violation.rule === "file-alignment"));
      const selectValue = page.locator('[aria-label="Reporting period"] [data-ui-select-value]');
      await selectValue.evaluate(node => { node.style.fontWeight = "700"; });
      const badValue = await page.evaluate(inspectAttention, { requireBranding: false });
      assert.ok(badValue.violations.some(violation => violation.rule === "input-weight"), "Inspector rejects a bold selected value in compiled SelectControl");
      await selectValue.evaluate(node => node.style.removeProperty("font-weight"));
      const restoredValue = await page.evaluate(inspectAttention, { requireBranding: false });
      assert.ok(!restoredValue.violations.some(violation => violation.rule === "input-weight"));
      const fileChooser = page.waitForEvent("filechooser");
      await page.getByLabel("Import songs", { exact: true }).click();
      await (await fileChooser).setFiles({ name: "selected-song.wav", mimeType: "audio/wav", buffer: Buffer.from("fixture") });
      assert.equal(await page.locator('[data-ui-file-name]').textContent(), "selected-song.wav");
      await page.screenshot({ path: `${output}/${width}-${scale}.png`, fullPage: true });
      await page.locator("#last-setting").click();
      const last = await page.locator("#last-setting").boundingBox();
      assert.ok(last && last.y >= 0 && last.y + last.height <= 900, "Last setting can be reached in content scroll");
      await page.locator("#open-details").click();
      await page.locator("#open-confirmation").click();
      assert.equal(await page.getByRole("dialog").count(), 2);
      const binding = page.getByRole("textbox", { name: "Confirmation note", exact: true });
      await binding.focus();
      await binding.evaluate(node => node.addEventListener("keydown", event => { event.preventDefault(); event.stopPropagation(); }, { once: true }));
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 2, "Direct focused handler can consume Escape");
      assert.equal(await binding.getAttribute("data-binding-state"), "capturing");
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 2, "Solid delegated keybinding cancellation keeps both dialogs open");
      assert.equal(await binding.getAttribute("data-binding-state"), "idle");
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.equal(await page.locator("#open-confirmation").evaluate(node => node === document.activeElement), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.locator("#open-details").evaluate(node => node === document.activeElement), true);
      await page.locator("#open-native").click();
      const native = page.getByRole("dialog", { name: "Native dialog", exact: true });
      await page.getByRole("textbox", { name: "Native binding", exact: true }).focus();
      await page.keyboard.press("Escape");
      assert.equal(await native.isVisible(), true, "Focused native-modal editor can cancel key capture");
      assert.equal(await native.getAttribute("data-native-cancels"), "0");
      await page.getByRole("button", { name: "Native period", exact: true }).click();
      assert.equal(await page.getByRole("listbox").evaluate(node => Boolean(node.closest("dialog[open]"))), true, "Popover stays in native modal top layer");
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("listbox").count(), 0);
      assert.equal(await native.isVisible(), true);
      assert.equal(await native.getAttribute("data-native-cancels"), "0", "Popup Escape does not reach native cancellation");
      await page.getByRole("checkbox", { name: "Keep native dialog open", exact: true }).check();
      await page.keyboard.press("Escape");
      assert.equal(await native.isVisible(), true, "Native cancel observer installed before registration can veto");
      assert.equal(await native.getAttribute("data-native-cancels"), "1");
      await page.getByRole("checkbox", { name: "Keep native dialog open", exact: true }).uncheck();
      await native.evaluate(node => node.addEventListener("cancel", event => event.preventDefault(), { once: true }));
      await page.keyboard.press("Escape");
      assert.equal(await native.isVisible(), true, "Native cancel observer installed after registration can veto");
      assert.equal(await native.getAttribute("data-native-cancels"), "2");
      assert.equal(await native.getAttribute("data-native-requests"), "0");
      await page.keyboard.press("Escape");
      assert.equal(await native.isVisible(), false);
      // close is a queued native event: the host callback runs once it is delivered.
      await page.waitForFunction(() => document.querySelector('dialog[aria-label="Native dialog"]')?.getAttribute("data-native-requests") === "1");
      assert.equal(await page.locator('dialog[aria-label="Native dialog"]').getAttribute("data-native-cancels"), "3");
      assert.equal(await page.locator("#open-native").evaluate(node => node === document.activeElement), true);
      const controls = await verifyControlContracts({ page, url: pathToFileURL(`${output}/index.html`).href, output, width, scale });
      const contextMenu = await verifyContextMenu({ page, url: pathToFileURL(`${output}/index.html`).href, output, width, scale });
      evidence.push({ width, scale, ...layout, controls, contextMenu, negativeProbes: { file: badFile.violations, selectedValue: badValue.violations }, escape: { directControl: true, delegatedControl: true, nativeControl: true, nativeCancelVetoBeforeAndAfter: true, nativePopup: true } });
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
} catch (error) { errors.push(String(error)); throw error; }
finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ evidence, errors, scope: "Compiled shared primitives; parent verifies actual app consumers." }, null, 2));
  try { await owner.browser.close(); } finally { await owner.close(); }
}
console.log(`Verified ${evidence.length} shared forms/settings layouts and nested overlay journeys.`);
