import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import puppeteer from "puppeteer-core";
import { createProjectStarter } from "../tooling/create-project.ts";
import { buildPortableProject } from "./build-project.ts";
import "./smoke/playable-test-hook.ts";

test("3d-action clean Chromium journey renders, moves, saves, reloads, and stays offline", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "hyperfocus-3d-browser-"));
  let server: ReturnType<typeof Bun.serve> | undefined;
  const browser = await puppeteer.launch({
    executablePath: chromeExecutable(), headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--disable-software-rasterizer=false", "--no-first-run"],
  });
  try {
    const root = join(temporary, "game");
    await createProjectStarter({ template: "3d-action", outputDirectory: root, name: "Browser 3D Evidence" });
    const built = await buildPortableProject(root, join(temporary, "game.html"));
    const html = await readFile(built.outputPath, "utf8");
    const activeServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }) });
    server = activeServer;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    const requests: string[] = [], errors: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (cause) => errors.push(cause instanceof Error ? cause.message : String(cause)));
    page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
    await page.goto(activeServer.url.toString(), { waitUntil: "networkidle0" });
    await page.waitForFunction(() => globalThis.__hyperfocusPlayable?.ready === true, { timeout: 15_000 });
    const rendered = await page.evaluate(() => {
      const hook = globalThis.__hyperfocusPlayable;
      if (!hook) throw new Error("Playable hook was not installed.");
      return { mode: hook.renderMode, frames: hook.frameCount, stats: hook.rendererStats };
    });
    expect(rendered.mode).toBe("webgl2-3d");
    expect(rendered.frames).toBeGreaterThan(0);
    expect(rendered.stats).toMatchObject({ drawCalls: 2, instances: 5, triangles: 60, contextLost: false });
    const screenshot = Buffer.from(await page.screenshot({ type: "png" })).toString("base64");
    const colored = await page.evaluate(async (source) => {
      const image = new Image(); image.src = source; await image.decode();
      const copy = document.createElement("canvas"); copy.width = image.width; copy.height = image.height;
      const context = copy.getContext("2d");
      if (!context) throw new Error("Browser did not provide a 2D canvas context.");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) if (pixels[index] > 30 || pixels[index + 1] > 40 || pixels[index + 2] > 55) count += 1;
      return count;
    }, `data:image/png;base64,${screenshot}`);
    expect(colored).toBeGreaterThan(1_000);

    const before = await actorX(page);
    await page.keyboard.down("KeyD"); await Bun.sleep(350); await page.keyboard.up("KeyD");
    const moved = await actorX(page);
    expect(moved).toBeGreaterThan(before + 0.5);
    await page.waitForFunction(() => globalThis.__hyperfocusPlayable?.audioUnlocked?.() === true, { timeout: 5_000 });
    expect(await page.evaluate(() => globalThis.__hyperfocusPlayable?.diagnostics.filter((item) => item.code?.startsWith("audio-")).length ?? -1)).toBe(0);
    await page.evaluate(() => {
      const hook = globalThis.__hyperfocusPlayable;
      if (!hook) throw new Error("Playable hook was not installed.");
      hook.save();
    });
    await page.keyboard.down("KeyD"); await Bun.sleep(250); await page.keyboard.up("KeyD");
    expect(await actorX(page)).toBeGreaterThan(moved);

    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => globalThis.__hyperfocusPlayable?.ready === true, { timeout: 15_000 });
    expect(await actorX(page)).toBeCloseTo(moved, 4);
    expect(errors).toEqual([]);
    expect(requests.every((url) => new URL(url).protocol === "data:" || new URL(url).origin === activeServer.url.origin)).toBe(true);
    expect(requests.filter((url) => new URL(url).protocol !== "data:" && new URL(url).pathname !== "/")).toEqual([]);
    await context.close();
  } finally {
    server?.stop(true);
    await browser.close();
    await rm(temporary, { recursive: true, force: true });
  }
}, 30_000);

async function actorX(page: import("puppeteer-core").Page): Promise<number> {
  return page.evaluate(() => {
    const hook = globalThis.__hyperfocusPlayable;
    if (!hook) throw new Error("Playable hook was not installed.");
    const actor = hook.snapshot().entities.find((item) => item.id === "actor");
    const x = actor?.position[0];
    if (typeof x !== "number") throw new Error("Playable snapshot did not contain the actor x position.");
    return x;
  });
}

function chromeExecutable(): string {
  const explicit = process.env.CHROME_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const root = join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const found = findFirst(root, "chrome-headless-shell.exe");
  if (found) return found;
  for (const path of ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]) if (existsSync(path)) return path;
  throw new Error("No Chromium executable found; set CHROME_PATH to run 3D acceptance.");
}

function findFirst(root: string, filename: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    if (!directory) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) pending.push(path); else if (entry.name === filename) return path; }
  }
}
