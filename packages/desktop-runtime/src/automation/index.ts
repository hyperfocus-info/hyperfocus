export { setAuditViewport } from "./viewport";
export { browserExecutable } from './executable';
export { browserExtensionArguments, type BrowserExtensions } from './extensions';
import { browserExtensionArguments, type BrowserExtensions } from './extensions';
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnBackgroundProcess } from "../process/spawn";
import { terminateProcessTree } from "../process/terminate";
import { removeBrowserProfile } from "./profile";

/** Connect an injected browser driver without giving it ownership of the OS process. */
export async function connectHeadlessBrowser<T>(options: {
  executable: string;
  args?: readonly string[];
  extensions?: BrowserExtensions;
  startupTimeoutMs?: number;
  connectTimeoutMs?: number;
  connect: (endpoint: string) => Promise<T>;
}) {
  const owned = await launchHeadlessBrowser(options);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const browser = await Promise.race([
      options.connect(`http://127.0.0.1:${owned.port}`),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Browser driver connection timed out")), options.connectTimeoutMs ?? 10_000); }),
    ]);
    return { ...owned, browser };
  }
  catch (error) { await owned.close(); throw error; }
  finally { clearTimeout(timer); }
}

/** Launch an isolated headless browser; its guardian also cleans up after owner death. */
export async function launchHeadlessBrowser(options: {
  executable: string;
  args?: readonly string[];
  extensions?: BrowserExtensions;
  startupTimeoutMs?: number;
}) {
  for (const argument of options.args ?? []) {
    if (/^--(?:headless|user-data-dir|remote-debugging)(?:[=-]|$)/.test(argument)) {
      throw new Error(`Browser ownership option cannot be overridden: ${argument}`);
    }
  }
  const launchArgs = browserExtensionArguments(options);
  const profileDir = await mkdtemp(join(tmpdir(), "hyperfocus-browser-"));
  const args = ["--headless=new", "--mute-audio", "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage",
    // Otherwise elevated Chrome can relaunch outside the recorded child PID on Windows.
    ...(process.platform === "win32" ? ["--do-not-de-elevate"] : []),
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`,
    ...launchArgs, "about:blank"];
  let guardian: ReturnType<typeof spawnBackgroundProcess> | undefined;
  let closing: Promise<void> | undefined;
  let pid: number | undefined;
  let stderr = "";
  let stdout = "";
  const lifecycleEvents: NodeJS.EventEmitter = process;
  const close = () => closing ??= (async () => {
    try {
      guardian?.stdin?.end();
      if (guardian) {
        const exited = await settlesWithin(guardian.exited.catch(() => 1), 10_000);
        if (!exited) await terminateProcessTree({ process: guardian });
      }
      await removeBrowserProfile(profileDir);
    } finally {
      lifecycleEvents.off("SIGINT", onInterrupt);
      lifecycleEvents.off("SIGTERM", onTerminate);
    }
  })();
  const onInterrupt = () => { void close().finally(() => process.exit(130)); };
  const onTerminate = () => { void close().finally(() => process.exit(143)); };
  lifecycleEvents.once("SIGINT", onInterrupt);
  lifecycleEvents.once("SIGTERM", onTerminate);

  try {
    const guardianFile = import.meta.path.endsWith(".ts") ? "browser-guardian.ts" : "browser-guardian.js";
    guardian = spawnBackgroundProcess({
      cmd: [process.execPath, join(import.meta.dir, guardianFile), JSON.stringify({ executable: options.executable, args, profileDir })],
      stdin: "pipe", stdout: "pipe", stderr: "pipe", detached: true, keepAliveAfterParentExit: true,
    });
    void drain(guardian.stderr, (text) => { stderr = (stderr + text).slice(-8_000); });
    void drain(guardian.stdout, (text) => {
      stdout += text;
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      try {
        const message: unknown = JSON.parse(stdout.slice(0, newline));
        if (message && typeof message === "object" && "pid" in message && typeof message.pid === "number") pid = message.pid;
      } catch { /* The startup deadline reports an invalid guardian response. */ }
      stdout = "";
    });
    const deadline = Date.now() + (options.startupTimeoutMs ?? 10_000);
    while (Date.now() < deadline) {
      if (guardian.exitCode !== null) throw new Error(`Browser guardian exited with code ${guardian.exitCode}: ${stderr}`);
      try {
        const port = Number((await readFile(join(profileDir, "DevToolsActivePort"), "utf8")).split("\n")[0]);
        if (Number.isInteger(port) && port > 0 && pid) {
          const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
          if (response.ok) return { port, pid, profileDir, close };
        }
      } catch { /* Browser startup is bounded by the deadline and each request timeout. */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Headless browser did not become ready in time. ${stderr}`.trim());
  } catch (error) {
    await close();
    throw error;
  }
}

async function drain(stream: ReadableStream<Uint8Array> | null | undefined, accept: (text: string) => void) {
  if (!stream) return;
  const decoder = new TextDecoder();
  try { for await (const chunk of stream) accept(decoder.decode(chunk, { stream: true })); }
  catch { /* Closing a process also closes its diagnostic streams. */ }
}

async function settlesWithin(promise: Promise<unknown>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise.then(() => true), new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); })]);
  } finally { clearTimeout(timer); }
}
