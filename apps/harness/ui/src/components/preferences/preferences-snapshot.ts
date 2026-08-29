import { type LocalPreferencesState, harnessStore } from "../../harness-store";

type PreferencesState = typeof harnessStore.state;

export function createLocalPreferencesSnapshot(
  state: PreferencesState,
  overrides: LocalPreferencesState = {},
): LocalPreferencesState {
  return {
    openAiApiKey: state.openAiApiKeyDraft.trim() || undefined,
    googleApiKey: state.googleApiKeyDraft.trim() || undefined,
    anthropicApiKey: state.anthropicApiKeyDraft.trim() || undefined,
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
    backgroundJobNotificationsEnabled: state.backgroundJobNotificationsEnabled,
    memoryBankEnabledDefault: state.memoryBankEnabledDefault,
    memoryBankRecordRunsDefault: state.memoryBankRecordRunsDefault,
    checkCliUpdatesDefault: state.checkCliUpdatesDefault,
    selectedReasoningStrength: state.selectedReasoningStrength,
    selectedFastMode: state.selectedFastMode,
    appHotkeyPreferences: state.appHotkeyPreferences,
    themePreference: state.themePreference,
    numericRightAlignmentEnabled: state.numericRightAlignmentEnabled,
    experienceMode: state.experienceMode,
    ...overrides,
  };
}

export function createExportablePreferencesSnapshot(state: PreferencesState) {
  const snapshot = createLocalPreferencesSnapshot(state);
  const { openAiApiKey, googleApiKey, anthropicApiKey, ...exportable } = snapshot;
  void openAiApiKey;
  void googleApiKey;
  void anthropicApiKey;
  return exportable;
}
