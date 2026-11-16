import type { PlannerReadyTurn } from "@hyperfocus/ai-core/protocol";
import type { QualityTrace } from "@hyperfocus/ai-core/quality";
import { createQualitySession, type QualitySession } from "./session";
import { freezeQualityChecks, runQualityChecks } from "./checks";
import { changedQualityPaths, qualityChangedFiles } from "./changes";
import { runVerificationCommands } from "./commands";

export { qualityCandidate, freezeQualityChecks, runQualityChecks } from "./checks";
export { changedQualityPaths, qualityChangedFiles } from "./changes";
export type OutcomeExecutionPlan = Pick<PlannerReadyTurn, "supervision" | "contracts" | "prerequisites">;
type VerificationReceipt = Parameters<typeof runVerificationCommands>[0]["onReceipt"];
type Admission = { cwd: string; plan: OutcomeExecutionPlan; request: string; signal?: AbortSignal; onReceipt?: VerificationReceipt };

/** Same admission authority for in-process hosts and external agent commands. */
export function assertOutcomeAdmission(options: Admission) {
  options.signal?.throwIfAborted();
  const { supervision, contracts = [], prerequisites = [] } = options.plan;
  if (!supervision) return undefined; // Legacy/trivial plans make no supervised-outcome claim.
  if (supervision.request !== options.request) throw Error("Outcome supervision request changed; preserve the original user request.");
  if (supervision.decision !== "continue") throw Error(`Outcome supervision: ${supervision.decision}. ${supervision.reason}`);
  if (supervision.deadlineAt !== undefined && Date.now() >= supervision.deadlineAt) throw Error("Outcome supervision budget expired; preserve evidence and choose the next decision.");
  for (const contract of contracts) {
    if (contract.contribution?.outcome !== supervision.outcome) throw Error(`Outcome drift in ${contract.taskId}: missing or replaced parent outcome.`);
    if (!contract.deliverables.length) throw Error(`Outcome contribution ${contract.taskId} has no completion evidence.`);
    for (const id of contract.dependsOnPrerequisiteIds) {
      if (!prerequisites.some(item => item.id === id)) throw Error(`Missing outcome prerequisite ${id}.`);
    }
  }
  return JSON.stringify({ supervision, contributions: contracts.map(({ taskId, contribution, effortPoints, deliverables, mergeNotes }) => ({ taskId, contribution, effortPoints, deliverables, mergeNotes })) });
}

export async function checkOutcomeDispatch(options: Admission) {
  const context = assertOutcomeAdmission(options);
  if (!context) return undefined;
  // Persisted completion is never permission to skip actual acceptance.
  for (const prerequisite of options.plan.prerequisites ?? []) {
    assertOutcomeAdmission(options);
    if (prerequisite.status !== "completed" || !prerequisite.verificationCommands?.length) throw Error(`Outcome prerequisite ${prerequisite.id} lacks verified acceptance.`);
    await runVerificationCommands({ cwd: options.cwd, commands: prerequisite.verificationCommands, signal: options.signal, onReceipt: options.onReceipt });
  }
  assertOutcomeAdmission(options);
  return context;
}

/** One execution/check sequence; hosts supply work, never a replacement acceptance implementation. */
export async function executeQualityBoundary<T>(options: Admission & {
  runId: string; onTrace?: (trace: QualityTrace) => void; onResult?: (summary: string) => void;
  execute: (context: { quality: QualitySession; governingContext?: string; assertAdmission: () => void }) => Promise<{ value: T; succeeded: boolean }>;
}) {
  if ((options.plan.prerequisites ?? []).some(item => item.status !== "completed")) {
    throw Error("Prerequisite verification pending: complete prerequisite acceptance checks before executing dependent work.");
  }
  const paths = (options.plan.contracts ?? []).flatMap(contract => contract.ownedPaths);
  const governingContext = await checkOutcomeDispatch(options);
  const quality = createQualitySession({ runId: options.runId, task: { intent: options.request, paths,
    project: /(?:^|[\\/])books$/.test(options.cwd) || paths.some(file => /(?:^|\/)books\//.test(file)) ? "books" : undefined }, onTrace: options.onTrace });
  quality.select();
  const before = await qualityChangedFiles(options.cwd);
  const frozen = await freezeQualityChecks(options.cwd);
  let outcome: { value: T; succeeded: boolean };
  try {
    assertOutcomeAdmission(options);
    outcome = await options.execute({ quality, governingContext, assertAdmission: () => { assertOutcomeAdmission(options); } });
    assertOutcomeAdmission(options);
  } catch (error) {
    try { await runQualityChecks(quality, frozen, false, options.signal); } catch { /* Preserve the causal execution failure. */ }
    throw error;
  }
  const changed = changedQualityPaths(before, await qualityChangedFiles(options.cwd));
  if (changed) quality.observePaths(changed);
  else quality.trace.limitations.push("Changed-file eligibility is unavailable outside an inspectable Git worktree.");
  const commands = (options.plan.contracts ?? []).flatMap(contract => contract.verificationCommands);
  const summary = commands.length || !frozen ? await runVerificationCommands({ cwd: options.cwd, commands, signal: options.signal,
    onResult: options.onResult, onReceipt: options.onReceipt }) : "No additional plan-declared command checks. Quality profile results follow.";
  const report = await runQualityChecks(quality, frozen, outcome.succeeded, options.signal);
  return { ...outcome, report, summary, governingContext, trace: quality.trace };
}
