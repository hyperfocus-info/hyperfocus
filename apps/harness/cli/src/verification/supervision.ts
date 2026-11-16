import { executeQualityBoundary } from "@hyperfocus/ai-runtime/quality/execution";
import type { PiAgentAdapter } from "../pi-agent-adapter";
import type { executeReadyRun } from "../pi-orchestrator";
import { withQualityContext } from "./quality-adapter";

/** Harness supplies the provider adapter; shared runtime owns admission and acceptance. */
export async function executeWithQuality(adapter: PiAgentAdapter, options: Parameters<typeof executeReadyRun>[1], execute: (adapter: PiAgentAdapter) => ReturnType<typeof executeReadyRun>): ReturnType<typeof executeReadyRun> {
  const intent = options.messages.filter(message => message.role === "user").at(-1)?.content ?? options.readyPlan.finalExecutionBrief;
  const { value: outcome, summary, report, governingContext } = await executeQualityBoundary({ cwd: options.cwd, runId: options.runId,
    plan: options.executionPlan ?? options.readyPlan, request: intent, signal: options.abortSignal,
    onTrace: options.callbacks?.onQuality, onResult: options.callbacks?.onRunMilestone,
    execute: async ({ quality, governingContext, assertAdmission }) => {
      const value = await execute(withQualityContext(adapter, quality, governingContext, assertAdmission));
      return { value, succeeded: !value.partial };
    } });
  outcome.assistantMessage.content += `\n\n${summary}`;
  if (report.rules.some(rule => rule.eligibility === "yes" && rule.severity === "blocking")) {
    outcome.assistantMessage.content += `\n\nHost checks: ${report.technicalVerification}; ${report.counts.passed}/${report.counts.applicable} requirements passed. Parent outcome: ${report.outcomeVerification}; ${report.domainAcceptance}.`;
    if (report.state !== "VERIFIED") {
      outcome.partial = true;
      outcome.partialReason = "Quality verification incomplete: " + report.rules.filter(rule => rule.severity === "blocking" && rule.eligibility !== "no" && rule.status !== "PASSED").map(rule => `${rule.id}: ${rule.status}`).join("; ");
    }
  }
  if (governingContext && !report.counts.applicable) outcome.assistantMessage.content += "\n\nParent outcome: UNVERIFIED. Dispatch checks and child completion do not establish the requested experience.";
  return outcome;
}
