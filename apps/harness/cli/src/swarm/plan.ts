import { swarmCandidateSchema, swarmTaskSchema, type CreateSwarmRequest, type SwarmTask, type SwarmModelProfiles, type SwarmInvestigationInstrument } from "@hyperfocus/ai-core/swarm";
import { proposeSwarmOutcome } from "./outcome/methods";
export function planSwarm(options: {
  id: string;
  request: CreateSwarmRequest;
  modelProfiles?: SwarmModelProfiles;
  investigationInstruments?: SwarmInvestigationInstrument[];
  round?: number;
  baselineTaskId?: string;
  previousTaskId?: string;
  executionKind?: "performance" | "engineering";
}) {
  const { id, request } = options;
  const engineering = options.executionKind === "engineering";
  const round = options.round ?? 1;
  const roundPrefix = round === 1 ? "" : `r${round}-`;
  const outcome = !engineering && options.investigationInstruments?.length && options.modelProfiles ? proposeSwarmOutcome(request, options.investigationInstruments) : undefined;
  const hypotheses = request.hypotheses ?? (engineering ? Array.from({length:request.strategy==="investigation"?1:request.maxWorkers},(_,index)=>`Investigation ${index+1}: derive a bounded task from the user's goal and current evidence; preserve independent checks and report missing capabilities.`) : outcome ? Array.from({length:request.difficulty==="bounded"||request.strategy==="investigation"?1:3},(_,index)=>`Candidate slot ${index+1}; outcome analysis must establish a relevant hypothesis before work is allocated.`) : request.strategy === "tournament" ? [
    "Measure repeated preparation and writer-originated dirty propagation. Reject this hypothesis if baseline evidence does not support it.",
    "Measure presentation scheduling, changed poses, endpoint availability and publication cadence. Preserve temporal behavior.",
    "Measure allocation churn, retained state and renderer preparation. Separate simulation, preparation, browser and GPU costs.",
  ] : ["Investigate the stated goal, gather reproducible evidence and produce a bounded, independently validated change if justified."]);
  const tasks: SwarmTask[] = [];
  function task(key: string, input: Partial<SwarmTask> & Pick<SwarmTask, "title" | "kind" | "role" | "capability" | "dependencies">) {
    const value = swarmTaskSchema.parse({ id: `${id}-${roundPrefix}${key}`, swarmId: id, agentId: `${id}-${roundPrefix}${key}-agent`, status: "PENDING", attempt: 0, maxAttempts: request.budget.maxRetries + 1, artifactIds: [], acceptanceCriteria: ["Persist attributable evidence before workspace cleanup."], ...input });
    tasks.push(value);
    return value;
  }
  const baseline = options.baselineTaskId ? {id:options.baselineTaskId} : task("baseline", { title: engineering ? "Prepare immutable source and capture current verification evidence" : "Prepare immutable baseline and validate the measurement scenario", kind: "baseline", role: "validator", capability: "execution", dependencies: [] });
  const planning = options.modelProfiles ? task("plan", { title: round===1?"Select useful investigations":"Choose the next investigation from retained evidence", kind: "plan", role: "planner", capability: "reasoning", dependencies: options.previousTaskId?[options.previousTaskId]:request.executionMode==="campaign"&&!engineering?[]:[baseline.id], acceptanceCriteria: request.doneCriteria }) : undefined;
  const candidates = hypotheses.map((hypothesis, index) => {
    const candidateId = `${roundPrefix}candidate-${index + 1}`;
    const experiment = outcome ? task(`experiment-${index + 1}`, { title: `Hypothesis ${index + 1}: trusted falsification experiment`, kind: "experiment", role: "investigator", capability: "execution", dependencies: [baseline.id,planning!.id], candidateId, acceptanceCriteria: ["Retain raw immutable evidence and a deterministic support, contradiction or uncertainty decision before implementation."] }) : undefined;
    const investigate = task(`investigate-${index + 1}`, { title: `Candidate ${index + 1}: independent investigation`, kind: "investigate", role: "implementer", capability: "reasoning", dependencies: [...new Set([baseline.id,experiment?.id??planning?.id??baseline.id])], hypothesis, candidateId, acceptanceCriteria: ["Diagnosis, evidence, risks and bounded patch anchored to source revision.", "Do not modify validation infrastructure to make a candidate pass.", ...request.doneCriteria] });
    let validation = task(`validate-${index + 1}`, { title: `Candidate ${index + 1}: independent correctness checks`, kind: "validate", role: "validator", capability: "execution", dependencies: [investigate.id], candidateId, acceptanceCriteria: ["Replay trusted checks in a fresh baseline workspace with only the candidate patch.", "Keep image/temporal blockers visible."] });
    if(outcome)for(let round=1;round<=request.budget.maxRepairRounds;round++){
      const repair=task(`repair-${index+1}-${round}`,{title:`Candidate ${index+1}: bounded repair ${round} if correctness fails`,kind:"repair",role:"implementer",capability:"reasoning",dependencies:[validation.id],candidateId,hypothesis,maxAttempts:1,acceptanceCriteria:["Declare the defect, expected cause, allowed files and protected invariants before editing.","Retain the rejected patch and repeat every trusted correctness check independently."]});
      validation=task(`revalidate-${index+1}-${round}`,{title:`Candidate ${index+1}: independent revalidation ${round}`,kind:"validate",role:"validator",capability:"execution",dependencies:[repair.id],candidateId,acceptanceCriteria:["Revalidate all previously accepted behavior; no weakening of existing or candidate regression assertions."]});
    }
    return swarmCandidateSchema.parse({ id: candidateId, agentId: investigate.agentId, hypothesis, sourceRevision: request.repository.revision });
  });
  const validationIds = tasks.filter(t => t.kind === "validate").map(t => t.id);
  const benchmark = engineering ? undefined : task("benchmark", { title: "Paired baseline and candidate measurements on an exclusive worker", kind: "benchmark", role: "benchmark-analyst", capability: "benchmark", dependencies: validationIds, acceptanceCriteria: ["Only correctness-qualified candidates are measured.", "No other swarm command may run on the measurement workspace.", "Qualify environment noise and retain every paired trial."] });
  const reviewDependencies = benchmark ? [benchmark.id] : validationIds;
  const review = options.modelProfiles ? task("review", { title: "Review evidence against the explicit completion criteria", kind: "review", role: "reviewer", capability: "reasoning", dependencies: reviewDependencies, acceptanceCriteria: request.doneCriteria }) : undefined;
  task("compare", { title: "Compare evidence and request human disposition", kind: "compare", role: "integrator", capability: "execution", dependencies: review ? [review.id] : reviewDependencies, acceptanceCriteria: [engineering ? "No automatic integration; independent correctness and every requested evidence criterion must pass." : "No automatic integration; missing correctness or uncertain performance blocks promotion."] });
  const difficulty = request.difficulty === "auto" ? request.strategy === "tournament" ? "complex" : "bounded" : request.difficulty;
  const modelPlan = options.modelProfiles ? { ...options.modelProfiles, valueImplementation: options.modelProfiles.implementation, implementation: request.mode === "max-intelligence" || request.mode === "auto" && difficulty === "complex" ? options.modelProfiles.planning : options.modelProfiles.implementation, difficulty, reason: "Initial task-scope estimate; the planner qualifies difficulty from current baseline evidence before implementation." } : undefined;
  return { tasks, candidates, executionKind: options.executionKind ?? "performance", ...modelPlan ? { modelPlan } : {}, ...outcome ? { outcome } : {} };
}
