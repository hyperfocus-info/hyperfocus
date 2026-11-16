import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { writeFile } from "node:fs/promises";
import { z } from "zod";

const readySchema = z.object({ type: z.literal("ready"), url: z.string().url().refine(value => {
  const url = new URL(value); return url.protocol === "http:" && url.hostname === "127.0.0.1" && !url.username && !url.password;
}), nodeVersion: z.string().optional() });

export function liveHostEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL)$/i.test(name)));
}

export async function startLiveProcess(options: { cmd: string[]; root: string; environment: Record<string, string | undefined>; log: string; secrets?: string[] }) {
  // These durable services own an expiry and use stdin EOF to finish cleanup after
  // a lost driver. Immediate generic parent-exit killing would skip that cleanup.
  const child = spawnBackgroundProcess({ cmd: options.cmd, cwd: options.root, env: options.environment,
    stdin: "pipe", stdout: "pipe", stderr: "pipe", keepAliveAfterParentExit: true });
  let output = "", ready = false;
  let announce!: (value: z.infer<typeof readySchema>) => void, reject!: (error: Error) => void;
  const readiness = new Promise<z.infer<typeof readySchema>>((resolve, fail) => { announce = resolve; reject = fail; });
  function retain(text: string) {
    output += text;
    for (const secret of options.secrets ?? []) if (secret) output = output.replaceAll(secret, "[redacted]");
    output = output.slice(-65536);
  }
  async function drain(stream: ReadableStream<Uint8Array>, stdout: boolean) {
    const reader = stream.getReader(), decoder = new TextDecoder(); let pending = "";
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true }); retain(text);
        if (!stdout || ready) continue;
        pending = (pending + text).slice(-65536);
        let end: number;
        while ((end = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          try { const value = readySchema.parse(JSON.parse(line)); ready = true; announce(value); } catch { /* bounded diagnostic output */ }
        }
      }
    } finally { reader.releaseLock(); }
  }
  const streams = Promise.allSettled([drain(child.stdout, true), drain(child.stderr, false)]);
  void child.exited.then(() => { if (!ready) reject(Error("Owned live service exited before readiness; inspect its redacted log.")); }, () => reject(Error("Owned live service could not start.")));
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function stop() {
    child.stdin.end();
    let grace: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([child.exited, new Promise<void>(resolve => { grace = setTimeout(resolve, 60000); })]);
      if (child.exitCode === null) await terminateProcessTree({ process: child });
      const code = await child.exited; await streams; return code;
    } finally { clearTimeout(grace); await writeFile(options.log, output); }
  }
  try {
    const value = await Promise.race([readiness, new Promise<never>((_, fail) => { timer = setTimeout(() => fail(Error("Owned live service readiness timed out.")), 30000); })]);
    return { ...value, pid: child.pid, child, stop };
  } catch (error) { await stop(); throw error; }
  finally { clearTimeout(timer); }
}
