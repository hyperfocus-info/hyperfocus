import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { executionPlanSchema, outcomeSupervisionSchema } from "@hyperfocus/ai-core/protocol";
import { executeQualityBoundary, freezeQualityChecks } from "@hyperfocus/ai-runtime/quality/execution";
import { runCommand } from "@hyperfocus/ai-runtime/quality/commands";
import { boundFile, digest, loadContract, object } from "./contract";
import { inspectOutcome } from "./check";
import { receiptDirectory, runCriterion } from "./run";

// Reuse existing plan fields. This command has no model/provider or task-state database.
const planSchema = executionPlanSchema.pick({ supervision: true, prerequisites: true, contracts: true })
  .extend({ supervision: outcomeSupervisionSchema });

export async function executeOutcome(options: { root: string; file: string; command: string[]; timeoutMs: number; receipts: string[] }) {
  const file = await boundFile({ root: options.root, file: options.file });
  const raw = await readFile(file, "utf8");
  const task = object(JSON.parse(raw.replace(/^\uFEFF/, "")));
  const plan = planSchema.parse(task.executionPlan ?? task);
  const acceptance = task.outcomeContract ? await loadContract({ root: options.root, file }) : undefined;
  if (acceptance && (acceptance.contract.requested !== plan.supervision.request || acceptance.contract.outcome !== plan.supervision.outcome)) {
    throw Error("Outcome drift: execution and acceptance must preserve the same request and parent outcome.");
  }
  if (!plan.contracts.some(contract => contract.verificationCommands.length)
    && !acceptance?.contract.criteria.some(criterion => criterion.evaluator.kind === "command")
    && !await freezeQualityChecks(options.root)) throw Error("No executable acceptance established; declare the existing domain check before starting work.");
  const current = async () => {
    if (await readFile(file, "utf8") !== raw) throw Error("Task changed after dispatch; preserve this attempt and start a fresh invocation.");
  };
  const directory = await receiptDirectory(options.root), runId = crypto.randomUUID();
  const prefix = path.join(directory, `execution-${runId}`);
  const relative = (name: string) => path.relative(options.root, name).replaceAll("\\", "/");
  const receipt: { taskSha256: string; request: string; outcome: string; command: string[]; startedAt: string; workStarted: boolean; workExitCode: number | null; technicalVerification: string; outcomeVerification: string; domainAcceptance: string; contextDelivery: string; context: string; checks: {command: string; stdout: string; exitCode: number}[]; acceptance: Awaited<ReturnType<typeof inspectOutcome>> | undefined; quality: Awaited<ReturnType<typeof executeQualityBoundary>>["report"] | undefined; error: string | null; exitCode: number } = {
    taskSha256: digest(raw), request: plan.supervision.request, outcome: plan.supervision.outcome, command: options.command,
    startedAt: new Date().toISOString(), workStarted: false, workExitCode: null,
    technicalVerification: "UNVERIFIED", outcomeVerification: "UNVERIFIED", domainAcceptance: "UNVERIFIED",
    contextDelivery: "UNKNOWN", context: relative(`${prefix}.context.txt`),
    checks: [],
    acceptance: undefined,
    quality: undefined,
    error: null, exitCode: 1,
  };
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(Error("Outcome execution deadline expired.")), options.timeoutMs);
  try {
    const result = await executeQualityBoundary({ cwd: options.root, runId, plan, request: plan.supervision.request, signal: deadline.signal,
      onReceipt: value => { receipt.checks.push(value); },
      execute: async ({ quality, governingContext, assertAdmission }) => {
        await current(); assertAdmission();
        const context = `${governingContext}\n${quality.context("main")}`;
        await writeFile(`${prefix}.context.txt`, context, { flag: "wx" });
        // An environment/file handoff is inspectable, but cannot prove a model read it.
        quality.delivery("main", "unsupported", true, context);
        receipt.workStarted = true;
        const work = await runCommand({ cwd: options.root, cmd: options.command, signal: deadline.signal, timeoutMs: options.timeoutMs,
          env: { ...process.env, HYPERFOCUS_OUTCOME_CONTEXT: `${prefix}.context.txt` } });
        receipt.workExitCode = work.exitCode;
        await writeFile(`${prefix}.stdout.log`, work.stdout, { flag: "wx" });
        await writeFile(`${prefix}.stderr.log`, work.stderr, { flag: "wx" });
        await current();
        if (work.exitCode !== 0) throw Error(`Work command failed with exit ${work.exitCode}. See execution logs.`);
        return { value: undefined, succeeded: true };
      } });
    receipt.quality = result.report;
    await current();
    const receipts = [...options.receipts];
    if (acceptance) {
      for (const criterion of acceptance.contract.criteria.filter(row => row.evaluator.kind === "command")) {
        deadline.signal.throwIfAborted();
        await current();
        const remaining = options.timeoutMs - (Date.now() - Date.parse(receipt.startedAt));
        if (remaining < 1) throw Error("Outcome execution deadline expired.");
        const check = await runCriterion({ root: options.root, file, criterionId: criterion.id, timeoutMs: remaining });
        receipts.push(check.receipt);
        // Preserve a failed criterion; do not continue expensive evaluation after it falsifies acceptance.
        if (!check.passed) break;
      }
      await current();
      receipt.acceptance = await inspectOutcome({ root: options.root, file, receipts });
    }
    deadline.signal.throwIfAborted();
    const qualityPassed = !result.report.rules.some(rule => rule.eligibility === "yes" && rule.severity === "blocking") || result.report.state === "VERIFIED";
    const behaviorPassed = receipt.acceptance && ["behavior-verified", "outcome-demonstrated", "human-accepted"].includes(receipt.acceptance.status);
    const technical = qualityPassed && (behaviorPassed || (plan.contracts.some(contract => contract.verificationCommands.length > 0) && (!receipt.acceptance || !receipt.acceptance.failures.length)));
    receipt.technicalVerification = technical ? "TECHNICALLY VERIFIED" : "UNVERIFIED";
    if (qualityPassed && receipt.acceptance && ["outcome-demonstrated", "human-accepted"].includes(receipt.acceptance.status)) receipt.outcomeVerification = "OUTCOME VERIFIED";
    receipt.domainAcceptance = receipt.acceptance?.status === "human-accepted" ? "HUMAN ACCEPTED"
      : acceptance?.contract.criteria.some(row => row.stage === "human-accepted") || result.report.domainAcceptance === "HUMAN / DOMAIN ACCEPTANCE REQUIRED"
        ? "HUMAN / DOMAIN ACCEPTANCE REQUIRED" : "UNVERIFIED";
    receipt.exitCode = technical && receipt.acceptance?.thresholdMet && receipt.domainAcceptance !== "HUMAN / DOMAIN ACCEPTANCE REQUIRED" ? 0 : 2;
  } catch (error) { receipt.error = error instanceof Error ? error.message : String(error); }
  finally { clearTimeout(timer); }
  await writeFile(`${prefix}.json`, JSON.stringify(receipt, null, 2), { flag: "wx" });
  return { receipt: relative(`${prefix}.json`), exitCode: receipt.exitCode, error: receipt.error && receipt.error.slice(0, 1000),
    workStarted: receipt.workStarted, workExitCode: receipt.workExitCode,
    technicalVerification: receipt.technicalVerification, outcomeVerification: receipt.outcomeVerification,
    domainAcceptance: receipt.domainAcceptance, contextDelivery: receipt.contextDelivery,
    acceptance: receipt.acceptance && { status: receipt.acceptance.status, threshold: receipt.acceptance.threshold,
      thresholdMet: receipt.acceptance.thresholdMet, unresolved: receipt.acceptance.criteria.filter(row => !row.passed), failures: receipt.acceptance.failures },
    checks: receipt.checks.map(({ command, exitCode }) => ({ command, exitCode })) };
}
