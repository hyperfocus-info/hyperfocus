import { readFile } from "node:fs/promises";
import path from "node:path";
import { qualityHash } from "./session";
import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";

/** Compare dirty UI bytes at the task boundary, preserving unrelated preexisting edits. */
export async function qualityChangedFiles(cwd: string) {
  const outputs = await Promise.all([["diff", "HEAD", "--name-only", "--relative", "-z", "--", "."], ["ls-files", "--others", "--exclude-standard", "-z", "--", "."]].map(async args => {
    try {
      const proc = spawnBackgroundProcess({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe", maxBuffer: 4194304 });
      const [stdout, , exit] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return exit === 0 ? stdout : undefined;
    } catch { return undefined; } // Virtual/opaque workspaces may not expose a local Git process boundary.
  }));
  if (outputs.some(output => output === undefined)) return undefined;
  const files = new Map<string, string>();
  for (const entry of outputs.join("\0").split("\0")) {
    if (!entry) continue;
    const name = entry.replaceAll("\\", "/");
    if (!/\.(?:tsx|jsx|html|css)$|(?:^|\/)(?:client|ui)\/.*\.ts$/.test(name) || /(?:^|\/)(?:\.local|node_modules|dist)\//.test(name)) continue;
    if (files.size >= 8000) return undefined;
    try { files.set(name, qualityHash(await readFile(path.resolve(cwd, name)))); }
    catch { files.set(name, "missing"); }
  }
  return files;
}

export function changedQualityPaths(before: Map<string, string> | undefined, after: Map<string, string> | undefined) {
  if (!before || !after) return undefined;
  return [...new Set([...before.keys(), ...after.keys()])].filter(name => before.get(name) !== after.get(name));
}
