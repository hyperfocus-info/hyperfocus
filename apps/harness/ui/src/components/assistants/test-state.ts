import type { AssistantLearning, AssistantLogEntry, AssistantTodo, BackgroundJob, BackgroundJobRun, BackgroundJobsState } from "@hyperfocus/ai-core/protocol";
import { createEmptyAssistantsState, type AssistantWorkloadPageState } from "../../harness-store";
import { seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
export function seedAssistantDetailState(input: {
  assistantId: string;
  projectId: string;
  learnings?: AssistantLearning[];
  logs?: AssistantLogEntry[];
  todos?: AssistantTodo[];
  jobs?: BackgroundJob[];
  runs?: BackgroundJobRun[];
  workloadPage?: AssistantWorkloadPageState;
  backgroundJobs?: BackgroundJobsState;
  selectedTab?: "chat" | "todos" | "questions" | "jobs" | "log" | "config" | "learnings";
}) {
  const now = new Date().toISOString();
  const project = createViewProjectFixture({ id: input.projectId });
  seedHarnessStoreForTests(
    createHarnessStateFixture({
      activeLeftTab: "assistants",
      activeSurface: "assistants",
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        ...createEmptyAssistantsState(),
        assistants: [
          {
            id: input.assistantId,
            name: "Repo helper",
            scope: "project",
            projectId: project.id,
            description: "Handles repo tasks",
            personalityPrompt: "Be helpful",
            jobPrompt: "Do repo work",
            agentId: "pi",
            modeId: "implement",
            executionModelId: "openai/gpt-5.4",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ],
        selectedAssistantId: input.assistantId,
        loadedDetailAssistantIds: [input.assistantId],
        selectedTab: input.selectedTab ?? "learnings",
        learnings: input.learnings ?? [],
        logs: input.logs ?? [],
        todos: input.todos ?? [],
        jobs: input.jobs ?? [],
        runs: input.runs ?? [],
        workloadPagesByAssistantId: input.workloadPage
          ? { [input.assistantId]: input.workloadPage }
          : {}
      },
      ...(input.backgroundJobs ? { backgroundJobs: input.backgroundJobs } : {})
    })
  );
}
