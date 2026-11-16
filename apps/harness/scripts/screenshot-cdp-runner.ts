import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { launchHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";

type ScreenshotViewport = { name: string; width: number; height: number };
type ScreenshotOptions = {
  viewports: ScreenshotViewport[];
  routes: string[];
  outDir: string;
  waitUntil: "load" | "domcontentloaded";
  navigationTimeoutMs: number;
  settleDelayMs: number;
};
type CdpTarget = { id: string };
type CdpPageDomain = {
  enable(): Promise<void>;
  navigate(args: { url: string }): Promise<unknown>;
  domContentEventFired(callback: () => void): void;
  loadEventFired(callback: () => void): void;
  getLayoutMetrics(): Promise<{
    cssContentSize?: { width: number; height: number };
    contentSize: { width: number; height: number };
  }>;
  captureScreenshot(args: {
    format: "png";
    fromSurface: boolean;
    captureBeyondViewport: boolean;
    clip: { x: number; y: number; width: number; height: number; scale: number };
  }): Promise<{ data: string }>;
};
type CdpClient = {
  Emulation: {
    setDeviceMetricsOverride(args: {
      width: number;
      height: number;
      deviceScaleFactor: number;
      mobile: boolean;
    }): Promise<void>;
  };
  Page: CdpPageDomain;
  close(): Promise<void>;
};
type CdpModule = {
  Version(args: { port: number }): Promise<unknown>;
  New(args: { port: number }): Promise<CdpTarget>;
  Close(args: { port: number; id: string }): Promise<unknown>;
  (args: { port: number; target: CdpTarget }): Promise<CdpClient>;
};

const cdpModuleName = "chrome-remote-interface";
const CDP = await loadCdp();
const payload = parseScreenshotPayload(process.env.SCREENSHOT_PAYLOAD ?? "{}");
const { baseUrl, opts } = payload;

if (!baseUrl || !opts) {
  throw new Error("SCREENSHOT_PAYLOAD must include baseUrl and opts");
}
const screenshotOptions = opts;

function slugifyRoute(route: string) {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return "home";
  }
  const slug = trimmed
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "home";
}

async function loadCdp(): Promise<CdpModule> {
  const module = await import(cdpModuleName);
  return module.default;
}

function parseScreenshotPayload(source: string): { baseUrl?: string; opts?: ScreenshotOptions } {
  return JSON.parse(source);
}

function chromeCandidates() {
  if (process.env.CHROME_PATH) {
    return [process.env.CHROME_PATH];
  }
  if (process.platform === "win32") {
    return [
      path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
      path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ];
  }
  return ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
}

async function launchChrome() {
  const errors: string[] = [];
  for (const executable of chromeCandidates()) {
    if (!executable || path.isAbsolute(executable) && !existsSync(executable)) continue;
    try { return await launchHeadlessBrowser({ executable, args: ["--disable-gpu"] }); }
    catch (error) { errors.push(`${executable}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  throw new Error(`Could not launch headless Chrome. Set CHROME_PATH. Tried:\n${errors.join("\n")}`);
}

async function waitForPageEvent(Page: CdpPageDomain, eventName: "domContentEventFired" | "loadEventFired", timeoutMs: number) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`page ${eventName} timed out after ${timeoutMs}ms`)), timeoutMs);
    Page[eventName](() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function captureOne(port: number, target: CdpTarget, viewport: ScreenshotViewport, url: string, filePath: string) {
  const client = await CDP({ port, target });
  try {
    const { Emulation, Page } = client;
    await Page.enable();
    await Emulation.setDeviceMetricsOverride({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 600
    });
    const lifecycleEvent = screenshotOptions.waitUntil === "domcontentloaded" ? "domContentEventFired" : "loadEventFired";
    const loadPromise = waitForPageEvent(Page, lifecycleEvent, screenshotOptions.navigationTimeoutMs);
    await Page.navigate({ url });
    await loadPromise;
    await new Promise((resolve) => setTimeout(resolve, screenshotOptions.settleDelayMs));
    const metrics = await Page.getLayoutMetrics();
    const contentSize = metrics.cssContentSize ?? metrics.contentSize;
    const { data } = await Page.captureScreenshot({
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.max(viewport.width, Math.ceil(contentSize.width)),
        height: Math.max(viewport.height, Math.ceil(contentSize.height)),
        scale: 1
      }
    });
    await writeFile(filePath, Buffer.from(data, "base64"));
  } finally {
    await client.close().catch(() => undefined);
  }
}

const chrome = await launchChrome();
const { port } = chrome;
try {
  const artifacts = [];
  for (const viewport of opts.viewports) {
    for (const route of opts.routes) {
      const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
      const targetUrl = new URL(normalizedRoute, baseUrl).toString();
      const target = await CDP.New({ port });
      try {
        const slug = slugifyRoute(route);
        const filePath = path.join(opts.outDir, `${slug}-${viewport.name}.png`);
        await captureOne(port, target, viewport, targetUrl, filePath);
        artifacts.push({
          route,
          viewport: viewport.name,
          width: viewport.width,
          height: viewport.height,
          path: path.relative(process.cwd(), filePath).replace(/\\/g, "/")
        });
      } finally {
        await CDP.Close({ port, id: target.id }).catch(() => undefined);
      }
    }
  }
  console.log(JSON.stringify({ artifacts }));
} finally {
  await chrome.close();
}
