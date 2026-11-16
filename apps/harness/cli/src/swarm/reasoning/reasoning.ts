import { z } from "zod";
import type { LocalAiRuntime } from "@hyperfocus/ai-runtime";
import type { SwarmRun, SwarmTask, ExecutionWorkspace } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";
import { extractJsonValue } from "@hyperfocus/ai-core/runtime";
import { runSwarmModelTurn, swarmHandoff, swarmModelReservation, type SwarmModelAdmission } from "./model-turn";
import { artifactReadSchema } from "../execution/command-evidence";
import { preserveSwarmInterruptedPatch } from "../execution/failure-evidence";
import { swarmArtifactPathSchema } from "../execution/task-context";
import { captureEngineeringEvidence } from "../execution/engineering";
import { commandObservation, observationExcerpt } from "./observations";
import { budgetFinalizationEvidence, budgetFinalizationSystem } from "./budget-finalization";
import { isSwarmModelBudgetError, type SwarmModelBudgetError } from "../model-budget";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("execute"), command: z.string().min(1).max(16000), purpose: z.string().max(2000), finding:z.string().max(2000).optional(), checkpoint:z.boolean().optional() }).strict(),
  z.object({ action: z.literal("finding"), text: z.string().min(1).max(12000), kind: z.enum(["evidence", "hypothesis", "blocker", "modification"]) }).strict(),
  z.object({ action: z.literal("search"), query: z.string().min(1).max(500) }).strict(),
  z.object({ action: z.literal("capture"), paths: z.array(swarmArtifactPathSchema).min(1).max(32) }).strict(),
  z.object({ action: z.literal("repair-plan"), expectedCause: z.string().min(3).max(2_000), diagnosis: z.enum(["incorrect-hypothesis", "missing-evidence", "wrong-primitive", "inadequate-evaluator", "incompatible-requirements", "insufficient-domain-knowledge", "implementation-defect"]), proceed: z.boolean() }).strict(),
  artifactReadSchema.extend({ action: z.literal("artifact") }).strict(),
  z.object({ action: z.literal("finish"), diagnosis: z.string().min(1).max(16000), risks: z.array(z.string().max(2000)).max(20), hypothesisSupported: z.boolean() }).strict(),
]);
function parseAction(text: string) { return actionSchema.parse(extractJsonValue(text)); }
/** Existing provider runtime supplies inference. Only this bounded tool bridge touches repository execution. */
export async function investigateCandidate(options: {
  context: SwarmTaskContext;
  runtime: LocalAiRuntime;
  run: SwarmRun;
  task: SwarmTask;
  workspace: ExecutionWorkspace;
  signal: AbortSignal;
  maxTokenPriceUsd: number;
  beforeModelCall?: SwarmModelAdmission;
}) {
  const { context, runtime, run, task, workspace, signal } = options;
  const profile = run.modelPlan?.implementation ?? run.request.profile;
  if (!profile)
    throw Error("Select an authenticated model profile before starting the swarm.");
  const recipe = context.recipe(run);
  const repair = context.store.get(run.id)!.tasks.find(value => value.id === task.id)?.repair;
  let repairPlanned = !repair;
  const system = ["You are a Hyperfocus engineering worker. Tools run only in your isolated remote workspace; model and cloud credentials are not available there.",
    "Return exactly one JSON action per response. Actions: {action:'execute',command,purpose}; {action:'finding',kind:'evidence'|'hypothesis'|'blocker'|'modification',text}; {action:'search',query}; {action:'artifact',artifactId,offset?:number,maxCharacters?:number}; {action:'capture',paths:string[]}; {action:'finish',diagnosis,risks:string[],hypothesisSupported:boolean}.",
    "Capture retains generated reports, screenshots, videos and other requested output files durably before workspace cleanup. Use repository-relative paths (maximum 32); files stay under the workspace. Captures are evidence, never automatic correctness or taste approval. Per-file and total provider size limits apply.",
    "The handoff retains your findings, unvalidated checkpoints and evidenceProgress across turns. Reuse captured artifact IDs; capture a path again only when its contents may have changed. Continue artifact reading from nextOffset, and use findings before rereading a page. A repeated read count signals already inspected bytes, not new evidence; reread only to resolve a specific uncertainty. Persist a concise learned cause with execute.finding or finding so later turns can act on it.",
    "This reasoning bridge supplies text, not image pixels. For visual audits capture actual screenshots early and cite artifact IDs for host inspection. Evaluate structured browser observations and persona reactions explicitly; never claim visual inspection from filenames or passing assertions. Preserve each sampled modifier's action/check, observation, severity and evidence in a reaction ledger, and distinguish host-attributed image assessment from your own text-based inference.",
    ...(recipe.executionKind==="engineering"?["Engineering candidates are independent alternatives, not fragments that will be merged automatically. Your candidate must cover the entire requested batch and every done criterion; compose bounded subtasks inside this workspace. Do not finish one batch item and claim the full request is complete. Report any remaining items explicitly."]:[]),
    "Combine independent repository reads in one execute action. Execute may include finding:string to record a finding with the next tool call, and checkpoint:true after editing to durably save an unvalidated patch. Avoid narrative-only turns and repeated context reads.",
    "Read repository/scoped instructions before editing. Never deploy, publish, change credentials or seek coordinator/private-network access. Do not delegate recursively. Commands are bounded and cancellable.",
    "Investigate independently; use search for relevant durable findings, not other candidates' patches. Do not benchmark during investigations: use baseline artifacts; request missing measurements as blockers. Correctness tests may run.",
    "The handoff's verified baseline and command receipts are authoritative. Dependency preparation passed before dispatch. Engineering baselines may contain actual failing checks: read those retained defects, do not describe them as passed. Do not repeat unchanged passing checks for missing conversational context. Use artifact to retrieve earlier command evidence (maximum 8000 characters per page). Run targeted correctness for your changes; the independent validator reruns trusted suites.",
    recipe.executionKind === 'engineering'
      ? "Within owned paths you may propose changes to existing tests, manifests or verification infrastructure when the goal requires them. Such patches remain proposals: their checks are diagnostic, promotion is blocked until host review and a new immutable verifier baseline. Explain why each verifier change is necessary; never weaken checks to claim success. Added regression tests remain protected during bounded repairs."
      : "Do not modify benchmark runners, validation configuration or existing test assertions. Add regression tests if justified. Reject unsupported hypotheses rather than fabricate improvements.",
    "When outcome experiments are present, inspect the shared raw evidence, including contradicted explanations and protected findings. A supported causal mechanism permits a bounded candidate; it is not evidence of improved user experience. Do not implement a change that violates another experiment's established invariant.",
    ...(repair ? [`This is bounded repair round ${repair.round}. Before any execution return {action:'repair-plan',expectedCause,diagnosis:'incorrect-hypothesis'|'missing-evidence'|'wrong-primitive'|'inadequate-evaluator'|'incompatible-requirements'|'insufficient-domain-knowledge'|'implementation-defect',proceed:boolean}. Proceed only for an implementation defect with available evidence. Otherwise checkpoint the blocker; do not consume more turns blindly. Repair contract: ${JSON.stringify(repair)}`] : []),
    `Owned paths: ${recipe.ownedPaths.join(", ")}. Goal: ${run.request.goal}. Hypothesis: ${task.hypothesis}. Source: ${run.request.repository.revision}.`,
  ].join("\n");
  let observation = "Start by reading the repository instructions and the supplied baseline findings.";
  let previousAction = "none";
  context.message(run, task, task.hypothesis ?? "Independent investigation.", "hypothesis");
  for (let turn = 0; turn < run.request.budget.maxCallsPerAgent; turn++) {
    signal.throwIfAborted();
    const messages = [{ role: "user" as const, content: `Brief:\n${swarmHandoff(context,run,task)}\nLast action:\n${previousAction}\nLast result:\n${observation}\nReturn one action. Fetch artifact pages for additional evidence.` }];
    const usage = context.store.modelUsage(run.id, task.id);
    const budget = context.store.get(run.id)!.request.budget;
    const remainingTokens = Math.min(budget.maxTokensPerAgent - usage.tokens, budget.maxTotalTokens - usage.totalTokens);
    const normalReservation = swarmModelReservation(profile, system, messages);
    const finalizing = normalReservation > remainingTokens;
    let finalizationRefusal: SwarmModelBudgetError | undefined;
    if (finalizing) {
      // No await between the preflight and admission: this reservation cannot fit.
      // Retain the real typed refusal so the coordinator never retries finalization.
      try { context.store.reserveModel(run.id, task.id, normalReservation, profile.agentId === "codex-cli" && profile.providerId === "codex-account" ? 0 : normalReservation * options.maxTokenPriceUsd); }
      catch (error) { if (!(isSwarmModelBudgetError(error))) throw error; finalizationRefusal = error; }
      if (!finalizationRefusal) throw Error("Budget preflight disagreed with synchronous reservation admission.");
    }
    const finalization = finalizing ? { ...budgetFinalizationEvidence(context, run, task, observation), refusal: finalizationRefusal!.rejection } : undefined;
    if (finalization) {
      // Save first: even a compact turn can be refused, and admission remains authoritative.
      const evidence = await context.artifact(run, task, { name: `${task.id}-budget-evidence.json`, kind: "report", mediaType: "application/json", bytes: JSON.stringify(finalization) });
      context.message(run, task, "Normal reasoning context exceeds remaining tokens; preserving incomplete evidence and attempting a report-only finalization.", "blocker", [evidence.id]);
    }
    const result = await runSwarmModelTurn({ ...options, runtime, profile, system: finalizing ? budgetFinalizationSystem : system,
      messages: finalization ? [{ role: "user", content: JSON.stringify(finalization) }] : messages }).catch(error => {
        if (!finalizationRefusal || isSwarmModelBudgetError(error)) throw error;
        signal.throwIfAborted();
        context.message(run, task, `Report-only budget finalization failed: ${error instanceof Error ? error.message : String(error)}`, "blocker");
        throw finalizationRefusal;
      });
    let action: z.infer<typeof actionSchema>;
    try {
      action = parseAction(result.text);
    }
    catch {
      if (finalizationRefusal) throw finalizationRefusal;
      if (observation.startsWith("INVALID_ACTION"))
        throw Error("Model action failed its one bounded schema repair.");
      observation = "INVALID_ACTION: Return exactly one JSON object following the declared action schema. No markdown or additional fields.";
      continue;
    }
    if (finalization) {
      if (action.action !== "finish") {
        context.message(run, task, "Budget finalization permits only an incomplete report; no tool action was executed.", "blocker");
        throw finalizationRefusal!;
      }
      const report = await context.artifact(run, task, { name: `${task.id}-budget-finalization.json`, kind: "report", mediaType: "application/json", bytes: JSON.stringify({ ...finalization, report: action }) });
      context.message(run, task, `Incomplete budget finalization: ${action.diagnosis}`, "blocker", [report.id]);
      throw finalizationRefusal!;
    }
    previousAction = JSON.stringify(action.action === "execute" ? { action: action.action, command: observationExcerpt(action.command, 1_000), purpose: observationExcerpt(action.purpose, 300) } : { action: action.action });
    if(action.action==="capture"){
      const evidence=await captureEngineeringEvidence(context,run,task,workspace,signal,action.paths);
      context.message(run,task,`Captured ${evidence.artifactIds.length} requested evidence files. Missing: ${evidence.missing.join('; ')||'none'}.`,"evidence",evidence.artifactIds);
      observation=JSON.stringify(evidence);continue;
    }
    if (action.action === "execute") {
      if(!repairPlanned)throw Error("A repair must declare its cause before execution.");
      if(action.finding)context.message(run,task,action.finding,"evidence");
      context.message(run, task, `Tool: ${action.purpose}\n${action.command}`, "modification");
      const result = await context.execute(run, task, workspace, action.command, signal);
      observation = commandObservation(result);
      if(action.checkpoint)await preserveSwarmInterruptedPatch({context,run,task,workspace,reason:"Worker requested a durable checkpoint after editing.",checkpoint:true});
    }
    else if (action.action === "repair-plan") {
      if(!repair||repairPlanned)throw Error("Repair diagnosis is allowed once on a bounded repair task.");
      const artifact=await context.artifact(run,task,{name:`${task.id}-repair-contract.json`,kind:"report",mediaType:"application/json",bytes:JSON.stringify({...repair,...action})});
      context.change(run,task,current=>{current.tasks.find(value=>value.id===task.id)!.repair!.expectedCause=action.expectedCause;});
      context.message(run,task,`Repair diagnosis: ${action.diagnosis}. ${action.expectedCause}`,"evidence",[artifact.id]);
      if(!action.proceed||action.diagnosis!=="implementation-defect")throw Error(`Repair stopped: ${action.diagnosis}. ${action.expectedCause}`);
      repairPlanned=true;observation="Repair contract recorded. Stay within allowed files and preserve every declared invariant.";
    }
    else if (action.action === "finding") {
      context.message(run, task, action.text, action.kind);
      observation = "Finding persisted and attributable to this task/revision.";
    }
    else if (action.action === "search") {
      const words = action.query.toLowerCase().split(/\s+/);
      observation = JSON.stringify(context.store.list(run.request.projectId).flatMap(value => value.messages).filter(m => m.kind !== "modification" && words.some(word => m.text.toLowerCase().includes(word))).slice(-4).map(message => ({ id: message.id, taskId: message.taskId, kind: message.kind, text: observationExcerpt(message.text, 1_000), artifactIds: message.artifactIds.slice(0, 8) })));
    }
    else if (action.action === "artifact") {
      observation = JSON.stringify(await context.readArtifact(run, task, { artifactId: action.artifactId, offset: action.offset, maxCharacters: action.maxCharacters }, signal));
    }
    else {
      if(!repairPlanned)throw Error("A repair must declare its cause before completion.");
      const report = await context.artifact(run, task, { name: `${task.candidateId}-diagnosis.json`, kind: "report", mediaType: "application/json", bytes: JSON.stringify(action) });
      context.change(run, task, current => {
        const candidate = current.candidates.find(c => c.id === task.candidateId)!; candidate.diagnosis = action.diagnosis; if (!action.hypothesisSupported) {
          candidate.disposition = "rejected";
          candidate.blockers.push("Assigned hypothesis was rejected by the investigator.");
        }
      });
      context.message(run, task, `${action.diagnosis}\nRisks: ${action.risks.join("; ")}`, "evidence", [report.id]);
      return;
    }
  }
  // The loop already consumed its authorized turns. Use the common admission
  // refusal to persist the exact task limit without charging a nonexistent call.
  context.store.reserveModel(run.id,task.id,0,0);
  throw Error("MODEL_BUDGET_EXHAUSTED: per-agent call limit reached.");
}
