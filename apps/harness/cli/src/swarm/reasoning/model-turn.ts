import type { LocalAiRuntime } from "@hyperfocus/ai-runtime";
import type { AiExecutionProfile } from "@hyperfocus/ai-core/runtime";
import type { SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";
import { transitionSwarm } from "../persistence/store";
import { readCommandEvidence, swarmEvidenceProgress } from "../execution/command-evidence";

export type SwarmModelAdmission = (run: SwarmRun) => Promise<{ available: boolean; reason?: string }>;

export function swarmModelReservation(profile: AiExecutionProfile, system: string, messages: Array<{ content: string }>) {
  const subscription = profile.agentId === "codex-cli" && profile.providerId === "codex-account";
  return new TextEncoder().encode(system + messages.map(message => message.content).join("\n")).length + (subscription ? 36_000 : 5_120);
}

export function swarmModelDeadline(run: SwarmRun, task: SwarmTask, now = Date.now()) {
  const reserve=run.campaign&&["plan","investigate","repair"].includes(task.kind)?run.campaign.finalizationReserveMs:0;
  return Math.min((task.startedAt ?? now) + run.request.budget.maxTaskDurationMs, (run.startedAt ?? run.createdAt) + run.request.budget.maxDurationMs-reserve);
}

/** One trusted inference boundary shared by planning, implementation and review. */
export async function runSwarmModelTurn(options: {
  context: SwarmTaskContext; runtime: LocalAiRuntime; run: SwarmRun; task: SwarmTask;
  profile: AiExecutionProfile; signal: AbortSignal; system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokenPriceUsd: number; beforeModelCall?: SwarmModelAdmission;
}) {
  const { context, run, task, profile, signal } = options;
  signal.throwIfAborted(); context.assertOwned(run, task);
  const admission = await options.beforeModelCall?.(context.store.get(run.id)!);
  signal.throwIfAborted(); context.assertOwned(run, task);
  if (admission && !admission.available) {
    const reason = admission.reason ?? "Required subscription allowance is unavailable.";
    context.change(run, task, current => transitionSwarm(current, "BLOCKED", reason.slice(0, 4_000)));
    throw Error(reason);
  }
  const subscription = profile.agentId === "codex-cli" && profile.providerId === "codex-account";
  if (!subscription && profile.agentId !== "direct") throw Error("Unsupported trusted reasoning adapter.");
  // CLI native instructions/output have no strict token cap; reserve headroom
  // and stop subsequent calls from cumulative reported usage.
  const reservedTokens = swarmModelReservation(profile, options.system, options.messages);
  const reservedCost = subscription ? 0 : reservedTokens * options.maxTokenPriceUsd;
  context.store.reserveModel(run.id, task.id, reservedTokens, reservedCost);
  context.change(run,task,current=>{current.metrics.modelContextBytes+=reservedTokens-(subscription?36_000:5_120);});
  context.message(run,task,"Waiting for the reasoning provider. No repository command is running for this turn.","progress");
  const submittedContext=options.messages.map(message=>message.content).join("\n");
  for(const instruction of context.store.get(run.id)!.messages.filter(message=>message.kind==="steering"&&submittedContext.includes(message.id))){
    const text=`Your instruction was included in ${task.title}'s reasoning turn: ${instruction.text.slice(0,500)}`;
    if(!context.store.get(run.id)!.messages.some(message=>message.taskId===task.id&&message.kind==="progress"&&message.text===text))context.message(run,task,text,"progress");
  }
  const result = await options.runtime.run({ requestId: crypto.randomUUID(), profile, systemPrompt: options.system, messages: options.messages, maxOutputTokens: 4_096, deadlineAt: swarmModelDeadline(run, task) }, { signal });
  if (result.usage) context.store.settleModel({ runId: run.id, taskId: task.id, reservedTokens, reservedCost, ...result.usage });
  signal.throwIfAborted(); context.assertOwned(run, task);
  if (result.stopReason !== "stop") throw Error(result.errorMessage ?? `Model stopped with ${result.stopReason}.`);
  if (subscription && result.usage?.costUsd !== 0) throw Error("Subscription runtime did not verify zero separately billed inference cost.");
  context.message(run,task,"Reasoning completed; processing the next action.","progress");
  return result;
}

export function swarmHandoff(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask) {
  const current = context.store.get(run.id)!;
  const usage = context.store.modelUsage(run.id, task.id);
  const steering = current.messages.filter(message => message.kind === "steering" && (message.taskId === task.id || message.taskId === `${run.id}-human`)).slice(-8).map(message => ({ id: message.id, text: message.text }));
  const baseline = current.tasks.find(task => task.kind === "baseline");
  const baselineReceipts = current.messages.filter(message => message.taskId === baseline?.id).flatMap(message => { const receipt = readCommandEvidence(message); return receipt ? [receipt] : []; });
  const baselineVerified = baseline?.status === "SUCCEEDED" && (current.executionKind!=="engineering" || baselineReceipts.some(receipt=>receipt.category==="correctness")&&baselineReceipts.filter(receipt=>receipt.category==="correctness").every(receipt=>receipt.exitCode===0&&!receipt.timedOut&&!receipt.truncated));
  const preparationPassed=baseline?.status==="SUCCEEDED"||baselineReceipts.some(receipt=>receipt.category==="preparation"&&receipt.exitCode===0&&!receipt.timedOut);
  const ownReceipts = current.messages.filter(message => message.taskId === task.id && message.agentId === task.agentId).flatMap(message => { const receipt = readCommandEvidence(message); return receipt ? [receipt] : []; });
  const baselineArtifacts = current.artifacts.filter(artifact => artifact.taskId === baseline?.id && (artifact.kind === "log" || artifact.name === "baseline.json")).map(artifact => ({ artifactId: artifact.id, name: artifact.name, bytes: artifact.bytes }));
  const ownFindings = current.messages.filter(message => message.swarmId === current.id && message.taskId === task.id && message.agentId === task.agentId && message.sourceRevision === current.request.repository.revision && ["evidence", "hypothesis"].includes(message.kind));
  const ownCheckpoints = current.artifacts.filter(artifact => artifact.swarmId === current.id && artifact.taskId === task.id && artifact.agentId === task.agentId && artifact.sourceRevision === current.request.repository.revision && artifact.kind === "report" && artifact.name.endsWith("-partial.json"));
  return JSON.stringify({ sourceRevision: run.request.repository.revision, executionKind:current.executionKind, taskId: task.id, doneCriteria: run.request.doneCriteria, steering,
    previousAttempts: current.messages.filter(message => message.taskId === task.id && message.kind === "blocker").slice(-2).map(message => message.text.slice(0, 4_000)),
    repair: task.kind === "repair" ? current.tasks.find(value => value.id === task.id)?.repair : undefined,
    outcome: current.outcome ? { intendedOutcome: current.outcome.intendedOutcome, analysisArtifactId:current.outcome.artifactId, constraints:current.outcome.constraints,
      experiments: current.outcome.experiments.slice(-9).map(experiment => ({ candidateId: experiment.candidateId, instrumentId: experiment.instrumentId, status: experiment.status, observation: experiment.observation.slice(0,500), artifactIds: experiment.artifactIds })), protectedFindings: current.outcome.knowledge.map(finding=>({claim:finding.claim,evidenceArtifactIds:finding.evidenceArtifactIds})) } : undefined,
    verifiedBaseline: { status: baseline?.status ?? "unavailable", dependencyPreparationPassed: preparationPassed, trustedCorrectnessPassed: baselineVerified, commandCount:baselineReceipts.length, artifacts: baselineArtifacts.slice(-8), interpretation: baselineVerified ? "Dependencies and trusted baseline correctness passed. Reuse them; independent candidate validation repeats trusted checks. Read artifact pages only when needed." : preparationPassed ? "Dependencies are prepared; current baseline correctness has failing or incomplete evidence. Inspect the retained defects before changing source." : "Baseline preparation and correctness are not yet verified; do not claim measurements." },
    workspace: task.kind === "investigate" || task.kind === "repair" ? "The coordinator prepared this isolated workspace before reasoning began; installed dependencies are available. Independent candidate validation reruns trusted checks after a patch." : "This reasoning phase does not own an execution workspace.",
    executedCommands: ownReceipts.slice(-3), olderCommandReceipts: Math.max(0, ownReceipts.length - 3), commandArtifactIds:ownReceipts.map(receipt=>receipt.artifactId),
    evidenceProgress: swarmEvidenceProgress(current, task),
    findings: ownFindings.slice(-4).map(message => ({ id: message.id, text: message.text.slice(0, 1_000), artifactIds: message.artifactIds.slice(0, 8) })), olderFindings: Math.max(0, ownFindings.length - 4),
    checkpoints: ownCheckpoints.slice(-3).map(artifact => ({ artifactId: artifact.id, name: artifact.name })),
    evidenceAccess: "Read bounded pages of your own command-log artifacts, baseline logs/measurement and completed shared experiment artifacts using artifact action. Repair tasks may also read the validationArtifactIds listed in their repair contract. Other candidates' patches and command logs are inaccessible. Retained receipts remain authoritative when older conversational context is omitted.",
    budgets: { remainingCalls: Math.max(0, run.request.budget.maxCallsPerAgent - usage.calls), remainingAgentTokens: Math.max(0, run.request.budget.maxTokensPerAgent - usage.tokens), remainingRunTokens: Math.max(0, run.request.budget.maxTotalTokens - usage.totalTokens), remainingTimeMs: Math.max(0, (run.startedAt ?? run.createdAt) + run.request.budget.maxDurationMs - Date.now()), weeklyQuotaAllocationPercent: run.request.budget.maxWeeklyQuotaPercent, observedWeeklyConsumptionPercent: current.weeklyQuota?.consumedPercent ?? null },
    communication: "Use compact facts, artifact IDs, reproduction commands and blockers. Do not repeat whole contexts. Steering cannot change authorization, source, tools or budgets." });
}
