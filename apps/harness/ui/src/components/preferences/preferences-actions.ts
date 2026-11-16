import { createRequestId } from "@hyperfocus/ai-core/protocol";
import { createSignal } from "solid-js";
import type { SharedAiPreferences } from "@hyperfocus/ai-core/runtime";
import { persistMergedLocalPreferences, type ProviderConnectionProvider } from "../../harness-store";
import { normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { normalizeThemePreference } from "../../theme/theme-model";
import { pushToast } from "../../toast-store";
import type { PreferencesPanelModel } from "../preferences-modal";
import { parsePreferencesImport } from "./preferences-import";
import { createExportablePreferencesSnapshot, createLocalPreferencesSnapshot } from "./preferences-snapshot";

export function createPreferencesPersistenceActions(model: PreferencesPanelModel) {
  const { store, state, sendCommand } = model;
  const [importFeedback, setImportFeedback] = createSignal<{ failed: boolean; message: string }>();
  function handleSave(options: { provider?: ProviderConnectionProvider; sharedAiPreferences?: SharedAiPreferences } = {}) {
    const openAiApiKey = options.provider === "openai" ? state.openAiApiKeyDraft.trim() || undefined : undefined;
    const googleApiKey = options.provider === "google" ? state.googleApiKeyDraft.trim() || undefined : undefined;
    const anthropicApiKey = options.provider === "anthropic" ? state.anthropicApiKeyDraft.trim() || undefined : undefined;
    const localPreferences = createLocalPreferencesSnapshot(state);

    persistMergedLocalPreferences(localPreferences);
    store.commitLocalPreferences(localPreferences);

    sendCommand({
      type: "preferences.save",
      requestId: createRequestId(),
      payload: {
        sharedAiPreferences: options.sharedAiPreferences,
        openAiApiKey,
        googleApiKey,
        anthropicApiKey,
        providerBrand: state.providerBrand,
        debugEnabled: state.debugEnabled,
        tracePanelDefaultOpen: state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault: state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault: state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault: state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault: state.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault: state.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault: state.autoArchiveCompletedThreadsDefault,
        memoryBankEnabledDefault: state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: state.checkCliUpdatesDefault
      }
    });

  }

  function updateSavedPreference(update: () => void) {
    update();
    handleSave();
  }

  function saveProviderKey(provider: ProviderConnectionProvider) {
    handleSave({ provider });
  }

  function updateAiDefaults(update: () => void) {
    update();
    const providerIds = { gpt: "openai", gemini: "google", claude: "anthropic" } as const;
    handleSave({ sharedAiPreferences: {
      version: 1,
      providerId: providerIds[state.providerBrand],
      reasoning: state.selectedReasoningStrength === "extra-high" ? "xhigh" : state.selectedReasoningStrength,
    } });
  }

  function handleClearApiKey() {
    const clearedPreferences = createLocalPreferencesSnapshot(state, {
      openAiApiKey: undefined,
      googleApiKey: undefined,
      anthropicApiKey: undefined,
    });
    persistMergedLocalPreferences(clearedPreferences);
    store.commitLocalPreferences(clearedPreferences);
    sendCommand({ type: "preferences.clearApiKey", requestId: createRequestId() });
  }

  function handleExportPreferences() {
    const payload = createExportablePreferencesSnapshot(state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pi-harness-preferences.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportPreferences(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      setImportFeedback(undefined);
      const parsed = parsePreferencesImport(await file.text());
      const importedThemePreference = parsed.themePreference === undefined
        ? state.themePreference
        : normalizeThemePreference(parsed.themePreference);

      store.commitLocalPreferences({
        providerBrand: parsed.providerBrand,
        debugEnabled: parsed.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault: parsed.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault: parsed.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: parsed.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault: parsed.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault: parsed.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault: parsed.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault: parsed.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault: parsed.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault: parsed.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: parsed.checkCliUpdatesDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(parsed.appHotkeyPreferences ?? state.appHotkeyPreferences),
        themePreference: importedThemePreference,
        numericRightAlignmentEnabled: parsed.numericRightAlignmentEnabled,
        experienceMode: parsed.experienceMode
      });
      persistMergedLocalPreferences({
        providerBrand: parsed.providerBrand ?? state.providerBrand,
        debugEnabled: parsed.debugEnabled ?? state.debugEnabled,
        tracePanelDefaultOpen: parsed.tracePanelDefaultOpen ?? state.tracePanelDefaultOpen,
        subagentWorktreeStrategyDefault: parsed.subagentWorktreeStrategyDefault ?? state.subagentWorktreeStrategyDefault,
        blockChatOnDirtyGitDefault: parsed.blockChatOnDirtyGitDefault ?? state.blockChatOnDirtyGitDefault,
        dirtyGitChangeLimitDefault: parsed.dirtyGitChangeLimitDefault ?? state.dirtyGitChangeLimitDefault,
        autoCompactContextThresholdPercentDefault:
          parsed.autoCompactContextThresholdPercentDefault ?? state.autoCompactContextThresholdPercentDefault,
        planExecutionModeDefault: parsed.planExecutionModeDefault ?? state.planExecutionModeDefault,
        planExecutionDelaySecondsDefault: parsed.planExecutionDelaySecondsDefault ?? state.planExecutionDelaySecondsDefault,
        singleAgentModelPreferenceDefault:
          parsed.singleAgentModelPreferenceDefault ?? state.singleAgentModelPreferenceDefault,
        subagentModelPreferenceDefault: parsed.subagentModelPreferenceDefault ?? state.subagentModelPreferenceDefault,
        correctnessIterationModeDefault: parsed.correctnessIterationModeDefault ?? state.correctnessIterationModeDefault,
        backgroundJobApprovalPolicyDefault:
          parsed.backgroundJobApprovalPolicyDefault ?? state.backgroundJobApprovalPolicyDefault,
        assistantAutoApproveNonBlockingQuestionsDefault:
          parsed.assistantAutoApproveNonBlockingQuestionsDefault ??
          state.assistantAutoApproveNonBlockingQuestionsDefault,
        assistantCongestionControlEnabledDefault:
          parsed.assistantCongestionControlEnabledDefault ?? state.assistantCongestionControlEnabledDefault,
        assistantMaxCongestionDefault:
          parsed.assistantMaxCongestionDefault ?? state.assistantMaxCongestionDefault,
        maxBackgroundJobsDefault:
          parsed.maxBackgroundJobsDefault ?? state.maxBackgroundJobsDefault,
        autoArchiveCompletedThreadsDefault:
          parsed.autoArchiveCompletedThreadsDefault ?? state.autoArchiveCompletedThreadsDefault,
        backgroundJobNotificationsEnabled: parsed.backgroundJobNotificationsEnabled ?? state.backgroundJobNotificationsEnabled,
        memoryBankEnabledDefault: parsed.memoryBankEnabledDefault ?? state.memoryBankEnabledDefault,
        memoryBankRecordRunsDefault: parsed.memoryBankRecordRunsDefault ?? state.memoryBankRecordRunsDefault,
        checkCliUpdatesDefault: parsed.checkCliUpdatesDefault ?? state.checkCliUpdatesDefault,
        selectedReasoningStrength: parsed.selectedReasoningStrength ?? state.selectedReasoningStrength,
        selectedFastMode: parsed.selectedFastMode ?? state.selectedFastMode,
        appHotkeyPreferences: normalizeAppHotkeyPreferences(parsed.appHotkeyPreferences ?? state.appHotkeyPreferences),
        themePreference: importedThemePreference,
        numericRightAlignmentEnabled: parsed.numericRightAlignmentEnabled ?? state.numericRightAlignmentEnabled,
        experienceMode: parsed.experienceMode ?? state.experienceMode
      });
      pushToast("Preferences imported", "Local defaults updated.");
      setImportFeedback({ failed: false, message: "Preferences imported. Local defaults updated; provider keys were not imported." });
    } catch (error) {
      pushToast("Import failed", error instanceof Error ? error.message : "Invalid JSON file.", "error");
      setImportFeedback({ failed: true, message: `Preferences were not imported. ${error instanceof Error && error.message.startsWith("No recognized") ? error.message : "Choose a valid preferences JSON file and try again."}` });
    } finally {
      input.value = "";
    }
  }

  return {
    handleSave, updateSavedPreference, updateAiDefaults, saveProviderKey, handleClearApiKey,
    handleExportPreferences, handleImportPreferences, importFeedback,
  };
}

export function createPreferencesOperationalActions(model: PreferencesPanelModel) {
  const { store, state, sendCommand, workspaceRuleDraft, workspaceMemoryDraft } = model;
  function handleBranchfsCleanup() {
    const projectId = state.workspace.activeProjectId;
    if (!projectId) {
      pushToast("No active project", "Open a project before cleaning BranchFS.", "error");
      return;
    }
    sendCommand({
      type: "branchfs.cleanup",
      requestId: createRequestId(),
      payload: {
        projectId,
        mode: "all"
      }
    });
  }

  function handlePauseAssistantBackgroundJobs() {
    sendCommand({
      type: "background-job.pause-assistant-jobs",
      requestId: createRequestId()
    });
  }

  function handleSaveWorkspaceContext() {
    sendCommand({
      type: "workspace.context.save",
      requestId: createRequestId(),
      payload: {
        rulesContent: workspaceRuleDraft() || undefined,
        memorySummaryContent: workspaceMemoryDraft() || undefined
      }
    });
    pushToast("Workspace rules saved", "Explicit workspace rules updated.");
  }

  function handleResetPanelSizes() {
    store.resetMainPanelSizes();
    pushToast("Panel sizes reset", "Main panel widths restored to defaults.");
  }

  function handleTestProvider(provider: ProviderConnectionProvider, apiKey: string) {
    store.beginProviderConnectionTest(provider);
    sendCommand({
      type: "preferences.testProviderConnection",
      requestId: createRequestId(),
      payload: {
        provider,
        apiKey: apiKey.trim() || undefined
      }
    });
  }

  function keyStatus(provider: ProviderConnectionProvider) {
    const test = state.providerConnectionTests[provider];
    if (test.status === "pending") {
      return "Testing";
    }
    if (test.status === "ready") {
      return "Ready";
    }
    if (test.status === "failed") {
      return "Failed";
    }
    if (provider === "openai" && state.openAiApiKeyDraft.trim()) {
      return state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "google" && state.googleApiKeyDraft.trim()) {
      return state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey ? "Stored + draft" : "Draft only";
    }
    if (provider === "anthropic" && state.anthropicApiKeyDraft.trim()) {
      return state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey ? "Stored + draft" : "Draft only";
    }
    if (
      (provider === "openai" && (state.hasStoredOpenAiApiKey || state.hasLocalOpenAiApiKey)) ||
      (provider === "google" && (state.hasStoredGoogleApiKey || state.hasLocalGoogleApiKey)) ||
      (provider === "anthropic" && (state.hasStoredAnthropicApiKey || state.hasLocalAnthropicApiKey))
    ) {
      return "Stored";
    }
    return "No key";
  }

  return {
    handleBranchfsCleanup, handlePauseAssistantBackgroundJobs, handleSaveWorkspaceContext,
    handleResetPanelSizes, handleTestProvider, keyStatus,
  };
}

export type PreferencesOperationalActions = ReturnType<typeof createPreferencesOperationalActions>;
