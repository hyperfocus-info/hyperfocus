import type { AgentRunState, AgentRunSummary } from "@hyperfocus/ai-core/protocol";

export function compareTimestampInstants(incoming: string, current: string) {
  const incomingTime = Date.parse(incoming), currentTime = Date.parse(current);
  const incomingValid = Number.isFinite(incomingTime), currentValid = Number.isFinite(currentTime);
  if (incomingValid && currentValid) return Math.sign(incomingTime - currentTime);
  if (incomingValid) return 1;
  if (currentValid) return -1;
  return incoming === current ? 0 : -1;
}

export function shouldAcceptRunLifecycle(current: AgentRunState | undefined, incoming: AgentRunState) {
  if (!current) return true;
  if (incoming.id !== current.id) {
    if (incoming.threadRunSequence !== undefined && current.threadRunSequence !== undefined)
      return incoming.threadRunSequence > current.threadRunSequence;
    return compareTimestampInstants(incoming.createdAt, current.createdAt) > 0;
  }
  const order = compareTimestampInstants(incoming.updatedAt, current.updatedAt);
  if (order !== 0) return order > 0;
  return runDetailAuthority(incoming) > runDetailAuthority(current);
}

export function shouldAcceptRunPatch(current: AgentRunState | undefined, updatedAt: string) {
  return !current || compareTimestampInstants(updatedAt, current.updatedAt) > 0;
}

function runDetailAuthority(run: AgentRunState) {
  if (run.detailState === "summary") return 1;
  if (run.detailState === "unavailable") return 0;
  return 2;
}

export function toRunSummary(run: AgentRunState): AgentRunSummary {
  return { id: run.id, threadId: run.threadId, threadRunSequence: run.threadRunSequence,
    status: run.status, failureMessage: run.failureMessage,
    resumable: run.resumable, retryable: run.retryable, updatedAt: run.updatedAt, completedAt: run.completedAt };
}

export function upsertRunSummary(summaries: AgentRunSummary[], next: AgentRunSummary) {
  return [next, ...summaries.filter(({ id }) => id !== next.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
