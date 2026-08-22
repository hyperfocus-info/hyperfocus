import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

function findFirst(root: string, filename: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop() as string;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name === filename) return path;
    }
  }
  return undefined;
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

const port = 18_796;
const url = `http://127.0.0.1:${port}/`;
const root = resolve(import.meta.dir, "../..");
const browserPath = process.env.CHROME_PATH
  ?? findFirst(join(process.env.LOCALAPPDATA ?? "", "ms-playwright"), "chrome-headless-shell.exe");
if (!browserPath) throw new Error("No headless Chromium found. Set CHROME_PATH to its executable.");
const server = Bun.spawn([process.execPath, resolve(import.meta.dir, "server.ts")], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdout: "pipe",
  stderr: "pipe"
});

try {
  await waitForServer(url);
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--disable-software-rasterizer=false"]
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 });
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error instanceof Error ? error.message : String(error)));
    await page.goto(url, { waitUntil: "networkidle0" });
    try {
      await page.waitForFunction("window.__firstParty3D && window.__firstParty3D.ready === true", { timeout: 15_000 });
    } catch (error) {
      const state = await page.evaluate(() => {
        const fixture = (window as unknown as { __firstParty3D?: { error?: string; ready?: boolean } }).__firstParty3D;
        return { error: fixture?.error, ready: fixture?.ready, status: document.querySelector("#status")?.textContent };
      });
      throw new Error(`WebGL2 fixture did not become ready: ${JSON.stringify(state)}\n${browserErrors.join("\n")}`, { cause: error });
    }
    const glError = await page.evaluate(() => document.querySelector("canvas")?.getContext("webgl2")?.getError() ?? -1);
    if (glError !== 0) throw new Error(`WebGL2 reported error 0x${glError.toString(16)} before acceptance capture.`);
    const poseBefore = await page.evaluate(() => (window as unknown as { __firstParty3D: { snapshot(): { pose: number } } }).__firstParty3D.snapshot().pose);
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    const poseAfter = await page.evaluate(() => (window as unknown as { __firstParty3D: { snapshot(): { pose: number } } }).__firstParty3D.snapshot().pose);
    if (Math.abs(poseAfter - poseBefore) < 0.01) throw new Error(`Skeletal palette did not animate: ${poseBefore} -> ${poseAfter}`);
    const outputDirectory = resolve(root, ".local/first-party-3d-webgl");
    mkdirSync(outputDirectory, { recursive: true });
    await page.screenshot({ path: resolve(outputDirectory, "acceptance-before-restore.png") });
    const recovery = await page.evaluate(() => (window as unknown as {
      __firstParty3D: { contextRoundTrip(): Promise<{ supported: boolean; generation: number }> };
    }).__firstParty3D.contextRoundTrip());
    const snapshot = await page.evaluate(() => (window as unknown as { __firstParty3D: { snapshot(): unknown } }).__firstParty3D.snapshot());
    if (browserErrors.length > 0) throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
    const metrics = snapshot as {
      draws: number; instances: number; triangles: number; width: number; height: number;
      textureUploads: number; ambientLights: number; directionalLights: number; shadowDraws: number;
      paletteUploads: number; skinnedDraws: number; skinnedInstances: number; pose: number;
    };
    if (metrics.draws < 1 || metrics.instances < 1 || metrics.triangles < 1 || metrics.width < 1 || metrics.height < 1) {
      throw new Error(`Invalid WebGL2 acceptance snapshot: ${JSON.stringify(metrics)}`);
    }
    if (metrics.textureUploads < 1 || metrics.ambientLights < 1 || metrics.directionalLights < 1) {
      throw new Error(`Lit texture path was not exercised: ${JSON.stringify(metrics)}`);
    }
    if (metrics.shadowDraws < 1) throw new Error(`Directional shadow path was not exercised: ${JSON.stringify(metrics)}`);
    if (metrics.paletteUploads < 1 || metrics.skinnedDraws < 1 || metrics.skinnedInstances < 1) {
      throw new Error(`Skinning path was not exercised: ${JSON.stringify(metrics)}`);
    }
    if (recovery.supported && recovery.generation < 2) throw new Error(`Context restoration did not advance generation: ${JSON.stringify(recovery)}`);
    const screenshot = resolve(outputDirectory, "acceptance.png");
    await page.screenshot({ path: screenshot });
    console.log(JSON.stringify({ glError, recovery, screenshot, snapshot: metrics }, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  await server.exited;
}
