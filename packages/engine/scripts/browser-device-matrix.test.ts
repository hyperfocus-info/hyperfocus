import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium, firefox, webkit, type Browser } from "playwright";
import { connectHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { buildPortableProject } from "./build-project.ts";
import { createProjectStarter } from "../tooling/create-project-runtime.ts";
import "./smoke/playable-test-hook.ts";

const targets = [chromium, firefox, webkit];
const results: Array<{ engine: string; version: string; profile: string; artifactSha256: string }> = [];
const output = resolve(import.meta.dir, "../../../.local/engine-release/browser-matrix.json");
let completedTargets = 0;

beforeAll(async () => {
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify({ passed: false, status: "running", startedAt: new Date().toISOString() }));
});

afterAll(async () => {
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify({
    completedAt: new Date().toISOString(), platform: process.platform,
    passed: completedTargets === targets.length && results.length === targets.length * 2, results,
    scope: "Portable top-down HTML fixture; emulated viewports, not physical-device or npm-tarball certification.",
  }, null, 2));
  console.log(`Browser evidence: ${output}`);
});

test("all three required browser engines are installed", () => {
  const missing = targets.filter((target) => !existsSync(target.executablePath())).map((target) => target.name());
  expect(missing, "Run bun packages/engine/node_modules/playwright/cli.js install chromium firefox webkit").toEqual([]);
});

for (const target of targets) {
  test(`${target.name()} ships desktop and touch-mobile portable builds`, async () => {
    const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-browser-matrix-"));
    let server: ReturnType<typeof Bun.serve> | undefined;
    let browser: Browser | undefined;
    let owned: Awaited<ReturnType<typeof connectHeadlessBrowser<Browser>>> | undefined;
    try {
      if (target === chromium) {
        owned = await connectHeadlessBrowser({ executable: target.executablePath(), connect: (endpoint) => chromium.connectOverCDP(endpoint) });
        browser = owned.browser;
      } else {
        // Non-CDP engines use the repository-patched SDK's hidden process launch and cleanup.
        browser = await target.launch({ headless: true, timeout: 15_000 });
      }
      const projectRoot = join(temporary, "game");
      await createProjectStarter({ template: "top-down", outputDirectory: projectRoot, name: "Browser Matrix" });
      const built = await buildPortableProject(projectRoot, join(temporary, "game.html"));
      const html = await readFile(built.outputPath, "utf8");
      const artifactSha256 = createHash("sha256").update(html).digest("hex");
      server = Bun.serve({ hostname: "127.0.0.1", port: 0,
        fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }),
      });
      for (const profile of [
        { name: "desktop", width: 1280, height: 720, deviceScaleFactor: 1, hasTouch: false },
        { name: "touch-mobile", width: 390, height: 844, deviceScaleFactor: 3, hasTouch: true },
      ]) {
        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.deviceScaleFactor,
          hasTouch: profile.hasTouch,
          // Firefox supports touch and viewport emulation, but not Playwright's isMobile option.
          ...(target === firefox ? {} : { isMobile: profile.hasTouch }),
        });
        try {
          const page = await context.newPage();
          const errors: string[] = [];
          const requests: string[] = [];
          page.on("pageerror", (cause) => errors.push(cause.message));
          page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
          page.on("request", (request) => requests.push(request.url()));
          await page.goto(server.url.toString(), { waitUntil: "networkidle" });
          await page.waitForFunction(() => globalThis.__hyperfocusPlayable?.ready === true);
          await page.waitForFunction(() => (globalThis.__hyperfocusPlayable?.frameCount ?? 0) > 1);
          const layout = await page.evaluate(() => {
            const canvas = document.querySelector("canvas");
            if (!canvas) throw new Error("Portable build did not render a canvas.");
            const bounds = canvas.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height, viewportWidth: innerWidth,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              diagnostics: globalThis.__hyperfocusPlayable?.diagnostics ?? [] };
          });
          expect(layout.width).toBeGreaterThan(0);
          expect(layout.height).toBeGreaterThan(0);
          expect(layout.width).toBeLessThanOrEqual(layout.viewportWidth + 1);
          expect(layout.overflow).toBeLessThanOrEqual(1);
          expect(layout.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
          const before = await page.evaluate(() => globalThis.__hyperfocusPlayable?.snapshot());
          await page.keyboard.down("KeyD");
          await page.waitForFunction((previous) => {
            const current = globalThis.__hyperfocusPlayable?.snapshot();
            return current?.entities.some((entity) => {
              const prior = previous?.entities.find((item) => item.id === entity.id);
              // The shared proof declaration covers 3D snapshots; this fixture emits 2D x/y fields.
              const x = "x" in entity ? entity.x : undefined;
              const oldX = prior && "x" in prior ? prior.x : undefined;
              return typeof x === "number" && typeof oldX === "number" && x > oldX;
            });
          }, before);
          await page.keyboard.up("KeyD");
          if (profile.hasTouch) {
            await page.evaluate(() => document.addEventListener("pointerdown", (event) => {
              if (event.pointerType === "touch") document.documentElement.dataset.touchReceived = "true";
            }, { once: true }));
            await page.locator("canvas").tap();
            expect(await page.locator("html").getAttribute("data-touch-received")).toBe("true");
          }
          expect(errors).toEqual([]);
          const origin = new URL(server.url).origin;
          expect(requests.every((request) => new URL(request).protocol === "data:" || new URL(request).origin === origin)).toBe(true);
          results.push({ engine: target.name(), version: browser.version(), profile: profile.name, artifactSha256 });
        } finally { await context.close(); }
      }
    } finally {
      server?.stop(true);
      try { await browser?.close(); }
      finally {
        await owned?.close();
        // temporary is the exact absolute directory returned by mkdtemp, owned by this test.
        await rm(temporary, { recursive: true, force: true });
      }
    }
    completedTargets += 1;
  }, 90_000);
}
