import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  createAssistantId,
  createAssistantLearningId,
  createAssistantQuestionId,
  createBackgroundJobId,
  createThreadId,
  type BackgroundJob,
  type BackgroundJobRun
} from "@hyperfocus/ai-core/protocol";
import {
  executeBackgroundJobRun,
  startBackgroundRunLivenessHeartbeat
} from "./background-job-executor";
import { resolveHarnessTestTempRoot } from "./test-support/test-temp-root";
import type { PiAgentAdapter, PiAgentExecutionController, PiAgentPromptRequest, PiAgentPromptResult } from "./pi-agent-adapter";
import { createWorkspaceRepository, type WorkspaceRepository } from "./workspace-repository";

function createTempDir() {
  const tempRoot = resolveHarnessTestTempRoot();
  mkdirSync(tempRoot, { recursive: true });
  return tempRoot;
}

function createRepository() {
  const dbPath = path.join(createTempDir(), `background-job-executor-${crypto.randomUUID()}.sqlite`);
  return createWorkspaceRepository(dbPath, process.cwd(), { durability: "test-fast" });
}

function saveAssistant(repository: WorkspaceRepository, projectId: string) {
  const now = new Date().toISOString();
  const assistantId = createAssistantId();
  repository.saveAssistant({
    id: assistantId,
    name: "Kojima",
    scope: "project",
    projectId,
    description: "Browser game evaluator.",
    personalityPrompt: "Be direct.",
    jobPrompt: "Evaluate browser games.",
    agentId: "pi",
    runState: "active",
    bootstrapState: "completed",
    failureStreakCount: 0,
    circuitBreakerState: "closed",
    latestActivityAt: now,
    unreadQuestionCount: 0,
    createdAt: now,
    updatedAt: now
  });
  repository.saveAssistantLearning({
    id: createAssistantLearningId(),
    assistantId,
    summary: "For sweep passes, pick a random browser-playable game unless told otherwise.",
    source: "test",
    confidence: "high",
    createdAt: now
  });
  return assistantId;
}

function createAssistantRoutineJob(projectId: string, assistantId: string, automationThreadId: string, now: string): BackgroundJob {
  return {
    id: createBackgroundJobId(),
    projectId,
    assistantId,
    automationThreadId,
    kind: "ai-routine",
    name: "Kojima patrol",
    status: "enabled",
    riskLevel: "safe",
    definition: {
      kind: "ai-routine",
      prompt: "Run browser game sweep.",
      planExecutionMode: "countdown",
      subagentWorktreeStrategy: "separate-worktrees"
    },
    schedule: {
      type: "interval",
      intervalSeconds: 600,
      nextRunAt: now,
      sourceText: "10m"
    },
    scheduleInput: "10m",
    nextRunAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function createQuestionAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    return {
      text: JSON.stringify({
        type: "question",
        summary: "Need input",
        question: {
          id: "question-1",
          prompt: "Which target should I inspect?",
          choices: [
            {
              id: "choice-1",
              label: "Use judgment",
              description: "Pick target.",
              answerText: "Use judgment.",
              recommended: true
            },
            {
              id: "choice-2",
              label: "Wait",
              description: "Wait.",
              answerText: "Wait.",
              recommended: false
            },
            {
              id: "choice-3",
              label: "Skip",
              description: "Skip.",
              answerText: "Skip.",
              recommended: false
            }
          ],
          required: true
        }
      })
    };
  }

  async function startExecution(): Promise<PiAgentExecutionController> {
    throw new Error("not used");
  }

  return { calls, runPrompt, startExecution, setApiKey() {}, hasApiKey: () => true };
}

function createReadyRoutineAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "ready",
          difficultyScore: 10,
          summary: "Run routine.",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: false,
          subtasks: [],
          finalExecutionBrief: "Run assistant routine.",
          prerequisites: [],
          contracts: []
        })
      };
    }
    return { text: "Routine done." };
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    calls.push(request);
    return {
      result: Promise.resolve({ text: "Routine done." }),
      continueWithPrompt: async () => ({ text: "Routine done." }),
      abort: async () => {},
      dispose() {}
    };
  }

  return { calls, runPrompt, startExecution, setApiKey() {}, hasApiKey: () => true };
}

function createTerminalDuringExecutionAdapter(onExecution: () => void): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const adapter = createReadyRoutineAdapter();
  return {
    ...adapter,
    async startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
      adapter.calls.push(request);
      onExecution();
      return {
      result: Promise.resolve({ text: "Late success should not overwrite terminal run." }),
      continueWithPrompt: async () => ({ text: "Late success should not overwrite terminal run." }),
      abort: async () => {},
      dispose() {}
      };
    },
  };
}

function createTerminalBeforeSubagentCompleteAdapter(onSubagentExecution: () => void): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  let terminalTriggered = false;
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "ready",
          difficultyScore: 80,
          summary: "Run stale subagent routine.",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: true,
          subtasks: [
            {
              id: "task-1",
              title: "Late task",
              instruction: "Finish after repair."
            },
            {
              id: "task-2",
              title: "Second late task",
              instruction: "Also finish after repair."
            }
          ],
          finalExecutionBrief: "Aggregate stale result.",
          prerequisites: [],
          contracts: [
            {
              taskId: "task-1",
              title: "Late task",
              instruction: "Finish after repair.",
              effortPoints: 1,
              ownedPaths: ["owned.ts"],
              dependsOnPrerequisiteIds: [],
              deliverables: ["none"],
              integrationPoints: ["aggregator"],
              verificationScope: "owned-files-only",
              verificationCommands: [],
              mergeNotes: "No merge."
            },
            {
              taskId: "task-2",
              title: "Second late task",
              instruction: "Also finish after repair.",
              effortPoints: 1,
              ownedPaths: ["owned-2.ts"],
              dependsOnPrerequisiteIds: [],
              deliverables: ["none"],
              integrationPoints: ["aggregator"],
              verificationScope: "owned-files-only",
              verificationCommands: [],
              mergeNotes: "No merge."
            }
          ]
        })
      };
    }
    if (request.kind === "subagent") {
      onSubagentExecution();
      return { text: "Late subagent success should not be persisted." };
    }
    return { text: "Late aggregate should not be persisted." };
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    calls.push(request);
    if (request.kind === "subagent") {
      if (!terminalTriggered) {
        terminalTriggered = true;
        onSubagentExecution();
      }
      return {
        result: Promise.resolve({ text: "Late subagent success should not be persisted." }),
        continueWithPrompt: async () => ({ text: "Late subagent success should not be persisted." }),
        abort: async () => {},
        dispose() {}
      };
    }
    return {
      result: Promise.resolve({ text: "Late aggregate should not be persisted." }),
      continueWithPrompt: async () => ({ text: "Late aggregate should not be persisted." }),
      abort: async () => {},
      dispose() {}
    };
  }

  return { calls, runPrompt, startExecution, setApiKey() {}, hasApiKey: () => true };
}

function createPartialSubagentRoutineAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "ready",
          difficultyScore: 80,
          summary: "Run partial routine.",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: true,
          subtasks: [
            {
              id: "task-1",
              title: "Failing task",
              instruction: "Fail for test."
            },
            {
              id: "task-2",
              title: "Second failing task",
              instruction: "Fail for test too."
            }
          ],
          finalExecutionBrief: "Aggregate partial result.",
          prerequisites: [],
          contracts: [
            {
              taskId: "task-1",
              title: "Failing task",
              instruction: "Fail for test.",
              effortPoints: 1,
              ownedPaths: ["owned.ts"],
              dependsOnPrerequisiteIds: [],
              deliverables: ["none"],
              integrationPoints: ["aggregator"],
              verificationScope: "owned-files-only",
              verificationCommands: [],
              mergeNotes: "No merge."
            },
            {
              taskId: "task-2",
              title: "Second failing task",
              instruction: "Fail for test too.",
              effortPoints: 1,
              ownedPaths: ["owned-2.ts"],
              dependsOnPrerequisiteIds: [],
              deliverables: ["none"],
              integrationPoints: ["aggregator"],
              verificationScope: "owned-files-only",
              verificationCommands: [],
              mergeNotes: "No merge."
            }
          ]
        })
      };
    }
    return { text: "Partial aggregate summary." };
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    calls.push(request);
    if (request.kind === "subagent") {
      return {
        result: Promise.reject(new Error("subagent failed")),
        continueWithPrompt: async () => {
          throw new Error("subagent failed");
        },
        abort: async () => {},
        dispose() {}
      };
    }
    return {
      result: Promise.resolve({ text: "Partial aggregate summary." }),
      continueWithPrompt: async () => ({ text: "Partial aggregate summary." }),
      abort: async () => {},
      dispose() {}
    };
  }

  return { calls, runPrompt, startExecution, setApiKey() {}, hasApiKey: () => true };
}

function plannerChoices(answerText: string = "Use existing guidance.") {
  return [
    {
      id: "choice-1",
      label: "Use guidance",
      description: "Use existing guidance.",
      answerText,
      recommended: true
    },
    {
      id: "choice-2",
      label: "Wait",
      description: "Wait for user input.",
      answerText: "Wait for user input.",
      recommended: false
    },
    {
      id: "choice-3",
      label: "Skip",
      description: "Skip this pass.",
      answerText: "Skip this pass.",
      recommended: false
    }
  ];
}

function createAutoQuestionThenReadyAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  let plannerCalls = 0;
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    if (request.kind === "planner") {
      plannerCalls += 1;
      if (plannerCalls === 1) {
        return {
          text: JSON.stringify({
            type: "question",
            summary: "Need target",
            question: {
              id: "question-1",
              prompt: "What should I use as the concrete sweep input for this pass?",
              choices: plannerChoices(),
              required: true
            }
          })
        };
      }
      return {
        text: JSON.stringify({
          type: "ready",
          difficultyScore: 10,
          summary: "Run routine with target guidance.",
          executionModelId: "openai/gpt-5.4",
          usesSubagents: false,
          subtasks: [],
          finalExecutionBrief: "Run assistant routine.",
          prerequisites: [],
          contracts: []
        })
      };
    }
    return { text: "Routine done." };
  }

  async function startExecution(request: PiAgentPromptRequest): Promise<PiAgentExecutionController> {
    calls.push(request);
    return {
      result: Promise.resolve({ text: "Routine done." }),
      continueWithPrompt: async () => ({ text: "Routine done." }),
      abort: async () => {},
      dispose() {}
    };
  }

  return { calls, runPrompt, startExecution, setApiKey() {}, hasApiKey: () => true };
}

function createRepeatingAutoQuestionAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const adapter = createAutoQuestionThenReadyAdapter();
  return { ...adapter, async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    adapter.calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "question",
          summary: "Need target",
          question: {
            id: "question-1",
            prompt: "What should I use as the concrete sweep input for this pass?",
            choices: plannerChoices(),
            required: true
          }
        })
      };
    }
    return { text: "Routine done." };
  } };
}

function createScheduleQuestionAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const adapter = createAutoQuestionThenReadyAdapter();
  return { ...adapter, async runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    adapter.calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "question",
          summary: "Need schedule",
          question: {
            id: "question-1",
            prompt: "What schedule should this assistant-owned job use?",
            choices: plannerChoices("Every hour."),
            required: true
          }
        })
      };
    }
    return { text: "Routine done." };
  } };
}

function createDefaultNonBlockingQuestionAdapter(): PiAgentAdapter & { calls: PiAgentPromptRequest[] } {
  const calls: PiAgentPromptRequest[] = [];
  async function runPrompt(request: PiAgentPromptRequest): Promise<PiAgentPromptResult> {
    calls.push(request);
    if (request.kind === "planner") {
      return {
        text: JSON.stringify({
          type: "question",
          summary: "Need default",
          question: {
            id: "question-1",
            prompt: "Should I keep going with a reasonable default?",
            choices: plannerChoices("Use your best judgment."),
            required: true
          }
        })
      };
    }
    return { text: "Routine done." };
  }

  async function startExecution(): Promise<PiAgentExecutionController> {
    throw new Error("not used");
  }

  return { calls, runPrompt, startExecution, setApiKey() {}, hasApiKey: () => true };
}

describe("executeBackgroundJobRun", () => {
  test("liveness heartbeat touches running main execution and stops after cleanup", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    repository.saveBackgroundJob(job);
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    const updates: BackgroundJobRun[] = [];

    const stop = startBackgroundRunLivenessHeartbeat(
      {
        repository,
        onRunUpdated(updatedRun) {
          updates.push(updatedRun);
        }
      },
      run.id,
      10
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    stop();
    const heartbeatCountAfterStop = updates.length;
    await new Promise((resolve) => setTimeout(resolve, 35));

    const updatedRun = repository.getBackgroundJobRun(run.id);
    expect(heartbeatCountAfterStop).toBeGreaterThanOrEqual(2);
    expect(updates).toHaveLength(heartbeatCountAfterStop);
    expect(updatedRun?.heartbeatStage).toBe("execution-running");
    expect(updatedRun?.heartbeatDetail).toBe("Main Codex CLI execution still running");
  });

  test("liveness heartbeat stops without touching cancelled runs", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    repository.saveBackgroundJob(job);
    const run = repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource: "schedule",
      status: "running",
      riskLevel: job.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(run.id, "cancelled", {
      failureMessage: "Stopped by user",
      failureCategory: "manual-abort"
    });
    const cancelledRun = repository.getBackgroundJobRun(run.id);
    const updates: BackgroundJobRun[] = [];

    const stop = startBackgroundRunLivenessHeartbeat(
      {
        repository,
        onRunUpdated(updatedRun) {
          updates.push(updatedRun);
        }
      },
      run.id,
      10
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    stop();

    const updatedRun = repository.getBackgroundJobRun(run.id);
    expect(updates).toHaveLength(0);
    expect(updatedRun?.status).toBe("cancelled");
    expect(updatedRun?.completedAt).toBe(cancelledRun?.completedAt);
    expect(updatedRun?.updatedAt).toBe(cancelledRun?.updatedAt);
    expect(updatedRun?.heartbeatStage).toBe("cancelled");
    expect(updatedRun?.heartbeatDetail).toBe("Stopped by user");
  });

  test("persists deferred questions on inactive automation threads", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const now = new Date().toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "ai-routine",
      name: "Question job",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect repo.",
        planExecutionMode: "countdown",
        subagentWorktreeStrategy: "separate-worktrees"
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const agentRun = repository.getRun(project.id, result.linkedAgentRunId!);
    expect(result.status).toBe("awaiting-user-input");
    expect(agentRun?.threadId).toBe(savedJob.automationThreadId);
    expect(agentRun?.questions[0]?.status).toBe("deferred");
    expect(repository.loadNotificationInboxState().items.some((item) => item.kind === "planning-question")).toBe(true);
  });

  test("auto-answers assistant-owned nonblocking planner questions and reruns planning once", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const adapter = createAutoQuestionThenReadyAdapter();

    const result = await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const linkedRun = repository.getRun(project.id, result.linkedAgentRunId!);
    expect(result.status).toBe("succeeded");
    expect(adapter.calls.filter((call) => call.kind === "planner")).toHaveLength(2);
    expect(linkedRun?.questions[0]?.status).toBe("answered");
    expect(linkedRun?.runtimeBudget?.maxTurns).toBe(20);
    expect(adapter.calls[0]?.prompt).toContain("not a git repository");
    expect(result.events.some((event) => event.stage === "question-auto-resolved")).toBe(true);
  });

  test("keeps assistant-owned nonblocking planner questions awaiting input when auto-approval is disabled", async () => {
    const repository = createRepository();
    repository.setAssistantAutoApproveNonBlockingQuestionsDefault(false);
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const adapter = createDefaultNonBlockingQuestionAdapter();

    const result = await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const linkedRun = repository.getRun(project.id, result.linkedAgentRunId!);
    expect(result.status).toBe("awaiting-user-input");
    expect(adapter.calls.filter((call) => call.kind === "planner")).toHaveLength(1);
    expect(linkedRun?.questions[0]?.status).toBe("deferred");
    expect(result.events.some((event) => event.stage === "question-auto-resolved")).toBe(false);
  });

  test("assistant routine planner prompt includes active todo metadata", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    repository.saveAssistantTodo({
      id: "todo-build-ui",
      assistantId,
      title: "Implement first screen",
      state: "pending",
      sortOrder: 0,
      workKind: "app-code",
      workTarget: "src/app.tsx",
      createdAt: now,
      updatedAt: now
    });
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const adapter = createReadyRoutineAdapter();

    await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(adapter.calls[0]?.prompt).toContain("Active assistant todos:");
    expect(adapter.calls[0]?.prompt).toContain("workKind=app-code");
    expect(adapter.calls[0]?.prompt).toContain("target=src/app.tsx");
  });

  test("keeps assistant-owned schedule questions awaiting user input", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createScheduleQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(result.status).toBe("awaiting-user-input");
    expect(repository.getRun(project.id, result.linkedAgentRunId!)?.questions[0]?.status).toBe("deferred");
  });

  test("skips assistant-owned routine when planner repeats nonblocking question after auto-resolution cap", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job = createAssistantRoutineJob(project.id, assistantId, createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createRepeatingAutoQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(result.status).toBe("skipped");
    expect(result.summary).toBe("Planner kept asking nonblocking question after auto-resolution");
  });

  test("emits run snapshots as shell execution log events append", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const now = new Date().toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "shell",
      name: "Streaming shell",
      status: "enabled",
      riskLevel: "slightly-unsafe",
      definition: {
        kind: "shell",
        executable: process.execPath,
        args: ["-e", "console.log('stream one')"],
        timeoutSeconds: 60
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const updates: BackgroundJobRun[] = [];

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false,
      onRunUpdated(updatedRun) {
        updates.push(updatedRun);
      }
    });

    expect(result.status).toBe("succeeded");
    expect(result.lastHeartbeatAt).toBeTruthy();
    expect(result.heartbeatStage).toBe("succeeded");
    expect(updates.some((updatedRun) => updatedRun.status === "running" && updatedRun.events.some((event) => event.stage === "spawned"))).toBe(true);
    expect(updates.some((updatedRun) => updatedRun.status === "running" && updatedRun.events.some((event) => event.stage === "stdout" && event.detail?.includes("stream one")))).toBe(true);
    expect(updates.some((updatedRun) => updatedRun.heartbeatStage === "stdout")).toBe(true);
  });

  test("moves stale interval schedule past completion", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const staleNextRunAt = new Date(Date.now() - 60_000).toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "shell",
      name: "Stale interval shell",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "shell",
        executable: process.execPath,
        args: ["-e", ""],
        timeoutSeconds: 60
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: staleNextRunAt,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: staleNextRunAt,
      createdAt: staleNextRunAt,
      updatedAt: staleNextRunAt
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    await executeBackgroundJobRun({
      repository,
      adapter: createQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const completedJob = repository.getBackgroundJob(job.id)!;
    expect(completedJob.lastRunAt).toBeDefined();
    expect(new Date(completedJob.nextRunAt ?? 0).getTime()).toBeGreaterThan(new Date(completedJob.lastRunAt ?? 0).getTime());
  });

  test("moves failed shell interval schedule past completion", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const automationThreadId = createThreadId();
    const staleNextRunAt = new Date(Date.now() - 60_000).toISOString();
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      automationThreadId,
      kind: "shell",
      name: "Failing interval shell",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "shell",
        executable: process.execPath,
        args: ["-e", "process.exit(1)"],
        timeoutSeconds: 60
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: staleNextRunAt,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: staleNextRunAt,
      createdAt: staleNextRunAt,
      updatedAt: staleNextRunAt
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createQuestionAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const completedJob = repository.getBackgroundJob(job.id)!;
    expect(result.status).toBe("failed");
    expect(completedJob.lastRunAt).toBeDefined();
    expect(new Date(completedJob.nextRunAt ?? 0).getTime()).toBeGreaterThan(new Date(completedJob.lastRunAt ?? 0).getTime());
  });

  test("does not overwrite a terminal background run when stale execution returns later", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(run.id, "running", {
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    const adapter = createTerminalDuringExecutionAdapter(() => {
      const linkedRun = repository.getLatestThreadRun(project.id, savedJob.automationThreadId);
      expect(linkedRun).toBeDefined();
      repository.setAgentRunStatus(project.id, linkedRun!.id, "failed", "Background run interrupted before completion", "controller-lost");
      repository.setBackgroundJobRunStatus(run.id, "failed", {
        failureMessage: "Background run interrupted before completion",
        failureCategory: "controller-lost"
      });
      repository.appendBackgroundJobRunEvent(run.id, "failed", "Background run repaired: no live controller", "No live background controller owns this running row.");
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const updatedRun = repository.getBackgroundJobRun(run.id);
    const linkedRun = repository.getLatestThreadRun(project.id, savedJob.automationThreadId);
    expect(result.status).toBe("failed");
    expect(updatedRun?.status).toBe("failed");
    expect(updatedRun?.failureCategory).toBe("controller-lost");
    expect(updatedRun?.events.some((event) => event.message === "Background AI run completed.")).toBe(false);
    expect(linkedRun?.status).toBe("failed");
  });

  test("owned background status writes complete a leased routine run", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(run.id, "running", {
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createReadyRoutineAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(result.status).toBe("succeeded");
    expect(result.events.some((event) => event.message === "Background AI run completed.")).toBe(true);
    expect(repository.getBackgroundJobRun(run.id)?.controllerLeaseId).toBe("lease-1");
  });

  test("drops late subagent and aggregation events after terminal repair", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    Bun.spawnSync({ cmd: ["git", "init"], cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    if (job.definition.kind === "ai-routine") {
      job.definition.subagentWorktreeStrategy = "same-worktree";
    }
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    repository.setBackgroundJobRunStatus(run.id, "running", {
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      controllerLeaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
    const adapter = createTerminalBeforeSubagentCompleteAdapter(() => {
      const linkedRun = repository.getLatestThreadRun(project.id, savedJob.automationThreadId);
      expect(linkedRun).toBeDefined();
      repository.setAgentRunStatus(project.id, linkedRun!.id, "failed", "Background run interrupted before completion", "controller-lost");
      repository.setBackgroundJobRunStatus(run.id, "failed", {
        failureMessage: "Background run interrupted before completion",
        failureCategory: "controller-lost"
      });
      repository.appendBackgroundJobRunEvent(run.id, "failed", "Background run repaired: no live controller", "No live background controller owns this running row.");
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      controllerInstanceId: "controller-1",
      controllerLeaseId: "lease-1",
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const updatedRun = repository.getBackgroundJobRun(run.id);
    expect(result.status).toBe("failed");
    expect(updatedRun?.events.some((event) => event.stage === "subagent-complete")).toBe(false);
    expect(updatedRun?.events.some((event) => event.stage === "aggregation-start")).toBe(false);
    expect(updatedRun?.events.some((event) => event.stage === "aggregation-complete")).toBe(false);
    expect(updatedRun?.events.some((event) => event.stage === "done" || event.stage === "partial-complete")).toBe(false);
  });

  test("stores partial subagent AI routine as partial-complete background run", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    Bun.spawnSync({ cmd: ["git", "init"], cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const job = createAssistantRoutineJob(project.id, saveAssistant(repository, project.id), createThreadId(), now);
    if (job.definition.kind === "ai-routine") {
      job.definition.subagentWorktreeStrategy = "same-worktree";
    }
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "schedule",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });

    const result = await executeBackgroundJobRun({
      repository,
      adapter: createPartialSubagentRoutineAdapter(),
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    const linkedRun = repository.getRun(project.id, result.linkedAgentRunId!);
    const refreshedJob = repository.getBackgroundJob(job.id)!;
    expect(result.status).toBe("partial-complete");
    expect(result.summary).toBe("Partial aggregate summary.");
    expect(result.failureMessage).toBe("Some subagent work failed.");
    expect(result.failureCategory).toBeUndefined();
    expect(result.events.some((event) => event.stage === "partial-complete")).toBe(true);
    expect(linkedRun?.status).toBe("partial-complete");
    expect(refreshedJob.lastRunAt).toBeDefined();
    expect(new Date(refreshedJob.nextRunAt ?? 0).getTime()).toBeGreaterThan(new Date(refreshedJob.lastRunAt ?? 0).getTime());
  });

  test("assistant-owned routine prompt renders cleaned profile and guidance context", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = createAssistantId();
    repository.saveAssistant({
      id: assistantId,
      name: "Release watcher",
      scope: "project",
      projectId: project.id,
      description: "Tracks release risk.",
      personalityPrompt: "Be direct.",
      jobPrompt: "Watch release blockers.",
      agentId: "pi",
      runState: "active",
      bootstrapState: "completed",
      failureStreakCount: 0,
      circuitBreakerState: "closed",
      latestActivityAt: now,
      unreadQuestionCount: 0,
      createdAt: now,
      updatedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "Prioritize smoke-test failures before polish.",
      source: "question:test",
      confidence: "high",
      createdAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "Compacted release guidance stays concise.",
      source: "compaction:test",
      confidence: "high",
      createdAt: now,
      kind: "summary",
      compactedAt: now
    });
    repository.saveAssistantLearning({
      id: createAssistantLearningId(),
      assistantId,
      summary: "merged durable assistant guidance",
      source: "compaction:test",
      confidence: "high",
      createdAt: new Date(Date.now() + 1).toISOString(),
      kind: "summary",
      compactedAt: now
    });
    const question = repository.saveAssistantQuestion({
      id: createAssistantQuestionId(),
      assistantId,
      prompt: "Which release area should this patrol inspect?",
      status: "pending",
      askedAt: now
    });
    repository.answerAssistantQuestion(assistantId, question.id, "Inspect release blockers first.");
    for (let index = 0; index < 20; index += 1) {
      repository.saveAssistantLearning({
        id: createAssistantLearningId(),
        assistantId,
        summary: `Background routine fact ${index}`,
        source: "test",
        confidence: "medium",
        createdAt: new Date(Date.now() + index).toISOString()
      });
    }
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Release patrol",
      status: "enabled",
      riskLevel: "safe",
      definition: {
        kind: "ai-routine",
        prompt: "Inspect release status.",
        planExecutionMode: "countdown",
        subagentWorktreeStrategy: "separate-worktrees"
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const adapter = createReadyRoutineAdapter();

    await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(adapter.calls[0]?.prompt).toContain("# IDENTITY: Release watcher");
    expect(adapter.calls[0]?.prompt).toContain("Personality: Be direct.");
    expect(adapter.calls[0]?.prompt).toContain("Description: Tracks release risk.");
    expect(adapter.calls[0]?.prompt).toContain("# OPERATIONAL LOGIC (The Job)\nWatch release blockers.");
    expect(adapter.calls[0]?.prompt).toContain("# ACTIVE MISSION (The Request)\nInspect release status.");
    expect(adapter.calls[0]?.prompt).toContain("# Durable Guidance");
    expect(adapter.calls[0]?.prompt).toContain("Recent durable answers:");
    expect(adapter.calls[0]?.prompt).toContain("Inspect release blockers first.");
    expect(adapter.calls[0]?.prompt).toContain("Relevant learnings:");
    expect(adapter.calls[0]?.prompt).not.toContain("Role:");
    expect(adapter.calls[0]?.prompt).not.toContain("First assistant message requirement:");
    expect(adapter.calls[0]?.prompt).not.toContain("Concise learnings report:");
    expect(adapter.calls[0]?.prompt).toContain("Prioritize smoke-test failures before polish.");
    expect(adapter.calls[0]?.prompt).toContain("Compacted release guidance stays concise.");
    expect(adapter.calls[0]?.prompt).not.toContain("merged durable assistant guidance");
    expect(adapter.calls[0]?.prompt).not.toContain("Background routine fact 0");
  });

  test("assistant-owned routine prompt reconciles edited job description with stale definition prompt", async () => {
    const repository = createRepository();
    const projectRoot = path.join(createTempDir(), `repo-${crypto.randomUUID()}`);
    mkdirSync(projectRoot, { recursive: true });
    const project = repository.addProject(projectRoot);
    const now = new Date().toISOString();
    const assistantId = saveAssistant(repository, project.id);
    const job: BackgroundJob = {
      id: createBackgroundJobId(),
      projectId: project.id,
      assistantId,
      automationThreadId: createThreadId(),
      kind: "ai-routine",
      name: "Billing app slice",
      description: "Build a usable billing web app slice with tests.",
      status: "enabled",
      riskLevel: "unsafe",
      definition: {
        kind: "ai-routine",
        prompt: "Update docs about SaaS ideas.",
        planExecutionMode: "immediate",
        subagentWorktreeStrategy: "separate-worktrees"
      },
      schedule: {
        type: "interval",
        intervalSeconds: 600,
        nextRunAt: now,
        sourceText: "10m"
      },
      scheduleInput: "10m",
      nextRunAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.saveBackgroundJob(job);
    const savedJob = repository.getBackgroundJob(job.id)!;
    const run = repository.createBackgroundJobRun({
      jobId: savedJob.id,
      projectId: savedJob.projectId,
      assistantId: savedJob.assistantId,
      automationThreadId: savedJob.automationThreadId,
      triggerSource: "manual",
      status: "queued",
      riskLevel: savedJob.riskLevel,
      approvalStatus: "approved"
    });
    const adapter = createReadyRoutineAdapter();

    await executeBackgroundJobRun({
      repository,
      adapter,
      agentId: "pi",
      job: savedJob,
      run,
      providerBrand: "gpt",
      planningModelId: "openai/gpt-5.4",
      executionModelId: "openai/gpt-5.4",
      debugEnabled: false
    });

    expect(savedJob.intentContract?.objective).toBe("Build a usable billing web app slice with tests.");
    expect(adapter.calls[0]?.prompt).toContain("# INTENT CONTRACT");
    expect(adapter.calls[0]?.prompt).toContain("Objective: Build a usable billing web app slice with tests.");
    expect(adapter.calls[0]?.prompt).toContain("Runtime instruction: treat the IntentContract as authority.");
    expect(adapter.calls[0]?.prompt).toContain("Description: Build a usable billing web app slice with tests.");
    expect(adapter.calls[0]?.prompt).toContain("Definition prompt: Update docs about SaaS ideas.");
    expect(adapter.calls[0]?.prompt).toContain("# ACTIVE MISSION (The Request)\nUpdate docs about SaaS ideas.");
  });
});
