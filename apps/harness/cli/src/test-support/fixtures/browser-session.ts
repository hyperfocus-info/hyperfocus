import { type BrowserSession } from "@hyperfocus/ai-core/protocol";

export function createPendingBrowserSession(runId: string): BrowserSession {
  const now = "2026-06-26T12:00:00.000Z";
  const approval = {
    toolCallId: "tool-call-1",
    toolName: "playwright-browser",
    kind: "navigate" as const,
    label: "Open preview",
    inputSummary: "https://example.test",
    status: "pending" as const,
    requestedAt: now
  };
  return {
    id: "browser-session-1",
    runId,
    owner: "main",
    status: "awaiting-approval",
    approvalMode: "per-tool",
    lastActivityLabel: "Open preview",
    startedAt: now,
    updatedAt: now,
    pendingApproval: approval,
    activities: [
      {
        id: "browser-activity-1",
        toolCallId: "tool-call-1",
        toolName: "playwright-browser",
        kind: "navigate",
        label: "Open preview",
        inputSummary: "https://example.test",
        status: "pending-approval",
        startedAt: now,
        updatedAt: now,
        approval,
        replay: [],
        verification: []
      }
    ]
  };
}
