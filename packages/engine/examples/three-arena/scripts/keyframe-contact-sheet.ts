import { isRecord } from "@hyperfocus/utilities/records";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchHeadlessBrowser } from "@hyperfocus/desktop-runtime/automation";

type AnimationId = "player-run" | "boss-run";

type Options = {
  animations: AnimationId[];
  chromePath?: string;
  frames: number;
  outDir: string;
};

type Completion = { error?: string; pngDataUrl?: string; report?: Record<string, unknown> };

const EXAMPLE_ROOT = path.resolve(import.meta.dir, "..");
const DEFAULT_OUTPUT = path.join(EXAMPLE_ROOT, ".local", "animation-keyframes");

export function parseOptions(args: readonly string[], cwd = process.cwd()): Options {
  const options: Options = { animations: ["player-run", "boss-run"], frames: 8, outDir: DEFAULT_OUTPUT };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (key === "--frames") {
      options.frames = positiveInteger(value, key);
    } else if (key === "--out-dir") {
      if (!value) throw new Error("--out-dir requires a path");
      options.outDir = path.resolve(cwd, value);
    } else if (key === "--animations") {
      if (!value) throw new Error("--animations requires player-run, boss-run, or both separated by commas");
      options.animations = parseAnimations(value);
    } else if (key === "--chrome") {
      if (!value) throw new Error("--chrome requires an executable path");
      options.chromePath = path.resolve(cwd, value);
    } else {
      throw new Error(`Unknown keyframe contact-sheet option: ${String(key)}`);
    }
    index += 1;
  }
  if (options.frames > 24) throw new RangeError("--frames must not exceed 24");
  return options;
}

export async function createKeyframeContactSheet(options: Options): Promise<{ png: string; report: string }> {
  await mkdir(options.outDir, { recursive: true });
  const bundlePath = path.join(options.outDir, "keyframe-viewer.js");
  const build = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "keyframe-contact-sheet-viewer.ts")],
    outdir: options.outDir,
    naming: "keyframe-viewer.js",
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "linked",
  });
  if (!build.success) throw new Error(`Keyframe viewer build failed:\n${build.logs.join("\n")}`);

  let resolveCompletion: (value: Completion) => void = () => undefined;
  let rejectCompletion: (error: Error) => void = () => undefined;
  const completed = new Promise<Completion>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/complete" && request.method === "POST") {
        try {
          resolveCompletion(parseCompletion(await request.json()));
          return new Response("ok");
        } catch (error) {
          rejectCompletion(error instanceof Error ? error : new Error(String(error)));
          return new Response("invalid completion payload", { status: 400 });
        }
      }
      if (url.pathname === "/") return new Response(viewerHtml(options), { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.pathname === "/keyframe-viewer.js") return new Response(Bun.file(bundlePath), { headers: { "content-type": "text/javascript; charset=utf-8" } });
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const filePath = path.resolve(EXAMPLE_ROOT, relative);
      const safeRelative = path.relative(EXAMPLE_ROOT, filePath);
      if (!safeRelative || safeRelative === ".." || safeRelative.startsWith(`..${path.sep}`)) return new Response("forbidden", { status: 403 });
      const file = Bun.file(filePath);
      if (!await file.exists()) return new Response("not found", { status: 404 });
      return new Response(file);
    },
  });

  let chrome: Awaited<ReturnType<typeof launchHeadlessBrowser>> | undefined;
  try {
    chrome = await launchChrome(options.chromePath);
    const response = await fetch(`http://127.0.0.1:${chrome.port}/json/new?${encodeURIComponent(server.url.href)}`, {
      method: "PUT", signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) throw new Error(`Could not open keyframe capture target: HTTP ${response.status}`);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Keyframe renderer timed out after 90 seconds")), 90_000);
    });
    const payload = await Promise.race([completed, timedOut]).finally(() => clearTimeout(timeout));
    if (payload.error) throw new Error(`Keyframe renderer failed: ${payload.error}`);
    if (!payload.pngDataUrl?.startsWith("data:image/png;base64,")) throw new Error("Keyframe renderer did not return a PNG data URL");
    if (!payload.report) throw new Error("Keyframe renderer did not return its JSON report");
    const png = Buffer.from(payload.pngDataUrl.slice("data:image/png;base64,".length), "base64");
    const outputName = options.animations.join("-vs-");
    const pngPath = path.join(options.outDir, `${outputName}.png`);
    const reportPath = path.join(options.outDir, `${outputName}.json`);
    const report = {
      ...payload.report,
      capture: {
        file: path.basename(pngPath),
        bytes: png.byteLength,
        sha256: createHash("sha256").update(png).digest("hex"),
        browserPid: chrome.pid,
        browserProfileDir: chrome.profileDir,
      },
    };
    await Promise.all([
      writeFile(pngPath, png),
      writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
    ]);
    return { png: pngPath, report: reportPath };
  } finally {
    try { await chrome?.close(); }
    finally { server.stop(true); }
  }
}

function viewerHtml(options: Options): string {
  const viewerOptions = JSON.stringify({ animations: options.animations, frames: options.frames, width: 300, panelHeight: 360 }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Three Arena keyframes</title><style>html,body{margin:0;background:#080c0d;color:#fff}canvas{display:block;max-width:100%;height:auto}</style></head><body><script>globalThis.__KEYFRAME_OPTIONS__=${viewerOptions}</script><script type="module" src="/keyframe-viewer.js"></script></body></html>`;
}

function launchChrome(explicitPath?: string) {
  const executable = chromeCandidates(explicitPath).find((candidate) => !path.isAbsolute(candidate) || existsSync(candidate));
  if (!executable) throw new Error("No Chrome executable found. Set CHROME_PATH or pass --chrome.");
  return launchHeadlessBrowser({ executable,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars", "--window-size=1280,900"] });
}

function chromeCandidates(explicitPath?: string): string[] {
  return [...new Set([
    explicitPath,
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.PROGRAMFILES ?? "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] ?? "", "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "google-chrome", "chromium", "chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate)))];
}

function parseAnimations(value: string): AnimationId[] {
  const animations: AnimationId[] = [];
  for (const item of value.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    if (!isAnimationId(item)) throw new Error("--animations accepts only player-run and boss-run");
    if (!animations.includes(item)) animations.push(item);
  }
  if (animations.length === 0) throw new Error("--animations accepts only player-run and boss-run");
  return animations;
}

function isAnimationId(value: string): value is AnimationId {
  return value === "player-run" || value === "boss-run";
}

function parseCompletion(value: unknown): Completion {
  if (!isRecord(value)) throw new TypeError("Completion payload must be an object");
  if (value.error !== undefined && typeof value.error !== "string") throw new TypeError("Completion error must be a string");
  if (value.pngDataUrl !== undefined && typeof value.pngDataUrl !== "string") throw new TypeError("Completion image must be a string");
  if (value.report !== undefined && !isRecord(value.report)) throw new TypeError("Completion report must be an object");
  return { error: value.error, pngDataUrl: value.pngDataUrl, report: value.report };
}



function positiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

if (import.meta.main) {
  const result = await createKeyframeContactSheet(parseOptions(process.argv.slice(2)));
  console.info(JSON.stringify(result, null, 2));
}
