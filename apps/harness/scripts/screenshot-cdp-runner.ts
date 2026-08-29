import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

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

async function findOpenPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("could not allocate CDP port"));
        }
      });
    });
  });
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

async function launchChrome(port: number, userDataDir: string): Promise<ChildProcess> {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];

  const errors = [];
  for (const executable of chromeCandidates()) {
    if (!executable) {
      continue;
    }
    if (path.isAbsolute(executable) && !existsSync(executable)) {
      continue;
    }
    let proc: ChildProcess | undefined;
    try {
      proc = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      const launched = proc;
      await Promise.race([
        waitForCdp(port, 10_000),
        new Promise<never>((_, reject) => {
          launched.once("error", reject);
          launched.once("exit", (code) => reject(new Error(`Chrome exited early with code ${code}`)));
        })
      ]);
      return launched;
    } catch (error) {
      errors.push(`${executable}: ${error instanceof Error ? error.message : String(error)}`);
      await terminateProcessTree(proc);
    }
  }
  throw new Error(`could not launch Chrome for CDP. Set CHROME_PATH. Tried:\n${errors.join("\n")}`);
}

async function terminateProcessTree(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("error", reject);
      killer.once("exit", () => resolve());
    });
  } else {
    child.kill("SIGTERM");
  }

  const exited = await waitForProcessExit(child, 5_000);
  if (!exited) {
    child.kill("SIGKILL");
    if (!(await waitForProcessExit(child, 2_000))) {
      throw new Error(`process tree rooted at PID ${child.pid} did not exit`);
    }
  }
}

async function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) {
    return true;
  }
  return await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(child.exitCode !== null), timeoutMs))
  ]);
}

async function waitForCdp(port: number, timeoutMs: number) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      await CDP.Version({ port });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError ?? new Error("CDP endpoint did not become ready");
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

const port = await findOpenPort();
const userDataDir = await mkdtemp(path.join(tmpdir(), "harness-screenshot-cdp-"));
let chrome: ChildProcess | undefined;

try {
  chrome = await launchChrome(port, userDataDir);
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
  await terminateProcessTree(chrome);
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 });
}
