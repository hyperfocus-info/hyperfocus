import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import path from "node:path";
import { checkStandaloneUpdate, parseDesktopProtocolTarget } from "@hyperfocus/desktop-runtime";
import { HARNESS_APP_VERSION } from "@hyperfocus/ai-core/app-version";
import { z } from "zod";

export const DESKTOP_HOST = "127.0.0.1";
export const DESKTOP_PROTOCOL = "ide";

const desktopStatusSchema = z.object({
  app: z.literal("hyperfocus-harness"),
  version: z.string().min(1),
  sessionToken: z.string().min(32)
});
const desktopOpenResponseSchema = z.object({
  url: z.string().url(),
  projectId: z.string().min(1).optional(),
  kind: z.enum(["file", "folder"]).optional()
});
const githubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  html_url: z.string().url(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string().url() }))
});

type DesktopFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function getDesktopServerUrl(port: number) {
  return `http://${DESKTOP_HOST}:${port}`;
}

export function resolveDesktopTargetArgument(ideUrl: string | undefined) {
  return ideUrl ? path.resolve(parseDesktopProtocolTarget(ideUrl, DESKTOP_PROTOCOL)) : undefined;
}

export async function findRunningDesktopServer(serverUrl: string, fetcher: DesktopFetch = globalThis.fetch) {
  try {
    const response = await fetcher(`${serverUrl}/api/desktop/v1/status`, { signal: AbortSignal.timeout(1_000) });
    if (!response.ok) return undefined;
    desktopStatusSchema.parse(await response.json());
    return serverUrl;
  } catch {
    return undefined;
  }
}

export async function waitForRunningDesktopServer(input: {
  serverUrl: string;
  attempts?: number;
  delayMs?: number;
  fetcher?: DesktopFetch;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  const attempts = Math.max(1, input.attempts ?? 20);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const running = await findRunningDesktopServer(input.serverUrl, input.fetcher);
    if (running) return running;
    if (attempt + 1 < attempts) {
      await (input.sleep ?? Bun.sleep)(input.delayMs ?? 100);
    }
  }
  return undefined;
}

export async function requestDesktopOpen(input: {
  serverUrl: string;
  target?: string;
  fetcher?: DesktopFetch;
}) {
  if (!input.target) {
    return { url: input.serverUrl };
  }
  const fetcher = input.fetcher ?? globalThis.fetch;
  const statusResponse = await fetcher(`${input.serverUrl}/api/desktop/v1/status`, {
    signal: AbortSignal.timeout(1_000)
  });
  if (!statusResponse.ok) throw new Error("Desktop Harness session is unavailable");
  const status = desktopStatusSchema.parse(await statusResponse.json());
  const response = await fetcher(`${input.serverUrl}/api/desktop/v1/open`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-harness-session-token": status.sessionToken
    },
    body: JSON.stringify({ target: input.target })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Desktop IDE open failed with status ${response.status}`);
  }
  return desktopOpenResponseSchema.parse(await response.json());
}

export async function checkHarnessDesktopUpdate(enabled: boolean, fetcher: DesktopFetch = globalThis.fetch) {
  return checkStandaloneUpdate({
    enabled,
    currentVersion: HARNESS_APP_VERSION,
    source: {
      async getLatestRelease(signal) {
        const response = await fetcher("https://api.github.com/repos/hyperfocus-info/hyperfocus/releases/latest", {
          headers: { accept: "application/vnd.github+json", "user-agent": "hyperfocus-desktop" },
          signal: signal ?? AbortSignal.timeout(5_000)
        });
        if (!response.ok) {
          throw new Error(`Desktop update check failed with status ${response.status}`);
        }
        const release = githubReleaseSchema.parse(await response.json());
        const portableAsset = release.assets.find((asset) => /bun-windows-x64|windows.*portable|pi-harness/i.test(asset.name));
        return {
          version: release.tag_name,
          downloadUrl: portableAsset?.browser_download_url,
          notesUrl: release.html_url
        };
      }
    }
  });
}

export async function openSystemBrowser(url: string) {
  const command =
    process.platform === "win32"
      ? ["rundll32.exe", "url.dll,FileProtocolHandler", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];

  try {
    const browserProcess = spawnBackgroundProcess({ cmd: command, stdout: "ignore", stderr: "ignore" });
    const exitCode = await browserProcess.exited;
    if (exitCode !== 0) {
      console.warn(`Failed to open browser automatically. Open ${url} manually.`);
    }
  } catch {
    console.warn(`Failed to open browser automatically. Open ${url} manually.`);
  }
}

export function buildWindowsProtocolRegistration(input: {
  executablePath: string;
  launcherArgs?: readonly string[];
  protocol?: string;
}) {
  const protocol = input.protocol ?? DESKTOP_PROTOCOL;
  const key = `HKCU\\Software\\Classes\\${protocol}`;
  const command = [input.executablePath, ...(input.launcherArgs ?? []), "--ide-url", "%1"]
    .map(quoteWindowsArgument)
    .join(" ");
  return [
    ["add", key, "/ve", "/d", `URL:${protocol} Protocol`, "/f"],
    ["add", key, "/v", "URL Protocol", "/d", "", "/f"],
    ["add", `${key}\\DefaultIcon`, "/ve", "/d", `${input.executablePath},0`, "/f"],
    ["add", `${key}\\shell\\open\\command`, "/ve", "/d", command, "/f"]
  ];
}

export async function registerDesktopProtocol(input: {
  executablePath?: string;
  launcherArgs?: readonly string[];
  platform?: NodeJS.Platform;
  spawn?: typeof spawnBackgroundProcess;
}) {
  const platform = input.platform ?? process.platform;
  if (platform !== "win32") {
    throw new Error("Automatic ide:// registration currently requires the Windows desktop release");
  }
  const spawn = input.spawn ?? spawnBackgroundProcess;
  for (const args of buildWindowsProtocolRegistration({
    executablePath: input.executablePath ?? process.execPath,
    launcherArgs: input.launcherArgs
  })) {
    const child = spawn({ cmd: ["reg.exe", ...args], stdout: "pipe", stderr: "pipe" });
    const exitCode = await child.exited;
    if (exitCode !== 0) {
      throw new Error(`Failed to register ide:// protocol (reg.exe exit ${exitCode})`);
    }
  }
}

function quoteWindowsArgument(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}
