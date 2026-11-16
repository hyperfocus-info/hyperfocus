import { isRecord } from "@hyperfocus/utilities/records";
import { spawnBackgroundProcess } from "../process/spawn";
import { terminateProcessTree } from "../process/terminate";

/** Client for the existing supervisor CLI's isolated start/stop JSON protocol. */
export async function startManagedServer({ supervisor, surface, env, healthPath = "/healthz", inheritEnvironment = true, localAuth = false }: {
  supervisor: { command: readonly string[]; cwd: string };
  surface: string; env: Record<string, string>; healthPath?: string; inheritEnvironment?: boolean; localAuth?: boolean;
}) {
  const child = spawnBackgroundProcess({
    cmd: [...supervisor.command, "start", surface, "--isolated", ...(localAuth ? ["--local-auth"] : []), "--json"], cwd: supervisor.cwd,
    env: { ...(inheritEnvironment ? process.env : {}), ...env }, stdout: "pipe", stderr: "pipe",
  });
  let output = "", errors = "";
  const drains = [drain(child.stdout, text => { output += text; }), drain(child.stderr, text => { errors += text; })];
  let id: string | undefined;
  const close = async () => {
    if (id) {
      const stop = spawnBackgroundProcess({ cmd: [...supervisor.command, "stop", id, "--json"], cwd: supervisor.cwd, stdout: "pipe", stderr: "pipe" });
      await Promise.all([new Response(stop.stdout).text(), new Response(stop.stderr).text(), stop.exited]);
    }
    if (child.exitCode === null) await terminateProcessTree({ process: child });
    await Promise.allSettled(drains);
  };
  try {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${errors}\n${output}`);
      for (const line of output.split("\n")) {
        if (!line.startsWith("{")) continue;
        let value: unknown;
        try { value = JSON.parse(line); } catch { continue; }
        if (!isRecord(value) || typeof value.id !== "string" || typeof value.url !== "string") continue;
        id = value.id;
        try {
          if ((await fetch(new URL(healthPath, value.url), { signal: AbortSignal.timeout(500) })).ok) return { id, url: value.url, pid: child.pid, close };
        } catch { /* Wait for the supervisor's startup. */ }
      }
      await Bun.sleep(200);
    }
    throw new Error(`Server did not become ready: ${errors}\n${output}`);
  } catch (error) { await close(); throw error; }
}

async function drain(stream: ReadableStream<Uint8Array> | null, onText: (text: string) => void) {
  if (!stream) return;
  const reader = stream.getReader(), decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
}
