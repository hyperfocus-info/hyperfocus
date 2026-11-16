import { afterAll, describe, expect, test } from "bun:test";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { removeOwnedDirectory } from '@hyperfocus/desktop-runtime/filesystem';
import { mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectOutcome } from "./check";
import { parseArguments } from "./cli";
import { boundFile, digest, fingerprint, loadContract, object, parseContract } from "./contract";
import { runCriterion } from "./run";

const artifacts = path.resolve(import.meta.dir, "../../../.local/agent-outcomes/adversary");
const processModule = import.meta.resolve("@hyperfocus/desktop-runtime/process");
const ownedRoots: string[] = [];

async function freshRoot(prefix: string) {
  await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(path.join(artifacts, prefix));
  ownedRoots.push(root);
  return root;
}

afterAll(async () => {
  if (!ownedRoots.length) return;
  const base = await realpath(artifacts);
  for (const root of ownedRoots) {
    const resolved = await realpath(root);
    if (path.dirname(resolved) !== base) throw new Error(`Refusing cleanup outside the owned fixture parent: ${resolved}`);
    await removeOwnedDirectory({ directory: resolved, parent: base });
  }
});

function contract(command = [process.execPath, "-e", 'console.log(JSON.stringify({ observed: true }))']) {
  return parseContract({
    schema: "hyperfocus-outcome-v1", requested: "Exercise evidence failure cases", outcome: "Only current observed evidence passes",
    next: "Inspect the evidence", scope: ["Disposable independent evaluator fixtures"], constraints: ["No user data"],
    evidenceAvailable: [], limits: ["Fixture processes only; no publication or identity attestation"], assumptions: [],
    candidate: { description: "Disposable candidate", paths: ["candidate.txt"] }, threshold: "behavior-verified",
    criteria: [{ id: "behavior", stage: "behavior-verified", metric: "Observed is true", evaluator: {
      kind: "command", command, expect: { observed: true }, origin: "held-out", method: "Independent adversarial fixture", independence: "Authored by the evaluator",
    } }],
  });
}

async function fixture(input: unknown = contract()) {
  const root = await freshRoot("case-");
  await writeFile(path.join(root, "candidate.txt"), "candidate-v1\n");
  await writeFile(path.join(root, "contract.json"), JSON.stringify(input, null, 2));
  return { root, file: "contract.json", criterionId: "behavior", timeoutMs: 2000 };
}

async function rewriteJson(file: string, update: (value: Record<string, unknown>) => void) {
  const value = object(JSON.parse(await readFile(file, "utf8")));
  update(value);
  await writeFile(file, JSON.stringify(value, null, 2));
}

function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

describe("independent outcome evidence adversary", () => {
  test("no receipt cannot satisfy a valid contract, and checking does not execute it", async () => {
    const options = await fixture(contract([process.execPath, "-e", 'require("node:fs").writeFileSync("executed.txt", "unexpected")']));
    const result = await inspectOutcome(options);
    expect(result.thresholdMet).toBe(false);
    expect(result.status).toBe("code-written");
    expect(await readdir(options.root)).not.toContain("executed.txt");
  });

  test("a successful recorded command provides current evidence", async () => {
    const options = await fixture();
    const receipt = await runCriterion(options);
    const result = await inspectOutcome({ ...options, receipts: [receipt.receipt] });
    expect(receipt.passed).toBe(true);
    expect(result.thresholdMet).toBe(true);
  });

  test.each(["candidate", "contract", "artifact"])("changed %s invalidates an existing passing receipt", async target => {
    const options = await fixture();
    const receipt = await runCriterion(options);
    expect(receipt.passed).toBe(true);
    if (target === "candidate") await writeFile(path.join(options.root, "candidate.txt"), "candidate-v2\n");
    if (target === "contract") await rewriteJson(path.join(options.root, options.file), value => { value.outcome = "A different outcome"; });
    if (target === "artifact") await writeFile(path.join(options.root, receipt.artifacts[0]!.path), '{"observed":false}');
    const result = await inspectOutcome({ ...options, receipts: [receipt.receipt] });
    expect(result.thresholdMet).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  test.each(["nonzero", "mismatch", "malformed"])("a %s command cannot pass by changing receipt.passed", async failure => {
    const source = failure === "nonzero" ? 'console.log(JSON.stringify({ observed: true })); process.exitCode = 7'
      : failure === "mismatch" ? 'console.log(JSON.stringify({ observed: false }))' : 'console.log("not JSON")';
    const options = await fixture(contract([process.execPath, "-e", source]));
    const receipt = await runCriterion(options);
    expect(receipt.passed).toBe(false);
    await rewriteJson(path.join(options.root, receipt.receipt), value => { value.passed = true; });
    expect((await inspectOutcome({ ...options, receipts: [receipt.receipt] })).thresholdMet).toBe(false);
  });

  test("duplicate receipts cannot turn ambiguous attempts into a pass", async () => {
    const options = await fixture();
    const receipt = await runCriterion(options);
    const result = await inspectOutcome({ ...options, receipts: [receipt.receipt, receipt.receipt] });
    expect(result.thresholdMet).toBe(false);
    expect(result.criteria[0]?.reason).toContain("duplicate");
  });

  test("missing raw evidence cannot be replaced by a passing flag", async () => {
    const options = await fixture();
    const receipt = await runCriterion(options);
    await rewriteJson(path.join(options.root, receipt.receipt), value => { value.artifacts = []; value.passed = true; });
    const result = await inspectOutcome({ ...options, receipts: [receipt.receipt] });
    expect(result.thresholdMet).toBe(false);
    expect(result.failures.join(" ")).toContain("missing");
  });

  test.each(["approved", "rejected"])("human %s has the declared effect on a quality threshold", async decision => {
    const base = contract(), criterion = base.criteria[0]!;
    const options = await fixture({ ...base, threshold: "human-accepted", criteria: [criterion,
      { ...criterion, id: "outcome", stage: "outcome-demonstrated" },
      { ...criterion, id: "quality", stage: "human-accepted", evaluator: { kind: "human", method: "Fixture review", independence: "Test record; no actual human approval claim" } },
    ] });
    const behavior = await runCriterion(options);
    const outcome = await runCriterion({ ...options, criterionId: "outcome" });
    const raw = `Simulated reviewer ${decision} this test candidate.\n`;
    await writeFile(path.join(options.root, "review.txt"), raw);
    const loaded = await loadContract(options);
    const candidate = await fingerprint({ root: options.root, paths: loaded.contract.candidate.paths });
    await writeFile(path.join(options.root, "quality.json"), JSON.stringify({
      schema: "hyperfocus-outcome-receipt-v1", kind: "human", criterionId: "quality", contractSha256: loaded.sha256,
      candidateSha256: candidate.sha256, actor: "fixture reviewer", scope: "Disposable fixture only", recordedAt: new Date().toISOString(),
      decision, passed: true, artifacts: [{ path: "review.txt", sha256: digest(raw) }],
    }));
    const result = await inspectOutcome({ ...options, receipts: [behavior.receipt, outcome.receipt, "quality.json"] });
    expect(result.thresholdMet).toBe(decision === "approved");
    expect(result.status).toBe(decision === "approved" ? "human-accepted" : "outcome-demonstrated");
  });

  test("model-only contracts and nonhuman quality acceptance are rejected", () => {
    const base = contract(), criterion = base.criteria[0]!;
    expect(() => parseContract({ ...base, criteria: [{ ...criterion, evaluator: { ...criterion.evaluator, kind: "model" } }] })).toThrow();
    expect(() => parseContract({ ...base, criteria: [{ ...criterion, stage: "human-accepted" }] })).toThrow();
  });

  test("self-authored success cannot demonstrate the outcome", async () => {
    const base = contract(), criterion = base.criteria[0]!;
    const options = await fixture({ ...base, threshold: "outcome-demonstrated", criteria: [criterion, {
      ...criterion, id: "outcome", stage: "outcome-demonstrated", evaluator: { ...criterion.evaluator, origin: "self-authored" },
    }] });
    const behavior = await runCriterion(options);
    const outcome = await runCriterion({ ...options, criterionId: "outcome" });
    const result = await inspectOutcome({ ...options, receipts: [behavior.receipt, outcome.receipt] });
    expect(result.status).toBe("behavior-verified");
    expect(result.thresholdMet).toBe(false);
  });

  test("candidate mutations during execution cannot produce a passing receipt", async () => {
    const options = await fixture(contract([process.execPath, "-e", 'require("node:fs").writeFileSync("candidate.txt", "changed"); console.log(JSON.stringify({ observed: true }))']));
    const receipt = await runCriterion(options);
    expect(receipt.passed).toBe(false);
    expect(receipt.error).toContain("changed");
    expect((await inspectOutcome({ ...options, receipts: [receipt.receipt] })).thresholdMet).toBe(false);
  });

  test("a bounded command timeout cannot become passing evidence", async () => {
    const options = await fixture(contract([process.execPath, "-e", 'console.log(JSON.stringify({ observed: true })); setTimeout(() => {}, 3000)']));
    const receipt = await runCriterion({ ...options, timeoutMs: 100 });
    expect(receipt.passed).toBe(false);
    expect(receipt.error).toContain("timed out");
    expect((await inspectOutcome({ ...options, receipts: [receipt.receipt] })).thresholdMet).toBe(false);
  });

  test("missing executables return failed evidence without hanging", async () => {
    const options = await fixture(contract(["hyperfocus-outcome-deliberately-missing-command-71953"]));
    const receipt = await runCriterion(options);
    expect(receipt.passed).toBe(false);
    expect(receipt.error).not.toBeNull();
  });

  test("synchronous spawn failure does not leave the CLI alive until the command timeout", async () => {
    const options = await fixture(contract([process.execPath, "-e", "\0"]));
    const started = performance.now();
    const child = spawnBackgroundProcess({ cmd: [process.execPath, path.join(import.meta.dir, "cli.ts"), "--run", options.file,
      "--criterion", options.criterionId, "--root", options.root, "--timeout-ms", "1500"] });
    try {
      const [exitCode] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect(exitCode).not.toBe(0);
      expect(performance.now() - started).toBeLessThan(1000);
    } finally { await terminateProcessTree({ process: child }); }
  });

  test("output above the recorder limit produces failed evidence", async () => {
    const options = await fixture(contract([process.execPath, "-e", 'process.stdout.write("x".repeat(9437184))']));
    const receipt = await runCriterion(options);
    expect(receipt.passed).toBe(false);
    expect(receipt.error).not.toBeNull();
    expect((await inspectOutcome({ ...options, receipts: [receipt.receipt] })).thresholdMet).toBe(false);
  });

  test("candidate aliases and evidence traversal are rejected", async () => {
    const options = await fixture();
    await expect(fingerprint({ root: options.root, paths: ["candidate.txt", "./candidate.txt"] })).rejects.toThrow("aliases");
    await expect(boundFile({ root: options.root, file: "../" })).rejects.toThrow();
  });

  test("an escaping output junction is rejected before writing outside the selected root", async () => {
    const options = await fixture();
    const outside = await freshRoot("outside-");
    await symlink(outside, path.join(options.root, ".local"), "junction");
    await expect(runCriterion(options)).rejects.toThrow();
    expect(await readdir(outside)).toEqual([]);
  });

  test.skipIf(process.platform !== "win32")("Windows/Bun observation: the fixture descendant is gone after the command returns", async () => {
    // The descendant deliberately outlives its parent to test the runner's cleanup.
    // It self-terminates within three seconds; finally also kills its recorded PID.
    const source = `import { spawnBackgroundProcess } from ${JSON.stringify(processModule)};
      import { writeFileSync } from "node:fs";
      const child = spawnBackgroundProcess({ cmd: [process.execPath, "-e", 'require("node:fs").writeFileSync("descendant-ready.txt", "ready"); setTimeout(() => {}, 3000)'], stdout: "inherit", stderr: "inherit", keepAliveAfterParentExit: true });
      writeFileSync("descendant.pid", String(child.pid));
      for (let attempt = 0; attempt < 30 && !await Bun.file("descendant-ready.txt").exists(); attempt++) await Bun.sleep(10);
      if (!await Bun.file("descendant-ready.txt").exists()) throw new Error("Fixture descendant did not start");
      console.log(JSON.stringify({ observed: true }));
      process.exit(0);`;
    const options = await fixture(contract([process.execPath, "-e", source]));
    const receipt = await runCriterion(options);
    const pid = Number(await readFile(path.join(options.root, "descendant.pid"), "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) throw new Error("Invalid fixture child PID");
    try {
      expect(receipt.passed).toBe(true);
      expect(alive(pid)).toBe(false);
    } finally { if (alive(pid)) await terminateProcessTree({ pid }); }
  });

  test("CLI rejects execution-only options in check mode and ambiguous modes", () => {
    for (const args of [["--check", "x", "--criterion", "behavior"], ["--check", "x", "--timeout-ms", "1"], ["--check", "x", "--run", "x"], ["--run", "x", "--criterion", "behavior", "--receipt", "x"]]) {
      expect(() => parseArguments(args)).toThrow();
    }
  });
});
