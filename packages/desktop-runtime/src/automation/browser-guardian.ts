import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnBackgroundProcess } from "../process/spawn";
import { terminateProcessTree } from "../process/terminate";
import { removeBrowserProfile } from "./profile";

// EOF survives hard owner termination on Windows, where its SIGTERM/finally cannot run.
let ownerClosed = false;
let child: ReturnType<typeof spawnBackgroundProcess> | undefined;
let closing: Promise<void> | undefined;
let profileDir: string | undefined;
const close = () => closing ??= (async () => {
  ownerClosed = true;
  try {
    if (child) await terminateProcessTree({ process: child });
    if (profileDir) await removeBrowserProfile(profileDir);
  } finally { process.stdin.destroy(); }
})();
process.stdin.once("end", () => { void close(); });
process.stdin.once("error", () => { void close(); });
process.once("SIGINT", () => { void close(); });
process.once("SIGTERM", () => { void close(); });
process.stdin.resume();
// An abruptly closed owner also closes these diagnostic pipes. EPIPE must not
// abort the cleanup that its stdin EOF just requested.
process.stdout.on("error", () => undefined);
process.stderr.on("error", () => undefined);

try {
  const config: unknown = JSON.parse(process.argv[2] ?? "null");
  if (!config || typeof config !== "object" || !("executable" in config) || typeof config.executable !== "string"
    || !("args" in config) || !Array.isArray(config.args) || !config.args.every((arg): arg is string => typeof arg === "string")
    || !("profileDir" in config) || typeof config.profileDir !== "string") throw new Error("Invalid browser guardian configuration.");
  const directory = resolve(config.profileDir);
  if (dirname(directory) !== resolve(tmpdir()) || !directory.startsWith(resolve(tmpdir(), "hyperfocus-browser-"))) {
    throw new Error("Browser profile must be a dedicated temporary Hyperfocus browser directory.");
  }
  profileDir = directory;
  if (!ownerClosed) {
    child = spawnBackgroundProcess({ cmd: [config.executable, ...config.args], stdin: "ignore", stdout: "ignore", stderr: "pipe" });
    console.log(JSON.stringify({ pid: child.pid }));
    const diagnostics = child.stderr;
    if (diagnostics) void (async () => {
      try { for await (const chunk of diagnostics) process.stderr.write(chunk); } catch { /* Child shutdown closes stderr. */ }
    })();
    const code = await child.exited;
    if (!ownerClosed && code !== 0) process.exitCode = code;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally { await close(); }
