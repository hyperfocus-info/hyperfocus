import type { SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";
import { swarmInvestigationSummary } from "../execution/investigation-summary";

export const budgetFinalizationSystem = "The investigation's normal context no longer fits its remaining token budget. Return exactly one JSON object: {action:'finish',diagnosis:string,risks:string[],hypothesisSupported:boolean}. Summarize retained evidence and explicitly name unfinished work. This is an incomplete, non-promotable interruption report, not a successful candidate. No tools or further implementation are authorized in this report-only turn. Do not invent missing checks, results or image inspection.";

export function budgetFinalizationEvidence(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask, observation: string) {
  return { status: "INCOMPLETE_BUDGET_FINALIZATION", promotable: false, ...swarmInvestigationSummary(context, run, task, observation) };
}
