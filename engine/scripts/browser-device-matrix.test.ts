import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import puppeteer, { type SupportedBrowser } from "puppeteer-core";
import { buildPortableProject } from "./build-project.ts";
import { createProjectStarter } from "./create-project.ts";

type BrowserTarget = { name: string; browser: SupportedBrowser; executablePath?: string };

const targets: BrowserTarget[] = [
  { name: "Chromium", browser: "chrome", executablePath: executable("CHROME_PATH", [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) },
  { name: "Firefox", browser: "firefox", executablePath: executable("FIREFOX_PATH", [
    "C:/Program Files/Mozilla Firefox/firefox.exe",
    "C:/Program Files (x86)/Mozilla Firefox/firefox.exe",
    "/usr/bin/firefox",
    "/Applications/Firefox.app/Contents/MacOS/firefox",
  ]) },
];

test("required browser engines are installed for the release matrix", () => {
  expect(targets.filter((target) => target.executablePath).map((target) => target.name)).toEqual(["Chromium", "Firefox"]);
});

for (const target of targets) {
  const verify = target.executablePath ? test : test.skip;
  verify(`${target.name} ships the portable build on desktop and touch-mobile profiles`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), `hyperfocus-browser-matrix-${target.browser}-`));
    let server: ReturnType<typeof Bun.serve> | undefined;
    const browser = await puppeteer.launch({
      browser: target.browser,
      executablePath: target.executablePath,
      headless: true,
      args: target.browser === "chrome" ? ["--no-first-run", "--disable-background-networking"] : [],
    });
    try {
      const projectRoot = join(temporary, "game");
      await createProjectStarter({ template: "top-down", outputDirectory: projectRoot, name: "Browser Matrix" });
      const built = await buildPortableProject(projectRoot, join(temporary, "game.html"));
      const html = await readFile(built.outputPath, "utf8");
      server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }),
      });

      for (const profile of [
        { name: "desktop", width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        { name: "touch-mobile", width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      ]) {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        const errors: string[] = [];
        const requests: string[] = [];
        page.on("pageerror", (cause) => errors.push(cause instanceof Error ? cause.message : String(cause)));
        page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
        page.on("request", (request) => requests.push(request.url()));
        await page.setViewport(profile);
        await page.goto(server.url.toString(), { waitUntil: "networkidle0" });
        await page.waitForFunction(() => (globalThis as any).__hyperfocusPlayable?.ready === true, { timeout: 15_000 });
        await page.waitForFunction(() => (globalThis as any).__hyperfocusPlayable?.frameCount > 1, { timeout: 5_000 });
        const layout = await page.evaluate(() => {
          const canvas = document.querySelector("canvas")!;
          const bounds = canvas.getBoundingClientRect();
          const hook = (globalThis as any).__hyperfocusPlayable;
          return {
            width: bounds.width,
            height: bounds.height,
            viewportWidth: document.documentElement.clientWidth,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            frames: hook.frameCount,
            diagnostics: hook.diagnostics,
          };
        });
        expect(layout.frames).toBeGreaterThan(1);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
        expect(layout.width).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        expect(layout.diagnostics.filter((item: { severity?: string }) => item.severity === "error")).toEqual([]);
        if (profile.hasTouch) {
          const canvas = await page.$("canvas");
          const box = await canvas?.boundingBox();
          if (!box) throw new Error("Portable build did not expose a touchable canvas.");
          await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.5);
        } else {
          await page.keyboard.press("KeyD");
        }
        expect(errors).toEqual([]);
        const origin = new URL(server.url).origin;
        expect(requests.every((request) => new URL(request).protocol === "data:" || new URL(request).origin === origin)).toBe(true);
        await context.close();
      }
    } finally {
      server?.stop(true);
      await browser.close();
      await rm(temporary, { recursive: true, force: true });
    }
  }, 45_000);
}

function executable(environmentName: string, candidates: readonly string[]): string | undefined {
  const explicit = process.env[environmentName];
  if (explicit && existsSync(explicit)) return explicit;
  return candidates.find((candidate) => existsSync(candidate));
}
