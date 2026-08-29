import type { SetStoreFunction } from "solid-js/store";
import type {
  BackgroundJobApprovalPolicy,
  ExecutionPlan,
  RunModelPreference,
} from "@hyperfocus/ai-core/protocol";
import { normalizeAppHotkeys, type AppHotkeyId } from "../../lib/app-hotkeys";
import type {
  HarnessViewState,
  ProviderConnectionProvider,
  TracePanelMode,
} from "../../harness-store";
import {
  createDefaultCustomTheme,
  withThemePreference,
  type CustomThemeDefinition,
  type ThemeId,
  type ThemeModePreference,
  type ThemePreference,
} from "../../theme/theme-model";
import {
  createDefaultMainPanelSizes,
  type MainPanelSizes,
} from "../initial-runtime-state";

export type HarnessVisualActionsContext = {
  state: HarnessViewState;
  setState: SetStoreFunction<HarnessViewState>;
  setThemePreferenceState: (preference: ThemePreference) => void;
  commitBrowserUiState: (nextState: HarnessViewState) => void;
  normalizeMainPanelSizes: (input: unknown) => MainPanelSizes;
};

export function createHarnessVisualPreferenceActions(context: HarnessVisualActionsContext) {
  const { state, setState, setThemePreferenceState } = context;
  const commitTraceState = (tracePanelMode: TracePanelMode, hasPersistedTracePanelOpen = true) => {
    context.commitBrowserUiState({
      ...state,
      tracePanelMode,
      tracePanelOpen: tracePanelMode !== "closed",
      hasPersistedTracePanelOpen,
    });
  };
  return {
    setDebugEnabled(debugEnabled: boolean) {
      setState({ debugEnabled });
    },
    setThemeId(themeId: ThemeId) {
      setThemePreferenceState(withThemePreference(state.themePreference, { themeId }));
    },
    setThemeMode(mode: ThemeModePreference) {
      setThemePreferenceState(withThemePreference(state.themePreference, { mode }));
    },
    setNumericRightAlignmentEnabled(numericRightAlignmentEnabled: boolean) {
      setState({ numericRightAlignmentEnabled });
    },
    setExperienceMode(experienceMode: HarnessViewState["experienceMode"]) {
      setState({
        experienceMode,
        chatPaneTab:
          experienceMode === "simple" && state.chatPaneTab !== "chat" && state.chatPaneTab !== "run"
            ? "chat"
            : state.chatPaneTab,
      });
    },
    setCustomTheme(custom: CustomThemeDefinition) {
      setThemePreferenceState(withThemePreference(state.themePreference, { themeId: "custom", custom }));
    },
    resetCustomTheme() {
      setThemePreferenceState(withThemePreference(state.themePreference, {
        themeId: "custom",
        custom: createDefaultCustomTheme(state.themePreference.custom?.baseThemeId),
      }));
    },
    setTracePanelOpen(tracePanelOpen: boolean) {
      commitTraceState(tracePanelOpen ? "open" : "closed");
    },
    setTracePanelMode(tracePanelMode: TracePanelMode) {
      commitTraceState(tracePanelMode);
    },
    toggleTracePanel() {
      const tracePanelMode: TracePanelMode = state.tracePanelMode === "closed"
        ? "peek"
        : state.tracePanelMode === "peek" ? "open" : "closed";
      commitTraceState(tracePanelMode);
    },
    setTracePanelDefaultOpen(tracePanelDefaultOpen: boolean) {
      context.commitBrowserUiState({
        ...state,
        tracePanelDefaultOpen,
        tracePanelMode: state.hasPersistedTracePanelOpen
          ? state.tracePanelMode
          : tracePanelDefaultOpen ? "open" : "closed",
        tracePanelOpen: state.hasPersistedTracePanelOpen ? state.tracePanelOpen : tracePanelDefaultOpen,
      });
    },
    setMainPanelSizes(mainPanelSizes: MainPanelSizes) {
      context.commitBrowserUiState({
        ...state,
        mainPanelSizes: context.normalizeMainPanelSizes(mainPanelSizes),
      });
    },
    resetMainPanelSizes() {
      context.commitBrowserUiState({ ...state, mainPanelSizes: createDefaultMainPanelSizes() });
    },
    openExecutionPlanDialog(executionPlan: ExecutionPlan) {
      setState({ executionPlanDialogOpen: true, selectedExecutionPlan: executionPlan });
    },
    closeExecutionPlanDialog() {
      setState({ executionPlanDialogOpen: false, selectedExecutionPlan: undefined });
    },
    setSubagentWorktreeStrategyDefault(subagentWorktreeStrategyDefault: "same-worktree" | "separate-worktrees") {
      setState({ subagentWorktreeStrategyDefault });
    },
    setBlockChatOnDirtyGitDefault(blockChatOnDirtyGitDefault: boolean) {
      setState({ blockChatOnDirtyGitDefault });
    },
    setDirtyGitChangeLimitDefault(dirtyGitChangeLimitDefault: number) {
      setState({ dirtyGitChangeLimitDefault: Math.max(0, Math.min(10000, Math.round(dirtyGitChangeLimitDefault))) });
    },
    setAutoCompactContextThresholdPercentDefault(autoCompactContextThresholdPercentDefault: number) {
      setState({
        autoCompactContextThresholdPercentDefault: Math.max(
          10,
          Math.min(95, Math.round(autoCompactContextThresholdPercentDefault)),
        ),
      });
    },
    setPlanExecutionModeDefault(planExecutionModeDefault: "countdown" | "approve" | "immediate") {
      setState({ planExecutionModeDefault });
    },
    setPlanExecutionDelaySecondsDefault(planExecutionDelaySecondsDefault: number) {
      setState({ planExecutionDelaySecondsDefault: Math.max(0, Math.min(300, Math.round(planExecutionDelaySecondsDefault))) });
    },
    setSingleAgentModelPreferenceDefault(singleAgentModelPreferenceDefault: RunModelPreference) {
      setState({ singleAgentModelPreferenceDefault });
    },
    setSubagentModelPreferenceDefault(subagentModelPreferenceDefault: RunModelPreference) {
      setState({ subagentModelPreferenceDefault });
    },
    setCorrectnessIterationModeDefault(correctnessIterationModeDefault: "ask-before-iterate" | "auto-once" | "auto-until-clean") {
      setState({ correctnessIterationModeDefault });
    },
    setBackgroundJobApprovalPolicyDefault(backgroundJobApprovalPolicyDefault: BackgroundJobApprovalPolicy) {
      setState({ backgroundJobApprovalPolicyDefault });
    },
    setAssistantAutoApproveNonBlockingQuestionsDefault(assistantAutoApproveNonBlockingQuestionsDefault: boolean) {
      setState({ assistantAutoApproveNonBlockingQuestionsDefault });
    },
    setAssistantCongestionControlEnabledDefault(assistantCongestionControlEnabledDefault: boolean) {
      setState({ assistantCongestionControlEnabledDefault });
    },
    setAssistantMaxCongestionDefault(assistantMaxCongestionDefault: number) {
      setState({ assistantMaxCongestionDefault: Math.max(0.25, Math.min(3, Math.round(assistantMaxCongestionDefault * 4) / 4)) });
    },
    setMaxBackgroundJobsDefault(maxBackgroundJobsDefault: number) {
      setState({ maxBackgroundJobsDefault: Math.max(5, Math.min(100, Math.round(maxBackgroundJobsDefault))) });
    },
    setMemoryBankEnabledDefault(memoryBankEnabledDefault: boolean) {
      setState({ memoryBankEnabledDefault });
    },
    setMemoryBankRecordRunsDefault(memoryBankRecordRunsDefault: boolean) {
      setState({ memoryBankRecordRunsDefault });
    },
    setCheckCliUpdatesDefault(checkCliUpdatesDefault: boolean) {
      setState({ checkCliUpdatesDefault });
    },
    setAppHotkeyPreference(appHotkeyId: AppHotkeyId, hotkeys: string[]) {
      setState("appHotkeyPreferences", appHotkeyId, normalizeAppHotkeys(hotkeys, []));
    },
    setAutoArchiveCompletedThreadsDefault(autoArchiveCompletedThreadsDefault: boolean) {
      setState({ autoArchiveCompletedThreadsDefault });
    },
    beginProviderConnectionTest(provider: ProviderConnectionProvider) {
      setState("providerConnectionTests", provider, { status: "pending", message: "Testing connection..." });
    },
  };
}
