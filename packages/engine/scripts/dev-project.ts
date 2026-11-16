import { compareText } from "@hyperfocus/utilities/text";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { HYPERFOCUS_ASSETS_PATH, HYPERFOCUS_PROJECT_PATH, decodeHyperfocusProject } from "../src/project/index.ts";
import { migrateProject } from "../src/project/editor.ts";
import { buildPortableProject, collectProjectBehaviorImports } from "./build-project.ts";

const DEFAULT_DEBOUNCE_MS = 75;
const MIN_DEBOUNCE_MS = 25;
const MAX_DEBOUNCE_MS = 2_000;
const DEFAULT_MAX_CLIENTS = 32;
const MAX_CLIENTS = 256;
const MAX_PROJECT_JSON_BYTES = 10485760;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;
const encoder = new TextEncoder();

export type ProjectDevStatus = {
  state: "building" | "ready" | "error" | "stopped";
  buildNumber: number;
  lastBuildAt?: string;
  lastError?: string;
  watchedFiles: string[];
};

export type ProjectDevServer = {
  readonly url: string;
  readonly hostname: string;
  readonly port: number;
  readonly projectRoot: string;
  readonly disposableDirectory: string;
  status(): ProjectDevStatus;
  rebuild(): Promise<ProjectDevStatus>;
  stop(): Promise<void>;
};

export type StartProjectDevServerOptions = {
  projectDirectory: string;
  hostname?: string;
  port?: number;
  debounceMs?: number;
  maxClients?: number;
  logger?: Pick<Console, "log" | "error">;
};

export function clampProjectDevDebounce(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DEBOUNCE_MS;
  if (!Number.isFinite(value)) throw new Error("Project dev debounce must be finite.");
  return Math.max(MIN_DEBOUNCE_MS, Math.min(MAX_DEBOUNCE_MS, Math.round(value)));
}

/** Returns only the canonical pair and authored source inputs proven by esbuild. */
export async function discoverProjectWatchFiles(projectDirectory: string): Promise<string[]> {
  const root = resolve(projectDirectory);
  const canonical = [resolve(root, HYPERFOCUS_PROJECT_PATH), resolve(root, HYPERFOCUS_ASSETS_PATH)];
  for (const path of canonical) if (!existsSync(path)) throw new Error(`Missing watched project file: ${path}`);
  const projectBytes = new Uint8Array(await readFile(canonical[0]));
  if (projectBytes.byteLength > MAX_PROJECT_JSON_BYTES) throw new Error(`project.json exceeds ${MAX_PROJECT_JSON_BYTES} bytes.`);
  const project = decodeHyperfocusProject(projectBytes, migrateProject);
  const behaviorImports = collectProjectBehaviorImports(project, root);
  if (!behaviorImports.length) return canonical.sort(compareText);
  const entryPoints = [...new Set(behaviorImports.map((item) => item.modulePath))];
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    entryPoints,
    format: "esm",
    logLevel: "silent",
    metafile: true,
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const sources = Object.keys(result.metafile.inputs).map((input) => isAbsolute(input) ? resolve(input) : resolve(root, input))
    .filter((path) => pathWithin(root, path) && SOURCE_EXTENSION.test(path) && !relative(root, path).split(/[\\/]/).includes("node_modules"));
  return [...new Set([...canonical, ...sources])].sort(compareText);
}

export async function startProjectDevServer(options: StartProjectDevServerOptions): Promise<ProjectDevServer> {
  const projectRoot = resolve(options.projectDirectory);
  const hostname = cleanHostname(options.hostname ?? "127.0.0.1");
  const port = normalizePort(options.port ?? 0);
  const debounceMs = clampProjectDevDebounce(options.debounceMs);
  const maxClients = positiveInteger(options.maxClients ?? DEFAULT_MAX_CLIENTS, "maxClients", MAX_CLIENTS);
  const logger = options.logger ?? console;
  const disposableDirectory = await mkdtemp(join(tmpdir(), "hyperfocus-project-dev-"));
  let html = "";
  let stopped = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let buildChain: Promise<void> = Promise.resolve();
  let watcherSet: FSWatcher[] = [];
  let watchedFiles: string[] = [];
  let status: ProjectDevStatus = { state: "building", buildNumber: 0, watchedFiles: [] };
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let server: ReturnType<typeof Bun.serve> | undefined;

  const broadcast = (event: "reload" | "error", data: unknown) => {
    const packet = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    for (const client of [...clients]) {
      try { client.enqueue(packet); }
      catch { clients.delete(client); }
    }
  };

  const replaceWatchers = (files: string[]) => {
    for (const watcher of watcherSet) watcher.close();
    watcherSet = [];
    watchedFiles = files;
    const byDirectory = new Map<string, Set<string>>();
    for (const file of files) {
      const directory = dirname(file);
      const names = byDirectory.get(directory) ?? new Set<string>();
      names.add(normalizeName(basename(file)));
      byDirectory.set(directory, names);
    }
    // Filesystem writers replace the whole canonical directory atomically.
    // Watch its exact transaction names at the project root so the watcher can
    // reattach to the new directory after a committed pair swap.
    const rootNames = byDirectory.get(projectRoot) ?? new Set<string>();
    rootNames.add(normalizeName(".hyperfocus"));
    rootNames.add(normalizeName(".hyperfocus.next"));
    rootNames.add(normalizeName(".hyperfocus.previous"));
    byDirectory.set(projectRoot, rootNames);
    for (const [directory, names] of byDirectory) {
      const watcher = watch(directory, { persistent: true }, (_event, filename) => {
        if (stopped) return;
        if (filename !== null && !names.has(normalizeName(String(filename)))) return;
        scheduleRebuild();
      });
      watcher.on("error", (cause) => {
        if (stopped) return;
        const message = `Watch error in ${relative(projectRoot, directory) || "."}: ${formatDevError(cause, projectRoot)}`;
        status = { ...status, state: "error", lastError: message, watchedFiles: relativeFiles(projectRoot, watchedFiles) };
        logger.error(message);
        broadcast("error", { message });
      });
      watcherSet.push(watcher);
    }
  };

  const runBuild = async () => {
    if (stopped) return;
    status = { ...status, state: "building", watchedFiles: relativeFiles(projectRoot, watchedFiles) };
    const buildPath = join(disposableDirectory, `build-${status.buildNumber + 1}-${crypto.randomUUID()}.html`);
    try {
      const built = await buildPortableProject(projectRoot, buildPath);
      const nextHtml = await readFile(buildPath, "utf8");
      const nextFiles = [...new Set([resolve(projectRoot, HYPERFOCUS_PROJECT_PATH), resolve(projectRoot, HYPERFOCUS_ASSETS_PATH),
        ...built.sourceFiles.filter(path => pathWithin(projectRoot, path) && SOURCE_EXTENSION.test(path) && !relative(projectRoot, path).split(/[\\/]/).includes('node_modules'))])].sort(compareText);
      if (stopped) return;
      html = nextHtml;
      replaceWatchers(nextFiles);
      status = {
        state: "ready",
        buildNumber: status.buildNumber + 1,
        lastBuildAt: new Date().toISOString(),
        watchedFiles: relativeFiles(projectRoot, watchedFiles),
      };
      logger.log(`Project build ${status.buildNumber} ready; watching ${watchedFiles.length} exact file${watchedFiles.length === 1 ? "" : "s"}.`);
      broadcast("reload", { buildNumber: status.buildNumber });
    } catch (cause) {
      const message = formatDevError(cause, projectRoot);
      status = { ...status, state: "error", lastError: message, watchedFiles: relativeFiles(projectRoot, watchedFiles) };
      logger.error(`Project rebuild failed:\n${message}`);
      broadcast("error", { message, buildNumber: status.buildNumber });
      if (status.buildNumber === 0) throw new Error(`Initial project build failed:\n${message}`, { cause });
    } finally {
      await rm(buildPath, { force: true }).catch(() => undefined);
      await rm(`${buildPath}.receipt.json`, { force: true }).catch(() => undefined);
    }
  };

  let buildPending = false, building = false;
  const queueBuild = () => {
    buildPending = true;
    if (!building) {
      building = true;
      buildChain = (async () => {
        try { while (buildPending && !stopped) { buildPending = false;await runBuild(); } }
        finally { building = false; }
      })();
    }
    return buildChain;
  };

  const scheduleRebuild = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void queueBuild();
    }, debounceMs);
  };

  try {
    await queueBuild();
    server = Bun.serve({
      hostname,
      port,
      fetch(request) {
        const url = new URL(request.url);
        if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { ...noStoreHeaders("text/plain; charset=utf-8"), Allow: "GET, HEAD" } });
        if (url.pathname === "/__hyperfocus/status") {
          return Response.json(status, { headers: noStoreHeaders("application/json; charset=utf-8") });
        }
        if (url.pathname === "/__hyperfocus/events") {
          if (clients.size >= maxClients) return new Response("Too many live-reload clients.", { status: 503, headers: noStoreHeaders("text/plain; charset=utf-8") });
          let controller: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>({
            start(next) {
              controller = next;
              clients.add(controller);
              controller.enqueue(encoder.encode(": connected\n\n"));
            },
            cancel() { clients.delete(controller); },
          });
          return new Response(stream, { headers: { ...noStoreHeaders("text/event-stream; charset=utf-8"), Connection: "keep-alive" } });
        }
        if (url.pathname !== "/" && url.pathname !== "/index.html") return new Response("Not found", { status: 404, headers: noStoreHeaders("text/plain; charset=utf-8") });
        return new Response(request.method === "HEAD" ? null : injectLiveReload(html), { headers: noStoreHeaders("text/html; charset=utf-8") });
      },
    });
  } catch (cause) {
    stopped = true;
    for (const watcher of watcherSet) watcher.close();
    await rm(disposableDirectory, { recursive: true, force: true });
    throw cause;
  }

  const activeServer = server;
  const activeUrl = new URL(activeServer.url);
  const api: ProjectDevServer = {
    url: activeUrl.toString(),
    hostname: activeServer.hostname ?? activeUrl.hostname,
    port: activeServer.port ?? Number(activeUrl.port),
    projectRoot,
    disposableDirectory,
    status: () => ({ ...status, watchedFiles: [...status.watchedFiles] }),
    rebuild: async () => {
      if (stopped) throw new Error("Project dev server is stopped.");
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      await queueBuild();
      return api.status();
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const watcher of watcherSet) watcher.close();
      watcherSet = [];
      for (const client of clients) {
        try { client.close(); } catch { /* client already closed */ }
      }
      clients.clear();
      await activeServer.stop(true);
      await buildChain.catch(() => undefined);
      await rm(disposableDirectory, { recursive: true, force: true });
      status = { ...status, state: "stopped", watchedFiles: [] };
    },
  };
  return api;
}

function injectLiveReload(html: string): string {
  const client = `<script data-hyperfocus-live-reload>(()=>{const e=new EventSource('/__hyperfocus/events');let o;e.addEventListener('reload',()=>location.reload());e.addEventListener('error',(n)=>{if(!n.data)return;let m;try{m=JSON.parse(n.data).message}catch{return}o??=Object.assign(document.body.appendChild(document.createElement('pre')),{id:'hyperfocus-dev-error'});o.textContent='Build failed\\n\\n'+m;Object.assign(o.style,{position:'fixed',inset:'12px',zIndex:'2147483647',overflow:'auto',padding:'16px',background:'#210f18',color:'#ffd8e2',border:'1px solid #e7596e',whiteSpace:'pre-wrap'})})})();</script>`;
  const index = html.toLowerCase().lastIndexOf("</body>");
  return index >= 0 ? `${html.slice(0, index)}${client}${html.slice(index)}` : `${html}${client}`;
}

function relativeFiles(root: string, files: readonly string[]): string[] {
  return files.map((file) => relative(root, file).replace(/\\/g, "/")).sort(compareText);
}

function pathWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path));
}

function normalizeName(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function cleanHostname(value: string): string {
  const result = value.trim();
  if (!result || result.length > 253 || /[\s/\\]/.test(result)) throw new Error("Project dev hostname is invalid.");
  return result;
}

function normalizePort(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) throw new Error("Project dev port must be an integer from 0 through 65535.");
  return value;
}

function positiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) throw new Error(`${label} must be an integer from 1 through ${maximum}.`);
  return value;
}

function noStoreHeaders(contentType: string) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function formatDevError(value: unknown, root: string): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.split(resolve(root)).join(".");
}



export function projectDevCliHelp(): string {
  return [
    "Hyperfocus source-aware project development server",
    "",
    "Usage:",
    "  bun run dev:game -- --project <game-directory> [--port 8797] [--host 127.0.0.1]",
    "",
    "The server watches only .hyperfocus/project.json, .hyperfocus/assets.hfp, and authored source inputs discovered by the TypeScript bundle graph.",
    "Successful builds swap one in-memory HTML snapshot and live-reload browsers. Failed builds keep the last good snapshot and show actionable diagnostics.",
    "The default host is 127.0.0.1. Passing another --host is an explicit decision to expose the development server.",
  ].join("\n");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefixed = args.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

export async function runProjectDevCli(args: readonly string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(projectDevCliHelp());
  } else {
    const projectDirectory = option(args, "--project") ?? process.cwd();
    const portText = option(args, "--port");
    const hostname = option(args, "--host") ?? "127.0.0.1";
    const dev = await startProjectDevServer({
      projectDirectory,
      hostname,
      port: portText === undefined ? 8797 : Number(portText),
    });
    console.log(`Project dev server: ${dev.url}`);
    if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "::1") console.error(`Warning: development server is exposed on ${hostname}.`);
    await new Promise<void>((resolveShutdown) => {
      const shutdown = () => resolveShutdown();
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
    await dev.stop();
  }
}

if (import.meta.main) await runProjectDevCli(process.argv.slice(2));
