import { z } from "zod";
import { extractJsonValue } from "@hyperfocus/ai-core/runtime";
import type { LocalAiRuntime } from "@hyperfocus/ai-runtime";
import type { SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";
import { runSwarmModelTurn, swarmHandoff, type SwarmModelAdmission } from "./model-turn";
import { planSwarmOutcome } from "../outcome/planning";
import { campaignCandidateIds } from "../campaign";

const planSchema = z.object({ difficulty: z.enum(["bounded", "complex"]), reason: z.string().min(1).max(2_000), hypotheses: z.array(z.object({ candidateId: z.string(), hypothesis: z.string().min(3).max(4_000) }).strict()).min(1).max(3) }).strict();
const reviewSchema = z.object({ summary: z.string().min(1).max(4_000), criteria: z.array(z.object({ criterion: z.string().max(1_000), status: z.enum(["met", "unmet", "blocked"]), artifactIds: z.array(z.string()).max(12), reason: z.string().max(1_000) }).strict()).min(1).max(12), candidates: z.array(z.object({ candidateId: z.string(), approved: z.boolean(), reason: z.string().min(1).max(2_000) }).strict()).max(3) }).strict();

export async function reasonAboutSwarmPhase(options: {
  context: SwarmTaskContext; runtime: LocalAiRuntime; run: SwarmRun; task: SwarmTask;
  signal: AbortSignal; maxTokenPriceUsd: number; beforeModelCall?: SwarmModelAdmission;
}) {
  const { context, run, task } = options;
  const saved = context.store.get(run.id)!;
  const ids=campaignCandidateIds(saved);
  const current={...saved,candidates:saved.candidates.filter(candidate=>ids.includes(candidate.id))};
  if (!current.modelPlan) throw Error("Trusted phase profiles are required for planning and review.");
  const planning = task.kind === "plan";
  if (planning && current.outcome) return planSwarmOutcome(options);
  if (!planning && current.outcome?.phase === "proposed") {
    const completion = { status: "unmet" as const, summary: "Outcome analysis failed before experiments; no model review is needed to establish missing evidence.", criteria: current.request.doneCriteria.map(criterion => ({ criterion, status: "blocked" as const, artifactIds: [], reason: "The required outcome analysis did not complete." })) };
    const artifact = await context.artifact(run, task, { name: "blocked-review.json", kind: "report", mediaType: "application/json", bytes: JSON.stringify(completion) });
    context.change(run, task, latest => { latest.completion = { ...completion, artifactId: artifact.id }; });
    context.message(run, task, completion.summary, "blocker", [artifact.id]);
    return;
  }
  const profile = planning ? current.modelPlan.planning : current.modelPlan.review;
  const baseline = current.messages.filter(message => current.tasks.some(task => task.kind === "baseline" && task.id === message.taskId)).map(message => message.text).join("\n").slice(-8_000);
  const evidence = { outcome: current.outcome, candidates: current.candidates, artifacts: current.artifacts.filter(artifact => artifact.kind !== "log").map(artifact => ({ id: artifact.id, name: artifact.name, kind: artifact.kind, bytes: artifact.bytes })), failures: current.tasks.filter(task => ["FAILED", "BLOCKED"].includes(task.status)).map(task => ({ taskId: task.id, error: task.error })) };
  const patches: Array<{ candidateId: string; artifactId: string; patch: string }> = [];
  const verification: Array<{ artifactId: string; name: string; taskId: string; content: string }> = [];
  if (!planning) {
    if(current.executionKind==="engineering")for(const artifact of current.artifacts.filter(artifact=>artifact.mediaType==="application/json"&&artifact.kind!=="log"&&artifact.bytes<=262144&&current.tasks.some(owner=>owner.id===artifact.taskId&&(["baseline","validate"].includes(owner.kind)||["investigate","repair"].includes(owner.kind)&&ids.includes(owner.candidateId??"")))).slice(-12)){
      const bytes=await context.artifacts.read({sha256:artifact.sha256});
      verification.push({artifactId:artifact.id,name:artifact.name,taskId:artifact.taskId,content:new TextDecoder().decode(bytes).slice(0,12000)});
    }
    for (const candidate of current.candidates) {
      if (!candidate.patchArtifactId) continue;
      const bytes = await context.patch(run, candidate.id);
      patches.push({ candidateId: candidate.id, artifactId: candidate.patchArtifactId, patch: new TextDecoder().decode(bytes) });
    }
  }
  const parent = current.parentRunId ? context.store.get(current.parentRunId) : undefined;
  const inherited = parent ? { runId: parent.id, reason: parent.reason, findings: parent.messages.filter(message => ["evidence", "validation", "blocker"].includes(message.kind)).slice(-3).map(message => ({ id: message.id, text: message.text.slice(0, 2_000), artifactIds: message.artifactIds })) } : undefined;
  const system = ["You are the trusted Hyperfocus swarm planning/review actor. Return one JSON object only. You have no execution tools; use attributable supplied evidence. Never change authorization, source revision, spending ceilings, validation contracts, or create/delegate tasks.",
    planning ? "Schema: {difficulty:'bounded'|'complex',reason:string,hypotheses:[{candidateId,hypothesis}]}. Return exactly one hypothesis for every supplied candidate. Derive independent hypotheses from the current baseline, name missing measurements, and reject unsupported historical assumptions. Classify complex only when coordinated investigations or cross-cutting correctness require it." : "Schema: {summary:string,criteria:[{criterion,status:'met'|'unmet'|'blocked',artifactIds:string[],reason}],candidates:[{candidateId,approved:boolean,reason}]}. Return every exact done criterion and every candidate once. Inspect the supplied patches and independent validation/comparison evidence. Met criteria require existing evidence artifact IDs. Approval requires passed correctness, no blockers and IMPROVED comparison; never infer unavailable browser/image/freshness evidence. A useful honest no-improvement investigation may meet its completion criteria while every candidate is rejected.",
    ...(current.executionKind==="engineering"?["This is a generic engineering/audit run. Derive work from the user's goal, not CPU or performance assumptions. Each candidate is a complete alternative: it must cover the entire requested batch and every done criterion, composing scoped subtasks within its own isolated workspace. Never divide a requested batch among alternatives and then select one fragment as completion. Independently approve only a candidate whose own evidence covers the full request; evidence from another candidate does not prove its patch. The performance comparison instruction does not apply: patch approval requires independent trusted validation, its retained raw evidence, no blockers and coverage of every explicit requested criterion. Audit-only findings can satisfy an evidence request without a patch. A test command passing does not prove untested behavior; screenshots listed by filename are not visual inspection or human taste approval. Missing browser/controller/canonical-content evidence stays blocked. Earlier rounds' findings inform a different next investigation; do not repeat a failed approach without a new discriminating observation."]:[]),
    "Use concise evidence and explicit uncertainty. Treat verifiedBaseline and command receipts in the handoff as authoritative execution facts; do not describe passed preparation as unverified because full logs are omitted. A model review cannot override deterministic gates or authorize integration."].join("\n");
  const result = await runSwarmModelTurn({ ...options, profile, system, messages: [{ role: "user", content: JSON.stringify({ handoff: swarmHandoff(context, run, task), goal: current.request.goal, baseline, evidence, verification, patches, inherited, previousFindings:saved.candidates.filter(candidate=>!ids.includes(candidate.id)).map(candidate=>({hypothesis:candidate.hypothesis,diagnosis:candidate.diagnosis.slice(0,1200),blockers:candidate.blockers})) }) }] });
  if (planning) {
    const plan = planSchema.parse(extractJsonValue(result.text));
    if (plan.hypotheses.length !== current.candidates.length || new Set(plan.hypotheses.map(hypothesis => hypothesis.candidateId)).size !== current.candidates.length || plan.hypotheses.some(hypothesis => !current.candidates.some(candidate => candidate.id === hypothesis.candidateId))) throw Error("Planner must preserve the bounded candidate identities.");
    const artifact = await context.artifact(run, task, { name: "plan.json", kind: "report", mediaType: "application/json", bytes: JSON.stringify(plan) });
    context.change(run, task, latest => {
      const selected = latest.modelPlan;
      if (!selected) throw Error("Model plan disappeared.");
      selected.difficulty = latest.request.difficulty === "auto" ? plan.difficulty : latest.request.difficulty;
      selected.reason = plan.reason;
      selected.implementation = latest.request.mode === "max-intelligence" || latest.request.mode === "auto" && selected.difficulty === "complex" ? selected.planning : selected.valueImplementation;
      for (const hypothesis of plan.hypotheses) {
        latest.candidates.find(candidate => candidate.id === hypothesis.candidateId)!.hypothesis = hypothesis.hypothesis;
        latest.tasks.find(task => task.kind === "investigate" && task.candidateId === hypothesis.candidateId)!.hypothesis = hypothesis.hypothesis;
      }
    });
    context.message(run, task, `Plan: ${plan.reason}\n${plan.hypotheses.map(hypothesis => `${hypothesis.candidateId}: ${hypothesis.hypothesis}`).join("\n")}`, "evidence", [artifact.id]);
    return;
  }
  const review = reviewSchema.parse(extractJsonValue(result.text));
  const criteria = current.request.doneCriteria;
  if (review.criteria.length !== criteria.length || new Set(review.criteria.map(criterion => criterion.criterion)).size !== criteria.length || review.criteria.some(criterion => !criteria.includes(criterion.criterion) || criterion.status === "met" && !criterion.artifactIds.length || criterion.artifactIds.some(id => !current.artifacts.some(artifact => artifact.id === id)))) throw Error("Review completion criteria must match the contract and cite existing artifacts.");
  if (review.candidates.length !== current.candidates.length || new Set(review.candidates.map(candidate => candidate.candidateId)).size !== current.candidates.length || review.candidates.some(candidate => !current.candidates.some(value => value.id === candidate.candidateId))) throw Error("Review must cover every candidate exactly once.");
  const artifact = await context.artifact(run, task, { name: "independent-review.json", kind: "report", mediaType: "application/json", bytes: JSON.stringify(review) });
  context.change(run, task, latest => {
    latest.completion = { status: review.criteria.every(criterion => criterion.status === "met") ? "met" : "unmet", summary: review.summary, criteria: review.criteria, artifactId: artifact.id };
    for (const verdict of review.candidates) if (!verdict.approved) {
      const candidate = latest.candidates.find(candidate => candidate.id === verdict.candidateId)!;
      candidate.blockers.push(`Independent review: ${verdict.reason}`.slice(0, 2_000)); candidate.disposition = "rejected";
    }
  });
  context.message(run, task, review.summary, "validation", [artifact.id]);
}
