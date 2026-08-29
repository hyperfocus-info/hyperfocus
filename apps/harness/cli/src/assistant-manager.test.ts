import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantLearningId,
  createAssistantLogEntryId,
  createBackgroundJobId,
  createThreadId,
  createAssistantQuestionId,
  createAssistantTodoId,
  type AgentRuntimeCapability, type Assistant, type AssistantLearning, type ProviderBrand
} from "@hyperfocus/ai-core/protocol";
import type { AgentRuntime } from "./agent-runtimes/agent-runtime";
import { createAgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { createAssistantManager, renderAssistantPromptMemoryBlock, selectAssistantPromptLearnings, selectAssistantPromptQuestions } from "./assistant-manager";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import { DEFAULT_CODING_STACK_GUIDANCE } from "./prompts/coding-stack-defaults";
import { resolveHarnessTestTempRoot } from "./test-support/test-temp-root";
import { createWorkspaceRepository, type WorkspaceRepository, type AssistantQuestionAnswerWrite } from "./workspace-repository";
function createTempDir() {
  return resolveHarnessTestTempRoot();
}

function createRepository() {
  return createWorkspaceRepository(path.join(createTempDir(), `assistant-manager-${crypto.randomUUID()}.sqlite`), process.cwd(),
    { durability: "test-fast" });
}

function createAssistant(repository: WorkspaceRepository, overrides: Partial<Assistant> = {}) {
  const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`); mkdirSync(projectRoot, { recursive: true });
  const project = repository.addProject(projectRoot);
  const now = new Date().toISOString();
  return repository.saveAssistant({ id: createAssistantId(), name: "Bootstrap tester", scope: "project", projectId: project.id,
    description: "Test assistant", personalityPrompt: "Be concise.", jobPrompt: "Test bootstrap.", agentId: "pi",
    runState: "active", bootstrapState: "pending", failureStreakCount: 0, circuitBreakerState: "closed",
    latestActivityAt: now, unreadQuestionCount: 0, createdAt: now, updatedAt: now, ...overrides });
}

function createDeferredAdapter() {
  const calls: PiAgentPromptRequest[] = [];
  const resolvers: Array<(result: PiAgentPromptResult) => void> = [];
  const adapter: PiAgentAdapter = { runPrompt(request) { calls.push(request);
      return new Promise<PiAgentPromptResult>((resolve) => resolvers.push(resolve)); },
    async startExecution(): Promise<PiAgentExecutionController> { throw new Error("not used"); }, setApiKey() {}, hasApiKey() { return true; } };
  return Object.assign(adapter, { calls, resolvers });
}
type DeferredAdapter = ReturnType<typeof createDeferredAdapter>;
const DeferredAdapter = createDeferredAdapter;

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
  return createAssistantManager(repository, createAgentRuntimeRegistry([runtime]), { onAssistantsUpdated() {}, onAssistantDetailsChanged() {},
    onAssistantChatDelta() {}, onAssistantChatMessageAppended() {}, onAssistantChatComplete() {}, onAssistantChatFailed() {}, onAssistantLogAppended() {},
    onAssistantCreatedCard() {}, ...callbacks }, { reprioritizeDebounceMs: 0 });
}

async function waitForCondition(predicate: () => boolean) {
  for (let index = 0; index < 100 && !predicate(); index += 1) await new Promise((resolve) => setTimeout(resolve, 20));
}
async function waitForCalls(adapter: DeferredAdapter, count: number) { await waitForCondition(() => adapter.calls.length >= count); }

function bootstrapResult(title: string) {
  return {
    text: JSON.stringify({
      researchSummary: title,
      initialTodos: [{ title, workKind: "app-code", workTarget: "src/app.ts" }],
      remainIdle: true
    })
  };
}

function createQuestionAnswerWrite(
  assistantId: string,
  questionId: string,
  answerText: string,
  createdAt: string = new Date().toISOString()
): AssistantQuestionAnswerWrite {
  return {
    questionId,
    answerText,
    logEntry: { id: createAssistantLogEntryId(), assistantId, level: "info", summary: "Question answered", createdAt },
    guidanceLearning: { id: createAssistantLearningId(), assistantId, summary: `Guidance: ${answerText}`,
      source: `question:${questionId}`, confidence: "high", createdAt }
  };
}

describe("assistant manager bootstrap", () => {
  test("joins duplicate bootstrap attempts while one is running", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const first = manager.bootstrapAssistant(assistant.id);
    const second = manager.bootstrapAssistant(assistant.id);
    expect(first).toBe(second);
    await waitForCalls(adapter, 1);
    expect(adapter.calls).toHaveLength(1);

    adapter.resolvers[0]?.(bootstrapResult("Initial todo"));
    await first;

    expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.title)).toEqual(["Initial todo"]);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("completed");
  });

  test("bootstrap saves todo work metadata and asks default stack once before first coding todo", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { jobPrompt: "Build a TypeScript app." });
    const adapter = DeferredAdapter();
    const changed: string[][] = [];
    const manager = createManager(repository, adapter, { onAssistantDetailsChanged(ids) { changed.push(ids); } });

    const bootstrapped = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1);
    expect(adapter.calls[0]?.prompt).toContain(DEFAULT_CODING_STACK_GUIDANCE);
    expect(adapter.calls[0]?.prompt).not.toContain("SolidJS + Tailwind");
    adapter.resolvers[0]?.(bootstrapResult("Implement first screen"));
    await bootstrapped;

    const todos = repository.getAssistantTodos(assistant.id);
    expect(todos[0]?.workKind).toBe("app-code");
    expect(todos[0]?.workTarget).toBe("src/app.ts");
    const stackQuestions = repository
      .getAssistantQuestions(assistant.id)
      .filter((question) => question.prompt.includes("Recommended default: TypeScript, Bun runtime"));
    expect(stackQuestions).toHaveLength(1);
    expect(stackQuestions[0]?.prompt).toContain("SolidJS + StyleX");
    expect(stackQuestions[0]?.prompt).toContain("documentation comments for new functions and variables");

    const retried = manager.retryBootstrap(assistant.id);
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.(bootstrapResult("Implement second screen"));
    await retried;
    expect(
      repository
        .getAssistantQuestions(assistant.id)
        .filter((question) => question.prompt.includes("Recommended default: TypeScript, Bun runtime"))
    ).toHaveLength(1);
    expect(changed).toContainEqual([assistant.id]);
  });

  test("repairs invalid bootstrap proposal JSON once before persisting canonical output", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { executionModelId: "openai/retired-model", providerBrand: "gemini" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const bootstrapped = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({
      text: JSON.stringify({
        initialTodos: [{ title: "x".repeat(800), workKind: "nonsense" }]
      })
    });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({
      text: JSON.stringify({
        researchSummary: "Recovered plan",
        initialTodos: [{ title: "Recovered todo", workKind: "documentation" }],
        remainIdle: true
      })
    });
    await bootstrapped;

    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[1]?.prompt).toContain("Previous response failed schema validation");
    expect(repository.getAssistantTodos(assistant.id).map((todo) => [todo.title, todo.workKind])).toEqual([
      ["Recovered todo", "documentation"]
    ]);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("completed");
  });

  test("fails bootstrap cleanly when proposal repair is still invalid", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { executionModelId: "openai/retired-model", providerBrand: "gemini" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const bootstrapped = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ initialTodos: [{ title: "Invalid", workKind: "bad-kind" }] }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: JSON.stringify({ initialTodos: [{ title: "Still invalid", workKind: "bad-kind" }] }) });
    await bootstrapped;

    expect(adapter.calls).toHaveLength(2);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("failed");
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Bootstrap failed")).toBe(true); expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Assistant model fallback")).toBe(true);
  });

  test("answering default stack question stores stack-preference learning", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { jobPrompt: "Build a TypeScript app." });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const bootstrapped = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.(bootstrapResult("Implement first screen"));
    await bootstrapped;
    const question = repository
      .getAssistantQuestions(assistant.id)
      .find((entry) => entry.prompt.includes("Recommended default: TypeScript, Bun runtime"));
    if (!question) {
      throw new Error("Expected stack question");
    }

    await manager.answerQuestion(assistant.id, question.id, "default", { reprioritize: false });

    expect(repository.getAssistantLearnings(assistant.id).some((learning) => learning.source === "stack-preference")).toBe(true);
  });

  test("falls back from stale assistant execution model", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      executionModelId: "openai/retired-model",
      providerBrand: "gemini",
      bootstrapState: "completed"
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const send = manager.sendAssistantChat(assistant.id, "hello");
    await waitForCalls(adapter, 1);
    expect(adapter.calls[0]?.modelId).toBe("openai/gpt-5.4");
    adapter.resolvers[0]?.({ text: "done" });
    await send;

    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Assistant model fallback")).toBe(true);
  });

  test("ignores stale bootstrap completion after force retry starts newer attempt", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const stale = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1);
    const current = manager.bootstrapAssistant(assistant.id, { force: true });
    await waitForCalls(adapter, 2);
    expect(adapter.calls).toHaveLength(2);

    adapter.resolvers[0]?.(bootstrapResult("Old todo"));
    await stale;
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("running");

    adapter.resolvers[1]?.(bootstrapResult("New todo"));
    await current;
    expect(repository.getAssistantTodos(assistant.id).map((todo) => todo.title)).toEqual(["New todo"]);
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("completed");
  });

  test("rejects an in-flight bootstrap result after profile mutation without clobbering the profile", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter); const flight = manager.bootstrapAssistant(assistant.id);
    await waitForCalls(adapter, 1);
    repository.saveAssistant({ ...repository.getAssistant(assistant.id)!, description: "Edited while bootstrapping" });
    adapter.resolvers[0]?.(bootstrapResult("Stale generated todo")); await flight;
    expect(repository.getAssistant(assistant.id)).toMatchObject({ description: "Edited while bootstrapping", bootstrapState: "failed" });
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(0);
  });

  test("preserves a local pause but allows an already-started bootstrap to finish across global pause", async () => {
    const repository = createRepository(); const local = createAssistant(repository); const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter); const localFlight = manager.bootstrapAssistant(local.id);
    await waitForCalls(adapter, 1); repository.setAssistantRunState(local.id, "paused");
    adapter.resolvers[0]?.(bootstrapResult("Must not commit")); await localFlight;
    expect(repository.getAssistant(local.id)).toMatchObject({ runState: "paused", bootstrapState: "failed" });
    expect(repository.getAssistantTodos(local.id)).toHaveLength(0);

    const global = createAssistant(repository); const globalFlight = manager.bootstrapAssistant(global.id);
    await waitForCalls(adapter, 2); repository.setGlobalExecutionPaused(true);
    adapter.resolvers[1]?.(bootstrapResult("Already started")); await globalFlight;
    expect(repository.getAssistant(global.id)?.bootstrapState).toBe("completed");
    expect(repository.getAssistantTodos(global.id).map((todo) => todo.title)).toEqual(["Already started"]);
  });

  test("rolls back every bootstrap child write when the completion transaction fails", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, {
      executionModelId: "openai/retired-model", providerBrand: "gemini" }); const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter); const db = new Database(repository.getDatabasePath(), { strict: true });
    db.exec(`CREATE TRIGGER reject_bootstrap_completion BEFORE INSERT ON assistant_log_entries
      WHEN NEW.summary = 'Bootstrap completed' BEGIN SELECT RAISE(ABORT, 'bootstrap commit failed'); END;`); db.close(false);
    const flight = manager.bootstrapAssistant(assistant.id); await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.(bootstrapResult("Atomic todo")); await flight;
    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("failed");
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0); expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Assistant model fallback")).toHaveLength(1);
  });

  test("recovers stale persisted running bootstrap as retryable failure", () => {
    const repository = createRepository();
    const oldStartedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const assistant = createAssistant(repository, {
      bootstrapState: "running",
      bootstrapAttemptId: "attempt-old",
      bootstrapStartedAt: oldStartedAt
    });
    const changed: string[][] = [];
    const manager = createManager(repository, DeferredAdapter(), { onAssistantDetailsChanged(ids) { changed.push(ids); } });

    manager.recoverStaleBootstrapRuns(30 * 60 * 1000);

    expect(repository.getAssistant(assistant.id)?.bootstrapState).toBe("failed");
    expect(changed).toEqual([[assistant.id]]);
    expect(repository.getAssistantQuestions(assistant.id)[0]?.prompt).toContain("interrupted or stalled");
  });

  test("asks to bootstrap jobs after idle assistant has no jobs", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      bootstrapState: "completed"
    });
    const changed: string[][] = [];
    const manager = createManager(repository, DeferredAdapter(), { onAssistantDetailsChanged(ids) { changed.push(ids); } });

    manager.recoverIdleJobBootstrapChecks();

    const questions = repository.getAssistantQuestions(assistant.id);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.id.startsWith("assistant-job-bootstrap:")).toBe(true);
    expect(changed).toEqual([[assistant.id]]);
    expect(questions[0]?.prompt).toContain("Bootstrap default research");
  });

  test("does not ask to bootstrap jobs when assistant already owns a job", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      bootstrapState: "completed"
    });
    const now = new Date().toISOString();
    repository.saveBackgroundJob({
      id: createBackgroundJobId(),
      projectId: assistant.projectId!,
      assistantId: assistant.id,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Existing job",
      status: "enabled",
      riskLevel: "safe",
      definition: { kind: "ai-routine", prompt: "Existing job" },
      schedule: { type: "one-off", runAt: now, sourceText: "now" },
      scheduleInput: "now",
      createdAt: now,
      updatedAt: now
    });
    const manager = createManager(repository, DeferredAdapter());

    manager.recoverIdleJobBootstrapChecks();

    expect(repository.getAssistantQuestions(assistant.id)).toHaveLength(0);
  });

  test("dedupes repeated idle job bootstrap checks", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      bootstrapState: "completed"
    });
    const manager = createManager(repository, DeferredAdapter());

    manager.recoverIdleJobBootstrapChecks();
    manager.recoverIdleJobBootstrapChecks();

    expect(repository.getAssistantQuestions(assistant.id)).toHaveLength(1);
  });

  test("dedupes job bootstrap checks after the bootstrap question leaves the bounded recent page", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      bootstrapState: "completed"
    });
    const manager = createManager(repository, DeferredAdapter());
    manager.recoverIdleJobBootstrapChecks();
    const bootstrapQuestion = repository.getAssistantQuestions(assistant.id)[0]!;
    repository.answerAssistantQuestion(assistant.id, bootstrapQuestion.id, "Not now");
    for (let index = 0; index < 512; index += 1) {
      repository.saveAssistantQuestion({
        id: createAssistantQuestionId(),
        assistantId: assistant.id,
        prompt: `Later question ${index}`,
        status: "answered",
        answerText: "Done",
        askedAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString(),
        answeredAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)).toISOString()
      });
    }

    manager.recoverIdleJobBootstrapChecks();

    expect(() => repository.dismissAssistantQuestion(assistant.id, bootstrapQuestion.id))
      .toThrow("Assistant question is not dismissable");
  });

  test("manual bootstrap retry asks about jobs immediately", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const bootstrapped = manager.retryBootstrap(assistant.id);
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.(bootstrapResult("Initial todo"));
    await bootstrapped;

    expect(repository.getAssistantQuestions(assistant.id).some((question) => question.id.startsWith("assistant-job-bootstrap:"))).toBe(true);
  });
});

describe("assistant manager chat", () => {
  test("emits persisted user message before assistant response events", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const events: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantChatMessageAppended(input) {
        events.push(`appended:${input.message.role}:${input.message.content}`);
      },
      onAssistantChatDelta(input) {
        events.push(`delta:${input.delta}`);
      },
      onAssistantChatComplete(input) {
        events.push(`complete:${input.assistantMessage.content}`);
      }
    });

    const sent = manager.sendAssistantChat(assistant.id, "Need status");
    await waitForCalls(adapter, 1);
    adapter.calls[0]?.onTextDelta?.("Working");
    adapter.resolvers[0]?.({ text: "Ready" });
    await sent;

    expect(events).toEqual(["appended:user:Need status", "delta:Working", "complete:Ready"]);
  });

  test("assistant chat prompt renders cleaned profile context", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed",
      description: "Tracks release risk.",
      personalityPrompt: "Be direct.",
      jobPrompt: "Watch release blockers."
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Prioritize smoke-test failures before polish.",
      source: "test",
      confidence: "high",
      createdAt: new Date().toISOString()
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const sent = manager.sendAssistantChat(assistant.id, "Need status");
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.prompt).toContain("# IDENTITY: Bootstrap tester");
    expect(adapter.calls[0]?.prompt).toContain("Personality: Be direct.");
    expect(adapter.calls[0]?.prompt).toContain("Description: Tracks release risk.");
    expect(adapter.calls[0]?.prompt).toContain("# OPERATIONAL LOGIC (The Job)\nWatch release blockers.");
    expect(adapter.calls[0]?.prompt).toContain("# ACTIVE MISSION (The Request)\nNeed status");
    expect(adapter.calls[0]?.prompt).toContain("invoke the assistant-actions skill before acting");
    expect(adapter.calls[0]?.prompt).not.toContain("Role:");
    expect(adapter.calls[0]?.prompt).not.toContain("First assistant message requirement:");
    expect(adapter.calls[0]?.prompt).not.toContain("Concise learnings report:");
    expect(adapter.calls[0]?.prompt).toContain("Prioritize smoke-test failures before polish.");

    adapter.resolvers[0]?.({ text: "Ready" });
    await sent;
  });

  test("project-chat routed assistant messages inherit assistant action guidance", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const sent = manager.sendAssistantChat(assistant.id, "what jobs do you have queued");
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.prompt).toContain("For every assistant-chat or project-chat request");
    expect(adapter.calls[0]?.prompt).toContain("assistant-actions skill");

    adapter.resolvers[0]?.({ text: "No queued jobs." });
    await sent;
  });
});

describe("assistant manager background jobs", () => {
  test("reprioritizes with writable access for implement assistants", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed",
      modeId: "implement"
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Built next catalog entry."
    });
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.readOnly).toBe(false);
    expect(adapter.calls[0]?.prompt).toContain("Recent assistant logs:");
    expect(adapter.calls[0]?.prompt).toContain("Built next catalog entry.");
    expect(adapter.calls[0]?.prompt).toContain(DEFAULT_CODING_STACK_GUIDANCE);
    expect(adapter.calls[0]?.prompt).not.toContain("SolidJS + Tailwind");
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
  });

  test("repairs invalid reprioritize proposal JSON once before applying updates", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed"
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Need queue update."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({
      text: JSON.stringify({
        newTodos: [{ title: "x".repeat(900), workKind: "unknown" }]
      })
    });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({
      text: JSON.stringify({
        summary: "Recovered queue",
        newTodos: [{ title: "Recovered reprioritize todo", workKind: "research" }]
      })
    });
    await outcome;
    await waitForCondition(() =>
      repository.getAssistantTodos(assistant.id).some((todo) => todo.title === "Recovered reprioritize todo")
    );

    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[1]?.prompt).toContain("Previous response failed schema validation");
    expect(repository.getAssistantTodos(assistant.id).map((todo) => [todo.title, todo.workKind])).toEqual([
      ["Recovered reprioritize todo", "research"]
    ]);
    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Reprioritized assistant state")).toBe(true);
  });

  test("retries a stale reprioritize snapshot without duplicating proposal rows", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const invalidated: string[][] = [];
    const manager = createManager(repository, adapter, { onAssistantDetailsChanged(ids) { invalidated.push(ids); } });
    manager.scheduleReprioritize(assistant.id, "stale-test");
    await waitForCalls(adapter, 1);
    const now = assistant.updatedAt;
    repository.saveAssistantTodo({ id: createAssistantTodoId(), assistantId: assistant.id, title: "Concurrent user todo",
      state: "pending", sortOrder: 0, source: "user", workKind: "research", createdAt: now, updatedAt: now });
    const proposal = { text: JSON.stringify({ summary: "Apply once",
      newTodos: [{ title: "Generated once", workKind: "research" }] }) };
    adapter.resolvers[0]?.(proposal);
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.(proposal);
    await waitForCondition(() => repository.getAssistantTodos(assistant.id).some((todo) => todo.title === "Generated once"));

    expect(repository.getAssistantTodos(assistant.id).filter((todo) => todo.title === "Generated once")).toHaveLength(1);
    expect(repository.getAssistantTodos(assistant.id).some((todo) => todo.title === "Concurrent user todo")).toBe(true);
    expect(invalidated).toContainEqual([assistant.id]);
  });

  test("captures the reprioritize revision with its prompt snapshot before runtime awaits", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    const readSnapshot = repository.getAssistantReprioritizeSnapshot.bind(repository);
    let interleaved = false;
    repository.getAssistantReprioritizeSnapshot = (assistantId) => {
      const snapshot = readSnapshot(assistantId);
      if (!interleaved) {
        interleaved = true;
        repository.saveAssistantTodo({ id: createAssistantTodoId(), assistantId, title: "Pre-await user todo",
          state: "pending", sortOrder: 0, source: "user", workKind: "research",
          createdAt: assistant.updatedAt, updatedAt: assistant.updatedAt });
      }
      return snapshot;
    };
    manager.scheduleReprioritize(assistant.id, "pre-await-race");
    await waitForCalls(adapter, 1);
    const proposal = { text: JSON.stringify({ newTodos: [{ title: "Generated after retry", workKind: "research" }] }) };
    adapter.resolvers[0]?.(proposal);
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.(proposal);
    await waitForCondition(() => repository.getAssistantTodos(assistant.id).some((todo) => todo.title === "Generated after retry"));
    expect(repository.getAssistantTodos(assistant.id).filter((todo) => todo.title === "Generated after retry")).toHaveLength(1);
  });

  test("defers an in-flight reprioritize commit when global execution pauses", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    manager.scheduleReprioritize(assistant.id, "pause-race");
    await waitForCalls(adapter, 1);
    repository.setGlobalExecutionPaused(true);
    adapter.resolvers[0]?.({ text: JSON.stringify({ newTodos: [{ title: "Must wait", workKind: "research" }] }) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);

    repository.setGlobalExecutionPaused(false);
    manager.drainPendingReprioritizes();
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: JSON.stringify({ newTodos: [{ title: "Applied after resume", workKind: "research" }] }) });
    await waitForCondition(() => repository.getAssistantTodos(assistant.id).length === 1);
    expect(repository.getAssistantTodos(assistant.id)[0]?.title).toBe("Applied after resume");
  });

  test("invalidates an in-flight reprioritize after assistant deletion", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    manager.scheduleReprioritize(assistant.id, "delete-race");
    await waitForCalls(adapter, 1);
    repository.deleteAssistant(assistant.id);
    manager.invalidateAssistant(assistant.id);
    adapter.resolvers[0]?.({ text: JSON.stringify({ newTodos: [{ title: "Ghost todo", workKind: "research" }] }) });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(repository.getAssistant(assistant.id)).toBeUndefined();
  });

  test("rolls back a failed reprioritize application and a clean retry applies once", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    const db = new Database(repository.getDatabasePath(), { strict: true });
    db.exec(`CREATE TRIGGER reject_reprioritize_success BEFORE INSERT ON assistant_log_entries
      WHEN NEW.summary = 'Reprioritized assistant state' BEGIN SELECT RAISE(ABORT, 'reprioritize commit failed'); END;`);
    db.close(false);
    const proposal = { text: JSON.stringify({ summary: "Retry atomically",
      newTodos: [{ title: "Atomic retry todo", workKind: "research" }] }) };
    manager.scheduleReprioritize(assistant.id, "failure-test");
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.(proposal);
    await waitForCondition(() => repository.getAssistantLogEntries(assistant.id)
      .some((entry) => entry.summary === "Reprioritization failed"));
    expect(repository.getAssistantTodos(assistant.id).filter((todo) => todo.title === "Atomic retry todo")).toHaveLength(0);

    const cleanupDb = new Database(repository.getDatabasePath(), { strict: true });
    cleanupDb.exec("DROP TRIGGER reject_reprioritize_success");
    cleanupDb.close(false);
    manager.scheduleReprioritize(assistant.id, "retry-test");
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.(proposal);
    await waitForCondition(() => repository.getAssistantTodos(assistant.id).some((todo) => todo.title === "Atomic retry todo"));
    expect(repository.getAssistantTodos(assistant.id).filter((todo) => todo.title === "Atomic retry todo")).toHaveLength(1);
  });

  test("rejects duplicate reprioritize todo order before mutation", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const now = new Date().toISOString();
    const todo = repository.saveAssistantTodo({ id: createAssistantTodoId(), assistantId: assistant.id,
      title: "Stable order", state: "pending", sortOrder: 0, source: "assistant", workKind: "research",
      createdAt: now, updatedAt: now });
    const revision = repository.getAssistantReprioritizeSnapshot(assistant.id).mutationRevision;
    expect(() => repository.applyAssistantReprioritizeMutation(assistant.id, { expectedMutationRevision: revision,
      todoUpdates: [], newTodos: [], todoOrder: [todo.id, todo.id], learnings: [], questions: [], logs: [] }))
      .toThrow("duplicate todo IDs");
    expect(repository.getAssistantTodos(assistant.id).map((entry) => entry.sortOrder)).toEqual([0]);
  });

  test("migrates and increments the persisted assistant mutation revision", () => {
    const dbPath = path.join(createTempDir(), `assistant-manager-${crypto.randomUUID()}.sqlite`);
    const repository = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    const assistant = createAssistant(repository); repository.close();
    const legacyDb = new Database(dbPath); legacyDb.exec("ALTER TABLE assistants DROP COLUMN mutation_revision"); legacyDb.close(false);
    const migrated = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    expect(migrated.getAssistantReprioritizeSnapshot(assistant.id).mutationRevision).toBe(0);
    migrated.saveAssistantLearning({ id: createAssistantLearningId(), assistantId: assistant.id, summary: "Bump",
      source: "test", confidence: "medium", createdAt: assistant.updatedAt });
    expect(migrated.getAssistantReprioritizeSnapshot(assistant.id).mutationRevision).toBeGreaterThan(0);
  });

  test("fails reprioritize cleanly when proposal repair is still invalid", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed"
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Need queue update."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ newTodos: [{ title: "Invalid", workKind: "bad-kind" }] }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: JSON.stringify({ newTodos: [{ title: "Still invalid", workKind: "bad-kind" }] }) });
    await outcome;
    await waitForCondition(() =>
      repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Reprioritization failed")
    );

    expect(adapter.calls).toHaveLength(2);
    expect(repository.getAssistantTodos(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.summary === "Reprioritization failed")).toBe(true);
  });

  test("keeps reprioritize read-only for read-only assistant modes", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed",
      modeId: "review"
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Reviewed queue."
    });
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.readOnly).toBe(true);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue inspected." }) });
  });

  test("succeeded job with no state delta records warning", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const logSummaries: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantLogAppended(entry) {
        logSummaries.push(entry.summary);
      }
    });

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "No durable state changed."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue checked." }) });
    await outcome;

    expect(logSummaries).toContain("Assistant job state unchanged");
    expect(repository.loadAssistantsState().logs.some((entry) => entry.assistantId === assistant.id && entry.level === "warning")).toBe(true);
  });

  test("empty unknown job failure asks recovery question immediately", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, DeferredAdapter());

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "failed",
      failureMessage: ""
    });

    const questions = repository.getAssistantQuestions(assistant.id);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.prompt).toContain("Unknown assistant job failure");
  });

  test("publishes the circuit-breaker trip log exactly once", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed", failureStreakCount: 2 });
    const published: string[] = [];
    const manager = createManager(repository, DeferredAdapter(), {
      onAssistantLogAppended(entry) { published.push(entry.summary); }
    });

    await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "failed",
      failureMessage: "Repeated provider failure"
    });

    expect(published.filter((summary) => summary === "Circuit breaker tripped")).toHaveLength(1);
    expect(repository.getAssistantLogEntries(assistant.id)
      .filter((entry) => entry.summary === "Circuit breaker tripped")).toHaveLength(1);
  });

  test("records answered questions as durable learnings", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, DeferredAdapter());
    const question = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "Which game should this patrol inspect?",
      status: "pending",
      askedAt: new Date().toISOString()
    });

    await manager.answerQuestion(assistant.id, question.id, "Pick a random one unless told otherwise.");

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings[0]?.summary).toContain("Pick a random one");
    expect(learnings[0]?.source).toBe(`question:${question.id}`);
  });

  test("leaves user answer event publication to the command owner", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const published: string[] = [];
    const manager = createManager(repository, DeferredAdapter(), {
      onAssistantsUpdated() { published.push("assistants"); },
      onAssistantLogAppended() { published.push("log"); }
    });
    const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Choose?", status: "pending", askedAt: new Date().toISOString() });
    await manager.answerQuestion(assistant.id, question.id, "Proceed", { reprioritize: false });
    expect(published).toEqual([]);
    expect(repository.getAssistantQuestion(question.id)?.status).toBe("answered");
  });

  test("question answer batches replay idempotently and reject duplicates or conflicting replays", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, DeferredAdapter());
    const now = new Date().toISOString();
    const questions = ["Which renderer?", "Which target?"].map((prompt) => repository.saveAssistantQuestion({
      id: createAssistantQuestionId(), assistantId: assistant.id, prompt, status: "pending", askedAt: now
    }));
    const answers = questions.map((question, index) => ({ questionId: question.id, content: `Answer ${index + 1}` }));

    await manager.answerQuestions(assistant.id, answers, { reprioritize: false });
    const counts = {
      logs: repository.getAssistantLogEntries(assistant.id).length,
      learnings: repository.getAssistantLearnings(assistant.id).length
    };
    await manager.answerQuestions(assistant.id, answers, { reprioritize: false });
    expect(repository.getAssistantLogEntries(assistant.id)).toHaveLength(counts.logs);
    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(counts.learnings);
    await expect(manager.answerQuestions(assistant.id, [answers[0]!, answers[0]!], { reprioritize: false }))
      .rejects.toThrow("Duplicate assistant question answers");
    await expect(manager.answerQuestion(assistant.id, questions[0]!.id, "Different answer", { reprioritize: false }))
      .rejects.toThrow("already answered differently");
    expect(repository.getAssistantQuestion(questions[0]!.id)?.answerText).toBe("Answer 1");
  });

  test("question answer batches reject every cross-assistant child owner before mutation", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const other = createAssistant(repository);
    const now = new Date().toISOString();
    for (const mismatchedChild of ["log", "guidance", "stack"] as const) {
      const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
        prompt: `Owner check ${mismatchedChild}?`, status: "pending", askedAt: now });
      const write = createQuestionAnswerWrite(assistant.id, question.id, "Keep ownership exact", now);
      if (mismatchedChild === "log") write.logEntry = { ...write.logEntry, assistantId: other.id };
      if (mismatchedChild === "guidance") write.guidanceLearning = { ...write.guidanceLearning, assistantId: other.id };
      if (mismatchedChild === "stack") write.stackLearning = { id: createAssistantLearningId(), assistantId: other.id,
        summary: "Wrong owner stack", source: "stack-preference", confidence: "high", createdAt: now };
      expect(() => repository.saveAssistantQuestionAnswers(assistant.id, [write]))
        .toThrow("Assistant question answer child does not belong to assistant");
      expect(repository.getAssistantQuestion(question.id)?.status).toBe("pending");
    }
    expect(repository.getAssistantLogEntries(other.id)).toHaveLength(0);
    expect(repository.getAssistantLearnings(other.id)).toHaveLength(0);
  });

  test("question answer batch rolls back answers, linked todos, logs, and learnings after a child failure", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const now = new Date().toISOString();
    const todos = ["First blocker", "Second blocker"].map((title, sortOrder) => repository.saveAssistantTodo({
      id: createAssistantTodoId(), assistantId: assistant.id, title, state: "blocked", sortOrder,
      blockerReason: "Waiting for answer", source: "assistant", workKind: "unspecified", createdAt: now, updatedAt: now
    }));
    const questions = todos.map((todo, index) => repository.saveAssistantQuestion({
      id: createAssistantQuestionId(), assistantId: assistant.id, prompt: `Resolve blocker ${index + 1}?`,
      status: "pending", linkedTodoIds: [todo.id], askedAt: now
    }));
    const writes = questions.map((question, index) => createQuestionAnswerWrite(assistant.id, question.id, `Resolution ${index + 1}`, now));
    const triggerDb = new Database(repository.getDatabasePath(), { strict: true });
    triggerDb.exec(`CREATE TRIGGER reject_second_question_log BEFORE INSERT ON assistant_log_entries
      WHEN NEW.summary = 'Question answered' AND
        (SELECT COUNT(*) FROM assistant_log_entries WHERE summary = 'Question answered') >= 1
      BEGIN SELECT RAISE(ABORT, 'second child write failed'); END;`);
    triggerDb.close(false);

    expect(() => repository.saveAssistantQuestionAnswers(assistant.id, writes)).toThrow("second child write failed");
    expect(questions.map((question) => repository.getAssistantQuestion(question.id)?.status)).toEqual(["pending", "pending"]);
    expect(todos.map((todo) => repository.getAssistantTodos(assistant.id).find((entry) => entry.id === todo.id)?.state))
      .toEqual(["blocked", "blocked"]);
    expect(repository.getAssistantLogEntries(assistant.id)).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(0);
  });

  test("direct question answers release linked blocked todos through the canonical transition", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const now = new Date().toISOString();
    const todo = repository.saveAssistantTodo({ id: createAssistantTodoId(), assistantId: assistant.id,
      title: "Wait for guidance", state: "blocked", sortOrder: 0, blockerReason: "Needs answer",
      source: "assistant", workKind: "blocked", createdAt: now, updatedAt: now });
    const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Continue now?", status: "pending", linkedTodoIds: [todo.id], askedAt: now });

    repository.answerAssistantQuestion(assistant.id, question.id, "Continue");

    expect(repository.getAssistantQuestion(question.id)?.status).toBe("answered");
    const released = repository.getAssistantTodos(assistant.id).find((entry) => entry.id === todo.id);
    expect(released?.state).toBe("pending");
    expect(released?.blockerReason).toBeUndefined();
    expect(repository.loadNotificationInboxState().items.some((item) =>
      item.kind === "assistant-question" && item.questionId === question.id && !item.archivedAt)).toBe(false);
  });

  test("acknowledges a durable question answer without waiting for learning compaction", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) repository.saveAssistantLearning({
      id: createAssistantLearningId(), assistantId: assistant.id, summary: `Answer context ${index}`,
      source: "test", confidence: "low", createdAt: now
    });
    const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "What next?", status: "pending", askedAt: now });

    const answered = await manager.answerQuestion(assistant.id, question.id, "Continue", { reprioritize: false });
    await waitForCalls(adapter, 1);
    expect(answered.status).toBe("answered");
    expect(repository.getAssistantQuestion(question.id)?.answerText).toBe("Continue");
    expect(adapter.resolvers).toHaveLength(1);
  });

  test("coalesces learning writes that arrive during compaction into a threshold recheck", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) repository.saveAssistantLearning({
      id: createAssistantLearningId(), assistantId: assistant.id, summary: `Initial fact ${index}`,
      source: "test", confidence: "low", createdAt: now
    });
    const firstQuestion = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "First answer?", status: "pending", askedAt: now });
    await manager.answerQuestion(assistant.id, firstQuestion.id, "First", { reprioritize: false });
    await waitForCalls(adapter, 1);

    for (let index = 0; index < 41; index += 1) repository.saveAssistantLearning({
      id: createAssistantLearningId(), assistantId: assistant.id, summary: `Concurrent fact ${index}`,
      source: "concurrent-test", confidence: "low", createdAt: now
    });
    const laterQuestion = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Trigger the coalesced recheck?", status: "pending", askedAt: now });
    await manager.answerQuestion(assistant.id, laterQuestion.id, "Yes", { reprioritize: false });
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Initial compacted summary" }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: JSON.stringify({ summary: "Coalesced compacted summary" }) });
    await waitForCondition(() => repository.getAssistantLearnings(assistant.id)
      .some((learning) => learning.summary === "Coalesced compacted summary"));
  });

  test("rejects stale learning compaction after concurrent delete and reorder, then retries from a fresh snapshot", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository); const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter); const now = new Date().toISOString();
    const facts = Array.from({ length: 41 }, (_, index) => repository.saveAssistantLearning({
      id: createAssistantLearningId(), assistantId: assistant.id, summary: `Mutable fact ${index}`,
      source: "concurrency-test", confidence: "low", createdAt: now })!);
    const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Compact safely?", status: "pending", askedAt: now });
    await manager.answerQuestion(assistant.id, question.id, "Yes", { reprioritize: false }); await waitForCalls(adapter, 1);
    repository.deleteAssistantLearning(assistant.id, facts[0]!.id);
    repository.reorderAssistantLearnings(assistant.id, facts.slice(1).reverse().map((learning) => learning.id));
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Stale compacted summary" }) }); await waitForCalls(adapter, 2);
    expect(repository.getAssistantLearnings(assistant.id).some((learning) => learning.summary === "Stale compacted summary")).toBe(false);
    adapter.resolvers[1]?.({ text: JSON.stringify({ summary: "Fresh compacted summary" }) });
    await waitForCondition(() => repository.getAssistantLearnings(assistant.id)
      .some((learning) => learning.summary === "Fresh compacted summary"));
    expect(repository.getAssistantLearnings(assistant.id).some((learning) => learning.id === facts[0]!.id)).toBe(false);
  });

  test("learning compaction rolls back supersession when a retained fact cannot persist", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const now = new Date().toISOString();
    const sources = ["First durable fact", "Second durable fact"].map((summary) => repository.saveAssistantLearning({
      id: createAssistantLearningId(), assistantId: assistant.id, summary, source: "test",
      confidence: "medium", createdAt: now
    })!);
    const db = new Database(repository.getDatabasePath(), { strict: true });
    db.exec(`CREATE TRIGGER reject_retained_learning BEFORE INSERT ON assistant_learnings
      WHEN NEW.source = 'retained-failure' BEGIN SELECT RAISE(ABORT, 'retained learning failed'); END;`);
    db.close(false);

    expect(() => repository.compactAssistantLearningsWithRetained({ assistantId: assistant.id,
      expectedMutationRevision: repository.getAssistantReprioritizeSnapshot(assistant.id).mutationRevision,
      compactedLearning: { id: createAssistantLearningId(), assistantId: assistant.id, summary: "Merged facts",
        source: "compaction:test", confidence: "high", createdAt: now, kind: "summary", compactedAt: now },
      supersededIds: sources.map((learning) => learning.id), retainedLearnings: [{ id: createAssistantLearningId(),
        assistantId: assistant.id, summary: "Retain this", source: "retained-failure", confidence: "high", createdAt: now }],
      fallbackLogEntry: { id: createAssistantLogEntryId(), assistantId: assistant.id, level: "warning", summary: "Assistant model fallback", createdAt: now },
      logEntry: { id: createAssistantLogEntryId(), assistantId: assistant.id, level: "info",
        summary: "Compacted assistant learnings", createdAt: now }
    })).toThrow("retained learning failed");
    expect(new Set(repository.getAssistantLearnings(assistant.id).map((learning) => learning.summary))).toEqual(
      new Set(["First durable fact", "Second durable fact"])
    );
    expect(repository.getAssistantLogEntries(assistant.id)).toHaveLength(0);
  });

  test("dedupes bootstrap learnings before appending", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);

    const bootstrapped = manager.retryBootstrap(assistant.id);
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({
      text: JSON.stringify({
        researchSummary: "Preserve durable user guidance.",
        learnings: [
          {
            summary: "Preserve durable user guidance.",
            source: "bootstrap",
            confidence: "medium"
          }
        ]
      })
    });
    await bootstrapped;

    expect(repository.getAssistantLearnings(assistant.id)).toHaveLength(1);
  });

  test("compacts assistant learnings once thresholds are crossed", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed",
      executionModelId: "openai/retired-model", providerBrand: "gemini" });
    const adapter = DeferredAdapter();
    const invalidated: string[][] = [];
    const manager = createManager(repository, adapter, { onAssistantDetailsChanged(ids) { invalidated.push(ids); } });
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Low-value repeated patrol note ${index}`,
        source: "test",
        confidence: "low",
        createdAt: now
      });
    }
    Object.defineProperty(repository, "getAssistantLearningStats", { value: () => { throw new Error("split stats read must not be used"); } });

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Trigger reprioritize."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
    await waitForCalls(adapter, 2);
    expect(adapter.calls[1]?.prompt).toContain("Merge assistant learnings into compact durable guidance.");
    expect(adapter.calls[1]?.prompt).not.toContain('"summary": "merged durable assistant guidance"');
    expect(adapter.calls[1]?.prompt).toContain("Never return placeholder labels");
    invalidated.length = 0;
    adapter.resolvers[1]?.({
      text: JSON.stringify({
        summary: "Keep patrol guidance compact.",
        retainedFacts: []
      })
    });
    await outcome;
    await waitForCondition(() => repository.getAssistantLearnings(assistant.id).length === 1);

    const learnings = repository.getAssistantLearnings(assistant.id);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]?.kind).toBe("summary");
    expect(learnings[0]?.summary).toBe("Keep patrol guidance compact.");
    expect(invalidated).toContainEqual([assistant.id]);
    expect(repository.getAssistantLogEntries(assistant.id).filter((entry) => entry.summary === "Assistant model fallback")).toHaveLength(2);
  });

  test("keeps facts when AI compaction payload cannot be repaired", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const logSummaries: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantLogAppended(entry) {
        logSummaries.push(entry.summary);
      }
    });
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Compaction fallback note ${index}`,
        source: "test",
        confidence: "low",
        createdAt: now
      });
    }

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Trigger reprioritize."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: "not json" });
    await waitForCalls(adapter, 3);
    adapter.resolvers[2]?.({ text: JSON.stringify({ retainedFacts: [] }) });
    await outcome;
    await waitForCondition(() => logSummaries.includes("Assistant learning compaction skipped"));

    expect(repository.getAssistantLearningStats(assistant.id).activeFactLearningCount).toBe(41);
    expect(logSummaries).toContain("Assistant learning compaction skipped");
  });

  test("rejects garbage compaction output and keeps facts when repair is garbage", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const logSummaries: string[] = [];
    const manager = createManager(repository, adapter, {
      onAssistantLogAppended(entry) {
        logSummaries.push(entry.summary);
      }
    });
    const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Garbage compaction guard note ${index}`,
        source: "test",
        confidence: "low",
        createdAt: now
      });
    }

    const outcome = manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "succeeded",
      summary: "Trigger reprioritize."
    });
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Queue updated." }) });
    await waitForCalls(adapter, 2);
    adapter.resolvers[1]?.({ text: JSON.stringify({ summary: "merged durable assistant guidance", retainedFacts: [] }) });
    await waitForCalls(adapter, 3);
    adapter.resolvers[2]?.({ text: JSON.stringify({ summary: "Compacted summary", retainedFacts: [] }) });
    await outcome;
    await waitForCondition(() => logSummaries.includes("Assistant learning compaction skipped"));

    expect(repository.getAssistantLearningStats(assistant.id).activeFactLearningCount).toBe(41);
    expect(repository.getAssistantLearnings(assistant.id).some((learning) => learning.kind === "summary")).toBe(false);
  });

  test("prompt learning context prefers summary and high-confidence guidance", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    const now = new Date().toISOString();
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "Compacted release guidance comes first.",
      source: "compaction:test",
      confidence: "high",
      createdAt: now,
      kind: "summary",
      compactedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "merged durable assistant guidance",
      source: "compaction:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 1).toISOString(),
      kind: "summary",
      compactedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId: assistant.id,
      summary: "User wants blocker questions avoided.",
      source: "question:test",
      confidence: "high",
      createdAt: now
    });
    for (let index = 0; index < 20; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId: assistant.id,
        summary: `Recent fact ${index}`,
        source: "test",
        confidence: "medium",
        createdAt: new Date(Date.now() + index).toISOString()
      });
    }

    const sent = manager.sendAssistantChat(assistant.id, "Need status");
    await waitForCalls(adapter, 1);

    expect(adapter.calls[0]?.prompt).toContain("Compacted release guidance comes first.");
    expect(adapter.calls[0]?.prompt).not.toContain("merged durable assistant guidance");
    expect(adapter.calls[0]?.prompt).toContain("User wants blocker questions avoided.");
    expect(adapter.calls[0]?.prompt).not.toContain("Recent fact 0");

    adapter.resolvers[0]?.({ text: "Ready" });
    await sent;
  });

  test("turns soft question-like job failures into durable notes without tripping failures", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, DeferredAdapter());

    const outcome = await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "failed",
      failureMessage:
        "What should I calibrate against while I patrol: which current game or mechanic are you tuning, and what currently feels most good, bad, confusing, sticky, or exciting about it?"
    });

    const questions = repository.getAssistantQuestions(assistant.id);
    const updatedAssistant = repository.getAssistant(assistant.id);
    expect(questions).toHaveLength(0);
    expect(outcome?.blocked).toBe(false);
    expect(repository.getAssistantLearnings(assistant.id)[0]?.summary).toContain("Make a reasonable assumption");
    expect(updatedAssistant?.failureStreakCount).toBe(0);
    expect(updatedAssistant?.circuitBreakerState).toBe("closed");
  });

  test("duplicate awaiting input job outcomes do not create repeated questions", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, DeferredAdapter());

    const firstOutcome = await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "awaiting-user-input",
      summary: "Which project should this assistant inspect first?"
    });
    const secondOutcome = await manager.handleBackgroundJobRunOutcome({
      assistantId: assistant.id,
      status: "awaiting-user-input",
      summary: "Which project should this assistant inspect first?"
    });

    expect(repository.getAssistantQuestions(assistant.id)).toHaveLength(0);
    expect(firstOutcome?.blocked).toBe(false);
    expect(secondOutcome?.blocked).toBe(false);
    expect(repository.getAssistantLearnings(assistant.id).length).toBeGreaterThan(0);
    expect(repository.getAssistant(assistant.id)?.failureStreakCount).toBe(0);
  });

  test("answer reprioritize suppresses equivalent future questions", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, {
      bootstrapState: "completed"
    });
    const adapter = DeferredAdapter();
    const manager = createManager(repository, adapter);
    const question = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "Which game folder should I evaluate?",
      status: "pending",
      askedAt: new Date().toISOString()
    });

    await manager.answerQuestion(assistant.id, question.id, "Pick a random browser-playable game unless told otherwise.");
    await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({
      text: JSON.stringify({
        summary: "Question considered.",
        questions: [{ prompt: "Which game folder or mechanic should I evaluate first?" }]
      })
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const questions = repository.getAssistantQuestions(assistant.id);
    expect(questions.filter((entry) => entry.status === "pending")).toHaveLength(0);
    expect(repository.getAssistantLearnings(assistant.id).some((entry) => entry.summary.includes("Auto-answered"))).toBe(true);
  });

  test("startup cleanup dismisses stale duplicate pending questions", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const changed: string[][] = [];
    const manager = createManager(repository, DeferredAdapter(), { onAssistantDetailsChanged(ids) { changed.push(ids); } });
    repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "What do you usually like or dislike in launcher games?",
      status: "answered",
      answerText: "Tight gameplay loop is key. Do not ask again.",
      askedAt: new Date().toISOString(),
      answeredAt: new Date().toISOString()
    });
    const stale = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId: assistant.id,
      prompt: "What makes launcher game feel good or bad to you?",
      status: "pending",
      askedAt: new Date().toISOString()
    });

    expect(manager.cleanupStaleAssistantQuestions()).toBe(1);
    expect(changed).toEqual([[assistant.id]]);

    expect(repository.getAssistantQuestions(assistant.id).find((entry) => entry.id === stale.id)?.status).toBe("dismissed");
  });

  test("startup question cleanup rolls back policy effects and retries cleanly after restart", () => {
    const repository = createRepository();
    const assistant = createAssistant(repository);
    const manager = createManager(repository, DeferredAdapter());
    repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "What gameplay feel do you prefer?", status: "answered", answerText: "Use your best judgement.",
      askedAt: new Date().toISOString(), answeredAt: new Date().toISOString() });
    const stale = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "What gameplay feel should I choose?", status: "pending", askedAt: new Date().toISOString() });
    const dbPath = repository.getDatabasePath();
    const triggerDb = new Database(dbPath, { strict: true });
    triggerDb.exec(`CREATE TRIGGER reject_startup_policy_log BEFORE INSERT ON assistant_log_entries
      WHEN NEW.summary = 'Question suppressed' BEGIN SELECT RAISE(ABORT, 'startup policy log failed'); END;`);
    triggerDb.close(false);

    expect(() => manager.cleanupStaleAssistantQuestions()).toThrow("startup policy log failed");
    expect(repository.getAssistantQuestion(stale.id)?.status).toBe("pending");
    expect(repository.getAssistantLearnings(assistant.id).some((entry) => entry.source.startsWith("question-policy:"))).toBe(false);
    const cleanupDb = new Database(dbPath, { strict: true });
    cleanupDb.exec("DROP TRIGGER reject_startup_policy_log");
    cleanupDb.close(false);
    repository.close();

    const restarted = createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
    expect(createManager(restarted, DeferredAdapter()).cleanupStaleAssistantQuestions()).toBe(1);
    expect(restarted.getAssistantQuestion(stale.id)?.status).toBe("dismissed");
    expect(restarted.getAssistantLearnings(assistant.id).some((entry) => entry.source.startsWith("question-policy:"))).toBe(true);
  });

  test("selectAssistantPromptQuestions keeps only durable non-operational answers", () => {
    const assistantId = createAssistantId();
    const now = new Date().toISOString();
    const selected = selectAssistantPromptQuestions([
      {
        id: createAssistantQuestionId(),
        assistantId,
        prompt: "Which background job should I run now?",
        status: "answered",
        answerText: "Use the hourly job.",
        askedAt: now,
        answeredAt: now
      },
      {
        id: createAssistantQuestionId(),
        assistantId,
        prompt: "Which release area should this patrol inspect?",
        status: "answered",
        answerText: "Inspect release blockers first.",
        askedAt: now,
        answeredAt: now
      },
      {
        id: createAssistantQuestionId(),
        assistantId,
        prompt: "Which release area should this patrol inspect?",
        status: "answered",
        answerText: "Inspect release blockers first.",
        askedAt: now,
        answeredAt: now
      }
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.answerText).toBe("Inspect release blockers first.");
  });

  test("assistant prompt memory block dedupes learnings and caps output", () => {
    const assistantId = createAssistantId();
    const learnings: AssistantLearning[] = Array.from({ length: 12 }, (_, index) => ({
      id: createAssistantLearningId(),
      assistantId,
      summary: index < 2 ? "Prioritize smoke tests first." : `Learning ${index}`,
      source: index < 2 ? "question:test" : "test",
      confidence: index < 2 ? "high" : "medium",
      createdAt: new Date(Date.now() + index).toISOString()
    }));

    const selectedLearnings = selectAssistantPromptLearnings(learnings);
    const block = renderAssistantPromptMemoryBlock(
      [
        {
          id: createAssistantQuestionId(),
          assistantId,
          prompt: "Which release area should this patrol inspect?",
          status: "answered",
          answerText: "Inspect release blockers first.",
          askedAt: new Date().toISOString(),
          answeredAt: new Date().toISOString()
        }
      ],
      selectedLearnings
    );

    expect(selectedLearnings).toHaveLength(6);
    expect(selectedLearnings.filter((learning) => learning.summary === "Prioritize smoke tests first.")).toHaveLength(1);
    expect(block).toContain("# Durable Guidance");
    expect(block).toContain("Recent durable answers:");
    expect(block).toContain("Relevant learnings:");
  });

  test("commits unavailable-model reprioritize once without self-invalidating its snapshot", async () => {
    const repository = createRepository();
    const assistant = createAssistant(repository, { bootstrapState: "completed", executionModelId: "openai/removed-model",
      providerBrand: "gemini" });
    const adapter = DeferredAdapter(); const manager = createManager(repository, adapter);
    manager.scheduleReprioritize(assistant.id, "model-fallback"); await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Fallback applied" }) });
    await waitForCondition(() => repository.getAssistantLogEntries(assistant.id)
      .some((entry) => entry.summary === "Reprioritized assistant state"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(adapter.calls).toHaveLength(1);
    expect(repository.getAssistantLogEntries(assistant.id)
      .filter((entry) => entry.summary === "Assistant model fallback")).toHaveLength(1);
  });

  test("defers compaction when pause wins the pre-provider race and resumes retained work", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter(); const manager = createManager(repository, adapter); const now = new Date().toISOString();
    for (let index = 0; index < 41; index += 1) repository.saveAssistantLearning({ id: createAssistantLearningId(),
      assistantId: assistant.id, summary: `Pause fact ${index}`, source: "pause-race", confidence: "low", createdAt: now });
    const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Continue after pause?", status: "pending", askedAt: now });
    const answered = manager.answerQuestion(assistant.id, question.id, "Yes", { reprioritize: false });
    repository.setGlobalExecutionPaused(true); await answered; await new Promise((resolve) => setTimeout(resolve, 30));
    expect(adapter.calls).toHaveLength(0);
    repository.setGlobalExecutionPaused(false); manager.drainPendingLearningCompactions(); await waitForCalls(adapter, 1);
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Resumed compact guidance" }) });
    await waitForCondition(() => repository.getAssistantLearnings(assistant.id)
      .some((learning) => learning.summary === "Resumed compact guidance"));
  });

  test("retries in-flight reprioritize after deferred-question promotion bumps its revision", async () => {
    const repository = createRepository(); const assistant = createAssistant(repository, { bootstrapState: "completed" });
    const adapter = DeferredAdapter(); const manager = createManager(repository, adapter);
    const question = repository.saveAssistantQuestion({ id: createAssistantQuestionId(), assistantId: assistant.id,
      prompt: "Which target?", status: "deferred", askedAt: new Date().toISOString() });
    manager.scheduleReprioritize(assistant.id, "deferred-question-race"); await waitForCalls(adapter, 1);
    repository.promoteDeferredAssistantQuestions();
    adapter.resolvers[0]?.({ text: JSON.stringify({ summary: "Stale proposal" }) }); await waitForCalls(adapter, 2);
    expect(adapter.calls[1]?.prompt).toContain(question.prompt);
    adapter.resolvers[1]?.({ text: JSON.stringify({ summary: "Fresh proposal" }) });
    await waitForCondition(() => repository.getAssistantLogEntries(assistant.id).some((entry) => entry.detail === "Fresh proposal"));
    expect(repository.getAssistantLogEntries(assistant.id).some((entry) => entry.detail === "Stale proposal")).toBe(false);
  });

});
