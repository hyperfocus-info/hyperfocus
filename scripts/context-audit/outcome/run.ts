import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { boundPath, digestFile, fingerprint, loadContract, object } from "./contract";

export function commandPassed({ exitCode, stdout, expect }: { exitCode: number | null; stdout: string; expect?: Record<string, unknown> }) {
  if (exitCode !== 0) return false;
  if (!expect) return true;
  try {
    const actual = object(JSON.parse(stdout));
    return Object.entries(expect).every(([key, value]) => Object.hasOwn(actual, key) && actual[key] === value);
  } catch { return false; }
}

export async function receiptDirectory(root: string) {
  let directory = path.resolve(root);
  for (const segment of [".local", "agent-outcomes", "receipts"]) {
    directory = path.join(directory, segment);
    try { await mkdir(directory); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
    directory = await boundPath({ root, file: directory });
    if (!(await stat(directory)).isDirectory()) throw Error("Receipt output must be a directory.");
  }
  return directory;
}

/** Explicit execution only. Inspection never runs commands from a contract. */
export async function runCriterion({ root, file, criterionId, timeoutMs = 120000 }: {
  root: string; file: string; criterionId: string; timeoutMs?: number;
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) throw new Error("Timeout must be 1..3600000 milliseconds.");
  const loaded = await loadContract({ root, file });
  const criterion = loaded.contract.criteria.find(row => row.id === criterionId);
  if (!criterion || criterion.evaluator.kind !== "command") throw new Error("Select a command criterion.");
  const candidate = await fingerprint({ root, paths: loaded.contract.candidate.paths });
  const directory = await receiptDirectory(root);
  const stem = `${criterionId}-${crypto.randomUUID()}`, stdoutPath = path.join(directory, `${stem}.stdout.log`), stderrPath = path.join(directory, `${stem}.stderr.log`);
  const output = await open(stdoutPath, "wx");
  const startedAt = new Date().toISOString(), start = performance.now();
  let exitCode: number | null = null, error: string | null = null;
  const controller = new AbortController();
  let child: ReturnType<typeof spawnBackgroundProcess> | undefined;
  let errors: Awaited<ReturnType<typeof open>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let monitor: ReturnType<typeof setInterval> | undefined;
  try {
    errors = await open(stderrPath, "wx");
    timer = setTimeout(() => { error = "Command timed out."; controller.abort(); }, timeoutMs);
    // Files avoid waiting forever for pipe EOF from a misbehaving descendant.
    // Commands still own their descendants under the repository process contract.
    child = spawnBackgroundProcess({ cmd: criterion.evaluator.command, cwd: root, stdin: "ignore", stdout: output.fd, stderr: errors.fd, signal: controller.signal });
    const checkSize = async () => {
      if ((await output.stat()).size > 8388608 || errors && (await errors.stat()).size > 8388608) { error = "Command output exceeded 8 MiB per stream."; controller.abort(); }
    };
    monitor = setInterval(() => { void checkSize().catch(() => undefined); }, 100);
    exitCode = await child.exited;
    await checkSize();
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  } finally {
    clearTimeout(timer); clearInterval(monitor);
    try { if (child) await terminateProcessTree({ process: child }); }
    finally { await output.close(); await errors?.close(); }
  }
  const stdout = (await stat(stdoutPath)).size <= 8388608 ? await readFile(stdoutPath, "utf8") : "";
  try {
    const after = await fingerprint({ root, paths: loaded.contract.candidate.paths });
    if (after.sha256 !== candidate.sha256 || (await loadContract({ root, file })).sha256 !== loaded.sha256) error = "Candidate or contract changed during verification.";
  } catch { error = "Candidate or contract became unavailable during verification."; }
  const receipt = {
    schema: "hyperfocus-outcome-receipt-v1", kind: "command", criterionId, contractSha256: loaded.sha256, candidateSha256: candidate.sha256,
    startedAt, durationMs: Math.round(performance.now() - start), command: criterion.evaluator.command, exitCode, error,
    passed: error === null && commandPassed({ exitCode, stdout, expect: criterion.evaluator.expect }),
    artifacts: await Promise.all([stdoutPath, stderrPath].map(async artifact => ({ path: path.relative(root, artifact).replaceAll("\\", "/"), sha256: await digestFile(artifact) }))),
  };
  const receiptPath = path.join(directory, `${stem}.json`);
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx" });
  return { receipt: path.relative(root, receiptPath).replaceAll("\\", "/"), ...receipt };
}
