import { createHash } from "node:crypto";
import type { Sandbox } from "railway";
import type { ExecutionWorkspace } from "@hyperfocus/ai-core/swarm";

export const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export function relativePath(path: string) {
  if (!path || path.length > 1024 || path.startsWith("/") || path.split("/").some(part => !part || part === ".." || part === ".") || /[\\:\x00-\x1f]/.test(path)) throw new Error("Artifact path must be a safe repository-relative file.");
  return path;
}
export function commandDirectory(root: string, path?: string) { return path ? `${root}/${relativePath(path)}` : root; }

export async function captureWorkspaceArtifacts(options: { sandbox: Sandbox; workspace: ExecutionWorkspace; paths: string[]; signal?: AbortSignal }) {
  if (options.paths.length > 32) throw new Error("Too many artifact paths.");
  const { sandbox, workspace, signal } = options;
  const patchPath = "/tmp/hyperfocus-candidate.patch";
  // A disposable index includes new files without changing the repository's real index.
  const index = "/tmp/hyperfocus-patch-index";
  const command = `set -eu; export GIT_INDEX_FILE=${index}; rm -f ${index}; git read-tree ${shellQuote(workspace.sourceRevision)}; git add -A; git diff --cached --binary --no-ext-diff ${shellQuote(workspace.sourceRevision)} > ${patchPath}; rm -f ${index}`;
  const result = await sandbox.exec(command, { cwd: workspace.root, timeoutSec: 60, signal, maxOutputBytes: 4096 });
  if (result.exitCode !== 0) throw new Error("Candidate patch extraction failed.");
  const files = [{ path: patchPath, name: "candidate.patch", mediaType: "text/x-diff" }];
  for (const path of options.paths) {
    relativePath(path);
    const full = `${workspace.root}/${path}`;
    // realpath rejects symlink escapes. Only regular files may cross the artifact boundary.
    const checked = await sandbox.exec(`test -f ${shellQuote(full)} && realpath -- ${shellQuote(full)}`, { timeoutSec: 10, signal, maxOutputBytes: 4096 });
    const real = checked.stdout.trim();
    if (checked.exitCode !== 0 || !real.startsWith(workspace.root + "/") || real.includes("\n")) throw new Error("Artifact escapes its repository or is not a regular file.");
    files.push({ path: real, name: path, mediaType: path.endsWith(".json") ? "application/json" : path.endsWith(".png") ? "image/png" : "application/octet-stream" });
  }
  let total = 0;
  const artifacts = [];
  for (const file of files) {
    signal?.throwIfAborted();
    const stat = await sandbox.files.stat(file.path);
    if (stat.size > 67_108_864 || (total += stat.size) > 134_217_728) throw new Error("Artifact collection exceeds its byte limit.");
    const bytes = await sandbox.files.read(file.path, { format: "bytes" });
    if (bytes.length !== stat.size) throw new Error("Artifact changed while being captured.");
    artifacts.push({ name: file.name, mediaType: file.mediaType, sha256: digest(bytes), bytesBase64: Buffer.from(bytes).toString("base64") });
  }
  return artifacts;
}
