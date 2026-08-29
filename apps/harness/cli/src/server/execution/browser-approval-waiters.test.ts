import { expect, test } from "bun:test";
import { parseClientCommand } from "@hyperfocus/ai-core/protocol";
import { drainCommandRuntimeRecovery, resolveCommandProjectOwnership } from "../commands/command-project-ownership";
import type { Assistant } from "@hyperfocus/ai-core/protocol";
import { browserApprovalKeyOwnsRun, createBrowserApprovalKey } from "./run-context";
import type { PendingBrowserApproval } from "../core/contracts";
import { claimBrowserApprovalWaiter, claimBrowserApprovalWaitersForRun,
  registerBrowserApprovalWaiter, resolveBrowserApprovalWaiter,
  drainBrowserApprovalRuntimeRecovery, queueBrowserApprovalRuntimeRecovery,
  restoreBrowserApprovalWaiter, retryBrowserApprovalRuntimeConvergence,
  settleBrowserApprovalAfterCommit } from "./browser-approval-waiters";

test("duplicate, abort, and FIFO resolution settle each approval exactly once", async () => {
  const waiters = new Map<string, PendingBrowserApproval>(), abort = new AbortController();
  const first = registerBrowserApprovalWaiter(waiters, "first", abort.signal).then(
    (value) => `resolved:${value.approved}`, (error: Error) => `rejected:${error.message}`,
  );
  const duplicate = registerBrowserApprovalWaiter(waiters, "first").then(
    () => "resolved", (error: Error) => `rejected:${error.message}`,
  );
  const second = registerBrowserApprovalWaiter(waiters, "second");
  expect(await duplicate).toContain("already pending"); expect(waiters.size).toBe(2);
  abort.abort(); expect(await first).toContain("aborted"); expect(waiters.size).toBe(1);
  expect(resolveBrowserApprovalWaiter(waiters, "second", true)).toBe(true);
  expect(await second).toEqual({ approved: true }); expect(waiters.size).toBe(0);
});

test("approval waiter tuples remain distinct when ids contain delimiters", async () => {
  const firstKey = createBrowserApprovalKey("a:b", "c", "session", "tool");
  const secondKey = createBrowserApprovalKey("a", "b:c", "session", "tool");
  expect(firstKey).not.toBe(secondKey); expect(browserApprovalKeyOwnsRun(firstKey, "a:b", "c")).toBe(true);
  expect(browserApprovalKeyOwnsRun(firstKey, "a", "b:c")).toBe(false);
  const waiters = new Map<string, PendingBrowserApproval>();
  const first = registerBrowserApprovalWaiter(waiters, firstKey), second = registerBrowserApprovalWaiter(waiters, secondKey);
  const claimed = claimBrowserApprovalWaitersForRun(waiters, "a", "b:c"); expect(claimed).toHaveLength(1);
  claimed[0]!.resolve(false); expect(await second).toEqual({ approved: false }); expect(waiters.has(firstKey)).toBe(true);
  expect(resolveBrowserApprovalWaiter(waiters, firstKey, true)).toBe(true); expect(await first).toEqual({ approved: true });
});

test("queued runtime recovery blocks subsequent work until durable convergence", () => {
  const owner = {}, projectId = "project"; let available = false, attempts = 0;
  queueBrowserApprovalRuntimeRecovery(owner, projectId, () => { attempts += 1; if (!available) throw new Error("down"); });
  drainBrowserApprovalRuntimeRecovery(owner, "unrelated"); expect(attempts).toBe(0);
  expect(() => drainBrowserApprovalRuntimeRecovery(owner)).toThrow("down"); available = true;
  drainBrowserApprovalRuntimeRecovery(owner); expect(attempts).toBe(4);
});

test("command ownership includes project arrays and nested bulk targets", () => {
  const cleanup = parseClientCommand({ type: "thread.cleanupArchive", requestId: "cleanup", payload: {
    projectIds: ["project-a", "project-b"], olderThanMs: 1, ageBasis: "last-user-message" } });
  const bulk = parseClientCommand({ type: "bulk-operation.apply", requestId: "bulk", payload: { action: "delete",
    targets: [{ kind: "project", projectId: "project-c" },
      { kind: "background-job", projectId: "project-d", jobId: "job" }] } });
  const repository = { getAssistant: () => undefined, findProjectIdByRootPath: () => undefined };
  expect(resolveCommandProjectOwnership(cleanup, repository)).toEqual({ kind: "projects",
    projectIds: new Set(["project-a", "project-b"]) });
  expect(resolveCommandProjectOwnership(bulk, repository)).toEqual({ kind: "projects",
    projectIds: new Set(["project-c", "project-d"]) });
});

test("implicit all-project cleanup drains every queued recovery before mutation", () => {
  const cleanup = parseClientCommand({ type: "thread.cleanupArchive", requestId: "cleanup-all", payload: {
    olderThanMs: 1, ageBasis: "last-user-message" } });
  expect(resolveCommandProjectOwnership(cleanup, {
    getAssistant: () => undefined, findProjectIdByRootPath: () => undefined,
  })).toEqual({ kind: "all-projects" });
  const owner = {}; let mutations = 0;
  queueBrowserApprovalRuntimeRecovery(owner, "blocked", () => { throw new Error("resync unavailable"); });
  expect(() => { drainBrowserApprovalRuntimeRecovery(owner); mutations += 1; }).toThrow("resync unavailable");
  expect(mutations).toBe(0);
});

test("authoritative command gate drains global scheduler mutations and prior assistant ownership", () => {
  const repository = { getAssistant: (): Pick<Assistant, "projectId"> => ({ projectId: "hidden" }),
    findProjectIdByRootPath: () => "hidden" };
  const schedulerRetry = parseClientCommand({ type: "background-job.scheduler.retry", requestId: "scheduler" });
  const pauseJobs = parseClientCommand({ type: "background-job.pause-assistant-jobs", requestId: "pause" });
  const now = new Date().toISOString();
  const update = parseClientCommand({ type: "assistant.update", requestId: "update", payload: { assistant: {
    id: "assistant", name: "Assistant", scope: "global", personalityPrompt: "Direct", jobPrompt: "Build",
    agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0,
    circuitBreakerState: "closed", unreadQuestionCount: 0, createdAt: now, updatedAt: now } } });
  for (const command of [schedulerRetry, pauseJobs, update]) {
    const runtime = {}; let mutations = 0;
    queueBrowserApprovalRuntimeRecovery(runtime, "hidden", () => { throw new Error("blocked"); });
    expect(() => { drainCommandRuntimeRecovery(command, repository, runtime); mutations += 1; }).toThrow("blocked");
    expect(mutations).toBe(0);
  }
});

test("existing-root project add and create drain recovery before opening the project", () => {
  const repository = { getAssistant: () => undefined, findProjectIdByRootPath: () => "existing" };
  for (const type of ["project.add", "project.create"] as const) {
    const command = parseClientCommand({ type, requestId: type, payload: { rootPath: "C:\\existing" } });
    const runtime = {}; let opened = 0;
    queueBrowserApprovalRuntimeRecovery(runtime, "existing", () => { throw new Error("blocked"); });
    expect(() => { drainCommandRuntimeRecovery(command, repository, runtime); opened += 1; }).toThrow("blocked");
    expect(opened).toBe(0);
  }
});

test("retries runtime convergence from the durable source", () => {
  let attempts = 0;
  retryBrowserApprovalRuntimeConvergence(() => { attempts += 1; if (attempts < 3) throw new Error("stale"); });
  expect(attempts).toBe(3);
});

test("settles a committed waiter before fallible publication", async () => {
  const waiters = new Map<string, PendingBrowserApproval>(), attempted: string[] = [], reported: string[] = [];
  const pending = registerBrowserApprovalWaiter(waiters, "approval"), waiter = claimBrowserApprovalWaiter(waiters, "approval");
  if (!waiter) throw new Error("Expected claimed waiter");
  settleBrowserApprovalAfterCommit(waiter, true, [
    { name: "runtime", run: () => { attempted.push("runtime"); throw new Error("projection failed"); } },
    { name: "run", run: () => { attempted.push("run"); throw new Error("run publish failed"); } },
    { name: "notifications", run: () => { attempted.push("notifications"); } },
  ], (name) => { reported.push(name); });
  expect(await pending).toEqual({ approved: true }); expect(attempted).toEqual(["runtime", "run", "notifications"]);
  expect(reported).toEqual(["runtime", "run"]); expect(waiters.size).toBe(0);
});

test("claims one exact waiter and restores it after failed persistence", async () => {
  const waiters = new Map<string, PendingBrowserApproval>();
  const pending = registerBrowserApprovalWaiter(waiters, "approval");
  const claimed = claimBrowserApprovalWaiter(waiters, "approval");
  expect(claimed).toBeDefined(); expect(waiters.has("approval")).toBe(false);
  if (!claimed) throw new Error("Expected claimed waiter");
  expect(restoreBrowserApprovalWaiter(waiters, "approval", claimed)).toBe(true);
  expect(resolveBrowserApprovalWaiter(waiters, "approval", false)).toBe(true);
  expect(await pending).toEqual({ approved: false });
});
