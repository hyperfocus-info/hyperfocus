import { executionPlanSchema, outcomeSupervisionSchema } from "@hyperfocus/ai-core/protocol";
import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { removeOwnedDirectory } from "@hyperfocus/desktop-runtime/filesystem";
import { runCommand } from "@hyperfocus/ai-runtime/quality/commands";
import { checkOutcomeDispatch } from "@hyperfocus/ai-runtime/quality/execution";
import { parseArguments } from "./cli";

const parent = path.resolve(import.meta.dir, "../../../.local/outcome-portability/tests");
const roots: string[] = [];
afterAll(async () => { for (const directory of roots) await removeOwnedDirectory({ directory, parent }); });

async function fixture() {
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "run-")); roots.push(root);
  const outcome = "Recover the saved invoice without losing edits";
  const supervision = { request: "Repair invoice recovery", intent: "Avoid retyping bookkeeping work", outcome,
    experience: "Resume the exact draft", evidence: ["Read the saved draft after reopening"], constraints: ["Keep accepted amounts"],
    budget: "One fixture execution", decision: "continue", reason: "A round trip tests the reported failure" };
  const plan = { supervision, prerequisites: [{ id: "pilot", title: "Pilot", instruction: "Check the known failure", reason: "Reject before expansion",
    requiredForTaskIds: ["repair"], owner: "main", status: "completed", verificationCommands: ["bun verify.ts pilot"] }],
    contracts: [{ taskId: "repair", title: "Repair", instruction: "Recover draft", effortPoints: 1, ownedPaths: ["invoice.json"],
      dependsOnPrerequisiteIds: ["pilot"], deliverables: ["Recovered invoice"], integrationPoints: [], verificationScope: "owned-files-only",
      verificationCommands: ["bun verify.ts implementation"], mergeNotes: "Preserve the amount",
      contribution: { outcome, limitingFactor: "Draft recovery", evidence: "Lost draft", expectedImprovement: "No retyping", stopWhen: "Round trip fails" } }] };
  const task = { ...plan, outcomeContract: { schema: "hyperfocus-outcome-v1", requested: supervision.request, outcome, next: "Use recovered draft",
    scope: ["Disposable invoice fixture"], constraints: supervision.constraints, evidenceAvailable: [], limits: ["Fixture, not deployed Books"], assumptions: [],
    candidate: { description: "Invoice and evaluator", paths: ["invoice.json", "verify.ts"] }, threshold: "outcome-demonstrated",
    criteria: ["behavior-verified", "outcome-demonstrated"].map((stage, index) => ({ id: index ? "recovery" : "integrity", stage,
      metric: "Saved amount survives the public file round trip", evaluator: { kind: "command", origin: "held-out",
        method: "Compare actual saved data", independence: "Known expected draft, independent of completion text",
        command: [process.execPath, "verify.ts", "acceptance"], expect: { preserved: true } } })) } };
  await writeFile(path.join(root, "pilot.txt"), "pass");
  await writeFile(path.join(root, "verify.ts"), `import {appendFileSync,readFileSync,existsSync} from "node:fs";
    const stage=process.argv[2]; appendFileSync("order.txt", stage+"\\n");
    if(stage==="pilot") process.exit(readFileSync("pilot.txt","utf8")==="pass"?0:7);
    if(stage==="implementation") process.exit(existsSync("invoice.json")?0:8);
    console.log(JSON.stringify({preserved:JSON.parse(readFileSync("invoice.json","utf8")).amount===1234}));`);
  await writeFile(path.join(root, "work.ts"), `import {appendFileSync,readFileSync,writeFileSync} from "node:fs";
    const context=readFileSync(process.env.HYPERFOCUS_OUTCOME_CONTEXT!,"utf8");
    if(!context.includes(${JSON.stringify(outcome)})) throw Error("Missing parent outcome");
    appendFileSync("order.txt","work\\n"); writeFileSync("invoice.json",JSON.stringify({amount:1234}));`);
  await writeFile(path.join(root, "task.json"), JSON.stringify(task));
  return { root, task };
}

async function invoke(root: string) {
  const result = await runCommand({ cwd: root, cmd: [process.execPath, path.join(import.meta.dir, "cli.ts"), "--execute", "task.json", "--", "bun", "work.ts"] });
  expect(result.stderr).toBe("");
  return { code: result.exitCode, data: JSON.parse(result.stdout) };
}

test("external CLI and shared admission both reject a failed completed pilot before work", async () => {
  const { root, task } = await fixture();
  await writeFile(path.join(root, "pilot.txt"), "fail");
  const result = await invoke(root);
  expect(result.code).toBe(1);
  expect(result.data.error).toContain("exit 7");
  expect(result.data.workStarted).toBe(false);
  expect(await Bun.file(path.join(root, "invoice.json")).exists()).toBe(false);
  expect(await readFile(path.join(root, "order.txt"), "utf8")).toBe("pilot\n");
  await expect(checkOutcomeDispatch({ cwd: root, plan: executionPlanSchema.pick({ supervision: true, prerequisites: true, contracts: true }).extend({ supervision: outcomeSupervisionSchema }).parse(task), request: task.supervision.request })).rejects.toThrow("exit 7");
});

test("CLI runs prerequisite, work and all acceptance without an agent sequencing the steps", async () => {
  const { root, task } = await fixture();
  // Windows PowerShell's UTF-8 writer emits a BOM; it must not require a separate task format.
  await writeFile(path.join(root, "task.json"), "\uFEFF" + JSON.stringify(task));
  const result = await invoke(root);
  expect(result.code).toBe(0);
  expect(result.data.technicalVerification).toBe("TECHNICALLY VERIFIED");
  expect(result.data.outcomeVerification).toBe("OUTCOME VERIFIED");
  expect(result.data.contextDelivery).toBe("UNKNOWN");
  expect(await readFile(path.join(root, "order.txt"), "utf8")).toBe("pilot\nwork\nimplementation\nacceptance\nacceptance\n");
  expect(JSON.parse(await readFile(path.join(root, result.data.receipt), "utf8")).acceptance.thresholdMet).toBe(true);
});

test("child completion and technical checks cannot clear missing qualitative acceptance", async () => {
  const { root, task } = await fixture();
  const human = { id: "experience", stage: "human-accepted", metric: "Owner accepts the experience", evaluator: {
    kind: "human", method: "Scoped review", independence: "Actual owner" } };
  await writeFile(path.join(root, "task.json"), JSON.stringify({ ...task, outcomeContract: { ...task.outcomeContract,
    threshold: "human-accepted", criteria: [...task.outcomeContract.criteria, human] } }));
  const result = await invoke(root);
  expect(result.code).toBe(2);
  expect(result.data.workExitCode).toBe(0);
  expect(result.data.technicalVerification).toBe("TECHNICALLY VERIFIED");
  expect(result.data.domainAcceptance).toBe("HUMAN / DOMAIN ACCEPTANCE REQUIRED");
  expect(result.data.acceptance.thresholdMet).toBe(false);
});

test("drift, missing verification and explicit stop reject before any production work", async () => {
  for (const failure of ["drift", "missing-check", "stop"] as const) {
    const { root, task } = await fixture();
    if (failure === "drift") task.contracts[0]!.contribution.outcome = "Polish one irrelevant widget";
    if (failure === "missing-check") task.prerequisites[0]!.verificationCommands = [];
    if (failure === "stop") task.supervision.decision = "stop";
    await writeFile(path.join(root, "task.json"), JSON.stringify(task));
    const result = await invoke(root);
    expect(result.code).toBe(1);
    expect(result.data.workStarted).toBe(false);
    expect(await Bun.file(path.join(root, "invoice.json")).exists()).toBe(false);
  }
});

test("work cannot remove its acceptance checks after dispatch or convert completion prose into outcome success", async () => {
  const { root } = await fixture();
  await writeFile(path.join(root, "work.ts"), 'await Bun.write("task.json", "{}"); console.log("OUTCOME VERIFIED");');
  const result = await invoke(root);
  expect(result.code).toBe(1);
  expect(result.data.error).toContain("Task changed after dispatch");
  expect(result.data.outcomeVerification).toBe("UNVERIFIED");
});

test("CLI rejects bypass flags and ambiguous trailing work", () => {
  for (const args of [["--execute", "x"], ["--execute", "x", "--skip-checks", "yes", "--", "bun", "work.ts"],
    ["--run", "x", "--criterion", "y", "--", "bun", "work.ts"]]) expect(() => parseArguments(args)).toThrow();
});

test("missing executable acceptance is rejected before starting work", async () => {
  const { root, task } = await fixture();
  await writeFile(path.join(root, "task.json"), JSON.stringify({ ...task, contracts: [], outcomeContract: undefined }));
  const result = await invoke(root);
  expect(result.code).toBe(1);
  expect(result.data.error).toContain("No executable acceptance");
  expect(await Bun.file(path.join(root, "order.txt")).exists()).toBe(false);
});
