import { browserExecutable, connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

function argument(name: string) { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; }
const harnessUrl = argument("--harness-url");
const editorUrl = argument("--editor-url");
const projectRoot = argument("--project-root");
const inspectReady = process.argv.includes("--inspect-ready");
const projectId = argument("--project-id");
if (!harnessUrl && !editorUrl) throw new Error("Pass a managed --harness-url or --editor-url.");
const output = resolve(argument("--out") ?? ".local/swarm/ui");
await mkdir(output, { recursive: true });
const owned = await connectHeadlessBrowser({ executable: browserExecutable(), connect: endpoint => chromium.connectOverCDP(endpoint) });
const results: unknown[] = [];
try {
  for (const host of [{ name: "harness", url: harnessUrl }, { name: "editor", url: editorUrl }]) {
    if (!host.url) continue;
    if (host.name === "harness" && projectRoot) {
      const status = await fetch(new URL("/api/desktop/v1/status", host.url));
      const capability: unknown = await status.json();
      if (!status.ok || typeof capability !== "object" || capability === null || !("sessionToken" in capability) || typeof capability.sessionToken !== "string") throw new Error("Harness desktop session capability unavailable.");
      const opened = await fetch(new URL("/api/desktop/v1/open", host.url), { method: "POST", headers: { "content-type": "application/json", "x-harness-session-token": capability.sessionToken }, body: JSON.stringify({ target: resolve(projectRoot) }) });
      if (!opened.ok) throw new Error(`Could not open the requested Harness project (${opened.status}).`);
    }
    const context = await owned.browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    try {
      await page.goto(host.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (host.name === "editor") {
        const projectCenter = page.getByRole("button", { name: "Close project center", exact: true });
        if (await projectCenter.isVisible()) await projectCenter.click();
        await page.getByRole("button", { name: "Open AI project actions", exact: true }).click({ timeout: 30_000 });
      }
      const launcher = page.locator(`[data-test-${host.name}-run-with-swarm]`);
      await launcher.click({ timeout: 30_000 });
      const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
      await dialog.waitFor();
      const picker = dialog.getByRole("button", {name:"Task run",exact:true});
      await picker.waitFor();
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-label="Task run"]')?.disabled);
      await picker.click(); await page.locator('[data-select-option=""]').click();
      if (!inspectReady) {
        await dialog.getByText(/Provider unavailable:/).waitFor({ timeout: 30_000 });
        if (!await dialog.getByRole("button", { name: "Prepare swarm plan", exact: true }).isDisabled()) throw new Error("Unavailable cloud must disable submission.");
      }
      await dialog.getByRole("button", {name:"Intelligence mode",exact:true}).waitFor();
      await dialog.getByRole("textbox", {name:"Done when",exact:true}).waitFor();
      const goal=dialog.getByRole("textbox",{name:"Engineering goal",exact:true});
      await goal.fill("Fix one malformed label");
      const limits=dialog.locator("summary").filter({hasText:"Limits and execution settings"});
      await limits.click();
      const workers=dialog.getByRole("spinbutton",{name:"Concurrent workers",exact:true});
      const minutes=dialog.getByRole("spinbutton",{name:"Run limit (minutes)",exact:true});
      const tokens=dialog.getByRole("spinbutton",{name:"Total run token ceiling",exact:true});
      if (await workers.inputValue()!=="1" || await minutes.inputValue()!=="30" || await tokens.inputValue()!=="250000") throw new Error("Bounded goal defaults were not applied.");
      await minutes.fill("17");
      await goal.fill("Compare three independent performance candidates");
      if (await workers.inputValue()!=="3" || await minutes.inputValue()!=="17" || await tokens.inputValue()!=="1000000") throw new Error("Comparison defaults replaced an explicit ceiling or failed to update untouched fields.");
      await limits.click();
      await page.screenshot({ path: resolve(output, `${host.name}-desktop.png`), fullPage: true });
      await dialog.getByRole("button", { name: "Refresh", exact: true }).click();
      if (!inspectReady) await dialog.getByText(/Provider unavailable:/).waitFor({ timeout: 30_000 });
      else await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent === "Prepare swarm plan" && !button.disabled),{},{timeout:60_000});
      await page.setViewportSize({ width: 390, height: 844 });
      const bounds = await dialog.boundingBox();
      if (!bounds || bounds.x < 0 || bounds.x + bounds.width > 391) throw new Error("Review dialog overflows the narrow viewport.");
      await page.screenshot({ path: resolve(output, `${host.name}-narrow.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await launcher.click();
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
      let staticPage = false;
      if (host.name === "harness" && projectId) {
        await page.goto(new URL(`/swarm?projectId=${encodeURIComponent(projectId)}`,host.url).href,{waitUntil:"domcontentloaded"});
        await page.getByRole("main",{name:"Run with Swarm"}).waitFor();
        await page.getByRole("textbox",{name:"Done when",exact:true}).waitFor();
        await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[aria-label="Task run"]')?.disabled,{},{timeout:60_000});
        if (inspectReady) await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent === "Prepare swarm plan" && !button.disabled),{},{timeout:60_000});
        if (await page.getByRole("dialog").count()) throw new Error("Static review unexpectedly opened a modal.");
        const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
        if (width.scroll>width.view+1) throw new Error("Static swarm page overflows the narrow viewport.");
        await page.screenshot({path:resolve(output,"harness-static-narrow.png"),fullPage:true});
        await page.setViewportSize({width:1440,height:1000});
        await page.screenshot({path:resolve(output,"harness-static-desktop.png"),fullPage:true});
        staticPage=true;
      }
      results.push({ host: host.name, url: host.url, providerUnavailable: !inspectReady, inspectionOnly:true, jobsLaunched:0, autoDefaults:true, manualCeilingPreserved:true, staticPage, refresh: true, narrowViewport: true, escapeAndReopen: true, pageErrors });
    } catch (error) {
      await page.screenshot({ path: resolve(output, `${host.name}-failure.png`), fullPage: true });
      throw new Error(`${host.name}: ${error instanceof Error ? error.message : error}. Visible page: ${(await page.locator("body").innerText()).slice(0, 1600)}`);
    } finally { await context.close(); }
  }
  await Bun.write(resolve(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
} finally { await owned.close(); }
