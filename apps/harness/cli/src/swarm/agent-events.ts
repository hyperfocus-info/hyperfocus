import type { SwarmRun } from "@hyperfocus/ai-core/swarm";
import type { createAgentEventStore } from "@hyperfocus/ai-runtime/agent-events";

/** Called in the same SQLite transaction as the run state, including failure/cancellation. */
export function recordSwarmAgentEvent(events: ReturnType<typeof createAgentEventStore>, run: SwarmRun, priorStatus?: string) {
  events.subscribe({projectId:run.request.projectId,recipientId:run.request.agentRecipientId ?? run.request.requestId}, {type:"swarm",id:run.id});
  if (priorStatus === run.status || !["AWAITING_APPROVAL","COMPLETED","FAILED","CANCELLED","TIMED_OUT","BLOCKED"].includes(run.status)) return;
  const resultPath = `/api/swarm/v1/runs/${encodeURIComponent(run.id)}`;
  events.publish({schema:"hyperfocus-agent-event-v1",id:`swarm:${run.id}:${run.status}`,projectId:run.request.projectId,
    subject:{type:"swarm",id:run.id},kind:run.status === "AWAITING_APPROVAL" ? "swarm.result.ready" : `swarm.${run.status.toLowerCase()}`,
    occurredAt:run.updatedAt, summary:`${run.request.goal.slice(0,1000)}: ${run.status}. ${run.reason ?? run.completion?.summary ?? "Inspect preserved evidence and validation before integration."}`.slice(0,4000),
    resultPath,artifacts:run.artifacts.slice(-256).map(artifact => ({id:artifact.id,name:artifact.name,sha256:artifact.sha256,
      bytes:artifact.bytes,path:`${resultPath}/artifacts/${encodeURIComponent(artifact.id)}?download=1`}))});
}
