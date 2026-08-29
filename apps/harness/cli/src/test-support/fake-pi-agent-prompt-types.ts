import type { PiAgentPromptResult } from "../pi-agent-adapter";

export type FakePromptUsage = (text: string) => PiAgentPromptResult;

export type FakePromptBehavior = {
  retryTracker: Set<string>;
  subagentCallCounts: Map<string, number>;
  waitForDeferredSubagentRelease: () => Promise<void>;
  waitForDeferredAggregatorRelease: () => Promise<void>;
};
