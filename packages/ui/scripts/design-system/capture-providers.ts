import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const baseUrl = process.env.HARNESS_URL ?? "http://127.0.0.1:8787";
const output = process.env.DESIGN_EVIDENCE_DIR ?? ".local/design-system/providers";
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const report: object[] = [];
const errors: string[] = [];
// Capture only preferences. Other app regions may contain private project/terminal data.
const privacyStyle = "body * { visibility: hidden !important; } [data-test-preferences-panel], [data-test-preferences-panel] * { visibility: visible !important; }";
try {
  await mkdir(output, { recursive: true });
  if (process.platform === "win32") {
    const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
    if (inspection.exitCode !== 0) throw new Error(`Browser window inspection failed: ${inspection.stderr}`);
    await Bun.write(`${output}/browser-windows.json`, inspection.stdout);
  }
  const page = await owned.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(baseUrl);
  const settings = page.getByRole("tab", { name: "Settings", exact: true });
  await settings.waitFor({ state: "visible" });
  await settings.click();
  await page.getByRole("button", { name: "AI & Providers", exact: true }).click();
  const surface = page.locator("[data-test-ai-providers]");
  await surface.waitFor();
  const capturePanel = async (name: string) => {
    const bounds = await page.locator("[data-test-preferences-panel]").boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Preferences panel has no visible capture bounds.");
    const x = Math.max(0, bounds.x);
    const y = Math.max(0, bounds.y);
    await page.screenshot({ path: `${output}/${name}.png`, style: privacyStyle, clip: {
      x, y, width: Math.min(viewport.width, bounds.x + bounds.width) - x,
      height: Math.min(viewport.height, bounds.y + bounds.height) - y,
    } });
  };
  const fields = surface.locator('input[type="password"]');
  if (await fields.count() !== 3) throw new Error("Expected three masked provider fields.");
  for (const field of await fields.all()) {
    if (await field.inputValue()) throw new Error("Refusing to capture a provider draft. Use a fresh browser profile.");
  }
  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 820, 1000], ["mobile", 390, 844], ["wide", 2560, 1440]] as const) {
    await page.setViewportSize({ width, height });
    await surface.locator("h3").scrollIntoViewIfNeeded();
    const geometry = await surface.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      controls: [...element.querySelectorAll("button,input")].map(control => {
        const bounds = control.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, fontSize: getComputedStyle(control).fontSize };
      }) }));
    if (geometry.scrollWidth > geometry.clientWidth + 1) throw new Error(`${name}: provider content overflows horizontally.`);
    await capturePanel(`after-${name}`);
    report.push({ name, viewport: { width, height }, geometry });
    if (name === "mobile") {
      const lastSetting = surface.getByRole("checkbox").last();
      await lastSetting.scrollIntoViewIfNeeded();
      const reachable = await lastSetting.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
      });
      report.push({ mobileLastSettingReachable: reachable });
      if (!reachable) throw new Error("The last mobile preference is covered or cannot be scrolled into view.");
      await capturePanel("after-mobile-defaults");
    }
  }
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await surface.locator("h3").scrollIntoViewIfNeeded();
  if (await surface.evaluate(element => element.scrollWidth > element.clientWidth + 1)) throw new Error("Provider content overflows at 200% text size.");
  await capturePanel("after-text200");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.locator("#provider-openai-key").focus();
  await page.keyboard.press("Tab");
  if (await page.locator(":focus").getAttribute("aria-label") !== "Show OpenAI API key") throw new Error("Keyboard order does not reach key visibility control.");
  report.push({ keyboard: "Input followed by named visibility action", textScale: "200% without horizontal content overflow", credentials: "No draft values, tests, saves, or preference mutations" });
  await page.setViewportSize({ width: 390, height: 844 });
  await surface.locator('[data-provider-test-message="openai"]').evaluate(element => {
    element.textContent = "Fixture: Verbindung konnte nicht hergestellt werden. ".repeat(20);
  });
  await surface.locator('label[for="provider-openai-key"]').evaluate(element => {
    element.textContent = "OpenAI workspace connection / " + "OrganizationIdentifier".repeat(8);
  });
  await surface.locator("h3").scrollIntoViewIfNeeded();
  const longTextGeometry = await surface.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
    overflowing: [...element.querySelectorAll("*")].filter(child => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1)
      .map(child => ({ tag: child.tagName, width: child.getBoundingClientRect().width, wrap: getComputedStyle(child).overflowWrap })) }));
  if (longTextGeometry.scrollWidth > longTextGeometry.clientWidth + 1) throw new Error(`Long provider text overflows: ${JSON.stringify(longTextGeometry)}`);
  await capturePanel("after-mobile-long-text");
  report.push({ adversarial: "Synthetic long provider label and localized error wrap at 390px; no provider request or stored preference mutation" });
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ report, errors }, null, 2));
  await owned.browser.close();
  await owned.close();
}
