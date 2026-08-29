import type { AgentTrace } from "@hyperfocus/ai-core/protocol";

export function withTraceTimestamp(trace: AgentTrace, createdAt: string = new Date().toISOString()): AgentTrace {
  if (trace.createdAt) {
    return trace;
  }
  return {
    ...trace,
    createdAt
  };
}
