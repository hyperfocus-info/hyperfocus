import { launchHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { worldAreaCaptureAnchors } from "../src/data/world-landmarks.ts";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function viewportDimension(name: string, fallback: number) {
  const raw = argValue(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 16_384) {
    throw new Error(`${name} must be an integer from 1 through 16384.`);
  }
  return value;
}

function findFirst(root: string, filename: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name === filename) return path;
    }
  }
  return undefined;
}

const baseUrl = argValue("--base-url") ?? process.env.MMO_SKILL_DEMO_URL ?? "http://localhost:8792/examples/mmo-skill-demo/client.html";
const width = viewportDimension("--width", 1440);
const height = viewportDimension("--height", 900);
const only = argValue("--only") ?? "";
const url = new URL(baseUrl);
if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("--base-url must use http: or https:.");
const rootDir = resolve(import.meta.dir, "../../..");
const browserPath = process.env.CHROME_PATH ?? findFirst(join(process.env.LOCALAPPDATA ?? "", "ms-playwright"), "chrome-headless-shell.exe");
const areas = worldAreaCaptureAnchors.filter((area) => !only || area.id === only);
if (!areas.length) throw new Error(`Unknown world area: ${only}`);
if (!browserPath || (resolve(browserPath) === browserPath && !existsSync(browserPath))) {
  throw new Error("No headless browser found. Set CHROME_PATH to an existing executable.");
}

const outputDir = resolve(rootDir, ".local", "screenshots", `world-areas-${Date.now()}`);
await mkdir(outputDir, { recursive: true });
const chrome = await launchHeadlessBrowser({ executable: browserPath });
let browser: Browser | undefined;
try {
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const captures: { area: string; url: string; screenshot: string }[] = [];
  for (const area of areas) {
    const route = new URL(url);
    route.search = `login=visual-${area.id}`;
    route.hash = `area=${area.id}`;
    await page.goto(route.href, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForSelector("canvas", { timeout: 15_000 });
    const screenshot = join(outputDir, `${area.id}.png`);
    await page.screenshot({ path: screenshot });
    captures.push({ area: area.id, url: route.href, screenshot });
  }
  const report = { width, height, captures };
  const index = join(outputDir, "captures.json");
  await writeFile(index, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ index, ...report }, null, 2));
} finally {
  try { await browser?.disconnect(); }
  finally { await chrome.close(); }
}
