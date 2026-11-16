import { afterEach, expect, test } from "bun:test";
import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { boundFile, object, parseContract } from "./contract";
import methods from "./methods.json";

const repository = path.resolve(import.meta.dir, "../../..");
const fixtures: string[] = [];
afterEach(async () => {
  for (const root of fixtures.splice(0)) {
    const relative = path.relative(path.join(repository, ".local"), root);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Refusing to remove an unowned fixture.");
    await rm(root, { recursive: true, force: true });
  }
});

async function cli(root: string, args: string[]) {
  const child = spawnBackgroundProcess({ cmd: [process.execPath, path.join(import.meta.dir, "cli.ts"), ...args, "--root", root], timeout: 5000 });
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(stderr).toBe("");
    return { code, data: object(JSON.parse(stdout)) };
  } finally { await terminateProcessTree({ process: child }); }
}

test("discovered instruments exist within the repository", async () => {
  for (const method of Object.values(methods)) {
    for (const file of method.instruments) expect(await boundFile({ root: repository, file })).toBeTruthy();
  }
});

test("CLI records a real exit but rejects successful plan output as completed acceptance", async () => {
  await mkdir(path.join(repository, ".local"), { recursive: true });
  const root = await mkdtemp(path.join(repository, ".local/outcome-cli-")); fixtures.push(root);
  await writeFile(path.join(root, "candidate.txt"), "one candidate");
  const contract = parseContract({
    schema: "hyperfocus-outcome-v1", requested: "Check a release gate", outcome: "Distinguish planning from passing checks", next: "Run the actual gate",
    scope: ["Disposable gate output"], constraints: [], evidenceAvailable: [], limits: ["No actual release"], assumptions: [],
    candidate: { description: "Fixture", paths: ["candidate.txt"] }, threshold: "behavior-verified",
    criteria: [{ id: "gate", stage: "behavior-verified", metric: "Automated checks passed", evaluator: {
      kind: "command", origin: "existing", method: "Gate status", independence: "Predeclared external status",
      command: [process.execPath, "-e", 'console.log(JSON.stringify({status:"planned"}))'], expect: { status: "automated-checks-passed" },
    } }],
  });
  await writeFile(path.join(root, "task.json"), JSON.stringify({ existingPlan: "Retained", outcomeContract: contract }));
  // A misspelled assertion must not silently weaken JSON acceptance to exit zero.
  const criterion = contract.criteria[0]!;
  expect(() => parseContract({ ...contract, criteria: [{ ...criterion, evaluator: { ...criterion.evaluator, expect: undefined, expected: { status: "automated-checks-passed" } } }] })).toThrow("Unknown contract fields");
  const absent = await cli(root, ["--check", "task.json"]);
  expect(absent.code).toBe(1); expect(absent.data.status).toBe("code-written");
  const run = await cli(root, ["--run", "task.json", "--criterion", "gate"]);
  expect(run.code).toBe(1); expect(run.data.exitCode).toBe(0); expect(run.data.passed).toBe(false);
  if (typeof run.data.receipt !== "string") throw new Error("Receipt missing.");
  const checked = await cli(root, ["--check", "task.json", "--receipt", run.data.receipt]);
  expect(checked.code).toBe(1); expect(checked.data.thresholdMet).toBe(false);
  expect(JSON.parse(await readFile(path.join(root, "task.json"), "utf8")).existingPlan).toBe("Retained");
});
