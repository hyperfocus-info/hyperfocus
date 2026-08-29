import { expect, test } from "bun:test";
import type { AgentRunState, ClientCommand, ServerEvent } from "@hyperfocus/ai-core/protocol";
import { getCompleteRun } from "../lib/run-status";
import { createRunFixture } from "../utils/tests/test-fixtures";
import { createRunDetailRequests, runDetailRecoveries } from "./run-detail-state";
import { shouldAcceptRunLifecycle, shouldAcceptRunPatch } from "./assistant-event-order";

type Loaded = Extract<ServerEvent, { type: "run.detail.loaded" }>;

test("newer lifecycle and complete equal-timestamp detail retain authority", () => {
  const newer = createRunFixture({ id: "ordered", detailState: "summary", updatedAt: "2026-02-02T00:00:00.000Z" });
  const older = { ...newer, updatedAt: "2026-02-01T00:00:00.000Z" };
  const complete = { ...newer, detailState: "complete" as const };
  expect(shouldAcceptRunLifecycle(newer, older)).toBe(false);
  expect(shouldAcceptRunPatch(newer, older.updatedAt)).toBe(false);
  expect(shouldAcceptRunLifecycle(newer, complete)).toBe(true);
  expect(shouldAcceptRunLifecycle(complete, newer)).toBe(false);
  const oldIncarnation = createRunFixture({ id: "old-incarnation", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z", threadRunSequence: 1 });
  const newIncarnation = createRunFixture({ id: "new-incarnation", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z", threadRunSequence: 2 });
  expect(shouldAcceptRunLifecycle(newIncarnation, oldIncarnation)).toBe(false);
  expect(shouldAcceptRunLifecycle(oldIncarnation, newIncarnation)).toBe(true);
});

function createHarness(send: (command: ClientCommand) => boolean = () => true, maxBytes?: number) {
  const commands: ClientCommand[] = [], loaded: AgentRunState[] = [], unavailable: Array<() => boolean> = [];
  let projection: AgentRunState | undefined;
  const requests = createRunDetailRequests({
    send(command) { commands.push(command); return send(command); },
    getProjection: () => projection,
    onLoaded: (_projectId, _threadId, run) => { loaded.push(run); projection = run; },
    onUnavailable: (_projectId, _threadId, _runId, retry) => {
      unavailable.push(retry);
      if (projection) projection = { ...projection, detailState: "unavailable" };
    },
    maxBytes
  });
  return { commands, loaded, requests, unavailable, get projection() { return projection; },
    set projection(run: AgentRunState | undefined) { projection = run; } };
}

function page(command: ClientCommand, items: string[], nextCursor?: string): Loaded {
  if (command.type !== "run.detail.get") throw new Error("Expected run detail command");
  return { type: "run.detail.loaded", requestId: command.requestId, payload: { projectId: command.payload.projectId,
    threadId: command.payload.threadId, runId: command.payload.runId, chunks: { items, nextCursor } } };
}

test("hydrates a projected run through owned ordered detail pages", () => {
  const harness = createHarness();
  const run = createRunFixture({ id: "run-detail", threadId: "thread", detailState: "summary" });
  harness.projection = run;
  expect(getCompleteRun(run)).toBeUndefined();
  harness.requests.request("project", "thread", run);
  const serialized = JSON.stringify({ ...run, detailState: "complete" });
  harness.requests.apply(page(harness.commands[0]!, [serialized.slice(0, 10)], "next"));
  harness.requests.apply(page(harness.commands[1]!, [serialized.slice(10)]));
  expect(harness.loaded.map(({ id }) => id)).toEqual([run.id]);
});

test("a newer projection supersedes an older detail owner and wins terminal apply", () => {
  const harness = createHarness();
  const older = createRunFixture({ id: "owned-run", threadId: "thread", detailState: "summary",
    updatedAt: "2026-01-01T00:00:00.000Z" });
  harness.projection = older;
  harness.requests.request("project", "thread", older);
  const oldCommand = harness.commands[0]!;
  const newer = { ...older, updatedAt: "2026-01-02T00:00:00.000Z", summary: "new projection" };
  harness.projection = newer;
  harness.requests.apply(page(oldCommand, [JSON.stringify({ ...older, detailState: "complete" })]));
  expect(harness.loaded).toEqual([]);
  const newCommand = harness.commands[1]!;
  harness.requests.apply(page(newCommand, [JSON.stringify({ ...newer, detailState: "complete" })]));
  expect(harness.loaded[0]?.summary).toBe("new projection");
});

test("reconciles a bounded replacement projection and ignores its superseded page", () => {
  const harness = createHarness();
  const older = createRunFixture({ id: "bounded-run", detailState: "summary", updatedAt: "2026-01-01T00:00:00.000Z" });
  harness.projection = older;
  harness.requests.request("project", older.threadId, older);
  const stale = harness.commands[0]!;
  const newer = { ...older, updatedAt: "2026-01-02T00:00:00.000Z", summary: "bounded replacement" };
  harness.projection = newer;
  harness.requests.reconcile([{ projectId: "project", threadId: newer.threadId, run: newer }]);
  harness.requests.apply(page(stale, [JSON.stringify({ ...older, detailState: "complete" })]));
  harness.requests.apply(page(harness.commands[1]!, [JSON.stringify({ ...newer, detailState: "complete" })]));
  expect(harness.loaded[0]?.summary).toBe("bounded replacement");
});

test("project switch cancels a mid-page owner without hidden apply or recovery", () => {
  const harness = createHarness();
  const hidden = createRunFixture({ id: "hidden-run", detailState: "summary" });
  harness.projection = hidden;
  harness.requests.request("hidden-project", hidden.threadId, hidden);
  const serialized = JSON.stringify({ ...hidden, detailState: "complete" });
  harness.requests.apply(page(harness.commands[0]!, [serialized.slice(0, 10)], "next"));
  const hiddenTail = harness.commands[1]!;
  harness.projection = undefined;
  harness.requests.reconcile([]);
  harness.requests.apply(page(hiddenTail, [serialized.slice(10)]));
  expect(harness.loaded).toEqual([]); expect(harness.unavailable).toEqual([]);
});

test("requires an explicit complete marker before enabling a reconstructed run", () => {
  for (const detailState of [undefined, "summary", "unavailable"] as const) {
    const harness = createHarness();
    const run = createRunFixture({ id: `strict-${detailState ?? "omitted"}`, detailState: "summary" });
    harness.projection = run;
    harness.requests.request("project", run.threadId, run);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const serialized = { ...run, detailState };
      harness.requests.apply(page(harness.commands[attempt]!, [JSON.stringify(serialized)]));
    }
    expect(harness.loaded).toEqual([]);
    expect(harness.unavailable).toHaveLength(1);
  }
});

test("rejects reconstructed detail containing a foreign-run child", () => {
  const harness = createHarness(), now = "2026-01-01T00:00:00.000Z";
  const run = createRunFixture({ id: "owned-children", detailState: "summary" }); harness.projection = run;
  harness.requests.request("project", run.threadId, run);
  const foreign = { ...run, detailState: "complete", memoryRetrievals: [
    { id: "retrieval", runId: "foreign", owner: "main", queryText: "query", entryIds: [], createdAt: now }] };
  for (let attempt = 0; attempt < 3; attempt += 1)
    harness.requests.apply(page(harness.commands[attempt]!, [JSON.stringify(foreign)]));
  expect(harness.loaded).toEqual([]); expect(harness.unavailable).toHaveLength(1);
  const duplicateHarness = createHarness(), duplicateRun = createRunFixture({ id: "duplicate-evidence", detailState: "summary",
    browserSessions: [{ id: "browser", runId: "duplicate-evidence", owner: "main", status: "idle", approvalMode: "per-tool",
      startedAt: now, updatedAt: now, activities: [{ id: "activity", toolCallId: "call", toolName: "browser", kind: "verify",
        label: "verify", status: "completed", startedAt: now, updatedAt: now, replay: [], verification: [
          { id: "proof", label: "check", status: "passed", createdAt: now },
          { id: "proof", label: "check", status: "failed", createdAt: now }] },
      { id: "activity-two", toolCallId: "call", toolName: "browser", kind: "verify", label: "verify again",
        status: "completed", startedAt: now, updatedAt: now, replay: [], verification: [] }] }] });
  duplicateHarness.projection = duplicateRun; duplicateHarness.requests.request("project", duplicateRun.threadId, duplicateRun);
  for (let attempt = 0; attempt < 3; attempt += 1) duplicateHarness.requests.apply(page(duplicateHarness.commands[attempt]!,
    [JSON.stringify({ ...duplicateRun, detailState: "complete" })]));
  expect(duplicateHarness.loaded).toEqual([]); expect(duplicateHarness.unavailable).toHaveLength(1);
});

test("retries malformed, wrong-id, and oversized detail before exposing manual recovery", () => {
  const harness = createHarness(undefined, 100_000);
  const run = createRunFixture({ id: "recoverable", threadId: "thread", detailState: "summary" });
  harness.projection = run;
  harness.requests.request("project", "thread", run);
  harness.requests.apply(page(harness.commands[0]!, ["not-json"]));
  harness.requests.apply(page(harness.commands[1]!, [JSON.stringify({ ...run, id: "wrong" })]));
  harness.requests.apply(page(harness.commands[2]!, ["x".repeat(100_001)]));
  expect(harness.unavailable).toHaveLength(1);
  expect(harness.projection?.detailState).toBe("unavailable");
  harness.unavailable[0]!();
  const complete = { ...harness.projection!, detailState: "complete" as const };
  harness.requests.apply(page(harness.commands[3]!, [JSON.stringify(complete)]));
  expect(harness.loaded).toEqual([complete]);
});

test("send failure and command rejection use the same bounded recovery lifecycle", () => {
  const failed = createHarness(() => false);
  const run = createRunFixture({ id: "send-failed", detailState: "summary" });
  failed.projection = run;
  failed.requests.request("project", run.threadId, run);
  expect(failed.commands).toHaveLength(3);
  expect(failed.unavailable).toHaveLength(1);

  const rejected = createHarness();
  rejected.projection = run;
  rejected.requests.request("project", run.threadId, run);
  expect(rejected.requests.reject("stale")).toBe(false);
  for (let index = 0; index < 3; index += 1) {
    expect(rejected.requests.reject(rejected.commands[index]!.requestId)).toBe(true);
  }
  expect(rejected.unavailable).toHaveLength(1);
});

test("authoritative session reset revokes owner, recovery, and stale retry", () => {
  const harness = createHarness();
  const run = createRunFixture({ id: "reset-run", detailState: "summary" });
  harness.projection = run;
  harness.requests.request("project", run.threadId, run);
  for (let index = 0; index < 3; index += 1) harness.requests.reject(harness.commands[index]!.requestId);
  const retry = harness.unavailable[0]!;
  harness.projection = undefined;
  harness.requests.reconcile([]);
  retry();
  expect(harness.commands).toHaveLength(3);
  expect(runDetailRecoveries.some(({ runId }) => runId === run.id)).toBe(false);
});

test("captured recovery cannot restart hidden demand after project switch", () => {
  const harness = createHarness();
  const run = createRunFixture({ id: "hidden-retry", detailState: "summary" });
  harness.projection = run;
  harness.requests.request("hidden-project", run.threadId, run);
  for (let index = 0; index < 3; index += 1) harness.requests.reject(harness.commands[index]!.requestId);
  const retry = harness.unavailable[0]!;
  harness.requests.reconcile([]);
  retry();
  expect(harness.commands).toHaveLength(3);
});
