import { expect, test } from "bun:test";
import {
  assistantsStateSchema,
  agentRunStateSchema,
  assistantThreadMessagePageSchema,
  assistantSummaryPageSchema,
  backgroundJobPageSchema,
  backgroundJobRunPageSchema,
  assistantTodoPatchSchema,
  assistantTodoSchema,
  createWorkspaceProjectState,
  parseClientCommand,
  getClientCommandRejectionMetadata,
  parseServerEvent,
  parseServerEventFrame,
  SERVER_EVENT_EMIT_MAX_BYTES,
  STREAM_DELTA_MAX_BYTES,
  terminalSessionSchema
} from "@hyperfocus/ai-core/protocol";

test("assistant todo schema defaults work metadata", () => {
  const parsed = assistantTodoSchema.parse({
    id: "todo-1",
    assistantId: "assistant-1",
    title: "Update docs",
    state: "pending",
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  expect(parsed.workKind).toBe("unspecified");
});

test("startup continuation pages require a requested collection and preserve cursors", () => {
  expect(parseClientCommand({ type: "background-jobs.page.list", requestId: "jobs-page",
    payload: { jobs: { cursor: "jobs-2", limit: 128 }, runs: { cursor: "runs-2" } } }).type)
    .toBe("background-jobs.page.list");
  expect(parseClientCommand({ type: "notifications.page.list", requestId: "notifications-page",
    payload: { cursor: "notifications-2", limit: 128 } }).type).toBe("notifications.page.list");
  expect(parseServerEvent({ type: "background-jobs.page.listed", requestId: "jobs-page",
    payload: { collections: ["jobs"], jobs: { items: [], nextCursor: "jobs-3" } } }).type).toBe("background-jobs.page.listed");
  expect(parseServerEvent({ type: "notifications.page.listed", requestId: "notifications-page",
    payload: { items: { items: [], nextCursor: "notifications-3" } } }).type).toBe("notifications.page.listed");
  expect(() => parseClientCommand({ type: "background-jobs.page.list", requestId: "empty", payload: {} })).toThrow();
  expect(() => parseServerEvent({ type: "background-jobs.page.listed", requestId: "empty", payload: {} })).toThrow();
  expect(() => parseServerEvent({ type: "background-jobs.page.listed", requestId: "partial",
    payload: { collections: ["jobs", "runs"], jobs: { items: [] } } })).toThrow();
});

test("manual project notes require semantic tags", () => {
  const command = {
    type: "memory.create",
    requestId: "memory-create",
    payload: {
      projectId: "project-1",
      title: "Frontend refactor",
      summary: "Keep workspace contracts framework-neutral.",
      tags: ["feature:frontend-refactor", "area:harness"]
    }
  } as const;

  expect(parseClientCommand(command).type).toBe("memory.create");
  expect(() => parseClientCommand({
    ...command,
    payload: { ...command.payload, tags: ["frontend"] }
  })).toThrow();
});

test("assistant todo patch schema accepts work metadata", () => {
  expect(
    assistantTodoPatchSchema.parse({
      workKind: "app-code",
      workTarget: "src/app.tsx"
    })
  ).toEqual({
    workKind: "app-code",
    workTarget: "src/app.tsx"
  });
  expect(assistantTodoPatchSchema.parse({ workTarget: null })).toEqual({ workTarget: null });
});

test("assistant ordered collection commands require nonempty unique IDs", () => {
  expect(() => parseClientCommand({ type: "assistant.todo.reorder", requestId: "req-empty-reorder",
    payload: { assistantId: "assistant-1", todoIds: [] } })).toThrow();
  expect(() => parseClientCommand({ type: "assistant.todo.reorder", requestId: "req-reorder",
    payload: { assistantId: "assistant-1", todoIds: ["todo-1", "todo-1"] } })).toThrow();
  expect(() => parseClientCommand({ type: "assistant.learning.reorder", requestId: "req-empty-learning-reorder",
    payload: { assistantId: "assistant-1", learningIds: [] } })).toThrow();
  expect(() => parseClientCommand({ type: "assistant.learning.reorder", requestId: "req-learning-reorder",
    payload: { assistantId: "assistant-1", learningIds: ["learning-1", "learning-1"] } })).toThrow();
});

test("live assistant chat events require matching ownership, correspondence, and roles", () => {
  const createdAt = new Date().toISOString(), message = { id: "message-owned", role: "user" as const,
    kind: "plain" as const, content: "Next", createdAt }, thread = { id: "thread-owned", assistantId: "assistant-owned",
      sessionId: "session-owned", messageCount: 1, latestMessageId: message.id, updatedAt: createdAt };
  const appended = { type: "assistant.chat.message-appended", requestId: "req-owned",
    payload: { assistantId: thread.assistantId, sessionId: thread.sessionId, message, thread } } as const;
  expect(() => parseServerEvent({ ...appended, payload: { ...appended.payload, assistantId: "foreign" } })).toThrow("event assistant");
  expect(() => parseServerEvent({ ...appended, payload: { ...appended.payload, sessionId: "foreign" } })).toThrow("event session");
  expect(() => parseServerEvent({ ...appended, payload: { ...appended.payload,
    message: { ...message, id: "foreign" } } })).toThrow("latest thread message");
  expect(() => parseServerEvent({ ...appended, payload: { ...appended.payload,
    message: { ...message, role: "assistant" } } })).toThrow("role user");
  expect(() => parseServerEvent({ ...appended, payload: { ...appended.payload,
    thread: { ...thread, messageCount: 0 } } })).toThrow("include its latest message");
  expect(() => parseServerEvent({ ...appended, payload: { ...appended.payload,
    thread: { ...thread, updatedAt: "legacy-timestamp" } } })).toThrow();
  expect(() => parseServerEvent({ type: "assistant.chat.complete", requestId: "req-complete", payload: {
    assistantId: thread.assistantId, sessionId: thread.sessionId, assistantMessage: message, thread } })).toThrow("role assistant");
});

test("assistant pagination commands and events parse", () => {
  expect(
    parseClientCommand({
      type: "assistant.detail.get",
      requestId: "req-detail",
      payload: {
        assistantId: "assistant-1"
      }
    }).type
  ).toBe("assistant.detail.get");
  expect(
    parseClientCommand({
      type: "assistant.logs.list",
      requestId: "req-logs",
      payload: {
        assistantId: "assistant-1",
        cursor: JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", id: "log-1" }),
        limit: 50
      }
    }).type
  ).toBe("assistant.logs.list");

  const now = new Date().toISOString();
  expect(
    parseServerEvent({
      type: "assistant.summary.listed",
      requestId: "req-summary",
      payload: {
        assistants: {
          items: [
            {
              id: "assistant-1",
              name: "Helper",
              scope: "global",
              personalityPrompt: "Concise.",
              jobPrompt: "Help.",
              agentId: "pi",
              runState: "active",
              bootstrapState: "completed",
              failureStreakCount: 0,
              circuitBreakerState: "closed",
              unreadQuestionCount: 0,
              createdAt: now,
              updatedAt: now
            }
          ],
          nextCursor: JSON.stringify({ timestamp: now, id: "assistant-1" }),
          totalApprox: 1
        }
      }
    }).type
  ).toBe("assistant.summary.listed");
});

test("assistant page totals accept all nonnegative safe integer counts", () => {
  expect(assistantSummaryPageSchema.parse({ items: [], totalApprox: 1_000_001 }).totalApprox).toBe(1_000_001);
  expect(() => assistantSummaryPageSchema.parse({ items: [], totalApprox: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
});

test("bounded pages reject duplicate item IDs across assistant and workload surfaces", () => {
  const now = new Date().toISOString();
  const assistant = { id: "assistant-page", name: "Helper", scope: "global", personalityPrompt: "Concise.", jobPrompt: "Help.",
    agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed",
    unreadQuestionCount: 0, createdAt: now, updatedAt: now } as const;
  const message = { id: "message-page", role: "user", kind: "plain", content: "Hello", createdAt: now } as const;
  const job = { id: "job-page", projectId: "project-1", assistantId: assistant.id, automationThreadId: "thread-1",
    kind: "ai-routine", name: "Review", status: "enabled", riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: "Review." }, schedule: { type: "one-off", runAt: now, sourceText: "now" },
    scheduleInput: "now", createdAt: now, updatedAt: now } as const;
  const run = { id: "run-page", jobId: job.id, projectId: job.projectId, assistantId: assistant.id,
    automationThreadId: job.automationThreadId, triggerSource: "manual", status: "succeeded", riskLevel: "safe",
    approvalStatus: "not-needed", skippedOccurrenceCount: 0, queuedAt: now, createdAt: now, updatedAt: now, events: [] } as const;
  expect(() => assistantSummaryPageSchema.parse({ items: [assistant, assistant] })).toThrow("unique IDs");
  expect(() => assistantThreadMessagePageSchema.parse({ items: [message, message] })).toThrow("unique IDs");
  expect(() => backgroundJobPageSchema.parse({ items: [job, job] })).toThrow("unique IDs");
  expect(() => backgroundJobRunPageSchema.parse({ items: [run, run] })).toThrow("unique IDs");
  expect(backgroundJobRunPageSchema.parse({ items: [], unavailableItems: [
    { id: run.id, reason: "item-too-large" }] }).unavailableItems).toHaveLength(1);
  expect(() => backgroundJobRunPageSchema.parse({ items: [run], unavailableItems: [
    { id: run.id, reason: "item-too-large" }] })).toThrow("unique and disjoint");
  expect(() => parseServerEvent({ type: "assistant.workloads.listed", requestId: "duplicate-workload", payload: {
    assistantId: assistant.id, jobs: { items: [job, job] }, runs: { items: [run, run] } } })).toThrow("unique IDs");
});

test("stream delta events enforce the shared UTF-8 byte boundary", () => {
  const boundary = "x".repeat(STREAM_DELTA_MAX_BYTES);
  expect(parseServerEvent({ type: "assistant.chat.delta", requestId: "assistant-boundary", payload: {
    assistantId: "assistant-1", sessionId: "session-1", delta: boundary } }).type).toBe("assistant.chat.delta");
  expect(parseServerEvent({ type: "chat.delta", requestId: "project-boundary", payload: {
    projectId: "project-1", threadId: "thread-1", sessionId: "session-1", delta: boundary } }).type).toBe("chat.delta");
  const oversizedUtf8 = "😀".repeat(STREAM_DELTA_MAX_BYTES / 4 + 1);
  expect(() => parseServerEvent({ type: "assistant.chat.delta", requestId: "assistant-oversized", payload: {
    assistantId: "assistant-1", sessionId: "session-1", delta: oversizedUtf8 } })).toThrow("UTF-8 bytes");
  expect(() => parseServerEvent({ type: "chat.delta", requestId: "project-oversized", payload: {
    projectId: "project-1", threadId: "thread-1", sessionId: "session-1", delta: oversizedUtf8 } })).toThrow("UTF-8 bytes");
});

test("attach-ready events require token and payload session correspondence", () => {
  const attachToken = { token: "0123456789abcdef", sessionId: "token-session", clientId: "client",
    expiresAt: new Date().toISOString() };
  expect(() => parseServerEventFrame({ type: "terminal.session.attach-ready", requestId: "request",
    payload: { sessionId: "outer-session", attachToken, snapshot: "" } })).toThrow("must match");
  expect(() => parseServerEventFrame({ type: "cli-session.attach-ready", requestId: "request",
    payload: { projectId: "project", threadId: "thread", sessionId: "outer-session", attachToken } })).toThrow("must match");
  expect(parseServerEventFrame({ type: "terminal.session.attach-ready", requestId: "request",
    payload: { sessionId: "token-session", attachToken, snapshot: "" } })[0]?.type).toBe("terminal.session.attach-ready");
});

test("CLI started events require outer and embedded ownership correspondence", () => {
  const now = new Date().toISOString();
  const session = { id: "cli-session", projectId: "project", threadId: "thread", agentId: "codex-cli",
    cwd: "/workspace", status: "running", cols: 120, rows: 32, attachState: "attached", idleTimeoutMs: 60_000,
    startedAt: now, updatedAt: now } as const;
  const event = { type: "cli-session.started", requestId: "request",
    payload: { projectId: "project", threadId: "thread", session } } as const;
  expect(parseServerEvent(event).type).toBe("cli-session.started");
  for (const type of ["cli-session.started", "cli-session.updated", "cli-session.exited"] as const) {
    expect(() => parseServerEvent({ ...event, type, payload: { ...event.payload, projectId: "other" } })).toThrow("projectId must match");
    expect(() => parseServerEvent({ ...event, type, payload: { ...event.payload, threadId: "other" } })).toThrow("threadId must match");
  }
});

test("server events enforce the shared encoded frame budget", () => {
  const content = "x".repeat(1_000_000); const now = new Date(0).toISOString();
  const projects = Array.from({ length: 2 }, (_, projectIndex) => { const threadId = `thread-${projectIndex}`;
    return createWorkspaceProjectState({ id: `project-${projectIndex}`, name: `Project ${projectIndex}`, rootPath: `/project-${projectIndex}`,
      activeThreadId: threadId, session: { sessionId: threadId, isStreaming: false,
        messages: Array.from({ length: 16 }, (_, messageIndex) => ({ id: `message-${projectIndex}-${messageIndex}`,
          role: "assistant" as const, content, createdAt: now })) } }); });
  const oversized = { type: "workspace.updated", requestId: "frame-budget", payload: {
    workspace: { projects, activeProjectId: projects[0]!.id } } } as const;
  expect(new TextEncoder().encode(JSON.stringify(oversized)).byteLength).toBeGreaterThan(SERVER_EVENT_EMIT_MAX_BYTES);
  expect(() => parseServerEvent(oversized)).toThrow("Server event exceeds");
});

test("run detail pages bound UTF-8 chunks and preserve ownership", () => {
  const event = { type: "run.detail.loaded", requestId: "run-detail", payload: { projectId: "project",
    threadId: "thread", runId: "run", chunks: { items: ["detail"], nextCursor: "next" } } } as const;
  expect(parseServerEvent(event).type).toBe("run.detail.loaded");
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload,
    chunks: { items: ["😀".repeat(2_049)] } } })).toThrow("8192 UTF-8 bytes");
  expect(parseClientCommand({ type: "run.detail.get", requestId: "detail", payload: {
    projectId: "project", threadId: "thread", runId: "run", cursor: "next", limit: 128
  } }).type).toBe("run.detail.get");
});

test("run lifecycle events require an explicit durable thread sequence", () => {
  const run = { id: "run-sequence", threadId: "thread", status: "ready", latestUserPrompt: "work",
    questions: [], subtasks: [], resumable: false, retryable: true,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } as const;
  const event = { type: "run.updated", requestId: "sequence", payload: { projectId: "project", threadId: "thread", run } } as const;
  expect(() => parseServerEvent(event)).toThrow("thread run sequence");
  const sequenced = { ...event, payload: { ...event.payload, run: { ...run, threadRunSequence: 1 } } };
  expect(parseServerEvent(sequenced).type)
    .toBe("run.updated");
  expect(() => parseServerEvent({ ...sequenced, payload: { ...sequenced.payload, threadId: "other-thread" } }))
    .toThrow("must match the payload thread");
});

test("run state rejects children owned by another run", () => {
  const now = "2026-01-01T00:00:00.000Z";
  const run = { id: "parent", threadId: "thread", threadRunSequence: 1, status: "ready", latestUserPrompt: "work",
    questions: [], subtasks: [], resumable: false, retryable: true, createdAt: now, updatedAt: now } as const;
  const plan = { runId: "foreign", origin: "initial", iteration: 1, summary: "plan", finalExecutionBrief: "work",
    difficultyScore: 1, planningModelId: "openai/gpt-5.4", executionModelId: "openai/gpt-5.4", route: "main",
    subagentWorktreeStrategy: "same-worktree", targetSubagentCount: 0, actualSubagentCount: 0,
    gating: { mode: "approve", delaySeconds: 0 }, prerequisites: [], contracts: [], correctnessPolicy: "ask-before-iterate" } as const;
  const foreignChildren = [
    { plan }, { correctnessReview: { status: "pass", summary: "done", gaps: [], recommendedPlan: plan } },
    { browserSessions: [{ id: "browser", runId: "foreign", owner: "main", status: "idle", approvalMode: "per-tool",
      startedAt: now, updatedAt: now, activities: [] }] },
    { toolActivities: [{ id: "tool", runId: "foreign", owner: "main", toolCallId: "call", toolName: "read",
      category: "other", status: "completed", startedAt: now, updatedAt: now }] },
    { experiment: { id: "experiment", runId: "foreign", status: "running", virtualBranchName: "branch",
      repoMountPath: "repo", projectMountPath: "project", baseDirtyFingerprint: "base", filesChanged: 0,
      insertions: 0, deletions: 0, createdAt: now, updatedAt: now } },
    { memoryRetrievals: [{ id: "memory", runId: "foreign", owner: "main", queryText: "query", entryIds: [], createdAt: now }] }
  ];
  for (const child of foreignChildren) expect(() => agentRunStateSchema.parse({ ...run, ...child }))
    .toThrow("must match the parent run");
});

test("run state requires unique child identities", () => {
  const now = "2026-01-01T00:00:00.000Z", run = { id: "parent", threadId: "thread", status: "ready",
    latestUserPrompt: "work", questions: [], subtasks: [], resumable: false, retryable: true, createdAt: now, updatedAt: now };
  const question = { id: "question", prompt: "Choose", responseKind: "freeform", placeholder: "Answer",
    required: true, status: "pending", askedAt: now } as const;
  const task = { id: "task", title: "Task", instruction: "Work", status: "pending", attemptCount: 0, updatedAt: now } as const;
  const activity = { id: "activity", toolCallId: "call", toolName: "browser", kind: "navigate", label: "Open",
    status: "completed", startedAt: now, updatedAt: now, replay: [], verification: [] } as const;
  const session = { id: "session", runId: run.id, owner: "main", status: "idle", approvalMode: "per-tool",
    startedAt: now, updatedAt: now, activities: [activity] } as const;
  const tool = { id: "tool", runId: run.id, owner: "main", toolCallId: "call", toolName: "read", category: "other",
    status: "completed", startedAt: now, updatedAt: now } as const;
  const retrieval = { id: "memory", runId: run.id, owner: "main", queryText: "query", entryIds: [], createdAt: now } as const;
  const replay = { id: "replay", status: "completed", summary: "done", createdAt: now } as const;
  const verification = { id: "verification", label: "check", status: "passed", createdAt: now } as const;
  const duplicates = [{ questions: [question, question] }, { subtasks: [task, task] },
    { browserSessions: [session, session] }, { toolActivities: [tool, tool] },
    { memoryRetrievals: [retrieval, retrieval] },
    { browserSessions: [session, { ...session, id: "session-two", activities: [activity] }] },
    { browserSessions: [{ ...session, activities: [{ ...activity, replay: [replay, replay] }] }] },
    { browserSessions: [{ ...session, activities: [{ ...activity, verification: [verification, verification] }] }] }];
  for (const children of duplicates) expect(() => agentRunStateSchema.parse({ ...run, ...children }))
    .toThrow("Run child IDs must be unique");
  expect(() => agentRunStateSchema.parse({ ...run, toolActivities: [tool, { ...tool, id: "tool-two" }] }))
    .toThrow("Run tool call IDs must be unique");
});

test("run state requires unambiguous browser approval ownership", () => {
  const now = "2026-01-01T00:00:00.000Z", run = { id: "parent", threadId: "thread", status: "ready",
    latestUserPrompt: "work", questions: [], subtasks: [], resumable: false, retryable: true, createdAt: now, updatedAt: now };
  const approval = { toolCallId: "call", toolName: "browser", kind: "click", label: "Click", status: "pending",
    requestedAt: now } as const;
  const activity = { id: "activity", toolCallId: "call", toolName: "browser", kind: "click", label: "Click",
    status: "pending-approval", startedAt: now, updatedAt: now, approval, replay: [], verification: [] } as const;
  const session = { id: "session", runId: run.id, owner: "main", status: "awaiting-approval", approvalMode: "per-tool",
    startedAt: now, updatedAt: now, pendingApproval: approval, activities: [activity] } as const;
  expect(agentRunStateSchema.parse({ ...run, browserSessions: [session] }).browserSessions).toHaveLength(1);
  const deferred = { ...session, status: "running", pendingApproval: undefined,
    activities: [{ ...activity, approval: { ...approval, status: "deferred" } }] } as const;
  expect(agentRunStateSchema.parse({ ...run, browserSessions: [deferred] }).browserSessions).toHaveLength(1);
  expect(agentRunStateSchema.parse({ ...run, browserSessions: [session] }).browserSessions?.[0]?.pendingApproval?.status).toBe("pending");
  const hostile = [
    { ...session, activities: [activity, { ...activity, id: "other" }] },
    { ...session, activities: [{ ...activity, approval: { ...approval, toolCallId: "other" } }] },
    { ...session, pendingApproval: { ...approval, label: "Different" } },
    { ...session, status: "running" }, { ...deferred, status: "completed" }
  ];
  for (const browserSession of hostile) expect(() => agentRunStateSchema.parse({ ...run, browserSessions: [browserSession] })).toThrow();
});

test("workspace child pages bound and deduplicate file paths", () => {
  expect(parseClientCommand({ type: "workspace.projectChildren.list", requestId: "workspace-files", payload: {
    projectId: "project-1", filePaths: { cursor: "files-cursor", limit: 512 }
  } }).type).toBe("workspace.projectChildren.list");
  expect(() => parseServerEvent({ type: "workspace.projectChildren.listed", requestId: "workspace-files", payload: {
    projectId: "project-1", collections: ["filePaths"], filePaths: { items: ["src/app.ts", "src/app.ts"] }
  } })).toThrow("File path page items must be unique");
});

test("workspace child pages require unique declarations matching returned fields", () => {
  const base = { type: "workspace.projectChildren.listed", requestId: "workspace-children", payload: {
    projectId: "project-1", collections: ["threads"], threads: { items: [] } } };
  expect(parseServerEvent(base).type).toBe("workspace.projectChildren.listed");
  expect(() => parseServerEvent({ ...base, payload: { ...base.payload, collections: ["threads", "threads"] } }))
    .toThrow("collections must be unique");
  expect(() => parseServerEvent({ ...base, payload: { ...base.payload, collections: ["messages"] } }))
    .toThrow("must match declared collections");
});

test("assistant summary deltas reject contradictory and duplicate identity lists", () => {
  const now = new Date().toISOString();
  const assistant = { id: "assistant-1", name: "Helper", scope: "global", personalityPrompt: "Concise.", jobPrompt: "Help.",
    agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed",
    unreadQuestionCount: 0, createdAt: now, updatedAt: now } as const;
  const event = { type: "assistants.updated", requestId: "summary-delta", payload: { assistants: {
    assistants: [assistant], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] } } } as const;
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload,
    deletedAssistantIds: [assistant.id] } })).toThrow("cannot also be deleted");
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload,
    deletedAssistantIds: ["assistant-2", "assistant-2"] } })).toThrow("unique IDs");
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload,
    invalidatedDetailAssistantIds: [assistant.id, assistant.id] } })).toThrow("unique IDs");
  const orphanTodo = { id: "todo-orphan", assistantId: "assistant-deleted", title: "Orphan", state: "pending", sortOrder: 0,
    workKind: "unspecified", createdAt: now, updatedAt: now } as const;
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload, assistants: {
    ...event.payload.assistants, todos: [orphanTodo] }, deletedAssistantIds: [orphanTodo.assistantId] } }))
    .toThrow("included assistant");
});

test("assistant ready state rejects duplicate identities, orphan children, and inconsistent threads", () => {
  const now = new Date().toISOString();
  const assistant = { id: "assistant-owned", name: "Helper", scope: "global", personalityPrompt: "Concise.", jobPrompt: "Help.",
    agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed",
    unreadQuestionCount: 0, createdAt: now, updatedAt: now } as const;
  const empty = { assistants: [assistant], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] };
  const todo = { id: "todo-owned", assistantId: assistant.id, title: "Check", state: "pending", sortOrder: 0,
    workKind: "unspecified", createdAt: now, updatedAt: now } as const;
  expect(() => assistantsStateSchema.parse({ ...empty, assistants: [assistant, assistant] })).toThrow("unique IDs");
  expect(() => assistantsStateSchema.parse({ ...empty, todos: [{ ...todo, assistantId: "assistant-missing" }] }))
    .toThrow("included assistant");
  expect(() => assistantsStateSchema.parse({ ...empty, todos: [todo, todo] })).toThrow("unique IDs");
  const message = { id: "message-1", role: "user", kind: "plain", content: "Hello", createdAt: now } as const;
  const thread = { id: "thread-1", assistantId: assistant.id, sessionId: "session-1", messageCount: 1,
    messages: [message], updatedAt: now };
  expect(() => assistantsStateSchema.parse({ ...empty, threads: [{ ...thread, messageCount: 0 }] }))
    .toThrow("message count");
  expect(() => assistantsStateSchema.parse({ ...empty, threads: [{ ...thread, messages: [message, message] }] }))
    .toThrow("unique IDs");
});

test("assistant detail and continuation pages reject cross-assistant children", () => {
  const now = new Date().toISOString();
  const assistant = { id: "assistant-1", name: "Helper", scope: "global", personalityPrompt: "Concise.", jobPrompt: "Help.",
    agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed",
    unreadQuestionCount: 0, createdAt: now, updatedAt: now };
  const foreignTodo = { id: "todo-1", assistantId: "assistant-2", title: "Foreign", state: "pending", sortOrder: 0,
    workKind: "unspecified", createdAt: now, updatedAt: now };
  expect(() => parseServerEvent({ type: "assistant.detail.loaded", requestId: "detail", payload: { detail: { assistant,
    todos: { items: [foreignTodo] }, learnings: { items: [] }, questions: { items: [] }, logs: { items: [] }, assetRefs: [] } } })).toThrow();
  expect(() => parseServerEvent({ type: "assistant.todos.listed", requestId: "todos", payload: {
    assistantId: assistant.id, todos: { items: [foreignTodo] } } })).toThrow();
});

test("assistant detail events enforce thread correspondence and unique asset identities", () => {
  const now = new Date().toISOString();
  const assistant = { id: "assistant-detail", name: "Helper", scope: "global", personalityPrompt: "Concise.", jobPrompt: "Help.",
    agentId: "pi", runState: "active", bootstrapState: "completed", failureStreakCount: 0, circuitBreakerState: "closed",
    unreadQuestionCount: 0, createdAt: now, updatedAt: now } as const;
  const message = { id: "message-detail", role: "user", kind: "plain", content: "Hello", createdAt: now } as const;
  const thread = { id: "thread-detail", assistantId: assistant.id, sessionId: "session-detail", messageCount: 1,
    messages: [message], updatedAt: now };
  const asset = { id: "asset-detail", assistantId: assistant.id, kind: "skill", label: "Review", value: "review",
    resolutionStatus: "resolved", createdAt: now } as const;
  const detail = { assistant, thread, todos: { items: [] }, learnings: { items: [] }, questions: { items: [] },
    logs: { items: [] }, assetRefs: [asset] };
  expect(parseServerEvent({ type: "assistant.detail.loaded", requestId: "detail-valid", payload: { detail } }).type)
    .toBe("assistant.detail.loaded");
  expect(() => parseServerEvent({ type: "assistant.detail.loaded", requestId: "detail-duplicate-message", payload: {
    detail: { ...detail, thread: { ...thread, messageCount: 2, messages: [message, message] } } } })).toThrow("unique IDs");
  expect(() => parseServerEvent({ type: "assistant.detail.loaded", requestId: "detail-count", payload: {
    detail: { ...detail, thread: { ...thread, messageCount: 0 } } } })).toThrow("message count");
  expect(() => parseServerEvent({ type: "assistant.detail.loaded", requestId: "detail-duplicate-asset", payload: {
    detail: { ...detail, assetRefs: [asset, asset] } } })).toThrow("unique IDs");
});

test("assistant workload page commands and events parse", () => {
  const cursor = JSON.stringify({
    version: 1,
    scope: "assistant-page",
    ownerId: "\u0001".repeat(128),
    collection: "jobs",
    position: { timestamp: "\u0003".repeat(256), id: "\u0002".repeat(128) }
  });
  expect(cursor.length).toBeGreaterThan(512);
  expect(
    parseClientCommand({
      type: "assistant.workloads.list",
      requestId: "req-assistant-jobs",
      payload: {
        assistantId: "assistant-1",
        jobs: { cursor, limit: 2 },
        runs: { limit: 3 }
      }
    }).type
  ).toBe("assistant.workloads.list");
  expect(
    parseClientCommand({
      type: "assistant.workloads.list",
      requestId: "req-assistant-workload-defaults",
      payload: { assistantId: "assistant-1" }
    }).type
  ).toBe("assistant.workloads.list");
  expect(() =>
    parseClientCommand({
      type: "assistant.workloads.list",
      requestId: "req-assistant-jobs-too-large",
      payload: {
        assistantId: "assistant-1",
        jobs: { limit: 513 }
      }
    })
  ).toThrow();

  const now = new Date().toISOString();
  expect(
    parseServerEvent({
      type: "assistant.workloads.listed",
      requestId: "req-assistant-jobs",
      payload: {
        assistantId: "assistant-1",
        jobsCursor: cursor,
        jobs: {
          items: [
            {
              id: "job-1",
              projectId: "project-1",
              assistantId: "assistant-1",
              automationThreadId: "thread-1",
              kind: "ai-routine",
              name: "Review project",
              status: "enabled",
              riskLevel: "safe",
              definition: { kind: "ai-routine", prompt: "Review the project." },
              schedule: { type: "one-off", runAt: now, sourceText: "now" },
              scheduleInput: "now",
              createdAt: now,
              updatedAt: now
            }
          ],
          nextCursor: cursor
        },
        runs: {
          items: [
            {
              id: "background-run-1",
              jobId: "job-1",
              projectId: "project-1",
              assistantId: "assistant-1",
              automationThreadId: "thread-1",
              triggerSource: "manual",
              status: "succeeded",
              riskLevel: "safe",
              approvalStatus: "approved",
              skippedOccurrenceCount: 0,
              queuedAt: now,
              createdAt: now,
              updatedAt: now,
              events: []
            }
          ]
        }
      }
    }).type
  ).toBe("assistant.workloads.listed");
  expect(() =>
    parseServerEvent({
      type: "assistant.workloads.listed",
      requestId: "req-assistant-workload-empty",
      payload: { assistantId: "assistant-1", jobsCursor: cursor }
    })
  ).toThrow();
  expect(() =>
    parseServerEvent({
      type: "assistant.workloads.listed",
      requestId: "req-assistant-workload-cross-owner",
      payload: {
        assistantId: "assistant-1",
        jobs: {
          items: [{
            id: "job-cross-owner",
            projectId: "project-1",
            assistantId: "assistant-2",
            automationThreadId: "thread-1",
            kind: "ai-routine",
            name: "Wrong owner",
            status: "enabled",
            riskLevel: "safe",
            definition: { kind: "ai-routine", prompt: "Wrong owner." },
            schedule: { type: "one-off", runAt: now, sourceText: "now" },
            scheduleInput: "now",
            createdAt: now,
            updatedAt: now
          }],
          totalApprox: 1
        }
      }
    })
  ).toThrow();
  expect(
    parseServerEvent({
      type: "command.rejected",
      requestId: "req-invalid-cursor",
      payload: { message: "Harness command failed", detail: "Cursor rejected", code: "invalid-cursor" }
    }).type
  ).toBe("command.rejected");
});

test("invalid assistant cursor command metadata preserves request correlation", () => {
  const command = {
    type: "assistant.workloads.list",
    requestId: "req-oversized-cursor",
    payload: { assistantId: "assistant-1", jobs: { cursor: "z".repeat(4097) } }
  };
  let parseError: unknown;
  try { parseClientCommand(command); } catch (error) { parseError = error; }
  expect(getClientCommandRejectionMetadata(command, parseError))
    .toEqual({ requestId: "req-oversized-cursor", code: "invalid-cursor" });
});

test("background run source events require immutable job relations while allowing historical ownership", () => {
  const now = new Date().toISOString();
  const job = {
    id: "job-source", projectId: "project-1", assistantId: "assistant-1", automationThreadId: "thread-1",
    kind: "ai-routine", name: "Source job", status: "enabled", riskLevel: "safe",
    definition: { kind: "ai-routine", prompt: "Work." }, schedule: { type: "one-off", runAt: now, sourceText: now },
    scheduleInput: now, createdAt: now, updatedAt: now
  };
  const run = {
    id: "run-source", jobId: job.id, projectId: job.projectId, assistantId: job.assistantId,
    automationThreadId: job.automationThreadId, triggerSource: "manual", status: "succeeded", riskLevel: "safe",
    approvalStatus: "not-needed", skippedOccurrenceCount: 0, queuedAt: now, createdAt: now, updatedAt: now, events: []
  };
  const event = { type: "background-job.source.loaded", requestId: "req-source", payload: { kind: "run", job, run } };

  expect(parseServerEvent(event).type).toBe("background-job.source.loaded");
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload, run: { ...run, jobId: "other-job" } } })).toThrow();
  expect(() => parseServerEvent({ ...event, payload: { ...event.payload, run: { ...run, projectId: "other-project" } } })).toThrow();
  expect(parseServerEvent({
    ...event,
    payload: { ...event.payload, job: { ...job, assistantId: "reassigned-assistant" } }
  }).type).toBe("background-job.source.loaded");
  expect(parseServerEvent({ type: "background-jobs.deleted", requestId: "delete-scope", payload: { targets: [
    { kind: "background-job", jobId: job.id },
    { kind: "assistant", assistantId: "assistant-1" },
    { kind: "project", projectId: job.projectId }
  ], deletedJobIds: [job.id] } }).type).toBe("background-jobs.deleted");
  expect(() => parseServerEvent({ type: "background-jobs.deleted", requestId: "delete-empty", payload: {
    targets: [], deletedJobIds: []
  } })).toThrow();
});

test("scheduler retry command parses without payload", () => {
  expect(
    parseClientCommand({
      type: "background-job.scheduler.retry",
      requestId: "req-scheduler-retry"
    }).type
  ).toBe("background-job.scheduler.retry");
});

test("bulk operation commands and events parse", () => {
  const command = parseClientCommand({
    type: "bulk-operation.apply",
    requestId: "req-bulk-apply",
    payload: {
      operationId: "bulk-1",
      action: "pause",
      targets: [
        {
          kind: "background-job",
          projectId: "project-1",
          jobId: "job-1"
        },
        {
          kind: "assistant",
          assistantId: "assistant-1"
        },
        {
          kind: "project",
          projectId: "project-1"
        }
      ]
    }
  });

  expect(command.type).toBe("bulk-operation.apply");
  if (command.type !== "bulk-operation.apply") {
    throw new Error("Expected bulk-operation.apply command");
  }
  expect(command.payload.targets).toHaveLength(3);

  const event = parseServerEvent({
    type: "bulk-operation.applied",
    requestId: "req-bulk-apply",
    payload: {
      operationId: "bulk-1",
      action: "pause",
      applied: true,
      results: [
        {
          target: {
            kind: "background-job",
            projectId: "project-1",
            jobId: "job-1"
          },
          status: "applied",
          label: "Daily review",
          message: "Paused scheduled job.",
          destructive: false,
          live: false
        }
      ]
    }
  });

  expect(event.type).toBe("bulk-operation.applied");
  if (event.type !== "bulk-operation.applied") {
    throw new Error("Expected bulk-operation.applied event");
  }
  expect(event.payload.results[0]?.status).toBe("applied");
});

test("terminal sessions carry transport degradation metadata", () => {
  const now = new Date().toISOString();

  const session = terminalSessionSchema.parse({
    id: "terminal-1",
    projectId: "project-1",
    name: "PowerShell",
    shellId: "powershell",
    cwd: "C:\\repo",
    status: "running",
    cols: 120,
    rows: 32,
    transportMode: "pipe",
    transportWarning: "Windows pipe transport",
    startedAt: now,
    updatedAt: now
  });

  expect(session.transportMode).toBe("pipe");
  expect(
    parseServerEvent({
      type: "terminal.session.updated",
      requestId: "req-terminal",
      payload: { session }
    }).type
  ).toBe("terminal.session.updated");
});

test("server event batch frames parse to ordered events", () => {
  const events = parseServerEventFrame({
    type: "server.events-batch",
    payload: {
      events: [
        {
          type: "connection.pong",
          requestId: "req-pong",
          payload: {
            timestamp: 1
          }
        },
        {
          type: "assistant.chat.delta",
          requestId: "req-delta",
          payload: {
            assistantId: "assistant-1",
            sessionId: "session-1",
            delta: "hello"
          }
        }
      ]
    }
  });

  expect(events.map((event) => event.type)).toEqual(["connection.pong", "assistant.chat.delta"]);
});
