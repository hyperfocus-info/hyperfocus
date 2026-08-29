import { expect, test } from "bun:test";
import {
  findPendingBrowserApproval,
  promoteNextDeferredBrowserApproval,
  recordBrowserToolEnd,
  recordBrowserToolStart,
  requestBrowserApproval,
  cancelBrowserApprovals,
  resolveBrowserApproval
} from "./browser-session-state";

test("tracks browser approval and execution lifecycle in one session", () => {
  const requested = requestBrowserApproval([], {
    runId: "run-1",
    owner: "main",
    toolCallId: "call-1",
    toolName: "playwright-browser",
    args: { url: "https://example.com" },
    requestedAt: "2026-04-15T12:00:00.000Z"
  });

  expect(requested).toHaveLength(1);
  expect(requested[0]?.status).toBe("awaiting-approval");
  expect(findPendingBrowserApproval(requested, { runId: "run-1", sessionId: requested[0]!.id, toolCallId: "call-1" })?.label).toContain(
    "https://example.com"
  );
  expect(findPendingBrowserApproval(requested, { runId: "other-run", sessionId: requested[0]!.id, toolCallId: "call-1" })).toBeUndefined();

  const approved = resolveBrowserApproval(requested, {
    runId: "run-1",
    owner: "main",
    sessionId: requested[0]!.id,
    toolCallId: "call-1",
    approved: true,
    resolvedAt: "2026-04-15T12:00:01.000Z"
  });
  expect(approved[0]?.status).toBe("running");
  expect(approved[0]?.pendingApproval).toBeUndefined();

  const started = recordBrowserToolStart(approved, {
    runId: "run-1",
    owner: "main",
    toolCallId: "call-1",
    toolName: "playwright-browser",
    args: { url: "https://example.com" },
    occurredAt: "2026-04-15T12:00:02.000Z"
  });
  expect(started[0]?.activities[0]?.status).toBe("running");

  const completed = recordBrowserToolEnd(started, {
    runId: "run-1",
    owner: "main",
    toolCallId: "call-1",
    toolName: "playwright-browser",
    result: { ok: true, pageTitle: "Example Domain" },
    isError: false,
    occurredAt: "2026-04-15T12:00:03.000Z"
  });
  expect(completed[0]?.status).toBe("completed");
  expect(completed[0]?.activities[0]?.status).toBe("completed");
  expect(completed[0]?.activities[0]?.outputSummary).toContain("Example Domain");
});

test("serializes concurrent browser approvals in FIFO order", () => {
  let sessions = requestBrowserApproval([], { runId: "run", owner: "main", toolCallId: "first",
    toolName: "playwright-browser", args: {}, requestedAt: "2026-04-15T12:00:00.000Z" });
  sessions = requestBrowserApproval(sessions, { runId: "run", owner: "main", toolCallId: "second",
    toolName: "playwright-browser", args: {}, requestedAt: "2026-04-15T12:00:01.000Z" });
  expect(sessions[0]?.activities.find(({ approval }) => approval?.status === "pending")?.toolCallId).toBe("first");
  expect(sessions[0]?.activities.map(({ approval }) => approval?.status)).toEqual(["pending", "deferred"]);
  sessions = resolveBrowserApproval(sessions, { runId: "run", owner: "main", sessionId: sessions[0]!.id,
    toolCallId: "first", approved: true, resolvedAt: "2026-04-15T12:00:02.000Z" });
  expect(sessions[0]?.pendingApproval?.toolCallId).toBe("second");
  expect(sessions[0]?.activities.map(({ approval }) => approval?.status)).toEqual(["approved", "pending"]);
  expect(sessions[0]?.updatedAt).toBe("2026-04-15T12:00:02.000Z");
  expect(sessions[0]?.completedAt).toBeUndefined(); expect(sessions[0]?.lastActivityLabel).toBeDefined();
});

test("terminalizes pending and deferred approvals together", () => {
  let sessions = requestBrowserApproval([], { runId: "run", owner: "main", toolCallId: "first",
    toolName: "playwright-browser", args: {}, requestedAt: "2026-04-15T12:00:00.000Z" });
  sessions = requestBrowserApproval(sessions, { runId: "run", owner: "main", toolCallId: "second",
    toolName: "playwright-browser", args: {}, requestedAt: "2026-04-15T12:00:01.000Z" });
  sessions = cancelBrowserApprovals(sessions, "Run stopped", "2026-04-15T12:00:02.000Z");
  expect(sessions[0]?.activities.map(({ approval }) => approval?.status)).toEqual(["rejected", "rejected"]);
  expect(sessions[0]?.pendingApproval).toBeUndefined(); expect(sessions[0]?.status).toBe("blocked");
});

test("paused approvals promote only the first deferred item", () => {
  const sessions = requestBrowserApproval([], { runId: "run", owner: "main", toolCallId: "first",
    toolName: "playwright-browser", args: {}, requestedAt: "2026-04-15T12:00:00.000Z" });
  sessions[0]!.activities[0]!.approval!.status = "deferred"; sessions[0]!.pendingApproval = undefined;
  sessions[0]!.status = "running";
  requestBrowserApproval(sessions, { runId: "run", owner: "main", toolCallId: "second",
    toolName: "playwright-browser", args: {}, requestedAt: "2026-04-15T12:00:01.000Z" });
  expect(promoteNextDeferredBrowserApproval(sessions[0]!)).toBe(true);
  expect(sessions[0]?.activities.map(({ approval }) => approval?.status)).toEqual(["pending", "deferred"]);
  expect(sessions[0]!.activities[0]!.approval!.toolCallId).toBe("first");
});
