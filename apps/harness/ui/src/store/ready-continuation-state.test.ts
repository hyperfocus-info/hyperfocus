import { describe, expect, test } from "bun:test";
import type { ClientCommand, ServerEvent } from "@hyperfocus/ai-core/protocol";
import { createBackgroundJobFixture, createBackgroundJobRunFixture } from "../utils/tests/test-fixtures";
import { createPagingUnavailableCallbacks, type PagingUnavailableItem } from "./paging-unavailable-state";
import { createReadyContinuationRequests, mergeBackgroundJobPage } from "./ready-continuation-state";

describe("ready continuation requests", () => {
  test("owns responses, follows collection cursors, and exposes invalid-cursor recovery", () => {
    const commands: ClientCommand[] = [];
    const recoveries: Array<() => void> = [];
    let id = 0;
    const requests = createReadyContinuationRequests({
      sendCommand(command) { commands.push(command); return true; },
      createRequestId: () => `request-${++id}`,
      onAssistantCursor: () => undefined,
      onUnavailable: () => undefined,
      onAvailable: () => undefined,
      onTerminalError: (_message, retry) => recoveries.push(retry)
    });
    requests.hydrate({ jobs: "jobs-2", runs: "runs-2", notifications: "notifications-2" });
    expect(commands).toEqual([
      { type: "background-jobs.page.list", requestId: "request-1", payload: {
        jobs: { cursor: "jobs-2", limit: 16 }, runs: { cursor: "runs-2", limit: 16 } } },
      { type: "notifications.page.list", requestId: "request-2", payload: { cursor: "notifications-2", limit: 16 } }
    ]);
    expect(requests.accepts({ type: "notifications.page.listed", requestId: "stale",
      payload: { items: { items: [] } } })).toBe(false);
    requests.handle({ type: "background-jobs.page.listed", requestId: "request-1", payload: {
      collections: ["jobs", "runs"], jobs: { items: [], nextCursor: "jobs-3" }, runs: { items: [] } } });
    expect(commands.at(-1)).toEqual({ type: "background-jobs.page.list", requestId: "request-3",
      payload: { jobs: { cursor: "jobs-3", limit: 16 }, runs: undefined } });
    requests.handle({ type: "command.rejected", requestId: "request-2",
      payload: { message: "cursor expired", code: "invalid-cursor" } });
    expect(recoveries).toHaveLength(1);
    recoveries[0]?.();
    expect(commands.at(-1)).toEqual({ type: "notifications.page.list", requestId: "request-4", payload: { limit: 16 } });
  });

  test("keeps an unsent request recoverable", () => {
    let retry: (() => void) | undefined;
    let connected = false;
    const commands: ClientCommand[] = [];
    const requests = createReadyContinuationRequests({
      sendCommand(command) { if (!connected) return false; commands.push(command); return true; },
      createRequestId: () => "request",
      onAssistantCursor: () => undefined,
      onUnavailable: () => undefined,
      onAvailable: () => undefined,
      onTerminalError: (_message, action) => { retry = action; }
    });
    requests.hydrate({ notifications: "next" });
    connected = true;
    retry?.();
    expect(commands).toEqual([{ type: "notifications.page.list", requestId: "request", payload: { cursor: "next", limit: 16 } }]);
  });

  test("disconnect invalidates late pages and retry closures", () => {
    const commands: ClientCommand[] = [];
    let retry: (() => void) | undefined;
    const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return false; },
      createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
      onUnavailable: () => undefined, onAvailable: () => undefined,
      onTerminalError: (_message, action) => { retry = action; } });
    requests.hydrate({ notifications: "next" });
    const staleId = commands[0]?.requestId;
    requests.reset(); retry?.();
    expect(commands).toHaveLength(1);
    expect(requests.accepts({ type: "notifications.page.listed", requestId: staleId ?? "missing",
      payload: { items: { items: [] } } })).toBe(false);
  });

  test("rejects partial collection replies and authoritatively reconciles a restarted first page", () => {
    const commands: ClientCommand[] = [];
    let retry: (() => void) | undefined;
    const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return true; },
      createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
      onUnavailable: () => undefined, onAvailable: () => undefined,
      onTerminalError: (_message, action) => { retry = action; } });
    requests.hydrate({ jobs: "jobs-next", runs: "runs-next", firstJobIds: ["stale", "kept"] });
    expect(requests.accepts({ type: "background-jobs.page.listed", requestId: "request-1",
      payload: { collections: ["jobs"], jobs: { items: [] } } })).toBe(false);
    expect(commands.at(-1)?.requestId).toBe("request-2");
    requests.handle({ type: "command.rejected", requestId: "request-2",
      payload: { message: "expired", code: "invalid-cursor" } });
    retry?.();
    const event: Extract<ServerEvent, { type: "background-jobs.page.listed" }> = {
      type: "background-jobs.page.listed", requestId: "request-3", payload: {
      collections: ["jobs", "runs"], jobs: { items: [createBackgroundJobFixture({ id: "kept", name: "Updated" })] },
      runs: { items: [] } } };
    const prepared = requests.prepareBackgroundJobs({ jobs: [createBackgroundJobFixture({ id: "stale" }),
      createBackgroundJobFixture({ id: "kept" }), createBackgroundJobFixture({ id: "tail" })], runs: [], templates: [] }, event);
    expect(prepared.jobs.map(({ id }) => id)).toEqual(["tail"]);
    expect(mergeBackgroundJobPage(prepared, event).jobs.map(({ id }) => id)).toEqual(["tail", "kept"]);
  });

  test("reports unavailable items while advancing the cursor", () => {
    const unavailable: string[] = [];
    const requests = createReadyContinuationRequests({ sendCommand: () => true, createRequestId: () => "request",
      onAssistantCursor: () => undefined, onTerminalError: () => undefined,
      onAvailable: () => undefined,
      onUnavailable: (_collection, items) => unavailable.push(...items.map(({ id }) => id)) });
    requests.hydrate({ runs: "next" });
    requests.handle({ type: "background-jobs.page.listed", requestId: "request", payload: { collections: ["runs"],
      runs: { items: [], unavailableItems: [{ id: "oversized", reason: "item-too-large" }] } } });
    expect(unavailable).toEqual(["oversized"]);
  });

  test("bounds repeated collection mismatches before exposing recovery", () => {
    const commands: ClientCommand[] = []; const recoveries: Array<() => void> = [];
    const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return true; },
      createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
      onAvailable: () => undefined, onUnavailable: () => undefined,
      onTerminalError: (_message, retry) => recoveries.push(retry) });
    requests.hydrate({ jobs: "jobs", runs: "runs" });
    for (let attempt = 1; attempt <= 4; attempt += 1) expect(requests.accepts({ type: "background-jobs.page.listed",
      requestId: `request-${attempt}`, payload: { collections: ["jobs"], jobs: { items: [] } } })).toBe(false);
    expect(commands).toHaveLength(4);
    expect(recoveries).toHaveLength(1);
    recoveries[0]?.();
    expect(commands).toHaveLength(5);
  });

  test("ready hydration clears recovered first-page identities without requiring a tail cursor", () => {
    let unavailable: PagingUnavailableItem[] = [
      { collection: "jobs", id: "recovered-job", projectId: "project-a", reason: "item-too-large" },
      { collection: "runs", id: "recovered-run", projectId: "project-a", jobId: "recovered-job", reason: "item-too-large" }
    ];
    const paging = createPagingUnavailableCallbacks({ get: () => unavailable, set: (items) => { unavailable = items; },
      notify: () => undefined });
    const requests = createReadyContinuationRequests({ sendCommand: () => true, createRequestId: () => "request",
      onAssistantCursor: () => undefined, onUnavailable: () => undefined, onTerminalError: () => undefined,
      onAvailable: paging.available });
    requests.hydrate({ firstJobIds: ["recovered-job"], firstRunIds: ["recovered-run"],
      firstNotificationIds: ["recovered-notification"] });
    expect(unavailable).toEqual([]);
  });

  test("continued pages clear recovered owned jobs and runs", () => {
    let unavailable: PagingUnavailableItem[] = [
      { collection: "jobs", id: "recovered-job", projectId: "project-a", reason: "item-too-large" },
      { collection: "runs", id: "recovered-run", projectId: "project-a", jobId: "recovered-job", reason: "item-too-large" }
    ];
    const paging = createPagingUnavailableCallbacks({ get: () => unavailable, set: (items) => { unavailable = items; },
      notify: () => undefined });
    const requests = createReadyContinuationRequests({ sendCommand: () => true, createRequestId: () => "request",
      onAssistantCursor: () => undefined, onUnavailable: paging.unavailableEntries,
      onAvailable: paging.available, onTerminalError: () => undefined });
    requests.hydrate({ jobs: "jobs-next", runs: "runs-next" });
    requests.handle({ type: "background-jobs.page.listed", requestId: "request", payload: { collections: ["jobs", "runs"],
      jobs: { items: [createBackgroundJobFixture({ id: "recovered-job", projectId: "project-a" })] },
      runs: { items: [createBackgroundJobRunFixture({ id: "recovered-run", jobId: "recovered-job",
        projectId: "project-a" })] } } });
    expect(unavailable).toEqual([]);
  });

  test("authoritative reconciliation waits for the final page and retains re-reported unavailable IDs", () => {
    const reconciled: string[][] = []; let request = 0;
    const requests = createReadyContinuationRequests({ sendCommand: () => true,
      createRequestId: () => `request-${++request}`, onAssistantCursor: () => undefined,
      onUnavailable: () => undefined, onAvailable: () => undefined, onTerminalError: () => undefined,
      onReconciled: (collection, ids) => { if (collection === "notifications") reconciled.push(ids); } });
    requests.hydrate({ notifications: "page-2" });
    requests.handle({ type: "notifications.page.listed", requestId: "request-1", payload: { items: { items: [],
      nextCursor: "page-3", unavailableItems: [{ id: "still-large", reason: "item-too-large" }] } } });
    expect(reconciled).toEqual([]);
    requests.handle({ type: "notifications.page.listed", requestId: "request-2", payload: { items: { items: [] } } });
    expect(reconciled).toEqual([["still-large"]]);
  });

  test("a complete notification mutation reconciles an archived unavailable identity", () => {
    const reconciled: string[][] = [];
    const requests = createReadyContinuationRequests({ sendCommand: () => true, createRequestId: () => "request",
      onAssistantCursor: () => undefined, onUnavailable: () => undefined, onAvailable: () => undefined,
      onTerminalError: () => undefined, onReconciled: (collection, ids) => {
        if (collection === "notifications") reconciled.push(ids); } });
    requests.notificationsUpdated({ items: [], unreadCount: 0, interactiveUnreadCount: 0, passiveUnreadCount: 0 });
    expect(reconciled).toEqual([[]]);
  });

  test("invalid cursors discard unavailable evidence from the abandoned ready revision", () => {
    const commands: ClientCommand[] = []; const retries: Array<() => void> = []; const reconciled: string[] = [];
    const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return true; },
      createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
      onUnavailable: () => undefined, onAvailable: () => undefined, onTerminalError: (_message, retry) => retries.push(retry),
      onReconciled: (collection, ids) => { if ((collection === "jobs" || collection === "notifications") && ids.length === 0)
        reconciled.push(collection); } });
    requests.hydrate({ jobs: "jobs-2", notifications: "notifications-2" });
    requests.handle({ type: "background-jobs.page.listed", requestId: "request-1", payload: { collections: ["jobs"],
      jobs: { items: [], nextCursor: "jobs-3", unavailableItems: [{ id: "archived-job", reason: "item-too-large" }] } } });
    requests.handle({ type: "notifications.page.listed", requestId: "request-2", payload: { items: { items: [],
      nextCursor: "notifications-3", unavailableItems: [{ id: "archived-notification", reason: "item-too-large" }] } } });
    requests.handle({ type: "command.rejected", requestId: "request-3", payload: { code: "invalid-cursor", message: "expired" } });
    requests.handle({ type: "command.rejected", requestId: "request-4", payload: { code: "invalid-cursor", message: "expired" } });
    retries.forEach((retry) => retry());
    requests.handle({ type: "background-jobs.page.listed", requestId: "request-5", payload: { collections: ["jobs"], jobs: { items: [] } } });
    requests.handle({ type: "notifications.page.listed", requestId: "request-6", payload: { items: { items: [] } } });
    expect(reconciled.sort()).toEqual(["jobs", "notifications"]);
  });

  test("an old invalid-cursor retry cannot reset reconnect reconciliation evidence", () => {
    const commands: ClientCommand[] = []; let staleRetry: (() => void) | undefined; const reconciled: string[][] = [];
    const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return true; },
      createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
      onUnavailable: () => undefined, onAvailable: () => undefined,
      onTerminalError: (_message, retry) => { staleRetry = retry; },
      onReconciled: (collection, ids) => { if (collection === "notifications") reconciled.push(ids); } });
    requests.hydrate({ notifications: "old-page" });
    requests.handle({ type: "command.rejected", requestId: "request-1",
      payload: { code: "invalid-cursor", message: "expired" } });
    requests.hydrate({ notifications: "current-page" });
    requests.handle({ type: "notifications.page.listed", requestId: "request-2", payload: { items: { items: [],
      nextCursor: "current-tail", unavailableItems: [{ id: "still-large", reason: "item-too-large" }] } } });
    const countBeforeStaleRetry = commands.length; staleRetry?.();
    expect(commands).toHaveLength(countBeforeStaleRetry);
    requests.handle({ type: "notifications.page.listed", requestId: "request-3", payload: { items: { items: [] } } });
    expect(reconciled).toEqual([["still-large"]]);
  });

  test("same-generation ready recovery actions cannot overwrite a manual retry owner", () => {
    for (const failure of ["unsent", "rejected", "mismatch"] as const) {
      const commands: ClientCommand[] = []; let recovery: (() => void) | undefined; let canSend = failure !== "unsent";
      const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return canSend; },
        createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
        onUnavailable: () => undefined, onAvailable: () => undefined,
        onTerminalError: (_message, retry) => { recovery = retry; } });
      requests.hydrate({ notifications: failure === "unsent" ? "next" : undefined, jobs: failure === "unsent" ? undefined : "next" });
      if (failure === "rejected") requests.handle({ type: "command.rejected", requestId: "request-1", payload: { message: "failed" } });
      if (failure === "mismatch") for (let attempt = 0; attempt < 4; attempt += 1) requests.accepts({
        type: "background-jobs.page.listed", requestId: `request-${attempt + 1}`, payload: { collections: ["runs"], runs: { items: [] } } });
      canSend = true; requests.retryUnavailable(new Set(failure === "unsent" ? ["notifications"] : ["jobs"]));
      const count = commands.length; recovery?.(); expect(commands).toHaveLength(count);
    }
  });

  test("a replacement background owner receives a fresh mismatch budget", () => {
    const commands: ClientCommand[] = []; const recoveries: Array<() => void> = [];
    const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return true; },
      createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
      onUnavailable: () => undefined, onAvailable: () => undefined, onTerminalError: (_message, retry) => recoveries.push(retry) });
    requests.hydrate({ jobs: "old" });
    for (let attempt = 0; attempt < 2; attempt += 1) requests.accepts({ type: "background-jobs.page.listed",
      requestId: `request-${attempt + 1}`, payload: { collections: ["runs"], runs: { items: [] } } });
    requests.backgroundJobsUpdated({ jobs: [], runs: [], templates: [], jobsNextCursor: "new" });
    for (let attempt = 4; attempt < 7; attempt += 1) requests.accepts({ type: "background-jobs.page.listed",
      requestId: `request-${attempt}`, payload: { collections: ["runs"], runs: { items: [] } } });
    expect(recoveries).toEqual([]);
  });

  test("jobs and notifications retain independent recovery generations", () => {
    for (const failed of ["jobs", "notifications"] as const) {
      const commands: ClientCommand[] = []; let recovery: (() => void) | undefined; let canSend = false;
      const requests = createReadyContinuationRequests({ sendCommand(command) { commands.push(command); return canSend; },
        createRequestId: () => `request-${commands.length + 1}`, onAssistantCursor: () => undefined,
        onUnavailable: () => undefined, onAvailable: () => undefined,
        onTerminalError: (_message, retry) => { recovery = retry; } });
      requests.hydrate(failed === "jobs" ? { jobs: "next" } : { notifications: "next" });
      if (failed === "jobs") requests.notificationsUpdated({ items: [], unreadCount: 0,
        interactiveUnreadCount: 0, passiveUnreadCount: 0 });
      else requests.backgroundJobsUpdated({ jobs: [], runs: [], templates: [] });
      canSend = true; const count = commands.length; recovery?.();
      expect(commands).toHaveLength(count + 1);
    }
  });
});
