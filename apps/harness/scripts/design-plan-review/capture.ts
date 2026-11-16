import { stylexSolidPlugin } from "@hyperfocus/ui/build/stylex-solid-plugin";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcessSync } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

const phase = process.argv.includes("--before") ? "before" : "after";
const output = resolve(`.local/design-system/evidence/next-plan-review/${phase}`);
await mkdir(output, { recursive: true });
const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "fixture.tsx")], outdir: resolve(tmpdir(), "hyperfocus-plan-review-fixture"), target: "browser", format: "iife", plugins: [stylexSolidPlugin({ useCSSLayers: { before: ["reset"], prefix: "hyperfocus" }, importSources: ["@stylexjs/stylex"] })] });
if (!build.success) throw new AggregateError(build.logs, "Fixture build failed");
const js = await build.outputs.find(item => item.path.endsWith(".js"))!.text();
const css = (await Promise.all(build.outputs.filter(item => item.path.endsWith(".css")).map(item => item.text()))).join("\n");
const owned = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: unknown[] = [];
const errors: string[] = [];
try {
  const inspected = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve("scripts/process-policy/windows-inspection.ts"), String(owned.pid)] });
  const windows = JSON.parse(inspected.stdout.toString());
  await Bun.write(`${output}/browser-windows.json`, JSON.stringify({ visibleWindows: windows.visibleWindows }, null, 2));
  if (windows.visibleWindows.length) throw new Error("Browser has visible windows");
  const page = await owned.browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://plan-review.fixture/**", route => route.fulfill({ contentType: "text/html", body: `<html><head><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>` }));
  await page.goto("http://plan-review.fixture/");
  for (const [name, width, height, scale] of [["desktop",1440,1000,""],["narrow",390,844,""],["text200",820,1000,"200%"]] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(value => document.documentElement.style.fontSize = value, scale);
    await page.getByRole("button", { name: "Review plan", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Execution plan" });
    await dialog.waitFor();
    await page.screenshot({ path: `${output}/${name}.png` });
    const geometry = await dialog.evaluate(element => {
      const scroll = [...element.querySelectorAll("div")].find(child => getComputedStyle(child).overflow === "auto")!;
      return { width: element.clientWidth, scrollWidth: element.scrollWidth, viewport: innerWidth, readingWidth: scroll.clientWidth, readingScrollWidth: scroll.scrollWidth, readingHeight: scroll.clientHeight };
    });
    results.push({ name, geometry });
    if (phase === "after") {
      if (geometry.scrollWidth > geometry.width + 1 || geometry.readingScrollWidth > geometry.readingWidth + 1) throw new Error(`${name}: overflow`);
      const details = dialog.locator("summary", { hasText: "Run details" });
      await details.focus(); await page.keyboard.press("Enter");
      if (!await details.evaluate(element => element.parentElement?.hasAttribute("open"))) throw new Error("Keyboard disclosure failed");
      await dialog.getByText("Merge notes: Merge cleanly").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${name}-end.png` });
    }
    await page.keyboard.press("Escape");
    if (!await page.getByRole("button", { name: "Review plan", exact: true }).evaluate(element => element === document.activeElement)) throw new Error("Focus did not return");
  }
  if (phase === "after") {
    await page.getByRole("button", { name: "Review empty plan" }).click();
    await page.getByText("No contracts in this plan.").waitFor();
    await page.screenshot({ path: `${output}/empty.png` });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await Bun.write(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
} finally { await owned.close(); }
