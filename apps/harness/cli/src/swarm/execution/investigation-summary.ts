import type { SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmStore } from "../persistence/store";
import { readCommandEvidence } from "./command-evidence";

export function evidenceExcerpt(text: string, characters: number) {
  if (text.length <= characters) return text;
  const head = Math.floor(characters / 2);
  return `${text.slice(0, head)}\n[${text.length - characters} characters omitted; read the retained artifact for evidence]\n${text.slice(-(characters - head))}`;
}

/** Bounded evidence only; the recovery caller owns publication and completion state. */
export function swarmInvestigationSummary(context: { store: SwarmStore }, run: SwarmRun, task: SwarmTask, observation?: string) {
  const current = context.store.get(run.id)!;
  const messages = current.messages.filter(message => message.taskId === task.id && message.agentId === task.agentId && message.sourceRevision === run.request.repository.revision);
  return { sourceRevision: run.request.repository.revision, taskId: task.id,
    scope: { goal: evidenceExcerpt(run.request.goal, 600), hypothesis: evidenceExcerpt(task.hypothesis ?? "Independent investigation", 600),
      doneCriteria: run.request.doneCriteria.slice(0, 8).map(criterion => evidenceExcerpt(criterion, 160)), omittedDoneCriteria: Math.max(0, run.request.doneCriteria.length - 8),
      completionNote: "Name outstanding scope; omitted criteria and unverified work must remain incomplete." },
    findings: messages.filter(message => ["evidence", "hypothesis", "blocker"].includes(message.kind)).slice(-4).map(message => ({ text: evidenceExcerpt(message.text, 750), artifactIds: message.artifactIds.slice(0, 8) })),
    executedCommands: messages.flatMap(message => { const receipt = readCommandEvidence(message); return receipt ? [receipt] : []; }).slice(-3),
    lastResultPreview: observation === undefined ? undefined : evidenceExcerpt(observation, 1_000),
    usage: context.store.modelUsage(run.id, task.id),
    limits: { calls: current.request.budget.maxCallsPerAgent, agentTokens: current.request.budget.maxTokensPerAgent, runTokens: current.request.budget.maxTotalTokens },
    evidenceNote: "Full command logs, findings and checkpoints remain in this task's durable artifacts/messages. Preview omissions are not evidence of missing execution." };
}
