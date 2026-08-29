import type { AgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import type { AssistantManagerCallbacks, AssistantManagerContext, AssistantManagerOptions } from "./assistant-manager/shared";
import type { WorkspaceRepository } from "./workspace-repository";
import { createAssistantBootstrapOperations } from "./assistant-manager/operations/bootstrap";
import { createAssistantChatOperations } from "./assistant-manager/operations/chat";
import { createAssistantLearningOperations } from "./assistant-manager/operations/learning";
import { createAssistantMaintenanceOperations } from "./assistant-manager/operations/maintenance";
import { createAssistantPromptOperations } from "./assistant-manager/operations/prompt";

export { renderAssistantPromptContext } from "./assistant-manager/shared";
export { renderAssistantPromptMemoryBlock } from "./assistant-manager/shared";
export { selectAssistantPromptLearnings } from "./assistant-learning-policy";
export { selectAssistantPromptQuestions } from "./assistant-question-policy";

export function createAssistantManager(
  repository: WorkspaceRepository,
  runtimeRegistry: AgentRuntimeRegistry,
  callbacks: AssistantManagerCallbacks,
  options: AssistantManagerOptions = {}
) {
  const context: AssistantManagerContext = {
    repository, runtimeRegistry, callbacks,
    reprioritizeStates: new Map(), reprioritizeFlights: new Set(), bootstrapFlights: new Map(),
    bootstrapFlightState: new WeakMap(), queuedBootstrapFlights: new WeakMap(), jobBootstrapTimers: new Map(),
    learningCompactions: new Map(), pendingLearningCompactions: new Map(), invalidatedAssistants: new Set(),
    chatFlights: new Map(), chatCompletions: new Set(),
    reprioritizeDebounceMs: Math.max(0, options.reprioritizeDebounceMs ?? 800), shuttingDown: false,
  };
  const prompt = createAssistantPromptOperations(context);
  const learning = createAssistantLearningOperations(context, prompt);
  const maintenance = createAssistantMaintenanceOperations(context, { ...prompt, ...learning });
  const bootstrap = createAssistantBootstrapOperations(context, { ...prompt, ...learning, ...maintenance });
  const chat = createAssistantChatOperations(context, { ...prompt, ...learning, ...maintenance, ...bootstrap });
  return {
    bootstrapAssistant: bootstrap.bootstrapAssistant,
    queueAssistantBootstrap: bootstrap.queueAssistantBootstrap,
    recoverStaleBootstrapRuns: bootstrap.recoverStaleBootstrapRuns,
    scheduleJobBootstrapCheck: bootstrap.scheduleJobBootstrapCheck,
    recoverIdleJobBootstrapChecks: bootstrap.recoverIdleJobBootstrapChecks,
    maybeAskJobBootstrap: bootstrap.maybeAskJobBootstrap,
    sendAssistantChat: chat.sendAssistantChat,
    answerQuestion: chat.answerQuestion,
    answerQuestions: chat.answerQuestions,
    retryBootstrap: chat.retryBootstrap,
    recoverAssistant: chat.recoverAssistant,
    handleBackgroundJobRunOutcome: chat.handleBackgroundJobRunOutcome,
    scheduleReprioritize: maintenance.scheduleReprioritize,
    beginShutdown: maintenance.beginShutdown,
    settleShutdown: maintenance.settleShutdown,
    drainPendingReprioritizes: maintenance.drainPendingReprioritizes,
    drainPendingLearningCompactions: maintenance.drainPendingLearningCompactions,
    cleanupStaleAssistantQuestions: maintenance.cleanupStaleAssistantQuestions,
    invalidateAssistant: maintenance.invalidateAssistant,
  };
}

export type AssistantManager = ReturnType<typeof createAssistantManager>;
