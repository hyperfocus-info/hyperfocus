import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createAssistantId, createAssistantLearningId, createAssistantLogEntryId, createAssistantQuestionId, createAssistantTodoId,
  type AgentRuntimeCapability, type Assistant, type BackgroundJob, type ProviderBrand } from "@hyperfocus/ai-core/protocol";
import type { AgentRuntime } from "../agent-runtimes/agent-runtime";
import { createAgentRuntimeRegistry } from "../agent-runtimes/runtime-registry";
import { createAssistantManager } from "../assistant-manager";
import { resolvePersistedAssistantChatAction } from "../assistant-chat-actions";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "../pi-agent-adapter";
import { resolveHarnessTestTempRoot } from "../test-support/test-temp-root";
import { createWorkspaceRepository, type WorkspaceRepository } from "../workspace-repository";

function createRepository() {
  return createWorkspaceRepository(path.join(resolveHarnessTestTempRoot(), `assistant-atomicity-${crypto.randomUUID()}.sqlite`),
    process.cwd(), { durability: "test-fast" });
}

function createAssistant(repository: WorkspaceRepository, overrides: Partial<Assistant> = {}) {
  const root = path.join(resolveHarnessTestTempRoot(), `assistant-atomicity-project-${crypto.randomUUID()}`);
  mkdirSync(root, { recursive: true }); const project = repository.addProject(root); const now = new Date().toISOString();
  return repository.saveAssistant({ id: createAssistantId(), name: "Atomic assistant", scope: "project", projectId: project.id,
    description: "Test atomic operations", personalityPrompt: "Be precise.", jobPrompt: "Verify atomicity.", agentId: "pi",
    runState: "active", bootstrapState: "pending", failureStreakCount: 0, circuitBreakerState: "closed",
    latestActivityAt: now, unreadQuestionCount: 0, createdAt: now, updatedAt: now, ...overrides });
}

function createDeferredAdapter() {
  const calls: PiAgentPromptRequest[] = []; const resolvers: Array<(result: PiAgentPromptResult) => void> = [];
  const rejectors: Array<(error: Error) => void> = [];
  const adapter: PiAgentAdapter = { runPrompt(request) { calls.push(request);
      return new Promise<PiAgentPromptResult>((resolve, reject) => { resolvers.push(resolve); rejectors.push(reject); }); },
    async startExecution(): Promise<PiAgentExecutionController> { throw new Error("not used"); },
    setApiKey() {}, hasApiKey() { return true; } };
  return Object.assign(adapter, { calls, resolvers, rejectors });
}

function createManager(repository: WorkspaceRepository, adapter: PiAgentAdapter,
  callbacks: Partial<Parameters<typeof createAssistantManager>[2]> = {}) {
  const capability: AgentRuntimeCapability = { agentId: "pi", label: "Pi", runtimeKind: "sdk", installed: true,
    authenticated: true, supportsProgrammatic: true, supportsInteractive: false, interactivePipeCompatible: false,
    supportsPlanning: true, supportsReview: true, supportsReasoningStrengthControl: false, supportsFastModeControl: true,
    discoveredModels: ["openai/gpt-5.4"], modelDiscoveryConfidence: "exact" };
  const runtime: AgentRuntime = { id: "pi", label: "Pi", getAdapter: () => adapter, getCapability: () => capability,
    refreshCapability: async () => capability, getDefaultPlanningModelId: (_brand: ProviderBrand) => "openai/gpt-5.4",
    getDefaultExecutionModelId: (_brand: ProviderBrand) => "openai/gpt-5.4",
    getDefaultSubagentModelId: (_brand: ProviderBrand) => "openai/gpt-5.4" };
  return createAssistantManager(repository, createAgentRuntimeRegistry([runtime]), { onAssistantsUpdated() {},
    onAssistantDetailsChanged() {}, onAssistantChatDelta() {}, onAssistantChatMessageAppended() {},
    onAssistantChatComplete() {}, onAssistantChatFailed() {}, onAssistantLogAppended() {}, onAssistantCreatedCard() {}, ...callbacks },
  { reprioritizeDebounceMs: 0 });
}

async function waitForCalls(adapter: ReturnType<typeof createDeferredAdapter>, count: number) {
  for (let index = 0; index < 100 && adapter.calls.length < count; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 100 && !predicate(); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("assistant manager atomic ownership", () => {
  test("queued bootstrap joins once and never drops launch or terminal persistence rejection", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const adapter = createDeferredAdapter();
    const changed: string[][] = []; const manager = createManager(repository, adapter,
      { onAssistantDetailsChanged: (ids) => changed.push(ids) });
    const start = repository.startAssistantBootstrapAttempt.bind(repository);
    Object.defineProperty(repository, "startAssistantBootstrapAttempt", { configurable: true,
      value: () => { throw new Error("start persistence failed"); } });
    manager.queueAssistantBootstrap(assistant.id); manager.queueAssistantBootstrap(assistant.id);
    await waitForCondition(() => repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Bootstrap launch failed"));
    expect(repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Bootstrap launch failed")).toHaveLength(1);
    expect(changed).toEqual([[assistant.id]]);
    Object.defineProperty(repository, "startAssistantBootstrapAttempt", { configurable: true, value: start });
    const apply = repository.applyAssistantBootstrapTransition.bind(repository); let rejects = 2;
    Object.defineProperty(repository, "applyAssistantBootstrapTransition", { configurable: true,
      value: (input: Parameters<WorkspaceRepository["applyAssistantBootstrapTransition"]>[0]) => {
        if (rejects-- > 0) throw new Error("terminal persistence failed"); return apply(input); } });
    manager.queueAssistantBootstrap(assistant.id, { force: true, offerJobBootstrapAfterSuccess: true });
    await waitForCalls(adapter, 1); adapter.resolvers[0]?.({ text: JSON.stringify({ initialTodos: [], remainIdle: true }) });
    await waitForCondition(() => repository.getAssistant(assistant.id)?.bootstrapState === "failed");
    expect(repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Bootstrap failed")).toHaveLength(1);
    expect(changed).toEqual([[assistant.id], [assistant.id]]);
    Object.defineProperty(repository, "applyAssistantBootstrapTransition", { configurable: true, value: apply });
    manager.queueAssistantBootstrap(assistant.id, { force: true, offerJobBootstrapAfterSuccess: true });
    await waitForCalls(adapter, 2); adapter.resolvers[1]?.({ text: JSON.stringify({ initialTodos: [], remainIdle: true }) });
    await waitForCondition(() => repository.getAssistantQuestions(assistant.id)
      .some((question) => question.id.startsWith("assistant-job-bootstrap:")));
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("completed");
  });

  test("commits bootstrap fallback audit and rejects a foreign child before state mutation", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, {
      executionModelId: "openai/retired-model", providerBrand: "gemini" }); const adapter = createDeferredAdapter();
    const manager = createManager(repository, adapter); const flight = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1); adapter.resolvers[0]?.({ text: JSON.stringify({ initialTodos: [], remainIdle: true }) });
    await flight; expect(repository.getAssistantLogEntries(assistant.id).map((entry) => entry.summary))
      .toContain("Assistant model fallback");

    const other = createAssistant(repository); const now = new Date().toISOString();
    const started = repository.startAssistantBootstrapAttempt(other.id, "owner-check", now,
      { id: createAssistantLogEntryId(), assistantId: other.id, level: "info", summary: "Bootstrap started", createdAt: now })!;
    expect(() => repository.applyAssistantBootstrapTransition({ assistantId: other.id, expectedAttemptId: "owner-check",
      expectedMutationRevision: started.mutationRevision, state: "completed", finishedAt: now, learnings: [],
      todos: [{ id: createAssistantTodoId(), assistantId: assistant.id, title: "Foreign", state: "pending", sortOrder: 0,
        source: "bootstrap", workKind: "unspecified", createdAt: now, updatedAt: now }], logEntry: { id: createAssistantLogEntryId(),
        assistantId: other.id, level: "info", summary: "Bootstrap completed", createdAt: now } })).toThrow("does not belong");
    expect(repository.getAssistant(other.id)?.bootstrapState).toBe("running");
  });

  test("rolls stale recovery back atomically and dedupes retry state", () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "running",
      bootstrapAttemptId: "stale", bootstrapStartedAt: new Date(0).toISOString() }); const manager = createManager(repository,
      createDeferredAdapter());
    repository.saveAssistantQuestion({ id: `unrelated-${crypto.randomUUID()}`, assistantId: assistant.id,
      prompt: "An unrelated pending decision", status: "pending", askedAt: new Date().toISOString() });
    const db = new Database(repository.getDatabasePath(), { strict: true });
    db.exec(`CREATE TRIGGER reject_stale BEFORE INSERT ON assistant_log_entries WHEN NEW.summary = 'Bootstrap stale'
      BEGIN SELECT RAISE(ABORT, 'stale recovery failed'); END;`); db.close(false);
    expect(() => manager.recoverStaleBootstrapRuns(0)).toThrow("stale recovery failed");
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("running");
    expect(repository.getAssistantQuestions(assistant.id).map((question) => question.prompt)).toEqual(["An unrelated pending decision"]);
    const retryDb = new Database(repository.getDatabasePath(), { strict: true }); retryDb.exec("DROP TRIGGER reject_stale"); retryDb.close(false);
    manager.recoverStaleBootstrapRuns(0); manager.recoverStaleBootstrapRuns(0);
    expect(repository.getAssistantQuestions(assistant.id)).toHaveLength(2);
    expect(repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Bootstrap stale")).toHaveLength(1);
  });

  test("rejects foreign reprioritize and compaction children without writes", () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const other = createAssistant(repository);
    const now = new Date().toISOString(); const revision = repository.getAssistantReprioritizeSnapshot(assistant.id).mutationRevision;
    expect(() => repository.applyAssistantReprioritizeMutation(assistant.id, { expectedMutationRevision: revision,
      todoUpdates: [], newTodos: [{ id: createAssistantTodoId(), assistantId: other.id, title: "Foreign", state: "pending",
        sortOrder: 0, source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now }], learnings: [], questions: [], logs: [] }))
      .toThrow("does not belong");
    expect(() => repository.compactAssistantLearningsWithRetained({ assistantId: assistant.id,
      expectedMutationRevision: revision, compactedLearning: { id: createAssistantLearningId(), assistantId: other.id,
        summary: "Foreign", source: "compaction:test", confidence: "high", kind: "summary", createdAt: now,
        compactedAt: now }, supersededIds: [], retainedLearnings: [], logEntry: { id: createAssistantLogEntryId(),
        assistantId: assistant.id, level: "info", summary: "Compacted assistant learnings", createdAt: now } }))
      .toThrow("does not belong");
    expect(repository.getAssistantTodos(other.id)).toHaveLength(0); expect(repository.getAssistantLearnings(other.id)).toHaveLength(0);
  });

  test("validates reprioritize question links against persisted and newly-owned todos before writes", () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const other = createAssistant(repository);
    const now = new Date().toISOString(); const foreignTodo = repository.saveAssistantTodo({ id: createAssistantTodoId(),
      assistantId: other.id, title: "Foreign", state: "pending", sortOrder: 0, source: "user", workKind: "unspecified",
      createdAt: now, updatedAt: now }); const revision = repository.getAssistantReprioritizeSnapshot(assistant.id).mutationRevision;
    const invalidQuestion = { id: createAssistantQuestionId(), assistantId: assistant.id, prompt: "Use it?", status: "pending" as const,
      linkedTodoIds: [foreignTodo.id], askedAt: now };
    expect(() => repository.applyAssistantReprioritizeMutation(assistant.id, { expectedMutationRevision: revision,
      todoUpdates: [], newTodos: [], learnings: [{ id: createAssistantLearningId(), assistantId: assistant.id,
        summary: "Must roll back", source: "test", confidence: "low", createdAt: now }], questions: [invalidQuestion], logs: [] }))
      .toThrow("links unknown assistant todo");
    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(0);
    invalidQuestion.linkedTodoIds = [`missing-${crypto.randomUUID()}`];
    expect(() => repository.applyAssistantReprioritizeMutation(assistant.id, { expectedMutationRevision: revision,
      todoUpdates: [], newTodos: [], learnings: [], questions: [invalidQuestion], logs: [] })).toThrow("links unknown assistant todo");
    const newTodo = { id: createAssistantTodoId(), assistantId: assistant.id, title: "Owned", state: "pending" as const,
      sortOrder: 0, source: "assistant" as const, workKind: "unspecified" as const, createdAt: now, updatedAt: now };
    invalidQuestion.linkedTodoIds = [newTodo.id];
    repository.applyAssistantReprioritizeMutation(assistant.id, { expectedMutationRevision: revision, todoUpdates: [],
      newTodos: [newTodo], learnings: [], questions: [invalidQuestion], logs: [] });
    expect(repository.getAssistantQuestion(invalidQuestion.id)?.linkedTodoIds).toEqual([newTodo.id]);
  });

  test("maintenance paging reaches assistants beyond the bounded summary snapshot", () => {
    const repository = createRepository(); const old = new Date(0).toISOString();
    const stale = createAssistant(repository, { name: "Ångström recovery", bootstrapState: "running",
      bootstrapAttemptId: "old-attempt", bootstrapStartedAt: old, createdAt: old, updatedAt: old });
    const idle = createAssistant(repository, { bootstrapState: "completed", createdAt: old, updatedAt: old });
    const cleanup = createAssistant(repository, { runState: "paused", createdAt: old, updatedAt: old });
    repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: cleanup.id,
      prompt: "What gameplay feel do you prefer?", status: "answered", answerText: "Use your best judgement.", askedAt: old, answeredAt: old });
    const duplicate = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: cleanup.id,
      prompt: "What gameplay feel should I choose?", status: "pending", askedAt: old });
    const corruptId = "0".repeat(129);
    repository.saveAssistant({ ...stale, id: corruptId, name: "ÅNGSTRÖM RECOVERY", runState: "paused",
      bootstrapState: "completed", bootstrapAttemptId: undefined, bootstrapStartedAt: undefined });
    for (let index = 0; index < 513; index += 1) repository.saveAssistant({ ...stale, id: createAssistantId(),
      name: `Newer filler ${index}`, runState: "paused", bootstrapState: "completed", bootstrapAttemptId: undefined,
      bootstrapStartedAt: undefined, createdAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString(),
      updatedAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString() });
    expect(repository.loadAssistantsState().assistants.some((entry) => entry.id === stale.id)).toBe(false);
    const action = resolvePersistedAssistantChatAction({ content: "resume ångström recovery",
      projectId: stale.projectId!, repository });
    expect(action.kind === "execute" ? action.action.assistant.id : undefined).toBe(stale.id);
    let cursor: string | undefined; let pageCount = 0; const maintenanceIds: string[] = [];
    do { const page = repository.listAssistantMaintenancePage({ afterId: cursor }); pageCount += 1;
      maintenanceIds.push(...page.items.map((entry) => entry.id)); cursor = page.nextCursor; } while (cursor !== undefined);
    expect(pageCount).toBeGreaterThan(4); expect(maintenanceIds).toContain(stale.id); expect(maintenanceIds).not.toContain(corruptId);
    expect(repository.findAssistantByIntentIdentity(stale.projectId!, "ångström recovery", "project")?.id).toBe(stale.id);
    const manager = createManager(repository, createDeferredAdapter()); manager.recoverStaleBootstrapRuns(0);
    expect(manager.cleanupStaleAssistantQuestions()).toBe(1);
    manager.recoverIdleJobBootstrapChecks(new Date(Date.now() + 1200000));
    expect(repository.getAssistant(stale.id)?.bootstrapState).toBe("failed");
    expect(repository.getAssistantQuestions(idle.id).some((question) => question.id.startsWith("assistant-job-bootstrap:"))).toBe(true);
    expect(repository.getAssistantQuestion(duplicate.id)?.status).toBe("dismissed");
  });

  test("captures every active learning in the atomic compaction eligibility snapshot", () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const db = new Database(repository.getDatabasePath(), { strict: true });
    const insert = db.query(`INSERT INTO assistant_learnings
      (id, assistant_id, summary, source, confidence, sort_order, created_at, kind, supersedes_learning_ids_json, compacted_at)
      VALUES (?1, ?2, ?3, 'snapshot-test', 'low', NULL, ?4, 'fact', NULL, NULL)`);
    db.transaction(() => { for (let index = 0; index < 513; index += 1) insert.run(
      createAssistantLearningId(), assistant.id, `Exact snapshot fact ${index}`, new Date().toISOString()); }).immediate(); db.close(false);
    expect(repository.getAssistantLearningCompactionSnapshot(assistant.id).learnings).toHaveLength(513);
  });

  test("persists model fallback and compaction failure together after invalid provider output", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed",
      executionModelId: "openai/retired-model", providerBrand: "gemini" }); const adapter = createDeferredAdapter();
    const manager = createManager(repository, adapter); const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) repository.saveAssistantLearning({ id: createAssistantLearningId(),
      assistantId: assistant.id, summary: `Fallback fact ${index}`, source: "test", confidence: "low", createdAt: now });
    const outcome = manager.handleBackgroundJobRunOutcome({ assistantId: assistant.id, status: "succeeded", summary: "Trigger" });
    await waitForCalls(adapter, 1); adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated" }) });
    await waitForCalls(adapter, 2); adapter.resolvers[1]?.({ text: "invalid" });
    await waitForCalls(adapter, 3); adapter.resolvers[2]?.({ text: JSON.stringify({ retainedFacts: [] }) }); await outcome;
    await waitForCondition(() => repository.getAssistantLogEntries(assistant.id)
      .some((entry) => entry.summary === "Assistant learning compaction skipped"));
    const summaries = repository.getAssistantLogEntries(assistant.id).map((entry) => entry.summary);
    expect(summaries.filter((summary) => summary === "Assistant model fallback")).toHaveLength(2);
    expect(summaries).toContain("Assistant learning compaction skipped");
    expect(repository.getAssistantLearningStats(assistant.id).activeFactLearningCount).toBe(41);
  });

  test("compaction failure audit rolls back on write failure and rejects stale ordinary failures", () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const now = new Date().toISOString();
    const revision = repository.getAssistantLearningCompactionSnapshot(assistant.id).mutationRevision;
    const write = { assistantId: assistant.id, expectedMutationRevision: revision,
      fallbackLogEntry: { id: createAssistantLogEntryId(), assistantId: assistant.id, level: "warning" as const,
        summary: "Assistant model fallback", createdAt: now }, failureLogEntry: { id: createAssistantLogEntryId(),
        assistantId: assistant.id, level: "warning" as const, summary: "Assistant learning compaction skipped", createdAt: now } };
    const db = new Database(repository.getDatabasePath(), { strict: true }); db.exec(`CREATE TRIGGER reject_compaction_failure
      BEFORE INSERT ON assistant_log_entries WHEN NEW.summary = 'Assistant learning compaction skipped'
      BEGIN SELECT RAISE(ABORT, 'failure audit rejected'); END;`); db.close(false);
    expect(() => repository.recordAssistantLearningCompactionFailure(write)).toThrow("failure audit rejected");
    expect(repository.getAssistantLogEntries(assistant.id)).toHaveLength(0);
    const cleanupDb = new Database(repository.getDatabasePath(), { strict: true });
    cleanupDb.exec("DROP TRIGGER reject_compaction_failure"); cleanupDb.close(false);
    repository.saveAssistantLearning({ id: createAssistantLearningId(), assistantId: assistant.id, summary: "Concurrent fact",
      source: "test", confidence: "low", createdAt: now });
    expect(repository.recordAssistantLearningCompactionFailure({ ...write, fallbackLogEntry: undefined })).toBeUndefined();
    expect(repository.getAssistantLogEntries(assistant.id)).toHaveLength(0);
  });

  test("aborts invalidated chat, including its owned summarization, without late publication", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    for (let index = 0; index < 120; index += 1) repository.appendAssistantMessage(assistant.id, "user", `Context ${index}`);
    const adapter = createDeferredAdapter(); const events: string[] = []; const manager = createManager(repository, adapter,
      { onAssistantChatDelta: ({ delta }) => events.push(delta), onAssistantChatComplete: () => events.push("complete") });
    const sent = manager.sendAssistantChat(assistant.id, "Safe cancellation"); await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: "Response before summary" }); await waitForCalls(adapter, 2); manager.invalidateAssistant(assistant.id);
    expect(adapter.calls[1]?.abortSignal?.aborted).toBe(true); adapter.calls[1]?.onTextDelta?.("late");
    adapter.resolvers[1]?.({ text: "Late summary" }); await sent;
    expect(repository.getAssistantThread(assistant.id).memorySummary).toBeUndefined(); expect(events).toEqual([]);
    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Chat response completed")).toBe(false);
  });

  test("publishes chat failure only for the current owned flight", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = createDeferredAdapter(); const failed: string[] = []; const manager = createManager(repository, adapter,
      { onAssistantChatFailed: ({ sessionId }) => failed.push(sessionId) });
    const stale = manager.sendAssistantChat(assistant.id, "First"); await waitForCalls(adapter, 1);
    const current = manager.sendAssistantChat(assistant.id, "Second"); await waitForCalls(adapter, 2);
    adapter.rejectors[0]?.(new Error("aborted stale failure")); await stale; expect(failed).toEqual([]);
    adapter.rejectors[1]?.(new Error("owned provider failure")); await expect(current).rejects.toThrow("owned provider failure");
    expect(failed).toEqual([repository.getAssistantThread(assistant.id).sessionId]);
  });

  test("global resume bootstrap discovery reaches every valid pending assistant", () => {
    const repository = createRepository(); const expectedIds = new Set<string>();
    for (let index = 0; index < 514; index += 1) expectedIds.add(createAssistant(repository, { name: `Pending ${index}` }).id);
    const template = repository.getAssistant([...expectedIds][0]!)!;
    repository.saveAssistant({ ...template, id: "x".repeat(129), name: "Corrupt pending identity" });
    const discovered = repository.getAssistantsAwaitingBootstrap();
    expect(discovered).toHaveLength(514);
    expect(new Set(discovered.map((assistant) => assistant.id))).toEqual(expectedIds);
  });

  test("replacement invalidates a stale chat before its response commit", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = createDeferredAdapter(); const completed: string[] = []; const manager = createManager(repository, adapter,
      { onAssistantChatComplete: ({ assistantMessage }) => completed.push(assistantMessage.content) });
    const first = manager.sendAssistantChat(assistant.id, "First request"); await waitForCalls(adapter, 1);
    const appendIfCurrent = repository.appendAssistantMessageIfLatest.bind(repository); let replacement: Promise<void> | undefined;
    Object.defineProperty(repository, "appendAssistantMessageIfLatest", { configurable: true,
      value: (...args: Parameters<WorkspaceRepository["appendAssistantMessageIfLatest"]>) => {
        replacement ??= manager.sendAssistantChat(assistant.id, "Replacement request");
        return appendIfCurrent(...args);
      } });
    adapter.resolvers[0]?.({ text: "Stale response" }); await first; await waitForCalls(adapter, 2);
    Object.defineProperty(repository, "appendAssistantMessageIfLatest", { configurable: true, value: appendIfCurrent });
    adapter.resolvers[1]?.({ text: "Current response" }); await replacement;
    expect(repository.getAssistantThread(assistant.id).messages.map((message) => `${message.role}:${message.content}`))
      .toEqual(["user:First request", "user:Replacement request", "assistant:Current response"]);
    expect(completed).toEqual(["Current response"]);
  });

  test("concurrent failure recording preserves every increment and trip decision", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const secondConnection = createWorkspaceRepository(repository.getDatabasePath(), process.cwd(), { durability: "test-fast" });
    const failures = await Promise.all([
      Promise.resolve().then(() => repository.recordAssistantFailure(assistant.id, "first")),
      Promise.resolve().then(() => secondConnection.recordAssistantFailure(assistant.id, "second")),
      Promise.resolve().then(() => repository.recordAssistantFailure(assistant.id, "third"))
    ]);
    expect(failures.map((failure) => failure?.failureStreakCount).sort((left, right) => (left ?? 0) - (right ?? 0)))
      .toEqual([1, 2, 3]);
    expect(failures.filter((failure) => failure?.shouldTrip)).toHaveLength(1);
    expect(repository.getAssistant(assistant.id)).toMatchObject({ failureStreakCount: 3,
      circuitBreakerState: "tripped", runState: "paused" });
  });

  test("assistant action follow-ups resolve typed assistant, job, question, and todo candidates", () => {
    const repository = createRepository(); const first = createAssistant(repository, { name: "Release alpha", bootstrapState: "completed" });
    const second = repository.saveAssistant({ ...first, id: createAssistantId(), name: "Release beta" });
    const chooseAssistant = resolvePersistedAssistantChatAction({ content: "resume Release", projectId: first.projectId!, repository });
    expect(chooseAssistant.kind).toBe("clarify");
    if (chooseAssistant.kind !== "clarify") throw new Error("Expected assistant clarification");
    const assistantByName = resolvePersistedAssistantChatAction({ content: second.name, projectId: first.projectId!, repository,
      priorIntent: chooseAssistant.intent });
    expect(assistantByName.kind === "execute" ? assistantByName.action.assistant.id : undefined).toBe(second.id);

    const project = repository.getProject(first.projectId!); const now = new Date().toISOString();
    const jobs: BackgroundJob[] = ["Nightly audit", "Release audit"].map((name) => ({ id: crypto.randomUUID(),
      projectId: first.projectId!, assistantId: first.id, automationThreadId: project.activeThreadId, kind: "ai-routine" as const,
      name, status: "enabled", riskLevel: "safe", definition: { kind: "ai-routine", prompt: name },
      schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: now, sourceText: "hour" }, scheduleInput: "hour",
      createdAt: now, updatedAt: now }));
    for (const job of jobs) repository.saveBackgroundJob(job);
    const chooseJob = resolvePersistedAssistantChatAction({ content: `run ${first.name} job now`, projectId: first.projectId!, repository });
    expect(chooseJob.kind).toBe("clarify"); if (chooseJob.kind !== "clarify") throw new Error("Expected job clarification");
    const jobByName = resolvePersistedAssistantChatAction({ content: jobs[1]!.name, projectId: first.projectId!, repository,
      priorIntent: chooseJob.intent });
    expect(jobByName.kind === "execute" ? jobByName.action.jobId : undefined).toBe(jobs[1]!.id);

    const questions = ["Ship release?", "Publish notes?"].map((prompt) => repository.saveAssistantQuestion({
      id: createAssistantQuestionId(), assistantId: first.id, prompt, status: "pending", askedAt: now }));
    const chooseQuestion = resolvePersistedAssistantChatAction({ content: `answer ${first.name}'s question: yes`,
      projectId: first.projectId!, repository });
    expect(chooseQuestion.kind).toBe("clarify"); if (chooseQuestion.kind !== "clarify") throw new Error("Expected question clarification");
    const questionById = resolvePersistedAssistantChatAction({ content: questions[1]!.id, projectId: first.projectId!, repository,
      priorIntent: chooseQuestion.intent });
    expect(questionById.kind === "execute" ? questionById.action.questionId : undefined).toBe(questions[1]!.id);
    expect(questionById.kind === "execute" ? questionById.action.answerText : undefined).toBe("yes");

    const todos = ["Check changelog", "Check release notes"].map((title, index) => repository.saveAssistantTodo({
      id: createAssistantTodoId(), assistantId: first.id, title, state: "pending", sortOrder: index,
      source: "user", workKind: "documentation", createdAt: now, updatedAt: now }));
    const chooseTodo = resolvePersistedAssistantChatAction({ content: `mark ${first.name} todo "Check" done`,
      projectId: first.projectId!, repository });
    expect(chooseTodo.kind).toBe("clarify"); if (chooseTodo.kind !== "clarify") throw new Error("Expected todo clarification");
    const todoByTitle = resolvePersistedAssistantChatAction({ content: todos[1]!.title, projectId: first.projectId!, repository,
      priorIntent: chooseTodo.intent });
    expect(todoByTitle.kind === "execute" ? todoByTitle.action.todoId : undefined).toBe(todos[1]!.id);
  });

  test("chat latest-message CAS tolerates corrupt rows and counts beyond the presentation boundary", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const now = new Date().toISOString();
    const thread = repository.getAssistantThread(assistant.id); const db = new Database(repository.getDatabasePath(), { strict: true });
    db.query(`WITH RECURSIVE sequence(value) AS (SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value < 100000)
      INSERT INTO assistant_messages (id, assistant_thread_id, role, kind, content, metadata_json, created_at)
      SELECT 'bulk-' || value, ?1, 'user', 'plain', 'old', NULL, ?2 FROM sequence`).run(thread.id, now);
    db.query(`INSERT INTO assistant_messages (id, assistant_thread_id, role, kind, content, metadata_json, created_at)
      VALUES (?1, ?2, 'user', 'plain', 'old', NULL, ?3)`).run("x".repeat(129), thread.id, now); db.close(false);
    const adapter = createDeferredAdapter(); const completed: string[] = []; const manager = createManager(repository, adapter,
      { onAssistantChatComplete: ({ assistantMessage }) => completed.push(assistantMessage.content) });
    const sent = manager.sendAssistantChat(assistant.id, "Boundary request"); await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: "Boundary response" }); await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: "Boundary summary" }); await sent;
    expect(completed).toEqual(["Boundary response"]);
    expect(repository.getAssistantThread(assistant.id).messages.at(-1)?.content).toBe("Boundary response");
  });

  test("owned chat CAS conflicts clear the active streaming lifecycle", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = createDeferredAdapter(); const failed: string[] = []; const manager = createManager(repository, adapter,
      { onAssistantChatFailed: ({ sessionId }) => failed.push(sessionId) });
    Object.defineProperty(repository, "appendAssistantMessageIfLatest", { configurable: true, value: () => undefined });
    const sent = manager.sendAssistantChat(assistant.id, "Conflicted request"); await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: "Suppressed" }); await sent;
    expect(failed).toEqual([repository.getAssistantThread(assistant.id).sessionId]);
  });

  test("exact assistant summary deltas include assistants beyond the initial roster page", () => {
    const repository = createRepository(); const old = new Date(0).toISOString();
    const tail = createAssistant(repository, { name: "Tail target", createdAt: old, updatedAt: old });
    for (let index = 0; index < 513; index += 1) createAssistant(repository, { name: `New ${index}` });
    expect(repository.loadAssistantSummaryState().assistants.some((assistant) => assistant.id === tail.id)).toBe(false);
    repository.setAssistantRunState(tail.id, "paused");
    expect(repository.loadAssistantSummaryDelta([tail.id]).assistants).toEqual([
      expect.objectContaining({ id: tail.id, runState: "paused" })
    ]);
    expect(repository.loadAssistantSummaryDelta([]).assistants).toEqual([]);
  });

  test("atomic blocking-question creation admits one valid pending question and notification", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const now = new Date().toISOString();
    const questions = ["First decision", "Second decision"].map((prompt) => ({ id: createAssistantQuestionId(),
      assistantId: assistant.id, prompt, status: "pending" as const, askedAt: now }));
    const saved = await Promise.all(questions.map(async (question) => repository.saveAssistantQuestionIfNoPending(question)));
    expect(saved.filter((result) => result.kind === "created")).toHaveLength(1);
    expect(saved.filter((result) => result.kind === "already-pending")).toHaveLength(1);
    expect(repository.getAssistantQuestions(assistant.id).filter((question) => question.status === "pending")).toHaveLength(1);
    expect(repository.loadNotificationInboxState().items.filter((item) => item.kind === "assistant-question")).toHaveLength(1);
  });

  test("atomic todo append derives distinct valid sort orders", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const now = new Date().toISOString();
    const todos = ["Recover first", "Recover second"].map((title) => ({ id: createAssistantTodoId(), assistantId: assistant.id,
      title, state: "pending" as const, source: "assistant" as const, workKind: "unspecified" as const, createdAt: now, updatedAt: now }));
    await Promise.all(todos.map(async (todo) => repository.appendAssistantTodo(todo)));
    expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.sortOrder).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  test("learning dedup scans valid rows beyond the presentation boundary", () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const now = new Date().toISOString();
    const db = new Database(repository.getDatabasePath(), { strict: true }); db.query(`WITH RECURSIVE sequence(value) AS (
      SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value < 8192)
      INSERT INTO assistant_learnings (id, assistant_id, summary, source, confidence, sort_order, created_at)
      SELECT 'learning-' || value, ?1, CASE WHEN value = 8192 THEN 'Durable boundary guidance' ELSE 'Filler ' || value END,
        'test', 'medium', value, ?2 FROM sequence`).run(assistant.id, now); db.close(false);
    const saved = repository.saveAssistantLearningDeduped({ id: createAssistantLearningId(), assistantId: assistant.id,
      summary: "Durable boundary guidance", source: "test", confidence: "medium", createdAt: now });
    expect(saved?.id).toBe("learning-8192");
  });

  test("an already-pending question is not audited as policy auto-resolution", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const now = new Date().toISOString();
    repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Existing decision", status: "pending", askedAt: now });
    const manager = createManager(repository, createDeferredAdapter());
    await manager.handleBackgroundJobRunOutcome({ assistantId: assistant.id, status: "awaiting-user-input",
      failureMessage: "Choose the release lane?", summary: "Waiting" });
    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Assistant job input auto-resolved")).toBe(false);
  });
});
