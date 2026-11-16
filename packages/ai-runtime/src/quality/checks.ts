import { createHash, randomUUID } from "node:crypto";
import { lstat, readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { qualityHash, type QualitySession } from "./session";
import { runVerificationCommands } from "./commands";

const relativePath = z.string().min(1).max(240).regex(/^[\w./-]+$/).refine(value => !value.startsWith("/") && !value.split("/").includes(".."));
const profileSchema = z.object({ schema: z.literal("hyperfocus-quality-profile-v1"), script: z.literal("test:quality"),
  inputs: z.array(relativePath).min(1).max(16), verifierInputs: z.array(relativePath).min(1).max(16),
  dependencyInputs: z.array(z.object({ package: z.string().regex(/^@hyperfocus\/[a-z-]+$/), entry: relativePath.optional(), inputs: z.array(relativePath).min(1).max(8) }).strict()).max(16).default([]),
  verifierIds: z.array(z.string().regex(/^[\w.-]+$/)).min(1).max(16) }).strict();
const resultSchema = z.object({ schema: z.literal("hyperfocus-quality-checks-v1"), nonce: z.string().uuid(),
  checks: z.array(z.object({ id: z.string().regex(/^[\w.-]+$/), outcome: z.enum(["passed", "failed", "skipped", "blocked"]),
    reason: z.string().max(500), evidenceRefs: z.array(relativePath).max(16), durationMs: z.number().nonnegative() }).strict()).max(32) }).strict();

/** Captures actual bytes, including untracked source. Follows no links and never hashes credentials. */
export async function qualityCandidate(root: string, inputs: readonly string[]) {
  const entries: [string, string][] = [];
  let bytes = 0;
  const visit = async (name: string) => {
    if (name.split("/").some(part => /^(?:\.env.*|\.git|\.local|node_modules|dist)$/.test(part))) throw new Error("Sensitive or generated quality inputs are forbidden.");
    const file = path.resolve(root, name), within = path.relative(root, file);
    if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("Quality input escaped project root.");
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new Error("Linked quality inputs are unsupported.");
    if (info.isDirectory()) {
      for (const child of (await readdir(file)).sort()) if (!/^(?:\.local|\.git|node_modules|dist|\.env.*)$/.test(child)) await visit(`${name}/${child}`);
    } else if (info.isFile()) {
      bytes += info.size;
      if (entries.length >= 8000 || info.size > 8388608 || bytes > 67108864) throw new Error("Quality candidate exceeds bounded input limits.");
      entries.push([name, qualityHash(await readFile(file))]);
    }
  };
  for (const input of [...new Set(inputs)].sort()) await visit(relativePath.parse(input));
  return { sha256: qualityHash(JSON.stringify(entries)), files: entries.length };
}

async function dependencyCandidate(cwd: string, dependencies: z.infer<typeof profileSchema>["dependencyInputs"]) {
  const hashes: [string, string][] = [];
  for (const dependency of dependencies) {
    let root = path.dirname(Bun.resolveSync(dependency.package + (dependency.entry ? `/${dependency.entry}` : ""), cwd)), found = false;
    for (let depth = 0; depth < 16; depth += 1) {
      try {
        const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
        if (manifest.name === dependency.package) { found = true; break; }
      } catch { /* Source entry can be nested; ascend to its owning manifest. */ }
      const parent = path.dirname(root); if (parent === root) break; root = parent;
    }
    if (!found) throw new Error("Quality dependency could not be resolved.");
    hashes.push([dependency.package, (await qualityCandidate(root, dependency.inputs)).sha256]);
  }
  return qualityHash(JSON.stringify(hashes));
}

export async function freezeQualityChecks(cwd: string) {
  try {
    const manifest: unknown = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
    const parsed = z.object({ hyperfocus: z.object({ quality: profileSchema }), scripts: z.record(z.string()) }).safeParse(manifest);
    if (!parsed.success) return undefined;
    const profile = parsed.data.hyperfocus.quality;
    const command = parsed.data.scripts[profile.script];
    if (!command) return undefined;
    return { cwd, profile, commandHash: qualityHash(command),
      verifierHash: qualityHash(JSON.stringify([(await qualityCandidate(cwd, profile.verifierInputs)).sha256, await dependencyCandidate(cwd, profile.dependencyInputs)])) };
  } catch { return undefined; }
}

export async function runQualityChecks(quality: QualitySession, frozen: Awaited<ReturnType<typeof freezeQualityChecks>>, succeeded: boolean, signal?: AbortSignal) {
  const ids = [...new Set(quality.trace.rules.filter(rule => rule.eligible === "yes").flatMap(rule => rule.verifierIds))];
  if (!ids.length || quality.trace.profile === "prototype") {
    const sha256 = qualityHash(quality.trace.intentSha256);
    quality.implementation(sha256, succeeded);
    for (const verifierId of ids) quality.verify({ verifierId, candidateSha256: sha256, outcome: "skipped",
      reason: "Explicit prototype profile: implementation only; production verification was not requested.", evidenceRefs: [] });
    return quality.finish();
  }
  const candidateFor = async () => frozen ? qualityHash(JSON.stringify([(await qualityCandidate(frozen.cwd, frozen.profile.inputs)).sha256,
    await dependencyCandidate(frozen.cwd, frozen.profile.dependencyInputs)])) : createHash("sha256").update(quality.trace.intentSha256).digest("hex");
  const candidate = { sha256: await candidateFor() };
  quality.implementation(candidate.sha256, succeeded);
  if (!frozen || !succeeded) {
    for (const verifierId of ids) quality.verify({ verifierId, candidateSha256: candidate.sha256, outcome: "unknown",
      reason: !frozen ? "No supported project quality verifier profile; ordinary tests do not prove this UX contract." : "Child execution failed; verification cannot accept its result.", evidenceRefs: [] });
    return quality.finish();
  }
  const nonce = randomUUID(), directory = path.join(frozen.cwd, ".local", "quality", quality.trace.runId);
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, `${nonce}.json`);
  const command = `bun run ${frozen.profile.script} --nonce ${nonce} --receipt "${output.replaceAll("\\", "/")}"`;
  let failed = false;
  try {
    const current = await freezeQualityChecks(frozen.cwd);
    if (!current || current.verifierHash !== frozen.verifierHash || current.commandHash !== frozen.commandHash) throw new Error("Verifier changed after dispatch.");
    await runVerificationCommands({ cwd: frozen.cwd, commands: [command], signal, timeoutMs: 180000 });
  } catch { failed = true; }
  let result: z.infer<typeof resultSchema> | undefined;
  try {
    const file = await lstat(output);
    if (file.size > 262144 || file.isSymbolicLink()) throw new Error("Invalid quality receipt size or link.");
    result = resultSchema.parse(JSON.parse(await readFile(output, "utf8")));
    if (result.nonce !== nonce || new Set(result.checks.map(check => check.id)).size !== result.checks.length) result = undefined;
  } catch { result = undefined; }
  const after = { sha256: await candidateFor() };
  const verifierAfter = await freezeQualityChecks(frozen.cwd);
  const fresh = after.sha256 === candidate.sha256 && verifierAfter?.verifierHash === frozen.verifierHash && verifierAfter.commandHash === frozen.commandHash;
  const receiptRef = path.relative(frozen.cwd, output).replaceAll("\\", "/");
  for (const verifierId of ids) {
    const check = frozen.profile.verifierIds.includes(verifierId) ? result?.checks.find(check => check.id === verifierId) : undefined;
    const evidenceExists = check ? (await Promise.all(check.evidenceRefs.map(async reference => {
      try { const info = await lstat(path.join(frozen.cwd, reference)); return info.isFile() && !info.isSymbolicLink(); } catch { return false; }
    }))).every(Boolean) : false;
    quality.verify({ verifierId, candidateSha256: candidate.sha256,
      outcome: !fresh || Boolean(check && !evidenceExists) ? "blocked" : check?.outcome === "passed" && failed ? "blocked" : check?.outcome ?? "unknown",
      reason: !fresh ? "Candidate or frozen verifier changed during verification; rerun is required." : check && !evidenceExists ? "Verifier referenced missing evidence." : failed && check?.outcome === "passed" ? "Verifier process failed; a passing row cannot override process failure." : check?.reason ?? "Required verifier is unsupported or produced no trustworthy receipt.",
      evidenceRefs: check ? [receiptRef, ...check.evidenceRefs].slice(0, 16) : [], durationMs: check?.durationMs });
  }
  const report = quality.finish();
  await writeFile(path.join(directory, "coverage.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(directory, "trace.json"), JSON.stringify(quality.trace, null, 2));
  return report;
}
