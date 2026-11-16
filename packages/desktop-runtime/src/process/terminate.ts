import { spawn, spawnSync } from "node:child_process";

export type OwnedProcess = {
  readonly pid: number;
  readonly exitCode: number | null;
  readonly exited: Promise<number>;
  readonly processGroup?: boolean;
  kill(signal?: NodeJS.Signals | number): void;
};

type TerminationOptions = {
  process?: OwnedProcess;
  /** A previously recorded, caller-validated owned PID. Never use a process name. */
  pid?: number;
  processGroup?: boolean;
  graceMs?: number;
};

const pending = new WeakMap<OwnedProcess, Promise<void>>();

export function terminateProcessTree(options: TerminationOptions): Promise<void> {
  if (!options.process) return terminate(options);
  const existing = pending.get(options.process);
  if (existing) return existing;
  const result = terminate(options);
  pending.set(options.process, result);
  return result;
}

async function terminate(options: TerminationOptions) {
  const pid = ownedPid(options);
  if (!pid || options.process?.exitCode !== undefined && options.process.exitCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    await new Promise<void>((resolve) => {
      const deadline = setTimeout(() => { killer.kill(); resolve(); }, options.graceMs ?? 5_000);
      const done = () => { clearTimeout(deadline); resolve(); };
      killer.once("error", done);
      killer.once("close", done);
    });
  } else {
    const target = options.process?.processGroup || options.processGroup ? -pid : pid;
    signalOwnedProcess(target, "SIGTERM");
    if (options.process) await waitForExit(options.process.exited, options.graceMs ?? 1_000);
    signalOwnedProcess(target, "SIGKILL");
  }
  if (options.process) {
    if (options.process.exitCode === null) options.process.kill("SIGKILL");
    const exited = await waitForExit(options.process.exited, options.graceMs ?? 5_000);
    if (!exited) throw new Error(`Owned process ${pid} did not finish cleanup within ${options.graceMs ?? 5_000} ms.`);
  }
}

export function terminateProcessTreeSync(options: TerminationOptions) {
  const pid = ownedPid(options);
  if (!pid || options.process?.exitCode !== undefined && options.process.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: options.graceMs ?? 5_000 });
  } else {
    signalOwnedProcess(options.process?.processGroup || options.processGroup ? -pid : pid, "SIGKILL");
  }
}

function ownedPid(options: TerminationOptions) {
  const pid = options.process?.pid ?? options.pid;
  if (pid === 0) return undefined; // Failed spawn: no OS process was created.
  if (!Number.isSafeInteger(pid) || !pid || pid <= 0 || pid === process.pid) throw new Error("Process cleanup requires a positive, owned child PID.");
  return pid;
}

function signalOwnedProcess(pid: number, signal: NodeJS.Signals) {
  try { process.kill(pid, signal); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error; }
}

async function waitForExit(exited: Promise<number>, timeoutMs: number) {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([exited.then(() => true, () => true), new Promise<false>((resolve) => { deadline = setTimeout(() => resolve(false), timeoutMs); })]); }
  finally { clearTimeout(deadline); }
}
