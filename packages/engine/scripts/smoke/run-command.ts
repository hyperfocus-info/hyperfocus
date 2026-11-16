import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";

/** Release compiler and consumer commands share hidden Windows launch and bounded execution. */
export async function runReleaseCommand(options: { cmd: readonly string[]; cwd: string }) {
  const child = spawnBackgroundProcess({ ...options, stdout: "pipe", stderr: "pipe", timeout: 120_000 });
  const [status, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  if (status !== 0) throw new Error(`Release command failed (${status}): ${options.cmd.join(" ")}\n${stdout}\n${stderr}`);
  return stdout;
}
