import type { ServerCommandContext } from "./context";
import { createSharedAiPreferencesStore, type SharedAiPreferencesStore } from "@hyperfocus/ai-runtime/preferences";
import { sendEvent } from "../transport/events";
import { applyAdapterAutoCompactionThreshold, setRepositoryAutoArchiveCompletedThreadsDefault, testProviderConnection } from "../workspace/preferences";
import { emitProjectUpdated, emitWorkspaceUpdated } from "../workspace/project-events";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

type PreferencesCommandContext = Pick<ServerCommandContext, "ws" | "runtime" | "repository" | "adapter" | "runtimeRegistry" | "getCurrentPreferencesState" | "emitSetupRefresh"> & { sharedAiPreferencesStore?: SharedAiPreferencesStore };

export async function handlePreferencesCommand(command: ClientCommand, context: PreferencesCommandContext) {
  const { ws, runtime, repository, adapter, runtimeRegistry, getCurrentPreferencesState, emitSetupRefresh } = context;
  switch (command.type) {
case "project.mode.select": {
      const updatedProject = repository.setProjectSelectedMode(command.payload.projectId, command.payload.modeId);
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, updatedProject, repository);
      return;
    }
case "mode.save": {
      if (command.payload.scope === "workspace") {
        const workspace = repository.saveMode("workspace", command.payload.mode);
        runtime.replaceWorkspaceState(workspace);
        emitWorkspaceUpdated(ws, command.requestId, runtime, repository);
        return;
      }

      const projectId = command.payload.projectId;
      if (!projectId) throw new Error("projectId is required for project mode save");
      const updatedProject = repository.saveMode("project", command.payload.mode, projectId);
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, projectId, updatedProject, repository);
      return;
    }
case "mode.delete": {
      if (command.payload.scope === "workspace") {
        const workspace = repository.deleteMode("workspace", command.payload.modeId);
        runtime.replaceWorkspaceState(workspace);
        emitWorkspaceUpdated(ws, command.requestId, runtime, repository);
        return;
      }

      const projectId = command.payload.projectId;
      if (!projectId) throw new Error("projectId is required for project mode delete");
      const updatedProject = repository.deleteMode("project", command.payload.modeId, projectId);
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, projectId, updatedProject, repository);
      return;
    }
case "workspace.context.save": {
      const workspace = repository.saveWorkspaceContext({
        rulesContent: command.payload.rulesContent,
        memorySummaryContent: command.payload.memorySummaryContent
      });
      runtime.replaceWorkspaceState(workspace);
      emitWorkspaceUpdated(ws, command.requestId, runtime, repository);
      return;
    }
case "project.context.save": {
      const updatedProject = repository.saveProjectContext(command.payload.projectId, {
        rulesContent: command.payload.rulesContent,
        threadMemorySummaryContent: command.payload.threadMemorySummaryContent
      });
      runtime.upsertPersistedProject(updatedProject);
      emitProjectUpdated(ws, command.requestId, command.payload.projectId, updatedProject, repository);
      return;
    }
case "preferences.save": {
      // Only the explicit AI-default controls publish machine-level preferences.
      // Other preference saves must never overwrite defaults from another app.
      if (command.payload.sharedAiPreferences) {
        (context.sharedAiPreferencesStore ?? createSharedAiPreferencesStore()).write(command.payload.sharedAiPreferences);
      }
      if (command.payload.openAiApiKey) {
        repository.setStoredOpenAiApiKey(command.payload.openAiApiKey);
        adapter.setApiKey("openai", command.payload.openAiApiKey);
      }

      if (command.payload.googleApiKey) {
        repository.setStoredGoogleApiKey(command.payload.googleApiKey);
        adapter.setApiKey("google", command.payload.googleApiKey);
      }

      if (command.payload.anthropicApiKey) {
        repository.setStoredAnthropicApiKey(command.payload.anthropicApiKey);
        adapter.setApiKey("anthropic", command.payload.anthropicApiKey);
      }

      repository.setProviderBrand(command.payload.providerBrand);
      repository.setDebugEnabledDefault(command.payload.debugEnabled);
      repository.setTracePanelDefaultOpen(command.payload.tracePanelDefaultOpen);
      repository.setSubagentWorktreeStrategyDefault(command.payload.subagentWorktreeStrategyDefault);
      repository.setBlockChatOnDirtyGitDefault(command.payload.blockChatOnDirtyGitDefault);
      repository.setDirtyGitChangeLimitDefault(command.payload.dirtyGitChangeLimitDefault);
      repository.setAutoCompactContextThresholdPercentDefault(command.payload.autoCompactContextThresholdPercentDefault);
      repository.setPlanExecutionModeDefault(command.payload.planExecutionModeDefault);
      repository.setPlanExecutionDelaySecondsDefault(command.payload.planExecutionDelaySecondsDefault);
      repository.setSingleAgentModelPreferenceDefault(
        command.payload.singleAgentModelPreferenceDefault ?? repository.getSingleAgentModelPreferenceDefault()
      );
      repository.setSubagentModelPreferenceDefault(
        command.payload.subagentModelPreferenceDefault ?? repository.getSubagentModelPreferenceDefault()
      );
      repository.setCorrectnessIterationModeDefault(command.payload.correctnessIterationModeDefault);
      repository.setBackgroundJobApprovalPolicyDefault(command.payload.backgroundJobApprovalPolicyDefault);
      repository.setAssistantAutoApproveNonBlockingQuestionsDefault(
        command.payload.assistantAutoApproveNonBlockingQuestionsDefault ??
          repository.getAssistantAutoApproveNonBlockingQuestionsDefault()
      );
      repository.setAssistantCongestionControlEnabledDefault(
        command.payload.assistantCongestionControlEnabledDefault ?? repository.getAssistantCongestionControlEnabledDefault()
      );
      repository.setAssistantMaxCongestionDefault(
        command.payload.assistantMaxCongestionDefault ?? repository.getAssistantMaxCongestionDefault()
      );
      repository.setMaxBackgroundJobsDefault(
        command.payload.maxBackgroundJobsDefault ?? repository.getMaxBackgroundJobsDefault()
      );
      setRepositoryAutoArchiveCompletedThreadsDefault(repository, command.payload.autoArchiveCompletedThreadsDefault ?? false);
      repository.setMemoryBankEnabledDefault(
        command.payload.memoryBankEnabledDefault ?? repository.getMemoryBankEnabledDefault()
      );
      repository.setMemoryBankRecordRunsDefault(
        command.payload.memoryBankRecordRunsDefault ?? repository.getMemoryBankRecordRunsDefault()
      );
      repository.setCheckCliUpdatesDefault(command.payload.checkCliUpdatesDefault ?? repository.getCheckCliUpdatesDefault());
      applyAdapterAutoCompactionThreshold(adapter, command.payload.autoCompactContextThresholdPercentDefault);
      await runtimeRegistry.refreshAll();
      const preferences = getCurrentPreferencesState();
      const setup = await emitSetupRefresh(command.requestId);

      sendEvent(ws, {
        type: "preferences.saved",
        requestId: command.requestId,
        payload: {
          ...preferences,
          setup
        }
      });
      return;
    }
case "preferences.testProviderConnection": {
      const result = await testProviderConnection({
        provider: command.payload.provider,
        apiKey: command.payload.apiKey,
        repository
      });

      sendEvent(ws, {
        type: "preferences.providerConnectionTested",
        requestId: command.requestId,
        payload: result
      });
      return;
    }
case "preferences.clearApiKey": {
      repository.clearStoredOpenAiApiKey();
      repository.clearStoredGoogleApiKey();
      repository.clearStoredAnthropicApiKey();
      adapter.setApiKey("openai", undefined);
      adapter.setApiKey("google", undefined);
      adapter.setApiKey("anthropic", undefined);
      await runtimeRegistry.refreshAll();
      const preferences = getCurrentPreferencesState();
      const setup = await emitSetupRefresh(command.requestId);

      sendEvent(ws, {
        type: "preferences.apiKeyCleared",
        requestId: command.requestId,
        payload: {
          ...preferences,
          setup
        }
      });
      return;
    }
    default:
      throw new Error(`Unsupported preferences command: ${command.type}`);
  }
}
