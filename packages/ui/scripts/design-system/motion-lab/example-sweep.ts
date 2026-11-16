import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { spawnBackgroundProcess, spawnBackgroundProcessSync, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const phase = process.env.DESIGN_CAPTURE_PHASE === "before" ? "before" : "after";
const output = `.local/design-system/evidence/example-controls/${phase}`;
await mkdir(output, { recursive: true });
const owner = await connectHeadlessBrowser({ executable: chromium.executablePath(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: unknown[] = [];
let completed = false;
try {
  for (const example of ["three-arena", "mmo-skill-demo"]) {
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("probe") });
    const port = probe.port!;
    const second = Bun.serve({ hostname: "127.0.0.1", port: port + 1, fetch: () => new Response("probe") });
    await probe.stop(true); await second.stop(true);
    const server = spawnBackgroundProcess({ cmd: [process.execPath, `packages/engine/examples/${example}/server.ts`], env: { ...process.env, PORT: String(port), STATIC_PORT: String(port + 1), THREE_ARENA_PORT: String(port), THREE_ARENA_WS_PORT: String(port + 1) }, stdout: "pipe", stderr: "pipe" });
    const page = await owner.browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      if (process.platform === "win32") {
        const inspection = spawnBackgroundProcessSync({ cmd: [process.execPath, resolve(import.meta.dir, "../../../../../scripts/process-policy/windows-inspection.ts"), String(owner.pid), String(server.pid)] });
        if (inspection.exitCode !== 0) throw new Error(inspection.stderr.toString());
        const windows = JSON.parse(inspection.stdout.toString());
        await Bun.write(`${output}/${example}-windows.json`, JSON.stringify({ visibleWindows: windows.visibleWindows }, null, 2));
        if (windows.visibleWindows.length) throw new Error("Visible automation window");
      }
      const url = example === "three-arena" ? `http://127.0.0.1:${port}/client.html` : `http://127.0.0.1:${port + 1}/examples/mmo-skill-demo/client.html`;
      for (let attempt = 0; attempt < 100; attempt++) {
        try { if ((await fetch(url)).ok) break; } catch { /* Owned example startup. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await page.goto(url);
      if (example === "mmo-skill-demo") {
        await page.locator("#character-name").fill("Design review");
        await page.getByRole("button", { name: "Log in", exact: true }).click();
        await page.locator("#login").waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.querySelectorAll("#ui .ce-mmo-tool").length === 6);
        await page.getByRole("button", { name: "Bag", exact: true }).click();
        await page.locator("#ui .ce-mmo-panel").waitFor({ state: "visible" });
      } else {
        await page.locator("canvas:visible").first().waitFor();
        await page.locator(".ce-asset-loader").waitFor({ state: "hidden", timeout: 60000 });
      }
      for (const [name, width, height, scale] of [["desktop", 1440, 1000, ""], ["mobile", 390, 844, ""], ["text200", 390, 844, "200%"]] as const) {
        await page.setViewportSize({ width, height });
        await page.evaluate(scale => { document.documentElement.style.fontSize = scale; }, scale);
        if (example === "mmo-skill-demo" && phase === "after") {
          await page.waitForFunction(() => {
            const canvas = document.querySelector<HTMLCanvasElement>("#game");
            return canvas && Math.abs(canvas.width - canvas.clientWidth) < 2;
          });
          results.push({ example, scenario: name, canvas: await page.locator("#game").evaluate(element => {
            if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected the game's canvas element.");
            return { backingWidth: element.width, displayedWidth: element.clientWidth, height: element.clientHeight };
          }) });
        }
        await page.screenshot({ path: `${output}/${example}-${name}.png` });
        const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth, containers: [...document.querySelectorAll(".menu:not(.hidden),#ui .ce-mmo-panel-body")].map(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth })) }));
        if (phase === "after" && (geometry.pageWidth > geometry.viewport || geometry.containers.some(item => item.scrollWidth > item.width))) {
          await Bun.write(`${output}/${example}-overflow.json`, JSON.stringify(await page.locator(".menu *").evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().right > innerWidth).map(element => ({ class: element.className, width: element.getBoundingClientRect().width, text: element.textContent?.slice(0, 80) }))), null, 2));
          throw new Error(`${example} ${name} horizontal overflow: ${JSON.stringify(geometry)}`);
        }
        results.push({ example, scenario: name, ...geometry });
      }
      await Bun.write(`${output}/${example}-text.txt`, await page.locator("body").innerText());
      if (phase === "after" && example === "mmo-skill-demo") {
        const icons = await page.locator(".ce-mmo-tool-icon svg").count();
        const broken = await page.locator("#ui img").evaluateAll(elements => elements.filter(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth === 0).length);
        if (icons !== 6 || broken) throw new Error(`MMO visual assets: ${icons} toolbar icons, ${broken} broken images`);
        results.push({ example, icons, broken });
      }
      results.push({ example, errors });
      if (errors.length) throw new Error(errors.join("; "));
    } catch (error) {
      await page.screenshot({ path: `${output}/${example}-failure.png` });
      await Bun.write(`${output}/${example}-failure.txt`, await page.locator("body").innerText());
      throw error;
    } finally { await page.close(); await terminateProcessTree({ process: server }); }
  }
  completed = true;
} finally {
  await Bun.write(`${output}/report.json`, JSON.stringify({ completed, phase, results }, null, 2));
  try { await owner.browser.close(); } finally { await owner.close(); }
}
