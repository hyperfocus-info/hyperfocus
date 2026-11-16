import { z } from "zod";
import { extractJsonValue } from "@hyperfocus/ai-core/runtime";
import { swarmOutcomeSchema, swarmHypothesisSchema, type SwarmRun, type SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { LocalAiRuntime } from "@hyperfocus/ai-runtime";
import type { SwarmTaskContext } from "../execution/task-context";
import { runSwarmModelTurn, swarmHandoff, type SwarmModelAdmission } from "../reasoning/model-turn";
import { availableSwarmMethods } from "./methods";
import { swarmInstrumentIdentity, swarmProbeIdentity } from "./instrument-identity";
import { campaignCandidateIds } from "../campaign";

const analysisSchema = swarmOutcomeSchema.pick({ intendedOutcome: true, observedSymptoms: true, assumptions: true, acceptanceCriteria: true, downstreamConsequences: true, limitations: true }).extend({
  difficulty: z.enum(["bounded", "complex"]), reason: z.string().min(1).max(2_000),
  hypotheses: z.array(swarmHypothesisSchema.omit({ status: true, instrumentSha256: true })).max(3),
}).strict();

export const swarmOutcomePlanningInstructions = [
  "Analyze the desired user-facing outcome before selecting any implementation. Distinguish task success from outcome success. Preserve the exact request scope and completion criteria; reinterpretation grants no new authority.",
  "Return {difficulty:'bounded'|'complex',reason,intendedOutcome,observedSymptoms:string[],assumptions:[{claim,falsification}],acceptanceCriteria:[{criterion,metric,evaluatorMethodId:string|null}],downstreamConsequences:string[],limitations:string[],hypotheses:[{candidateId,claim,methodId,implementationStrategy?:string,supportingEvidenceIds:string[],contradictingEvidenceIds:string[],verificationCostUsd,experiment:{instrumentId,objective,expectedInformationGain,expectedIfCorrect,expectedIfIncorrect,timeoutMs,maxComputeUsd}}]}.",
  "Select the smallest useful set (zero to three) of distinct supplied candidate IDs. One simple fix needs one candidate. Select only available trusted instruments; copy each instrument's claim and methodId exactly. Multiple independent methods must earn their cost. Prefer cheap falsification and contradictory evidence over several implementations of an untested assumption.",
  "Use distinct instruments to challenge explanations. Bounded competing implementations may share an instrument only with distinct explicit implementationStrategy values; they remain blocked until its hypothesis is supported. The raw experiment is reused, not counted as replication. Use declared predicates as the interpretation. Do not invent command execution, symptoms, evidence or measurements. Cite only supplied immutable artifacts. Bound timeout and cost to instrument limits.",
  "An instrument with implementationEligible:false acquires evidence without authorizing implementation. A constraint instrument tests a protected validity boundary; a diagnostic instrument supplies observations such as sampled stack attribution. All experiment evidence is shared before implementations begin.",
  "Return every exact done criterion once, with an observable metric and available independent evaluator method, or evaluatorMethodId:null when no evaluator is available. State unavailable evidence as a limitation. Submission rate is not displayed motion freshness; CPU workload timing cannot establish browser/GPU/player experience.",
  "The host's outcomeCriteria are the only independently executable acceptance bindings. Copy their metric and evaluatorMethodId exactly when the criterion matches; criteria without a trusted binding remain unsupported for outcome demonstration even if an investigation task can complete.",
  "If no available instrument can test a relevant explanation, select no hypotheses and state the missing evidence. Never force an irrelevant instrument to fit the goal. No model verdict can substitute for raw independent correctness or outcome evidence.",
].join("\n");

export async function planSwarmOutcome(options: {
  context: SwarmTaskContext; runtime: LocalAiRuntime; run: SwarmRun; task: SwarmTask;
  signal: AbortSignal; maxTokenPriceUsd: number; beforeModelCall?: SwarmModelAdmission;
}) {
  const { context, run, task } = options, current = context.store.get(run.id)!;
  if (!current.outcome || !current.modelPlan) throw Error("Outcome planning requires the proposed contract and trusted model profiles.");
  const instruments = context.recipe(run).investigationInstruments;
  const activeIds=campaignCandidateIds(current);
  const methods = availableSwarmMethods(instruments);
  const baseline = current.messages.filter(message => message.kind==="evidence"&&current.tasks.some(task => task.kind === "baseline" && task.id === message.taskId)).map(message => message.text).join("\n").slice(-3_000);
  const result = await runSwarmModelTurn({ ...options, profile: current.modelPlan.planning,
    system: `You are the trusted Hyperfocus outcome planner. Return one JSON object only. No tools or task delegation.\n${swarmOutcomePlanningInstructions}\nFor campaign rounds, select a useful next step from previous findings. Never repeat a contradicted instrument on the same source or retry an identical implementation strategy. Supported hypotheses need a distinct evidence-backed strategy; exhausted instruments mean no hypotheses and an explicit blocker. A baseline still running supplies no measurements.`,
    messages: [{ role: "user", content: JSON.stringify({ handoff: swarmHandoff(context, run, task), request: { goal: current.request.goal, doneCriteria: current.request.doneCriteria, hypotheses: current.request.hypotheses }, candidates: activeIds, previousHypotheses:current.outcome.hypotheses, previousFindings:current.candidates.filter(candidate=>!activeIds.includes(candidate.id)).map(candidate=>({hypothesis:candidate.hypothesis,diagnosis:candidate.diagnosis.slice(0,1200),blockers:candidate.blockers,comparison:candidate.comparison})), baseline, methods, outcomeCriteria: context.recipe(run).outcomeCriteria, instruments: instruments.map(({ command: _command, ...instrument }) => instrument), evidence: current.artifacts.filter(artifact=>artifact.kind!=="log").map(({ id, name, kind }) => ({ id, name, kind })) }) }],
  });
  await context.artifact(run, task, { name: `outcome-analysis-response-${task.attempt}.txt`, kind: "report", mediaType: "text/plain", bytes: result.text });
  const plan = analysisSchema.parse(extractJsonValue(result.text));
  validateOutcomePlan(plan, current, instruments, methods.map(method => method.id));
  const artifact = await context.artifact(run, task, { name: "outcome-analysis.json", kind: "report", mediaType: "application/json", bytes: JSON.stringify(plan) });
  context.change(run, task, latest => {
    const outcome = latest.outcome!, model = latest.modelPlan!;
    Object.assign(outcome, { phase: "analyzed", intendedOutcome: plan.intendedOutcome, observedSymptoms: plan.observedSymptoms, assumptions: plan.assumptions, acceptanceCriteria: plan.acceptanceCriteria, downstreamConsequences: plan.downstreamConsequences, limitations: [...plan.limitations, ...context.recipe(run).blockedPromotionReasons].slice(0, 20), artifactId: artifact.id });
    outcome.hypotheses = [...outcome.hypotheses.filter(hypothesis=>!activeIds.includes(hypothesis.candidateId)),...plan.hypotheses.map(hypothesis => ({ ...hypothesis, status: "untested" as const, instrumentSha256: swarmInstrumentIdentity(instruments.find(instrument=>instrument.id===hypothesis.experiment.instrumentId)!) }))];
    const selectedMethods = new Set(["correctness-regression", "paired-performance", ...plan.hypotheses.map(hypothesis => hypothesis.methodId)]);
    outcome.methods = methods.filter(method => selectedMethods.has(method.id));
    model.difficulty = latest.request.difficulty === "auto" ? plan.difficulty : latest.request.difficulty;
    model.reason = plan.reason;
    model.implementation = latest.request.mode === "max-intelligence" || latest.request.mode === "auto" && model.difficulty === "complex" ? model.planning : model.valueImplementation;
    for (const candidate of latest.candidates.filter(candidate=>activeIds.includes(candidate.id))) {
      const hypothesis = outcome.hypotheses.find(hypothesis => hypothesis.candidateId === candidate.id);
      if (!hypothesis) {
        candidate.disposition = "rejected";
        candidate.blockers.push("Outcome analysis did not select this candidate; no worker or workspace allocated.");
        for (const dependent of latest.tasks.filter(task => task.candidateId === candidate.id && task.status === "PENDING")) {
          dependent.status = "SUCCEEDED"; dependent.completedAt = Date.now(); dependent.title += " (not needed)";
        }
        continue;
      }
      candidate.hypothesis = hypothesis.claim;
      const instrument = instruments.find(instrument => instrument.id === hypothesis.experiment.instrumentId)!;
      const experiment = latest.tasks.find(task => task.kind === "experiment" && task.candidateId === candidate.id)!;
      experiment.hypothesis = hypothesis.claim;
      experiment.capability = instrument.lane === "benchmark" ? "benchmark" : "execution";
      experiment.title = `Test: ${hypothesis.claim}`.slice(0, 300);
      for(const implementation of latest.tasks.filter(task => ["investigate","repair"].includes(task.kind)&&task.candidateId === candidate.id))implementation.hypothesis = hypothesis.implementationStrategy ? `${hypothesis.claim}\nCandidate strategy: ${hypothesis.implementationStrategy}` : hypothesis.claim;
    }
    const selectedExperiments = latest.tasks.filter(task => task.kind === "experiment" && task.status === "PENDING");
    // Identical immutable probes share raw evidence without repeating setup or execution.
    const commandOwners = new Map<string, string>();
    for (const experiment of selectedExperiments) {
      const hypothesis = outcome.hypotheses.find(value => value.candidateId === experiment.candidateId)!;
      const instrument = instruments.find(value => value.id === hypothesis.experiment.instrumentId)!;
      const key = swarmProbeIdentity(instrument,hypothesis.experiment.timeoutMs);
      const owner = commandOwners.get(key);
      if (owner) experiment.dependencies.push(owner);
      else commandOwners.set(key, experiment.id);
    }
    for (const implementation of latest.tasks.filter(task => task.kind === "investigate" && task.status === "PENDING")) implementation.dependencies = [...new Set([...implementation.dependencies,...selectedExperiments.map(task => task.id)])];
  });
  context.message(run, task, `Outcome: ${plan.intendedOutcome}\n${plan.reason}\nSelected ${plan.hypotheses.length} falsification experiments.`, "evidence", [artifact.id]);
}

function validateOutcomePlan(plan: z.infer<typeof analysisSchema>, run: SwarmRun, instruments: ReturnType<SwarmTaskContext["recipe"]>["investigationInstruments"], methodIds: string[]) {
  const criteria = run.request.doneCriteria;
  if (plan.acceptanceCriteria.length !== criteria.length || new Set(plan.acceptanceCriteria.map(value => value.criterion)).size !== criteria.length || plan.acceptanceCriteria.some(value => !criteria.includes(value.criterion) || value.evaluatorMethodId!==null&&!methodIds.includes(value.evaluatorMethodId))) throw Error("Outcome analysis must preserve every exact completion criterion and use available evaluators.");
  if (new Set(plan.hypotheses.map(value => value.candidateId)).size !== plan.hypotheses.length) throw Error("Hypotheses require distinct candidate identities.");
  for(const hypothesis of plan.hypotheses){const peers=plan.hypotheses.filter(value=>value.experiment.instrumentId===hypothesis.experiment.instrumentId);if(peers.length>1&&(peers.some(value=>!value.implementationStrategy)||new Set(peers.map(value=>value.implementationStrategy)).size!==peers.length))throw Error("Competing candidates sharing a hypothesis require distinct implementation strategies.");}
  for (const hypothesis of plan.hypotheses) {
    const instrument = instruments.find(value => value.id === hypothesis.experiment.instrumentId);
    if (!campaignCandidateIds(run).includes(hypothesis.candidateId) || !instrument || instrument.methodId !== hypothesis.methodId || instrument.claim !== hypothesis.claim) throw Error("Hypothesis must bind an available trusted instrument and its exact falsifiable claim.");
    const previous=run.outcome?.hypotheses.filter(value=>!campaignCandidateIds(run).includes(value.candidateId)&&value.experiment.instrumentId===instrument.id)??[];
    if(previous.some(value=>value.status==="contradicted"))throw Error("Campaign cannot repeat a contradicted instrument on the same immutable source.");
    if(previous.some(value=>(value.implementationStrategy??"").trim().toLowerCase()===(hypothesis.implementationStrategy??"").trim().toLowerCase()))throw Error("Campaign cannot repeat an identical implementation strategy without new evidence.");
    if (hypothesis.experiment.timeoutMs > instrument.timeoutMs || hypothesis.experiment.maxComputeUsd > instrument.maxComputeUsd || hypothesis.verificationCostUsd > hypothesis.experiment.maxComputeUsd || hypothesis.experiment.maxComputeUsd > run.request.budget.maxComputeUsd) throw Error("Experiment exceeds its declared resource budget.");
    if ([...hypothesis.supportingEvidenceIds, ...hypothesis.contradictingEvidenceIds].some(id => !run.artifacts.some(artifact => artifact.id === id && artifact.sourceRevision === run.request.repository.revision))) throw Error("Hypothesis evidence must cite existing source-bound artifacts.");
  }
}
