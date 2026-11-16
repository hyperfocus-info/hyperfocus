import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { inspectWindowsProcessTrees } from "../process-policy/windows-inspection";

export function parseCancellationProbeArgs(args: string[]) {
  let executable: string | undefined;
  let modelId = "default";
  let liveCodex = false;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--live-codex") liveCodex = true;
    else if (flag === "--executable" || flag === "--model") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
      if (flag === "--executable") executable = resolve(value);
      else modelId = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!executable || !liveCodex) throw new Error("Usage: bun scripts/ai-runtime/verify-cancellation.ts --executable <runtime.exe> --live-codex [--model <id>]. Live mode uses the installed Codex account and may incur usage.");
  return { executable, modelId, liveCodex };
}

export async function verifyPackagedAiCancellation(options: {
  executable: string;
  modelId?: string;
  liveCodex: boolean;
}) {
  if (!options.liveCodex) throw new Error("Explicit liveCodex opt-in is required.");
  if (process.platform !== "win32") throw new Error("This probe requires Windows process and window inspection.");
  if (!Bun.which("codex")) throw new Error("Codex is not on PATH. The probe does not install or authenticate it.");
  const executable = resolve(options.executable);
  if (!(await stat(executable)).isFile()) throw new Error("Runtime executable must be a file.");
  const executableSha256 = createHash("sha256").update(await readFile(executable)).digest("hex");
  const directory = await mkdtemp(join(tmpdir(), "padpilot-ai-acceptance-"));
  try {
    const cases = [];
    for (const preCancelled of [true, false]) {
      cases.push(await verifyInvocation({ directory, executable, modelId: options.modelId ?? "default", preCancelled }));
    }
    return {
      capturedAt: new Date().toISOString(), executableSha256,
      boundary: "Compiled runtime file transport and live Codex process cleanup; does not exercise JUCE WebView, DAW invocation routing, or Copilot restrictions.",
      passed: cases.every(entry => entry.passed), cases,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyInvocation(options: { directory: string; executable: string; modelId: string; preCancelled: boolean }) {
  const { directory, executable, modelId, preCancelled } = options;
  const requestPath = join(directory, "request.json");
  const responsePath = join(directory, "response.json");
  const cancelPath = join(directory, "cancel");
  const sentinelPath = join(directory, "sentinel.txt");
  const sentinel = "DISPOSABLE AI ACCEPTANCE SENTINEL";
  await rm(responsePath, { force: true });
  await rm(cancelPath, { force: true });
  await writeFile(sentinelPath, sentinel);
  // Only this fixed run envelope reaches the executable: no credential writes,
  // arbitrary user prompts, project context, or production data paths.
  await writeFile(requestPath, JSON.stringify({ operation: "run", payload: {
    requestId: "native-file-cancellation-acceptance", deadlineAt: Date.now() + 35_000,
    profile: { agentId: "codex-cli", providerId: "codex-account", modelId, reasoning: "high" },
    messages: [{ role: "user", content: "Without using tools, derive a detailed algebraic proof of the quadratic formula and explain each identity." }],
  } }));
  if (preCancelled) await writeFile(cancelPath, "cancel");
  const child = spawnBackgroundProcess({
    cmd: [executable, "--request", requestPath, "--response", responsePath, "--cancel", cancelPath],
    cwd: directory, env: { ...process.env, TEMP: directory, TMP: directory, PADPILOT_DATA_ROOT: directory },
    timeout: 45_000, maxBuffer: 131072, stdout: "pipe", stderr: "pipe",
  });
  const output = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  let snapshot: ReturnType<typeof inspectWindowsProcessTrees> | undefined;
  let sawLiveCodexExec = false;
  let abortAt = Date.now();
  try {
    if (!preCancelled) {
      for (let attempt = 0; attempt < 7 && child.exitCode === null; attempt++) {
        snapshot = inspectWindowsProcessTrees({ rootPids: [child.pid] });
        sawLiveCodexExec = snapshot.processes.some(entry => /codex/i.test(entry.name) && /\bexec\b/.test(entry.commandLine));
        if (sawLiveCodexExec || snapshot.visibleWindows.length) break;
        await Bun.sleep(100);
      }
      abortAt = Date.now();
      await writeFile(cancelPath, "cancel");
    }
    const exitCode = await child.exited;
    const cancellationElapsedMs = Date.now() - abortAt;
    await output;
    const response: unknown = JSON.parse(await readFile(responsePath, "utf8"));
    const cancelled = Boolean(response && typeof response === "object" && "ok" in response && response.ok === false && "error" in response && typeof response.error === "string" && /cancel/i.test(response.error));
    const alive = inspectSurvivors(snapshot);
    const visibleWindows = snapshot?.visibleWindows ?? [];
    const sentinelUnchanged = await readFile(sentinelPath, "utf8") === sentinel;
    return {
      preCancelled, exitCode, cancelled, sawLiveCodexExec, cancellationElapsedMs,
      processes: snapshot?.processes.map(({ pid, name }) => ({ pid, name })) ?? [],
      visibleWindows, aliveAfterCancellation: alive.map(({ pid, name }) => ({ pid, name })), sentinelUnchanged,
      passed: exitCode === 1 && cancelled && !visibleWindows.length && !alive.length && sentinelUnchanged && (preCancelled || sawLiveCodexExec),
      ...(!preCancelled && !sawLiveCodexExec ? { limitation: "No live Codex exec observed: check account availability or retry if completion preceded sampling. Authentication is not inferred from PATH." } : {}),
    };
  } finally {
    await writeFile(cancelPath, "cancel");
    if (child.exitCode === null) await terminateProcessTree({ process: child });
    await child.exited;
    await output;
    // A failing target must not leave observed descendants behind. Revalidate
    // creation times before cleanup so recycled PIDs cannot claim unrelated work.
    for (const survivor of inspectSurvivors(snapshot)) await terminateProcessTree({ pid: survivor.pid });
  }
}

function inspectSurvivors(snapshot: ReturnType<typeof inspectWindowsProcessTrees> | undefined) {
  if (!snapshot?.processes.length) return [];
  return inspectWindowsProcessTrees({ rootPids: snapshot.processes.map(entry => entry.pid), expectedProcesses: snapshot.processes }).processes;
}

if (import.meta.main) {
  const report = await verifyPackagedAiCancellation(parseCancellationProbeArgs(process.argv.slice(2)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
