import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

/** Shared by packaged hosts and repository commands; never assumes the host executable is Bun. */
export function resolveBundledBunPath(input: { rootPath?: string; platform?: NodeJS.Platform; resolutionBase?: string } = {}) {
  const rootPath = input.rootPath ?? process.cwd();
  const binaryName = (input.platform ?? process.platform) === "win32" ? "bun.exe" : "bun";
  const candidates = [path.join(rootPath, "bin", binaryName), path.join(rootPath, "node_modules", "bun", "bin", binaryName)];
  const bundledPath = candidates.find(candidate => existsSync(candidate));
  if (bundledPath) return bundledPath;
  if (input.rootPath || (input.platform ?? process.platform) !== process.platform) return undefined;
  try {
    const packagePath = createRequire(input.resolutionBase ?? import.meta.url).resolve("bun/package.json");
    const installedPath = path.join(path.dirname(packagePath), "bin", binaryName);
    return existsSync(installedPath) ? installedPath : undefined;
  } catch { return undefined; }
}

/** Frozen, approved plan commands only. This is deliberately not a shell interpreter. */
export async function runVerificationCommands(options: {
  cwd: string; commands: readonly string[]; signal?: AbortSignal;
  timeoutMs?: number; maxOutputBytes?: number; onResult?: (summary: string) => void;
  onReceipt?: (receipt: { command: string; stdout: string; exitCode: number }) => void;
}) {
  options.signal?.throwIfAborted();
  const commands = [...new Set(options.commands)];
  if (!commands.length) {
    const summary = "Verification unverified: no task-specific checks were established.";
    options.onResult?.(summary);
    return summary;
  }
  for (const command of commands) {
    try {
      const result = await runCommand({ ...options, cmd: parseVerificationCommand(command) });
      options.onReceipt?.({ command, ...result });
      if (result.exitCode !== 0) throw Error(`exit ${result.exitCode}: ${(result.stderr.trim() || result.stdout.trim()).slice(0, 4000)}`);
      options.onResult?.(`Verification passed: ${command}`);
    } catch (error) { throw Error(`Verification failed (${command}): ${error instanceof Error ? error.message : String(error)}`); }
  }
  return `Verification: ${commands.length} declared check${commands.length === 1 ? "" : "s"} passed.`;
}

/** Bounded, owned argv execution. Shell interpretation is never implicit. */
export async function runCommand(options: { cwd: string; cmd: readonly string[]; signal?: AbortSignal;
  timeoutMs?: number; maxOutputBytes?: number; env?: Record<string, string | undefined> }) {
  options.signal?.throwIfAborted();
  if (!options.cmd.length || !options.cmd[0]) throw Error("Command is empty.");
  const timeoutMs = options.timeoutMs ?? 120_000;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(Error(`Command timed out after ${timeoutMs} ms.`)), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  let child: ReturnType<typeof spawnBackgroundProcess> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const cmd = [...options.cmd];
    if (/^(?:bun|bunx)(?:\.cmd)?$/.test(cmd[0]!)) cmd.splice(0, 1, ...parseVerificationCommand(cmd[0]!));
    child = spawnBackgroundProcess({ cmd, cwd: options.cwd, signal, env: options.env,
      maxBuffer: options.maxOutputBytes ?? 262144, stdout: "pipe", stderr: "pipe" });
    const proc = child;
    const aborted = new Promise<never>((_resolve, reject) => { onAbort = () => reject(signal.reason); });
    signal.addEventListener("abort", onAbort!, { once: true });
    if (signal.aborted) onAbort!();
    const [stdout, stderr, exitCode] = await Promise.race([aborted, Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited
    ])]);
    signal.throwIfAborted();
    return { stdout, stderr, exitCode };
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    clearTimeout(timer);
    if (child) await terminateProcessTree({ process: child });
  }
}

export function parseVerificationCommand(command: string) {
  if (/[\r\n]/.test(command)) throw new Error("Verification commands must be single commands; put multiple steps in a project script.");
  const args: string[] = [];
  let value = "", quote = "", started = false;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = "";
      else value += char;
    } else if (char === "\"" || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) {
      if (started) { args.push(value); value = ""; started = false; }
    } else {
      if (/[;&|<>`$\r\n]/.test(char)) throw new Error("Verification commands cannot use shell operators or expansion; put the command in a project script.");
      value += char; started = true;
    }
  }
  if (quote) throw new Error("Verification command has an unterminated quote.");
  if (started) args.push(value);
  if (!args[0]) throw new Error("Verification command is empty.");
  const bun = resolveBundledBunPath({ rootPath: path.dirname(process.execPath) })
    ?? resolveBundledBunPath() ?? (/^bun(?:\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : undefined)
    ?? (process.platform === "win32" ? "bun.exe" : "bun");
  if (/^(?:bun|bun\.cmd)$/.test(args[0])) args[0] = bun;
  if (/^(?:bunx|bunx\.cmd)$/.test(args[0])) args.splice(0, 1, bun, "x");
  return args;
}
