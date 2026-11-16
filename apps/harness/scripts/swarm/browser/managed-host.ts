import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { join } from "node:path";

/** Shared owned lifecycle for native Swarm browser verification. */
export async function startManagedSwarmHost(options: { surface: "harness" | "editor"; root: string; environment: Record<string, string | undefined> }) {
  const command = join(options.root, ".agents/skills/dev-server/scripts/dev.ts");
  const child = spawnBackgroundProcess({ cmd: [process.execPath, command, "start", options.surface, "--isolated", "--json"], cwd: options.root, env: options.environment, stdout: "pipe", stderr: "pipe" });
  let found: { id: string; url: string } | undefined;
  let diagnostic = "";
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader(), decoder = new TextDecoder(); let buffer = "";
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true }); let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); diagnostic = (diagnostic + line + "\n").slice(-8000);
          if (line.startsWith("{")) try {
            const value: unknown = JSON.parse(line);
            if (typeof value === "object" && value !== null && "id" in value && "url" in value && typeof value.id === "string" && typeof value.url === "string") found = { id: value.id, url: value.url };
          } catch { /* Build output is not a readiness receipt. */ }
        }
      }
    } finally { reader.releaseLock(); }
  };
  void pump(child.stdout).catch(() => {}); void pump(child.stderr).catch(() => {});
  async function stop() {
    if (found) {
      const request = spawnBackgroundProcess({ cmd: [process.execPath, command, "stop", found.id, "--json"], cwd: options.root, stdout: "pipe", stderr: "pipe" });
      const [code, , error] = await Promise.all([request.exited, new Response(request.stdout).text(), new Response(request.stderr).text()]);
      if (code) throw Error(`Managed cleanup failed: ${error}`);
      await Promise.race([child.exited, Bun.sleep(5_000)]);
    }
    if (child.exitCode === null) await terminateProcessTree({ process: child });
  }
  try {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error(`${options.surface} exited before readiness: ${diagnostic}`);
      if (found) {
        const ready = await fetch(new URL(options.surface === "editor" ? "/healthz" : "/", found.url), { signal: AbortSignal.timeout(2_000) }).catch(() => undefined);
        if (ready?.ok) return { ...found, child, stop };
      }
      await Bun.sleep(200);
    }
    throw Error(`${options.surface} readiness timed out: ${diagnostic}`);
  } catch (error) { await stop(); throw error; }
}
