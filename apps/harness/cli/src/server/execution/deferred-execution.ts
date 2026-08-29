import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import type { AssistantManager } from "../../assistant-manager";
import type { BackgroundJobScheduler } from "../../background-job-scheduler";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import { emitAssistantSummaryDeltaToAll } from "../automation/assistant-actions";
import { safeLaunchBackgroundJobRun } from "../automation/background-runs";
import { emitNotificationsUpdatedToAll } from "../automation/background-events";
import type { BackgroundRunControl, HarnessConnection } from "../core/contracts";
import { emitControlEvent } from "../transport/events";
import { syncBrowserApprovalNotifications } from "../automation/notifications";
import { emitRunUpdatedByIdToAll, emitRunUpdatedToAll, emitThreadMessageAppendedToAll } from "../workspace/project-events";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { TokenUsageTotals } from "@hyperfocus/ai-core/protocol";

export async function releaseDeferredExecutionState(
  requestId: string,
  runtime: WorkspaceRuntimeStore,
  repository: WorkspaceRepository,
  adapter: PiAgentAdapter,
  runtimeRegistry: AgentRuntimeRegistry,
  assistantManager: AssistantManager,
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>,
  backgroundRunControllers: Map<string, BackgroundRunControl>,
  scheduler: BackgroundJobScheduler,
  tokenUsageSession: TokenUsageTotals
) {
  for (const entry of repository.promoteDeferredPlanningQuestions()) {
    let project = repository.getProject(entry.projectId);
    runtime.upsertPersistedProject(project);
    const run = repository.getRun(entry.projectId, entry.runId);
    const pendingQuestion = run?.questions.find((question) => question.status === "pending");
    if (pendingQuestion) {
      project = repository.appendMessage(entry.projectId, "assistant", pendingQuestion.prompt, {
        threadId: entry.threadId
      });
      runtime.upsertPersistedProject(project);
    }

    emitRunUpdatedByIdToAll(connections, requestId, repository, entry.projectId, entry.runId);
    if (pendingQuestion) emitThreadMessageAppendedToAll(connections, requestId, runtime, repository,
      entry.projectId, entry.threadId);
  }

  const promotedAssistantQuestions = repository.promoteDeferredAssistantQuestions();
  if (promotedAssistantQuestions.length > 0) {
    for (const question of promotedAssistantQuestions) {
      emitControlEvent(connections, { type: "assistant.question.updated", requestId, payload: { question } });
    }
    emitAssistantSummaryDeltaToAll(connections, repository,
      promotedAssistantQuestions.map((question) => question.assistantId));
  }

  for (const entry of repository.promoteDeferredBrowserApprovals()) {
    const project = repository.getProject(entry.projectId);
    runtime.upsertPersistedProject(project);
    syncBrowserApprovalNotifications(repository, project);
    emitRunUpdatedToAll(connections, requestId, project);
  }

  for (const assistant of repository.getAssistantsAwaitingBootstrap()) {
    assistantManager.scheduleJobBootstrapCheck(assistant.id, "pending-bootstrap-release");
    assistantManager.queueAssistantBootstrap(assistant.id);
  }

  await assistantManager.drainPendingReprioritizes();
  assistantManager.drainPendingLearningCompactions();

  if (!repository.hasActiveForegroundAgentRun()) {
    await Promise.all(
      repository.getQueuedBackgroundJobRuns().map((queuedRun) =>
        safeLaunchBackgroundJobRun(
          connections,
          repository,
          runtimeRegistry,
          runtime,
          backgroundRunControllers,
          assistantManager,
          queuedRun.id,
          tokenUsageSession
        )
      )
    );
  }

  await scheduler.tick(false);
  emitNotificationsUpdatedToAll(connections, requestId, repository.loadNotificationInboxState());
}
